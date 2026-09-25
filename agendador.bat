@echo off
REM Agendador das tarefas automaticas (sincronizar clientes, atualizar dados,
REM faturacao mensal). Deixa esta janela ABERTA: as tarefas so correm enquanto
REM ela estiver aberta. As tarefas ligam-se e configuram-se no painel,
REM separador "Tarefas agendadas".
REM Para arrancar sozinho ao ligar o computador: Windows+R, escrever
REM shell:startup e colocar la um atalho para este ficheiro.

cd /d "%~dp0"
title Agendador ZSGO (nao fechar)
REM UTF-8 na consola, para os acentos aparecerem bem
chcp 65001 >nul
java -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dstdout.encoding=UTF-8 -cp zsgo-client-sync.jar pt.zsgosync.AgendadorRun config.properties
echo.
echo O agendador parou.
pause
