import "server-only";
import { readFileSync, statSync } from "node:fs";

/**
 * Configuração da faturação: o MESMO config.properties do programa em Java
 * (queries billing.query, creditnote.query, source.clients.verify.query,
 * zsgo.*, cyclos.invoice.*, invoice.*), montado no container e indicado por
 * CONFIG_PROPERTIES (por omissão /config/config.properties). Assim as
 * queries ajustam-se sem recompilar nada, tal como hoje. Relido sempre que
 * o ficheiro muda.
 */

let cache: { caminho: string; mtimeMs: number; valores: Map<string, string> } | undefined;

export function caminhoConfig(): string {
  return process.env.CONFIG_PROPERTIES || "/config/config.properties";
}

/** Formato .properties do Java: chave=valor (ou chave: valor), linhas
 *  continuadas com "\" no fim, comentários # e !, escapes \uXXXX \n \t. */
export function lerProperties(texto: string): Map<string, string> {
  const valores = new Map<string, string>();
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < linhas.length; i++) {
    let linha = linhas[i]!.replace(/^\s+/, "");
    if (!linha || linha.startsWith("#") || linha.startsWith("!")) continue;
    while (terminaEmContinuacao(linha) && i + 1 < linhas.length) {
      linha = linha.slice(0, -1) + linhas[++i]!.replace(/^\s+/, "");
    }
    const m = linha.match(/^((?:\\.|[^=:\s])+)\s*[=:\s]\s*(.*)$/);
    if (!m) {
      valores.set(desescapar(linha), "");
      continue;
    }
    valores.set(desescapar(m[1]!), desescapar(m[2]!));
  }
  return valores;
}

function terminaEmContinuacao(linha: string): boolean {
  const barras = linha.match(/\\+$/)?.[0].length ?? 0;
  return barras % 2 === 1;
}

function desescapar(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => {
    if (c.startsWith("u") && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c === "f" ? "\f" : c;
  });
}

function valores(): Map<string, string> {
  const caminho = caminhoConfig();
  let mtimeMs: number;
  try {
    mtimeMs = statSync(caminho).mtimeMs;
  } catch {
    throw new Error(`Não encontrei o ficheiro de configuração ${caminho} (variável CONFIG_PROPERTIES). Use o mesmo config.properties do programa em Java.`);
  }
  if (!cache || cache.caminho !== caminho || cache.mtimeMs !== mtimeMs) {
    cache = { caminho, mtimeMs, valores: lerProperties(readFileSync(caminho, "utf-8")) };
  }
  return cache.valores;
}

export function configExiste(): boolean {
  try {
    valores();
    return true;
  } catch {
    return false;
  }
}

/** Valor obrigatório. */
export function cfg(chave: string): string {
  const v = valores().get(chave)?.trim();
  if (!v) throw new Error(`Falta '${chave}' no ${caminhoConfig()}.`);
  return v;
}

export function cfgOu(chave: string, omissao: string): string;
export function cfgOu(chave: string, omissao: null): string | null;
export function cfgOu(chave: string, omissao: string | null): string | null {
  const v = valores().get(chave)?.trim();
  return v ? v : omissao;
}

export function cfgInt(chave: string, omissao: number): number {
  const v = Number(cfgOu(chave, String(omissao)));
  return Number.isFinite(v) ? v : omissao;
}
