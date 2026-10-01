import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Leitura do config.properties (formato .properties do Java) — sem
 * "server-only", para poder ser usado também no arranque (instrumentation).
 */

/** Onde está o config.properties: CONFIG_PROPERTIES; senão, a pasta web/
 *  (para testar no PC basta copiá-lo para lá); senão /config (Docker). */
export function caminhoConfig(): string {
  if (process.env.CONFIG_PROPERTIES) return process.env.CONFIG_PROPERTIES;
  const candidatos = [resolve(process.cwd(), "../../config.properties"), resolve(process.cwd(), "config.properties"), "/config/config.properties"];
  return candidatos.find((c) => existsSync(c)) ?? "/config/config.properties";
}

/** chave=valor (ou chave: valor), linhas continuadas com "\" no fim,
 *  comentários # e !, escapes \uXXXX \n \t. */
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

/**
 * DATABASE_URL; se não estiver definida, constrói-a a partir do db.url /
 * db.user / db.password do config.properties (o mesmo do Java):
 *   jdbc:postgresql://10.0.0.5:5432/cyclos → postgresql://user:senha@10.0.0.5:5432/cyclos
 */
export function garantirDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const caminho = caminhoConfig();
  if (!existsSync(caminho)) return;
  const cfg = lerProperties(readFileSync(caminho, "utf-8"));
  const jdbc = cfg.get("db.url")?.trim();
  const m = jdbc?.match(/^jdbc:postgresql:\/\/([^/?]+)\/([^?]+)(\?.*)?$/);
  if (!m) return;
  const utilizador = encodeURIComponent(cfg.get("db.user")?.trim() ?? "");
  const senha = encodeURIComponent(cfg.get("db.password") ?? "");
  // Parâmetros JDBC (ex.: ?ssl=true) não são todos compatíveis — só o sslmode passa.
  const ssl = m[3]?.match(/[?&](sslmode=[^&]+)/)?.[1];
  process.env.DATABASE_URL = `postgresql://${utilizador}${senha ? `:${senha}` : ""}@${m[1]}/${m[2]}${ssl ? `?${ssl}` : ""}`;
}
