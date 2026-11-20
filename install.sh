#!/usr/bin/env bash
# ==============================================================================
# Sonora Gameserver Manager — All-in-One Download & Setup Installer (Debian/Ubuntu)
# Repository: https://github.com/MeisterGamer/sonora-Gameserver-Manager
#
# Direkt-Installation (Einzeiler für frische Debian 11/12/13 & Ubuntu LTS Server):
#   curl -fsSL https://raw.githubusercontent.com/MeisterGamer/sonora-Gameserver-Manager/main/install.sh | sudo bash -s -- --start
#
# Manuell herunterladen & ausführen:
#   wget -O install.sh https://raw.githubusercontent.com/MeisterGamer/sonora-Gameserver-Manager/main/install.sh
#   sudo bash install.sh --start
#
# 100% Komplettsystem: GitHub-Download & Einrichtung, Prozesssteuerung, Dateien,
# Backups, Paper/Forge/Bedrock/Steam, Rechtesystem (RBAC), automatische Firewall
# (UFW/iptables), Kernel- & Netzwerk-DDoS-Schutz (sysctl + iptables + fail2ban)
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

for arg in "$@"; do
  case "$arg" in
    --start) START=true ;;
    --update) FORCE_UPDATE=true ;;
    --no-firewall) SKIP_FIREWALL=true ;;
    --no-ddos) SKIP_DDOS=true ;;
    --panel-port=*) PANEL_PORT="${arg#*=}" ;;
    --sftp-port=*) SFTP_PORT="${arg#*=}" ;;
    --ssh-port=*) SSH_PORT="${arg#*=}" ;;
    --dir=*) INSTALL_DIR="${arg#*=}" ;;
    --branch=*) REPO_BRANCH="${arg#*=}" ;;
    --repo=*) REPO_URL="${arg#*=}" ;;
    -h|--help)
      cat <<HELP_EOF
Sonora Gameserver Manager — Debian Download & Setup Installer
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
echo "║        SONORA GAMESERVER MANAGER — DEBIAN DOWNLOAD & SETUP              ║"
echo "║  GitHub Auto-Download • Firewall (UFW) • DDoS-Schutz • Autostart        ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}${BOLD}Installationsumfang (Debian 11/12/13 & Ubuntu LTS):${NC}"
echo -e "  ✓ Automatischer Download & Einrichtung von: ${REPO_WEB_URL}"
echo -e "  ✓ Echte Prozesssteuerung (Minecraft Paper/Purpur/Fabric/Forge/Bedrock + 160+ Steam-Spiele)"
echo -e "  ✓ Datei-Manager, ZIP/Unzip, Server-Diagnose-Tool (Quick-Fix) & SFTP-Zugang (Port ${SFTP_PORT})"
echo -e "  ✓ Rechtesystem (Admin / Moderator / Kunde) & Kundenverwaltung (UserCP/CRM)"
echo -e "  ✓ UFW-Firewall mit automatischer Port-Freigabe bei Server-Erstellung & Port-Löschung beim Entfernen"
echo -e "  ✓ Mehrstufiger DDoS-Schutz: Kernel-Sysctl-Hardening, iptables Anti-Flood-Chain & Fail2ban"
echo -e "  ✓ systemd-Hintergrunddienst mit automatischem Boot-Autostart & Watchdog-Neustart"
echo ""

# 1. Root-Rechte prüfen
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Dieses Skript muss mit Root-Rechten ausgeführt werden!${NC}"
  echo -e "Bitte starte das Skript erneut mit: ${BOLD}sudo bash install.sh --start${NC}"
  exit 1
fi
echo -e "${GREEN}[1/11] Root-Rechte bestätigt (OS: $(grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d'"' -f2 || uname -s)).${NC}"

# 2. Debian/Ubuntu Paketlisten aktualisieren & Basistools + Firewall/DDoS-Pakete installieren
echo -e "${BLUE}[2/11] Aktualisiere Paketlisten und installiere Debian-Basiskomponenten, Git, Firewall & DDoS-Tools...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q || true
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections 2>/dev/null || true
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections 2>/dev/null || true
apt-get install -y -q \
  curl wget git unzip tar ca-certificates gnupg lsb-release \
  build-essential net-tools iproute2 sudo \
  ufw iptables iptables-persistent fail2ban || true

# 3. Repository-Download & Quellverzeichnis ermitteln (In-Place vs. GitHub-Auto-Download)
echo -e "${BLUE}[3/11] Prüfe Projektdateien / Lade Sonora Gameserver Manager von GitHub...${NC}"
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
echo -e "${BLUE}[4/11] Prüfe Java-Laufzeitumgebung (Java 21 LTS bis 25)...${NC}"
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
  echo -e "${YELLOW}Installiere OpenJDK 21 LTS für Minecraft Gameserver...${NC}"
  apt-get install -y -q openjdk-21-jre-headless openjdk-21-jdk-headless 2>/dev/null \
    || apt-get install -y -q default-jre-headless default-jdk-headless || true
  echo -e "${GREEN}✓ Java erfolgreich installiert ($(java -version 2>&1 | head -n 1 || echo 'bereit')).${NC}"
fi

# Portables JDK 25 Verzeichnis vorbereiten
mkdir -p "$RUNTIME_ROOT/jdks"
(cd "$SOURCE_DIR" && node -e 'import("./backend/java.ts").then(m=>m.ensureJdk(process.cwd()+"/.runtime/jdks",25)).catch(()=>{})') 2>/dev/null || true

