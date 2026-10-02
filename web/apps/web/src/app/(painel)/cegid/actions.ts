"use server";

import { headers } from "next/headers";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { contagemDocumentos, estadoDownload, iniciarDownload, pararDownload, testarDocumento, type EstadoDownload } from "@/lib/cegid/descarregar";

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

export async function progressoDownloadAction(): Promise<{ estado: EstadoDownload; contagem: Awaited<ReturnType<typeof contagemDocumentos>> }> {
  await exigirPermissao("FATURACAO", "consultar");
  return { estado: estadoDownload(), contagem: await contagemDocumentos() };
}

/** Experimenta o link da fatura mais recente (ou de uma em particular), sem guardar nada. */
export async function testarDocumentoAction(mpinvId?: number) {
  await exigirPermissao("FATURACAO", "criar");
  return testarDocumento(mpinvId);
}
