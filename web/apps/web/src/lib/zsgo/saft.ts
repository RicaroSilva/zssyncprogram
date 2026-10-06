import "server-only";
import { prisma } from "../db";
import { executar, normalizarItem } from "./servico";

/**
 * Pedidos de SAF-T: o ZSGO gera o ficheiro em segundo plano (POST
 * /saft-exports → process_id; GET /saft-exports/{processId} → status). A API
 * não tem lista, por isso cada pedido feito aqui fica em zsgo_web_saft_pedido.
 */

export interface PedidoSaft {
  process_id: string;
  export_type: string | null;
  periodo: string | null;
  estado: string;
  download_url: string | null;
  erro: string | null;
  pedido_por: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

/** Estados em que o ZSGO ainda está a trabalhar. */
export const saftEmCurso = (estado: string | null | undefined) => !["completed", "failed", "done", "error", "expired"].includes((estado ?? "").toLowerCase());

export function nomeEstadoSaft(estado: string | null | undefined): string {
  const e = (estado ?? "").toLowerCase();
  if (e === "completed" || e === "done") return "Pronto";
  if (e === "failed" || e === "error") return "Falhou";
  if (e === "expired") return "Expirado";
  if (e === "processing" || e === "running") return "A gerar…";
  return "Na fila…";
}

function periodoDe(d: Record<string, unknown> | null, corpo?: Record<string, unknown>): string | null {
  const p = d?.period as { start_date?: string; end_date?: string } | undefined;
  if (p?.start_date) return `${p.start_date} a ${p.end_date ?? "?"}`;
  if (!corpo) return null;
  if (corpo.export_type === "annual") return `Ano ${corpo.year ?? "?"}`;
  if (corpo.export_type === "monthly") return `${String(corpo.month ?? "?").padStart(2, "0")}/${corpo.year ?? "?"}`;
  if (corpo.start_date) return `${corpo.start_date} a ${corpo.end_date ?? "?"}`;
  return null;
}

/** Regista um pedido acabado de fazer (ou o que já estava em curso, no 409). */
export async function registarPedidoSaft(processId: string, dados: unknown, corpo: Record<string, unknown> | undefined, pedidoPor: string) {
  const d = (dados && typeof dados === "object" ? dados : null) as Record<string, unknown> | null;
  await prisma.$executeRaw`
    INSERT INTO zsgo_web_saft_pedido (process_id, export_type, periodo, estado, pedido_por)
    VALUES (${processId}, ${(d?.export_type as string | undefined) ?? (corpo?.export_type as string | undefined) ?? null}, ${periodoDe(d, corpo)},
            ${(d?.status as string | undefined) ?? "pending"}, ${pedidoPor})
    ON CONFLICT (process_id) DO NOTHING`;
}

/** Pergunta ao ZSGO o estado atual e guarda-o. */
export async function atualizarPedidoSaft(processId: string): Promise<Record<string, unknown> | null> {
  const r = await executar("GET", "/saft-exports/{processId}", { processId });
  if (r.status !== 200) return null;
  const d = normalizarItem(r.json) as Record<string, unknown> | null;
  if (!d) return null;
  await prisma.$executeRaw`
    INSERT INTO zsgo_web_saft_pedido (process_id, export_type, periodo, estado, download_url, erro, atualizado_em)
    VALUES (${processId}, ${(d.export_type as string | null) ?? null}, ${periodoDe(d)}, ${String(d.status ?? "pending")},
            ${(d.download_url as string | null) ?? null}, ${(d.error_message as string | null) ?? null}, now())
    ON CONFLICT (process_id) DO UPDATE SET estado = EXCLUDED.estado, download_url = EXCLUDED.download_url, erro = EXCLUDED.erro,
      export_type = COALESCE(EXCLUDED.export_type, zsgo_web_saft_pedido.export_type),
      periodo = COALESCE(EXCLUDED.periodo, zsgo_web_saft_pedido.periodo), atualizado_em = now()`;
  return d;
}

/** Os últimos pedidos; os que ainda estão em curso são atualizados no ZSGO. */
export async function listarPedidosSaft(): Promise<PedidoSaft[]> {
  const lista = await prisma.$queryRaw<PedidoSaft[]>`SELECT * FROM zsgo_web_saft_pedido ORDER BY criado_em DESC LIMIT 30`;
  const emCurso = lista.filter((p) => saftEmCurso(p.estado)).slice(0, 10);
  if (emCurso.length === 0) return lista;
  await Promise.all(emCurso.map((p) => atualizarPedidoSaft(p.process_id).catch(() => null)));
  return prisma.$queryRaw<PedidoSaft[]>`SELECT * FROM zsgo_web_saft_pedido ORDER BY criado_em DESC LIMIT 30`;
}
