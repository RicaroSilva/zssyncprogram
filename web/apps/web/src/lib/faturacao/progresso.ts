/** Progresso de um passo: texto + feitos/total (total ≤ 0 = indeterminado). */
export type Progresso = (texto: string, feitos?: number, total?: number) => void;
export const SEM_PROGRESSO: Progresso = () => {};

/** Corre `tarefa` sobre cada item com no máximo `limite` em paralelo
 *  (equivalente ao invoice.threads do Java). */
export async function emParalelo<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>): Promise<void> {
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++]!;
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}
