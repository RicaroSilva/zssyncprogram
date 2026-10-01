import "server-only";

/**
 * O Caddy (único reverse proxy desta arquitetura — ver README, "Proxy
 * reverso") reenvia sempre `X-Forwarded-For`, acrescentando o IP real do
 * cliente como o ÚLTIMO elemento da lista (anexa ao valor recebido, nunca
 * o substitui) — os elementos anteriores podem ter sido escritos pelo
 * próprio cliente e não são fiáveis. Ler o cabeçalho bruto (primeiro
 * elemento, ou a string toda) permite a um atacante falsificar o IP usado
 * em bloqueios por tentativas (TentativaAutenticacao) e em registos de
 * auditoria/consultas — usar sempre esta função em vez de ler
 * "x-forwarded-for" diretamente.
 */
export function obterIpCliente(cabecalhos: Headers): string | null {
  const bruto = cabecalhos.get("x-forwarded-for");
  if (!bruto) return null;
  const partes = bruto.split(",").map((p) => p.trim()).filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1]! : null;
}
