import Link from "next/link";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { configExiste } from "@/lib/config";
import { GRUPOS_ZSGO, RECURSOS_ZSGO, operacoesDe } from "@/lib/zsgo/recursos";
import { VERSAO_API } from "@/lib/zsgo/especificacao";
import { Notice } from "@/components/notice";

export const dynamic = "force-dynamic";

/** O que cada área permite, em palavras (vem da especificação). */
function capacidades(ops: ReturnType<typeof operacoesDe>): string {
  const c: string[] = [];
  if (ops.listar) c.push("consultar");
  if (ops.criar) c.push("criar");
  if (ops.editar) c.push("editar");
  if (ops.eliminar) c.push("eliminar");
  if (ops.anular) c.push("anular");
  if (ops.pdf) c.push("PDF");
  if (ops.xml) c.push("XML");
  if (ops.ativar) c.push("ativar/desativar");
  if (ops.descarregar) c.push("descarregar");
  return c.join(" · ");
}

export default async function PaginaZsgo() {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "ZSGO", "consultar")) redirect("/");
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">ZSGO</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Gestão direta no ZSGO</h1>
      <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
        Tudo o que a API do ZSGO (versão {VERSAO_API}) permite, sem sair desta página: consultar, criar, editar, anular e descarregar. Cada operação é
        feita diretamente no ZSGO e fica registada no Histórico.
      </p>
      {!configExiste() && (
        <Notice className="mt-6">
          <span className="text-destructive">Falta o config.properties (zsgo.baseUrl e zsgo.token) — sem ele não é possível falar com o ZSGO.</span>
        </Notice>
      )}
      {GRUPOS_ZSGO.map((grupo) => (
        <section key={grupo} className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight">{grupo}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS_ZSGO.filter((r) => r.grupo === grupo).map((r) => (
              <Link key={r.slug} href={`/zsgo/${r.slug}`} className="rounded-card border border-border bg-surface p-5 transition-colors hover:border-foreground-20">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-heading text-lg font-semibold">{r.nome}</h3>
                  {r.pro && <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">PRO</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.descricao}</p>
                <p className="mt-3 text-xs font-semibold text-accent">{capacidades(operacoesDe(r))}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
