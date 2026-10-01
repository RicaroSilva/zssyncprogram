"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/button";
import { cn } from "@/lib/utils";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { cancelarExecucaoAction, confirmarEmissaoAction } from "../../actions";

type EstadoPasso = "PENDENTE" | "A_CORRER" | "OK" | "AVISO" | "ERRO" | "SALTADO";
interface Passo {
  titulo: string;
  estado: EstadoPasso;
  detalhe: string;
  feitos?: number;
  total?: number;
}
interface Resumo {
  clientesAFaturar: number;
  valorAFaturar: number;
  clientesJaFaturados: number;
  clientesSemZsgoCode: number;
  clientesEsgotados: number;
  notasCreditoAEmitir: number;
  valorNotasCreditoAEmitir: number;
  notasCreditoJaEmitidas: number;
  notasCreditoSemZsgoCode: number;
}
export interface EstadoJanela {
  estado: "A_PREPARAR" | "A_AGUARDAR_CONFIRMACAO" | "A_EMITIR" | "CONCLUIDA" | "FALHOU" | "CANCELADA";
  passos: Passo[];
  resumo: Resumo | null;
  resultado: string | null;
}

const euros = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

function IconePasso({ estado }: { estado: EstadoPasso }) {
  const classe = "mt-0.5 h-5 w-5 shrink-0";
  switch (estado) {
    case "OK":
      return <CheckCircle2 className={cn(classe, "text-success")} aria-label="Concluído" />;
    case "AVISO":
      return <AlertTriangle className={cn(classe, "text-accent")} aria-label="Concluído com avisos" />;
    case "ERRO":
      return <XCircle className={cn(classe, "text-destructive")} aria-label="Falhou" />;
    case "A_CORRER":
      return <Loader2 className={cn(classe, "text-accent motion-safe:animate-spin")} aria-label="A correr" />;
    case "SALTADO":
      return <MinusCircle className={cn(classe, "text-muted-foreground")} aria-label="Saltado" />;
    default:
      return <Circle className={cn(classe, "text-border")} aria-label="Por fazer" />;
  }
}

