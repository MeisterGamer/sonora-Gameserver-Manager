@echo off
setlocal enabledelayedexpansion
title Sonora Gameserver Manager
cd /d "%~dp0"

echo ==============================================================================
echo             SONORA GAMESERVER MANAGER - PRODUKTIONS-STARTER
echo ==============================================================================

rem 1. Check for node executable
set "NODE_BINARY="
if exist "%~dp0.runtime\node-current" (
  set /p NODE_DIRECTORY=<"%~dp0.runtime\node-current"
  if exist "%~dp0.runtime\!NODE_DIRECTORY!\node.exe" (
    set "NODE_BINARY=%~dp0.runtime\!NODE_DIRECTORY!\node.exe"
  )
)

if "%NODE_BINARY%"=="" (
  where node >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    for /f "delims=" %%I in ('where node') do (
      if not defined NODE_BINARY set "NODE_BINARY=%%I"
    )
  ) else (
    echo [FEHLER] Kein Node.js im Systempfad gefunden.
    echo Bitte fuehren Sie zuerst 'install.bat' als Administrator aus.
    pause
    exit /b 1
  )
)

set NODE_ENV=production
set PORT=3000
set "APEXHOST_DATA_DIR=%~dp0data\servers"

echo Starte Sonora Gameserver Manager auf Port %PORT%...
echo Web-Panel: http://localhost:%PORT%

if exist "%~dp0node_modules\tsx\dist\cli.mjs" (
  "%NODE_BINARY%" "%~dp0node_modules\tsx\dist\cli.mjs" "%~dp0server.ts"
) else (
  call npx tsx server.ts
)

if %ERRORLEVEL% neq 0 (
  echo.
  echo [HINWEIS] Server wurde mit Fehlercode %ERRORLEVEL% beendet.
  pause
)
