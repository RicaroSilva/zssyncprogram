import type { LinhaFaturacao } from "./fontes";

/** Uma fatura = cliente × conta de origem (as linhas são as rubricas). */
export interface GrupoFatura {
  clienteId: string;
  origemId: string;
  linhas: LinhaFaturacao[];
  total: number;
}

export function agruparFaturas(linhas: LinhaFaturacao[]): GrupoFatura[] {
  const grupos = new Map<string, GrupoFatura>();
  for (const l of linhas) {
    const chave = `${l.clienteId}|${l.contaOrigemId}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { clienteId: l.clienteId, origemId: l.contaOrigemId, linhas: [], total: 0 };
      grupos.set(chave, g);
    }
    g.linhas.push(l);
    g.total += l.valorTotal;
  }
  for (const g of grupos.values()) g.total = Math.round(g.total * 100) / 100;
  return [...grupos.values()];
}
