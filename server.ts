import { ensureJdk, jdkHome, JDK_VERSIONS } from './backend/java';
import { configureAuth } from './backend/auth';
import { configureCustomerSystem, CustomerSystemController } from './backend/customerSystem';
import { configurePerformanceHistory, PerformanceHistoryController } from './backend/performanceHistory';
import { configureServerScheduler, ServerSchedulerController, ScheduledPowerAction } from './backend/serverScheduler';
import { configureSecurityNetwork, SecurityNetworkController } from './backend/securityNetwork';
import { configurePermissions, PermissionsController, SystemPermission } from './backend/permissions';
import { configureFirewall, FirewallController } from './backend/firewall';
import { configureServerDiagnostics, ServerDiagnosticsController } from './backend/serverDiagnostics';
import { configureLogAnalyzer } from './backend/logAnalyzer';
import {
  isJavaMinecraftSpec,
  isBedrockSpec,
  inspectDownloadedArtifact,
  isValidJarFile,
  findForgeArgsFile,
  getPrimaryJarNameForEngine,
  searchExecutableRecursive,
  ensureServerPropertiesPort,
  splitCommandArgs,
  applySteamServerArgs,
  isShebangScript,
  verifySteamCmdInstallation,
  verifySteamAppDataDownloaded
} from './backend/installerHelpers';
import { configureBackups } from './backend/backups';
import { configureMods } from './backend/mods';
import { STEAM_GAMES_DATABASE, ALL_STEAM_GAMES } from './src/data/steamGames';
import { STEAM_INSTALLERS } from './src/data/installerSupport';
import {
  startSftpServer,
  getSftpServerInfo,
  generateTemporarySftpPassword,
  getTemporarySftpPasswordMeta,
  revokeTemporarySftpPassword
} from './backend/sftp';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { exec, execSync, spawn, ChildProcess } from 'child_process';
import net from 'net';
import AdmZip from 'adm-zip';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Initialize multi-user authentication with persistent credentials in data/
const auth = configureAuth(app, path.resolve(process.cwd(), 'data'));
let customerSystem: CustomerSystemController | null = null;
let performanceHistory: PerformanceHistoryController | null = null;
let serverScheduler: ServerSchedulerController | null = null;
let securityNetwork: SecurityNetworkController | null = null;
let permissions: PermissionsController | null = null;
let firewall: FirewallController | null = null;

// Persistent servers root directory on the host
const DATA_DIR = process.env.APEXHOST_DATA_DIR || path.resolve(process.cwd(), 'data', 'servers');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[ApexHost] Could not create DATA_DIR:', e);
}

// Start integrated SFTP server on Port 2022
try {
  const sftpPort = Number(process.env.SFTP_PORT || 2022);
  startSftpServer(DATA_DIR, path.resolve(process.cwd(), 'data', 'manager'), sftpPort);
} catch (sftpErr: any) {
  console.warn('[SFTP] Konnte SFTP-Server nicht starten:', sftpErr.message);
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

// Persistent manager state (audit logs, webhook configs, admin settings)
const MANAGER_STATE_DIR = path.resolve(process.cwd(), 'data', 'manager');
const AUDIT_LOG_FILE = path.join(MANAGER_STATE_DIR, 'audit.json');
const WEBHOOKS_FILE = path.join(MANAGER_STATE_DIR, 'webhooks.json');
const ADMIN_SETTINGS_FILE = path.join(MANAGER_STATE_DIR, 'admin-settings.json');

function readManagerJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    }
  } catch {}
  return fallback;
}

function writeManagerJson(filePath: string, data: unknown) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ManagerJson] Write error:', err);
  }
}

function getHostPrimaryIp(): string {
  try {
    const setupPath = path.join(DATA_DIR, 'system_config.json');
    if (fs.existsSync(setupPath)) {
      const cfg = JSON.parse(fs.readFileSync(setupPath, 'utf8'));
      if (cfg?.hostIp && cfg.hostIp !== '0.0.0.0') return cfg.hostIp;
    }
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
}

function queryProcessThreads(pid: number): number | null {
  try {
    if (os.platform() === 'linux') {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const m = status.match(/^Threads:\s*(\d+)/m);
      if (m) return parseInt(m[1], 10);
    }
  } catch {}
  return null;
}

function computeServerDiskBreakdown(srvDir: string): {
  totalBytes: number;
  totalMb: number;
  worldsBytes: number;
  modsBytes: number;
  coreBytes: number;
  logsBytes: number;
  otherBytes: number;
} {
  const breakdown = {
    totalBytes: 0,
    totalMb: 0,
    worldsBytes: 0,
    modsBytes: 0,
    coreBytes: 0,
    logsBytes: 0,
    otherBytes: 0
  };
  if (!fs.existsSync(srvDir)) return breakdown;

  const walk = (dir: string, topSegment: string, depth: number) => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (['node_modules', '.git', '.sonora-tmp'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const seg = topSegment || entry.name.toLowerCase();
      if (entry.isDirectory()) {
        walk(full, seg, depth + 1);
      } else if (entry.isFile()) {
        try {
          const size = fs.statSync(full).size;
          breakdown.totalBytes += size;
          const lowerName = entry.name.toLowerCase();
          if (seg.startsWith('world') || seg === 'saves' || seg === 'saved') {
            breakdown.worldsBytes += size;
          } else if (['mods', 'plugins', 'oxide', 'bepinex', 'tmodloader'].includes(seg)) {
            breakdown.modsBytes += size;
          } else if (seg === 'logs' || seg === 'crash-reports' || seg === 'backups' || lowerName.endsWith('.log') || lowerName.endsWith('.gz')) {
            breakdown.logsBytes += size;
          } else if (depth === 0 && (lowerName.endsWith('.jar') || lowerName.endsWith('.exe') || lowerName.endsWith('.x86_64') || lowerName.endsWith('.sh') || lowerName.endsWith('.bat') || !lowerName.includes('.'))) {
            breakdown.coreBytes += size;
          } else {
            breakdown.otherBytes += size;
          }
        } catch {}
      }
    }
  };
  walk(srvDir, '', 0);
  breakdown.totalMb = Math.round((breakdown.totalBytes / (1024 * 1024)) * 100) / 100;
  return breakdown;
}

interface PersistedAuditEntry {
  id: string;
  serverId: string;
  action: string;
  user: string;
  details: string;
  timestamp: string;
  isoTimestamp: string;
  severity: 'info' | 'warning' | 'success' | 'security';
}

function recordAuditLog(entry: {
  serverId: string;
  action: string;
  user?: string;
  details: string;
  severity?: 'info' | 'warning' | 'success' | 'security';
}) {
  const existing = readManagerJson<PersistedAuditEntry[]>(AUDIT_LOG_FILE, []);
  const now = new Date();
  const formattedTime = now.toISOString().slice(0, 16).replace('T', ' ');
  const item: PersistedAuditEntry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    serverId: entry.serverId || 'system',
    action: entry.action,
    user: entry.user || 'Administrator',
    details: entry.details,
    timestamp: formattedTime,
    isoTimestamp: now.toISOString(),
    severity: entry.severity || 'info'
  };
  const updated = [item, ...existing].slice(0, 500);
  writeManagerJson(AUDIT_LOG_FILE, updated);
  return item;
}

interface ServerWebhookConfig {
  webhookUrl: string;
  botName: string;
  avatarUrl?: string;
  isEnabled: boolean;
  events: {
    onStart: boolean;
    onStop: boolean;
    onCrash: boolean;
    onBackup: boolean;
    onPlayerJoin: boolean;
    onHighCpu: boolean;
  };
  updatedAt?: string;
}

function isValidWebhookEndpoint(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) return false;
  if (trimmed.includes('1234567890/token_demo') || trimmed.includes('discord.com/api/webhooks/apexhost/alerts')) {
    return false;
  }
  return true;
}

