"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { operacaoZsgoAction, type TipoOperacao } from "../../actions";

/** Botões de ação do detalhe (eliminar, anular com motivo, ativar/desativar). */
export function BotoesAcao({ slug, chave, singular, acoes }: { slug: string; chave: string; singular: string; acoes: TipoOperacao[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aAnular, setAAnular] = useState(false);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera("A falar com o ZSGO…");

  function correr(tipo: TipoOperacao, corpo?: unknown) {
    setErro(null);
    iniciar(async () => {
      const r = await operacaoZsgoAction(slug, tipo, chave, corpo);
      if (!r.ok) setErro(r.erro ?? "Não foi possível.");
      else if (tipo === "eliminar") router.push(`/zsgo/${slug}?eliminado=1`);
      else {
        setAAnular(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {acoes.includes("ativar") && (
          <Button variant="outline" size="sm" disabled={pendente} onClick={() => correr("ativar")}>
            Ativar
          </Button>
        )}
        {acoes.includes("desativar") && (
          <Button variant="outline" size="sm" disabled={pendente} onClick={() => correr("desativar")}>
            Desativar
          </Button>
        )}
        {acoes.includes("anular") && (
          <Button variant="outline" size="sm" disabled={pendente} onClick={() => setAAnular((v) => !v)} className="text-destructive">
            Anular
          </Button>
        )}
        {acoes.includes("eliminar") && (
          <Button
            variant="destructive"
            size="sm"
            disabled={pendente}
            onClick={() => window.confirm(`Eliminar este ${singular} no ZSGO? Não se pode desfazer.`) && correr("eliminar")}
          >
            Eliminar
          </Button>
        )}
      </div>
      {aAnular && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (window.confirm(`Anular este ${singular} no ZSGO? A anulação é definitiva e comunicada à AT.`)) correr("anular", { reason: motivo });
          }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-destructive-40 bg-destructive-10 p-3"
        >
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold">Motivo da anulação (1 a 50 caracteres)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={50} className="h-9 w-72 rounded-lg border border-border bg-surface px-3 text-sm" />
          </label>
          <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
            Confirmar anulação
          </Button>
        </form>
      )}
      {erro && <p className="max-w-xl whitespace-pre-line text-right text-sm text-destructive">{erro}</p>}
      {aviso}
    </div>
  );
}
