@echo off
REM Descarrega os PDFs do Cegid para o S3 a partir de uma lista (CSV) exportada
REM no pgAdmin com o cegid-lista.sql -- para um PC que NAO chega a base de dados.
REM Precisa nesta pasta: zsgo-client-sync.jar, config.properties (so as linhas
REM cegid.s3.*) e o ficheiro CSV. Pode fechar e voltar a abrir: continua.
REM No fim, no PC da aplicacao web: Historico Cegid -> Pre-analise do S3.

chcp 65001 >nul
cd /d "%~dp0"
set LISTA=faturas-parte2.csv
set /p LISTA=Nome do ficheiro da lista [faturas-parte2.csv]: 
java -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8 -cp zsgo-client-sync.jar pt.zsgosync.cegid.CegidDownloadRun config.properties lista "%LISTA%"
pause
