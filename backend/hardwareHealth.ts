import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type { Express, Request, Response } from 'express';
import type { AuthController, StoredUserAccount } from './auth';
import type { PermissionsController } from './permissions';

export interface DiskIoMetrics {
  readMbPerSec: number;
  writeMbPerSec: number;
  totalMbPerSec: number;
  readIops: number;
  writeIops: number;
  totalIops: number;
  utilizationPercent: number;
  deviceCount: number;
  source: 'proc_diskstats' | 'estimated';
}

export interface InodeMetrics {
  filesystem: string;
  mountPoint: string;
  used: number;
  total: number;
  free: number;
  usedPercent: number;
  serverFileCount: number;
  source: 'df_inodes' | 'estimated';
}

export interface DiskSpaceMetrics {
  filesystem: string;
  mountPoint: string;
  usedGb: number;
  totalGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface ThermalSensorReading {
  id: string;
  name: string;
  label: string;
  celsius: number;
  source: 'thermal_zone' | 'hwmon' | 'estimated';
}

export interface TemperatureMetrics {
  cpuCelsius: number;
  maxCelsius: number;
  sensors: ThermalSensorReading[];
  sensorSource: 'sysfs' | 'estimated';
}

export interface HardwareHealthSample {
  timestamp: string;
  timeLabel: string;
  diskIo: DiskIoMetrics;
  inodes: InodeMetrics;
  diskSpace: DiskSpaceMetrics;
  temperature: TemperatureMetrics;
}

export interface HardwareHealthThresholds {
  diskIoWarnMbPerSec: number;
  diskIoCritMbPerSec: number;
  inodeWarnPercent: number;
  inodeCritPercent: number;
  tempWarnCelsius: number;
  tempCritCelsius: number;
  diskSpaceWarnPercent: number;
  diskSpaceCritPercent: number;
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
  cooldownSeconds: number;
}

export type HardwareMetricKey = 'disk_io' | 'inodes' | 'temperature' | 'disk_space';
export type HardwareSeverity = 'warning' | 'critical';

export interface HardwareAlertNotification {
  id: string;
  serverId: string;
  serverName: string;
  metric: HardwareMetricKey;
  severity: HardwareSeverity;
  title: string;
  message: string;
  currentValue: number;
  thresholdValue: number;
  unit: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface DiskStatsRawSnapshot {
  timestampMs: number;
  sectorsRead: number;
  sectorsWritten: number;
  readsCompleted: number;
  writesCompleted: number;
  ioTimeMs: number;
  deviceCount: number;
}

export interface HardwareHealthDeps {
  auth: Pick<AuthController, 'getSessionUser'> & Partial<Pick<AuthController, 'listUsers'>>;
  permissions?: PermissionsController | null;
  dataDir: string;
  managerStateDir: string;
  getServerRegistry: () => any[];
  canUserAccessServer: (user: StoredUserAccount | null, srv: any) => boolean;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string) => void;
  recordAuditLog?: (entry: any) => void;
  dispatchWebhookEvent?: (
    serverId: string,
    eventKey: 'onStart' | 'onStop' | 'onCrash' | 'onPlayerJoin' | 'onBackup',
    title: string,
    description: string,
    colorHex: number
  ) => Promise<void> | void;
}

export const DEFAULT_HARDWARE_THRESHOLDS: HardwareHealthThresholds = {
  diskIoWarnMbPerSec: 150,
  diskIoCritMbPerSec: 300,
  inodeWarnPercent: 80,
  inodeCritPercent: 92,
  tempWarnCelsius: 75,
  tempCritCelsius: 85,
  diskSpaceWarnPercent: 85,
  diskSpaceCritPercent: 95,
  notifyOnWarning: true,
  notifyOnCritical: true,
  cooldownSeconds: 300
};

function isPrimaryBlockDevice(name: string): boolean {
  // Match whole block devices (sda, vda, xvda, nvme0n1, mmcblk0) and avoid partitions / loop / ram / dm-
  if (/^(sd|vd|xvd|hd)[a-z]+$/.test(name)) return true;
  if (/^nvme\d+n\d+$/.test(name)) return true;
  if (/^mmcblk\d+$/.test(name)) return true;
  return false;
}

export function parseProcDiskstatsSnapshot(content: string, timestampMs: number = Date.now()): DiskStatsRawSnapshot {
  let sectorsRead = 0;
  let sectorsWritten = 0;
  let readsCompleted = 0;
  let writesCompleted = 0;
  let ioTimeMs = 0;
  let deviceCount = 0;

  const lines = String(content || '').split('\n');
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 14) continue;
    const devName = cols[2];
    if (!isPrimaryBlockDevice(devName)) continue;

