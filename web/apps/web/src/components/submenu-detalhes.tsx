"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Envolve um <details>/<summary> de submenu de navegação — fecha
 *  automaticamente quando se clica num link lá dentro, ou fora do
 *  submenu. O <details> nativo não tem nenhum dos dois comportamentos, e
 *  como este layout de admin persiste entre navegações client-side do
 *  Next.js, o atributo `open` nunca é reposto sozinho pela navegação. */
export function SubmenuDetalhes({ resumo, children }: { resumo: string; children: ReactNode }) {
  const detalhesRef = useRef<HTMLDetailsElement>(null);

  function fecharAoClicarLink(evento: React.MouseEvent<HTMLDivElement>) {
    if ((evento.target as HTMLElement).closest("a") && detalhesRef.current) {
      detalhesRef.current.open = false;
    }
  }

  useEffect(() => {
    function fecharAoClicarFora(evento: MouseEvent) {
      const detalhes = detalhesRef.current;
      if (detalhes?.open && !detalhes.contains(evento.target as Node)) {
        detalhes.open = false;
      }
    }
    document.addEventListener("mousedown", fecharAoClicarFora);
    return () => document.removeEventListener("mousedown", fecharAoClicarFora);
  }, []);

  return (
    <details ref={detalhesRef} className="relative">
      <summary className="cursor-pointer list-none hover:text-accent">{resumo}</summary>
      <div
        onClick={fecharAoClicarLink}
        className="absolute left-0 top-full z-10 mt-2 flex min-w-40 flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg"
      >
        {children}
      </div>
    </details>
  );
}
