import { createHash } from "node:crypto";
import { prisma } from "./db";

/** Acrescenta uma linha à auditoria encadeada por hash (como no
 *  financial). Corre numa transação para a leitura do último hash e a
 *  inserção serem atómicas. Também escreve em zsgo_historico, para as
 *  ações aparecerem no "Histórico" do programa em Java. */
export async function registarAuditoria(params: {
  utilizadorId: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  ip?: string | null;
  historico?: { utilizador: string; detalhe: string };
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ultimo = await tx.registoAuditoria.findFirst({ orderBy: { criadoEm: "desc" } });
    const hashAnterior = ultimo?.hashAtual ?? null;
    const corpo = JSON.stringify({
      hashAnterior,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId ?? null,
      antes: params.antes ?? null,
      depois: params.depois ?? null,
    });
    const hashAtual = createHash("sha256").update(corpo).digest("hex");
    await tx.registoAuditoria.create({
      data: {
        utilizadorId: params.utilizadorId,
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId ?? null,
        antes: params.antes as never,
        depois: params.depois as never,
        ip: params.ip ?? null,
        hashAnterior,
        hashAtual,
      },
    });
    if (params.historico) {
      await tx.historico.create({
        data: {
          utilizador: params.historico.utilizador.slice(0, 64),
          acao: params.acao.toUpperCase().slice(0, 60),
          detalhe: params.historico.detalhe,
        },
      });
    }
  });
}
