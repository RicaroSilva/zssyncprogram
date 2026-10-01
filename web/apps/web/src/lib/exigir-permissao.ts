import "server-only";
import { obterSessaoAtual, type Acao, type SessaoAtual } from "./auth";
import type { Recurso } from "./recursos";

/** true se a sessão pode fazer `acao` sobre `recurso` — para esconder/
 *  desativar botões; a fronteira de segurança real é sempre
 *  exigirPermissao() do lado do servidor (igual ao financial). */
export function pode(sessao: Pick<SessaoAtual, "superAdmin" | "permissoes"> | null, recurso: Recurso, acao: Acao): boolean {
  if (!sessao) return false;
  if (sessao.superAdmin) return true;
  return !!sessao.permissoes[recurso]?.[acao];
}

/** Fronteira de segurança das Server Actions: lança se não houver sessão
 *  ou se o perfil não tiver a permissão pedida (Super Admin passa sempre). */
export async function exigirPermissao(recurso: Recurso, acao: Acao): Promise<SessaoAtual> {
  const sessao = await obterSessaoAtual();
  if (!sessao) throw new Error("Não autorizado.");
  if (!pode(sessao, recurso, acao)) throw new Error("Não autorizado — o seu perfil não tem esta permissão.");
  return sessao;
}
