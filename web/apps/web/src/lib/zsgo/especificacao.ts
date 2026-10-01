import especificacao from "./gerado/especificacao.json";

/**
 * A especificação OpenAPI do ZSGO (docs/zsgo-api-1.3.yaml, convertida por
 * scripts-zsgo-spec.py). O módulo ZSGO da página é gerado a partir dela:
 * que operações existem, que filtros cada lista aceita e que campos tem
 * cada formulário. Uma versão nova da API → voltar a gerar o JSON.
 */

export interface Esquema {
  type?: string | string[];
  enum?: Array<string | number | null>;
  format?: string;
  description?: string;
  required?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  default?: unknown;
  properties?: Record<string, Esquema>;
  items?: Esquema;
  oneOf?: Esquema[];
  anyOf?: Esquema[];
  allOf?: Esquema[];
}

export interface Parametro {
  nome: string;
  em: string;
  obrigatorio: boolean;
  descricao: string;
  esquema: Esquema;
}

export interface Operacao {
  metodo: string;
  caminho: string;
  resumo: string;
  descricao: string;
  etiqueta: string;
  parametros: Parametro[];
  corpo: Esquema | null;
  respostas: string[];
}

export const OPERACOES = (especificacao as { operacoes: Operacao[] }).operacoes;
export const VERSAO_API = (especificacao as { versao: string }).versao;

export function operacao(metodo: string, caminho: string): Operacao | undefined {
  return OPERACOES.find((o) => o.metodo === metodo && o.caminho === caminho);
}

/** "/sales/{id}/pdf" + { id: "x" } → "/sales/x/pdf" (valores codificados). */
export function preencherCaminho(modelo: string, valores: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (_, nome: string) => {
    const v = valores[nome];
    if (v === undefined || v === "") throw new Error(`Falta o parâmetro ${nome}.`);
    return encodeURIComponent(v);
  });
}

/** O tipo principal de um esquema ("string", "integer", …), ignorando "null". */
export function tipoDe(e: Esquema): string | undefined {
  const t = Array.isArray(e.type) ? e.type.find((x) => x !== "null") : e.type;
  if (t) return t;
  if (e.properties) return "object";
  if (e.items) return "array";
  const alternativa = e.oneOf ?? e.anyOf;
  return alternativa ? tipoDe(alternativa.find((x) => tipoDe(x) !== "null") ?? {}) : undefined;
}

export function aceitaNulo(e: Esquema): boolean {
  return Array.isArray(e.type) && e.type.includes("null");
}

/** Pré-preenche um formulário com o que o ZSGO devolveu (mesmos caminhos do
 *  esquema do pedido; o resto da resposta é ignorado). */
export function preencherDeResposta(e: Esquema, resposta: unknown): unknown {
  const t = tipoDe(e);
  if (t === "object") {
    const r: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(e.properties ?? {})) {
      const p = preencherDeResposta(sub, (resposta as Record<string, unknown> | undefined)?.[k]);
      if (p !== undefined) r[k] = p;
    }
    return Object.keys(r).length ? r : undefined;
  }
  if (t === "array") return Array.isArray(resposta) ? resposta.map((x) => (e.items ? (preencherDeResposta(e.items, x) ?? {}) : x)) : undefined;
  if (resposta === null || resposta === undefined || typeof resposta === "object") return undefined;
  return resposta;
}
