import "server-only";
import { prisma } from "../db";
import { cfg } from "../config";
import type { ClienteOrigem } from "../zsgo/api";

/**
 * Lê do Cyclos com as queries do config.properties (as mesmas do Java, sem
 * alterações). As queries usam "?" como parâmetros (JDBC); aqui passam a
 * $1::integer, $2::integer… — só fora de texto entre plicas. O "::integer"
 * é o equivalente ao setInt do Java (os parâmetros são sempre o ano e o
 * mês); sem ele o Postgres recebe bigint e make_date(?, ?, 1) falha.
 */
export function paraParametrosPostgres(sql: string): string {
  let n = 0;
  let dentroDeTexto = false;
  let resultado = "";
  for (const c of sql) {
    if (c === "'") dentroDeTexto = !dentroDeTexto;
    resultado += c === "?" && !dentroDeTexto ? `$${++n}::integer` : c;
  }
  return resultado;
}

type Linha = Record<string, unknown>;

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numero = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const booleano = (v: unknown): boolean | null => (v === null || v === undefined ? null : v === true || v === "t" || v === "true" || v === 1);

async function consultar(chave: string, ...parametros: unknown[]): Promise<Linha[]> {
  return prisma.$queryRawUnsafe<Linha[]>(paraParametrosPostgres(cfg(chave)), ...parametros);
}

/** Uma linha de billing.query: rubrica × cliente × conta de origem. */
export interface LinhaFaturacao {
  clienteId: string;
  zsgoCode: string | null;
  rubrica: string | null;
  productReference: string | null;
  nrTransacoes: number;
  valorTotal: number;
  descricaoLinha: string | null;
  contaOrigemId: string;
  contaOrigemNome: string | null;
}

export async function linhasFaturacao(ano: number, mes: number): Promise<LinhaFaturacao[]> {
  const linhas = await consultar("billing.query", ano, mes);
  return linhas.map((l) => {
    const clienteId = String(l.cliente_id);
    return {
      clienteId,
      zsgoCode: texto(l.zsgo_code),
      rubrica: texto(l.rubrica),
      productReference: texto(l.product_reference),
      nrTransacoes: numero(l.nr_transacoes),
      valorTotal: numero(l.valor_total),
      descricaoLinha: texto(l.descricao_linha),
      // Sem conta_origem_id na query → a origem é o próprio cliente (Java).
      contaOrigemId: texto(l.conta_origem_id) ?? clienteId,
      contaOrigemNome: texto(l.conta_origem_nome),
    };
  });
}

/** Uma linha de creditnote.query: um estorno de um mês anterior. */
export interface LinhaEstorno {
  chargebackId: string;
  transacaoOriginalId: string | null;
  clienteId: string;
  zsgoCode: string | null;
  valorEstorno: number;
  productReference: string | null;
  descricao: string | null;
}

export async function linhasEstornos(ano: number, mes: number): Promise<LinhaEstorno[]> {
  const linhas = await consultar("creditnote.query", ano, mes);
  return linhas.map((l) => ({
    chargebackId: String(l.chargeback_id),
    transacaoOriginalId: texto(l.transacao_original_id),
    clienteId: String(l.cliente_id),
    zsgoCode: texto(l.zsgo_code),
    valorEstorno: numero(l.valor_estorno),
    productReference: texto(l.product_reference),
    descricao: texto(l.descricao),
  }));
}

/** Dados atuais dos clientes no Cyclos: todos os já sincronizados
 *  (source.clients.verify.query) ou só os pendentes (source.clients.query). */
export async function clientesOrigem(chave: "source.clients.verify.query" | "source.clients.query" = "source.clients.verify.query"): Promise<ClienteOrigem[]> {
  const linhas = await consultar(chave);
  return linhas.map((l) => ({
    id: String(l.id),
    nome: texto(l.nome),
    nif: texto(l.nif),
    morada: texto(l.morada),
    codigoPostal: texto(l.codigo_postal),
    cidade: texto(l.cidade),
    pais: texto(l.pais),
    email: texto(l.email),
    telefone: texto(l.telefone),
    prazoDias: l.prazo_dias === null || l.prazo_dias === undefined ? null : Number(l.prazo_dias),
    sujeitoPassivo: booleano(l.sujeito_passivo),
    motivoIsencaoZsgoCode: texto(l.motivo_isencao_zsgo_code),
    contentHash: texto(l.content_hash),
  }));
}
