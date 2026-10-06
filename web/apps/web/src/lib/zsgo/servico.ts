import "server-only";
import { ZsgoApi, ZsgoApiErro } from "./api";
import { OPERACOES, operacao, preencherCaminho, tipoDe, type Esquema } from "./especificacao";

/** Serviço genérico do módulo ZSGO: só faz operações que existem na especificação. */

export interface Lista {
  itens: unknown[];
  pagina: number;
  totalPaginas: number;
  total: number | null;
}

/** As listas do ZSGO vêm como { data: [...], meta } — às vezes cada item
 *  embrulhado num array, às vezes um objeto { código: nome }. */
export function normalizarLista(json: unknown): Lista {
  const raiz = json as { data?: unknown; meta?: { page?: number; page_count?: number; total_items?: number } } | unknown[];
  let dados: unknown = Array.isArray(raiz) ? raiz : (raiz as { data?: unknown })?.data;
  if (dados && typeof dados === "object" && !Array.isArray(dados)) {
    dados = Object.entries(dados as Record<string, unknown>).map(([codigo, v]) => (v && typeof v === "object" ? { code: codigo, ...(v as object) } : { code: codigo, name: v }));
  }
  const itens = (Array.isArray(dados) ? dados : []).map((i) => (Array.isArray(i) && i.length > 0 ? i[0] : i));
  const meta = Array.isArray(raiz) ? undefined : (raiz as { meta?: { page?: number; page_count?: number; total_items?: number } })?.meta;
  return { itens, pagina: meta?.page ?? 1, totalPaginas: meta?.page_count ?? 1, total: meta?.total_items ?? null };
}

/** Os dados de um item: { data: {...} } → {...}. */
export function normalizarItem(json: unknown): unknown {
  const d = (json as { data?: unknown })?.data ?? json;
  return Array.isArray(d) && d.length === 1 ? d[0] : d;
}

/**
 * Mensagem de erro a partir da resposta do ZSGO: o resumo (mensagem e erro de
 * cada campo), uma dica para 401/403 e SEMPRE a resposta completa, para se
 * perceber exatamente o que o ZSGO recusou.
 */
export function mensagemErro(status: number, json: unknown, texto: string): string {
  const j = json as { message?: unknown; errors?: unknown; error?: unknown } | null;
  const partes: string[] = [];
  if (j && typeof j.message === "string") partes.push(j.message);
  if (j && typeof j.error === "string") partes.push(j.error);
  if (j && j.errors && typeof j.errors === "object") {
    for (const [campo, msgs] of Object.entries(j.errors as Record<string, unknown>)) {
      const t = Array.isArray(msgs) ? msgs.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ") : typeof msgs === "string" ? msgs : JSON.stringify(msgs);
      partes.push(campo === "message" ? t : `${campo}: ${t}`);
    }
  }
  const extra = status === 403 ? " (esta funcionalidade pode exigir a versão PRO do ZSGO)" : status === 401 ? " (token do ZSGO inválido)" : "";
  const completa = json !== null && json !== undefined ? JSON.stringify(json, null, 2) : texto || "(resposta vazia)";
  return `O ZSGO respondeu ${status}${partes.length ? `: ${partes.join(" · ")}` : ""}${extra}\n\nResposta completa do ZSGO (HTTP ${status}):\n${completa}`;
}

/**
 * Executa uma operação da API. `modelo` é o caminho tal como está na
 * especificação ("/sales/{id}/annul"); recusa tudo o que lá não esteja.
 */
export async function executar(metodo: string, modelo: string, parametrosCaminho: Record<string, string>, query: Record<string, string> = {}, corpo?: unknown) {
  const op = operacao(metodo, modelo);
  if (!op) throw new Error(`Operação inexistente na API do ZSGO: ${metodo} ${modelo}`);
  const permitidos = new Set(op.parametros.filter((p) => p.em === "query").map((p) => p.nome));
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== "" && v !== undefined && permitidos.has(k)) q.set(k, v);
  const caminho = preencherCaminho(modelo, parametrosCaminho) + (q.size ? `?${q.toString()}` : "");
  return new ZsgoApi().generico(metodo, caminho, corpo);
}

export async function listar(modelo: string, query: Record<string, string>): Promise<Lista> {
  const r = await executar("GET", modelo, {}, query);
  if (r.status !== 200) throw new ZsgoApiErro(mensagemErro(r.status, r.json, r.texto), r.status);
  return normalizarLista(r.json);
}

