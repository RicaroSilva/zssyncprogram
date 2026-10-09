import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, euros, lerMes, nomeMesTitulo, somarMeses } from "@/lib/formatos";
import { alertas, intervalo, lerMesOpcional, rankingClientes, receitaPorClienteMes, ultimoMesComReceita } from "@/lib/analise/dados";
import { GraficoAnel, GraficoColunas } from "@/components/graficos";
import { Paginacao } from "@/components/paginacao";
import { cn } from "@/lib/utils";
import { FiltrosAnalise, lerPeriodo } from "./filtros";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const n = (x: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(x);
const pct = (x: number) => `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold tabular-nums", v > 0.005 ? "text-success" : v < -0.005 ? "text-destructive" : "text-muted-foreground")}>
      {v > 0.005 ? "▲" : v < -0.005 ? "▼" : "="} {pct(Math.abs(v))}
    </span>
  );
}

export default async function PaginaAnaliseClientes({ searchParams }: { searchParams: Promise<{ periodo?: string; mes?: string; q?: string; pagina?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const sp = await searchParams;
  const periodo = lerPeriodo(sp.periodo);
  const mes = lerMesOpcional(sp.mes) ?? (await ultimoMesComReceita()) ?? lerMes(undefined);
  const iv = intervalo(periodo, mes);
  const de12 = somarMeses(mes, -11);
  const [{ linhas, total, totalAnterior }, listaAlertas, porMes] = await Promise.all([rankingClientes(iv), alertas(mes), receitaPorClienteMes(de12, mes)]);
  const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const serieMeses = Array.from({ length: 12 }, (_, i) => {
    const m = somarMeses(de12, i);
    const doMes = porMes.filter((l) => l.ano === m.ano && l.mes === m.mes);
    return {
      rotulo: `${MESES_CURTOS[m.mes - 1]}${m.mes === 1 || i === 0 ? ` ${String(m.ano).slice(2)}` : ""}`,
      valor: doMes.reduce((s, l) => s + l.valor, 0),
      detalhe: `${new Set(doMes.filter((l) => l.valor > 0.004).map((l) => l.user_id)).size} clientes`,
      destaque: i === 11,
    };
  });
  const fatia = (de: number, ate?: number) => linhas.slice(de, ate).reduce((s, l) => s + Math.max(0, l.valor), 0);

  const q = sp.q?.trim();
  const nomesTodos = await nomesUtilizadoresCyclos([...new Set([...linhas.map((l) => l.user_id), ...listaAlertas.map((a) => a.user_id)])].map((x) => BigInt(x)));
  const filtradas = q ? linhas.filter((l) => l.user_id.includes(q) || (nomesTodos.get(l.user_id) ?? "").toLowerCase().includes(q.toLowerCase())) : linhas;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const visiveis = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const ativos = linhas.filter((l) => l.valor > 0.004).length;
  const top10 = linhas.slice(0, 10).reduce((s, l) => s + l.valor, 0);
  const metade = linhas.findIndex((l) => l.pesoAcumulado >= 0.5) + 1;
  const variacaoTotal = iv.anterior && totalAnterior > 0 ? (total - totalAnterior) / totalAnterior : null;
  const csv = (tipo: string) => `/api/analise/csv?tipo=${tipo}&periodo=${periodo}&mes=${chaveMes(mes)}`;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Análise</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Clientes</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Receita por cliente (comissões faturadas no ZSGO e no Cegid, menos notas de crédito; valores com impostos). {iv.nome}.
      </p>
      <div className="mt-6">
        <FiltrosAnalise basePath="/analise" periodo={periodo} mes={mes} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Receita no período</p>
          <p className="mt-2 font-heading text-3xl font-bold">{euros(total)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Variacao v={variacaoTotal} /> {iv.anterior ? `face ao período anterior (${euros(totalAnterior)})` : ""}
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Clientes com receita</p>
          <p className="mt-2 font-heading text-3xl font-bold">{n(ativos)}</p>
          <p className="mt-1 text-sm text-muted-foreground">média {euros(ativos ? total / ativos : 0)} por cliente</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Peso dos 10 maiores</p>
          <p className="mt-2 font-heading text-3xl font-bold">{pct(total ? top10 / total : 0)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{metade > 0 ? `${n(metade)} cliente(s) fazem metade da receita` : ""}</p>
        </div>
        <Link href={`/analise/crescimento?mes=${chaveMes(mes)}`} className="rounded-card border border-border bg-surface p-5 hover:bg-muted">
          <p className="text-sm font-semibold text-muted-foreground">Alertas em {nomeMesTitulo(mes).toLowerCase()}</p>
          <p className="mt-2 font-heading text-3xl font-bold">{n(listaAlertas.filter((a) => a.tipo === "caiu" || a.tipo === "parou").length)}</p>
          <p className="mt-1 text-sm text-muted-foreground">clientes a cair ou que pararam — ver em Crescimento e queda</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <GraficoAnel
            titulo="Quem traz a receita"
            subtitulo={`Peso dos maiores clientes · ${iv.nome}`}
            fatias={[
              { rotulo: "10 maiores clientes", valor: fatia(0, 10) },
              { rotulo: "Do 11.º ao 50.º", valor: fatia(10, 50) },
              { rotulo: "Do 51.º ao 200.º", valor: fatia(50, 200) },
              { rotulo: "Restantes", valor: fatia(200) },
            ]}
            ordenar={false}
            formato="euro"
            rotuloTotal="Receita"
            rotuloValor="Receita"
            vazio="Sem receita neste período."
          />
        </div>
        <div className="lg:col-span-3">
          <GraficoColunas titulo="Receita por mês" subtitulo="Últimos 12 meses (todos os clientes)" pontos={serieMeses} formato="euro" formatoEixo="euro-compacto" rotuloValor="Receita" largura={700} />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Ranking de clientes</h2>
          <div className="flex flex-wrap items-center gap-4">
            <form method="get" action="/analise" className="flex items-center gap-2">
              <input type="hidden" name="periodo" value={periodo} />
              <input type="hidden" name="mes" value={chaveMes(mes)} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Id ou nome do cliente…"
                className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
              />
            </form>
            <a href={csv("clientes")} className="text-sm font-semibold text-accent hover:underline">
              Exportar (Excel)
            </a>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 text-right">#</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4 text-right">Receita</th>
                <th className="py-2 pr-4 text-right">Período anterior</th>
                <th className="py-2 pr-4 text-right">Variação</th>
                <th className="py-2 pr-4 text-right">Peso</th>
                <th className="py-2 pr-4 text-right">Acumulado</th>
                <th className="py-2 pr-4 text-right">Transações</th>
                <th className="py-2 text-right">Por transação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.user_id} className="border-b border-border">
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{linhas.indexOf(l) + 1}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/analise/cliente/${l.user_id}?mes=${chaveMes(mes)}`} className="font-semibold text-accent hover:underline">
                      {l.user_id}
                    </Link>{" "}
                    <span className="text-muted-foreground">{nomesTodos.get(l.user_id)}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold tabular-nums">{euros(l.valor)}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-muted-foreground">{iv.anterior ? euros(l.anterior) : "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right">
                    <Variacao v={l.variacao} />
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{pct(l.peso)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{pct(l.pesoAcumulado)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{l.transacoes ? n(l.transacoes) : "—"}</td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">{l.transacoes ? euros(l.valor / l.transacoes) : "—"}</td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    Sem receita neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginacao basePath="/analise" pagina={pagina} totalPaginas={Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))} searchParams={{ periodo, mes: chaveMes(mes), q }} />
      </section>
    </div>
  );
}
