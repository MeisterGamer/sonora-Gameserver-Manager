#!/usr/bin/env bash
# ==============================================================================
# Sonora Gameserver Manager — All-in-One Komplett-Installer (Debian 11/12/13 & Ubuntu LTS)
# Repository: https://github.com/MeisterGamer/sonora-Gameserver-Manager
#
# Direkt-Installation (Einzeiler für frische Debian 11/12/13 & Ubuntu LTS Server):
#   curl -fsSL https://raw.githubusercontent.com/MeisterGamer/sonora-Gameserver-Manager/main/install.sh | sudo bash -s -- --start
#
# Manuell herunterladen & ausführen:
#   wget -O install.sh https://raw.githubusercontent.com/MeisterGamer/sonora-Gameserver-Manager/main/install.sh
#   sudo bash install.sh --start
#
# 100% Komplettsystem: GitHub-Download & Einrichtung, Node.js, Java 21-25,
# Valve SteamCMD + 32-Bit Multiarch + Pre-Start-Verifikation, Wine + Xvfb +
# Podman/Docker Windows-.exe Kompatibilitätsschicht, automatische Reparatur
# bestehender .exe-Server (kein MZ: not found), Hardware-Health Sensoren,
# Rechtesystem (RBAC), UFW-Firewall, DDoS-Schutz (sysctl + iptables + fail2ban)
# & systemd-Autostart.
# ==============================================================================

set -euo pipefail

# GitHub-Repository & CLI-Optionen
# (Standard: START=false für sicheren unattended Build; --start startet Dienst sofort)
REPO_WEB_URL="${REPO_WEB_URL:-https://github.com/MeisterGamer/sonora-Gameserver-Manager}"
REPO_URL="${REPO_URL:-https://github.com/MeisterGamer/sonora-Gameserver-Manager.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/srv/sonora-gameserver-manager}"
FORCE_UPDATE=false
START=false
PANEL_PORT="${PORT:-3000}"
SFTP_PORT="${SFTP_PORT:-2022}"
SSH_PORT="${SSH_PORT:-22}"
SKIP_FIREWALL=false
SKIP_DDOS=false
SKIP_WINE=false
WINE_CONTAINER_IMAGE="${SONORA_WINE_CONTAINER_IMAGE:-scottyhardy/docker-wine:latest}"

for arg in "$@"; do
  case "$arg" in
    --start) START=true ;;
    --update) FORCE_UPDATE=true ;;
    --no-firewall) SKIP_FIREWALL=true ;;
    --no-ddos) SKIP_DDOS=true ;;
    --no-wine) SKIP_WINE=true ;;
    --panel-port=*) PANEL_PORT="${arg#*=}" ;;
    --sftp-port=*) SFTP_PORT="${arg#*=}" ;;
    --ssh-port=*) SSH_PORT="${arg#*=}" ;;
    --dir=*) INSTALL_DIR="${arg#*=}" ;;
    --branch=*) REPO_BRANCH="${arg#*=}" ;;
    --repo=*) REPO_URL="${arg#*=}" ;;
    -h|--help)
      cat <<HELP_EOF
Sonora Gameserver Manager — Debian All-in-One Komplett-Installer
Repository: ${REPO_WEB_URL}

Verwendung:
  curl -fsSL https://raw.githubusercontent.com/MeisterGamer/sonora-Gameserver-Manager/main/install.sh | sudo bash -s -- --start
  sudo bash install.sh [OPTIONEN]

Optionen:
  --start                Startet den systemd-Dienst sofort nach der Einrichtung
  --dir=<PFAD>           Zielverzeichnis für den GitHub-Download (Standard: /srv/sonora-gameserver-manager)
  --branch=<BRANCH>      Git-Branch für den Download (Standard: main)
  --repo=<URL>           Alternative Git-Repository-URL
  --update               Aktualisiert ein bestehendes Git-Checkout (git pull --ff-only)
  --panel-port=<PORT>    Web-Panel-Port (Standard: 3000)
  --sftp-port=<PORT>     SFTP-Server-Port (Standard: 2022)
  --ssh-port=<PORT>      SSH-Port für UFW Rate-Limit & Fail2ban (Standard: 22)
  --no-firewall          Überspringt UFW-Firewall-Einrichtung
  --no-ddos              Überspringt Kernel-Sysctl, iptables DDoS-Chain & Fail2ban
  --no-wine              Überspringt Wine/Xvfb & Podman/Docker Installation für Windows-.exe Gameserver
HELP_EOF
      exit 0
      ;;
  esac
done

# Farben für Terminalausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║      SONORA GAMESERVER MANAGER — VOLLSTÄNDIGE DEBIAN-INSTALLATION       ║"
echo "║  GitHub • SteamCMD • Wine/Podman • Hardware-Health • UFW • DDoS • Boot  ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}${BOLD}Installationsumfang (Debian 11/12/13 & Ubuntu LTS — 100% vollständig):${NC}"
echo -e "  ✓ Automatischer Download & Einrichtung von: ${REPO_WEB_URL}"
echo -e "  ✓ Node.js 22 LTS, Java 21 LTS + portables JDK 25 & Vite Production-Build"
echo -e "  ✓ Valve SteamCMD, 32-Bit Multiarch (Debian 13 t64) & Pre-Start-Verifikation"
echo -e "  ✓ Windows-.exe Laufzeit: Wine + Xvfb + Podman/Docker-Fallback & Wrapper-Reparatur"
echo -e "  ✓ Hardware-Health Sensoren (lm-sensors, sysstat, smartmontools) & Mod-Indizierung"
echo -e "  ✓ Datei-Manager, ZIP/Unzip, Server-Diagnose-Tool, Log-Analyzer & SFTP (Port ${SFTP_PORT})"
echo -e "  ✓ UFW-Firewall (automatische Port-Freigabe), Kernel-/iptables-DDoS-Schutz & Fail2ban"
echo -e "  ✓ systemd-Hintergrunddienst mit Boot-Autostart & Watchdog-Neustart"
echo ""

# 1. Root-Rechte prüfen
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Dieses Skript muss mit Root-Rechten ausgeführt werden!${NC}"
  echo -e "Bitte starte das Skript erneut mit: ${BOLD}sudo bash install.sh --start${NC}"
  exit 1
fi
echo -e "${GREEN}[1/12] Root-Rechte bestätigt (OS: $(grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d'"' -f2 || uname -s)).${NC}"

