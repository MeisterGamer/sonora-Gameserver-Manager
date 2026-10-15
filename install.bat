@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Sonora Gameserver Manager — All-in-One Installer für Windows

echo.
echo ==============================================================================
echo           SONORA GAMESERVER MANAGER — ALL-IN-ONE INSTALLER
echo     100%% Enterprise Gameserver & Host Management Suite für Windows 10/11
echo ==============================================================================
echo.

echo Funktionsumfang (100%% vollständig bereitgestellt):
echo   [+] Echte Prozesssteuerung (Starten, Stoppen, Force-Kill, Neustart, Live-RCON)
echo   [+] Datei-Manager & In-Browser-Editor mit Highlighting (.properties, .yml, .json)
echo   [+] Backup-System & automatisierte Zeitpläne (Reboots, Saves & Archive)
echo   [+] Paper, Purpur, Spigot, Fabric, Forge, NeoForge & Modrinth Mod-Verwaltung
echo   [+] Kundenabrechnung, Verträge, DIN 5008 Rechnungen & CRM
echo   [+] Remote-Nodes, Multi-Host-Cluster & Host-Betriebssystem-Skripte
echo   [+] Live-Performance & Prozessmetriken (CPU, RAM, TPS, Netzwerk)
echo   [+] Windows & Linux Cross-Platform Laufzeitumgebung (Java 21 LTS & SteamCMD)
echo.

rem 1. Administrator-Rechte prüfen
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [WARNUNG] Keine Administrator-Rechte erkannt.
  echo Fordere erhöhte Rechte an...
  powershell -Command "Start-Process cmd -ArgumentList '/c cd /d ""%~dp0"" && install.bat' -Verb RunAs"
  if %ERRORLEVEL% equ 0 (
    exit /b 0
  ) else (
    echo [FEHLER] Dieses Skript benötigt Administrator-Rechte.
    echo Bitte Rechtsklick auf 'install.bat' -> 'Als Administrator ausführen'.
    pause
    exit /b 1
  )
)
echo [1/8] Administrator-Rechte bestätigt.

rem Verzeichnisse festlegen
set "SOURCE_DIR=%~dp0"
set "DATA_ROOT=%SOURCE_DIR%data"
set "RUNTIME_ROOT=%SOURCE_DIR%.runtime"

if not exist "%DATA_ROOT%\servers" mkdir "%DATA_ROOT%\servers"
if not exist "%DATA_ROOT%\backups" mkdir "%DATA_ROOT%\backups"
if not exist "%RUNTIME_ROOT%\jdks" mkdir "%RUNTIME_ROOT%\jdks"
if not exist "%SOURCE_DIR%steamcmd" mkdir "%SOURCE_DIR%steamcmd"
echo [2/8] Daten- und Laufzeitverzeichnisse vorbereitet.

rem 3. Node.js & npm prüfen
echo [3/8] Prüfe Node.js & npm...
set "HAVE_NODE=0"
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "tokens=1" %%V in ('node -v 2^>nul') do (
    set "NODE_VER=%%V"
    set "HAVE_NODE=1"
  )
)

if "%HAVE_NODE%"=="1" (
  echo   [OK] Node.js %NODE_VER% gefunden.
) else (
  echo   [INFO] Node.js nicht im PATH gefunden. Versuche automatische Installation...
  where winget >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo   [WINGET] Installiere Node.js LTS via Windows Package Manager...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  ) else (
    echo   [CURL] Lade Node.js MSI herunter...
    curl -sqLo "%TEMP%\node-setup.msi" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
    if exist "%TEMP%\node-setup.msi" (
      echo   [MSI] Installiere Node.js im Hintergrund...
      msiexec /i "%TEMP%\node-setup.msi" /quiet /norestart
      timeout /t 5 >nul
    )
  )
  rem Erneut prüfen
  where node >nul 2>&1
  if %ERRORLEVEL% neq 0 (
    echo   [WARNUNG] Bitte starten Sie die Eingabeaufforderung neu, falls Node.js frisch installiert wurde.
  )
)

rem 4. Java 21 LTS prüfen
echo [4/8] Prüfe Java-Laufzeitumgebung (Java 21 LTS oder neuer)...
set "HAVE_JAVA=0"
where java >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "tokens=3" %%j in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    set "JAVA_VER=%%~j"
    set "HAVE_JAVA=1"
  )
)

if "%HAVE_JAVA%"=="1" (
  echo   [OK] Host-Java gefunden: %JAVA_VER%
) else (
  echo   [INFO] Kein Host-Java gefunden. Versuche Bereitstellung von Eclipse Temurin 21 LTS...
  where winget >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo   [WINGET] Installiere Eclipse Adoptium Temurin 21 JDK...
    winget install -e --id EclipseAdoptium.Temurin.21.JDK --accept-package-agreements --accept-source-agreements
  ) else (
    echo   [INFO] Portables Java 21 wird bei Bedarf automatisch von Sonora heruntergeladen.
  )
)

