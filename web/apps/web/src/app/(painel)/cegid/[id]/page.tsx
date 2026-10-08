import Link from "next/link";
import { urlPublico } from "@/lib/cegid/armazenamento";
import { notFound, redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { dataHora, euros } from "@/lib/formatos";
import { buttonVariants } from "@/components/button";
import { Notice } from "@/components/notice";
import { obterFaturaCegid, temHistoricoCegid } from "@/lib/cegid/historico";

export const dynamic = "force-dynamic";

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5 break-words font-semibold">{children}</dd>
    </div>
  );
}

export default async function PaginaFaturaCegid({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  const { id } = await params;
  if (!/^\d+$/.test(id) || !(await temHistoricoCegid())) notFound();
  const dados = await obterFaturaCegid(Number(id));
  if (!dados) notFound();
  const { fatura: f, linhas, mapeamento } = dados;
  const nomes = await nomesUtilizadoresCyclos(f.related_to_user_id ? [f.user_id, f.related_to_user_id] : [f.user_id]);
  const total = linhas.reduce((a, l) => a + Number(l.total_amount_with_taxes ?? 0), 0);

  return (
    <div>
      <Link href={`/cegid?mes=${f.year}-${String(f.month).padStart(2, "0")}`} className="text-sm font-semibold text-accent hover:underline">
        ← Histórico Cegid
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{f.document_cw_number ?? `Fatura ${f.mpinv_id}`}</h1>
        <div className="flex flex-wrap gap-2">
          {f.copia_estado === "OK" && (
            <a href={urlPublico(f.copia_chave) ?? `/api/cegid/documento/${f.mpinv_id}`} target="_blank" rel="noreferrer" className={buttonVariants({})}>
              Abrir PDF guardado
            </a>
          )}
          {f.document_cw_url && (
            <a href={f.document_cw_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              Abrir no Cegid
            </a>
          )}
        </div>
      </div>
      <p className="mt-3 text-lg text-muted-foreground">
        {f.user_id.toString()} {nomes.get(f.user_id.toString())} · {String(f.month).padStart(2, "0")}/{f.year} · {euros(total)}
      </p>

      {!f.document_cw_completely_generated && <Notice className="mt-6">Esta fatura ficou marcada como <b>não gerada por completo</b> no Cegid.</Notice>}
      {f.copia_estado === "ERRO" && <Notice className="mt-6">Não foi possível guardar a cópia do PDF: {f.copia_erro}</Notice>}

      <dl className="mt-8 grid gap-6 rounded-card border border-border bg-surface p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Campo titulo="Cliente (Cyclos)">
          {f.user_id.toString()} {nomes.get(f.user_id.toString())}
        </Campo>
        <Campo titulo="Cliente no Cegid">{mapeamento?.cw_id ?? "—"}</Campo>
        <Campo titulo="Destinatário">
          {f.related_to_user_id ? `${f.related_to_user_id} ${nomes.get(f.related_to_user_id.toString()) ?? ""}` : "o próprio"}
        </Campo>
        <Campo titulo="Mês faturado">{`${String(f.month).padStart(2, "0")}/${f.year}`}</Campo>
        <Campo titulo="Tipo de documento (Cegid)">{f.document_cw_type_id}</Campo>
        <Campo titulo="Id no Cegid">{f.document_cw_id ?? "—"}</Campo>
        <Campo titulo="Link publicado no Cyclos">{f.invoice_url_published_in_users_records ? "Sim" : "Não"}</Campo>
        <Campo titulo="Cópia do PDF">{f.copia_estado === "OK" ? `Guardada (${Math.round(Number(f.copia_tamanho ?? 0) / 1024)} KB)` : f.copia_estado === "ERRO" ? "Erro" : "Por descarregar"}</Campo>
        {mapeamento && <Campo titulo="Cliente enviado ao Cegid">{`${dataHora(mapeamento.first_migration)}${mapeamento.last_migration ? ` · atualizado ${dataHora(mapeamento.last_migration)}` : ""}`}</Campo>}
        {f.notes && <Campo titulo="Notas">{f.notes}</Campo>}
      </dl>

      <h2 className="mt-10 font-heading text-xl font-semibold">Linhas</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Rubrica</th>
              <th className="py-2 pr-4">Descrição</th>
              <th className="py-2 pr-4">Serviço Cegid</th>
              <th className="py-2 pr-4 text-right">Transações</th>
              <th className="py-2 pr-4 text-right">Valor c/ IVA</th>
              <th className="py-2">Imposto do selo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.line_id} className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-xs">{l.rubric_code}</td>
                <td className="py-2 pr-4">{l.descricao ?? "—"}</td>
                <td className="py-2 pr-4 text-muted-foreground">{l.servico ?? "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.total_transactions ?? "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{euros(l.total_amount_with_taxes)}</td>
                <td className="py-2 text-muted-foreground">{l.stamp_duty_exempt ? "Isento" : l.stamp_duty_line_id ? "Sim" : "—"}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Sem linhas.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="py-2 pr-4 text-right font-semibold">
                Total
              </td>
              <td className="py-2 pr-4 text-right font-semibold tabular-nums">{euros(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
