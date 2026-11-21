import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {
  buildModIndex,
  queryModIndex,
  evaluateMcVersionCompatibility,
  configureModIndex
} from '../backend/modIndex.ts';
import {
  parseProcDiskstatsSnapshot,
  computeDiskIoFromSnapshots,
  parseDfInodesOutput,
  parseDfSpaceOutput,
  readLinuxThermalSensors,
  evaluateHardwareThresholds,
  DEFAULT_HARDWARE_THRESHOLDS,
  configureHardwareHealth
} from '../backend/hardwareHealth.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// =========================================================================
// PART 1: Server-Side Mod Indexing (Tags & MC Version Compatibility)
// =========================================================================
const idx = buildModIndex();
check('Server-side mod index builds all curated mods', idx.items.length >= 25);
check('Inverted tag index populated with normalized tags', idx.tagIndex.size >= 30);
check('Minecraft version index populated', idx.versionIndex.size >= 5);

// Tag filter: single tag
const perfTagRes = queryModIndex(idx, { tags: ['performance'], tagMode: 'all' });
check('Tag filter "performance" returns matching mods', perfTagRes.total >= 3 && perfTagRes.items.every(i => i.normalizedTags.includes('performance')));

// Multi-tag filter: ALL (AND) vs ANY (OR)
const andTagRes = queryModIndex(idx, { tags: ['fabric', 'optimization'], tagMode: 'all' });
const orTagRes = queryModIndex(idx, { tags: ['fabric', 'rust'], tagMode: 'any' });
check('Multi-tag AND mode filters mods containing all requested tags', andTagRes.total >= 1 && andTagRes.items.every(i => i.normalizedTags.includes('fabric') && i.normalizedTags.includes('optimization')));
check('Multi-tag OR mode returns union of tagged mods', orTagRes.total > andTagRes.total && orTagRes.items.some(i => i.normalizedTags.includes('rust')) && orTagRes.items.some(i => i.normalizedTags.includes('fabric')));

// Minecraft Version Compatibility: exact vs minor-series vs non-minecraft exclusion
const mcStrict1214 = queryModIndex(idx, { mcVersion: '1.21.4', compatibility: 'strict' });
check('Strict MC 1.21.4 filter only returns exact matches and excludes non-Minecraft mods',
  mcStrict1214.total >= 5 &&
  mcStrict1214.items.every(i => i.gameId === 'minecraft' && i.compatibilityStatus === 'exact')
);

const mcMinor1213 = queryModIndex(idx, { mcVersion: '1.21.3', compatibility: 'compatible' });
check('Compatible MC 1.21.3 filter matches 1.21.x minor-series mods',
  mcMinor1213.total >= 5 &&
  mcMinor1213.items.every(i => i.gameId === 'minecraft' && ['exact', 'minor', 'universal'].includes(i.compatibilityStatus))
);

const rustMod = idx.items.find(i => i.gameId === 'rust');
check('Non-Minecraft mod evaluated as incompatible for MC 1.21.4',
  rustMod && evaluateMcVersionCompatibility(rustMod, '1.21.4').status === 'incompatible'
);

// Express REST endpoints for Mod Index
const tmpModDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-mod-index-test-'));
try {
  const routes = {};
  const mockApp = {
    get: (p, h) => { routes['GET ' + p] = h; },
    post: (p, h) => { routes['POST ' + p] = h; }
  };
  let auditCalled = false;
  configureModIndex(mockApp, {
    managerStateDir: tmpModDir,
    recordAuditLog: () => { auditCalled = true; }
  });

  check('GET /api/mods/index/facets registered', Boolean(routes['GET /api/mods/index/facets']));
  check('GET /api/mods/index/search registered', Boolean(routes['GET /api/mods/index/search']));
  check('POST /api/mods/index/rebuild registered', Boolean(routes['POST /api/mods/index/rebuild']));
  check('mod-index.json persisted to managerStateDir', fs.existsSync(path.join(tmpModDir, 'mod-index.json')));

  let out = null;
  const res = { json: (d) => { out = d; return res; }, status: () => res };

  routes['GET /api/mods/index/facets']({ query: {} }, res);
  check('Facets endpoint returns tags and mcVersions arrays', out?.success === true && out.facets.tags.length > 10 && out.facets.mcVersions.length >= 5);

  await routes['GET /api/mods/index/search']({
    query: { q: 'luck', tags: 'paper', mcVersion: '1.21.4', compatibility: 'compatible', refreshLive: 'false' }
  }, res);
  check('Search endpoint combines query + tag + MC version compatibility', out?.success === true && out.items.some(m => m.id === 'luckperms'));

  routes['POST /api/mods/index/rebuild']({}, res);
  check('Rebuild endpoint refreshes index and records audit log', out?.success === true && out.totalIndexed >= 25 && auditCalled);
} finally {
  fs.rmSync(tmpModDir, { recursive: true, force: true });
}

// =========================================================================
// PART 2: Hardware-Health Telemetry (Disk-IO, Inodes, Temperature & Alerts)
// =========================================================================

