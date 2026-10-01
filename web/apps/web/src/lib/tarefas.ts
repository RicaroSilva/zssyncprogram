import "server-only";
import { hostname } from "node:os";
import { prisma } from "./db";
import { descreverErro } from "./erros";
import { atualizarClientes, sincronizarClientesNovos, verificarAlteracoes } from "./faturacao/clientes";
import { executarFaturacaoAgendada } from "./faturacao/execucao";
import { SEM_PROGRESSO } from "./faturacao/progresso";

/**
 * Tarefas agendadas — as MESMAS de service/TarefasService do Java, na mesma
 * tabela zsgo_tarefas (ligar/desligar e hora configuram-se em qualquer dos
 * dois lados). Para nunca correrem duas vezes, mesmo com o agendador do Java
 * também ligado, a reserva é a mesma (a_correr_desde) e, nas execuções
 * agendadas, só reserva quem chegar primeiro depois da hora marcada.
 *
 * Horas: o Java grava ultima_execucao com a hora LOCAL do computador
 * (timestamp sem fuso). Aqui trabalha-se igual, com a hora de Lisboa
 * (FUSO_HORARIO, por omissão Europe/Lisbon) em "hora de parede".
 */

export const CODIGOS = ["SINCRONIZAR_CLIENTES", "ATUALIZAR_CLIENTES", "FATURACAO_MENSAL"] as const;
export type CodigoTarefa = (typeof CODIGOS)[number];

export const NOME_TAREFA: Record<CodigoTarefa, string> = {
  SINCRONIZAR_CLIENTES: "Sincronizar clientes novos",
  ATUALIZAR_CLIENTES: "Atualizar dados dos clientes",
  FATURACAO_MENSAL: "Faturação mensal",
};

export const DESCRICAO_TAREFA: Record<CodigoTarefa, string> = {
  SINCRONIZAR_CLIENTES: "Cria no ZSGO os clientes novos (ou que ficaram com erro) do Cyclos.",
  ATUALIZAR_CLIENTES: "Procura clientes cujos dados mudaram no Cyclos e reenvia-os ao ZSGO.",
  FATURACAO_MENSAL:
    "Gera as faturas e notas de crédito do mês anterior que ainda faltam, com os mesmos passos do botão (cria e atualiza os clientes antes), mas sem esperar pela confirmação.",
};

export interface TarefaConfig {
  codigo: string;
  ativa: boolean;
  hora: string;
  diaMes: number | null;
  ultimaExecucao: Date | null;
}

// ── hora de parede (Lisboa) codificada como Date UTC, como o Prisma lê os
//    timestamp sem fuso ─────────────────────────────────────────────────────

const FUSO = () => process.env.FUSO_HORARIO || "Europe/Lisbon";

