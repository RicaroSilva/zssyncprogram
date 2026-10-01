/** Áreas da aplicação a que se aplica a matriz consultar/criar/editar/
 *  eliminar dos Perfis (mesma ideia do RecursoAdmin do financial). Fica em
 *  texto na base de dados (zsgo_web_permissao_recurso.recurso), por isso
 *  acrescentar um recurso aqui não precisa de alterar tabelas. */
export const RECURSOS = ["RESUMO", "FATURACAO", "CLIENTES", "TAREFAS", "HISTORICO", "UTILIZADORES", "PERFIS"] as const;
export type Recurso = (typeof RECURSOS)[number];

export const NOME_RECURSO: Record<Recurso, string> = {
  RESUMO: "Resumo",
  FATURACAO: "Faturação",
  CLIENTES: "Clientes",
  TAREFAS: "Tarefas agendadas",
  HISTORICO: "Histórico",
  UTILIZADORES: "Utilizadores",
  PERFIS: "Perfis",
};

/** Para onde mandar quem entra em "/" — o primeiro recurso que o perfil
 *  deixa consultar (evita ciclos de redirecionamento, como no financial). */
export const DESTINO_RECURSO: Record<Recurso, string> = {
  RESUMO: "/resumo",
  FATURACAO: "/faturacao",
  CLIENTES: "/clientes",
  TAREFAS: "/tarefas",
  HISTORICO: "/historico",
  UTILIZADORES: "/utilizadores",
  PERFIS: "/perfis",
};