// 2a. Disk-IO /proc/diskstats parser
const diskstatsT0 = `
   8       0 sda 1000 0 20000 500 2000 0 40000 800 0 1200 1300
   8       1 sda1 1000 0 20000 500 2000 0 40000 800 0 1200 1300
 259       0 nvme0n1 500 0 10000 200 500 0 10000 200 0 300 400
`;
const diskstatsT1 = `
   8       0 sda 1500 0 224800 900 3000 0 449600 1400 0 2000 2300
   8       1 sda1 1500 0 224800 900 3000 0 449600 1400 0 2000 2300
 259       0 nvme0n1 500 0 10000 200 500 0 10000 200 0 300 400
`;
const snap0 = parseProcDiskstatsSnapshot(diskstatsT0, 1000);
const snap1 = parseProcDiskstatsSnapshot(diskstatsT1, 2000);
const ioMetrics = computeDiskIoFromSnapshots(snap0, snap1);
check('parseProcDiskstatsSnapshot skips partitions (sda1) and counts primary disks (sda, nvme0n1)', snap1.deviceCount === 2);
check('computeDiskIoFromSnapshots accurately computes read/write MB/s (100 MB/s read + 200 MB/s write = 300 MB/s)',
  ioMetrics.readMbPerSec === 100 && ioMetrics.writeMbPerSec === 200 && ioMetrics.totalMbPerSec === 300 && ioMetrics.totalIops === 1500
);

// 2b. Inode & Disk Space df parsers
const dfInodeSample = `Filesystem      Inodes   IUsed    IFree IUse% Mounted on
/dev/nvme0n1p2 6553600 5570560   983040   85% /`;
const parsedInodes = parseDfInodesOutput(dfInodeSample, 412);
check('parseDfInodesOutput parses used/total/free/percent accurately',
  parsedInodes && parsedInodes.usedPercent === 85 && parsedInodes.total === 6553600 && parsedInodes.serverFileCount === 412
);

const dfSpaceSample = `Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/nvme0n1p2   104857600  62914560  41943040      60% /`;
const parsedSpace = parseDfSpaceOutput(dfSpaceSample);
check('parseDfSpaceOutput parses GB metrics accurately',
  parsedSpace && parsedSpace.totalGb === 100 && parsedSpace.usedPercent === 60
);

// 2c. Thermal sysfs reader with synthetic thermal_zone + hwmon fixtures
const tmpSysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-thermal-test-'));
try {
  const tzDir = path.join(tmpSysDir, 'thermal', 'thermal_zone0');
  const hwDir = path.join(tmpSysDir, 'hwmon', 'hwmon0');
  fs.mkdirSync(tzDir, { recursive: true });
  fs.mkdirSync(hwDir, { recursive: true });
  fs.writeFileSync(path.join(tzDir, 'type'), 'x86_pkg_temp\n');
  fs.writeFileSync(path.join(tzDir, 'temp'), '82500\n');
  fs.writeFileSync(path.join(hwDir, 'name'), 'nvme\n');
  fs.writeFileSync(path.join(hwDir, 'temp1_label'), 'Composite\n');
  fs.writeFileSync(path.join(hwDir, 'temp1_input'), '56000\n');

  const thermal = readLinuxThermalSensors(path.join(tmpSysDir, 'thermal'), path.join(tmpSysDir, 'hwmon'));
  check('readLinuxThermalSensors reads thermal_zone & hwmon temperatures in Celsius',
    thermal.sensorSource === 'sysfs' && thermal.cpuCelsius === 82.5 && thermal.maxCelsius === 82.5 && thermal.sensors.length === 2
  );
} finally {
  fs.rmSync(tmpSysDir, { recursive: true, force: true });
}

// 2d. Threshold evaluator triggers automatic notifications on breach
const breachedSample = {
  timestamp: new Date().toISOString(),
  timeLabel: '12:00:00',
  diskIo: ioMetrics, // 300 MB/s -> critical (>= 300)
  inodes: parsedInodes, // 85% -> warning (>= 80)
  diskSpace: parsedSpace, // 60% -> normal
  temperature: {
    cpuCelsius: 88.5,
    maxCelsius: 88.5, // critical (>= 85)
    sensors: [{ id: 'tz0', name: 'x86_pkg_temp', label: 'CPU', celsius: 88.5, source: 'thermal_zone' }],
    sensorSource: 'sysfs'
  }
};
const alerts = evaluateHardwareThresholds(breachedSample, DEFAULT_HARDWARE_THRESHOLDS, 'srv_1', 'Survival SMP');
check('Threshold evaluation fires critical alerts for Disk-IO & Temp and warning for Inodes',
  alerts.length === 3 &&
  alerts.some(a => a.metric === 'disk_io' && a.severity === 'critical') &&
  alerts.some(a => a.metric === 'inodes' && a.severity === 'warning') &&
  alerts.some(a => a.metric === 'temperature' && a.severity === 'critical')
);