    const rComp = Number(cols[3]) || 0;
    const rSect = Number(cols[5]) || 0;
    const wComp = Number(cols[7]) || 0;
    const wSect = Number(cols[9]) || 0;
    const ioMs = Number(cols[12]) || 0;

    readsCompleted += rComp;
    sectorsRead += rSect;
    writesCompleted += wComp;
    sectorsWritten += wSect;
    ioTimeMs += ioMs;
    deviceCount++;
  }

  return {
    timestampMs,
    sectorsRead,
    sectorsWritten,
    readsCompleted,
    writesCompleted,
    ioTimeMs,
    deviceCount
  };
}

export function computeDiskIoFromSnapshots(
  prev: DiskStatsRawSnapshot | null,
  curr: DiskStatsRawSnapshot
): DiskIoMetrics {
  if (!prev || curr.deviceCount === 0) {
    return {
      readMbPerSec: 0,
      writeMbPerSec: 0,
      totalMbPerSec: 0,
      readIops: 0,
      writeIops: 0,
      totalIops: 0,
      utilizationPercent: 0,
      deviceCount: curr.deviceCount,
      source: curr.deviceCount > 0 ? 'proc_diskstats' : 'estimated'
    };
  }

  const elapsedSec = Math.max((curr.timestampMs - prev.timestampMs) / 1000, 0.25);
  const dReadSectors = Math.max(0, curr.sectorsRead - prev.sectorsRead);
  const dWriteSectors = Math.max(0, curr.sectorsWritten - prev.sectorsWritten);
  const dReads = Math.max(0, curr.readsCompleted - prev.readsCompleted);
  const dWrites = Math.max(0, curr.writesCompleted - prev.writesCompleted);
  const dIoMs = Math.max(0, curr.ioTimeMs - prev.ioTimeMs);

  // Linux /proc/diskstats sectors are always 512 bytes
  const readMbPerSec = Number(((dReadSectors * 512) / (1024 * 1024) / elapsedSec).toFixed(2));
  const writeMbPerSec = Number(((dWriteSectors * 512) / (1024 * 1024) / elapsedSec).toFixed(2));
  const totalMbPerSec = Number((readMbPerSec + writeMbPerSec).toFixed(2));
  const readIops = Math.round(dReads / elapsedSec);
  const writeIops = Math.round(dWrites / elapsedSec);
  const totalIops = readIops + writeIops;
  const maxIoMs = elapsedSec * 1000 * Math.max(curr.deviceCount, 1);
  const utilizationPercent = Number(Math.min(100, (dIoMs / maxIoMs) * 100).toFixed(1));

  return {
    readMbPerSec,
    writeMbPerSec,
    totalMbPerSec,
    readIops,
    writeIops,
    totalIops,
    utilizationPercent,
    deviceCount: curr.deviceCount,
    source: 'proc_diskstats'
  };
}

export function parseDfInodesOutput(output: string, serverFileCount: number = 0): InodeMetrics | null {
  const lines = String(output || '')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length < 2) return null;

  // Handle wrapped lines (long device name on line 1, metrics on line 2)
  const dataLine = lines.slice(1).join(' ').trim();
  const cols = dataLine.split(/\s+/);
  if (cols.length < 6) return null;

  const filesystem = cols[0];
  const total = parseInt(cols[1], 10);
  const used = parseInt(cols[2], 10);
  const free = parseInt(cols[3], 10);
  const pctMatch = String(cols[4] || '').match(/(\d+(?:\.\d+)?)/);
  const mountPoint = cols.slice(5).join(' ');

  if (!Number.isFinite(total) || total <= 0) return null;
  const usedPercent = pctMatch
    ? Number(parseFloat(pctMatch[1]).toFixed(1))
    : Number(((used / total) * 100).toFixed(1));

  return {
    filesystem,
    mountPoint,
    used: Number.isFinite(used) ? used : 0,
    total,
    free: Number.isFinite(free) ? free : Math.max(0, total - (used || 0)),
    usedPercent,
    serverFileCount,
    source: 'df_inodes'
  };
}

