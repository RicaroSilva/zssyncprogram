import "server-only";
import { headers } from "next/headers";

/**
 * As rotas correm com `next start -H 0.0.0.0` (ver Dockerfile — necessário
 * para o Caddy, noutra VM, conseguir alcançar o container pela rede). Com
 * esse `-H`, o Next.js resolve `request.url`, em Route Handlers, sempre
 * para `http://0.0.0.0:<porta>/…` — ignora por completo o cabeçalho `Host`
 * que o Caddy reenvia. Construir URLs absolutas a partir de `request.url`
 * (`new URL(caminho, request.url)`) produz então um destino inválido
 * (`ERR_ADDRESS_INVALID` no browser, ou uma troca de código OIDC que falha
 * por o URL do pedido não bater certo com o `redirect_uri` esperado).
 *
 * Usar sempre as funções abaixo em vez de `request.url` para construir um
 * URL absoluto — nunca `new URL(caminho, request.url)` diretamente.
 */

/** Esquema+anfitrião públicos do pedido atual, a partir dos cabeçalhos que
 *  o Caddy já reenvia (ver README, "Proxy reverso"). */
export function origemPedido(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (!host) return new URL(request.url).origin;
  return `${proto}://${host}`;
}

/** Equivalente a origemPedido(), mas para Server Components/Actions — que
 *  não têm um `Request` à mão — lendo os mesmos cabeçalhos via
 *  `next/headers` (ex.: para mostrar um link absoluto numa página, como o
 *  link público da fotografia de um PEP). */
export async function origemPedidoServidor(): Promise<string> {
  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
  const proto = cabecalhos.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3001";
}

/** O URL absoluto de um caminho relativo, com a origem corrigida — para
 *  redirects (`NextResponse.redirect`). */
export function urlAbsoluto(caminho: string, request: Request): URL {
  return new URL(caminho, origemPedido(request));
}

/** O próprio URL do pedido atual (caminho, query e tudo), mas com a
 *  origem corrigida — para bibliotecas que precisam do URL completo do
 *  pedido (ex.: openid-client a validar o callback OIDC). */
export function urlPedidoAtual(request: Request): URL {
  const bruto = new URL(request.url);
  return urlAbsoluto(`${bruto.pathname}${bruto.search}`, request);
}
