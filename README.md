# zsgo-client-sync

Integração Cyclos (Lusopay) → ZSGO: sincronização de clientes, faturação
mensal de comissões, notas de crédito de chargebacks e painel gráfico.

## Usar

- `painel.bat` — abre o painel gráfico.
- `run.bat` — corre a sincronização de clientes em linha de comando.

Ambos precisam de `config.properties` na mesma pasta (copiar de
`config.properties.example` e preencher). Esse ficheiro tem segredos e
**não** vai para o git.

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