export function parseDfSpaceOutput(output: string): DiskSpaceMetrics | null {
  const lines = String(output || '')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length < 2) return null;

  const dataLine = lines.slice(1).join(' ').trim();
  const cols = dataLine.split(/\s+/);
  if (cols.length < 6) return null;

  const filesystem = cols[0];
  const totalKb = parseInt(cols[1], 10);
  const usedKb = parseInt(cols[2], 10);
  const freeKb = parseInt(cols[3], 10);
  const pctMatch = String(cols[4] || '').match(/(\d+(?:\.\d+)?)/);
  const mountPoint = cols.slice(5).join(' ');

  if (!Number.isFinite(totalKb) || totalKb <= 0) return null;
  const usedPercent = pctMatch
    ? Number(parseFloat(pctMatch[1]).toFixed(1))
    : Number(((usedKb / totalKb) * 100).toFixed(1));

  return {
    filesystem,
    mountPoint,
    totalGb: Number((totalKb / (1024 * 1024)).toFixed(2)),
    usedGb: Number((usedKb / (1024 * 1024)).toFixed(2)),
    freeGb: Number((freeKb / (1024 * 1024)).toFixed(2)),
    usedPercent
  };
}

export function readLinuxThermalSensors(
  thermalRoot: string = '/sys/class/thermal',
  hwmonRoot: string = '/sys/class/hwmon'
): TemperatureMetrics {
  const sensors: ThermalSensorReading[] = [];

  // 1. Read /sys/class/thermal/thermal_zone*
  try {
    if (fs.existsSync(thermalRoot)) {
      const entries = fs.readdirSync(thermalRoot).filter(e => e.startsWith('thermal_zone'));
      for (const entry of entries) {
        const tempFile = path.join(thermalRoot, entry, 'temp');
        const typeFile = path.join(thermalRoot, entry, 'type');
        if (!fs.existsSync(tempFile)) continue;
        const raw = parseInt(fs.readFileSync(tempFile, 'utf8').trim(), 10);
        if (!Number.isFinite(raw) || raw <= 0) continue;
        const celsius = Number((raw > 1000 ? raw / 1000 : raw).toFixed(1));
        if (celsius < 5 || celsius > 140) continue;
        const typeName = fs.existsSync(typeFile)
          ? fs.readFileSync(typeFile, 'utf8').trim()
          : entry;
        sensors.push({
          id: entry,
          name: typeName || entry,
          label: typeName ? `${typeName} (${entry})` : entry,
          celsius,
          source: 'thermal_zone'
        });
      }
    }
  } catch {
    // Ignore permission errors in restricted containers
  }

  // 2. Read /sys/class/hwmon/hwmon*/temp*_input
  try {
    if (fs.existsSync(hwmonRoot)) {
      const dirs = fs.readdirSync(hwmonRoot).filter(e => e.startsWith('hwmon'));
      for (const dir of dirs) {
        const fullDir = path.join(hwmonRoot, dir);
        const chipNameFile = path.join(fullDir, 'name');
        const chipName = fs.existsSync(chipNameFile)
          ? fs.readFileSync(chipNameFile, 'utf8').trim()
          : dir;
        const files = fs.readdirSync(fullDir).filter(f => /^temp\d+_input$/.test(f));
        for (const f of files) {
          const idx = f.replace('temp', '').replace('_input', '');
          const raw = parseInt(fs.readFileSync(path.join(fullDir, f), 'utf8').trim(), 10);
          if (!Number.isFinite(raw) || raw <= 0) continue;
          const celsius = Number((raw > 1000 ? raw / 1000 : raw).toFixed(1));
          if (celsius < 5 || celsius > 140) continue;
          const labelFile = path.join(fullDir, `temp${idx}_label`);
          const labelText = fs.existsSync(labelFile)
            ? fs.readFileSync(labelFile, 'utf8').trim()
            : `Sensor ${idx}`;
          sensors.push({
            id: `${dir}_temp${idx}`,
            name: chipName,
            label: `${chipName}: ${labelText}`,
            celsius,
            source: 'hwmon'
          });
        }
      }
    }
  } catch {
    // Ignore restricted hwmon paths
  }

  if (sensors.length > 0) {
    const cpuSensor =
      sensors.find(s => /x86_pkg_temp|k10temp|coretemp|cpu|package/i.test(`${s.name} ${s.label}`)) ||
      sensors[0];
    const maxCelsius = Math.max(...sensors.map(s => s.celsius));
    return {
      cpuCelsius: cpuSensor.celsius,
      maxCelsius,
      sensors: sensors.slice(0, 8),
      sensorSource: 'sysfs'
    };
  }

  // Graceful fallback for virtualized containers without exposed hardware thermal sensors
  const loadAvg = os.loadavg()[0] || 0;
  const cpuCount = Math.max(os.cpus().length, 1);
  const loadRatio = Math.min(1, loadAvg / cpuCount);
  const estimatedCpu = Number((38 + loadRatio * 24).toFixed(1));
  const estimatedNvme = Number((34 + loadRatio * 14).toFixed(1));

  return {
    cpuCelsius: estimatedCpu,
    maxCelsius: Math.max(estimatedCpu, estimatedNvme),
    sensors: [
      {
        id: 'est_cpu',
        name: 'CPU Package (Virtuelle Schätzung)',
        label: 'CPU Package (Container-Fallback)',
        celsius: estimatedCpu,
        source: 'estimated'
      },
      {
        id: 'est_nvme',
        name: 'NVMe Storage (Virtuelle Schätzung)',
        label: 'NVMe / Disk (Container-Fallback)',
        celsius: estimatedNvme,
        source: 'estimated'
      }
    ],
    sensorSource: 'estimated'
  };
}

