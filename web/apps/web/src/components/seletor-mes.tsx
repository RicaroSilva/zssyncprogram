import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button";
import { chaveMes, nomeMesTitulo, somarMeses, type Mes } from "@/lib/formatos";

/** Anterior / mês / Seguinte por ligações (sem JS), preservando os outros
 *  parâmetros da página. */
export function SeletorMes({ basePath, mes, searchParams }: { basePath: string; mes: Mes; searchParams?: Record<string, string | undefined> }) {
  function href(m: Mes): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) if (v && k !== "mes" && k !== "pagina") p.set(k, v);
    p.set("mes", chaveMes(m));
    return `${basePath}?${p.toString()}`;
  }
  return (
    <div className="flex items-center gap-2">
      <Link href={href(somarMeses(mes, -1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-44 text-center font-heading text-lg font-semibold">{nomeMesTitulo(mes)}</span>
      <Link href={href(somarMeses(mes, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Mês seguinte">
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
