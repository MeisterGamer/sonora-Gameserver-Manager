#!/usr/bin/env bash
# ==============================================================================
# Sonora Gameserver Manager — All-in-One Installer für Ubuntu & Debian
# Repository: https://github.com/MeisterGamer/sonora-Gameserver-Manager.git
# ==============================================================================

set -e

# Farben für Terminalausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║          SONORA GAMESERVER MANAGER — ALL-IN-ONE INSTALLER            ║"
echo "║     Vollständige automatische Einrichtung für Ubuntu & Debian        ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Root-Rechte prüfen
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Dieses Skript muss mit Root-Rechten ausgeführt werden!${NC}"
  echo -e "Bitte starte das Skript erneut mit: ${BOLD}sudo bash install.sh${NC}"
  exit 1
fi

echo -e "${GREEN}[1/8] Root-Rechte bestätigt.${NC}"

# 2. System-Paketlisten aktualisieren & Basistools installieren
echo -e "${BLUE}[2/8] Aktualisiere Paketlisten und installiere Basiskomponenten...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q curl wget git unzip tar ufw software-properties-common ca-certificates build-essential net-tools

# 3. Java 21 LTS prüfen / installieren (Essentiell für Minecraft 1.20.5 - 26.x)
echo -e "${BLUE}[3/8] Prüfe Java-Laufzeitumgebung (Java 21 LTS)...${NC}"
NEED_JAVA=true
if command -v java &>/dev/null; then
  JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}')
  echo -e "${CYAN}Gefundenes Java:${NC} $JAVA_VER"
  if [[ "$JAVA_VER" == 21* || "$JAVA_VER" == 22* || "$JAVA_VER" == 23* || "$JAVA_VER" == 24* || "$JAVA_VER" == 25* ]]; then
    echo -e "${GREEN}✓ Kompatibles modernes Java ($JAVA_VER) ist bereits installiert.${NC}"
    NEED_JAVA=false
  fi
fi

if [ "$NEED_JAVA" = true ]; then
  echo -e "${YELLOW}Installiere OpenJDK 21 LTS für Minecraft Gameserver...${NC}"
  apt-get install -y -q openjdk-21-jre-headless openjdk-21-jdk-headless
  echo -e "${GREEN}✓ Java 21 erfolgreich installiert ($(java -version 2>&1 | head -n 1)).${NC}"
fi

# 4. SteamCMD & 32-Bit Bibliotheken prüfen / installieren (Essentiell für Palworld, Rust, CS2, Valheim etc.)
echo -e "${BLUE}[4/9] Prüfe Valve SteamCMD & System-Laufzeitbibliotheken...${NC}"
dpkg --add-architecture i386 || true
apt-get update -y -q
apt-get install -y -q lib32gcc-s1 lib32stdc++6 libsdl2-2.0-0 || true

# Pre-seed steamcmd license agreement
echo steam steam/question select "I AGREE" | debconf-set-selections || true
echo steam steam/license note '' | debconf-set-selections || true
apt-get install -y -q steamcmd || true

if [ -f /usr/games/steamcmd ] && [ ! -f /usr/bin/steamcmd ]; then
  ln -s /usr/games/steamcmd /usr/bin/steamcmd
fi

# Standalone SteamCMD in /opt/steamcmd als stabiler Fallback
mkdir -p /opt/steamcmd
if [ ! -f /opt/steamcmd/steamcmd.sh ]; then
  echo -e "${YELLOW}Richte SteamCMD Portable in /opt/steamcmd ein...${NC}"
  curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar -zxvf - -C /opt/steamcmd/ || true
  chmod +x /opt/steamcmd/steamcmd.sh 2>/dev/null || true
fi
echo -e "${GREEN}✓ SteamCMD einsatzbereit für automatische Steam-Gameserver Downloads.${NC}"

# 5. Node.js (v22 LTS) & npm prüfen / installieren
echo -e "${BLUE}[5/9] Prüfe Node.js & npm...${NC}"
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
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
  echo -e "${GREEN}✓ Node.js $(node -v) und npm $(npm -v) erfolgreich installiert.${NC}"
fi

# 6. Repository prüfen bzw. klonen
echo -e "${BLUE}[6/9] Richte Sonora Gameserver Manager Projekt ein...${NC}"
REPO_URL="https://github.com/MeisterGamer/sonora-Gameserver-Manager.git"

if [ -f "./package.json" ] && [ -f "./server.ts" ]; then
  INSTALL_DIR="$(pwd)"
  echo -e "${GREEN}✓ Skript wurde im Projektverzeichnis ausgeführt: ${INSTALL_DIR}${NC}"
else
  INSTALL_DIR="/opt/sonora-manager"
  if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}Bestehendes Verzeichnis in ${INSTALL_DIR} gefunden. Aktualisiere mit git pull...${NC}"
    cd "$INSTALL_DIR"
    git reset --hard HEAD
    git pull
  else
    echo -e "${YELLOW}Klone Repository von GitHub in ${INSTALL_DIR}...${NC}"
    mkdir -p "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
