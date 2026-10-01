import type { Coluna } from "@/lib/zsgo/recursos";

const MOEDA = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** Valor de uma célula da lista/detalhe em texto. */
export function formatarValor(v: unknown, tipo?: Coluna["tipo"]): string {
  if (v === undefined || v === null || v === "") return "—";
  if (tipo === "euro") {
    const n = Number(v);
    return Number.isFinite(n) ? MOEDA.format(n) : String(v);
  }
  if (tipo === "data" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
  }
  if (tipo === "sim-nao" || typeof v === "boolean") return v === true || v === "true" || v === 1 ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Uma chave parece um valor monetário? (para formatar no detalhe) */
export function pareceDinheiro(chave: string): boolean {
  return /(^|_)(total|net|tax|amount|price|value|valor|cost|discount_value|paid|pending|balance)(_|$)/i.test(chave) && !/rate|percent|_id$|quantity/i.test(chave);
}

export function pareceData(chave: string, v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$| )/.test(v) && /date|_at$|^date|day/i.test(chave);
}
