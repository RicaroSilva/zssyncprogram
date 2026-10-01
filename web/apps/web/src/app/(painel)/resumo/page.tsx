import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { chaveMes, dataHora, euros, lerMes } from "@/lib/formatos";
import { SeletorMes } from "@/components/seletor-mes";

export const dynamic = "force-dynamic";

function Cartao({ titulo, valor, detalhe, href, tom }: { titulo: string; valor: string | number; detalhe: string; href?: string; tom?: "erro" | "aviso" }) {
  const corpo = (
    <div className="bento-card h-full">
      <p className="text-sm font-semibold text-muted-foreground">{titulo}</p>
      <p className={`mt-2 font-heading text-4xl font-bold ${tom === "erro" ? "text-destructive" : tom === "aviso" ? "text-accent" : ""}`}>{valor}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detalhe}</p>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

export default async function PaginaResumo({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) redirect("/");
  const { mes: mesParam } = await searchParams;
  const mes = lerMes(mesParam);
  const doMes = { ano: mes.ano, mes: mes.mes };

  const [emitidas, comErro, incertas, pendentes, notas, clientes, historico] = await Promise.all([
    prisma.faturaSync.aggregate({ where: { ...doMes, status: "SINCRONIZADO" }, _count: true, _sum: { valorTotal: true } }),
    prisma.faturaSync.count({ where: { ...doMes, status: "ERRO", zsgoIncerto: false } }),
    prisma.faturaSync.count({ where: { ...doMes, zsgoIncerto: true } }),
    prisma.faturaSync.count({ where: { ...doMes, status: "PENDENTE" } }),
    prisma.notaCreditoSync.aggregate({ where: { ...doMes, status: "SINCRONIZADO" }, _count: true, _sum: { valorEstorno: true } }),
    prisma.clienteSync.groupBy({ by: ["status"], _count: true }),
    prisma.historico.findMany({ orderBy: { criadoEm: "desc" }, take: 8 }),
  ]);
  const contagemClientes = (s: string) => clientes.find((c) => c.status === s)?._count ?? 0;
  const linkFaturas = (estado?: string) => `/faturacao?mes=${chaveMes(mes)}${estado ? `&estado=${estado}` : ""}`;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Resumo</h1>
        <SeletorMes basePath="/resumo" mes={mes} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Faturas emitidas" valor={emitidas._count} detalhe={`${euros(emitidas._sum.valorTotal ?? 0)} no total`} href={linkFaturas("SINCRONIZADO")} />
        <Cartao titulo="Com erro" valor={comErro} detalhe={comErro ? "Por corrigir e voltar a gerar" : "Nenhuma"} href={linkFaturas("ERRO")} tom={comErro ? "erro" : undefined} />
        <Cartao
          titulo="Verificar no ZSGO"
          valor={incertas}
          detalhe={incertas ? "O ZSGO não respondeu — confirmar antes de recriar" : "Nenhuma"}
          href={linkFaturas("INCERTO")}
          tom={incertas ? "aviso" : undefined}
        />
        <Cartao titulo="Notas de crédito" valor={notas._count} detalhe={`${euros(notas._sum.valorEstorno ?? 0)} estornados`} />
      </div>
      {pendentes > 0 && <p className="mt-3 text-sm text-muted-foreground">{pendentes} fatura(s) pendente(s) neste mês.</p>}

      <h2 className="mt-12 text-2xl font-bold tracking-tight">Clientes no ZSGO</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Cartao titulo="Importados" valor={contagemClientes("SINCRONIZADO")} detalhe="Já existem no ZSGO" href="/clientes?estado=SINCRONIZADO" />
        <Cartao titulo="Com erro" valor={contagemClientes("ERRO")} detalhe="Falharam ao criar/atualizar" href="/clientes?estado=ERRO" tom={contagemClientes("ERRO") ? "erro" : undefined} />
        <Cartao titulo="Pendentes" valor={contagemClientes("PENDENTE")} detalhe="Ainda por criar" href="/clientes?estado=PENDENTE" />
      </div>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">Atividade recente</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {historico.map((h) => (
              <tr key={h.id} className="border-b border-border">
                <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{dataHora(h.criadoEm)}</td>
                <td className="whitespace-nowrap py-2 pr-4">{h.utilizador ?? "—"}</td>
                <td className="py-2">{h.detalhe ?? h.acao}</td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr>
                <td className="py-4 text-muted-foreground">Sem atividade registada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
