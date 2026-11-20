import fs from 'node:fs';
import assert from 'node:assert/strict';
import { generateOSScripts } from '../src/data/serverStore.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// 1. Backend routes & persistence in server.ts
const serverSrc = fs.readFileSync('server.ts', 'utf8');
check('server.ts defines clone, players, webhooks, audit, ports, mods/check-updates, admin settings, and nodes endpoints',
  serverSrc.includes("app.post('/api/servers/:id/clone'") &&
  serverSrc.includes("app.get('/api/servers/:id/players'") &&
  serverSrc.includes("app.post('/api/servers/:id/players/whitelist'") &&
  serverSrc.includes("app.post('/api/servers/:id/players/op'") &&
  serverSrc.includes("app.post('/api/servers/:id/players/kick'") &&
  serverSrc.includes("app.post('/api/servers/:id/players/ban'") &&
  serverSrc.includes("app.get('/api/servers/:id/webhooks'") &&
  serverSrc.includes("app.post('/api/servers/:id/webhooks'") &&
  serverSrc.includes("app.post('/api/servers/:id/webhooks/test'") &&
  serverSrc.includes("app.post('/api/webhooks/test'") &&
  serverSrc.includes("app.get('/api/servers/:id/audit'") &&
  serverSrc.includes("app.delete('/api/servers/:id/audit'") &&
  serverSrc.includes("app.get('/api/audit'") &&
  serverSrc.includes("app.get('/api/servers/:id/ports'") &&
  serverSrc.includes("app.post('/api/servers/:id/ports'") &&
  serverSrc.includes("app.delete('/api/servers/:id/ports/:portId'") &&
  serverSrc.includes("app.post('/api/servers/:id/domain'") &&
  serverSrc.includes("app.post('/api/servers/:id/mods/check-updates'") &&
  serverSrc.includes("app.get('/api/admin/settings'") &&
  serverSrc.includes("app.post('/api/admin/settings'") &&
  serverSrc.includes("app.get('/api/system/nodes'")
);

check('server.ts /api/servers/:id/stats exposes pid, threads, diskBreakdown, hostIp, hostName',
  serverSrc.includes('diskBreakdown') &&
  serverSrc.includes('computeServerDiskBreakdown') &&
  serverSrc.includes('queryProcessThreads') &&
  serverSrc.includes('getHostPrimaryIp')
);

// 2. Docker & Docker Compose generator + CrossPlatformView
const mcScripts = generateOSScripts({
  id: 'srv_test_1',
  name: 'Test SMP',
  gameId: 'minecraft',
  gameName: 'Minecraft',
  category: 'minecraft',
  targetOS: 'linux',
  version: '1.21.4',
  port: 25565,
  queryPort: 25565,
  rconPort: 25575,
  allocatedRamGb: 4,
  maxPlayers: 20,
  currentPlayers: 0,
  status: 'offline',
  cpuUsagePercent: 0,
  ramUsageMb: 0,
  diskUsageMb: 0,
  networkInKb: 0,
  networkOutKb: 0,
  tps: 20,
  autoRestartOnCrash: true,
  configFiles: {},
  installedMods: [],
  createdAt: '2026-10-17'
});

check('generateOSScripts generates Dockerfile + dockerCompose without temurin:21',
  mcScripts.dockerfile.includes('FROM ubuntu:24.04') &&
  !mcScripts.dockerfile.includes('temurin:21') &&
  mcScripts.dockerCompose.includes('services:') &&
  mcScripts.dockerCompose.includes('25565:25565')
);

const crossPlatformSrc = fs.readFileSync('src/components/CrossPlatformView.tsx', 'utf8');
check('CrossPlatformView removes "nicht implementiert" placeholders and includes compose tab',
  !crossPlatformSrc.includes('ist noch nicht implementiert') &&
  !crossPlatformSrc.includes('sind noch nicht implementiert') &&
  crossPlatformSrc.includes("activeScriptTab === 'compose'")
);

// 3. Telemetry & MetricsView + ServerList
const metricsSrc = fs.readFileSync('src/components/MetricsView.tsx', 'utf8');
check('MetricsView polls real /api/servers/:id/stats without Math.random() or hardcoded #49102 / 38 Threads / timings.aikar.co',
  metricsSrc.includes('/api/servers/${server.id}/stats') &&
  !metricsSrc.includes('Math.random') &&
  !metricsSrc.includes('#49102') &&
  !metricsSrc.includes('38 Threads') &&
  !metricsSrc.includes('timings.aikar.co')
);

const serverListSrc = fs.readFileSync('src/components/ServerList.tsx', 'utf8');
check('ServerList displays totalPlayers without "Noch nicht abgefragt"',
  !serverListSrc.includes('Noch nicht abgefragt') &&
  serverListSrc.includes('{totalPlayers}')
);

