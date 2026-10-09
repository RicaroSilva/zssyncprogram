import Link from "next/link";
import { SeletorMes } from "@/components/seletor-mes";
import { cn } from "@/lib/utils";
import { chaveMes, type Mes } from "@/lib/formatos";
import { PERIODOS, type Periodo } from "@/lib/analise/dados";

/** Escolha do período (mês, 3 meses, 12 meses, ano, tudo) e do mês de referência. */
export function FiltrosAnalise({ basePath, periodo, mes, extra }: { basePath: string; periodo: Periodo; mes: Mes; extra?: Record<string, string | undefined> }) {
  const href = (p: Periodo) => {
    const q = new URLSearchParams({ periodo: p, mes: chaveMes(mes) });
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.valor}
            href={href(p.valor)}
            aria-current={periodo === p.valor ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm font-semibold", periodo === p.valor ? "border-primary bg-primary-10 text-accent" : "border-border hover:bg-muted")}
          >
            {p.nome}
          </Link>
        ))}
      </nav>
      <SeletorMes basePath={basePath} mes={mes} searchParams={{ periodo, ...extra }} />
    </div>
  );
}

export function lerPeriodo(v: string | undefined): Periodo {
  return (PERIODOS.find((p) => p.valor === v)?.valor ?? "12m") as Periodo;
}