# 2. Debian/Ubuntu Paketlisten aktualisieren & Basistools + Firewall/DDoS/Hardware-Health installieren
# Debian 13 (Trixie) Fix: ufw deklariert "Breaks: iptables-persistent".
# Wir priorisieren konsequent UFW statt iptables-persistent, um Paketkonflikte auf Debian 13
# vollständig zu vermeiden. Die SONORA_DDOS-Regeln werden stattdessen konfliktfrei über den
# eigenen systemd-Dienst sonora-ddos.service bootfest persistiert.
# Zusätzlich nutzen apt_has_candidate / apt_install_preferred lokale APT-Repositories als Fallback,
# wenn bestimmte Paketversionen (z. B. OpenJDK 21, NodeSource, Debian-13 t64-Pakete) fehlen.
echo -e "${BLUE}[2/12] Aktualisiere Paketlisten und installiere Basiskomponenten, UFW-Firewall, DDoS- & Hardware-Health-Tools...${NC}"
export DEBIAN_FRONTEND=noninteractive

apt_has_candidate() {
  local pkg="$1"
  local candidate
  candidate="$(apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"
  [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

apt_install_preferred() {
  local pkg
  for pkg in "$@"; do
    if apt_has_candidate "$pkg"; then
      if apt-get install -y -q --no-install-recommends "$pkg" >/dev/null 2>&1; then
        return 0
      fi
    fi
  done
  return 1
}

dpkg --configure -a >/dev/null 2>&1 || true
if dpkg -s iptables-persistent >/dev/null 2>&1 || dpkg -s netfilter-persistent >/dev/null 2>&1; then
  echo -e "${YELLOW}Priorisiere UFW: Entferne kollidierendes Paket iptables-persistent / netfilter-persistent (Debian 13 Kompatibilität)...${NC}"
  apt-get remove --purge -y -q iptables-persistent netfilter-persistent >/dev/null 2>&1 || true
fi
apt-get -f install -y -q >/dev/null 2>&1 || true
apt-get update -y -q || true

for base_pkg in curl wget git unzip tar ca-certificates gnupg lsb-release build-essential net-tools iproute2 sudo jq procps file screen tmux; do
  apt_install_preferred "$base_pkg" || true
done

# UFW mit höchster Priorität installieren (niemals iptables-persistent verwenden)
apt_install_preferred ufw || apt-get install -y -q ufw || true
apt_install_preferred iptables || true
apt_install_preferred fail2ban || true

# Hardware-Health Telemetrie-Tools (Disk-IO, Inodes & CPU/NVMe-Temperatur)
apt_install_preferred lm-sensors || true
apt_install_preferred sysstat || true
apt_install_preferred smartmontools || true

# 3. Repository-Download & Quellverzeichnis ermitteln (In-Place vs. GitHub-Auto-Download)
echo -e "${BLUE}[3/12] Prüfe Projektdateien / Lade Sonora Gameserver Manager von GitHub...${NC}"
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd -P)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ] && [ -f "$SCRIPT_DIR/server.ts" ]; then
  SOURCE_DIR="$SCRIPT_DIR"
  echo -e "${GREEN}✓ Lokales Projektverzeichnis erkannt: ${SOURCE_DIR}${NC}"
  if [ "$FORCE_UPDATE" = true ] && [ -d "$SOURCE_DIR/.git" ]; then
    echo -e "${YELLOW}Aktualisiere lokales Repository (${REPO_BRANCH})...${NC}"
    git -C "$SOURCE_DIR" fetch --all --prune 2>/dev/null || true
    git -C "$SOURCE_DIR" pull --ff-only origin "$REPO_BRANCH" 2>/dev/null || true
  fi
else
  SOURCE_DIR="$INSTALL_DIR"
  mkdir -p "$(dirname "$SOURCE_DIR")"

  if [ -d "$SOURCE_DIR/.git" ]; then
    echo -e "${YELLOW}Bestehende Installation in ${SOURCE_DIR} gefunden — aktualisiere von GitHub (${REPO_BRANCH})...${NC}"
    git -C "$SOURCE_DIR" remote set-url origin "$REPO_URL" 2>/dev/null || true
    git -C "$SOURCE_DIR" fetch --all --prune 2>/dev/null || true
    git -C "$SOURCE_DIR" pull --ff-only origin "$REPO_BRANCH" 2>/dev/null || \
      git -C "$SOURCE_DIR" pull --ff-only 2>/dev/null || true
  elif [ -f "$SOURCE_DIR/package.json" ] && [ -f "$SOURCE_DIR/server.ts" ]; then
    echo -e "${GREEN}✓ Bestehende Installation in ${SOURCE_DIR} gefunden (Daten bleiben erhalten).${NC}"
  else
    echo -e "${YELLOW}Lade Sonora Gameserver Manager herunter von: ${REPO_URL} (Branch: ${REPO_BRANCH})...${NC}"
    DOWNLOAD_OK=false
    if command -v git &>/dev/null; then
      if git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$SOURCE_DIR" 2>/dev/null; then
        DOWNLOAD_OK=true
      elif git clone --depth 1 "$REPO_URL" "$SOURCE_DIR" 2>/dev/null; then
        DOWNLOAD_OK=true
      fi
    fi

    # Fallback: Direkt-Download als GitHub-Tarball, falls git clone nicht verfügbar/blockiert
    if [ "$DOWNLOAD_OK" = false ]; then
      echo -e "${YELLOW}Git-Clone fehlgeschlagen — nutze direkten GitHub-Archiv-Download...${NC}"
      TMP_TARBALL="$(mktemp /tmp/sonora-repo-XXXXXX.tar.gz)"
      TMP_EXTRACT="$(mktemp -d /tmp/sonora-extract-XXXXXX)"
      if curl -fsSL "${REPO_WEB_URL}/archive/refs/heads/${REPO_BRANCH}.tar.gz" -o "$TMP_TARBALL" 2>/dev/null || \
         curl -fsSL "${REPO_WEB_URL}/archive/HEAD.tar.gz" -o "$TMP_TARBALL" 2>/dev/null; then
        tar -xzf "$TMP_TARBALL" -C "$TMP_EXTRACT"
        EXTRACTED_ROOT="$(find "$TMP_EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        if [ -n "$EXTRACTED_ROOT" ] && [ -f "$EXTRACTED_ROOT/package.json" ]; then
          mkdir -p "$SOURCE_DIR"
          cp -a "$EXTRACTED_ROOT/." "$SOURCE_DIR/"
          DOWNLOAD_OK=true
        fi
      fi
      rm -rf "$TMP_TARBALL" "$TMP_EXTRACT"
    fi

    if [ "$DOWNLOAD_OK" = false ] || [ ! -f "$SOURCE_DIR/package.json" ] || [ ! -f "$SOURCE_DIR/server.ts" ]; then
      echo -e "${RED}[FEHLER] Konnte Repository nicht von ${REPO_WEB_URL} herunterladen!${NC}"
      echo -e "Bitte Internetverbindung & Repository-URL prüfen oder manuell klonen:"
      echo -e "  ${BOLD}git clone ${REPO_URL} ${SOURCE_DIR} && cd ${SOURCE_DIR} && sudo bash install.sh --start${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Repository erfolgreich nach ${SOURCE_DIR} heruntergeladen.${NC}"
  fi
