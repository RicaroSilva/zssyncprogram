import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { descreverErro } from "@/lib/erros";
import { operacoesDe, primeiroValor, recursoPorSlug } from "@/lib/zsgo/recursos";
import { executar, normalizarItem, obter } from "@/lib/zsgo/servico";
import { VistaObjeto } from "@/components/zsgo/vista-objeto";
import { buttonVariants } from "@/components/button";
import { Notice } from "@/components/notice";
import type { TipoOperacao } from "../../actions";
import { BotoesAcao } from "./botoes";

export const dynamic = "force-dynamic";

export default async function PaginaDetalheZsgo({ params, searchParams }: { params: Promise<{ recurso: string; chave: string }>; searchParams: Promise<{ criado?: string; guardado?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "ZSGO", "consultar")) redirect("/");
  const { recurso: slug, chave: chaveCodificada } = await params;
  const chave = decodeURIComponent(chaveCodificada);
  const recurso = recursoPorSlug(slug);
  if (!recurso?.parametro) notFound();
  const ops = operacoesDe(recurso);
  if (!ops.ver) notFound();
  const sp = await searchParams;
  const parametros = { [recurso.parametro]: chave };

  let dados: unknown = null;
  let erro: string | null = null;
  try {
    dados = await obter(ops.ver.caminho, parametros);
  } catch (e) {
    erro = descreverErro(e);
  }
  // Agendamentos: os próximos documentos que vão ser emitidos.
  let proximos: unknown = null;
  if (ops.proximos && !erro) {
    try {
      const r = await executar("GET", ops.proximos.caminho, parametros);
      if (r.status === 200) proximos = normalizarItem(r.json);
    } catch {
      // opcional
    }
  }

  const titulo = String(primeiroValor(dados, ["document.label", "document.full_number", "label", "number", "document.number", "identity.name", "name", "description", "reference", "code"]) ?? chave);
  const acoes: TipoOperacao[] = [];
  if (ops.ativar && pode(sessao, "ZSGO", "editar")) acoes.push("ativar");
  if (ops.desativar && pode(sessao, "ZSGO", "editar")) acoes.push("desativar");
  if (ops.anular && pode(sessao, "ZSGO", "eliminar")) acoes.push("anular");
  if (ops.eliminar && pode(sessao, "ZSGO", "eliminar")) acoes.push("eliminar");
  const ficheiro = (tipo: string) => `/api/zsgo/ficheiro?recurso=${slug}&tipo=${tipo}&chave=${encodeURIComponent(chave)}`;
  const pdfDireto = primeiroValor(dados, ["pdf_url"]);

  return (
    <div>
      <Link href={`/zsgo/${slug}`} className="text-sm font-semibold text-accent hover:underline">
        ← {recurso.nome}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">{recurso.singular}</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">{titulo}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {ops.pdf && (
              <a href={ficheiro("pdf")} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                PDF
              </a>
            )}
            {!ops.pdf && typeof pdfDireto === "string" && (
              <a href={pdfDireto} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                PDF
              </a>
            )}
            {ops.xml && (
              <a href={ficheiro("xml")} className={buttonVariants({ variant: "outline", size: "sm" })}>
                XML (CIUS-PT)
              </a>
            )}
            {ops.descarregar && (
              <a href={ficheiro("descarregar")} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Descarregar ficheiro
              </a>
            )}
            {ops.editar && pode(sessao, "ZSGO", "editar") && (
              <Link href={`/zsgo/${slug}/${encodeURIComponent(chave)}/editar`} className={buttonVariants({ size: "sm" })}>
                Editar
              </Link>
            )}
          </div>
          {acoes.length > 0 && <BotoesAcao slug={slug} chave={chave} singular={recurso.singular} acoes={acoes} />}
        </div>
      </div>
      {sp.criado && <Notice className="mt-6">Criado no ZSGO.</Notice>}
      {sp.guardado && <Notice className="mt-6">Alterações guardadas no ZSGO.</Notice>}
      {erro ? (
        <p className="mt-6 rounded-lg border border-destructive-40 bg-destructive-10 p-4 text-sm text-destructive">{erro}</p>
      ) : (
        <div className="mt-6 rounded-card border border-border bg-surface p-6">
          <VistaObjeto dados={dados} />
        </div>
      )}
      {proximos !== null && (
        <>
          <h2 className="mt-10 text-2xl font-bold tracking-tight">Próximos documentos</h2>
          <div className="mt-3 rounded-card border border-border bg-surface p-6">
            <VistaObjeto dados={proximos} />
          </div>
        </>
      )}
    </div>
  );
}
