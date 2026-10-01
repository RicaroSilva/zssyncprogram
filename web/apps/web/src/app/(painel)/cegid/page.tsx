import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, euros, lerMes, nomeMesTitulo } from "@/lib/formatos";
import { SeletorMes } from "@/components/seletor-mes";
import { Paginacao } from "@/components/paginacao";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";
import { listarFaturasCegid, temHistoricoCegid, ultimoMesCegid, type FiltroCopia } from "@/lib/cegid/historico";
import { contagemDocumentos, estadoDownload } from "@/lib/cegid/descarregar";
import { armazenamentoConfigurado } from "@/lib/cegid/armazenamento";
import { configExiste } from "@/lib/config";
import { PainelDownload } from "./painel-download";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

const FILTROS: Array<{ valor: FiltroCopia; rotulo: string }> = [
  { valor: "", rotulo: "Todas" },
  { valor: "OK", rotulo: "Com cópia guardada" },
  { valor: "FALTA", rotulo: "Por descarregar" },
  { valor: "ERRO", rotulo: "Erro ao descarregar" },
  { valor: "INCOMPLETA", rotulo: "Mal geradas no Cegid" },
];

export default async function PaginaCegid({ searchParams }: { searchParams: Promise<{ mes?: string; copia?: string; q?: string; pagina?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  if (!(await temHistoricoCegid())) {
    return (
      <div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Histórico Cegid</h1>
        <Notice className="mt-6">Esta base de dados não tem as tabelas da integração antiga com o Cegid (lp_cloudware_*).</Notice>
      </div>
    );
  }
  const parametros = await searchParams;
  const todos = parametros.mes === "todos";
  const mes = parametros.mes && !todos ? lerMes(parametros.mes) : ((await ultimoMesCegid()) ?? lerMes(undefined));
  const copia = (FILTROS.find((f) => f.valor === parametros.copia)?.valor ?? "") as FiltroCopia;
  const q = parametros.q?.trim() || undefined;
  const pagina = Math.max(1, Number(parametros.pagina) || 1);

  const [{ faturas, total, valor }, contagem] = await Promise.all([
    listarFaturasCegid({ ...(todos ? {} : mes), q, copia, pagina, porPagina: POR_PAGINA }),
    contagemDocumentos(),
  ]);
  const nomes = await nomesUtilizadoresCyclos(faturas.flatMap((f) => (f.related_to_user_id ? [f.user_id, f.related_to_user_id] : [f.user_id])));
  let destino: string | null = null;
  try {
    destino = configExiste() ? (armazenamentoConfigurado()?.descricao ?? null) : null;
  } catch {
    destino = null;
  }
  const chave = todos ? "todos" : chaveMes(mes);
  const hrefFiltro = (v: string) => `/cegid?mes=${chave}${v ? `&copia=${v}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Histórico Cegid</h1>
        <div className="flex flex-wrap items-center gap-3">
          {todos ? <span className="font-heading text-lg font-semibold">Todos os meses</span> : <SeletorMes basePath="/cegid" mes={mes} searchParams={{ copia: copia || undefined, q }} />}
          <Link href={todos ? `/cegid${copia ? `?copia=${copia}` : ""}` : `/cegid?mes=todos${copia ? `&copia=${copia}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="text-sm font-semibold text-accent hover:underline">
            {todos ? "Ver por mês" : "Todos os meses"}
          </Link>
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Faturas emitidas pela integração antiga com o Cegid (só consulta). {new Intl.NumberFormat("pt-PT").format(total)} fatura(s){todos ? "" : ` em ${nomeMesTitulo(mes).toLowerCase()}`}, {euros(valor)}.
      </p>

      <div className="mt-6">
        <PainelDownload inicial={{ estado: estadoDownload(), contagem }} podeIniciar={pode(sessao, "FATURACAO", "criar")} destino={destino} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={hrefFiltro(f.valor)}
              className={cn("rounded-full border px-3 py-1 text-sm font-semibold", copia === f.valor ? "border-primary bg-primary-10 text-accent" : "border-border hover:bg-muted")}
            >
              {f.rotulo}
            </Link>
          ))}
        </div>
        <form method="get" action="/cegid" className="flex items-center gap-2">
          <input type="hidden" name="mes" value={chave} />
          {copia && <input type="hidden" name="copia" value={copia} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Id do cliente ou nº da fatura…"
            className="h-9 w-64 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          />
        </form>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Mês</th>
              <th className="py-2 pr-4">Nº no Cegid</th>
              <th className="py-2 pr-4">Tipo</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4 text-right">Transações</th>
              <th className="py-2 pr-4">Destinatário</th>
              <th className="py-2">Cópia</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((f) => (
              <tr key={f.mpinv_id} className="border-b border-border align-top">
                <td className="py-2 pr-4">
                  <Link href={`/cegid/${f.mpinv_id}`} className="font-semibold text-accent hover:underline">
                    {f.user_id.toString()}
                  </Link>{" "}
                  <span className="text-muted-foreground">{nomes.get(f.user_id.toString())}</span>
                </td>
                <td className="whitespace-nowrap py-2 pr-4">{`${String(f.month).padStart(2, "0")}/${f.year}`}</td>
                <td className="whitespace-nowrap py-2 pr-4">
                  {f.document_cw_number ?? "—"}
                  {!f.document_cw_completely_generated && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">mal gerada</span>}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{f.document_cw_type_id}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{euros(f.total)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{f.transacoes ?? "—"}</td>
                <td className="py-2 pr-4">
                  {f.related_to_user_id ? (
                    <>
                      {f.related_to_user_id.toString()} <span className="text-muted-foreground">{nomes.get(f.related_to_user_id.toString())}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">o próprio</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2">
                  {f.copia_estado === "OK" ? (
                    <a href={`/api/cegid/documento/${f.mpinv_id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
                      PDF guardado
                    </a>
                  ) : f.copia_estado === "ERRO" ? (
                    <span className="text-destructive" title={f.copia_erro ?? ""}>
                      Erro
                    </span>
                  ) : f.document_cw_url ? (
                    <a href={f.document_cw_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      Link do Cegid
                    </a>
                  ) : (
                    <span className="text-muted-foreground">sem link</span>
                  )}
                </td>
              </tr>
            ))}
            {faturas.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Sem faturas para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginacao basePath="/cegid" pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / POR_PAGINA))} searchParams={{ mes: chave, copia: copia || undefined, q }} />
    </div>
  );
}