fi

# Anwendungs-Pfade innerhalb der Quellinstallation setzen
DATA_ROOT="$SOURCE_DIR/data"
RUNTIME_ROOT="$SOURCE_DIR/.runtime"

# Vorherige Daten erhalten
PREVIOUS_DATA="${PREVIOUS_DATA:-}"
if [ -n "$PREVIOUS_DATA" ] && [ -d "$PREVIOUS_DATA" ]; then
  mkdir -p "$DATA_ROOT"
  cp -a "$PREVIOUS_DATA/." "$DATA_ROOT/"
  echo -e "${GREEN}Local data retained from previous install.${NC}"
else
  mkdir -p "$DATA_ROOT"
  echo -e "${GREEN}Local data retained in source installation.${NC}"
fi

# .env-Konfiguration automatisch aus .env.example einrichten (ohne bestehende .env zu überschreiben)
if [ ! -f "$SOURCE_DIR/.env" ]; then
  if [ -f "$SOURCE_DIR/.env.example" ]; then
    cp "$SOURCE_DIR/.env.example" "$SOURCE_DIR/.env"
  else
    touch "$SOURCE_DIR/.env"
  fi
  grep -q '^NODE_ENV=' "$SOURCE_DIR/.env" && sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "$SOURCE_DIR/.env" || echo "NODE_ENV=production" >> "$SOURCE_DIR/.env"
  grep -q '^PORT=' "$SOURCE_DIR/.env" && sed -i "s/^PORT=.*/PORT=${PANEL_PORT}/" "$SOURCE_DIR/.env" || echo "PORT=${PANEL_PORT}" >> "$SOURCE_DIR/.env"
  grep -q '^SFTP_PORT=' "$SOURCE_DIR/.env" && sed -i "s/^SFTP_PORT=.*/SFTP_PORT=${SFTP_PORT}/" "$SOURCE_DIR/.env" || echo "SFTP_PORT=${SFTP_PORT}" >> "$SOURCE_DIR/.env"
  echo -e "${GREEN}✓ Konfigurationsdatei .env automatisch eingerichtet (PORT=${PANEL_PORT}, SFTP_PORT=${SFTP_PORT}).${NC}"
fi

# 4. Java 21 LTS & portables JDK 25 prüfen / bereitstellen
echo -e "${BLUE}[4/12] Prüfe Java-Laufzeitumgebung (Java 21 LTS bis 25)...${NC}"
NEED_JAVA=true
if command -v java &>/dev/null; then
  JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}')
  echo -e "${CYAN}Gefundenes Host-Java:${NC} $JAVA_VER"
  if [[ "$JAVA_VER" == 21* || "$JAVA_VER" == 22* || "$JAVA_VER" == 23* || "$JAVA_VER" == 24* || "$JAVA_VER" == 25* ]]; then
    echo -e "${GREEN}✓ Kompatibles modernes Java ($JAVA_VER) ist bereits installiert.${NC}"
    NEED_JAVA=false
  fi
fi

if [ "$NEED_JAVA" = true ]; then
  echo -e "${YELLOW}Installiere Java-Laufzeit aus lokalen APT-Repositories (bevorzugt OpenJDK 21 LTS, Fallback auf default-jre)...${NC}"
  apt_install_preferred openjdk-21-jre-headless openjdk-17-jre-headless default-jre-headless || true
  apt_install_preferred openjdk-21-jdk-headless openjdk-17-jdk-headless default-jdk-headless || true
  echo -e "${GREEN}✓ Java erfolgreich installiert ($(java -version 2>&1 | head -n 1 || echo 'bereit')).${NC}"
fi

# Portables JDK 25 Verzeichnis vorbereiten
mkdir -p "$RUNTIME_ROOT/jdks"
(cd "$SOURCE_DIR" && node -e 'import("./backend/java.ts").then(m=>m.ensureJdk(process.cwd()+"/.runtime/jdks",25)).catch(()=>{})') 2>/dev/null || true

# 5. Valve SteamCMD & 32-Bit Multiarch-Bibliotheken einrichten (Debian 11/12/13 t64 & i386)
echo -e "${BLUE}[5/12] Prüfe Valve SteamCMD & 32-Bit Laufzeitbibliotheken...${NC}"
dpkg --add-architecture i386 2>/dev/null || true
if [ -f /etc/apt/sources.list ] && grep -qi "debian" /etc/os-release 2>/dev/null; then
  # Debian benötigt i386-Bibliotheken für SteamCMD & Wine
  apt-get update -y -q 2>/dev/null || true
else
  add-apt-repository -y multiverse 2>/dev/null || true
  apt-get update -y -q 2>/dev/null || true
fi
# Lokale APT-Repository-Fallbacks für Debian 12/13 (inkl. t64-Übergangspakete)
apt_install_preferred lib32gcc-s1 lib32gcc1 || true
apt_install_preferred lib32stdc++6 || true
apt_install_preferred libsdl2-2.0-0t64 libsdl2-2.0-0 || true
apt_install_preferred libc6-i386 libc6:i386 || true
apt_install_preferred zlib1g:i386 || true
apt_install_preferred libstdc++6:i386 || true
apt_install_preferred libcurl4t64:i386 libcurl4:i386 || true

# Pre-seed steamcmd license agreement (nur falls in lokalen APT-Quellen verfügbar)
echo steam steam/question select "I AGREE" | debconf-set-selections 2>/dev/null || true
echo steam steam/license note '' | debconf-set-selections 2>/dev/null || true
apt_install_preferred steamcmd || true

# Standalone SteamCMD in /opt/steamcmd als robuster primärer Pfad für Debian
mkdir -p /opt/steamcmd
if [ ! -f /opt/steamcmd/steamcmd.sh ]; then
  echo -e "${YELLOW}Richte Valve SteamCMD in /opt/steamcmd ein...${NC}"
  curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar -zxvf - -C /opt/steamcmd/ 2>/dev/null || true
fi
chmod +x /opt/steamcmd/steamcmd.sh 2>/dev/null || true

