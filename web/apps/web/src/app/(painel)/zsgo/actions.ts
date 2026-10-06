"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { descreverErro } from "@/lib/erros";
import { ZsgoResultadoIncerto } from "@/lib/zsgo/api";
import { executar, mensagemErro, normalizarItem } from "@/lib/zsgo/servico";
import { registarPedidoSaft } from "@/lib/zsgo/saft";
import { chaveDoItem, operacoesDe, recursoPorSlug } from "@/lib/zsgo/recursos";
import type { Acao } from "@/lib/auth";

export type TipoOperacao = "criar" | "editar" | "eliminar" | "anular" | "ativar" | "desativar";

const PERMISSAO: Record<TipoOperacao, Acao> = {
  criar: "criar",
  editar: "editar",
  ativar: "editar",
  desativar: "editar",
  eliminar: "eliminar",
  anular: "eliminar",
};

const VERBO: Record<TipoOperacao, string> = {
  criar: "criado",
  editar: "alterado",
  ativar: "ativado",
  desativar: "desativado",
  eliminar: "eliminado",
  anular: "anulado",
};

export interface ResultadoZsgo {
  ok: boolean;
  erro?: string;
  chave?: string;
  dados?: unknown;
}

/** Uma operação de escrita no ZSGO (só as que existem na especificação). */
export async function operacaoZsgoAction(slug: string, tipo: TipoOperacao, chave: string | null, corpo?: unknown): Promise<ResultadoZsgo> {
  const sessao = await exigirPermissao("ZSGO", PERMISSAO[tipo]);
  const recurso = recursoPorSlug(slug);
  if (!recurso) return { ok: false, erro: "Área desconhecida." };
  const op = operacoesDe(recurso)[tipo];
  if (!op) return { ok: false, erro: "Esta operação não existe na API do ZSGO para esta área." };
  const parametros: Record<string, string> = recurso.parametro && chave ? { [recurso.parametro]: chave } : {};
  let r;
  try {
    r = await executar(op.metodo, op.caminho, parametros, {}, op.corpo ? (corpo ?? {}) : undefined);
  } catch (e) {
    const incerto = e instanceof ZsgoResultadoIncerto;
    await registarAuditoria({
      utilizadorId: sessao.utilizadorId,
      acao: `zsgo_${tipo}_falhou`,
      entidade: `ZSGO ${recurso.caminho}`,
      entidadeId: chave,
      depois: { erro: descreverErro(e), corpo },
      ip: obterIpCliente(await headers()),
    });
    return {
      ok: false,
      erro: incerto
        ? `${descreverErro(e)}\nConfirme no ZSGO (lista de ${recurso.nome.toLowerCase()}) antes de tentar outra vez, para não ficar em duplicado.`
        : descreverErro(e),
    };
  }
  // SAF-T: já há uma exportação do mesmo período em curso — abre-se essa.
  if (slug === "saft" && tipo === "criar" && r.status === 409) {
    const existente = normalizarItem(r.json) as { process_id?: string } | null;
    if (existente?.process_id) {
      await registarPedidoSaft(existente.process_id, existente, corpo as Record<string, unknown>, sessao.email);
      return { ok: true, chave: existente.process_id, dados: existente };
    }
  }
  if (r.status < 200 || r.status >= 300) {
    const enviado = op.corpo ? `\n\nPedido enviado: ${op.metodo} ${op.caminho}\n${JSON.stringify(corpo ?? {}, null, 2)}` : `\n\nPedido enviado: ${op.metodo} ${op.caminho}`;
    const erro = mensagemErro(r.status, r.json, r.texto) + enviado;
    await registarAuditoria({
      utilizadorId: sessao.utilizadorId,
      acao: `zsgo_${tipo}_recusado`,
      entidade: `ZSGO ${recurso.caminho}`,
      entidadeId: chave,
      depois: { status: r.status, resposta: r.json ?? r.texto, corpo },
      ip: obterIpCliente(await headers()),
    });
    return { ok: false, erro };
  }
  const dados = normalizarItem(r.json);
  const novaChave = tipo === "criar" ? (chaveDoItem(recurso, dados) ?? (typeof r.json === "string" ? r.json : undefined)) : (chave ?? undefined);
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: `zsgo_${tipo}`,
    entidade: `ZSGO ${recurso.caminho}`,
    entidadeId: novaChave ?? chave,
    depois: corpo ?? null,
    ip: obterIpCliente(await headers()),
    historico: { utilizador: sessao.email, detalhe: `ZSGO: ${recurso.singular} ${novaChave ?? chave ?? ""} ${VERBO[tipo]} na página web.`.replace(/\s+/g, " ") },
  });
  if (slug === "saft" && tipo === "criar" && novaChave) await registarPedidoSaft(novaChave, dados, corpo as Record<string, unknown>, sessao.email);
  revalidatePath(`/zsgo/${slug}`);
  return { ok: true, chave: novaChave, dados };
}
