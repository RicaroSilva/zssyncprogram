"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirPermissao } from "@/lib/exigir-permissao";
import { registarAuditoria } from "@/lib/auditoria";
import { obterIpCliente } from "@/lib/rede-confianca";
import { RECURSOS } from "@/lib/recursos";

export interface ResultadoAcao {
  ok: boolean;
  erro?: string;
}

export type Matriz = Record<string, { consultar: boolean; criar: boolean; editar: boolean; eliminar: boolean }>;

export async function guardarPerfilAction(id: string | null, nome: string, descricao: string, matriz: Matriz): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("PERFIS", id ? "editar" : "criar");
  const n = nome.trim();
  if (!n) return { ok: false, erro: "Indique o nome do perfil." };
  const antes = id ? await prisma.perfil.findUnique({ where: { id }, include: { permissoesRecurso: true } }) : null;
  if (id && !antes) return { ok: false, erro: "Perfil não encontrado." };
  if (antes?.superAdmin) return { ok: false, erro: "O perfil Super Admin tem sempre acesso total e não se edita." };
  const outro = await prisma.perfil.findUnique({ where: { nome: n } });
  if (outro && outro.id !== id) return { ok: false, erro: "Já existe um perfil com este nome." };

  const linhas = RECURSOS.map((recurso) => {
    const m = matriz[recurso] ?? { consultar: false, criar: false, editar: false, eliminar: false };
    // Quem pode criar/editar/eliminar também tem de poder consultar.
    const consultar = m.consultar || m.criar || m.editar || m.eliminar;
    return { recurso, consultar, criar: m.criar, editar: m.editar, eliminar: m.eliminar };
  }).filter((l) => l.consultar);

  let perfilId = id;
  if (id) {
    await prisma.$transaction([
      prisma.perfil.update({ where: { id }, data: { nome: n, descricao: descricao.trim() || null } }),
      prisma.permissaoRecurso.deleteMany({ where: { perfilId: id } }),
      prisma.permissaoRecurso.createMany({ data: linhas.map((l) => ({ ...l, perfilId: id })) }),
    ]);
  } else {
    const criado = await prisma.perfil.create({ data: { nome: n, descricao: descricao.trim() || null, permissoesRecurso: { create: linhas } } });
    perfilId = criado.id;
  }
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: antes ? "editar_perfil" : "criar_perfil",
    entidade: "Perfil",
    entidadeId: perfilId,
    antes: antes && { nome: antes.nome, permissoes: antes.permissoesRecurso },
    depois: { nome: n, permissoes: linhas },
    ip: obterIpCliente(await headers()),
    historico: { utilizador: sessao.email, detalhe: `${antes ? "Perfil alterado" : "Perfil criado"}: ${n}.` },
  });
  revalidatePath("/perfis");
  return { ok: true };
}

export async function eliminarPerfilAction(id: string): Promise<ResultadoAcao> {
  const sessao = await exigirPermissao("PERFIS", "eliminar");
  const perfil = await prisma.perfil.findUnique({ where: { id }, include: { _count: { select: { utilizadores: true } } } });
  if (!perfil) return { ok: false, erro: "Perfil não encontrado." };
  if (perfil.criadoPeloSistema) return { ok: false, erro: "Os perfis base não se eliminam." };
  if (perfil._count.utilizadores > 0) return { ok: false, erro: `Há ${perfil._count.utilizadores} utilizador(es) com este perfil — tire-lhes o perfil primeiro.` };
  await prisma.perfil.delete({ where: { id } });
  await registarAuditoria({
    utilizadorId: sessao.utilizadorId,
    acao: "eliminar_perfil",
    entidade: "Perfil",
    entidadeId: id,
    antes: { nome: perfil.nome },
    ip: obterIpCliente(await headers()),
    historico: { utilizador: sessao.email, detalhe: `Perfil eliminado: ${perfil.nome}.` },
  });
  revalidatePath("/perfis");
  return { ok: true };
}
