import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import net from 'net';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Persistent servers root directory on the host
const DATA_DIR = process.env.APEXHOST_DATA_DIR || path.resolve(process.cwd(), 'data', 'servers');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[ApexHost] Could not create DATA_DIR:', e);
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
async function installMinecraftServer(serverId: string, srvDir: string, requestedVersion?: string): Promise<{ success: boolean; build: number; fileSizeMb: string; jarPath: string }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien...`);

  // Target version check
  let targetVer = requestedVersion || '1.21.4';
  if (targetVer.startsWith('26.') || targetVer === 'Latest' || targetVer === 'snapshot') {
    targetVer = '1.21.4'; // Fallback for snapshot / custom placeholders
  }

  appendLog(serverId, 'INFO', `[PAPERMC] Frage PaperMC API für Version ${targetVer} ab...`);
  let buildsRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${targetVer}/builds`);
  if (!buildsRes.ok) {
    appendLog(serverId, 'WARN', `Version ${targetVer} nicht direkt verfügbar. Verwende stabile PaperMC 1.21.4...`);
    targetVer = '1.21.4';
    buildsRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds`);
  }

  if (!buildsRes.ok) throw new Error(`PaperMC API antwortet mit Status ${buildsRes.status}`);
  const buildsData: any = await buildsRes.json();
  const latestBuild = buildsData.builds[buildsData.builds.length - 1];
  const buildNum = latestBuild.build;
  const downloadFileName = latestBuild.downloads.application.name;
  const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${targetVer}/builds/${buildNum}/downloads/${downloadFileName}`;

  appendLog(serverId, 'INFO', `[DOWNLOAD] Lade ${downloadFileName} (Build #${buildNum}) herunter...`);
  const jarRes = await fetch(downloadUrl);
  if (!jarRes.ok) throw new Error(`Download fehlgeschlagen mit Status ${jarRes.status}`);

  const buffer = Buffer.from(await jarRes.arrayBuffer());
  const jarPath = path.join(srvDir, 'paper.jar');
  fs.writeFileSync(jarPath, buffer);
  fs.writeFileSync(path.join(srvDir, 'server.jar'), buffer);
  fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Generated by ApexHost\neula=true\n', 'utf8');

  const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] PaperMC ${targetVer} Build #${buildNum} (${fileSizeMb} MB) installiert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt. Der Minecraft-Server ist nun startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return { success: true, build: buildNum, fileSizeMb, jarPath };
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
      if (code === 0 || code === null) {
        appendLog(serverId, 'SUCCESS', `[STEAMCMD] AppID ${steamAppId} erfolgreich heruntergeladen und einsatzbereit!`);

        // Set chmod 755 on binary files
        try {
          const files = fs.readdirSync(srvDir);
          for (const f of files) {
            if (f.endsWith('.sh') || f.includes('Server') || f.includes('Dedicated')) {
              try { fs.chmodSync(path.join(srvDir, f), 0o755); } catch {}
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
    const directPath = path.join(srvDir, clean);
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
    const full = path.join(srvDir, execName);
    if (fs.existsSync(full)) return full;
  }

  // Fallback: search for any .sh script in srvDir
  try {
    const entries = fs.readdirSync(srvDir);
    const shFile = entries.find(e => e.endsWith('.sh') && !e.includes('install') && !e.includes('steamcmd'));
    if (shFile) return path.join(srvDir, shFile);
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
    version
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

      // Check Java on host
      const javaCheck = await detectJava();
      if (!javaCheck.installed) {
        appendLog(serverId, 'ERROR', `========================================================================`);
        appendLog(serverId, 'ERROR', `[KRITISCHER FEHLER] Java Runtime (JDK/JRE) ist auf dem Host NICHT installiert!`);
        appendLog(serverId, 'WARN',  `Um Minecraft ausführen zu können, installiere Java 21 auf deinem Ubuntu-Server:`);
        appendLog(serverId, 'INFO',  `> Befehl: sudo apt update && sudo apt install -y openjdk-21-jre-headless`);
        appendLog(serverId, 'ERROR', `========================================================================`);
        return res.status(400).json({
          success: false,
          error: 'Java 21 ist auf diesem Dedicated Server nicht installiert.',
          solution: 'sudo apt update && sudo apt install -y openjdk-21-jre-headless',
          code: 'JAVA_MISSING'
        });
      }

      // Check for JAR file - AUTO-INSTALL IF MISSING!
      const potentialJars = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar'];
      let foundJar = potentialJars.find(j => fs.existsSync(path.join(srvDir, j)));

      if (!foundJar) {
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte automatische Installation von PaperMC...`);
        try {
          await installMinecraftServer(serverId, srvDir, version);
          foundJar = 'paper.jar';
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
        appendLog(serverId, 'INFO', `Führe aus: java -Xmx${ramGb}G -Xms1G -jar ${foundJar} nogui`);
        const child = spawn('java', [
          `-Xmx${ramGb}G`,
          `-Xms1G`,
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-jar',
          foundJar,
          'nogui'
        ], {
          cwd: srvDir,
          env: { ...process.env }
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
      let execPath = findGameExecutable(srvDir, executable);

      if (!execPath && steamAppId) {
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Game-Executable noch nicht vorhanden. Starte automatische SteamCMD Installation (AppID ${steamAppId})...`);
        const installed = await installSteamGameServer(serverId, srvDir, Number(steamAppId));
        if (installed) {
          execPath = findGameExecutable(srvDir, executable);
        }
      }

      if (!execPath) {
        appendLog(serverId, 'ERROR', `[FEHLER] Keine ausführbare Datei im Verzeichnis "${srvDir}" gefunden!`);
        appendLog(serverId, 'WARN', `Bitte klicke auf "Server installieren" in der Konsole, um die Spieldateien via SteamCMD herunterzuladen.`);
        return res.status(400).json({
          success: false,
          error: 'Keine ausführbare Server-Datei gefunden. Bitte zuerst den Server installieren.',
          code: 'EXEC_MISSING'
        });
      }

      try {
        fs.chmodSync(execPath, 0o755);
      } catch {}

      const rawArgs = startArgs || `-port=${port}`;
      const parsedArgs = rawArgs.split(' ').filter(Boolean);

      try {
        appendLog(serverId, 'INFO', `Führe aus: ${path.basename(execPath)} ${rawArgs}`);
        const child = spawn(execPath, parsedArgs, {
          cwd: srvDir,
          env: {
            ...process.env,
            LD_LIBRARY_PATH: `${srvDir}/linux64:${srvDir}:${process.env.LD_LIBRARY_PATH || ''}`
          }
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
          procInfo.process.kill('SIGTERM');
        }
      }, 3000);
      return res.json({ success: true, message: 'Stopp-Signal gesendet.' });
    } catch (e: any) {
      procInfo.process.kill('SIGKILL');
      activeProcesses.delete(serverId);
      return res.json({ success: true, message: 'Prozess beendet.' });
    }
  }

  if (action === 'restart') {
    // Stop then start
    const procInfo = activeProcesses.get(serverId);
    if (procInfo) {
      procInfo.process.kill('SIGTERM');
      activeProcesses.delete(serverId);
    }
    return res.json({ success: true, message: 'Neustart eingeleitet.' });
  }

  res.status(400).json({ error: 'Unbekannte Aktion' });
});

