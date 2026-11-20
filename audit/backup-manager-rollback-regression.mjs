import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import { configureBackups } from '../backend/backups.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// 1. Static UI & wiring checks
const detailSrc = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
check('ServerDetail.tsx displays Backup-Manager tab and renders BackupsView',
  detailSrc.includes('Backup-Manager') &&
  detailSrc.includes('<BackupsView server={server} onNotify={onNotify} />')
);

const viewSrc = fs.readFileSync('src/components/RealBackupsView.tsx', 'utf8');
check('RealBackupsView implements Backup-Manager with manual creation, list, search/filter, and 1-click Rollback',
  viewSrc.includes('Backup-Manager') &&
  viewSrc.includes('Manuelles Backup erstellen') &&
  viewSrc.includes('handleOneClickRollback') &&
  viewSrc.includes('Rollback') &&
  viewSrc.includes('createSafetySnapshot') &&
  !viewSrc.includes('window.alert(') &&
  !viewSrc.includes('window.confirm(')
);

const backendSrc = fs.readFileSync('backend/backups.ts', 'utf8');
check('backend/backups.ts supports /rollback alias, pre-rollback safety snapshot, and autoStop',
  backendSrc.includes('/api/servers/:id/backups/:backupId/rollback') &&
  backendSrc.includes('pre_rollback') &&
  backendSrc.includes('createSafetyBackup') &&
  backendSrc.includes('autoStop')
);

// 2. End-to-End Live Rollback & Safety Snapshot Verification
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-bk-rollback-'));
const serversDir = path.join(tmpRoot, 'servers');
const stateDir = path.join(tmpRoot, 'state');
const srvId = 'srv_rollback_test';
const srvDataDir = path.join(serversDir, srvId);
fs.mkdirSync(srvDataDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const registry = {
  [srvId]: {
    id: srvId,
    name: 'Rollback Test Server',
    version: '1.21.4',
    minecraftType: 'paper',
    installedMods: ['EssentialsX']
  }
};

let simulatedRunning = false;
let stopHookCalled = false;

const testApp = express();
testApp.use(express.json());
configureBackups(
  testApp,
  serversDir,
  stateDir,
  (id) => {
    if (!registry[id]) throw new Error('Server nicht gefunden');
    return registry[id];
  },
  async (_id, fn) => fn(),
  () => {
    if (simulatedRunning) throw new Error('Server muss gestoppt sein');
  },
  () => {},
  {
    isServerRunning: () => simulatedRunning,
    stopServer: async () => {
      stopHookCalled = true;
      simulatedRunning = false;
    }
  }
);

const srv = await new Promise((resolve) => {
  const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
});
const baseUrl = `http://127.0.0.1:${srv.address().port}`;

try {
  // Write State v1
  fs.writeFileSync(path.join(srvDataDir, 'server.properties'), 'motd=State-V1\nmax-players=20\n', 'utf8');
  fs.writeFileSync(path.join(srvDataDir, 'world-marker.txt'), 'WORLD_V1', 'utf8');

  // Step A: Create manual backup of v1
  const createRes = await fetch(`${baseUrl}/api/servers/${srvId}/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allowRunning: true,
      label: 'Vor Update v1',
      notes: 'Stabiler Ausgangszustand'
    })
  });
  const createData = await createRes.json();
  check('POST /backups creates manual backup with custom label, notes, fileCount, and SHA-256',
    createRes.status === 200 &&
    createData.success === true &&
    createData.backup.label === 'Vor Update v1' &&
    createData.backup.notes === 'Stabiler Ausgangszustand' &&
    createData.backup.fileCount === 2 &&
    createData.backup.sha256.length === 64
  );
  const v1BackupId = createData.backup.id;

  // Step B: Mutate server files to State v2 & mark server running
  fs.writeFileSync(path.join(srvDataDir, 'server.properties'), 'motd=BROKEN-V2\nmax-players=5\n', 'utf8');
  fs.writeFileSync(path.join(srvDataDir, 'corrupted.tmp'), 'BAD_FILE', 'utf8');
  simulatedRunning = true;

  // Step C: List backups
  const listRes = await fetch(`${baseUrl}/api/servers/${srvId}/backups`);
  const listData = await listRes.json();
  check('GET /backups lists existing archives with totalSizeMb',
    listRes.status === 200 && listData.backups.length === 1 && typeof listData.totalSizeMb === 'number'
  );

  // Step D: One-click Rollback while running (with autoStop + createSafetyBackup)
  const rollbackRes = await fetch(`${baseUrl}/api/servers/${srvId}/backups/${v1BackupId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoStop: true, createSafetyBackup: true })
  });
  const rollbackData = await rollbackRes.json();
  check('POST /rollback stops running server, creates pre_rollback safety snapshot, and restores archive',
    rollbackRes.status === 200 &&
    rollbackData.success === true &&
    stopHookCalled === true &&
    simulatedRunning === false &&
    rollbackData.safetyBackup?.type === 'pre_rollback' &&
    rollbackData.backups.length === 2
  );

  const restoredProps = fs.readFileSync(path.join(srvDataDir, 'server.properties'), 'utf8');
  const badFileExists = fs.existsSync(path.join(srvDataDir, 'corrupted.tmp'));
  check('Rollback atomically restores State v1 files and removes v2 artifacts',
    restoredProps.includes('motd=State-V1') && !badFileExists
  );

  // Step E: Roll forward / undo rollback using the auto-generated safety snapshot
  const safetyId = rollbackData.safetyBackup.id;
  const undoRes = await fetch(`${baseUrl}/api/servers/${srvId}/backups/${safetyId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoStop: true, createSafetyBackup: false })
  });
  check('Pre-rollback safety snapshot can undo a rollback cleanly',
    undoRes.status === 200 &&
    fs.readFileSync(path.join(srvDataDir, 'server.properties'), 'utf8').includes('motd=BROKEN-V2')
  );

  // Step F: Delete safety backup
  const delRes = await fetch(`${baseUrl}/api/servers/${srvId}/backups/${safetyId}`, { method: 'DELETE' });
  const delData = await delRes.json();
  check('DELETE /backups/:backupId removes archive and metadata cleanly',
    delRes.status === 200 && delData.success === true && delData.backups.length === 1
  );
} finally {
  srv.closeAllConnections?.();
  srv.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

fs.writeFileSync('audit/backup-manager-rollback-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} Backup-Manager & 1-Click Rollback regression checks passed.`);
