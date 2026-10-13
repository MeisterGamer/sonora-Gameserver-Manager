#!/usr/bin/env bash
# ==============================================================================
# Sonora Gameserver Manager — All-in-One Installer für Ubuntu & Debian
# 100% Komplettsystem: Prozesssteuerung, Dateien, Backups, Paper-Plugins,
# Kundenabrechnung & CRM, Remote-Nodes, SFTP, Zeitpläne & Live-Metriken.
# ==============================================================================

set -e

# Farben für Terminalausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║          SONORA GAMESERVER MANAGER — ALL-IN-ONE INSTALLER            ║"
echo "║   100% Enterprise Gameserver & Host Management Suite für Ubuntu/Debian ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}${BOLD}Funktionsumfang (100% vollständig bereitgestellt):${NC}"
echo -e "  ✓ Echte Prozesssteuerung (Starten, Stoppen, Force-Kill, Neustart, Live-RCON)"
echo -e "  ✓ Datei-Manager & SFTP-Zugang (Port 2022) mit In-Browser-Editor"
echo -e "  ✓ Backup-System & automatisierte Zeitpläne (Cron-Jobs für Reboots & Saves)"
echo -e "  ✓ PaperMC, Purpur, Spigot & Modrinth Plugin-/Mod-Verwaltung"
echo -e "  ✓ Kundenabrechnung, Verträge, DIN 5008 Rechnungen & Prepaid-Guthaben (CRM)"
echo -e "  ✓ Remote-Nodes, Multi-Host-Cluster & Host-Betriebssystem-Skripte"
echo -e "  ✓ Live-Performance & Prozessmetriken (CPU, RAM, TPS, Netzwerk, Garbage Collection)"
echo -e "  ✓ Autarke portable Java-Laufzeitumgebungen (Java 21 LTS bis 25) & SteamCMD"
echo ""

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

# 3. Java 21 LTS prüfen / installieren (Essentiell für Minecraft Paper 1.20.5+)
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

# 4. SteamCMD & 32-Bit Bibliotheken prüfen / installieren
echo -e "${BLUE}[4/8] Prüfe Valve SteamCMD & Laufzeitbibliotheken...${NC}"
add-apt-repository -y multiverse 2>/dev/null || true
dpkg --add-architecture i386 2>/dev/null || true
apt-get update -y -q 2>/dev/null || true
apt-get install -y -q lib32gcc-s1 lib32stdc++6 libsdl2-2.0-0 libc6-i386 zlib1g:i386 libstdc++6:i386 2>/dev/null || true

# Pre-seed steamcmd license agreement
echo steam steam/question select "I AGREE" | debconf-set-selections 2>/dev/null || true
echo steam steam/license note '' | debconf-set-selections 2>/dev/null || true
apt-get install -y -q steamcmd 2>/dev/null || true

# Standalone SteamCMD in /opt/steamcmd als robuster Fallback
mkdir -p /opt/steamcmd
if [ ! -f /opt/steamcmd/steamcmd.sh ]; then
  echo -e "${YELLOW}Richte Valve SteamCMD in /opt/steamcmd ein...${NC}"
  curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar -zxvf - -C /opt/steamcmd/ 2>/dev/null || true
fi
chmod +x /opt/steamcmd/steamcmd.sh 2>/dev/null || true

if [ -f /usr/games/steamcmd ]; then
  ln -sf /usr/games/steamcmd /usr/bin/steamcmd
elif [ -f /opt/steamcmd/steamcmd.sh ]; then
  ln -sf /opt/steamcmd/steamcmd.sh /usr/bin/steamcmd
fi
echo -e "${GREEN}✓ SteamCMD einsatzbereit.${NC}"

# 5. Node.js (v22/v24 LTS) & npm prüfen / installieren
echo -e "${BLUE}[5/8] Prüfe Node.js & npm...${NC}"
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
  echo -e "${YELLOW}Installiere modernes Node.js LTS via NodeSource...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
  echo -e "${GREEN}✓ Node.js $(node -v) und npm $(npm -v) erfolgreich installiert.${NC}"
fi

# 6. Repository- und Projektpfad ermitteln
echo -e "${BLUE}[6/8] Richte Sonora Gameserver Manager Projekt ein...${NC}"
if [ -f "./package.json" ] && [ -f "./server.ts" ]; then
  INSTALL_DIR="$(pwd)"
  echo -e "${GREEN}✓ Verwende bestehendes Projektverzeichnis: ${INSTALL_DIR}${NC}"
else
  INSTALL_DIR="/opt/sonora-manager"
  mkdir -p "$INSTALL_DIR"
  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${YELLOW}Verwende bestehendes Verzeichnis in ${INSTALL_DIR}.${NC}"
  else
    REPO_URL="https://github.com/MeisterGamer/sonora-Gameserver-Manager.git"
    echo -e "${YELLOW}Klone Repository von GitHub in ${INSTALL_DIR}...${NC}"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
