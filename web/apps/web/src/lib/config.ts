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

import { caminhoConfig, lerProperties } from "./properties";

export { caminhoConfig, lerProperties };

let cache: { caminho: string; mtimeMs: number; valores: Map<string, string> } | undefined;

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
