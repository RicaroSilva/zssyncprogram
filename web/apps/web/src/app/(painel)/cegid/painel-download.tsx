"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { iniciarDownloadAction, pararDownloadAction, progressoDownloadAction, testarDocumentoAction } from "./actions";

type Progresso = NonNullable<Awaited<ReturnType<typeof progressoDownloadAction>>>;

const n = (x: number) => new Intl.NumberFormat("pt-PT").format(x);

function duracao(minutos: number): string {
  if (!Number.isFinite(minutos)) return "—";
  if (minutos < 60) return `${Math.max(1, Math.round(minutos))} min`;
  const horas = minutos / 60;
  if (horas < 48) return `${Math.floor(horas)} h ${Math.round(minutos % 60)} min`;
  return `${Math.round(horas / 24)} dias`;
}

/** Cópia de segurança dos documentos do Cegid para o S3: progresso, iniciar/continuar, parar. */
export function PainelDownload({ inicial, podeIniciar, destino }: { inicial: Progresso; podeIniciar: boolean; destino: string | null }) {
  const [p, setP] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const [idTeste, setIdTeste] = useState("");
  const [teste, setTeste] = useState<Awaited<ReturnType<typeof testarDocumentoAction>> | null>(null);
  const [pendente, iniciar] = useTransition();
  const { estado, contagem, divisao, ultimas } = p;

  useEffect(() => {
    if (!estado.aCorrer || semSessao) return;
    const t = setInterval(
      () =>
        progressoDownloadAction()
          .then((r) => (r ? setP(r) : setSemSessao(true)))
          .catch(() => {}),
      3000,
    );
    return () => clearInterval(t);
  }, [estado.aCorrer, semSessao]);

  const acao = (f: () => Promise<unknown>) =>
    iniciar(async () => {
      setErro(null);
      const r = (await f()) as { ok?: boolean; erro?: string } | undefined;
      if (r && r.ok === false) setErro(r.erro ?? "Não foi possível.");
      const novo = await progressoDownloadAction();
      if (novo) setP(novo);
      else setSemSessao(true);
    });

  // Velocidade desta execução e tempo que falta (com o ritmo atual).
  const minutos = estado.iniciadoEm ? (Date.now() - new Date(estado.iniciadoEm).getTime()) / 60000 : 0;
  // Ritmo dos últimos minutos de download (a pré-análise do início não conta).
  const porMinuto = estado.aCorrer ? estado.porMinutoRecente || (minutos > 0.2 ? estado.feitosNestaExecucao / minutos : 0) : 0;
  const pct = contagem.total ? Math.floor((contagem.guardados / contagem.total) * 1000) / 10 : 0;
  const falta = Math.max(0, contagem.total - contagem.guardados - contagem.comErro);

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-base font-semibold">Cópia dos documentos (antes de a licença do Cegid acabar)</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Antes de descarregar faz sempre uma pré-análise: as faturas que já estão no S3 com o nome do nº (ex. <span className="font-mono text-xs">FR 2024-3342.pdf</span>) não são enviadas outra vez. Descarrega o PDF de cada fatura pelo link do Cegid e guarda-o {destino ? <b className="font-semibold">({destino})</b> : "no S3"}. Pode parar e continuar quando quiser: continua onde ficou.
          </p>
        </div>
        {podeIniciar && (
          <div className="flex flex-wrap gap-2">
            {estado.aCorrer ? (
              <Button variant="outline" disabled={pendente || estado.pararPedido} onClick={() => acao(() => pararDownloadAction())}>
                Parar
              </Button>
            ) : (
              <>
                <input
                  value={idTeste}
                  onChange={(e) => setIdTeste(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nº interno (opcional)"
                  aria-label="Nº interno da fatura a testar"
                  className="h-11 w-44 rounded-lg border border-border bg-surface px-3 text-sm"
                />
                <Button
                  variant="outline"
                  disabled={pendente}
                  onClick={() => acao(async () => setTeste(await testarDocumentoAction(idTeste ? Number(idTeste) : undefined)))}
                  title="Descarrega uma fatura (a mais recente, ou a do nº interno indicado) só para ver se o link funciona. Não guarda nada."
                >
                  Testar um documento
                </Button>
                <Button
                  variant="outline"
                  disabled={pendente || !destino}
                  onClick={() => acao(() => iniciarDownloadAction(false, true))}
                  title="Lê os ficheiros que já estão no S3 e marca como guardadas as faturas que lá estão com o nome certo. Não descarrega nada."
                >
                  Pré-análise do S3
                </Button>
                {contagem.comErro > 0 && (
                  <Button variant="outline" disabled={pendente || !destino} onClick={() => acao(() => iniciarDownloadAction(true))}>
                    Tentar outra vez os que falharam
                  </Button>
                )}
                {falta > 0 && (
                  <Button disabled={pendente || !destino} onClick={() => acao(() => iniciarDownloadAction(false))}>
                    {contagem.guardados > 0 ? "Continuar a descarregar" : "Descarregar todos"}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Documentos guardados">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            <b className="font-heading text-2xl font-bold">{n(contagem.guardados)}</b> <span className="text-muted-foreground">de {n(contagem.total)} guardados</span>
          </span>
          <span className="tabular-nums text-muted-foreground">{pct.toLocaleString("pt-PT")}%</span>
        </div>
        <div className="mt-2 h-2 w-full rounded bg-muted">
          <div className="h-2 rounded bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {n(falta)} por descarregar · <span className={contagem.comErro ? "font-semibold text-destructive" : ""}>{n(contagem.comErro)} com erro</span>
          {contagem.semLink ? ` · ${n(contagem.semLink)} sem link no Cegid` : ""}
        </p>
        {porMinuto > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Ritmo (últimos minutos): <b className="font-semibold text-foreground">{n(Math.round(porMinuto))} por minuto</b> · faltam cerca de{" "}
            <b className="font-semibold text-foreground">{duracao(falta / porMinuto)}</b>
            {estado.paralelosAtuais ? ` · ${estado.paralelosAtuais} ao mesmo tempo` : ""}
            {estado.paginasPorMinuto ? ` · ritmo do Cegid ${estado.paginasPorMinuto} páginas/min (automático)` : ""}
            {estado.segundosPorDocumento ? ` · ${estado.segundosPorDocumento.toFixed(1)} s por fatura` : ""}
            {estado.esperas429 ? (
              <span className="text-destructive"> · o Cegid pediu para abrandar {estado.esperas429}×</span>
            ) : null}
          </p>
        )}
      </div>

      {Object.keys(estado.pedidos ?? {}).length > 0 && estado.feitosNestaExecucao + estado.errosNestaExecucao > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Pedidos ao Cegid nesta execução:{" "}
            <b className="font-semibold text-foreground">
              {(Object.values(estado.pedidos).reduce((a, c) => a + c.n, 0) / (estado.feitosNestaExecucao + estado.errosNestaExecucao)).toFixed(1)} por fatura
            </b>
          </summary>
          <table className="mt-2 text-sm">
            <tbody>
              {Object.entries(estado.pedidos).map(([tipo, c]) => (
                <tr key={tipo}>
                  <td className="py-0.5 pr-6">{tipo}</td>
                  <td className="py-0.5 pr-6 text-right tabular-nums">{n(c.n)}</td>
                  <td className="py-0.5 text-right tabular-nums text-muted-foreground">{c.travoes ? `${n(c.travoes)} com 429` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {divisao.de > 1 && (
        <p className="mt-3 text-sm">
          Este PC trata a <b className="font-semibold">parte {divisao.parte} de {divisao.de}</b> das faturas (o progresso acima conta todas as partes).
        </p>
      )}
      {(estado.aCorrer || estado.ultimaMensagem) && (
        <p className="mt-3 text-sm">
          {estado.aCorrer && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />}
          {estado.ultimaMensagem}
          {estado.iniciadoPor ? <span className="text-muted-foreground"> · iniciado por {estado.iniciadoPor}</span> : null}
        </p>
      )}
      {estado.analise && (
        <div className="mt-4 rounded-lg border border-border p-4 text-sm">
          <p className="font-semibold">
            Pré-análise do destino{" "}
            <span className="font-normal text-muted-foreground">
              ({new Date(estado.analise.em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })} · {estado.analise.destino})
            </span>
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            {[
              ["Ficheiros no S3", estado.analise.ficheirosNoDestino],
              ["Faturas já lá", estado.analise.jaNoDestino],
              ["Por enviar", estado.analise.porEnviar],
              ["Ficheiros sem fatura", estado.analise.semFatura],
            ].map(([t, v]) => (
              <div key={t as string}>
                <dt className="text-muted-foreground">{t}</dt>
                <dd className="font-heading text-xl font-bold tabular-nums">{n(v as number)}</dd>
              </div>
            ))}
          </dl>
          {estado.analise.comNomeAntigo > 0 && (
            <p className="mt-2 text-muted-foreground">{n(estado.analise.comNomeAntigo)} tinham sido guardadas com outro nome e vão ser enviadas outra vez com o nome da fatura.</p>
          )}
          {estado.analise.exemplosPorEnviar.length > 0 && (
            <p className="mt-2 break-words text-muted-foreground">
              Por enviar, por exemplo: <span className="font-mono text-xs">{estado.analise.exemplosPorEnviar.join(" · ")}</span>
            </p>
          )}
          {estado.analise.exemplosSemFatura.length > 0 && (
            <p className="mt-2 break-words text-muted-foreground">
              No S3 sem fatura correspondente (outros nomes): <span className="font-mono text-xs">{estado.analise.exemplosSemFatura.join(" · ")}</span>
            </p>
          )}
        </div>
      )}
      {teste && (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${teste.ok ? "border-border" : "border-destructive"}`}>
          <p className={teste.ok ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {teste.resultado}
            {teste.mpinvId ? <span className="font-normal text-muted-foreground"> (fatura nº interno {teste.mpinvId})</span> : null}
          </p>
          {teste.temPagina && (
            <p className="mt-2">
              O link devolveu uma página web em vez do PDF.{" "}
              <a href="/api/cegid/pagina-teste" className="font-semibold text-accent hover:underline">
                Descarregar a página recebida
              </a>{" "}
              (para enviar a quem está a configurar).
            </p>
          )}
          {teste.passos.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              {teste.passos.map((p, i) => (
                <li key={i} className="break-all">
                  {p}
                </li>
              ))}
            </ol>
          )}
          {teste.enderecos.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Endereços encontrados na página ({teste.enderecos.length})</summary>
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                {teste.enderecos.map((u) => (
                  <li key={u} className="break-all">
                    {u}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {ultimas.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Últimas enviadas para o S3</p>
          <ul className="mt-1 divide-y divide-[--border]">
            {ultimas.map((u) => (
              <li key={u.mpinv_id} className="flex flex-wrap items-baseline gap-x-4 py-1">
                <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                  {new Date(u.atualizado_em).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <a href={`/cegid/${u.mpinv_id}`} className="font-semibold text-accent hover:underline">
                  {u.numero ?? `nº interno ${u.mpinv_id}`}
                </a>
                <span className="text-muted-foreground">
                  {String(u.mes).padStart(2, "0")}/{u.ano} · cliente {u.user_id}
                </span>
                <a href={`/api/cegid/documento/${u.mpinv_id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {semSessao && (
        <p className="mt-3 text-sm text-destructive">
          A sessão expirou. O download continua a correr no servidor —{" "}
          <a href="/login" className="font-semibold underline">
            entre outra vez
          </a>{" "}
          para ver o progresso.
        </p>
      )}
      {!destino && <p className="mt-3 text-sm text-destructive">Falta configurar o S3 no config.properties (cegid.s3.endpoint, cegid.s3.bucket, cegid.s3.access_key, cegid.s3.secret_key).</p>}
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
    </div>
  );
}
