import "server-only";
import { prisma } from "../db";
import { temHistoricoCegid } from "../cegid/historico";
import { somarMeses, type Mes } from "../formatos";

/**
 * Análise da receita por cliente e por rubrica. A receita é o que se
 * faturou (as comissões): faturas emitidas no ZSGO menos as notas de crédito,
 * mais o histórico do Cegid (lp_cloudware_*). Valores tal como faturados
 * (com impostos). Só leitura.
 */

export type Periodo = "mes" | "3m" | "12m" | "ano" | "tudo";
export const PERIODOS: Array<{ valor: Periodo; nome: string }> = [
  { valor: "mes", nome: "Mês" },
  { valor: "3m", nome: "Últimos 3 meses" },
  { valor: "12m", nome: "Últimos 12 meses" },
  { valor: "ano", nome: "Ano" },
  { valor: "tudo", nome: "Desde o início" },
];

export interface Intervalo {
  de: Mes;
  ate: Mes;
  anterior: { de: Mes; ate: Mes } | null;
  nome: string;
}

const am = (m: Mes) => m.ano * 12 + m.mes;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeCurto = (m: Mes) => `${MESES[m.mes - 1]} ${m.ano}`;

export function intervalo(periodo: Periodo, ref: Mes): Intervalo {
  let de: Mes;
  let ate: Mes = ref;
  if (periodo === "mes") de = ref;
  else if (periodo === "3m") de = somarMeses(ref, -2);
  else if (periodo === "12m") de = somarMeses(ref, -11);
  else if (periodo === "ano") {
    de = { ano: ref.ano, mes: 1 };
    ate = { ano: ref.ano, mes: 12 };
  } else de = { ano: 2015, mes: 1 };
  const n = am(ate) - am(de) + 1;
  const anterior = periodo === "tudo" ? null : { de: somarMeses(de, -n), ate: somarMeses(de, -1) };
  const nome =
    periodo === "mes" ? nomeCurto(ref) : periodo === "ano" ? `Ano ${ref.ano}` : periodo === "tudo" ? `Até ${nomeCurto(ref)}` : `${nomeCurto(de)} a ${nomeCurto(ate)}`;
  return { de, ate, anterior, nome };
}

interface LinhaMes {
  user_id: string;
  ano: number;
  mes: number;
  valor: number;
  transacoes: number;
}

/** Receita e transações por cliente e mês, num intervalo de meses (ZSGO − notas de crédito + Cegid). */
export async function receitaPorClienteMes(de: Mes, ate: Mes, cliente?: string): Promise<LinhaMes[]> {
  const a = am(de);
  const b = am(ate);
  const id = cliente ? BigInt(cliente) : null;
  const comCegid = await temHistoricoCegid().catch(() => false);
  const zsgo = prisma.$queryRaw<LinhaMes[]>`
    SELECT f.user_id::text AS user_id, f.ano, f.mes, f.valor, COALESCE(t.transacoes, 0)::float AS transacoes
    FROM (
      SELECT user_id, ano, mes, SUM(valor_total)::float AS valor FROM zsgo_invoice_sync
      WHERE status = 'SINCRONIZADO' AND (ano * 12 + mes) BETWEEN ${a} AND ${b} AND (${id}::bigint IS NULL OR user_id = ${id}::bigint)
      GROUP BY 1, 2, 3
    ) f
    LEFT JOIN (
      SELECT cliente_id, ano, mes, SUM(nr_transacoes) AS transacoes FROM zsgo_invoice_line_detail
      WHERE (ano * 12 + mes) BETWEEN ${a} AND ${b} AND (${id}::bigint IS NULL OR cliente_id = ${id}::bigint)
      GROUP BY 1, 2, 3
    ) t ON t.cliente_id = f.user_id AND t.ano = f.ano AND t.mes = f.mes`;
  const notas = prisma.$queryRaw<LinhaMes[]>`
    SELECT n.cliente_id::text AS user_id, n.ano, n.mes, -SUM(n.valor_estorno)::float AS valor, 0::float AS transacoes
    FROM zsgo_credit_note_sync n
    WHERE n.status = 'SINCRONIZADO' AND n.cliente_id IS NOT NULL AND (n.ano * 12 + n.mes) BETWEEN ${a} AND ${b}
      AND (${id}::bigint IS NULL OR n.cliente_id = ${id}::bigint)
    GROUP BY 1, 2, 3`;
  const cegid = comCegid
    ? prisma.$queryRaw<LinhaMes[]>`
        SELECT i.user_id::text AS user_id, i.year::int AS ano, i.month::int AS mes,
               SUM(l.total_amount_with_taxes)::float AS valor, COALESCE(SUM(l.total_transactions), 0)::float AS transacoes
        FROM lp_cloudware_monthly_processing_invoices i
        JOIN lp_cloudware_monthly_processing_invoice_lines l ON l.mpinv_id = i.mpinv_id
        WHERE (i.year * 12 + i.month) BETWEEN ${a} AND ${b} AND (${id}::bigint IS NULL OR i.user_id = ${id}::bigint)
        GROUP BY 1, 2, 3`
    : Promise.resolve([] as LinhaMes[]);
  const [z, n, c] = await Promise.all([zsgo, notas, cegid]);
  return [...z, ...n, ...c];
}

