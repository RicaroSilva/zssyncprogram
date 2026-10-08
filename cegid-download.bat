@echo off
REM Descarrega os PDFs das faturas antigas do Cegid para o S3.
REM Precisa de "config.properties" na mesma pasta (db.url/db.user/db.password
REM e cegid.s3.*) e do zsgo-client-sync.jar.
REM Dividir por varios PCs: cada PC numa ligacao a internet diferente, cada um
REM com uma parte diferente (ex.: PC 1 = parte 1 de 2, PC 2 = parte 2 de 2).
REM Pode fechar e voltar a abrir: continua onde ficou.

chcp 65001 >nul
cd /d "%~dp0"
set /p PARTE=Que parte faz este PC (ex.: 2)? 
set /p DE=Dividido em quantas partes no total (ex.: 2)? 
java -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8 -cp zsgo-client-sync.jar pt.zsgosync.cegid.CegidDownloadRun config.properties %PARTE% %DE%
pause
