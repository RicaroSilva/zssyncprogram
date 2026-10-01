import "server-only";
import { prisma } from "../db";
import { cfgInt, cfgOu } from "../config";
import { descreverErro } from "../erros";
import { notificarFaturaCyclos } from "../cyclos-fatura";
import { ZsgoApi, ZsgoResultadoIncerto } from "../zsgo/api";
import { numeroParaCyclos } from "../zsgo/documento";
import { linhasEstornos, linhasFaturacao, type LinhaEstorno } from "./fontes";
import { agruparFaturas, type GrupoFatura } from "./agrupar";
import { LocalizadorFaturas, referenciaFatura } from "./localizador";
import { emParalelo, type Progresso } from "./progresso";

/**
 * Emissão das faturas mensais e das notas de crédito — mesma lógica de
 * MonthlyInvoiceService e CreditNoteService do Java, sobre as mesmas tabelas.
 */

export interface ResultadoEmissao {
  ok: number;
  ignorados: number;
  erros: number;
  valor: number;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ── zsgo_invoice_sync (mesmo upsert do InvoiceSyncDao) ─────────────────────

async function upsertFatura(
  g: Pick<GrupoFatura, "clienteId" | "origemId">,
  ano: number,
  mes: number,
  campos: { status: string; saleId?: string | null; pdfUrl?: string | null; valor?: number | null; erro?: string | null; contaTentativa: boolean },
): Promise<void> {
  const tentativa = campos.contaTentativa ? 1 : 0;
  await prisma.$executeRaw`
    INSERT INTO zsgo_invoice_sync (user_id, origem_id, ano, mes, zsgo_sale_id, pdf_url, valor_total, status, tentativas, ultimo_erro, atualizado_em)
    VALUES (${BigInt(g.clienteId)}, ${BigInt(g.origemId)}, ${ano}, ${mes}, ${campos.saleId ?? null}, ${campos.pdfUrl ?? null},
            ${campos.valor ?? null}::numeric, ${campos.status}, ${tentativa}, ${campos.erro ?? null}, now())
    ON CONFLICT (user_id, origem_id, ano, mes) DO UPDATE SET
      zsgo_sale_id = COALESCE(EXCLUDED.zsgo_sale_id, zsgo_invoice_sync.zsgo_sale_id),
      pdf_url = COALESCE(EXCLUDED.pdf_url, zsgo_invoice_sync.pdf_url),
      valor_total = COALESCE(EXCLUDED.valor_total, zsgo_invoice_sync.valor_total),
      status = EXCLUDED.status,
      tentativas = zsgo_invoice_sync.tentativas + ${tentativa},
      ultimo_erro = EXCLUDED.ultimo_erro,
      atualizado_em = now()`;
}

async function marcarIncerto(g: GrupoFatura, ano: number, mes: number, incerto: boolean): Promise<void> {
  await prisma.faturaSync.updateMany({
    where: { userId: BigInt(g.clienteId), origemId: BigInt(g.origemId), ano, mes },
    data: { zsgoIncerto: incerto, atualizadoEm: new Date() },
  });
}

async function guardarNumero(g: GrupoFatura, ano: number, mes: number, numero: string): Promise<void> {
  await prisma.faturaSync.updateMany({ where: { userId: BigInt(g.clienteId), origemId: BigInt(g.origemId), ano, mes }, data: { zsgoNumero: numero } });
}

async function inserirLinhas(g: GrupoFatura, ano: number, mes: number): Promise<void> {
  await prisma.faturaLinha.createMany({
    data: g.linhas.map((l) => ({
      clienteId: BigInt(g.clienteId),
      origemId: BigInt(g.origemId),
      ano,
      mes,
      rubrica: l.rubrica,
      productReference: l.productReference,
      nrTransacoes: BigInt(Math.round(l.nrTransacoes)),
      valor: l.valorTotal,
      descricao: l.descricaoLinha,
    })),
  });
}

function obterEstado(g: GrupoFatura, ano: number, mes: number) {
  return prisma.faturaSync.findUnique({
    where: { userId_origemId_ano_mes: { userId: BigInt(g.clienteId), origemId: BigInt(g.origemId), ano, mes } },
    select: { status: true, zsgoSaleId: true, pdfUrl: true, tentativas: true, zsgoIncerto: true },
  });
}

// ── payload da fatura (igual a buildSalePayload) ───────────────────────────

function payloadFatura(zsgoCode: string, g: GrupoFatura, ano: number, mes: number): string {
  const tipo = cfgOu("invoice.document.type", "FR");
  const serie = cfgOu("invoice.document.series", null);
  const metodoPagamento = cfgOu("zsgo.default.paymentMethodId", null);
  const artigo = cfgOu("invoice.default.productReference", "Envio de fundos");
  const primeira = g.linhas[0]!;
  const redirecionada = primeira.contaOrigemId !== primeira.clienteId;

  let notas: string | null = null;
  if (tipo.toUpperCase() === "FR") {
    notas = `Comissões referentes ao mês de ${MESES[mes - 1]} de ${ano}.`;
    if (redirecionada && primeira.contaOrigemNome?.trim()) notas += ` Referente a: ${primeira.contaOrigemNome}.`;
  }

  const documento: Record<string, unknown> = { type: tipo };
  if (serie) documento.series = serie;
  if (metodoPagamento) documento.payment_method_id = metodoPagamento;
  // Referência única (cliente, origem, mês): permite encontrar a fatura no
  // ZSGO se o pedido ficar sem resposta, sem risco de a criar duas vezes.
  documento.reference = referenciaFatura(g.clienteId, g.origemId, ano, mes);
  documento.tax_included = true;
  documento.auto_confirm = true;
  documento.notes = notas;

  // unit_price_net com o valor exato (toPlainString do Java).
  const itens = g.linhas.map((l) => `{"product_reference":${JSON.stringify(artigo)},"quantity":1,"unit_price_net":${formatoPlano(l.valorTotal)},"notes":${JSON.stringify(l.descricaoLinha)}}`);
  return `{"customer":{"code":${JSON.stringify(zsgoCode)}},"document":${JSON.stringify(documento)},"items":[${itens.join(",")}]}`;
}

/** Número sem notação científica e sem arredondamentos inesperados. */
function formatoPlano(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

// ── faturas ────────────────────────────────────────────────────────────────

export async function emitirFaturas(ano: number, mes: number, progresso: Progresso): Promise<ResultadoEmissao> {
  const zsgo = new ZsgoApi();
  const localizador = new LocalizadorFaturas(zsgo);
  const maxTentativas = cfgInt("invoice.maxAttempts", 5);
  const grupos = agruparFaturas(await linhasFaturacao(ano, mes));
  const r: ResultadoEmissao = { ok: 0, ignorados: 0, erros: 0, valor: 0 };
  let feitos = 0;
  progresso(`Faturas: 0 / ${grupos.length}…`, 0, grupos.length);

  await emParalelo(grupos, cfgInt("invoice.threads", 5), async (g) => {
    // Passo em curso — vai no início da mensagem de erro para se saber onde
    // falhou (ZSGO, Cyclos ou base de dados), como no Java.
    let etapa = "BD: ler estado da fatura";
    let notaErro = "";
    try {
      let estado = await obterEstado(g, ano, mes);
      if (estado?.status === "SINCRONIZADO" || (estado && maxTentativas > 0 && estado.tentativas >= maxTentativas)) {
        r.ignorados++;
        return;
      }

      if (estado?.zsgoIncerto && !estado.zsgoSaleId) {
        // Da última vez o ZSGO não respondeu: a fatura pode já existir lá.
        etapa = "ZSGO: verificar se a fatura já existe";
        const loc = await localizador.localizar(referenciaFatura(g.clienteId, g.origemId, ano, mes), g.linhas[0]!.zsgoCode, g.total, ano, mes);
        if (loc.tipo === "ENCONTRADA" && loc.documento?.id) {
          await upsertFatura(g, ano, mes, { status: "FATURA_CRIADA", saleId: loc.documento.id, valor: g.total, contaTentativa: false });
          if (loc.documento.pdfUrl) await upsertFatura(g, ano, mes, { status: "PDF_GERADO", pdfUrl: loc.documento.pdfUrl, contaTentativa: false });
          await marcarIncerto(g, ano, mes, false);
          await inserirLinhas(g, ano, mes);
          estado = await obterEstado(g, ano, mes);
        } else if (loc.tipo === "NAO_EXISTE") {
          await marcarIncerto(g, ano, mes, false);
          estado = await obterEstado(g, ano, mes);
        } else {
          await upsertFatura(g, ano, mes, {
            status: "ERRO",
            erro: `[Verificar no ZSGO] Da última vez o ZSGO não respondeu ao criar esta fatura e não foi possível confirmar sozinho se existe (${loc.motivo}). Confirme no ZSGO e indique o número da fatura existente ou autorize criar outra vez.`,
            contaTentativa: true,
          });
          r.erros++;
          return;
        }
      }

      const zsgoCode = g.linhas[0]!.zsgoCode;
      if (!zsgoCode?.trim()) {
        await upsertFatura(g, ano, mes, { status: "ERRO", erro: "Cliente ainda não tem zsgo_code (não sincronizado no ZSGO).", contaTentativa: true });
        r.erros++;
        return;
      }

      let saleId = estado?.zsgoSaleId ?? null;
      let pdfUrl = estado?.pdfUrl ?? null;
      if (!saleId) {
        etapa = "ZSGO: criar fatura";
        const criada = await zsgo.criarVenda(payloadFatura(zsgoCode, g, ano, mes));
        saleId = criada.id;
        pdfUrl = criada.pdfUrl;
        etapa = "BD: gravar fatura criada";
        notaErro = ` (A fatura já foi criada no ZSGO, id=${saleId}.)`;
        await upsertFatura(g, ano, mes, { status: "FATURA_CRIADA", saleId, valor: g.total, contaTentativa: false });
        if (pdfUrl) await upsertFatura(g, ano, mes, { status: "PDF_GERADO", pdfUrl, contaTentativa: false });
        await inserirLinhas(g, ano, mes);
        r.valor += g.total;
      }

      etapa = "ZSGO: ler nº da fatura";
      notaErro = ` (A fatura já existe no ZSGO, id=${saleId} — na próxima execução só se repete o que falta.)`;
      const doc = await zsgo.obterVenda(saleId);
      const numero = numeroParaCyclos(doc);
      if (!numero) throw new Error(`O ZSGO não devolveu o número da fatura id=${saleId}.`);
      await guardarNumero(g, ano, mes, doc.numero ?? numero);
      if (!pdfUrl && doc.pdfUrl) {
        pdfUrl = doc.pdfUrl;
        await upsertFatura(g, ano, mes, { status: "PDF_GERADO", pdfUrl, contaTentativa: false });
      }
      if (!pdfUrl) {
        etapa = "ZSGO: obter PDF";
        throw new Error(`Fatura criada (id=${saleId}) mas o ZSGO não devolveu pdf_url.`);
      }

      etapa = "Cyclos: enviar PDF";
      await notificarFaturaCyclos(g.clienteId, pdfUrl, numero);
      etapa = "BD: marcar como sincronizada";
      await upsertFatura(g, ano, mes, { status: "SINCRONIZADO", contaTentativa: false });
      r.ok++;
    } catch (e) {
      const erro = `[${etapa}] ${descreverErro(e)}${notaErro}`;
      try {
        await upsertFatura(g, ano, mes, { status: "ERRO", erro, contaTentativa: true });
        if (e instanceof ZsgoResultadoIncerto) await marcarIncerto(g, ano, mes, true);
      } catch (e2) {
        console.error(`Falha adicional ao gravar erro da fatura ${g.clienteId}/${g.origemId}: ${descreverErro(e2)}`);
      }
      r.erros++;
    } finally {
      feitos++;
      progresso(`Faturas: ${feitos} / ${grupos.length}…`, feitos, grupos.length);
    }
  });

  r.valor = Math.round(r.valor * 100) / 100;
  return r;
}

// ── notas de crédito (igual a CreditNoteService) ───────────────────────────

function payloadNotaCredito(zsgoCode: string, linhas: LinhaEstorno[]): string {
  const serie = cfgOu("invoice.document.series", null);
  const metodoPagamento = cfgOu("zsgo.default.paymentMethodId", null);
  const artigo = cfgOu("invoice.default.productReference", "Envio de fundos");
  const documento: Record<string, unknown> = { type: "NC" };
  if (serie) documento.series = serie;
  if (metodoPagamento) documento.payment_method_id = metodoPagamento;
  documento.tax_included = true;
  documento.auto_confirm = true;
  const itens = linhas.map((l) => `{"product_reference":${JSON.stringify(artigo)},"quantity":1,"unit_price_net":${formatoPlano(l.valorEstorno)},"notes":${JSON.stringify(`Estorno: ${l.descricao}`)}}`);
  return `{"customer":{"code":${JSON.stringify(zsgoCode)}},"document":${JSON.stringify(documento)},"items":[${itens.join(",")}]}`;
}

async function marcarNc(l: LinhaEstorno, ano: number, mes: number, campos: { sucesso: true; ncId: string } | { sucesso: false; erro: string }): Promise<void> {
  const original = l.transacaoOriginalId ? BigInt(l.transacaoOriginalId) : null;
  if (campos.sucesso) {
    await prisma.$executeRaw`
      INSERT INTO zsgo_credit_note_sync (chargeback_id, transacao_original_id, cliente_id, ano, mes, valor_estorno, zsgo_nc_id, status, tentativas, ultimo_erro, atualizado_em)
      VALUES (${BigInt(l.chargebackId)}, ${original}, ${BigInt(l.clienteId)}, ${ano}, ${mes}, ${l.valorEstorno}::numeric, ${campos.ncId}, 'SINCRONIZADO', 1, NULL, now())
      ON CONFLICT (chargeback_id) DO UPDATE SET
        transacao_original_id = EXCLUDED.transacao_original_id, cliente_id = EXCLUDED.cliente_id, ano = EXCLUDED.ano, mes = EXCLUDED.mes,
        valor_estorno = EXCLUDED.valor_estorno, zsgo_nc_id = EXCLUDED.zsgo_nc_id, status = 'SINCRONIZADO',
        tentativas = zsgo_credit_note_sync.tentativas + 1, ultimo_erro = NULL, atualizado_em = now()`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO zsgo_credit_note_sync (chargeback_id, transacao_original_id, cliente_id, ano, mes, status, tentativas, ultimo_erro, atualizado_em)
      VALUES (${BigInt(l.chargebackId)}, ${original}, ${BigInt(l.clienteId)}, ${ano}, ${mes}, 'ERRO', 1, ${campos.erro}, now())
      ON CONFLICT (chargeback_id) DO UPDATE SET
        cliente_id = EXCLUDED.cliente_id, ano = EXCLUDED.ano, mes = EXCLUDED.mes, status = 'ERRO',
        tentativas = zsgo_credit_note_sync.tentativas + 1, ultimo_erro = EXCLUDED.ultimo_erro, atualizado_em = now()`;
  }
}

export async function emitirNotasCredito(ano: number, mes: number, progresso: Progresso): Promise<ResultadoEmissao> {
  const zsgo = new ZsgoApi();
  const maxTentativas = cfgInt("invoice.maxAttempts", 5);
  const estornos = await linhasEstornos(ano, mes);
  const porCliente = new Map<string, LinhaEstorno[]>();
  for (const e of estornos) porCliente.set(e.clienteId, [...(porCliente.get(e.clienteId) ?? []), e]);
  const estados = new Map(
    (await prisma.notaCreditoSync.findMany({ where: { chargebackId: { in: estornos.map((e) => BigInt(e.chargebackId)) } }, select: { chargebackId: true, status: true, tentativas: true } })).map(
      (n) => [n.chargebackId.toString(), n],
    ),
  );
  const r: ResultadoEmissao = { ok: 0, ignorados: 0, erros: 0, valor: 0 };
  let feitos = 0;
  const total = porCliente.size;
  progresso(`Notas de crédito: 0 / ${total}…`, 0, total);

  for (const [clienteId, linhas] of porCliente) {
    const pendentes = linhas.filter((l) => {
      const e = estados.get(l.chargebackId);
      return !(e?.status === "SINCRONIZADO") && !(e && maxTentativas > 0 && e.tentativas >= maxTentativas);
    });
    feitos++;
    if (pendentes.length === 0) {
      r.ignorados++;
    } else if (!pendentes[0]!.zsgoCode?.trim()) {
      for (const l of pendentes) await marcarNc(l, ano, mes, { sucesso: false, erro: "Cliente ainda não tem zsgo_code (não sincronizado no ZSGO)." });
      r.erros++;
    } else {
      try {
        const nc = await zsgo.criarVenda(payloadNotaCredito(pendentes[0]!.zsgoCode!, pendentes));
        for (const l of pendentes) {
          await marcarNc(l, ano, mes, { sucesso: true, ncId: nc.id });
          r.valor += l.valorEstorno;
        }
        r.ok++;
      } catch (e) {
        const erro = `[ZSGO: criar nota de crédito] ${descreverErro(e)}`;
        for (const l of pendentes) await marcarNc(l, ano, mes, { sucesso: false, erro });
        r.erros++;
        console.error(`Falha ao emitir NC para o cliente ${clienteId}: ${erro}`);
      }
    }
    progresso(`Notas de crédito: ${feitos} / ${total}…`, feitos, total);
  }
  r.valor = Math.round(r.valor * 100) / 100;
  return r;
}
