import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, euros, lerMes, somarMeses } from "@/lib/formatos";
import { intervalo, lerMesOpcional, receitaPorClienteMes, rubricas, ultimoMesComReceita } from "@/lib/analise/dados";
import { GraficoColunas } from "@/components/graficos";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const n = (x: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(x);

export default async function PaginaAnaliseCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const sp = await searchParams;
  const mes = lerMesOpcional(sp.mes) ?? (await ultimoMesComReceita()) ?? lerMes(undefined);
  const de = somarMeses(mes, -23);
  const [linhas, tudo, mix12, nomes] = await Promise.all([
    receitaPorClienteMes(de, mes, id),
    receitaPorClienteMes({ ano: 2015, mes: 1 }, mes, id),
    rubricas(intervalo("12m", mes), id),
    nomesUtilizadoresCyclos([BigInt(id)]),
  ]);
  const serie = Array.from({ length: 24 }, (_, i) => {
    const m = somarMeses(de, i);
    const doMes = linhas.filter((l) => l.ano === m.ano && l.mes === m.mes);
    return { m, valor: doMes.reduce((s, l) => s + l.valor, 0), transacoes: doMes.reduce((s, l) => s + l.transacoes, 0) };
  });
  const ult12 = serie.slice(12);
  const ant12 = serie.slice(0, 12);
  const receita12 = ult12.reduce((s, x) => s + x.valor, 0);
  const receitaAnt12 = ant12.reduce((s, x) => s + x.valor, 0);
  const trans12 = ult12.reduce((s, x) => s + x.transacoes, 0);
  const total = tudo.reduce((s, l) => s + l.valor, 0);
  const meses = tudo.filter((l) => l.valor > 0).map((l) => l.ano * 12 + l.mes);
  const primeiro = meses.length ? Math.min(...meses) : null;
  const variacao = receitaAnt12 > 0 ? (receita12 - receitaAnt12) / receitaAnt12 : null;

  return (
    <div>
      <Link href={`/analise?mes=${chaveMes(mes)}`} className="text-sm font-semibold text-accent hover:underline">
        ← Análise de clientes
      </Link>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        {id} <span className="text-muted-foreground">{nomes.get(id)}</span>
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {primeiro ? `Cliente desde ${MESES[(primeiro - 1) % 12]} ${Math.floor((primeiro - 1) / 12)}` : "Sem faturação registada"} · receita total {euros(total)}
      </p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <Link href={`/clientes?q=${id}`} className="font-semibold text-accent hover:underline">
          Cliente no ZSGO
        </Link>
        <Link href={`/cegid?mes=todos&q=${id}`} className="font-semibold text-accent hover:underline">
          Faturas no Cegid
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Receita nos últimos 12 meses</p>
          <p className="mt-2 font-heading text-3xl font-bold">{euros(receita12)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {variacao !== null ? (
              <span className={variacao >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao * 100).toFixed(0)}%{" "}
              </span>
            ) : null}
            face aos 12 meses anteriores
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Média mensal (12 meses)</p>
          <p className="mt-2 font-heading text-3xl font-bold">{euros(receita12 / 12)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Transações (12 meses)</p>
          <p className="mt-2 font-heading text-3xl font-bold">{n(trans12)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Comissão por transação</p>
          <p className="mt-2 font-heading text-3xl font-bold">{trans12 ? euros(receita12 / trans12) : "—"}</p>
        </div>
      </div>

      <div className="mt-6">
        <GraficoColunas
          titulo="Receita por mês"
          subtitulo="Últimos 24 meses (ZSGO e Cegid)"
          pontos={serie.map((s, i) => ({
            rotulo: `${MESES[s.m.mes - 1]}${s.m.mes === 1 || i === 0 ? ` ${String(s.m.ano).slice(2)}` : ""}`,
            valor: s.valor,
            detalhe: `${n(s.transacoes)} transações`,
            destaque: i === 23,
          }))}
          formato="euro"
          formatoEixo="euro-compacto"
          rotuloValor="Receita"
        />
      </div>

      <h2 className="mt-10 text-2xl font-bold tracking-tight">Rubricas nos últimos 12 meses</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Rubrica</th>
              <th className="py-2 pr-4 text-right">Receita</th>
              <th className="py-2 pr-4 text-right">Peso</th>
              <th className="py-2 pr-4 text-right">Transações</th>
              <th className="py-2 text-right">Por transação</th>
            </tr>
          </thead>
          <tbody>
            {mix12.map((r) => (
              <tr key={r.rubrica} className="border-b border-border">
                <td className="py-2 pr-4">{r.rubrica}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold tabular-nums">{euros(r.valor)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{receita12 ? `${((r.valor / mix12.reduce((s, x) => s + x.valor, 0)) * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%` : "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{n(r.transacoes)}</td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">{r.transacoes ? euros(r.valor / r.transacoes) : "—"}</td>
              </tr>
            ))}
            {mix12.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sem rubricas nos últimos 12 meses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
