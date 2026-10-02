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
import { ArrowRight } from "lucide-react";
import { faturadoCegidPorAno, faturadoCegidPorMes, rubricasCegid, temHistoricoCegid, topClientesCegid } from "@/lib/cegid/historico";
import { contagemDocumentos } from "@/lib/cegid/descarregar";
import { operacoesDe, recursoPorSlug } from "@/lib/zsgo/recursos";

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

/** Atalhos "Criar novo" (como no dashboard do ZSGO) — só os que a API e o perfil permitem. */
const ATALHOS: Array<{ slug: string; nome: string }> = [
  { slug: "documentos-venda", nome: "Documento de venda" },
  { slug: "recibos", nome: "Recibo" },
  { slug: "agendamentos", nome: "Agendamento" },
  { slug: "clientes", nome: "Cliente" },
  { slug: "artigos", nome: "Artigo" },
  { slug: "vendedores", nome: "Vendedor" },
  { slug: "condicoes-pagamento", nome: "Condição de pagamento" },
  { slug: "metodos-pagamento", nome: "Método de pagamento" },
];

function Atalhos() {
  const lista = ATALHOS.filter((a) => {
    const r = recursoPorSlug(a.slug);
    return r && operacoesDe(r).criar;
  });
  if (lista.length === 0) return null;
  return (
    <nav aria-label="Criar novo" className="space-y-2">
      {lista.map((a) => (
        <Link key={a.slug} href={`/zsgo/${a.slug}/novo`} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 transition-colors hover:border-foreground-20">
          <span>
            <span className="block text-sm font-semibold">{a.nome}</span>
            <span className="block text-xs text-muted-foreground">Criar novo</span>
          </span>
          <ArrowRight className="h-4 w-4 text-accent" aria-hidden />
        </Link>
      ))}
    </nav>
  );
}