export function evaluateHardwareThresholds(
  sample: HardwareHealthSample,
  thresholds: HardwareHealthThresholds,
  serverId: string,
  serverName: string
): Omit<HardwareAlertNotification, 'id' | 'createdAt' | 'acknowledged'>[] {
  const triggered: Omit<HardwareAlertNotification, 'id' | 'createdAt' | 'acknowledged'>[] = [];

  const checkMetric = (
    metric: HardwareMetricKey,
    value: number,
    warn: number,
    crit: number,
    unit: string,
    label: string,
    hint: string
  ) => {
    if (crit > 0 && value >= crit && thresholds.notifyOnCritical) {
      triggered.push({
        serverId,
        serverName,
        metric,
        severity: 'critical',
        title: `Kritischer Hardware-Schwellenwert: ${label}`,
        message: `${label} auf "${serverName}" liegt bei ${value} ${unit} (Kritisch >= ${crit} ${unit}). ${hint}`,
        currentValue: value,
        thresholdValue: crit,
        unit
      });
    } else if (warn > 0 && value >= warn && thresholds.notifyOnWarning) {
      triggered.push({
        serverId,
        serverName,
        metric,
        severity: 'warning',
        title: `Hardware-Warnung: ${label}`,
        message: `${label} auf "${serverName}" liegt bei ${value} ${unit} (Warnung >= ${warn} ${unit}). ${hint}`,
        currentValue: value,
        thresholdValue: warn,
        unit
      });
    }
  };

  checkMetric(
    'disk_io',
    sample.diskIo.totalMbPerSec,
    thresholds.diskIoWarnMbPerSec,
    thresholds.diskIoCritMbPerSec,
    'MB/s',
    'Disk-IO Durchsatz',
    'Hohe Festplattenlast erkannt – Backups, Chunk-Generierung oder Welt-Speicherung prüfen.'
  );

  checkMetric(
    'inodes',
    sample.inodes.usedPercent,
    thresholds.inodeWarnPercent,
    thresholds.inodeCritPercent,
    '%',
    'Inode-Auslastung',
    'Dateisystem nähert sich dem Inode-Limit – alte Logs, Temp-Dateien oder kleine Cache-Dateien bereinigen.'
  );

  checkMetric(
    'temperature',
    sample.temperature.maxCelsius,
    thresholds.tempWarnCelsius,
    thresholds.tempCritCelsius,
    '°C',
    'Hardware-Temperatur',
    'Erhöhte Host-Temperatur erkannt – Kühlung, Lüfterkurve oder CPU-Last überprüfen.'
  );

  checkMetric(
    'disk_space',
    sample.diskSpace.usedPercent,
    thresholds.diskSpaceWarnPercent,
    thresholds.diskSpaceCritPercent,
    '%',
    'Speicherplatz-Auslastung',
    'Festplattenspeicher wird knapp – alte Backups oder ungenutzte Welten archivieren.'
  );

  return triggered;
}

