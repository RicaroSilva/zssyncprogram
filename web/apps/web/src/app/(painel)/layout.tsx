import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obterSessaoAtual, type Acao } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import type { Recurso } from "@/lib/recursos";
import { LinkMenu } from "@/components/link-menu";

// Menu do painel — cada entrada só aparece a quem pode consultá-la.
const MENU: Array<{ href: string; nome: string; recurso: Recurso; acao?: Acao }> = [
  { href: "/resumo", nome: "Resumo", recurso: "RESUMO" },
  { href: "/faturacao", nome: "Faturação", recurso: "FATURACAO" },
  { href: "/notas-credito", nome: "Notas de crédito", recurso: "FATURACAO" },
  { href: "/clientes", nome: "Clientes", recurso: "CLIENTES" },
  { href: "/zsgo", nome: "ZSGO", recurso: "ZSGO" },
  { href: "/historico", nome: "Histórico", recurso: "HISTORICO" },
  { href: "/tarefas", nome: "Tarefas", recurso: "TAREFAS" },
  { href: "/utilizadores", nome: "Utilizadores", recurso: "UTILIZADORES" },
  { href: "/perfis", nome: "Perfis", recurso: "PERFIS" },
  { href: "/diagnostico", nome: "Diagnóstico ZSGO", recurso: "FATURACAO", acao: "editar" },
];

export default async function LayoutPainel({ children }: { children: ReactNode }) {
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect("/login");

  return (
    <div className="container-fluid py-10">
      <nav className="mb-8 flex flex-wrap items-center gap-6 border-b border-border pb-4 text-sm font-semibold">
        {MENU.filter((m) => pode(sessao, m.recurso, m.acao ?? "consultar")).map((m) => (
          <LinkMenu key={m.href} href={m.href}>
            {m.nome}
          </LinkMenu>
        ))}
      </nav>
      {children}
    </div>
  );
}
