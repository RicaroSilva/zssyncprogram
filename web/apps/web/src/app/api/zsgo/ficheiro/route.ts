import { NextResponse } from "next/server";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { ZsgoApi } from "@/lib/zsgo/api";
import { preencherCaminho } from "@/lib/zsgo/especificacao";
import { operacoesDe, recursoPorSlug } from "@/lib/zsgo/recursos";

/** PDF / XML / SAF-T de um documento do ZSGO (passa pelo servidor, que tem o token). */
export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "ZSGO", "consultar")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const recurso = recursoPorSlug(url.searchParams.get("recurso") ?? "");
  const tipo = url.searchParams.get("tipo");
  const chave = url.searchParams.get("chave");
  if (!recurso?.parametro || !chave || (tipo !== "pdf" && tipo !== "xml" && tipo !== "descarregar")) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const op = operacoesDe(recurso)[tipo];
  if (!op) return NextResponse.json({ erro: "Operação inexistente." }, { status: 404 });
  const r = await new ZsgoApi().ficheiro(preencherCaminho(op.caminho, { [recurso.parametro]: chave }));
  if (r.status !== 200) {
    return new NextResponse(`O ZSGO respondeu ${r.status}: ${new TextDecoder().decode(r.bytes).slice(0, 500)}`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const extensao = tipo === "xml" ? "xml" : tipo === "pdf" ? "pdf" : r.tipo.includes("zip") ? "zip" : "xml";
  const nome = r.nome ?? `${recurso.slug}-${chave}.${extensao}`;
  return new NextResponse(r.bytes, {
    headers: {
      "Content-Type": r.tipo,
      "Content-Disposition": `${tipo === "pdf" ? "inline" : "attachment"}; filename="${nome.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
