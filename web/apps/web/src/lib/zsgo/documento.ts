/**
 * Um documento de venda tal como está no ZSGO (GET /sales/{id} ou um
 * elemento de GET /sales) — leitura tolerante, igual a zsgo/ZsgoDocumento
 * do Java. Formato real confirmado (28/09/2026): status e customer no
 * topo; type/series/number/issue_date/reference/notes em "document";
 * totals{net,tax,total}; meta.page_count; pdf_url vem null na lista.
 */
export interface LinhaDocumento {
  id?: string;
  produto?: string;
  quantidade?: number;
  precoUnitario?: number;
  taxaIva?: number;
  total?: number;
  notas?: string;
}

export interface DocumentoZsgo {
  id?: string;
  numero?: string;
  /** Só o número sequencial (document.number, ex.: 11385). */
  numeroSimples?: string;
  serie?: string;
  tipo?: string;
  estado?: string;
  data?: string;
  total?: number;
  liquido?: number;
  iva?: number;
  anulado: boolean;
  linhas: LinhaDocumento[];
  pdfUrl?: string;
  referencia?: string;
  clienteCodigo?: string;
  notas?: string;
}

export interface PaginaDocumentos {
  documentos: DocumentoZsgo[];
  totalPaginas?: number;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Códigos de "status" que o ZSGO usa para anulados (zsgo.status.anulado=8,9). */
let codigosAnulado = new Set<string>();
export function configurarCodigosAnulado(valor: string | null | undefined): void {
  codigosAnulado = new Set((valor ?? "").split(/[,; ]+/).map((s) => s.trim()).filter(Boolean));
}

export function lerDocumento(json: unknown): DocumentoZsgo {
  let dados: unknown = ehObj(json) && "data" in json ? json.data : json;
  if (Array.isArray(dados) && dados.length > 0) dados = dados[0];
  const d = vazio();
  if (ehObj(dados)) preencher(d, dados);
  return d;
}

export function lerPagina(json: unknown): PaginaDocumentos {
  const dados = ehObj(json) && "data" in json ? json.data : json;
  const documentos: DocumentoZsgo[] = [];
  if (Array.isArray(dados)) {
    for (let o of dados) {
      if (Array.isArray(o) && o.length > 0) o = o[0];
      if (ehObj(o)) {
        const d = vazio();
        preencher(d, o);
        documentos.push(d);
      }
    }
  }
  const meta = ehObj(json) ? json.meta : undefined;
  const totalPaginas = ehObj(meta) && typeof meta.page_count === "number" ? meta.page_count : undefined;
  return { documentos, totalPaginas };
}

function vazio(): DocumentoZsgo {
  return { anulado: false, linhas: [] };
}

function preencher(d: DocumentoZsgo, m: Obj): void {
  const doc = ehObj(m.document) ? m.document : m;
  const totais = ehObj(m.totals) ? m.totals : m;

  d.id = texto(m, "id");
  d.tipo = texto(doc, "type", "document_type");
  d.serie = texto(doc, "series", "serie");
  d.numeroSimples = texto(doc, "number", "document_number");
  d.numero = texto(doc, "label", "full_number");
  if (!d.numero && d.numeroSimples) d.numero = `${d.tipo ? `${d.tipo} ` : ""}${d.serie ? `${d.serie}/` : ""}${d.numeroSimples}`;
  d.estado = texto(m, "status", "state") ?? (doc !== m ? texto(doc, "status", "state") : undefined);
  d.data = texto(doc, "issue_date", "date", "document_date", "issued_at") ?? texto(m, "issue_date", "date", "created_at");
  d.pdfUrl = texto(m, "pdf_url", "pdf");
  d.notas = texto(doc, "notes", "observations", "remarks") ?? (doc !== m ? texto(m, "notes", "observations") : undefined);
  d.referencia = texto(doc, "reference", "external_reference", "your_reference") ?? (doc !== m ? texto(m, "reference", "external_reference") : undefined);
  const cli = m.customer ?? doc.customer;
  d.clienteCodigo = ehObj(cli) ? texto(cli, "code", "customer_code") : texto(m, "customer_code", "client_code");
  d.total = numero(totais, "total", "gross_total", "total_gross", "grand_total", "total_amount", "document_total", "total_with_tax");
  d.liquido = numero(totais, "net_total", "total_net", "subtotal", "total_without_tax", "net", "total_liquid");
  d.iva = numero(totais, "tax_total", "total_tax", "vat_total", "total_vat", "tax", "taxes", "vat");
  const anulado = primeiro(doc, "annulled", "is_annulled", "canceled", "cancelled");
  d.anulado =
    anulado === true ||
    (!!d.estado && /(anul|annul|cancel|void)/i.test(d.estado)) ||
    (!!d.estado && codigosAnulado.has(d.estado.trim())) ||
    temMarcaDeAnulacao(doc) ||
    (doc !== m && temMarcaDeAnulacao(m));

  const itens = primeiro(m, "items", "lines", "document_lines");
  if (Array.isArray(itens)) {
    for (const it of itens) {
      if (!ehObj(it)) continue;
      d.linhas.push({
        id: texto(it, "id"),
        produto: texto(it, "product_reference", "reference", "product"),
        quantidade: numero(it, "quantity", "qty"),
        precoUnitario: numero(it, "unit_price_net", "unit_price", "price"),
        taxaIva: ehObj(it.tax) ? numero(it.tax, "rate") : numero(it, "tax_rate", "vat_rate", "tax"),
        total: ehObj(it.totals) ? numero(it.totals, "total") : numero(it, "total", "gross_total", "total_with_tax", "line_total", "amount"),
        notas: texto(it, "notes", "description"),
      });
    }
  }
  if (d.total === undefined && d.linhas.length > 0 && d.linhas.every((l) => l.total !== undefined)) {
    d.total = arred(d.linhas.reduce((s, l) => s + (l.total ?? 0), 0));
  }
  if (d.total === undefined && d.liquido !== undefined && d.iva !== undefined) d.total = arred(d.liquido + d.iva);
}

/** Campos como annulled_at, cancellation_reason preenchidos = anulado. */
function temMarcaDeAnulacao(m: Obj): boolean {
  for (const [chave, v] of Object.entries(m)) {
    const k = chave.toLowerCase();
    if (!(k.includes("annul") || k.includes("anul") || k.includes("cancel") || k.includes("void"))) continue;
    if (v === null || v === undefined || v === false || v === "" || v === 0) continue;
    if (typeof v === "string" && /^(false|0|no|n)$/i.test(v)) continue;
    return true;
  }
  return false;
}

function primeiro(m: Obj, ...chaves: string[]): unknown {
  for (const c of chaves) if (m[c] !== null && m[c] !== undefined) return m[c];
  return undefined;
}

function texto(m: Obj, ...chaves: string[]): string | undefined {
  const v = primeiro(m, ...chaves);
  if (v === undefined || typeof v === "object") return undefined;
  return String(v);
}

function numero(m: Obj, ...chaves: string[]): number | undefined {
  const v = primeiro(m, ...chaves);
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) ? arred(n) : undefined;
}

const arred = (n: number) => Math.round(n * 100) / 100;

/** Nº da fatura para o Cyclos: tipo-número, ex. "FA-1231". */
export function numeroParaCyclos(d: DocumentoZsgo | null | undefined): string | undefined {
  if (!d) return undefined;
  if (d.numeroSimples?.trim()) return `${d.tipo?.trim() ? `${d.tipo.toUpperCase()}-` : ""}${d.numeroSimples}`;
  return d.numero;
}
