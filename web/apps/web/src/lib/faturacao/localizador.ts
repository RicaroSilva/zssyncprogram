import "server-only";
import { descreverErro } from "../erros";
import type { ZsgoApi } from "../zsgo/api";
import type { DocumentoZsgo } from "../zsgo/documento";

/**
 * Descobre sozinho se uma fatura "Verificar no ZSGO" (pedido sem resposta)
 * chegou a ser criada — igual a service/LocalizadorFaturas do Java:
 *  1. procura pela referência LP-cliente-origem-AAAAMM;
 *  2. para as antigas, percorre a lista do ZSGO e procura uma fatura do
 *     mesmo cliente, com o mesmo valor, emitida depois do fim do mês.
 * Só responde NAO_EXISTE quando leu a lista toda e não há NENHUMA fatura do
 * cliente nesse período. Qualquer dúvida → INCONCLUSIVO. A lista lê-se uma
 * vez por execução.
 */
export type TipoResultado = "ENCONTRADA" | "NAO_EXISTE" | "INCONCLUSIVO";
export interface ResultadoLocalizacao {
  tipo: TipoResultado;
  documento?: DocumentoZsgo;
  motivo: string;
}

const POR_PAGINA = 100;
const MAX_PAGINAS = 3000;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function referenciaFatura(cliente: string, origem: string, ano: number, mes: number): string {
  return `LP-${cliente}-${origem}-${ano}${String(mes).padStart(2, "0")}`;
}

export class LocalizadorFaturas {
  private todos?: DocumentoZsgo[];
  private falhaLeitura?: string;
  private carregamento?: Promise<void>;

  constructor(private readonly zsgo: ZsgoApi) {}

  async localizar(referencia: string, codigoCliente: string | null, total: number, ano: number, mes: number): Promise<ResultadoLocalizacao> {
    try {
      const porRef = (await this.zsgo.procurarVendas(referencia)).filter((d) => d.referencia === referencia && !d.anulado);
      if (porRef.length === 1) return { tipo: "ENCONTRADA", documento: await this.completo(porRef[0]!), motivo: `encontrada pela referência ${referencia}` };
      if (porRef.length > 1) return { tipo: "INCONCLUSIVO", motivo: `há ${porRef.length} documentos com a referência ${referencia} (${numeros(porRef)}) — possível duplicado` };
    } catch {
      // a pesquisa pode não procurar na referência: segue para a lista completa
    }

    await this.carregar();
    if (this.falhaLeitura || !this.todos) return { tipo: "INCONCLUSIVO", motivo: `não foi possível ler a lista de documentos do ZSGO: ${this.falhaLeitura}` };

    const comRef = this.todos.filter((d) => d.referencia === referencia && !d.anulado);
    if (comRef.length === 1) return { tipo: "ENCONTRADA", documento: await this.completo(comRef[0]!), motivo: `encontrada pela referência ${referencia}` };
    if (comRef.length > 1) return { tipo: "INCONCLUSIVO", motivo: `há ${comRef.length} documentos com a referência ${referencia} (${numeros(comRef)}) — possível duplicado` };
    if (!codigoCliente) return { tipo: "INCONCLUSIVO", motivo: "sem código de cliente para comparar" };

    // A fatura do mês M só pode ter sido emitida depois do fim de M.
    const desde = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
    // As faturas do programa dizem nas notas a que mês se referem.
    const mesEsperado = `mês de ${MESES[mes - 1]} de ${ano}`;
    let camposLegiveis = this.todos.length === 0;
    const doCliente: DocumentoZsgo[] = [];
    const mesmoValor: DocumentoZsgo[] = [];
    for (const d of this.todos) {
      if (d.clienteCodigo && d.total !== undefined) camposLegiveis = true;
      if (d.anulado || d.clienteCodigo !== codigoCliente) continue;
      if (d.data && d.data.length >= 10 && d.data.slice(0, 10) < desde) continue;
      const notas = (d.notas ?? "").toLowerCase();
      if (notas.includes("referentes ao mês de") && !notas.includes(mesEsperado)) continue;
      doCliente.push(d);
      if (d.total !== undefined && Math.abs(d.total - total) < 0.01) mesmoValor.push(d);
    }
    if (!camposLegiveis) return { tipo: "INCONCLUSIVO", motivo: "a lista do ZSGO não traz o cliente e o valor de cada documento" };
    if (mesmoValor.length === 1) return { tipo: "ENCONTRADA", documento: await this.completo(mesmoValor[0]!), motivo: `encontrada pelo cliente e valor (${mesmoValor[0]!.numero})` };
    if (mesmoValor.length > 1) return { tipo: "INCONCLUSIVO", motivo: `há ${mesmoValor.length} faturas deste cliente com este valor (${numeros(mesmoValor)}) — possível duplicado` };
    if (doCliente.length > 0) return { tipo: "INCONCLUSIVO", motivo: `há faturas deste cliente depois do fim do mês, mas com outro valor (${numeros(doCliente)})` };
    return { tipo: "NAO_EXISTE", motivo: `não há nenhuma fatura deste cliente no ZSGO depois de ${desde}` };
  }

  /** Documentos cujo número é o indicado ("11385", "FR API-FR/11385", …). */
  async porNumero(texto: string): Promise<DocumentoZsgo[]> {
    await this.carregar();
    if (this.falhaLeitura || !this.todos) throw new Error(`não foi possível ler a lista do ZSGO: ${this.falhaLeitura}`);
    const t = texto.trim();
    return this.todos.filter(
      (d) =>
        t === d.id ||
        t.toLowerCase() === d.numero?.toLowerCase() ||
        t === d.numeroSimples ||
        (!!d.numeroSimples && (t.endsWith(`/${d.numeroSimples}`) || t.endsWith(` ${d.numeroSimples}`)) && (!d.tipo || t.toUpperCase().startsWith(d.tipo.toUpperCase()))),
    );
  }

  private carregar(): Promise<void> {
    this.carregamento ??= (async () => {
      const lista: DocumentoZsgo[] = [];
      try {
        for (let p = 1; p <= MAX_PAGINAS; p++) {
          const pg = await this.zsgo.listarVendas(p, POR_PAGINA);
          lista.push(...pg.documentos);
          const ultima = pg.documentos.length === 0 || (pg.totalPaginas !== undefined ? p >= pg.totalPaginas : pg.documentos.length < POR_PAGINA);
          if (ultima) {
            this.todos = lista;
            return;
          }
        }
        this.falhaLeitura = `a lista tem mais de ${MAX_PAGINAS} páginas`;
      } catch (e) {
        this.falhaLeitura = descreverErro(e);
      }
    })();
    return this.carregamento;
  }

  /** A lista pode não trazer o PDF: lê o documento completo. */
  private async completo(d: DocumentoZsgo): Promise<DocumentoZsgo> {
    if (d.pdfUrl || !d.id) return d;
    try {
      return await this.zsgo.obterVenda(d.id);
    } catch {
      return d;
    }
  }
}

function numeros(ds: DocumentoZsgo[]): string {
  return ds.map((d) => `${d.numero ?? `id ${d.id}`}${d.data ? ` de ${d.data.slice(0, 10)}` : ""}`).join(", ");
}
