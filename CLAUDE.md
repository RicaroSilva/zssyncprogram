# zsgo-client-sync — notas para o Claude

Integração Cyclos (Lusopay, PostgreSQL) → ZSGO (faturação certificada AT).
Java 17, sem Maven. O código em `src/` foi recuperado por descompilação do
jar (nomes `var1`, `var2`… nas classes antigas; o código novo usa nomes
normais). Ver README.md para a estrutura.

## Compilar e entregar

- `./build.sh` → gera `zsgo-client-sync.jar` (Java 17, dependências de
  `lib/dependencias.jar`). O jar vai no git: o utilizador só tem JRE, não
  compila. Depois de cada alteração: build, commit, push e enviar o jar.
- `config.properties` tem segredos e NÃO vai para o git
  (`config.properties.example` é o modelo, com as queries completas).
- Tabelas de controlo criam-se sozinhas (`ensureTableExists`); colunas novas
  com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Na BD real a `zsgo_client_sync` usa `user_id` (não `source_id`).
- A tabela `users` do Cyclos tem colunas como `status`: qualificar sempre as
  colunas nos JOINs.

## Decisões de negócio

- FR se `prazo_dias = 0`, senão FA. Preço enviado com `tax_included=true`.
- Chargeback no mesmo mês da transação → sai da fatura (sem NC). Meses
  diferentes → Nota de Crédito. O ZSGO EXIGE `origin_id`/`origin_line_id`
  nas NC (por fazer: o utilizador pediu para não mexer nisto por agora).
- Bug do ZSGO: `billing.exemption_code` ao criar cliente dá HTTP 500
  (reportado); o código continua a enviar.
- Tentativas ilimitadas; erros gravados completos (`util/Erros.descrever`).
- NUNCA repetir automaticamente pedidos que criam coisas no ZSGO (POST
  /sales, POST /clients) quando o pedido pode ter chegado e não houve
  resposta: isso criava faturas em duplicado (setembro 2026). Nesses casos
  lança-se `ZsgoResultadoIncertoException`, a fatura fica com
  `zsgo_incerto = true` e só volta a ser criada depois de alguém confirmar
  no painel (associar o nº existente ou autorizar recriar).

## Por fazer / pedidos em espera

### Faturação ocasional (ainda por especificar pelo utilizador)
Utilizadores com um determinado **produto no perfil do Cyclos** são
"ocasionais" e têm outra lógica de faturação:
- faturas **diárias**;
- emitidas **por transação**, não por conta;
- o destinatário da fatura (id de quem recebe a fatura) vem **na própria
  transação**.
Já existe o menu "Faturação ocasional" (`ui/PainelFaturacaoOcasional`) só
com a explicação. Não implementar a lógica antes de o utilizador explicar
os pormenores (que produto, que campo da transação, séries, etc.).

## Testar localmente

PostgreSQL local com um esquema Cyclos mínimo + um ZSGO simulado em Python
permitem correr o painel em Xvfb e tirar capturas (ver histórico da sessão).
