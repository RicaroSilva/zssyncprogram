"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { CODIGOS, NOME_TAREFA, executarTarefa, type CodigoTarefa } from "@/lib/tarefas";

export interface ResultadoAcao {
  ok: boolean;
  erro?: string;
}

export async function guardarTarefaAction(codigo: string, ativa: boolean, hora: string, diaMes: number | null): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("TAREFAS", "editar");
  if (!(CODIGOS as readonly string[]).includes(codigo)) return { ok: false, erro: "Tarefa desconhecida." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { ok: false, erro: "Hora inválida (use HH:MM, ex. 07:30)." };
  if (diaMes !== null && (diaMes < 1 || diaMes > 31)) return { ok: false, erro: "Dia do mês inválido (1 a 31)." };
  const antes = await prisma.tarefa.findUnique({ where: { codigo } });
  await prisma.tarefa.update({ where: { codigo }, data: { ativa, hora, diaMes, atualizadoEm: new Date() } });
  const nome = NOME_TAREFA[codigo as CodigoTarefa];
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: "configurar_tarefa",
    entidade: "Tarefa",
    entidadeId: codigo,
    antes: antes && { ativa: antes.ativa, hora: antes.hora, diaMes: antes.diaMes },
    depois: { ativa, hora, diaMes },
    ip: obterIpCliente(await headers()),
    historico: { utilizador: sessao.email, detalhe: `${nome}: ${ativa ? `ligada às ${hora}${diaMes ? ` do dia ${diaMes}` : ""}` : "desligada"}.` },
  });
  revalidatePath("/tarefas");
  return { ok: true };
}

/** Corre já, em segundo plano (a página mostra "A correr"). */
export async function executarAgoraAction(codigo: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("TAREFAS", "editar");
  if (!(CODIGOS as readonly string[]).includes(codigo)) return { ok: false, erro: "Tarefa desconhecida." };
  const tarefa = await prisma.tarefa.findUnique({ where: { codigo } });
  if (tarefa?.aCorrerDesde && Date.now() - tarefa.aCorrerDesde.getTime() < 6 * 3600_000) return { ok: false, erro: "Esta tarefa já está a correr." };
  void executarTarefa(codigo as CodigoTarefa, sessao.email);
  await registarAuditoria({ utilizadorId: sessao.utilizadorId, acao: "executar_tarefa", entidade: "Tarefa", entidadeId: codigo, ip: obterIpCliente(await headers()) });
  await new Promise((r) => setTimeout(r, 500));
  revalidatePath("/tarefas");
  return { ok: true };
}
