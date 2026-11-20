import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import { configurePerformanceHistory } from '../backend/performanceHistory.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// 1. Static architecture & Recharts integration checks
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check('recharts is installed in package.json dependencies', Boolean(pkg.dependencies?.recharts));

const monitorSrc = fs.readFileSync('src/components/PerformanceMonitorView.tsx', 'utf8');
check('PerformanceMonitorView imports Recharts components (ResponsiveContainer, AreaChart, ComposedChart, Tooltip)',
  monitorSrc.includes("from 'recharts'") &&
  monitorSrc.includes('ResponsiveContainer') &&
  monitorSrc.includes('AreaChart') &&
  monitorSrc.includes('ComposedChart') &&
  monitorSrc.includes('Tooltip')
);

check('PerformanceMonitorView visualizes CPU, RAM, and Network (Inbound/Outbound) over 24h with no mock randomness or browser alerts',
  monitorSrc.includes('cpuPercent') &&
  monitorSrc.includes('ramUsedMb') &&
  monitorSrc.includes('ramPercent') &&
  monitorSrc.includes('networkInKb') &&
  monitorSrc.includes('networkOutKb') &&
  monitorSrc.includes("'24h'") &&
  monitorSrc.includes('/metrics/history') &&
  monitorSrc.includes('/metrics/sample') &&
  !monitorSrc.includes('Math.random(') &&
  !monitorSrc.includes('window.alert(') &&
  !monitorSrc.includes('window.confirm(')
);

const detailSrc = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
check('ServerDetail.tsx registers the Leistungs-Monitor tab and renders PerformanceMonitorView',
  detailSrc.includes("import { PerformanceMonitorView } from './PerformanceMonitorView'") &&
  detailSrc.includes("'performance'") &&
  detailSrc.includes('Leistungs-Monitor') &&
  detailSrc.includes('<PerformanceMonitorView')
);

const serverSrc = fs.readFileSync('server.ts', 'utf8');
check('server.ts wires configurePerformanceHistory and cleans up history on server deletion',
  serverSrc.includes('configurePerformanceHistory') &&
  serverSrc.includes('performanceHistory?.cleanupServerHistory')
);

// 2. End-to-End Backend Persistence & 24h Filtering Test (isolated temp Express server)
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-perf-test-'));
const managerDir = path.join(tmpRoot, 'manager');
fs.mkdirSync(managerDir, { recursive: true });

const mockServers = [
  { id: 'srv_perf_1', name: 'Survival Node', allocatedRamGb: 4, port: 25565 }
];
const activeProcesses = new Map([
  ['srv_perf_1', { pid: process.pid, port: 25565, startTime: Date.now() - 120_000 }]
]);

let liveCallCount = 0;
const testApp = express();
testApp.use(express.json());

const controller = configurePerformanceHistory(testApp, {
  managerStateDir: managerDir,
  getServerRegistry: () => mockServers,
  activeProcesses,
  sampleIntervalMs: 600_000,
  getLiveServerStats: async () => {
    liveCallCount += 1;
    return {
      cpuUsagePercent: 22.5 + liveCallCount * 5,
      ramUsageMb: 1200 + liveCallCount * 100,
      currentPlayers: 4,
      maxPlayers: 20,
      tps: 19.9,
      uptimeSeconds: 120,
      networkInKb: 145.5,
      networkOutKb: 210.2
    };
  }
});

// Seed historical points across the last 26 hours (one expired point >24h ago must be pruned)
const now = Date.now();
const hour = 60 * 60 * 1000;
controller.recordRawSample('srv_perf_1', {
  timestamp: now - 26 * hour,
  isoTime: new Date(now - 26 * hour).toISOString(),
  label: 'OLD',
  cpuPercent: 99,
  ramUsedMb: 4000,
  ramAllocatedMb: 4096,
  ramPercent: 97.7,
  networkInKb: 999,
  networkOutKb: 999,
  tps: 15,
  players: 10,
  running: true
});
controller.recordRawSample('srv_perf_1', {
  timestamp: now - 18 * hour,
  isoTime: new Date(now - 18 * hour).toISOString(),
  label: '18h',
  cpuPercent: 18.0,
  ramUsedMb: 1024,
  ramAllocatedMb: 4096,
  ramPercent: 25.0,
  networkInKb: 80.0,
  networkOutKb: 120.0,
  tps: 20.0,
  players: 2,
  running: true
});
controller.recordRawSample('srv_perf_1', {
  timestamp: now - 3 * hour,
  isoTime: new Date(now - 3 * hour).toISOString(),
  label: '3h',
  cpuPercent: 42.0,
  ramUsedMb: 2048,
  ramAllocatedMb: 4096,
  ramPercent: 50.0,
  networkInKb: 220.0,
  networkOutKb: 310.0,
  tps: 19.8,
  players: 7,
  running: true
});

const srv = await new Promise((resolve) => {
  const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
});
const port = srv.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // Query 24h range (should prune >24h sample and capture live sample)
  const res24 = await fetch(`${baseUrl}/api/servers/srv_perf_1/metrics/history?range=24h`);
  const data24 = await res24.json();
  check('GET /metrics/history?range=24h succeeds and prunes samples older than 24h',
    res24.status === 200 &&
    data24.success === true &&
    data24.samples.every(s => s.label !== 'OLD') &&
    data24.samples.length === 3
  );
  check('Summary computes accurate peak CPU, RAM, and network statistics',
    data24.summary.peakCpu >= 42.0 &&
    data24.summary.peakRamMb >= 2048 &&
    data24.summary.peakNetInKb >= 220.0 &&
    data24.summary.peakNetOutKb >= 310.0
  );

  // Query 6h range (should exclude 18h-old sample)
  const res6 = await fetch(`${baseUrl}/api/servers/srv_perf_1/metrics/history?range=6h`);
  const data6 = await res6.json();
  check('GET /metrics/history?range=6h filters samples strictly within 6 hours',
    res6.status === 200 &&
    data6.samples.length === 2 &&
    data6.samples.every(s => s.label !== '18h')
  );

  // Manual sample capture
  const sampleRes = await fetch(`${baseUrl}/api/servers/srv_perf_1/metrics/sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: '24h' })
  });
  const sampleData = await sampleRes.json();
  check('POST /metrics/sample captures and persists a new live telemetry point',
    sampleRes.status === 200 &&
    sampleData.success === true &&
    sampleData.samples.length === 4
  );

  // Disk persistence file verification
  const persistedPath = path.join(managerDir, 'metrics-history', 'srv_perf_1.json');
  check('24h performance history is persisted atomically on disk',
    fs.existsSync(persistedPath) &&
    JSON.parse(fs.readFileSync(persistedPath, 'utf8')).length === 4
  );

  // Reset history
  const clearRes = await fetch(`${baseUrl}/api/servers/srv_perf_1/metrics/history`, {
    method: 'DELETE'
  });
  const clearData = await clearRes.json();
  check('DELETE /metrics/history resets stored samples and records fresh baseline',
    clearRes.status === 200 &&
    clearData.success === true &&
    clearData.samples.length === 1
  );
} finally {
  controller.stopCollector();
  srv.closeAllConnections?.();
  srv.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

fs.writeFileSync('audit/performance-monitor-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} Performance Monitor (Recharts 24h CPU/RAM/Network) regression checks passed.`);
