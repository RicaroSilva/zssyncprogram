import * as client from "openid-client";

/** Configuração OIDC ficam sempre fora do processo (variáveis de ambiente),
 *  nunca hardcoded — ver README para os valores esperados em produção. */
function env(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida (configuração Keycloak).`);
  return valor;
}

let configuracaoCache: client.Configuration | undefined;

/** Descoberta OIDC do realm Keycloak (cacheada no processo). */
export async function obterConfiguracaoKeycloak(): Promise<client.Configuration> {
  if (configuracaoCache) return configuracaoCache;
  const issuer = new URL(env("KEYCLOAK_ISSUER"));
  configuracaoCache = await client.discovery(issuer, env("KEYCLOAK_CLIENT_ID"), env("KEYCLOAK_CLIENT_SECRET"));
  return configuracaoCache;
}

export function redirectUriKeycloak(): string {
  return env("KEYCLOAK_REDIRECT_URI");
}
