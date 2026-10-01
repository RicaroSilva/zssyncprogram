import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { descreverErro } from "@/lib/erros";
import { operacoesDe, primeiroValor, recursoPorSlug } from "@/lib/zsgo/recursos";
import { listar, opcoesParaParametros } from "@/lib/zsgo/servico";
import { rotulo } from "@/lib/zsgo/rotulos";
import { VistaObjeto } from "@/components/zsgo/vista-objeto";
import { buttonVariants } from "@/components/button";

export const dynamic = "force-dynamic";

/** Documentos por liquidar (recibos: faturas de clientes; pagamentos: compras). */
export default async function PaginaPendentes({ params, searchParams }: { params: Promise<{ recurso: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "ZSGO", "consultar")) redirect("/");
  const { recurso: slug } = await params;
  const recurso = recursoPorSlug(slug);
  if (!recurso) notFound();
  const op = operacoesDe(recurso).pendentes;
  if (!op) notFound();
  const filtro = op.parametros.find((p) => p.em === "query");
  const sp = await searchParams;
  const valor = filtro ? sp[filtro.nome] : undefined;
  const opcoes = filtro ? (await opcoesParaParametros([filtro.nome]))[filtro.nome] : undefined;
  let itens: unknown[] = [];
  let erro: string | null = null;
  if (valor) {
    try {
      itens = (await listar(op.caminho, { [filtro!.nome]: valor })).itens;
    } catch (e) {
      erro = descreverErro(e);
    }
  }
  const podeCriar = !!operacoesDe(recurso).criar && pode(sessao, "ZSGO", "criar");
  return (
    <div>
      <Link href={`/zsgo/${slug}`} className="text-sm font-semibold text-accent hover:underline">
        ← {recurso.nome}
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">Documentos por liquidar</h1>
      {filtro && (
        <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="filtro" className="mb-1 block text-xs font-semibold text-muted-foreground">
              {rotulo(filtro.nome)}
            </label>
            <input id="filtro" name={filtro.nome} defaultValue={valor ?? ""} required list="opcoes-filtro" className="h-10 w-80 rounded-lg border border-border bg-surface px-3 text-sm" />
            <datalist id="opcoes-filtro">
              {opcoes?.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </datalist>
          </div>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm", className: "h-10" })}>
            Ver
          </button>
        </form>
      )}
      {erro && <p className="mt-6 rounded-lg border border-destructive-40 bg-destructive-10 p-4 text-sm text-destructive">{erro}</p>}
      {valor && !erro && (
        <div className="mt-6 space-y-3">
          {itens.length === 0 && <p className="text-muted-foreground">Nada por liquidar.</p>}
          {itens.map((item, i) => {
            const id = primeiroValor(item, ["id", "document_id", "document.id"]);
            const tipo = primeiroValor(item, ["document_type", "document.type", "type"]);
            const pendente = primeiroValor(item, ["pending", "pending_amount", "amount_pending", "balance", "total"]);
            return (
              <div key={String(id ?? i)} className="rounded-card border border-border bg-surface p-4">
                <VistaObjeto dados={item} nivel={1} />
                {podeCriar && slug === "recibos" && id !== undefined && (
                  <Link
                    href={`/zsgo/recibos/novo?cliente=${encodeURIComponent(valor)}&documento=${encodeURIComponent(String(id))}&tipo=${encodeURIComponent(String(tipo ?? "FA"))}${pendente !== undefined ? `&valor=${encodeURIComponent(String(pendente))}` : ""}`}
                    className={buttonVariants({ size: "sm", className: "mt-3" })}
                  >
                    Emitir recibo deste documento
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
