import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import { obterIpCliente } from "./rede-confianca";
import { RECURSOS, type Recurso } from "./recursos";

export const COOKIE_SESSAO = "faturacao_sessao";
/** A sessão expira ao fim de 8 h SEM USO (cada pedido prolonga-a), e nunca
 *  dura mais de 7 dias desde o login. */
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8h sem uso
const MAXIMO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export type Acao = "consultar" | "criar" | "editar" | "eliminar";
export type Permissoes = Partial<Record<Recurso, Record<Acao, boolean>>>;

export interface SessaoAtual {
  sessaoId: string;
  utilizadorId: string;
  email: string;
  nomeExibicao: string;
  /** Perfil "Super Admin" — acesso total, ignora as permissões. */
  superAdmin: boolean;
  /** União (OR) das permissões de todos os perfis do utilizador. */
  permissoes: Permissoes;
}

/** Cria a sessão de um utilizador já autenticado (Keycloak ou acesso de
 *  emergência) — mesma lógica do financial (cookie httpOnly com o id da
 *  sessão guardada na base de dados). */
export async function criarSessao(utilizadorId: string): Promise<string> {
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  const cabecalhos = await headers();
  const sessao = await prisma.sessao.create({
    data: {
      utilizadorId,
      expiraEm,
      ip: obterIpCliente(cabecalhos) ?? undefined,
      userAgent: cabecalhos.get("user-agent") ?? undefined,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, sessao.id, {
    httpOnly: true,
    // Ver financial/lib/auth.ts: decidir "Secure" pelo X-Forwarded-Proto
    // (o Caddy envia-o), não por NODE_ENV — senão o acesso direto por
    // http://<ip>:porta perde a sessão a seguir ao login.
    secure: cabecalhos.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    // O cookie dura o máximo; quem decide se a sessão ainda vale é a base de dados (expira_em).
    expires: new Date(Date.now() + MAXIMO_SESSAO_MS),
  });
  return sessao.id;
}

export async function obterSessaoAtual(): Promise<SessaoAtual | null> {
  const jar = await cookies();
  const sessaoId = jar.get(COOKIE_SESSAO)?.value;
  if (!sessaoId) return null;

  const sessao = await prisma.sessao.findUnique({
    where: { id: sessaoId },
    include: { utilizador: { include: { perfis: { include: { perfil: { include: { permissoesRecurso: true } } } } } } },
  });
  if (!sessao || sessao.revogadaEm || sessao.expiraEm < new Date()) return null;
  if (sessao.utilizador.estado !== "ATIVO") return null;
  // Prolonga a sessão com o uso (no máximo uma escrita a cada 10 minutos).
  const novaExpiracao = Math.min(Date.now() + DURACAO_SESSAO_MS, sessao.criadoEm.getTime() + MAXIMO_SESSAO_MS);
  if (novaExpiracao - sessao.expiraEm.getTime() > 10 * 60 * 1000) {
    await prisma.sessao.update({ where: { id: sessao.id }, data: { expiraEm: new Date(novaExpiracao) } }).catch(() => {});
  }

  const perfis = sessao.utilizador.perfis.map((p) => p.perfil);
  const superAdmin = perfis.some((p) => p.superAdmin);

  const permissoes: Permissoes = {};
  for (const perfil of perfis) {
    for (const linha of perfil.permissoesRecurso) {
      if (!(RECURSOS as readonly string[]).includes(linha.recurso)) continue;
      const recurso = linha.recurso as Recurso;
      const atual = permissoes[recurso] ?? { consultar: false, criar: false, editar: false, eliminar: false };
      permissoes[recurso] = {
        consultar: atual.consultar || linha.consultar,
        criar: atual.criar || linha.criar,
        editar: atual.editar || linha.editar,
        eliminar: atual.eliminar || linha.eliminar,
      };
    }
  }

  return {
    sessaoId: sessao.id,
    utilizadorId: sessao.utilizadorId,
    email: sessao.utilizador.email,
    nomeExibicao: sessao.utilizador.nomeExibicao,
    superAdmin,
    permissoes,
  };
}

export async function terminarSessaoAtual(): Promise<void> {
  const jar = await cookies();
  const sessaoId = jar.get(COOKIE_SESSAO)?.value;
  if (sessaoId) {
    await prisma.sessao.updateMany({ where: { id: sessaoId }, data: { revogadaEm: new Date() } });
  }
  jar.delete(COOKIE_SESSAO);
}