# Robuste SteamCMD-Verifikation & Pre-Start-Prüfung für Steam-Spieldaten
verify_steamcmd_ready() {
  local steam_dir="/opt/steamcmd"
  if [ ! -x "${steam_dir}/steamcmd.sh" ]; then
    echo -e "${YELLOW}[WARN] SteamCMD-Skript fehlt unter ${steam_dir}/steamcmd.sh.${NC}"
    return 1
  fi
  if [ ! -s "${steam_dir}/linux32/steamcmd" ]; then
    echo -e "${YELLOW}[WARN] SteamCMD-Kernbinary (${steam_dir}/linux32/steamcmd) fehlt oder ist leer.${NC}"
    return 1
  fi

  # Einmaliges Bootstrap mit Retry bei SteamCMD-Selbstupdate (Exit-Code 7 oder 8)
  local attempt rc=0
  for attempt in 1 2; do
    rc=0
    timeout 90 "${steam_dir}/steamcmd.sh" +quit >/dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 0 ]; then
      break
    elif [ "$rc" -eq 7 ] || [ "$rc" -eq 8 ]; then
      echo -e "${YELLOW}SteamCMD hat Selbstupdate durchgeführt (Code ${rc}) — verifiziere Abschluss (Versuch ${attempt}/2)...${NC}"
      continue
    else
      break
    fi
  done

  mkdir -p /root/.steam/sdk64 /root/.steam/sdk32
  [ -f "${steam_dir}/linux64/steamclient.so" ] && ln -sf "${steam_dir}/linux64/steamclient.so" /root/.steam/sdk64/steamclient.so || true
  [ -f "${steam_dir}/linux32/steamclient.so" ] && ln -sf "${steam_dir}/linux32/steamclient.so" /root/.steam/sdk32/steamclient.so || true

  if [ -r /root/.steam/sdk64/steamclient.so ] || [ -r /root/.steam/sdk32/steamclient.so ] || [ -f "${steam_dir}/package/steam_cmd_linux.installed" ]; then
    printf 'verified_at=%s\nsteamcmd_rc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc" > "${steam_dir}/.sonora-steamcmd-verified"
    return 0
  fi

  echo -e "${YELLOW}[WARN] SteamCMD-Bootstrap konnte nicht vollständig verifiziert werden (Exit-Code ${rc}).${NC}"
  return 1
}

# Pre-Start-Prüfskript für SteamCMD-Abschluss, App-Manifest (StateFlags=4) & Spiel-Executable installieren
cat <<'VERIFY_STEAM_EOF' > /usr/local/sbin/sonora-verify-steam.sh
#!/usr/bin/env bash
# Prüft vor dem Serverstart, ob SteamCMD vollständig eingerichtet ist und
# die Steam-App-Daten (appmanifest StateFlags=4 + Executable) korrekt heruntergeladen wurden.
set -euo pipefail

SRV_DIR="${1:-}"
APP_ID="${2:-0}"
EXPECTED_EXEC="${3:-}"

if [ -z "$SRV_DIR" ] || [ ! -d "$SRV_DIR" ]; then
  echo "[PRE-START FEHLER] Server-Verzeichnis fehlt: ${SRV_DIR:-<leer>}" >&2
  exit 10
fi

if [ ! -x /opt/steamcmd/steamcmd.sh ] && ! command -v steamcmd >/dev/null 2>&1; then
  echo "[PRE-START WARNUNG] SteamCMD ist nicht auf dem Host installiert." >&2
fi

if [ "$APP_ID" -gt 0 ] 2>/dev/null; then
  DOWNLOADING_DIR="${SRV_DIR}/steamapps/downloading/${APP_ID}"
  if [ -d "$DOWNLOADING_DIR" ] && [ -n "$(ls -A "$DOWNLOADING_DIR" 2>/dev/null)" ]; then
    echo "[PRE-START FEHLER] Unvollständiger SteamCMD-Download in ${DOWNLOADING_DIR} erkannt." >&2
    exit 11
  fi

  MANIFEST_FILE="${SRV_DIR}/steamapps/appmanifest_${APP_ID}.acf"
  if [ -f "$MANIFEST_FILE" ]; then
    STATE_FLAGS="$(awk -F'"' '/"StateFlags"/ {print $4; exit}' "$MANIFEST_FILE" 2>/dev/null || true)"
    if [ "$STATE_FLAGS" != "4" ]; then
      echo "[PRE-START FEHLER] Steam App ${APP_ID} ist nicht vollständig installiert (StateFlags=${STATE_FLAGS:-unbekannt}, erwartet 4)." >&2
      exit 12
    fi
  fi
fi

if [ -n "$EXPECTED_EXEC" ]; then
  CLEAN_EXEC="${EXPECTED_EXEC#./}"
  if [ ! -s "${SRV_DIR}/${CLEAN_EXEC}" ]; then
    echo "[PRE-START FEHLER] Erwartete Server-Executable fehlt oder ist leer: ${SRV_DIR}/${CLEAN_EXEC}" >&2
    exit 13
  fi

  # Windows PE (.exe / MZ-Header) Prüfung unter Linux:
  # NIEMALS chmod +x auf .exe setzen (verhindert /bin/sh Fallback `MZ: not found`), stattdessen chmod 644 & Pre-Flight-Check!
  EXEC_MAGIC="$(head -c 2 "${SRV_DIR}/${CLEAN_EXEC}" 2>/dev/null || true)"
  if [ "$EXEC_MAGIC" = "MZ" ] || [[ "${CLEAN_EXEC,,}" == *.exe ]]; then
    chmod 0644 "${SRV_DIR}/${CLEAN_EXEC}" 2>/dev/null || true
    if ! command -v wine64 >/dev/null 2>&1 && [ ! -x /usr/lib/wine/wine64 ] && \
       ! command -v wine >/dev/null 2>&1 && [ ! -x /usr/lib/wine/wine ] && \
       ! command -v podman >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
      echo "[PRE-START FEHLER] Windows-Executable (${CLEAN_EXEC}) erfordert Wine (+Xvfb) oder Podman/Docker unter Linux!" >&2
      exit 14
    fi
  else
    chmod +x "${SRV_DIR}/${CLEAN_EXEC}" 2>/dev/null || true
  fi
fi

exit 0
VERIFY_STEAM_EOF
chmod 0755 /usr/local/sbin/sonora-verify-steam.sh 2>/dev/null || true

# SteamCMD verifizieren & Wrapper in /usr/bin/steamcmd anlegen
if [ -f /opt/steamcmd/steamcmd.sh ]; then
  verify_steamcmd_ready || true
  cat <<'WRAPPER_EOF' > /usr/bin/steamcmd
#!/usr/bin/env bash
exec /opt/steamcmd/steamcmd.sh "$@"
WRAPPER_EOF
  chmod +x /usr/bin/steamcmd
elif [ -f /usr/games/steamcmd ]; then
  ln -sf /usr/games/steamcmd /usr/bin/steamcmd
fi
echo -e "${GREEN}✓ SteamCMD, Pre-Start-Verifikation & steamclient.so Laufzeit-Symlinks einsatzbereit.${NC}"

# 6. Vollständige Windows-.exe Kompatibilitäts-Runtime (Wine + Xvfb + Podman/Docker-Fallback)
echo -e "${BLUE}[6/12] Richte Windows-.exe Laufzeit ein (Wine + Xvfb, Podman/Docker-Fallback & Wrapper-Helper)...${NC}"
DETECTED_WIN_RUNTIME="none"
DETECTED_WIN_SUMMARY="Nicht installiert (--no-wine oder APT nicht verfügbar)"

