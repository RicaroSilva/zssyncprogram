import { randomBytes } from "node:crypto";

/**
 * Agendador das tarefas: corre dentro do próprio servidor (não há worker
 * nem cron à parte, como no financial). De 30 em 30 s chama a rota interna
 * /api/agendador/tick, protegida por um segredo gerado no arranque, que vê
 * que tarefas estão na hora. Desliga-se com AGENDADOR=false (ex.: se só se
 * quiser o agendador do programa em Java).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.AGENDADOR === "false") return;
  process.env.AGENDADOR_SEGREDO_INTERNO ??= randomBytes(24).toString("hex");
  const porta = process.env.PORT || "3002";
  const chamar = () =>
    fetch(`http://127.0.0.1:${porta}/api/agendador/tick`, {
      method: "POST",
      headers: { "x-agendador": process.env.AGENDADOR_SEGREDO_INTERNO! },
      cache: "no-store",
    }).catch(() => {
      // o servidor ainda está a arrancar: tenta no próximo ciclo
    });
  setTimeout(chamar, 15_000);
  setInterval(chamar, 30_000);
}
