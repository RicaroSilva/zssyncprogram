import "server-only";
import { prisma } from "../db";
import { cfgInt, cfgOu } from "../config";
import { descreverErro } from "../erros";
import { ZsgoApi, ZsgoApiErro } from "../zsgo/api";
import { lerDocumento, lerPagina, type DocumentoZsgo } from "../zsgo/documento";
import { LocalizadorFaturas } from "./localizador";
import { emParalelo, type Progresso } from "./progresso";

/**
 * Conferência com o ZSGO e resolução das faturas "Verificar no ZSGO" — igual
 * a service/ConferenciaService do Java. Só LÊ do ZSGO; nunca altera nada lá.
 */

export interface ChaveFatura {
  userId: bigint;
  origemId: bigint;
  ano: number;
  mes: number;
}

export interface ResultadoConferencia {
  conferidas: number;
  iguais: number;
  diferentes: number;
  erros: number;
}

/** Diferente = anulada no ZSGO ou total diferente em pelo menos 1 cêntimo. */
export function temDiferenca(f: { valorTotal: unknown; zsgoTotal: unknown; zsgoAnulado: boolean | null }): boolean {
  if (f.zsgoAnulado) return true;
  if (f.zsgoTotal === null || f.zsgoTotal === undefined || f.valorTotal === null || f.valorTotal === undefined) return false;
  return Math.abs(Number(f.zsgoTotal) - Number(f.valorTotal)) >= 0.01;
}

export async function conferirMes(ano: number, mes: number, progresso: Progresso): Promise<ResultadoConferencia> {
  const faturas = await prisma.faturaSync.findMany({ where: { ano, mes, zsgoSaleId: { not: null } } });
  const zsgo = new ZsgoApi();
  const r: ResultadoConferencia = { conferidas: 0, iguais: 0, diferentes: 0, erros: 0 };
  let feitas = 0;
  progresso(`A ler ${faturas.length} fatura(s) do ZSGO…`, 0, Math.max(faturas.length, 1));
  await emParalelo(faturas, Math.max(1, Math.min(8, cfgInt("invoice.threads", 5))), async (f) => {
    let d: DocumentoZsgo | null = null;
    let erro: string | null = null;
    try {
      d = await zsgo.obterVenda(f.zsgoSaleId!);
    } catch (e) {
      erro = descreverErro(e);
    }
    await prisma.faturaSync.update({
      where: { userId_origemId_ano_mes: { userId: f.userId, origemId: f.origemId, ano, mes } },
      data: {
        zsgoNumero: d?.numero ?? f.zsgoNumero,
        zsgoTotal: d?.total ?? null,
        zsgoLiquido: d?.liquido ?? null,
        zsgoIva: d?.iva ?? null,
        zsgoEstado: d?.estado ?? null,
        zsgoAnulado: d ? d.anulado : null,
        zsgoConferidoEm: new Date(),
        zsgoErroConferencia: erro,
      },
    });
    r.conferidas++;
    if (erro || !d) r.erros++;
    else if (temDiferenca({ valorTotal: f.valorTotal, zsgoTotal: d.total ?? null, zsgoAnulado: d.anulado })) r.diferentes++;
    else r.iguais++;
    feitas++;
    progresso(`A ler faturas do ZSGO… ${feitas} / ${faturas.length}`, feitas, faturas.length);
  });
  return r;
}

/** Documento completo (lê sempre fresco do ZSGO). */
export async function lerDocumentoZsgo(id: string): Promise<DocumentoZsgo> {
  return new ZsgoApi().obterVenda(id);
}

/**
 * Encontra no ZSGO o documento indicado: aceita o id interno ou o número
 * ("FR API-FR/10930" ou só "10930"). null se não encontrar.
 */
export async function encontrarDocumento(texto: string): Promise<DocumentoZsgo | null> {
  const t = texto.trim();
  if (!t) return null;
  const zsgo = new ZsgoApi();
  // Um id não tem espaços nem barras; um número de documento tem.
  if (/^[A-Za-z0-9-]+$/.test(t)) {
    try {
      const d = await zsgo.obterVenda(t);
      if (d.id) return d;
    } catch (e) {
      if (!(e instanceof ZsgoApiErro) || ![400, 404, 422].includes(e.status ?? 0)) throw e;
    }
  }
  const soNumero: DocumentoZsgo[] = [];
  for (const d of await zsgo.procurarVendas(t)) {
    if (!d.id) continue;
    if (d.numero?.toLowerCase() === t.toLowerCase() || d.id === t) return zsgo.obterVenda(d.id);
    if (d.numero && (d.numero.endsWith(`/${t}`) || d.numero === t)) soNumero.push(d);
  }
  if (soNumero.length === 1) return zsgo.obterVenda(soNumero[0]!.id!);
  // A pesquisa do ZSGO não procura pelo número: percorre a lista toda.
  const naLista = await new LocalizadorFaturas(zsgo).porNumero(t);
  if (naLista.length === 1) {
    const d = naLista[0]!;
    try {
      const completo = await zsgo.obterVenda(d.id!);
      return completo.id ? completo : d;
    } catch {
      return d;
    }
  }
  if (naLista.length > 1) {
    throw new Error(`Há ${naLista.length} documentos com o número ${t} (${naLista.map((d) => d.numero).join(", ")}). Escreva o número completo, com o tipo e a série.`);
  }
  return null;
}