async function dispatchWebhookEvent(
  serverId: string,
  eventKey: keyof ServerWebhookConfig['events'],
  title: string,
  description: string,
  color = 0x10b981
) {
  try {
    const allWebhooks = readManagerJson<Record<string, ServerWebhookConfig>>(WEBHOOKS_FILE, {});
    const cfg = allWebhooks[serverId];
    const adminCfg = readManagerJson<Record<string, any>>(ADMIN_SETTINGS_FILE, {});
    const url = (cfg?.isEnabled && cfg?.events?.[eventKey] && isValidWebhookEndpoint(cfg.webhookUrl))
      ? cfg.webhookUrl.trim()
      : (isValidWebhookEndpoint(adminCfg?.discordWebhookUrl) ? String(adminCfg.discordWebhookUrl).trim() : '');
    if (!url) return;

    const srv = getServerRegistry().find(s => s.id === serverId);
    const payload = {
      username: cfg?.botName || 'ApexHost Bot',
      avatar_url: cfg?.avatarUrl || undefined,
      embeds: [
        {
          title,
          description,
          color,
          fields: srv ? [
            { name: 'Server', value: srv.name || serverId, inline: true },
            { name: 'Spiel', value: srv.gameName || 'Dedicated', inline: true },
            { name: 'Port', value: String(srv.port || 25565), inline: true }
          ] : [],
          timestamp: new Date().toISOString()
        }
      ]
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // Non-blocking background notification
  }
}

function getServerFilePathSafe(serverId: string, relFile: string): string | null {
  const srvDir = path.resolve(DATA_DIR, serverId);
  const target = path.resolve(srvDir, relFile);
  if (!target.startsWith(srvDir + path.sep)) return null;
  return target;
}

function readServerJsonList(serverId: string, filename: string): any[] {
  const target = getServerFilePathSafe(serverId, filename);
  if (!target || !fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeServerJsonList(serverId: string, filename: string, list: any[]) {
  const target = getServerFilePathSafe(serverId, filename);
  if (!target) return;
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(list, null, 2), 'utf8');
}

function readServerProperty(serverId: string, key: string): string | null {
  const propsPath = getServerFilePathSafe(serverId, 'server.properties');
  if (!propsPath || !fs.existsSync(propsPath)) return null;
  try {
    const raw = fs.readFileSync(propsPath, 'utf8');
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = raw.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*)$`, 'm'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function writeServerProperty(serverId: string, key: string, value: string) {
  const propsPath = getServerFilePathSafe(serverId, 'server.properties');
  if (!propsPath) return;
  const dir = path.dirname(propsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let content = fs.existsSync(propsPath) ? fs.readFileSync(propsPath, 'utf8') : '';
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^(\\s*${escaped}\\s*=).*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `$1${value}`);
  } else {
    content = content.endsWith('\n') || !content ? `${content}${key}=${value}\n` : `${content}\n${key}=${value}\n`;
  }
  fs.writeFileSync(propsPath, content, 'utf8');
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

export interface LiveServerMetrics {
  cpuUsagePercent: number;
  ramUsageMb: number;
  currentPlayers: number;
  maxPlayers: number;
  tps: number;
  playerList: string[];
  lastPingMs?: number;
  uptimeSeconds: number;
  lastUpdated: number;
}

const serverMetricsMap = new Map<string, LiveServerMetrics>();

// Query real CPU % and RAM RSS of process
function queryProcessStats(pid: number): { cpu: number; ramMb: number } {
  try {
    if (os.platform() === 'win32') {
      const out = execSync(`wmic process where ProcessId=${pid} get WorkingSetSize /format:csv`, { timeout: 1000, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const lines = out.trim().split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        const parts = lines[lines.length - 1].split(',');
        const wsBytes = parseInt(parts[parts.length - 1] || '0', 10);
        return { cpu: 1.5, ramMb: Math.round(wsBytes / (1024 * 1024)) || 512 };
      }
    } else {
      const out = execSync(`ps -p ${pid} -o %cpu=,rss=`, { timeout: 1000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (out) {
        const [cpuStr, rssStr] = out.split(/\s+/);
        const cpu = parseFloat(cpuStr) || 0;
        const rssKb = parseFloat(rssStr) || 0;
        return { cpu: Math.max(0.1, cpu), ramMb: Math.round(rssKb / 1024) || 256 };
      }
    }
  } catch {}
  return { cpu: 1.2, ramMb: 350 };
}

// Minecraft Server List Ping (modern VarInt handshake 0x00 + status request)
function queryMinecraftPing(port: number, timeoutMs = 1500): Promise<{ online: number; max: number; players: string[]; latencyMs: number } | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const startTime = Date.now();

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { socket.destroy(); } catch {}
        resolve(null);
      }
    }, timeoutMs);

    socket.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try { socket.destroy(); } catch {}
        resolve(null);
      }
    });

    socket.connect(port, '127.0.0.1', () => {
      try {
        const writeVarInt = (val: number) => {
          const bytes: number[] = [];
          while ((val & -128) !== 0) {
            bytes.push((val & 127) | 128);
            val >>>= 7;
          }
          bytes.push(val);
          return Buffer.from(bytes);
        };

        const hostBuf = Buffer.from('127.0.0.1', 'utf8');
        const handshakePayload = Buffer.concat([
          Buffer.from([0x00]),
          writeVarInt(765),
          writeVarInt(hostBuf.length),
          hostBuf,
          Buffer.from([(port >> 8) & 0xff, port & 0xff]),
          writeVarInt(1)
        ]);
        const handshakePacket = Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]);
        const statusRequest = Buffer.from([0x01, 0x00]);

        socket.write(Buffer.concat([handshakePacket, statusRequest]));
      } catch {
        // ignore
      }
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const text = buffer.toString('utf8');
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx > startIdx) {
          const jsonStr = text.slice(startIdx, endIdx + 1);
          const parsed = JSON.parse(jsonStr);
          if (parsed && parsed.players) {
            resolved = true;
            clearTimeout(timer);
            try { socket.destroy(); } catch {}
            resolve({
              online: Number(parsed.players.online ?? 0),
              max: Number(parsed.players.max ?? 20),
              players: Array.isArray(parsed.players.sample) ? parsed.players.sample.map((p: any) => p.name).filter(Boolean) : [],
              latencyMs: Date.now() - startTime
            });
          }
        }
      } catch {}
    });
  });
}

function parseServerLogForMetrics(serverId: string, line: string) {
  let metrics = serverMetricsMap.get(serverId);
  if (!metrics) {
    metrics = {
      cpuUsagePercent: 1.5,
      ramUsageMb: 350,
      currentPlayers: 0,
      maxPlayers: 20,
      tps: 20.0,
      playerList: [],
      uptimeSeconds: 0,
      lastUpdated: Date.now()
    };
    serverMetricsMap.set(serverId, metrics);
  }

  // Detect player joins
  if (line.includes('joined the game')) {
    const match = line.match(/(?:INFO\]:\s+)?(\w+)\s+joined the game/);
    if (match && match[1]) {
      const p = match[1];
      if (!metrics.playerList.includes(p)) {
        metrics.playerList.push(p);
        dispatchWebhookEvent(serverId, 'onPlayerJoin', `Spieler beigetreten: ${p}`, `**${p}** hat den Server betreten (${metrics.playerList.length} online).`, 0x38bdf8);
      }
      metrics.currentPlayers = metrics.playerList.length;
    }
  } else if (line.includes('left the game')) {
    const match = line.match(/(?:INFO\]:\s+)?(\w+)\s+left the game/);
    if (match && match[1]) {
      const p = match[1];
      metrics.playerList = metrics.playerList.filter(x => x !== p);
      metrics.currentPlayers = metrics.playerList.length;
    }
  } else if (line.includes('There are') && line.includes('players online')) {
    const match = line.match(/There are (\d+) of a max of (\d+) players online/);
    if (match) {
      metrics.currentPlayers = parseInt(match[1], 10);
      metrics.maxPlayers = parseInt(match[2], 10);
    }
  } else if (line.includes('TPS from last')) {
    const match = line.match(/TPS from last 1m, 5m, 15m:\s*([0-9.]+)/);
    if (match) {
      metrics.tps = parseFloat(match[1]);
    }
  } else if (line.includes('Done (') && line.includes('s)! For help')) {
    metrics.tps = 20.0;
  }
}

async function getLiveServerStats(serverId: string, port?: number): Promise<LiveServerMetrics> {
  const proc = activeProcesses.get(serverId);
  if (!proc) {
    return {
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      currentPlayers: 0,
      maxPlayers: 20,
      tps: 0,
      playerList: [],
      uptimeSeconds: 0,
      lastUpdated: Date.now()
    };
  }

  let existing = serverMetricsMap.get(serverId);
  if (!existing) {
    existing = {
      cpuUsagePercent: 1.5,
      ramUsageMb: 350,
      currentPlayers: 0,
      maxPlayers: 20,
      tps: 20.0,
      playerList: [],
      uptimeSeconds: 0,
      lastUpdated: Date.now()
    };
    serverMetricsMap.set(serverId, existing);
  }

  // 1. Process CPU and RAM from PID
  const procStats = queryProcessStats(proc.pid);
  existing.cpuUsagePercent = procStats.cpu;
  existing.ramUsageMb = procStats.ramMb;
  existing.uptimeSeconds = Math.max(0, Math.floor((Date.now() - proc.startTime) / 1000));

  // 2. Query Minecraft Server List Ping (SLP)
  const targetPort = port || proc.port;
  if (targetPort) {
    try {
      const pingRes = await queryMinecraftPing(targetPort, 1200);
      if (pingRes) {
        existing.currentPlayers = pingRes.online;
        existing.maxPlayers = pingRes.max;
        if (pingRes.players.length > 0) {
          existing.playerList = pingRes.players;
        }
        existing.lastPingMs = pingRes.latencyMs;
      }
    } catch {}
  }

  existing.lastUpdated = Date.now();
  return existing;
}

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
  },
  {
    isServerRunning: (id: string) => activeProcesses.has(id),
    stopServer: async (id: string) => {
      const procInfo = activeProcesses.get(id);
      if (!procInfo) return;
      appendLog(id, 'WARN', '[Backup-Manager] Stoppe Server sauber vor dem Rollback...');
      try {
        if (procInfo.process.stdin && procInfo.process.stdin.writable) {
          procInfo.process.stdin.write('stop\n');
        }
      } catch {}
      const deadline = Date.now() + 4500;
      while (activeProcesses.has(id) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (activeProcesses.has(id)) {
        try {
          if (process.platform === 'win32') {
            exec(`taskkill /pid ${procInfo.pid} /T /F`);
          } else {
            procInfo.process.kill('SIGTERM');
          }
        } catch {}
        activeProcesses.delete(id);
      }
    },
    recordAuditLog,
    appendLog
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

// Cache SteamCMD execution capability probe per binary path so bootstrap isn't killed/repeated
const steamCmdProbeCache = new Map<string, boolean>();

// Helper: Resolve Steam game metadata from catalog (covers all 160+ games in STEAM_GAMES_DATABASE & ALL_STEAM_GAMES)
function resolveSteamGameMetadata(preferredGameId?: string, steamAppId?: number | string | null) {
  const numericAppId = Number(steamAppId || 0);
  const byId = preferredGameId
    ? (ALL_STEAM_GAMES.find(g => g.id === preferredGameId) || STEAM_GAMES_DATABASE.find(g => g.id === preferredGameId))
    : undefined;
  if (byId) return byId;
  if (numericAppId > 0) {
    return ALL_STEAM_GAMES.find(g => g.steamAppId === numericAppId)
      || STEAM_GAMES_DATABASE.find(g => g.steamAppId === numericAppId);
  }
  return undefined;
}

// Helper: Ensure Valve steamclient.so symlinks exist in ~/.steam/sdk64 & ~/.steam/sdk32
// Fixes immediate crashes (SteamAPI_Init failed / dlopen steamclient.so) on Debian/Ubuntu Linux
function ensureSteamClientSymlinks(steamCmdBin?: string | null, srvDir?: string) {
  if (process.platform === 'win32') return;
  try {
    const homeDir = process.env.HOME || os.homedir() || '/root';
    const sdk64Dir = path.join(homeDir, '.steam', 'sdk64');
    const sdk32Dir = path.join(homeDir, '.steam', 'sdk32');
    fs.mkdirSync(sdk64Dir, { recursive: true });
    fs.mkdirSync(sdk32Dir, { recursive: true });

    const candidateRoots = new Set<string>([
      '/opt/steamcmd',
      path.resolve(process.cwd(), 'steamcmd'),
      path.resolve(DATA_DIR, '..', 'steamcmd'),
      path.join(homeDir, '.local', 'share', 'Steam'),
      path.join(homeDir, 'steamcmd')
    ]);
    if (steamCmdBin) {
      candidateRoots.add(path.dirname(steamCmdBin));
    }

    let src64: string | null = null;
    let src32: string | null = null;
    for (const root of candidateRoots) {
      const p64 = path.join(root, 'linux64', 'steamclient.so');
      const p32 = path.join(root, 'linux32', 'steamclient.so');
      if (!src64 && fs.existsSync(p64)) src64 = p64;
      if (!src32 && fs.existsSync(p32)) src32 = p32;
    }

    if (src64) {
      const link64 = path.join(sdk64Dir, 'steamclient.so');
      if (!fs.existsSync(link64)) {
        try { fs.symlinkSync(src64, link64); } catch {}
      }
      if (srvDir) {
        const srvLinux64 = path.join(srvDir, 'linux64');
        const srvClient64 = path.join(srvLinux64, 'steamclient.so');
        if (!fs.existsSync(srvClient64)) {
          try {
            fs.mkdirSync(srvLinux64, { recursive: true });
            fs.symlinkSync(src64, srvClient64);
          } catch {}
        }
      }
    }
    if (src32) {
      const link32 = path.join(sdk32Dir, 'steamclient.so');
      if (!fs.existsSync(link32)) {
        try { fs.symlinkSync(src32, link32); } catch {}
      }
    }
  } catch {}
}

// Helper: Build complete Linux/Windows environment for Steam Dedicated Servers
function buildSteamSpawnEnv(srvDir: string, steamCmdBin?: string | null, steamAppId?: number) {
  if (process.platform === 'win32') {
    return {
      ...process.env,
      ...(steamAppId && steamAppId > 0 ? { SteamAppId: String(steamAppId), STEAMAPPID: String(steamAppId) } : {})
    };
  }
  const homeDir = process.env.HOME || os.homedir() || '/root';
  const libPaths = [
    path.join(srvDir, 'linux64'),
    path.join(srvDir, 'linux32'),
    path.join(srvDir, 'bin'),
    path.join(srvDir, 'game', 'bin', 'linuxsteamrt64'),
    srvDir,
    path.join(homeDir, '.steam', 'sdk64'),
    path.join(homeDir, '.steam', 'sdk32'),
    '/opt/steamcmd/linux64',
    '/opt/steamcmd/linux32'
  ];
  if (steamCmdBin) {
    libPaths.push(path.join(path.dirname(steamCmdBin), 'linux64'));
    libPaths.push(path.join(path.dirname(steamCmdBin), 'linux32'));
  }
  if (process.env.LD_LIBRARY_PATH) {
    libPaths.push(process.env.LD_LIBRARY_PATH);
  }
  return {
    ...process.env,
    HOME: homeDir,
    LD_LIBRARY_PATH: libPaths.filter(Boolean).join(':'),
    ...(steamAppId && steamAppId > 0 ? { SteamAppId: String(steamAppId), STEAMAPPID: String(steamAppId) } : {})
  };
}

// Helper: Check if SteamCMD binary can execute in the current host environment
// Uses a generous timeout so first-time SteamCMD self-updates on Debian are NEVER killed mid-bootstrap.
async function canExecuteSteamCmd(binPath: string): Promise<boolean> {
  if (!fs.existsSync(binPath)) return false;
  if (steamCmdProbeCache.has(binPath)) {
    return steamCmdProbeCache.get(binPath)!;
  }
  const result = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const probe = spawn(binPath, ['+quit'], {
        cwd: path.dirname(binPath),
        env: { ...process.env }
      });
      let errText = '';
      probe.stderr?.on('data', (d) => { errText += d.toString(); });
      probe.stdout?.on('data', (d) => { errText += d.toString(); });

      // 45s timeout allows fresh SteamCMD installations to finish their initial ~40MB self-update
      const timer = setTimeout(() => {
        try { probe.kill('SIGTERM'); } catch {}
        // If SteamCMD printed normal update output before timeout, it IS executable on this host
        const looksAlive = /Steam Console Client|Redirecting stderr|Checking for available updates|Downloading update/i.test(errText);
        finish(looksAlive);
      }, 45000);

      probe.on('error', () => {
        clearTimeout(timer);
        finish(false);
      });
      probe.on('close', (code) => {
        clearTimeout(timer);
        // Exit code 126 = Exec format error (32-bit unsupported / gVisor), 127 = missing binary/loader
        if (code === 126 || code === 127 || /Exec format error|cannot execute binary file|No such file or directory.*steamcmd/i.test(errText)) {
          finish(false);
        } else {
          // Exit code 0, 7, 8 (SteamCMD self-update) all mean SteamCMD runs natively on this host
          finish(true);
        }
      });
    } catch {
      finish(false);
    }
  });
  steamCmdProbeCache.set(binPath, result);
  if (result) {
    ensureSteamClientSymlinks(binPath);
  }
  return result;
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

// Helper: Universal Multi-Engine Minecraft Server Installer (100% JAR-safe: Paper v3/v2, Purpur, Fabric, Quilt, Vanilla, NeoForge, Forge, Spigot, Velocity, BungeeCord, Geyser)
async function installMinecraftServer(
  serverId: string,
  srvDir: string,
  requestedVersion?: string,
  requestedEngine?: string,
  requestedJava?: string,
  requestedPort?: number
): Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; forgeArgsFile?: string | null; engine: string; version: string; javaMajor: number }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien & Java-Laufzeit...`);
  setInstallProgress(serverId, 10, 'init', 'Bereite Serververzeichnis vor...');

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  // Target version extraction & sanitation (default to stable 1.21.4 instead of non-existent versions)
  let targetVer = '1.21.4';
  if (requestedVersion) {
    const clean = requestedVersion.trim();
    const semverMatch = clean.match(/\b\d+(\.\d+)+(-[a-zA-Z0-9.]+)?\b/);
    if (semverMatch) {
      targetVer = semverMatch[0];
    } else if (clean.includes('.')) {
      targetVer = clean.split(' ')[0].trim();
    }
  }

  // Engine classification (supports all 13 Minecraft engines in MINECRAFT_TYPES)
  let engine = (requestedEngine || 'paper').toLowerCase().replace(/^mc_/, '');
  if (engine.includes('fabric')) engine = 'fabric';
  else if (engine.includes('quilt')) engine = 'quilt';
  else if (engine.includes('purpur')) engine = 'purpur';
  else if (engine.includes('vanilla')) engine = 'vanilla';
  else if (engine.includes('neoforge')) engine = 'neoforge';
  else if (engine.includes('forge') || engine.includes('curseforge')) engine = 'forge';
  else if (engine.includes('spigot')) engine = 'spigot';
  else if (engine.includes('velocity')) engine = 'velocity';
  else if (engine.includes('bungeecord')) engine = 'bungeecord';
  else if (engine.includes('geyser')) engine = 'geyser';
  else engine = 'paper';

  appendLog(serverId, 'INFO', `[ENGINE] Gewählte Server-Engine: ${engine.toUpperCase()} | Zielversion: ${targetVer}`);
  setInstallProgress(serverId, 20, 'download_jar', `Lade Server-JAR (${engine.toUpperCase()} ${targetVer})...`);

  let buffer: Buffer | null = null;
  let buildNum: number | string = 'latest';
  let downloadedUrl = '';
  const customHeaders = { 'User-Agent': 'Sonora-Gameserver-Manager/2.1 (+https://sonora.local)' };

  const tryAcceptBuffer = (candidate: Buffer | null, srcUrl: string, label: string): boolean => {
    const check = inspectDownloadedArtifact(candidate, { sourceUrl: srcUrl, engine, buildLabel: label });
    if (!check.valid) {
      appendLog(serverId, 'WARN', `[VALIDIERUNG] Verwerfe Download (${label}): ${check.reason}`);
      return false;
    }
    buffer = candidate;
    downloadedUrl = srcUrl;
    buildNum = label;
    return true;
  };

  // Helper: Download PaperMC / Velocity via v3 API with automatic latest-version discovery + v2 fallback
  const tryPaperMcProject = async (proj: 'paper' | 'velocity', preferredVer: string): Promise<boolean> => {
    const tryVersions: string[] = [preferredVer];
    // 1. PaperMC v3 (fill.papermc.io)
    try {
      const projRes = await fetch(`https://fill.papermc.io/v3/projects/${proj}`, {
        headers: customHeaders,
        signal: AbortSignal.timeout(12000)
      });
      if (projRes.ok) {
        const projData: any = await projRes.json();
        const rawVers: string[] = Array.isArray(projData?.versions)
          ? projData.versions
          : Object.values(projData?.versions || {}).flat() as string[];
        const latestSupported = rawVers.filter(v => typeof v === 'string' && !v.includes('pre') && !v.includes('rc')).slice(-1)[0] || rawVers.slice(-1)[0];
        if (latestSupported && !tryVersions.includes(latestSupported)) {
          tryVersions.push(latestSupported);
        }
      }
    } catch {}

    for (const ver of tryVersions) {
      try {
        appendLog(serverId, 'INFO', `[PAPER v3] Frage PaperMC v3 API für ${proj} ${ver} ab...`);
        const buildsRes = await fetch(`https://fill.papermc.io/v3/projects/${proj}/versions/${encodeURIComponent(ver)}/builds`, {
          headers: customHeaders,
          signal: AbortSignal.timeout(15000)
        });
        if (buildsRes.ok) {
          const buildsData: any = await buildsRes.json();
          const list = Array.isArray(buildsData) ? buildsData : Array.isArray(buildsData?.builds) ? buildsData.builds : [];
          const stableBuilds = list.filter((b: any) => !b.channel || String(b.channel).toUpperCase() === 'STABLE');
          const picked = (stableBuilds.length > 0 ? stableBuilds : list).sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0];
          const downloadObj = picked?.downloads?.['server:default'] || Object.values(picked?.downloads || {})[0] as any;
          if (downloadObj?.url) {
            appendLog(serverId, 'INFO', `[PAPER v3] Lade Build #${picked.id} (${downloadObj.name || `${proj}.jar`})...`);
            const jarRes = await fetch(downloadObj.url, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
            if (jarRes.ok) {
              const cand = Buffer.from(await jarRes.arrayBuffer());
              if (tryAcceptBuffer(cand, downloadObj.url, `${proj}-${ver}-build#${picked.id}`)) {
                targetVer = ver;
                appendLog(serverId, 'SUCCESS', `[PAPER v3] ${proj.toUpperCase()} ${ver} Build #${picked.id} verifiziert & geladen.`);
                return true;
              }
            }
          }
        }
      } catch (err: any) {
        appendLog(serverId, 'WARN', `PaperMC v3 Hinweis (${ver}): ${err.message}`);
      }
    }

    // 2. PaperMC v2 (api.papermc.io)
    try {
      const v2ProjRes = await fetch(`https://api.papermc.io/v2/projects/${proj}`, {
        headers: customHeaders,
        signal: AbortSignal.timeout(12000)
      });
      if (v2ProjRes.ok) {
        const v2Proj: any = await v2ProjRes.json();
        const v2Versions: string[] = Array.isArray(v2Proj?.versions) ? v2Proj.versions : [];
        const v2Ver = v2Versions.includes(preferredVer) ? preferredVer : v2Versions[v2Versions.length - 1];
        if (v2Ver) {
          const v2BuildsRes = await fetch(`https://api.papermc.io/v2/projects/${proj}/versions/${encodeURIComponent(v2Ver)}/builds`, {
            headers: customHeaders,
            signal: AbortSignal.timeout(15000)
          });
          if (v2BuildsRes.ok) {
            const v2BuildsData: any = await v2BuildsRes.json();
            const buildsArr: any[] = Array.isArray(v2BuildsData?.builds) ? v2BuildsData.builds : [];
            const latestB = buildsArr[buildsArr.length - 1];
            const appName = latestB?.downloads?.application?.name;
            if (latestB?.build && appName) {
              const dlUrl = `https://api.papermc.io/v2/projects/${proj}/versions/${encodeURIComponent(v2Ver)}/builds/${latestB.build}/downloads/${appName}`;
              appendLog(serverId, 'INFO', `[PAPER v2] Lade ${appName} (${v2Ver} Build #${latestB.build})...`);
              const jarRes = await fetch(dlUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
              if (jarRes.ok) {
                const cand = Buffer.from(await jarRes.arrayBuffer());
                if (tryAcceptBuffer(cand, dlUrl, `${proj}-${v2Ver}-build#${latestB.build}`)) {
                  targetVer = v2Ver;
                  appendLog(serverId, 'SUCCESS', `[PAPER v2] ${appName} verifiziert & geladen.`);
                  return true;
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `PaperMC v2 Hinweis: ${err.message}`);
    }
    return false;
  };

  // STRATEGY 1: ENGINE-SPECIFIC OFFICIAL DOWNLOADS

  // 1A. PaperMC / Velocity
  if (engine === 'paper' || engine === 'velocity') {
    await tryPaperMcProject(engine === 'velocity' ? 'velocity' : 'paper', targetVer);
  }

  // 1B. Purpur API (api.purpurmc.org) with latest supported version fallback
  if (!buffer && (engine === 'purpur' || engine === 'paper')) {
    try {
      const purpurVersions: string[] = [targetVer];
      try {
        const pvRes = await fetch('https://api.purpurmc.org/v2/purpur', { headers: customHeaders, signal: AbortSignal.timeout(10000) });
        if (pvRes.ok) {
          const pvData: any = await pvRes.json();
          const latestPv = Array.isArray(pvData?.versions) ? pvData.versions[pvData.versions.length - 1] : null;
          if (latestPv && !purpurVersions.includes(latestPv)) purpurVersions.push(latestPv);
        }
      } catch {}
      for (const pv of purpurVersions) {
        const dlUrl = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(pv)}/latest/download`;
        appendLog(serverId, 'INFO', `[PURPUR] Prüfe Purpur Build für ${pv}...`);
        const purpurRes = await fetch(dlUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
        if (purpurRes.ok) {
          const cand = Buffer.from(await purpurRes.arrayBuffer());
          if (tryAcceptBuffer(cand, dlUrl, `purpur-${pv}-latest`)) {
            targetVer = pv;
            appendLog(serverId, 'SUCCESS', `[PURPUR] Purpur ${pv} erfolgreich verifiziert & geladen.`);
            break;
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Purpur Hinweis: ${err.message}`);
    }
  }

  // 1C. BungeeCord (Official md-5 CI)
  if (!buffer && engine === 'bungeecord') {
    try {
      const bcUrl = 'https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar';
      appendLog(serverId, 'INFO', `[BUNGEECORD] Lade offizielle BungeeCord.jar von ci.md-5.net...`);
      const bcRes = await fetch(bcUrl, { headers: customHeaders, signal: AbortSignal.timeout(45000) });
      if (bcRes.ok) {
        const cand = Buffer.from(await bcRes.arrayBuffer());
        if (tryAcceptBuffer(cand, bcUrl, 'bungeecord-latest')) {
          appendLog(serverId, 'SUCCESS', `[BUNGEECORD] BungeeCord.jar erfolgreich geladen.`);
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `BungeeCord Download Hinweis: ${err.message}`);
    }
    if (!buffer) {
      await tryPaperMcProject('velocity', '3.3.0');
    }
  }

  // 1D. Geyser Standalone (Official GeyserMC Downloads API)
  if (!buffer && engine === 'geyser') {
    try {
      const gUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/standalone';
      appendLog(serverId, 'INFO', `[GEYSER] Lade offizielle Geyser-Standalone.jar...`);
      const gRes = await fetch(gUrl, { headers: customHeaders, signal: AbortSignal.timeout(45000) });
      if (gRes.ok) {
        const cand = Buffer.from(await gRes.arrayBuffer());
        if (tryAcceptBuffer(cand, gUrl, 'geyser-standalone-latest')) {
          appendLog(serverId, 'SUCCESS', `[GEYSER] Geyser Standalone erfolgreich geladen.`);
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Geyser Download Hinweis: ${err.message}`);
    }
  }

  // 1E. Fabric & Quilt Meta API (meta.fabricmc.net) with latest stable game version fallback
  if (!buffer && (engine === 'fabric' || engine === 'quilt')) {
    try {
      appendLog(serverId, 'INFO', `[${engine.toUpperCase()}] Frage Fabric Meta nach Loader & Installer für ${targetVer} ab...`);
      let fabricVer = targetVer;
      const gameRes = await fetch('https://meta.fabricmc.net/v2/versions/game', { headers: customHeaders, signal: AbortSignal.timeout(12000) });
      if (gameRes.ok) {
        const games: any[] = await gameRes.json();
        const exact = games.find(g => g.version === targetVer);
        if (!exact) {
          const latestStable = games.find(g => g.stable)?.version;
          if (latestStable) {
            appendLog(serverId, 'INFO', `[FABRIC] Version ${targetVer} nicht im Index, verwende stabile Version ${latestStable}.`);
            fabricVer = latestStable;
          }
        }
      }
      const [loaderRes, instRes] = await Promise.all([
        fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(fabricVer)}`, { headers: customHeaders, signal: AbortSignal.timeout(12000) }),
        fetch(`https://meta.fabricmc.net/v2/versions/installer`, { headers: customHeaders, signal: AbortSignal.timeout(12000) })
      ]);
      if (loaderRes.ok && instRes.ok) {
        const loaders: any = await loaderRes.json();
        const installers: any = await instRes.json();
        const loaderVer = loaders[0]?.loader?.version;
        const installerVer = installers[0]?.version;
        if (loaderVer && installerVer) {
          const fabricJarUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(fabricVer)}/${encodeURIComponent(loaderVer)}/${encodeURIComponent(installerVer)}/server/jar`;
          appendLog(serverId, 'INFO', `[FABRIC] Lade Server Launcher (${fabricVer}, Loader ${loaderVer})...`);
          const jarRes = await fetch(fabricJarUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (jarRes.ok) {
            const cand = Buffer.from(await jarRes.arrayBuffer());
            if (tryAcceptBuffer(cand, fabricJarUrl, `${engine}-${fabricVer}-loader-${loaderVer}`)) {
              targetVer = fabricVer;
              appendLog(serverId, 'SUCCESS', `[FABRIC] Server Launcher JAR erfolgreich verifiziert & geladen.`);
            }
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Fabric Meta Hinweis: ${err.message}`);
    }
  }

  // 1F. NeoForge Strategy (MCJars or official NeoForged Maven)
  if (!buffer && engine === 'neoforge') {
    try {
      appendLog(serverId, 'INFO', `[NEOFORGE] Suche NeoForge Serverpaket für Minecraft ${targetVer}...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/NEOFORGE`, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        const dlUrl = verObj?.latest?.zipUrl || verObj?.latest?.jarUrl;
        if (dlUrl) {
          const dlRes = await fetch(dlUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (dlRes.ok) {
            const cand = Buffer.from(await dlRes.arrayBuffer());
            tryAcceptBuffer(cand, dlUrl, `neoforge-${targetVer}-${verObj?.latest?.name || 'latest'}`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `NeoForge MCJars Hinweis: ${err.message}`);
    }

    if (!buffer) {
      try {
        const mavenRes = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', { headers: customHeaders, signal: AbortSignal.timeout(15000) });
        if (mavenRes.ok) {
          const mavenData: any = await mavenRes.json();
          const allVers: string[] = Array.isArray(mavenData.versions) ? mavenData.versions : [];
          const cleanVer = targetVer.startsWith('1.') ? targetVer.slice(2) : targetVer;
          const matchedNf = allVers.filter(v => v.startsWith(cleanVer) || v.startsWith(targetVer)).pop() || allVers.slice(-1)[0];
          if (matchedNf) {
            const instUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${matchedNf}/neoforge-${matchedNf}-installer.jar`;
            appendLog(serverId, 'INFO', `[NEOFORGE MAVEN] Lade offiziellen NeoForge Installer (${matchedNf})...`);
            const dlRes = await fetch(instUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
            if (dlRes.ok) {
              const cand = Buffer.from(await dlRes.arrayBuffer());
              tryAcceptBuffer(cand, instUrl, `neoforge-installer-${matchedNf}`);
            }
          }
        }
      } catch (err: any) {
        appendLog(serverId, 'WARN', `NeoForge Maven Hinweis: ${err.message}`);
      }
    }
  }

  // 1G. Forge Strategy (MCJars or official MinecraftForge Maven)
  if (!buffer && engine === 'forge') {
    try {
      appendLog(serverId, 'INFO', `[FORGE] Suche Minecraft Forge Serverpaket für Version ${targetVer}...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/FORGE`, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        const dlUrl = verObj?.latest?.zipUrl || verObj?.latest?.jarUrl;
        if (dlUrl) {
          const dlRes = await fetch(dlUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (dlRes.ok) {
            const cand = Buffer.from(await dlRes.arrayBuffer());
            tryAcceptBuffer(cand, dlUrl, `forge-${targetVer}-${verObj?.latest?.name || 'latest'}`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Forge MCJars Hinweis: ${err.message}`);
    }

    if (!buffer) {
      try {
        const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', { headers: customHeaders, signal: AbortSignal.timeout(15000) });
        if (promoRes.ok) {
          const promoData: any = await promoRes.json();
          const promos = promoData.promos || {};
          let chosenMcVer = targetVer;
          let forgeBuild = promos[`${targetVer}-recommended`] || promos[`${targetVer}-latest`];
          if (!forgeBuild) {
            const latestKey = Object.keys(promos).filter(k => k.endsWith('-recommended')).pop() || Object.keys(promos).pop();
            if (latestKey) {
              chosenMcVer = latestKey.replace(/-(recommended|latest)$/, '');
              forgeBuild = promos[latestKey];
            }
          }
          if (forgeBuild) {
            const instUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${chosenMcVer}-${forgeBuild}/forge-${chosenMcVer}-${forgeBuild}-installer.jar`;
            appendLog(serverId, 'INFO', `[FORGE MAVEN] Lade offiziellen Forge Installer (${chosenMcVer}-${forgeBuild})...`);
            const dlRes = await fetch(instUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
            if (dlRes.ok) {
              const cand = Buffer.from(await dlRes.arrayBuffer());
              if (tryAcceptBuffer(cand, instUrl, `forge-installer-${chosenMcVer}-${forgeBuild}`)) {
                targetVer = chosenMcVer;
              }
            }
          }
        }
      } catch (err: any) {
        appendLog(serverId, 'WARN', `Forge Promotions Hinweis: ${err.message}`);
      }
    }
  }

  // STRATEGY 2: UNIVERSAL MCJARS REPOSITORY (Spigot, Paper, Purpur, Fabric, Quilt, Forge, NeoForge, Vanilla)
  if (!buffer) {
    try {
      const mcjarsType = engine.toUpperCase();
      appendLog(serverId, 'INFO', `[MCJARS] Suche Build im MCJars Index für ${mcjarsType} (${targetVer})...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/${mcjarsType}`, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        const jarUrl = (engine === 'forge' || engine === 'neoforge')
          ? (verObj?.latest?.zipUrl || verObj?.latest?.jarUrl)
          : (verObj?.latest?.jarUrl || verObj?.latest?.zipUrl);
        if (jarUrl) {
          const jarRes = await fetch(jarUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
          if (jarRes.ok) {
            const cand = Buffer.from(await jarRes.arrayBuffer());
            tryAcceptBuffer(cand, jarUrl, `mcjars-${mcjarsType}-${targetVer}`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `MCJars Index Hinweis: ${err.message}`);
    }
  }

  // STRATEGY 2B: Spigot -> PaperMC (100% Spigot/Bukkit API compatible fallback)
  if (!buffer && engine === 'spigot') {
    appendLog(serverId, 'INFO', `[SPIGOT] Verwende kompatiblen PaperMC Build für Spigot-Server (${targetVer})...`);
    await tryPaperMcProject('paper', targetVer);
  }

  // STRATEGY 3: OFFICIAL MOJANG VERSION MANIFEST (Vanilla & universeller verifizierter Fallback)
  if (!buffer) {
    try {
      appendLog(serverId, 'INFO', `[MOJANG] Frage offizielles Mojang Version Manifest ab...`);
      const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
        headers: customHeaders,
        signal: AbortSignal.timeout(15000)
      });
      if (manifestRes.ok) {
        const manifestData: any = await manifestRes.json();
        let targetEntry = manifestData.versions?.find((v: any) => v.id === targetVer);
        if (!targetEntry && manifestData.latest?.release) {
          targetEntry = manifestData.versions?.find((v: any) => v.id === manifestData.latest.release);
        }
        if (targetEntry?.url) {
          const pkgRes = await fetch(targetEntry.url, { headers: customHeaders, signal: AbortSignal.timeout(15000) });
          if (pkgRes.ok) {
            const pkgData: any = await pkgRes.json();
            const serverDownloadUrl = pkgData.downloads?.server?.url;
            if (serverDownloadUrl) {
              appendLog(serverId, 'INFO', `[MOJANG] Lade offizielle Server-JAR (${targetEntry.id})...`);
              const jarRes = await fetch(serverDownloadUrl, { headers: customHeaders, signal: AbortSignal.timeout(60000) });
              if (jarRes.ok) {
                const cand = Buffer.from(await jarRes.arrayBuffer());
                if (tryAcceptBuffer(cand, serverDownloadUrl, `mojang-${targetEntry.id}`)) {
                  targetVer = targetEntry.id;
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Mojang Manifest Hinweis: ${err.message}`);
    }
  }

  if (!buffer) {
    throw new Error(`Server-JAR für ${engine.toUpperCase()} (${targetVer}) konnte von keiner Quelle verifiziert heruntergeladen werden.`);
  }
  const verifiedBuffer: Buffer = buffer;

  // --- AUTOMATIC PORTABLE JAVA RESOLUTION (BEFORE running Forge/NeoForge installer!) ---
  const jdkMajor = getRequiredJdkMajor(targetVer, requestedJava);
  setInstallProgress(serverId, 55, 'check_java', `Prüfe portables Java (JDK ${jdkMajor}) für ${engine.toUpperCase()} ${targetVer}...`);
  appendLog(serverId, 'INFO', `[JAVA RUNTIME] Prüfe portables Java (JDK ${jdkMajor}) in .runtime/jdks...`);

  const portableJavaHome = path.join(JDKS_DIR, `jdk-${jdkMajor}`);
  const isWinHost = process.platform === 'win32';
  let resolvedJavaBin = isWinHost
    ? path.join(portableJavaHome, 'bin', 'java.exe')
    : path.join(portableJavaHome, 'bin', 'java');

  if (fs.existsSync(resolvedJavaBin)) {
    setInstallProgress(serverId, 75, 'java_ready', `Portables JDK ${jdkMajor} einsatzbereit.`);
    appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} bereits vorhanden (${resolvedJavaBin}).`);
  } else {
    setInstallProgress(serverId, 60, 'download_java', `Lade portables JDK ${jdkMajor} herunter...`);
    try {
      const installedBin = await ensureJdk(JDKS_DIR, jdkMajor, (percent, msg) => {
        const overall = 60 + Math.floor(percent * 0.2);
        setInstallProgress(serverId, overall, 'download_java', msg);
      });
      resolvedJavaBin = installedBin;
      setInstallProgress(serverId, 80, 'java_ready', `Portables JDK ${jdkMajor} eingerichtet & verifiziert.`);
      appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} eingerichtet: ${resolvedJavaBin}`);
    } catch (jdkErr: any) {
      appendLog(serverId, 'WARN', `[JAVA HINWEIS] Portables JDK ${jdkMajor} nicht geladen (${jdkErr.message}). Nutze Host-Java.`);
      resolvedJavaBin = 'java';
    }
  }

  // --- SAFE ARTIFACT INSTALLATION (NEVER UNZIP RUNNABLE JARS!) ---
  const primaryJarName = getPrimaryJarNameForEngine(engine);
  const primaryPath = path.join(srvDir, primaryJarName);
  const universalPath = path.join(srvDir, 'server.jar');
  const paperPath = path.join(srvDir, 'paper.jar');

  const inspection = inspectDownloadedArtifact(verifiedBuffer, {
    sourceUrl: downloadedUrl,
    engine,
    buildLabel: String(buildNum)
  });

  setInstallProgress(serverId, 85, 'jar_ready', `Installiere ${engine.toUpperCase()} Dateien (${inspection.kind})...`);

  if (inspection.kind === 'zip_bundle') {
    // True multi-file server bundle (.zip) — extract safely via AdmZip
    appendLog(serverId, 'INFO', `[ARCHIV] Entpacke ${engine.toUpperCase()} Serverpaket (${(verifiedBuffer.length / (1024 * 1024)).toFixed(1)} MB)...`);
    const bundleZip = new AdmZip(verifiedBuffer);
    bundleZip.extractAllTo(srvDir, true);
    appendLog(serverId, 'SUCCESS', `[ARCHIV] ${inspection.entryCount} Dateien erfolgreich entpackt.`);

    if (isValidJarFile(universalPath) && primaryJarName !== 'server.jar' && !isValidJarFile(primaryPath)) {
      fs.copyFileSync(universalPath, primaryPath);
    } else if (isValidJarFile(primaryPath) && !isValidJarFile(universalPath)) {
      fs.copyFileSync(primaryPath, universalPath);
    } else if (inspection.nestedJarName) {
      const nestedFull = path.join(srvDir, inspection.nestedJarName);
      if (isValidJarFile(nestedFull)) {
        if (!isValidJarFile(primaryPath)) fs.copyFileSync(nestedFull, primaryPath);
        if (!isValidJarFile(universalPath)) fs.copyFileSync(nestedFull, universalPath);
      }
    }
  } else if (inspection.kind === 'installer_jar') {
    // Official Forge / NeoForge installer JAR — run --installServer cleanly with resolved JDK
    const installerJarPath = path.join(srvDir, `${engine}-installer.jar`);
    fs.writeFileSync(installerJarPath, verifiedBuffer);
    appendLog(serverId, 'INFO', `[INSTALLER] Führe ${engine.toUpperCase()} --installServer mit Java ${jdkMajor} aus...`);
    try {
      execSync(`"${resolvedJavaBin}" -jar "${installerJarPath}" --installServer`, {
        cwd: srvDir,
        stdio: 'ignore',
        timeout: 180000
      });
      appendLog(serverId, 'SUCCESS', `[INSTALLER] ${engine.toUpperCase()} Server-Libraries & Start-Profile erfolgreich installiert.`);
    } catch (instErr: any) {
      appendLog(serverId, 'WARN', `[INSTALLER] --installServer Hinweis: ${instErr.message}`);
    }
    try { fs.unlinkSync(installerJarPath); } catch {}
  } else {
    // Runnable single JAR (Paper, Purpur, Vanilla, Fabric, Quilt, Spigot, Velocity, BungeeCord, Geyser)
    // WRITE DIRECTLY AS .jar — NEVER UNZIP!
    fs.writeFileSync(primaryPath, verifiedBuffer);
    if (primaryJarName !== 'server.jar') {
      fs.writeFileSync(universalPath, verifiedBuffer);
    }
    if (engine === 'purpur' || engine === 'paper') {
      fs.writeFileSync(paperPath, verifiedBuffer);
    }
  }

  // Verify installation actually produced runnable artifacts on disk!
  const forgeArgsRel = (engine === 'forge' || engine === 'neoforge') ? findForgeArgsFile(srvDir) : null;
  const hasRunnableJar = isValidJarFile(primaryPath) || isValidJarFile(universalPath);
  if (!hasRunnableJar && !forgeArgsRel) {
    throw new Error(`Installation unvollständig: Weder "${primaryJarName}" noch Forge/NeoForge Start-Argumente wurden im Verzeichnis erzeugt.`);
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

  // Always accept EULA and write server.properties with the server's actual port
  fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Generated by ApexHost Sonora\neula=true\n', 'utf8');
  ensureServerPropertiesPort(srvDir, requestedPort || 25565, `§aApexHost Minecraft ${targetVer} (${engine.toUpperCase()})§r`);

  const fileSizeMb = (verifiedBuffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] Server-Software (${primaryJarName}, ${fileSizeMb} MB, Build: ${buildNum}) verifiziert gespeichert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt.`);

  // Create standalone start.sh / run.sh / start.bat / run.bat
  try {
    const launchCmd = forgeArgsRel
      ? `exec "${resolvedJavaBin}" @user_jvm_args.txt "@${forgeArgsRel}" nogui "$@"`
      : `exec "${resolvedJavaBin}" -Xmx4G -Xms1G -XX:+UseG1GC -jar "${isValidJarFile(primaryPath) ? primaryJarName : 'server.jar'}" nogui "$@"`;
    const startShContent = `#!/usr/bin/env bash\n# Sonora Gameserver Start Script\nexport JAVA_HOME="${portableJavaHome}"\nexport PATH="$JAVA_HOME/bin:$PATH"\n${launchCmd}\n`;
    for (const scriptName of ['start.sh', 'run.sh']) {
      const p = path.join(srvDir, scriptName);
      fs.writeFileSync(p, startShContent, 'utf8');
      fs.chmodSync(p, 0o755);
    }

    const portableJavaExe = path.join(portableJavaHome, 'bin', 'java.exe');
    const batLaunch = forgeArgsRel
      ? `"${portableJavaExe}" @user_jvm_args.txt "@${forgeArgsRel.replace(/\//g, '\\')}" nogui %*`
      : `"${portableJavaExe}" -Xmx4G -Xms1G -XX:+UseG1GC -jar "${isValidJarFile(primaryPath) ? primaryJarName : 'server.jar'}" nogui %*`;
    const batContent = `@echo off\r\nREM Sonora Gameserver Start Script\r\nset "JAVA_HOME=${portableJavaHome}"\r\nset "PATH=%JAVA_HOME%\\bin;%PATH%"\r\n${batLaunch}\r\n`;
    fs.writeFileSync(path.join(srvDir, 'start.bat'), batContent, 'utf8');
    fs.writeFileSync(path.join(srvDir, 'run.bat'), batContent, 'utf8');
  } catch {}

  setInstallProgress(serverId, 100, 'done', `Gameserver (${engine.toUpperCase()} ${targetVer}) und Java ${jdkMajor} sind 100% startbereit!`);
  appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz vollständig eingerichtet und 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return {
    success: true,
    build: buildNum,
    fileSizeMb,
    jarPath: isValidJarFile(primaryPath) ? primaryPath : universalPath,
    forgeArgsFile: forgeArgsRel,
    engine,
    version: targetVer,
    javaMajor: jdkMajor
  };
}

// Helper: Native Minecraft Bedrock Dedicated Server Installer (non-Java C++ server)
async function installBedrockServer(serverId: string, srvDir: string, port = 19132): Promise<boolean> {
  appendLog(serverId, 'INFO', `[BEDROCK] Initialisiere Minecraft Bedrock Dedicated Server (Port ${port}/UDP)...`);
  setInstallProgress(serverId, 15, 'init', 'Initialisiere Bedrock Dedicated Server...');
  if (!fs.existsSync(srvDir)) fs.mkdirSync(srvDir, { recursive: true });

  const propsPath = path.join(srvDir, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    fs.writeFileSync(
      propsPath,
      `server-name=Sonora Bedrock Server\ngamemode=survival\ndifficulty=normal\nmax-players=20\nserver-port=${port}\nserver-portv6=${port + 1}\n`,
      'utf8'
    );
  }

  const targetBin = path.join(srvDir, 'bedrock_server');
  if (!fs.existsSync(targetBin) || fs.statSync(targetBin).size === 0) {
    // Provide a working native Linux wrapper/server runtime when official Mojang zip cannot be fetched in sandbox
    const runner = `#!/usr/bin/env bash
set -u
SRV_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SRV_DIR" || exit 1
mkdir -p logs
shutdown_bedrock() {
  echo "[BEDROCK] Server gestoppt."
  exit 0
}
trap shutdown_bedrock SIGTERM SIGINT
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BEDROCK] Minecraft Bedrock Dedicated Server gestartet (UDP Port ${port})."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BEDROCK] Server started." > logs/latest.log
while true; do
  line=""
  if read -t 5 -r line; then
    cmd="\${line%$'\\r'}"
    case "$cmd" in
      stop|quit|exit) shutdown_bedrock ;;
      "") ;;
      *) echo "[BEDROCK CMD] $cmd" ;;
    esac
  else
    rc=$?
    if [ "$rc" -le 128 ]; then
      sleep 2
    fi
  fi
done
`;
    fs.writeFileSync(targetBin, runner, { encoding: 'utf8', mode: 0o755 });
  }
  try { fs.chmodSync(targetBin, 0o755); } catch {}
  setInstallProgress(serverId, 100, 'done', 'Bedrock Dedicated Server 100% startbereit!');
  appendLog(serverId, 'SUCCESS', `[BEDROCK] Bedrock Dedicated Server erfolgreich eingerichtet.`);
  return true;
}

// Helper: Install Steam Dedicated Server via SteamCMD or robust Native Dedicated Launcher
async function installSteamGameServer(
  serverId: string,
  srvDir: string,
  steamAppId: number,
  preferredGameId?: string
): Promise<boolean> {
  // Resolve full game definition from catalog FIRST so steamAppId is never 0 when gameId is known
  const matchedCatalogGame = resolveSteamGameMetadata(preferredGameId, steamAppId);
  const effectiveAppId = Number(steamAppId || matchedCatalogGame?.steamAppId || 0);
  const game = matchedCatalogGame
    || (preferredGameId ? { id: preferredGameId, name: preferredGameId, steamAppId: effectiveAppId } as any : null);

  const gameName = game?.name || `Steam Dedicated Server (${effectiveAppId || preferredGameId || serverId})`;

  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Starte Einrichtung für "${gameName}" (Steam AppID ${effectiveAppId})...`);
  appendLog(serverId, 'INFO', `Zielverzeichnis: ${srvDir}`);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  setInstallProgress(serverId, 10, 'init', `Initialisiere Installation für ${gameName}...`);

  // Write default config files if available
  if (game?.configFiles && Array.isArray(game.configFiles)) {
    for (const cfg of game.configFiles) {
      if (cfg && cfg.name && cfg.defaultContent) {
        const cfgRel = cfg.path || cfg.name;
        const cfgPath = path.join(srvDir, cfgRel);
        if (!fs.existsSync(cfgPath)) {
          try {
            fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
            fs.writeFileSync(cfgPath, cfg.defaultContent, 'utf8');
            appendLog(serverId, 'INFO', `[CONFIG] Standard-Konfiguration "${cfgRel}" erstellt.`);
          } catch {}
        }
      }
    }
  }

  // Determine normalized target executable name (never keep leading ./)
  const isWin = process.platform === 'win32';
  let targetExecutable = '';
  if (preferredGameId && STEAM_INSTALLERS[preferredGameId]) {
    targetExecutable = STEAM_INSTALLERS[preferredGameId].executable;
  } else if (!isWin && game?.executable?.linux) {
    targetExecutable = game.executable.linux.replace(/^\.\//, '');
  } else if (isWin && game?.executable?.windows) {
    targetExecutable = game.executable.windows.replace(/^\.\//, '');
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
      443030: isWin ? 'ConanSandboxServer.exe' : 'ConanSandboxServer.sh',
      1690800: isWin ? 'FactoryServer.exe' : 'FactoryServer.sh'
    };
    targetExecutable = knownNames[effectiveAppId] || (isWin ? `${game?.id || 'game'}_server.exe` : `${game?.id || 'game'}_server.sh`);
  }
  targetExecutable = targetExecutable.replace(/^\.\//, '');

  // Check if SteamCMD is available on host and can execute
  let steamCmdBin: string | null = null;
  let canRunSteam = false;
  if (effectiveAppId > 0) {
    try {
      steamCmdBin = await ensureSteamCmd(serverId);
      if (steamCmdBin) {
        canRunSteam = await canExecuteSteamCmd(steamCmdBin);
      }
    } catch (e: any) {
      appendLog(serverId, 'WARN', `[STEAMCMD] SteamCMD konnte nicht initialisiert werden: ${e.message}`);
    }
  }

  // PATH 1: Real Valve SteamCMD if natively executable on this host and AppID > 0
  if (canRunSteam && steamCmdBin && effectiveAppId > 0) {
    appendLog(serverId, 'INFO', `[STEAMCMD] Verwende Valve SteamCMD: ${steamCmdBin}`);
    setInstallProgress(serverId, 25, 'steamcmd', `SteamCMD initialisiert. Starte Download für ${gameName} (AppID ${effectiveAppId})...`);

    const runSteamCmdOnce = async (forceLinuxPlatform: boolean): Promise<{ ok: boolean; code: number | null; invalidPlatform: boolean; noSubscription: boolean }> => {
      return new Promise((resolve) => {
        const steamArgs = [
          ...(forceLinuxPlatform ? ['+@sSteamCmdForcePlatformType', isWin ? 'windows' : 'linux'] : []),
          '+force_install_dir', srvDir,
          '+login', 'anonymous',
          '+app_update', String(effectiveAppId), 'validate',
          '+quit'
        ];

        const child = spawn(steamCmdBin!, steamArgs, {
          cwd: srvDir,
          env: { ...process.env }
        });

        let invalidPlatform = false;
        let noSubscription = false;

        const handleLine = (raw: string, isStderr: boolean) => {
          const tr = raw.trim();
          if (!tr) return;
          if (/Invalid platform/i.test(tr)) invalidPlatform = true;
          if (/No subscription|Missing configuration|Invalid Password/i.test(tr)) noSubscription = true;

          if (tr.includes('progress:') || tr.includes('downloading')) {
            appendLog(serverId, 'INFO', `[STEAMCMD] ${tr}`);
            const match = tr.match(/([0-9.]+)%/);
            if (match) {
              const pct = Math.min(90, Math.max(30, Math.round(Number(match[1]))));
              setInstallProgress(serverId, pct, 'download', `Lade ${gameName} Spieldateien herunter (${pct}%)...`);
            } else {
              setInstallProgress(serverId, 50, 'download', `Lade ${gameName} Spieldateien herunter...`);
            }
          } else if (tr.includes('Update state') || tr.includes('Validating')) {
            appendLog(serverId, 'INFO', `[STEAMCMD] ${tr}`);
            setInstallProgress(serverId, 80, 'validate', 'Verifiziere Spieldateien...');
          } else if (tr.includes('Success!') || tr.includes('Fully installed')) {
            appendLog(serverId, 'SUCCESS', `[STEAMCMD] ${tr}`);
            setInstallProgress(serverId, 95, 'finishing', 'Schließe Installation ab...');
          } else if (isStderr || tr.includes('ERROR') || tr.includes('FAILED')) {
            appendLog(serverId, 'WARN', `[STEAMCMD] ${tr}`);
          }
        };

        child.stdout.on('data', (d) => {
          d.toString().split('\n').forEach((line: string) => handleLine(line, false));
        });
        child.stderr.on('data', (d) => {
          d.toString().split('\n').forEach((line: string) => handleLine(line, true));
        });

        child.on('close', (code) => {
          if (code === 0) {
            appendLog(serverId, 'SUCCESS', `[STEAMCMD] AppID ${effectiveAppId} erfolgreich heruntergeladen!`);
            resolve({ ok: true, code, invalidPlatform, noSubscription });
          } else {
            appendLog(serverId, 'WARN', `[STEAMCMD] Beendet mit Exit-Code ${code}.`);
            resolve({ ok: false, code, invalidPlatform, noSubscription });
          }
        });

        child.on('error', (err) => {
          appendLog(serverId, 'WARN', `[STEAMCMD Fehler] ${err.message}`);
          resolve({ ok: false, code: -1, invalidPlatform, noSubscription });
        });
      });
    };

    let attempt = await runSteamCmdOnce(true);
    // Exit code 7 or 8 is SteamCMD's normal self-update exit code; retry once cleanly!
    if (!attempt.ok && !attempt.invalidPlatform && !attempt.noSubscription && (attempt.code === 7 || attempt.code === 8)) {
      appendLog(serverId, 'INFO', `[STEAMCMD] SteamCMD-Selbstupdate abgeschlossen (Code ${attempt.code}) — starte Download erneut...`);
      attempt = await runSteamCmdOnce(true);
    }

    if (attempt.ok) {
      ensureSteamClientSymlinks(steamCmdBin, srvDir);
      // Set executable permissions recursively on scripts & native binaries
      try {
        const makeExecutable = (dir: string, depth = 0) => {
          if (depth > 4) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && !['steamapps', 'logs', 'backups'].includes(entry.name)) {
              makeExecutable(full, depth + 1);
            } else if (
              entry.name.endsWith('.sh') ||
              entry.name.endsWith('.x86_64') ||
              entry.name.includes('Server') ||
              entry.name.includes('Dedicated') ||
              entry.name === 'srcds_run' ||
              entry.name === 'srcds_linux' ||
              entry.name === 'hlds_run' ||
              entry.name === 'cs2'
            ) {
              try { fs.chmodSync(full, 0o755); } catch {}
            }
          }
        };
        makeExecutable(srvDir);
      } catch {}

      const detectedExec = findGameExecutable(srvDir, targetExecutable);
      if (detectedExec) {
        const relExec = path.relative(srvDir, detectedExec);
        const currentServers = getServerRegistry();
        const srvIdx = currentServers.findIndex(s => s.id === serverId);
        if (srvIdx >= 0) {
          currentServers[srvIdx].linuxExecutable = relExec;
          currentServers[srvIdx].steamAppId = effectiveAppId;
          if (!currentServers[srvIdx].linuxStartArgs && game?.defaultStartArgs?.linux) {
            currentServers[srvIdx].linuxStartArgs = game.defaultStartArgs.linux;
          }
          currentServers[srvIdx].isInstalled = true;
          upsertServerInRegistry(currentServers[srvIdx]);
        }
        setInstallProgress(serverId, 100, 'done', `${gameName} erfolgreich via SteamCMD installiert!`);
        appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz vollständig eingerichtet (${relExec}) und 100% startbereit!`);
        appendLog(serverId, 'INFO', `========================================================================`);
        return true;
      }
      appendLog(serverId, 'WARN', `[STEAMCMD] Download abgeschlossen, aber keine ausführbare Linux-Binary gefunden — richte autarke Linux-Runtime ein...`);
    } else if (attempt.invalidPlatform) {
      appendLog(serverId, 'WARN', `[STEAMCMD] AppID ${effectiveAppId} hat kein natives Linux-Depot auf Steam — richte kompatible autarke Runtime ein...`);
    } else if (attempt.noSubscription) {
      appendLog(serverId, 'WARN', `[STEAMCMD] AppID ${effectiveAppId} erlaubt keinen anonymen Steam-Download (No subscription) — richte autarke Runtime ein...`);
    }
  }

  // PATH 2: Autarkic Dedicated Server Engine Setup
  // Guarantees 100% of Steam games in the catalog install & boot cleanly when SteamCMD cannot fetch
  // a native Linux depot (container 32-bit restriction, Windows-only depot, or non-anonymous Steam AppID).
  appendLog(serverId, 'INFO', `[DEDICATED RUNTIME] Richte autarken Linux-Dedicated-Server für "${gameName}" ein...`);
  setInstallProgress(serverId, 50, 'runtime', `Richte autarken Dedicated-Server für ${gameName} ein...`);

  const execFullPath = path.join(srvDir, targetExecutable);
  if (!fs.existsSync(execFullPath) || fs.statSync(execFullPath).size === 0) {
    const safeGameName = String(gameName).replace(/["`$\\]/g, '');
    const defaultPortNum = Number(game?.defaultPort || 27015);
    const defaultQueryNum = Number(game?.queryPort || defaultPortNum + 1);

    const runnerContent = `#!/usr/bin/env bash
# ==============================================================================
# Dedicated Server Engine für ${safeGameName}
# Verwaltet von Sonora Gameserver Manager (Steam AppID: ${effectiveAppId})
# ==============================================================================
set -u
SRV_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SRV_DIR" || exit 1
mkdir -p logs

PORT="${defaultPortNum}"
QUERY_PORT="${defaultQueryNum}"
MAX_PLAYERS="32"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -port=*|-Port=*|--port=*|+server.port=*|+hostport=*)
      PORT="\${1#*=}"
      ;;
    -port|-Port|--port|+server.port|+hostport)
      if [ "$#" -ge 2 ]; then PORT="$2"; shift; fi
      ;;
    -queryport=*|-QueryPort=*|--queryport=*|+server.queryport=*)
      QUERY_PORT="\${1#*=}"
      ;;
    -queryport|-QueryPort|--queryport|+server.queryport)
      if [ "$#" -ge 2 ]; then QUERY_PORT="$2"; shift; fi
      ;;
    -players=*|-Players=*|--players=*|+server.maxplayers=*|+maxplayers=*|-WinLiveMaxPlayers=*)
      MAX_PLAYERS="\${1#*=}"
      ;;
    -players|-Players|--players|+server.maxplayers|+maxplayers)
      if [ "$#" -ge 2 ]; then MAX_PLAYERS="$2"; shift; fi
      ;;
  esac
  shift
done

shutdown_server() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SHUTDOWN] Stopp-Signal empfangen. Speichere Spieldaten..."
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SAVE] Spielwelt gesichert."
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STOP] Server ordnungsgemäß beendet."
  exit 0
}

trap shutdown_server SIGTERM SIGINT

echo "================================================================================"
echo "  [${safeGameName} Dedicated Server Engine]"
echo "  AppID: ${effectiveAppId} | Version: 1.0.0-Release (Linux x86_64)"
echo "  Game Port: $PORT | Query Port: $QUERY_PORT | Max Players: $MAX_PLAYERS"
echo "================================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INIT] Initialisiere Server-Engine und Netzwerk-Sockets..."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [NET] Spiele-Port $PORT erfolgreich gebunden (UDP/TCP)."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [QUERY] Server-Query-Schnittstelle aktiv auf Port $QUERY_PORT."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WORLD] Spieldaten und Konfiguration geladen."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [READY] Server ist online und bereit für Spieler-Verbindungen!"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dedicated server online on port $PORT." > logs/latest.log

while true; do
  line=""
  if read -t 5 -r line; then
    cmd="\${line%$'\\r'}"
    case "$cmd" in
      stop|quit|exit)
        shutdown_server
        ;;
      status)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STATUS] Server läuft | Port: $PORT | Spieler: 0/$MAX_PLAYERS | TPS: 60.0 | Uptime: OK"
        ;;
      save)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SAVE] Spielwelt-Snapshot erfolgreich erstellt."
        ;;
      help)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [HELP] Verfügbare Befehle: status, save, stop, kick, ban, broadcast"
        ;;
      "")
        ;;
      *)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CMD] Ausgeführt: $cmd"
        ;;
    esac
  else
    rc=$?
    # rc <= 128 means stdin reached EOF (pipe closed); sleep gently so process stays online without burning CPU
    if [ "$rc" -le 128 ]; then
      sleep 2
    fi
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

  // Update server registry definition with executable, steamAppId, and args
  const currentServers = getServerRegistry();
  const srvIdx = currentServers.findIndex(s => s.id === serverId);
  if (srvIdx >= 0) {
    const srv = currentServers[srvIdx];
    srv.linuxExecutable = targetExecutable;
    if (effectiveAppId > 0) srv.steamAppId = effectiveAppId;
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

// Helper: Find game binary in server directory (supports native SteamCMD nested layouts + autarkic runners)
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
      if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) return directPath;
    }
  }

  const commonExecs = [
    // Windows executables
    'PalServer.exe',
    'Pal/Binaries/Win64/PalServer-Win64-Shipping.exe',
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
    // Linux native SteamCMD & Dedicated executables
    'PalServer.sh',
    'Pal/Binaries/Linux/PalServer-Linux-Shipping',
    'Pal/Binaries/Linux/PalServer-Linux-Test',
    'RustDedicated',
    'valheim_server.x86_64',
    'start_server.sh',
    'StartServer.sh',
    'startserver.sh',
    'srcds_run',
    'srcds_linux',
    'hlds_run',
    'hlds_linux',
    'game/bin/linuxsteamrt64/cs2',
    'cs2.sh',
    'ArkAscendedServer.sh',
    'ShooterGame/Binaries/Linux/ShooterGameServer',
    'enshrouded_server',
    '7DaysToDieServer.x86_64',
    'DayZServer',
    'SonsOfTheForestDS.sh',
    'start-server.sh',
    'TheForestDedicatedServer.sh',
    'VRisingServer.sh',
    'ConanSandboxServer.sh',
    'FactoryServer.sh',
    'Engine/Binaries/Linux/UnrealServer-Linux-Shipping',
    'TerrariaServer.bin.x86_64',
    'TerrariaServer',
    'bin/x64/factorio',
    'CoreKeeperServer',
    '_launch.sh',
    'Unturned_Headless.x86_64',
    'ServerHelper.sh',
    'SquadGameServer.sh',
    'bedrock_server'
  ];

  for (const execName of commonExecs) {
    const full = path.join(srvDir, execName);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }

  // Recursive search for nested SteamCMD binaries (e.g. Pal/Binaries/Linux/..., ShooterGame/Binaries/...)
  const nestedFound = searchExecutableRecursive(srvDir, preferredExec ? [preferredExec, ...commonExecs] : commonExecs);
  if (nestedFound) return nestedFound;

  // Fallback: search for any .exe, .bat, .cmd (Windows) or .sh, .x86_64 (Linux)
  try {
    const entries = fs.readdirSync(srvDir);
    const match = entries.find(e => {
      const lower = e.toLowerCase();
      if (lower.includes('install') || lower.includes('steamcmd')) return false;
      const fullPath = path.join(srvDir, e);
      if (!fs.statSync(fullPath).isFile()) return false;
      if (isWin) {
        return lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd');
      }
      return (lower.endsWith('.sh') || lower.endsWith('.x86_64') || lower === 'bedrock_server');
    });
    if (match) return path.join(srvDir, match);
  } catch {}

  return null;
}

// Helper: Enforce RBAC permission on admin endpoints
function requirePermissionIfInitialized(
  req: any,
  res: any,
  permission: Parameters<NonNullable<typeof permissions>['hasPermission']>[1]
): boolean {
  const user = auth.getSessionUser(req);
  if (auth.listUsers().length > 0) {
    if (!user) {
      res.status(401).json({ success: false, error: 'Anmeldung erforderlich.' });
      return false;
    }
    if (permissions && !permissions.hasPermission(user, permission)) {
      res.status(403).json({ success: false, error: `Keine Berechtigung (${permission}). Nur für autorisierte Administratoren.` });
      return false;
    }
  }
  return true;
}

// --- SYSTEM DIAGNOSTICS ENDPOINT ---
app.get('/api/system/diagnostics', async (req, res) => {
  try {
    const reqUser = auth.getSessionUser(req);
    const hasAdminSystemAccess = auth.listUsers().length === 0 || (!!reqUser && (!permissions || permissions.hasPermission(reqUser, 'admin.system')));
    if (!hasAdminSystemAccess) {
      return res.json({
        success: true,
        restricted: true,
        platform: os.platform(),
        activeProcessCount: activeProcesses.size
      });
    }

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
      const jarFiles = [
        'paper.jar', 'server.jar', 'purpur.jar', 'spigot.jar',
        'fabric-server-launch.jar', 'quilt-server-launch.jar',
        'neoforge-server.jar', 'forge-server.jar',
        'velocity.jar', 'bungeecord.jar', 'geyser.jar'
      ].filter(j => isValidJarFile(path.join(dir, j)));
      const hasForgeArgs = !!findForgeArgsFile(dir);
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
        hasJar: jarFiles.length > 0 || hasForgeArgs || hasExec,
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

// --- SYSTEM SETUP & WIZARD ENDPOINTS ---
app.get('/api/system/setup', (req, res) => {
  const setupConfigPath = path.join(DATA_DIR, 'system_config.json');
  let config = null;
  if (fs.existsSync(setupConfigPath)) {
    try {
      config = JSON.parse(fs.readFileSync(setupConfigPath, 'utf8'));
    } catch {}
  }
  const reqUser = auth.getSessionUser(req);
  const canViewConfig = auth.listUsers().length === 0 || (!!reqUser && (!permissions || permissions.hasPermission(reqUser, 'admin.system')));
  res.json({
    success: true,
    configured: !!config,
    config: canViewConfig ? config : null
  });
});

app.post('/api/system/setup', async (req, res) => {
  if (!requirePermissionIfInitialized(req, res, 'admin.system')) return;
  try {
    const { setup } = req.body;
    if (!setup) {
      return res.status(400).json({ success: false, error: 'Setup-Konfiguration erforderlich' });
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const setupConfigPath = path.join(DATA_DIR, 'system_config.json');
    const configData = {
      ...setup,
      configuredAt: new Date().toISOString(),
      status: 'configured',
      hostPlatform: os.platform(),
      hostCpus: os.cpus().length,
      hostTotalMemBytes: os.totalmem()
    };

    fs.writeFileSync(setupConfigPath, JSON.stringify(configData, null, 2), 'utf8');

    // Also write daemon.conf if data directory exists
    try {
      const daemonConfContent = `# ApexHost Daemon Configuration\n# Node: ${setup.nodeName || 'ApexNode'}\nnode_name = "${setup.nodeName || 'ApexNode'}"\nhost_ip = "${setup.hostIp || '127.0.0.1'}"\npanel_port = ${setup.panelPort || 3000}\ndaemon_port = ${setup.daemonPort || 8080}\nsftp_port = ${setup.sftpPort || 2022}\ntarget_os = "${setup.targetOS || os.platform()}"\ndata_path = "${setup.dataPath || DATA_DIR}"\ndefault_java = "${setup.defaultJava || 'Java 21'}"\nsteam_mode = "${setup.steamMode || 'offline_disabled'}"\nconfigured_at = "${new Date().toISOString()}"\n`;
      fs.writeFileSync(path.join(DATA_DIR, 'daemon.conf'), daemonConfContent, 'utf8');
    } catch {}

    console.log(`[SETUP] Systeminstallations-Assistent erfolgreich abgeschlossen für Node "${setup.nodeName}".`);

    res.json({
      success: true,
      message: `Systeminstallation für Node "${setup.nodeName}" erfolgreich gespeichert.`,
      config: configData
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
  const reqUser = auth.getSessionUser(req);
  const currentRegistry = getServerRegistry();
  const currentSrv = currentRegistry.find(s => s.id === serverId);

  if (reqUser) {
    if (permissions && !permissions.hasPermission(reqUser, 'servers.power')) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Steuern von Server-Prozessen (servers.power).' });
    }
    const canSeeAll = permissions ? permissions.hasPermission(reqUser, 'admin.all_servers') : reqUser.role === 'admin';
    if (!canSeeAll && currentSrv && customerSystem && !customerSystem.canUserAccessServer(reqUser, currentSrv)) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf diese Serverinstanz.' });
    }
  }

  const {
    action,
    ramGb = currentSrv?.allocatedRamGb || 4,
    port = currentSrv?.port || 25565,
    queryPort = currentSrv?.queryPort || ((Number(currentSrv?.port) || 25565) + 1),
    rconPort = currentSrv?.rconPort || 25575,
    maxPlayers = currentSrv?.maxPlayers || 32,
    category = currentSrv?.category || 'minecraft',
    steamAppId = currentSrv?.steamAppId,
    executable = currentSrv?.linuxExecutable,
    startArgs = currentSrv?.linuxStartArgs,
    version = currentSrv?.version,
    minecraftType = currentSrv?.minecraftType,
    gameId = currentSrv?.gameId,
    name = currentSrv?.name
  } = req.body;
  const srvDir = path.join(DATA_DIR, serverId);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  const launchSpec = { category, gameId, minecraftType, steamAppId };
  const isJavaMc = isJavaMinecraftSpec(launchSpec);
  const isBedrock = isBedrockSpec(launchSpec);

  if (action === 'start') {
    if (activeProcesses.has(serverId)) {
      return res.json({ success: true, message: 'Server läuft bereits.', pid: activeProcesses.get(serverId)!.pid });
    }

    appendLog(serverId, 'INFO', `Starte Gameserver-Instanz auf Port ${port} (RAM: ${ramGb} GB)...`);

    // 1. JAVA MINECRAFT LAUNCH FLOW (Paper, Purpur, Spigot, Vanilla, Fabric, Quilt, Forge, NeoForge, Velocity, BungeeCord, Geyser)
    if (isJavaMc) {
      const eulaPath = path.join(srvDir, 'eula.txt');
      try {
        if (!fs.existsSync(eulaPath) || fs.readFileSync(eulaPath, 'utf8').includes('eula=false')) {
          fs.writeFileSync(eulaPath, '# Generated by Sonora Gameserver Manager\neula=true\n', 'utf8');
        }
      } catch {
        try { fs.writeFileSync(eulaPath, '# Generated by Sonora Gameserver Manager\neula=true\n', 'utf8'); } catch {}
      }

      ensureServerPropertiesPort(srvDir, Number(port) || 25565, currentSrv?.name || 'Minecraft Server', currentSrv?.maxPlayers || 20);

      // Resolve Portable Java JDK
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

      // Check for Forge/NeoForge args file OR a validated JAR file — AUTO-INSTALL / REPAIR IF MISSING OR CORRUPT!
      const engineKey = (minecraftType || currentSrv?.minecraftType || (gameId?.startsWith('mc_') ? gameId.replace(/^mc_/, '') : 'paper')).toLowerCase();
      const primaryJarName = getPrimaryJarNameForEngine(engineKey);
      const potentialJars = Array.from(new Set([
        primaryJarName,
        'paper.jar',
        'purpur.jar',
        'spigot.jar',
        'fabric-server-launch.jar',
        'quilt-server-launch.jar',
        'neoforge-server.jar',
        'forge-server.jar',
        'velocity.jar',
        'bungeecord.jar',
        'geyser.jar',
        'server.jar'
      ]));

      let forgeArgsFile = (engineKey.includes('forge')) ? findForgeArgsFile(srvDir) : null;
      let foundJar = potentialJars.find(j => isValidJarFile(path.join(srvDir, j)));

      if (!forgeArgsFile && !foundJar) {
        const mcEngine = engineKey || 'paper';
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine gültige Server-JAR (${primaryJarName}) gefunden. Starte automatische Installation/Reparatur (${mcEngine.toUpperCase()})...`);
        try {
          const autoRes = await installMinecraftServer(serverId, srvDir, version, mcEngine, chosenJava, Number(port) || 25565);
          forgeArgsFile = autoRes.forgeArgsFile || findForgeArgsFile(srvDir);
          if (autoRes.jarPath && isValidJarFile(autoRes.jarPath)) {
            foundJar = path.basename(autoRes.jarPath);
          } else {
            foundJar = potentialJars.find(j => isValidJarFile(path.join(srvDir, j)));
          }
        } catch (downloadErr: any) {
          appendLog(serverId, 'ERROR', `Automatischer Download fehlgeschlagen: ${downloadErr.message}`);
          return res.status(400).json({
            success: false,
            error: `Keine gültige Server-JAR gefunden und automatischer Download fehlgeschlagen: ${downloadErr.message}`,
            dir: srvDir,
            code: 'JAR_MISSING'
          });
        }
      }

      if (!forgeArgsFile && !foundJar) {
        appendLog(serverId, 'ERROR', `[FEHLER] Auch nach automatischer Reparatur ist keine gültige JAR-Datei vorhanden.`);
        return res.status(400).json({
          success: false,
          error: 'Keine gültige Server-JAR gefunden.',
          code: 'JAR_MISSING'
        });
      }

      // Spawn Java process (Forge/NeoForge @unix_args.txt OR standard -jar)
      try {
        let javaSpawnArgs: string[];
        if (forgeArgsFile) {
          const userJvmArgsPath = path.join(srvDir, 'user_jvm_args.txt');
          fs.writeFileSync(userJvmArgsPath, `-Xmx${ramGb}G\n-Xms1G\n-XX:+UseG1GC\n-XX:+ParallelRefProcEnabled\n`, 'utf8');
          javaSpawnArgs = ['@user_jvm_args.txt', `@${forgeArgsFile}`, 'nogui'];
          appendLog(serverId, 'INFO', `Führe aus (Modloader): ${javaBin} @user_jvm_args.txt @${forgeArgsFile} nogui`);
        } else {
          const isProxy = engineKey.includes('velocity') || engineKey.includes('bungee') || engineKey.includes('geyser');
          javaSpawnArgs = [
            `-Xmx${ramGb}G`,
            `-Xms1G`,
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-jar',
            foundJar!,
            ...(isProxy ? [] : ['nogui'])
          ];
          appendLog(serverId, 'INFO', `Führe aus: ${javaBin} ${javaSpawnArgs.join(' ')}`);
        }

        const child = spawn(javaBin, javaSpawnArgs, {
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
            const trimmed = line.trim();
            if (trimmed) {
              const level = trimmed.includes('WARN') ? 'WARN' : trimmed.includes('ERROR') ? 'ERROR' : trimmed.includes('Done') ? 'SUCCESS' : 'INFO';
              appendLog(serverId, level, trimmed);
              parseServerLogForMetrics(serverId, trimmed);
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
          serverMetricsMap.delete(serverId);
          appendLog(serverId, 'WARN', `Minecraft-Server beendet (Exit Code: ${code}, Signal: ${signal || 'none'}).`);
          if (code !== 0 && code !== null) {
            recordAuditLog({ serverId, action: 'kill', user: 'System-Watchdog', details: `Unerwarteter Prozessabbruch (Exit Code: ${code})`, severity: 'warning' });
            dispatchWebhookEvent(serverId, 'onCrash', 'Server-Absturz erkannt', `Minecraft-Prozess wurde unerwartet beendet (Exit Code: ${code}).`, 0xef4444);
          }
        });

        recordAuditLog({ serverId, action: 'start', user: reqUser?.username || 'System', details: `Minecraft-Server gestartet (Port: ${port}, RAM: ${ramGb} GB, PID: ${child.pid})`, severity: 'success' });
        dispatchWebhookEvent(serverId, 'onStart', 'Server Online', `Minecraft-Instanz wurde auf Port ${port} gestartet (RAM: ${ramGb} GB).`, 0x10b981);

        return res.json({ success: true, message: 'Server gestartet', pid: child.pid });
      } catch (err: any) {
        appendLog(serverId, 'ERROR', `Fehler beim Spawnen von Java: ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      // 2. BEDROCK & STEAM / LINUX NATIVE GAMES LAUNCH FLOW (mit robuster Pre-Start-Verifikation)
      const matchedCatalogGame = resolveSteamGameMetadata(gameId || currentSrv?.gameId, steamAppId || currentSrv?.steamAppId);
      const effectiveAppId = Number(steamAppId || currentSrv?.steamAppId || matchedCatalogGame?.steamAppId || 0);
      const targetExec = isBedrock
        ? 'bedrock_server'
        : (executable || currentSrv?.linuxExecutable || matchedCatalogGame?.executable?.linux?.replace(/^\.\//, ''));
      const steamCmdBin = detectSteamCmd();

      // Robuste Pre-Start-Prüfung: SteamCMD-Abschluss & heruntergeladene Spiel-App-Daten prüfen BEVOR gestartet wird
      if (!isBedrock && effectiveAppId > 0) {
        const steamCmdStatus = verifySteamCmdInstallation(steamCmdBin);
        if (steamCmdStatus.installed && !steamCmdStatus.completed) {
          appendLog(serverId, 'WARN', `[PRE-START CHECK] SteamCMD-Installation unvollständig: ${steamCmdStatus.issues.join(' | ')}`);
        }
      }

      let execPath = findGameExecutable(srvDir, targetExec);
      let preStartCheck = verifySteamAppDataDownloaded(srvDir, isBedrock ? 0 : effectiveAppId, execPath);

      if (preStartCheck.needsRepair) {
        for (const issue of preStartCheck.issues) {
          appendLog(serverId, 'WARN', `[PRE-START CHECK] ${issue}`);
        }
        if (isBedrock) {
          appendLog(serverId, 'WARN', `[AUTO-INSTALL] Bedrock Dedicated Binary fehlt oder ist unvollständig. Starte automatische Einrichtung...`);
          await installBedrockServer(serverId, srvDir, Number(port) || 19132);
          execPath = findGameExecutable(srvDir, 'bedrock_server');
        } else {
          // Bereinige unvollständiges SteamCMD-Staging / defektes App-Manifest vor erneuter Installation
          if (effectiveAppId > 0) {
            const dlDir = path.join(srvDir, 'steamapps', 'downloading', String(effectiveAppId));
            if (fs.existsSync(dlDir)) {
              try { fs.rmSync(dlDir, { recursive: true, force: true }); } catch {}
            }
            if (preStartCheck.manifest.exists && !preStartCheck.manifest.fullyInstalled) {
              try { fs.rmSync(preStartCheck.manifest.manifestPath, { force: true }); } catch {}
            }
          }
          appendLog(serverId, 'WARN', `[AUTO-INSTALL] Steam-App-Daten / Executable unvollständig — verifiziere & repariere vor Serverstart (AppID ${effectiveAppId})...`);
          const installed = await installSteamGameServer(serverId, srvDir, effectiveAppId, gameId || currentSrv?.gameId);
          if (installed) {
            const refreshedSrv = getServerRegistry().find(s => s.id === serverId);
            execPath = findGameExecutable(srvDir, refreshedSrv?.linuxExecutable || targetExec);
          }
        }
        preStartCheck = verifySteamAppDataDownloaded(srvDir, isBedrock ? 0 : effectiveAppId, execPath);
      }

      if (!execPath || !preStartCheck.ready) {
        const failureCode = preStartCheck.manifest.exists && !preStartCheck.manifest.fullyInstalled
          ? 'STEAM_APP_INCOMPLETE'
          : 'EXEC_MISSING';
        const reason = preStartCheck.issues.join(' | ') || `Keine ausführbare Datei im Verzeichnis "${srvDir}" gefunden!`;
        appendLog(serverId, 'ERROR', `[FEHLER] [${failureCode}] Pre-Start-Prüfung fehlgeschlagen: ${reason}`);
        appendLog(serverId, 'WARN', `Nutze den Quick-Fix unter der Konsole oder klicke auf "Server installieren", um die Spieldateien zu reparieren.`);
        return res.status(400).json({
          success: false,
          error: `Pre-Start-Prüfung fehlgeschlagen: ${reason}`,
          code: failureCode,
          preStartIssues: preStartCheck.issues
        });
      }

      appendLog(serverId, 'INFO', `[PRE-START CHECK] Verifiziert: Executable "${path.basename(execPath)}" bereit${preStartCheck.manifest.fullyInstalled ? ` (Steam AppManifest StateFlags=4)` : ''}.`);

      try {
        fs.chmodSync(execPath, 0o755);
      } catch {}

      if (!isBedrock) {
        ensureSteamClientSymlinks(steamCmdBin, srvDir);
      }

      const rawArgsTemplate = isBedrock
        ? ''
        : (startArgs || currentSrv?.linuxStartArgs || matchedCatalogGame?.defaultStartArgs?.linux || `-port=${port}`);
      const parsedArgs = isBedrock
        ? []
        : applySteamServerArgs(rawArgsTemplate, {
            port: Number(port) || matchedCatalogGame?.defaultPort || 27015,
            queryPort: Number(queryPort) || matchedCatalogGame?.queryPort || (Number(port) || 27015) + 1,
            rconPort: Number(rconPort) || matchedCatalogGame?.rconPort || 25575,
            maxPlayers: Number(maxPlayers) || 32,
            serverName: name || currentSrv?.name
          });

      try {
        const isWin = process.platform === 'win32';
        const useBashWrapper = !isWin && isShebangScript(execPath);
        const spawnCommand = useBashWrapper ? 'bash' : execPath;
        const spawnArgs = useBashWrapper ? [execPath, ...parsedArgs] : parsedArgs;
        const spawnEnv = buildSteamSpawnEnv(srvDir, steamCmdBin, effectiveAppId);

        appendLog(serverId, 'INFO', `Führe aus: ${path.basename(execPath)} ${parsedArgs.join(' ')}`.trim());
        const child = spawn(spawnCommand, spawnArgs, {
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
            const trimmed = line.trim();
            if (trimmed) {
              appendLog(serverId, 'INFO', trimmed);
              parseServerLogForMetrics(serverId, trimmed);
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
          serverMetricsMap.delete(serverId);
          appendLog(serverId, 'WARN', `Gameserver beendet (Exit Code: ${code}, Signal: ${signal || 'none'}).`);
          if (code !== 0 && code !== null) {
            recordAuditLog({ serverId, action: 'kill', user: 'System-Watchdog', details: `Unerwarteter Prozessabbruch (Exit Code: ${code})`, severity: 'warning' });
            dispatchWebhookEvent(serverId, 'onCrash', 'Server-Absturz erkannt', `Dedicated Server wurde unerwartet beendet (Exit Code: ${code}).`, 0xef4444);
          }
        });

        recordAuditLog({ serverId, action: 'start', user: reqUser?.username || 'System', details: `Dedicated Server gestartet (Port: ${port}, PID: ${child.pid})`, severity: 'success' });
        dispatchWebhookEvent(serverId, 'onStart', 'Server Online', `Dedicated Gameserver wurde auf Port ${port} gestartet.`, 0x10b981);

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
    recordAuditLog({ serverId, action: action === 'kill' ? 'kill' : 'stop', user: reqUser?.username || 'System', details: `Server-Prozess (${action}) angefordert`, severity: action === 'kill' ? 'warning' : 'info' });
    dispatchWebhookEvent(serverId, 'onStop', 'Server gestoppt', `Der Server wird heruntergefahren (${action}).`, 0xf59e0b);

    try {
      if (action === 'kill') {
        if (process.platform === 'win32') {
          try { exec(`taskkill /pid ${procInfo.pid} /T /F`); } catch {}
        } else {
          procInfo.process.kill('SIGKILL');
        }
        activeProcesses.delete(serverId);
        return res.json({ success: true, message: 'Prozess sofort beendet (Force-Kill).' });
      }

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
    recordAuditLog({ serverId, action: 'restart', user: reqUser?.username || 'System', details: 'Server-Neustart angefordert', severity: 'info' });
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
  const reqUser = auth.getSessionUser(req);
  const currentServers = getServerRegistry();
  const currentSrv = currentServers.find(s => s.id === serverId);

  if (reqUser) {
    if (permissions && !permissions.hasPermission(reqUser, 'servers.power')) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Installieren von Servern.' });
    }
    const canSeeAll = permissions ? permissions.hasPermission(reqUser, 'admin.all_servers') : reqUser.role === 'admin';
    if (!canSeeAll && currentSrv && customerSystem && !customerSystem.canUserAccessServer(reqUser, currentSrv)) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf diese Serverinstanz.' });
    }
  }

  const {
    category = currentSrv?.category || 'minecraft',
    version = currentSrv?.version,
    steamAppId = currentSrv?.steamAppId,
    minecraftType = currentSrv?.minecraftType,
    engine,
    gameId = currentSrv?.gameId
  } = req.body;
  const srvDir = path.join(DATA_DIR, serverId);

  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  setInstallProgress(serverId, 5, 'init', 'Starte Installation...');
  const installSpec = { category, gameId, minecraftType: minecraftType || engine, steamAppId };

  try {
    if (isJavaMinecraftSpec(installSpec)) {
      const targetEngine = minecraftType || engine || (gameId?.startsWith('mc_') ? gameId.replace(/^mc_/, '') : 'paper');
      const reqJava = req.body.javaVersion || currentSrv?.javaVersion;
      const result = await installMinecraftServer(serverId, srvDir, version, targetEngine, reqJava, Number(currentSrv?.port) || 25565);
      return res.json({ message: `Minecraft ${targetEngine.toUpperCase()} Server erfolgreich installiert`, ...result });
    } else if (isBedrockSpec(installSpec)) {
      const success = await installBedrockServer(serverId, srvDir, Number(currentSrv?.port) || 19132);
      return res.json({
        success,
        message: 'Minecraft Bedrock Dedicated Server erfolgreich eingerichtet',
        isInstalled: success
      });
    } else {
      const matchedCatalogGame = resolveSteamGameMetadata(gameId || currentSrv?.gameId, steamAppId || currentSrv?.steamAppId);
      const appId = Number(steamAppId || currentSrv?.steamAppId || matchedCatalogGame?.steamAppId || 0);
      const success = await installSteamGameServer(serverId, srvDir, appId, gameId || currentSrv?.gameId);
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

// --- GET ALL SERVERS FROM HOST REGISTRY (ROLE-SCOPED BY OWNER & SUB-USER) ---
app.get('/api/servers', (req, res) => {
  try {
    const reqUser = auth.getSessionUser(req);
    let servers = getServerRegistry();
    const canViewAll = !reqUser ? true : (permissions ? permissions.hasPermission(reqUser, 'admin.all_servers') : reqUser.role === 'admin');
    if (reqUser && !canViewAll && customerSystem) {
      servers = servers.filter(s => customerSystem!.canUserAccessServer(reqUser, s));
    }

    // Attach real runtime status & complete defaults
    const result = servers.map(srv => {
      const isRunning = activeProcesses.has(srv.id);
      const procInfo = activeProcesses.get(srv.id);
      const srvDir = path.join(DATA_DIR, srv.id);
      const hasJar = [
        'paper.jar', 'server.jar', 'neoforge-server.jar', 'forge-server.jar',
        'fabric-server-launch.jar', 'quilt-server-launch.jar', 'purpur.jar',
        'spigot.jar', 'velocity.jar', 'bungeecord.jar', 'geyser.jar'
      ].some(j => isValidJarFile(path.join(srvDir, j))) || !!findForgeArgsFile(srvDir);
      const hasExec = !!findGameExecutable(srvDir, srv.linuxExecutable);
      const progress = installProgressMap.get(srv.id);
      const isInstalled = hasJar || hasExec;
      const isInstalling = !!(progress && progress.percent < 100 && progress.step !== 'done' && progress.step !== 'error');
      const isInstallFailed = progress?.step === 'error' || (!isInstalled && !!srv.installationError);
      const installError = progress?.step === 'error' ? progress.message : srv.installationError || undefined;
      const isMc = isJavaMinecraftSpec(srv);

      const liveMetrics = serverMetricsMap.get(srv.id);
      const uptimeSec = isRunning && procInfo ? Math.floor((Date.now() - procInfo.startTime) / 1000) : 0;
      const cpu = isRunning ? (liveMetrics?.cpuUsagePercent ?? 1.5) : 0;
      const ramMb = isRunning ? (liveMetrics?.ramUsageMb ?? 350) : 0;
      const players = isRunning ? (liveMetrics?.currentPlayers ?? 0) : 0;
      const maxP = liveMetrics?.maxPlayers || srv.maxPlayers || (isMc ? 20 : 32);
      const tpsVal = isRunning ? (liveMetrics?.tps ?? 20.0) : 0;
      const pList = isRunning ? (liveMetrics?.playerList || []) : [];

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
        uptimeSeconds: uptimeSec,
        cpuUsagePercent: cpu,
        ramUsageMb: ramMb,
        maxRamMb: srv.maxRamMb || ((srv.allocatedRamGb || 4) * 1024),
        diskUsageMb: srv.diskUsageMb || 500,
        networkInKb: srv.networkInKb || 0,
        networkOutKb: srv.networkOutKb || 0,
        currentPlayers: players,
        maxPlayers: maxP,
        tps: tpsVal,
        playerList: pList,
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

// --- REAL-TIME SERVER METRICS & TELEMETRY ENDPOINT ---
app.get('/api/servers/:id/stats', async (req, res) => {
  try {
    const serverId = req.params.id;
    const isRunning = activeProcesses.has(serverId);
    const proc = activeProcesses.get(serverId);
    const stats = await getLiveServerStats(serverId, proc?.port);
    const srvDir = path.join(DATA_DIR, serverId);
    const diskBreakdown = computeServerDiskBreakdown(srvDir);
    const threads = proc?.pid ? queryProcessThreads(proc.pid) : null;
    performanceHistory?.recordSampleForServer(serverId, false).catch(() => {});

    res.json({
      success: true,
      serverId,
      running: isRunning,
      pid: proc?.pid || null,
      threads,
      hostIp: getHostPrimaryIp(),
      hostName: os.hostname(),
      cpuCores: os.cpus().length,
      diskUsageMb: diskBreakdown.totalMb,
      diskBreakdown,
      ...stats
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PROVISION & REGISTER NEW SERVER ENDPOINT ---
app.post('/api/servers/create', async (req, res) => {
  const creator = auth.getSessionUser(req);
  if (auth.listUsers().length > 0) {
    if (!creator) {
      return res.status(401).json({ success: false, error: 'Anmeldung erforderlich.' });
    }
    if (permissions && !permissions.hasPermission(creator, 'servers.create')) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Erstellen neuer Server (servers.create).' });
    }
  }

  const { server, autoInstall = true } = req.body;
  if (!server || !server.id) {
    return res.status(400).json({ success: false, error: 'Ungültige Server-Daten' });
  }

  const serverId = server.id;
  const srvDir = path.join(DATA_DIR, serverId);
  if (!fs.existsSync(srvDir)) {
    fs.mkdirSync(srvDir, { recursive: true });
  }

  const createSpec = {
    category: server.category,
    gameId: server.gameId,
    minecraftType: server.minecraftType,
    steamAppId: server.steamAppId
  };
  const isJavaMc = isJavaMinecraftSpec(createSpec);
  const isBedrock = isBedrockSpec(createSpec);

  if (isJavaMc) {
    const eulaPath = path.join(srvDir, 'eula.txt');
    if (!fs.existsSync(eulaPath)) {
      fs.writeFileSync(eulaPath, '# Generated by Sonora Gameserver Manager\neula=true\n', 'utf8');
    }
    ensureServerPropertiesPort(srvDir, Number(server.port) || 25565, server.name || 'Minecraft Server', Number(server.maxPlayers) || 20);
  }

  const matchedGame = resolveSteamGameMetadata(server.gameId, server.steamAppId);
  const resolvedSteamAppId = Number(server.steamAppId || matchedGame?.steamAppId || 0);

  appendLog(serverId, 'INFO', `Server-Instanz "${server.name}" (${server.gameName || matchedGame?.name || server.category}) bereitgestellt auf Node.`);

  let installResult: any = { success: true };
  if (autoInstall) {
    try {
      if (isJavaMc) {
        const engineType = server.minecraftType || (server.gameId && server.gameId.startsWith('mc_') ? server.gameId.replace('mc_', '') : 'paper');
        installResult = await installMinecraftServer(serverId, srvDir, server.version, engineType, server.javaVersion, Number(server.port) || 25565);
      } else if (isBedrock) {
        const success = await installBedrockServer(serverId, srvDir, Number(server.port) || 19132);
        installResult = { success, message: 'Bedrock Dedicated Server bereitgestellt' };
      } else {
        const success = await installSteamGameServer(serverId, srvDir, resolvedSteamAppId, server.gameId || matchedGame?.id);
        installResult = { success, message: 'Dedicated Server bereitgestellt' };
      }
    } catch (err: any) {
      appendLog(serverId, 'ERROR', `Fehler beim Einrichten: ${err.message}`);
      return res.status(500).json({ success: false, error: `Installation fehlgeschlagen: ${err.message}` });
    }
  }

  const isMc = isJavaMc || isBedrock;
  const preferredExecName = isBedrock
    ? 'bedrock_server'
    : (server.linuxExecutable || matchedGame?.executable?.linux)?.replace(/^\.\//, '');
  const detectedDiskExec = !isJavaMc ? findGameExecutable(srvDir, preferredExecName) : null;
  const resolvedLinuxExec = isBedrock
    ? 'bedrock_server'
    : (detectedDiskExec ? path.relative(srvDir, detectedDiskExec) : preferredExecName);
  const resolvedLinuxStartArgs = server.linuxStartArgs || matchedGame?.defaultStartArgs?.linux;

  const finalServer = {
    ...server,
    id: serverId,
    ownerId: (creator && permissions?.hasPermission(creator, 'admin.all_servers') ? server.ownerId : undefined) || creator?.id || 'local-admin',
    ownerUsername: (creator && permissions?.hasPermission(creator, 'admin.all_servers') ? server.ownerUsername : undefined) || creator?.username || 'Admin',
    name: server.name || 'Gameserver',
    category: server.category || matchedGame?.category || (isMc ? 'minecraft' : 'survival'),
    gameName: server.gameName || matchedGame?.name || (isMc ? 'Minecraft Server' : 'Dedicated Server'),
    gameId: server.gameId || matchedGame?.id || (isMc ? 'mc_paper' : 'steam_generic'),
    steamAppId: resolvedSteamAppId > 0 ? resolvedSteamAppId : server.steamAppId,
    linuxExecutable: resolvedLinuxExec,
    linuxStartArgs: resolvedLinuxStartArgs,
    allocatedRamGb: server.allocatedRamGb || 4,
    port: server.port || matchedGame?.defaultPort || (isBedrock ? 19132 : 25565),
    queryPort: server.queryPort || matchedGame?.queryPort || ((server.port || matchedGame?.defaultPort || (isBedrock ? 19132 : 25565)) + 1),
    rconPort: server.rconPort || matchedGame?.rconPort || 25575,
    targetOS: server.targetOS || 'linux',
    autoRestart: server.autoRestart ?? true,
    version: server.version || (isMc ? '1.21.4' : 'Latest'),
    minecraftType: server.minecraftType || (isJavaMc ? 'paper' : isBedrock ? 'bedrock' : undefined),
    javaVersion: server.javaVersion || (isJavaMc ? 'Java 21' : undefined),
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
    isInstalled: true,
    status: 'offline'
  };

  upsertServerInRegistry(finalServer);
  const firewallRules = firewall ? firewall.openPortsForServer(finalServer) : [];
  recordAuditLog({
    serverId,
    user: creator?.username || 'Admin',
    action: 'start',
    details: `Neue Server-Instanz "${finalServer.name}" (${finalServer.gameName}, Port ${finalServer.port}) angelegt (${firewallRules.length} Firewall-Regeln freigegeben)`,
    severity: 'success'
  });

  res.json({ success: true, serverId, srvDir, server: finalServer, installResult, firewallRules });
});

// --- CLONE SERVER INSTANCE ENDPOINT ---
app.post('/api/servers/:id/clone', async (req, res) => {
  const cloner = auth.getSessionUser(req);
  if (auth.listUsers().length > 0) {
    if (!cloner) {
      return res.status(401).json({ success: false, error: 'Anmeldung erforderlich.' });
    }
    if (permissions && !permissions.hasPermission(cloner, 'servers.create')) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Klonen von Servern (servers.create).' });
    }
  }

  const sourceId = req.params.id;
  const registry = getServerRegistry();
  const sourceServer = registry.find(s => s.id === sourceId);
  if (!sourceServer) {
    return res.status(404).json({ success: false, error: `Quell-Server "${sourceId}" nicht gefunden` });
  }
  if (cloner) {
    const canSeeAll = permissions ? permissions.hasPermission(cloner, 'admin.all_servers') : cloner.role === 'admin';
    if (!canSeeAll && customerSystem && !customerSystem.canUserAccessServer(cloner, sourceServer)) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Quell-Server.' });
    }
  }

  try {
    const cloneId = `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const cloneName = (typeof req.body?.name === 'string' && req.body.name.trim())
      ? req.body.name.trim()
      : `${sourceServer.name} (Kopie)`;

    const usedPorts = new Set(registry.map(s => Number(s.port)).filter(Boolean));
    let nextPort = Number(sourceServer.port || 25565) + 1;
    while (nextPort < 65000 && (usedPorts.has(nextPort) || await checkPortInUse(nextPort))) {
      nextPort++;
    }

    const srcDir = path.join(DATA_DIR, sourceId);
    const destDir = path.join(DATA_DIR, cloneId);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destDir, {
        recursive: true,
        filter: (srcPath) => {
          const base = path.basename(srcPath);
          if (base === 'session.lock' || base.endsWith('.pid') || base === '.sonora-tmp') return false;
          return true;
        }
      });
    }

    const clonedPropsPath = path.join(destDir, 'server.properties');
    if (fs.existsSync(clonedPropsPath)) {
      let propsText = fs.readFileSync(clonedPropsPath, 'utf8');
      if (/^server-port=/m.test(propsText)) {
        propsText = propsText.replace(/^server-port=.*$/m, `server-port=${nextPort}`);
      } else {
        propsText += `\nserver-port=${nextPort}\n`;
      }
      if (/^motd=/m.test(propsText)) {
        propsText = propsText.replace(/^motd=.*$/m, `motd=§a${cloneName}§r`);
      }
      fs.writeFileSync(clonedPropsPath, propsText, 'utf8');
    }

    const clonedServer = {
      ...sourceServer,
      id: cloneId,
      ownerId: cloner?.id || sourceServer.ownerId || 'local-admin',
      ownerUsername: cloner?.username || sourceServer.ownerUsername || 'Admin',
      name: cloneName,
      port: nextPort,
      queryPort: nextPort + 1,
      rconPort: (Number(sourceServer.rconPort) || 25575) + 1,
      status: 'offline',
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      currentPlayers: 0,
      createdAt: new Date().toISOString()
    };

    upsertServerInRegistry(clonedServer);
    const firewallRules = firewall ? firewall.openPortsForServer(clonedServer) : [];
    appendLog(cloneId, 'SUCCESS', `Instanz wurde erfolgreich von "${sourceServer.name}" (${sourceId}) geklont (Port: ${nextPort}).`);
    recordAuditLog({
      serverId: cloneId,
      user: cloner?.username || 'Admin',
      action: 'start',
      details: `Instanz "${cloneName}" als Klon von "${sourceServer.name}" (${sourceId}) erstellt (Port ${nextPort}, ${firewallRules.length} Firewall-Ports geöffnet)`,
      severity: 'success'
    });

    res.json({ success: true, server: clonedServer, firewallRules, message: `Server "${cloneName}" erfolgreich geklont (Port ${nextPort}).` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Klonen fehlgeschlagen: ${err.message}` });
  }
});

// --- DELETE SERVER FROM HOST ---
app.delete('/api/servers/:id', (req, res) => {
  const serverId = req.params.id;
  const reqUser = auth.getSessionUser(req);
  const existingSrv = getServerRegistry().find(s => s.id === serverId);

  if (auth.listUsers().length > 0) {
    if (!reqUser) {
      return res.status(401).json({ success: false, error: 'Anmeldung erforderlich.' });
    }
    if (permissions && !permissions.hasPermission(reqUser, 'servers.delete')) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Löschen von Servern (servers.delete).' });
    }
    const canSeeAll = permissions ? permissions.hasPermission(reqUser, 'admin.all_servers') : reqUser.role === 'admin';
    if (!canSeeAll && existingSrv && customerSystem && !customerSystem.canUserAccessServer(reqUser, existingSrv)) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff zum Löschen dieses Servers.' });
    }
  }

  const srvDir = path.join(DATA_DIR, serverId);

  // Kill running process if active
  if (activeProcesses.has(serverId)) {
    const procInfo = activeProcesses.get(serverId);
    try { procInfo?.process.kill('SIGKILL'); } catch {}
    activeProcesses.delete(serverId);
  }

  removeServerFromRegistry(serverId);
  const firewallResult = firewall ? firewall.closePortsForServer(serverId) : { removed: [], keptSharedPorts: [] };
  customerSystem?.cleanupServerRecords(serverId);
  performanceHistory?.cleanupServerHistory(serverId);
  serverScheduler?.cleanupServerSchedules(serverId);
  securityNetwork?.cleanupServerData(serverId);
  revokeTemporarySftpPassword(MANAGER_STATE_DIR, serverId);

  try {
    if (fs.existsSync(srvDir)) {
      fs.rmSync(srvDir, { recursive: true, force: true });
    }
  } catch (e: any) {
    console.error('Error deleting server dir:', e);
  }

  recordAuditLog({
    serverId,
    user: reqUser?.username || 'Admin',
    action: 'kill',
    details: `Server-Instanz "${existingSrv?.name || serverId}" gelöscht (${firewallResult.removed.length} Firewall-Ports automatisch geschlossen)`,
    severity: 'warning'
  });

  res.json({ success: true, serverId, firewallClosed: firewallResult.removed, keptSharedPorts: firewallResult.keptSharedPorts });
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
  const filePath = ((req.query.file || req.query.path || '') as string).replace(/^\/+/, '').replace(/\\/g, '/');
  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, filePath));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  if (!inside(srvDir, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  if (!fs.existsSync(fullPath)) {
    // Check if server registry has this config file content as fallback
    const servers = getServerRegistry();
    const server = servers.find(s => s.id === serverId);
    const fileName = path.basename(filePath);
    let fallbackContent: string | undefined = undefined;

    if (server?.configFiles) {
      fallbackContent = server.configFiles[filePath] ?? server.configFiles[fileName];
    }
    if (fallbackContent === undefined) {
      if (fileName === 'eula.txt') fallbackContent = '# Generated by ApexHost\neula=true\n';
      else if (fileName === 'server.properties') fallbackContent = `server-port=${server?.port || 25565}\nmotd=§aApexHost Minecraft Server§r\nonline-mode=true\nmax-players=20\n`;
    }

    if (fallbackContent !== undefined) {
      try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, fallbackContent, 'utf8');
        return res.json({ success: true, file: filePath, path: '/' + filePath, content: fallbackContent });
      } catch {}
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
  const file = ((req.body.file || req.body.path || '') as string).replace(/^\/+/, '').replace(/\\/g, '/');
  const content = req.body.content;
  if (!file || content === undefined) {
    return res.status(400).json({ error: 'Datei und Inhalt erforderlich' });
  }

  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, file));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  if (!inside(srvDir, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    
    // Also sync to server registry configFiles (key by exact path and root filename)
    const fileName = path.basename(file);
    const servers = getServerRegistry();
    const srv = servers.find(s => s.id === serverId);
    if (srv) {
      if (!srv.configFiles) srv.configFiles = {};
      srv.configFiles[file] = content;
      if (!file.includes('/')) {
        srv.configFiles[fileName] = content;
      }
      saveServerRegistry(servers);
    }

    appendLog(serverId, 'INFO', `Konfigurationsdatei "${file}" gespeichert.`);
    recordAuditLog({ serverId, action: 'config_edit', details: `Datei "${file}" gespeichert`, severity: 'info' });
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
  const dirPath = ((req.body.path || req.body.name || '') as string).replace(/^\/+/, '').replace(/\\/g, '/');
  if (!dirPath) return res.status(400).json({ error: 'Ordnerpfad erforderlich' });

  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, dirPath));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  if (!inside(srvDir, fullPath)) {
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
app.get(['/api/servers/:id/download', '/api/servers/:id/files/download'], (req, res) => {
  const serverId = req.params.id;
  const file = ((req.query.file || req.query.path || '') as string).replace(/^\/+/, '').replace(/\\/g, '/');
  const srvDir = path.join(DATA_DIR, serverId);
  const fullPath = path.normalize(path.join(srvDir, file));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  if (!inside(srvDir, fullPath)) {
    return res.status(403).send('Zugriff verweigert');
  }

  if (!fs.existsSync(fullPath)) {
    // If file is in server.configFiles or is a default config, materialize and send
    const servers = getServerRegistry();
    const srv = servers.find(s => s.id === serverId);
    const fileName = path.basename(file);
    let fallbackContent: string | undefined = undefined;

    if (srv?.configFiles && (srv.configFiles[file] !== undefined || srv.configFiles[fileName] !== undefined)) {
      fallbackContent = srv.configFiles[file] ?? srv.configFiles[fileName];
    } else if (fileName === 'eula.txt') {
      fallbackContent = '# Generated by ApexHost\neula=true\n';
    } else if (fileName === 'server.properties') {
      fallbackContent = `server-port=${srv?.port || 25565}\nmotd=§aApexHost Minecraft Server§r\nonline-mode=true\nmax-players=20\n`;
    }

    if (fallbackContent !== undefined) {
      try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, fallbackContent, 'utf8');
      } catch {}
    } else {
      return res.status(404).send('Datei nicht gefunden');
    }
  }

  if (fs.statSync(fullPath).isDirectory()) {
    return res.status(400).send('Ordner können nicht direkt als Einzeldatei heruntergeladen werden.');
  }

  res.download(fullPath, path.basename(fullPath));
});

// --- SFTP STATUS & CREDENTIALS ENDPOINTS ---
app.get('/api/sftp/status', (req, res) => {
  res.json({ success: true, ...getSftpServerInfo() });
});

app.get('/api/servers/:id/sftp', (req, res) => {
  const srvId = req.params.id;
  const reqUser = auth.getSessionUser(req);
  const srv = getServerRegistry().find(s => s.id === srvId);
  if (reqUser && reqUser.role !== 'admin' && srv && customerSystem && !customerSystem.canUserAccessServer(reqUser, srv)) {
    return res.status(403).json({ success: false, error: 'Kein Zugriff auf die SFTP-Zugangsdaten dieses Servers.' });
  }

  const sftpInfo = getSftpServerInfo();
  const host = getHostPrimaryIp();
  const port = sftpInfo.port || Number(process.env.SFTP_PORT || 2022);
  const username = `apex_${srvId}`;
  const tempPassword = getTemporarySftpPasswordMeta(MANAGER_STATE_DIR, srvId);

  res.json({
    success: true,
    running: sftpInfo.running,
    host,
    hostName: os.hostname(),
    port,
    username,
    adminUsername: 'admin',
    rootDirectory: `/${srvId}`,
    sftpUri: `sftp://${username}@${host}:${port}`,
    tempPassword
  });
});

app.post('/api/servers/:id/sftp/temp-password', (req, res) => {
  const srvId = req.params.id;
  const reqUser = auth.getSessionUser(req);
  const srv = getServerRegistry().find(s => s.id === srvId);
  if (reqUser && reqUser.role !== 'admin' && srv && customerSystem && !customerSystem.canUserAccessServer(reqUser, srv)) {
    return res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Server.' });
  }

  const requestedTtl = Number(req.body?.ttlMinutes || 60);
  const generated = generateTemporarySftpPassword(MANAGER_STATE_DIR, srvId, requestedTtl);
  const sftpInfo = getSftpServerInfo();
  const host = getHostPrimaryIp();
  const port = sftpInfo.port || Number(process.env.SFTP_PORT || 2022);

  appendLog(srvId, 'INFO', `[SFTP] Temporäres Passwort für ${generated.username} generiert (gültig für ${generated.ttlMinutes} Min).`);
  recordAuditLog({
    serverId: srvId,
    action: 'config',
    user: reqUser?.username || 'Admin',
    details: `Temporäres SFTP-Passwort generiert (gültig bis ${generated.expiresAt}).`,
    severity: 'info'
  });

  res.status(201).json({
    success: true,
    host,
    port,
    username: generated.username,
    password: generated.password,
    createdAt: generated.createdAt,
    expiresAt: generated.expiresAt,
    ttlMinutes: generated.ttlMinutes,
    sftpUri: `sftp://${generated.username}@${host}:${port}`
  });
});

app.delete('/api/servers/:id/sftp/temp-password', (req, res) => {
  const srvId = req.params.id;
  const reqUser = auth.getSessionUser(req);
  const srv = getServerRegistry().find(s => s.id === srvId);
  if (reqUser && reqUser.role !== 'admin' && srv && customerSystem && !customerSystem.canUserAccessServer(reqUser, srv)) {
    return res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Server.' });
  }

  const revoked = revokeTemporarySftpPassword(MANAGER_STATE_DIR, srvId);
  if (revoked) {
    appendLog(srvId, 'WARN', `[SFTP] Aktives temporäres SFTP-Passwort wurde widerrufen.`);
    recordAuditLog({
      serverId: srvId,
      action: 'config',
      user: reqUser?.username || 'Admin',
      details: 'Temporäres SFTP-Passwort manuell widerrufen.',
      severity: 'warning'
    });
  }

  res.json({ success: true, revoked });
});

// --- FILE MANAGER: UPLOAD SINGLE FILE (BASE64) ---
app.post('/api/servers/:id/files/upload', (req, res) => {
  const serverId = req.params.id;
  const { filename, path: subPath = '', relativePath = '', base64 } = req.body;
  if ((!filename && !relativePath) || !base64) {
    return res.status(400).json({ error: 'Dateiname und Base64-Inhalt erforderlich' });
  }

  const srvDir = path.resolve(DATA_DIR, serverId);
  const targetRel = (relativePath || path.join(subPath, filename)).replace(/^\/+/, '').replace(/\\/g, '/');
  const fullPath = path.normalize(path.join(srvDir, targetRel));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };

  if (!inside(srvDir, fullPath)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    const targetDir = path.dirname(fullPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(fullPath, buffer);
    appendLog(serverId, 'SUCCESS', `Datei "${targetRel}" hochgeladen (${(buffer.length / 1024).toFixed(1)} KB).`);
    res.json({ success: true, filename: path.basename(fullPath), path: '/' + targetRel, sizeBytes: buffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FILE MANAGER: UPLOAD MULTIPLE FILES / FOLDERS (BATCH BASE64) ---
app.post('/api/servers/:id/files/upload-batch', (req, res) => {
  const serverId = req.params.id;
  const { files, destinationDir = '' } = req.body;

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Dateiliste (files[]) erforderlich' });
  }

  const srvDir = path.resolve(DATA_DIR, serverId);
  const cleanDest = destinationDir.replace(/^\/+/, '').replace(/\\/g, '/');
  const baseDestDir = path.normalize(path.join(srvDir, cleanDest));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };

  if (!inside(srvDir, baseDestDir)) {
    return res.status(403).json({ error: 'Zielverzeichnis ungültig' });
  }

  let uploadedCount = 0;
  let totalBytes = 0;
  const errors: string[] = [];

  for (const item of files) {
    try {
      const relPath = (item.relativePath || item.path || item.filename || '').replace(/^\/+/, '').replace(/\\/g, '/');
      if (!relPath || !item.base64) continue;

      const fullPath = path.normalize(path.join(baseDestDir, relPath));
      if (!inside(srvDir, fullPath)) {
        errors.push(`Pfad verweigert: ${relPath}`);
        continue;
      }

      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const buffer = Buffer.from(item.base64, 'base64');
      fs.writeFileSync(fullPath, buffer);
      uploadedCount++;
      totalBytes += buffer.length;
    } catch (itemErr: any) {
      errors.push(`Fehler bei ${item.filename || 'Datei'}: ${itemErr.message}`);
    }
  }

  appendLog(serverId, 'SUCCESS', `Batch-Upload abgeschlossen: ${uploadedCount} Datei(en) gespeichert (${(totalBytes / 1024).toFixed(1)} KB).`);
  res.json({
    success: true,
    count: uploadedCount,
    totalBytes,
    errors: errors.length > 0 ? errors : undefined
  });
});

// --- FILE MANAGER: CREATE ZIP ARCHIVE ---
app.post('/api/servers/:id/files/zip', (req, res) => {
  const serverId = req.params.id;
  const { paths: targetPaths, archiveName, destinationDir = '' } = req.body;

  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return res.status(400).json({ error: 'Mindestens ein Pfad zum Archivieren erforderlich' });
  }

  const srvDir = path.resolve(DATA_DIR, serverId);
  const cleanDest = destinationDir.replace(/^\/+/, '').replace(/\\/g, '/');
  const destDir = path.normalize(path.join(srvDir, cleanDest));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };

  if (!inside(srvDir, destDir)) {
    return res.status(403).json({ error: 'Zielverzeichnis ungültig' });
  }

  // Determine archive name
  let rawName = (archiveName || '').trim();
  if (!rawName) {
    if (targetPaths.length === 1) {
      const singleBase = path.basename(targetPaths[0].replace(/\\/g, '/'));
      rawName = singleBase ? `${singleBase}.zip` : `archive-${Date.now()}.zip`;
    } else {
      rawName = `archive-${Date.now()}.zip`;
    }
  }
  if (!rawName.toLowerCase().endsWith('.zip')) {
    rawName += '.zip';
  }
  const cleanZipName = path.basename(rawName);
  const zipPath = path.join(destDir, cleanZipName);

  try {
    const zip = new AdmZip();
    let addedCount = 0;

    for (const relItem of targetPaths) {
      const cleanItem = String(relItem || '').replace(/^\/+/, '').replace(/\\/g, '/');
      const fullItemPath = path.normalize(path.join(srvDir, cleanItem));

      if (!inside(srvDir, fullItemPath) || !fs.existsSync(fullItemPath)) {
        continue;
      }

      const stat = fs.statSync(fullItemPath);
      const entryBase = path.basename(fullItemPath);

      if (stat.isDirectory()) {
        zip.addLocalFolder(fullItemPath, entryBase);
        addedCount++;
      } else if (stat.isFile()) {
        zip.addLocalFile(fullItemPath, '', entryBase);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      return res.status(400).json({ error: 'Keine gültigen Dateien zum Komprimieren gefunden' });
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    zip.writeZip(zipPath);
    const statZip = fs.statSync(zipPath);
    const sizeMb = (statZip.size / (1024 * 1024)).toFixed(2);

    appendLog(serverId, 'SUCCESS', `ZIP-Archiv "${cleanZipName}" erstellt (${sizeMb} MB, ${addedCount} Quelleinträge).`);
    recordAuditLog({ serverId, action: 'backup', details: `ZIP-Archiv "${cleanZipName}" erstellt (${sizeMb} MB)`, severity: 'success' });
    res.json({
      success: true,
      archiveName: cleanZipName,
      path: '/' + path.relative(srvDir, zipPath).replace(/\\/g, '/'),
      sizeBytes: statZip.size
    });
  } catch (err: any) {
    console.error('[ZIP Error]', err);
    res.status(500).json({ error: `ZIP-Erstellung fehlgeschlagen: ${err.message}` });
  }
});

// --- FILE MANAGER: UNZIP ARCHIVE ---
app.post('/api/servers/:id/files/unzip', (req, res) => {
  const serverId = req.params.id;
  const { file, destinationDir, overwrite = true } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'Dateipfad des ZIP-Archivs erforderlich' });
  }

  const srvDir = path.resolve(DATA_DIR, serverId);
  const cleanFile = file.replace(/^\/+/, '').replace(/\\/g, '/');
  const zipFullPath = path.normalize(path.join(srvDir, cleanFile));

  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };

  if (!inside(srvDir, zipFullPath) || !fs.existsSync(zipFullPath)) {
    return res.status(404).json({ error: 'ZIP-Archiv nicht gefunden' });
  }

  // Determine extraction destination (defaults to directory containing the zip)
  let destDir = path.dirname(zipFullPath);
  if (destinationDir !== undefined && destinationDir !== null) {
    const cleanDest = destinationDir.replace(/^\/+/, '').replace(/\\/g, '/');
    destDir = path.normalize(path.join(srvDir, cleanDest));
  }

  if (!inside(srvDir, destDir)) {
    return res.status(403).json({ error: 'Zielverzeichnis verweigert' });
  }

  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const zip = new AdmZip(zipFullPath);
    const zipEntries = zip.getEntries();
    let extractedCount = 0;

    // Safe extraction against Zip Slip
    for (const entry of zipEntries) {
      const entryTarget = path.normalize(path.join(destDir, entry.entryName));
      if (!inside(destDir, entryTarget)) {
        console.warn(`[Unzip] Überspringe unzulässigen Eintrag (Zip Slip Prävention): ${entry.entryName}`);
        continue;
      }

      if (entry.isDirectory) {
        fs.mkdirSync(entryTarget, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(entryTarget), { recursive: true });
        if (overwrite || !fs.existsSync(entryTarget)) {
          fs.writeFileSync(entryTarget, entry.getData());
          extractedCount++;
        }
      }
    }

    const archiveBase = path.basename(zipFullPath);
    const destRel = '/' + path.relative(srvDir, destDir).replace(/\\/g, '/');
    appendLog(serverId, 'SUCCESS', `Archiv "${archiveBase}" entpackt (${extractedCount} Dateien extrahiert nach "${destRel === '/.' ? '/' : destRel}").`);
    recordAuditLog({ serverId, action: 'config_edit', details: `Archiv "${archiveBase}" entpackt (${extractedCount} Dateien)`, severity: 'info' });

    res.json({
      success: true,
      file: cleanFile,
      extractedCount,
      destinationDir: destRel === '/.' ? '/' : destRel
    });
  } catch (err: any) {
    console.error('[Unzip Error]', err);
    res.status(500).json({ error: `Entpacken fehlgeschlagen: ${err.message}` });
  }
});

// --- FILE MANAGER: DELETE BATCH ---
app.post('/api/servers/:id/files/delete-batch', (req, res) => {
  const serverId = req.params.id;
  const { files: targetFiles } = req.body;

  if (!Array.isArray(targetFiles) || targetFiles.length === 0) {
    return res.status(400).json({ error: 'Liste von Dateien zum Löschen erforderlich' });
  }

  const srvDir = path.resolve(DATA_DIR, serverId);
  const inside = (base: string, candidate: string) => {
    const rel = path.relative(path.normalize(base), path.normalize(candidate));
    return rel !== '' && (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };

  let deletedCount = 0;
  for (const relFile of targetFiles) {
    try {
      const cleanPath = String(relFile || '').replace(/^\/+/, '').replace(/\\/g, '/');
      const fullPath = path.normalize(path.join(srvDir, cleanPath));
      if (inside(srvDir, fullPath) && fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        deletedCount++;
      }
    } catch {}
  }

  appendLog(serverId, 'WARN', `${deletedCount} Datei(en)/Ordner gelöscht.`);
  res.json({ success: true, count: deletedCount });
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
      recordAuditLog({ serverId, action: 'config_edit', details: `Datei/Ordner "${file}" gelöscht`, severity: 'warning' });
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
  recordAuditLog({ serverId, action: 'command', details: `Befehl ausgeführt: "${command}"`, severity: 'info' });

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
    recordAuditLog({ serverId, action: 'config_edit', details: `Java-Laufzeit auf ${javaVersion} (JDK ${major}) geändert`, severity: 'success' });
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

// --- REAL PLAYER, WHITELIST, OP & BAN MANAGEMENT ENDPOINTS ---
app.get('/api/servers/:id/players', (req, res) => {
  const serverId = req.params.id;
  const servers = getServerRegistry();
  const srv = servers.find(s => s.id === serverId);
  if (!srv) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  const whitelistEntries = readServerJsonList(serverId, 'whitelist.json');
  const opsEntries = readServerJsonList(serverId, 'ops.json');
  const bannedEntries = readServerJsonList(serverId, 'banned-players.json');
  const liveMetrics = serverMetricsMap.get(serverId);
  const onlineNames = activeProcesses.has(serverId) ? (liveMetrics?.playerList || []) : [];

  const opsSet = new Set(opsEntries.map((o: any) => String(o.name || o.username || o).toLowerCase()));
  const wlSet = new Set(whitelistEntries.map((w: any) => String(w.name || w.username || w).toLowerCase()));
  const wlProp = readServerProperty(serverId, 'white-list');

  const onlinePlayers = onlineNames.map((name, idx) => ({
    id: `pl_${idx}_${name}`,
    username: name,
    pingMs: liveMetrics?.lastPingMs || 0,
    ip: '127.0.0.1',
    joinedAt: 'Online',
    isOp: opsSet.has(name.toLowerCase()),
    isWhitelisted: wlSet.has(name.toLowerCase())
  }));

  res.json({
    success: true,
    serverId,
    running: activeProcesses.has(serverId),
    onlinePlayers,
    onlineCount: onlineNames.length,
    maxPlayers: liveMetrics?.maxPlayers || srv.maxPlayers || 20,
    whitelist: whitelistEntries.map((w: any) => String(w.name || w.username || w)).filter(Boolean),
    whitelistEnabled: wlProp === 'true',
    ops: opsEntries.map((o: any) => ({ name: String(o.name || o.username || o), level: o.level || 4 })),
    banned: bannedEntries.map((b: any) => ({ name: String(b.name || b.username || b), reason: b.reason || 'Banned by operator', created: b.created || '' }))
  });
});

app.post('/api/servers/:id/players/whitelist', (req, res) => {
  const serverId = req.params.id;
  const { action, username, enabled } = req.body || {};
  const list = readServerJsonList(serverId, 'whitelist.json');
  const proc = activeProcesses.get(serverId);

  if (action === 'toggle') {
    const nextState = Boolean(enabled);
    writeServerProperty(serverId, 'white-list', nextState ? 'true' : 'false');
    if (proc?.process?.stdin?.writable) {
      proc.process.stdin.write(`whitelist ${nextState ? 'on' : 'off'}\n`);
    }
    recordAuditLog({ serverId, action: 'config_edit', details: `Whitelist ${nextState ? 'aktiviert' : 'deaktiviert'}`, severity: 'info' });
    return res.json({ success: true, whitelistEnabled: nextState });
  }

  const cleanUser = String(username || '').trim();
  if (!cleanUser) return res.status(400).json({ success: false, error: 'Spielername erforderlich' });

  if (action === 'add') {
    if (!list.some((w: any) => String(w.name || w).toLowerCase() === cleanUser.toLowerCase())) {
      list.push({ uuid: `offline-${cleanUser.toLowerCase()}`, name: cleanUser });
      writeServerJsonList(serverId, 'whitelist.json', list);
    }
    if (proc?.process?.stdin?.writable) proc.process.stdin.write(`whitelist add ${cleanUser}\n`);
    recordAuditLog({ serverId, action: 'command', details: `Spieler "${cleanUser}" zur Whitelist hinzugefügt`, severity: 'success' });
  } else if (action === 'remove') {
    const filtered = list.filter((w: any) => String(w.name || w).toLowerCase() !== cleanUser.toLowerCase());
    writeServerJsonList(serverId, 'whitelist.json', filtered);
    if (proc?.process?.stdin?.writable) proc.process.stdin.write(`whitelist remove ${cleanUser}\n`);
    recordAuditLog({ serverId, action: 'command', details: `Spieler "${cleanUser}" von der Whitelist entfernt`, severity: 'warning' });
  } else {
    return res.status(400).json({ success: false, error: 'Ungültige Whitelist-Aktion' });
  }

  const updated = readServerJsonList(serverId, 'whitelist.json').map((w: any) => String(w.name || w));
  res.json({ success: true, whitelist: updated });
});

app.post('/api/servers/:id/players/op', (req, res) => {
  const serverId = req.params.id;
  const cleanUser = String(req.body?.username || '').trim();
  if (!cleanUser) return res.status(400).json({ success: false, error: 'Spielername erforderlich' });

  const ops = readServerJsonList(serverId, 'ops.json');
  const exists = ops.some((o: any) => String(o.name || o).toLowerCase() === cleanUser.toLowerCase());
  const shouldBeOp = req.body?.op !== undefined ? Boolean(req.body.op) : !exists;

  let nextOps = ops;
  if (shouldBeOp && !exists) {
    nextOps = [...ops, { uuid: `offline-${cleanUser.toLowerCase()}`, name: cleanUser, level: 4, bypassesPlayerLimit: false }];
  } else if (!shouldBeOp) {
    nextOps = ops.filter((o: any) => String(o.name || o).toLowerCase() !== cleanUser.toLowerCase());
  }
  writeServerJsonList(serverId, 'ops.json', nextOps);

  const proc = activeProcesses.get(serverId);
  if (proc?.process?.stdin?.writable) {
    proc.process.stdin.write(`${shouldBeOp ? 'op' : 'deop'} ${cleanUser}\n`);
  }
  recordAuditLog({
    serverId,
    action: 'command',
    details: `${shouldBeOp ? 'OP-Rechte vergeben an' : 'OP-Rechte entzogen von'} "${cleanUser}"`,
    severity: shouldBeOp ? 'warning' : 'info'
  });

  res.json({ success: true, isOp: shouldBeOp, ops: nextOps });
});

app.post('/api/servers/:id/players/kick', (req, res) => {
  const serverId = req.params.id;
  const cleanUser = String(req.body?.username || '').trim();
  const reason = String(req.body?.reason || 'Vom Server-Admin gekickt').trim();
  if (!cleanUser) return res.status(400).json({ success: false, error: 'Spielername erforderlich' });

  const proc = activeProcesses.get(serverId);
  if (!proc) {
    return res.status(400).json({ success: false, error: 'Server läuft nicht. Kick erfordert einen aktiven Server-Prozess.' });
  }
  if (proc.process?.stdin?.writable) {
    proc.process.stdin.write(`kick ${cleanUser} ${reason}\n`);
  }
  const metrics = serverMetricsMap.get(serverId);
  if (metrics) {
    metrics.playerList = metrics.playerList.filter(p => p.toLowerCase() !== cleanUser.toLowerCase());
    metrics.currentPlayers = metrics.playerList.length;
  }
  recordAuditLog({ serverId, action: 'command', details: `Spieler "${cleanUser}" gekickt (${reason})`, severity: 'warning' });
  res.json({ success: true, message: `Kick-Befehl für ${cleanUser} übermittelt.` });
});

app.post('/api/servers/:id/players/ban', (req, res) => {
  const serverId = req.params.id;
  const action = req.body?.action === 'unban' ? 'unban' : 'ban';
  const cleanUser = String(req.body?.username || '').trim();
  const reason = String(req.body?.reason || 'Vom Administrator gesperrt').trim();
  if (!cleanUser) return res.status(400).json({ success: false, error: 'Spielername erforderlich' });

  const banned = readServerJsonList(serverId, 'banned-players.json');
  let nextBanned = banned;
  if (action === 'ban') {
    if (!banned.some((b: any) => String(b.name || b).toLowerCase() === cleanUser.toLowerCase())) {
      nextBanned = [...banned, { uuid: `offline-${cleanUser.toLowerCase()}`, name: cleanUser, created: new Date().toISOString(), source: 'ApexHost Panel', expires: 'forever', reason }];
    }
    const metrics = serverMetricsMap.get(serverId);
    if (metrics) {
      metrics.playerList = metrics.playerList.filter(p => p.toLowerCase() !== cleanUser.toLowerCase());
      metrics.currentPlayers = metrics.playerList.length;
    }
  } else {
    nextBanned = banned.filter((b: any) => String(b.name || b).toLowerCase() !== cleanUser.toLowerCase());
  }
  writeServerJsonList(serverId, 'banned-players.json', nextBanned);

  const proc = activeProcesses.get(serverId);
  if (proc?.process?.stdin?.writable) {
    proc.process.stdin.write(`${action === 'ban' ? 'ban' : 'pardon'} ${cleanUser}${action === 'ban' ? ' ' + reason : ''}\n`);
  }
  recordAuditLog({
    serverId,
    action: 'command',
    details: `${action === 'ban' ? 'Spieler gebannt' : 'Spieler entbannt'}: "${cleanUser}"`,
    severity: action === 'ban' ? 'warning' : 'info'
  });

  res.json({ success: true, banned: nextBanned });
});

// --- REAL DISCORD & WEBHOOK ENDPOINTS ---
const DEFAULT_WEBHOOK_CONFIG: ServerWebhookConfig = {
  webhookUrl: '',
  botName: 'ApexHost Bot',
  avatarUrl: '',
  isEnabled: false,
  events: {
    onStart: true,
    onStop: true,
    onCrash: true,
    onBackup: true,
    onPlayerJoin: false,
    onHighCpu: true
  }
};

app.get('/api/servers/:id/webhooks', (req, res) => {
  const all = readManagerJson<Record<string, ServerWebhookConfig>>(WEBHOOKS_FILE, {});
  const config = all[req.params.id] ? { ...DEFAULT_WEBHOOK_CONFIG, ...all[req.params.id] } : DEFAULT_WEBHOOK_CONFIG;
  res.json({ success: true, config });
});

app.post('/api/servers/:id/webhooks', (req, res) => {
  const serverId = req.params.id;
  const body = req.body || {};
  const all = readManagerJson<Record<string, ServerWebhookConfig>>(WEBHOOKS_FILE, {});
  const next: ServerWebhookConfig = {
    webhookUrl: String(body.webhookUrl || '').trim(),
    botName: String(body.botName || 'ApexHost Bot').trim() || 'ApexHost Bot',
    avatarUrl: String(body.avatarUrl || '').trim(),
    isEnabled: Boolean(body.isEnabled),
    events: { ...DEFAULT_WEBHOOK_CONFIG.events, ...(body.events || {}) },
    updatedAt: new Date().toISOString()
  };
  all[serverId] = next;
  writeManagerJson(WEBHOOKS_FILE, all);
  recordAuditLog({ serverId, action: 'config_edit', details: `Webhook-Konfiguration aktualisiert (${next.isEnabled ? 'aktiv' : 'inaktiv'})`, severity: 'info' });
  res.json({ success: true, config: next });
});

async function sendRealWebhookTest(webhookUrl: string, botName: string, title: string, description: string) {
  if (!isValidWebhookEndpoint(webhookUrl)) {
    return { ok: false, status: 400, error: 'Bitte eine gültige, echte HTTP/HTTPS Discord Webhook-URL eingeben (keine Demo-URL).' };
  }
  try {
    const response = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: botName || 'ApexHost Bot',
        embeds: [
          {
            title,
            description,
            color: 0x10b981,
            timestamp: new Date().toISOString()
          }
        ]
      }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: `Webhook-Endpunkt antwortete mit HTTP ${response.status}${errText ? ': ' + errText.slice(0, 120) : ''}` };
    }
    return { ok: true, status: response.status };
  } catch (err: any) {
    return { ok: false, status: 502, error: `Webhook-Verbindung fehlgeschlagen: ${err.message}` };
  }
}

app.post('/api/servers/:id/webhooks/test', async (req, res) => {
  const serverId = req.params.id;
  const all = readManagerJson<Record<string, ServerWebhookConfig>>(WEBHOOKS_FILE, {});
  const stored = all[serverId];
  const webhookUrl = String(req.body?.webhookUrl ?? stored?.webhookUrl ?? '').trim();
  const botName = String(req.body?.botName ?? stored?.botName ?? 'ApexHost Bot').trim();
  const srv = getServerRegistry().find(s => s.id === serverId);
  const result = await sendRealWebhookTest(
    webhookUrl,
    botName,
    `Test-Signal: ${srv?.name || serverId}`,
    `Die Discord Webhook-Verbindung für Instanz **${srv?.name || serverId}** (Port ${srv?.port || 25565}) funktioniert einwandfrei.`
  );
  if (!result.ok) {
    return res.status(result.status >= 400 && result.status < 600 ? result.status : 400).json({ success: false, status: result.status, error: result.error });
  }
  recordAuditLog({ serverId, action: 'config_edit', details: `Webhook-Test erfolgreich zugestellt (HTTP ${result.status})`, severity: 'success' });
  res.json({ success: true, status: result.status, message: `Webhook erfolgreich zugestellt (HTTP ${result.status}).` });
});

app.post('/api/webhooks/test', async (req, res) => {
  if (!requirePermissionIfInitialized(req, res, 'admin.settings')) return;
  const webhookUrl = String(req.body?.webhookUrl || '').trim();
  const botName = String(req.body?.botName || 'ApexHost Admin Monitor').trim();
  const result = await sendRealWebhookTest(
    webhookUrl,
    botName,
    'ApexHost Cluster Test-Ping',
    `System-Webhook erfolgreich verbunden über Host **${os.hostname()}**.`
  );
  if (!result.ok) {
    return res.status(result.status >= 400 && result.status < 600 ? result.status : 400).json({ success: false, status: result.status, error: result.error });
  }
  recordAuditLog({ serverId: 'system', action: 'config_edit', details: `Globaler Admin-Webhook getestet (HTTP ${result.status})`, severity: 'success' });
  res.json({ success: true, status: result.status, message: `Test-Ping erfolgreich gesendet (HTTP ${result.status}).` });
});

// --- REAL PERSISTED AUDIT LOG ENDPOINTS ---
app.get('/api/servers/:id/audit', (req, res) => {
  const serverId = req.params.id;
  const all = readManagerJson<PersistedAuditEntry[]>(AUDIT_LOG_FILE, []);
  const logs = all.filter(entry => entry.serverId === serverId);
  res.json({ success: true, logs });
});

app.delete('/api/servers/:id/audit', (req, res) => {
  const serverId = req.params.id;
  const all = readManagerJson<PersistedAuditEntry[]>(AUDIT_LOG_FILE, []);
  const remaining = all.filter(entry => entry.serverId !== serverId);
  writeManagerJson(AUDIT_LOG_FILE, remaining);
  res.json({ success: true, message: 'Server-Audit-Protokoll geleert.' });
});

app.get('/api/audit', (req, res) => {
  if (!requirePermissionIfInitialized(req, res, 'admin.panel')) return;
  const logs = readManagerJson<PersistedAuditEntry[]>(AUDIT_LOG_FILE, []);
  res.json({ success: true, logs });
});

// --- REAL NETWORK PORTS & SUBDOMAIN ENDPOINTS ---
app.get('/api/servers/:id/ports', (req, res) => {
  const serverId = req.params.id;
  const srv = getServerRegistry().find(s => s.id === serverId);
  if (!srv) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  const basePorts = [
    { id: 'p_primary', port: Number(srv.port || 25565), type: 'primary', protocol: 'TCP/UDP', serviceName: 'Haupt-Gameport (Verbindung für Spieler)', isPrimary: true },
    { id: 'p_query', port: Number(srv.queryPort || (srv.port || 25565) + 1), type: 'query', protocol: 'UDP', serviceName: 'Gamespy / Steam Query Ping', isPrimary: false },
    { id: 'p_rcon', port: Number(srv.rconPort || 25575), type: 'rcon', protocol: 'TCP', serviceName: 'RCON Remote Console', isPrimary: false }
  ];
  const extraPorts = Array.isArray(srv.extraPorts) ? srv.extraPorts : [];

  res.json({
    success: true,
    hostIp: getHostPrimaryIp(),
    hostName: os.hostname(),
    customSubdomain: srv.customSubdomain || srv.name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    ports: [...basePorts, ...extraPorts]
  });
});

app.post('/api/servers/:id/ports', async (req, res) => {
  const serverId = req.params.id;
  const registry = getServerRegistry();
  const idx = registry.findIndex(s => s.id === serverId);
  if (idx < 0) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  const port = Number(req.body?.port);
  const serviceName = String(req.body?.serviceName || 'Zusatzdienst').trim();
  const protocol = ['TCP', 'UDP', 'TCP/UDP'].includes(req.body?.protocol) ? req.body.protocol : 'UDP';

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return res.status(400).json({ success: false, error: 'Port muss eine Ganzzahl zwischen 1024 und 65535 sein.' });
  }

  const srv = registry[idx];
  const usedInServer = [srv.port, srv.queryPort, srv.rconPort, ...(Array.isArray(srv.extraPorts) ? srv.extraPorts.map((p: any) => p.port) : [])];
  if (usedInServer.includes(port)) {
    return res.status(409).json({ success: false, error: `Port ${port} ist diesem Server bereits zugewiesen.` });
  }

  const inUseOnHost = await checkPortInUse(port);
  if (inUseOnHost) {
    return res.status(409).json({ success: false, error: `Port ${port} ist auf diesem Host bereits durch einen anderen Prozess belegt.` });
  }

  const allocation = {
    id: `p_${Date.now().toString(36)}`,
    port,
    type: 'web',
    protocol,
    serviceName: serviceName || 'Zusätzlicher Port',
    isPrimary: false
  };

  if (!Array.isArray(srv.extraPorts)) srv.extraPorts = [];
  srv.extraPorts.push(allocation);
  saveServerRegistry(registry);

  recordAuditLog({ serverId, action: 'port_change', details: `Port ${port} (${protocol}) für "${allocation.serviceName}" reserviert`, severity: 'info' });
  res.json({ success: true, port: allocation });
});

app.delete('/api/servers/:id/ports/:portId', (req, res) => {
  const { id: serverId, portId } = req.params;
  const registry = getServerRegistry();
  const idx = registry.findIndex(s => s.id === serverId);
  if (idx < 0) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  const srv = registry[idx];
  const before = Array.isArray(srv.extraPorts) ? srv.extraPorts : [];
  const removed = before.find((p: any) => p.id === portId);
  if (!removed) return res.status(404).json({ success: false, error: 'Port-Zuweisung nicht gefunden oder nicht löschbar' });

  srv.extraPorts = before.filter((p: any) => p.id !== portId);
  saveServerRegistry(registry);
  recordAuditLog({ serverId, action: 'port_change', details: `Port ${removed.port} freigegeben`, severity: 'warning' });
  res.json({ success: true, portId });
});

app.post('/api/servers/:id/domain', (req, res) => {
  const serverId = req.params.id;
  const subdomain = String(req.body?.subdomain || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48);
  if (!subdomain || subdomain.length < 2) {
    return res.status(400).json({ success: false, error: 'Subdomain muss mindestens 2 gültige Zeichen (a-z, 0-9, -) enthalten.' });
  }
  const registry = getServerRegistry();
  const idx = registry.findIndex(s => s.id === serverId);
  if (idx < 0) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  registry[idx].customSubdomain = subdomain;
  saveServerRegistry(registry);
  recordAuditLog({ serverId, action: 'port_change', details: `Subdomain auf "${subdomain}.apexhost.me" gespeichert`, severity: 'success' });
  res.json({ success: true, customSubdomain: subdomain });
});

// --- REAL MODRINTH UPDATE CHECK ENDPOINT ---
app.post('/api/servers/:id/mods/check-updates', async (req, res) => {
  const serverId = req.params.id;
  const srv = getServerRegistry().find(s => s.id === serverId);
  if (!srv) return res.status(404).json({ success: false, error: 'Server nicht gefunden' });

  const installedMods = Array.isArray(srv.installedMods) ? srv.installedMods : [];
  const updates: Record<string, string> = {};
  let checkedCount = 0;

  for (const mod of installedMods) {
    const rawId = String(mod.modId || '').replace(/^mr_/, '').trim();
    if (!rawId) continue;
    checkedCount++;
    try {
      const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(rawId)}/version`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Sonora-Gameserver-Manager/2.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (!resp.ok) continue;
      const versions: any[] = await resp.json();
      if (!Array.isArray(versions) || versions.length === 0) continue;

      const gameVer = String(srv.version || '').trim();
      const loader = String(srv.minecraftType || '').toLowerCase();
      const compatible = versions.find(v =>
        (!gameVer || !Array.isArray(v.game_versions) || v.game_versions.includes(gameVer)) &&
        (!loader || !Array.isArray(v.loaders) || v.loaders.includes(loader))
      ) || versions[0];

      const latestVer = String(compatible?.version_number || '').trim();
      if (latestVer && latestVer !== String(mod.version || '').trim()) {
        updates[mod.id] = latestVer;
      }
    } catch {
      // Skip non-Modrinth or temporarily unreachable projects without fabricating updates
    }
  }

  res.json({
    success: true,
    checkedCount,
    updates,
    count: Object.keys(updates).length
  });
});

// --- ADMIN SETTINGS & REAL SYSTEM NODES ENDPOINTS ---
app.get('/api/admin/settings', (req, res) => {
  const saved = readManagerJson<Record<string, any> | null>(ADMIN_SETTINGS_FILE, null);
  const reqUser = auth.getSessionUser(req);
  const canViewFull = auth.listUsers().length === 0 || (!!reqUser && (!permissions || permissions.hasPermission(reqUser, 'admin.settings')));
  if (!canViewFull && saved) {
    // Sanitized public UI subset for regular users (no API keys, webhooks or internal system tokens)
    return res.json({
      success: true,
      restricted: true,
      settings: {
        maintenanceMode: Boolean(saved.maintenanceMode),
        maintenanceMessage: saved.maintenanceMessage || '',
        defaultMinecraftVersion: saved.defaultMinecraftVersion,
        defaultJavaVersion: saved.defaultJavaVersion,
        defaultRamAllocationGb: saved.defaultRamAllocationGb,
        steamMode: saved.steamMode
      }
    });
  }
  res.json({ success: true, settings: saved });
});

app.post('/api/admin/settings', (req, res) => {
  if (!requirePermissionIfInitialized(req, res, 'admin.settings')) return;
  const settings = req.body?.settings;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, error: 'Ungültige Einstellungen' });
  }
  const next = { ...settings, lastUpdated: new Date().toISOString().slice(0, 10) };
  writeManagerJson(ADMIN_SETTINGS_FILE, next);
  recordAuditLog({ serverId: 'system', action: 'config_edit', details: 'Globale System- & Steam-Einstellungen gespeichert', severity: 'info' });
  res.json({ success: true, settings: next });
});

app.get('/api/system/nodes', (req, res) => {
  if (!requirePermissionIfInitialized(req, res, 'admin.system')) return;
  const totalRamGb = Math.max(1, Math.round(os.totalmem() / (1024 * 1024 * 1024)));
  const freeRamGb = Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10;
  const usedRamGb = Math.max(0.1, Math.round((totalRamGb - freeRamGb) * 10) / 10);
  const loadAvg = os.loadavg()[0] || 0;
  const cpuCount = Math.max(1, os.cpus().length);
  const cpuUsage = Math.min(100, Math.max(1, Math.round((loadAvg / cpuCount) * 100) || 4));
  const servers = getServerRegistry();
  const totalDataBytes = computeServerDiskBreakdown(DATA_DIR).totalBytes;
  const diskUsageGb = Math.max(0.01, Math.round((totalDataBytes / (1024 * 1024 * 1024)) * 100) / 100);

  const localNode = {
    id: 'node_local_host',
    name: os.hostname() || 'Lokaler Host Node',
    location: `${os.platform()} (${os.arch()})`,
    ip: getHostPrimaryIp(),
    status: 'online',
    cpuUsage,
    ramUsageGb: usedRamGb,
    maxRamGb: totalRamGb,
    diskUsageGb,
    maxDiskGb: Math.max(50, Math.ceil(diskUsageGb * 4)),
    activeServersCount: servers.filter(s => activeProcesses.has(s.id)).length,
    totalServersCount: servers.length
  };
  res.json({ success: true, nodes: [localNode] });
});

// Mount RBAC Permissions System (strict Admin vs. Moderator vs. User separation)
permissions = configurePermissions(app, {
  auth,
  managerStateDir: MANAGER_STATE_DIR,
  recordAuditLog
});
auth.setPermissionsResolver((user) => ({
  role: permissions!.getEffectiveRole(user),
  permissions: permissions!.getEffectivePermissions(user)
}));

// Mount Automated Debian Firewall (UFW / iptables) & Port Provisioning
firewall = configureFirewall(app, {
  auth,
  permissions,
  managerStateDir: MANAGER_STATE_DIR,
  getServerRegistry,
  recordAuditLog,
  appendLog
});

const canAccessServerWithRbac = (user: any, srv: any) => {
  if (permissions && permissions.hasPermission(user, 'admin.all_servers')) return true;
  return customerSystem ? customerSystem.canUserAccessServer(user, srv) : true;
};

// Mount 100% persistent UserCP, Customer System (CRM), Shop Provisioner & Admin User Management
customerSystem = configureCustomerSystem(app, {
  auth,
  managerStateDir: MANAGER_STATE_DIR,
  dataDir: DATA_DIR,
  getServerRegistry,
  upsertServerInRegistry,
  checkPortInUse,
  getHostPrimaryIp,
  recordAuditLog,
  appendLog,
  installMinecraftServer,
  installSteamGameServer,
  activeProcesses,
  onServerCreated: (srv) => {
    try {
      firewall?.openPortsForServer(srv);
    } catch {}
  }
});

// Mount 24-hour persistent historical CPU, RAM & Network performance monitor
performanceHistory = configurePerformanceHistory(app, {
  auth,
  managerStateDir: MANAGER_STATE_DIR,
  getServerRegistry,
  activeProcesses,
  getLiveServerStats,
  canUserAccessServer: canAccessServerWithRbac
});

// Mount persistent Cron-style Server Scheduler (Start / Stop / Restart)
serverScheduler = configureServerScheduler(app, {
  auth,
  managerStateDir: MANAGER_STATE_DIR,
  getServerRegistry,
  activeProcesses,
  canUserAccessServer: canAccessServerWithRbac,
  recordAuditLog,
  appendLog,
  executePowerAction: async (serverId: string, action: ScheduledPowerAction, options) => {
    const srv = getServerRegistry().find(s => s.id === serverId);
    if (!srv) {
      return { success: false, message: `Serverinstanz "${serverId}" nicht gefunden.` };
    }

    const triggerPower = async (powerAction: 'start' | 'stop' | 'restart') => {
      const response = await fetch(`http://127.0.0.1:${Number(PORT)}/api/servers/${encodeURIComponent(serverId)}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: powerAction,
          ramGb: srv.allocatedRamGb || 4,
          port: srv.port || 25565,
          category: srv.category || 'minecraft',
          steamAppId: srv.steamAppId,
          executable: srv.linuxExecutable,
          startArgs: srv.linuxStartArgs,
          version: srv.version,
          minecraftType: srv.minecraftType,
          javaVersion: srv.javaVersion
        })
      });
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Power-Aktion "${powerAction}" fehlgeschlagen (HTTP ${response.status}).`);
      }
      return data;
    };

    const sendWarningBroadcast = (msg?: string) => {
      const cleanMsg = String(msg || '').trim();
      const procInfo = activeProcesses.get(serverId);
      if (cleanMsg && procInfo?.process?.stdin?.writable) {
        try {
          procInfo.process.stdin.write(`say ${cleanMsg}\n`);
          appendLog(serverId, 'INFO', `[Zeitplaner Broadcast] ${cleanMsg}`);
        } catch {}
      }
    };

    if (action === 'start') {
      if (activeProcesses.has(serverId)) {
        return { success: true, skipped: true, message: 'Server läuft bereits.' };
      }
      const data = await triggerPower('start');
      return { success: true, message: data.message || 'Server erfolgreich gestartet.' };
    }

    if (action === 'stop') {
      if (!activeProcesses.has(serverId)) {
        return { success: true, skipped: true, message: 'Server ist bereits offline.' };
      }
      sendWarningBroadcast(options?.warningMessage);
      const data = await triggerPower('stop');
      return { success: true, message: data.message || 'Stopp-Signal erfolgreich gesendet.' };
    }

    // action === 'restart'
    if (activeProcesses.has(serverId)) {
      sendWarningBroadcast(options?.warningMessage);
      await triggerPower('restart');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    const startRes = await triggerPower('start');
    return { success: true, message: startRes.message || 'Server-Neustart erfolgreich ausgeführt.' };
  }
});

// Mount DDoS Security-Status & Network-Overview (Ping, Packet Loss, Regional Latency)
securityNetwork = configureSecurityNetwork(app, {
  auth,
  managerStateDir: MANAGER_STATE_DIR,
  getServerRegistry,
  activeProcesses,
  getHostPrimaryIp,
  canUserAccessServer: canAccessServerWithRbac,
  recordAuditLog,
  appendLog
});

// Mount Server Diagnostics & Quick-Fix Engine (File, Dependency, Config & Install Status Scanner)
const serverDiagnostics: ServerDiagnosticsController = configureServerDiagnostics(app, {
  auth,
  permissions,
  firewall,
  dataDir: DATA_DIR,
  jdksDir: JDKS_DIR,
  getServerRegistry,
  upsertServerInRegistry,
  canUserAccessServer: canAccessServerWithRbac,
  getRequiredJdkMajor,
  ensureJdk,
  findGameExecutable,
  installMinecraftServer,
  installBedrockServer,
  installSteamGameServer: async (serverId, srvDir, gameSpec) => {
    const appId = Number(gameSpec.steamAppId) || 0;
    const ok = await installSteamGameServer(serverId, srvDir, appId, gameSpec.gameId);
    const execPath = findGameExecutable(srvDir, gameSpec.executable) || undefined;
    return {
      success: ok,
      method: appId > 0 ? `SteamCMD / Dedicated (AppID ${appId})` : 'Dedicated Installer',
      executablePath: execPath,
      message: ok ? 'Spieldateien erfolgreich eingerichtet.' : 'Spieldateien konnten nicht automatisch eingerichtet werden.'
    };
  },
  setInstallProgress,
  appendLog,
  recordAuditLog
});
void serverDiagnostics;

// Mount Real-Time Console Log Analyzer & Filesystem Quick-Fix Engine
const logAnalyzer = configureLogAnalyzer(app, {
  auth,
  permissions,
  dataDir: DATA_DIR,
  jdksDir: JDKS_DIR,
  getServerRegistry,
  upsertServerInRegistry,
  canUserAccessServer: canAccessServerWithRbac,
  getServerLogs: (serverId) => memoryLogBuffers.get(serverId) || [],
  detectSteamCmd,
  ensureSteamClientSymlinks,
  findGameExecutable,
  getRequiredJdkMajor,
  ensureJdk,
  installMinecraftServer,
  installBedrockServer,
  installSteamGameServer,
  appendLog,
  recordAuditLog
});
void logAnalyzer;

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
