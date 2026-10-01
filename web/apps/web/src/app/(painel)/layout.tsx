import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { DESTINO_RECURSO, NOME_RECURSO, RECURSOS } from "@/lib/recursos";
import { LinkMenu } from "@/components/link-menu";

// Áreas que já têm página nesta fase; as restantes aparecem à medida que
// forem construídas (ver PLANEAMENTO.md).
const COM_PAGINA = new Set(["RESUMO", "FATURACAO", "CLIENTES", "HISTORICO"]);

export default async function LayoutPainel({ children }: { children: ReactNode }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect("/login");

  return (
    <div className="container-fluid py-10">
      <nav className="mb-8 flex flex-wrap items-center gap-6 border-b border-border pb-4 text-sm font-semibold">
        {RECURSOS.filter((r) => COM_PAGINA.has(r) && pode(sessao, r, "consultar")).map((r) => (
          <LinkMenu key={r} href={DESTINO_RECURSO[r]}>
            {NOME_RECURSO[r]}
          </LinkMenu>
        ))}
      </nav>
      {children}
    </div>
  );
}
