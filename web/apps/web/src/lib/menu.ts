import type { Acao } from "./auth";
import type { Recurso } from "./recursos";
import { operacoesDe, recursoPorSlug } from "./zsgo/recursos";

/**
 * Menu do painel, organizado como o do ZSGO: separadores em cima
 * (Dashboard, Entidades, Produtos, Vendas, Tesouraria, Relatórios,
 * Configuração) e, à esquerda, os grupos do separador aberto. Cada entrada
 * só aparece a quem a pode usar; as do ZSGO só se a operação existir na API.
 */

export interface ItemMenu {
  href: string;
  nome: string;
  recurso: Recurso;
  acao?: Acao;
}
export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}
export interface SeparadorMenu {
  nome: string;
  href: string;
  grupos: GrupoMenu[];
}

/** "Resumo de X" e "Novo X" de uma área do ZSGO. */
function zsgo(slug: string, resumo: string, novo?: string): ItemMenu[] {
  const r = recursoPorSlug(slug);
  if (!r) return [];
  const ops = operacoesDe(r);
  const itens: ItemMenu[] = [];
  if (ops.listar || ops.criar) itens.push({ href: `/zsgo/${slug}`, nome: resumo, recurso: "ZSGO" });
  if (novo && ops.criar) itens.push({ href: `/zsgo/${slug}/novo`, nome: novo, recurso: "ZSGO", acao: "criar" });
  return itens;
}

const SEPARADORES: SeparadorMenu[] = [
  { nome: "Dashboard", href: "/resumo", grupos: [{ titulo: "Dashboard", itens: [{ href: "/resumo", nome: "Resumo", recurso: "RESUMO" }] }] },
  {
    nome: "Análise",
    href: "/analise",
    grupos: [
      {
        titulo: "Análise",
        itens: [
          { href: "/analise", nome: "Clientes", recurso: "RESUMO" },
          { href: "/analise/crescimento", nome: "Crescimento e queda", recurso: "RESUMO" },
          { href: "/analise/rubricas", nome: "Rubricas", recurso: "RESUMO" },
        ],
      },
    ],
  },
  {
    nome: "Entidades",
    href: "/clientes",
    grupos: [
      {
        titulo: "Clientes",
        itens: [
          { href: "/clientes", nome: "Clientes do Cyclos", recurso: "CLIENTES" },
          ...zsgo("clientes", "Resumo de clientes", "Novo cliente"),
          ...zsgo("agendamentos", "Resumo de agendamentos", "Novo agendamento"),
        ],
      },
      { titulo: "Vendedores", itens: [...zsgo("vendedores", "Resumo de vendedores", "Novo vendedor"), ...zsgo("comissoes", "Comissões")] },
      { titulo: "Fornecedores", itens: zsgo("fornecedores", "Resumo de fornecedores", "Novo fornecedor") },
      {
        titulo: "Opções de pagamento",
        itens: [...zsgo("metodos-pagamento", "Métodos de pagamento", "Novo método de pagamento"), ...zsgo("condicoes-pagamento", "Condições de pagamento", "Nova condição de pagamento")],
      },
    ],
  },
  {
    nome: "Produtos",
    href: "/zsgo/artigos",
    grupos: [
      { titulo: "Artigos", itens: [...zsgo("artigos", "Resumo de artigos", "Novo artigo"), ...zsgo("familias", "Famílias", "Nova família"), ...zsgo("unidades", "Unidades", "Nova unidade")] },
      { titulo: "Stock", itens: [...zsgo("armazens", "Armazéns"), ...zsgo("documentos-stock", "Documentos de stock", "Novo documento de stock")] },
    ],
  },
  {
    nome: "Vendas",
    href: "/faturacao",
    grupos: [
      {
        titulo: "Faturação mensal",
        itens: [
          { href: "/faturacao", nome: "Faturas do mês", recurso: "FATURACAO" },
          { href: "/notas-credito", nome: "Notas de crédito", recurso: "FATURACAO" },
          { href: "/diagnostico", nome: "Diagnóstico ZSGO", recurso: "FATURACAO", acao: "editar" },
        ],
      },
      { titulo: "Documentos de venda", itens: zsgo("documentos-venda", "Resumo de documentos", "Novo documento") },
      { titulo: "Cegid (antigo)", itens: [{ href: "/cegid", nome: "Histórico Cegid", recurso: "FATURACAO" }] },
    ],
  },
  {
    nome: "Tesouraria",
    href: "/zsgo/recibos",
    grupos: [
      {
        titulo: "Clientes",
        itens: [
          ...zsgo("recibos", "Resumo de recibos", "Novo recibo"),
          ...(recursoPorSlug("recibos") && operacoesDe(recursoPorSlug("recibos")!).pendentes
            ? [{ href: "/zsgo/recibos/pendentes", nome: "Documentos por liquidar", recurso: "ZSGO" as const }]
            : []),
        ],
      },
      { titulo: "Fornecedores", itens: [...zsgo("pagamentos", "Resumo de pagamentos", "Novo pagamento"), ...zsgo("documentos-compra", "Documentos de compra", "Novo documento de compra")] },
    ],
  },
  {
    nome: "Relatórios",
    href: "/historico",
    grupos: [
      { titulo: "Exportações", itens: zsgo("saft", "Exportação SAF-T") },
      {
        titulo: "Registos",
        itens: [
          { href: "/historico", nome: "Histórico de operações", recurso: "HISTORICO" },
          { href: "/cegid", nome: "Histórico Cegid", recurso: "FATURACAO" },
        ],
      },
    ],
  },
  {
    nome: "Configuração",
    href: "/zsgo",
    grupos: [
      {
        titulo: "ZSGO",
        itens: [
          { href: "/zsgo", nome: "Todas as áreas do ZSGO", recurso: "ZSGO" },
          ...zsgo("series", "Séries"),
          ...zsgo("tipos-documento", "Tipos de documento"),
          ...zsgo("linhas-preco", "Linhas de preço"),
          ...zsgo("isencoes", "Motivos de isenção"),
          ...zsgo("paises", "Países"),
        ],
      },
      {
        titulo: "Aplicação",
        itens: [
          { href: "/tarefas", nome: "Tarefas agendadas", recurso: "TAREFAS" },
          { href: "/utilizadores", nome: "Utilizadores", recurso: "UTILIZADORES" },
          { href: "/perfis", nome: "Perfis", recurso: "PERFIS" },
        ],
      },
    ],
  },
];

/** O menu com só o que este utilizador pode usar (sem grupos nem separadores vazios). */
export function menuPara(pode: (recurso: Recurso, acao: Acao) => boolean): SeparadorMenu[] {
  return SEPARADORES.map((s) => {
    const grupos = s.grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => pode(i.recurso, i.acao ?? "consultar")) })).filter((g) => g.itens.length > 0);
    // O separador abre na primeira entrada que o utilizador pode ver.
    return { ...s, href: grupos[0]?.itens[0]?.href ?? s.href, grupos };
  }).filter((s) => s.grupos.length > 0);
}
