import { PrismaClient } from "@faturacao/db";
import { garantirDatabaseUrl } from "./properties";

// Sem DATABASE_URL, usa a base de dados do config.properties (como o Java).
garantirDatabaseUrl();

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
