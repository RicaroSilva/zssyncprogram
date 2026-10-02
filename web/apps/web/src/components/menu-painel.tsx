"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SeparadorMenu } from "@/lib/menu";

const corresponde = (caminho: string, href: string) => caminho === href || caminho.startsWith(`${href}/`);

/** Separadores em cima e o submenu do separador aberto à esquerda (como no ZSGO). */
export function MenuPainel({ separadores, children }: { separadores: SeparadorMenu[]; children: ReactNode }) {
  const caminho = usePathname() ?? "";
  // A entrada mais específica que corresponde à página (ex.: /zsgo/clientes/novo antes de /zsgo/clientes).
  let ativo: { s: number; href: string } | null = null;
  separadores.forEach((s, i) =>
    s.grupos.forEach((g) =>
      g.itens.forEach((it) => {
        if (corresponde(caminho, it.href) && (!ativo || it.href.length > ativo.href.length)) ativo = { s: i, href: it.href };
      }),
    ),
  );
  const atual = ativo as { s: number; href: string } | null;
  const separador = atual ? separadores[atual.s] : undefined;
  const comLateral = !!separador && separador.grupos.reduce((n, g) => n + g.itens.length, 0) > 1;

  return (
    <div>
      <nav aria-label="Menu principal" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {separadores.map((s, i) => (
            <li key={s.nome}>
              <Link
                href={s.href}
                aria-current={atual?.s === i ? "page" : undefined}
                className={cn(
                  "-mb-px block rounded-t-lg border border-transparent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide",
                  atual?.s === i ? "border-border border-b-[--background] bg-background text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={cn("mt-8", comLateral && "grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]")}>
        {comLateral && separador && (
          <aside aria-label={separador.nome}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{separador.nome}</p>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {separador.grupos.map((g) => {
                const aberto = g.itens.some((it) => it.href === atual?.href);
                return (
                  <details key={g.titulo} open={aberto || separador.grupos.length === 1 || undefined} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-muted">
                      {g.titulo}
                      <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      {g.itens.map((it) => (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            aria-current={it.href === atual?.href ? "page" : undefined}
                            className={cn(
                              "block rounded-md px-3 py-1.5 text-sm",
                              it.href === atual?.href ? "bg-primary-10 font-semibold text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {it.nome}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </aside>
        )}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