export default async function PaginaResumo({ searchParams }: { searchParams: Promise<{ mes?: string; fonte?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const { mes: mesParam, fonte: fonteParam } = await searchParams;
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

  // Histórico do Cegid (integração antiga), se as tabelas existirem nesta base de dados.
  const comCegid = await temHistoricoCegid().catch(() => false);
  const vazio = <T,>(): T[] => [];
  const [cegidMes, cegidAno, zsgoAno, cegidTop, cegidRubricas, cegidCopias] = await Promise.all([
    comCegid ? faturadoCegidPorMes(inicio.ano * 12 + inicio.mes, mes.ano * 12 + mes.mes) : vazio<{ ano: number; mes: number; valor: number | null; n: bigint }>(),
    comCegid ? faturadoCegidPorAno() : vazio<{ ano: number; valor: number | null; n: bigint }>(),
    prisma.$queryRaw<Array<{ ano: number; valor: number | null; n: bigint }>>`
      SELECT ano, SUM(valor_total)::float AS valor, COUNT(*) AS n FROM zsgo_invoice_sync WHERE status = 'SINCRONIZADO' GROUP BY ano`,
    comCegid ? topClientesCegid(mes.ano, mes.mes) : vazio<{ user_id: bigint; valor: number; n: bigint }>(),
    comCegid ? rubricasCegid(mes.ano, mes.mes) : vazio<{ rubrica: string; valor: number; transacoes: number }>(),
    comCegid ? contagemDocumentos() : null,
  ]);

  const serie = Array.from({ length: 12 }, (_, i) => {
    const m = somarMeses(inicio, i);
    const z = porMes.find((l) => l.ano === m.ano && l.mes === m.mes);
    const c = cegidMes.find((l) => l.ano === m.ano && l.mes === m.mes);
    const zsgo = z?.valor ?? 0;
    const cegid = c?.valor ?? 0;
    const nZsgo = Number(z?.n ?? 0);
    const nCegid = Number(c?.n ?? 0);
    return { m, zsgo, cegid, valor: zsgo + cegid, nZsgo, nCegid, n: nZsgo + nCegid };
  });
  const detalheOrigem = (zsgo: number, cegid: number, n: number) =>
    `${n} fatura(s)${cegid > 0 ? ` · ZSGO ${euros(zsgo)} · Cegid ${euros(cegid)}` : ""}`;

  // Por ano: todo o histórico (Cegid desde 2019 + ZSGO).
  const anos = [...new Set([...cegidAno.map((a) => a.ano), ...zsgoAno.map((a) => a.ano)])].sort((a, b) => a - b);
  const porAno = anos.map((ano) => {
    const c = cegidAno.find((a) => a.ano === ano);
    const z = zsgoAno.find((a) => a.ano === ano);
    return { ano, zsgo: z?.valor ?? 0, cegid: c?.valor ?? 0, n: Number(z?.n ?? 0) + Number(c?.n ?? 0) };
  });
  const totalCegid = cegidAno.reduce((a, l) => a + (l.valor ?? 0), 0);
  const faturasCegid = cegidAno.reduce((a, l) => a + Number(l.n), 0);

  // Clientes e rubricas do mês: de um software de cada vez (ZSGO ou Cegid), à escolha em cima.
  const fonte: "zsgo" | "cegid" = fonteParam === "cegid" && comCegid ? "cegid" : "zsgo";
  const nomeFonte = fonte === "cegid" ? "Cegid" : "ZSGO";
  const top = (fonte === "cegid" ? cegidTop : topClientes).map((t) => [t.user_id.toString(), { valor: t.valor ?? 0, n: Number(t.n) }] as const);
  const topRubricas = (fonte === "cegid" ? cegidRubricas : rubricas)
    .map((r) => [r.rubrica ?? "—", { valor: r.valor ?? 0, transacoes: r.transacoes ?? 0 }] as const)
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 10);
  const atual = serie[11]!;
  const ant = serie[10]!;
  const contagemClientes = (s: string) => clientes.find((c) => c.status === s)?._count ?? 0;
  const nomes = await nomesUtilizadoresCyclos(top.map(([id]) => BigInt(id)));
  const hrefFonte = (f: string) => `/resumo?mes=${chaveMes(mes)}${f === "zsgo" ? "" : `&fonte=${f}`}`;
  const linkFaturas = (estado?: string) => `/faturacao?mes=${chaveMes(mes)}${estado ? `&estado=${estado}` : ""}`;
  const contagem = (n: number) => new Intl.NumberFormat("pt-PT").format(n);

  return (
    <div className="grid gap-8 xl:grid-cols-[250px_minmax(0,1fr)]">
      {pode(sessao, "ZSGO", "criar") ? <Atalhos /> : <div className="hidden xl:block" />}
      <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
        {comCegid && (
          <nav aria-label="Software de faturação" className="flex gap-1 rounded-full border border-border p-0.5">
            {(["zsgo", "cegid"] as const).map((f) => (
              <Link
                key={f}
                href={hrefFonte(f)}
                aria-current={fonte === f ? "page" : undefined}
                className={cn("rounded-full px-3 py-0.5 text-xs font-semibold uppercase", fonte === f ? "bg-primary-10 text-accent" : "text-muted-foreground hover:text-foreground")}
              >
                {f === "zsgo" ? "ZSGO" : "Cegid"}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Resumo</h1>
        <SeletorMes basePath="/resumo" mes={mes} searchParams={{ fonte: fonte === "cegid" ? "cegid" : undefined }} />
      </div>

      {/* Faturado no mês, separado por software */}
      <div className={cn("mt-8 grid gap-4", comCegid ? "lg:grid-cols-[1.3fr_1.3fr_1fr_1fr]" : "lg:grid-cols-[1.4fr_1fr_1fr_1fr]")}>
        {[
          { nome: "ZSGO", valor: atual.zsgo, anterior: ant.zsgo, n: atual.nZsgo, href: linkFaturas("SINCRONIZADO") },
          ...(comCegid ? [{ nome: "Cegid", valor: atual.cegid, anterior: ant.cegid, n: atual.nCegid, href: `/cegid?mes=${chaveMes(mes)}` }] : []),
        ].map((c) => (
          <Link key={c.nome} href={c.href} className="rounded-card border border-border bg-surface p-6 transition-colors hover:border-foreground-20">
            <p className="text-sm font-semibold text-muted-foreground">
              <span className="text-foreground">{c.nome}</span> · faturado em {nomeMesTitulo(mes).toLowerCase()}
            </p>
            <p className="mt-2 font-heading text-4xl font-bold">{euros(c.valor)}</p>
            <p className="mt-1 text-sm">
              <b className="font-semibold">{contagem(c.n)}</b> <span className="text-muted-foreground">fatura(s) emitida(s)</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.anterior ? (
                <>
                  <span className={cn("font-semibold", c.valor >= c.anterior ? "text-success" : "text-destructive")}>
                    {c.valor >= c.anterior ? "▲" : "▼"} {Math.abs(((c.valor - c.anterior) / c.anterior) * 100).toFixed(0)}%
                  </span>{" "}
                  face a {MESES_CURTOS[ant.m.mes - 1]} ({euros(c.anterior)})
                </>
              ) : (
                "sem faturação no mês anterior"
              )}
            </p>
          </Link>
        ))}
        {!comCegid && <Indicador titulo="Faturas emitidas" valor={atual.n} anterior={ant.n} formato={contagem} href={linkFaturas("SINCRONIZADO")} />}
        <Indicador titulo="Com erro no ZSGO" valor={comErro + incertas} formato={contagem} subirEBom={false} href={linkFaturas("ERRO")} detalhe={incertas ? `${incertas} a verificar no ZSGO` : "por corrigir"} />
        <Indicador titulo="Notas de crédito (ZSGO)" valor={notas._count} anterior={notasAnt._count} formato={contagem} subirEBom={false} href={`/notas-credito?mes=${chaveMes(mes)}`} />
      </div>

      <div className="mt-6">
        <GraficoColunas
          titulo="Faturado por mês"
          subtitulo={`Últimos 12 meses até ${nomeMesTitulo(mes).toLowerCase()} · faturas emitidas${comCegid ? " no ZSGO e no Cegid" : ""}`}
          pontos={serie.map((s) => ({
            rotulo: `${MESES_CURTOS[s.m.mes - 1]}${s.m.mes === 1 || s === serie[0] ? ` ${String(s.m.ano).slice(2)}` : ""}`,
            valor: s.valor,
            detalhe: detalheOrigem(s.zsgo, s.cegid, s.n),
            destaque: s === atual,
          }))}
          formato="euro"
          formatoEixo="euro-compacto"
          rotuloValor="Faturado"
        />
      </div>

      {porAno.length > 1 && (
        <div className={cn("mt-6 grid gap-6", comCegid && "lg:grid-cols-[2fr_1fr]")}>
          <GraficoColunas
            titulo="Faturado por ano"
            subtitulo={comCegid ? "Todo o histórico · Cegid (até à mudança) e ZSGO" : "Todo o histórico no ZSGO"}
            pontos={porAno.map((a) => ({ rotulo: String(a.ano), valor: a.zsgo + a.cegid, detalhe: detalheOrigem(a.zsgo, a.cegid, a.n), destaque: a.ano === mes.ano }))}
            formato="euro"
            formatoEixo="euro-compacto"
            rotuloValor="Faturado"
            largura={comCegid ? 650 : 1100}
          />
          {comCegid && (
            <Link href="/cegid" className="rounded-card border border-border bg-surface p-6 transition-colors hover:border-foreground-20">
              <h3 className="font-heading text-base font-semibold">Histórico Cegid</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {anos.length ? `${cegidAno.length ? Math.min(...cegidAno.map((a) => a.ano)) : "—"} a ${cegidAno.length ? Math.max(...cegidAno.map((a) => a.ano)) : "—"}` : ""} · integração antiga
              </p>
              <p className="mt-4 font-heading text-3xl font-bold">{euros(totalCegid)}</p>
              <p className="text-sm text-muted-foreground">{contagem(faturasCegid)} faturas emitidas no Cegid</p>
              {cegidCopias && (
                <>
                  <div className="mt-5 flex items-baseline justify-between text-sm">
                    <span>PDFs guardados</span>
                    <span className="tabular-nums text-muted-foreground">
                      {contagem(cegidCopias.guardados)} de {contagem(cegidCopias.total)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-muted">
                    <div className="h-2 rounded bg-primary" style={{ width: `${cegidCopias.total ? (cegidCopias.guardados / cegidCopias.total) * 100 : 0}%` }} />
                  </div>
                  {cegidCopias.comErro > 0 && <p className="mt-2 text-sm text-destructive">{contagem(cegidCopias.comErro)} com erro ao descarregar</p>}
                </>
              )}
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GraficoBarras
          titulo={`Clientes com maior faturação · ${nomeFonte}`}
          subtitulo={nomeMesTitulo(mes)}
          pontos={top.map(([id, t]) => ({
            rotulo: `${id} ${nomes.get(id) ?? ""}`.trim(),
            valor: t.valor,
            detalhe: `${t.n} fatura(s)`,
          }))}
          formato="euro"
          rotuloValor="Faturado"
          vazio="Sem faturas emitidas neste mês."
        />
        <GraficoBarras
          titulo={`Faturado por rubrica · ${nomeFonte}`}
          subtitulo={nomeMesTitulo(mes)}
          pontos={topRubricas.map(([rubrica, r]) => ({ rotulo: rubrica, valor: r.valor, detalhe: `${contagem(r.transacoes)} transações` }))}
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
    </div>
  );
}
