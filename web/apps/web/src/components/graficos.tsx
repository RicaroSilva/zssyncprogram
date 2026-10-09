"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { COR_OUTRAS, CORES_SERIES } from "@/lib/cores-series";

/**
 * Gráficos simples em SVG, no estilo da aplicação (uma série, cor primária):
 * colunas/barras finas (≤ 24px), topo arredondado de 4px e base reta,
 * grelha em linha fina, caixa com o valor ao passar o rato ou com o
 * teclado, e "Ver tabela" com os mesmos números (nada fica só no gráfico).
 */

export interface Ponto {
  rotulo: string;
  valor: number;
  /** Texto extra na caixa (ex.: "12 faturas"). */
  detalhe?: string;
  /** Destacar (ex.: o mês selecionado). */
  destaque?: boolean;
  /** Cor própria (ex.: a cor da rubrica no gráfico de anel); por omissão a cor primária. */
  cor?: string;
}

/** Formatos dos valores (por nome: as funções não passam do servidor para o browser). */
export type Formato = "euro" | "euro-compacto" | "contagem";

function formatador(f: Formato): (n: number) => string {
  if (f === "euro") return (n) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  if (f === "euro-compacto")
    return (n) => (Math.abs(n) >= 1000 ? `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(n / 1000)} mil €` : `${Math.round(n)} €`);
  return (n) => new Intl.NumberFormat("pt-PT").format(n);
}

function arredondarEscala(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  const passo = [1, 2, 2.5, 5, 10].find((m) => (m * potencia * 4) >= max) ?? 10;
  return passo * potencia * 4;
}