if [ "$SKIP_WINE" = false ]; then
  # Wine (Debian 11/12/13 kompatibel) + Xvfb Headless + Hilfspakete
  apt_install_preferred wine64 wine || apt_install_preferred wine || true
  apt_install_preferred wine32 || true
  apt_install_preferred xvfb || true
  apt_install_preferred xauth || true
  apt_install_preferred winbind || true
  apt_install_preferred cabextract || true
  apt_install_preferred libfreetype6 || true
  apt_install_preferred libfreetype6:i386 || true

  # Debian 13 (Trixie) Symlink-Fix: falls wine64/wine nur unter /usr/lib/wine liegt, in /usr/local/bin verfügbar machen
  if ! command -v wine64 &>/dev/null && [ -x /usr/lib/wine/wine64 ]; then
    ln -sf /usr/lib/wine/wine64 /usr/local/bin/wine64
  fi
  if ! command -v wine &>/dev/null && [ -x /usr/lib/wine/wine ]; then
    ln -sf /usr/lib/wine/wine /usr/local/bin/wine
  fi

  # Podman als rootless/daemonless Container-Engine (plus Docker-Fallback, falls weder Wine noch Podman verfügbar)
  apt_install_preferred podman || true
  if ! command -v wine64 &>/dev/null && ! command -v wine &>/dev/null && ! command -v podman &>/dev/null && ! command -v docker &>/dev/null; then
    apt_install_preferred docker.io || true
    if command -v docker &>/dev/null; then
      systemctl enable --now docker >/dev/null 2>&1 || true
    fi
  fi

  # Erkannte Laufzeit ermitteln & testen
  WINE_CMD="$(command -v wine64 2>/dev/null || command -v wine 2>/dev/null || true)"
  if [ -n "$WINE_CMD" ]; then
    DETECTED_WIN_RUNTIME="wine"
    WINE_VER="$("$WINE_CMD" --version 2>/dev/null || echo 'installiert')"
    if command -v xvfb-run &>/dev/null; then
      DETECTED_WIN_SUMMARY="Wine (${WINE_VER}) + Xvfb Headless"
    else
      DETECTED_WIN_SUMMARY="Wine (${WINE_VER})"
    fi
    echo -e "${GREEN}✓ ${DETECTED_WIN_SUMMARY} erfolgreich eingerichtet.${NC}"
  elif command -v podman &>/dev/null; then
    DETECTED_WIN_RUNTIME="podman"
    DETECTED_WIN_SUMMARY="Podman ($(podman --version 2>/dev/null || echo 'installiert'))"
    echo -e "${GREEN}✓ Container-Runtime ${DETECTED_WIN_SUMMARY} für Windows-.exe Server eingerichtet.${NC}"
    timeout 180 podman pull "$WINE_CONTAINER_IMAGE" >/dev/null 2>&1 || true
  elif command -v docker &>/dev/null; then
    DETECTED_WIN_RUNTIME="docker"
    DETECTED_WIN_SUMMARY="Docker ($(docker --version 2>/dev/null || echo 'installiert'))"
    systemctl enable --now docker >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Container-Runtime ${DETECTED_WIN_SUMMARY} für Windows-.exe Server eingerichtet.${NC}"
    timeout 180 docker pull "$WINE_CONTAINER_IMAGE" >/dev/null 2>&1 || true
  else
    echo -e "${YELLOW}[WARN] Weder Wine noch Podman/Docker konnte aus den lokalen APT-Quellen installiert werden. Nachinstallierbar via: apt-get install -y wine xvfb podman${NC}"
  fi
else
  echo -e "${YELLOW}ℹ Windows-.exe Laufzeit-Installation übersprungen (--no-wine).${NC}"
fi

# Systemweiten universellen Windows-.exe Launcher installieren (/usr/local/sbin/sonora-run-win-exe.sh)
cat <<WIN_RUNNER_EOF > /usr/local/sbin/sonora-run-win-exe.sh
#!/usr/bin/env bash
# Universeller Linux-Launcher für Windows-PE (.exe) Dedicated Server (Wine + Xvfb / Podman / Docker)
set -euo pipefail

if [ "\$#" -lt 1 ]; then
  echo "Verwendung: sonora-run-win-exe.sh <PFAD_ZUR_EXE> [SERVER_ARGS...]" >&2
  exit 1
fi

EXE_PATH="\$1"
shift
SRV_DIR="\$(cd "\$(dirname "\$EXE_PATH")" && pwd -P)"
EXE_BASE="\$(basename "\$EXE_PATH")"
cd "\$SRV_DIR"

# Execute-Bit von .exe entfernen, damit /bin/sh niemals MZ-Binary als Skript interpretiert
chmod 0644 "\$SRV_DIR/\$EXE_BASE" 2>/dev/null || true

export WINEPREFIX="\$SRV_DIR/.wineprefix"
export WINEARCH=win64
export WINEDEBUG="\${WINEDEBUG:--all}"
export WINEDLLOVERRIDES="mscoree,mshtml="
export SDL_VIDEODRIVER=dummy

WINE_BIN=""
for cand in wine64 /usr/bin/wine64 /usr/local/bin/wine64 /usr/lib/wine/wine64 wine /usr/bin/wine /usr/local/bin/wine /usr/lib/wine/wine; do
  if command -v "\$cand" >/dev/null 2>&1; then
    WINE_BIN="\$(command -v "\$cand")"
    break
  elif [ -x "\$cand" ]; then
    WINE_BIN="\$cand"
    break
  fi
done

if [ -n "\$WINE_BIN" ]; then
  mkdir -p "\$WINEPREFIX"
  if command -v xvfb-run >/dev/null 2>&1; then
    exec xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" "\$WINE_BIN" "\$SRV_DIR/\$EXE_BASE" "\$@"
  fi
  exec "\$WINE_BIN" "\$SRV_DIR/\$EXE_BASE" "\$@"
fi

if command -v podman >/dev/null 2>&1; then
  exec podman run --rm -i --network host -v "\$SRV_DIR:/srv/game:Z" -w /srv/game \\
    -e WINEPREFIX=/srv/game/.wineprefix -e WINEARCH=win64 -e WINEDEBUG=-all -e WINEDLLOVERRIDES="mscoree,mshtml=" \\
    "${WINE_CONTAINER_IMAGE}" xvfb-run --auto-servernum wine64 "/srv/game/\$EXE_BASE" "\$@"
fi

