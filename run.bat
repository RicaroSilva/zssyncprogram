@echo off
REM Corre a sincronizacao (clientes + produtos). Clica duas vezes neste ficheiro.
REM Precisa de "config.properties" na mesma pasta (copia de config.properties.example).

cd /d "%~dp0"
java -jar zsgo-client-sync.jar config.properties
echo.
pause
