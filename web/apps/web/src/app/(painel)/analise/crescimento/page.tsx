import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, euros, lerMes, nomeMesTitulo } from "@/lib/formatos";
import { alertas, lerMesOpcional, ultimoMesComReceita, type TipoAlerta } from "@/lib/analise/dados";
import { SeletorMes } from "@/components/seletor-mes";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const n = (x: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(x);
const pct = (x: number) => `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

const TIPOS: Array<{ tipo: TipoAlerta; titulo: string; texto: string; tom: string }> = [
  { tipo: "caiu", titulo: "A cair", texto: "Menos de 70% da média dos 3 meses anteriores", tom: "text-destructive" },
  { tipo: "parou", titulo: "Pararam", texto: "Não faturaram este mês, mas faturavam antes", tom: "text-destructive" },
  { tipo: "cresceu", titulo: "A crescer", texto: "Mais de 130% da média dos 3 meses anteriores", tom: "text-success" },
  { tipo: "novo", titulo: "Novos", texto: "Primeira faturação nos últimos 12 meses", tom: "text-success" },
];

export default async function PaginaCrescimento({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string; q?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const sp = await searchParams;
  const mes = lerMesOpcional(sp.mes) ?? (await ultimoMesComReceita()) ?? lerMes(undefined);
  const tipo = TIPOS.find((t) => t.tipo === sp.tipo)?.tipo;
  const lista = await alertas(mes);
  const nomes = await nomesUtilizadoresCyclos(lista.map((a) => BigInt(a.user_id)));
  const q = sp.q?.trim().toLowerCase();
  const visiveis = lista
    .filter((a) => !tipo || a.tipo === tipo)
    .filter((a) => !q || a.user_id.includes(q) || (nomes.get(a.user_id) ?? "").toLowerCase().includes(q));
  const href = (t?: TipoAlerta) => {
    const p = new URLSearchParams({ mes: chaveMes(mes) });
    if (t) p.set("tipo", t);
    return `/analise/crescimento?${p.toString()}`;
  };
  const somaDif = (t: TipoAlerta) => lista.filter((a) => a.tipo === t).reduce((s, a) => s + (a.valor - a.media), 0);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Análise</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Crescimento e queda</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Clientes cuja faturação de {nomeMesTitulo(mes).toLowerCase()} mudou muito face à média dos 3 meses anteriores (só contam clientes com média de pelo menos 5 €).
      </p>
      <div className="mt-6 flex justify-end">
        <SeletorMes basePath="/analise/crescimento" mes={mes} searchParams={{ tipo }} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIPOS.map((t) => {
          const qt = lista.filter((a) => a.tipo === t.tipo).length;
          const dif = somaDif(t.tipo);
          return (
            <Link
              key={t.tipo}
              href={href(tipo === t.tipo ? undefined : t.tipo)}
              aria-current={tipo === t.tipo ? "page" : undefined}
              className={cn("rounded-card border bg-surface p-5 hover:bg-muted", tipo === t.tipo ? "border-primary ring-1 ring-primary" : "border-border")}
            >
              <p className={cn("text-sm font-semibold", t.tom)}>{t.titulo}</p>
              <p className="mt-2 font-heading text-3xl font-bold">{n(qt)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.tipo === "novo" ? `${euros(dif)} de receita nova` : `${dif >= 0 ? "+" : "−"}${euros(Math.abs(dif))} face à média`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t.texto}</p>
            </Link>
          );
        })}
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {tipo ? TIPOS.find((t) => t.tipo === tipo)!.titulo : "Todos os clientes"} <span className="text-muted-foreground">({n(visiveis.length)})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {tipo && (
              <Link href={href()} className="text-sm font-semibold text-accent hover:underline">
                Ver todos
              </Link>
            )}
            <form method="get" action="/analise/crescimento" className="flex items-center gap-2">
              <input type="hidden" name="mes" value={chaveMes(mes)} />
              {tipo && <input type="hidden" name="tipo" value={tipo} />}
              <input
                name="q"
                defaultValue={sp.q}
                placeholder="Id ou nome do cliente…"
                className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
              />
            </form>
            <a href={`/api/analise/csv?tipo=alertas&mes=${chaveMes(mes)}`} className="text-sm font-semibold text-accent hover:underline">
              Exportar (Excel)
            </a>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Situação</th>
                <th className="py-2 pr-4 text-right">Média 3 meses</th>
                <th className="py-2 pr-4 text-right">{nomeMesTitulo(mes)}</th>
                <th className="py-2 pr-4 text-right">Diferença</th>
                <th className="py-2 text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((a) => {
                const t = TIPOS.find((x) => x.tipo === a.tipo)!;
                const dif = a.valor - a.media;
                return (
                  <tr key={a.user_id} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <Link href={`/analise/cliente/${a.user_id}?mes=${chaveMes(mes)}`} className="font-semibold text-accent hover:underline">
                        {a.user_id}
                      </Link>{" "}
                      <span className="text-muted-foreground">{nomes.get(a.user_id)}</span>
                    </td>
                    <td className={cn("whitespace-nowrap py-2 pr-4 font-semibold", t.tom)}>
                      {a.tipo === "caiu" || a.tipo === "parou" ? "▼" : "▲"} {t.titulo}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-muted-foreground">{a.tipo === "novo" ? "—" : euros(a.media)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-right font-semibold tabular-nums">{euros(a.valor)}</td>
                    <td className={cn("whitespace-nowrap py-2 pr-4 text-right tabular-nums", dif >= 0 ? "text-success" : "text-destructive")}>
                      {dif >= 0 ? "+" : "−"}
                      {euros(Math.abs(dif))}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">{a.media > 0 ? `${dif >= 0 ? "+" : "−"}${pct(Math.abs(dif) / a.media)}` : "—"}</td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nenhum cliente nesta situação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
