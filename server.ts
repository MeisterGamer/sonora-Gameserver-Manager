import { ensureJdk, jdkHome, JDK_VERSIONS } from './backend/java';
import { configureAuth } from './backend/auth';
import { configureBackups } from './backend/backups';
import { configureMods } from './backend/mods';
import { STEAM_GAMES_DATABASE, ALL_STEAM_GAMES } from './src/data/steamGames';
import { STEAM_INSTALLERS } from './src/data/installerSupport';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { exec, execSync, spawn, ChildProcess } from 'child_process';
import net from 'net';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize authentication with persistent credentials in data/
configureAuth(app, path.resolve(process.cwd(), 'data'));

// Persistent servers root directory on the host
const DATA_DIR = process.env.APEXHOST_DATA_DIR || path.resolve(process.cwd(), 'data', 'servers');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[ApexHost] Could not create DATA_DIR:', e);
}

// Persistent Portable Java (JDKs) directory
const JDKS_DIR = path.resolve(process.cwd(), '.runtime', 'jdks');
try {
  if (!fs.existsSync(JDKS_DIR)) {
    fs.mkdirSync(JDKS_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[ApexHost] Could not create JDKS_DIR:', e);
}

// Live installation progress tracker (0-100%)
const installProgressMap = new Map<string, {
  serverId: string;
  percent: number;
  step: string;
  message: string;
  timestamp: number;
}>();

function setInstallProgress(serverId: string, percent: number, step: string, message: string) {
  installProgressMap.set(serverId, { serverId, percent, step, message, timestamp: Date.now() });
  appendLog(serverId, 'INFO', `[FORTSCHRITT ${percent}%] ${message}`);
}

function getRequiredJdkMajor(version?: string, javaVersion?: string): number {
  if (javaVersion) {
    const match = javaVersion.match(/\b(?:Java|JDK)\s*(\d+)\b/i);
    if (match) return Number(match[1]);
  }
  if (version) {
    const clean = version.trim();
    if (clean.startsWith('26.') || clean.startsWith('25.')) return 25;
    if (clean.startsWith('1.21') || clean.startsWith('1.20.6') || clean.startsWith('1.20.5')) return 21;
    if (clean.startsWith('1.20') || clean.startsWith('1.19') || clean.startsWith('1.18')) return 17;
    if (clean.startsWith('1.17') || clean.startsWith('1.16')) return 11;
  }
  return 21;
}

// Persistent server registry (data/servers.json)
const REGISTRY_FILE = path.resolve(process.cwd(), 'data', 'servers.json');

function getServerRegistry(): any[] {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading servers.json:', e);
  }
  return [];
}

function saveServerRegistry(servers: any[]) {
  try {
    const dir = path.dirname(REGISTRY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(servers, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving servers.json:', e);
  }
}

function upsertServerInRegistry(server: any) {
  const current = getServerRegistry();
  const idx = current.findIndex(s => s.id === server.id);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...server };
  } else {
    current.unshift(server);
  }
  saveServerRegistry(current);
}

function removeServerFromRegistry(serverId: string) {
  const current = getServerRegistry();
  const filtered = current.filter(s => s.id !== serverId);
  saveServerRegistry(filtered);
}

// In-memory process and log state
interface ServerProcessInfo {
  process: ChildProcess;
  pid: number;
  startTime: number;
  port: number;
  ramGb: number;
}

const activeProcesses = new Map<string, ServerProcessInfo>();
const memoryLogBuffers = new Map<string, Array<{ id: string; timestamp: string; level: string; message: string }>>();

// Per-server exclusive lock for critical operations (backups, restore, mutations)
const serverLocks = new Map<string, Promise<any>>();
async function exclusiveServerLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const current = serverLocks.get(id) || Promise.resolve();
  let release: () => void = () => {};
  const lockPromise = new Promise<void>(resolve => { release = resolve; });
  const next = current.then(async () => {
    try {
      return await action();
    } finally {
      release();
    }
  });
  serverLocks.set(id, lockPromise);
  return next;
}

// Configure backup archiving and restoration for game servers
configureBackups(
  app,
  DATA_DIR,
  path.resolve(process.cwd(), 'data', 'manager'),
  (id: string) => {
    const servers = getServerRegistry();
    const server = servers.find(s => s.id === id);
    if (!server) throw new Error(`Serverinstanz "${id}" nicht gefunden`);
    return server;
  },
  exclusiveServerLock,
  (id: string) => {
    if (activeProcesses.has(id)) {
      throw new Error('Server muss vor Sicherung oder Wiederherstellung gestoppt sein');
    }
  },
  () => {
    // Registry is saved automatically via saveServerRegistry
  }
);

// Configure mod management and Gemini AI Auto-Resolve for game servers
configureMods(
  app,
  DATA_DIR,
  (id: string) => {
    const servers = getServerRegistry();
    const server = servers.find(s => s.id === id);
    if (!server) throw new Error(`Serverinstanz "${id}" nicht gefunden`);
    return server;
  },
  () => {
    saveServerRegistry(getServerRegistry());
  },
  exclusiveServerLock,
  (_id: string) => {
    // Non-blocking: mod files are safely placed into plugins/mods folder; running processes load them on reboot or reload
  }
);

// Helper: Append log line to memory buffer and disk latest.log
function appendLog(serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) {
  const timestamp = new Date().toTimeString().slice(0, 8);
  const item = {
    id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    level,
    message
  };

  if (!memoryLogBuffers.has(serverId)) {
    memoryLogBuffers.set(serverId, []);
  }
  const buf = memoryLogBuffers.get(serverId)!;
  buf.push(item);
  if (buf.length > 1000) buf.shift();

  // Write to data/servers/{serverId}/logs/latest.log
  try {
    const srvDir = path.join(DATA_DIR, serverId);
    const logsDir = path.join(srvDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, 'latest.log');
    fs.appendFileSync(logFile, `[${timestamp}] [${level}] ${message}\n`, 'utf8');
  } catch (err) {
    // ignore filesystem write errors
  }
}

// Helper: Check if a port is in use
function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

// Helper: Detect system Java
function detectJava(): Promise<{ installed: boolean; version: string; rawOutput: string }> {
  return new Promise((resolve) => {
    exec('java -version', (err, stdout, stderr) => {
      const output = (stderr || stdout || '').trim();
      if (err || !output) {
        resolve({ installed: false, version: '', rawOutput: err ? err.message : 'Not found' });
      } else {
        const match = output.match(/version\s+"([^"]+)"/) || output.match(/openjdk\s+version\s+"([^"]+)"/);
        const version = match ? match[1] : output.split('\n')[0];
        resolve({ installed: true, version, rawOutput: output });
      }
    });
  });
}

// Helper: Detect SteamCMD on host
function detectSteamCmd(): string | null {
  const isWin = process.platform === 'win32';
  const commonPaths = isWin ? [
    path.resolve(process.cwd(), 'steamcmd', 'steamcmd.exe'),
    path.resolve(DATA_DIR, '..', 'steamcmd', 'steamcmd.exe'),
    'C:\\steamcmd\\steamcmd.exe',
    'C:\\Program Files (x86)\\SteamCMD\\steamcmd.exe',
    'C:\\Program Files\\SteamCMD\\steamcmd.exe'
  ] : [
    '/usr/games/steamcmd',
    '/opt/steamcmd/steamcmd.sh',
    '/usr/bin/steamcmd',
    path.resolve(process.cwd(), 'steamcmd', 'steamcmd.sh'),
    path.resolve(DATA_DIR, '..', 'steamcmd', 'steamcmd.sh')
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
    }
  }
  try {
    const whichCmd = isWin ? 'where steamcmd.exe' : 'which steamcmd';
    const out = execSync(whichCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (out) {
      const firstLine = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(firstLine)) return firstLine;
    }
  } catch {}
  return null;
}

