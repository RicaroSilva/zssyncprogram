"use client";

import { useId, useState } from "react";
import { Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";
import { tipoDe, type Esquema } from "@/lib/zsgo/especificacao";
import { rotulo } from "@/lib/zsgo/rotulos";

/**
 * Formulário gerado a partir do esquema do pedido na especificação do ZSGO:
 * objetos → secções, listas de objetos → linhas que se acrescentam/tiram,
 * enum → escolha, datas, números, sim/não. Campos que apontam para outras
 * tabelas (país, série, artigo, cliente…) têm sugestões, mas aceitam
 * qualquer valor. Ao enviar, os campos vazios não obrigatórios não vão.
 */

export interface OpcaoSeletor {
  valor: string;
  rotulo: string;
}

type Valor = unknown;
type Objeto = Record<string, Valor>;

const campoClasse =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]";

function obsoleto(e: Esquema): boolean {
  return /^deprecated/i.test(e.description ?? "");
}

function obter(obj: Valor, caminho: (string | number)[]): Valor {
  let atual: Valor = obj;
  for (const p of caminho) atual = atual && typeof atual === "object" ? (atual as Record<string | number, Valor>)[p] : undefined;
  return atual;
}

function definir(obj: Valor, caminho: (string | number)[], valor: Valor): Valor {
  if (caminho.length === 0) return valor;
  const [p, ...resto] = caminho;
  const base = Array.isArray(obj) ? [...obj] : { ...((obj as Objeto) ?? {}) };
  (base as Record<string | number, Valor>)[p!] = definir((obj as Record<string | number, Valor> | undefined)?.[p!], resto, valor);
  return base;
}

/** Remove vazios e converte tipos (o que vai para o ZSGO). */
export function limparValor(e: Esquema, v: Valor): Valor {
  const t = tipoDe(e);
  if (t === "object") {
    const r: Objeto = {};
    for (const [k, sub] of Object.entries(e.properties ?? {})) {
      if (obsoleto(sub)) continue;
      const lv = limparValor(sub, (v as Objeto | undefined)?.[k]);
      if (lv !== undefined) r[k] = lv;
    }
    return Object.keys(r).length ? r : undefined;
  }
  if (t === "array") {
    if (!Array.isArray(v)) {
      if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
      return undefined;
    }
    const itens = v.map((x) => (e.items ? limparValor(e.items, x) : x)).filter((x) => x !== undefined);
    return itens.length ? itens : undefined;
  }
  if (v === undefined || v === null || v === "") return undefined;
  if (t === "integer" || t === "number") {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? (t === "integer" ? Math.trunc(n) : n) : undefined;
  }
  if (t === "boolean") return v === true || v === "true" ? true : v === false || v === "false" ? false : undefined;
  return String(v);
}

/** Campos obrigatórios em falta ("customer.code", "items.1.quantity"). */
function emFalta(e: Esquema, v: Valor, prefixo: string): string[] {
  const t = tipoDe(e);
  const falta: string[] = [];
  if (t === "object") {
    for (const [k, sub] of Object.entries(e.properties ?? {})) {
      const caminho = prefixo ? `${prefixo} › ${rotulo(k)}` : rotulo(k);
      const valor = (v as Objeto | undefined)?.[k];
      const vazio = limparValor(sub, valor) === undefined;
      if ((e.required ?? []).includes(k) && vazio && !obsoleto(sub)) falta.push(caminho);
      else if (!vazio) falta.push(...emFalta(sub, valor, caminho));
    }
  } else if (t === "array" && Array.isArray(v) && e.items) {
    v.forEach((x, i) => falta.push(...emFalta(e.items!, x, `${prefixo} ${i + 1}`)));
  }
  return falta;
}

function valoresDaDescricao(d?: string): string[] | undefined {
  const m = d?.match(/Allowed (?:types|values)\s*:\s*([A-Z0-9_]+(?:\s*,\s*[A-Z0-9_]+)+)/);
  return m ? m[1]!.split(",").map((x) => x.trim()) : undefined;
}

function Ajuda({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <span title={texto} className="ml-1 inline-flex cursor-help align-middle text-muted-foreground">
      <Info className="h-3.5 w-3.5" aria-label={texto} />
    </span>
  );
}

