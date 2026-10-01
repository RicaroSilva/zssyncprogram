import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@faturacao/db";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { chaveMes, dataHora, euros, lerMes } from "@/lib/formatos";
import { SeletorMes } from "@/components/seletor-mes";
import { Estado } from "@/components/estado";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTROS = [
  { valor: "", rotulo: "Todas" },
  { valor: "SINCRONIZADO", rotulo: "Emitidas" },
  { valor: "ERRO", rotulo: "Com erro" },
];

export default async function PaginaNotasCredito({ searchParams }: { searchParams: Promise<{ mes?: string; estado?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  const parametros = await searchParams;
  const mes = lerMes(parametros.mes);
  const estado = parametros.estado ?? "";

  const where: Prisma.NotaCreditoSyncWhereInput = { ano: mes.ano, mes: mes.mes };
  if (estado) where.status = estado;
  const notas = await prisma.notaCreditoSync.findMany({ where, orderBy: [{ status: "asc" }, { clienteId: "asc" }, { chargebackId: "asc" }] });
  const nomes = await nomesUtilizadoresCyclos(notas.flatMap((n) => (n.clienteId !== null ? [n.clienteId] : [])));
  const soma = notas.filter((n) => n.status === "SINCRONIZADO").reduce((acc, n) => acc + Number(n.valorEstorno ?? 0), 0);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Notas de crédito</h1>
        <SeletorMes basePath="/notas-credito" mes={mes} searchParams={{ estado: estado || undefined }} />
      </div>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Estornos de transações de meses anteriores (os do próprio mês saem da fatura, sem nota de crédito). {notas.length} estorno(s), {euros(soma)} emitidos.
      </p>
      <Notice className="mt-6">
        O ZSGO exige <code>origin_id</code>/<code>origin_line_id</code> (a fatura e a linha de origem) nas notas de crédito — ainda por fazer, como no
        programa em Java. Até lá, as notas de crédito podem falhar com esse erro.
      </Notice>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={`/notas-credito?mes=${chaveMes(mes)}${f.valor ? `&estado=${f.valor}` : ""}`}
            className={cn("rounded-full border px-3 py-1 text-sm font-semibold", estado === f.valor ? "border-primary bg-primary-10 text-accent" : "border-border hover:bg-muted")}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Estorno</th>
              <th className="py-2 pr-4">Transação original</th>
              <th className="py-2 pr-4 text-right">Valor</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Atualizada</th>
              <th className="py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n.chargebackId.toString()} className="border-b border-border align-top">
                <td className="py-2 pr-4">
                  <span className="font-semibold">{n.clienteId?.toString() ?? "—"}</span>{" "}
                  <span className="text-muted-foreground">{n.clienteId !== null ? nomes.get(n.clienteId.toString()) : ""}</span>
                </td>
                <td className="py-2 pr-4 tabular-nums">{n.chargebackId.toString()}</td>
                <td className="py-2 pr-4 tabular-nums">{n.transacaoOriginalId?.toString() ?? "—"}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{euros(n.valorEstorno)}</td>
                <td className="py-2 pr-4">
                  <Estado estado={n.status} />
                </td>
                <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{dataHora(n.atualizadoEm)}</td>
                <td className="max-w-md py-2 text-muted-foreground">
                  <span className="line-clamp-3">{n.status === "SINCRONIZADO" ? (n.zsgoNcId ? `ZSGO ${n.zsgoNcId}` : "") : (n.ultimoErro ?? "")}</span>
                </td>
              </tr>
            ))}
            {notas.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground">
                  Sem notas de crédito neste mês.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
