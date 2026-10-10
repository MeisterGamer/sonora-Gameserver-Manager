import { ServerInstance, LogMessage, PlatformOS } from '../types/game';
import { MINECRAFT_SERVER_PROPERTIES_DEFAULT } from './minecraftTypes';

const SERVERS_STORAGE_KEY = 'apexhost_servers_data';

export const INITIAL_SERVERS: ServerInstance[] = [
  {
    id: 'srv_paper_smp',
    name: 'Survival SMP Season 4',
    gameId: 'mc_paper',
    gameName: 'Minecraft (PaperMC)',
    category: 'minecraft',
    status: 'running',
    allocatedRamGb: 8,
    port: 25565,
    queryPort: 25565,
    rconPort: 25575,
    targetOS: 'linux',
    autoRestart: true,
    version: '26.3',
    javaVersion: 'Java 21',
    minecraftType: 'paper',
    uptimeSeconds: 14820,
    cpuUsagePercent: 14.2,
    ramUsageMb: 4120,
    maxRamMb: 8192,
    diskUsageMb: 1240,
    networkInKb: 48.2,
    networkOutKb: 132.5,
    currentPlayers: 7,
    maxPlayers: 20,
    tps: 19.98,
    installedMods: [
      {
        id: 'inst_1',
        modId: 'luckperms',
        name: 'LuckPerms',
        version: '5.4.140',
        enabled: true,
        installedAt: '2026-10-08',
        source: 'SpigotMC',
        fileSize: '1.9 MB'
      },
      {
        id: 'inst_2',
        modId: 'essentialsx',
        name: 'EssentialsX',
        version: '2.20.1',
        enabled: true,
        installedAt: '2026-10-08',
        source: 'SpigotMC',
        fileSize: '3.4 MB'
      },
      {
        id: 'inst_3',
        modId: 'coreprotect',
        name: 'CoreProtect',
        version: '22.4',
        enabled: true,
        installedAt: '2026-10-09',
        source: 'SpigotMC',
        fileSize: '2.2 MB'
      },
      {
        id: 'inst_4',
        modId: 'dynmap',
        name: 'Dynmap',
        version: '3.7-beta',
        enabled: true,
        installedAt: '2026-10-09',
        source: 'SpigotMC',
        fileSize: '15.4 MB'
      }
    ],
    configFiles: {
      'server.properties': MINECRAFT_SERVER_PROPERTIES_DEFAULT,
      'eula.txt': 'eula=true'
    },
    createdAt: '2026-10-08T10:00:00Z'
  },
  {
    id: 'srv_palworld_prime',
    name: 'Palworld Official Co-op',
    gameId: 'palworld',
    gameName: 'Palworld',
    category: 'survival',
    status: 'running',
    allocatedRamGb: 16,
    port: 8211,
    queryPort: 27015,
    rconPort: 25575,
    targetOS: 'windows',
    autoRestart: true,
    version: 'v0.3.8',
    uptimeSeconds: 8340,
    cpuUsagePercent: 28.6,
    ramUsageMb: 9450,
    maxRamMb: 16384,
    diskUsageMb: 8400,
    networkInKb: 112.4,
    networkOutKb: 245.8,
    currentPlayers: 12,
    maxPlayers: 32,
    tps: 60.0,
    installedMods: [
      {
        id: 'inst_5',
        modId: 'palworld_mod_framework',
        name: 'Palworld Modding Framework',
        version: '3.0.1',
        enabled: true,
        installedAt: '2026-10-09',
        source: 'GitHub',
        fileSize: '8.4 MB'
      }
    ],
    configFiles: {
      'PalWorldSettings.ini': `[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.500000,PalCaptureRate=1.200000,ServerPlayerMaxNum=32,ServerName="Official Palworld ApexHost",PublicPort=8211)`
    },
    createdAt: '2026-10-09T14:30:00Z'
  },
  {
    id: 'srv_rust_pvp',
    name: 'Rust 2x Vanilla+ Wipe Friday',
    gameId: 'rust',
    gameName: 'Rust',
    category: 'survival',
    status: 'offline',
    allocatedRamGb: 16,
    port: 28015,
    queryPort: 28016,
    rconPort: 28016,
    targetOS: 'linux',
    autoRestart: false,
    version: 'Latest Branch',
    uptimeSeconds: 0,
    cpuUsagePercent: 0,
    ramUsageMb: 0,
    maxRamMb: 16384,
    diskUsageMb: 14200,
    networkInKb: 0,
    networkOutKb: 0,
    currentPlayers: 0,
    maxPlayers: 100,
    tps: 30.0,
    installedMods: [
      {
        id: 'inst_6',
        modId: 'rust_nteleportation',
        name: 'NTeleportation',
        version: '1.8.2',
        enabled: true,
        installedAt: '2026-10-10',
        source: 'uMod',
        fileSize: '68 KB'
      },
      {
        id: 'inst_7',
        modId: 'rust_gathermanager',
        name: 'GatherManager',
        version: '2.2.75',
        enabled: true,
        installedAt: '2026-10-10',
        source: 'uMod',
        fileSize: '24 KB'
      }
    ],
    configFiles: {
      'server.cfg': `server.hostname "Rust 2x Vanilla+ [Bi-Weekly Wipe]"
server.maxplayers 100
server.worldsize 4000
server.seed 491823`
    },
    createdAt: '2026-10-10T08:00:00Z'
  }
];

