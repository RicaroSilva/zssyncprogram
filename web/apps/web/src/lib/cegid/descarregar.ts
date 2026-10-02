import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { cfgInt, cfgOu } from "../config";
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
  const paralelos = Math.max(1, Math.min(20, cfgInt("cegid.download.paralelos", 6)));
  const pausa = Math.max(0, cfgInt("cegid.download.pausa_ms", 0));
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
        ORDER BY i.mpinv_id LIMIT 1000`;
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

/** Nome do ficheiro, direto no bucket (sem pastas de datas): 1006-FT-2025-113-13.pdf */
function chaveDe(doc: Pendente, extensao: string): string {
  const numero = (doc.document_cw_number ?? "sem-numero").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefixoChaves()}${doc.user_id}-${numero}-${doc.mpinv_id}.${extensao}`;
}

async function descarregarUm(armazenamento: Armazenamento, doc: Pendente): Promise<boolean> {
  try {
    const { dados, tipo } = await obterComAlternativas(doc.document_cw_url);
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

/** Palpite de endereço do PDF que funcionou (para tentar primeiro nas faturas seguintes). */
const gp = globalThis as unknown as { __palpiteCegid?: { modelo: string | null; falhasSeguidas: number } };
const palpite = (gp.__palpiteCegid ??= { modelo: null, falhasSeguidas: 0 });

/** Endereços a experimentar quando o link devolve a página do visualizador em vez do PDF.
 *  {url} = endereço final (depois dos redirecionamentos), {token} = último bocado do caminho. */
function modelosPalpite(): string[] {
  const configurado = cfgOu("cegid.download.modelo_pdf", null);
  const habituais = ["{url}/download", "{url}/pdf", "{url}.pdf", "{url}?download=1", "{url}?format=pdf", "{url}?type=pdf"];
  const lista = configurado ? [configurado] : [...(palpite.modelo ? [palpite.modelo] : []), ...habituais.filter((m) => m !== palpite.modelo)];
  return lista;
}

function aplicarModelo(modelo: string, urlFinal: string): string {
  const semQuery = urlFinal.split(/[?#]/)[0]!.replace(/\/+$/, "");
  const token = semQuery.split("/").pop() ?? "";
  return modelo.replace(/\{url\}/g, semQuery).replace(/\{token\}/g, token);
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET com espera quando o Cegid responde 429 (demasiados pedidos): respeita o Retry-After. */
/** Quando o Cegid responde 429, TODOS os pedidos esperam até esta hora (e não só o que recebeu o 429). */
const gr = globalThis as unknown as { __travaoCegid?: { ate: number } };
const travao = (gr.__travaoCegid ??= { ate: 0 });

async function pedir(u: string, passos?: string[]): Promise<Response> {
  for (let tentativa = 1; ; tentativa++) {
    const falta = travao.ate - Date.now();
    if (falta > 0) await espera(falta);
    const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(90_000), headers: { "user-agent": "Mozilla/5.0 (faturacao-web; copia de documentos)" } });
    if (r.status !== 429 || tentativa >= 4) return r;
    const segundos = Math.min(120, Number(r.headers.get("retry-after")) || 10 * tentativa);
    passos?.push(`429 (demasiados pedidos) — espero ${segundos} s e tento outra vez`);
    travao.ate = Math.max(travao.ate, Date.now() + segundos * 1000);
    await r.arrayBuffer().catch(() => {});
    await espera(segundos * 1000);
  }
}

/**
 * A página pública do Cegid (…/rus/public-rus/public_links/link/…) é o
 * visualizador; o PDF vem de um destes endereços que estão na página:
 *   …/public-file/<JWT archive>          ficheiro público (o PDF, ou o logótipo)
 *   …/public_links/link/<JWT action:job> pede ao Cegid para gerar o documento
 * Experimenta-os por esta ordem; se o "job" responder com outra página ou com
 * JSON, procura lá o ficheiro (e espera um pouco se ainda estiver a gerar).
 */
function enderecosCegid(texto: string, base: string, visitados: Set<string>): string[] {
  const todos = new Set<string>();
  const t = texto.replace(/\\\//g, "/"); // JSON escreve as barras como \/
  for (const m of t.matchAll(/(?:https?:\/\/[^"'`\s<>\\]+)?\/(?:public-file|rus\/public-rus\/public_links\/link|public_links\/link)\/eyJ[A-Za-z0-9_.-]+/g)) {
    try {
      todos.add(new URL(m[0], base).toString());
    } catch {
      /* ignora */
    }
  }
  const lista = [...todos].filter((u) => !visitados.has(u));
  return [...lista.filter((u) => u.includes("/public-file/")), ...lista.filter((u) => !u.includes("/public-file/"))];
}

/** Ficheiros públicos que já se viu serem imagens (o logótipo da empresa repete-se em todas as faturas). */
const gi = globalThis as unknown as { __imagensCegid?: Set<string> };
const imagensConhecidas = (gi.__imagensCegid ??= new Set<string>());

/** O id do ficheiro dentro do JWT de um …/public-file/<JWT> (sem verificar a assinatura: só para reconhecer o logótipo). */
function idArquivo(u: string): string | null {
  const jwt = u.match(/\/public-file\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/)?.[1];
  if (!jwt) return null;
  try {
    const dados = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf-8")) as { archive?: { id?: string; entity_id?: string } };
    return dados.archive?.id ? `${dados.archive.entity_id ?? ""}:${dados.archive.id}` : null;
  } catch {
    return null;
  }
}

async function seguirEnderecosCegid(texto: string, base: string, passos: string[] | undefined, visitados: Set<string>, nivel = 0): Promise<{ dados: Buffer; tipo: string } | null> {
  if (nivel > 2) return null;
  for (const u of enderecosCegid(texto, base, visitados)) {
    visitados.add(u);
    const arquivo = idArquivo(u);
    if (arquivo && imagensConhecidas.has(arquivo)) continue; // já se sabe que é o logótipo
    const ehJob = !u.includes("/public-file/");
    for (let vez = 0; vez < (ehJob ? 3 : 1); vez++) {
      if (vez > 0) await espera(3000);
      let r: Response;
      try {
        r = await pedir(u, passos);
      } catch (e) {
        passos?.push(`${u.slice(0, 90)}… → ${descreverErro(e).slice(0, 100)}`);
        break;
      }
      const dados = Buffer.from(await r.arrayBuffer());
      const tipo = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      passos?.push(`${ehJob ? "gerar documento (job)" : "ficheiro público"} ${u.slice(0, 90)}… → ${r.status} ${tipo || "?"} (${dados.length} bytes)`);
      if (!r.ok) break;
      if (ehPdf(dados)) return { dados, tipo: "application/pdf" };
      if (tipo.startsWith("image/")) {
        if (arquivo) imagensConhecidas.add(arquivo); // era o logótipo: não voltar a pedir
        break;
      }
      // Outra página ou JSON: procura lá o ficheiro.
      const achado = await seguirEnderecosCegid(dados.toString("utf-8"), r.url || u, passos, visitados, nivel + 1);
      if (achado) return achado;
    }
  }
  return null;
}
const ehPdf = (d: Buffer) => d.subarray(0, 5).toString("latin1") === "%PDF-";

async function obterDocumento(url: string, passos?: string[], guardarHtml?: (html: string, urlFinal: string) => void, comPalpites = true): Promise<{ dados: Buffer; tipo: string }> {
  let alvo = linkDireto(url);
  const visitados = new Set<string>();
  // Até 3 saltos: o link público do Cegid pode redirecionar para o Google, ou
  // devolver uma página com o PDF lá dentro (iframe/embed/ligação).
  for (let salto = 0; salto < 3; salto++) {
    visitados.add(alvo);
    const r = await pedir(alvo, passos);
    const dados = Buffer.from(await r.arrayBuffer());
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const urlFinal = r.url || alvo;
    passos?.push(`${alvo.slice(0, 120)} → ${r.status} ${tipo || "?"} (${dados.length} bytes)${urlFinal !== alvo ? ` · redirecionou para ${urlFinal.slice(0, 120)}` : ""}`);
    if (!r.ok) throw new Error(`O link respondeu ${r.status} ${r.statusText}`);
    if (ehPdf(dados)) return { dados, tipo: "application/pdf" };
    if (tipo.includes("xml") && !tipo.includes("html")) return { dados, tipo };
    const html = dados.toString("utf-8");
    guardarHtml?.(html, urlFinal);
    visitados.add(urlFinal);
    const doCegid = await seguirEnderecosCegid(html, urlFinal, passos, visitados);
    if (doCegid) return doCegid;
    const seguinte = urlConfirmacaoDrive(html) ?? urlPdfNaPagina(html, urlFinal);
    if (seguinte && !visitados.has(seguinte)) {
      alvo = seguinte;
      continue;
    }
    if (/accounts\.google\.com|ServiceLogin/i.test(html)) throw new Error("O link pede login no Google (o documento já não é público).");
    // Página do visualizador (ex.: Cegid …/rus/public-rus/public_links/link/…): experimentar os endereços de download.
    if (comPalpites && (palpite.falhasSeguidas < 20 || cfgOu("cegid.download.modelo_pdf", null))) {
      for (const modelo of modelosPalpite()) {
        const candidato = aplicarModelo(modelo, urlFinal);
        if (visitados.has(candidato)) continue;
        visitados.add(candidato);
        try {
          const rc = await pedir(candidato, passos);
          const dc = Buffer.from(await rc.arrayBuffer());
          passos?.push(`palpite ${modelo} → ${rc.status} ${(rc.headers.get("content-type") ?? "?").split(";")[0]} (${dc.length} bytes)`);
          if (rc.ok && ehPdf(dc)) {
            palpite.modelo = modelo;
            palpite.falhasSeguidas = 0;
            return { dados: dc, tipo: "application/pdf" };
          }
        } catch (e) {
          passos?.push(`palpite ${modelo} → ${descreverErro(e).slice(0, 120)}`);
        }
      }
      palpite.falhasSeguidas++;
    }
    throw new Error(`O link não devolveu um PDF (veio ${tipo || "tipo desconhecido"}, ${dados.length} bytes): é a página do visualizador; falta saber o endereço do PDF (cegid.download.modelo_pdf).`);
  }
  throw new Error("O link não devolveu um PDF (demasiados saltos).");
}

/**
 * Os links do Cegid têm o mesmo token em vários servidores: o Cyclos guardou
 * https://app.cloudware.pt/public_links/link/TOKEN, que hoje redireciona para
 * https://app1.business-pt.cegid.cloud/rus/public-rus/public_links/link/TOKEN
 * (e há também o app3). Se o link guardado não der o PDF, experimenta o
 * mesmo token nos outros servidores (cegid.download.servidores) e nos dois
 * caminhos; o que funcionar fica memorizado e passa a ser o primeiro.
 */
const ga = globalThis as unknown as { __alternativaCegid?: { modelo: string | null; falhasSeguidas: number } };
const alternativa = (ga.__alternativaCegid ??= { modelo: null, falhasSeguidas: 0 });

function modelosAlternativos(): string[] {
  const servidores = cfgOu("cegid.download.servidores", "app.cloudware.pt,app1.business-pt.cegid.cloud,app3.business-pt.cegid.cloud")
    .split(",")
    .map((x) => x.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((x) => (/^https?:\/\//.test(x) ? x : `https://${x}`));
  return servidores.flatMap((h) => [`${h}/public_links/link/{token}`, `${h}/rus/public-rus/public_links/link/{token}`]);
}

async function obterComAlternativas(url: string, passos?: string[], guardarHtml?: (html: string, urlFinal: string) => void): Promise<{ dados: Buffer; tipo: string }> {
  const token = url.match(/\/public_links\/link\/([^/?#]+)/)?.[1];
  if (!token) return obterDocumento(url, passos, guardarHtml);
  const tentados = new Set<string>();
  const experimentar = async (u: string, palpites: boolean) => {
    tentados.add(u);
    return obterDocumento(u, passos, guardarHtml, palpites);
  };
  // 1.º o servidor que já funcionou noutras faturas.
  if (alternativa.modelo) {
    const u = alternativa.modelo.replace("{token}", token);
    try {
      return await experimentar(u, false);
    } catch (e) {
      passos?.push(`(servidor memorizado falhou: ${descreverErro(e).slice(0, 120)})`);
    }
  }
  // 2.º o link tal como está no Cyclos.
  let primeiroErro: unknown;
  try {
    if (!tentados.has(url)) return await experimentar(url, false);
  } catch (e) {
    primeiroErro = e;
  }
  // 3.º o mesmo token nos outros servidores (até 20 faturas seguidas sem sucesso, para não multiplicar pedidos).
  if (alternativa.falhasSeguidas < 20) {
    for (const modelo of modelosAlternativos()) {
      const u = modelo.replace("{token}", token);
      if (tentados.has(u)) continue;
      try {
        const r = await experimentar(u, false);
        alternativa.modelo = modelo;
        alternativa.falhasSeguidas = 0;
        passos?.push(`funcionou noutro servidor: ${modelo.replace("{token}", "…")}`);
        return r;
      } catch {
        /* experimenta o seguinte */
      }
    }
    alternativa.falhasSeguidas++;
  }
  // 4.º os endereços de download habituais a partir do link original.
  try {
    return await obterDocumento(url, passos, guardarHtml, true);
  } catch (e) {
    throw primeiroErro ?? e;
  }
}

/** Endereços que aparecem numa página (scripts, ligações, chamadas a APIs) — para descobrir onde está o PDF. */
function enderecosNaPagina(html: string, base: string): string[] {
  const achados = new Set<string>();
  for (const m of html.matchAll(/(?:src|href|action)\s*=\s*["']([^"'#][^"']*)["']/gi)) achados.add(m[1]!);
  for (const m of html.matchAll(/["'`](\/(?:rus|api|public|public-rus|download|files?|documents?)[^"'`\s]{2,200})["'`]/gi)) achados.add(m[1]!);
  for (const m of html.matchAll(/https?:\/\/[^"'`\s<>]+/g)) achados.add(m[0]);
  return [...achados]
    .map((u) => {
      try {
        return new URL(u.replace(/&amp;/g, "&"), base).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u && !/\.(css|png|svg|ico|woff2?|jpg|gif)(\?|$)/i.test(u))
    .slice(0, 40);
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
export async function testarDocumento(mpinvId?: number): Promise<{ ok: boolean; mpinvId?: number; passos: string[]; enderecos: string[]; temPagina: boolean; resultado: string }> {
  const [doc] = mpinvId
    ? await prisma.$queryRaw<Array<{ mpinv_id: number; document_cw_url: string }>>`SELECT mpinv_id, document_cw_url FROM lp_cloudware_monthly_processing_invoices WHERE mpinv_id = ${mpinvId}`
    : await prisma.$queryRaw<Array<{ mpinv_id: number; document_cw_url: string }>>`
        SELECT mpinv_id, document_cw_url FROM lp_cloudware_monthly_processing_invoices
        WHERE document_cw_url IS NOT NULL AND document_cw_url <> '' ORDER BY year DESC, month DESC, mpinv_id DESC LIMIT 1`;
  if (!doc?.document_cw_url) return { ok: false, passos: [], enderecos: [], temPagina: false, resultado: "Não encontrei nenhuma fatura com link." };
  const passos: string[] = [];
  let pagina: { html: string; urlFinal: string } | null = null;
  try {
    const { dados, tipo } = await obterComAlternativas(doc.document_cw_url, passos, (html, urlFinal) => (pagina ??= { html, urlFinal }));
    return { ok: true, mpinvId: doc.mpinv_id, passos, enderecos: [], temPagina: false, resultado: `Funciona: veio um ${tipo.includes("pdf") ? "PDF" : tipo} com ${Math.round(dados.length / 1024)} KB.` };
  } catch (e) {
    const p = pagina as { html: string; urlFinal: string } | null;
    if (p) ultimaPaginaTeste.valor = p;
    return { ok: false, mpinvId: doc.mpinv_id, passos, enderecos: p ? enderecosNaPagina(p.html, p.urlFinal) : [], temPagina: !!p, resultado: descreverErro(e) };
  }
}

/** A última página HTML recebida no teste (para a descarregar e mostrar a quem souber ler). */
const gt = globalThis as unknown as { __paginaTesteCegid?: { valor: { html: string; urlFinal: string } | null } };
export const ultimaPaginaTeste = (gt.__paginaTesteCegid ??= { valor: null });

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
