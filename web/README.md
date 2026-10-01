# Faturação Lusopay — aplicação web (Cyclos → ZSGO)

Versão web do programa de faturação em Java (`zsgo-client-sync`, na raiz
deste repositório). Lê os utilizadores e as transações do **Cyclos**, cria os
clientes e as faturas no **ZSGO** (faturação certificada AT) e envia o PDF ao
Cyclos — tal como o programa em Java, e sobre as **mesmas tabelas**, por isso
os dois podem conviver enquanto a página web não substitui o programa.

Monorepo pnpm/Turborepo, com a mesma stack e a mesma metodologia do
`charib-dev/financial`:

- `packages/db` — schema Prisma (só as tabelas `zsgo_*` desta aplicação) e
  `sql/preparar.sql` (cria o que falta, sem apagar nada).
- `apps/web` — aplicação Next.js única: login (Keycloak), Resumo,
  Faturação (com **Gerar faturas em falta**), Clientes e Histórico.

## Linguagens e software usados

- **Linguagem**: TypeScript em modo `strict`.
- **Runtime**: Node.js 22 LTS.
- **Gestor de packages / monorepo**: pnpm (workspaces) + Turborepo.
- **Frontend/servidor**: Next.js 15 (App Router, React 19), Tailwind CSS,
  next-themes (claro/escuro), lucide-react — com os mesmos tokens de cor,
  componentes e estilos do financial (`globals.css`, `bento-card`,
  `Button`, `Notice`, `Paginacao`…).
- **Autenticação**: Keycloak (OIDC, authorization code + PKCE via
  `openid-client`) — o mesmo `auth.lusopay.com` do financial — e acesso de
  emergência por utilizador/senha do `.env` (argon2id).
- **Permissões**: perfis com matriz consultar/criar/editar/eliminar por
  área (como os Perfis do financial); auditoria encadeada por hash.
- **Base de dados**: PostgreSQL — **a do Cyclos** (ver abaixo), com Prisma
  Client.
- **Contentorização**: Docker + Docker Compose; TLS/proxy pelo Caddy já
  existente.

## Base de dados

A aplicação usa a **mesma base de dados do Cyclos**, como o programa em
Java: precisa de ler os utilizadores, as transações e as tabelas de controlo
(`zsgo_client_sync`, `zsgo_invoice_sync`, …) para saber o que já foi
importado e faturado.

Regras para não tocar no Cyclos:

