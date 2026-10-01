import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { cfgInt } from "../config";
import { descreverErro } from "../erros";
import { armazenamentoConfigurado, prefixoChaves, type Armazenamento } from "./armazenamento";

/**
 * Descarregar todos os documentos do Cegid (document_cw_url das
 * lp_cloudware_monthly_processing_invoices) e guardá-los no S3, antes de a
 * licença acabar e os links deixarem de funcionar. Corre em segundo plano
 * no servidor; o que já foi guardado fica em zsgo_web_cegid_documento, por
 * isso pode parar-se e continuar quando se quiser (continua onde ficou).
 * Só lê o Cegid (GET); nunca altera as tabelas lp_cloudware_*.
 */

export interface EstadoDownload {
  aCorrer: boolean;
  pararPedido: boolean;
  iniciadoPor: string | null;
  iniciadoEm: Date | null;
  terminadoEm: Date | null;
  feitosNestaExecucao: number;
  errosNestaExecucao: number;
  ultimaMensagem: string;
}

const g = globalThis as unknown as { __downloadCegid?: EstadoDownload };
const estado: EstadoDownload = (g.__downloadCegid ??= {
  aCorrer: false,
  pararPedido: false,
  iniciadoPor: null,
  iniciadoEm: null,
  terminadoEm: null,
  feitosNestaExecucao: 0,
  errosNestaExecucao: 0,
  ultimaMensagem: "",
});

export function estadoDownload(): EstadoDownload {
  return { ...estado };
}

/** Quantos já estão guardados, com erro e por descarregar. */
export async function contagemDocumentos(): Promise<{ total: number; guardados: number; comErro: number; semLink: number }> {
  const [l] = await prisma.$queryRaw<Array<{ total: bigint; guardados: bigint; com_erro: bigint; sem_link: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE i.document_cw_url IS NOT NULL AND i.document_cw_url <> '') AS total,
           COUNT(*) FILTER (WHERE d.estado = 'OK') AS guardados,
           COUNT(*) FILTER (WHERE d.estado = 'ERRO') AS com_erro,
           COUNT(*) FILTER (WHERE i.document_cw_url IS NULL OR i.document_cw_url = '') AS sem_link
    FROM lp_cloudware_monthly_processing_invoices i
    LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = i.mpinv_id`;
  return { total: Number(l?.total ?? 0), guardados: Number(l?.guardados ?? 0), comErro: Number(l?.com_erro ?? 0), semLink: Number(l?.sem_link ?? 0) };
}

export function pararDownload(): void {
  if (estado.aCorrer) {
    estado.pararPedido = true;
    estado.ultimaMensagem = "A parar depois dos documentos em curso…";
  }
}

/** Começa (ou continua) o download. `repetirErros`: tenta outra vez os que falharam. */
export function iniciarDownload(iniciadoPor: string, repetirErros: boolean): { ok: boolean; erro?: string } {
  if (estado.aCorrer) return { ok: false, erro: "O download já está a correr." };
  const armazenamento = armazenamentoConfigurado();
  if (!armazenamento) return { ok: false, erro: "Falta indicar onde guardar: cegid.s3.endpoint (e bucket, access_key, secret_key) ou cegid.pasta no config.properties." };
  Object.assign(estado, {
    aCorrer: true,
    pararPedido: false,
    iniciadoPor,
    iniciadoEm: new Date(),
    terminadoEm: null,
    feitosNestaExecucao: 0,
    errosNestaExecucao: 0,
    ultimaMensagem: `A começar (destino: ${armazenamento.descricao})…`,
  });
  void correr(armazenamento, repetirErros).finally(() => {
    estado.aCorrer = false;
    estado.terminadoEm = new Date();
  });
  return { ok: true };
}

interface Pendente {
  mpinv_id: number;
  user_id: bigint;
  year: number;
  month: number;
  document_cw_number: string | null;
  document_cw_url: string;
}

async function correr(armazenamento: Armazenamento, repetirErros: boolean) {
  const paralelos = Math.max(1, Math.min(10, cfgInt("cegid.download.paralelos", 3)));
  const pausa = Math.max(0, cfgInt("cegid.download.pausa_ms", 200));
  let errosSeguidos = 0;
  let paradoPorErros = false;
  let ultimoId = 0;
  try {
    for (;;) {
      if (estado.pararPedido) {
        if (!paradoPorErros) estado.ultimaMensagem = "Parado a pedido. Carregue em Continuar para retomar onde ficou.";
        return;
      }
      // Os que nunca foram tentados; com "repetir erros", também os que falharam.
      const lote = await prisma.$queryRaw<Pendente[]>`
        SELECT i.mpinv_id, i.user_id, i.year, i.month, i.document_cw_number, i.document_cw_url
        FROM lp_cloudware_monthly_processing_invoices i
        LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = i.mpinv_id
        WHERE i.mpinv_id > ${ultimoId} AND i.document_cw_url IS NOT NULL AND i.document_cw_url <> ''
          AND (d.mpinv_id IS NULL OR (${repetirErros} AND d.estado = 'ERRO'))
        ORDER BY i.mpinv_id LIMIT 200`;
      if (lote.length === 0) {
        estado.ultimaMensagem = estado.errosNestaExecucao
          ? `Terminado: ${estado.feitosNestaExecucao} guardado(s), ${estado.errosNestaExecucao} com erro (pode tentar de novo os que falharam).`
          : `Terminado: ${estado.feitosNestaExecucao} documento(s) guardado(s) nesta execução.`;
        return;
      }
      ultimoId = lote[lote.length - 1]!.mpinv_id;
      let i = 0;
      const trabalhador = async () => {
        while (i < lote.length && !estado.pararPedido) {
          const doc = lote[i++]!;
          const ok = await descarregarUm(armazenamento, doc);
          errosSeguidos = ok ? 0 : errosSeguidos + 1;
          if (pausa) await new Promise((r) => setTimeout(r, pausa));
          if (errosSeguidos >= 50 && !estado.pararPedido) {
            estado.pararPedido = true;
            paradoPorErros = true;
            estado.ultimaMensagem = "Parei: 50 documentos seguidos falharam (o Cegid pode estar em baixo ou os links deixaram de funcionar). Veja o erro na lista e tente mais tarde.";
          }
        }
      };
      await Promise.all(Array.from({ length: paralelos }, trabalhador));
      if (!estado.pararPedido) estado.ultimaMensagem = `A descarregar… ${estado.feitosNestaExecucao} guardado(s) nesta execução (último nº interno ${ultimoId}).`;
    }
  } catch (e) {
    estado.ultimaMensagem = `Parou com erro: ${descreverErro(e)}`;
  }
}

/** Nome do ficheiro: cegid/2024/03/1234-FT-2024-123-98765.pdf */
function chaveDe(doc: Pendente, extensao: string): string {
  const numero = (doc.document_cw_number ?? "sem-numero").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefixoChaves()}${doc.year}/${String(doc.month).padStart(2, "0")}/${doc.user_id}-${numero}-${doc.mpinv_id}.${extensao}`;
}

