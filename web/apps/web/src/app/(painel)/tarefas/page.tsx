import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { CODIGOS, DESCRICAO_TAREFA, NOME_TAREFA, agoraLocal, proximaExecucao, type CodigoTarefa } from "@/lib/tarefas";
import { Notice } from "@/components/notice";
import { CartaoTarefa } from "./cartao-tarefa";

export const dynamic = "force-dynamic";

/** Hora de parede (guardada como UTC) → texto. */
function texto(d: Date | null): string | null {
  return d ? d.toLocaleString("pt-PT", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) : null;
}

export default async function PaginaTarefas() {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "TAREFAS", "consultar")) redirect("/");
  const [tarefas, sinal] = await Promise.all([
    prisma.tarefa.findMany(),
    prisma.$queryRaw<Array<{ maquina: string | null; segundos: number | null }>>`
      SELECT maquina, EXTRACT(EPOCH FROM (now() - ultimo_sinal))::int AS segundos FROM zsgo_agendador WHERE id = 1`,
  ]);
  const agora = agoraLocal();
  const s = sinal[0];
  const agendadorLigado = !!s && s.segundos !== null && s.segundos < 120;
  const agendadorDesligadoAqui = process.env.AGENDADOR ? process.env.AGENDADOR !== "true" : process.env.NODE_ENV !== "production";

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Faturação</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Tarefas agendadas</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        As mesmas tarefas do programa em Java (a configuração é partilhada). Correm sozinhas à hora marcada, no servidor — não é preciso ter nenhuma página
        aberta.
      </p>
      <Notice className="mt-6">
        {agendadorLigado ? (
          <>
            Agendador ligado ({s?.maquina}, último sinal há {s?.segundos} s).
            {agendadorDesligadoAqui && " Nesta aplicação o agendador está desligado (AGENDADOR) — é o outro agendador que corre as tarefas."}
          </>
        ) : (
          <span className="text-destructive">
            O agendador não dá sinal há mais de 2 minutos{agendadorDesligadoAqui ? " (nesta aplicação está desligado — AGENDADOR)" : ""} — as
            tarefas não estão a correr sozinhas.
          </span>
        )}
      </Notice>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {CODIGOS.map((codigo) => {
          const t = tarefas.find((x) => x.codigo === codigo);
          if (!t) return null;
          const aCorrer = !!t.aCorrerDesde && Date.now() - t.aCorrerDesde.getTime() < 6 * 3600_000;
          return (
            <CartaoTarefa
              key={codigo}
              codigo={codigo as CodigoTarefa}
              nome={NOME_TAREFA[codigo]}
              descricao={DESCRICAO_TAREFA[codigo]}
              ativa={t.ativa}
              hora={t.hora}
              diaMes={t.diaMes}
              comDiaMes={codigo === "FATURACAO_MENSAL"}
              ultimaExecucao={texto(t.ultimaExecucao)}
              ultimoEstado={aCorrer ? "A_CORRER" : t.ultimoEstado}
              ultimoResultado={t.ultimoResultado}
              proxima={texto(proximaExecucao(t, agora))}
              podeEditar={pode(sessao, "TAREFAS", "editar")}
            />
          );
        })}
      </div>
    </div>
  );
}
