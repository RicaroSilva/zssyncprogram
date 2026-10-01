import { OPERACOES, type Operacao } from "./especificacao";

/**
 * As áreas do ZSGO na página (uma por recurso da API). O que cada uma deixa
 * fazer (listar, ver, criar, editar, eliminar, anular, PDF, XML, ativar…)
 * não está escrito aqui: vem da especificação — se a operação existe na API,
 * aparece o botão. Aqui só fica o nome, o grupo e as colunas da lista (a API
 * não descreve as respostas; quando uma coluna não existir na resposta, a
 * lista mostra as primeiras colunas que encontrar).
 */

export interface Coluna {
  titulo: string;
  /** Caminhos alternativos no objeto devolvido (o primeiro que existir). */
  caminhos: string[];
  tipo?: "euro" | "data" | "sim-nao" | "estado";
}

export interface RecursoZsgo {
  slug: string;
  nome: string;
  singular: string;
  grupo: "Vendas" | "Compras" | "Tesouraria" | "Artigos e stock" | "Configuração" | "Exportações";
  caminho: string;
  /** Nome do parâmetro no caminho do item ({id}, {code}, …). */
  parametro?: string;
  /** Onde está a chave do item no objeto da lista. */
  caminhosChave?: string[];
  colunas?: Coluna[];
  descricao: string;
  /** Só na versão PRO do ZSGO (as outras respondem 403). */
  pro?: boolean;
}

