import "server-only";
import { prisma } from "../db";
import { descreverErro } from "../erros";
import { calcularPreview, type Preview } from "./preview";
import { atualizarClientes, criarClientesEmFalta, verificarAlteracoes, type ClienteDesatualizado } from "./clientes";
import { emitirFaturas, emitirNotasCredito } from "./mensal";
import { conferirMes } from "./conferencia";

/**
 * Gerar a faturação do mês, passo a passo (o mesmo que a janela de passos
 * do painel em Java): pré-análise → criar clientes em falta → verificar
 * alterações → atualizar clientes → resumo e confirmação → emitir.
 *
 * Corre em segundo plano no processo do servidor; os passos e o progresso
 * ficam em zsgo_web_execucao, que a página vai lendo. Só pode haver uma
 * execução ativa de cada vez.
 */

export const TITULOS_PASSOS = [
  "Pré-análise do mês",
  "Criar no ZSGO os clientes que ainda não existem",
  "Verificar se algum cliente mudou de dados no Cyclos",
  "Atualizar no ZSGO os clientes com dados alterados",
  "Resumo e confirmação",
  "Emitir faturas e notas de crédito",
] as const;

export type EstadoPasso = "PENDENTE" | "A_CORRER" | "OK" | "AVISO" | "ERRO" | "SALTADO";
export interface Passo {
  titulo: string;
  estado: EstadoPasso;
  detalhe: string;
  feitos?: number;
  total?: number;
}

export type EstadoExecucao = "A_PREPARAR" | "A_AGUARDAR_CONFIRMACAO" | "A_EMITIR" | "CONCLUIDA" | "FALHOU" | "CANCELADA";
const ATIVOS: EstadoExecucao[] = ["A_PREPARAR", "A_AGUARDAR_CONFIRMACAO", "A_EMITIR"];

/** Execuções a correr NESTE processo — se o servidor reiniciar a meio, a
 *  execução fica sem dono e é dada como interrompida. */
const aCorrer = new Set<string>();

const euros = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

/** Grava os passos na BD, no máximo de 700 em 700 ms (mais a última). */
class RegistoPassos {
  readonly passos: Passo[];
  private ultimaGravacao = 0;
  private pendente?: ReturnType<typeof setTimeout>;

  constructor(
    readonly id: string,
    titulos: readonly string[] = TITULOS_PASSOS,
  ) {
    this.passos = titulos.map((titulo) => ({ titulo, estado: "PENDENTE", detalhe: "" }));
  }

  static de(id: string, passos: Passo[]): RegistoPassos {
    const r = new RegistoPassos(id, passos.map((p) => p.titulo));
    passos.forEach((p, i) => (r.passos[i] = p));
    return r;
  }

  mudar(i: number, estado: EstadoPasso, detalhe?: string): Promise<void> {
    const p = this.passos[i]!;
    p.estado = estado;
    if (detalhe !== undefined) p.detalhe = detalhe;
    if (estado !== "A_CORRER") {
      delete p.feitos;
      delete p.total;
    }
    return this.gravar(true);
  }

  progresso(i: number) {
    return (texto: string, feitos?: number, total?: number) => {
      const p = this.passos[i]!;
      p.detalhe = texto;
      p.feitos = feitos;
      p.total = total;
      void this.gravar(false);
    };
  }

  async gravar(agora: boolean, extra: Record<string, unknown> = {}): Promise<void> {
    const decorrido = Date.now() - this.ultimaGravacao;
    if (!agora && decorrido < 700) {
      this.pendente ??= setTimeout(() => {
        this.pendente = undefined;
        void this.gravar(true);
      }, 700 - decorrido);
      return;
    }
    this.ultimaGravacao = Date.now();
    await prisma.execucao.update({ where: { id: this.id }, data: { passos: this.passos as never, ...extra } });
  }
}

/** Dá como interrompidas as execuções ativas que já não estão a correr em
 *  nenhum lado (servidor reiniciado) — sem isto ficavam a bloquear. */
