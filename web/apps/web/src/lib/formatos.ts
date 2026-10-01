import type { Prisma } from "@faturacao/db";

const MOEDA = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function euros(valor: Prisma.Decimal | number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return MOEDA.format(Number(valor));
}

export function dataHora(d: Date | null | undefined): string {
  return d ? d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export interface Mes {
  ano: number;
  mes: number;
}

/** "2026-08" → { ano: 2026, mes: 8 }; inválido/ausente → mês anterior ao
 *  atual (é o mês que normalmente se fatura). */
export function lerMes(valor: string | undefined): Mes {
  const m = valor?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) return { ano, mes };
  }
  const hoje = new Date();
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { ano: anterior.getFullYear(), mes: anterior.getMonth() + 1 };
}

export function chaveMes({ ano, mes }: Mes): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function somarMeses({ ano, mes }: Mes, n: number): Mes {
  const d = new Date(ano, mes - 1 + n, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

export function nomeMes({ ano, mes }: Mes): string {
  return `${MESES[mes - 1]} de ${ano}`;
}

/** "Agosto de 2026" — para títulos. */
export function nomeMesTitulo(m: Mes): string {
  const n = nomeMes(m);
  return n.charAt(0).toUpperCase() + n.slice(1);
}
