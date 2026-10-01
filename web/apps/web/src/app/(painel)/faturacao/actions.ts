"use server";

import { headers } from "next/headers";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { cancelarExecucao, confirmarEmissao, iniciarFaturacao } from "@/lib/faturacao/execucao";
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