export const RECURSOS_ZSGO: RecursoZsgo[] = [
  {
    slug: "documentos-venda",
    nome: "Documentos de venda",
    singular: "documento de venda",
    grupo: "Vendas",
    caminho: "/sales",
    parametro: "id",
    caminhosChave: ["id"],
    descricao: "Faturas, faturas-recibo, notas de crédito, guias, orçamentos…",
    colunas: [
      { titulo: "Documento", caminhos: ["document.label", "document.full_number", "label", "number"] },
      { titulo: "Cliente", caminhos: ["customer.name", "customer.code"] },
      { titulo: "Data", caminhos: ["document.issue_date", "issue_date", "date"], tipo: "data" },
      { titulo: "Total", caminhos: ["totals.total", "total"], tipo: "euro" },
      { titulo: "Estado", caminhos: ["status", "document.status"], tipo: "estado" },
    ],
  },
  {
    slug: "clientes",
    nome: "Clientes",
    singular: "cliente",
    grupo: "Vendas",
    caminho: "/clients",
    parametro: "code",
    caminhosChave: ["code", "identity.code"],
    descricao: "Fichas de cliente no ZSGO.",
    colunas: [
      { titulo: "Código", caminhos: ["code", "identity.code"] },
      { titulo: "Nome", caminhos: ["identity.name", "name"] },
      { titulo: "NIF", caminhos: ["identity.tax_id", "tax_id"] },
      { titulo: "Localidade", caminhos: ["address.city", "city"] },
      { titulo: "Email", caminhos: ["settings.email", "email"] },
    ],
  },
  { slug: "vendedores", nome: "Vendedores", singular: "vendedor", grupo: "Vendas", caminho: "/salesmen", parametro: "code", caminhosChave: ["code"], descricao: "Vendedores e comissões." },
  {
    slug: "agendamentos",
    nome: "Agendamentos",
    singular: "agendamento",
    grupo: "Vendas",
    caminho: "/schedules",
    parametro: "id",
    caminhosChave: ["id"],
    descricao: "Documentos que o ZSGO emite sozinho periodicamente (avenças).",
  },
  { slug: "comissoes", nome: "Comissões", singular: "comissão", grupo: "Vendas", caminho: "/commissions", descricao: "Comissões dos vendedores por documento." },
  {
    slug: "recibos",
    nome: "Recibos",
    singular: "recibo",
    grupo: "Tesouraria",
    caminho: "/treasury/receipts",
    parametro: "id",
    caminhosChave: ["id"],
    descricao: "Recibos de clientes (liquidar faturas).",
    colunas: [
      { titulo: "Recibo", caminhos: ["document.label", "document.full_number", "label", "number"] },
      { titulo: "Cliente", caminhos: ["customer.name", "customer.code"] },
      { titulo: "Data", caminhos: ["document.issue_date", "issue_date"], tipo: "data" },
      { titulo: "Total", caminhos: ["totals.total", "total", "amount"], tipo: "euro" },
      { titulo: "Estado", caminhos: ["status"], tipo: "estado" },
    ],
  },
  {
    slug: "pagamentos",
    nome: "Pagamentos a fornecedores",
    singular: "pagamento",
    grupo: "Tesouraria",
    caminho: "/treasury/payments",
    parametro: "id",
    caminhosChave: ["id"],
    pro: true,
    descricao: "Pagamentos que liquidam documentos de compra.",
  },
  {
    slug: "documentos-compra",
    nome: "Documentos de compra",
    singular: "documento de compra",
    grupo: "Compras",
    caminho: "/purchases",
    parametro: "id",
    caminhosChave: ["id"],
    pro: true,
    descricao: "Faturas de fornecedores e outros documentos de compra.",
  },
  { slug: "fornecedores", nome: "Fornecedores", singular: "fornecedor", grupo: "Compras", caminho: "/suppliers", parametro: "code", caminhosChave: ["code", "identity.code"], descricao: "Fichas de fornecedor.", colunas: [
    { titulo: "Código", caminhos: ["code", "identity.code"] },
    { titulo: "Nome", caminhos: ["identity.name", "name"] },
    { titulo: "NIF", caminhos: ["identity.tax_id", "tax_id"] },
    { titulo: "Localidade", caminhos: ["address.city", "city"] },
  ] },
  {
    slug: "artigos",
    nome: "Artigos",
    singular: "artigo",
    grupo: "Artigos e stock",
    caminho: "/products",
    parametro: "reference",
    caminhosChave: ["reference", "code"],
    descricao: "Produtos e serviços faturados.",
    colunas: [
      { titulo: "Referência", caminhos: ["reference", "code"] },
      { titulo: "Descrição", caminhos: ["description", "name"] },
      { titulo: "Família", caminhos: ["family.description", "family_id", "family"] },
      { titulo: "Unidade", caminhos: ["unit_code", "unit.code", "unit"] },
      { titulo: "Ativo", caminhos: ["active"], tipo: "sim-nao" },
    ],
  },
  { slug: "familias", nome: "Famílias", singular: "família", grupo: "Artigos e stock", caminho: "/families", parametro: "id", caminhosChave: ["id"], descricao: "Famílias de artigos." },
  { slug: "unidades", nome: "Unidades", singular: "unidade", grupo: "Artigos e stock", caminho: "/units", parametro: "code", caminhosChave: ["code"], descricao: "Unidades de medida." },
  { slug: "documentos-stock", nome: "Documentos de stock", singular: "documento de stock", grupo: "Artigos e stock", caminho: "/stocks", parametro: "id", caminhosChave: ["id"], pro: true, descricao: "Entradas, saídas e transferências de stock." },
  { slug: "armazens", nome: "Armazéns", singular: "armazém", grupo: "Artigos e stock", caminho: "/warehouses", descricao: "Armazéns (só consulta)." },
  { slug: "metodos-pagamento", nome: "Métodos de pagamento", singular: "método de pagamento", grupo: "Configuração", caminho: "/payment-methods", parametro: "id", caminhosChave: ["id"], descricao: "Numerário, multibanco, transferência…" },
  { slug: "condicoes-pagamento", nome: "Condições de pagamento", singular: "condição de pagamento", grupo: "Configuração", caminho: "/payment-options", parametro: "id", caminhosChave: ["id"], descricao: "Prazos de pagamento." },
  { slug: "series", nome: "Séries", singular: "série", grupo: "Configuração", caminho: "/series", descricao: "Séries de documentos (só consulta)." },
  { slug: "tipos-documento", nome: "Tipos de documento", singular: "tipo de documento", grupo: "Configuração", caminho: "/document-types", descricao: "Tipos de documento (só consulta)." },
  { slug: "linhas-preco", nome: "Linhas de preço", singular: "linha de preço", grupo: "Configuração", caminho: "/price-lines", descricao: "Linhas de preço (só consulta)." },
  { slug: "isencoes", nome: "Motivos de isenção", singular: "motivo de isenção", grupo: "Configuração", caminho: "/exemptions", descricao: "Códigos de isenção de IVA (só consulta)." },
  { slug: "paises", nome: "Países", singular: "país", grupo: "Configuração", caminho: "/countries", descricao: "Países (só consulta)." },
  { slug: "saft", nome: "Exportação SAF-T", singular: "exportação SAF-T", grupo: "Exportações", caminho: "/saft-exports", parametro: "processId", descricao: "Gerar e descarregar o ficheiro SAF-T (anual, mensal ou por datas)." },
];

