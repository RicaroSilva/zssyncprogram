"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { gerarFaturacaoAction } from "./actions";

/** "Gerar faturas em falta": abre a janela de passos da faturação do mês. */
export function BotaoGerar({ mes, nomeMes }: { mes: string; nomeMes: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera("A começar a faturação…");

  function gerar() {
    if (!window.confirm(`Gerar a faturação de ${nomeMes}?\n\nPrimeiro faz a pré-análise e atualiza os clientes; as faturas só são emitidas depois de confirmar o resumo.`)) return;
    setErro(null);
    iniciar(async () => {
      const r = await gerarFaturacaoAction(mes);
      if (!r.ok || !r.id) setErro(r.erro ?? "Não foi possível começar.");
      else window.location.assign(`/faturacao/gerar/${r.id}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={gerar} disabled={pendente}>
        Gerar faturas em falta
      </Button>
      {erro && <p className="max-w-sm text-right text-sm text-destructive">{erro}</p>}
      {aviso}
    </div>
  );
}
