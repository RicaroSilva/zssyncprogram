# PLANEAMENTO — Faturação web

Passar o programa de faturação em Java (painel Swing) para uma aplicação web
com a stack e a metodologia do `charib-dev/financial`, mantendo **todas** as
regras de negócio já validadas (ver `../CLAUDE.md`).

## Decisões

- **Aplicação nova** (não dentro do financial), só de faturação.
- **Base de dados do Cyclos** (a mesma do Java): lê `users`, `transfers`,
  `users_products`… e as tabelas de controlo `zsgo_*`, para saber o que já
  foi importado/faturado. Tabelas novas só `zsgo_web_*`; nada do Cyclos é
  alterado; sem `prisma migrate` (SQL idempotente em
  `packages/db/sql/preparar.sql`).
- **Login igual ao financial**: Keycloak OIDC + acesso de emergência,
  sessões em BD, perfis × recursos, auditoria encadeada por hash.
- **Sem worker/Redis** (como o financial). O agendador corre dentro do
  próprio servidor (`instrumentation.ts` chama de 30 em 30 s uma rota
  interna protegida por um segredo gerado no arranque).
- O Java e a web podem correr em paralelo durante a transição — usam as
  mesmas tabelas e as mesmas regras (nunca repetir um POST ao ZSGO sem
  resposta; referência `LP-cliente-origem-AAAAMM`; localizador de faturas).

## Fases

| # | Conteúdo | Estado |
|---|---|---|
| 1 | Monorepo, tokens de design, login (Keycloak + emergência), perfis, auditoria; Resumo, Faturação (lista + detalhe), Clientes e Histórico — só leitura | ✅ |
| 2 | Cliente ZSGO e Cyclos em TypeScript (criar/atualizar clientes, criar faturas e notas de crédito, PDF, `invoicenumber`), queries do `config.properties`; **Gerar faturação** com a janela de passos (pré-análise → criar clientes → verificar alterações → atualizar → resumo → emitir), localizador de faturas "Verificar no ZSGO" | ✅ |
| 3 | "Verificar no ZSGO" à mão (associar nº / autorizar recriar) no detalhe da fatura, documento do ZSGO no detalhe, Conferir com o ZSGO (segundo plano) + filtro "Com diferença", página de notas de crédito, Diagnóstico do ZSGO | ✅ |
| 4 | Tarefas agendadas (agendador dentro do servidor, mesma tabela e mesma reserva do Java, hora de Lisboa) e páginas Utilizadores/Perfis | ✅ |
| 4b | Página principal com gráficos (faturado por mês, top clientes, rubricas, regiões) e módulo **ZSGO — gestão direta**: tudo o que a API 1.3 permite (listas com filtros, detalhe, criar/editar/eliminar, anular, PDF/XML, ativar/desativar, documentos por liquidar, SAF-T), gerado a partir da especificação (`docs/zsgo-api-1.3.yaml` → `scripts-zsgo-spec.py`) | ✅ |
| 4c | Histórico Cegid (tabelas `lp_cloudware_*`, só leitura) e cópia de todos os PDFs para o S3 (SeaweedFS) antes de a licença acabar | ✅ |
| 4d | Análise: ranking de clientes (variação, peso, acumulado), alertas (a cair, pararam, a crescer, novos), rubricas, ficha por cliente, exportação CSV — ZSGO − NC + Cegid, valores com impostos. Por fazer: custos por rubrica → margem/lucro | ✅ |
| 5 | Faturação ocasional (produto `ocasionalTransactions`, uma fatura por pagamento, diária) — quando o utilizador especificar | ⏳ |
| 6 | Desligar o programa em Java | ⏳ |

## Onde estão as queries

No mesmo `config.properties` do Java, montado no container
(`CONFIG_PROPERTIES`) e relido quando muda — as mesmas queries, sem
mudanças. Os `?` (JDBC) passam a `$n::integer` (equivalente ao setInt).