# 5. Valve SteamCMD & 32-Bit Multiarch-Bibliotheken einrichten (Debian non-free & i386)
echo -e "${BLUE}[5/11] Prüfe Valve SteamCMD & 32-Bit Laufzeitbibliotheken...${NC}"
dpkg --add-architecture i386 2>/dev/null || true
if [ -f /etc/apt/sources.list ] && grep -qi "debian" /etc/os-release 2>/dev/null; then
  # Debian benötigt i386-Bibliotheken für SteamCMD
  apt-get update -y -q 2>/dev/null || true
else
  add-apt-repository -y multiverse 2>/dev/null || true
  apt-get update -y -q 2>/dev/null || true
fi
apt-get install -y -q lib32gcc-s1 lib32stdc++6 libsdl2-2.0-0 libc6-i386 zlib1g:i386 libstdc++6:i386 2>/dev/null || true

# Pre-seed steamcmd license agreement
echo steam steam/question select "I AGREE" | debconf-set-selections 2>/dev/null || true
echo steam steam/license note '' | debconf-set-selections 2>/dev/null || true
apt-get install -y -q steamcmd 2>/dev/null || true

# Standalone SteamCMD in /opt/steamcmd als robuster primärer Pfad für Debian
mkdir -p /opt/steamcmd
if [ ! -f /opt/steamcmd/steamcmd.sh ]; then
  echo -e "${YELLOW}Richte Valve SteamCMD in /opt/steamcmd ein...${NC}"
  curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar -zxvf - -C /opt/steamcmd/ 2>/dev/null || true
fi
chmod +x /opt/steamcmd/steamcmd.sh 2>/dev/null || true

# SteamCMD Wrapper in /usr/bin/steamcmd anlegen
if [ -f /usr/games/steamcmd ]; then
  ln -sf /usr/games/steamcmd /usr/bin/steamcmd
elif [ -f /opt/steamcmd/steamcmd.sh ]; then
  cat <<'WRAPPER_EOF' > /usr/bin/steamcmd
#!/usr/bin/env bash
exec /opt/steamcmd/steamcmd.sh "$@"
WRAPPER_EOF
  chmod +x /usr/bin/steamcmd
fi
echo -e "${GREEN}✓ SteamCMD einsatzbereit.${NC}"

# 6. Node.js (v22 LTS) & npm prüfen / installieren
echo -e "${BLUE}[6/11] Prüfe Node.js & npm...${NC}"
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
  echo -e "${YELLOW}Installiere modernes Node.js 22 LTS via NodeSource...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || true
  apt-get install -y -q nodejs || true
  echo -e "${GREEN}✓ Node.js $(node -v) und npm $(npm -v) erfolgreich installiert.${NC}"
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
chmod -R 755 "$SOURCE_DIR"

# 7. NPM Abhängigkeiten installieren & Production Build kompilieren
echo -e "${BLUE}[7/11] Installiere NPM-Abhängigkeiten und erstelle Production-Build...${NC}"
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

# 8. Debian Firewall (UFW) + automatische Port-Steuerung einrichten
echo -e "${BLUE}[8/11] Konfiguriere Debian UFW-Firewall & automatische Port-Freigabe...${NC}"
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

# 9. Mehrstufiger DDoS-Schutz: Kernel-Sysctl Hardening & iptables Anti-Flood Chain
echo -e "${BLUE}[9/11] Richte Kernel- & Netzwerk-DDoS-Schutz (sysctl + iptables) ein...${NC}"
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

# Größere Socket-Puffer für UDP-Gameserver (Minecraft Bedrock, Rust, Palworld, CS2)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
SYSCTL_EOF
  sysctl --system >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Kernel DDoS-Hardening (/etc/sysctl.d/99-sonora-ddos.conf) aktiviert.${NC}"

  # iptables Anti-Flood Chain (SONORA_DDOS)
  if command -v iptables &>/dev/null; then
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

    if command -v netfilter-persistent &>/dev/null; then
      netfilter-persistent save >/dev/null 2>&1 || true
    fi
    echo -e "${GREEN}✓ iptables Anti-DDoS Chain (SONORA_DDOS) installiert & persistent gespeichert.${NC}"
  fi

  # 10. Fail2ban gegen SSH- & Brute-Force-Angriffe konfigurieren
  echo -e "${BLUE}[10/11] Konfiguriere Fail2ban Intrusion-Prevention...${NC}"
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

# 11. systemd Service Unit mit Autostart einrichten (start-manager.sh)
echo -e "${BLUE}[11/11] Richte systemd Autostart-Dienst ein...${NC}"
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
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}
Environment=SFTP_PORT=${SFTP_PORT}
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

# Optionaler Sofortstart (Standard START=false; per --start aktivierbar)
if $START; then
  systemctl restart sonora-manager.service 2>/dev/null || true
fi

SERVER_IP=$(curl -s -m 4 https://ifconfig.me 2>/dev/null || curl -s -m 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || echo "127.0.0.1")

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✓ SONORA GAMESERVER MANAGER FÜR DEBIAN ERFOLGREICH INSTALLIERT!        ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  📦 ${BOLD}GitHub-Quelle:${NC}          ${REPO_WEB_URL} (${REPO_BRANCH})"
echo -e "  🌐 ${BOLD}Web-Panel aufrufen:${NC}     http://${SERVER_IP}:${PANEL_PORT}"
echo -e "  🔐 ${BOLD}SFTP-Server-Port:${NC}       ${SERVER_IP}:${SFTP_PORT}"
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
echo -e "${GREEN}Der Sonora Gameserver Manager ist einsatzbereit eingerichtet.${NC}"
