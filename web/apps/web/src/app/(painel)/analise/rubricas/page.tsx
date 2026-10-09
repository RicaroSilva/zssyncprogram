import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { chaveMes, euros, lerMes, somarMeses } from "@/lib/formatos";
import { intervalo, lerMesOpcional, rubricas, rubricasPorMes, ultimoMesComReceita } from "@/lib/analise/dados";
import { corDaPosicao } from "@/lib/cores-series";
import { GraficoAnel, GraficoBarras, GraficoEmpilhado } from "@/components/graficos";
import { FiltrosAnalise, lerPeriodo } from "../filtros";

export const dynamic = "force-dynamic";

const n = (x: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(x);
const pct = (x: number) => `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

export default async function PaginaAnaliseRubricas({ searchParams }: { searchParams: Promise<{ periodo?: string; mes?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const sp = await searchParams;
  const periodo = lerPeriodo(sp.periodo);
  const mes = lerMesOpcional(sp.mes) ?? (await ultimoMesComReceita()) ?? lerMes(undefined);
  const iv = intervalo(periodo, mes);
  // Evolução: os meses do período, no mínimo 12 e no máximo 24.
  const am = (m: { ano: number; mes: number }) => m.ano * 12 + m.mes;
  const deEvolucao = am(mes) - am(iv.de) < 11 ? somarMeses(mes, -11) : am(mes) - am(iv.de) > 23 ? somarMeses(mes, -23) : iv.de;
  const [lista, evolucao] = await Promise.all([rubricas(iv), rubricasPorMes(deEvolucao, mes)]);
  const total = lista.reduce((s, r) => s + r.valor, 0);
  const transacoes = lista.reduce((s, r) => s + r.transacoes, 0);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Análise</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Rubricas</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Receita, transações e comissão média por rubrica (ZSGO e Cegid; valores com impostos). {iv.nome}.
      </p>
      <div className="mt-6">
        <FiltrosAnalise basePath="/analise/rubricas" periodo={periodo} mes={mes} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Receita nas rubricas</p>
          <p className="mt-2 font-heading text-3xl font-bold">{euros(total)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Transações</p>
          <p className="mt-2 font-heading text-3xl font-bold">{n(transacoes)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-muted-foreground">Comissão média por transação</p>
          <p className="mt-2 font-heading text-3xl font-bold">{transacoes ? euros(total / transacoes) : "—"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <GraficoAnel
            titulo="De onde vem a receita"
            subtitulo={`Peso de cada rubrica · ${iv.nome}`}
            fatias={lista.map((r) => ({ rotulo: r.rubrica, valor: r.valor, detalhe: `${n(r.transacoes)} transações · ${n(r.clientes)} clientes` }))}
            formato="euro"
            rotuloTotal="Receita"
            rotuloValor="Receita"
            vazio="Sem receita neste período."
          />
        </div>
        <div className="lg:col-span-3">
          <GraficoBarras
            titulo="Receita por rubrica"
            subtitulo={iv.nome}
            pontos={lista.slice(0, 10).map((r, i) => ({ rotulo: r.rubrica, valor: r.valor, cor: corDaPosicao(i), detalhe: `${n(r.transacoes)} transações · ${n(r.clientes)} clientes` }))}
            formato="euro"
            rotuloValor="Receita"
            vazio="Sem receita neste período."
          />
        </div>
      </div>

      <div className="mt-6">
        <GraficoEmpilhado
          titulo="Rubricas mês a mês"
          subtitulo="Quanto cada rubrica faturou em cada mês — escolha “% do mês” para ver o peso"
          series={evolucao.rubricas.map((r) => r.rubrica)}
          colunas={evolucao.meses.map((m, i) => ({
            rotulo: m.mes.mes === 1 || i === 0 ? m.rotulo.replace(/ (\d\d)(\d\d)$/, " $2") : m.rotulo.slice(0, 3),
            valores: m.valores,
          }))}
          formato="euro"
          formatoEixo="euro-compacto"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <a href={`/api/analise/csv?tipo=rubricas&periodo=${periodo}&mes=${chaveMes(mes)}`} className="text-sm font-semibold text-accent hover:underline">
          Exportar (Excel)
        </a>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Rubrica</th>
              <th className="py-2 pr-4 text-right">Receita</th>
              <th className="py-2 pr-4 text-right">Peso</th>
              <th className="py-2 pr-4 text-right">Transações</th>
              <th className="py-2 pr-4 text-right">Por transação</th>
              <th className="py-2 text-right">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.rubrica} className="border-b border-border">
                <td className="py-2 pr-4">{r.rubrica}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold tabular-nums">{euros(r.valor)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(total ? r.valor / total : 0)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{n(r.transacoes)}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-muted-foreground">{r.transacoes ? euros(r.valor / r.transacoes) : "—"}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{n(r.clientes)}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Sem receita neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