async function limparInterrompidas(): Promise<void> {
  const ativas = await prisma.execucao.findMany({ where: { estado: { in: ATIVOS } } });
  for (const e of ativas) {
    const parada = e.estado !== "A_AGUARDAR_CONFIRMACAO" && !aCorrer.has(e.id) && Date.now() - e.atualizadoEm.getTime() > 2 * 60_000;
    const esquecida = e.estado === "A_AGUARDAR_CONFIRMACAO" && Date.now() - e.atualizadoEm.getTime() > 60 * 60_000;
    if (parada || esquecida) {
      await prisma.execucao.update({
        where: { id: e.id },
        data: { estado: parada ? "FALHOU" : "CANCELADA", resultado: parada ? "Interrompida (o servidor reiniciou a meio). Volte a gerar — o que já foi feito é ignorado." : "Cancelada: ninguém confirmou o resumo durante uma hora.", terminadoEm: new Date() },
      });
    }
  }
}

export async function execucaoAtiva() {
  await limparInterrompidas();
  return prisma.execucao.findFirst({ where: { estado: { in: ATIVOS } }, orderBy: { iniciadoEm: "desc" } });
}

/** Começa a preparação (passos 1–4) e devolve o id da execução. */
export async function iniciarFaturacao(ano: number, mes: number, utilizador: string): Promise<string> {
  const ativa = await execucaoAtiva();
  if (ativa) throw new Error(`Já há uma faturação em curso (${ativa.mes}/${ativa.ano}, iniciada por ${ativa.iniciadoPor ?? "alguém"}). Abra-a em vez de começar outra.`);
  const registo = new RegistoPassos("");
  const exec = await prisma.execucao.create({
    data: { tipo: "FATURACAO_MENSAL", ano, mes, estado: "A_PREPARAR", passos: registo.passos as never, iniciadoPor: utilizador },
  });
  aCorrer.add(exec.id);
  void preparar(exec.id, ano, mes, utilizador).finally(() => aCorrer.delete(exec.id));
  return exec.id;
}

