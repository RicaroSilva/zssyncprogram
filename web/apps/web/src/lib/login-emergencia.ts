import { prisma } from "./db";
import { verificarPassword } from "./senha";
import { registarTentativaAutenticacao, excedeuTentativasAutenticacao } from "./tentativa-autenticacao";

export type MotivoFalhaLoginEmergencia = "desativado" | "nao_configurado" | "credenciais_invalidas" | "demasiadas_tentativas";

export interface ResultadoLoginEmergencia {
  ok: boolean;
  motivo?: MotivoFalhaLoginEmergencia;
  utilizadorId?: string;
}

/** O hash argon2id tem vários "$" — no .env vai em base64 para o docker
 *  compose não o interpolar (ver financial, lib/admin-local-login.ts). */
function decodificarHashBase64(valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  try {
    return Buffer.from(valor, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

/** Acesso de emergência ("break-glass") por utilizador/senha, para quando o
 *  Keycloak não está acessível. Desligado por omissão (só com
 *  ADMIN_LOCAL_LOGIN_ENABLED=true) e as credenciais só vêm do .env.
 *  Passa pelo mesmo RBAC/auditoria: cria (ou reaproveita) um Utilizador
 *  real com o perfil "Super Admin". */
export function loginEmergenciaHabilitado(): boolean {
  return process.env.ADMIN_LOCAL_LOGIN_ENABLED === "true";
}

async function garantirUtilizadorEmergencia(email: string) {
  const perfilAdmin = await prisma.perfil.findFirst({ where: { superAdmin: true } });
  if (!perfilAdmin) {
    throw new Error('Nenhum perfil "Super Admin" existe — corra o seed antes de usar o acesso de emergência.');
  }
  const utilizador = await prisma.utilizador.upsert({
    where: { email },
    update: { estado: "ATIVO", ultimoLoginEm: new Date() },
    create: { email, nomeExibicao: "Administrador (acesso de emergência)", estado: "ATIVO", ultimoLoginEm: new Date() },
  });
  await prisma.utilizadorPerfil.upsert({
    where: { utilizadorId_perfilId: { utilizadorId: utilizador.id, perfilId: perfilAdmin.id } },
    update: {},
    create: { utilizadorId: utilizador.id, perfilId: perfilAdmin.id },
  });
  return utilizador;
}

export async function verificarCredenciaisEmergencia(usernameBruto: string, password: string, ip?: string | null): Promise<ResultadoLoginEmergencia> {
  if (!loginEmergenciaHabilitado()) return { ok: false, motivo: "desativado" };

  const usernameEsperado = process.env.ADMIN_LOCAL_LOGIN_USERNAME?.trim().toLowerCase();
  const hashEsperado = decodificarHashBase64(process.env.ADMIN_LOCAL_LOGIN_PASSWORD_HASH_B64);
  if (!usernameEsperado || !hashEsperado) return { ok: false, motivo: "nao_configurado" };

  const username = usernameBruto.trim().toLowerCase();
  if (await excedeuTentativasAutenticacao(username)) {
    await registarTentativaAutenticacao(username, false, "demasiadas_tentativas", ip);
    return { ok: false, motivo: "demasiadas_tentativas" };
  }
  if (username !== usernameEsperado || !(await verificarPassword(hashEsperado, password))) {
    await registarTentativaAutenticacao(username, false, "credenciais_invalidas", ip);
    return { ok: false, motivo: "credenciais_invalidas" };
  }

  await registarTentativaAutenticacao(username, true, undefined, ip);
  const utilizador = await garantirUtilizadorEmergencia(usernameEsperado);
  return { ok: true, utilizadorId: utilizador.id };
}
