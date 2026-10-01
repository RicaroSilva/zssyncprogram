import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { dataHora } from "@/lib/formatos";
import { Paginacao } from "@/components/paginacao";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "HISTORICO", "consultar")) redirect("/");
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1);

  const [registos, total] = await Promise.all([
    prisma.historico.findMany({ orderBy: { criadoEm: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.historico.count(),
  ]);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Histórico</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">Quem fez o quê — no painel em Java e nesta aplicação.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Data</th>
              <th className="py-2 pr-4">Utilizador</th>
              <th className="py-2 pr-4">Ação</th>
              <th className="py-2">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {registos.map((r) => (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{dataHora(r.criadoEm)}</td>
                <td className="whitespace-nowrap py-2 pr-4">{r.utilizador ?? "—"}</td>
                <td className="whitespace-nowrap py-2 pr-4 font-semibold">{r.acao}</td>
                <td className="py-2">{r.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao basePath="/historico" pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / POR_PAGINA))} />
    </div>
  );
}
