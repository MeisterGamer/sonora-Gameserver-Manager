import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import { createHash } from 'node:crypto';
import net from 'net';
import { configureAuth } from './backend/auth.ts';
import { configureFiles } from './backend/files.ts';
import { configureBackups } from './backend/backups.ts';
import { configureMods } from './backend/mods.ts';
import { confinedPath, instancePath, serverId as validateId, parseArguments, readFileTail } from './backend/paths.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// Persistent servers root directory on the host
const DATA_DIR = process.env.APEXHOST_DATA_DIR || path.resolve(process.cwd(), 'data', 'servers');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  throw new Error(`Could not create DATA_DIR: ${e}`);
}

const STATE_DIR = path.resolve(DATA_DIR, '..', 'manager');
configureAuth(app, STATE_DIR);
app.param('id', (req, res, next, value) => {
  try { instancePath(DATA_DIR, value); next(); }
  catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
});
// Express 4 does not forward rejected async handlers automatically.
for (const method of ['get', 'post', 'put', 'delete'] as const) {
  const register = app[method].bind(app);
  (app as any)[method] = (route: string, ...handlers: any[]) => register(route, ...handlers.map(handler =>
    (req: any, res: any, next: any) => Promise.resolve().then(() => handler(req, res, next)).catch(next)));
}
const registryFile = path.join(STATE_DIR, 'servers.json');
let registry: Record<string, any> = Object.assign(Object.create(null), fs.existsSync(registryFile) ? JSON.parse(fs.readFileSync(registryFile, 'utf8')) : {});
function saveRegistry() {
  const temp = registryFile + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(registry, null, 2), { mode: 0o600 });
  fs.renameSync(temp, registryFile);
}
const operations = new Set<string>();
let shuttingDown = false;
async function exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
  if (operations.has(id)) throw Object.assign(new Error('Für diese Instanz läuft bereits eine Aktion'), { status: 409 });
  operations.add(id);
  try { return await operation(); } finally { operations.delete(id); }
}

// In-memory process and log state
interface ServerProcessInfo {
  process: ChildProcess;
  pid: number;
  startTime: number;
  port: number;
  ramGb: number;
  state: 'starting' | 'running' | 'stopping';
  exited: Promise<void>;
}

const activeProcesses = new Map<string, ServerProcessInfo>();
const memoryLogBuffers = new Map<string, Array<{ id: string; timestamp: string; level: string; message: string }>>();

