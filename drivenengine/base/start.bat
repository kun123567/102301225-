@echo off
REM ============================================================================
REM  prototype01 one-click start
REM    1) kill stale server on the port (so edited js is really reloaded)
REM    2) start node server/server.js in a minimized window
REM    3) wait for /api/health, then open the browser
REM  ASCII only: cmd codepage is unreliable.
REM  NOTE: previous version used a nested-quote `cmd /c "cd /d "DIR" && node ..."`,
REM        which silently failed in some shells (window closed -> browser got
REM        "connection refused"). Now we pass the directory via `start /d`.
REM ============================================================================
setlocal
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "PORT=8770"
set "URL=http://127.0.0.1:%PORT%/"

echo [0/4] check node ...
where node >nul 2>&1
if errorlevel 1 (
    echo       ERROR: node.exe not found in PATH.
    echo       Install Node.js, or run:  "C:\Program Files\nodejs\node.exe" server\server.js
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo       node %%v

echo [1/4] stop stale server on port %PORT% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /F /PID %%p >nul 2>&1
)

echo [2/4] start backend in a separate window ...
start "prototype01-server" /min /d "%ROOT%" cmd /c "node server\server.js"

echo [3/4] wait for health ...
set "OK="
for /l %%i in (1,1,20) do (
    if not defined OK (
        timeout /t 1 >nul
        powershell -NoProfile -Command "try{$r=Invoke-RestMethod 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 2; if($r.ok){exit 0}else{exit 1}}catch{exit 1}" >nul 2>&1
        if not errorlevel 1 set "OK=1"
    )
)

if defined OK (
    echo       backend ready
    echo [4/4] open browser ...
    start "" "%URL%"
) else (
    echo       WARNING: health check failed.
    echo       Running the server in THIS window so you can see the error:
    echo       ^(Ctrl+C to stop^)
    echo.
    cd /d "%ROOT%"
    node server\server.js
    echo.
    echo       server exited. press any key to close.
    pause
    exit /b 1
)

echo.
echo  backend : node server\server.js   (port %PORT%)
echo  frontend: %URL%
echo  stop    : close the "prototype01-server" window, or taskkill /F /IM node.exe
endlocal
