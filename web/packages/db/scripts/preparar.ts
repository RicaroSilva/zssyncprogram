import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Corre sql/preparar.sql instrução a instrução. É idempotente (só CREATE
// ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING) —
// é o substituto de "prisma migrate", que não pode ser usado na base de
// dados do Cyclos (ver schema.prisma).
const caminho = fileURLToPath(new URL("../sql/preparar.sql", import.meta.url));
const sql = readFileSync(caminho, "utf-8")
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("--"))
  .join("\n");
const instrucoes = sql
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

const prisma = new PrismaClient();
try {
  for (const instrucao of instrucoes) {
    await prisma.$executeRawUnsafe(instrucao);
  }
  console.log(`Base de dados preparada (${instrucoes.length} instruções, nada foi apagado).`);
} finally {
  await prisma.$disconnect();
}
