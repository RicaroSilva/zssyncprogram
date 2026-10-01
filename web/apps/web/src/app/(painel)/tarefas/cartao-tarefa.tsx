"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { executarAgoraAction, guardarTarefaAction } from "./actions";

const ROTULO_ESTADO: Record<string, string> = { OK: "Correu bem", ERRO: "Falhou", A_CORRER: "A correr…" };

export function CartaoTarefa(props: {
  codigo: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  hora: string;
  diaMes: number | null;
  comDiaMes: boolean;
  ultimaExecucao: string | null;
  ultimoEstado: string | null;
  ultimoResultado: string | null;
  proxima: string | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(props.ativa);
  const [hora, setHora] = useState(props.hora);
  const [diaMes, setDiaMes] = useState(props.diaMes ?? 1);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera();
  const alterado = ativa !== props.ativa || hora !== props.hora || (props.comDiaMes && diaMes !== (props.diaMes ?? 1));

  function guardar() {
    setMensagem(null);
    iniciar(async () => {
      const r = await guardarTarefaAction(props.codigo, ativa, hora, props.comDiaMes ? diaMes : null);
      setMensagem(r.ok ? { erro: false, texto: "Guardado." } : { erro: true, texto: r.erro ?? "Não foi possível guardar." });
      router.refresh();
    });
  }

  function executar() {
    if (!window.confirm(`Executar agora "${props.nome}"?`)) return;
    setMensagem(null);
    iniciar(async () => {
      const r = await executarAgoraAction(props.codigo);
      setMensagem(r.ok ? { erro: false, texto: "A correr em segundo plano — atualize a página para ver o resultado." } : { erro: true, texto: r.erro ?? "Não foi possível executar." });
      router.refresh();
    });
  }

  const campo = "h-10 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]";

  return (
    <div className="flex flex-col rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">{props.nome}</h2>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", props.ativa ? "border-success text-success" : "border-border text-muted-foreground")}>
          {props.ativa ? "Ligada" : "Desligada"}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{props.descricao}</p>

      <div className="mt-5 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} disabled={!props.podeEditar} className="h-4 w-4 accent-[--primary]" />
          Ligada
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {props.comDiaMes && (
            <label className="flex items-center gap-2">
              Dia
              <input type="number" min={1} max={31} value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} disabled={!props.podeEditar} className={cn(campo, "w-20")} />
              de cada mês,
            </label>
          )}
          <label className="flex items-center gap-2">
            {props.comDiaMes ? "às" : "Todos os dias às"}
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} disabled={!props.podeEditar} className={campo} />
          </label>
        </div>
      </div>

      <dl className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Próxima</dt>
          <dd>{props.proxima ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Última</dt>
          <dd>
            {props.ultimaExecucao ?? "Nunca"}
            {props.ultimoEstado && (
              <span className={cn("ml-2 font-semibold", props.ultimoEstado === "ERRO" ? "text-destructive" : props.ultimoEstado === "OK" ? "text-success" : "text-accent")}>
                {ROTULO_ESTADO[props.ultimoEstado] ?? props.ultimoEstado}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {props.ultimoResultado && <p className={cn("mt-2 text-sm", props.ultimoEstado === "ERRO" ? "text-destructive" : "text-muted-foreground")}>{props.ultimoResultado}</p>}

      {props.podeEditar && (
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
          <Button variant="outline" size="sm" onClick={executar} disabled={pendente || props.ultimoEstado === "A_CORRER"}>
            Executar agora
          </Button>
          <Button size="sm" onClick={guardar} disabled={pendente || !alterado}>
            Guardar
          </Button>
        </div>
      )}
      {mensagem && <p className={cn("mt-2 text-right text-sm", mensagem.erro ? "text-destructive" : "text-success")}>{mensagem.texto}</p>}
      {aviso}
    </div>
  );
}
