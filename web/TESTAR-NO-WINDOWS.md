# Testar a aplicação web no Windows

Para experimentar no PC antes de instalar num servidor. Usa-se o **mesmo
`config.properties`** e a **mesma conta do painel em Java** (utilizador e
senha do `painel.bat`) — não é preciso configurar mais nada.

## Cuidados

- **Não carregar em "Gerar faturas em falta"/"Emitir faturas"** com o
  `config.properties` verdadeiro: cria faturas a sério no ZSGO e envia-as ao
  Cyclos. Para testar a geração, use uma cópia do `config.properties` com o
  `zsgo.baseUrl`/`zsgo.token` de um ZSGO de testes. Tudo o resto (Resumo,
  Faturação, Clientes, Histórico, Conferir com o ZSGO) só consulta.
- Ao arrancar, a aplicação cria na base de dados as tabelas que lhe faltam
  (`zsgo_web_*`). Não mexe em nada do Cyclos nem nas tabelas `zsgo_*` do
  programa em Java.
- No PC, o agendador das tarefas fica **desligado** (não corre tarefas
  agendadas).

## Instalar (uma vez) — no cmd (Windows + R → `cmd`)

Um comando de cada vez:

```bat
winget install OpenJS.NodeJS.22
```
Fechar e abrir o cmd (como Administrador só para o próximo):
```bat
corepack enable
```
Obter o código (ou descarregar o ZIP do ramo `claude/clever-davinci-bo41hu`
no GitHub e descompactar em `C:\faturacao`):
```bat
mkdir C:\faturacao
cd /d C:\faturacao
curl -L -o codigo.zip https://github.com/RicaroSilva/zssyncprogram/archive/refs/heads/claude/clever-davinci-bo41hu.zip
tar -xf codigo.zip --strip-components=1
```
Instalar:
```bat
cd /d C:\faturacao\web
pnpm install
pnpm --filter @faturacao/db build
```

## Usar

1. Copiar o `config.properties` (o que está ao lado do `painel.bat`) para
   `C:\faturacao\web\`:
   ```bat
   copy "C:\pasta-do-painel\config.properties" C:\faturacao\web\config.properties
   ```
2. Arrancar:
   ```bat
   cd /d C:\faturacao\web
   pnpm --filter @faturacao/web dev
   ```
3. Quando aparecer `Ready`, abrir **http://localhost:3002** e entrar com o
   utilizador e a senha do painel em Java. Contas ADMIN do painel entram com
   acesso total; as outras só consultam.

Para parar: `Ctrl+C` no cmd. Da próxima vez basta o passo 2.

## Problemas comuns

- **`pnpm` não é reconhecido** → fechar e abrir o cmd depois do `corepack enable`.
- **Não liga à base de dados** → o PC tem de chegar ao Postgres (VPN,
  firewall), tal como o painel em Java. A ligação vem do `db.url`/`db.user`/
  `db.password` do `config.properties`.
- **Erros "running scripts is disabled"** → está no PowerShell (a linha
  começa por `PS`); usar o cmd ou correr uma vez
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
