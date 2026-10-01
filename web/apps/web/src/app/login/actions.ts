"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verificarCredenciaisEmergencia } from "@/lib/login-emergencia";
import { criarSessao } from "@/lib/auth";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";

export interface ResultadoLoginEmergenciaAction {
  ok: boolean;
  erro?: string;
}

const MENSAGENS: Record<string, string> = {
  desativado: "O acesso de emergência está desativado nesta instalação.",
  nao_configurado: "O acesso de emergência não está configurado (faltam variáveis de ambiente).",
  credenciais_invalidas: "Utilizador ou senha incorretos.",
  demasiadas_tentativas: "Demasiadas tentativas falhadas. Tente novamente dentro de 15 minutos.",
};

export async function loginEmergenciaAction(username: string, password: string): Promise<ResultadoLoginEmergenciaAction> {
  const ip = obterIpCliente(await headers());
  const resultado = await verificarCredenciaisEmergencia(username, password, ip);
  if (!resultado.ok || !resultado.utilizadorId) {
    return { ok: false, erro: MENSAGENS[resultado.motivo ?? ""] ?? "Não foi possível autenticar." };
  }
  await criarSessao(resultado.utilizadorId);
  await registarAuditoria({ utilizadorId: resultado.utilizadorId, acao: "login_emergencia", entidade: "Utilizador", entidadeId: resultado.utilizadorId, ip });
  redirect("/");
}