- **Nunca** correr `prisma migrate` nem `prisma db push` — o Prisma não
  conhece as tabelas do Cyclos e tentaria apagá-las. As tabelas criam-se
  com `pnpm db:preparar` (ou o serviço `migrate`), que só faz
  `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.
- As tabelas da aplicação começam todas por `zsgo_` (as de login/perfis por
  `zsgo_web_`); nenhuma tabela do Cyclos é alterada.
- Recomendado: um utilizador de Postgres só para esta aplicação, que **só
  lê** as tabelas do Cyclos e só escreve nas `zsgo_*`:

  ```sql
  CREATE ROLE faturacao LOGIN PASSWORD '<senha forte>';
  GRANT CONNECT ON DATABASE cyclos TO faturacao;
  GRANT USAGE, CREATE ON SCHEMA public TO faturacao;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO faturacao;
  -- tabelas zsgo_* já existentes (criadas pelo programa em Java):
  DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'zsgo\_%' LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO faturacao', t);
    END LOOP;
  END $$;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO faturacao;
  ```

  (As tabelas `zsgo_web_*` são criadas pelo próprio `faturacao` no
  `preparar`, por isso já lhe pertencem.)

## Configuração da faturação (`config.properties`)

As queries e os acessos ao ZSGO e ao Cyclos vêm do **mesmo
`config.properties` do programa em Java** — as mesmas queries, sem
alterações (`billing.query`, `creditnote.query`,
`source.clients.verify.query`, `zsgo.baseUrl`, `zsgo.token`,
`cyclos.invoice.*`, `invoice.*`…). Copia-se para a pasta `web/` da VM
(fica fora do git, tem segredos); o docker compose monta-o no container.
Mudanças nas queries não precisam de rebuild: o ficheiro é relido quando
muda.

## Gerar a faturação

Em **Faturação**, escolher o mês e **Gerar faturas em falta** abre a janela
de passos (igual à do painel em Java):

1. Pré-análise do mês.
2. Criar no ZSGO os clientes que ainda não existem.
3. Verificar se algum cliente mudou de dados no Cyclos.
4. Atualizar no ZSGO os clientes alterados.
5. Resumo e confirmação — nada é emitido sem carregar em **Emitir faturas**.
6. Emitir faturas e notas de crédito (o PDF e o nº vão para o Cyclos).

Corre no servidor: pode fechar-se a página e voltar depois. Só pode haver
uma geração de cada vez. As regras contra faturas em duplicado são as do
Java: nunca se repete um POST ao ZSGO que ficou sem resposta (a fatura fica
"Verificar no ZSGO") e a geração seguinte procura-a pela referência
`LP-cliente-origem-AAAAMM` antes de criar outra.

**Importante durante a transição:** não gerar a faturação do mesmo mês ao
mesmo tempo no painel em Java e na página web.

## Instalação (Docker, numa VM Ubuntu)

Igual ao financial (secções 1 e 2 do README dele para instalar o Docker e
obter o código); depois, na pasta `web/`:

```bash
cp .env.example .env
nano .env          # DATABASE_URL, Keycloak, PRIMEIRO_ADMIN_EMAIL
cp /caminho/do/config.properties .   # o mesmo do programa em Java

docker compose build
docker compose up migrate                       # cria as tabelas que faltam
docker compose --profile seed run --rm seed     # perfil Super Admin + 1.º administrador
docker compose up -d web
```

A app fica em `127.0.0.1:3002`; o Caddy expõe-na (ex.:
`faturacao.lusopay.com { reverse_proxy <ip-desta-vm>:3002 }`).

### Keycloak

No realm já existente: **Clients → Create client** `faturacao-web`,
*Client authentication* **On**, *Valid redirect URIs*
`https://faturacao.lusopay.com/api/auth/callback`; copiar o *Client secret*
para o `.env`. Só entra quem existir como utilizador da aplicação com o
mesmo email (o primeiro é criado pelo seed com `PRIMEIRO_ADMIN_EMAIL`); o
primeiro login liga a conta Keycloak automaticamente.

### Acesso de emergência

Para entrar sem Keycloak (ex.: enquanto o client não está criado):

```bash
docker compose run --rm --entrypoint node web -e \
  'require("argon2").hash(process.argv[1],{type:2}).then(h=>console.log(Buffer.from(h).toString("base64")))' 'A-SUA-SENHA'
```

Pôr o resultado em `ADMIN_LOCAL_LOGIN_PASSWORD_HASH_B64`, o email em
`ADMIN_LOCAL_LOGIN_USERNAME`, `ADMIN_LOCAL_LOGIN_ENABLED=true` e
`docker compose up -d web`. Desligar outra vez quando o Keycloak funcionar.

## Atualizar

```bash
git pull
docker compose build web migrate
docker compose up migrate
docker compose up -d web
```

## Desenvolvimento

```bash
pnpm install
printf 'DATABASE_URL=postgresql://…/cyclos\nCONFIG_PROPERTIES=/caminho/config.properties\n' > apps/web/.env.local
DATABASE_URL=… pnpm db:preparar
DATABASE_URL=… PRIMEIRO_ADMIN_EMAIL=… pnpm db:seed
pnpm --filter @faturacao/db build
pnpm --filter @faturacao/web dev     # http://localhost:3002
```

Ver `PLANEAMENTO.md` para as fases e o que já está feito.
