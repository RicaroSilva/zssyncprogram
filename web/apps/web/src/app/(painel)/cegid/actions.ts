"use server";

import { headers } from "next/headers";
import { exigirPermissao, pode } from "@/lib/exigir-permissao";
import { obterSessaoAtual } from "@/lib/auth";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { contagemDocumentos, divisaoDownload, estadoDownload, ultimasEnviadas, type Enviada, iniciarDownload, pararDownload, testarDocumento, type EstadoDownload } from "@/lib/cegid/descarregar";

export async function iniciarDownloadAction(repetirErros: boolean, soAnalisar = false): Promise<{ ok: boolean; erro?: string }> {
  const sessao = await exigirPermissao("FATURACAO", "criar");
  const r = iniciarDownload(sessao.nomeExibicao, repetirErros, soAnalisar);
  if (soAnalisar) return r;
  if (r.ok) {
    await registarAuditoria({
      utilizadorId: sessao.utilizadorId,
      acao: "CEGID_DOWNLOAD_INICIAR",
      entidade: "CegidDocumento",
      depois: { repetirErros },
      ip: obterIpCliente(await headers()),
      historico: { utilizador: sessao.nomeExibicao, detalhe: `Começou a descarregar os documentos do Cegid${repetirErros ? " (incluindo os que tinham falhado)" : ""}` },
    });
  }
  return r;
}

export async function pararDownloadAction(): Promise<void> {
  await exigirPermissao("FATURACAO", "criar");
  pararDownload();
}

/** Progresso para o painel; null se a sessão expirou (o painel deixa de perguntar). */
export async function progressoDownloadAction(): Promise<{ estado: EstadoDownload; contagem: Awaited<ReturnType<typeof contagemDocumentos>>; divisao: { de: number; parte: number }; ultimas: Enviada[] } | null> {
  const sessao = await obterSessaoAtual();
  if (!sessao || !pode(sessao, "FATURACAO", "consultar")) return null;
  const [contagem, ultimas] = await Promise.all([contagemDocumentos(), ultimasEnviadas()]);
  return { estado: estadoDownload(), contagem, divisao: divisaoDownload(), ultimas };
}

/** Experimenta o link da fatura mais recente (ou de uma em particular), sem guardar nada. */
export async function testarDocumentoAction(mpinvId?: number) {
  await exigirPermissao("FATURACAO", "criar");
  return testarDocumento(mpinvId);
}