export interface LinhaCliente {
  user_id: string;
  valor: number;
  anterior: number;
  transacoes: number;
  meses: number;
  variacao: number | null;
  peso: number;
  pesoAcumulado: number;
}

/** Ranking de clientes no período (com o período anterior para comparar). */
export async function rankingClientes(iv: Intervalo): Promise<{ linhas: LinhaCliente[]; total: number; totalAnterior: number }> {
  const [atual, ant] = await Promise.all([
    receitaPorClienteMes(iv.de, iv.ate),
    iv.anterior ? receitaPorClienteMes(iv.anterior.de, iv.anterior.ate) : Promise.resolve([] as LinhaMes[]),
  ]);
  const mapa = new Map<string, { valor: number; anterior: number; transacoes: number; meses: Set<number> }>();
  const linha = (id: string) => {
    let l = mapa.get(id);
    if (!l) mapa.set(id, (l = { valor: 0, anterior: 0, transacoes: 0, meses: new Set() }));
    return l;
  };
  for (const r of atual) {
    const l = linha(r.user_id);
    l.valor += r.valor;
    l.transacoes += r.transacoes;
    if (r.valor > 0) l.meses.add(r.ano * 12 + r.mes);
  }
  for (const r of ant) linha(r.user_id).anterior += r.valor;
  const total = [...mapa.values()].reduce((s, l) => s + l.valor, 0);
  const totalAnterior = [...mapa.values()].reduce((s, l) => s + l.anterior, 0);
  let acumulado = 0;
  const linhas = [...mapa.entries()]
    .filter(([, l]) => Math.abs(l.valor) > 0.004 || Math.abs(l.anterior) > 0.004)
    .sort((x, y) => y[1].valor - x[1].valor)
    .map(([user_id, l]) => {
      acumulado += l.valor;
      return {
        user_id,
        valor: l.valor,
        anterior: l.anterior,
        transacoes: l.transacoes,
        meses: l.meses.size,
        variacao: iv.anterior && l.anterior > 0 ? (l.valor - l.anterior) / l.anterior : null,
        peso: total ? l.valor / total : 0,
        pesoAcumulado: total ? acumulado / total : 0,
      };
    });
  return { linhas, total, totalAnterior };
}

export type TipoAlerta = "caiu" | "parou" | "cresceu" | "novo";
export interface Alerta {
  tipo: TipoAlerta;
  user_id: string;
  valor: number;
  media: number;
}

/**
 * Alertas no mês de referência, comparado com a média dos 3 meses anteriores:
 *  caiu    — faturou menos de 70% da média (média ≥ minimo)
 *  parou   — não faturou nada, mas tinha média ≥ minimo
 *  cresceu — faturou mais de 130% da média (média ≥ minimo)
 *  novo    — faturou e não tinha nada nos 12 meses anteriores
 */
export async function alertas(ref: Mes, minimo = 5): Promise<Alerta[]> {
  const linhas = await receitaPorClienteMes(somarMeses(ref, -12), ref);
  const r = am(ref);
  const porCliente = new Map<string, { atual: number; tres: number; doze: number }>();
  for (const l of linhas) {
    const k = l.ano * 12 + l.mes;
    const c = porCliente.get(l.user_id) ?? { atual: 0, tres: 0, doze: 0 };
    if (k === r) c.atual += l.valor;
    else {
      c.doze += l.valor;
      if (k >= r - 3) c.tres += l.valor;
    }
    porCliente.set(l.user_id, c);
  }
  const res: Alerta[] = [];
  for (const [user_id, c] of porCliente) {
    const media = c.tres / 3;
    if (c.atual > 0.004 && c.doze <= 0.004) res.push({ tipo: "novo", user_id, valor: c.atual, media: 0 });
    else if (media >= minimo && c.atual <= 0.004) res.push({ tipo: "parou", user_id, valor: c.atual, media });
    else if (media >= minimo && c.atual < media * 0.7) res.push({ tipo: "caiu", user_id, valor: c.atual, media });
    else if (media >= minimo && c.atual > media * 1.3) res.push({ tipo: "cresceu", user_id, valor: c.atual, media });
  }
  // Os de maior impacto primeiro (diferença face à média).
  return res.sort((x, y) => Math.abs(y.valor - y.media) - Math.abs(x.valor - x.media));
}