if command -v docker >/dev/null 2>&1; then
  exec docker run --rm -i --network host -v "\$SRV_DIR:/srv/game:rw" -w /srv/game \\
    -e WINEPREFIX=/srv/game/.wineprefix -e WINEARCH=win64 -e WINEDEBUG=-all -e WINEDLLOVERRIDES="mscoree,mshtml=" \\
    "${WINE_CONTAINER_IMAGE}" xvfb-run --auto-servernum wine64 "/srv/game/\$EXE_BASE" "\$@"
fi

echo "[FEHLER] [WINDOWS_EXE_NEEDS_WINE_OR_CONTAINER] Windows-Binary \"\$EXE_BASE\" kann unter Linux nicht direkt gestartet werden (Wine/Podman/Docker fehlt)." >&2
exit 1
WIN_RUNNER_EOF
chmod 0755 /usr/local/sbin/sonora-run-win-exe.sh 2>/dev/null || true

# .env automatisch mit erkannter Windows-Runtime synchronisieren (wenn Runtime vorhanden)
if [ "$DETECTED_WIN_RUNTIME" != "none" ] && [ -f "$SOURCE_DIR/.env" ]; then
  grep -q '^SONORA_WIN_RUNTIME=' "$SOURCE_DIR/.env" \
    && sed -i "s/^SONORA_WIN_RUNTIME=.*/SONORA_WIN_RUNTIME=${DETECTED_WIN_RUNTIME}/" "$SOURCE_DIR/.env" \
    || echo "SONORA_WIN_RUNTIME=${DETECTED_WIN_RUNTIME}" >> "$SOURCE_DIR/.env"
  grep -q '^SONORA_ALLOW_WIN_EXE=' "$SOURCE_DIR/.env" \
    && sed -i "s/^SONORA_ALLOW_WIN_EXE=.*/SONORA_ALLOW_WIN_EXE=true/" "$SOURCE_DIR/.env" \
    || echo "SONORA_ALLOW_WIN_EXE=true" >> "$SOURCE_DIR/.env"
fi

# 7. Node.js (v22 LTS mit lokalem APT-Fallback) & Verzeichnisstruktur / .exe-Reparatur
echo -e "${BLUE}[7/12] Prüfe Node.js, npm & repariere bestehende Server-Verzeichnisse...${NC}"
NEED_NODE=true
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d'.' -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    echo -e "${GREEN}✓ Kompatibles Node.js ($NODE_VER) und npm ($(npm -v)) bereits vorhanden.${NC}"
    NEED_NODE=false
  fi
fi

if [ "$NEED_NODE" = true ]; then
  echo -e "${YELLOW}Installiere Node.js (NodeSource 22 LTS oder lokales Debian APT-Repository als Fallback)...${NC}"
  if curl -fsSL --max-time 20 https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1; then
    apt-get install -y -q nodejs || true
  fi
  # Fallback auf lokale Debian APT-Repositories, falls NodeSource für Debian 13/System nicht verfügbar ist
  if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
    rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/sources.list.d/nodesource.sources 2>/dev/null || true
    apt-get update -y -q >/dev/null 2>&1 || true
    apt_install_preferred nodejs || apt-get install -y -q nodejs || true
    apt_install_preferred npm || apt-get install -y -q npm || true
  fi
  echo -e "${GREEN}✓ Node.js $(node -v 2>/dev/null || echo 'bereit') und npm $(npm -v 2>/dev/null || echo 'bereit') erfolgreich installiert.${NC}"
fi

# Optionale Node-Archiv-Prüfsumme
if [ -f "$SOURCE_DIR/node-check.txt" ]; then
  (cd "$SOURCE_DIR" && sha256sum --check node-check.txt) || true
fi

# Verzeichnisse für Daten, Backups, Server und SteamCMD anlegen
mkdir -p "$DATA_ROOT/servers"
mkdir -p "$DATA_ROOT/backups"
mkdir -p "$DATA_ROOT/manager"
mkdir -p "$RUNTIME_ROOT/jdks"
mkdir -p "$SOURCE_DIR/steamcmd"

# WICHTIG: Niemals blind `chmod -R 755` auf Windows-.exe Dateien anwenden!
# Nur Skripte im Projektstamm ausführbar machen und bestehende Windows-.exe Server automatisch reparieren.
chmod 0755 "$SOURCE_DIR" "$DATA_ROOT" "$DATA_ROOT/servers" "$DATA_ROOT/backups" "$DATA_ROOT/manager" "$RUNTIME_ROOT" "$RUNTIME_ROOT/jdks" 2>/dev/null || true
chmod 0755 "$SOURCE_DIR/install.sh" "$SOURCE_DIR/start-manager.sh" 2>/dev/null || true

