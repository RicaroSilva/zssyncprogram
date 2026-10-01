import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, dataHora, euros, nomeMes } from "@/lib/formatos";
import { Estado } from "@/components/estado";
import { Notice } from "@/components/notice";
import { configExiste } from "@/lib/config";
import { descreverErro } from "@/lib/erros";
import { lerDocumentoZsgo } from "@/lib/faturacao/conferencia";
import type { DocumentoZsgo } from "@/lib/zsgo/documento";
import { VerificarNoZsgo } from "./verificar-zsgo";

export const dynamic = "force-dynamic";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export default async function PaginaDetalheFatura({ params }: { params: Promise<{ chave: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  const { chave } = await params;
  const m = chave.match(/^(\d+)-(\d+)-(\d{4})-(\d{2})$/);
  if (!m) notFound();
  const [userId, origemId, ano, mes] = [BigInt(m[1]!), BigInt(m[2]!), Number(m[3]), Number(m[4])];

  const fatura = await prisma.faturaSync.findUnique({ where: { userId_origemId_ano_mes: { userId, origemId, ano, mes } } });
  if (!fatura) notFound();
  const linhas = await prisma.faturaLinha.findMany({
    where: { clienteId: userId, ano, mes, OR: [{ origemId }, { origemId: null }] },
    orderBy: { id: "asc" },
  });
  const nomes = await nomesUtilizadoresCyclos([userId, origemId]);
  const cliente = await prisma.clienteSync.findUnique({ where: { userId }, select: { zsgoCode: true } });
  const podeResolver = pode(sessao, "FATURACAO", "editar");

  // O documento tal como está no ZSGO (lido na hora, só leitura).
  let documento: DocumentoZsgo | null = null;
  let erroDocumento: string | null = null;
  if (fatura.zsgoSaleId && configExiste()) {
    try {
      documento = await lerDocumentoZsgo(fatura.zsgoSaleId);
    } catch (e) {
      erroDocumento = descreverErro(e);
    }
  }

  return (
    <div>
      <Link href={`/faturacao?mes=${chaveMes(fatura)}`} className="text-sm font-semibold text-accent hover:underline">
        ← Faturas de {nomeMes(fatura)}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight">
          {userId.toString()} <span className="text-muted-foreground">{nomes.get(userId.toString())}</span>
        </h1>
        <Estado estado={fatura.status} incerto={fatura.zsgoIncerto} />
      </div>

      {fatura.zsgoIncerto && !fatura.zsgoSaleId && (
        <>
          <Notice className="mt-6">
            Da última vez o ZSGO não respondeu ao criar esta fatura, por isso pode já existir lá. A geração seguinte procura-a sozinha (pela referência{" "}
            <code>
              LP-{userId.toString()}-{origemId.toString()}-{ano}
              {String(mes).padStart(2, "0")}
            </code>
            ); se não tiver a certeza, fica para confirmar aqui.
          </Notice>
          {podeResolver && <VerificarNoZsgo chave={chave} codigoCliente={cliente?.zsgoCode?.toString() ?? null} valor={fatura.valorTotal === null ? null : Number(fatura.valorTotal)} />}
        </>
      )}

      <dl className="bento-card mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Mês">{nomeMes(fatura)}</Campo>
        <Campo rotulo="Conta de origem">
          {origemId === userId ? "a própria" : `${origemId.toString()} ${nomes.get(origemId.toString()) ?? ""}`}
        </Campo>
        <Campo rotulo="Valor">{euros(fatura.valorTotal)}</Campo>
        <Campo rotulo="Nº no ZSGO">
          {fatura.pdfUrl ? (
            <a href={fatura.pdfUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              {fatura.zsgoNumero ?? "Abrir PDF"}
            </a>
          ) : (
            (fatura.zsgoNumero ?? "—")
          )}
        </Campo>
        <Campo rotulo="Tentativas">{fatura.tentativas}</Campo>
        <Campo rotulo="Criada">{dataHora(fatura.criadoEm)}</Campo>
        <Campo rotulo="Atualizada">{dataHora(fatura.atualizadoEm)}</Campo>
        <Campo rotulo="Conferida com o ZSGO">
          {fatura.zsgoConferidoEm ? `${dataHora(fatura.zsgoConferidoEm)} — ${euros(fatura.zsgoTotal)}${fatura.zsgoAnulado ? " (anulada)" : ""}` : "Ainda não"}
        </Campo>
      </dl>

      {fatura.ultimoErro && fatura.status !== "SINCRONIZADO" && (
        <>
          <h2 className="mt-10 text-2xl font-bold tracking-tight">Erro</h2>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-destructive-40 bg-destructive-10 p-4 text-sm text-destructive">
            {fatura.ultimoErro}
          </pre>
        </>
      )}

      {(documento || erroDocumento) && (
        <>
          <h2 className="mt-10 text-2xl font-bold tracking-tight">No ZSGO</h2>
          {erroDocumento ? (
            <p className="mt-3 text-sm text-destructive">Não foi possível ler o documento no ZSGO: {erroDocumento}</p>
          ) : (
            documento && (
              <div className="mt-3 overflow-x-auto">
                <p className="text-sm text-muted-foreground">
                  {documento.numero ?? documento.id} · {documento.data?.slice(0, 10) ?? "—"} · estado {documento.estado ?? "—"}
                  {documento.anulado && <span className="font-semibold text-destructive"> · ANULADO</span>} · líquido {euros(documento.liquido)} · IVA {euros(documento.iva)} ·
                  total <b>{euros(documento.total)}</b>
                </p>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4">Artigo</th>
                      <th className="py-2 pr-4 text-right">Preço s/ IVA</th>
                      <th className="py-2 pr-4 text-right">IVA</th>
                      <th className="py-2 pr-4 text-right">Total</th>
                      <th className="py-2">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documento.linhas.map((l, i) => (
                      <tr key={l.id ?? i} className="border-b border-border">
                        <td className="py-2 pr-4">{l.produto}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{euros(l.precoUnitario)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{l.taxaIva !== undefined ? `${l.taxaIva}%` : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{euros(l.total)}</td>
                        <td className="py-2 text-muted-foreground">{l.notas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      <h2 className="mt-10 text-2xl font-bold tracking-tight">Rubricas</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Rubrica</th>
              <th className="py-2 pr-4">Artigo</th>
              <th className="py-2 pr-4 text-right">Transações</th>
              <th className="py-2 pr-4 text-right">Valor</th>
              <th className="py-2">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="py-2 pr-4">{l.rubrica}</td>
                <td className="py-2 pr-4">{l.productReference}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{l.nrTransacoes?.toString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{euros(l.valor)}</td>
                <td className="py-2 text-muted-foreground">{l.descricao}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  As rubricas só ficam gravadas depois de a fatura ser criada no ZSGO.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
