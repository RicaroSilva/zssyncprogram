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
- Cyclos (`/web/run/invoice`) recebe `url_pdf`, `userid` e `invoicenumber`
  (tipo-número do ZSGO, ex. "FA-1231", lido com GET /sales/{id} antes do envio).
- "Gerar faturas em falta" abre `ui/DialogoPassosFaturacao` e faz por ordem:
  pré-análise → criar clientes em falta → verificar alterações → atualizar
  clientes → resumo/confirmação → emitir. A tarefa agendada de faturação
  mensal faz os mesmos passos (sem janela).
- Tentativas ilimitadas; erros gravados completos (`util/Erros.descrever`).
- Região fiscal (`address.region_code`) vem do código postal
  (`util/RegiaoFiscal`): 9000–9499 MA, 9500–9999 AC, resto CON. "Verificar
  alterações" também marca como desatualizados os clientes cuja região no
  ZSGO não bate com o código postal (os antigos foram criados sem região).
- NUNCA repetir automaticamente pedidos que criam coisas no ZSGO (POST
  /sales, POST /clients) quando o pedido pode ter chegado e não houve
  resposta: isso criava faturas em duplicado (setembro 2026). Nesses casos
  lança-se `ZsgoResultadoIncertoException`, a fatura fica com
  `zsgo_incerto = true`. Na geração seguinte `LocalizadorFaturas` procura-a
  no ZSGO: pela referência (`document.reference` = `LP-cliente-origem-AAAAMM`,
  enviada em todas as faturas) e, para as antigas, pelo cliente + valor na
  lista `GET /sales` (lida uma vez por execução). Só cria se tiver a certeza
  de que não existe (nenhuma fatura do cliente depois do fim do mês);
  qualquer dúvida → fica para confirmar no painel (associar o nº ou recriar).

## Formato real do ZSGO (GET /sales, confirmado 28/09/2026)

`data[]` com: `id` (uuid), `status` ("paid", …) e `customer{id,code,name,tax_id}`
no topo; `document{type, series ("API-FR"), number (int), issue_date,
reference, notes, tax_region}`; `items[]{tax{rate}, totals{total}}`;
`totals{net,tax,total}`; `pdf_url` vem null na lista. `meta.page_count`.
O `search` NÃO procura pelo número — para encontrar por nº percorre-se a lista.

## Aplicação web (`web/`)

Versão web em curso (Next.js 15 + TypeScript + Prisma, mesma stack, estilo e
login Keycloak do `charib-dev/financial`). Usa a MESMA base de dados do
Cyclos e as mesmas tabelas `zsgo_*`; tabelas novas só `zsgo_web_*`, criadas
por `web/packages/db/sql/preparar.sql`. NUNCA `prisma migrate`/`db push`
nessa BD. Fases em `web/PLANEAMENTO.md`. Lê o MESMO `config.properties`
(CONFIG_PROPERTIES) e replica as regras do Java (`web/apps/web/src/lib/
faturacao/` e `lib/zsgo/`): qualquer mudança de regra de negócio tem de ser
feita nos dois lados enquanto ambos existirem. O agendador web
(`lib/tarefas.ts`) partilha `zsgo_tarefas` com o Java; `ultima_execucao` é
hora de parede de Lisboa (timestamp sem fuso), como o Java grava.
Menu ZSGO (`app/(painel)/zsgo/`, `lib/zsgo/recursos.ts`): gerado a partir da
especificação `web/docs/zsgo-api-1.3.yaml` (→ `lib/zsgo/gerado/especificacao.json`
via `web/scripts-zsgo-spec.py`); só faz operações que existem na especificação.
Histórico Cegid (`app/(painel)/cegid/`, `lib/cegid/`): a integração antiga
com o Cegid/Cloudware deixou `lp_cloudware_monthly_processing_invoices`
(user_id, year, month, document_cw_number, document_cw_url,
related_to_user_id = fatura emitida a outra pessoa), `..._invoice_lines`
(rubric_code, total_amount_with_taxes), `lp_cloudware_rubrics_mappings` e
`lp_cloudware_users_mappings` (user_id → cw_id). SÓ LEITURA nessas tabelas.
Os PDFs copiam-se para o S3 do SeaweedFS (`cegid.s3.*`) antes de a licença
acabar; estado em `zsgo_web_cegid_documento`. Nome no bucket = nº da fatura
com "/"→"-" ("FR 2024-3342.pdf", formato dos que já lá estavam); pré-análise
lista o bucket e não reenvia os que já existem. O mesmo download existe em
Java sem a aplicação web (`cegid/CegidDownloadRun`, `cegid-download.bat`,
argumentos PARTE DE) para dividir por vários PCs/ligações; sem acesso à BD:
`cegid-lista.sql` (export CSV no pgAdmin, mesmo cálculo do nome) +
`cegid-download-lista.bat` (modo "lista": só S3, feitas em <csv>.feitas.txt;
depois "Pré-análise do S3" na web). Mesmas regras
(nome, ritmo, tabela) — mudanças têm de ser feitas nos dois lados. Os links públicos do Cegid são
`app1.business-pt.cegid.cloud/rus/public-rus/public_links/link/...`.

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