fi

# Verzeichnisse für Gameserver und Logs anlegen
mkdir -p "$INSTALL_DIR/data/servers"

# 7. NPM Abhängigkeiten installieren & Production Build kompilieren
echo -e "${BLUE}[7/9] Installiere NPM-Abhängigkeiten und erstelle Production-Build...${NC}"
cd "$INSTALL_DIR"

# npm install mit legacy-peer-deps ausführen, um peer-Konflikte auszuschließen
npm install --legacy-peer-deps

echo -e "${YELLOW}Kompiliere Frontend-Assets (Vite Build)...${NC}"
npm run build
echo -e "${GREEN}✓ Production-Build erfolgreich erstellt.${NC}"

# 8. Firewall (UFW) Ports freischalten
echo -e "${BLUE}[8/9] Konfiguriere Firewall (UFW Ports für Panel, Minecraft & Steam)...${NC}"
if command -v ufw &>/dev/null; then
  ufw allow 3000/tcp comment 'Sonora Manager Web Panel' >/dev/null 2>&1 || true
  ufw allow 25565/tcp comment 'Minecraft Server Port TCP' >/dev/null 2>&1 || true
  ufw allow 25565/udp comment 'Minecraft Server Port UDP' >/dev/null 2>&1 || true
  ufw allow 8211/udp comment 'Palworld Dedicated Port' >/dev/null 2>&1 || true
  ufw allow 28015/tcp comment 'Rust Server Port TCP' >/dev/null 2>&1 || true
  ufw allow 28015/udp comment 'Rust Server Port UDP' >/dev/null 2>&1 || true
  ufw allow 28016/tcp comment 'Rust RCON Port' >/dev/null 2>&1 || true
  ufw allow 2456:2457/udp comment 'Valheim Server Ports' >/dev/null 2>&1 || true
  ufw allow 27015/udp comment 'Steam Master Server Query' >/dev/null 2>&1 || true
  ufw allow 2022/tcp comment 'SFTP Daemon Port' >/dev/null 2>&1 || true
  if ufw status | grep -q "Status: active"; then
    ufw reload >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ UFW Ports 3000 (Panel), 25565 (Minecraft), 8211 (Palworld), 28015 (Rust) und 2022 (SFTP) freigegeben.${NC}"
  else
    echo -e "${YELLOW}ℹ UFW Firewall ist inaktiv (alle Ports bereits offen).${NC}"
  fi
fi

# 9. systemd Service Unit einrichten (Automatischer Start beim Booten)
echo -e "${BLUE}[9/9] Richte systemd Hintergrunddienst ein...${NC}"

SERVICE_FILE="/etc/systemd/system/sonora-manager.service"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Sonora Gameserver Manager & Daemon
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(which npx) tsx server.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sonora-manager.service
systemctl restart sonora-manager.service

# Kurzer Health-Check
sleep 3
SERVER_IP=$(curl -s -m 4 https://ifconfig.me 2>/dev/null || curl -s -m 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✓ INSTALLATION ERFOLGREICH ABGESCHLOSSEN!                          ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 ${BOLD}Web-Panel aufrufen:${NC}     http://${SERVER_IP}:3000"
echo -e "  🎮 ${BOLD}Minecraft Gameserver:${NC}   ${SERVER_IP}:25565"
echo -e "  🚀 ${BOLD}Steam Dedicated Server:${NC} Aktiv (Palworld, Rust, CS2, Valheim etc.)"
echo -e "  ☕ ${BOLD}Installiertes Java:${NC}     $(java -version 2>&1 | head -n 1)"
echo -e "  ⚡ ${BOLD}Node.js Version:${NC}        $(node -v)"
echo -e "  📂 ${BOLD}Installationspfad:${NC}      ${INSTALL_DIR}"
echo -e "  📁 ${BOLD}Server-Dateien & Logs:${NC}  ${INSTALL_DIR}/data/servers/"
echo ""
echo -e "${CYAN}${BOLD}Nützliche Service-Befehle:${NC}"
echo -e "  • Status prüfen:       ${BOLD}systemctl status sonora-manager${NC}"
echo -e "  • Live-Logs ansehen:   ${BOLD}journalctl -u sonora-manager -f${NC}"
echo -e "  • Manager neustarten:  ${BOLD}systemctl restart sonora-manager${NC}"
echo -e "  • Manager stoppen:     ${BOLD}systemctl stop sonora-manager${NC}"
echo -e "  • Minecraft Live-Logs: ${BOLD}tail -f ${INSTALL_DIR}/data/servers/srv_paper_smp/logs/latest.log${NC}"
echo ""
echo -e "${GREEN}Der Sonora Gameserver Manager läuft nun im Hintergrund und startet automatisch beim Server-Neustart!${NC}"
echo ""
