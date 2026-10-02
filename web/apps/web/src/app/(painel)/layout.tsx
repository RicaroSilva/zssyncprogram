import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { menuPara } from "@/lib/menu";
import { MenuPainel } from "@/components/menu-painel";

export default async function LayoutPainel({ children }: { children: ReactNode }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect("/login");

  return (
    <div className="container-fluid py-8">
      <MenuPainel separadores={menuPara((recurso, acao) => pode(sessao, recurso, acao))}>{children}</MenuPainel>
    </div>
  );
}