function LinhaResumo({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) {
  return <li className={cn("flex gap-2", aviso && "font-semibold text-destructive")}>• {children}</li>;
}

export function JanelaPassos({ id, inicial, podeEmitir, voltarHref }: { id: string; inicial: EstadoJanela; podeEmitir: boolean; voltarHref: string }) {
  const [dados, setDados] = useState<EstadoJanela>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera();
  const ativa = dados.estado === "A_PREPARAR" || dados.estado === "A_EMITIR";

  useEffect(() => {
    if (!ativa) return;
    let parado = false;
    const ler = async () => {
      try {
        const r = await fetch(`/api/execucoes/${id}`, { cache: "no-store" });
        if (r.ok && !parado) setDados((await r.json()) as EstadoJanela);
      } catch {
        // falha momentânea de rede: tenta outra vez no próximo segundo
      }
    };
    const t = setInterval(ler, 1000);
    return () => {
      parado = true;
      clearInterval(t);
    };
  }, [id, ativa]);

  function emitir() {
    setErro(null);
    iniciar(async () => {
      const r = await confirmarEmissaoAction(id);
      if (!r.ok) setErro(r.erro ?? "Não foi possível confirmar.");
      else setDados((d) => ({ ...d, estado: "A_EMITIR" }));
    });
  }

  function cancelar() {
    iniciar(async () => {
      await cancelarExecucaoAction(id);
      setDados((d) => ({ ...d, estado: "CANCELADA", resultado: "Faturação cancelada." }));
    });
  }

  const r = dados.resumo;
  const nada = !!r && r.clientesAFaturar === 0 && r.notasCreditoAEmitir === 0;
  const terminou = dados.estado === "CONCLUIDA" || dados.estado === "FALHOU" || dados.estado === "CANCELADA";

  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-6">
      <ol className="space-y-5">
        {dados.passos.map((p, i) => (
          <li key={i} className="flex gap-3">
            <IconePasso estado={p.estado} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", p.estado === "A_CORRER" ? "font-bold" : "", p.estado === "PENDENTE" || p.estado === "SALTADO" ? "text-muted-foreground" : "")}>
                Passo {i + 1} — {p.titulo}
              </p>
              {p.detalhe && <p className={cn("mt-1 whitespace-pre-line text-sm", p.estado === "ERRO" ? "text-destructive" : "text-muted-foreground")}>{p.detalhe}</p>}
              {p.estado === "A_CORRER" && !(dados.estado === "A_AGUARDAR_CONFIRMACAO" && i === 4) && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  {p.total && p.total > 0 ? (
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, ((p.feitos ?? 0) / p.total) * 100)}%` }} />
                  ) : (
                    <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-pulse" />
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {dados.estado === "A_AGUARDAR_CONFIRMACAO" && r && (
        <div className="mt-8 rounded-lg border border-border bg-surface-2 p-5 text-sm">
          <p className="font-heading text-base font-semibold">Faturas</p>
          <ul className="mt-2 space-y-1">
            <LinhaResumo>
              <b>{r.clientesAFaturar}</b> cliente(s) vão ser faturados agora — valor estimado {euros(r.valorAFaturar)}
            </LinhaResumo>
            <LinhaResumo>{r.clientesJaFaturados} já estavam faturados (vão ser ignorados)</LinhaResumo>
            {r.clientesSemZsgoCode > 0 && <LinhaResumo aviso>{r.clientesSemZsgoCode} não têm ficha no ZSGO e vão falhar</LinhaResumo>}
            {r.clientesEsgotados > 0 && <LinhaResumo>{r.clientesEsgotados} já esgotaram as tentativas (vão ser ignorados)</LinhaResumo>}
          </ul>
          <p className="mt-4 font-heading text-base font-semibold">Notas de crédito</p>
          <ul className="mt-2 space-y-1">
            <LinhaResumo>
              <b>{r.notasCreditoAEmitir}</b> vão ser emitidas agora — valor estimado {euros(r.valorNotasCreditoAEmitir)}
            </LinhaResumo>
            <LinhaResumo>{r.notasCreditoJaEmitidas} já estavam emitidas (vão ser ignoradas)</LinhaResumo>
            {r.notasCreditoSemZsgoCode > 0 && <LinhaResumo aviso>{r.notasCreditoSemZsgoCode} são de clientes sem ficha no ZSGO e vão falhar</LinhaResumo>}
          </ul>
          {nada && <p className="mt-4 text-muted-foreground">Não há nada por faturar/emitir neste mês com os dados atuais.</p>}
        </div>
      )}

      {terminou && dados.resultado && (
        <p
          className={cn(
            "mt-8 whitespace-pre-line rounded-lg border p-4 text-sm font-semibold",
            dados.estado === "FALHOU" ? "border-destructive-40 bg-destructive-10 text-destructive" : "border-border bg-surface-2",
          )}
        >
          {dados.resultado}
        </p>
      )}

      {erro && <p className="mt-4 text-sm text-destructive">{erro}</p>}

      <div className="mt-8 flex flex-wrap justify-end gap-3">
        {dados.estado === "A_AGUARDAR_CONFIRMACAO" && podeEmitir && (
          <>
            <Button variant="outline" onClick={cancelar} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={emitir} disabled={pendente}>
              {nada ? "Correr na mesma" : "Emitir faturas"}
            </Button>
          </>
        )}
        {(terminou || ativa) && (
          <Link href={voltarHref} className={buttonVariants({ variant: terminou ? "primary" : "outline" })}>
            {terminou ? "Ver as faturas" : "Ver a lista enquanto corre"}
          </Link>
        )}
      </div>
      {aviso}
    </div>
  );
}
