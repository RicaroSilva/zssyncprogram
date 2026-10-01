"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { cancelarExecucao, confirmarEmissao, iniciarConferencia, iniciarFaturacao } from "@/lib/faturacao/execucao";
import { associarDocumento, autorizarRecriar, diagnosticoZsgo, encontrarDocumento, lerDocumentoZsgo, type ChaveFatura } from "@/lib/faturacao/conferencia";
import { lerMes } from "@/lib/formatos";
import { descreverErro } from "@/lib/erros";

export interface ResultadoAcao {
  ok: boolean;
  erro?: string;
  id?: string;
}

export async function gerarFaturacaoAction(mesTexto: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("FATURACAO", "criar");
  const mes = lerMes(mesTexto);
  let id: string;
  try {
    id = await iniciarFaturacao(mes.ano, mes.mes, sessao.email);
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: "gerar_faturacao",
    entidade: "Execucao",
    entidadeId: id,
    depois: mes,
    ip: obterIpCliente(await headers()),
  });
  // A página navega para a janela de passos (navegar com redirect() dentro
  // da ação deixava a janela sem se atualizar).
  return { ok: true, id };
}

export async function confirmarEmissaoAction(id: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("FATURACAO", "criar");
  try {
    await confirmarEmissao(id, sessao.email);
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
  await registarAuditoria({ utilizadorId: sessao.utilizadorId, acao: "confirmar_faturacao", entidade: "Execucao", entidadeId: id, ip: obterIpCliente(await headers()) });
  return { ok: true };
}

export async function cancelarExecucaoAction(id: string): Promise<ResultadoAcao> {
  await exigirPermissao("FATURACAO", "criar");
  await cancelarExecucao(id);
  return { ok: true };
}

// ── fase 3: conferência, "Verificar no ZSGO" e diagnóstico ────────────────

export async function conferirAction(mesTexto: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("FATURACAO", "editar");
  const mes = lerMes(mesTexto);
  try {
    const id = await iniciarConferencia(mes.ano, mes.mes, sessao.email);
    await registarAuditoria({ utilizadorId: sessao.utilizadorId, acao: "conferir_zsgo", entidade: "Execucao", entidadeId: id, depois: mes, ip: obterIpCliente(await headers()) });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
}

/** Chave "cliente-origem-AAAA-MM" (a mesma do URL do detalhe). */
function lerChave(chave: string): ChaveFatura {
  const m = chave.match(/^(\d+)-(\d+)-(\d{4})-(\d{2})$/);
  if (!m) throw new Error("Fatura inválida.");
  return { userId: BigInt(m[1]!), origemId: BigInt(m[2]!), ano: Number(m[3]), mes: Number(m[4]) };
}

export interface DocumentoEncontrado {
  id: string;
  numero: string | null;
  total: number | null;
  data: string | null;
  cliente: string | null;
  anulado: boolean;
  referencia: string | null;
}

/** Procura no ZSGO o documento indicado (nº ou id) — não associa ainda. */
export async function procurarDocumentoAction(texto: string): Promise<ResultadoAcao & { documento?: DocumentoEncontrado | null }> {
  await exigirPermissao("FATURACAO", "editar");
  try {
    const d = await encontrarDocumento(texto);
    return {
      ok: true,
      documento: d?.id
        ? { id: d.id, numero: d.numero ?? null, total: d.total ?? null, data: d.data ?? null, cliente: d.clienteCodigo ?? null, anulado: d.anulado, referencia: d.referencia ?? null }
        : null,
    };
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
}

/** A fatura existe no ZSGO: associa o documento (lido outra vez do ZSGO pelo id). */
export async function associarDocumentoAction(chave: string, documentoId: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("FATURACAO", "editar");
  try {
    const k = lerChave(chave);
    const d = await lerDocumentoZsgo(documentoId);
    await associarDocumento(k, d);
    await registarAuditoria({
      utilizadorId: sessao.utilizadorId,
      acao: "associar_fatura_zsgo",
      entidade: "FaturaSync",
      entidadeId: chave,
      depois: { zsgoSaleId: d.id, numero: d.numero },
      ip: obterIpCliente(await headers()),
      historico: { utilizador: sessao.email, detalhe: `Fatura ${chave} associada ao documento ${d.numero ?? d.id} que já existia no ZSGO.` },
    });
    revalidatePath(`/faturacao/${chave}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
}

/** Confirmado que NÃO existe no ZSGO: a próxima geração pode criá-la. */
export async function autorizarRecriarAction(chave: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("FATURACAO", "editar");
  try {
    await autorizarRecriar(lerChave(chave));
    await registarAuditoria({
      utilizadorId: sessao.utilizadorId,
      acao: "autorizar_recriar_fatura",
      entidade: "FaturaSync",
      entidadeId: chave,
      ip: obterIpCliente(await headers()),
      historico: { utilizador: sessao.email, detalhe: `Confirmado que a fatura ${chave} não existe no ZSGO — autorizado criar outra vez.` },
    });
    revalidatePath(`/faturacao/${chave}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: descreverErro(e) };
  }
}

export async function diagnosticoAction(procura: string): Promise<{ texto: string }> {
  await exigirPermissao("FATURACAO", "editar");
  try {
    return { texto: await diagnosticoZsgo(procura) };
  } catch (e) {
    return { texto: `FALHOU: ${descreverErro(e)}` };
  }
}
