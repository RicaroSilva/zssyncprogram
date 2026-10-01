# Testar a aplicação web no Windows (sem Docker)

Para experimentar no PC antes de instalar num servidor. Leva uns 15 minutos.
Usa-se o acesso de emergência (utilizador/senha) em vez do Keycloak.

## Antes de começar — cuidados

- **Base de dados**: o ideal é uma **cópia** da base de dados do Cyclos. Se
  usar a verdadeira, as páginas de consulta só leem; o passo 4 cria as
  tabelas `zsgo_web_*` (não mexe em nada do Cyclos nem nas `zsgo_*`).
- **Não carregar em "Gerar faturas em falta"/"Emitir faturas"** com o
  `config.properties` verdadeiro: cria faturas a sério no ZSGO e envia-as ao
  Cyclos. Para testar a geração, use um ZSGO de testes (outro `zsgo.baseUrl`
  e `zsgo.token`) ou uma cópia do `config.properties` com esses valores.
- **`AGENDADOR=false`** (já está no passo 3): senão o PC corria as tarefas
  agendadas que estiverem ligadas no painel.

## 1. Instalar o Node.js e obter o código

1. Instalar o **Node.js 22 LTS** de https://nodejs.org (instalador `.msi`,
   opções por omissão).
2. Abrir o **PowerShell** e ativar o pnpm:
   ```powershell
   corepack enable
   ```
   (se der erro de permissões, abrir o PowerShell como Administrador.)
3. Obter o código do ramo `claude/clever-davinci-bo41hu`:
   - com Git: `git clone -b claude/clever-davinci-bo41hu https://github.com/RicaroSilva/zssyncprogram.git C:\faturacao`
   - ou no GitHub: escolher esse ramo → **Code → Download ZIP** e
     descompactar em `C:\faturacao`.

## 2. Instalar as dependências

```powershell
cd C:\faturacao\web
pnpm install
pnpm --filter @faturacao/db build
```

## 3. Configuração

1. Copiar o `config.properties` (o do programa em Java) para
   `C:\faturacao\web\config.properties`.
2. Gerar a senha do acesso de emergência (trocar pela senha que quiser):
   ```powershell
   pnpm --filter @faturacao/web hash-senha "A-MINHA-SENHA"
   ```
   Copiar a linha comprida que aparece.
3. Criar o ficheiro `C:\faturacao\web\apps\web\.env.local` no Bloco de
   Notas (em "Guardar como" escolher **Todos os ficheiros**, para não ficar
   `.env.local.txt`), com:
   ```
   DATABASE_URL=postgresql://UTILIZADOR:SENHA@IP-DO-POSTGRES:5432/NOME-DA-BD
   CONFIG_PROPERTIES=C:\faturacao\web\config.properties
   AGENDADOR=false
   ADMIN_LOCAL_LOGIN_ENABLED=true
   ADMIN_LOCAL_LOGIN_USERNAME=o-seu-email@lusopay.com
   ADMIN_LOCAL_LOGIN_PASSWORD_HASH_B64=a-linha-comprida-do-passo-2
   KEYCLOAK_ISSUER=https://auth.lusopay.com/realms/lusopay
   KEYCLOAK_CLIENT_ID=faturacao-web
   KEYCLOAK_CLIENT_SECRET=x
   KEYCLOAK_REDIRECT_URI=http://localhost:3002/api/auth/callback
   ```
   Os dados da base de dados são os mesmos do `db.url`/`db.user`/
   `db.password` do `config.properties` (o `db.url`
   `jdbc:postgresql://IP:5432/cyclos` fica
   `postgresql://user:senha@IP:5432/cyclos`). Se a senha tiver caracteres
   especiais (`@`, `:`, `/`, `#`), têm de ser escritos em código, ex. `@` →
   `%40`.

## 4. Preparar a base de dados

No PowerShell (mesma `DATABASE_URL` do passo 3):

```powershell
cd C:\faturacao\web
$env:DATABASE_URL = "postgresql://UTILIZADOR:SENHA@IP-DO-POSTGRES:5432/NOME-DA-BD"
pnpm db:preparar
pnpm db:seed
```

Só cria o que falta (tabelas `zsgo_web_*` e o perfil Super Admin); pode
correr-se mais vezes sem problema.

## 5. Arrancar

```powershell
cd C:\faturacao\web
pnpm --filter @faturacao/web dev
```

Abrir http://localhost:3002 → **Entrar com utilizador e senha** (o email e a
senha do passo 3). Para parar: `Ctrl+C` no PowerShell. Da próxima vez basta
o passo 5.

## Problemas comuns

- **`pnpm` não é reconhecido** → fechar e abrir o PowerShell depois do
  `corepack enable`.
- **Não liga à base de dados** → o PC tem de chegar ao Postgres (VPN, firewall,
  `pg_hba.conf` a aceitar o IP do PC) — o mesmo que o programa em Java precisa.
- **"Não encontrei o ficheiro de configuração"** → confirmar o caminho de
  `CONFIG_PROPERTIES` no `.env.local`.
