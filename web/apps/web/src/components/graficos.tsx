"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

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
        <button type="button" onClick={() => setVerTabela((v) => !v)} className="text-xs font-semibold text-accent hover:underline">
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
}: {
  titulo: string;
  subtitulo?: string;
  pontos: Ponto[];
  formato: Formato;
  formatoEixo?: Formato;
  rotuloValor?: string;
}) {
  const formatar = formatador(formato);
  const formatarEixo = formatador(formatoEixo);
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  // viewBox próximo da largura real, para o texto não crescer com o ecrã.
  const largura = 1100;
  const altura = 260;
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
                <div className="h-2 rounded-r bg-primary" style={{ width: `${Math.max(1, (p.valor / max) * 100)}%`, opacity: ativo === null || ativo === i ? 1 : 0.55 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Moldura>
  );
}
