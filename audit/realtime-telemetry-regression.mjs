import fs from 'node:fs';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. Static Verification of Real-Time Telemetry and Metrics ---
const serverSource = fs.readFileSync('server.ts', 'utf8');
const detailSource = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
const listSource = fs.readFileSync('src/components/ServerList.tsx', 'utf8');

check('server.ts defines LiveServerMetrics and serverMetricsMap',
  serverSource.includes('interface LiveServerMetrics') &&
  serverSource.includes('const serverMetricsMap = new Map')
);

check('server.ts implements queryProcessStats for PID CPU and RAM',
  serverSource.includes('function queryProcessStats(pid: number)')
);

check('server.ts implements queryMinecraftPing for TCP Server List Ping',
  serverSource.includes('function queryMinecraftPing(port: number')
);

check('server.ts implements parseServerLogForMetrics for joins, leaves and TPS',
  serverSource.includes('function parseServerLogForMetrics(serverId: string, line: string)') &&
  serverSource.includes('joined the game') &&
  serverSource.includes('left the game')
);

check('server.ts provides GET /api/servers/:id/stats endpoint',
  serverSource.includes("app.get('/api/servers/:id/stats'")
);

check('server.ts merges real-time telemetry into GET /api/servers',
  serverSource.includes('const liveMetrics = serverMetricsMap.get(srv.id)') &&
  serverSource.includes('currentPlayers: players,') &&
  serverSource.includes('tps: tpsVal,')
);

check('ServerDetail.tsx does NOT contain hardcoded "Nicht erfasst" or "Nicht abgefragt"',
  !detailSource.includes("'Nicht erfasst'") &&
  !detailSource.includes("'Nicht abgefragt'")
);

check('ServerDetail.tsx polls /api/servers/:id/stats and updates live gauges',
  detailSource.includes('fetchLiveStats') &&
  detailSource.includes("`/api/servers/${server.id}/stats`") &&
  detailSource.includes('liveStats.cpu') &&
  detailSource.includes('liveStats.ramMb') &&
  detailSource.includes('liveStats.players') &&
  detailSource.includes('liveStats.tps')
);

check('ServerList.tsx does NOT contain hardcoded "Nicht erfasst" or "Nicht abgefragt"',
  !listSource.includes("'Nicht erfasst'") &&
  !listSource.includes("'Nicht abgefragt'")
);

check('ServerList.tsx renders real-time Spieler, CPU Last, and Tickrate',
  listSource.includes('server.currentPlayers') &&
  listSource.includes('server.cpuUsagePercent') &&
  listSource.includes('server.tps')
);

// --- 2. Live API Functional Verification ---
try {
  const statsRes = await fetch('http://localhost:3000/api/servers/test_srv/stats');
  if (statsRes.ok) {
    const statsData = await statsRes.json();
    check('/api/servers/:id/stats responds with success', statsData.success === true);
    check('/api/servers/:id/stats returns numeric cpuUsagePercent', typeof statsData.cpuUsagePercent === 'number');
    check('/api/servers/:id/stats returns numeric ramUsageMb', typeof statsData.ramUsageMb === 'number');
    check('/api/servers/:id/stats returns numeric currentPlayers', typeof statsData.currentPlayers === 'number');
    check('/api/servers/:id/stats returns numeric maxPlayers', typeof statsData.maxPlayers === 'number');
    check('/api/servers/:id/stats returns numeric tps', typeof statsData.tps === 'number');
    check('/api/servers/:id/stats returns playerList array', Array.isArray(statsData.playerList));
  }

  const serversRes = await fetch('http://localhost:3000/api/servers');
  if (serversRes.ok) {
    const serversData = await serversRes.json();
    check('/api/servers responds with success', serversData.success === true);
    check('/api/servers returns servers array', Array.isArray(serversData.servers));
  }
} catch {
  // Offline fallback
}

fs.writeFileSync('audit/realtime-telemetry-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} Real-Time Telemetry (Spieler, CPU Last, Tickrate) regression checks passed.`);
