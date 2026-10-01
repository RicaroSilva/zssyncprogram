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
import { Paginacao } from "@/components/paginacao";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/notice";
import { execucaoAtiva } from "@/lib/faturacao/execucao";
import { nomeMes } from "@/lib/formatos";
import { BotaoGerar } from "./botao-gerar";
import { BotaoConferir } from "./botao-conferir";
import { temDiferenca } from "@/lib/faturacao/conferencia";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

const FILTROS: Array<{ valor: string; rotulo: string }> = [
  { valor: "", rotulo: "Todas" },
  { valor: "SINCRONIZADO", rotulo: "Emitidas" },
  { valor: "ERRO", rotulo: "Com erro" },
  { valor: "INCERTO", rotulo: "Verificar no ZSGO" },
  { valor: "PENDENTE", rotulo: "Pendentes" },
  { valor: "DIFERENCA", rotulo: "Com diferença no ZSGO" },
];

export default async function PaginaFaturacao({ searchParams }: { searchParams: Promise<{ mes?: string; estado?: string; q?: string; pagina?: string }> }) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "FATURACAO", "consultar")) redirect("/");
  const parametros = await searchParams;
  const mes = lerMes(parametros.mes);
  const estado = parametros.estado ?? "";
  const pagina = Math.max(1, Number(parametros.pagina) || 1);
  const q = parametros.q?.trim();

  const where: Prisma.FaturaSyncWhereInput = { ano: mes.ano, mes: mes.mes };
  if (estado === "INCERTO") where.zsgoIncerto = true;
  else if (estado === "ERRO") Object.assign(where, { status: "ERRO", zsgoIncerto: false });
  else if (estado === "DIFERENCA") where.zsgoConferidoEm = { not: null };
  else if (estado) where.status = estado;
  if (q && /^\d+$/.test(q)) where.OR = [{ userId: BigInt(q) }, { origemId: BigInt(q) }, { zsgoNumero: { contains: q } }];
  else if (q) where.zsgoNumero = { contains: q, mode: "insensitive" };

  const ordem: Prisma.FaturaSyncOrderByWithRelationInput[] = [{ status: "asc" }, { userId: "asc" }, { origemId: "asc" }];
  let faturas;
  let total: number;
  let somaValor: number;
  const emCurso = await execucaoAtiva();
  if (estado === "DIFERENCA") {
    // "Com diferença" compara duas colunas (anulada, ou total ZSGO ≠ total
    // enviado): filtra-se aqui, depois de ler as conferidas do mês.
    const todas = (await prisma.faturaSync.findMany({ where, orderBy: ordem })).filter(temDiferenca);
    total = todas.length;
    somaValor = todas.reduce((acc, f) => acc + Number(f.valorTotal ?? 0), 0);
    faturas = todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  } else {
    const [lista, contagem, soma] = await Promise.all([
      prisma.faturaSync.findMany({ where, orderBy: ordem, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
      prisma.faturaSync.count({ where }),
      prisma.faturaSync.aggregate({ where, _sum: { valorTotal: true } }),
    ]);
    faturas = lista;
    total = contagem;
    somaValor = Number(soma._sum.valorTotal ?? 0);
  }
  const nomes = await nomesUtilizadoresCyclos(faturas.flatMap((f) => [f.userId, f.origemId]));
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const hrefFiltro = (valor: string) => `/faturacao?mes=${chaveMes(mes)}${valor ? `&estado=${valor}` : ""}`;

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Faturas do mês</h1>
        <div className="flex flex-wrap items-center gap-4">
          <SeletorMes basePath="/faturacao" mes={mes} searchParams={{ estado: estado || undefined }} />
          {pode(sessao, "FATURACAO", "editar") && !emCurso && <BotaoConferir mes={chaveMes(mes)} />}
          {pode(sessao, "FATURACAO", "criar") && !emCurso && <BotaoGerar mes={chaveMes(mes)} nomeMes={nomeMes(mes)} />}
        </div>
      </div>
      {emCurso && (
        <Notice className="mt-6">
          Há uma faturação em curso ({nomeMes(emCurso)}, iniciada por {emCurso.iniciadoPor ?? "—"}).{" "}
          <Link href={`/faturacao/gerar/${emCurso.id}`} className="font-semibold text-accent hover:underline">
            Abrir a janela de passos
          </Link>
        </Notice>
      )}
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Uma fatura por cliente e conta de origem. {total} fatura(s), {euros(somaValor)}.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={hrefFiltro(f.valor)}
              className={cn("rounded-full border px-3 py-1 text-sm font-semibold", estado === f.valor ? "border-primary bg-primary-10 text-accent" : "border-border hover:bg-muted")}
            >
              {f.rotulo}
            </Link>
          ))}
        </div>
        <form method="get" action="/faturacao" className="flex items-center gap-2">
          <input type="hidden" name="mes" value={chaveMes(mes)} />
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Id do cliente ou nº da fatura…"
            className="h-9 w-64 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          />
        </form>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Conta de origem</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4 text-right">Valor</th>
              <th className="py-2 pr-4 text-right">No ZSGO</th>
              <th className="py-2 pr-4">Nº ZSGO</th>
              <th className="py-2 pr-4">Atualizada</th>
              <th className="py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((f) => {
              const chave = `${f.userId}-${f.origemId}-${chaveMes(f)}`;
              return (
                <tr key={chave} className="border-b border-border align-top">
                  <td className="py-2 pr-4">
                    <Link href={`/faturacao/${chave}`} className="font-semibold text-accent hover:underline">
                      {f.userId.toString()}
                    </Link>{" "}
                    <span className="text-muted-foreground">{nomes.get(f.userId.toString())}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {f.origemId === f.userId ? (
                      <span className="text-muted-foreground">a própria</span>
                    ) : (
                      <>
                        {f.origemId.toString()} <span className="text-muted-foreground">{nomes.get(f.origemId.toString())}</span>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Estado estado={f.status} incerto={f.zsgoIncerto} />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{euros(f.valorTotal)}</td>
                  <td className={cn("whitespace-nowrap py-2 pr-4 text-right tabular-nums", temDiferenca(f) ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {f.zsgoAnulado ? "Anulada" : f.zsgoErroConferencia ? "Erro ao ler" : f.zsgoConferidoEm ? euros(f.zsgoTotal) : "—"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    {f.pdfUrl ? (
                      <a href={f.pdfUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {f.zsgoNumero ?? "PDF"}
                      </a>
                    ) : (
                      (f.zsgoNumero ?? "—")
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">{dataHora(f.atualizadoEm)}</td>
                  <td className="max-w-md py-2 text-muted-foreground">
                    <span className="line-clamp-2">{f.status === "SINCRONIZADO" && !f.zsgoIncerto ? "" : (f.ultimoErro ?? "")}</span>
                  </td>
                </tr>
              );
            })}
            {faturas.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Sem faturas para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacao basePath="/faturacao" pagina={pagina} totalPaginas={totalPaginas} searchParams={{ mes: chaveMes(mes), estado: estado || undefined, q }} />
    </div>
  );
}