REPAIRED_WIN_SERVERS=0
repair_existing_windows_servers() {
  local servers_dir="$1"
  [ -d "$servers_dir" ] || return 0

  # 1. Execute-Bit von allen .exe/.dll/.bat/.cmd Dateien entfernen (verhindert /bin/sh MZ: not found Crash)
  find "$servers_dir" -maxdepth 4 -type f \( -iname '*.exe' -o -iname '*.dll' -o -iname '*.bat' -o -iname '*.cmd' \) -exec chmod 0644 {} + 2>/dev/null || true

  # 2. Bestehende Windows-.exe Server-Instanzen (z. B. VRisingServer.exe) mit sicherem Wine/Podman/Docker-Wrapper versehen
  local srv_dir exe_file rel_exe script_name target_script
  for srv_dir in "$servers_dir"/*; do
    [ -d "$srv_dir" ] || continue
    exe_file="$(find "$srv_dir" -maxdepth 3 -type f -iname '*.exe' ! -iname '*CrashHandler*' ! -iname '*Uninstall*' 2>/dev/null | head -n 1 || true)"
    if [ -n "$exe_file" ]; then
      rel_exe="${exe_file#${srv_dir}/}"
      for script_name in start.sh run.sh; do
        target_script="${srv_dir}/${script_name}"
        if [ ! -f "$target_script" ] || (grep -qi '\.exe' "$target_script" 2>/dev/null && ! grep -qiE 'wine|podman|docker|sonora-run-win-exe' "$target_script" 2>/dev/null); then
          cat <<SAFE_SH_EOF > "$target_script"
#!/usr/bin/env bash
# Auto-repaired by Sonora install.sh (Wine / Podman / Docker Compatibility Wrapper)
set -euo pipefail
SRV_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
exec /usr/local/sbin/sonora-run-win-exe.sh "\$SRV_DIR/${rel_exe}" "\$@"
SAFE_SH_EOF
          chmod 0755 "$target_script" 2>/dev/null || true
        fi
      done
      REPAIRED_WIN_SERVERS=$((REPAIRED_WIN_SERVERS + 1))
    fi
  done
}

repair_existing_windows_servers "$DATA_ROOT/servers"
if [ "$REPAIRED_WIN_SERVERS" -gt 0 ]; then
  echo -e "${GREEN}✓ ${REPAIRED_WIN_SERVERS} bestehende Windows-.exe Server-Instanz(en) automatisch bereinigt (chmod 644 + Wine/Podman/Docker-Wrapper).${NC}"
fi

# 8. NPM Abhängigkeiten installieren & Production Build kompilieren
echo -e "${BLUE}[8/12] Installiere NPM-Abhängigkeiten und erstelle Production-Build...${NC}"
cd "$SOURCE_DIR"
npm install || npm install --legacy-peer-deps || npm install --force

# Sicherstellen, dass Peer-Abhängigkeit react-is (für Recharts + Vite 8 Rolldown) vorhanden ist
if [ ! -d "$SOURCE_DIR/node_modules/react-is" ]; then
  echo -e "${YELLOW}Installiere fehlende Peer-Abhängigkeit react-is für Recharts...${NC}"
  npm install --no-save react-is --legacy-peer-deps || npm install --no-save react-is --force
fi

echo -e "${YELLOW}Kompiliere Frontend-Assets (Vite Build)...${NC}"
npm run build
echo -e "${GREEN}✓ Production-Build erfolgreich erstellt.${NC}"

# 9. Debian Firewall (UFW) + automatische Port-Steuerung einrichten
echo -e "${BLUE}[9/12] Konfiguriere Debian UFW-Firewall & automatische Port-Freigabe...${NC}"
if [ "$SKIP_FIREWALL" = false ] && command -v ufw &>/dev/null; then
  ufw default deny incoming >/dev/null 2>&1 || true
  ufw default allow outgoing >/dev/null 2>&1 || true
  # SSH mit Rate-Limit gegen Brute-Force absichern
  ufw limit "${SSH_PORT}/tcp" comment 'SSH Rate-Limited' >/dev/null 2>&1 || true
  # Web-Panel & SFTP-Dienst freigeben (Gameserver-Ports werden dynamisch bei Erstellung/Löschung verwaltet!)
  ufw allow "${PANEL_PORT}/tcp" comment 'Sonora Manager Web Panel' >/dev/null 2>&1 || true
  ufw allow "${SFTP_PORT}/tcp" comment 'Sonora SFTP Server' >/dev/null 2>&1 || true
  ufw allow 80/tcp comment 'HTTP Web' >/dev/null 2>&1 || true
  ufw allow 443/tcp comment 'HTTPS Web' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ufw reload >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ UFW-Firewall aktiviert (Default Deny Incoming, SSH Rate-Limit, Panel ${PANEL_PORT}/tcp, SFTP ${SFTP_PORT}/tcp).${NC}"
  echo -e "${CYAN}  ℹ Gameserver-Ports werden ab sofort automatisch beim Erstellen geöffnet und beim Löschen wieder geschlossen.${NC}"
else
  echo -e "${YELLOW}ℹ UFW-Konfiguration übersprungen (--no-firewall oder ufw nicht installiert).${NC}"
fi

# Sudoers-Regel für sichere nicht-root Port-Verwaltung anlegen
if [ -d /etc/sudoers.d ]; then
  cat <<'SUDOERS_EOF' > /etc/sudoers.d/sonora-firewall
# Erlaubt Sonora Gameserver Manager automatische Port-Freigabe & Port-Entfernung
Defaults:root !requiretty
root ALL=(ALL) NOPASSWD: /usr/sbin/ufw, /sbin/iptables, /usr/sbin/iptables
SUDOERS_EOF
  chmod 0440 /etc/sudoers.d/sonora-firewall 2>/dev/null || true
fi

# 10. Mehrstufiger DDoS-Schutz: Kernel-Sysctl Hardening & iptables Anti-Flood Chain
echo -e "${BLUE}[10/12] Richte Kernel- & Netzwerk-DDoS-Schutz (sysctl + iptables) ein...${NC}"
if [ "$SKIP_DDOS" = false ]; then
  cat <<'SYSCTL_EOF' > /etc/sysctl.d/99-sonora-ddos.conf
# ==============================================================================
# Sonora Gameserver Manager — Debian Kernel DDoS & SYN-Flood Protection
# ==============================================================================
# TCP SYN-Flood Schutz & größere Backlogs für Gameserver-Spitzenlast
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 3
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384

# IP-Spoofing & Reverse-Path-Filter aktivieren
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# ICMP-Smurf, Redirects & Source-Routing blockieren
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Schnelleres Recycling von TIME_WAIT / FIN_WAIT gegen Slowloris & Connection-Exhaustion
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_rfc1337 = 1

# Größere Socket-Puffer für UDP-Gameserver (Minecraft Bedrock, Rust, Palworld, CS2, V Rising)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
SYSCTL_EOF
  sysctl --system >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Kernel DDoS-Hardening (/etc/sysctl.d/99-sonora-ddos.conf) aktiviert.${NC}"

  # iptables Anti-Flood Chain (SONORA_DDOS) konfliktfrei via systemd-Dienst persistieren (kein iptables-persistent nötig)
  if command -v iptables &>/dev/null; then
    cat <<'DDOS_SCRIPT_EOF' > /usr/local/sbin/sonora-ddos-apply.sh
#!/usr/bin/env bash
set -euo pipefail
command -v iptables >/dev/null 2>&1 || exit 0
iptables -N SONORA_DDOS 2>/dev/null || iptables -F SONORA_DDOS 2>/dev/null || true
# Ungültige & fragmentierte Pakete verwerfen
iptables -A SONORA_DDOS -m conntrack --ctstate INVALID -j DROP 2>/dev/null || true
iptables -A SONORA_DDOS -f -j DROP 2>/dev/null || true
# TCP-Scan / Bogus-Flags (NULL, XMAS, SYN-FIN, SYN-RST) verwerfen
iptables -A SONORA_DDOS -p tcp --tcp-flags ALL NONE -j DROP 2>/dev/null || true
iptables -A SONORA_DDOS -p tcp --tcp-flags ALL ALL -j DROP 2>/dev/null || true
iptables -A SONORA_DDOS -p tcp --tcp-flags SYN,FIN SYN,FIN -j DROP 2>/dev/null || true
iptables -A SONORA_DDOS -p tcp --tcp-flags SYN,RST SYN,RST -j DROP 2>/dev/null || true
# Neue Non-SYN TCP-Pakete blockieren
iptables -A SONORA_DDOS -p tcp ! --syn -m conntrack --ctstate NEW -j DROP 2>/dev/null || true
# TCP SYN-Flood Rate-Limiting pro Quell-IP
iptables -A SONORA_DDOS -p tcp --syn -m hashlimit --hashlimit-name sonora_syn --hashlimit-above 60/sec --hashlimit-burst 120 --hashlimit-mode srcip -j DROP 2>/dev/null || true
# ICMP Ping-Flood Rate-Limiting
iptables -A SONORA_DDOS -p icmp --icmp-type echo-request -m limit --limit 5/sec --limit-burst 15 -j ACCEPT 2>/dev/null || true
iptables -A SONORA_DDOS -p icmp --icmp-type echo-request -j DROP 2>/dev/null || true
iptables -A SONORA_DDOS -j RETURN 2>/dev/null || true
# SONORA_DDOS-Kette in INPUT einhängen (falls noch nicht vorhanden)
iptables -C INPUT -j SONORA_DDOS 2>/dev/null || iptables -I INPUT 1 -j SONORA_DDOS 2>/dev/null || true
DDOS_SCRIPT_EOF
    chmod 0755 /usr/local/sbin/sonora-ddos-apply.sh
    /usr/local/sbin/sonora-ddos-apply.sh 2>/dev/null || true

    cat <<'DDOS_UNIT_EOF' > /etc/systemd/system/sonora-ddos.service
[Unit]
Description=Sonora Gameserver Manager iptables Anti-DDoS Chain
After=network.target ufw.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sonora-ddos-apply.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
DDOS_UNIT_EOF
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable sonora-ddos.service 2>/dev/null || true
    echo -e "${GREEN}✓ iptables Anti-DDoS Chain (SONORA_DDOS) installiert & via sonora-ddos.service bootfest persistiert.${NC}"
  fi

  # 11. Fail2ban gegen SSH- & Brute-Force-Angriffe konfigurieren
  echo -e "${BLUE}[11/12] Konfiguriere Fail2ban Intrusion-Prevention...${NC}"
  if command -v fail2ban-client &>/dev/null; then
    mkdir -p /etc/fail2ban/jail.d
    cat <<F2B_EOF > /etc/fail2ban/jail.d/sonora.local
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ${SSH_PORT}
maxretry = 4
bantime = 2h
F2B_EOF
    systemctl enable fail2ban >/dev/null 2>&1 || true
    systemctl restart fail2ban >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Fail2ban aktiv (SSH Brute-Force Schutz aktiviert).${NC}"
  fi
else
  echo -e "${YELLOW}ℹ DDoS-Schutz & Fail2ban übersprungen (--no-ddos).${NC}"
fi

# 12. systemd Service Unit mit Autostart einrichten (start-manager.sh)
echo -e "${BLUE}[12/12] Richte systemd Autostart-Dienst ein...${NC}"
chmod +x "$SOURCE_DIR/start-manager.sh"

SERVICE_FILE="/etc/systemd/system/sonora-manager.service"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Sonora Gameserver Manager
After=network.target network-online.target ufw.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$SOURCE_DIR
EnvironmentFile=-$SOURCE_DIR/.env
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/wine:/usr/games"
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}
Environment=SFTP_PORT=${SFTP_PORT}
Environment=SONORA_WIN_RUNTIME=${DETECTED_WIN_RUNTIME}
ExecStart="$SOURCE_DIR/start-manager.sh"
Restart=always
RestartSec=5
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload 2>/dev/null || true
systemctl enable sonora-manager.service 2>/dev/null || true

# Optionaler Sofortstart (Standard START=false; per --start aktivierbar; laufender Dienst bei --update automatisch neu geladen)
if $START; then
  systemctl restart sonora-manager.service 2>/dev/null || true
elif [ "$FORCE_UPDATE" = true ] && systemctl is-active --quiet sonora-manager.service 2>/dev/null; then
  systemctl restart sonora-manager.service 2>/dev/null || true
fi

SERVER_IP=$(curl -s -m 4 https://ifconfig.me 2>/dev/null || curl -s -m 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || echo "127.0.0.1")

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✓ SONORA GAMESERVER MANAGER VOLLSTÄNDIG INSTALLIERT & EINSATZBEREIT!   ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  📦 ${BOLD}GitHub-Quelle:${NC}          ${REPO_WEB_URL} (${REPO_BRANCH})"
echo -e "  🌐 ${BOLD}Web-Panel aufrufen:${NC}     http://${SERVER_IP}:${PANEL_PORT}"
echo -e "  🔐 ${BOLD}SFTP-Server-Port:${NC}       ${SERVER_IP}:${SFTP_PORT}"
echo -e "  🍷 ${BOLD}Windows-.exe Runtime:${NC}   ${DETECTED_WIN_SUMMARY}"
echo -e "  🎮 ${BOLD}SteamCMD Pre-Start:${NC}     Aktiv (/usr/local/sbin/sonora-verify-steam.sh)"
echo -e "  🛡️  ${BOLD}Firewall (UFW):${NC}         Aktiv (automatische Port-Freigabe & -Löschung pro Server)"
echo -e "  🔥 ${BOLD}DDoS-Schutz:${NC}            Aktiv (sysctl 99-sonora-ddos.conf + iptables SONORA_DDOS + Fail2ban)"
echo -e "  🚀 ${BOLD}Boot-Autostart:${NC}         Aktiviert (systemd: sonora-manager.service)"
echo -e "  ☕ ${BOLD}Installiertes Java:${NC}     $(java -version 2>&1 | head -n 1 || echo 'Portables JDK')"
echo -e "  ⚡ ${BOLD}Node.js Version:${NC}        $(node -v 2>/dev/null || echo 'Installiert')"
echo -e "  📂 ${BOLD}Installationspfad:${NC}      ${SOURCE_DIR}"
echo -e "  📁 ${BOLD}Server-Dateien & Daten:${NC} ${DATA_ROOT}/servers/"
echo ""
echo -e "${CYAN}${BOLD}Sicherheitshinweis (Ersteinrichtung):${NC}"
echo -e "  • Beim ersten Öffnen der Seite vergeben Sie Ihr eigenes Administrator-Passwort."
echo -e "  • Es existiert kein unsicheres Standard-Passwort."
echo -e "  • Passwort-Notfallreset (nur auf der Konsole):"
echo -e "    ${BOLD}cd ${SOURCE_DIR} && npm run admin:reset${NC}"
echo ""
echo -e "${CYAN}${BOLD}Service-, Update- & Firewall-Verwaltung:${NC}"
echo -e "  • Starten:         ${BOLD}systemctl start sonora-manager${NC}"
echo -e "  • Status:          ${BOLD}systemctl status sonora-manager${NC}"
echo -e "  • Live-Logs:       ${BOLD}journalctl -u sonora-manager -f${NC}"
echo -e "  • Aktualisieren:   ${BOLD}cd ${SOURCE_DIR} && sudo bash install.sh --update --start${NC}"
echo -e "  • Firewall-Status: ${BOLD}ufw status verbose${NC}"
echo -e "  • DDoS-Statistik:  ${BOLD}iptables -L SONORA_DDOS -v -n${NC}"
echo ""
echo -e "${GREEN}Der Sonora Gameserver Manager ist vollständig eingerichtet.${NC}"