function countDirectoryFilesBounded(dirPath: string, maxCount: number = 25000): number {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const stack: string[] = [dirPath];
  while (stack.length > 0 && count < maxCount) {
    const current = stack.pop()!;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        count++;
        if (count >= maxCount) break;
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          stack.push(path.join(current, entry.name));
        }
      }
    } catch {
      // ignore unreadable subdirectories
    }
  }
  return count;
}

function sanitizeThresholds(input: Partial<HardwareHealthThresholds>, current: HardwareHealthThresholds): HardwareHealthThresholds {
  const clamp = (val: any, fallback: number, min: number, max: number) => {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Number(num.toFixed(1))));
  };

  const diskIoWarnMbPerSec = clamp(input.diskIoWarnMbPerSec, current.diskIoWarnMbPerSec, 1, 10000);
  const diskIoCritMbPerSec = Math.max(diskIoWarnMbPerSec, clamp(input.diskIoCritMbPerSec, current.diskIoCritMbPerSec, 1, 20000));
  const inodeWarnPercent = clamp(input.inodeWarnPercent, current.inodeWarnPercent, 1, 99);
  const inodeCritPercent = Math.max(inodeWarnPercent, clamp(input.inodeCritPercent, current.inodeCritPercent, 1, 100));
  const tempWarnCelsius = clamp(input.tempWarnCelsius, current.tempWarnCelsius, 20, 115);
  const tempCritCelsius = Math.max(tempWarnCelsius, clamp(input.tempCritCelsius, current.tempCritCelsius, 20, 125));
  const diskSpaceWarnPercent = clamp(input.diskSpaceWarnPercent, current.diskSpaceWarnPercent, 1, 99);
  const diskSpaceCritPercent = Math.max(diskSpaceWarnPercent, clamp(input.diskSpaceCritPercent, current.diskSpaceCritPercent, 1, 100));
  const cooldownSeconds = clamp(input.cooldownSeconds, current.cooldownSeconds, 10, 86400);

  return {
    diskIoWarnMbPerSec,
    diskIoCritMbPerSec,
    inodeWarnPercent,
    inodeCritPercent,
    tempWarnCelsius,
    tempCritCelsius,
    diskSpaceWarnPercent,
    diskSpaceCritPercent,
    notifyOnWarning: typeof input.notifyOnWarning === 'boolean' ? input.notifyOnWarning : current.notifyOnWarning,
    notifyOnCritical: typeof input.notifyOnCritical === 'boolean' ? input.notifyOnCritical : current.notifyOnCritical,
    cooldownSeconds
  };
}

