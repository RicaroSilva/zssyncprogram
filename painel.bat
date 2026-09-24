@echo off
REM Abre o painel grafico (sem janela preta de fundo).
REM Precisa de "config.properties" na mesma pasta.

cd /d "%~dp0"
start "" javaw -cp zsgo-client-sync.jar pt.zsgosync.PainelApp
