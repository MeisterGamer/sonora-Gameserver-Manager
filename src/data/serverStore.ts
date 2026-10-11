import type { ServerInstance, LogMessage, PlatformOS } from '../types/game';
import { minecraftLaunch, splitLaunchArguments } from './launchPlan.ts';
import { STEAM_INSTALLERS } from './installerSupport.ts';
import { MINECRAFT_SERVER_PROPERTIES_DEFAULT } from './minecraftTypes.ts';

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

// Exported launchers are saved inside data/servers/<id>/ and use the same MC plan as the backend.
export function generateOSScripts(server: ServerInstance) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const unavailable = '# No verified launcher for this engine/platform. Use the supported Linux adapter.\n';
  let linuxSh = '#!/usr/bin/env bash\n' + unavailable + 'exit 1\n';
  let windowsBat = '@echo off\r\necho No verified native Windows adapter.\r\nexit /b 1\r\n';
  let windowsPs1 = "throw 'No verified native Windows adapter.'\n";
  let macCommand = '#!/bin/sh\n' + unavailable + 'exit 1\n';
  const base = '#!/usr/bin/env bash\nset -euo pipefail\ncd -- "$(dirname -- "${BASH_SOURCE[0]}")"\n';
  try {
    if (server.category === 'minecraft') {
      const plan = minecraftLaunch(server), args = plan.args.map(quote).join(' ');
      linuxSh = base + '# Install this JDK through the manager before running this exported script.\n' +
        'ROOT="$(cd ../../.. && pwd -P)"\nexport JAVA_HOME="$ROOT/.runtime/jdks/jdk-' + plan.major + '"\n' +
        'export PATH="$JAVA_HOME/bin:$PATH"\n' +
        '[ -x "$JAVA_HOME/bin/java" ] || { echo "Selected JDK is not installed" >&2; exit 1; }\n' +
        '[ -s ' + quote(plan.jar) + ' ] || { echo "Server JAR is missing" >&2; exit 1; }\n' +
        'grep -Eq "^[[:space:]]*eula[[:space:]]*=[[:space:]]*true[[:space:]]*$" eula.txt || { echo "Accept the Minecraft EULA first" >&2; exit 1; }\n' +
        'exec "$JAVA_HOME/bin/java" ' + args + '\n';
      // JAVA_HOME must point at the selected, separately installed native Windows/macOS JDK.
      windowsBat = '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n' +
        'if not defined JAVA_HOME (echo Set JAVA_HOME to JDK ' + plan.major + ' & exit /b 1)\r\n' +
        'if not exist "%JAVA_HOME%\\bin\\java.exe" exit /b 1\r\n' +
        'if not exist "' + plan.jar + '" exit /b 1\r\n' +
        'findstr /r /x "eula=true" eula.txt >nul || exit /b 1\r\n' +
        '"%JAVA_HOME%\\bin\\java.exe" ' + plan.args.map(arg => '"' + arg + '"').join(' ') + '\r\nexit /b %errorlevel%\r\n';
      windowsPs1 = "Set-Location -LiteralPath $PSScriptRoot\nif (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK " + plan.major + "' }\n" +
        "if (-not (Select-String -LiteralPath 'eula.txt' -Pattern '^eula=true$' -Quiet)) { throw 'Accept EULA first' }\n" +
        "& (Join-Path $env:JAVA_HOME 'bin/java.exe') " + plan.args.map(arg => "'" + arg + "'").join(' ') + "\nexit $LASTEXITCODE\n";
      macCommand = '#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\n' +
        ': "${JAVA_HOME:?Set JAVA_HOME to JDK ' + plan.major + '}"\n' +
        'grep -Eq "^eula=true$" eula.txt || exit 1\nexec "$JAVA_HOME/bin/java" ' + args + '\n';
    } else if (STEAM_INSTALLERS[server.gameId] && server.linuxStartArgs) {
      const profile = STEAM_INSTALLERS[server.gameId];
      const args = splitLaunchArguments(server.linuxStartArgs).map(quote).join(' ');
      linuxSh = base + '[ -s ' + quote(profile.executable) + ' ] || { echo "Dedicated server files missing" >&2; exit 1; }\n';
      if (server.gameId === 'valheim') linuxSh += 'export SteamAppId=892970\nexport LD_LIBRARY_PATH="$PWD/linux64:${LD_LIBRARY_PATH:-}"\n';
      linuxSh += 'exec ' + quote('./' + profile.executable) + ' ' + args + (server.gameId === 'valheim' ? ' -savedir "$PWD/saves"' : '') + '\n';
    }
  } catch (error: any) {
    linuxSh = base + 'echo ' + quote(error.message) + ' >&2\nexit 1\n';
  }
  // No invented deployment path or Linux user. The caller supplies the real installation root.
  const root = server.installationRoot;
  const user = server.installationUser && /^[a-zA-Z0-9_-]+$/.test(server.installationUser) ? server.installationUser : undefined;
  const linuxSystemd = root && user && !/[\r\n%"\\]/.test(root) && /^[a-zA-Z0-9_-]+$/.test(server.id)
    ? '[Unit]\nDescription=Sonora game instance\nAfter=network.target\n[Service]\nType=simple\nUser=' + user + '\nWorkingDirectory=' + root + '/data/servers/' + server.id + '\nExecStart=/usr/bin/env bash "' + root + '/data/servers/' + server.id + '/start.sh"\nRestart=on-failure\nRestartSec=10\n# Configure User= for the owner of this installation before registering this standalone unit.\n# Do not start the same instance simultaneously through the manager.\n[Install]\nWantedBy=multi-user.target\n'
    : '# Installation directory is not known. Refresh the instance from the backend before exporting a unit.\n';
  const dockerfile = '# Docker deployment is not implemented for this installation.\n# No unverified Java image or runtime is generated.\n';
  return { linuxSh, windowsBat, windowsPs1, macCommand, linuxSystemd, dockerfile };
}
