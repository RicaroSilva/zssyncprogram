import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { NOME_RECURSO, type Recurso } from "@/lib/recursos";
import { buttonVariants } from "@/components/button";

export const dynamic = "force-dynamic";

export default async function PaginaPerfis() {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "PERFIS", "consultar")) redirect("/");
  const perfis = await prisma.perfil.findMany({
    include: { permissoesRecurso: true, _count: { select: { utilizadores: true } } },
    orderBy: [{ superAdmin: "desc" }, { nome: "asc" }],
  });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Administração</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Perfis</h1>
        {pode(sessao, "PERFIS", "criar") && (
          <Link href="/perfis/novo" className={buttonVariants({ size: "sm" })}>
            Adicionar perfil
          </Link>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">O que cada perfil pode fazer em cada área. Um utilizador pode ter vários perfis.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Perfil</th>
              <th className="py-2 pr-4">Acesso</th>
              <th className="py-2 pr-4">Utilizadores</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {perfis.map((p) => (
              <tr key={p.id} className="border-b border-border align-top">
                <td className="py-2 pr-4">
                  <b>{p.nome}</b>
                  {p.descricao && <p className="text-muted-foreground">{p.descricao}</p>}
                </td>
                <td className="py-2 pr-4">
                  {p.superAdmin
                    ? "Acesso total"
                    : p.permissoesRecurso
                        .map((r) => `${NOME_RECURSO[r.recurso as Recurso] ?? r.recurso}${r.criar || r.editar || r.eliminar ? "" : " (só consultar)"}`)
                        .join(", ") || "Nenhum"}
                </td>
                <td className="py-2 pr-4">{p._count.utilizadores}</td>
                <td className="py-2">
                  {!p.superAdmin && pode(sessao, "PERFIS", "editar") && (
                    <Link href={`/perfis/${p.id}`} className="font-semibold text-accent hover:underline">
                      Editar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