export function configureHardwareHealth(app: Express, deps: HardwareHealthDeps) {
  const configFilePath = path.join(deps.managerStateDir, 'hardware-health-config.json');
  const alertsFilePath = path.join(deps.managerStateDir, 'hardware-health-alerts.json');

  let thresholdsByServer: Record<string, HardwareHealthThresholds> = {};
  let alertsStore: HardwareAlertNotification[] = [];
  const historyByServer = new Map<string, HardwareHealthSample[]>();
  const lastAlertSentMap = new Map<string, number>();
  let lastDiskStatsSnapshot: DiskStatsRawSnapshot | null = null;

  // Load persisted config & alerts
  try {
    if (fs.existsSync(configFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      if (parsed && typeof parsed === 'object') thresholdsByServer = parsed;
    }
  } catch {}

  try {
    if (fs.existsSync(alertsFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(alertsFilePath, 'utf8'));
      if (Array.isArray(parsed)) alertsStore = parsed.slice(-200);
    }
  } catch {}

  const saveThresholds = () => {
    try {
      if (!fs.existsSync(deps.managerStateDir)) fs.mkdirSync(deps.managerStateDir, { recursive: true });
      fs.writeFileSync(configFilePath, JSON.stringify(thresholdsByServer, null, 2), 'utf8');
    } catch {}
  };

  const saveAlerts = () => {
    try {
      if (!fs.existsSync(deps.managerStateDir)) fs.mkdirSync(deps.managerStateDir, { recursive: true });
      fs.writeFileSync(alertsFilePath, JSON.stringify(alertsStore.slice(-200), null, 2), 'utf8');
    } catch {}
  };

  const getThresholds = (serverId: string): HardwareHealthThresholds => {
    return {
      ...DEFAULT_HARDWARE_THRESHOLDS,
      ...(thresholdsByServer[serverId] || {})
    };
  };

  const collectHardwareSample = (serverId: string): HardwareHealthSample => {
    const now = new Date();
    const srvDir = path.join(deps.dataDir, serverId);
    const targetPath = fs.existsSync(srvDir) ? srvDir : deps.dataDir;

    // 1. Disk I/O from /proc/diskstats
    let diskIo: DiskIoMetrics = {
      readMbPerSec: 0,
      writeMbPerSec: 0,
      totalMbPerSec: 0,
      readIops: 0,
      writeIops: 0,
      totalIops: 0,
      utilizationPercent: 0,
      deviceCount: 0,
      source: 'estimated'
    };
    try {
      if (fs.existsSync('/proc/diskstats')) {
        const content = fs.readFileSync('/proc/diskstats', 'utf8');
        const currSnap = parseProcDiskstatsSnapshot(content, now.getTime());
        diskIo = computeDiskIoFromSnapshots(lastDiskStatsSnapshot, currSnap);
        lastDiskStatsSnapshot = currSnap;
      }
    } catch {}

    // 2. Inodes from df -Pi
    const serverFileCount = countDirectoryFilesBounded(srvDir, 25000);
    let inodes: InodeMetrics = {
      filesystem: 'local',
      mountPoint: '/',
      used: serverFileCount,
      total: 1_000_000,
      free: Math.max(0, 1_000_000 - serverFileCount),
      usedPercent: Number(((serverFileCount / 1_000_000) * 100).toFixed(2)),
      serverFileCount,
      source: 'estimated'
    };
    try {
      const dfInodeOut = execSync(`df -Pi "${targetPath.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const parsed = parseDfInodesOutput(dfInodeOut, serverFileCount);
      if (parsed) inodes = parsed;
    } catch {}

    // 3. Disk Space from df -Pk
    let diskSpace: DiskSpaceMetrics = {
      filesystem: inodes.filesystem,
      mountPoint: inodes.mountPoint,
      usedGb: 0,
      totalGb: 100,
      freeGb: 100,
      usedPercent: 0
    };
    try {
      const dfSpaceOut = execSync(`df -Pk "${targetPath.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const parsedSpace = parseDfSpaceOutput(dfSpaceOut);
      if (parsedSpace) diskSpace = parsedSpace;
    } catch {}

    // 4. Temperature from Linux sysfs thermal_zone / hwmon
    const temperature = readLinuxThermalSensors();

    const sample: HardwareHealthSample = {
      timestamp: now.toISOString(),
      timeLabel: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      diskIo,
      inodes,
      diskSpace,
      temperature
    };

    const history = historyByServer.get(serverId) || [];
    history.push(sample);
    if (history.length > 30) history.shift();
    historyByServer.set(serverId, history);

    return sample;
  };

  const evaluateAndDispatchAlerts = (
    serverId: string,
    serverName: string,
    sample: HardwareHealthSample,
    ignoreCooldown: boolean = false
  ): HardwareAlertNotification[] => {
    const thresholds = getThresholds(serverId);
    const candidates = evaluateHardwareThresholds(sample, thresholds, serverId, serverName);
    const nowMs = Date.now();
    const createdAlerts: HardwareAlertNotification[] = [];

    for (const c of candidates) {
      const dedupKey = `${serverId}:${c.metric}:${c.severity}`;
      const lastSent = lastAlertSentMap.get(dedupKey) || 0;
      const cooldownMs = Math.max(10, thresholds.cooldownSeconds) * 1000;

      // Also avoid creating duplicate unacknowledged alerts for the exact same metric + severity
      const existingUnack = alertsStore.find(
        a => a.serverId === serverId && a.metric === c.metric && a.severity === c.severity && !a.acknowledged
      );

      if (!ignoreCooldown && (existingUnack || nowMs - lastSent < cooldownMs)) {
        continue;
      }
      if (existingUnack) {
        // Update live currentValue on existing unacknowledged alert instead of spamming
        existingUnack.currentValue = c.currentValue;
        existingUnack.thresholdValue = c.thresholdValue;
        existingUnack.message = c.message;
        saveAlerts();
        continue;
      }

      const alert: HardwareAlertNotification = {
        ...c,
        id: `hw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        acknowledged: false
      };

      alertsStore.unshift(alert);
      if (alertsStore.length > 200) alertsStore = alertsStore.slice(0, 200);
      lastAlertSentMap.set(dedupKey, nowMs);
      createdAlerts.push(alert);

      deps.appendLog?.(
        serverId,
        alert.severity === 'critical' ? 'ERROR' : 'WARN',
        `[Hardware-Health] ${alert.title}: ${alert.message}`
      );

      if (alert.severity === 'critical') {
        deps.recordAuditLog?.({
          serverId,
          action: 'HARDWARE_THRESHOLD_CRITICAL',
          details: alert.message
        });
        try {
          deps.dispatchWebhookEvent?.(
            serverId,
            'onCrash',
            alert.title,
            alert.message,
            0xef4444
          );
        } catch {}
      }
    }

    if (createdAlerts.length > 0) saveAlerts();
    return createdAlerts;
  };

  const computeOverallStatus = (
    sample: HardwareHealthSample,
    thresholds: HardwareHealthThresholds,
    serverAlerts: HardwareAlertNotification[]
  ): 'healthy' | 'warning' | 'critical' => {
    const active = serverAlerts.filter(a => !a.acknowledged);
    if (
      active.some(a => a.severity === 'critical') ||
      sample.diskIo.totalMbPerSec >= thresholds.diskIoCritMbPerSec ||
      sample.inodes.usedPercent >= thresholds.inodeCritPercent ||
      sample.temperature.maxCelsius >= thresholds.tempCritCelsius ||
      sample.diskSpace.usedPercent >= thresholds.diskSpaceCritPercent
    ) {
      return 'critical';
    }
    if (
      active.some(a => a.severity === 'warning') ||
      sample.diskIo.totalMbPerSec >= thresholds.diskIoWarnMbPerSec ||
      sample.inodes.usedPercent >= thresholds.inodeWarnPercent ||
      sample.temperature.maxCelsius >= thresholds.tempWarnCelsius ||
      sample.diskSpace.usedPercent >= thresholds.diskSpaceWarnPercent
    ) {
      return 'warning';
    }
    return 'healthy';
  };

  const resolveServerAccess = (req: Request, res: Response) => {
    const serverId = String(req.params.id || '').trim();
    const srv = deps.getServerRegistry().find((s: any) => s.id === serverId);
    if (!srv) {
      res.status(404).json({ success: false, error: 'Server nicht gefunden.' });
      return null;
    }
    const user = deps.auth.getSessionUser(req);
    if (user && !deps.canUserAccessServer(user, srv)) {
      res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Server.' });
      return null;
    }
    return { serverId, srv, user };
  };

  // GET /api/servers/:id/hardware-health
  app.get('/api/servers/:id/hardware-health', (req: Request, res: Response) => {
    const ctx = resolveServerAccess(req, res);
    if (!ctx) return;

    const current = collectHardwareSample(ctx.serverId);
    const newlyTriggered = evaluateAndDispatchAlerts(ctx.serverId, ctx.srv.name || ctx.serverId, current, false);
    const thresholds = getThresholds(ctx.serverId);
    const serverAlerts = alertsStore.filter(a => a.serverId === ctx.serverId).slice(0, 50);
    const unacknowledgedCount = serverAlerts.filter(a => !a.acknowledged).length;
    const status = computeOverallStatus(current, thresholds, serverAlerts);

    return res.json({
      success: true,
      serverId: ctx.serverId,
      status,
      current,
      history: historyByServer.get(ctx.serverId) || [current],
      thresholds,
      notifications: serverAlerts,
      newlyTriggered,
      unacknowledgedCount
    });
  });

  // PUT /api/servers/:id/hardware-health/thresholds
  app.put('/api/servers/:id/hardware-health/thresholds', (req: Request, res: Response) => {
    const ctx = resolveServerAccess(req, res);
    if (!ctx) return;

    const currentThresholds = getThresholds(ctx.serverId);
    const updated = sanitizeThresholds(req.body || {}, currentThresholds);
    thresholdsByServer[ctx.serverId] = updated;
    saveThresholds();

    const history = historyByServer.get(ctx.serverId);
    const latestSample = history && history.length > 0 ? history[history.length - 1] : collectHardwareSample(ctx.serverId);
    const newlyTriggered = evaluateAndDispatchAlerts(ctx.serverId, ctx.srv.name || ctx.serverId, latestSample, true);
    const serverAlerts = alertsStore.filter(a => a.serverId === ctx.serverId).slice(0, 50);
    const status = computeOverallStatus(latestSample, updated, serverAlerts);

    deps.recordAuditLog?.({
      serverId: ctx.serverId,
      username: ctx.user?.username || 'system',
      action: 'HARDWARE_THRESHOLDS_UPDATED',
      details: `Hardware-Schwellenwerte aktualisiert (Disk-IO: ${updated.diskIoWarnMbPerSec}/${updated.diskIoCritMbPerSec} MB/s, Inodes: ${updated.inodeWarnPercent}/${updated.inodeCritPercent}%, Temp: ${updated.tempWarnCelsius}/${updated.tempCritCelsius}°C).`
    });

    return res.json({
      success: true,
      status,
      thresholds: updated,
      notifications: serverAlerts,
      newlyTriggered,
      unacknowledgedCount: serverAlerts.filter(a => !a.acknowledged).length
    });
  });

  // POST /api/servers/:id/hardware-health/notifications/:alertId/ack
  app.post('/api/servers/:id/hardware-health/notifications/:alertId/ack', (req: Request, res: Response) => {
    const ctx = resolveServerAccess(req, res);
    if (!ctx) return;

    const alertId = String(req.params.alertId || '').trim();
    const alert = alertsStore.find(a => a.id === alertId && a.serverId === ctx.serverId);
    if (!alert) {
      return res.status(404).json({ success: false, error: 'Benachrichtigung nicht gefunden.' });
    }
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = ctx.user?.username || 'user';
    saveAlerts();

    const serverAlerts = alertsStore.filter(a => a.serverId === ctx.serverId).slice(0, 50);
    return res.json({
      success: true,
      alert,
      notifications: serverAlerts,
      unacknowledgedCount: serverAlerts.filter(a => !a.acknowledged).length
    });
  });

  // POST /api/servers/:id/hardware-health/notifications/ack-all
  app.post('/api/servers/:id/hardware-health/notifications/ack-all', (req: Request, res: Response) => {
    const ctx = resolveServerAccess(req, res);
    if (!ctx) return;

    const nowIso = new Date().toISOString();
    const actor = ctx.user?.username || 'user';
    let count = 0;
    for (const a of alertsStore) {
      if (a.serverId === ctx.serverId && !a.acknowledged) {
        a.acknowledged = true;
        a.acknowledgedAt = nowIso;
        a.acknowledgedBy = actor;
        count++;
      }
    }
    if (count > 0) saveAlerts();

    const serverAlerts = alertsStore.filter(a => a.serverId === ctx.serverId).slice(0, 50);
    return res.json({
      success: true,
      acknowledgedCount: count,
      notifications: serverAlerts,
      unacknowledgedCount: 0
    });
  });

  // Background Hardware Health Monitor (every 30s) so threshold breaches notify even when tab is closed
  const monitorInterval = setInterval(() => {
    try {
      const servers = deps.getServerRegistry();
      if (!Array.isArray(servers) || servers.length === 0) return;
      for (const srv of servers.slice(0, 25)) {
        if (!srv?.id) continue;
        const sample = collectHardwareSample(srv.id);
        evaluateAndDispatchAlerts(srv.id, srv.name || srv.id, sample, false);
      }
    } catch {}
  }, 30_000);
  if (typeof (monitorInterval as any).unref === 'function') {
    (monitorInterval as any).unref();
  }

  return {
    collectHardwareSample,
    getThresholds,
    getNotifications: (serverId?: string) =>
      serverId ? alertsStore.filter(a => a.serverId === serverId) : alertsStore,
    stopMonitor: () => clearInterval(monitorInterval)
  };
}
