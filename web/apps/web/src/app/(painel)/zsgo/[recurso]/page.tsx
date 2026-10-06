import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { descreverErro } from "@/lib/erros";
import { chaveDoItem, colunasAutomaticas, operacoesDe, primeiroValor, recursoPorSlug, type Coluna } from "@/lib/zsgo/recursos";
import { listar, opcoesParaEsquema, opcoesParaParametros } from "@/lib/zsgo/servico";
import { rotulo } from "@/lib/zsgo/rotulos";
import { tipoDe } from "@/lib/zsgo/especificacao";
import { formatarValor } from "@/components/zsgo/formatar";
import { buttonVariants } from "@/components/button";
import { Notice } from "@/components/notice";
import { Paginacao } from "@/components/paginacao";
import { NovoSemLista } from "./novo-sem-lista";
import { listarPedidosSaft, nomeEstadoSaft, saftEmCurso } from "@/lib/zsgo/saft";
import { AtualizarSozinho } from "./[chave]/atualizar-sozinho";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const POR_PAGINA = 25;

export default async function PaginaListaZsgo({ params, searchParams }: { params: Promise<{ recurso: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "ZSGO", "consultar")) redirect("/");
  const { recurso: slug } = await params;
  const recurso = recursoPorSlug(slug);
  if (!recurso) notFound();
  const ops = operacoesDe(recurso);
  const filtrosUrl = await searchParams;
  const pagina = Math.max(1, Number(filtrosUrl.pagina) || 1);
  const podeCriar = !!ops.criar && pode(sessao, "ZSGO", "criar");

  // Sem lista (ex.: SAF-T): mostra logo o formulário de criar.
  if (!ops.listar) {
    const opcoes = await opcoesParaEsquema(ops.criar?.corpo ?? null);
    const pedidosSaft = slug === "saft" ? await listarPedidosSaft().catch(() => []) : [];
    return (
      <div>
        <Link href="/zsgo" className="text-sm font-semibold text-accent hover:underline">
          ← ZSGO
        </Link>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">{recurso.nome}</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">{recurso.descricao}</p>
        {podeCriar && ops.criar?.corpo ? (
          <div className="mt-8 rounded-card border border-border bg-surface p-6">
            <NovoSemLista
              slug={slug}
              esquema={ops.criar.corpo}
              opcoes={opcoes}
              nomeChave={recurso.parametro ?? "id"}
              // SAF-T: por omissão o ano anterior completo, com a morada da empresa.
              inicial={slug === "saft" ? { export_type: "annual", year: String(new Date().getFullYear() - 1), use_company_address: true } : undefined}
            />
          </div>
        ) : (
          <Notice className="mt-6">O seu perfil não pode criar nesta área.</Notice>
        )}
        {slug === "saft" && (
          <section className="mt-10">
            <AtualizarSozinho ativo={pedidosSaft.some((p) => saftEmCurso(p.estado))} segundos={10} />
            <h2 className="text-2xl font-bold tracking-tight">Pedidos de SAF-T</h2>
            {pedidosSaft.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Ainda não foi pedido nenhum SAF-T nesta página.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4">Pedido em</th>
                      <th className="py-2 pr-4">Período</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2 pr-4">Pedido por</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosSaft.map((p) => {
                      const aGerar = saftEmCurso(p.estado);
                      const falhou = ["failed", "error", "expired"].includes(p.estado.toLowerCase());
                      return (
                        <tr key={p.process_id} className="border-b border-border">
                          <td className="whitespace-nowrap py-2 pr-4">{p.criado_em.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="py-2 pr-4">{p.periodo ?? p.export_type ?? "—"}</td>
                          <td className={cn("py-2 pr-4 font-semibold", !aGerar && !falhou && "text-success", falhou && "text-destructive")} title={p.erro ?? undefined}>
                            {aGerar && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />}
                            {nomeEstadoSaft(p.estado)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{p.pedido_por ?? "—"}</td>
                          <td className="whitespace-nowrap py-2 text-right">
                            {!aGerar && !falhou && ops.descarregar && (
                              <a href={`/api/zsgo/ficheiro?recurso=saft&tipo=descarregar&chave=${encodeURIComponent(p.process_id)}`} className="mr-4 font-semibold text-accent hover:underline">
                                Descarregar
                              </a>
                            )}
                            <Link href={`/zsgo/saft/${encodeURIComponent(p.process_id)}`} className="text-accent hover:underline">
                              Ver
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {recurso.parametro && (
          <form method="get" action={`/zsgo/${slug}/consultar`} className="mt-8 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="chave" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Consultar um pedido anterior ({recurso.parametro})
              </label>
              <input id="chave" name="chave" required className="h-10 w-80 rounded-lg border border-border bg-surface px-3 text-sm" />
            </div>
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm", className: "h-10" })}>
              Ver estado
            </button>
          </form>
        )}
      </div>
    );
  }

  // Filtros = parâmetros da lista na especificação (menos a paginação).
  const filtros = ops.listar.parametros.filter((p) => p.em === "query" && !["page", "per_page"].includes(p.nome));
  const query: Record<string, string> = {};
  for (const f of filtros) if (filtrosUrl[f.nome]) query[f.nome] = filtrosUrl[f.nome]!;
  const paginado = ops.listar.parametros.some((p) => p.nome === "page");
  if (paginado) {
    query.page = String(pagina);
    query.per_page = String(POR_PAGINA);
  }
  const opcoesFiltros = await opcoesParaParametros(filtros.map((f) => f.nome));

  let erro: string | null = null;
  let itens: unknown[] = [];
  let totalPaginas = 1;
  let total: number | null = null;
  try {
    const lista = await listar(recurso.caminho, query);
    itens = lista.itens;
    totalPaginas = lista.totalPaginas;
    total = lista.total;
  } catch (e) {
    erro = descreverErro(e);
  }
  const colunasDefinidas = recurso.colunas ?? [];
  const usaveis = colunasDefinidas.filter((c) => itens.some((i) => primeiroValor(i, c.caminhos) !== undefined));
  const colunas: Coluna[] = usaveis.length >= 2 ? usaveis : colunasAutomaticas(itens);
  const comDetalhe = !!ops.ver;

  return (
    <div>
      <Link href="/zsgo" className="text-sm font-semibold text-accent hover:underline">
        ← ZSGO
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight">{recurso.nome}</h1>
        <div className="flex flex-wrap gap-2">
          {ops.pendentes && (
            <Link href={`/zsgo/${slug}/pendentes`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Documentos por liquidar
            </Link>
          )}
          {podeCriar && (
            <Link href={`/zsgo/${slug}/novo`} className={buttonVariants({ size: "sm" })}>
              Criar {recurso.singular}
            </Link>
          )}
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        {recurso.descricao}
        {total !== null ? ` ${total} no total.` : ""}
      </p>
      {recurso.pro && <p className="mt-1 text-sm text-muted-foreground">Exige a versão PRO do ZSGO.</p>}

      {filtros.length > 0 && (
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          {filtros.map((f) => {
            const enumeracao = f.esquema.enum?.filter((x) => x !== null);
            const tipo = tipoDe(f.esquema);
            const classe = "h-10 rounded-lg border border-border bg-surface px-3 text-sm";
            return (
              <div key={f.nome}>
                <label htmlFor={`f-${f.nome}`} className="mb-1 block text-xs font-semibold text-muted-foreground" title={f.descricao}>
                  {rotulo(f.nome)}
                </label>
                {enumeracao?.length || tipo === "boolean" ? (
                  <select id={`f-${f.nome}`} name={f.nome} defaultValue={filtrosUrl[f.nome] ?? ""} className={classe}>
                    <option value="">Todos</option>
                    {(enumeracao?.length ? enumeracao.map(String) : ["true", "false"]).map((o) => (
                      <option key={o} value={o}>
                        {o === "true" ? "Sim" : o === "false" ? "Não" : o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      id={`f-${f.nome}`}
                      name={f.nome}
                      type={/date/.test(f.nome) ? "date" : "text"}
                      defaultValue={filtrosUrl[f.nome] ?? ""}
                      list={opcoesFiltros[f.nome]?.length ? `l-${f.nome}` : undefined}
                      className={`${classe} w-56`}
                    />
                    {opcoesFiltros[f.nome]?.length ? (
                      <datalist id={`l-${f.nome}`}>
                        {opcoesFiltros[f.nome]!.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.rotulo}
                          </option>
                        ))}
                      </datalist>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm", className: "h-10" })}>
            Filtrar
          </button>
        </form>
      )}

      {erro ? (
        <p className="mt-6 rounded-lg border border-destructive-40 bg-destructive-10 p-4 text-sm text-destructive">{erro}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {colunas.map((c) => (
                  <th key={c.titulo} className={c.tipo === "euro" ? "py-2 pr-4 text-right" : "py-2 pr-4"}>
                    {/^[a-z_.A-Z]+$/.test(c.titulo) && c.titulo === c.caminhos[0] ? rotulo(c.titulo.split(".").pop()!) : c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item, i) => {
                const chave = chaveDoItem(recurso, item);
                return (
                  <tr key={chave ?? i} className="border-b border-border">
                    {colunas.map((c, j) => {
                      const texto = formatarValor(primeiroValor(item, c.caminhos), c.tipo);
                      return (
                        <td key={c.titulo} className={c.tipo === "euro" ? "py-2 pr-4 text-right tabular-nums" : "py-2 pr-4"}>
                          {j === 0 && comDetalhe && chave ? (
                            <Link href={`/zsgo/${slug}/${encodeURIComponent(chave)}`} className="font-semibold text-accent hover:underline">
                              {texto === "—" ? chave : texto}
                            </Link>
                          ) : (
                            texto
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, colunas.length)} className="py-6 text-center text-muted-foreground">
                    Nada encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {paginado && <Paginacao basePath={`/zsgo/${slug}`} pagina={pagina} totalPaginas={totalPaginas} searchParams={Object.fromEntries(Object.entries(query).filter(([k]) => k !== "page" && k !== "per_page"))} />}
    </div>
  );
}