export function getStoredServers(): ServerInstance[] {
  try {
    const raw = localStorage.getItem(SERVERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(INITIAL_SERVERS));
      return INITIAL_SERVERS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load servers', err);
    return INITIAL_SERVERS;
  }
}

export function saveStoredServers(servers: ServerInstance[]): void {
  localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
}

// OS Script Generator for Windows, Linux, and macOS
export function generateOSScripts(server: ServerInstance) {
  const isMc = server.category === 'minecraft';
  const ramG = server.allocatedRamGb;
  
  // Windows: .bat & PowerShell
  const windowsBat = isMc
    ? `@echo off
TITLE ${server.name} - ApexHost
echo [ApexHost] Starting ${server.name} on Windows (NodeJS 24 Managed)...
echo [Java] Using ${server.javaVersion || 'Java 21'} with ${ramG}GB RAM allocation
java -Xms${Math.floor(ramG/2)}G -Xmx${ramG}G -XX:+UseG1GC -jar server.jar --nogui
echo [ApexHost] Server stopped.
pause`
    : `@echo off
TITLE ${server.name} - ApexHost
echo [ApexHost] Starting Steam Dedicated Server for ${server.gameName}...
${server.gameId}.exe -port=${server.port} -players=${server.maxPlayers} -batchmode
pause`;

  const windowsPs1 = isMc
    ? `# ApexHost PowerShell Startup Script for Windows
Write-Host ">>> Initializing ${server.name} with NodeJS 24 Runner" -ForegroundColor Cyan
& java -Xms${Math.floor(ramG/2)}G -Xmx${ramG}G -jar server.jar --nogui`
    : `# ApexHost PowerShell Startup Script for Windows
Write-Host ">>> Starting ${server.gameName} Dedicated Server" -ForegroundColor Green
Start-Process -FilePath ".\\${server.gameId}.exe" -ArgumentList "-port=${server.port}" -NoNewWindow -Wait`;

  // Linux: bash script & systemd unit
  const linuxSh = isMc
    ? `#!/usr/bin/env bash
# ApexHost Game Server Runner (Linux / POSIX)
# Node.js 24 Runtime Environment
set -euo pipefail
echo "==> Starting ${server.name} (Port: ${server.port}, RAM: ${ramG}G) <=="
exec java -Xms${Math.floor(ramG/2)}G -Xmx${ramG}G \\
  -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 \\
  -jar server.jar --nogui`
    : `#!/usr/bin/env bash
# ApexHost Steam Dedicated Server Launcher
set -euo pipefail
echo "==> Starting ${server.gameName} Dedicated Server on Linux <=="
export LD_LIBRARY_PATH=".:\${LD_LIBRARY_PATH:-}"
exec ./${server.gameId}_server -port=${server.port} -maxplayers=${server.maxPlayers}`;

  const linuxSystemd = `[Unit]
Description=ApexHost Dedicated Server - ${server.name}
After=network.target

[Service]
Type=simple
User=gameserver
WorkingDirectory=/opt/apexhost/servers/${server.id}
ExecStart=/opt/apexhost/servers/${server.id}/start.sh
Restart=on-failure
RestartSec=10s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target`;

  // macOS: .command terminal script
  const macCommand = isMc
    ? `#!/bin/zsh
# ApexHost macOS Darwin Launcher (Apple Silicon / Intel)
echo "[ApexHost] Launching ${server.name} on macOS..."
cd "$(dirname "$0")"
java -Xms${Math.floor(ramG/2)}G -Xmx${ramG}G -jar server.jar --nogui`
    : `#!/bin/zsh
# ApexHost macOS Dedicated Launcher
echo "[ApexHost] Launching ${server.gameName} on macOS..."
cd "$(dirname "$0")"
./start.sh`;

  // Dockerfile
  const dockerfile = isMc
    ? `FROM eclipse-temurin:21-jre-alpine
LABEL maintainer="ApexHost Manager"
WORKDIR /data
EXPOSE ${server.port} ${server.rconPort || 25575}
COPY . /data
CMD ["java", "-Xms${Math.floor(ramG/2)}G", "-Xmx${ramG}G", "-XX:+UseG1GC", "-jar", "server.jar", "--nogui"]`
    : `FROM cm2network/steamcmd:root
LABEL maintainer="ApexHost Steam Server"
WORKDIR /server
EXPOSE ${server.port} ${server.queryPort}
COPY . /server
CMD ["./start.sh"]`;

  return {
    windowsBat,
    windowsPs1,
    linuxSh,
    linuxSystemd,
    macCommand,
    dockerfile
  };
}
