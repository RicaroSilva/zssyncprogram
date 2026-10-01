import * as client from "openid-client";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { obterConfiguracaoKeycloak } from "@/lib/keycloak";
import { prisma } from "@/lib/db";
import { criarSessao } from "@/lib/auth";
import { registarAuditoria } from "@/lib/auditoria";
import { urlAbsoluto, urlPedidoAtual } from "@/lib/http";
import { obterIpCliente } from "@/lib/rede-confianca";

const COOKIE_PKCE = "faturacao_oidc_pkce";

// Mesma regra do financial: só entra quem já existir como Utilizador
// (criado em Utilizadores, ou pelo seed) com o mesmo email da conta
// Keycloak — o primeiro login liga o "sub"; a aplicação nunca cria
// utilizadores sozinha a partir do Keycloak.
export async function GET(request: Request) {
  const jar = await cookies();
  const bruto = jar.get(COOKIE_PKCE)?.value;
  jar.delete(COOKIE_PKCE);
  if (!bruto) {
    return NextResponse.redirect(urlAbsoluto("/login?erro=sessao_oidc_expirada", request));
  }
  const { codeVerifier, state } = JSON.parse(bruto) as { codeVerifier: string; state: string };

  const configuracao = await obterConfiguracaoKeycloak();
  const ip = obterIpCliente(await headers());

  let claims: client.IDToken | undefined;
  try {
    const tokens = await client.authorizationCodeGrant(configuracao, urlPedidoAtual(request), {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    });
    claims = tokens.claims();
  } catch {
    return NextResponse.redirect(urlAbsoluto("/login?erro=oidc_invalido", request));
  }

  const sub = typeof claims?.sub === "string" ? claims.sub : undefined;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : undefined;
  if (!sub || !email) {
    return NextResponse.redirect(urlAbsoluto("/login?erro=oidc_sem_identidade", request));
  }

  const identidadeExterna = await prisma.identidadeExterna.findUnique({
    where: { provedor_sujeitoExterno: { provedor: "KEYCLOAK", sujeitoExterno: sub } },
    include: { utilizador: true },
  });
  const utilizador = identidadeExterna?.utilizador ?? (await prisma.utilizador.findUnique({ where: { email } }));

  if (!utilizador || utilizador.estado !== "ATIVO") {
    await registarAuditoria({
      utilizadorId: utilizador?.id ?? null,
      acao: "login_negado",
      entidade: "Utilizador",
      entidadeId: utilizador?.id ?? null,
      depois: { email, sub },
      ip,
    });
    return NextResponse.redirect(urlAbsoluto("/login?erro=sem_acesso", request));
  }

  if (!identidadeExterna) {
    await prisma.identidadeExterna.create({
      data: { utilizadorId: utilizador.id, provedor: "KEYCLOAK", sujeitoExterno: sub, dadosBrutos: claims as never },
    });
  }
  await prisma.utilizador.update({ where: { id: utilizador.id }, data: { ultimoLoginEm: new Date() } });
  await criarSessao(utilizador.id);
  await registarAuditoria({ utilizadorId: utilizador.id, acao: "login", entidade: "Utilizador", entidadeId: utilizador.id, ip });

  return NextResponse.redirect(urlAbsoluto("/", request));
}
