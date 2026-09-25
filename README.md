# zsgo-client-sync

Integração Cyclos (Lusopay) → ZSGO: sincronização de clientes, faturação
mensal de comissões, notas de crédito de chargebacks e painel gráfico.

## Usar

- `painel.bat` — abre o painel gráfico.
- `run.bat` — corre a sincronização de clientes em linha de comando.
- `agendador.bat` — abre o agendador das tarefas automáticas (deixar a
  janela aberta). As tarefas configuram-se no painel, em "Tarefas agendadas".

Ambos precisam de `config.properties` na mesma pasta (copiar de
`config.properties.example` e preencher). Esse ficheiro tem segredos e
**não** vai para o git.

## Painel

- **Resumo** — números do mês (com ◀ ▶ para mudar de mês).
- **Sincronizar Clientes** — cria no ZSGO os clientes novos/pendentes.
- **Faturação** — escolhe-se o mês e aparece cada fatura desse mês:
  estado, valor enviado, **valor que está no ZSGO** e diferença.
  - *Gerar faturas em falta*: cria as faturas/notas de crédito que faltam.
  - *Conferir com o ZSGO*: lê cada fatura do ZSGO (`GET /sales/{id}`) e
    grava número, total, líquido, IVA e estado (colunas `zsgo_*` da
    `zsgo_invoice_sync`). Só lê; não altera nada no ZSGO.
  - Duplo-clique numa fatura: rubricas enviadas, erro completo e o documento
    lido do ZSGO (linhas e resposta completa).
  - *Exportar*: faturas, linhas por rubrica ou notas de crédito em CSV.
- **Faturação ocasional** — em preparação (ver CLAUDE.md).
- **Clientes** — lista dos clientes no ZSGO com resumo, filtros e detalhe.
- **Tarefas agendadas** — sincronizar clientes, atualizar dados dos clientes
  e faturação mensal a uma hora marcada; correm pelo `agendador.bat`
  (tabelas `zsgo_tarefas` e `zsgo_agendador`).
- **Histórico**.
- **Ferramentas** (topo): gerir utilizadores, testar ligação, descobrir limite.

Manual de utilizador: [`docs/manual-painel-zsgo.html`](docs/manual-painel-zsgo.html) (abre no browser).

## Estrutura

- `src/pt/zsgosync/` — código-fonte Java.
- `resources/` — recursos embutidos no jar (logo).
- `lib/dependencias.jar` — dependências (driver PostgreSQL, FlatLaf).
- `build.sh` — compila e gera `zsgo-client-sync.jar` (alvo Java 17).
- `00x_*.sql` — scripts das tabelas de controlo (o programa cria-as sozinho).

## Nota sobre a origem do código

Os `.java` originais não estavam disponíveis. O código em `src/` foi
recuperado por descompilação do jar de 16/09 (Vineflower), com pequenas
correções de tipos genéricos para voltar a compilar. Os comentários e
nomes de variáveis locais originais perderam-se (aparecem como `var1`,
`var2`, ...). Verificado: o jar reconstruído tem exatamente as mesmas
classes e o painel e a linha de comando comportam-se de forma idêntica.