// 2e. Express REST routes for Hardware-Health (GET, PUT thresholds -> auto-alert, POST ack)
const tmpHwRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-hw-api-test-'));
const hwDataDir = path.join(tmpHwRoot, 'servers');
const hwStateDir = path.join(tmpHwRoot, 'manager');
fs.mkdirSync(path.join(hwDataDir, 'srv_hw1'), { recursive: true });
fs.mkdirSync(hwStateDir, { recursive: true });
let hwCtrl = null;
try {
  const routes = {};
  const mockApp = {
    get: (p, h) => { routes['GET ' + p] = h; },
    put: (p, h) => { routes['PUT ' + p] = h; },
    post: (p, h) => { routes['POST ' + p] = h; }
  };
  const logEntries = [];
  const webhookCalls = [];
  hwCtrl = configureHardwareHealth(mockApp, {
    auth: { getSessionUser: () => ({ id: 'u1', username: 'admin', role: 'admin' }) },
    dataDir: hwDataDir,
    managerStateDir: hwStateDir,
    getServerRegistry: () => [{ id: 'srv_hw1', name: 'Test Hardware Server' }],
    canUserAccessServer: () => true,
    appendLog: (sid, lvl, msg) => logEntries.push({ sid, lvl, msg }),
    recordAuditLog: () => {},
    dispatchWebhookEvent: (sid, key, title) => webhookCalls.push({ sid, key, title })
  });

  check('GET /api/servers/:id/hardware-health registered', Boolean(routes['GET /api/servers/:id/hardware-health']));
  check('PUT /api/servers/:id/hardware-health/thresholds registered', Boolean(routes['PUT /api/servers/:id/hardware-health/thresholds']));
  check('POST /api/servers/:id/hardware-health/notifications/:alertId/ack registered', Boolean(routes['POST /api/servers/:id/hardware-health/notifications/:alertId/ack']));

  let payload = null;
  const mockRes = { json: (d) => { payload = d; return mockRes; }, status: () => mockRes };

  routes['GET /api/servers/:id/hardware-health']({ params: { id: 'srv_hw1' } }, mockRes);
  check('GET hardware-health returns live diskIo, inodes, temperature, and thresholds',
    payload?.success === true && payload.current?.inodes?.total > 0 && payload.current?.temperature?.maxCelsius > 0
  );

  // Lower temperature threshold below current temp to force an immediate automatic notification!
  routes['PUT /api/servers/:id/hardware-health/thresholds']({
    params: { id: 'srv_hw1' },
    body: { tempWarnCelsius: 20, tempCritCelsius: 25, notifyOnWarning: true, notifyOnCritical: true }
  }, mockRes);
  check('PUT thresholds triggers immediate automatic critical notification when breached',
    payload?.success === true &&
    payload.unacknowledgedCount >= 1 &&
    payload.notifications.some(n => n.metric === 'temperature' && n.severity === 'critical' && !n.acknowledged)
  );
  check('Breach automatically logs warning/error to server console and triggers webhook',
    logEntries.some(l => l.msg.includes('[Hardware-Health]')) && webhookCalls.length >= 1
  );

  // Acknowledge notification
  const firstAlertId = payload.notifications[0].id;
  routes['POST /api/servers/:id/hardware-health/notifications/:alertId/ack']({
    params: { id: 'srv_hw1', alertId: firstAlertId }
  }, mockRes);
  check('POST notification ack marks notification acknowledged',
    payload?.success === true && payload.alert?.acknowledged === true
  );
} finally {
  hwCtrl?.stopMonitor?.();
  fs.rmSync(tmpHwRoot, { recursive: true, force: true });
}

// =========================================================================
// PART 3: Frontend & Server Wiring Verification
// =========================================================================
const centralModHubSrc = fs.readFileSync('src/components/CentralModHub.tsx', 'utf8');
check('CentralModHub queries /api/mods/index/facets', centralModHubSrc.includes('/api/mods/index/facets'));
check('CentralModHub queries /api/mods/index/search', centralModHubSrc.includes('/api/mods/index/search'));
check('CentralModHub supports tag filtering and MC compatibility modes',
  centralModHubSrc.includes('toggleTagFilter') &&
  centralModHubSrc.includes('compatibilityMode') &&
  centralModHubSrc.includes('Zielserver-Version übernehmen')
);

const serverDetailSrc = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
check('ServerDetail imports and renders HardwareHealthView',
  serverDetailSrc.includes("import { HardwareHealthView } from './HardwareHealthView'") &&
  serverDetailSrc.includes("activeTab === 'hardware_health'")
);

const hwViewSrc = fs.readFileSync('src/components/HardwareHealthView.tsx', 'utf8');
check('HardwareHealthView visualizes Disk-IO, Inode-Limit, Temperature and triggers onNotify',
  hwViewSrc.includes('Disk-IO Durchsatz') &&
  hwViewSrc.includes('Inode-Limit') &&
  hwViewSrc.includes('Hardware-Temperatur') &&
  hwViewSrc.includes('onNotify')
);

const serverSrc = fs.readFileSync('server.ts', 'utf8');
check('server.ts mounts configureModIndex and configureHardwareHealth',
  serverSrc.includes('configureModIndex(app') && serverSrc.includes('configureHardwareHealth(app')
);

console.log(`${checks.length} Mod-Index & Hardware-Health regression checks passed.`);
fs.writeFileSync('audit/mod-index-hardware-health-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