/** A fatura existe no ZSGO: associa-a (a próxima geração só envia o PDF ao Cyclos). */
export async function associarDocumento(k: ChaveFatura, d: DocumentoZsgo): Promise<void> {
  if (!d.id) throw new Error("O documento do ZSGO não tem id.");
  await prisma.$executeRaw`
    UPDATE zsgo_invoice_sync SET zsgo_sale_id = ${d.id}, pdf_url = COALESCE(${d.pdfUrl ?? null}, pdf_url),
        valor_total = COALESCE(valor_total, ${d.total ?? null}::numeric),
        zsgo_numero = COALESCE(${d.numero ?? null}, zsgo_numero),
        status = CASE WHEN ${d.pdfUrl ?? null}::text IS NULL THEN 'FATURA_CRIADA' ELSE 'PDF_GERADO' END,
        zsgo_incerto = FALSE,
        ultimo_erro = 'Associada à fatura que já existia no ZSGO (' || ${d.numero ?? d.id}::text || '). Falta enviar o PDF ao Cyclos: gere a faturação outra vez.',
        atualizado_em = now()
    WHERE user_id = ${k.userId} AND origem_id = ${k.origemId} AND ano = ${k.ano} AND mes = ${k.mes}`;
}

/** Confirmado que a fatura NÃO existe no ZSGO: a próxima geração pode criá-la. */
export async function autorizarRecriar(k: ChaveFatura): Promise<void> {
  await prisma.faturaSync.update({
    where: { userId_origemId_ano_mes: k },
    data: { zsgoIncerto: false, atualizadoEm: new Date() },
  });
}

// ── diagnóstico ────────────────────────────────────────────────────────────

function resumo(d: DocumentoZsgo): string {
  const v = (x: unknown) => (x === undefined || x === null ? "—" : String(x));
  return `id=${v(d.id)} | nº=${v(d.numero)} | cliente=${v(d.clienteCodigo)} | total=${v(d.total)} | data=${v(d.data)} | estado=${v(d.estado)} | anulado=${d.anulado} | referência=${v(d.referencia)} | notas=${v(d.notas)}`;
}

async function bruto(caminho: string): Promise<{ texto: string; corpo?: string }> {
  try {
    const { cfg } = await import("../config");
    const resposta = await fetch(cfg("zsgo.baseUrl").replace(/\/+$/, "") + caminho, {
      headers: { Authorization: `Bearer ${cfg("zsgo.token")}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const corpo = await resposta.text();
    return { texto: `HTTP ${resposta.status}\n${corpo}`, corpo };
  } catch (e) {
    return { texto: `FALHOU: ${descreverErro(e)}` };
  }
}

function secao(titulo: string, r: { texto: string; corpo?: string }, lista: boolean): string {
  let b = `==== ${titulo} ====\n${r.texto.length > 6000 ? `${r.texto.slice(0, 6000)}\n… (cortado)` : r.texto}\n`;
  if (r.corpo) {
    try {
      const json = JSON.parse(r.corpo) as unknown;
      b += "-- o programa percebeu:\n";
      if (lista) {
        const p = lerPagina(json);
        b += `   páginas: ${p.totalPaginas}, documentos nesta página: ${p.documentos.length}\n`;
        for (const d of p.documentos) b += `   • ${resumo(d)}\n`;
      } else {
        b += `   • ${resumo(lerDocumento(json))}\n`;
      }
    } catch (e) {
      b += `   não consegui ler: ${descreverErro(e)}\n`;
    }
  }
  return `${b}\n`;
}

/** Pede ao ZSGO a lista de faturas (e procura um nº/id, se indicado) e mostra
 *  a resposta em bruto e o que o programa percebeu. */
export async function diagnosticoZsgo(procura: string | null): Promise<string> {
  let b = `DIAGNÓSTICO DO ZSGO — ${new Date().toLocaleString("pt-PT")}\nzsgo.status.anulado = ${cfgOu("zsgo.status.anulado", "")}\n\n`;
  b += secao("1) GET /sales?page=1&per_page=3 (lista)", await bruto("/sales?page=1&per_page=3"), true);
  const p = procura?.trim();
  if (p) {
    b += secao(`2) GET /sales?per_page=5&search=${p} (procura)`, await bruto(`/sales?per_page=5&search=${encodeURIComponent(p)}`), true);
    if (/^[A-Za-z0-9-]+$/.test(p)) b += secao(`3) GET /sales/${p} (documento)`, await bruto(`/sales/${encodeURIComponent(p)}`), false);
    try {
      const d = await encontrarDocumento(p);
      b += `RESULTADO de "Existe no ZSGO — indicar o nº" com "${p}": ${d ? `encontrado → ${resumo(d)}` : "NÃO ENCONTRADO"}\n`;
    } catch (e) {
      b += `RESULTADO: erro — ${descreverErro(e)}\n`;
    }
  }
  return b;
}