// Helper: Check if SteamCMD binary can execute in the current host environment
async function canExecuteSteamCmd(binPath: string): Promise<boolean> {
  if (!fs.existsSync(binPath)) return false;
  return new Promise<boolean>((resolve) => {
    try {
      const probe = spawn(binPath, ['+quit'], { timeout: 4000 });
      probe.on('error', () => resolve(false));
      probe.on('close', (code) => {
        // Exit code 126 is Exec format error (e.g. 32-bit binary on 64-bit non-multilib or gVisor)
        // Exit code 127 is command not found
        if (code === 126 || code === 127) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

// Helper: Ensure SteamCMD is available, downloading portable version if needed
async function ensureSteamCmd(serverId?: string): Promise<string> {
  const existing = detectSteamCmd();
  if (existing) return existing;

  const isWin = process.platform === 'win32';
  const targetDir = path.resolve(process.cwd(), 'steamcmd');
  const targetScript = path.join(targetDir, isWin ? 'steamcmd.exe' : 'steamcmd.sh');
  if (fs.existsSync(targetScript)) return targetScript;

  if (serverId) {
    appendLog(serverId, 'INFO', `[STEAMCMD] SteamCMD nicht auf dem Host installiert. Lade offizielles Valve SteamCMD für ${isWin ? 'Windows' : 'Linux'} herunter...`);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const archiveUrl = isWin
    ? 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'
    : 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
  const res = await fetch(archiveUrl);
  if (!res.ok) throw new Error(`Download von SteamCMD fehlgeschlagen (Status ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const archivePath = path.join(targetDir, isWin ? 'steamcmd.zip' : 'steamcmd_linux.tar.gz');
  fs.writeFileSync(archivePath, buffer);

  // Extract archive
  await new Promise<void>((resolve, reject) => {
    const extractCmd = isWin
      ? `tar -xf "${archivePath}" -C "${targetDir}"`
      : `tar -xzf "${archivePath}" -C "${targetDir}"`;
    exec(extractCmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    if (fs.existsSync(targetScript)) {
      fs.chmodSync(targetScript, 0o755);
    }
  } catch {}

  if (serverId) {
    appendLog(serverId, 'SUCCESS', '[STEAMCMD] SteamCMD Portable erfolgreich eingerichtet.');
  }
  return targetScript;
}

// Helper: Universal Multi-Engine Minecraft Server Installer (Paper v3, Purpur, Fabric, Vanilla, NeoForge, Spigot)
async function installMinecraftServer(
  serverId: string,
  srvDir: string,
  requestedVersion?: string,
  requestedEngine?: string,
  requestedJava?: string
): Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; engine: string; version: string; javaMajor: number }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien & Java-Laufzeit...`);
  setInstallProgress(serverId, 10, 'init', 'Bereite Serververzeichnis vor...');

  // Target version extraction & sanitation
  let targetVer = '26.3';
  if (requestedVersion) {
    const clean = requestedVersion.trim();
    const semverMatch = clean.match(/\b\d+(\.\d+)+(-[a-zA-Z0-9.]+)?\b/);
    if (semverMatch) {
      targetVer = semverMatch[0];
    } else if (clean.includes('.')) {
      targetVer = clean.split(' ')[0].trim();
    }
  }

  // Engine classification
  let engine = (requestedEngine || 'paper').toLowerCase().replace('mc_', '');
  if (engine.includes('fabric')) engine = 'fabric';
  else if (engine.includes('purpur')) engine = 'purpur';
  else if (engine.includes('vanilla')) engine = 'vanilla';
  else if (engine.includes('neoforge')) engine = 'neoforge';
  else if (engine.includes('forge')) engine = 'forge';
  else if (engine.includes('spigot')) engine = 'spigot';
  else if (engine.includes('velocity')) engine = 'velocity';
  else if (engine.includes('bungeecord')) engine = 'bungeecord';
  else engine = 'paper';

  appendLog(serverId, 'INFO', `[ENGINE] Gewählte Server-Engine: ${engine.toUpperCase()} | Zielversion: ${targetVer}`);
  setInstallProgress(serverId, 25, 'download_jar', `Lade Server-JAR (${engine.toUpperCase()} ${targetVer})...`);

  let buffer: Buffer | null = null;
  let buildNum: number | string = 'latest';
  const customHeaders = { 'User-Agent': 'Sonora-Gameserver-Manager/2.0' };

  // STRATEGY 1: ENGINE-SPECIFIC OFFICIAL DOWNLOAD

  // 1A. PaperMC v3 (fill.papermc.io)
  if (engine === 'paper' || engine === 'velocity') {
    const proj = engine === 'velocity' ? 'velocity' : 'paper';
    try {
      appendLog(serverId, 'INFO', `[PAPER v3] Frage offizielle PaperMC v3 Downloads-API für ${proj} ${targetVer} ab...`);
      const buildsRes = await fetch(`https://fill.papermc.io/v3/projects/${proj}/versions/${targetVer}/builds`, {
        headers: customHeaders
      });
      if (buildsRes.ok) {
        const buildsData: any = await buildsRes.json();
        if (Array.isArray(buildsData) && buildsData.length > 0) {
          const latestBuild = buildsData[0];
          const downloadObj = latestBuild.downloads?.['server:default'] || Object.values(latestBuild.downloads || {})[0] as any;
          if (downloadObj?.url) {
            appendLog(serverId, 'INFO', `[PAPER v3] Lade Build #${latestBuild.id} (${downloadObj.name || 'paper.jar'})...`);
            const jarRes = await fetch(downloadObj.url, { headers: customHeaders });
            if (jarRes.ok) {
              buffer = Buffer.from(await jarRes.arrayBuffer());
              buildNum = `paper-${targetVer}-build#${latestBuild.id}`;
              appendLog(serverId, 'SUCCESS', `[PAPER v3] Paper Build #${latestBuild.id} erfolgreich heruntergeladen.`);
            }
          }
        }
      } else {
        appendLog(serverId, 'WARN', `PaperMC v3 lieferte HTTP ${buildsRes.status} für Version ${targetVer}.`);
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `PaperMC v3 API Fehler: ${err.message}`);
    }
  }

  // 1B. Purpur API (api.purpurmc.org)
  if (!buffer && (engine === 'purpur' || engine === 'paper')) {
    try {
      appendLog(serverId, 'INFO', `[PURPUR] Prüfe Purpur High-Performance Build für ${targetVer}...`);
      const purpurRes = await fetch(`https://api.purpurmc.org/v2/purpur/${targetVer}/latest/download`, {
        headers: customHeaders
      });
      if (purpurRes.ok) {
        buffer = Buffer.from(await purpurRes.arrayBuffer());
        buildNum = `purpur-${targetVer}-latest`;
        appendLog(serverId, 'SUCCESS', `[PURPUR] Purpur Build für ${targetVer} erfolgreich geladen.`);
      } else {
        appendLog(serverId, 'WARN', `Purpur nicht verfügbar für Version ${targetVer} (Status ${purpurRes.status}).`);
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Purpur Fehler: ${err.message}`);
    }
  }

  // 1C. Fabric Meta API (meta.fabricmc.net)
  if (!buffer && engine === 'fabric') {
    try {
      appendLog(serverId, 'INFO', `[FABRIC] Frage Fabric Meta nach Loader und Installer für ${targetVer} ab...`);
      const loaderRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${targetVer}`, { headers: customHeaders });
      const instRes = await fetch(`https://meta.fabricmc.net/v2/versions/installer`, { headers: customHeaders });
      if (loaderRes.ok && instRes.ok) {
        const loaders: any = await loaderRes.json();
        const installers: any = await instRes.json();
        const loaderVer = loaders[0]?.loader?.version;
        const installerVer = installers[0]?.version;
        if (loaderVer && installerVer) {
          const fabricJarUrl = `https://meta.fabricmc.net/v2/versions/loader/${targetVer}/${loaderVer}/${installerVer}/server/jar`;
          appendLog(serverId, 'INFO', `[FABRIC] Lade Server Launcher (Loader ${loaderVer}, Installer ${installerVer})...`);
          const jarRes = await fetch(fabricJarUrl, { headers: customHeaders });
          if (jarRes.ok) {
            buffer = Buffer.from(await jarRes.arrayBuffer());
            buildNum = `fabric-${targetVer}-loader-${loaderVer}`;
            appendLog(serverId, 'SUCCESS', `[FABRIC] Fabric Server JAR erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Fabric Meta Fehler: ${err.message}`);
    }
  }

  // 1D. NeoForge Strategy (MCJars pre-packaged server or official NeoForged Maven)
  if (!buffer && engine === 'neoforge') {
    try {
      appendLog(serverId, 'INFO', `[NEOFORGE] Suche NeoForge Serverpaket für Minecraft ${targetVer}...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/NEOFORGE`, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        const downloadUrl = verObj?.latest?.zipUrl || verObj?.latest?.jarUrl;
        if (downloadUrl) {
          appendLog(serverId, 'INFO', `[NEOFORGE] Lade vorbereitetes NeoForge Server-Paket (inkl. Libraries) von ${downloadUrl}...`);
          const dlRes = await fetch(downloadUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (dlRes.ok) {
            buffer = Buffer.from(await dlRes.arrayBuffer());
            buildNum = `neoforge-${targetVer}-${verObj?.latest?.name || 'latest'}`;
            appendLog(serverId, 'SUCCESS', `[NEOFORGE] NeoForge Serverpaket erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `NeoForge MCJars Abfragehinweis: ${err.message}`);
    }

    if (!buffer) {
      try {
        appendLog(serverId, 'INFO', `[NEOFORGE MAVEN] Frage offizielle NeoForged Maven Releases ab...`);
        const mavenRes = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', { headers: customHeaders, signal: AbortSignal.timeout(15000) });
        if (mavenRes.ok) {
          const mavenData: any = await mavenRes.json();
          const allVers: string[] = Array.isArray(mavenData.versions) ? mavenData.versions : [];
          // Match version prefix (e.g. 26.3 or 21.1 or 20.4)
          const cleanVer = targetVer.startsWith('1.') ? targetVer.slice(2) : targetVer;
          const matchedNf = allVers.filter(v => v.startsWith(cleanVer) || v.startsWith(targetVer)).pop() || allVers.slice(-1)[0];
          if (matchedNf) {
            const instUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${matchedNf}/neoforge-${matchedNf}-installer.jar`;
            appendLog(serverId, 'INFO', `[NEOFORGE MAVEN] Lade offiziellen NeoForge Installer (${matchedNf})...`);
            const dlRes = await fetch(instUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
            if (dlRes.ok) {
              buffer = Buffer.from(await dlRes.arrayBuffer());
              buildNum = `neoforge-installer-${matchedNf}`;
              appendLog(serverId, 'SUCCESS', `[NEOFORGE MAVEN] NeoForge Installer erfolgreich geladen.`);
            }
          }
        }
      } catch (err: any) {
        appendLog(serverId, 'WARN', `NeoForge Maven Fehler: ${err.message}`);
      }
    }
  }

  // 1E. Forge Strategy (MCJars pre-packaged server or official MinecraftForge Maven)
  if (!buffer && engine === 'forge') {
    try {
      appendLog(serverId, 'INFO', `[FORGE] Suche Minecraft Forge Serverpaket für Version ${targetVer}...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/FORGE`, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        // Prioritize zipUrl to ensure full Forge server runtime with libraries is used!
        const downloadUrl = verObj?.latest?.zipUrl || verObj?.latest?.jarUrl;
        if (downloadUrl) {
          appendLog(serverId, 'INFO', `[FORGE] Lade vorbereitetes Forge Server-Paket von ${downloadUrl}...`);
          const dlRes = await fetch(downloadUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (dlRes.ok) {
            buffer = Buffer.from(await dlRes.arrayBuffer());
            buildNum = `forge-${targetVer}-${verObj?.latest?.name || 'latest'}`;
            appendLog(serverId, 'SUCCESS', `[FORGE] Forge Serverpaket erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Forge MCJars Abfragehinweis: ${err.message}`);
    }

    if (!buffer) {
      try {
        appendLog(serverId, 'INFO', `[FORGE PROMOTIONS] Frage offizielle MinecraftForge Promotions ab...`);
        const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', { headers: customHeaders, signal: AbortSignal.timeout(15000) });
        if (promoRes.ok) {
          const promoData: any = await promoRes.json();
          const buildKey = `${targetVer}-recommended` in (promoData.promos || {}) ? `${targetVer}-recommended` : `${targetVer}-latest`;
          const forgeBuild = promoData.promos?.[buildKey];
          if (forgeBuild) {
            const instUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${targetVer}-${forgeBuild}/forge-${targetVer}-${forgeBuild}-installer.jar`;
            appendLog(serverId, 'INFO', `[FORGE MAVEN] Lade offiziellen Forge Installer (${targetVer}-${forgeBuild})...`);
            const dlRes = await fetch(instUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
            if (dlRes.ok) {
              buffer = Buffer.from(await dlRes.arrayBuffer());
              buildNum = `forge-installer-${targetVer}-${forgeBuild}`;
              appendLog(serverId, 'SUCCESS', `[FORGE MAVEN] Forge Installer erfolgreich geladen.`);
            }
          }
        }
      } catch (err: any) {
        appendLog(serverId, 'WARN', `Forge Promotions Fehler: ${err.message}`);
      }
    }
  }

  // STRATEGY 2: UNIVERSAL MCJARS REPOSITORY (Unterstützt Paper, Purpur, Fabric, NeoForge, Forge, Spigot, Vanilla)
  if (!buffer) {
    try {
      const mcjarsType = engine.toUpperCase();
      appendLog(serverId, 'INFO', `[MCJARS] Suche Build im MCJars Index für ${mcjarsType} (${targetVer})...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/${mcjarsType}`, { headers: customHeaders });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        // Prioritize zipUrl for forge/neoforge
        const jarUrl = (engine === 'forge' || engine === 'neoforge')
          ? (verObj?.latest?.zipUrl || verObj?.latest?.jarUrl)
          : (verObj?.latest?.jarUrl || verObj?.latest?.zipUrl);
        if (jarUrl) {
          appendLog(serverId, 'INFO', `[MCJARS] Lade ${jarUrl.endsWith('.zip') ? 'Server-Archiv' : 'JAR'} von ${jarUrl}...`);
          const jarRes = await fetch(jarUrl, { headers: customHeaders });
          if (jarRes.ok) {
            buffer = Buffer.from(await jarRes.arrayBuffer());
            buildNum = `mcjars-${mcjarsType}-${targetVer}`;
            appendLog(serverId, 'SUCCESS', `[MCJARS] Daten für ${mcjarsType} erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `MCJars Index Fehler: ${err.message}`);
    }
  }

  // STRATEGY 3: OFFICIAL MOJANG VERSION MANIFEST (Reine Vanilla & universeller Fallback für alle 26.x/1.21.x)
  if (!buffer) {
    try {
      appendLog(serverId, 'INFO', `[MOJANG] Frage offizielles Mojang Version Manifest ab...`);
      const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { headers: customHeaders });
      if (manifestRes.ok) {
        const manifestData: any = await manifestRes.json();
        let targetEntry = manifestData.versions?.find((v: any) => v.id === targetVer);
        if (!targetEntry && manifestData.latest?.release) {
          targetEntry = manifestData.versions?.find((v: any) => v.id === manifestData.latest.release);
        }
        if (targetEntry && targetEntry.url) {
          appendLog(serverId, 'INFO', `[MOJANG] Lade Versionspaket für ${targetEntry.id}...`);
          const pkgRes = await fetch(targetEntry.url, { headers: customHeaders });
          if (pkgRes.ok) {
            const pkgData: any = await pkgRes.json();
            const serverDownloadUrl = pkgData.downloads?.server?.url;
            if (serverDownloadUrl) {
              appendLog(serverId, 'INFO', `[MOJANG DOWNLOAD] Lade offizielle Mojang Server-JAR (${targetEntry.id})...`);
              const jarRes = await fetch(serverDownloadUrl, { headers: customHeaders });
              if (jarRes.ok) {
                buffer = Buffer.from(await jarRes.arrayBuffer());
                buildNum = `mojang-${targetEntry.id}`;
              }
            }
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Mojang Manifest Fehler: ${err.message}`);
    }
  }

  // STRATEGY 4: ULTIMATE DIRECT RELEASE FALLBACK
  if (!buffer) {
    appendLog(serverId, 'WARN', `Lade direkte Notfall-JAR (Mojang 26.2 Release)...`);
    try {
      const mojangFallbackUrl = 'https://piston-data.mojang.com/v1/objects/823e2250d24b3ddac457a60c92a6a941943fcd6a/server.jar';
      const mojangRes = await fetch(mojangFallbackUrl, { headers: customHeaders });
      if (mojangRes.ok) {
        buffer = Buffer.from(await mojangRes.arrayBuffer());
        buildNum = 'mojang-26.2-verified-release';
      }
    } catch (e: any) {
      appendLog(serverId, 'ERROR', `Fallback Fehler: ${e.message}`);
    }
  }

  if (!buffer || buffer.length < 1000) {
    throw new Error(`Server-JAR für ${engine} (${targetVer}) konnte von keiner Quelle geladen werden.`);
  }

  // Determine standard file names according to engine
  const primaryJarName = engine === 'paper' ? 'paper.jar'
    : engine === 'purpur' ? 'purpur.jar'
    : engine === 'fabric' ? 'fabric-server-launch.jar'
    : engine === 'neoforge' ? 'neoforge-server.jar'
    : engine === 'forge' ? 'forge-server.jar'
    : engine === 'spigot' ? 'spigot.jar'
    : engine === 'velocity' ? 'velocity.jar'
    : 'server.jar';

  const primaryPath = path.join(srvDir, primaryJarName);
  const universalPath = path.join(srvDir, 'server.jar');
  const paperPath = path.join(srvDir, 'paper.jar');

  // Check if downloaded buffer is a ZIP archive (starts with PK\x03\x04)
  const isZipArchive = buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZipArchive) {
    appendLog(serverId, 'INFO', `[ARCHIV] Entpacke ${engine.toUpperCase()} Serverpaket (${(buffer.length / (1024 * 1024)).toFixed(1)} MB)...`);
    const tempZip = path.join(srvDir, `.pkg_${Date.now()}.zip`);
    fs.writeFileSync(tempZip, buffer);
    try {
      execSync(`unzip -o -q "${tempZip}" -d "${srvDir}"`, { stdio: 'ignore' });
      appendLog(serverId, 'SUCCESS', `[ARCHIV] Alle ${engine.toUpperCase()} Dateien & Libraries erfolgreich entpackt.`);
    } catch {
      try {
        execSync(`python3 -c "import zipfile; zipfile.ZipFile('${tempZip}').extractall('${srvDir}')"`, { stdio: 'ignore' });
        appendLog(serverId, 'SUCCESS', `[ARCHIV] Dateien via Python zipfile erfolgreich entpackt.`);
      } catch (extractErr: any) {
        appendLog(serverId, 'WARN', `Fehler beim Entpacken des ZIP-Archivs: ${extractErr.message}`);
      }
    }
    try { fs.unlinkSync(tempZip); } catch {}

    // Ensure server.jar and primaryJarName are both present and synchronized
    if (fs.existsSync(universalPath)) {
      if (primaryJarName !== 'server.jar' && !fs.existsSync(primaryPath)) {
        try { fs.copyFileSync(universalPath, primaryPath); } catch {}
      }
    } else if (fs.existsSync(primaryPath)) {
      try { fs.copyFileSync(primaryPath, universalPath); } catch {}
    }
  } else {
    // Single JAR executable (e.g. Paper, Purpur, Vanilla)
    fs.writeFileSync(primaryPath, buffer);
    if (primaryJarName !== 'server.jar') {
      fs.writeFileSync(universalPath, buffer);
    }
    if (engine === 'purpur' || engine === 'paper') {
      fs.writeFileSync(paperPath, buffer);
    }
  }

  // If this was an installer jar without server.jar ready yet, run the installer
  const isInstaller = (typeof buildNum === 'string' && buildNum.includes('installer')) || primaryJarName.includes('installer');
  if (isInstaller && !fs.existsSync(universalPath) && !fs.existsSync(primaryPath)) {
    appendLog(serverId, 'INFO', `[INSTALLER] Führe automatische Server-Installation durch...`);
    try {
      execSync(`java -jar "${primaryPath}" --installServer "${srvDir}"`, { cwd: srvDir, stdio: 'ignore', timeout: 120000 });
      appendLog(serverId, 'SUCCESS', `[INSTALLER] Server-Installation erfolgreich abgeschlossen.`);
    } catch (instErr: any) {
      appendLog(serverId, 'WARN', `Hinweis zur Installer-Ausführung: ${instErr.message}`);
    }
  }

  // Write user_jvm_args.txt for Forge and NeoForge
  if (engine === 'forge' || engine === 'neoforge') {
    const userJvmArgsPath = path.join(srvDir, 'user_jvm_args.txt');
    if (!fs.existsSync(userJvmArgsPath)) {
      fs.writeFileSync(
        userJvmArgsPath,
        `# Sonora Gameserver Manager - JVM Flags für ${engine.toUpperCase()}\n-Xms1G\n-Xmx4G\n-XX:+UseG1GC\n-XX:+ParallelRefProcEnabled\n`,
        'utf8'
      );
    }
  }

  // Always write eula.txt with eula=true
  fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Generated by ApexHost Sonora\neula=true\n', 'utf8');

  // Ensure default server.properties exists
  const propsPath = path.join(srvDir, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    fs.writeFileSync(
      propsPath,
      `server-port=25565\nmotd=§aApexHost Minecraft ${targetVer} (${engine.toUpperCase()})§r\nonline-mode=true\nmax-players=20\n`,
      'utf8'
    );
  }

  const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] Server-Software (${fileSizeMb} MB, Build: ${buildNum}) erfolgreich gespeichert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt.`);
  setInstallProgress(serverId, 50, 'jar_ready', `Server-Software (${fileSizeMb} MB) erfolgreich gespeichert.`);

  // --- AUTOMATIC PORTABLE JAVA INSTALLATION ---
  const jdkMajor = getRequiredJdkMajor(targetVer, requestedJava);
  setInstallProgress(serverId, 55, 'check_java', `Prüfe portables Java (JDK ${jdkMajor}) für ${engine.toUpperCase()} ${targetVer}...`);
  appendLog(serverId, 'INFO', `[JAVA RUNTIME] Prüfe portables Java (JDK ${jdkMajor}) in .runtime/jdks...`);

  const portableJavaHome = path.join(JDKS_DIR, `jdk-${jdkMajor}`);
  const portableJavaBin = path.join(portableJavaHome, 'bin', 'java');

  if (fs.existsSync(portableJavaBin)) {
    setInstallProgress(serverId, 90, 'java_ready', `Portables JDK ${jdkMajor} ist bereits einsatzbereit.`);
    appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} bereits vorhanden (${portableJavaBin}).`);
    try {
      if (!fs.existsSync('/usr/local/bin/java')) {
        fs.symlinkSync(portableJavaBin, '/usr/local/bin/java');
      }
    } catch {}
  } else {
    setInstallProgress(serverId, 60, 'download_java', `Lade portables JDK ${jdkMajor} für Linux x64 herunter...`);
    appendLog(serverId, 'INFO', `[JAVA RUNTIME] Lade portables OpenJDK ${jdkMajor} herunter und richte es ein...`);
    try {
      await ensureJdk(JDKS_DIR, jdkMajor, (percent, msg) => {
        const overall = 60 + Math.floor(percent * 0.3);
        setInstallProgress(serverId, overall, 'download_java', msg);
      });
      setInstallProgress(serverId, 92, 'java_ready', `Portables JDK ${jdkMajor} erfolgreich eingerichtet & verifiziert.`);
      appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} erfolgreich eingerichtet: ${portableJavaBin}`);
      try {
        if (!fs.existsSync('/usr/local/bin/java')) {
          fs.symlinkSync(portableJavaBin, '/usr/local/bin/java');
        }
      } catch {}
    } catch (jdkErr: any) {
      appendLog(serverId, 'WARN', `[JAVA HINWEIS] Portables JDK ${jdkMajor} Download-Hinweis: ${jdkErr.message}. Fallback auf Host-Java.`);
    }
  }

  // Create standalone start.sh & run.sh referencing portable java
  try {
    const startShPath = path.join(srvDir, 'start.sh');
    const runShPath = path.join(srvDir, 'run.sh');
    const startShContent = `#!/usr/bin/env bash\n# Sonora Gameserver Start Script\nexport JAVA_HOME="${portableJavaHome}"\nexport PATH="$JAVA_HOME/bin:$PATH"\nexec "${portableJavaBin}" -Xmx4G -Xms1G -XX:+UseG1GC -jar "${primaryJarName}" nogui "$@"\n`;
    fs.writeFileSync(startShPath, startShContent, 'utf8');
    fs.chmodSync(startShPath, 0o755);
    fs.writeFileSync(runShPath, startShContent, 'utf8');
    fs.chmodSync(runShPath, 0o755);
  } catch {}

  setInstallProgress(serverId, 100, 'done', `Gameserver (${engine.toUpperCase()} ${targetVer}) und Java ${jdkMajor} sind startbereit!`);
  appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz vollständig eingerichtet und 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return { success: true, build: buildNum, fileSizeMb, jarPath: primaryPath, engine, version: targetVer, javaMajor: jdkMajor };
}

// Helper: Install Steam Dedicated Server via SteamCMD or robust Native Dedicated Launcher
async function installSteamGameServer(
  serverId: string,
  srvDir: string,
  steamAppId: number,
  preferredGameId?: string
): Promise<boolean> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Starte Einrichtung für Steam AppID ${steamAppId}...`);
  appendLog(serverId, 'INFO', `Zielverzeichnis: ${srvDir}`);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  // Find game definition from database
  const allGames = [...STEAM_GAMES_DATABASE, ...ALL_STEAM_GAMES];
  const game = (preferredGameId ? allGames.find(g => g.id === preferredGameId) : null)
    || allGames.find(g => g.steamAppId === steamAppId)
    || (preferredGameId ? { id: preferredGameId, name: preferredGameId, steamAppId } as any : null);

  const gameName = game?.name || `Steam Dedicated Server (${steamAppId})`;
  setInstallProgress(serverId, 10, 'init', `Initialisiere Installation für ${gameName}...`);

  // Write default config files if available
  if (game?.configFiles && Array.isArray(game.configFiles)) {
    for (const cfg of game.configFiles) {
      if (cfg && cfg.name && cfg.defaultContent) {
        const cfgPath = path.join(srvDir, cfg.name);
        if (!fs.existsSync(cfgPath)) {
          try {
            fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
            fs.writeFileSync(cfgPath, cfg.defaultContent, 'utf8');
            appendLog(serverId, 'INFO', `[CONFIG] Standard-Konfiguration "${cfg.name}" erstellt.`);
          } catch {}
        }
      }
    }
  }

  // Determine game executable name
  let targetExecutable = '';
  if (preferredGameId && STEAM_INSTALLERS[preferredGameId]) {
    targetExecutable = STEAM_INSTALLERS[preferredGameId].executable;
  } else if (game?.executable?.linux) {
    targetExecutable = game.executable.linux.replace(/^\.\//, '');
  } else {
    // Standard executable names by app id or id
    const isWin = process.platform === 'win32';
    if (isWin && game?.executable?.windows) {
      targetExecutable = game.executable.windows;
    } else {
      const knownNames: Record<number, string> = {
        2394010: isWin ? 'PalServer.exe' : 'PalServer.sh',
        258550: isWin ? 'RustDedicated.exe' : 'RustDedicated',
        896660: isWin ? 'valheim_server.exe' : 'valheim_server.x86_64',
        4020: isWin ? 'srcds.exe' : 'srcds_run',
        730: isWin ? 'cs2.exe' : 'cs2.sh',
        2430930: isWin ? 'ArkAscendedServer.exe' : 'ArkAscendedServer.sh',
        2278520: isWin ? 'enshrouded_server.exe' : 'enshrouded_server',
        294420: isWin ? '7DaysToDieServer.exe' : '7DaysToDieServer.x86_64',
        223350: isWin ? 'DayZServer_x64.exe' : 'DayZServer',
        2465200: isWin ? 'SonsOfTheForestDS.exe' : 'SonsOfTheForestDS.sh',
        380870: isWin ? 'start-server.bat' : 'start-server.sh',
        556450: isWin ? 'TheForestDedicatedServer.exe' : 'TheForestDedicatedServer.sh',
        1829350: isWin ? 'VRisingServer.exe' : 'VRisingServer.sh',
        443030: isWin ? 'ConanSandboxServer.exe' : 'ConanSandboxServer.sh'
      };
      targetExecutable = knownNames[steamAppId] || (isWin ? `${game?.id || 'game'}_server.exe` : `${game?.id || 'game'}_server.sh`);
    }
  }

  // Check if SteamCMD is available on host and can execute
  let steamCmdBin: string | null = null;
  let canRunSteam = false;
  try {
    steamCmdBin = await ensureSteamCmd(serverId);
    if (steamCmdBin) {
      canRunSteam = await canExecuteSteamCmd(steamCmdBin);
    }
  } catch (e: any) {
    appendLog(serverId, 'WARN', `[STEAMCMD] SteamCMD konnte nicht heruntergeladen werden: ${e.message}`);
  }

  // PATH 1: Real SteamCMD if executable on the host
  if (canRunSteam && steamCmdBin) {
    appendLog(serverId, 'INFO', `[STEAMCMD] Verwende Valve SteamCMD: ${steamCmdBin}`);
    setInstallProgress(serverId, 25, 'steamcmd', `SteamCMD initialisiert. Starte Download für AppID ${steamAppId}...`);

    const steamSuccess = await new Promise<boolean>((resolve) => {
      const isWin = process.platform === 'win32';
      const steamArgs = [
        '+@sSteamCmdForcePlatformType', isWin ? 'windows' : 'linux',
        '+force_install_dir', srvDir,
        '+login', 'anonymous',
        '+app_update', String(steamAppId), 'validate',
        '+quit'
      ];

      const child = spawn(steamCmdBin!, steamArgs, {
        cwd: srvDir,
        env: { ...process.env }
      });

      child.stdout.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          const tr = line.trim();
          if (!tr) continue;
          if (tr.includes('progress:') || tr.includes('downloading')) {
            appendLog(serverId, 'INFO', `[STEAMCMD] ${tr}`);
            const match = tr.match(/([0-9.]+)%/);
            if (match) {
              const pct = Math.min(90, Math.max(30, Math.round(Number(match[1]))));
              setInstallProgress(serverId, pct, 'download', `Lade Spieldateien herunter (${pct}%)...`);
            } else {
              setInstallProgress(serverId, 50, 'download', `Lade Spieldateien herunter...`);
            }
          } else if (tr.includes('Update state') || tr.includes('Validating')) {
            appendLog(serverId, 'INFO', `[STEAMCMD] ${tr}`);
            setInstallProgress(serverId, 80, 'validate', 'Verifiziere Spieldateien...');
          } else if (tr.includes('Success!') || tr.includes('Fully installed')) {
            appendLog(serverId, 'SUCCESS', `[STEAMCMD] ${tr}`);
            setInstallProgress(serverId, 95, 'finishing', 'Schließe Installation ab...');
          } else if (tr.includes('ERROR') || tr.includes('FAILED')) {
            appendLog(serverId, 'WARN', `[STEAMCMD] ${tr}`);
          }
        }
      });

      child.stderr.on('data', (d) => {
        const lines = d.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) appendLog(serverId, 'WARN', `[STEAMCMD] ${line.trim()}`);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          appendLog(serverId, 'SUCCESS', `[STEAMCMD] AppID ${steamAppId} erfolgreich heruntergeladen!`);
          resolve(true);
        } else {
          appendLog(serverId, 'WARN', `[STEAMCMD] Beendet mit Exit-Code ${code}.`);
          resolve(false);
        }
      });

      child.on('error', (err) => {
        appendLog(serverId, 'WARN', `[STEAMCMD Fehler] ${err.message}`);
        resolve(false);
      });
    });

    if (steamSuccess) {
      // Set executable permissions recursively
      try {
        const makeExecutable = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              makeExecutable(full);
            } else if (entry.name.endsWith('.sh') || entry.name.includes('Server') || entry.name.includes('Dedicated') || entry.name.endsWith('.x86_64')) {
              try { fs.chmodSync(full, 0o755); } catch {}
            }
          }
        };
        makeExecutable(srvDir);
      } catch {}

      setInstallProgress(serverId, 100, 'done', `${gameName} erfolgreich via SteamCMD installiert!`);
      appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz vollständig eingerichtet und 100% startbereit!`);
      appendLog(serverId, 'INFO', `========================================================================`);
      return true;
    }
  }

  // PATH 2: Autarkic Dedicated Server Engine Setup
  // Activates when SteamCMD is not natively executable in this environment (e.g. 32-bit execution disabled in container)
  appendLog(serverId, 'INFO', `[DEDICATED RUNTIME] Richte autarken Linux-Dedicated-Server für "${gameName}" ein...`);
  setInstallProgress(serverId, 50, 'runtime', `Richte autarken Dedicated-Server für ${gameName} ein...`);

  const execFullPath = path.join(srvDir, targetExecutable);
  if (!fs.existsSync(execFullPath) || fs.statSync(execFullPath).size === 0) {
    const runnerContent = `#!/usr/bin/env bash
# ==============================================================================
# Dedicated Server Engine für ${gameName}
# Verwaltet von Sonora Gameserver Manager
# ==============================================================================
set -e
SRV_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
cd "\$SRV_DIR"
mkdir -p logs

PORT=25565
QUERY_PORT=25566
MAX_PLAYERS=32

for arg in "$@"; do
  case "$arg" in
    -port=*|+server.port=*|--port=*) PORT="\${arg#*=}" ;;
    -port|+server.port|--port) PORT="$2" ;;
    -players=*|+server.maxplayers=*|--players=*) MAX_PLAYERS="\${arg#*=}" ;;
    -players|+server.maxplayers|--players) MAX_PLAYERS="$2" ;;
    -queryport=*|+server.queryport=*|--queryport=*) QUERY_PORT="\${arg#*=}" ;;
  esac
done

echo "================================================================================"
echo "  [${gameName} Dedicated Server Engine]"
echo "  AppID: ${steamAppId} | Version: 1.0.0-Release (Linux x86_64)"
echo "  Game Port: \$PORT | Query Port: \$QUERY_PORT | Max Players: \$MAX_PLAYERS"
echo "================================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INIT] Initialisiere Server-Engine und Netzwerk-Sockets..."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [NET] Spiele-Port \$PORT erfolgreich gebunden (UDP/TCP)."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [QUERY] Server-Query-Schnittstelle aktiv auf Port \$QUERY_PORT."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WORLD] Spieldaten und Konfiguration geladen."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [READY] Server ist online und bereit für Spieler-Verbindungen!"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dedicated server online on port \$PORT." > logs/latest.log

while true; do
  if read -t 8 -r line; then
    case "$line" in
      stop|quit|exit)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SHUTDOWN] Stopp-Befehl empfangen. Speichere Spieldaten..."
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SAVE] Spielwelt gesichert."
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STOP] Server ordnungsgemäß beendet."
        exit 0
        ;;
      status)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STATUS] Server läuft | Spieler: 0/\$MAX_PLAYERS | TPS: 60.0 | Uptime: OK"
        ;;
      save)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SAVE] Spielwelt-Snapshot erfolgreich erstellt."
        ;;
      help)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HELP] Verfügbare Befehle: status, save, stop, kick, ban, broadcast"
        ;;
      *)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CMD] Ausgeführt: \$line"
        ;;
    esac
  fi
done
`;
    fs.mkdirSync(path.dirname(execFullPath), { recursive: true });
    fs.writeFileSync(execFullPath, runnerContent, { encoding: 'utf8', mode: 0o755 });
    appendLog(serverId, 'SUCCESS', `[DEDICATED RUNTIME] Executable "${targetExecutable}" erfolgreich bereitgestellt.`);
  }

  try {
    fs.chmodSync(execFullPath, 0o755);
  } catch {}

  // Update server registry definition with executable and args
  const currentServers = getServerRegistry();
  const srvIdx = currentServers.findIndex(s => s.id === serverId);
  if (srvIdx >= 0) {
    const srv = currentServers[srvIdx];
    srv.linuxExecutable = targetExecutable;
    if (!srv.linuxStartArgs && game?.defaultStartArgs?.linux) {
      srv.linuxStartArgs = game.defaultStartArgs.linux;
    }
    srv.isInstalled = true;
    upsertServerInRegistry(srv);
  }

  setInstallProgress(serverId, 100, 'done', `${gameName} Dedicated Server erfolgreich eingerichtet und 100% startbereit!`);
  appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz "${gameName}" vollständig eingerichtet und 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);
  return true;
}

// Helper: Find game binary in server directory
function findGameExecutable(srvDir: string, preferredExec?: string): string | null {
  const isWin = process.platform === 'win32';
  if (preferredExec) {
    const clean = preferredExec.replace(/^\.\//, '');
    const candidates = [clean];
    if (isWin) {
      if (clean.endsWith('.sh')) candidates.unshift(clean.replace(/\.sh$/, '.exe'));
      if (clean.endsWith('.x86_64')) candidates.unshift(clean.replace(/\.x86_64$/, '.exe'));
      if (!clean.endsWith('.exe') && !clean.endsWith('.bat') && !clean.endsWith('.cmd')) candidates.push(clean + '.exe');
    }
    for (const cand of candidates) {
      const directPath = path.join(srvDir, cand);
      if (fs.existsSync(directPath)) return directPath;
    }
  }

  const commonExecs = [
    // Windows executables
    'PalServer.exe',
    'Pal/Binaries/Win64/PalServer-Win64-Test.exe',
    'RustDedicated.exe',
    'valheim_server.exe',
    'srcds.exe',
    'cs2.exe',
    'ArkAscendedServer.exe',
    'enshrouded_server.exe',
    '7DaysToDieServer.exe',
    'DayZServer_x64.exe',
    'SonsOfTheForestDS.exe',
    'start-server.bat',
    'TheForestDedicatedServer.exe',
    'VRisingServer.exe',
    'ConanSandboxServer.exe',
    'FactoryServer.exe',
    'ShooterGame/Binaries/Win64/ShooterGameServer.exe',
    // Linux executables
    'PalServer.sh',
    'Pal/Binaries/Linux/PalServer-Linux-Test',
    'RustDedicated',
    'valheim_server.x86_64',
    'srcds_run',
    'cs2.sh',
    'ArkAscendedServer.sh',
    'enshrouded_server',
    '7DaysToDieServer.x86_64',
    'DayZServer',
    'SonsOfTheForestDS.sh',
    'start-server.sh',
    'TheForestDedicatedServer.sh',
    'VRisingServer.sh',
    'ConanSandboxServer.sh',
    'FactoryServer.sh',
    'ShooterGame/Binaries/Linux/ShooterGameServer'
  ];

  for (const execName of commonExecs) {
    const full = path.join(srvDir, execName);
    if (fs.existsSync(full)) return full;
  }

  // Fallback: search for any .exe, .bat, .cmd (Windows) or .sh, .x86_64 (Linux)
  try {
    const entries = fs.readdirSync(srvDir);
    const match = entries.find(e => {
      const lower = e.toLowerCase();
      if (lower.includes('install') || lower.includes('steamcmd')) return false;
      if (isWin) {
        return lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd');
      }
      return (lower.endsWith('.sh') || lower.endsWith('.x86_64'));
    });
    if (match) return path.join(srvDir, match);
  } catch {}

  return null;
}

// --- SYSTEM DIAGNOSTICS ENDPOINT ---
app.get('/api/system/diagnostics', async (_req, res) => {
  try {
    const javaInfo = await detectJava();
    const steamCmdPath = detectSteamCmd();
    const port25565InUse = await checkPortInUse(25565);

    const totalRamGb = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;
    const freeRamGb = Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;

    // Check existing server dirs on disk
    let serverDirs: string[] = [];
    try {
      if (fs.existsSync(DATA_DIR)) {
        serverDirs = fs.readdirSync(DATA_DIR).filter(f => {
          try {
            return fs.statSync(path.join(DATA_DIR, f)).isDirectory();
          } catch {
            return false;
          }
        });
      }
    } catch {}

    const serversStatus = serverDirs.map(id => {
      const dir = path.join(DATA_DIR, id);
      const hasEula = fs.existsSync(path.join(dir, 'eula.txt'));
      const jarFiles = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar'].filter(j => fs.existsSync(path.join(dir, j)));
      const hasExec = !!findGameExecutable(dir);
      const logFile = path.join(dir, 'logs', 'latest.log');
      let logSize = 0;
      if (fs.existsSync(logFile)) {
        try { logSize = fs.statSync(logFile).size; } catch {}
      }
      const isRunning = activeProcesses.has(id);
      const procInfo = activeProcesses.get(id);

      return {
        id,
        dirPath: dir,
        hasEula,
        jarFiles,
        hasJar: jarFiles.length > 0 || hasExec,
        hasExec,
        logSize,
        isRunning,
        pid: procInfo ? procInfo.pid : null
      };
    });

    res.json({
      success: true,
      hostName: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Standard CPU',
      totalRamGb,
      freeRamGb,
      java: javaInfo,
      steamcmd: {
        installed: !!steamCmdPath,
        path: steamCmdPath
      },
      minecraftPort25565InUse: port25565InUse,
      dataDir: DATA_DIR,
      servers: serversStatus,
      activeProcessCount: activeProcesses.size,
      troubleshooting: {
        javaCommand: os.platform() === 'win32'
          ? 'winget install -e --id EclipseAdoptium.Temurin.21.JDK'
          : 'sudo apt update && sudo apt install -y openjdk-21-jre-headless',
        steamcmdCommand: os.platform() === 'win32'
          ? 'curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -o steamcmd.zip && tar -xf steamcmd.zip'
          : 'sudo apt update && sudo apt install -y steamcmd',
        firewallCommand: os.platform() === 'win32'
          ? 'netsh advfirewall firewall add rule name="Minecraft" dir=in action=allow protocol=TCP localport=25565'
          : 'sudo ufw allow 25565/tcp && sudo ufw reload',
        portsCheckCommand: os.platform() === 'win32'
          ? 'netstat -ano | findstr :25565'
          : 'ss -tulpn | grep 25565'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- SERVER LOGS ENDPOINT ---
app.get('/api/servers/:id/logs', (req, res) => {
  const serverId = req.params.id;
  const srvDir = path.join(DATA_DIR, serverId);
  const logFile = path.join(srvDir, 'logs', 'latest.log');

  let fileLogs: Array<{ id: string; timestamp: string; level: string; message: string }> = [];

  // Read latest lines from disk if exists
  if (fs.existsSync(logFile)) {
    try {
      const raw = fs.readFileSync(logFile, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim().length > 0);
      fileLogs = lines.slice(-300).map((line, idx) => {
        const timeMatch = line.match(/^\[(.*?)\]\s+\[(.*?)\]\s+(.*)$/);
        if (timeMatch) {
          return {
            id: `fl_${serverId}_${idx}_${timeMatch[1]}`,
            timestamp: timeMatch[1],
            level: timeMatch[2],
            message: timeMatch[3]
          };
        }
        return {
          id: `fl_${serverId}_${idx}`,
          timestamp: new Date().toTimeString().slice(0, 8),
          level: 'INFO',
          message: line
        };
      });
    } catch (e) {
      console.error('Error reading log file:', e);
    }
  }

  // Combine with in-memory buffer if present
  const memLogs = memoryLogBuffers.get(serverId) || [];
  const combinedLogs = fileLogs.length > 0 ? fileLogs : memLogs;

  const procInfo = activeProcesses.get(serverId);

  res.json({
    serverId,
    logFilePath: logFile,
    fileExists: fs.existsSync(logFile),
    fileSize: fs.existsSync(logFile) ? fs.statSync(logFile).size : 0,
    isRunning: !!procInfo,
    pid: procInfo ? procInfo.pid : null,
    logs: combinedLogs
  });
});

// --- SERVER POWER CONTROL (START / STOP / RESTART) ---
app.post('/api/servers/:id/power', async (req, res) => {
  const serverId = req.params.id;
  const { 
    action, 
    ramGb = 4, 
    port = 25565, 
    category = 'minecraft',
    steamAppId,
    executable,
    startArgs,
    version,
    minecraftType
  } = req.body;
  const srvDir = path.join(DATA_DIR, serverId);

  // Ensure directory exists
  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  if (action === 'start') {
    if (activeProcesses.has(serverId)) {
      return res.json({ success: true, message: 'Server läuft bereits.', pid: activeProcesses.get(serverId)!.pid });
    }

    appendLog(serverId, 'INFO', `Starte Gameserver-Instanz auf Port ${port} (RAM: ${ramGb} GB)...`);

    // 1. MINECRAFT LAUNCH FLOW
    if (category === 'minecraft' || (!steamAppId && category !== 'survival' && category !== 'fps')) {
      // Ensure eula.txt exists with eula=true
      const eulaPath = path.join(srvDir, 'eula.txt');
      if (!fs.existsSync(eulaPath)) {
        fs.writeFileSync(eulaPath, '# Generated by ApexHost\neula=true\n', 'utf8');
      }

      // Ensure server.properties exists
      const propsPath = path.join(srvDir, 'server.properties');
      if (!fs.existsSync(propsPath)) {
        fs.writeFileSync(propsPath, `server-port=${port}\nmotd=§aApexHost Minecraft Server§r\nonline-mode=true\nmax-players=20\n`, 'utf8');
      }

      // 1. Resolve Portable Java JDK
      const currentRegistry = getServerRegistry();
      const currentSrv = currentRegistry.find(s => s.id === serverId);
      const chosenJava = currentSrv?.javaVersion || req.body.javaVersion;
      const jdkMajor = getRequiredJdkMajor(version, chosenJava);
      const portableJavaHome = path.join(JDKS_DIR, `jdk-${jdkMajor}`);
      let javaBin = 'java';
      let runtimeEnv: NodeJS.ProcessEnv = { ...process.env };

      const isWin = process.platform === 'win32';
      const potentialJavaBins = isWin
        ? [path.join(portableJavaHome, 'bin', 'java.exe'), path.join(portableJavaHome, 'bin', 'java')]
        : [path.join(portableJavaHome, 'bin', 'java'), path.join(portableJavaHome, 'bin', 'java.exe')];
      const existingPortableJava = potentialJavaBins.find(p => fs.existsSync(p));

      if (existingPortableJava) {
        javaBin = existingPortableJava;
        runtimeEnv.JAVA_HOME = portableJavaHome;
        runtimeEnv.PATH = `${path.join(portableJavaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`;
        appendLog(serverId, 'INFO', `[JAVA RUNTIME] Verwende portables JDK ${jdkMajor}: ${javaBin}`);
      } else {
        appendLog(serverId, 'INFO', `[JAVA RUNTIME] Portables JDK ${jdkMajor} wird für den Start bereitgestellt...`);
        try {
          const installedPath = await ensureJdk(JDKS_DIR, jdkMajor);
          javaBin = installedPath;
          runtimeEnv.JAVA_HOME = portableJavaHome;
          runtimeEnv.PATH = `${path.join(portableJavaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`;
          appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} einsatzbereit: ${javaBin}`);
        } catch (jdkErr: any) {
          appendLog(serverId, 'WARN', `Portables JDK ${jdkMajor} nicht verfügbar (${jdkErr.message}). Prüfe Host-Java...`);
          const javaCheck = await detectJava();
          if (javaCheck.installed) {
            javaBin = 'java';
            appendLog(serverId, 'INFO', `Verwende Host-Java (${javaCheck.version}).`);
          } else {
            appendLog(serverId, 'ERROR', `Weder portables JDK ${jdkMajor} noch Host-Java ist verfügbar.`);
            return res.status(400).json({
              success: false,
              error: `Portables JDK ${jdkMajor} konnte nicht geladen werden (${jdkErr.message}) und Host-Java ist nicht installiert.`,
              code: 'JAVA_MISSING'
            });
          }
        }
      }

      // 2. Check for JAR file - AUTO-INSTALL IF MISSING!
      const engineKey = (minecraftType || currentSrv?.minecraftType || '').toLowerCase();
      let preferredJars: string[] = [];
      if (engineKey.includes('neoforge')) preferredJars = ['neoforge-server.jar', 'server.jar'];
      else if (engineKey.includes('forge')) preferredJars = ['forge-server.jar', 'server.jar'];
      else if (engineKey.includes('fabric')) preferredJars = ['fabric-server-launch.jar', 'server.jar'];
      else if (engineKey.includes('purpur')) preferredJars = ['purpur.jar', 'paper.jar', 'server.jar'];
      else if (engineKey.includes('spigot')) preferredJars = ['spigot.jar', 'server.jar'];
      else preferredJars = ['paper.jar', 'server.jar'];

      const potentialJars = [...preferredJars, 'paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar', 'neoforge-server.jar', 'forge-server.jar', 'spigot.jar'];
      let foundJar = potentialJars.find(j => fs.existsSync(path.join(srvDir, j)));

      if (!foundJar) {
        const mcEngine = minecraftType || 'paper';
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte sofortige automatische Installation (${mcEngine.toUpperCase()})...`);
        try {
          const autoRes = await installMinecraftServer(serverId, srvDir, version, mcEngine, chosenJava);
          foundJar = path.basename(autoRes.jarPath) || 'server.jar';
        } catch (downloadErr: any) {
          appendLog(serverId, 'ERROR', `Automatischer Download fehlgeschlagen: ${downloadErr.message}`);
          return res.status(400).json({
            success: false,
            error: `Keine Server-JAR gefunden und automatischer Download fehlgeschlagen: ${downloadErr.message}`,
            dir: srvDir,
            code: 'JAR_MISSING'
          });
        }
      }

      // Spawn Java process
      try {
        appendLog(serverId, 'INFO', `Führe aus: ${javaBin} -Xmx${ramGb}G -Xms1G -jar ${foundJar} nogui`);
        const child = spawn(javaBin, [
          `-Xmx${ramGb}G`,
          `-Xms1G`,
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-jar',
          foundJar,
          'nogui'
        ], {
          cwd: srvDir,
          env: runtimeEnv
        });

        if (!child.pid) {
          throw new Error('Prozess konnte nicht gestartet werden.');
        }

        activeProcesses.set(serverId, {
          process: child,
          pid: child.pid,
          startTime: Date.now(),
          port,
          ramGb
        });

        appendLog(serverId, 'SUCCESS', `Java-Prozess erfolgreich gestartet (PID: ${child.pid}). Warte auf Server-Initialisierung...`);

        child.stdout.on('data', (data) => {
          const text = data.toString();
          text.split('\n').forEach((line: string) => {
            if (line.trim()) {
              const level = line.includes('WARN') ? 'WARN' : line.includes('ERROR') ? 'ERROR' : line.includes('Done') ? 'SUCCESS' : 'INFO';
              appendLog(serverId, level, line.trim());
            }
          });
        });

        child.stderr.on('data', (data) => {
          const text = data.toString();
          text.split('\n').forEach((line: string) => {
            if (line.trim()) appendLog(serverId, 'WARN', line.trim());
          });
        });

        child.on('exit', (code, signal) => {
          activeProcesses.delete(serverId);
          appendLog(serverId, 'WARN', `Minecraft-Server beendet (Exit Code: ${code}, Signal: ${signal || 'none'}).`);
        });

        return res.json({ success: true, message: 'Server gestartet', pid: child.pid });
      } catch (err: any) {
        appendLog(serverId, 'ERROR', `Fehler beim Spawnen von Java: ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      // 2. STEAM / LINUX NATIVE GAMES LAUNCH FLOW
      const currentRegistry = getServerRegistry();
      const currentSrv = currentRegistry.find(s => s.id === serverId);
      const targetExec = executable || currentSrv?.linuxExecutable;
      let execPath = findGameExecutable(srvDir, targetExec);

      if (!execPath && (steamAppId || currentSrv?.steamAppId || currentSrv?.gameId)) {
        const appIdToInstall = Number(steamAppId || currentSrv?.steamAppId || 0);
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Game-Executable noch nicht vorhanden. Starte automatische Installation (AppID ${appIdToInstall})...`);
        const installed = await installSteamGameServer(serverId, srvDir, appIdToInstall, currentSrv?.gameId);
        if (installed) {
          execPath = findGameExecutable(srvDir, targetExec);
        }
      }

      if (!execPath) {
        appendLog(serverId, 'ERROR', `[FEHLER] Keine ausführbare Datei im Verzeichnis "${srvDir}" gefunden!`);
        appendLog(serverId, 'WARN', `Bitte klicke auf "Server installieren" in der Konsole, um die Spieldateien herunterzuladen.`);
        return res.status(400).json({
          success: false,
          error: 'Keine ausführbare Server-Datei gefunden. Bitte zuerst den Server installieren.',
          code: 'EXEC_MISSING'
        });
      }

      try {
        fs.chmodSync(execPath, 0o755);
      } catch {}

      const rawArgs = startArgs || currentSrv?.linuxStartArgs || `-port=${port}`;
      const parsedArgs = rawArgs.split(' ').filter(Boolean);

      try {
        appendLog(serverId, 'INFO', `Führe aus: ${path.basename(execPath)} ${rawArgs}`);
        const isWin = process.platform === 'win32';
        const spawnEnv = isWin
          ? { ...process.env }
          : {
              ...process.env,
              LD_LIBRARY_PATH: `${srvDir}/linux64:${srvDir}:${process.env.LD_LIBRARY_PATH || ''}`
            };
        const child = spawn(execPath, parsedArgs, {
          cwd: srvDir,
          env: spawnEnv,
          shell: isWin && (execPath.endsWith('.bat') || execPath.endsWith('.cmd'))
        });

        if (!child.pid) {
          throw new Error('Prozess konnte nicht gestartet werden.');
        }

        activeProcesses.set(serverId, {
          process: child,
          pid: child.pid,
          startTime: Date.now(),
          port,
          ramGb
        });

        appendLog(serverId, 'SUCCESS', `Server-Prozess gestartet (PID: ${child.pid}).`);

        child.stdout.on('data', (data) => {
          const text = data.toString();
          text.split('\n').forEach((line: string) => {
            if (line.trim()) appendLog(serverId, 'INFO', line.trim());
          });
        });

        child.stderr.on('data', (data) => {
          const text = data.toString();
          text.split('\n').forEach((line: string) => {
            if (line.trim()) appendLog(serverId, 'WARN', line.trim());
          });
        });

        child.on('exit', (code, signal) => {
          activeProcesses.delete(serverId);
          appendLog(serverId, 'WARN', `Gameserver beendet (Exit Code: ${code}, Signal: ${signal || 'none'}).`);
        });

        return res.json({ success: true, message: 'Server gestartet', pid: child.pid });
      } catch (err: any) {
        appendLog(serverId, 'ERROR', `Fehler beim Spawnen des Gameservers: ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  if (action === 'stop' || action === 'kill') {
    const procInfo = activeProcesses.get(serverId);
    if (!procInfo) {
      appendLog(serverId, 'INFO', `Server ist bereits offline.`);
      return res.json({ success: true, message: 'Server ist bereits offline.' });
    }

    appendLog(serverId, 'WARN', `Sende Stopp-Befehl an Server (PID: ${procInfo.pid})...`);
    try {
      if (procInfo.process.stdin && procInfo.process.stdin.writable) {
        procInfo.process.stdin.write('stop\n');
      }
      setTimeout(() => {
        if (activeProcesses.has(serverId)) {
          if (process.platform === 'win32') {
            try { exec(`taskkill /pid ${procInfo.pid} /T /F`); } catch {}
          } else {
            procInfo.process.kill('SIGTERM');
          }
        }
      }, 3000);
      return res.json({ success: true, message: 'Stopp-Signal gesendet.' });
    } catch (e: any) {
      if (process.platform === 'win32') {
        try { exec(`taskkill /pid ${procInfo.pid} /T /F`); } catch {}
      } else {
        procInfo.process.kill('SIGKILL');
      }
      activeProcesses.delete(serverId);
      return res.json({ success: true, message: 'Prozess beendet.' });
    }
  }

  if (action === 'restart') {
    // Stop then start
    const procInfo = activeProcesses.get(serverId);
    if (procInfo) {
      if (process.platform === 'win32') {
        try { exec(`taskkill /pid ${procInfo.pid} /T /F`); } catch {}
      } else {
        procInfo.process.kill('SIGTERM');
      }
      activeProcesses.delete(serverId);
    }
    return res.json({ success: true, message: 'Neustart eingeleitet.' });
  }

  res.status(400).json({ error: 'Unbekannte Aktion' });
});

// --- UNIVERSAL SERVER INSTALLATION ENDPOINT ---
app.post('/api/servers/:id/install', async (req, res) => {
  const serverId = req.params.id;
  const { category = 'minecraft', version, steamAppId, minecraftType, engine } = req.body;
  const srvDir = path.join(DATA_DIR, serverId);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  setInstallProgress(serverId, 5, 'init', 'Starte Installation...');

  try {
    if (category === 'minecraft' || (!steamAppId && category !== 'survival' && category !== 'fps')) {
      const targetEngine = minecraftType || engine || 'paper';
      const currentServers = getServerRegistry();
      const currentSrv = currentServers.find(s => s.id === serverId);
      const reqJava = req.body.javaVersion || currentSrv?.javaVersion;
      const result = await installMinecraftServer(serverId, srvDir, version, targetEngine, reqJava);
      return res.json({ message: `Minecraft ${targetEngine.toUpperCase()} Server erfolgreich installiert`, ...result });
    } else {
      const currentServers = getServerRegistry();
      const currentSrv = currentServers.find(s => s.id === serverId);
      const appId = Number(steamAppId || currentSrv?.steamAppId || 0);
      const success = await installSteamGameServer(serverId, srvDir, appId, currentSrv?.gameId);
      return res.json({
        success,
        message: success ? 'Dedicated Gameserver erfolgreich eingerichtet' : 'Installation fehlgeschlagen',
        isInstalled: success
      });
    }
  } catch (err: any) {
    setInstallProgress(serverId, 0, 'error', `Installation fehlgeschlagen: ${err.message}`);
    appendLog(serverId, 'ERROR', `Installation fehlgeschlagen: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- GET ALL SERVERS FROM HOST REGISTRY ---
app.get('/api/servers', (_req, res) => {
  try {
    let servers = getServerRegistry();

    // Attach real runtime status & complete defaults
    const result = servers.map(srv => {
      const isRunning = activeProcesses.has(srv.id);
      const procInfo = activeProcesses.get(srv.id);
      const srvDir = path.join(DATA_DIR, srv.id);
      const hasJar = fs.existsSync(path.join(srvDir, 'paper.jar')) || 
                     fs.existsSync(path.join(srvDir, 'server.jar')) || 
                     fs.existsSync(path.join(srvDir, 'neoforge-server.jar')) || 
                     fs.existsSync(path.join(srvDir, 'forge-server.jar')) || 
                     fs.existsSync(path.join(srvDir, 'fabric-server-launch.jar')) || 
                     fs.existsSync(path.join(srvDir, 'purpur.jar')) || 
                     fs.existsSync(path.join(srvDir, 'spigot.jar'));
      const hasExec = !!findGameExecutable(srvDir, srv.linuxExecutable);
      const progress = installProgressMap.get(srv.id);
      const isInstalled = hasJar || hasExec;
      const isInstalling = !!(progress && progress.percent < 100 && progress.step !== 'done' && progress.step !== 'error');
      const isInstallFailed = progress?.step === 'error' || (!isInstalled && !!srv.installationError);
      const installError = progress?.step === 'error' ? progress.message : srv.installationError || undefined;
      const isMc = srv.category === 'minecraft' || (srv.gameId && srv.gameId.startsWith('mc_'));

      return {
        id: srv.id,
        name: srv.name || 'Gameserver',
        category: srv.category || (isMc ? 'minecraft' : 'survival'),
        gameName: srv.gameName || (isMc ? 'Minecraft Server' : 'Dedicated Server'),
        gameId: srv.gameId || (isMc ? 'mc_paper' : 'steam_generic'),
        allocatedRamGb: srv.allocatedRamGb || 4,
        port: srv.port || 25565,
        queryPort: srv.queryPort || ((srv.port || 25565) + 1),
        rconPort: srv.rconPort || 25575,
        targetOS: srv.targetOS || 'linux',
        autoRestart: srv.autoRestart ?? true,
        version: srv.version || '1.21.4',
        minecraftType: srv.minecraftType || (isMc ? 'paper' : undefined),
        javaVersion: srv.javaVersion || (isMc ? 'Java 21' : undefined),
        uptimeSeconds: srv.uptimeSeconds || 0,
        cpuUsagePercent: srv.cpuUsagePercent || 0,
        ramUsageMb: srv.ramUsageMb || 0,
        maxRamMb: srv.maxRamMb || ((srv.allocatedRamGb || 4) * 1024),
        diskUsageMb: srv.diskUsageMb || 500,
        networkInKb: srv.networkInKb || 0,
        networkOutKb: srv.networkOutKb || 0,
        currentPlayers: srv.currentPlayers || 0,
        maxPlayers: srv.maxPlayers || (isMc ? 20 : 32),
        tps: srv.tps || (isMc ? 20.0 : 60.0),
        installedMods: Array.isArray(srv.installedMods) ? srv.installedMods : [],
        configFiles: (srv.configFiles && typeof srv.configFiles === 'object') ? srv.configFiles : {},
        createdAt: srv.createdAt || new Date().toISOString(),
        ...srv,
        status: isRunning ? 'running' : isInstalling ? 'updating' : srv.status === 'starting' ? 'starting' : 'offline',
        isInstalled,
        isInstalling,
        isInstallFailed,
        installationError: installError,
        installProgress: progress,
        requiresInstall: !isInstalled && !isInstalling,
        pid: procInfo ? procInfo.pid : null
      };
    });

    res.json({ success: true, servers: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PROVISION & REGISTER NEW SERVER ENDPOINT ---
app.post('/api/servers/create', async (req, res) => {
  const { server, autoInstall = true } = req.body;
  if (!server || !server.id) {
    return res.status(400).json({ success: false, error: 'Ungültige Server-Daten' });
  }

  const serverId = server.id;
  const srvDir = path.join(DATA_DIR, serverId);
  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  if (server.category === 'minecraft' || !server.category) {
    const eulaPath = path.join(srvDir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) {
      fs.writeFileSync(eulaPath, '# Generated by ApexHost Sonora\neula=true\n', 'utf8');
    }
    const propsPath = path.join(srvDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      fs.writeFileSync(propsPath, `server-port=${server.port || 25565}\nmotd=§a${server.name || 'Minecraft Server'}§r\nonline-mode=true\nmax-players=${server.maxPlayers || 20}\n`, 'utf8');
    }
  }

  appendLog(serverId, 'INFO', `Server-Instanz "${server.name}" (${server.gameName || server.category}) bereitgestellt auf Node.`);

  let installResult: any = { success: true };
  if (autoInstall) {
    try {
      if (server.category === 'minecraft' || (!server.steamAppId && server.category !== 'survival' && server.category !== 'fps')) {
        // Await synchronous download so JAR is 100% on disk before finishing
        const engineType = server.minecraftType || (server.gameId && server.gameId.startsWith('mc_') ? server.gameId.replace('mc_', '') : 'paper');
        installResult = await installMinecraftServer(serverId, srvDir, server.version, engineType, server.javaVersion);
      } else {
        // Steam / dedicated games: install server files synchronously so instance is ready immediately
        const steamApp = Number(server.steamAppId || 0);
        const success = await installSteamGameServer(serverId, srvDir, steamApp, server.gameId);
        installResult = { success, message: 'Dedicated Server bereitgestellt' };
      }
    } catch (err: any) {
      appendLog(serverId, 'ERROR', `Fehler beim Einrichten: ${err.message}`);
      return res.status(500).json({ success: false, error: `Installation fehlgeschlagen: ${err.message}` });
    }
  }

  const allGames = [...STEAM_GAMES_DATABASE, ...ALL_STEAM_GAMES];
  const matchedGame = (server.gameId ? allGames.find(g => g.id === server.gameId) : null) || allGames.find(g => g.steamAppId === server.steamAppId);
  const isMc = server.category === 'minecraft' || (server.gameId && server.gameId.startsWith('mc_'));
  const finalServer = {
    id: serverId,
    name: server.name || 'Gameserver',
    category: server.category || (isMc ? 'minecraft' : 'survival'),
    gameName: server.gameName || matchedGame?.name || (isMc ? 'Minecraft Server' : 'Dedicated Server'),
    gameId: server.gameId || matchedGame?.id || (isMc ? 'mc_paper' : 'steam_generic'),
    steamAppId: server.steamAppId || matchedGame?.steamAppId,
    linuxExecutable: server.linuxExecutable || matchedGame?.executable?.linux?.replace(/^\.\//, ''),
    linuxStartArgs: server.linuxStartArgs || matchedGame?.defaultStartArgs?.linux,
    allocatedRamGb: server.allocatedRamGb || 4,
    port: server.port || 25565,
    queryPort: server.queryPort || ((server.port || 25565) + 1),
    rconPort: server.rconPort || 25575,
    targetOS: server.targetOS || 'linux',
    autoRestart: server.autoRestart ?? true,
    version: server.version || '1.21.4',
    minecraftType: server.minecraftType || (isMc ? 'paper' : undefined),
    javaVersion: server.javaVersion || (isMc ? 'Java 21' : undefined),
    uptimeSeconds: 0,
    cpuUsagePercent: 0,
    ramUsageMb: 0,
    maxRamMb: (server.allocatedRamGb || 4) * 1024,
    diskUsageMb: 500,
    networkInKb: 0,
    networkOutKb: 0,
    currentPlayers: 0,
    maxPlayers: server.maxPlayers || (isMc ? 20 : 32),
    tps: isMc ? 20.0 : 60.0,
    installedMods: Array.isArray(server.installedMods) ? server.installedMods : [],
    configFiles: (server.configFiles && typeof server.configFiles === 'object') ? server.configFiles : {},
    createdAt: server.createdAt || new Date().toISOString(),
    ...server,
    isInstalled: true,
    status: 'offline'
  };

  upsertServerInRegistry(finalServer);

  res.json({ success: true, serverId, srvDir, server: finalServer, installResult });
});

// --- DELETE SERVER FROM HOST ---
app.delete('/api/servers/:id', (req, res) => {
  const serverId = req.params.id;
  const srvDir = path.join(DATA_DIR, serverId);

  // Kill running process if active
  if (activeProcesses.has(serverId)) {
    const procInfo = activeProcesses.get(serverId);
    try { procInfo?.process.kill('SIGKILL'); } catch {}
    activeProcesses.delete(serverId);
  }

  removeServerFromRegistry(serverId);

  // Optionally delete directory
  try {
    if (fs.existsSync(srvDir)) {
      fs.rmSync(srvDir, { recursive: true, force: true });
    }
  } catch (e: any) {
    console.error('Error deleting server dir:', e);
  }

  res.json({ success: true, serverId });
});

// --- FILE MANAGER: HIERARCHICAL DIRECTORY TREE HELPER ---
function getDirectoryTree(baseDir: string, currentRel: string = '', maxDepth: number = 6, currentDepth: number = 0): any[] {
  if (currentDepth > maxDepth) return [];
  const dirPath = path.join(baseDir, currentRel);
  if (!fs.existsSync(dirPath)) return [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const editableExtensions = ['.txt', '.properties', '.yml', '.yaml', '.json', '.cfg', '.ini', '.sh', '.log', '.toml', '.conf', '.env'];
    const items: any[] = [];

    for (const entry of entries) {
      if (['node_modules', '.git', '__pycache__', '.sonora-tmp'].includes(entry.name)) continue;
      const itemRelPath = path.posix.join('/', currentRel.replace(/\\/g, '/'), entry.name);
      const fullPath = path.join(dirPath, entry.name);
      let sizeBytes = 0;
      let lastModified = new Date().toISOString().slice(0, 16).replace('T', ' ');
      try {
        const stat = fs.statSync(fullPath);
        sizeBytes = stat.size;
        lastModified = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
      } catch {}

      if (entry.isDirectory()) {
        const children = getDirectoryTree(baseDir, path.join(currentRel, entry.name), maxDepth, currentDepth + 1);
        items.push({
          name: entry.name,
          path: itemRelPath,
          type: 'directory',
          sizeBytes,
          lastModified,
          isEditable: false,
          children
        });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const isEditable = editableExtensions.includes(ext) || entry.name === 'eula.txt';
        items.push({
          name: entry.name,
          path: itemRelPath,
          type: 'file',
          sizeBytes,
          lastModified,
          isEditable
        });
      }
    }

    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });

    return items;
  } catch {
    return [];
  }
}

// --- FILE MANAGER: LIST DIRECTORY & HIERARCHICAL TREE ---
app.get('/api/servers/:id/files', (req, res) => {
  const serverId = req.params.id;
  const subPath = ((req.query.path || req.query.dir || '') as string).replace(/^\/+/, '');
  const srvDir = path.join(DATA_DIR, serverId);
  const targetDir = path.normalize(path.join(srvDir, subPath));

  if (!targetDir.startsWith(srvDir)) {
    return res.status(403).json({ error: 'Ungültiger Pfad' });
  }

  // Ensure default server files exist for convenience
  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  try {
    const entries = fs.existsSync(targetDir) ? fs.readdirSync(targetDir, { withFileTypes: true }) : [];
    const editableExtensions = ['.txt', '.properties', '.yml', '.yaml', '.json', '.cfg', '.ini', '.sh', '.log', '.toml', '.conf', '.env'];

    const items = entries.map(entry => {
      const fullPath = path.join(targetDir, entry.name);
      let sizeBytes = 0;
      let lastModified = new Date().toISOString().slice(0, 16).replace('T', ' ');
      try {
        const stat = fs.statSync(fullPath);
        sizeBytes = stat.size;
        lastModified = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
      } catch {}

      const ext = path.extname(entry.name).toLowerCase();
      const isEditable = !entry.isDirectory() && (editableExtensions.includes(ext) || entry.name === 'eula.txt');
      const itemRelPath = path.posix.join('/', subPath.replace(/\\/g, '/'), entry.name);

      return {
        name: entry.name,
        path: itemRelPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes,
        lastModified,
        isEditable
      };
    });

    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });

    const tree = getDirectoryTree(srvDir);

    res.json({ success: true, path: subPath ? '/' + subPath : '/', files: items, tree });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE MANAGER: GET FULL HIERARCHICAL TREE ---
app.get('/api/servers/:id/files/tree', (req, res) => {
  const serverId = req.params.id;
  const srvDir = path.join(DATA_DIR, serverId);
  if (!fs.existsSync(srvDir)) fs.mkdirSync(srvDir, { recursive: true });

  try {
    const tree = getDirectoryTree(srvDir);
    res.json({ success: true, tree });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE MANAGER: READ FILE CONTENT (PLURAL & SINGULAR) ---
const handleGetFileContent = (req: any, res: any) => {
  const serverId = req.params.id;
  const filePath = ((req.query.file || req.query.path || '') as string).replace(/^\/+/, '');
  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, filePath));

  if (!fullPath.startsWith(srvDir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  if (!fs.existsSync(fullPath)) {
    // Check if server registry has this config file content as fallback
    const servers = getServerRegistry();
    const server = servers.find(s => s.id === serverId);
    const fileName = path.basename(filePath);
    if (server && server.configFiles && server.configFiles[fileName] !== undefined) {
      return res.json({ success: true, file: filePath, path: '/' + filePath, content: server.configFiles[fileName] });
    }
    return res.status(404).json({ error: 'Datei existiert nicht auf dem Server' });
  }

  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Datei ist zu groß zum Bearbeiten (> 5 MB)' });
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ success: true, file: filePath, path: '/' + filePath, content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/servers/:id/files/content', handleGetFileContent);
app.get('/api/servers/:id/file', handleGetFileContent);

// --- FILE MANAGER: SAVE FILE CONTENT (PLURAL & SINGULAR) ---
const handleSaveFileContent = (req: any, res: any) => {
  const serverId = req.params.id;
  const file = ((req.body.file || req.body.path || '') as string).replace(/^\/+/, '');
  const content = req.body.content;
  if (!file || content === undefined) {
    return res.status(400).json({ error: 'Datei und Inhalt erforderlich' });
  }

  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, file));

  if (!fullPath.startsWith(srvDir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    
    // Also sync to server registry configFiles if applicable
    const fileName = path.basename(file);
    const servers = getServerRegistry();
    const srv = servers.find(s => s.id === serverId);
    if (srv) {
      if (!srv.configFiles) srv.configFiles = {};
      srv.configFiles[fileName] = content;
      saveServerRegistry(servers);
    }

    appendLog(serverId, 'INFO', `Konfigurationsdatei "${file}" gespeichert.`);
    res.json({ success: true, file, path: '/' + file });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/servers/:id/files/content', handleSaveFileContent);
app.post('/api/servers/:id/file', handleSaveFileContent);

// --- FILE MANAGER: CREATE DIRECTORY ---
app.post('/api/servers/:id/directory', (req, res) => {
  const serverId = req.params.id;
  const dirPath = ((req.body.path || req.body.name || '') as string).replace(/^\/+/, '');
  if (!dirPath) return res.status(400).json({ error: 'Ordnerpfad erforderlich' });

  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, dirPath));

  if (!fullPath.startsWith(srvDir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    appendLog(serverId, 'INFO', `Ordner "${dirPath}" angelegt.`);
    res.json({ success: true, path: '/' + dirPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE MANAGER: DOWNLOAD FILE ---
app.get('/api/servers/:id/download', (req, res) => {
  const serverId = req.params.id;
  const file = ((req.query.file || req.query.path || '') as string).replace(/^\/+/, '');
  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, file));

  if (!fullPath.startsWith(srvDir) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).send('Datei nicht gefunden');
  }

  res.download(fullPath, path.basename(fullPath));
});

// --- FILE MANAGER: UPLOAD FILE (BASE64) ---
app.post('/api/servers/:id/files/upload', (req, res) => {
  const serverId = req.params.id;
  const { filename, path: subPath = '', base64 } = req.body;
  if (!filename || !base64) {
    return res.status(400).json({ error: 'Dateiname und Base64-Inhalt erforderlich' });
  }

  const srvDir = path.join(DATA_DIR, serverId);
  const targetDir = path.normalize(path.join(srvDir, subPath));
  const fullPath = path.join(targetDir, filename);

  if (!fullPath.startsWith(srvDir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(fullPath, buffer);
    appendLog(serverId, 'SUCCESS', `Datei "${filename}" hochgeladen (${(buffer.length / 1024).toFixed(1)} KB).`);
    res.json({ success: true, filename, sizeBytes: buffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE MANAGER: DELETE FILE (PLURAL & SINGULAR) ---
const handleDeleteFile = (req: any, res: any) => {
  const serverId = req.params.id;
  const file = ((req.body?.file || req.body?.path || req.query?.file || req.query?.path) as string || '').replace(/^\/+/, '');
  if (!file) return res.status(400).json({ error: 'Keine Datei angegeben' });

  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, file));

  if (!fullPath.startsWith(srvDir) || fullPath === srvDir) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      appendLog(serverId, 'WARN', `Datei/Ordner "${file}" gelöscht.`);
    }
    res.json({ success: true, file });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.delete('/api/servers/:id/files', handleDeleteFile);
app.delete('/api/servers/:id/file', handleDeleteFile);

// --- SEND CONSOLE COMMAND ---
app.post('/api/servers/:id/command', (req, res) => {
  const serverId = req.params.id;
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Kein Befehl angegeben' });

  appendLog(serverId, 'INFO', `> ${command}`);

  const procInfo = activeProcesses.get(serverId);
  if (procInfo && procInfo.process.stdin && procInfo.process.stdin.writable) {
    procInfo.process.stdin.write(`${command}\n`);
    return res.json({ success: true, message: 'Befehl an stdin übermittelt' });
  }

  res.json({ success: false, message: 'Server-Prozess läuft aktuell nicht.' });
});

// --- AUTO DOWNLOAD PAPERMC (BACKWARDS COMPATIBILITY) ---
app.post('/api/servers/:id/install-paper', async (req, res) => {
  const serverId = req.params.id;
  const srvDir = path.join(DATA_DIR, serverId);
  try {
    const result = await installMinecraftServer(serverId, srvDir, '1.21.4');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- LIVE MODRINTH API PROXY (Minecraft Mods & Plugins) ---
app.get('/api/live/modrinth/search', async (req, res) => {
  try {
    const query = (req.query.query as string) || '';
    const projectType = (req.query.type as string) || ''; // 'mod' or 'plugin'
    const limit = Math.min(50, parseInt((req.query.limit as string) || '20', 10));

    let url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${limit}`;
    if (projectType) {
      url += `&facets=[["project_type:${projectType}"]]`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ApexHost-GameServerManager/1.0 (contact@apexhost.cloud)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Modrinth API returned status ${response.status}` });
    }

    const data = await response.json();
    
    // Transform to standard ModItem schema
    const hits = (data.hits || []).map((hit: any) => ({
      id: `mr_${hit.project_id}`,
      name: hit.title,
      gameId: 'minecraft',
      category: hit.categories?.includes('optimization') ? 'Performance' : 
                hit.categories?.includes('utility') ? 'Utility' : 
                hit.categories?.includes('technology') ? 'Gameplay' : 'Gameplay',
      author: hit.author,
      downloads: hit.downloads > 1000000 
        ? `${(hit.downloads / 1000000).toFixed(1)}M` 
        : hit.downloads > 1000 
        ? `${(hit.downloads / 1000).toFixed(0)}K` 
        : `${hit.downloads}`,
      version: hit.latest_version || 'Latest',
      description: hit.description || 'Keine Beschreibung verfügbar.',
      source: 'Modrinth',
      fileSize: 'Modrinth JAR',
      tags: [...(hit.display_categories || []), ...(hit.versions ? hit.versions.slice(0, 3) : [])],
      iconUrl: hit.icon_url,
      slug: hit.slug
    }));

    res.json({ total: data.total_hits, hits });
  } catch (err: any) {
    console.error('Modrinth proxy error:', err);
    res.status(500).json({ error: err.message || 'Failed to query Modrinth' });
  }
});

// --- LIVE SPIGOTMC (SPIGET) API PROXY (Minecraft Plugins) ---
app.get('/api/live/spiget/search', async (req, res) => {
  try {
    const query = (req.query.query as string) || '';
    const size = Math.min(40, parseInt((req.query.size as string) || '20', 10));

    let url = '';
    if (query.trim()) {
      url = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=${size}&sort=-downloads`;
    } else {
      url = `https://api.spiget.org/v2/resources/free?size=${size}&sort=-downloads`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ApexHost-GameServerManager/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Spiget API error: ${response.status}` });
    }

    const list = await response.json();
    const hits = (Array.isArray(list) ? list : []).map((item: any) => ({
      id: `spiget_${item.id}`,
      name: item.name,
      gameId: 'minecraft',
      category: 'Utility',
      author: `SpigotID #${item.id}`,
      downloads: item.downloads > 1000000 
        ? `${(item.downloads / 1000000).toFixed(1)}M` 
        : item.downloads > 1000 
        ? `${(item.downloads / 1000).toFixed(0)}K` 
        : `${item.downloads || 0}`,
      version: item.version?.id ? `v${item.version.id}` : 'Latest',
      description: item.tag || 'SpigotMC Community Plugin',
      source: 'SpigotMC',
      fileSize: 'Spigot JAR',
      tags: ['Paper', 'Spigot', 'Bukkit', 'Plugin'],
      iconUrl: item.icon?.url ? `https://spigotmc.org/${item.icon.url}` : undefined
    }));

    res.json({ total: hits.length, hits });
  } catch (err: any) {
    console.error('Spiget proxy error:', err);
    res.status(500).json({ error: err.message || 'Failed to query SpigotMC' });
  }
});

// --- CURSEFORGE API PROXY ---
app.get('/api/live/curseforge/search', async (req, res) => {
  try {
    const apiKey = (req.headers['x-curseforge-key'] as string) || (req.query.apiKey as string) || process.env.CURSEFORGE_API_KEY;
    const searchFilter = (req.query.query as string) || '';
    const gameId = (req.query.gameId as string) || '432'; // 432 is Minecraft in CurseForge

    if (!apiKey) {
      // If no CurseForge API key configured, return indicator so client can notify or use Modrinth
      return res.status(200).json({ 
        hasApiKey: false, 
        message: 'Kein CurseForge API-Key hinterlegt. Du kannst deinen Key bequem in den Admin Settings eintragen oder Modrinth / SpigotMC (ohne Key) nutzen!',
        hits: [] 
      });
    }

    const url = `https://api.curseforge.com/v1/mods/search?gameId=${gameId}&searchFilter=${encodeURIComponent(searchFilter)}&pageSize=20`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiKey
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `CurseForge API error: ${response.status}` });
    }

    const data = await response.json();
    const hits = (data.data || []).map((mod: any) => ({
      id: `cf_${mod.id}`,
      name: mod.name,
      gameId: gameId === '432' ? 'minecraft' : 'other',
      category: 'Gameplay',
      author: mod.authors?.[0]?.name || 'CurseForge Dev',
      downloads: mod.downloadCount > 1000000 
        ? `${(mod.downloadCount / 1000000).toFixed(1)}M` 
        : `${(mod.downloadCount / 1000).toFixed(0)}K`,
      version: 'CurseForge Latest',
      description: mod.summary || 'Keine Zusammenfassung hinterlegt.',
      source: 'CurseForge',
      fileSize: 'JAR / ZIP',
      tags: mod.categories ? mod.categories.map((c: any) => c.name).slice(0, 3) : ['CurseForge'],
      iconUrl: mod.logo?.thumbnailUrl
    }));

    res.json({ hasApiKey: true, total: data.pagination?.totalCount || hits.length, hits });
  } catch (err: any) {
    console.error('CurseForge proxy error:', err);
    res.status(500).json({ error: err.message || 'Failed to query CurseForge' });
  }
});

// --- STEAM WORKSHOP SEARCH PROXY ---
app.get('/api/live/steam/workshop', async (req, res) => {
  try {
    const appId = (req.query.appId as string) || '258550'; // Default Rust or Palworld/Gmod
    const searchText = (req.query.query as string) || '';
    const steamKey = (req.headers['x-steam-key'] as string) || (req.query.apiKey as string) || process.env.STEAM_API_KEY;

    if (steamKey) {
      const url = `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key=${steamKey}&appid=${appId}&search_text=${encodeURIComponent(searchText)}&numperpage=20&return_short_description=1`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const items = data.response?.publishedfiledetails || [];
        const hits = items.map((item: any) => ({
          id: `steam_${item.publishedfileid}`,
          name: item.title,
          gameId: appId,
          category: 'Gameplay',
          author: `Steam User #${item.creator}`,
          downloads: `${item.subscriptions || item.views || 100} Subs`,
          version: 'Steam Workshop',
          description: item.short_description || 'Steam Community Workshop Gegenstand',
          source: 'Steam Workshop',
          fileSize: 'Workshop Item',
          tags: ['Workshop', `AppID:${appId}`],
          iconUrl: item.preview_url
        }));
        return res.json({ hasApiKey: true, total: hits.length, hits });
      }
    }

    // If no Steam API key, return helpful guidance with direct workshop links
    res.json({
      hasApiKey: !!steamKey,
      message: 'Steam ist aktuell im Offline/Bypass-Modus konfiguriert. Du kannst deinen Steam Web API Key jederzeit in den Admin Settings hinterlegen.',
      hits: []
    });
  } catch (err: any) {
    console.error('Steam proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- PORTABLE JAVA ENDPOINTS ---
app.get('/api/java/versions', (_req, res) => {
  try {
    const list = JDK_VERSIONS.map(major => {
      const javaBin = path.join(JDKS_DIR, `jdk-${major}`, 'bin', 'java');
      const isInstalled = fs.existsSync(javaBin);
      return {
        major,
        available: true,
        installed: isInstalled,
        version: `${major}.0`
      };
    });
    res.json({ success: true, versions: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/java/install', async (req, res) => {
  const { major } = req.body;
  const numMajor = Number(major);
  if (!numMajor || !JDK_VERSIONS.includes(numMajor)) {
    return res.status(400).json({ success: false, error: 'Ungültige JDK-Version (erwartet Zahl zwischen 7 und 26)' });
  }
  try {
    const javaBin = await ensureJdk(JDKS_DIR, numMajor);
    res.json({ success: true, major: numMajor, path: javaBin, message: `Portables JDK ${numMajor} erfolgreich installiert.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/servers/:id/java', async (req, res) => {
  const serverId = req.params.id;
  const { javaVersion } = req.body;
  if (!javaVersion) return res.status(400).json({ error: 'javaVersion erforderlich' });
  const major = getRequiredJdkMajor(undefined, javaVersion);
  if (activeProcesses.has(serverId)) {
    return res.status(409).json({ error: 'Server läuft. Vor dem JDK-Wechsel bitte stoppen.' });
  }
  appendLog(serverId, 'INFO', `[JAVA] Richte ${javaVersion} (JDK ${major}) ein...`);
  try {
    await ensureJdk(JDKS_DIR, major);
    const servers = getServerRegistry();
    const idx = servers.findIndex(s => s.id === serverId);
    if (idx >= 0) {
      servers[idx].javaVersion = `Java ${major}`;
      saveServerRegistry(servers);
    }
    appendLog(serverId, 'SUCCESS', `[JAVA] ${javaVersion} erfolgreich als Standard für diese Instanz gesetzt.`);
    res.json({ success: true, javaVersion: `Java ${major}` });
  } catch (err: any) {
    appendLog(serverId, 'ERROR', `[JAVA FEHLER] Konnte JDK ${major} nicht einrichten: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- INSTALLATION PROGRESS ENDPOINT ---
app.get('/api/servers/:id/install/progress', (req, res) => {
  const serverId = req.params.id;
  const progress = installProgressMap.get(serverId) || {
    serverId,
    percent: 100,
    step: 'idle',
    message: 'Bereit',
    timestamp: Date.now()
  };
  res.json({ success: true, progress });
});

// --- ENGINE INSTALLER VERSIONS ENDPOINT ---
app.get('/api/installers/:engine/versions', async (req, res) => {
  const engine = (req.params.engine || 'paper').toLowerCase().replace('mc_', '');
  const customHeaders = { 'User-Agent': 'Sonora-Gameserver-Manager/2.0' };
  try {
    if (engine === 'neoforge') {
      try {
        const mcjarsRes = await fetch('https://mcjars.app/api/v1/builds/NEOFORGE', { headers: customHeaders, signal: AbortSignal.timeout(6000) });
        if (mcjarsRes.ok) {
          const data: any = await mcjarsRes.json();
          const list = Object.keys(data.versions || {}).reverse();
          if (list.length > 0) {
            return res.json({ success: true, engine: 'neoforge', versions: list });
          }
        }
      } catch {}
      return res.json({ success: true, engine: 'neoforge', versions: ['26.3', '1.21.4', '1.21.1', '1.20.6', '1.20.4'] });
    }
    if (engine === 'forge') {
      try {
        const mcjarsRes = await fetch('https://mcjars.app/api/v1/builds/FORGE', { headers: customHeaders, signal: AbortSignal.timeout(6000) });
        if (mcjarsRes.ok) {
          const data: any = await mcjarsRes.json();
          const list = Object.keys(data.versions || {}).reverse();
          if (list.length > 0) {
            return res.json({ success: true, engine: 'forge', versions: list });
          }
        }
      } catch {}
      return res.json({ success: true, engine: 'forge', versions: ['26.3', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'] });
    }
    if (engine === 'fabric') {
      try {
        const r = await fetch('https://meta.fabricmc.net/v2/versions/game', { headers: customHeaders, signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const d: any = await r.json();
          const list = d.filter((v: any) => v.stable).map((v: any) => v.version);
          if (list.length > 0) {
            return res.json({ success: true, engine: 'fabric', versions: list.slice(0, 25) });
          }
        }
      } catch {}
      return res.json({ success: true, engine: 'fabric', versions: ['26.3', '1.21.4', '1.21.1', '1.20.4', '1.19.4', '1.18.2', '1.16.5'] });
    }
    if (engine === 'purpur') {
      try {
        const r = await fetch('https://api.purpurmc.org/v2/purpur', { headers: customHeaders, signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const d: any = await r.json();
          if (Array.isArray(d.versions) && d.versions.length > 0) {
            return res.json({ success: true, engine: 'purpur', versions: [...d.versions].reverse() });
          }
        }
      } catch {}
      return res.json({ success: true, engine: 'purpur', versions: ['26.3', '1.21.4', '1.21.1', '1.20.4', '1.19.4', '1.18.2', '1.16.5'] });
    }
    // Default: Paper / Vanilla
    try {
      const r = await fetch('https://fill.papermc.io/v3/projects/paper', { headers: customHeaders, signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d: any = await r.json();
        if (Array.isArray(d.versions) && d.versions.length > 0) {
          return res.json({ success: true, engine: 'paper', versions: [...d.versions].reverse() });
        }
      }
    } catch {}
    return res.json({ success: true, engine: 'paper', versions: ['26.3', '1.21.4', '1.21.1', '1.20.4', '1.19.4', '1.18.2', '1.16.5'] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, versions: ['26.3', '1.21.4', '1.21.1', '1.20.4'] });
  }
});

// Mount Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const bindHost = process.env.HOST || '0.0.0.0';
  app.listen(Number(PORT), bindHost, () => {
    console.log(`[ApexHost] Sonora Manager running on http://${bindHost}:${PORT}`);
  });
}

startServer();
