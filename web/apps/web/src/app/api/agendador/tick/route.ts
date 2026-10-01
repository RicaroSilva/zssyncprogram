import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tickAgendador } from "@/lib/tarefas";

/** Chamada de 30 em 30 s pelo próprio servidor (instrumentation.ts). Não
 *  espera pelas tarefas: devolve logo e elas correm em segundo plano. */
export async function POST(request: Request) {
  const esperado = process.env.AGENDADOR_SEGREDO_INTERNO;
  const recebido = request.headers.get("x-agendador") ?? "";
  if (!esperado || esperado.length !== recebido.length || !timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  void tickAgendador();
  return NextResponse.json({ ok: true });
}
