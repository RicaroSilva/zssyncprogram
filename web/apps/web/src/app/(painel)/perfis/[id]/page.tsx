import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { NOME_RECURSO, RECURSOS } from "@/lib/recursos";
import { FormularioPerfil } from "../formulario";
import type { Matriz } from "../actions";

export const dynamic = "force-dynamic";

const AJUDA: Record<string, string> = {
  RESUMO: "Página inicial com os números do mês.",
  FATURACAO: "Consultar faturas e notas de crédito; criar = gerar a faturação; editar = conferir, associar faturas, diagnóstico.",
  CLIENTES: "Lista de clientes do Cyclos e o estado no ZSGO.",
  ZSGO: "Tudo o que a API do ZSGO permite: consultar; criar = clientes, documentos, recibos…; editar; eliminar = eliminar e anular documentos.",
  TAREFAS: "Ver as tarefas agendadas; editar = ligar/desligar, mudar a hora, executar agora.",
  HISTORICO: "Quem fez o quê.",
  UTILIZADORES: "Dar e tirar acesso à aplicação.",
  PERFIS: "Definir o que cada perfil pode fazer.",
};

export default async function PaginaPerfil({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const novo = id === "novo";
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "PERFIS", novo ? "criar" : "editar")) redirect("/perfis");
  const perfil = novo ? null : await prisma.perfil.findUnique({ where: { id }, include: { permissoesRecurso: true } });
  if (!novo && !perfil) notFound();
  if (perfil?.superAdmin) redirect("/perfis");
  const matriz: Matriz = Object.fromEntries((perfil?.permissoesRecurso ?? []).map((r) => [r.recurso, { consultar: r.consultar, criar: r.criar, editar: r.editar, eliminar: r.eliminar }]));

  return (
    <div>
      <Link href="/perfis" className="text-sm font-semibold text-accent hover:underline">
        ← Perfis
      </Link>
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{novo ? "Adicionar perfil" : perfil!.nome}</h1>
      <FormularioPerfil
        id={perfil?.id ?? null}
        nome={perfil?.nome ?? ""}
        descricao={perfil?.descricao ?? ""}
        matriz={matriz}
        recursos={RECURSOS.map((r) => ({ chave: r, nome: NOME_RECURSO[r], ajuda: AJUDA[r] ?? "" }))}
        podeEliminar={!perfil?.criadoPeloSistema && pode(sessao, "PERFIS", "eliminar")}
      />
    </div>
  );
}
