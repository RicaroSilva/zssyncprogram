import { redirect } from "next/navigation";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { FormularioDiagnostico } from "./formulario";

export const dynamic = "force-dynamic";

export default async function PaginaDiagnostico() {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "editar")) redirect("/");
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Ferramentas</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Diagnóstico do ZSGO</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Pede ao ZSGO a lista de faturas (e, se indicar, procura um número ou id) e mostra a resposta em bruto e o que o programa percebeu. Só lê do ZSGO.
      </p>
      <FormularioDiagnostico />
    </div>
  );
}