async function preparar(id: string, ano: number, mes: number, utilizador: string): Promise<void> {
  const r = new RegistoPassos(id);
  let passo = 0;
  try {
    // 1. Pré-análise
    await r.mudar(0, "A_CORRER", "A calcular quantos clientes e notas de crédito vão ser processados…");
    let p = await calcularPreview(ano, mes);
    await r.mudar(
      0,
      "OK",
      `${p.clientesAFaturar} cliente(s) a faturar (${euros(p.valorAFaturar)}), ${p.clientesJaFaturados} já faturado(s), ${p.notasCreditoAEmitir} nota(s) de crédito a emitir` +
        (p.idsSemZsgoCode.length ? `. ${p.idsSemZsgoCode.length} cliente(s) ainda não existem no ZSGO (são criados no passo 2 e entram na fatura).` : "."),
    );
    let mudouAlgo = false;

    // 2. Criar clientes em falta
    passo = 1;
    if (p.idsSemZsgoCode.length === 0) {
      await r.mudar(1, "OK", "Todos os clientes a faturar já existem no ZSGO.");
    } else {
      await r.mudar(1, "A_CORRER", `A criar ${p.idsSemZsgoCode.length} cliente(s) no ZSGO…`);
      const c = await criarClientesEmFalta(p.idsSemZsgoCode, r.progresso(1));
      mudouAlgo ||= c.criados > 0;
      await historico(utilizador, "SINCRONIZAR_CLIENTES_SEM_ZSGO_CODE", `${c.criados} criado(s) no ZSGO, ${c.erros} com erro (antes da faturação de ${mes}/${ano}).`);
      const aviso = c.erros > 0 || c.naoEncontrados > 0;
      await r.mudar(
        1,
        aviso ? "AVISO" : "OK",
        `${c.criados} cliente(s) criado(s) no ZSGO` +
          (c.erros ? `, ${c.erros} com erro (ver em Clientes)` : "") +
          (c.naoEncontrados ? `, ${c.naoEncontrados} não encontrado(s) na consulta de clientes` : "") +
          (aviso ? ". Estes clientes vão falhar na faturação." : "."),
      );
    }

    // 3. Verificar alterações
    passo = 2;
    await r.mudar(2, "A_CORRER", "A comparar os dados do Cyclos com os que estão no ZSGO…");
    let mudaram: ClienteDesatualizado[] | null = null;
    try {
      mudaram = await verificarAlteracoes(r.progresso(2));
      await r.mudar(2, "OK", mudaram.length ? `${mudaram.length} cliente(s) com dados diferentes dos que estão no ZSGO.` : "Nenhum cliente com dados alterados.");
    } catch (e) {
      await r.mudar(2, "AVISO", `Não foi possível verificar: ${descreverErro(e)} — a faturação continua com os dados que já estão no ZSGO.`);
    }

    // 4. Atualizar clientes
    passo = 3;
    if (mudaram === null) {
      await r.mudar(3, "SALTADO", "Saltado (a verificação não correu).");
    } else if (mudaram.length === 0) {
      await r.mudar(3, "OK", "Nada para atualizar.");
    } else {
      await r.mudar(3, "A_CORRER", `A atualizar ${mudaram.length} cliente(s) no ZSGO…`);
      const a = await atualizarClientes(mudaram, r.progresso(3));
      mudouAlgo ||= a.atualizados > 0;
      await historico(utilizador, "ATUALIZAR_CLIENTES", `${a.atualizados} atualizado(s) no ZSGO, ${a.erros} com erro (antes da faturação de ${mes}/${ano}).`);
      await r.mudar(
        3,
        a.erros ? "AVISO" : "OK",
        `${a.atualizados} cliente(s) atualizado(s) no ZSGO` + (a.erros ? `, ${a.erros} com erro (ver em Clientes) — as faturas destes saem com os dados antigos.` : "."),
      );
    }

    // 5. Resumo (recalculado se entretanto se criaram/atualizaram clientes)
    passo = 4;
    if (mudouAlgo) {
      await r.mudar(4, "A_CORRER", "A recalcular o resumo com os clientes novos/atualizados…");
      p = await calcularPreview(ano, mes);
    }
    const nada = p.clientesAFaturar === 0 && p.notasCreditoAEmitir === 0;
    r.passos[4]!.estado = "A_CORRER";
    r.passos[4]!.detalhe = nada ? "Não há nada por faturar." : "Confirme o resumo abaixo.";
    delete r.passos[4]!.feitos;
    await r.gravar(true, { estado: "A_AGUARDAR_CONFIRMACAO", resumo: p as never });
  } catch (e) {
    const erro = descreverErro(e);
    await r.mudar(passo, "ERRO", erro);
    await prisma.execucao.update({ where: { id }, data: { estado: "FALHOU", resultado: `A faturação NÃO foi emitida: falhou o passo ${passo + 1}.\n\n${erro}`, terminadoEm: new Date() } });
  }
}

/** Passo 6, depois de confirmado o resumo. */
export async function confirmarEmissao(id: string, utilizador: string): Promise<void> {
  const exec = await prisma.execucao.findUnique({ where: { id } });
  if (!exec || exec.estado !== "A_AGUARDAR_CONFIRMACAO") throw new Error("Esta faturação já não está à espera de confirmação.");
  const r = RegistoPassos.de(id, exec.passos as unknown as Passo[]);
  const mudou = await prisma.execucao.updateMany({ where: { id, estado: "A_AGUARDAR_CONFIRMACAO" }, data: { estado: "A_EMITIR" } });
  if (mudou.count === 0) throw new Error("Esta faturação já foi confirmada por outra pessoa.");
  await r.mudar(4, "OK", `Confirmado por ${utilizador}.`);
  aCorrer.add(id);
  void emitir(r, exec.ano, exec.mes, exec.resumo as unknown as Preview | null, utilizador).finally(() => aCorrer.delete(id));
}

