"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { diagnosticoAction } from "../faturacao/actions";

export function FormularioDiagnostico() {
  const [procura, setProcura] = useState("");
  const [texto, setTexto] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera("A perguntar ao ZSGO…");

  function correr(evento: React.FormEvent) {
    evento.preventDefault();
    iniciar(async () => setTexto((await diagnosticoAction(procura)).texto));
  }

  return (
    <div className="mt-6">
      <form onSubmit={correr} className="flex flex-wrap items-center gap-2">
        <label htmlFor="procura" className="sr-only">
          Número ou id a procurar
        </label>
        <input
          id="procura"
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Nº ou id a procurar (opcional)…"
          className="h-11 w-80 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
        <Button type="submit" disabled={pendente}>
          Correr diagnóstico
        </Button>
        {texto && (
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(texto)}>
            Copiar resultado
          </Button>
        )}
      </form>
      {texto && <pre className="mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-4 font-mono text-xs">{texto}</pre>}
      {aviso}
    </div>
  );
}