// Helper: Append log line to memory buffer and disk latest.log
function appendLog(serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) {
  message = message.slice(0, 8192);
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
    const srvDir = instancePath(DATA_DIR, serverId);
    const logsDir = confinedPath(srvDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = confinedPath(srvDir, 'logs/latest.log');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 10 * 1024 * 1024) {
      fs.renameSync(logFile, confinedPath(srvDir, 'logs/previous.log'));
    }
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
  if (process.platform !== 'linux') return null;
  const commonPaths = [
    '/usr/games/steamcmd',
    '/usr/bin/steamcmd',
    '/opt/steamcmd/steamcmd.sh',
    path.resolve(process.cwd(), 'steamcmd', 'steamcmd.sh'),
    path.resolve(DATA_DIR, '..', 'steamcmd', 'steamcmd.sh')
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Helper: Ensure SteamCMD is available, downloading portable version if needed
async function ensureSteamCmd(serverId?: string): Promise<string> {
  if (process.platform !== 'linux') throw new Error('SteamCMD-Adapter ist derzeit nur auf Linux implementiert');
  const existing = detectSteamCmd();
  if (existing) return existing;

  const targetDir = path.resolve(process.cwd(), 'steamcmd');
  const targetScript = path.join(targetDir, 'steamcmd.sh');
  if (fs.existsSync(targetScript)) return targetScript;

  if (serverId) {
    appendLog(serverId, 'INFO', '[STEAMCMD] SteamCMD nicht auf dem Host installiert. Lade offizielles Valve SteamCMD Portable herunter...');
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const archiveUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
  const res = await fetch(archiveUrl);
  if (!res.ok) throw new Error(`Download von SteamCMD fehlgeschlagen (Status ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const archivePath = path.join(targetDir, 'steamcmd_linux.tar.gz');
  fs.writeFileSync(archivePath, buffer);

  // Extract archive
  await new Promise<void>((resolve, reject) => {
    exec(`tar -xzf "${archivePath}" -C "${targetDir}"`, (err) => {
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

// Helper: Install Minecraft Paper Server JAR

async function installMinecraftServer(serverId: string, srvDir: string, version?: string) {
  if (!version || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Eine konkrete Paper-Version ist erforderlich');
  const headers = { 'User-Agent': 'Sonora-Manager/0.1 (https://github.com/MeisterGamer/sonora-Gameserver-Manager)' };
  const api = 'https://fill.papermc.io/v3/projects/paper/versions/' + version + '/builds';
  const response = await fetch(api, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Paper-Version nicht verfügbar (HTTP ' + response.status + '); kein Versionswechsel');
  const data: any = await response.json();
  const build = Array.isArray(data) ? data.find(entry => entry.channel === 'STABLE') : undefined;
  const application = build?.downloads?.['server:default'];
  if (!application?.url || !application.checksums?.sha256) throw new Error('Kein verifizierbarer stabiler Paper-Build verfügbar');
  const downloadUrl = new URL(application.url);
  if (downloadUrl.protocol !== 'https:' || downloadUrl.hostname !== 'fill-data.papermc.io' || downloadUrl.port || downloadUrl.username || downloadUrl.password) throw new Error('Paper-Downloadhost ungültig');
  const download = await fetch(downloadUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!download.ok) throw new Error('Paper-Download fehlgeschlagen');
  const buffer = Buffer.from(await download.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || createHash('sha256').update(buffer).digest('hex') !== application.checksums.sha256) throw new Error('Paper-Datei oder SHA-256 ungültig');
  const jarPath = confinedPath(srvDir, 'paper.jar');
  const temporary = confinedPath(srvDir, 'paper.jar.download');
  fs.writeFileSync(temporary, buffer);
  fs.renameSync(temporary, jarPath);
  appendLog(serverId, 'SUCCESS', 'Paper ' + version + ' Build ' + build.id + ' verifiziert und installiert');
  return { success: true, version, build: build.id, fileSizeMb: (buffer.length / 1048576).toFixed(1), jarPath };
}

// Helper: Install Steam Dedicated Server via SteamCMD
async function installSteamGameServer(serverId: string, srvDir: string, steamAppId: number): Promise<boolean> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[STEAMCMD] Starte Installation für Steam AppID ${steamAppId}...`);
  appendLog(serverId, 'INFO', `Zielverzeichnis: ${srvDir}`);

  let steamCmdBin: string;
  try {
    steamCmdBin = await ensureSteamCmd(serverId);
  } catch (e: any) {
    appendLog(serverId, 'ERROR', `[STEAMCMD FEHLER] SteamCMD konnte nicht bereitgestellt werden: ${e.message}`);
    appendLog(serverId, 'WARN', `Tipp: Führe auf Ubuntu 'sudo apt install -y steamcmd' aus.`);
    return false;
  }

  return new Promise((resolve) => {
    appendLog(serverId, 'INFO', `[STEAMCMD] Starte Download-Prozess via SteamCMD (dies kann einige Minuten dauern)...`);

    const child = spawn(steamCmdBin, [
      '+force_install_dir', srvDir,
      '+login', 'anonymous',
      '+app_update', String(steamAppId), 'validate',
      '+quit'
    ], {
      cwd: srvDir,
      env: { ...process.env }
    });

    child.stdout.on('data', (d) => {
      const lines = d.toString().split('\n');
      for (const line of lines) {
        const tr = line.trim();
        if (!tr) continue;
        if (tr.includes('progress:') || tr.includes('downloading') || tr.includes('Success!') || tr.includes('Update state') || tr.includes('Logging in') || tr.includes('Connecting')) {
          appendLog(serverId, 'INFO', `[STEAMCMD] ${tr}`);
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
        appendLog(serverId, 'SUCCESS', `[STEAMCMD] AppID ${steamAppId} erfolgreich heruntergeladen und einsatzbereit!`);

        // Set chmod 755 on binary files
        try {
          const files = fs.readdirSync(srvDir);
          for (const f of files) {
            if (f.endsWith('.sh') || f.includes('Server') || f.includes('Dedicated')) {
              try { fs.chmodSync(confinedPath(srvDir, f), 0o755); } catch {}
            }
          }
        } catch {}

        appendLog(serverId, 'INFO', `========================================================================`);
        resolve(true);
      } else {
        appendLog(serverId, 'ERROR', `[STEAMCMD] Installation beendet mit Code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      appendLog(serverId, 'ERROR', `[STEAMCMD Fehler] ${err.message}`);
      resolve(false);
    });
  });
}

// Helper: Find game binary in server directory
function findGameExecutable(srvDir: string, preferredExec?: string): string | null {
  if (preferredExec) {
    const clean = preferredExec.replace(/^\.\//, '');
    const directPath = confinedPath(srvDir, clean);
    if (fs.existsSync(directPath)) return directPath;
  }

  const commonExecs = [
    'PalServer.sh',
    'Pal/Binaries/Linux/PalServer-Linux-Test',
    'RustDedicated',
    'valheim_server.x86_64',
    'srcds_run',
    'ShooterGame/Binaries/Linux/ShooterGameServer',
    '7DaysToDieServer.x86_64',
    'start-server.sh',
    'FactoryServer.sh',
    'enshrouded_server'
  ];

  for (const execName of commonExecs) {
    const full = confinedPath(srvDir, execName);
    if (fs.existsSync(full)) return full;
  }

  // Fallback: search for any .sh script in srvDir
  try {
    const entries = fs.readdirSync(srvDir);
    const shFile = entries.find(e => e.endsWith('.sh') && !e.includes('install') && !e.includes('steamcmd'));
    if (shFile) return confinedPath(srvDir, shFile);
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
            return fs.statSync(instancePath(DATA_DIR, f)).isDirectory();
          } catch {
            return false;
          }
        });
      }
    } catch {}

    const serversStatus = serverDirs.map(id => {
      const dir = instancePath(DATA_DIR, id);
      const hasEula = fs.existsSync(path.join(dir, 'eula.txt'));
      const jarFiles = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar'].filter(j => fs.existsSync(path.join(dir, j)));
      const hasExec = !!findGameExecutable(dir);
      const logFile = confinedPath(dir, 'logs/latest.log');
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
        javaCommand: 'sudo apt update && sudo apt install -y openjdk-21-jre-headless',
        steamcmdCommand: 'sudo apt update && sudo apt install -y steamcmd',
        firewallCommand: 'sudo ufw allow 25565/tcp && sudo ufw reload',
        portsCheckCommand: 'ss -tulpn | grep 25565'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- SERVER LOGS ENDPOINT ---
app.get('/api/servers/:id/logs', (req, res) => {
  const serverId = req.params.id;
  const srvDir = instancePath(DATA_DIR, serverId);
  const logFile = confinedPath(srvDir, 'logs/latest.log');

  let fileLogs: Array<{ id: string; timestamp: string; level: string; message: string }> = [];

  // Read latest lines from disk if exists
  if (fs.existsSync(logFile)) {
    try {
      const raw = readFileTail(logFile);
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


const runtimeFile = path.join(STATE_DIR, 'runtime.json');
let runtime: Record<string, { pid: number }> = Object.assign(Object.create(null), fs.existsSync(runtimeFile) ? JSON.parse(fs.readFileSync(runtimeFile, 'utf8')) : {});
function saveRuntime() {
  fs.writeFileSync(runtimeFile + '.tmp', JSON.stringify(runtime), { mode: 0o600 });
  fs.renameSync(runtimeFile + '.tmp', runtimeFile);
}
function mayBeAlive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error: any) { return error.code !== 'ESRCH'; }
}
function registered(id: string) {
  if (!registry[id]) throw Object.assign(new Error('Instanz wurde im Backend noch nicht angelegt'), { status: 404 });
  return registry[id];
}
function validateDefinition(server: any) {
  validateId(server.id);
  if (typeof server.name !== 'string' || !server.name.trim() || server.name.length > 120) throw new Error('Instanzname muss 1 bis 120 Zeichen enthalten');
  if (!['minecraft', 'survival', 'fps', 'sandbox', 'rpg', 'simulation', 'strategy', 'coop', 'custom'].includes(server.category)) throw new Error('Ungültige Spielkategorie');
  if (!Number.isInteger(server.port) || server.port < 1024 || server.port > 65535) throw new Error('Port muss zwischen 1024 und 65535 liegen');
  if (!Number.isFinite(server.allocatedRamGb) || server.allocatedRamGb < 1 || server.allocatedRamGb > 128) throw new Error('RAM muss zwischen 1 und 128 GB liegen');
  if (server.steamAppId != null && (!Number.isSafeInteger(server.steamAppId) || server.steamAppId <= 0)) throw new Error('Ungültige Steam-AppID');
  const hostOS = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  if (server.targetOS && server.targetOS !== hostOS) throw new Error('Dieser lokale Manager führt ausschließlich auf ' + hostOS + ' aus');
  if (server.category === 'minecraft' && server.minecraftType && server.minecraftType !== 'paper') throw new Error('Automatische Installation unterstützt derzeit ausschließlich Paper');
  if (server.category !== 'minecraft' && process.platform !== 'linux') throw new Error('Native Steam-Spieladapter sind derzeit nur auf Linux implementiert');
  if (server.linuxExecutable) confinedPath(instancePath(DATA_DIR, server.id), server.linuxExecutable.replace(/^\.\//, ''));
  if (server.linuxStartArgs) parseArguments(server.linuxStartArgs);
}
async function installRegistered(id: string, version?: string) {
  const server = registered(id);
  validateDefinition(server);
  if (activeProcesses.has(id) || (runtime[id] && mayBeAlive(runtime[id].pid))) throw Object.assign(new Error('Server vor Installation/Update vollständig stoppen'), { status: 409 });
  const dir = instancePath(DATA_DIR, id);
  if (server.category === 'minecraft') {
    const result = await installMinecraftServer(id, dir, version || server.version);
    registry[id] = { ...server, version: result.version };
    saveRegistry();
    return result;
  }
  if (!server.steamAppId) throw new Error('Steam-AppID fehlt');
  if (!await installSteamGameServer(id, dir, server.steamAppId)) throw new Error('SteamCMD-Installation fehlgeschlagen');
  return { success: true };
}
async function startRegistered(id: string) {
  if (shuttingDown) throw Object.assign(new Error('Manager wird beendet'), { status: 503 });
  const existing = activeProcesses.get(id);
  if (existing) return { success: true, status: existing.state, pid: existing.pid };
  if (runtime[id] && mayBeAlive(runtime[id].pid)) throw Object.assign(new Error('Prozess aus vorheriger Manager-Sitzung möglicherweise noch aktiv; auf dem Host prüfen'), { status: 409 });
  delete runtime[id]; saveRuntime();
  const server = registered(id);
  validateDefinition(server);
  const dir = instancePath(DATA_DIR, id);
  let executable: string, args: string[];
  if (server.category === 'minecraft') {
    if (await checkPortInUse(server.port)) throw Object.assign(new Error('TCP-Port ist belegt'), { status: 409 });
    const java = await detectJava();
    const requiredJava = Number(server.version.split('.')[0]) >= 26 ? 25 : 21;
    if (!java.installed || Number(java.version.split('.')[0]) < requiredJava) throw new Error('Für diese Paper-Version ist Java ' + requiredJava + ' oder neuer erforderlich');
    const eula = confinedPath(dir, 'eula.txt');
    if (!fs.existsSync(eula) || !/^eula\s*=\s*true\s*$/m.test(fs.readFileSync(eula, 'utf8'))) throw new Error('Minecraft-EULA noch nicht ausdrücklich akzeptiert');
    const jar = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar'].find(name => fs.existsSync(confinedPath(dir, name)));
    if (!jar) throw new Error('Server-JAR fehlt; zuerst installieren');
    executable = 'java';
    args = ['-Xmx' + server.allocatedRamGb + 'G', '-Xms1G', '-XX:+UseG1GC', '-jar', jar, 'nogui'];
  } else {
    const foundExecutable = findGameExecutable(dir, server.linuxExecutable);
    if (!foundExecutable) throw new Error('Server-Executable fehlt; zuerst installieren');
    executable = foundExecutable;
    fs.chmodSync(executable, 0o755);
    args = parseArguments(server.linuxStartArgs || '-port=' + server.port);
  }
  appendLog(id, 'INFO', 'Starte Prozess für ' + server.name);
  if (shuttingDown) throw Object.assign(new Error('Manager wird beendet'), { status: 503 });
  const child = spawn(executable, args, { cwd: dir, env: { ...process.env } });
  let finish!: () => void;
  const info: ServerProcessInfo = { process: child, pid: child.pid || 0, port: server.port,
    ramGb: server.allocatedRamGb, startTime: Date.now(), state: 'starting',
    exited: new Promise<void>(resolve => { finish = resolve; }) };
  const clear = () => {
    if (activeProcesses.get(id) === info) { activeProcesses.delete(id); delete runtime[id]; saveRuntime(); }
    finish();
  };
  child.on('error', error => { appendLog(id, 'ERROR', 'Prozessfehler: ' + error.message); clear(); });
  child.on('close', (code, signal) => { appendLog(id, 'WARN', 'Prozess beendet: Code ' + code + ', Signal ' + signal); clear(); });
  child.stdout?.on('data', buffer => {
    for (const line of buffer.toString().split('\n')) if (line.trim()) {
      appendLog(id, 'INFO', line.trim());
      if (server.category === 'minecraft' && line.includes('Done (') && info.state === 'starting') info.state = 'running';
    }
  });
  child.stderr?.on('data', buffer => { for (const line of buffer.toString().split('\n')) if (line.trim()) appendLog(id, 'WARN', line.trim()); });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  info.pid = child.pid!;
  activeProcesses.set(id, info);
  runtime[id] = { pid: info.pid }; saveRuntime();
  if (server.category !== 'minecraft') info.state = 'running';
  return { success: true, status: info.state, pid: info.pid };
}
async function stopRegistered(id: string, force = false) {
  const info = activeProcesses.get(id);
  if (!info) {
    if (runtime[id] && mayBeAlive(runtime[id].pid)) throw Object.assign(new Error('Prozess gehört früherer Manager-Sitzung; auf dem Host prüfen'), { status: 409 });
    return { success: true, status: 'offline' };
  }
  info.state = 'stopping';
  if (force) info.process.kill('SIGKILL');
  else if (registered(id).category === 'minecraft' && info.process.stdin?.writable) info.process.stdin.write('stop\n');
  else info.process.kill('SIGTERM');
  const wait = (ms: number) => new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), ms);
    info.exited.then(() => { clearTimeout(timer); resolve(true); });
  });
  if (!await wait(force ? 3000 : 10000)) {
    info.process.kill('SIGKILL');
    if (!await wait(3000)) throw new Error('Prozessende konnte nicht bestätigt werden');
  }
  return { success: true, status: 'offline' };
}
app.get('/api/servers', (_req, res) => res.json({ success: true, servers: Object.values(registry).map((server: any) => {
  const info = activeProcesses.get(server.id);
  return { ...server, status: info?.state || (runtime[server.id] && mayBeAlive(runtime[server.id].pid) ? 'unknown' : 'offline'),
    uptimeSeconds: info ? Math.floor((Date.now() - info.startTime) / 1000) : 0,
    cpuUsagePercent: 0, ramUsageMb: 0, networkInKb: 0, networkOutKb: 0, currentPlayers: 0, tps: 0 };
}) }));
app.post('/api/servers/:id/power', async (req, res) => {
  const id = req.params.id;
  registered(id);
  const result = await exclusive(id, async () => {
    switch (req.body.action) {
      case 'start': return startRegistered(id);
      case 'stop': return stopRegistered(id);
      case 'kill': return stopRegistered(id, true);
      case 'restart': await stopRegistered(id); return startRegistered(id);
      default: throw Object.assign(new Error('Unbekannte Aktion'), { status: 400 });
    }
  });
  res.json(result);
});
app.post('/api/servers/:id/install', async (req, res) => res.json(await exclusive(req.params.id, () => installRegistered(req.params.id, req.body.version))));
app.post('/api/servers/create', async (req, res) => {
  const server = req.body.server;
  if (!server || typeof server !== 'object') throw new Error('Instanzdaten fehlen');
  validateDefinition(server);
  const dir = instancePath(DATA_DIR, server.id);
  if (registry[server.id] || fs.existsSync(dir)) throw Object.assign(new Error('Instanz-ID/Ordner bereits vorhanden; Daten werden nicht überschrieben'), { status: 409 });
  if (Object.values(registry).some((entry: any) => entry.port === server.port)) throw Object.assign(new Error('Port bereits zugewiesen'), { status: 409 });
  fs.mkdirSync(dir, { recursive: true });
  if (server.category === 'minecraft') {
    fs.writeFileSync(confinedPath(dir, 'eula.txt'), '# Read https://aka.ms/MinecraftEULA before accepting\neula=false\n');
    fs.writeFileSync(confinedPath(dir, 'server.properties'), 'server-port=' + server.port + '\nonline-mode=true\nmax-players=' + (Number.isInteger(server.maxPlayers) ? Math.max(1, Math.min(1000, server.maxPlayers)) : 20) + '\n');
  }
  registry[server.id] = { ...server, autoRestart: false, status: 'offline', installedMods: [], configFiles: {} };
  saveRegistry();
  appendLog(server.id, 'INFO', 'Instanz dauerhaft angelegt');
  let requiresInstall = true, installationError = '';
  if (req.body.autoInstall === true) {
    try { await exclusive(server.id, () => installRegistered(server.id)); requiresInstall = false; }
    catch (error: any) { installationError = error.message; appendLog(server.id, 'ERROR', installationError); }
  }
  res.status(201).json({ success: true, server: registry[server.id], serverId: server.id, requiresInstall, installationError });
});
app.delete('/api/servers/:id', async (req, res) => {
  const id = req.params.id;
  registered(id);
  await exclusive(id, async () => {
    await stopRegistered(id);
    const archived = path.join(STATE_DIR, 'deleted');
    fs.mkdirSync(archived, { recursive: true });
    const dir = instancePath(DATA_DIR, id);
    if (fs.existsSync(dir)) fs.renameSync(dir, path.join(archived, id + '-' + Date.now()));
    delete registry[id]; saveRegistry();
  });
  res.json({ success: true, message: 'Instanz entfernt; Dateien im lokalen Wiederherstellungsordner erhalten' });
});

// --- SEND CONSOLE COMMAND ---
app.post('/api/servers/:id/command', (req, res) => {
  const serverId = req.params.id;
  const { command } = req.body;
  if (typeof command !== 'string' || !command.trim() || command.length > 4096 || /[\r\n\0]/.test(command)) return res.status(400).json({ success: false, error: 'Ungültiger Konsolenbefehl' });

  appendLog(serverId, 'INFO', `> ${command}`);

  const procInfo = activeProcesses.get(serverId);
  if (procInfo && procInfo.process.stdin && procInfo.process.stdin.writable) {
    procInfo.process.stdin.write(`${command}\n`);
    return res.json({ success: true, message: 'Befehl an stdin übermittelt' });
  }

  res.status(409).json({ success: false, error: 'Server-Prozess läuft aktuell nicht.' });
});

// --- AUTO DOWNLOAD PAPERMC (BACKWARDS COMPATIBILITY) ---
app.post('/api/servers/:id/install-paper', async (req, res) => {
  const serverId = req.params.id;
  const srvDir = instancePath(DATA_DIR, serverId);
  try {
    const result = await exclusive(serverId, () => installRegistered(serverId, req.body.version));
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

// Mount Vite middleware in development or serve static in production
configureFiles(app, DATA_DIR, registered, exclusive);
const assertStopped = (id: string) => {
  registered(id);
  if (activeProcesses.has(id) || runtime[id] && mayBeAlive(runtime[id].pid)) throw Object.assign(new Error('Server für diese Dateiaktion zuerst vollständig stoppen'), { status: 409 });
};
configureBackups(app, DATA_DIR, STATE_DIR, registered, exclusive, assertStopped, saveRegistry);
configureMods(app, DATA_DIR, registered, saveRegistry, exclusive, assertStopped);
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'API-Funktion nicht vorhanden' }));
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error('[Sonora API]', error.message);
  if (!res.headersSent) res.status(error.status || 400).json({ success: false, error: error.message || 'Aktion fehlgeschlagen' });
});

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

  const httpServer = app.listen(Number(PORT), process.env.SONORA_BIND_HOST || '127.0.0.1', () => {
    console.log(`[ApexHost] Server running on http://localhost:${PORT}`);
  });
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => process.exit(1), 18000);
    await Promise.allSettled([...activeProcesses.keys()].map(id => stopRegistered(id)));
    httpServer.close(() => { clearTimeout(deadline); process.exit(0); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer();
