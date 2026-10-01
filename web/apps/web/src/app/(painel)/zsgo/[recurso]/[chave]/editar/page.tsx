import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { descreverErro } from "@/lib/erros";
import { operacoesDe, recursoPorSlug } from "@/lib/zsgo/recursos";
import { obter, opcoesParaEsquema } from "@/lib/zsgo/servico";
import { preencherDeResposta } from "@/lib/zsgo/especificacao";
import { FormularioEditar } from "./formulario-editar";

export const dynamic = "force-dynamic";

export default async function PaginaEditarZsgo({ params }: { params: Promise<{ recurso: string; chave: string }> }) {
  const sessao = await obterSessaoAtual();
  const { recurso: slug, chave: c } = await params;
  const chave = decodeURIComponent(c);
  const recurso = recursoPorSlug(slug);
  if (!recurso?.parametro) notFound();
  if (!pode(sessao, "ZSGO", "editar")) redirect(`/zsgo/${slug}/${c}`);
  const ops = operacoesDe(recurso);
  if (!ops.editar?.corpo || !ops.ver) notFound();
  let inicial: Record<string, unknown> = {};
  let erro: string | null = null;
  try {
    inicial = (preencherDeResposta(ops.editar.corpo, await obter(ops.ver.caminho, { [recurso.parametro]: chave })) as Record<string, unknown>) ?? {};
  } catch (e) {
    erro = descreverErro(e);
  }
  const opcoes = await opcoesParaEsquema(ops.editar.corpo);
  return (
    <div>
      <Link href={`/zsgo/${slug}/${c}`} className="text-sm font-semibold text-accent hover:underline">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">
        Editar {recurso.singular} {chave}
      </h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">Só os campos preenchidos são enviados ao ZSGO.</p>
      {erro && <p className="mt-6 rounded-lg border border-destructive-40 bg-destructive-10 p-4 text-sm text-destructive">Não foi possível ler os dados atuais: {erro}</p>}
      <div className="mt-8 rounded-card border border-border bg-surface p-6">
        <FormularioEditar slug={slug} chave={chave} esquema={ops.editar.corpo} opcoes={opcoes} inicial={inicial} />
      </div>
    </div>
  );
}
