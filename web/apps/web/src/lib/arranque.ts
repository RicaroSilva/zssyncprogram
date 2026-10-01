import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@faturacao/db";
import { garantirDatabaseUrl } from "./properties";

/**
 * Ao arrancar o servidor: cria as tabelas que faltam (o mesmo
 * packages/db/sql/preparar.sql — só CREATE … IF NOT EXISTS, nunca apaga
 * nada) e os perfis base. Assim, para testar no PC, basta copiar o
 * config.properties e arrancar. Desliga-se com PREPARAR_AO_ARRANCAR=false.
 */
export async function prepararAoArrancar(): Promise<void> {
  if (process.env.PREPARAR_AO_ARRANCAR === "false") return;
  garantirDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    console.warn("[arranque] Sem DATABASE_URL nem config.properties com db.url — não preparei a base de dados.");
    return;
  }
  const ficheiro = [resolve(process.cwd(), "../../packages/db/sql/preparar.sql"), resolve(process.cwd(), "packages/db/sql/preparar.sql")].find((c) => existsSync(c));
  if (!ficheiro) {
    console.warn("[arranque] Não encontrei preparar.sql — corra 'pnpm db:preparar'.");
    return;
  }
  const instrucoes = readFileSync(ficheiro, "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const prisma = new PrismaClient();
  try {
    for (const instrucao of instrucoes) await prisma.$executeRawUnsafe(instrucao);
    await prisma.perfil.upsert({
      where: { nome: "Super Admin" },
      update: { superAdmin: true, criadoPeloSistema: true },
      create: { nome: "Super Admin", descricao: "Acesso total à aplicação de faturação.", superAdmin: true, criadoPeloSistema: true },
    });
    if (!(await prisma.perfil.findUnique({ where: { nome: "Consulta" } }))) {
      await prisma.perfil.create({
        data: {
          nome: "Consulta",
          descricao: "Vê a faturação, os clientes e o histórico, sem alterar nada.",
          criadoPeloSistema: true,
          permissoesRecurso: { create: ["RESUMO", "FATURACAO", "CLIENTES", "HISTORICO"].map((recurso) => ({ recurso, consultar: true })) },
        },
      });
    }
    console.log(`[arranque] Base de dados pronta (${instrucoes.length} instruções, nada foi apagado).`);
  } catch (e) {
    console.error(`[arranque] Não foi possível preparar a base de dados: ${(e as Error).message}`);
  } finally {
    await prisma.$disconnect();
  }
}

/** Segredo da rota interna do agendador (gerado no arranque, só em memória). */
export function segredoAgendador(): string {
  process.env.AGENDADOR_SEGREDO_INTERNO ??= randomBytes(24).toString("hex");
  return process.env.AGENDADOR_SEGREDO_INTERNO;
}
