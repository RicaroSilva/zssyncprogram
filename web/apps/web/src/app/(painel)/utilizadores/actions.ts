"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";

export interface ResultadoAcao {
  ok: boolean;
  erro?: string;
  id?: string;
}

export interface DadosUtilizador {
  email: string;
  nomeExibicao: string;
  estado: string;
  perfis: string[];
}

const ESTADOS = ["ATIVO", "SUSPENSO", "BLOQUEADO"];

/** Nunca deixar a aplicação sem nenhum Super Admin ativo. */
async function ficaSemSuperAdmin(exceto: string, novoEstado: string, novosPerfis: string[]): Promise<boolean> {
  const superPerfis = (await prisma.perfil.findMany({ where: { superAdmin: true }, select: { id: true } })).map((p) => p.id);
  const continuaSuper = novoEstado === "ATIVO" && novosPerfis.some((p) => superPerfis.includes(p));
  if (continuaSuper) return false;
  const outros = await prisma.utilizador.count({
    where: { id: { not: exceto }, estado: "ATIVO", perfis: { some: { perfilId: { in: superPerfis } } } },
  });
  return outros === 0;
}

export async function guardarUtilizadorAction(id: string | null, dados: DadosUtilizador): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("UTILIZADORES", id ? "editar" : "criar");
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nomeExibicao.trim();
  if (!id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "Email inválido." };
  if (!nome) return { ok: false, erro: "Indique o nome." };
  if (!ESTADOS.includes(dados.estado)) return { ok: false, erro: "Estado inválido." };
  const perfisValidos = (await prisma.perfil.findMany({ where: { id: { in: dados.perfis } }, select: { id: true } })).map((p) => p.id);
  if (perfisValidos.length === 0) return { ok: false, erro: "Escolha pelo menos um perfil." };
  // Só um Super Admin pode dar (ou tirar) o perfil Super Admin.
  const superPerfis = (await prisma.perfil.findMany({ where: { superAdmin: true }, select: { id: true } })).map((p) => p.id);
  const antes = id ? await prisma.utilizador.findUnique({ where: { id }, include: { perfis: true } }) : null;
  if (id && !antes) return { ok: false, erro: "Utilizador não encontrado." };
  const tinhaSuper = !!antes?.perfis.some((p) => superPerfis.includes(p.perfilId));
  const ficaSuper = perfisValidos.some((p) => superPerfis.includes(p));
  if (tinhaSuper !== ficaSuper && !sessao.superAdmin) return { ok: false, erro: "Só um Super Admin pode dar ou tirar o perfil Super Admin." };

  if (id) {
    const uid = id;
    if (await ficaSemSuperAdmin(uid, dados.estado, perfisValidos)) return { ok: false, erro: "Não é possível: a aplicação ficaria sem nenhum Super Admin ativo." };
    await prisma.$transaction([
      prisma.utilizador.update({ where: { id: uid }, data: { nomeExibicao: nome, estado: dados.estado } }),
      prisma.utilizadorPerfil.deleteMany({ where: { utilizadorId: uid } }),
      prisma.utilizadorPerfil.createMany({ data: perfisValidos.map((perfilId) => ({ utilizadorId: uid, perfilId })) }),
      ...(dados.estado !== "ATIVO" ? [prisma.sessao.updateMany({ where: { utilizadorId: uid, revogadaEm: null }, data: { revogadaEm: new Date() } })] : []),
    ]);
  } else {
    if (await prisma.utilizador.findUnique({ where: { email } })) return { ok: false, erro: "Já existe um utilizador com este email." };
    const criado = await prisma.utilizador.create({
      data: { email, nomeExibicao: nome, estado: dados.estado, perfis: { create: perfisValidos.map((perfilId) => ({ perfilId })) } },
    });
    id = criado.id;
  }
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: antes ? "editar_utilizador" : "criar_utilizador",
    entidade: "Utilizador",
    entidadeId: id,
    antes: antes && { nome: antes.nomeExibicao, estado: antes.estado, perfis: antes.perfis.map((p) => p.perfilId) },
    depois: { email: antes?.email ?? email, nome, estado: dados.estado, perfis: perfisValidos },
    ip: obterIpCliente(await headers()),
    historico: { utilizador: sessao.email, detalhe: `${antes ? "Utilizador alterado" : "Utilizador criado"}: ${antes?.email ?? email} (${dados.estado.toLowerCase()}).` },
  });
  revalidatePath("/utilizadores");
  return { ok: true, id };
}
