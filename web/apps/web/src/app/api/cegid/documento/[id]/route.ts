import { NextResponse } from "next/server";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { prisma } from "@/lib/db";
import { armazenamentoConfigurado } from "@/lib/cegid/armazenamento";

/** A cópia guardada de um documento do Cegid (passa pelo servidor, que tem as chaves do S3). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const [doc] = await prisma.$queryRaw<Array<{ chave: string | null; tipo: string | null }>>`
    SELECT chave, tipo FROM zsgo_web_cegid_documento WHERE mpinv_id = ${Number(id)} AND estado = 'OK'`;
  const armazenamento = armazenamentoConfigurado();
  if (!doc?.chave || !armazenamento) return NextResponse.json({ erro: "Este documento ainda não foi guardado." }, { status: 404 });
  const dados = await armazenamento.ler(doc.chave);
  if (!dados) return NextResponse.json({ erro: `O ficheiro ${doc.chave} não está no armazenamento.` }, { status: 404 });
  const nome = doc.chave.split("/").pop() ?? `cegid-${id}.pdf`;
  return new NextResponse(new Uint8Array(dados), {
    headers: { "Content-Type": doc.tipo || "application/pdf", "Content-Disposition": `inline; filename="${nome.replace(/"/g, "")}"`, "Cache-Control": "no-store" },
  });
}
