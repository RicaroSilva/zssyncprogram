import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, dataHora, euros, lerMes, nomeMesTitulo, somarMeses } from "@/lib/formatos";
import { SeletorMes } from "@/components/seletor-mes";
import { GraficoBarras, GraficoColunas } from "@/components/graficos";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const REGIAO: Record<string, string> = { CON: "Continente", MA: "Madeira", AC: "Açores" };


/** Indicador: valor, e variação face ao mês anterior (sobe = bom ou mau). */
function Indicador({
  titulo,
  valor,
  anterior,
  formato,
  subirEBom = true,
  href,
  detalhe,
}: {
  titulo: string;
  valor: number;
  anterior?: number;
  formato: (n: number) => string;
  subirEBom?: boolean;
  href?: string;
  detalhe?: string;
}) {
  const delta = anterior !== undefined && anterior !== 0 ? ((valor - anterior) / Math.abs(anterior)) * 100 : null;
  const bom = delta === null ? null : delta === 0 ? null : (delta > 0) === subirEBom;
  const corpo = (
    <div className="h-full rounded-card border border-border bg-surface p-5 transition-colors hover:border-foreground-20">
      <p className="text-sm font-semibold text-muted-foreground">{titulo}</p>
      <p className="mt-2 font-heading text-3xl font-bold">{formato(valor)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {delta !== null ? (
          <span className={cn("font-semibold", bom === true && "text-success", bom === false && "text-destructive")}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta).toFixed(0)}%{" "}
          </span>
        ) : null}
        {delta !== null ? "face ao mês anterior" : (detalhe ?? "")}
      </p>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

export default async function PaginaResumo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const { mes: mesParam } = await searchParams;
  const mes = lerMes(mesParam);
  const anterior = somarMeses(mes, -1);
  const inicio = somarMeses(mes, -11);
  const doMes = { ano: mes.ano, mes: mes.mes };

  const [porMes, comErro, incertas, notas, notasAnt, clientes, topClientes, rubricas, regioes, historico] = await Promise.all([
    // Valor e nº de faturas emitidas nos últimos 12 meses (até ao mês escolhido).
    prisma.$queryRaw<Array<{ ano: number; mes: number; valor: number | null; n: bigint }>>`
      SELECT ano, mes, SUM(valor_total)::float AS valor, COUNT(*) AS n
      FROM zsgo_invoice_sync
      WHERE status = 'SINCRONIZADO' AND (ano * 12 + mes) BETWEEN ${inicio.ano * 12 + inicio.mes} AND ${mes.ano * 12 + mes.mes}
      GROUP BY ano, mes`,
    prisma.faturaSync.count({ where: { ...doMes, status: "ERRO", zsgoIncerto: false } }),
    prisma.faturaSync.count({ where: { ...doMes, zsgoIncerto: true } }),
    prisma.notaCreditoSync.aggregate({ where: { ...doMes, status: "SINCRONIZADO" }, _count: true, _sum: { valorEstorno: true } }),
    prisma.notaCreditoSync.aggregate({ where: { ano: anterior.ano, mes: anterior.mes, status: "SINCRONIZADO" }, _count: true }),
    prisma.clienteSync.groupBy({ by: ["status"], _count: true }),
    prisma.$queryRaw<Array<{ user_id: bigint; valor: number; n: bigint }>>`
      SELECT user_id, SUM(valor_total)::float AS valor, COUNT(*) AS n FROM zsgo_invoice_sync
      WHERE ano = ${mes.ano} AND mes = ${mes.mes} AND status = 'SINCRONIZADO'
      GROUP BY user_id ORDER BY 2 DESC NULLS LAST LIMIT 10`,
    prisma.$queryRaw<Array<{ rubrica: string | null; valor: number; transacoes: number }>>`
      SELECT COALESCE(rubrica, '—') AS rubrica, SUM(valor)::float AS valor, SUM(nr_transacoes)::float AS transacoes
      FROM zsgo_invoice_line_detail WHERE ano = ${mes.ano} AND mes = ${mes.mes}
      GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 10`,
    prisma.$queryRaw<Array<{ regiao: string | null; n: bigint }>>`
      SELECT COALESCE(NULLIF(zsgo_dados->'data'->'address'->>'region_code', ''), 'CON') AS regiao, COUNT(*) AS n
      FROM zsgo_client_sync WHERE status = 'SINCRONIZADO' GROUP BY 1 ORDER BY 2 DESC`,
    prisma.historico.findMany({ orderBy: { criadoEm: "desc" }, take: 6 }),
  ]);

  const serie = Array.from({ length: 12 }, (_, i) => {
    const m = somarMeses(inicio, i);
    const linha = porMes.find((l) => l.ano === m.ano && l.mes === m.mes);
    return { m, valor: linha?.valor ?? 0, n: Number(linha?.n ?? 0) };
  });
  const atual = serie[11]!;
  const ant = serie[10]!;
  const contagemClientes = (s: string) => clientes.find((c) => c.status === s)?._count ?? 0;
  const nomes = await nomesUtilizadoresCyclos(topClientes.map((t) => t.user_id));
  const linkFaturas = (estado?: string) => `/faturacao?mes=${chaveMes(mes)}${estado ? `&estado=${estado}` : ""}`;
  const contagem = (n: number) => new Intl.NumberFormat("pt-PT").format(n);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Resumo</h1>
        <SeletorMes basePath="/resumo" mes={mes} />
      </div>

      {/* Número principal do mês */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Link href={linkFaturas("SINCRONIZADO")} className="rounded-card border border-border bg-surface p-6 transition-colors hover:border-foreground-20">
          <p className="text-sm font-semibold text-muted-foreground">Faturado em {nomeMesTitulo(mes).toLowerCase()}</p>
          <p className="mt-2 font-heading text-5xl font-bold">{euros(atual.valor)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ant.valor ? (
              <span className={cn("font-semibold", atual.valor >= ant.valor ? "text-success" : "text-destructive")}>
                {atual.valor >= ant.valor ? "▲" : "▼"} {Math.abs(((atual.valor - ant.valor) / ant.valor) * 100).toFixed(0)}%{" "}
              </span>
            ) : null}
            {ant.valor ? `face a ${MESES_CURTOS[ant.m.mes - 1]} (${euros(ant.valor)})` : "sem faturação no mês anterior"}
          </p>
        </Link>
        <Indicador titulo="Faturas emitidas" valor={atual.n} anterior={ant.n} formato={contagem} href={linkFaturas("SINCRONIZADO")} />
        <Indicador titulo="Com erro" valor={comErro + incertas} formato={contagem} subirEBom={false} href={linkFaturas("ERRO")} detalhe={incertas ? `${incertas} a verificar no ZSGO` : "por corrigir"} />
        <Indicador titulo="Notas de crédito" valor={notas._count} anterior={notasAnt._count} formato={contagem} subirEBom={false} href={`/notas-credito?mes=${chaveMes(mes)}`} />
      </div>

      <div className="mt-6">
        <GraficoColunas
          titulo="Faturado por mês"
          subtitulo={`Últimos 12 meses até ${nomeMesTitulo(mes).toLowerCase()} · faturas emitidas`}
          pontos={serie.map((s) => ({
            rotulo: `${MESES_CURTOS[s.m.mes - 1]}${s.m.mes === 1 || s === serie[0] ? ` ${String(s.m.ano).slice(2)}` : ""}`,
            valor: s.valor,
            detalhe: `${s.n} fatura(s)`,
            destaque: s === atual,
          }))}
          formato="euro"
          formatoEixo="euro-compacto"
          rotuloValor="Faturado"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GraficoBarras
          titulo="Clientes com maior faturação"
          subtitulo={nomeMesTitulo(mes)}
          pontos={topClientes.map((t) => ({
            rotulo: `${t.user_id} ${nomes.get(t.user_id.toString()) ?? ""}`.trim(),
            valor: t.valor ?? 0,
            detalhe: `${t.n} fatura(s)`,
          }))}
          formato="euro"
          rotuloValor="Faturado"
          vazio="Sem faturas emitidas neste mês."
        />
        <GraficoBarras
          titulo="Faturado por rubrica"
          subtitulo={nomeMesTitulo(mes)}
          pontos={rubricas.map((r) => ({ rotulo: r.rubrica ?? "—", valor: r.valor ?? 0, detalhe: `${contagem(r.transacoes ?? 0)} transações` }))}
          formato="euro"
          rotuloValor="Faturado"
          vazio="Sem rubricas registadas neste mês."
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-card border border-border bg-surface p-6">
          <h3 className="font-heading text-base font-semibold">Clientes no ZSGO</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { estado: "SINCRONIZADO", nome: "Importados", tom: "" },
              { estado: "ERRO", nome: "Com erro", tom: contagemClientes("ERRO") ? "text-destructive" : "" },
              { estado: "PENDENTE", nome: "Pendentes", tom: "" },
            ].map((c) => (
              <Link key={c.estado} href={`/clientes?estado=${c.estado}`} className="rounded-lg border border-border p-4 hover:bg-muted">
                <p className="text-sm text-muted-foreground">{c.nome}</p>
                <p className={cn("mt-1 font-heading text-2xl font-bold", c.tom)}>{contagem(contagemClientes(c.estado))}</p>
              </Link>
            ))}
          </div>
          <h3 className="mt-6 font-heading text-base font-semibold">Atividade recente</h3>
          <ul className="mt-3 divide-y divide-[--border] text-sm">
            {historico.map((h) => (
              <li key={h.id} className="flex gap-3 py-2">
                <span className="w-28 shrink-0 text-muted-foreground">{dataHora(h.criadoEm)}</span>
                <span className="min-w-0">
                  <b className="font-semibold">{h.utilizador ?? "—"}</b> · <span className="text-muted-foreground">{h.detalhe ?? h.acao}</span>
                </span>
              </li>
            ))}
            {historico.length === 0 && <li className="py-2 text-muted-foreground">Sem atividade registada.</li>}
          </ul>
        </div>
        <GraficoBarras
          titulo="Clientes por região fiscal"
          subtitulo="Clientes importados no ZSGO"
          pontos={regioes.map((r) => ({ rotulo: REGIAO[r.regiao ?? ""] ?? r.regiao ?? "—", valor: Number(r.n) }))}
          formato="contagem"
          rotuloValor="Clientes"
        />
      </div>
    </div>
  );
}
