import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { DESTINO_RECURSO, RECURSOS } from "@/lib/recursos";

export default async function PaginaInicial() {
  const sessao = await obterSessaoAtual();
  if (!sessao) redirect("/login");
  const recurso = RECURSOS.find((r) => pode(sessao, r, "consultar"));
  if (!recurso) {
    return (
      <main className="container-fluid py-10">
        <h1 className="text-2xl font-bold tracking-tight">Sem acesso</h1>
        <p className="mt-2 text-muted-foreground">O seu perfil não tem permissão para consultar nenhuma área da faturação.</p>
      </main>
    );
  }
  redirect(DESTINO_RECURSO[recurso]);
}
