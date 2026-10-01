import "server-only";
import { prisma } from "./db";

/** Nomes dos utilizadores do Cyclos (tabela `users`), para mostrar ao lado
 *  dos ids nas listas. Só leitura. */
export async function nomesUtilizadoresCyclos(ids: Array<bigint | number>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.map((i) => BigInt(i)))];
  if (unicos.length === 0) return new Map();
  const linhas = await prisma.$queryRaw<Array<{ id: bigint; name: string | null }>>`
    SELECT u.id, u.name FROM public.users u WHERE u.id = ANY(${unicos}::bigint[])`;
  return new Map(linhas.map((l) => [l.id.toString(), l.name ?? ""]));
}
