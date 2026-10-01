"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { associarDocumentoAction, autorizarRecriarAction, procurarDocumentoAction, type DocumentoEncontrado } from "../actions";

const euros = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n));

/**
 * Fatura "Verificar no ZSGO": o pedido ao ZSGO ficou sem resposta e a
 * geração não conseguiu confirmar sozinha se a fatura existe. Duas saídas,
 * como no painel em Java: indicar o nº da fatura que existe (associar) ou
 * confirmar que não existe (autorizar criar outra vez).
 */
export function VerificarNoZsgo({ chave, codigoCliente, valor }: { chave: string; codigoCliente: string | null; valor: number | null }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [documento, setDocumento] = useState<DocumentoEncontrado | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera("A procurar no ZSGO…");

  function procurar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setDocumento(undefined);
    iniciar(async () => {
      const r = await procurarDocumentoAction(texto);
      if (!r.ok) setErro(r.erro ?? "Não foi possível procurar.");
      else setDocumento(r.documento ?? null);
    });
  }

  function associar() {
    if (!documento) return;
    iniciar(async () => {
      const r = await associarDocumentoAction(chave, documento.id);
      if (!r.ok) setErro(r.erro ?? "Não foi possível associar.");
      else router.refresh();
    });
  }

  function autorizar() {
    if (!window.confirm("Confirma que verificou no ZSGO e esta fatura NÃO existe lá?\n\nNa próxima geração vai ser criada outra vez. Se existir, fica em duplicado.")) return;
    iniciar(async () => {
      const r = await autorizarRecriarAction(chave);
      if (!r.ok) setErro(r.erro ?? "Não foi possível autorizar.");
      else router.refresh();
    });
  }

  const outroCliente = !!documento && !!codigoCliente && !!documento.cliente && documento.cliente !== codigoCliente;
  const outroValor = !!documento && valor !== null && documento.total !== null && Math.abs(documento.total - valor) >= 0.01;

  return (
    <div className="mt-6 rounded-card border border-accent bg-primary-10 p-6">
      <h2 className="text-xl font-bold tracking-tight">Verificar no ZSGO</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirme no ZSGO se esta fatura foi criada. Se existir, indique o número (ex.: <code>FR API-FR/11385</code> ou só <code>11385</code>); se não
        existir, autorize criar outra vez.
      </p>

      <form onSubmit={procurar} className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="numero-zsgo" className="sr-only">
          Nº da fatura no ZSGO
        </label>
        <input
          id="numero-zsgo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nº da fatura no ZSGO…"
          required
          className="h-11 w-72 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
        <Button type="submit" variant="outline" disabled={pendente}>
          Procurar no ZSGO
        </Button>
        <Button type="button" variant="ghost" onClick={autorizar} disabled={pendente} className="text-destructive">
          Não existe — autorizar criar outra vez
        </Button>
      </form>

      {documento === null && <p className="mt-4 text-sm text-destructive">Não encontrei nenhum documento com &quot;{texto}&quot; no ZSGO.</p>}
      {documento && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">Encontrado: {documento.numero ?? documento.id}</p>
          <p className="mt-1 text-muted-foreground">
            Cliente {documento.cliente ?? "—"} · {euros(documento.total)} · {documento.data?.slice(0, 10) ?? "—"}
            {documento.referencia ? ` · referência ${documento.referencia}` : ""}
          </p>
          {documento.anulado && <p className="mt-2 font-semibold text-destructive">Este documento está ANULADO no ZSGO — não deve ser associado.</p>}
          {outroCliente && <p className="mt-2 font-semibold text-destructive">Atenção: é de outro cliente no ZSGO ({documento.cliente}, esperado {codigoCliente}).</p>}
          {outroValor && <p className="mt-2 font-semibold text-accent">Atenção: o valor é diferente do desta fatura ({euros(valor)}).</p>}
          <Button className="mt-3" onClick={associar} disabled={pendente || documento.anulado}>
            Associar esta fatura
          </Button>
        </div>
      )}
      {erro && <p className="mt-4 text-sm text-destructive">{erro}</p>}
      {aviso}
    </div>
  );
}
