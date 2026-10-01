import { PrismaClient } from "@prisma/client";

// Dados base: o perfil "Super Admin" (acesso total, não eliminável) e,
// opcionalmente, o primeiro administrador (PRIMEIRO_ADMIN_EMAIL /
// PRIMEIRO_ADMIN_NOME no .env). Idempotente — pode correr-se sempre.
const prisma = new PrismaClient();

try {
  const superAdmin = await prisma.perfil.upsert({
    where: { nome: "Super Admin" },
    update: { superAdmin: true, criadoPeloSistema: true },
    create: {
      nome: "Super Admin",
      descricao: "Acesso total à aplicação de faturação.",
      superAdmin: true,
      criadoPeloSistema: true,
    },
  });

  await prisma.perfil.upsert({
    where: { nome: "Consulta" },
    update: {},
    create: {
      nome: "Consulta",
      descricao: "Vê a faturação, os clientes e o histórico, sem alterar nada.",
      criadoPeloSistema: true,
      permissoesRecurso: {
        create: ["RESUMO", "FATURACAO", "CLIENTES", "HISTORICO"].map((recurso) => ({ recurso, consultar: true })),
      },
    },
  });

  const email = process.env.PRIMEIRO_ADMIN_EMAIL?.trim().toLowerCase();
  if (email) {
    const utilizador = await prisma.utilizador.upsert({
      where: { email },
      update: {},
      create: { email, nomeExibicao: process.env.PRIMEIRO_ADMIN_NOME?.trim() || email, estado: "ATIVO" },
    });
    await prisma.utilizadorPerfil.upsert({
      where: { utilizadorId_perfilId: { utilizadorId: utilizador.id, perfilId: superAdmin.id } },
      update: {},
      create: { utilizadorId: utilizador.id, perfilId: superAdmin.id },
    });
    console.log(`Primeiro administrador: ${email} (Super Admin).`);
  }
  console.log("Dados base prontos.");
} finally {
  await prisma.$disconnect();
}
