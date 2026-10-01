"use client";

import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/** Popup modal "a aguardar" — mostrado pelo hook usarTransicaoComEspera
 *  quando uma ação (importar ficheiro, guardar um dado) demora mais de
 *  meio segundo. Nunca chamar diretamente fora desse hook. */
export function OverlayAguardar({ mensagem = "A processar, aguarde…" }: { mensagem?: string }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="alert" aria-live="assertive">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-6 py-4 shadow-lg">
        <Loader2 className="h-5 w-5 motion-safe:animate-spin text-accent" aria-hidden="true" />
        <p className="text-sm font-medium">{mensagem}</p>
      </div>
    </div>,
    document.body,
  );
}
