import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/button";
import { Notice } from "@/components/notice";
import { obterSessaoAtual } from "@/lib/auth";
import { loginEmergenciaHabilitado } from "@/lib/login-emergencia";
import { FormularioLoginEmergencia } from "./formulario-emergencia";

const MENSAGENS_ERRO: Record<string, string> = {
  sessao_oidc_expirada: "O pedido de autenticação expirou. Tente novamente.",
  oidc_invalido: "Não foi possível validar a resposta do Keycloak.",
  oidc_sem_identidade: "O Keycloak não devolveu email/identificador do utilizador.",
  sem_acesso: "Esta conta não tem acesso à aplicação de faturação.",
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await obterSessaoAtual()) redirect("/");
  const { erro } = await searchParams;
  const mensagem = erro ? (MENSAGENS_ERRO[erro] ?? "Erro de autenticação.") : null;
  const acessoEmergencia = loginEmergenciaHabilitado();

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="bento-card w-full max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Entrar</h1>
        <p className="mt-3 text-muted-foreground">O acesso é feito exclusivamente através do Keycloak da organização.</p>
        {mensagem && (
          <p className="mt-4 rounded-lg border border-destructive-40 bg-destructive-10 p-3 text-sm text-destructive">{mensagem}</p>
        )}
        {/* <a> e não <Link>: o Link pré-carrega a rota e isso já iniciava a
            descoberta OIDC no Keycloak antes de alguém clicar. */}
        <a href="/api/auth/login" className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>
          Entrar com Keycloak
        </a>

        {acessoEmergencia && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou
              <span className="h-px flex-1 bg-border" />
            </div>
            <Notice className="mb-4 text-left">
              Acesso de emergência — enquanto o Keycloak não está acessível. Nunca deixar ativo depois de resolvido
              (variável <code>ADMIN_LOCAL_LOGIN_ENABLED</code>).
            </Notice>
            <FormularioLoginEmergencia />
          </>
        )}
      </div>
    </main>
  );
}
