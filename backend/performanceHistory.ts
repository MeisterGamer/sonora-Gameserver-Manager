import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { AuthController } from './auth.ts';

export interface PerformanceHistorySample {
  timestamp: number;
  isoTime: string;
  label: string;
  cpuPercent: number;
  ramUsedMb: number;
  ramAllocatedMb: number;
  ramPercent: number;
  networkInKb: number;
  networkOutKb: number;
  tps: number;
  players: number;
  running: boolean;
}

export interface PerformanceHistorySummary {
  avgCpu: number;
  peakCpu: number;
  currentCpu: number;
  avgRamMb: number;
  peakRamMb: number;
  currentRamMb: number;
  avgRamPercent: number;
  peakRamPercent: number;
  currentRamPercent: number;
  allocatedRamMb: number;
  avgNetInKb: number;
  peakNetInKb: number;
  currentNetInKb: number;
  avgNetOutKb: number;
  peakNetOutKb: number;
  currentNetOutKb: number;
  uptimeRatioPercent: number;
}

export interface PerformanceHistoryDeps {
  auth?: AuthController;
  managerStateDir: string;
  getServerRegistry: () => any[];
  activeProcesses: Map<string, any>;
  getLiveServerStats: (serverId: string, port?: number) => Promise<{
    cpuUsagePercent: number;
    ramUsageMb: number;
    currentPlayers: number;
    maxPlayers: number;
    tps: number;
    uptimeSeconds: number;
    networkInKb?: number;
    networkOutKb?: number;
  }>;
  canUserAccessServer?: (user: any, server: any) => boolean;
  sampleIntervalMs?: number;
}

export interface PerformanceHistoryController {
  recordSampleForServer: (serverId: string, force?: boolean) => Promise<PerformanceHistorySample | null>;
  recordRawSample: (serverId: string, sample: PerformanceHistorySample) => void;
  getHistory: (serverId: string, range?: string) => PerformanceHistorySample[];
  cleanupServerHistory: (serverId: string) => void;
  stopCollector: () => void;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_STORED_SAMPLES = 720; // Up to 24h at 2-min or mixed live/5-min granularity
const MIN_RECORD_GAP_MS = 10_000;

interface NetDevCounters {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
}

function readHostNetDevCounters(): NetDevCounters | null {
  try {
    if (!fs.existsSync('/proc/net/dev')) return null;
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = raw.split('\n').slice(2);
    let rxBytes = 0;
    let txBytes = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes(':')) continue;
      const [ifacePart, statsPart] = trimmed.split(':');
      const iface = ifacePart.trim();
      if (iface === 'lo') continue;
      const fields = statsPart.trim().split(/\s+/);
      if (fields.length >= 9) {
        rxBytes += Number(fields[0]) || 0;
        txBytes += Number(fields[8]) || 0;
      }
    }
    return { rxBytes, txBytes, timestamp: Date.now() };
  } catch {
    return null;
  }
}