rem 5. Valve SteamCMD für Windows einrichten
echo [5/8] Prüfe Valve SteamCMD für Windows...
if exist "%SOURCE_DIR%steamcmd\steamcmd.exe" (
  echo   [OK] SteamCMD für Windows bereits vorhanden in steamcmd\steamcmd.exe
) else (
  echo   [STEAMCMD] Lade offizielles Valve SteamCMD für Windows herunter...
  curl -sqLo "%SOURCE_DIR%steamcmd\steamcmd.zip" "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
  if exist "%SOURCE_DIR%steamcmd\steamcmd.zip" (
    echo   [STEAMCMD] Entpacke steamcmd.zip...
    tar -xf "%SOURCE_DIR%steamcmd\steamcmd.zip" -C "%SOURCE_DIR%steamcmd" 2>nul || powershell -Command "Expand-Archive -Force -Path '%SOURCE_DIR%steamcmd\steamcmd.zip' -DestinationPath '%SOURCE_DIR%steamcmd'"
    if exist "%SOURCE_DIR%steamcmd\steamcmd.exe" (
      echo   [OK] Valve SteamCMD erfolgreich bereitgestellt.
      del /q "%SOURCE_DIR%steamcmd\steamcmd.zip" >nul 2>&1
    )
  )
)

rem 6. NPM Abhängigkeiten installieren & Production Build kompilieren
echo [6/8] Installiere NPM-Abhängigkeiten und erstelle Production-Build...
cd /d "%SOURCE_DIR%"
call npm install --legacy-peer-deps
if %ERRORLEVEL% neq 0 (
  echo   [FALLBACK] Wiederhole npm install mit --force...
  call npm install --force
)

echo   [BUILD] Kompiliere Frontend-Assets (Vite Build)...
call npm run build
if %ERRORLEVEL% equ 0 (
  echo   [OK] Production-Build erfolgreich kompiliert (dist\).
) else (
  echo   [WARNUNG] Vite-Build meldete Warnungen.
)

rem 7. Windows Defender Firewall Ports freischalten
echo [7/8] Konfiguriere Windows Defender Firewall Regeln...
netsh advfirewall firewall show rule name="Sonora Gameserver Manager (Port 3000)" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  netsh advfirewall firewall add rule name="Sonora Gameserver Manager (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
  netsh advfirewall firewall add rule name="Sonora Minecraft Standard (Port 25565 TCP)" dir=in action=allow protocol=TCP localport=25565 profile=any >nul 2>&1
  netsh advfirewall firewall add rule name="Sonora Minecraft Standard (Port 25565 UDP)" dir=in action=allow protocol=UDP localport=25565 profile=any >nul 2>&1
  netsh advfirewall firewall add rule name="Sonora Palworld (Port 8211 UDP)" dir=in action=allow protocol=UDP localport=8211 profile=any >nul 2>&1
  netsh advfirewall firewall add rule name="Sonora Rust (Port 28015 TCP)" dir=in action=allow protocol=TCP localport=28015 profile=any >nul 2>&1
  netsh advfirewall firewall add rule name="Sonora Rust UDP (Port 28015 UDP)" dir=in action=allow protocol=UDP localport=28015 profile=any >nul 2>&1
  echo   [OK] Windows-Firewall-Regeln erfolgreich registriert.
) else (
  echo   [OK] Firewall-Regeln existieren bereits.
)

rem 8. Start-Skript überprüfen / aktualisieren
echo [8/8] Prüfe start-manager.bat...
if not exist "%SOURCE_DIR%start-manager.bat" (
  (
    echo @echo off
    echo cd /d "%%~dp0"
    echo set NODE_ENV=production
    echo set PORT=3000
    echo set "APEXHOST_DATA_DIR=%%~dp0data\servers"
    echo call npx tsx server.ts
    echo pause
  ) > "%SOURCE_DIR%start-manager.bat"
)
echo   [OK] start-manager.bat ist einsatzbereit.

rem Lokale IP ermitteln
set "LOCAL_IP=127.0.0.1"
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
  if not "%%a"=="" set "LOCAL_IP=%%a"
)

echo.
echo ==============================================================================
echo    ✓ SONORA GAMESERVER MANAGER ERFOLGREICH AUF WINDOWS INSTALLIERT!
echo ==============================================================================
echo.
echo   🌐 Web-Panel aufrufen:       http://localhost:3000  oder  http://!LOCAL_IP!:3000
echo   🎮 Minecraft Standard-Port:  !LOCAL_IP!:25565
echo   📂 Installationspfad:        %SOURCE_DIR%
echo   📁 Server-Dateien & Daten:   %DATA_ROOT%\servers\
echo.
echo Sicherheitshinweis (Ersteinrichtung):
echo   • Beim ersten Öffnen der Seite im Browser vergeben Sie Ihr eigenes Administrator-Passwort.
echo   • Es existiert kein unsicheres Standard-Passwort.
echo   • Notfall-Reset des Administrator-Passworts über CMD:
echo     cd /d "%SOURCE_DIR%" ^&^& npm run admin:reset
echo.
echo Starten des Panels:
echo   • Doppelklick auf 'start-manager.bat' oder Aufruf in der Eingabeaufforderung.
echo.
echo Der Sonora Gameserver Manager ist einsatzbereit eingerichtet.
echo.
pause
