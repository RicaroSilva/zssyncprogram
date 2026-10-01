import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";

/** Estado atual de uma execução (a janela de passos lê isto a cada segundo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  const exec = await prisma.execucao.findUnique({ where: { id } });
  if (!exec) return NextResponse.json({ erro: "Não encontrada." }, { status: 404 });
  return NextResponse.json(
    { estado: exec.estado, passos: exec.passos, resumo: exec.resumo, resultado: exec.resultado },
    { headers: { "Cache-Control": "no-store" } },
  );
}