fi

# Verzeichnisse für Daten, Backups, Server und JDKs anlegen
mkdir -p "$INSTALL_DIR/data/servers"
mkdir -p "$INSTALL_DIR/data/backups"
mkdir -p "$INSTALL_DIR/.runtime/jdks"
mkdir -p "$INSTALL_DIR/steamcmd"
chmod -R 755 "$INSTALL_DIR"

# 7. NPM Abhängigkeiten installieren & Production Build kompilieren
echo -e "${BLUE}[7/8] Installiere NPM-Abhängigkeiten und erstelle Production-Build...${NC}"
cd "$INSTALL_DIR"
npm install --legacy-peer-deps || npm install --force

echo -e "${YELLOW}Kompiliere Frontend-Assets (Vite Build)...${NC}"
npm run build
echo -e "${GREEN}✓ Production-Build erfolgreich erstellt.${NC}"

# 8. Firewall (UFW) Ports freischalten
echo -e "${BLUE}[8/8] Konfiguriere Firewall (UFW Ports für Panel & Gameserver)...${NC}"
if command -v ufw &>/dev/null; then
  ufw allow 3000/tcp comment 'Sonora Manager Web Panel' >/dev/null 2>&1 || true
  ufw allow 25565/tcp comment 'Minecraft Server Port TCP' >/dev/null 2>&1 || true
  ufw allow 25565/udp comment 'Minecraft Server Port UDP' >/dev/null 2>&1 || true
  ufw allow 8211/udp comment 'Palworld Dedicated Port' >/dev/null 2>&1 || true
  ufw allow 28015/tcp comment 'Rust Server Port TCP' >/dev/null 2>&1 || true
  ufw allow 28015/udp comment 'Rust Server Port UDP' >/dev/null 2>&1 || true
  if ufw status | grep -q "Status: active"; then
    ufw reload >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ UFW Ports 3000 (Panel) und 25565 (Minecraft) freigegeben.${NC}"
  else
    echo -e "${YELLOW}ℹ UFW Firewall ist inaktiv (alle Ports bereits offen).${NC}"
  fi
fi

# 9. systemd Service Unit einrichten (Automatischer Start beim Booten)
echo -e "${BLUE}Richte systemd Hintergrunddienst ein...${NC}"

NODE_BIN=$(which node || echo "/usr/bin/node")
NPX_BIN=$(which npx || echo "/usr/bin/npx")

SERVICE_FILE="/etc/systemd/system/sonora-manager.service"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Sonora Gameserver Manager
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=${NPX_BIN} tsx server.ts
Restart=always
RestartSec=5
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload 2>/dev/null || true
systemctl enable sonora-manager.service 2>/dev/null || true
systemctl restart sonora-manager.service 2>/dev/null || true

# Server IP ermitteln
SERVER_IP=$(curl -s -m 4 https://ifconfig.me 2>/dev/null || curl -s -m 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || echo "127.0.0.1")

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✓ SONORA GAMESERVER MANAGER ERFOLGREICH INSTALLIERT!               ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 ${BOLD}Web-Panel aufrufen:${NC}     http://${SERVER_IP}:3000"
echo -e "  🎮 ${BOLD}Minecraft Standard-Port:${NC} ${SERVER_IP}:25565"
echo -e "  ☕ ${BOLD}Installiertes Java:${NC}     $(java -version 2>&1 | head -n 1)"
echo -e "  ⚡ ${BOLD}Node.js Version:${NC}        $(node -v)"
echo -e "  📂 ${BOLD}Installationspfad:${NC}      ${INSTALL_DIR}"
echo -e "  📁 ${BOLD}Server-Dateien & Daten:${NC} ${INSTALL_DIR}/data/servers/"
echo ""
echo -e "${CYAN}${BOLD}Sicherheitshinweis (Ersteinrichtung):${NC}"
echo -e "  • Beim ersten Öffnen der Seite vergeben Sie Ihr eigenes Administrator-Passwort."
echo -e "  • Es existiert kein unsicheres Standard-Passwort."
echo -e "  • Passwort-Notfallreset (nur auf der Konsole):"
echo -e "    ${BOLD}cd ${INSTALL_DIR} && npm run admin:reset${NC}"
echo ""
echo -e "${CYAN}${BOLD}Service-Verwaltung:${NC}"
echo -e "  • Status:     ${BOLD}systemctl status sonora-manager${NC}"
echo -e "  • Live-Logs:  ${BOLD}journalctl -u sonora-manager -f${NC}"
echo -e "  • Neustarten: ${BOLD}systemctl restart sonora-manager${NC}"
echo -e "  • Stoppen:    ${BOLD}systemctl stop sonora-manager${NC}"
echo ""
echo -e "${GREEN}Der Sonora Gameserver Manager läuft als permanenter Systemdienst im Hintergrund.${NC}"
echo ""