async function descarregarUm(armazenamento: Armazenamento, doc: Pendente): Promise<boolean> {
  try {
    const { dados, tipo } = await obterDocumento(doc.document_cw_url);
    const extensao = tipo.includes("pdf") ? "pdf" : tipo.includes("xml") ? "xml" : "bin";
    const chave = chaveDe(doc, extensao);
    await armazenamento.guardar(chave, dados, tipo);
    const hash = createHash("sha256").update(dados).digest("hex");
    await prisma.$executeRaw`
      INSERT INTO zsgo_web_cegid_documento (mpinv_id, estado, chave, tamanho, sha256, tipo, erro, tentativas, atualizado_em)
      VALUES (${doc.mpinv_id}, 'OK', ${chave}, ${dados.length}, ${hash}, ${tipo}, NULL, 1, now())
      ON CONFLICT (mpinv_id) DO UPDATE SET estado = 'OK', chave = EXCLUDED.chave, tamanho = EXCLUDED.tamanho, sha256 = EXCLUDED.sha256,
        tipo = EXCLUDED.tipo, erro = NULL, tentativas = zsgo_web_cegid_documento.tentativas + 1, atualizado_em = now()`;
    estado.feitosNestaExecucao++;
    return true;
  } catch (e) {
    const erro = descreverErro(e).slice(0, 2000);
    await prisma.$executeRaw`
      INSERT INTO zsgo_web_cegid_documento (mpinv_id, estado, erro, tentativas, atualizado_em)
      VALUES (${doc.mpinv_id}, 'ERRO', ${erro}, 1, now())
      ON CONFLICT (mpinv_id) DO UPDATE SET estado = 'ERRO', erro = EXCLUDED.erro, tentativas = zsgo_web_cegid_documento.tentativas + 1, atualizado_em = now()`;
    estado.errosNestaExecucao++;
    return false;
  }
}

/** Links do Google Drive ("…/file/d/ID/view", "open?id=ID") → link de download direto. */
export function linkDireto(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) {
      const id = u.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] ?? u.searchParams.get("id");
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
  } catch {
    /* fica como está */
  }
  return url;
}