export interface LinhaRubrica {
  rubrica: string;
  valor: number;
  transacoes: number;
  clientes: number;
}

/** Receita por rubrica no período (ZSGO pelas linhas das faturas emitidas + Cegid pela descrição da rubrica). */
export async function rubricas(iv: Intervalo, cliente?: string): Promise<LinhaRubrica[]> {
  const a = am(iv.de);
  const b = am(iv.ate);
  const id = cliente ? BigInt(cliente) : null;
  const comCegid = await temHistoricoCegid().catch(() => false);
  const zsgo = prisma.$queryRaw<Array<{ rubrica: string; valor: number; transacoes: number; cliente: string }>>`
    SELECT COALESCE(NULLIF(l.rubrica, ''), l.product_reference, '—') AS rubrica, l.cliente_id::text AS cliente,
           SUM(l.valor)::float AS valor, COALESCE(SUM(l.nr_transacoes), 0)::float AS transacoes
    FROM zsgo_invoice_line_detail l
    WHERE (l.ano * 12 + l.mes) BETWEEN ${a} AND ${b} AND (${id}::bigint IS NULL OR l.cliente_id = ${id}::bigint)
      AND EXISTS (SELECT 1 FROM zsgo_invoice_sync f WHERE f.user_id = l.cliente_id AND f.ano = l.ano AND f.mes = l.mes AND f.status = 'SINCRONIZADO')
    GROUP BY 1, 2`;
  const cegid = comCegid
    ? prisma.$queryRaw<Array<{ rubrica: string; valor: number; transacoes: number; cliente: string }>>`
        SELECT COALESCE(
                 (SELECT rm.rubric_description FROM lp_cloudware_rubrics_mappings rm WHERE rm.transaction_internal_name = t.rubric_code LIMIT 1),
                 (SELECT rm.rubric_description FROM lp_cloudware_rubrics_mappings rm WHERE rm.cw_service_code = t.rubric_code LIMIT 1),
                 t.rubric_code) AS rubrica, t.cliente, t.valor, t.transacoes
        FROM (
          SELECT l.rubric_code, i.user_id::text AS cliente, SUM(l.total_amount_with_taxes)::float AS valor, COALESCE(SUM(l.total_transactions), 0)::float AS transacoes
          FROM lp_cloudware_monthly_processing_invoices i
          JOIN lp_cloudware_monthly_processing_invoice_lines l ON l.mpinv_id = i.mpinv_id
          WHERE (i.year * 12 + i.month) BETWEEN ${a} AND ${b} AND (${id}::bigint IS NULL OR i.user_id = ${id}::bigint)
          GROUP BY 1, 2
        ) t`
    : Promise.resolve([]);
  const [z, c] = await Promise.all([zsgo, cegid]);
  const mapa = new Map<string, { valor: number; transacoes: number; clientes: Set<string> }>();
  for (const r of [...z, ...c]) {
    const m = mapa.get(r.rubrica) ?? { valor: 0, transacoes: 0, clientes: new Set<string>() };
    m.valor += r.valor ?? 0;
    m.transacoes += r.transacoes ?? 0;
    m.clientes.add(r.cliente);
    mapa.set(r.rubrica, m);
  }
  return [...mapa.entries()]
    .map(([rubrica, m]) => ({ rubrica, valor: m.valor, transacoes: m.transacoes, clientes: m.clientes.size }))
    .sort((x, y) => y.valor - x.valor);
}

/** O último mês com faturação (ZSGO ou Cegid), para abrir a análise. */
export async function ultimoMesComReceita(): Promise<Mes | null> {
  const [z] = await prisma.$queryRaw<Array<{ ano: number; mes: number }>>`
    SELECT ano, mes FROM zsgo_invoice_sync WHERE status = 'SINCRONIZADO' ORDER BY ano DESC, mes DESC LIMIT 1`;
  let c: { ano: number; mes: number } | undefined;
  if (await temHistoricoCegid().catch(() => false)) {
    [c] = await prisma.$queryRaw<Array<{ ano: number; mes: number }>>`
      SELECT year::int AS ano, month::int AS mes FROM lp_cloudware_monthly_processing_invoices ORDER BY year DESC, month DESC LIMIT 1`;
  }
  const melhor = [z, c].filter((x): x is { ano: number; mes: number } => !!x).sort((x, y) => y.ano * 12 + y.mes - (x.ano * 12 + x.mes))[0];
  return melhor ? { ano: melhor.ano, mes: melhor.mes } : null;
}

/** "AAAA-MM" → Mes (sem valor → null). */
export function lerMesOpcional(v: string | undefined): Mes | null {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null;
}
