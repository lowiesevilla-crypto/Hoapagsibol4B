@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "DOCKER=C:\Program Files\Docker\Docker\resources\bin\docker.exe"
set "DOCKER_DESKTOP=C:\Program Files\Docker\Docker\Docker Desktop.exe"
set "NODE=C:\Users\lowie\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "TAILSCALE=C:\Program Files\Tailscale\tailscale.exe"
set "LOGDIR=%ROOT%work"
set "LOGFILE=%LOGDIR%\portal-autostart.log"
set "NEXT_RUNNER=%ROOT%run-next-portal.cmd"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
call :log Portal watchdog started.
call :start_stack
if /I "%~1"=="--once" exit /b %errorlevel%

:monitor
call :sleep 60
curl.exe -fsS --max-time 10 "http://localhost:3000/login" >nul 2>&1
if errorlevel 1 goto repair
"%TAILSCALE%" funnel status 2>nul | findstr /c:"proxy http://127.0.0.1:3000" >nul
if errorlevel 1 goto repair
goto monitor

:repair
call :log Health check failed. Restarting the portal stack.
call :start_stack
goto monitor

:start_stack
call :log Checking Docker Desktop.
call :ensure_docker
if errorlevel 1 (
  call :log Docker Desktop did not become ready.
  exit /b 1
)

call :log Starting MySQL container.
"%DOCKER%" compose --file "%ROOT%docker-compose.yml" up -d >>"%LOGFILE%" 2>&1
if errorlevel 1 (
  call :log MySQL failed to start.
  exit /b 1
)

call :log Checking the Next.js portal.
curl.exe -fsS --max-time 5 "http://localhost:3000/login" >nul 2>&1
if errorlevel 1 (
  call :start_next
)

call :log Waiting for the Next.js portal.
call :wait_for_portal
if errorlevel 1 (
  call :log The Next.js portal did not become healthy.
  exit /b 1
)

"%TAILSCALE%" funnel --bg --yes 3000 >>"%LOGFILE%" 2>&1
if errorlevel 1 (
  call :log Tailscale Funnel failed to start.
  exit /b 1
)

call :log Portal stack is healthy.
exit /b 0

:ensure_docker
"%DOCKER%" info >nul 2>&1
if not errorlevel 1 (
  call :log Docker Desktop is ready.
  exit /b 0
)

call :log Starting Docker Desktop.
start "" "%DOCKER_DESKTOP%"
for /L %%I in (1,1,36) do (
  call :sleep 5
  "%DOCKER%" info >nul 2>&1
  if not errorlevel 1 exit /b 0
)
exit /b 1

:wait_for_portal
for /L %%I in (1,1,30) do (
  curl.exe -fsS --max-time 5 "http://localhost:3000/login" >nul 2>&1
  if not errorlevel 1 exit /b 0
  call :sleep 2
)
curl.exe -sS --max-time 5 "http://localhost:3000/login" >>"%LOGFILE%" 2>&1
exit /b 1

:start_next
call :log Starting Next.js portal process.
set "PORTAL_NEXT_RUNNER=%NEXT_RUNNER%"
powershell.exe -NoProfile -NonInteractive -Command "$runner = $env:PORTAL_NEXT_RUNNER; $p = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c', ('\"' + $runner + '\"')) -WindowStyle Hidden -PassThru; ('[' + (Get-Date -Format 'dd/MM/yyyy  HH:mm:ss.ff') + '] Next.js process launcher PID=' + $p.Id) | Out-File -FilePath $env:LOGFILE -Append -Encoding utf8" >nul 2>&1
exit /b %errorlevel%

:sleep
powershell.exe -NoProfile -NonInteractive -Command "Start-Sleep -Seconds %~1" >nul 2>&1
exit /b 0

:log
echo [%date% %time%] %*>>"%LOGFILE%"
exit /b 0
