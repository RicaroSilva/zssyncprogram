import { prisma } from "./db";

export const MAX_TENTATIVAS_JANELA = 5;
export const JANELA_BLOQUEIO_MS = 15 * 60 * 1000; // 15 min

/** Limitação de tentativas partilhada por todos os pontos de entrada que
 *  podem ser atacados por força bruta contra a mesma conta — login de
 *  cliente por senha, acesso local de emergência, e verificação de
 *  código TOTP no login (ver verificarTotpLogin em mfa-gestao.ts). Mantida
 *  num único sítio para o limite ser sempre replicado em qualquer novo
 *  passo de autenticação, em vez de reimplementado (e possivelmente
 *  esquecido) em cada um. */
export async function registarTentativaAutenticacao(
  chave: string,
  sucesso: boolean,
  motivoFalha?: string,
  ip?: string | null,
): Promise<void> {
  await prisma.tentativaAutenticacao.create({
    data: { email: chave, sucesso, motivoFalha, ip: ip ?? undefined },
  });
}

export async function excedeuTentativasAutenticacao(chave: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_BLOQUEIO_MS);
  const contagem = await prisma.tentativaAutenticacao.count({
    where: { email: chave, sucesso: false, criadoEm: { gte: desde } },
  });
  return contagem >= MAX_TENTATIVAS_JANELA;
}