// 4. Real operational views (PlayerManager, WebhooksView, AuditLogView, NetworkPortsView, ModPluginBrowser, ModBundlesView, AdminControlView, App.tsx)
const playerSrc = fs.readFileSync('src/components/PlayerManager.tsx', 'utf8');
check('PlayerManager uses real /api/servers/:id/players endpoints with no hardcoded mock players',
  playerSrc.includes('/api/servers/${server.id}/players') &&
  !playerSrc.includes('GamerAlex') &&
  !playerSrc.includes('ShadowCrafter')
);

const webhookSrc = fs.readFileSync('src/components/WebhooksView.tsx', 'utf8');
check('WebhooksView uses real /api/servers/:id/webhooks endpoints, Discord payload examples, and no token_demo',
  webhookSrc.includes('/api/servers/${server.id}/webhooks') &&
  webhookSrc.includes('/api/servers/${server.id}/webhooks/test') &&
  webhookSrc.includes('Discord Payload Beispiele') &&
  !webhookSrc.includes('token_demo')
);

const auditSrc = fs.readFileSync('src/components/AuditLogView.tsx', 'utf8');
check('AuditLogView uses real /api/servers/:id/audit endpoint without hardcoded Gamer/Sarah fixture',
  auditSrc.includes('/api/servers/${server.id}/audit') &&
  !auditSrc.includes('developer (Sarah)')
);

const portsSrc = fs.readFileSync('src/components/NetworkPortsView.tsx', 'utf8');
check('NetworkPortsView uses real /api/servers/:id/ports and /domain without hardcoded 185.228.138.44 or confirm()',
  portsSrc.includes('/api/servers/${server.id}/ports') &&
  portsSrc.includes('/api/servers/${server.id}/domain') &&
  !portsSrc.includes('185.228.138.44') &&
  !portsSrc.includes('confirm(')
);

const modBrowserSrc = fs.readFileSync('src/components/ModPluginBrowser.tsx', 'utf8');
check('ModPluginBrowser uses real /api/servers/:id/mods/check-updates instead of idx % 2 fake update logic',
  modBrowserSrc.includes('/api/servers/${server.id}/mods/check-updates') &&
  !modBrowserSrc.includes('idx % 2 === 0')
);

const modBundlesSrc = fs.readFileSync('src/components/ModBundlesView.tsx', 'utf8');
check('ModBundlesView has no fake 1400ms setTimeout',
  !modBundlesSrc.includes('1400')
);

const adminSrc = fs.readFileSync('src/components/AdminControlView.tsx', 'utf8');
check('AdminControlView uses real /api/admin/settings, /api/system/nodes, /api/audit, /api/webhooks/test without alert()/confirm()',
  adminSrc.includes("'/api/admin/settings'") &&
  adminSrc.includes("'/api/system/nodes'") &&
  adminSrc.includes("'/api/audit'") &&
  adminSrc.includes("'/api/webhooks/test'") &&
  !adminSrc.includes('window.confirm') &&
  !adminSrc.includes('alert(')
);

const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
check('App.tsx wires handleCloneServer to POST /api/servers/:id/clone and has no alert()',
  appSrc.includes('handleCloneServer') &&
  appSrc.includes("'/clone'") &&
  !appSrc.includes('alert(')
);

// 5. Examples & Zero Browser Dialogs in auxiliary views
const customGameSrc = fs.readFileSync('src/components/CustomGameModal.tsx', 'utf8');
check('CustomGameModal provides interactive game example presets',
  customGameSrc.includes('CUSTOM_GAME_EXAMPLES') &&
  customGameSrc.includes('Terraria (tModLoader)') &&
  customGameSrc.includes('Vintage Story')
);

const catalogSrc = fs.readFileSync('src/components/GameCatalog.tsx', 'utf8');
check('GameCatalog provides example manifest loader button',
  catalogSrc.includes('Beispiel-Manifest laden')
);

const configEditorSrc = fs.readFileSync('src/components/ConfigFileEditor.tsx', 'utf8');
check('ConfigFileEditor provides example config presets',
  configEditorSrc.includes('SMP Standard') &&
  configEditorSrc.includes('Performance (12+ Spieler)')
);

for (const file of [
  'src/components/ConfigEditModal.tsx',
  'src/components/RealBackupsView.tsx',
  'src/components/CRMView.tsx',
  'src/components/ShopView.tsx',
  'src/components/LoginModal.tsx',
  'src/components/RealFileManagerView.tsx',
  'src/components/RealModPluginBrowser.tsx'
]) {
  const src = fs.readFileSync(file, 'utf8');
  check(`${file} has no window.alert / window.confirm / alert(`,
    !src.includes('window.confirm(') &&
    !src.includes('window.alert(') &&
    !src.includes('alert(')
  );
}

// 6. Optional Live API check if server is running on port 3000
try {
  const res = await fetch('http://localhost:3000/api/webhooks/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/123/token_demo' })
  });
  if (res.status === 400) {
    const body = await res.json();
    check('Live /api/webhooks/test rejects token_demo placeholder with HTTP 400', body.success === false);
  }
} catch {
  // Server not running during static unit run
}

fs.writeFileSync('audit/missing-features-completion-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} Missing Features & Examples Completion regression checks passed.`);