export const GRUPOS_ZSGO = ["Vendas", "Tesouraria", "Compras", "Artigos e stock", "Configuração", "Exportações"] as const;

export function recursoPorSlug(slug: string): RecursoZsgo | undefined {
  return RECURSOS_ZSGO.find((r) => r.slug === slug);
}

/** As operações da API para este recurso, por tipo. */
export function operacoesDe(r: RecursoZsgo) {
  const item = r.parametro ? `${r.caminho}/{${r.parametro}}` : null;
  const op = (metodo: string, caminho: string | null): Operacao | undefined => (caminho ? OPERACOES.find((o) => o.metodo === metodo && o.caminho === caminho) : undefined);
  return {
    listar: op("GET", r.caminho),
    criar: op("POST", r.caminho),
    ver: op("GET", item),
    editar: op("PATCH", item),
    eliminar: op("DELETE", item),
    anular: op("POST", item && `${item}/annul`),
    pdf: op("GET", item && `${item}/pdf`),
    xml: op("GET", item && `${item}/xml`),
    descarregar: op("GET", item && `${item}/download`),
    ativar: op("PATCH", item && `${item}/activate`),
    desativar: op("PATCH", item && `${item}/deactivate`),
    proximos: op("GET", item && `${item}/next-documents`),
    pendentes: op("GET", `${r.caminho}/pending-documents`),
  };
}

/** Valor num caminho "a.b.c" de um objeto. */
export function valorEm(objeto: unknown, caminho: string): unknown {
  let atual: unknown = objeto;
  for (const parte of caminho.split(".")) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

export function primeiroValor(objeto: unknown, caminhos: string[]): unknown {
  for (const c of caminhos) {
    const v = valorEm(objeto, c);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** A chave do item (para abrir o detalhe). */
export function chaveDoItem(r: RecursoZsgo, item: unknown): string | undefined {
  const v = primeiroValor(item, r.caminhosChave ?? ["id", "code", "reference"]);
  return v === undefined ? undefined : String(v);
}

/** Colunas automáticas: os primeiros campos simples do primeiro item. */
export function colunasAutomaticas(itens: unknown[]): Coluna[] {
  const primeiro = itens.find((i) => i && typeof i === "object") as Record<string, unknown> | undefined;
  if (!primeiro) return [];
  const colunas: Coluna[] = [];
  const juntar = (obj: Record<string, unknown>, prefixo: string) => {
    for (const [k, v] of Object.entries(obj)) {
      if (colunas.length >= 6) return;
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !prefixo) juntar(v as Record<string, unknown>, `${k}.`);
      else if (v === null || ["string", "number", "boolean"].includes(typeof v)) colunas.push({ titulo: `${prefixo}${k}`, caminhos: [`${prefixo}${k}`], tipo: typeof v === "boolean" ? "sim-nao" : undefined });
    }
  };
  juntar(primeiro, "");
  return colunas;
}
