import Link from "next/link";
import { LogotipoPredefinido } from "@/components/default-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { obterSessaoAtual } from "@/lib/auth";

export async function Header() {
  const sessao = await obterSessaoAtual();

  return (
    <header className="border-b border-border">
      <div className="container-fluid flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <LogotipoPredefinido className="h-8" />
          <span className="hidden border-l border-border pl-3 text-sm font-semibold text-muted-foreground sm:inline">Faturação</span>
        </Link>
        <div className="flex items-center gap-4">
          {sessao && (
            <form action="/api/auth/logout" method="post" className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="hidden sm:inline">{sessao.email}</span>
              <button type="submit" className="font-semibold text-accent hover:underline">
                Sair
              </button>
            </form>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
