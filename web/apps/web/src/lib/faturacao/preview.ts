import "server-only";
import { prisma } from "../db";
import { cfgInt } from "../config";
import { linhasEstornos, linhasFaturacao } from "./fontes";
import { agruparFaturas } from "./agrupar";

/** Pré-análise do mês — igual a FaturacaoPreviewService do Java. */
export interface Preview {
  totalClientesElegiveis: number;
  clientesJaFaturados: number;
  clientesSemZsgoCode: number;
  clientesEsgotados: number;
  clientesAFaturar: number;
  valorAFaturar: number;
  valorTotalGeral: number;
  idsSemZsgoCode: string[];
  totalNotasCreditoElegiveis: number;
  notasCreditoJaEmitidas: number;
  notasCreditoAEmitir: number;
  notasCreditoSemZsgoCode: number;
  valorNotasCreditoAEmitir: number;
}

export async function calcularPreview(ano: number, mes: number): Promise<Preview> {
  const maxTentativas = cfgInt("invoice.maxAttempts", 5);
  const p: Preview = {
    totalClientesElegiveis: 0,
    clientesJaFaturados: 0,
    clientesSemZsgoCode: 0,
    clientesEsgotados: 0,
    clientesAFaturar: 0,
    valorAFaturar: 0,
    valorTotalGeral: 0,
    idsSemZsgoCode: [],
    totalNotasCreditoElegiveis: 0,
    notasCreditoJaEmitidas: 0,
    notasCreditoAEmitir: 0,
    notasCreditoSemZsgoCode: 0,
    valorNotasCreditoAEmitir: 0,
  };
  const semCodigo = new Set<string>();

  const grupos = agruparFaturas(await linhasFaturacao(ano, mes));
  const estados = await prisma.faturaSync.findMany({ where: { ano, mes }, select: { userId: true, origemId: true, status: true, tentativas: true } });
  const estadoDe = new Map(estados.map((e) => [`${e.userId}|${e.origemId}`, e]));
  p.totalClientesElegiveis = grupos.length;
  for (const g of grupos) {
    p.valorTotalGeral += g.total;
    const e = estadoDe.get(`${g.clienteId}|${g.origemId}`);
    if (e?.status === "SINCRONIZADO") p.clientesJaFaturados++;
    else if (e && maxTentativas > 0 && e.tentativas >= maxTentativas) p.clientesEsgotados++;
    else if (g.linhas[0]!.zsgoCode?.trim()) {
      p.clientesAFaturar++;
      p.valorAFaturar += g.total;
    } else {
      p.clientesSemZsgoCode++;
      if (!semCodigo.has(g.clienteId)) {
        semCodigo.add(g.clienteId);
        p.idsSemZsgoCode.push(g.clienteId);
      }
    }
  }

  const estornos = await linhasEstornos(ano, mes);
  p.totalNotasCreditoElegiveis = estornos.length;
  const ncFeitas = new Set(
    (await prisma.notaCreditoSync.findMany({ where: { chargebackId: { in: estornos.map((e) => BigInt(e.chargebackId)) }, status: "SINCRONIZADO" }, select: { chargebackId: true } })).map((n) =>
      n.chargebackId.toString(),
    ),
  );
  for (const e of estornos) {
    if (ncFeitas.has(e.chargebackId)) {
      p.notasCreditoJaEmitidas++;
      continue;
    }
    p.notasCreditoAEmitir++;
    p.valorNotasCreditoAEmitir += e.valorEstorno;
    // Clientes que só aparecem nas notas de crédito também precisam de ficha.
    if (!e.zsgoCode?.trim()) {
      p.notasCreditoSemZsgoCode++;
      if (!semCodigo.has(e.clienteId)) {
        semCodigo.add(e.clienteId);
        p.idsSemZsgoCode.push(e.clienteId);
      }
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  p.valorAFaturar = r2(p.valorAFaturar);
  p.valorTotalGeral = r2(p.valorTotalGeral);
  p.valorNotasCreditoAEmitir = r2(p.valorNotasCreditoAEmitir);
  return p;
}
