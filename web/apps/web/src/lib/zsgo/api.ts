import "server-only";
import { cfg, cfgInt, cfgOu } from "../config";
import { configurarCodigosAnulado, lerDocumento, lerPagina, type DocumentoZsgo, type PaginaDocumentos } from "./documento";
import { regiaoDoCodigoPostal } from "./regiao";

/**
 * Cliente da API do ZSGO — mesma lógica de zsgo/ZsgoApiClient do Java.
 *
 * REGRA MAIS IMPORTANTE (setembro 2026, faturas em duplicado): pedidos que
 * CRIAM coisas (POST /sales, POST /clients) nunca se repetem quando o pedido
 * pode ter chegado ao ZSGO e não houve resposta — lança-se
 * ZsgoResultadoIncerto e quem chama marca a fatura como "Verificar no ZSGO".
 * Só se repete o que é seguro: falhas antes de o pedido sair (ligação
 * recusada, DNS) e respostas 429 (rate limit).
 */

export class ZsgoApiErro extends Error {
  override name = "ZsgoApiErro";
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** O pedido pode ter chegado ao ZSGO e não houve resposta: NÃO repetir. */
export class ZsgoResultadoIncerto extends ZsgoApiErro {
  override name = "ZsgoResultadoIncerto";
}

export interface ClienteOrigem {
  id: string;
  nome: string | null;
  nif: string | null;
  morada: string | null;
  codigoPostal: string | null;
  cidade: string | null;
  pais: string | null;
  email: string | null;
  telefone: string | null;
  prazoDias: number | null;
  sujeitoPassivo: boolean | null;
  motivoIsencaoZsgoCode: string | null;
  contentHash: string | null;
}

export interface ResultadoCliente {
  code: string;
  respostaJson: string;
}

export interface ResultadoVenda {
  id: string;
  pdfUrl: string | null;
}

/** Códigos de erro do fetch do Node em que o pedido NÃO chegou a sair. */
const NAO_CHEGOU = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ENETUNREACH", "EHOSTUNREACH"]);

function naoChegouAoServidor(e: unknown): boolean {
  for (let atual: unknown = e, i = 0; atual && i < 6; i++) {
    const codigo = (atual as { code?: string }).code;
    if (codigo && NAO_CHEGOU.has(codigo)) return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/** Limita os pedidos a N por janela de tempo (invoice.rateLimit.*). */
class LimitadorPedidos {
  private instantes: number[] = [];
  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
  ) {}

  async aguardar(): Promise<void> {
    if (this.maximo <= 0) return;
    for (;;) {
      const agora = Date.now();
      this.instantes = this.instantes.filter((t) => agora - t < this.janelaMs);
      if (this.instantes.length < this.maximo) {
        this.instantes.push(agora);
        return;
      }
      await dormir(this.janelaMs - (agora - this.instantes[0]!) + 5);
    }
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mensagemDaResposta(corpo: string): string {
  try {
    const j = JSON.parse(corpo) as { message?: unknown; error?: unknown };
    if (typeof j.message === "string") return j.message;
    if (typeof j.error === "string") return j.error;
  } catch {
    // corpo não é JSON
  }
  return corpo;
}

export class ZsgoApi {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly limitador: LimitadorPedidos;

  constructor() {
    this.baseUrl = cfg("zsgo.baseUrl").replace(/\/+$/, "");
    this.token = cfg("zsgo.token");
    this.limitador = new LimitadorPedidos(cfgInt("invoice.rateLimit.requestsPerWindow", 25), cfgInt("invoice.rateLimit.windowMillis", 60000));
    configurarCodigosAnulado(cfgOu("zsgo.status.anulado", ""));
  }

  /**
   * @param idempotente false para pedidos que criam coisas: sem resposta →
   *        ZsgoResultadoIncerto, nunca se repete.
   */
  private async pedido(metodo: string, caminho: string, opcoes: { corpo?: string; timeoutMs: number; idempotente: boolean; descricao: string }): Promise<{ status: number; corpo: string }> {
    let falhasRede = 0;
    for (let tentativa429 = 1; ; ) {
      if (tentativa429 > 6) throw new ZsgoApiErro(`${opcoes.descricao}: excedidas 6 tentativas após 429 (rate limit).`, 429);
      await this.limitador.aguardar();
      let resposta: Response;
      try {
        resposta = await fetch(this.baseUrl + caminho, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opcoes.corpo,
          signal: AbortSignal.timeout(opcoes.timeoutMs),
          cache: "no-store",
        });
      } catch (e) {
        if (!opcoes.idempotente && !naoChegouAoServidor(e)) {
          throw new ZsgoResultadoIncerto(
            `Sem resposta do ZSGO em ${opcoes.descricao} (${e instanceof Error && e.name === "TimeoutError" ? "demorou demasiado" : (e as Error).message}) — o documento PODE ter sido criado. Não foi reenviado para não duplicar.`,
            undefined,
            { cause: e },
          );
        }
        if (++falhasRede > 3) throw new ZsgoApiErro(`Falha de rede em ${opcoes.descricao} após ${falhasRede} tentativas.`, undefined, { cause: e });
        await dormir(1000 * falhasRede);
        continue;
      }
      const corpo = await resposta.text();
      if (resposta.status !== 429) return { status: resposta.status, corpo };
      const espera = Number(resposta.headers.get("retry-after"));
      await dormir(Number.isFinite(espera) && espera > 0 ? espera * 1000 : 3000);
      tentativa429++;
    }
  }

  private payloadCliente(c: ClienteOrigem): string {
    const identity: Record<string, unknown> = { name: c.nome };
    if (c.nif?.trim()) identity.tax_id = c.nif;
    if (c.sujeitoPassivo !== null) identity.tax_subject = c.sujeitoPassivo;

    const address: Record<string, unknown> = { country_code: c.pais?.trim() ? c.pais : "PT" };
    if (c.morada?.trim()) address.address = c.morada;
    if (c.codigoPostal?.trim()) address.postal_code = c.codigoPostal;
    if (c.cidade?.trim()) address.city = c.cidade;
    // Região fiscal pelo código postal: sem isto o ZSGO assume sempre o
    // Continente e aplica o IVA errado.
    const regiao = regiaoDoCodigoPostal(c.pais, c.codigoPostal);
    if (regiao) address.region_code = regiao;

    const billing: Record<string, unknown> = { price_line: Number(cfgOu("zsgo.default.priceLine", "1")) };
    const opcaoPagamento = cfgOu("zsgo.default.paymentOptionId", null);
    const metodoPagamento = cfgOu("zsgo.default.paymentMethodId", null);
    if (opcaoPagamento) billing.payment_option_id = opcaoPagamento;
    if (metodoPagamento) billing.payment_method_id = metodoPagamento;
    // Bug do ZSGO (reportado): exemption_code ao criar cliente dá HTTP 500;
    // continua a enviar-se, como no Java.
    if (c.motivoIsencaoZsgoCode?.trim()) billing.exemption_code = c.motivoIsencaoZsgoCode;

    const settings: Record<string, unknown> = { inactive: false };
    if (c.email?.trim()) settings.email = c.email;
    if (c.telefone?.trim()) settings.phone = c.telefone;

    return JSON.stringify({ identity, address, billing, settings });
  }

  /** POST /clients — não idempotente (sem resposta → incerto). */
  async criarCliente(c: ClienteOrigem): Promise<ResultadoCliente> {
    const payload = this.payloadCliente(c);
    const r = await this.pedido("POST", "/clients", { corpo: payload, timeoutMs: 60_000, idempotente: false, descricao: "POST /clients" });
    if (r.status !== 200 && r.status !== 201) {
      throw new ZsgoApiErro(`POST /clients devolveu ${r.status}: ${mensagemDaResposta(r.corpo)} | Payload enviado: ${payload}`, r.status);
    }
    const code = lerCodigo(r.corpo);
    if (!code) throw new ZsgoApiErro(`Cliente criado (HTTP ${r.status}) mas não consegui ler o 'code' da resposta: ${r.corpo}`, r.status);
    return { code, respostaJson: r.corpo };
  }

  /** PATCH /clients/{code} — atualizar é idempotente. */
  async atualizarCliente(c: ClienteOrigem, code: string): Promise<ResultadoCliente> {
    const payload = this.payloadCliente(c);
    const r = await this.pedido("PATCH", `/clients/${encodeURIComponent(code)}`, { corpo: payload, timeoutMs: 20_000, idempotente: true, descricao: `PATCH /clients/${code}` });
    if (r.status !== 200) {
      throw new ZsgoApiErro(`PATCH /clients/${code} devolveu ${r.status}: ${mensagemDaResposta(r.corpo)} | Payload enviado: ${payload}`, r.status);
    }
    return { code: lerCodigo(r.corpo) ?? code, respostaJson: r.corpo };
  }

  /** POST /sales — não idempotente; 502/503/504 também contam como incerto. */
  async criarVenda(payload: string): Promise<ResultadoVenda> {
    const r = await this.pedido("POST", "/sales", { corpo: payload, timeoutMs: 120_000, idempotente: false, descricao: "POST /sales" });
    if (r.status === 502 || r.status === 503 || r.status === 504) {
      throw new ZsgoResultadoIncerto(`POST /sales devolveu ${r.status} (servidor sem resposta) — a fatura PODE ter sido criada. Não foi reenviada.`, r.status);
    }
    if (r.status !== 200 && r.status !== 201) {
      throw new ZsgoApiErro(`POST /sales devolveu ${r.status}: ${mensagemDaResposta(r.corpo)}`, r.status);
    }
    // Igual ao Java (o que está a funcionar em produção): primeira
    // ocorrência de "id":"…" e de "pdf_url":"…" na resposta.
    const id = r.corpo.match(/"id"\s*:\s*"([^"]+)"/)?.[1];
    const pdfUrl = r.corpo.match(/"pdf_url"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\\//g, "/") ?? null;
    if (!id) throw new ZsgoApiErro(`Fatura criada (HTTP ${r.status}) mas não consegui ler o 'id' da resposta: ${r.corpo}`, r.status);
    return { id, pdfUrl };
  }

  /** GET /sales/{id}. */
  async obterVenda(id: string): Promise<DocumentoZsgo> {
    const r = await this.pedido("GET", `/sales/${encodeURIComponent(id)}`, { timeoutMs: 20_000, idempotente: true, descricao: `GET /sales/${id}` });
    if (r.status !== 200) throw new ZsgoApiErro(`GET /sales/${id} devolveu ${r.status}: ${mensagemDaResposta(r.corpo)}`, r.status);
    try {
      return lerDocumento(JSON.parse(r.corpo));
    } catch {
      throw new ZsgoApiErro(`Resposta do ZSGO em formato inesperado: ${r.corpo}`, r.status);
    }
  }

  /** Uma página de GET /sales (opcionalmente com search). */
  async listarVendas(pagina: number, porPagina: number, procura?: string): Promise<PaginaDocumentos> {
    const q = procura ? `&search=${encodeURIComponent(procura)}` : "";
    const r = await this.pedido("GET", `/sales?page=${pagina}&per_page=${porPagina}${q}`, { timeoutMs: 30_000, idempotente: true, descricao: "GET /sales" });
    if (r.status !== 200) throw new ZsgoApiErro(`GET /sales devolveu ${r.status}: ${mensagemDaResposta(r.corpo)}`, r.status);
    try {
      return lerPagina(JSON.parse(r.corpo));
    } catch {
      throw new ZsgoApiErro(`Resposta do ZSGO em formato inesperado: ${r.corpo}`, r.status);
    }
  }

  async procurarVendas(texto: string): Promise<DocumentoZsgo[]> {
    return (await this.listarVendas(1, 20, texto)).documentos;
  }

  /**
   * Qualquer operação da API (módulo ZSGO da página). Os POST nunca se
   * repetem sem resposta (ZsgoResultadoIncerto), como nas faturas.
   * Devolve o estado HTTP e o corpo (já lido como JSON, se for JSON).
   */
  async generico(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: unknown; texto: string }> {
    const r = await this.pedido(metodo, caminho, {
      corpo: corpo === undefined ? undefined : JSON.stringify(corpo),
      timeoutMs: metodo === "GET" ? 30_000 : 120_000,
      idempotente: metodo !== "POST",
      descricao: `${metodo} ${caminho.split("?")[0]}`,
    });
    let json: unknown = null;
    try {
      json = r.corpo ? JSON.parse(r.corpo) : null;
    } catch {
      // resposta sem JSON
    }
    return { status: r.status, json, texto: r.corpo };
  }

  /** Ficheiro (PDF, XML, SAF-T): devolve os bytes e o tipo. */
  async ficheiro(caminho: string): Promise<{ status: number; bytes: ArrayBuffer; tipo: string; nome: string | null }> {
    await this.limitador.aguardar();
    const resposta = await fetch(this.baseUrl + caminho, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "*/*" },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const disposicao = resposta.headers.get("content-disposition");
    return {
      status: resposta.status,
      bytes: await resposta.arrayBuffer(),
      tipo: resposta.headers.get("content-type") ?? "application/octet-stream",
      nome: disposicao?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? null,
    };
  }
}

/** Igual ao Java: primeira ocorrência de "code" na resposta. */
function lerCodigo(corpo: string): string | undefined {
  return corpo.match(/"code"\s*:\s*"?([^",}\]]+)"?/)?.[1];
}