function CampoSimples({
  nome,
  esquema,
  valor,
  obrigatorio,
  opcoes,
  alterar,
  compacto,
}: {
  nome: string;
  esquema: Esquema;
  valor: Valor;
  obrigatorio: boolean;
  opcoes?: OpcaoSeletor[];
  alterar: (v: Valor) => void;
  compacto?: boolean;
}) {
  const id = useId();
  const t = tipoDe(esquema);
  const texto = valor === undefined || valor === null ? "" : String(valor);
  // Valores possíveis: o enum ou, quando a API só os descreve em texto,
  // o "Allowed types: FA, FR, …" da descrição.
  const enumeracao = esquema.enum?.filter((x) => x !== null) ?? valoresDaDescricao(esquema.description);
  let controlo: React.ReactNode;
  if (enumeracao && enumeracao.length) {
    controlo = (
      <select id={id} value={texto} onChange={(e) => alterar(e.target.value)} className={campoClasse}>
        <option value="">{obrigatorio ? "— escolher —" : "—"}</option>
        {enumeracao.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    );
  } else if (t === "boolean") {
    controlo = (
      <select id={id} value={valor === true ? "true" : valor === false ? "false" : texto} onChange={(e) => alterar(e.target.value)} className={campoClasse}>
        <option value="">—</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  } else {
    const tipoInput = esquema.format === "date" || /_date$|^date_/.test(nome) ? "date" : t === "integer" || t === "number" ? "number" : nome === "email" || nome === "to" ? "email" : "text";
    controlo = (
      <>
        <input
          id={id}
          type={tipoInput}
          step={t === "number" ? "any" : undefined}
          min={esquema.minimum}
          max={esquema.maximum}
          maxLength={esquema.maxLength}
          value={texto}
          list={opcoes?.length ? `${id}-lista` : undefined}
          onChange={(e) => alterar(e.target.value)}
          className={campoClasse}
          placeholder={opcoes?.length ? "Escolher ou escrever…" : undefined}
        />
        {opcoes?.length ? (
          <datalist id={`${id}-lista`}>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </datalist>
        ) : null}
      </>
    );
  }
  return (
    <div className={compacto ? "min-w-36 flex-1" : undefined}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted-foreground">
        {nome === "email" ? "Email" : rotulo(nome)}
        {obrigatorio && <span className="text-destructive"> *</span>}
        <Ajuda texto={esquema.description} />
      </label>
      {controlo}
    </div>
  );
}

function Secao({
  nome,
  esquema,
  valor,
  caminho,
  obrigatorio,
  opcoes,
  alterar,
  nivel,
}: {
  nome: string;
  esquema: Esquema;
  valor: Valor;
  caminho: (string | number)[];
  obrigatorio: boolean;
  opcoes: Record<string, OpcaoSeletor[]>;
  alterar: (caminho: (string | number)[], v: Valor) => void;
  nivel: number;
}) {
  const opcional = !obrigatorio;
  const [aberta, setAberta] = useState(!opcional || valor !== undefined);
  if (!aberta) {
    return (
      <button type="button" onClick={() => setAberta(true)} className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        <Plus className="h-4 w-4" /> {rotulo(nome)} (opcional)
      </button>
    );
  }
  return (
    <fieldset className={cn("rounded-lg border border-border p-4", nivel > 1 && "bg-surface-2")}>
      <legend className="px-1 text-sm font-semibold">
        {rotulo(nome)}
        {obrigatorio && <span className="text-destructive"> *</span>}
        <Ajuda texto={esquema.description} />
      </legend>
      <Campos esquema={esquema} valor={valor} caminho={caminho} opcoes={opcoes} alterar={alterar} nivel={nivel} />
    </fieldset>
  );
}

function Lista({
  nome,
  esquema,
  valor,
  caminho,
  obrigatorio,
  opcoes,
  alterar,
  nivel,
}: {
  nome: string;
  esquema: Esquema;
  valor: Valor;
  caminho: (string | number)[];
  obrigatorio: boolean;
  opcoes: Record<string, OpcaoSeletor[]>;
  alterar: (caminho: (string | number)[], v: Valor) => void;
  nivel: number;
}) {
  const linhas = Array.isArray(valor) ? valor : [];
  const itemEsquema = esquema.items ?? {};
  const deObjetos = tipoDe(itemEsquema) === "object";
  if (!deObjetos) {
    return (
      <CampoSimples
        nome={nome}
        esquema={{ ...esquema, type: "string", description: `${esquema.description ?? ""} (separar por vírgulas)`.trim() }}
        valor={Array.isArray(valor) ? valor.join(", ") : valor}
        obrigatorio={obrigatorio}
        alterar={(v) => alterar(caminho, v)}
      />
    );
  }
  const chaveOpcoes = caminho.filter((p) => typeof p === "string").join(".");
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">
        {rotulo(nome)}
        {obrigatorio && <span className="text-destructive"> *</span>}
        <Ajuda texto={esquema.description} />
      </legend>
      <div className="space-y-3">
        {linhas.map((linha, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3">
            <span className="mt-7 w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground">{i + 1}</span>
            <div className="flex flex-1 flex-wrap gap-3">
              {Object.entries(itemEsquema.properties ?? {})
                .filter(([, sub]) => !obsoleto(sub))
                .map(([k, sub]) =>
                  tipoDe(sub) === "object" || tipoDe(sub) === "array" ? (
                    <div key={k} className="w-full">
                      <Campo nome={k} esquema={sub} valor={(linha as Objeto)?.[k]} caminho={[...caminho, i, k]} obrigatorio={(itemEsquema.required ?? []).includes(k)} opcoes={opcoes} alterar={alterar} nivel={nivel + 1} />
                    </div>
                  ) : (
                    <CampoSimples
                      key={k}
                      compacto
                      nome={k}
                      esquema={sub}
                      valor={(linha as Objeto)?.[k]}
                      obrigatorio={(itemEsquema.required ?? []).includes(k)}
                      opcoes={opcoes[`${chaveOpcoes}.${k}`]}
                      alterar={(v) => alterar([...caminho, i, k], v)}
                    />
                  ),
                )}
            </div>
            <button
              type="button"
              aria-label={`Tirar a linha ${i + 1}`}
              onClick={() => alterar(caminho, linhas.filter((_, j) => j !== i))}
              className="mt-6 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => alterar(caminho, [...linhas, {}])} className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          <Plus className="h-4 w-4" /> Acrescentar linha
        </button>
      </div>
    </fieldset>
  );
}

function Campo(props: {
  nome: string;
  esquema: Esquema;
  valor: Valor;
  caminho: (string | number)[];
  obrigatorio: boolean;
  opcoes: Record<string, OpcaoSeletor[]>;
  alterar: (caminho: (string | number)[], v: Valor) => void;
  nivel: number;
}) {
  const t = tipoDe(props.esquema);
  if (t === "object") return <Secao {...props} />;
  if (t === "array") return <Lista {...props} />;
  const chave = props.caminho.filter((p) => typeof p === "string").join(".");
  return (
    <CampoSimples
      nome={props.nome}
      esquema={props.esquema}
      valor={props.valor}
      obrigatorio={props.obrigatorio}
      opcoes={props.opcoes[chave]}
      alterar={(v) => props.alterar(props.caminho, v)}
    />
  );
}

function Campos({
  esquema,
  valor,
  caminho,
  opcoes,
  alterar,
  nivel,
}: {
  esquema: Esquema;
  valor: Valor;
  caminho: (string | number)[];
  opcoes: Record<string, OpcaoSeletor[]>;
  alterar: (caminho: (string | number)[], v: Valor) => void;
  nivel: number;
}) {
  const props = Object.entries(esquema.properties ?? {}).filter(([, sub]) => !obsoleto(sub));
  const simples = props.filter(([, sub]) => !["object", "array"].includes(tipoDe(sub) ?? ""));
  const compostos = props.filter(([, sub]) => ["object", "array"].includes(tipoDe(sub) ?? ""));
  return (
    <div className="space-y-4">
      {simples.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {simples.map(([k, sub]) => (
            <Campo key={k} nome={k} esquema={sub} valor={(valor as Objeto | undefined)?.[k]} caminho={[...caminho, k]} obrigatorio={(esquema.required ?? []).includes(k)} opcoes={opcoes} alterar={alterar} nivel={nivel + 1} />
          ))}
        </div>
      )}
      {compostos.map(([k, sub]) => (
        <Campo key={k} nome={k} esquema={sub} valor={(valor as Objeto | undefined)?.[k]} caminho={[...caminho, k]} obrigatorio={(esquema.required ?? []).includes(k)} opcoes={opcoes} alterar={alterar} nivel={nivel + 1} />
      ))}
    </div>
  );
}

export function FormularioZsgo({
  esquema,
  inicial,
  opcoes,
  textoBotao,
  aoEnviar,
  aoCancelar,
  confirmar,
}: {
  esquema: Esquema;
  inicial?: Objeto;
  opcoes: Record<string, OpcaoSeletor[]>;
  textoBotao: string;
  aoEnviar: (corpo: Valor) => Promise<{ ok: boolean; erro?: string }>;
  aoCancelar?: () => void;
  confirmar?: string;
}) {
  const [valor, setValor] = useState<Valor>(inicial ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  function alterar(caminho: (string | number)[], v: Valor) {
    setValor((atual: Valor) => definir(atual, caminho, v));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    const falta = emFalta(esquema, valor, "");
    if (falta.length) {
      setErro(`Falta preencher: ${falta.join(", ")}.`);
      return;
    }
    if (confirmar && !window.confirm(confirmar)) return;
    setAEnviar(true);
    try {
      const r = await aoEnviar(limparValor(esquema, valor) ?? {});
      if (!r.ok) setErro(r.erro ?? "Não foi possível guardar.");
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <Campos esquema={esquema} valor={valor} caminho={[]} opcoes={opcoes} alterar={alterar} nivel={0} />
      {erro && <p className="whitespace-pre-line rounded-lg border border-destructive-40 bg-destructive-10 p-3 text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={aEnviar}>
          {aEnviar ? "A enviar ao ZSGO…" : textoBotao}
        </Button>
        {aoCancelar && (
          <Button type="button" variant="outline" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

