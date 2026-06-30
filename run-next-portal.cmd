@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "NODE=C:\Users\lowie\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "LOGDIR=%ROOT%work"
set "LOGFILE=%LOGDIR%\next-portal.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
cd /d "%ROOT%"

echo [%date% %time%] Starting Next.js portal.>>"%LOGFILE%"
"%NODE%" node_modules\next\dist\bin\next start -p 3000 >>"%LOGFILE%" 2>&1
echo [%date% %time%] Next.js portal stopped with exit code %errorlevel%.>>"%LOGFILE%"