async function emitir(r: RegistoPassos, ano: number, mes: number, p: Preview | null, utilizador: string): Promise<void> {
  try {
    await r.mudar(5, "A_CORRER", "A começar…");
    const f = await emitirFaturas(ano, mes, r.progresso(5));
    const n = await emitirNotasCredito(ano, mes, r.progresso(5));
    const texto =
      `Faturas: ${f.ok} emitida(s)${f.valor ? ` (${euros(f.valor)})` : ""}, ${f.ignorados} já feita(s), ${f.erros} com erro.\n` +
      `Notas de crédito: ${n.ok} emitida(s)${n.valor ? ` (${euros(n.valor)})` : ""}, ${n.ignorados} já feita(s), ${n.erros} com erro.`;
    const erros = f.erros + n.erros;
    await r.mudar(5, erros ? "AVISO" : "OK", texto);
    await historico(
      utilizador,
      "GERAR_FATURACAO_MENSAL",
      `Faturação de ${mes}/${ano} executada na página web (${p?.clientesAFaturar ?? "?"} cliente(s), ${p?.notasCreditoAEmitir ?? "?"} nota(s) de crédito previstas). ${texto.replace("\n", " ")}`,
    );
    await prisma.execucao.update({
      where: { id: r.id },
      data: {
        estado: "CONCLUIDA",
        resultado: erros ? `Faturação terminada com ${erros} erro(s). Veja as faturas com erro na lista (o detalhe mostra o motivo).` : "Faturação terminada sem erros.",
        terminadoEm: new Date(),
      },
    });
  } catch (e) {
    const erro = descreverErro(e);
    await r.mudar(5, "ERRO", erro);
    await prisma.execucao.update({
      where: { id: r.id },
      data: { estado: "FALHOU", resultado: `A faturação parou a meio: ${erro}\n\nAs faturas já emitidas ficam; volte a gerar para continuar (as feitas são ignoradas).`, terminadoEm: new Date() },
    });
  }
}

export const TITULOS_CONFERENCIA = ["Ler as faturas do mês no ZSGO e comparar com o que foi enviado"] as const;

/** Conferir com o ZSGO: lê cada fatura do mês no ZSGO e grava número,
 *  total, IVA e estado (só lê do ZSGO). Corre em segundo plano. */
export async function iniciarConferencia(ano: number, mes: number, utilizador: string): Promise<string> {
  const ativa = await execucaoAtiva();
  if (ativa) throw new Error(`Há uma faturação/conferência em curso (${ativa.mes}/${ativa.ano}, iniciada por ${ativa.iniciadoPor ?? "alguém"}). Espere que termine.`);
  const registo = new RegistoPassos("", TITULOS_CONFERENCIA);
  const exec = await prisma.execucao.create({
    data: { tipo: "CONFERENCIA", ano, mes, estado: "A_EMITIR", passos: registo.passos as never, iniciadoPor: utilizador },
  });
  aCorrer.add(exec.id);
  void (async () => {
    const r = new RegistoPassos(exec.id, TITULOS_CONFERENCIA);
    try {
      await r.mudar(0, "A_CORRER", "A começar…");
      const c = await conferirMes(ano, mes, r.progresso(0));
      const texto = `${c.iguais} iguais, ${c.diferentes} com diferença (valor diferente ou anulada no ZSGO), ${c.erros} não foi possível ler.`;
      await r.mudar(0, c.diferentes || c.erros ? "AVISO" : "OK", texto);
      await historico(utilizador, "CONFERIR_ZSGO", `Conferência de ${mes}/${ano} com o ZSGO: ${texto}`);
      await prisma.execucao.update({
        where: { id: exec.id },
        data: { estado: "CONCLUIDA", resultado: c.diferentes ? "Conferência concluída. Veja as faturas com diferença na lista (filtro \"Com diferença\")." : "Conferência concluída.", terminadoEm: new Date() },
      });
    } catch (e) {
      const erro = descreverErro(e);
      await r.mudar(0, "ERRO", erro);
      await prisma.execucao.update({ where: { id: exec.id }, data: { estado: "FALHOU", resultado: `A conferência falhou: ${erro}`, terminadoEm: new Date() } });
    } finally {
      aCorrer.delete(exec.id);
    }
  })();
  return exec.id;
}

export async function cancelarExecucao(id: string): Promise<void> {
  await prisma.execucao.updateMany({ where: { id, estado: "A_AGUARDAR_CONFIRMACAO" }, data: { estado: "CANCELADA", resultado: "Faturação cancelada.", terminadoEm: new Date() } });
}

async function historico(utilizador: string, acao: string, detalhe: string): Promise<void> {
  await prisma.historico.create({ data: { utilizador: utilizador.slice(0, 64), acao, detalhe } });
}
