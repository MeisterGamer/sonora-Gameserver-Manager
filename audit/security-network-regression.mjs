import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { configureSecurityNetwork } from '../backend/securityNetwork.ts';

const root = process.cwd();

function readFile(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

// 1. Static architecture & UI integration checks
const serverTs = readFile('server.ts');
assert.match(serverTs, /configureSecurityNetwork/, 'server.ts must import and mount configureSecurityNetwork');
assert.match(serverTs, /securityNetwork\?\.cleanupServerData\(serverId\)/, 'server.ts must clean up security/network data on server deletion');

const serverDetailTsx = readFile('src/components/ServerDetail.tsx');
assert.match(serverDetailTsx, /import\s+\{\s*SecurityStatusBlock\s*\}\s+from\s+'\.\/SecurityStatusBlock'/, 'ServerDetail.tsx must import SecurityStatusBlock');
assert.match(serverDetailTsx, /import\s+\{\s*NetworkOverviewView\s*\}\s+from\s+'\.\/NetworkOverviewView'/, 'ServerDetail.tsx must import NetworkOverviewView');
assert.match(serverDetailTsx, /<SecurityStatusBlock\s+server=\{server\}/, 'ServerDetail.tsx must render SecurityStatusBlock in the server detail header flow');
assert.match(serverDetailTsx, /Netzwerk-Übersicht/, 'ServerDetail.tsx must expose a Netzwerk-Übersicht tab');
assert.match(serverDetailTsx, /<NetworkOverviewView\s+server=\{server\}/, 'ServerDetail.tsx must render NetworkOverviewView when active');

const securityUi = readFile('src/components/SecurityStatusBlock.tsx');
assert.match(securityUi, /Sicherheits-Status/, 'SecurityStatusBlock must display Sicherheits-Status heading');
assert.match(securityUi, /DDoS-Filter/, 'SecurityStatusBlock must display DDoS-Filter status');
assert.match(securityUi, /\/api\/servers\/\$\{(encodeURIComponent\()?server\.id\)?\}\/security/, 'SecurityStatusBlock must query security API');
assert.doesNotMatch(securityUi, /window\.(alert|confirm|open)/, 'SecurityStatusBlock must not use native browser dialogs');

const networkUi = readFile('src/components/NetworkOverviewView.tsx');
assert.match(networkUi, /Netzwerk-Übersicht/, 'NetworkOverviewView must display Netzwerk-Übersicht heading');
assert.match(networkUi, /BarChart/, 'NetworkOverviewView must use Recharts BarChart for regional latency');
assert.match(networkUi, /LineChart/, 'NetworkOverviewView must use Recharts LineChart for ping history');
assert.match(networkUi, /Paketverlust/, 'NetworkOverviewView must display Paketverlust');
assert.match(networkUi, /\/api\/servers\/\$\{(encodeURIComponent\()?server\.id\)?\}\/network\/overview/, 'NetworkOverviewView must query network overview API');
assert.doesNotMatch(networkUi, /window\.(alert|confirm|open)/, 'NetworkOverviewView must not use native browser dialogs');

// 2. Live isolated Express backend tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-secnet-test-'));
const app = express();
app.use(express.json());

const fakeRegistry = [
  { id: 'srv-sec-1', name: 'SecNet Test Server', port: 25565, status: 'offline' }
];
const auditEntries = [];

const controller = configureSecurityNetwork(app, {
  managerStateDir: tmpDir,
  getServerRegistry: () => fakeRegistry,
  activeProcesses: new Map(),
  getHostPrimaryIp: () => '127.0.0.1',
  recordAuditLog: (entry) => auditEntries.push(entry),
  skipExternalProbes: true
});

const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});

try {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // 2a. Default security state
  const secRes1 = await fetch(`${baseUrl}/api/servers/srv-sec-1/security`);
  assert.equal(secRes1.status, 200);
  const secData1 = await secRes1.json();
  assert.equal(secData1.success, true);
  assert.equal(secData1.ddosFilterEnabled, true);
  assert.equal(secData1.protectionLevel, 'standard');
  assert.ok(Array.isArray(secData1.events));
  assert.equal(secData1.events.length, 0);

  // 2b. Run controlled filter test mitigation
  const testRes1 = await fetch(`${baseUrl}/api/servers/srv-sec-1/security/test-mitigation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(testRes1.status, 201);
  const testData1 = await testRes1.json();
  assert.equal(testData1.success, true);
  assert.ok(testData1.event?.id);
  assert.equal(testData1.events.length, 1);
  assert.equal(testData1.stats.blockedLast24h, 1);

  // Verify persistence on disk
  const stateFile = path.join(tmpDir, 'security-status.json');
  assert.equal(fs.existsSync(stateFile), true, 'security-status.json must be persisted');
  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persisted['srv-sec-1'].events.length, 1);

  // 2c. Disable DDoS filter and verify test-mitigation rejects with 409
  const patchRes = await fetch(`${baseUrl}/api/servers/srv-sec-1/security/ddos`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ddosFilterEnabled: false, protectionLevel: 'strict' })
  });
  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.ddosFilterEnabled, false);
  assert.equal(patchData.protectionLevel, 'strict');

  const blockedTestRes = await fetch(`${baseUrl}/api/servers/srv-sec-1/security/test-mitigation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(blockedTestRes.status, 409, 'Filter test must return 409 when DDoS filter is disabled');

  // Re-enable filter and clear events
  await fetch(`${baseUrl}/api/servers/srv-sec-1/security/ddos`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ddosFilterEnabled: true, protectionLevel: 'mitigation' })
  });

  const clearRes = await fetch(`${baseUrl}/api/servers/srv-sec-1/security/events`, {
    method: 'DELETE'
  });
  assert.equal(clearRes.status, 200);
  const clearData = await clearRes.json();
  assert.equal(clearData.success, true);
  assert.equal(clearData.events.length, 0);

  // 2d. Network overview initial probe & manual re-probe
  const netRes1 = await fetch(`${baseUrl}/api/servers/srv-sec-1/network/overview`);
  assert.equal(netRes1.status, 200);
  const netData1 = await netRes1.json();
  assert.equal(netData1.success, true);
  assert.equal(typeof netData1.snapshot.currentPingMs, 'number');
  assert.equal(typeof netData1.snapshot.packetLossPercent, 'number');
  assert.equal(typeof netData1.snapshot.jitterMs, 'number');
  assert.equal(netData1.snapshot.regions.length, 6, 'Must return 6 geographic regions');
  assert.equal(netData1.history.length, 1);

  const netProbeRes = await fetch(`${baseUrl}/api/servers/srv-sec-1/network/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(netProbeRes.status, 200);
  const netProbeData = await netProbeRes.json();
  assert.equal(netProbeData.success, true);
  assert.equal(netProbeData.history.length, 2, 'Manual probe must append to ping history');

  // 2e. Cleanup server data
  controller.cleanupServerData('srv-sec-1');
  const persistedAfterCleanup = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persistedAfterCleanup['srv-sec-1'], undefined, 'cleanupServerData must remove server security state');
  assert.ok(auditEntries.length >= 2, 'Security config changes must emit audit log entries');

  console.log('security-network-regression passed (all static + live API checks green)');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
