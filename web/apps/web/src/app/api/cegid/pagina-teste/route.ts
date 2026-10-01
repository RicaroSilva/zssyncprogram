import { NextResponse } from "next/server";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { ultimaPaginaTeste } from "@/lib/cegid/descarregar";

/** A página HTML que o link do Cegid devolveu no último "Testar um documento" (para ver onde está o PDF). */
export async function GET() {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "criar")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const p = ultimaPaginaTeste.valor;
  if (!p) return NextResponse.json({ erro: "Ainda não há nenhuma página de teste." }, { status: 404 });
  return new NextResponse(`<!-- recebida de ${p.urlFinal} -->\n${p.html}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="pagina-cegid.html.txt"', "Cache-Control": "no-store" },
  });
}
