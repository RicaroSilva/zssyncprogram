import { NextResponse } from "next/server";
import { obterSessaoAtual } from "@/lib/auth";
import { pode } from "@/lib/exigir-permissao";
import { nomesUtilizadoresCyclos } from "@/lib/cyclos";
import { alertas, intervalo, lerMesOpcional, rankingClientes, rubricas, ultimoMesComReceita, PERIODOS, type Periodo } from "@/lib/analise/dados";
import { chaveMes, lerMes } from "@/lib/formatos";

/** Exportação para Excel (CSV com ";" e vírgula decimal, como o Excel português abre). */
const dec = (x: number, casas = 2) => x.toFixed(casas).replace(".", ",");
const campo = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(request: Request) {
  const sessao = await obterSessaoAtual();
  if (!pode(sessao, "RESUMO", "consultar")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") ?? "clientes";
  const periodo = (PERIODOS.find((p) => p.valor === url.searchParams.get("periodo"))?.valor ?? "12m") as Periodo;
  const mes = lerMesOpcional(url.searchParams.get("mes") ?? undefined) ?? (await ultimoMesComReceita()) ?? lerMes(undefined);
  const iv = intervalo(periodo, mes);
  let linhas: string[][];
  if (tipo === "rubricas") {
    const r = await rubricas(iv);
    linhas = [["Rubrica", "Receita", "Transações", "Por transação", "Clientes"], ...r.map((x) => [x.rubrica, dec(x.valor), String(x.transacoes), x.transacoes ? dec(x.valor / x.transacoes, 4) : "", String(x.clientes)])];
  } else if (tipo === "alertas") {
    const a = await alertas(mes);
    const nomes = await nomesUtilizadoresCyclos(a.map((x) => BigInt(x.user_id)));
    const NOME = { caiu: "A cair", parou: "Parou", cresceu: "A crescer", novo: "Novo" } as const;
    linhas = [["Alerta", "Cliente", "Nome", `Receita ${chaveMes(mes)}`, "Média 3 meses anteriores"], ...a.map((x) => [NOME[x.tipo], x.user_id, nomes.get(x.user_id) ?? "", dec(x.valor), dec(x.media)])];
  } else {
    const { linhas: r } = await rankingClientes(iv);
    const nomes = await nomesUtilizadoresCyclos(r.map((x) => BigInt(x.user_id)));
    linhas = [
      ["Posição", "Cliente", "Nome", "Receita", "Período anterior", "Variação %", "Peso %", "Acumulado %", "Transações", "Por transação"],
      ...r.map((x, i) => [
        String(i + 1),
        x.user_id,
        nomes.get(x.user_id) ?? "",
        dec(x.valor),
        iv.anterior ? dec(x.anterior) : "",
        x.variacao === null ? "" : dec(x.variacao * 100, 1),
        dec(x.peso * 100, 2),
        dec(x.pesoAcumulado * 100, 2),
        String(x.transacoes),
        x.transacoes ? dec(x.valor / x.transacoes, 4) : "",
      ]),
    ];
  }
  const texto = "﻿" + linhas.map((l) => l.map(campo).join(";")).join("\r\n");
  const nome = `analise-${tipo}-${periodo}-${chaveMes(mes)}.csv`;
  return new NextResponse(texto, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` } });
}
