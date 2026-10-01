import { prepararAoArrancar, segredoAgendador } from "./lib/arranque";

/**
 * Arranque do servidor:
 *  1. prepara a base de dados (tabelas em falta e perfis base);
 *  2. agendador das tarefas — corre dentro do próprio servidor (não há
 *     worker nem cron à parte, como no financial). De 30 em 30 s chama a
 *     rota interna /api/agendador/tick, protegida por um segredo gerado no
 *     arranque. Em produção está ligado por omissão (AGENDADOR=false
 *     desliga); no PC (pnpm dev) está desligado (AGENDADOR=true liga).
 */
export async function arrancar(): Promise<void> {
  await prepararAoArrancar();

  const ligado = process.env.AGENDADOR ? process.env.AGENDADOR === "true" : process.env.NODE_ENV === "production";
  if (!ligado) {
    console.log("[agendador] desligado nesta instalação (AGENDADOR).");
    return;
  }
  const segredo = segredoAgendador();
  const porta = process.env.PORT || "3002";
  const chamar = () =>
    fetch(`http://127.0.0.1:${porta}/api/agendador/tick`, {
      method: "POST",
      headers: { "x-agendador": segredo },
      cache: "no-store",
    }).catch(() => {
      // o servidor ainda está a arrancar: tenta no próximo ciclo
    });
  setTimeout(chamar, 15_000);
  setInterval(chamar, 30_000);
}
