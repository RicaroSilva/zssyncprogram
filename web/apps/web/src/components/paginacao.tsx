import Link from "next/link";
import { buttonVariants } from "./button";

/** Paginação por ligações (sem JS) — Anterior/Seguinte e um campo para ir
 *  diretamente a um número de página — preservando os restantes
 *  parâmetros de pesquisa da página (ex.: `q`). Usada em todas as
 *  listagens de admin. */
export function Paginacao({
  basePath,
  pagina,
  totalPaginas,
  searchParams,
}: {
  basePath: string;
  pagina: number;
  totalPaginas: number;
  searchParams?: Record<string, string | undefined>;
}) {
  if (totalPaginas <= 1) return null;

  function hrefPara(p: number): string {
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries(searchParams ?? {})) {
      if (valor) parametros.set(chave, valor);
    }
    parametros.set("pagina", String(p));
    return `${basePath}?${parametros.toString()}`;
  }

  return (
    <nav aria-label="Paginação" className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {pagina > 1 ? (
          <Link href={hrefPara(pagina - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Anterior
          </Link>
        ) : (
          <span className={buttonVariants({ variant: "outline", size: "sm", className: "opacity-50" })} aria-disabled>
            Anterior
          </span>
        )}
        {/* Formulário GET simples, sem JS — o browser substitui a query
         * string inteira ao submeter, por isso os restantes parâmetros
         * (ex.: `q`) vão sempre como campos escondidos, nunca só o
         * número da página. */}
        <form method="get" action={basePath} className="flex items-center gap-1">
          {Object.entries(searchParams ?? {})
            .filter(([, valor]) => valor)
            .map(([chave, valor]) => (
              <input key={chave} type="hidden" name={chave} value={valor} />
            ))}
          <label className="sr-only" htmlFor="ir-para-pagina">
            Ir para a página
          </label>
          <input
            id="ir-para-pagina"
            type="number"
            name="pagina"
            min={1}
            max={totalPaginas}
            defaultValue={pagina}
            className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          />
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ir
          </button>
        </form>
        {pagina < totalPaginas ? (
          <Link href={hrefPara(pagina + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Seguinte
          </Link>
        ) : (
          <span className={buttonVariants({ variant: "outline", size: "sm", className: "opacity-50" })} aria-disabled>
            Seguinte
          </span>
        )}
      </div>
    </nav>
  );
}
