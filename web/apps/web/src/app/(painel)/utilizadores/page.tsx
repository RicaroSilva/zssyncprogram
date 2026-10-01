import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { dataHora } from "@/lib/formatos";
import { buttonVariants } from "@/components/button";
import { Notice } from "@/components/notice";

export const dynamic = "force-dynamic";

const ROTULO_ESTADO: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", BLOQUEADO: "Bloqueado" };

export default async function PaginaUtilizadores({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "UTILIZADORES", "consultar")) redirect("/");
  const { guardado } = await searchParams;
  const utilizadores = await prisma.utilizador.findMany({ include: { perfis: { include: { perfil: true } } }, orderBy: { email: "asc" } });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Administração</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Utilizadores</h1>
        {pode(sessao, "UTILIZADORES", "criar") && (
          <Link href="/utilizadores/novo" className={buttonVariants({ size: "sm" })}>
            Adicionar utilizador
          </Link>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Para dar acesso, crie aqui o utilizador com o mesmo email da conta no Keycloak — a conta liga-se sozinha na primeira entrada.
      </p>
      {guardado && <Notice className="mt-6">Utilizador guardado.</Notice>}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">Perfis</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Último acesso</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {utilizadores.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.nomeExibicao}</td>
                <td className="py-2 pr-4">{u.perfis.map((p) => p.perfil.nome).join(", ") || "—"}</td>
                <td className="py-2 pr-4">{ROTULO_ESTADO[u.estado] ?? u.estado}</td>
                <td className="py-2 pr-4">{u.ultimoLoginEm ? dataHora(u.ultimoLoginEm) : "Nunca"}</td>
                <td className="py-2">
                  {pode(sessao, "UTILIZADORES", "editar") && (
                    <Link href={`/utilizadores/${u.id}`} className="font-semibold text-accent hover:underline">
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