function VistaTabela({ pontos, formatar, rotuloValor }: { pontos: Ponto[]; formatar: (n: number) => string; rotuloValor: string }) {
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-1 pr-4"> </th>
          <th className="py-1 pr-4 text-right">{rotuloValor}</th>
          <th className="py-1" />
        </tr>
      </thead>
      <tbody>
        {pontos.map((p) => (
          <tr key={p.rotulo} className="border-b border-border">
            <td className="py-1 pr-4">{p.rotulo}</td>
            <td className="py-1 pr-4 text-right tabular-nums">{formatar(p.valor)}</td>
            <td className="py-1 text-muted-foreground">{p.detalhe}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Moldura({
  titulo,
  subtitulo,
  children,
  tabela,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  tabela: React.ReactNode;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        <button type="button" onClick={() => setVerTabela((v) => !v)} className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent hover:underline">
          {verTabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {verTabela ? tabela : children}
    </div>
  );
}

/** Colunas verticais (ex.: valor faturado por mês). */
export function GraficoColunas({
  titulo,
  subtitulo,
  pontos,
  formato,
  formatoEixo = formato,
  rotuloValor = "Valor",
  largura = 1100,
}: {
  titulo: string;
  subtitulo?: string;
  pontos: Ponto[];
  formato: Formato;
  formatoEixo?: Formato;
  rotuloValor?: string;
  /** Largura do desenho: próxima da largura real no ecrã, para o texto não ficar minúsculo. */
  largura?: number;
}) {
  const formatar = formatador(formato);
  const formatarEixo = formatador(formatoEixo);
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  // viewBox próximo da largura real, para o texto não crescer com o ecrã.
  const altura = largura < 800 ? 300 : 260;
  const margem = { cima: 12, baixo: 30, esquerda: 64, direita: 8 };
  const max = arredondarEscala(Math.max(0, ...pontos.map((p) => p.valor)));
  const banda = (largura - margem.esquerda - margem.direita) / Math.max(1, pontos.length);
  const larguraBarra = Math.min(24, banda * 0.6);
  const y = (v: number) => margem.cima + (altura - margem.cima - margem.baixo) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const p = ativo !== null ? pontos[ativo] : null;

  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} tabela={<VistaTabela pontos={pontos} formatar={formatar} rotuloValor={rotuloValor} />}>
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{titulo}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margem.esquerda} x2={largura - margem.direita} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={margem.esquerda - 8} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--muted-foreground)">
                {formatarEixo(t)}
              </text>
            </g>
          ))}
          {pontos.map((ponto, i) => {
            const cx = margem.esquerda + banda * i + banda / 2;
            const topo = y(ponto.valor);
            const base = y(0);
            const h = Math.max(0, base - topo);
            const r = Math.min(4, h, larguraBarra / 2);
            const x0 = cx - larguraBarra / 2;
            const caminho =
              h <= 0
                ? ""
                : `M${x0},${base} V${topo + r} Q${x0},${topo} ${x0 + r},${topo} H${x0 + larguraBarra - r} Q${x0 + larguraBarra},${topo} ${x0 + larguraBarra},${topo + r} V${base} Z`;
            return (
              <g
                key={ponto.rotulo}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${ponto.rotulo}: ${formatar(ponto.valor)}${ponto.detalhe ? `, ${ponto.detalhe}` : ""}`}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                className="cursor-default outline-none"
              >
                {/* área de toque maior que a barra */}
                <rect x={cx - banda / 2} y={margem.cima} width={banda} height={altura - margem.cima - margem.baixo} fill="transparent" />
                {ativo === i && <rect x={cx - banda / 2 + 2} y={margem.cima} width={banda - 4} height={altura - margem.cima - margem.baixo} fill="var(--muted)" opacity={0.6} rx={4} />}
                {caminho && <path d={caminho} fill="var(--primary)" opacity={ponto.destaque || ativo === i || ativo === null ? 1 : 0.55} />}
                <text x={cx} y={altura - 10} textAnchor="middle" fontSize={13} fill={ponto.destaque ? "var(--foreground)" : "var(--muted-foreground)"} fontWeight={ponto.destaque ? 600 : 400}>
                  {ponto.rotulo}
                </text>
              </g>
            );
          })}
        </svg>
        {p && ativo !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg"
            style={{ left: `${((margem.esquerda + banda * ativo + banda / 2) / largura) * 100}%`, top: `${(y(p.valor) / altura) * 100}%` }}
          >
            <p className="font-semibold tabular-nums">{formatar(p.valor)}</p>
            <p className="text-xs text-muted-foreground">
              {p.rotulo}
              {p.detalhe ? ` · ${p.detalhe}` : ""}
            </p>
          </div>
        )}
      </div>
    </Moldura>
  );
}

/** Barras horizontais (ex.: top clientes, rubricas). */
export function GraficoBarras({
  titulo,
  subtitulo,
  pontos,
  formato,
  rotuloValor = "Valor",
  vazio = "Sem dados.",
}: {
  titulo: string;
  subtitulo?: string;
  pontos: Ponto[];
  formato: Formato;
  rotuloValor?: string;
  vazio?: string;
}) {
  const formatar = formatador(formato);
  const max = Math.max(0, ...pontos.map((p) => p.valor)) || 1;
  const [ativo, setAtivo] = useState<number | null>(null);
  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} tabela={<VistaTabela pontos={pontos} formatar={formatar} rotuloValor={rotuloValor} />}>
      {pontos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {pontos.map((p, i) => (
            <li
              key={p.rotulo}
              tabIndex={0}
              onPointerEnter={() => setAtivo(i)}
              onPointerLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              title={`${p.rotulo}: ${formatar(p.valor)}${p.detalhe ? ` · ${p.detalhe}` : ""}`}
              className={cn("rounded-md px-1 py-0.5 outline-none", ativo === i && "bg-muted")}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{p.rotulo}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatar(p.valor)}
                  {ativo === i && p.detalhe ? ` · ${p.detalhe}` : ""}
                </span>
              </div>
              <div className="mt-1 h-2 w-full">
                <div className="h-2 rounded-r bg-primary" style={{ background: p.cor, width: `${Math.max(1, (p.valor / max) * 100)}%`, opacity: ativo === null || ativo === i ? 1 : 0.55 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Moldura>
  );
}

/* ── Gráficos de várias séries (partes de um todo) ─────────────────────────── */

/** Cores das séries por ordem fixa (a cor segue a série, nunca a posição num filtro). */
export const NOME_OUTRAS = "Outras";

/** As `max` maiores séries ficam com nome e cor; as restantes juntam-se em "Outras". */
function dobrarSeries(nomes: string[], max = 5): { series: string[]; serieDe: (nome: string) => string; cor: (serie: string) => string } {
  const principais = nomes.slice(0, max);
  const temOutras = nomes.length > principais.length;
  const series = temOutras ? [...principais, NOME_OUTRAS] : principais;
  const conjunto = new Set(principais);
  return {
    series,
    serieDe: (nome) => (conjunto.has(nome) ? nome : NOME_OUTRAS),
    cor: (serie) => (serie === NOME_OUTRAS ? COR_OUTRAS : CORES_SERIES[principais.indexOf(serie)] ?? COR_OUTRAS),
  };
}

const percentagem = (x: number) => `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

function Amostra({ cor }: { cor: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} />;
}

export interface Fatia {
  rotulo: string;
  valor: number;
  detalhe?: string;
}

/**
 * Anel (donut) para o peso de cada parte no total — só para "de onde vem" à
 * primeira vista: no máximo 5 partes + "Outras". O centro mostra o total, ou a
 * parte por cima da qual está o rato. Legenda com % e valor ao lado.
 */
export function GraficoAnel({
  titulo,
  subtitulo,
  fatias,
  formato,
  rotuloTotal = "Total",
  rotuloValor = "Valor",
  maxFatias = 5,
  ordenar = true,
  vazio = "Sem dados.",
}: {
  titulo: string;
  subtitulo?: string;
  fatias: Fatia[];
  formato: Formato;
  rotuloTotal?: string;
  rotuloValor?: string;
  maxFatias?: number;
  /** false: manter a ordem dada (ex.: grupos por posição no ranking). */
  ordenar?: boolean;
  vazio?: string;
}) {
  const formatar = formatador(formato);
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  const positivas = fatias.filter((f) => f.valor > 0);
  const ordenadas = ordenar ? positivas.sort((a, b) => b.valor - a.valor) : positivas;
  const { series, serieDe, cor } = dobrarSeries(ordenadas.map((f) => f.rotulo), maxFatias);
  const partes = series.map((s) => {
    const membros = ordenadas.filter((f) => serieDe(f.rotulo) === s);
    return {
      rotulo: s,
      valor: membros.reduce((t, f) => t + f.valor, 0),
      detalhe: s === NOME_OUTRAS ? `junta ${membros.length}` : membros[0]?.detalhe,
    };
  });
  const total = partes.reduce((t, p) => t + p.valor, 0);
  const R = 100;
  const r = 66;
  let angulo = -Math.PI / 2;
  const arcos = partes.map((p) => {
    const a0 = angulo;
    const a1 = angulo + (total ? (p.valor / total) * Math.PI * 2 : 0);
    angulo = a1;
    return { ...p, a0, a1 };
  });
  const ponto = (raio: number, a: number) => `${100 + raio * Math.cos(a)},${100 + raio * Math.sin(a)}`;
  const caminho = (a0: number, a1: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return `M${ponto(R, a0)} A${R},${R} 0 ${grande} 1 ${ponto(R, a1)} L${ponto(r, a1)} A${r},${r} 0 ${grande} 0 ${ponto(r, a0)} Z`;
  };
  const sel = ativo !== null ? arcos[ativo] : null;
  const tabela = <VistaTabela pontos={partes.map((p) => ({ ...p, detalhe: `${percentagem(total ? p.valor / total : 0)}${p.detalhe ? ` · ${p.detalhe}` : ""}` }))} formatar={formatar} rotuloValor={rotuloValor} />;

  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} tabela={tabela}>
      {total <= 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5">
          <div className="relative w-52 shrink-0">
            <svg viewBox="0 0 200 200" className="w-full" role="img" aria-labelledby={`${id}-t`}>
              <title id={`${id}-t`}>{titulo}</title>
              {arcos.map((a, i) => (
                <path
                  key={a.rotulo}
                  d={caminho(a.a0, a.a1)}
                  fill={cor(a.rotulo)}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  opacity={ativo === null || ativo === i ? 1 : 0.35}
                  transform={ativo === i ? `translate(${Math.cos((a.a0 + a.a1) / 2) * 4} ${Math.sin((a.a0 + a.a1) / 2) * 4})` : undefined}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${a.rotulo}: ${percentagem(a.valor / total)}, ${formatar(a.valor)}`}
                  onPointerEnter={() => setAtivo(i)}
                  onPointerLeave={() => setAtivo(null)}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo(null)}
                  className="cursor-default outline-none transition-[opacity,transform] duration-150"
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
              {sel ? (
                <>
                  <span className="font-heading text-2xl font-bold tabular-nums">{percentagem(sel.valor / total)}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{sel.rotulo}</span>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{rotuloTotal}</span>
                  <span className="font-heading text-lg font-bold tabular-nums">{formatador(formato === "euro" ? "euro-compacto" : formato)(total)}</span>
                </>
              )}
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-1.5 text-sm">
            {arcos.map((a, i) => (
              <li
                key={a.rotulo}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                className={cn("flex items-center gap-2 rounded-md px-2 py-1", ativo === i && "bg-muted")}
                title={a.detalhe}
              >
                <Amostra cor={cor(a.rotulo)} />
                <span className="min-w-0 flex-1 truncate">{a.rotulo}</span>
                <span className="shrink-0 font-semibold tabular-nums">{percentagem(a.valor / total)}</span>
                <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{formatar(a.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Moldura>
  );
}

export interface ColunaEmpilhada {
  rotulo: string;
  /** Valor de cada série (nome → valor). */
  valores: Record<string, number>;
}

/**
 * Colunas empilhadas por série (ex.: receita de cada rubrica, mês a mês), com
 * escolha entre valores e percentagem do total de cada coluna. 5 séries + "Outras".
 */
export function GraficoEmpilhado({
  titulo,
  subtitulo,
  series: nomes,
  colunas,
  formato,
  formatoEixo = formato,
  largura = 1100,
}: {
  titulo: string;
  subtitulo?: string;
  /** Nomes das séries, as maiores primeiro. */
  series: string[];
  colunas: ColunaEmpilhada[];
  formato: Formato;
  formatoEixo?: Formato;
  largura?: number;
}) {
  const formatar = formatador(formato);
  const formatarEixo = formatador(formatoEixo);
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  const [emPercentagem, setEmPercentagem] = useState(false);
  const { series, serieDe, cor } = dobrarSeries(nomes);
  const dados = colunas.map((c) => {
    const v: Record<string, number> = {};
    for (const [nome, valor] of Object.entries(c.valores)) if (valor > 0) v[serieDe(nome)] = (v[serieDe(nome)] ?? 0) + valor;
    return { rotulo: c.rotulo, v, total: Object.values(v).reduce((t, x) => t + x, 0) };
  });
  const altura = 280;
  const margem = { cima: 12, baixo: 30, esquerda: 64, direita: 8 };
  const max = emPercentagem ? 1 : arredondarEscala(Math.max(0, ...dados.map((d) => d.total)));
  const banda = (largura - margem.esquerda - margem.direita) / Math.max(1, dados.length);
  const larguraBarra = Math.min(28, banda * 0.6);
  const y = (v: number) => margem.cima + (altura - margem.cima - margem.baixo) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const sel = ativo !== null ? dados[ativo] : null;

  const tabela = (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-4"> </th>
            {series.map((s) => (
              <th key={s} className="py-1 pr-4 text-right font-normal">
                {s}
              </th>
            ))}
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => (
            <tr key={d.rotulo} className="border-b border-border">
              <td className="whitespace-nowrap py-1 pr-4">{d.rotulo}</td>
              {series.map((s) => (
                <td key={s} className="whitespace-nowrap py-1 pr-4 text-right tabular-nums">
                  {emPercentagem ? percentagem(d.total ? (d.v[s] ?? 0) / d.total : 0) : formatar(d.v[s] ?? 0)}
                </td>
              ))}
              <td className="whitespace-nowrap py-1 text-right font-semibold tabular-nums">{formatar(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Moldura titulo={titulo} subtitulo={subtitulo} tabela={tabela}>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {series.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <Amostra cor={cor(s)} />
              <span className="max-w-56 truncate" title={s}>
                {s}
              </span>
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Escala" className="flex rounded-full border border-border p-0.5 text-xs font-semibold">
          {[
            [false, "Euros"],
            [true, "% do mês"],
          ].map(([v, nome]) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={emPercentagem === v}
              onClick={() => setEmPercentagem(v as boolean)}
              className={cn("rounded-full px-3 py-1", emPercentagem === v ? "bg-primary-10 text-accent" : "text-muted-foreground hover:text-foreground")}
            >
              {nome as string}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{titulo}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margem.esquerda} x2={largura - margem.direita} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={margem.esquerda - 8} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--muted-foreground)">
                {emPercentagem ? `${Math.round(t * 100)}%` : formatarEixo(t)}
              </text>
            </g>
          ))}
          {dados.map((d, i) => {
            const cx = margem.esquerda + banda * i + banda / 2;
            const x0 = cx - larguraBarra / 2;
            const escala = emPercentagem ? (d.total ? 1 / d.total : 0) : 1;
            let acumulado = 0;
            const presentes = series.filter((s) => (d.v[s] ?? 0) > 0);
            return (
              <g
                key={d.rotulo}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.rotulo}: ${formatar(d.total)}`}
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                className="cursor-default outline-none"
              >
                <rect x={cx - banda / 2} y={margem.cima} width={banda} height={altura - margem.cima - margem.baixo} fill="transparent" />
                {ativo === i && <rect x={cx - banda / 2 + 2} y={margem.cima} width={banda - 4} height={altura - margem.cima - margem.baixo} fill="var(--muted)" opacity={0.6} rx={4} />}
                {presentes.map((s, k) => {
                  const base = y(acumulado * escala);
                  acumulado += d.v[s] ?? 0;
                  const topo = y(acumulado * escala);
                  // 2px de fundo entre segmentos; só o segmento de cima tem os cantos arredondados.
                  const h = Math.max(0, base - topo - (k > 0 ? 2 : 0));
                  const b = k > 0 ? base - 2 : base;
                  if (h <= 0) return null;
                  const r = k === presentes.length - 1 ? Math.min(4, h, larguraBarra / 2) : 0;
                  const caminho = `M${x0},${b} V${topo + r} Q${x0},${topo} ${x0 + r},${topo} H${x0 + larguraBarra - r} Q${x0 + larguraBarra},${topo} ${x0 + larguraBarra},${topo + r} V${b} Z`;
                  return <path key={s} d={caminho} fill={cor(s)} opacity={ativo === null || ativo === i ? 1 : 0.55} />;
                })}
                <text x={cx} y={altura - 10} textAnchor="middle" fontSize={13} fill="var(--muted-foreground)">
                  {d.rotulo}
                </text>
              </g>
            );
          })}
        </svg>
        {sel && ativo !== null && (
          <div
            className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg"
            style={{
              left: `${Math.min(85, Math.max(15, ((margem.esquerda + banda * ativo + banda / 2) / largura) * 100))}%`,
              top: 0,
            }}
          >
            <p className="flex justify-between gap-3 font-semibold">
              <span>{sel.rotulo}</span>
              <span className="tabular-nums">{formatar(sel.total)}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {[...series].reverse().filter((s) => (sel.v[s] ?? 0) > 0).map((s) => (
                <li key={s} className="flex items-center gap-1.5 text-xs">
                  <Amostra cor={cor(s)} />
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                  <span className="tabular-nums text-muted-foreground">{percentagem((sel.v[s] ?? 0) / sel.total)}</span>
                  <span className="w-20 text-right tabular-nums">{formatar(sel.v[s] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Moldura>
  );
}
