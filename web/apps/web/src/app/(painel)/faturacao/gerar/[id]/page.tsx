import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { chaveMes, nomeMes } from "@/lib/formatos";
import { JanelaPassos, type EstadoJanela } from "./janela-passos";

export const dynamic = "force-dynamic";

export default async function PaginaGerarFaturacao({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  const { id } = await params;
  const exec = await prisma.execucao.findUnique({ where: { id } });
  if (!exec) notFound();

  const inicial = { estado: exec.estado, passos: exec.passos, resumo: exec.resumo, resultado: exec.resultado } as unknown as EstadoJanela;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/faturacao?mes=${chaveMes(exec)}`} className="text-sm font-semibold text-accent hover:underline">
        ← Faturas de {nomeMes(exec)}
      </Link>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{exec.tipo === "CONFERENCIA" ? "Conferir com o ZSGO" : "Gerar faturação"} — {nomeMes(exec)}</h1>
      <p className="mt-3 text-muted-foreground">
        Iniciada por {exec.iniciadoPor ?? "—"} em {exec.iniciadoEm.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}. Pode fechar esta
        página: continua a correr no servidor e pode voltar aqui a qualquer momento.
      </p>
      <JanelaPassos id={exec.id} inicial={inicial} podeEmitir={pode(sessao, "FATURACAO", "criar")} voltarHref={`/faturacao?mes=${chaveMes(exec)}`} />
    </div>
  );
}
