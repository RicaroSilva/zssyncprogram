import "server-only";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { cfgOu } from "../config";

/**
 * Onde ficam as cópias dos documentos do Cegid: no S3 (SeaweedFS) se o
 * config.properties tiver cegid.s3.endpoint; senão numa pasta
 * (cegid.pasta). O S3 é assinado aqui (AWS Signature V4, caminho
 * endpoint/bucket/chave — o que o SeaweedFS espera), sem pacotes extra.
 *
 *   cegid.s3.endpoint=http://seaweedfs:8333
 *   cegid.s3.bucket=faturas-cegid
 *   cegid.s3.access_key=…
 *   cegid.s3.secret_key=…
 *   cegid.s3.region=us-east-1       (opcional)
 *   cegid.s3.prefixo=cegid/         (opcional)
 *   cegid.pasta=C:\faturacao\cegid  (só sem S3)
 */

export interface Armazenamento {
  descricao: string;
  guardar(chave: string, dados: Buffer, tipo: string): Promise<void>;
  ler(chave: string): Promise<Buffer | null>;
}

export function armazenamentoConfigurado(): Armazenamento | null {
  const endpoint = cfgOu("cegid.s3.endpoint", null);
  if (endpoint) {
    return new ArmazenamentoS3({
      endpoint: endpoint.replace(/\/+$/, ""),
      bucket: cfgOu("cegid.s3.bucket", "faturas-cegid"),
      chaveAcesso: cfgOu("cegid.s3.access_key", ""),
      segredo: cfgOu("cegid.s3.secret_key", ""),
      regiao: cfgOu("cegid.s3.region", "us-east-1"),
    });
  }
  const pasta = cfgOu("cegid.pasta", null);
  return pasta ? new ArmazenamentoPasta(resolve(pasta)) : null;
}

/** Prefixo das chaves (ex.: "cegid/"). */
export function prefixoChaves(): string {
  const p = cfgOu("cegid.s3.prefixo", "cegid/");
  return p && !p.endsWith("/") ? `${p}/` : p;
}

class ArmazenamentoPasta implements Armazenamento {
  constructor(private readonly raiz: string) {}
  get descricao() {
    return `pasta ${this.raiz}`;
  }
  private caminho(chave: string) {
    const c = resolve(this.raiz, chave);
    if (!c.startsWith(this.raiz + sep)) throw new Error(`Chave inválida: ${chave}`);
    return c;
  }
  async guardar(chave: string, dados: Buffer) {
    const c = this.caminho(chave);
    await mkdir(dirname(c), { recursive: true });
    await writeFile(c, dados);
  }
  async ler(chave: string) {
    try {
      return await readFile(this.caminho(chave));
    } catch {
      return null;
    }
  }
}

const sha256 = (d: Buffer | string) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
/** Codificação de caminhos da AWS (RFC 3986, "/" fica). */
const codificar = (s: string) => s.split("/").map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

class ArmazenamentoS3 implements Armazenamento {
  constructor(private readonly c: { endpoint: string; bucket: string; chaveAcesso: string; segredo: string; regiao: string }) {}
  get descricao() {
    return `S3 ${this.c.endpoint}/${this.c.bucket}`;
  }

  private async pedido(metodo: "GET" | "PUT", chave: string, corpo?: Buffer, tipo?: string): Promise<Response> {
    const url = new URL(`${this.c.endpoint}/${codificar(this.c.bucket)}/${codificar(chave)}`);
    const agora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dia = agora.slice(0, 8);
    const hashCorpo = sha256(corpo ?? "");
    const cabecalhos: Record<string, string> = { host: url.host, "x-amz-content-sha256": hashCorpo, "x-amz-date": agora };
    if (tipo) cabecalhos["content-type"] = tipo;
    const nomes = Object.keys(cabecalhos).sort();
    const pedidoCanonico = [metodo, url.pathname, "", ...nomes.map((n) => `${n}:${cabecalhos[n]}`), "", nomes.join(";"), hashCorpo].join("\n");
    const ambito = `${dia}/${this.c.regiao}/s3/aws4_request`;
    const texto = ["AWS4-HMAC-SHA256", agora, ambito, sha256(pedidoCanonico)].join("\n");
    const chaveAssinatura = hmac(hmac(hmac(hmac(`AWS4${this.c.segredo}`, dia), this.c.regiao), "s3"), "aws4_request");
    const assinatura = createHmac("sha256", chaveAssinatura).update(texto).digest("hex");
    const { host: _host, ...enviar } = cabecalhos;
    return fetch(url, {
      method: metodo,
      headers: { ...enviar, authorization: `AWS4-HMAC-SHA256 Credential=${this.c.chaveAcesso}/${ambito}, SignedHeaders=${nomes.join(";")}, Signature=${assinatura}` },
      body: corpo ? new Uint8Array(corpo) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  }

  async guardar(chave: string, dados: Buffer, tipo: string) {
    const r = await this.pedido("PUT", chave, dados, tipo);
    if (!r.ok) throw new Error(`O S3 respondeu ${r.status} ao guardar ${chave}: ${(await r.text()).slice(0, 300)}`);
  }

  async ler(chave: string) {
    const r = await this.pedido("GET", chave);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`O S3 respondeu ${r.status} ao ler ${chave}: ${(await r.text()).slice(0, 300)}`);
    return Buffer.from(await r.arrayBuffer());
  }
}
