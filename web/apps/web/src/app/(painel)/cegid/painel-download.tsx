"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { iniciarDownloadAction, pararDownloadAction, progressoDownloadAction, testarDocumentoAction } from "./actions";

type Progresso = Awaited<ReturnType<typeof progressoDownloadAction>>;

const n = (x: number) => new Intl.NumberFormat("pt-PT").format(x);

/** Cópia de segurança dos documentos do Cegid para o S3: progresso, iniciar/continuar, parar. */
export function PainelDownload({ inicial, podeIniciar, destino }: { inicial: Progresso; podeIniciar: boolean; destino: string | null }) {
  const [p, setP] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<Awaited<ReturnType<typeof testarDocumentoAction>> | null>(null);
  const [pendente, iniciar] = useTransition();
  const { estado, contagem } = p;

  useEffect(() => {
    if (!estado.aCorrer) return;
    const t = setInterval(() => progressoDownloadAction().then(setP).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [estado.aCorrer]);

  const acao = (f: () => Promise<unknown>) =>
    iniciar(async () => {
      setErro(null);
      const r = (await f()) as { ok?: boolean; erro?: string } | undefined;
      if (r && r.ok === false) setErro(r.erro ?? "Não foi possível.");
      setP(await progressoDownloadAction());
    });

  const pct = contagem.total ? Math.floor((contagem.guardados / contagem.total) * 1000) / 10 : 0;
  const falta = Math.max(0, contagem.total - contagem.guardados - contagem.comErro);

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-base font-semibold">Cópia dos documentos (antes de a licença do Cegid acabar)</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Descarrega o PDF de cada fatura pelo link do Cegid e guarda-o {destino ? <b className="font-semibold">({destino})</b> : "no S3"}. Pode parar e continuar quando quiser: continua onde ficou.
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
                <Button variant="outline" disabled={pendente} onClick={() => acao(async () => setTeste(await testarDocumentoAction()))} title="Descarrega a fatura mais recente só para ver se o link funciona. Não guarda nada.">
                  Testar um documento
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
      </div>

      {(estado.aCorrer || estado.ultimaMensagem) && (
        <p className="mt-3 text-sm">
          {estado.aCorrer && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />}
          {estado.ultimaMensagem}
          {estado.iniciadoPor ? <span className="text-muted-foreground"> · iniciado por {estado.iniciadoPor}</span> : null}
        </p>
      )}
      {teste && (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${teste.ok ? "border-border" : "border-destructive"}`}>
          <p className={teste.ok ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {teste.resultado}
            {teste.mpinvId ? <span className="font-normal text-muted-foreground"> (fatura nº interno {teste.mpinvId})</span> : null}
          </p>
          {teste.passos.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              {teste.passos.map((p, i) => (
                <li key={i} className="break-all">
                  {p}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {!destino && <p className="mt-3 text-sm text-destructive">Falta configurar o S3 no config.properties (cegid.s3.endpoint, cegid.s3.bucket, cegid.s3.access_key, cegid.s3.secret_key).</p>}
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
    </div>
  );
}
