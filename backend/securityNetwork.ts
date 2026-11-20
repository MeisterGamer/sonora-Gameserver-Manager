import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { AuthController } from './auth.ts';

export type DdosProtectionLevel = 'standard' | 'strict' | 'mitigation';

export interface BlockedAttackEvent {
  id: string;
  timestamp: string;
  sourceIp: string;
  attackVector: string;
  peakRateMbps: number;
  packetsDropped: number;
  action: 'blocked' | 'mitigated';
  rule: string;
  originRegion: string;
  isTest?: boolean;
}

export interface ServerSecurityConfig {
  serverId: string;
  ddosFilterEnabled: boolean;
  protectionLevel: DdosProtectionLevel;
  rateLimitPps: number;
  updatedAt: string;
  events: BlockedAttackEvent[];
}

export interface RegionalLatencySample {
  regionId: string;
  regionName: string;
  city: string;
  countryCode: string;
  latencyMs: number;
  packetLossPercent: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  probeTarget: string;
  measurementMode: 'live-tcp' | 'estimated-fiber';
}

export interface NetworkProbeSnapshot {
  timestamp: string;
  label: string;
  serverId: string;
  hostIp: string;
  hostName: string;
  serverPort: number;
  gamePortReachable: boolean;
  currentPingMs: number;
  minPingMs: number;
  maxPingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  probesSent: number;
  probesReceived: number;
  measurementMode: 'live-tcp' | 'estimated-fiber';
  regions: RegionalLatencySample[];
}

export interface SecurityNetworkDeps {
  auth?: AuthController;
  managerStateDir: string;
  getServerRegistry: () => any[];
  activeProcesses: Map<string, any>;
  getHostPrimaryIp: () => string;
  canUserAccessServer?: (user: any, server: any) => boolean;
  recordAuditLog?: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'security' | 'success';
  }) => void;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  skipExternalProbes?: boolean;
}

export interface SecurityNetworkController {
  getSecurityState: (serverId: string) => ServerSecurityConfig;
  recordBlockedAttack: (serverId: string, event: Omit<BlockedAttackEvent, 'id' | 'timestamp'>) => BlockedAttackEvent;
  runNetworkProbe: (serverId: string) => Promise<NetworkProbeSnapshot>;
  cleanupServerData: (serverId: string) => void;
}

interface RegionProbeDef {
  regionId: string;
  regionName: string;
  city: string;
  countryCode: string;
  host: string;
  port: number;
  baselineFiberMs: number;
}

const REGION_PROBES: RegionProbeDef[] = [
  { regionId: 'eu-central', regionName: 'Europa Mitte', city: 'Frankfurt', countryCode: 'DE', host: '1.1.1.1', port: 443, baselineFiberMs: 11.4 },
  { regionId: 'eu-west-nl', regionName: 'Westeuropa', city: 'Amsterdam', countryCode: 'NL', host: '9.9.9.9', port: 443, baselineFiberMs: 17.8 },
  { regionId: 'eu-west-uk', regionName: 'Großbritannien', city: 'London', countryCode: 'UK', host: '8.8.8.8', port: 443, baselineFiberMs: 24.5 },
  { regionId: 'eu-east', regionName: 'Osteuropa', city: 'Warschau', countryCode: 'PL', host: '8.8.4.4', port: 443, baselineFiberMs: 31.2 },
  { regionId: 'us-east', regionName: 'Nordamerika Ost', city: 'New York', countryCode: 'US', host: '1.0.0.1', port: 443, baselineFiberMs: 92.6 },
  { regionId: 'ap-southeast', regionName: 'Asien-Pazifik', city: 'Singapur', countryCode: 'SG', host: '208.67.222.222', port: 443, baselineFiberMs: 164.0 }
];

const TEST_VECTORS = [
  { attackVector: 'UDP Flood (Game-Port)', rule: 'L4-UDP-RateLimit', originRegion: 'Externes Netz (Test)', peakRateMbps: 420, packetsDropped: 48200, sourceIp: '198.51.100.42' },
  { attackVector: 'SYN Flood', rule: 'TCP-SYN-Cookie-Guard', originRegion: 'Externes Netz (Test)', peakRateMbps: 185, packetsDropped: 29450, sourceIp: '203.0.113.87' },
  { attackVector: 'A2S Query Amplification', rule: 'L7-Query-Throttle', originRegion: 'Externes Netz (Test)', peakRateMbps: 310, packetsDropped: 61900, sourceIp: '192.0.2.154' },
  { attackVector: 'Malformed Handshake Burst', rule: 'L7-Protocol-Inspector', originRegion: 'Externes Netz (Test)', peakRateMbps: 95, packetsDropped: 14120, sourceIp: '198.51.100.199' }
];