export async function obter(modelo: string, parametros: Record<string, string>): Promise<unknown> {
  const r = await executar("GET", modelo, parametros);
  if (r.status !== 200) throw new ZsgoApiErro(mensagemErro(r.status, r.json, r.texto), r.status);
  return normalizarItem(r.json);
}

// ── seletores (opções para os campos que apontam para outras tabelas) ─────

export interface Opcao {
  valor: string;
  rotulo: string;
}

/** Campo do formulário → lista do ZSGO de onde vêm as opções. */
const FONTES: Record<string, string> = {
  payment_method_id: "/payment-methods",
  payment_option_id: "/payment-options",
  country_code: "/countries",
  series: "/series",
  exemption_code: "/exemptions",
  salesman_code: "/salesmen",
  warehouse_id: "/warehouses",
  product_reference: "/products",
  price_line: "/price-lines",
  parent_id: "/families",
  family_id: "/families",
  unit_code: "/units",
  "customer.code": "/clients",
  "supplier.code": "/suppliers",
  customer_code: "/clients",
  supplier_code: "/suppliers",
};

function primeiro(obj: Record<string, unknown>, chaves: string[]): string | undefined {
  for (const c of chaves) {
    const partes = c.split(".");
    let v: unknown = obj;
    for (const p of partes) v = v && typeof v === "object" ? (v as Record<string, unknown>)[p] : undefined;
    if (v !== undefined && v !== null && v !== "" && typeof v !== "object") return String(v);
  }
  return undefined;
}

const cacheOpcoes = new Map<string, { em: number; opcoes: Opcao[] }>();

async function opcoesDe(caminhoLista: string): Promise<Opcao[]> {
  const guardado = cacheOpcoes.get(caminhoLista);
  if (guardado && Date.now() - guardado.em < 60_000) return guardado.opcoes;
  const op = OPERACOES.find((o) => o.metodo === "GET" && o.caminho === caminhoLista);
  if (!op) return [];
  const query: Record<string, string> = op.parametros.some((p) => p.nome === "per_page") ? { per_page: "100" } : {};
  try {
    const lista = await listar(caminhoLista, query);
    const opcoes = lista.itens
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => {
        const valor = primeiro(i, ["id", "code", "identity.code", "reference", "acronym", "value"]);
        const nome = primeiro(i, ["identity.name", "name", "description", "designation", "label", "title"]);
        return valor ? { valor, rotulo: nome && nome !== valor ? `${valor} — ${nome}` : valor } : null;
      })
      .filter((o): o is Opcao => !!o);
    cacheOpcoes.set(caminhoLista, { em: Date.now(), opcoes });
    return opcoes;
  } catch {
    return [];
  }
}

/** Para cada campo do esquema que tem uma fonte, as opções (em paralelo). */
export async function opcoesParaEsquema(esquema: Esquema | null): Promise<Record<string, Opcao[]>> {
  if (!esquema) return {};
  const campos = new Map<string, string>();
  const percorrer = (e: Esquema, prefixo: string) => {
    for (const [nome, sub] of Object.entries(e.properties ?? {})) {
      const caminho = prefixo ? `${prefixo}.${nome}` : nome;
      const semIndices = caminho.replace(/\.\[\]/g, "");
      const fonte = FONTES[semIndices.split(".").slice(-2).join(".")] ?? FONTES[nome];
      if (fonte) campos.set(semIndices, fonte);
      if (tipoDe(sub) === "object") percorrer(sub, caminho);
      if (tipoDe(sub) === "array" && sub.items && tipoDe(sub.items) === "object") percorrer(sub.items, `${caminho}.[]`);
    }
  };
  percorrer(esquema, "");
  const resultado: Record<string, Opcao[]> = {};
  await Promise.all(
    [...campos.entries()].map(async ([campo, fonte]) => {
      resultado[campo] = await opcoesDe(fonte);
    }),
  );
  return resultado;
}

/** Opções para os filtros de uma lista (ex.: customer_code das pendentes). */
export async function opcoesParaParametros(nomes: string[]): Promise<Record<string, Opcao[]>> {
  const r: Record<string, Opcao[]> = {};
  await Promise.all(nomes.filter((n) => FONTES[n]).map(async (n) => (r[n] = await opcoesDe(FONTES[n]!))));
  return r;
}
