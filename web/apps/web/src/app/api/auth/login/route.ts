import * as client from "openid-client";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { obterConfiguracaoKeycloak, redirectUriKeycloak } from "@/lib/keycloak";

const COOKIE_PKCE = "faturacao_oidc_pkce";

export async function GET() {
  const cabecalhos = await headers();
  const configuracao = await obterConfiguracaoKeycloak();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const authUrl = client.buildAuthorizationUrl(configuracao, {
    redirect_uri: redirectUriKeycloak(),
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  const jar = await cookies();
  jar.set(COOKIE_PKCE, JSON.stringify({ codeVerifier, state }), {
    httpOnly: true,
    secure: cabecalhos.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authUrl);
}
