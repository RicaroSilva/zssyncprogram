import "server-only";
import { prisma } from "../db";

/**
 * Leitura do histórico do Cegid (Cloudware) que a integração antiga deixou
 * na base de dados do Cyclos — só SELECT, nunca altera estas tabelas:
 *   lp_cloudware_monthly_processings            processamentos mensais
 *   lp_cloudware_monthly_processing_invoices    faturas (user_id, ano, mês, nº, link)
 *   lp_cloudware_monthly_processing_invoice_lines  linhas (rubrica, valor c/ IVA, nº transações)
 *   lp_cloudware_rubrics_mappings               rubrica Cyclos → serviço Cegid
 *   lp_cloudware_users_mappings                 user_id → cliente no Cegid (cw_id)
 */

let existe: boolean | undefined;

/** As tabelas do Cegid existem nesta base de dados? */
export async function temHistoricoCegid(): Promise<boolean> {
  if (existe !== undefined) return existe;
  const [l] = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    SELECT to_regclass('public.lp_cloudware_monthly_processing_invoices') IS NOT NULL
       AND to_regclass('public.lp_cloudware_monthly_processing_invoice_lines') IS NOT NULL AS ok`;
  existe = !!l?.ok;
  return existe;
}

export interface FaturaCegid {
  mpinv_id: number;
  user_id: bigint;
  year: number;
  month: number;
  document_cw_type_id: number;
  document_cw_id: string | null;
  document_cw_number: string | null;
  document_cw_completely_generated: boolean;
  document_cw_url: string | null;
  related_to_user_id: bigint | null;
  notes: string | null;
  invoice_url_published_in_users_records: boolean;
  total: number | null;
  transacoes: number | null;
  copia_estado: string | null;
  copia_erro: string | null;
  copia_chave: string | null;
  copia_tamanho: bigint | null;
}

export type FiltroCopia = "" | "OK" | "ERRO" | "FALTA" | "INCOMPLETA";

const COLUNAS_BASE = `
  i.mpinv_id, i.user_id, i.year, i.month, i.document_cw_type_id, i.document_cw_id, i.document_cw_number,
  i.document_cw_completely_generated, i.document_cw_url, i.related_to_user_id, i.notes,
  i.invoice_url_published_in_users_records,
  d.estado AS copia_estado, d.erro AS copia_erro, d.chave AS copia_chave, d.tamanho AS copia_tamanho`;

const COLUNAS = `${COLUNAS_BASE},
  (SELECT SUM(l.total_amount_with_taxes)::float FROM lp_cloudware_monthly_processing_invoice_lines l WHERE l.mpinv_id = i.mpinv_id) AS total,
  (SELECT SUM(l.total_transactions)::float FROM lp_cloudware_monthly_processing_invoice_lines l WHERE l.mpinv_id = i.mpinv_id) AS transacoes`;

function condicoes(f: { ano?: number; mes?: number; q?: string; copia?: FiltroCopia }): { sql: string; valores: unknown[] } {
  const partes: string[] = [];
  const valores: unknown[] = [];
  const v = (x: unknown) => {
    valores.push(x);
    return `$${valores.length}`;
  };
  if (f.ano && f.mes) partes.push(`i.year = ${v(f.ano)}::smallint AND i.month = ${v(f.mes)}::smallint`);
  if (f.q) {
    if (/^\d+$/.test(f.q)) partes.push(`(i.user_id = ${v(f.q)}::bigint OR i.related_to_user_id = ${v(f.q)}::bigint OR i.document_cw_number ILIKE ${v(`%${f.q}%`)})`);
    else partes.push(`i.document_cw_number ILIKE ${v(`%${f.q}%`)}`);
  }
  if (f.copia === "OK") partes.push(`d.estado = 'OK'`);
  else if (f.copia === "ERRO") partes.push(`d.estado = 'ERRO'`);
  else if (f.copia === "FALTA") partes.push(`d.mpinv_id IS NULL AND i.document_cw_url IS NOT NULL AND i.document_cw_url <> ''`);
  else if (f.copia === "INCOMPLETA") partes.push(`NOT i.document_cw_completely_generated`);
  return { sql: partes.length ? `WHERE ${partes.join(" AND ")}` : "", valores };
}

export async function listarFaturasCegid(f: { ano?: number; mes?: number; q?: string; copia?: FiltroCopia; pagina: number; porPagina: number }) {
  const { sql, valores } = condicoes(f);
  const de = `FROM lp_cloudware_monthly_processing_invoices i LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = i.mpinv_id ${sql}`;
  const [linhas, [contagem]] = await Promise.all([
    prisma.$queryRawUnsafe<FaturaCegid[]>(
      `SELECT ${COLUNAS_BASE} ${de} ORDER BY i.year DESC, i.month DESC, i.user_id, i.mpinv_id LIMIT ${Number(f.porPagina)} OFFSET ${Number((f.pagina - 1) * f.porPagina)}`,
      ...valores,
    ),
    prisma.$queryRawUnsafe<Array<{ n: bigint; valor: number | null }>>(
      `SELECT COUNT(*) AS n, (SELECT SUM(l.total_amount_with_taxes)::float FROM lp_cloudware_monthly_processing_invoice_lines l
         WHERE l.mpinv_id IN (SELECT i.mpinv_id ${de})) AS valor ${de}`,
      ...valores,
    ),
  ]);
  // Totais das faturas desta página numa só consulta (as tabelas do Cegid podem não ter índice por mpinv_id).
  const ids = linhas.map((l) => l.mpinv_id);
  const totais = ids.length
    ? await prisma.$queryRaw<Array<{ mpinv_id: number; total: number | null; transacoes: number | null }>>`
        SELECT mpinv_id, SUM(total_amount_with_taxes)::float AS total, SUM(total_transactions)::float AS transacoes
        FROM lp_cloudware_monthly_processing_invoice_lines WHERE mpinv_id = ANY(${ids}::int[]) GROUP BY mpinv_id`
    : [];
  const porId = new Map(totais.map((t) => [t.mpinv_id, t]));
  for (const l of linhas) {
    l.total = porId.get(l.mpinv_id)?.total ?? null;
    l.transacoes = porId.get(l.mpinv_id)?.transacoes ?? null;
  }
  return { faturas: linhas, total: Number(contagem?.n ?? 0), valor: contagem?.valor ?? 0 };
}

export async function obterFaturaCegid(id: number) {
  const [fatura] = await prisma.$queryRawUnsafe<FaturaCegid[]>(
    `SELECT ${COLUNAS} FROM lp_cloudware_monthly_processing_invoices i LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = i.mpinv_id WHERE i.mpinv_id = $1`,
    id,
  );
  if (!fatura) return null;
  const linhas = await prisma.$queryRaw<
    Array<{ line_id: number; rubric_code: string; total_amount_with_taxes: number; total_transactions: number | null; line_cw_id: string | null; stamp_duty_line_id: string | null; stamp_duty_exempt: boolean | null; descricao: string | null; servico: string | null }>
  >`
    SELECT l.line_id, l.rubric_code, l.total_amount_with_taxes::float AS total_amount_with_taxes, l.total_transactions, l.line_cw_id,
           l.stamp_duty_line_id, l.stamp_duty_exempt, r.rubric_description AS descricao, r.cw_service_code AS servico
    FROM lp_cloudware_monthly_processing_invoice_lines l
    LEFT JOIN LATERAL (
      SELECT rm.rubric_description, rm.cw_service_code FROM lp_cloudware_rubrics_mappings rm
      WHERE rm.transaction_internal_name = l.rubric_code OR rm.cw_service_code = l.rubric_code LIMIT 1
    ) r ON true
    WHERE l.mpinv_id = ${id} ORDER BY l.line_id`;
  const [mapeamento] = await prisma.$queryRaw<Array<{ cw_id: string; first_migration: Date; last_migration: Date | null }>>`
    SELECT cw_id, first_migration, last_migration FROM lp_cloudware_users_mappings WHERE user_id = ${fatura.user_id}`;
  return { fatura, linhas, mapeamento: mapeamento ?? null };
}

/** O mês mais recente com faturas do Cegid (para abrir a lista nesse mês). */
export async function ultimoMesCegid(): Promise<{ ano: number; mes: number } | null> {
  const [l] = await prisma.$queryRaw<Array<{ year: number; month: number }>>`
    SELECT year, month FROM lp_cloudware_monthly_processing_invoices ORDER BY year DESC, month DESC LIMIT 1`;
  return l ? { ano: l.year, mes: l.month } : null;
}

/** Total faturado no Cegid por mês (para juntar ao gráfico do Resumo). */
export async function faturadoCegidPorMes(deAnoMes: number, ateAnoMes: number) {
  return prisma.$queryRaw<Array<{ ano: number; mes: number; valor: number | null; n: bigint }>>`
    SELECT i.year::int AS ano, i.month::int AS mes, SUM(l.total_amount_with_taxes)::float AS valor, COUNT(DISTINCT i.mpinv_id) AS n
    FROM lp_cloudware_monthly_processing_invoices i
    JOIN lp_cloudware_monthly_processing_invoice_lines l ON l.mpinv_id = i.mpinv_id
    WHERE (i.year * 12 + i.month) BETWEEN ${deAnoMes} AND ${ateAnoMes}
    GROUP BY 1, 2`;
}