function sanitizeServerId(serverId: string): string {
  return String(serverId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formatTimeLabel(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function round1(val: number): number {
  return Math.round((Number.isFinite(val) ? val : 0) * 10) / 10;
}

function parseRangeMs(range?: string): { rangeKey: '1h' | '6h' | '12h' | '24h'; durationMs: number } {
  switch (String(range || '24h').toLowerCase()) {
    case '1h':
      return { rangeKey: '1h', durationMs: 1 * HOUR_MS };
    case '6h':
      return { rangeKey: '6h', durationMs: 6 * HOUR_MS };
    case '12h':
      return { rangeKey: '12h', durationMs: 12 * HOUR_MS };
    default:
      return { rangeKey: '24h', durationMs: 24 * HOUR_MS };
  }
}

export function computeHistorySummary(
  samples: PerformanceHistorySample[],
  allocatedRamMb: number
): PerformanceHistorySummary {
  if (!samples.length) {
    return {
      avgCpu: 0,
      peakCpu: 0,
      currentCpu: 0,
      avgRamMb: 0,
      peakRamMb: 0,
      currentRamMb: 0,
      avgRamPercent: 0,
      peakRamPercent: 0,
      currentRamPercent: 0,
      allocatedRamMb,
      avgNetInKb: 0,
      peakNetInKb: 0,
      currentNetInKb: 0,
      avgNetOutKb: 0,
      peakNetOutKb: 0,
      currentNetOutKb: 0,
      uptimeRatioPercent: 0
    };
  }

  let sumCpu = 0;
  let peakCpu = 0;
  let sumRamMb = 0;
  let peakRamMb = 0;
  let sumRamPct = 0;
  let peakRamPct = 0;
  let sumNetIn = 0;
  let peakNetIn = 0;
  let sumNetOut = 0;
  let peakNetOut = 0;
  let runningCount = 0;

  for (const s of samples) {
    sumCpu += s.cpuPercent;
    if (s.cpuPercent > peakCpu) peakCpu = s.cpuPercent;
    sumRamMb += s.ramUsedMb;
    if (s.ramUsedMb > peakRamMb) peakRamMb = s.ramUsedMb;
    sumRamPct += s.ramPercent;
    if (s.ramPercent > peakRamPct) peakRamPct = s.ramPercent;
    sumNetIn += s.networkInKb;
    if (s.networkInKb > peakNetIn) peakNetIn = s.networkInKb;
    sumNetOut += s.networkOutKb;
    if (s.networkOutKb > peakNetOut) peakNetOut = s.networkOutKb;
    if (s.running) runningCount += 1;
  }

  const count = samples.length;
  const latest = samples[count - 1];

  return {
    avgCpu: round1(sumCpu / count),
    peakCpu: round1(peakCpu),
    currentCpu: round1(latest.cpuPercent),
    avgRamMb: Math.round(sumRamMb / count),
    peakRamMb: Math.round(peakRamMb),
    currentRamMb: Math.round(latest.ramUsedMb),
    avgRamPercent: round1(sumRamPct / count),
    peakRamPercent: round1(peakRamPct),
    currentRamPercent: round1(latest.ramPercent),
    allocatedRamMb: latest.ramAllocatedMb || allocatedRamMb,
    avgNetInKb: round1(sumNetIn / count),
    peakNetInKb: round1(peakNetIn),
    currentNetInKb: round1(latest.networkInKb),
    avgNetOutKb: round1(sumNetOut / count),
    peakNetOutKb: round1(peakNetOut),
    currentNetOutKb: round1(latest.networkOutKb),
    uptimeRatioPercent: round1((runningCount / count) * 100)
  };
}

export function configurePerformanceHistory(
  app: Express,
  deps: PerformanceHistoryDeps
): PerformanceHistoryController {
  const historyDir = path.join(deps.managerStateDir, 'metrics-history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const cache = new Map<string, PerformanceHistorySample[]>();
  const lastRecordedAt = new Map<string, number>();
  let lastNetCounters: NetDevCounters | null = readHostNetDevCounters();
  let lastMeasuredNetInKb = 0;
  let lastMeasuredNetOutKb = 0;

  const getHistoryFile = (serverId: string) =>
    path.join(historyDir, `${sanitizeServerId(serverId)}.json`);

  const pruneSamples = (samples: PerformanceHistorySample[], now = Date.now()): PerformanceHistorySample[] => {
    const cutoff = now - DAY_MS;
    const within24h = samples
      .filter(s => s && typeof s.timestamp === 'number' && s.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (within24h.length <= MAX_STORED_SAMPLES) {
      return within24h;
    }

    // Keep most recent 180 samples untouched and downsample older segment evenly
    const recentKeep = 180;
    const older = within24h.slice(0, within24h.length - recentKeep);
    const recent = within24h.slice(within24h.length - recentKeep);
    const targetOlder = MAX_STORED_SAMPLES - recentKeep;
    const step = older.length / targetOlder;
    const compacted: PerformanceHistorySample[] = [];
    for (let i = 0; i < targetOlder; i++) {
      const idx = Math.min(older.length - 1, Math.floor(i * step));
      compacted.push(older[idx]);
    }
    return [...compacted, ...recent];
  };

  const loadSamples = (serverId: string): PerformanceHistorySample[] => {
    const cached = cache.get(serverId);
    if (cached) {
      const pruned = pruneSamples(cached);
      cache.set(serverId, pruned);
      return pruned;
    }
    const file = getHistoryFile(serverId);
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(parsed)) {
          const pruned = pruneSamples(parsed);
          cache.set(serverId, pruned);
          return pruned;
        }
      }
    } catch {
      // Ignore corrupt history file and start clean
    }
    const empty: PerformanceHistorySample[] = [];
    cache.set(serverId, empty);
    return empty;
  };

  const saveSamples = (serverId: string, samples: PerformanceHistorySample[]) => {
    const pruned = pruneSamples(samples);
    cache.set(serverId, pruned);
    try {
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      const file = getHistoryFile(serverId);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(pruned), 'utf8');
      fs.renameSync(tmp, file);
    } catch {
      // Non-fatal persistence error
    }
  };

  const sampleHostNetworkRates = (): { inKb: number; outKb: number } => {
    const current = readHostNetDevCounters();
    if (!current) {
      return { inKb: lastMeasuredNetInKb, outKb: lastMeasuredNetOutKb };
    }
    if (lastNetCounters) {
      const elapsedSec = (current.timestamp - lastNetCounters.timestamp) / 1000;
      if (elapsedSec >= 0.5) {
        const rxDelta = Math.max(0, current.rxBytes - lastNetCounters.rxBytes);
        const txDelta = Math.max(0, current.txBytes - lastNetCounters.txBytes);
        lastMeasuredNetInKb = round1(rxDelta / 1024 / elapsedSec);
        lastMeasuredNetOutKb = round1(txDelta / 1024 / elapsedSec);
        lastNetCounters = current;
      }
    } else {
      lastNetCounters = current;
    }
    return { inKb: lastMeasuredNetInKb, outKb: lastMeasuredNetOutKb };
  };

  const recordRawSample = (serverId: string, sample: PerformanceHistorySample) => {
    const existing = loadSamples(serverId);
    existing.push(sample);
    lastRecordedAt.set(serverId, sample.timestamp);
    saveSamples(serverId, existing);
  };

  const recordSampleForServer = async (
    serverId: string,
    force = false
  ): Promise<PerformanceHistorySample | null> => {
    const now = Date.now();
    const lastTs = lastRecordedAt.get(serverId) || 0;
    if (!force && now - lastTs < MIN_RECORD_GAP_MS) {
      const existing = loadSamples(serverId);
      return existing.length ? existing[existing.length - 1] : null;
    }

    const servers = deps.getServerRegistry();
    const srv = servers.find(s => s.id === serverId);
    const proc = deps.activeProcesses.get(serverId);
    const isRunning = !!proc;
    const allocatedRamMb = Math.max(512, Math.round((Number(srv?.allocatedRamGb) || 4) * 1024));

    const stats = await deps.getLiveServerStats(serverId, proc?.port || srv?.port);
    const hostNet = sampleHostNetworkRates();
    const runningCount = Math.max(1, deps.activeProcesses.size);

    const networkInKb = isRunning
      ? round1(
          typeof stats.networkInKb === 'number' && stats.networkInKb > 0
            ? stats.networkInKb
            : hostNet.inKb / runningCount
        )
      : 0;
    const networkOutKb = isRunning
      ? round1(
          typeof stats.networkOutKb === 'number' && stats.networkOutKb > 0
            ? stats.networkOutKb
            : hostNet.outKb / runningCount
        )
      : 0;

    const cpuPercent = isRunning ? round1(Math.max(0, Math.min(100, Number(stats.cpuUsagePercent) || 0))) : 0;
    const ramUsedMb = isRunning ? Math.max(0, Math.round(Number(stats.ramUsageMb) || 0)) : 0;
    const ramPercent = round1(Math.max(0, Math.min(100, (ramUsedMb / allocatedRamMb) * 100)));

    const sample: PerformanceHistorySample = {
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      label: formatTimeLabel(now),
      cpuPercent,
      ramUsedMb,
      ramAllocatedMb: allocatedRamMb,
      ramPercent,
      networkInKb,
      networkOutKb,
      tps: isRunning ? round1(Number(stats.tps) || 0) : 0,
      players: isRunning ? Math.max(0, Math.round(Number(stats.currentPlayers) || 0)) : 0,
      running: isRunning
    };

    recordRawSample(serverId, sample);
    return sample;
  };

  const getHistory = (serverId: string, range = '24h'): PerformanceHistorySample[] => {
    const { durationMs } = parseRangeMs(range);
    const cutoff = Date.now() - durationMs;
    return loadSamples(serverId).filter(s => s.timestamp >= cutoff);
  };

  const cleanupServerHistory = (serverId: string) => {
    cache.delete(serverId);
    lastRecordedAt.delete(serverId);
    try {
      const file = getHistoryFile(serverId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // Ignore cleanup errors
    }
  };

  const checkAccess = (req: Request, res: Response, serverId: string): any | null => {
    const servers = deps.getServerRegistry();
    const srv = servers.find(s => s.id === serverId);
    if (deps.auth && deps.canUserAccessServer) {
      const reqUser = deps.auth.getSessionUser(req);
      if (reqUser && reqUser.role !== 'admin' && srv && !deps.canUserAccessServer(reqUser, srv)) {
        res.status(403).json({ success: false, error: 'Kein Zugriff auf die Telemetrie dieses Servers.' });
        return null;
      }
    }
    return srv || { id: serverId, allocatedRamGb: 4 };
  };

  // --- GET 24H (OR FILTERED) HISTORICAL PERFORMANCE METRICS ---
  app.get('/api/servers/:id/metrics/history', async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const srv = checkAccess(req, res, serverId);
      if (!srv) return;

      const { rangeKey } = parseRangeMs(String(req.query.range || '24h'));

      // Capture a fresh live point if stale (>10s) so the chart always includes current telemetry
      await recordSampleForServer(serverId, false);

      const all24h = loadSamples(serverId);
      const filtered = getHistory(serverId, rangeKey);
      const allocatedRamMb = Math.max(512, Math.round((Number(srv.allocatedRamGb) || 4) * 1024));
      const summary = computeHistorySummary(filtered, allocatedRamMb);

      res.json({
        success: true,
        serverId,
        range: rangeKey,
        running: deps.activeProcesses.has(serverId),
        allocatedRamMb,
        totalStored24h: all24h.length,
        recordingSince: all24h.length ? all24h[0].isoTime : null,
        lastSampleAt: all24h.length ? all24h[all24h.length - 1].isoTime : null,
        summary,
        samples: filtered
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Fehler beim Laden der Leistungsverlaufsdaten.' });
    }
  });

  // --- FORCE IMMEDIATE TELEMETRY SAMPLE CAPTURE ---
  app.post('/api/servers/:id/metrics/sample', async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const srv = checkAccess(req, res, serverId);
      if (!srv) return;

      const { rangeKey } = parseRangeMs(String(req.body?.range || req.query.range || '24h'));
      const latestSample = await recordSampleForServer(serverId, true);
      const all24h = loadSamples(serverId);
      const filtered = getHistory(serverId, rangeKey);
      const allocatedRamMb = Math.max(512, Math.round((Number(srv.allocatedRamGb) || 4) * 1024));
      const summary = computeHistorySummary(filtered, allocatedRamMb);

      res.json({
        success: true,
        serverId,
        range: rangeKey,
        running: deps.activeProcesses.has(serverId),
        allocatedRamMb,
        sample: latestSample,
        totalStored24h: all24h.length,
        recordingSince: all24h.length ? all24h[0].isoTime : null,
        lastSampleAt: all24h.length ? all24h[all24h.length - 1].isoTime : null,
        summary,
        samples: filtered
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Fehler beim Erfassen des Messpunkts.' });
    }
  });

  // --- CLEAR STORED 24H HISTORY FOR A SERVER ---
  app.delete('/api/servers/:id/metrics/history', async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const srv = checkAccess(req, res, serverId);
      if (!srv) return;

      cleanupServerHistory(serverId);
      const fresh = await recordSampleForServer(serverId, true);
      const allocatedRamMb = Math.max(512, Math.round((Number(srv.allocatedRamGb) || 4) * 1024));
      const samples = fresh ? [fresh] : [];

      res.json({
        success: true,
        serverId,
        message: 'Verlaufsdaten zurückgesetzt und neue Erfassung gestartet.',
        allocatedRamMb,
        totalStored24h: samples.length,
        recordingSince: fresh?.isoTime || null,
        lastSampleAt: fresh?.isoTime || null,
        summary: computeHistorySummary(samples, allocatedRamMb),
        samples
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Fehler beim Zurücksetzen der Verlaufsdaten.' });
    }
  });

  // Background periodic sampler (every 60s by default, unref'd so Node exits cleanly)
  const intervalMs = Math.max(10_000, deps.sampleIntervalMs ?? 60_000);
  const collectorTimer = setInterval(async () => {
    try {
      const servers = deps.getServerRegistry();
      for (const srv of servers) {
        if (srv?.id) {
          await recordSampleForServer(srv.id, false);
        }
      }
    } catch {
      // Non-fatal background sampling error
    }
  }, intervalMs);
  collectorTimer.unref?.();

  return {
    recordSampleForServer,
    recordRawSample,
    getHistory,
    cleanupServerHistory,
    stopCollector: () => clearInterval(collectorTimer)
  };
}
