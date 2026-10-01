"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { conferirAction } from "./actions";

/** "Conferir com o ZSGO": lê no ZSGO as faturas do mês e compara (só lê). */
export function BotaoConferir({ mes }: { mes: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera("A começar a conferência…");

  function conferir() {
    setErro(null);
    iniciar(async () => {
      const r = await conferirAction(mes);
      if (!r.ok || !r.id) setErro(r.erro ?? "Não foi possível começar.");
      else window.location.assign(`/faturacao/gerar/${r.id}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={conferir} disabled={pendente} title="Lê no ZSGO cada fatura do mês e compara o total, o IVA e o estado com o que foi enviado. Não altera nada no ZSGO.">
        Conferir com o ZSGO
      </Button>
      {erro && <p className="max-w-sm text-right text-sm text-destructive">{erro}</p>}
      {aviso}
    </div>
  );
}
