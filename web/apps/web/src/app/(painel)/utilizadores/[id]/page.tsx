import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { FormularioUtilizador } from "../formulario";

export const dynamic = "force-dynamic";

/** /utilizadores/novo e /utilizadores/<id>. */
export default async function PaginaUtilizador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const novo = id === "novo";
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "UTILIZADORES", novo ? "criar" : "editar")) redirect("/utilizadores");
  const perfis = await prisma.perfil.findMany({ orderBy: [{ superAdmin: "desc" }, { nome: "asc" }], select: { id: true, nome: true, descricao: true } });
  const u = novo ? null : await prisma.utilizador.findUnique({ where: { id }, include: { perfis: true } });
  if (!novo && !u) notFound();

  return (
    <div>
      <Link href="/utilizadores" className="text-sm font-semibold text-accent hover:underline">
        ← Utilizadores
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{novo ? "Adicionar utilizador" : u!.email}</h1>
      <FormularioUtilizador
        id={novo ? null : u!.id}
        inicial={{ email: u?.email ?? "", nomeExibicao: u?.nomeExibicao ?? "", estado: u?.estado ?? "ATIVO", perfis: u?.perfis.map((p) => p.perfilId) ?? [] }}
        perfis={perfis}
      />
    </div>
  );
}