// --- UNIVERSAL SERVER INSTALLATION ENDPOINT ---
app.post('/api/servers/:id/install', async (req, res) => {
  const serverId = req.params.id;
  const { category = 'minecraft', version, steamAppId } = req.body;
  const srvDir = path.join(DATA_DIR, serverId);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  try {
    if (category === 'minecraft' || (!steamAppId && category !== 'survival' && category !== 'fps')) {
      const result = await installMinecraftServer(serverId, srvDir, version);
      return res.json({ message: 'Minecraft Paper Server erfolgreich installiert', ...result });
    } else {
      if (!steamAppId) {
        return res.status(400).json({ success: false, error: 'Keine steamAppId für Steam-Spiel übergeben' });
      }
      const success = await installSteamGameServer(serverId, srvDir, Number(steamAppId));
      return res.json({ success, message: success ? 'Steam Gameserver erfolgreich installiert' : 'Steam Installation fehlgeschlagen' });
    }
  } catch (err: any) {
    appendLog(serverId, 'ERROR', `Installation fehlgeschlagen: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
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

  if (server.category === 'minecraft') {
    const eulaPath = path.join(srvDir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) {
      fs.writeFileSync(eulaPath, '# Generated by ApexHost\neula=true\n', 'utf8');
    }
    const propsPath = path.join(srvDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      fs.writeFileSync(propsPath, `server-port=${server.port || 25565}\nmotd=§a${server.name || 'Minecraft Server'}§r\nonline-mode=true\nmax-players=${server.maxPlayers || 20}\n`, 'utf8');
    }
  }

  appendLog(serverId, 'INFO', `Server-Instanz "${server.name}" (${server.gameName || server.category}) bereitgestellt auf Node.`);

  if (autoInstall) {
    (async () => {
      try {
        if (server.category === 'minecraft' || (!server.steamAppId && server.category !== 'survival' && server.category !== 'fps')) {
          await installMinecraftServer(serverId, srvDir, server.version);
        } else if (server.steamAppId) {
          await installSteamGameServer(serverId, srvDir, Number(server.steamAppId));
        }
      } catch (err: any) {
        appendLog(serverId, 'ERROR', `Fehler beim automatischen Einrichten: ${err.message}`);
      }
    })();
  }

  res.json({ success: true, serverId, srvDir });
});

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

  app.listen(PORT, () => {
    console.log(`[ApexHost] Server running on http://localhost:${PORT}`);
  });
}

startServer();
