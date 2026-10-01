/**
 * Texto de erro legível e NUNCA vazio (equivalente a util/Erros.descrever do
 * Java): junta o tipo do erro, a mensagem e a cadeia de causas — o fetch do
 * Node devolve "fetch failed" e a razão real vem em error.cause.
 */
export function descreverErro(e: unknown): string {
  if (e === null || e === undefined) return "Erro desconhecido (sem detalhes).";
  const partes: string[] = [];
  let atual: unknown = e;
  for (let i = 0; atual && i < 6; i++) {
    const parte = parteErro(atual, i === 0);
    if (parte && !partes.some((p) => p.includes(parte))) partes.push(parte);
    atual = atual instanceof Error ? (atual as Error & { cause?: unknown }).cause : undefined;
  }
  return partes.join(" | causa: ") || "Erro desconhecido (sem detalhes).";
}

function parteErro(e: unknown, primeiro: boolean): string {
  if (!(e instanceof Error)) return String(e);
  const codigo = (e as Error & { code?: string }).code;
  const dica = codigo ? DICAS[codigo] : undefined;
  if (e.name === "ZsgoApiErro" || e.name === "ZsgoResultadoIncerto" || e.name === "ErroPasso") return e.message;
  if (e.name === "TimeoutError") return "o servidor demorou demasiado a responder";
  const msg = e.message?.trim();
  if (!msg) return `${e.name} (sem mensagem)${dica ? ` — ${dica}` : ""}`;
  if (!primeiro && msg === "fetch failed") return "";
  return `${msg}${codigo ? ` (${codigo})` : ""}${dica ? ` — ${dica}` : ""}`;
}

const DICAS: Record<string, string> = {
  ECONNREFUSED: "ligação recusada: o servidor está desligado ou o endereço/porta estão errados",
  ENOTFOUND: "endereço do servidor desconhecido",
  EAI_AGAIN: "não foi possível resolver o endereço do servidor (DNS)",
  UND_ERR_CONNECT_TIMEOUT: "o servidor não aceitou a ligação a tempo",
  ECONNRESET: "a ligação foi cortada pelo servidor",
};
