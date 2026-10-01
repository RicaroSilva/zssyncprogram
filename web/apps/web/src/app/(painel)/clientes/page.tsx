import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@faturacao/db";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { dataHora } from "@/lib/formatos";
import { Estado } from "@/components/estado";
import { Paginacao } from "@/components/paginacao";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;
const ROTULOS = { SINCRONIZADO: "Importado", ERRO: "Com erro", PENDENTE: "Pendente" };
const FILTROS = [
  { valor: "", rotulo: "Todos" },
  { valor: "SINCRONIZADO", rotulo: "Importados" },
  { valor: "ERRO", rotulo: "Com erro" },
  { valor: "PENDENTE", rotulo: "Pendentes" },
];
const REGIAO: Record<string, string> = { CON: "Continente", MA: "Madeira", AC: "Açores" };

/** Lê um campo de zsgo_dados (resposta do ZSGO guardada ao criar/atualizar). */
function campo(dados: Prisma.JsonValue | null, ...caminho: string[]): string | undefined {
  let atual: unknown = dados;
  for (const parte of ["data", ...caminho]) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return typeof atual === "string" || typeof atual === "number" ? String(atual) : undefined;
}

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; pagina?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "CLIENTES", "consultar")) redirect("/");
  const parametros = await searchParams;
  const estado = parametros.estado ?? "";
  const q = parametros.q?.trim();
  const pagina = Math.max(1, Number(parametros.pagina) || 1);

  const where: Prisma.ClienteSyncWhereInput = {};
  if (estado) where.status = estado;
  if (q && /^\d+$/.test(q)) where.OR = [{ userId: BigInt(q) }, { zsgoCode: BigInt(q) }];
  else if (q) where.zsgoDados = { path: ["data", "identity", "name"], string_contains: q };

  const [clientes, total] = await Promise.all([
    prisma.clienteSync.findMany({ where, orderBy: { userId: "asc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    prisma.clienteSync.count({ where }),
  ]);
  const nomes = await nomesUtilizadoresCyclos(clientes.map((c) => c.userId));
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Clientes</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Utilizadores do Cyclos e o estado da sua ficha no ZSGO. {total} cliente(s).
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={f.valor ? `/clientes?estado=${f.valor}` : "/clientes"}
              className={cn("rounded-full border px-3 py-1 text-sm font-semibold", estado === f.valor ? "border-primary bg-primary-10 text-accent" : "border-border hover:bg-muted")}
            >
              {f.rotulo}
            </Link>
          ))}
        </div>
        <form method="get" action="/clientes" className="flex items-center gap-2">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Id, código ZSGO ou nome…"
            className="h-9 w-64 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          />
        </form>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Id Cyclos</th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">NIF</th>
              <th className="py-2 pr-4">Código ZSGO</th>
              <th className="py-2 pr-4">Região</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Atualizado</th>
              <th className="py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const regiao = campo(c.zsgoDados, "address", "region_code");
              return (
                <tr key={c.userId.toString()} className="border-b border-border align-top">
                  <td className="py-2 pr-4 font-semibold">{c.userId.toString()}</td>
                  <td className="py-2 pr-4">{campo(c.zsgoDados, "identity", "name") ?? nomes.get(c.userId.toString()) ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{campo(c.zsgoDados, "identity", "tax_id") ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{c.zsgoCode?.toString() ?? "—"}</td>
                  <td className="py-2 pr-4">{regiao ? (REGIAO[regiao] ?? regiao) : "—"}</td>
                  <td className="py-2 pr-4">
                    <Estado estado={c.status} rotulos={ROTULOS} />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{dataHora(c.atualizadoEm)}</td>
                  <td className="max-w-md py-2 text-muted-foreground">
                    <span className="line-clamp-2">{c.status === "SINCRONIZADO" ? "" : (c.ultimoErro ?? "")}</span>
                  </td>
                </tr>
              );
            })}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Sem clientes para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacao basePath="/clientes" pagina={pagina} totalPaginas={totalPaginas} searchParams={{ estado: estado || undefined, q }} />
    </div>
  );
}
