/** Arranque do servidor — ver instrumentation-node.ts (só corre em Node). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { arrancar } = await import("./instrumentation-node");
    await arrancar();
  }
}