export function agoraLocal(): Date {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSO(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return new Date(Date.UTC(+partes.year!, +partes.month! - 1, +partes.day!, +partes.hour!, +partes.minute!, +partes.second!));
}

function horaMinuto(hhmm: string): [number, number] {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return [7, 0];
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? [h, mi] : [7, 0];
}

/** Quando a tarefa está marcada para este dia (null se não for dia dela). */
function marcadaPara(t: TarefaConfig, dia: Date): Date | null {
  const ano = dia.getUTCFullYear();
  const mes = dia.getUTCMonth();
  if (t.diaMes !== null) {
    // Dia 31 num mês de 30 dias corre no último dia do mês.
    const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    if (dia.getUTCDate() !== Math.min(t.diaMes, ultimoDia)) return null;
  }
  const [h, mi] = horaMinuto(t.hora);
  return new Date(Date.UTC(ano, mes, dia.getUTCDate(), h, mi));
}

/** Deve correr agora? (ativa, já passou a hora de hoje e ainda não correu desde então). */
export function estaNaHora(t: TarefaConfig, agora: Date): Date | null {
  if (!t.ativa) return null;
  const marcada = marcadaPara(t, agora);
  if (!marcada || agora < marcada) return null;
  return !t.ultimaExecucao || t.ultimaExecucao < marcada ? marcada : null;
}

export function proximaExecucao(t: TarefaConfig, agora: Date): Date | null {
  if (!t.ativa) return null;
  if (estaNaHora(t, agora)) return agora;
  for (let i = 0; i < 62; i++) {
    const dia = new Date(agora.getTime() + i * 86_400_000);
    const m = marcadaPara(t, dia);
    if (m && m > agora && (!t.ultimaExecucao || t.ultimaExecucao < m)) return m;
  }
  return null;
}

// ── execução ───────────────────────────────────────────────────────────────

/** Reserva a tarefa (a_correr_desde). Com `marcada`, só reserva se ainda
 *  ninguém a correu desde essa hora — assim o agendador do Java e o da web
 *  nunca correm a mesma execução agendada duas vezes. */
async function reservar(codigo: string, marcada: Date | null): Promise<boolean> {
  // Hora de parede em texto, sem fuso (a coluna é timestamp sem fuso).
  const marcadaTexto = marcada ? marcada.toISOString().slice(0, 19).replace("T", " ") : null;
  const n = marcadaTexto
    ? await prisma.$executeRaw`
        UPDATE zsgo_tarefas SET a_correr_desde = now(), ultimo_estado = 'A_CORRER'
        WHERE codigo = ${codigo} AND (a_correr_desde IS NULL OR a_correr_desde < now() - interval '6 hours')
          AND (ultima_execucao IS NULL OR ultima_execucao < ${marcadaTexto}::timestamp)`
    : await prisma.$executeRaw`
        UPDATE zsgo_tarefas SET a_correr_desde = now(), ultimo_estado = 'A_CORRER'
        WHERE codigo = ${codigo} AND (a_correr_desde IS NULL OR a_correr_desde < now() - interval '6 hours')`;
  return n === 1;
}

async function correr(codigo: CodigoTarefa, quem: string): Promise<string> {
  switch (codigo) {
    case "SINCRONIZAR_CLIENTES": {
      const r = await sincronizarClientesNovos(SEM_PROGRESSO);
      return `${r.criados} cliente(s) criado(s) no ZSGO, ${r.erros} com erro.`;
    }
    case "ATUALIZAR_CLIENTES": {
      const mudaram = await verificarAlteracoes(SEM_PROGRESSO);
      if (mudaram.length === 0) return "Nenhum cliente com dados alterados.";
      const r = await atualizarClientes(mudaram, SEM_PROGRESSO);
      return `${mudaram.length} cliente(s) com dados alterados: ${r.atualizados} atualizado(s) no ZSGO, ${r.erros} com erro.`;
    }
    case "FATURACAO_MENSAL": {
      const agora = agoraLocal();
      const anterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
      return executarFaturacaoAgendada(anterior.getUTCFullYear(), anterior.getUTCMonth() + 1, quem);
    }
  }
}

/** Corre a tarefa (se não estiver a correr noutro lado), grava o resultado
 *  na tarefa e no Histórico. `marcada` = execução agendada dessa hora. */
export async function executarTarefa(codigo: CodigoTarefa, quem: string, marcada: Date | null = null): Promise<{ estado: "OK" | "ERRO" | "IGNORADA"; resultado: string }> {
  if (!(await reservar(codigo, marcada))) {
    return { estado: "IGNORADA", resultado: "Já está a correr (ou já correu) noutro lado — ignorado." };
  }
  let estado: "OK" | "ERRO" = "OK";
  let resultado: string;
  try {
    resultado = await correr(codigo, quem);
  } catch (e) {
    estado = "ERRO";
    resultado = descreverErro(e);
  }
  await prisma.tarefa.update({
    where: { codigo },
    data: { aCorrerDesde: null, ultimaExecucao: agoraLocal(), ultimoEstado: estado, ultimoResultado: resultado },
  });
  await prisma.historico.create({
    data: { utilizador: quem.slice(0, 64), acao: `TAREFA_${codigo}`, detalhe: `${NOME_TAREFA[codigo]}: ${estado === "OK" ? resultado : `FALHOU — ${resultado}`}` },
  });
  return { estado, resultado };
}

// ── agendador (chamado de 30 em 30 s pelo próprio servidor) ────────────────

let tickACorrer = false;

/** Vê que tarefas estão na hora e corre-as, uma de cada vez. */
export async function tickAgendador(): Promise<void> {
  if (tickACorrer) return;
  tickACorrer = true;
  try {
    await prisma.$executeRaw`
      INSERT INTO zsgo_agendador (id, maquina, ultimo_sinal, iniciado_em) VALUES (1, ${`web: ${hostname()}`.slice(0, 120)}, now(), now())
      ON CONFLICT (id) DO UPDATE SET maquina = EXCLUDED.maquina, ultimo_sinal = now()`;
    const tarefas = await prisma.tarefa.findMany();
    for (const t of tarefas) {
      if (!(CODIGOS as readonly string[]).includes(t.codigo)) continue;
      const marcada = estaNaHora(t, agoraLocal());
      if (marcada) {
        console.log(`[agendador] a iniciar ${t.codigo}`);
        const r = await executarTarefa(t.codigo as CodigoTarefa, "agendador (web)", marcada);
        console.log(`[agendador] ${t.codigo}: ${r.estado} — ${r.resultado}`);
      }
    }
  } catch (e) {
    console.error(`[agendador] erro (tenta outra vez daqui a 30 s): ${descreverErro(e)}`);
  } finally {
    tickACorrer = false;
  }
}