function round1(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
}

function classifyLatency(ms: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (ms <= 30) return 'excellent';
  if (ms <= 65) return 'good';
  if (ms <= 120) return 'fair';
  return 'poor';
}

function tcpConnectProbe(host: string, port: number, timeoutMs = 900): Promise<{ ok: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    let settled = false;
    const sock = net.createConnection({ host, port });

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      const elapsedNs = Number(process.hrtime.bigint() - start);
      const latencyMs = Math.max(0.2, elapsedNs / 1_000_000);
      try {
        sock.destroy();
      } catch {}
      resolve({ ok, latencyMs: round1(latencyMs) });
    };

    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

function formatClockLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function configureSecurityNetwork(
  app: Express,
  deps: SecurityNetworkDeps
): SecurityNetworkController {
  const securityFile = path.join(deps.managerStateDir, 'security-status.json');
  if (!fs.existsSync(deps.managerStateDir)) {
    fs.mkdirSync(deps.managerStateDir, { recursive: true });
  }

  const readStore = (): Record<string, ServerSecurityConfig> => {
    try {
      if (fs.existsSync(securityFile)) {
        const parsed = JSON.parse(fs.readFileSync(securityFile, 'utf8'));
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  };

  const writeStore = (store: Record<string, ServerSecurityConfig>) => {
    try {
      if (!fs.existsSync(deps.managerStateDir)) {
        fs.mkdirSync(deps.managerStateDir, { recursive: true });
      }
      const tmp = `${securityFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
      fs.renameSync(tmp, fileTarget(securityFile));
    } catch {}
  };

  const fileTarget = (p: string) => p;

  let securityStore: Record<string, ServerSecurityConfig> = readStore();
  const networkHistory = new Map<string, NetworkProbeSnapshot[]>();
  let testVectorCursor = 0;

  const ensureSecurityRecord = (serverId: string): ServerSecurityConfig => {
    if (!securityStore[serverId]) {
      securityStore[serverId] = {
        serverId,
        ddosFilterEnabled: true,
        protectionLevel: 'standard',
        rateLimitPps: 15000,
        updatedAt: new Date().toISOString(),
        events: []
      };
      writeStore(securityStore);
    }
    return securityStore[serverId];
  };

  const getSecurityState = (serverId: string): ServerSecurityConfig => {
    return ensureSecurityRecord(serverId);
  };

  const recordBlockedAttack = (
    serverId: string,
    event: Omit<BlockedAttackEvent, 'id' | 'timestamp'>
  ): BlockedAttackEvent => {
    const rec = ensureSecurityRecord(serverId);
    const entry: BlockedAttackEvent = {
      id: `ddos_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      ...event
    };
    rec.events.unshift(entry);
    if (rec.events.length > 100) rec.events = rec.events.slice(0, 100);
    rec.updatedAt = entry.timestamp;
    writeStore(securityStore);
    return entry;
  };

  const computeSecurityStats = (rec: ServerSecurityConfig) => {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    let blockedLast24h = 0;
    let totalPacketsDropped = 0;
    for (const ev of rec.events) {
      totalPacketsDropped += Number(ev.packetsDropped) || 0;
      if (new Date(ev.timestamp).getTime() >= cutoff24h) {
        blockedLast24h += 1;
      }
    }
    return {
      totalBlocked: rec.events.length,
      blockedLast24h,
      totalPacketsDropped
    };
  };

  const runNetworkProbe = async (serverId: string): Promise<NetworkProbeSnapshot> => {
    const srv = deps.getServerRegistry().find(s => s.id === serverId);
    const proc = deps.activeProcesses.get(serverId);
    const serverPort = Number(proc?.port || srv?.port || 25565);
    const hostIp = deps.getHostPrimaryIp();
    const hostName = os.hostname() || 'localhost';

    // 1. Real 4-probe loopback/game-port RTT & packet loss check
    const probeTargetPort = proc ? serverPort : Number(process.env.PORT || 3000);
    const probeResults: { ok: boolean; latencyMs: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await tcpConnectProbe('127.0.0.1', probeTargetPort, 400);
      probeResults.push(r);
    }

    const okSamples = probeResults.filter(p => p.ok).map(p => p.latencyMs);
    const probesSent = probeResults.length;
    const probesReceived = okSamples.length;
    const gamePortReachable = proc ? probesReceived > 0 : false;

    const currentPingMs = probesReceived > 0
      ? round1(okSamples.reduce((a, b) => a + b, 0) / probesReceived)
      : 0;
    const minPingMs = probesReceived > 0 ? round1(Math.min(...okSamples)) : 0;
    const maxPingMs = probesReceived > 0 ? round1(Math.max(...okSamples)) : 0;
    const jitterMs = probesReceived > 1 ? round1(maxPingMs - minPingMs) : 0;
    const packetLossPercent = round1(((probesSent - probesReceived) / probesSent) * 100);

    // 2. Real parallel regional TCP handshake probes (with deterministic calibrated fiber fallback if sandbox blocks egress)
    const regions: RegionalLatencySample[] = await Promise.all(
      REGION_PROBES.map(async (reg) => {
        if (!deps.skipExternalProbes) {
          const live = await tcpConnectProbe(reg.host, reg.port, 900);
          if (live.ok) {
            return {
              regionId: reg.regionId,
              regionName: reg.regionName,
              city: reg.city,
              countryCode: reg.countryCode,
              latencyMs: live.latencyMs,
              packetLossPercent: 0,
              quality: classifyLatency(live.latencyMs),
              probeTarget: `${reg.host}:${reg.port}`,
              measurementMode: 'live-tcp' as const
            };
          }
        }

        // Sandbox/offline fallback: local host RTT + calibrated optical-fiber propagation latency
        const estLatency = round1(reg.baselineFiberMs + currentPingMs);
        return {
          regionId: reg.regionId,
          regionName: reg.regionName,
          city: reg.city,
          countryCode: reg.countryCode,
          latencyMs: estLatency,
          packetLossPercent: packetLossPercent,
          quality: classifyLatency(estLatency),
          probeTarget: `${reg.host}:${reg.port}`,
          measurementMode: 'estimated-fiber' as const
        };
      })
    );

    const anyLiveRegion = regions.some(r => r.measurementMode === 'live-tcp');
    const now = new Date();
    const snapshot: NetworkProbeSnapshot = {
      timestamp: now.toISOString(),
      label: formatClockLabel(now),
      serverId,
      hostIp,
      hostName,
      serverPort,
      gamePortReachable,
      currentPingMs,
      minPingMs,
      maxPingMs,
      jitterMs,
      packetLossPercent,
      probesSent,
      probesReceived,
      measurementMode: anyLiveRegion ? 'live-tcp' : 'estimated-fiber',
      regions
    };

    const list = networkHistory.get(serverId) || [];
    list.push(snapshot);
    if (list.length > 20) list.shift();
    networkHistory.set(serverId, list);

    return snapshot;
  };

  const cleanupServerData = (serverId: string) => {
    if (securityStore[serverId]) {
      delete securityStore[serverId];
      writeStore(securityStore);
    }
    networkHistory.delete(serverId);
  };

  const checkAccess = (req: Request, res: Response, serverId: string): boolean => {
    if (deps.auth && deps.canUserAccessServer) {
      const reqUser = deps.auth.getSessionUser(req);
      const srv = deps.getServerRegistry().find(s => s.id === serverId);
      if (reqUser && reqUser.role !== 'admin' && srv && !deps.canUserAccessServer(reqUser, srv)) {
        res.status(403).json({ success: false, error: 'Kein Zugriff auf Sicherheits- oder Netzwerkdaten dieses Servers.' });
        return false;
      }
    }
    return true;
  };

  // --- SECURITY STATUS ENDPOINTS ---
  app.get('/api/servers/:id/security', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const rec = ensureSecurityRecord(serverId);
    res.json({
      success: true,
      serverId,
      ddosFilterEnabled: rec.ddosFilterEnabled,
      protectionLevel: rec.protectionLevel,
      rateLimitPps: rec.rateLimitPps,
      updatedAt: rec.updatedAt,
      stats: computeSecurityStats(rec),
      events: rec.events.slice(0, 30)
    });
  });

  app.patch('/api/servers/:id/security/ddos', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const rec = ensureSecurityRecord(serverId);
    const body = req.body || {};

    if (typeof body.ddosFilterEnabled === 'boolean') {
      rec.ddosFilterEnabled = body.ddosFilterEnabled;
    }
    if (body.protectionLevel && ['standard', 'strict', 'mitigation'].includes(body.protectionLevel)) {
      rec.protectionLevel = body.protectionLevel;
    }
    if (body.rateLimitPps !== undefined) {
      const pps = Math.round(Number(body.rateLimitPps));
      if (Number.isFinite(pps) && pps >= 1000 && pps <= 500000) {
        rec.rateLimitPps = pps;
      }
    }
    rec.updatedAt = new Date().toISOString();
    writeStore(securityStore);

    const reqUser = deps.auth?.getSessionUser(req);
    const statusWord = rec.ddosFilterEnabled ? 'aktiviert' : 'deaktiviert';
    deps.appendLog?.(
      serverId,
      rec.ddosFilterEnabled ? 'SUCCESS' : 'WARN',
      `[Sicherheit] DDoS-Filter ${statusWord} (Profil: ${rec.protectionLevel}, Limit: ${rec.rateLimitPps} pps).`
    );
    deps.recordAuditLog?.({
      serverId,
      action: 'config',
      user: reqUser?.username || 'Admin',
      details: `DDoS-Filter ${statusWord} (Schutzstufe: ${rec.protectionLevel}).`,
      severity: rec.ddosFilterEnabled ? 'security' : 'warning'
    });

    res.json({
      success: true,
      serverId,
      ddosFilterEnabled: rec.ddosFilterEnabled,
      protectionLevel: rec.protectionLevel,
      rateLimitPps: rec.rateLimitPps,
      updatedAt: rec.updatedAt,
      stats: computeSecurityStats(rec),
      events: rec.events.slice(0, 30)
    });
  });

  app.post('/api/servers/:id/security/test-mitigation', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const rec = ensureSecurityRecord(serverId);
    if (!rec.ddosFilterEnabled) {
      return res.status(409).json({
        success: false,
        error: 'Der DDoS-Filter ist derzeit inaktiv. Aktiviere zuerst den DDoS-Filter, um einen Regel-Test zu protokollieren.'
      });
    }

    const template = TEST_VECTORS[testVectorCursor % TEST_VECTORS.length];
    testVectorCursor += 1;

    const event = recordBlockedAttack(serverId, {
      sourceIp: template.sourceIp,
      attackVector: template.attackVector,
      peakRateMbps: template.peakRateMbps,
      packetsDropped: template.packetsDropped,
      action: rec.protectionLevel === 'mitigation' ? 'mitigated' : 'blocked',
      rule: template.rule,
      originRegion: template.originRegion,
      isTest: true
    });

    deps.appendLog?.(
      serverId,
      'WARN',
      `[DDoS-Filter] Blockiert (${event.rule}): ${event.attackVector} von ${event.sourceIp} (${event.packetsDropped} Pakete verworfen).`
    );

    res.status(201).json({
      success: true,
      event,
      ddosFilterEnabled: rec.ddosFilterEnabled,
      protectionLevel: rec.protectionLevel,
      rateLimitPps: rec.rateLimitPps,
      updatedAt: rec.updatedAt,
      stats: computeSecurityStats(rec),
      events: rec.events.slice(0, 30)
    });
  });

  app.delete('/api/servers/:id/security/events', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const rec = ensureSecurityRecord(serverId);
    rec.events = [];
    rec.updatedAt = new Date().toISOString();
    writeStore(securityStore);

    res.json({
      success: true,
      serverId,
      ddosFilterEnabled: rec.ddosFilterEnabled,
      protectionLevel: rec.protectionLevel,
      rateLimitPps: rec.rateLimitPps,
      updatedAt: rec.updatedAt,
      stats: computeSecurityStats(rec),
      events: []
    });
  });

  // --- NETWORK OVERVIEW ENDPOINTS ---
  app.get('/api/servers/:id/network/overview', async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      if (!checkAccess(req, res, serverId)) return;

      const hist = networkHistory.get(serverId) || [];
      const latest = hist.length ? hist[hist.length - 1] : null;
      const isStale = !latest || Date.now() - new Date(latest.timestamp).getTime() > 20_000;
      const snapshot = isStale ? await runNetworkProbe(serverId) : latest;

      res.json({
        success: true,
        snapshot,
        history: (networkHistory.get(serverId) || []).map(h => ({
          timestamp: h.timestamp,
          label: h.label,
          pingMs: h.currentPingMs,
          jitterMs: h.jitterMs,
          packetLossPercent: h.packetLossPercent
        }))
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Netzwerk-Übersicht konnte nicht geladen werden.' });
    }
  });

  app.post('/api/servers/:id/network/probe', async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      if (!checkAccess(req, res, serverId)) return;

      const snapshot = await runNetworkProbe(serverId);
      res.json({
        success: true,
        snapshot,
        history: (networkHistory.get(serverId) || []).map(h => ({
          timestamp: h.timestamp,
          label: h.label,
          pingMs: h.currentPingMs,
          jitterMs: h.jitterMs,
          packetLossPercent: h.packetLossPercent
        }))
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Latenzmessung fehlgeschlagen.' });
    }
  });

  return {
    getSecurityState,
    recordBlockedAttack,
    runNetworkProbe,
    cleanupServerData
  };
}
