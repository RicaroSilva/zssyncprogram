import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { RECURSOS } from "./recursos";
import { excedeuTentativasAutenticacao, registarTentativaAutenticacao } from "./tentativa-autenticacao";

/**
 * Entrar com a conta do painel em Java (tabela zsgo_app_users, a mesma do
 * painel.bat) — para testar no PC sem Keycloak. Ligado por omissão só em
 * desenvolvimento (pnpm dev); em produção só com LOGIN_PAINEL=true. Passa
 * pelo mesmo RBAC e auditoria: cria (ou reaproveita) um Utilizador
 * "painel:<nome>" com o perfil Super Admin (contas ADMIN) ou Operador (as
 * outras: tudo menos utilizadores e perfis, como no painel Java).
 */
export function loginPainelHabilitado(): boolean {
  return process.env.LOGIN_PAINEL ? process.env.LOGIN_PAINEL === "true" : process.env.NODE_ENV !== "production";
}

/** Mesmo formato do util/PasswordUtil do Java: "iteracoes:salBase64:hashBase64" (PBKDF2-SHA256). */
function verificarHashJava(senha: string, guardado: string): boolean {
  try {
    const [iteracoes, sal, hash] = guardado.split(":");
    const esperado = Buffer.from(hash!, "base64");
    const calculado = pbkdf2Sync(senha, Buffer.from(sal!, "base64"), Number(iteracoes), esperado.length, "sha256");
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

export async function verificarContaPainel(usernameBruto: string, senha: string, ip?: string | null): Promise<{ ok: boolean; erro?: string; utilizadorId?: string }> {
  if (!loginPainelHabilitado()) return { ok: false, erro: "O login com a conta do painel está desligado nesta instalação." };
  const username = usernameBruto.trim().toLowerCase();
  const chave = `painel:${username}`;
  if (await excedeuTentativasAutenticacao(chave)) {
    await registarTentativaAutenticacao(chave, false, "demasiadas_tentativas", ip);
    return { ok: false, erro: "Demasiadas tentativas falhadas. Tente novamente dentro de 15 minutos." };
  }
  let contas: Array<{ username: string; password_hash: string; role: string; ativo: boolean }>;
  try {
    contas = await prisma.$queryRaw`SELECT username, password_hash, role, ativo FROM zsgo_app_users WHERE lower(username) = ${username}`;
  } catch {
    return { ok: false, erro: "Não encontrei as contas do painel (tabela zsgo_app_users) nesta base de dados." };
  }
  const conta = contas[0];
  if (!conta || !conta.ativo || !verificarHashJava(senha, conta.password_hash)) {
    await registarTentativaAutenticacao(chave, false, "credenciais_invalidas", ip);
    return { ok: false, erro: "Utilizador ou senha incorretos." };
  }
  await registarTentativaAutenticacao(chave, true, undefined, ip);

  // Como no Java: ADMIN faz tudo; UTILIZADOR faz tudo menos gerir utilizadores.
  const perfil = conta.role === "ADMIN" ? await prisma.perfil.findFirst({ where: { superAdmin: true } }) : await perfilOperador();
  if (!perfil) return { ok: false, erro: "Faltam os perfis base (a base de dados ainda não foi preparada)." };
  const utilizador = await prisma.utilizador.upsert({
    where: { email: chave },
    update: { estado: "ATIVO", ultimoLoginEm: new Date() },
    create: { email: chave, nomeExibicao: conta.username, estado: "ATIVO", ultimoLoginEm: new Date() },
  });
  // Tira os perfis base atribuídos automaticamente antes (ex.: "Consulta"), para seguir o papel atual da conta.
  await prisma.utilizadorPerfil.deleteMany({
    where: { utilizadorId: utilizador.id, perfilId: { not: perfil.id }, perfil: { nome: { in: [...PERFIS_PAINEL] } } },
  });
  await prisma.utilizadorPerfil.upsert({
    where: { utilizadorId_perfilId: { utilizadorId: utilizador.id, perfilId: perfil.id } },
    update: {},
    create: { utilizadorId: utilizador.id, perfilId: perfil.id },
  });
  return { ok: true, utilizadorId: utilizador.id };
}

const PERFIS_PAINEL = ["Super Admin", "Operador", "Consulta"] as const;

/** Perfil "Operador": tudo menos Utilizadores e Perfis (criado se faltar). */
export async function perfilOperador() {
  const existente = await prisma.perfil.findUnique({ where: { nome: "Operador" } });
  if (existente) return existente;
  return prisma.perfil.create({
    data: {
      nome: "Operador",
      descricao: "Faz tudo menos gerir utilizadores e perfis (como as contas UTILIZADOR do painel Java).",
      criadoPeloSistema: true,
      permissoesRecurso: {
        create: RECURSOS.filter((r) => r !== "UTILIZADORES" && r !== "PERFIS").map((recurso) => ({ recurso, consultar: true, criar: true, editar: true, eliminar: true })),
      },
    },
  });
}
