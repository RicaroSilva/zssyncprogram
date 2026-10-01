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
- **Sem worker/Redis** (como o financial). As tarefas agendadas vão correr
  num pequeno container `cron` que chama uma rota interna protegida.
- O Java e a web podem correr em paralelo durante a transição — usam as
  mesmas tabelas e as mesmas regras (nunca repetir um POST ao ZSGO sem
  resposta; referência `LP-cliente-origem-AAAAMM`; localizador de faturas).

## Fases

| # | Conteúdo | Estado |
|---|---|---|
| 1 | Monorepo, tokens de design, login (Keycloak + emergência), perfis, auditoria; Resumo, Faturação (lista + detalhe), Clientes e Histórico — só leitura | ✅ |
| 2 | Cliente ZSGO e Cyclos em TypeScript (criar/atualizar clientes, criar faturas, PDF, `invoicenumber`), queries do config; **Gerar faturação** com a janela de passos (pré-análise → criar clientes → verificar alterações → atualizar → resumo → emitir) | ⏳ |
| 3 | Notas de crédito, "Verificar no ZSGO" (associar nº / autorizar recriar), Conferir com o ZSGO, diagnóstico | ⏳ |
| 4 | Tarefas agendadas (container `cron`) e páginas Utilizadores/Perfis | ⏳ |
| 5 | Faturação ocasional (produto `ocasionalTransactions`, uma fatura por pagamento, diária) — quando o utilizador especificar | ⏳ |
| 6 | Desligar o programa em Java | ⏳ |

## Onde estão as queries

No Java vêm do `config.properties` (`billing.query`, `creditnote.query`,
`source.clients.query`, `verify.query`). Na web vão ficar num ficheiro de
configuração montado no container (as mesmas queries, sem mudanças), para o
utilizador as poder ajustar sem recompilar — tal como hoje.