async function obterDocumento(url: string, passos?: string[]): Promise<{ dados: Buffer; tipo: string }> {
  let alvo = linkDireto(url);
  const visitados = new Set<string>();
  // Até 3 saltos: o link público do Cegid pode redirecionar para o Google, ou
  // devolver uma página com o PDF lá dentro (iframe/embed/ligação).
  for (let salto = 0; salto < 3; salto++) {
    visitados.add(alvo);
    const r = await fetch(alvo, { redirect: "follow", signal: AbortSignal.timeout(90_000), headers: { "user-agent": "Mozilla/5.0 (faturacao-web; copia de documentos)" } });
    const dados = Buffer.from(await r.arrayBuffer());
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    passos?.push(`${alvo.slice(0, 120)} → ${r.status} ${tipo || "?"} (${dados.length} bytes)${r.url !== alvo ? ` · redirecionou para ${r.url.slice(0, 120)}` : ""}`);
    if (!r.ok) throw new Error(`O link respondeu ${r.status} ${r.statusText}`);
    if (dados.subarray(0, 5).toString("latin1") === "%PDF-") return { dados, tipo: "application/pdf" };
    if (tipo.includes("xml") && !tipo.includes("html")) return { dados, tipo };
    const html = dados.toString("utf-8");
    const seguinte = urlConfirmacaoDrive(html) ?? urlPdfNaPagina(html, r.url || alvo);
    if (seguinte && !visitados.has(seguinte)) {
      alvo = seguinte;
      continue;
    }
    if (/accounts\.google\.com|ServiceLogin/i.test(html)) throw new Error("O link pede login no Google (o documento já não é público).");
    throw new Error(`O link não devolveu um PDF (veio ${tipo || "tipo desconhecido"}, ${dados.length} bytes).`);
  }
  throw new Error("O link não devolveu um PDF (demasiados saltos).");
}

/** Numa página HTML, o endereço do PDF (iframe/embed/object/ligação para .pdf ou para o Google Storage/Drive). */
function urlPdfNaPagina(html: string, base: string): string | null {
  const limpar = (u: string) => u.replace(/&amp;/g, "&");
  // 1.º o que está num iframe/embed/object (é o visualizador do PDF); depois ligações que parecem um PDF.
  const embutido = html.match(/<(?:iframe|embed|object)[^>]+(?:src|data)\s*=\s*["']([^"']+)["']/i)?.[1];
  const candidatos = [...html.matchAll(/(?:src|href|data)\s*=\s*["']([^"']+)["']/gi)].map((m) => limpar(m[1]!));
  candidatos.push(...[...html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((m) => limpar(m[0])));
  const parece = (u: string) => /\.pdf(\?|#|$)|storage\.googleapis\.com|googleusercontent\.com|drive\.google\.com|\/download|[?&](format|type)=pdf|\/pdf\//i.test(u);
  const achado = embutido && !embutido.startsWith("about:") ? limpar(embutido) : candidatos.find(parece);
  if (!achado) return null;
  try {
    return linkDireto(new URL(achado, base).toString());
  } catch {
    return null;
  }
}

/** Experimenta o link de um documento, sem guardar nada (para ver o que o Cegid devolve). */
export async function testarDocumento(mpinvId?: number): Promise<{ ok: boolean; mpinvId?: number; passos: string[]; resultado: string }> {
  const [doc] = mpinvId
    ? await prisma.$queryRaw<Array<{ mpinv_id: number; document_cw_url: string }>>`SELECT mpinv_id, document_cw_url FROM lp_cloudware_monthly_processing_invoices WHERE mpinv_id = ${mpinvId}`
    : await prisma.$queryRaw<Array<{ mpinv_id: number; document_cw_url: string }>>`
        SELECT mpinv_id, document_cw_url FROM lp_cloudware_monthly_processing_invoices
        WHERE document_cw_url IS NOT NULL AND document_cw_url <> '' ORDER BY year DESC, month DESC, mpinv_id DESC LIMIT 1`;
  if (!doc?.document_cw_url) return { ok: false, passos: [], resultado: "Não encontrei nenhuma fatura com link." };
  const passos: string[] = [];
  try {
    const { dados, tipo } = await obterDocumento(doc.document_cw_url, passos);
    return { ok: true, mpinvId: doc.mpinv_id, passos, resultado: `Funciona: veio um ${tipo.includes("pdf") ? "PDF" : tipo} com ${Math.round(dados.length / 1024)} KB.` };
  } catch (e) {
    return { ok: false, mpinvId: doc.mpinv_id, passos, resultado: descreverErro(e) };
  }
}

function urlConfirmacaoDrive(html: string): string | null {
  const form = html.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
  if (form) {
    const u = new URL(form[1]!.replace(/&amp;/g, "&"));
    for (const m of form[2]!.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)) u.searchParams.set(m[1]!, m[2]!);
    return u.toString();
  }
  const href = html.match(/href="(\/uc\?export=download[^"]+confirm=[^"]+)"/i)?.[1];
  return href ? `https://drive.google.com${href.replace(/&amp;/g, "&")}` : null;
}
