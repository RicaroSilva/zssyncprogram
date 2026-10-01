import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { operacoesDe, recursoPorSlug } from "@/lib/zsgo/recursos";
import { opcoesParaEsquema } from "@/lib/zsgo/servico";
import { FormularioNovo } from "./formulario-novo";

export const dynamic = "force-dynamic";

/** Valores iniciais úteis por área (o resto vem vazio). */
const INICIAL: Record<string, Record<string, unknown>> = {
  "documentos-venda": { document: { type: "FR", tax_included: true, auto_confirm: true }, items: [{ quantity: 1 }] },
  clientes: { address: { country_code: "PT" }, billing: { price_line: 1 } },
  fornecedores: { address: { country_code: "PT" } },
  recibos: { allocations: [{ document_type: "FA" }] },
};

export default async function PaginaNovoZsgo({ params, searchParams }: { params: Promise<{ recurso: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await obterSessaoAtual();
  const { recurso: slug } = await params;
  const recurso = recursoPorSlug(slug);
  if (!recurso) notFound();
  if (!pode(sessao, "ZSGO", "criar")) redirect(`/zsgo/${slug}`);
  const ops = operacoesDe(recurso);
  if (!ops.criar?.corpo) notFound();
  const opcoes = await opcoesParaEsquema(ops.criar.corpo);
  const sp = await searchParams;
  const inicial = { ...(INICIAL[slug] ?? {}) };
  // Recibo a partir de "Documentos por liquidar": cliente e documento já escolhidos.
  if (slug === "recibos" && sp.cliente) {
    inicial.customer = { code: sp.cliente };
    if (sp.documento) inicial.allocations = [{ document_type: sp.tipo ?? "FA", document_id: sp.documento, amount: sp.valor ? Number(sp.valor) : undefined }];
  }

  return (
    <div>
      <Link href={`/zsgo/${slug}`} className="text-sm font-semibold text-accent hover:underline">
        ← {recurso.nome}
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">Criar {recurso.singular}</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Os campos com <span className="text-destructive">*</span> são obrigatórios; passe o rato no <span className="font-semibold">ⓘ</span> para ver a
        explicação do ZSGO. Os campos com sugestões (país, série, artigo, cliente…) mostram o que existe no ZSGO.
      </p>
      <div className="mt-8 rounded-card border border-border bg-surface p-6">
        <FormularioNovo slug={slug} esquema={ops.criar.corpo} opcoes={opcoes} singular={recurso.singular} comDetalhe={!!ops.ver} inicial={inicial} />
      </div>
    </div>
  );
}
