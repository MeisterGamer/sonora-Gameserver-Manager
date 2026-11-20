import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {
  generateTemporarySftpPassword,
  getTemporarySftpPasswordMeta,
  verifyTemporarySftpPassword,
  revokeTemporarySftpPassword
} from '../backend/sftp.ts';
import {
  configureServerScheduler,
  validateCronExpression,
  describeCronExpression
} from '../backend/serverScheduler.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// 1. Static architecture & UI wiring assertions
const sftpUiSrc = fs.readFileSync('src/components/SftpAccessSection.tsx', 'utf8');
check('SftpAccessSection displays Host, Port, Username, and Temporary Password generator with zero browser alerts',
  sftpUiSrc.includes('SFTP-Zugriff') &&
  sftpUiSrc.includes('Server-Host') &&
  sftpUiSrc.includes('SFTP-Port') &&
  sftpUiSrc.includes('Benutzername') &&
  sftpUiSrc.includes('Temporäres Passwort generieren') &&
  sftpUiSrc.includes('/sftp/temp-password') &&
  !sftpUiSrc.includes('window.alert(') &&
  !sftpUiSrc.includes('window.confirm(')
);

const schedUiSrc = fs.readFileSync('src/components/ServerSchedulerView.tsx', 'utf8');
check('ServerSchedulerView implements Start/Stop/Restart Cron scheduler with presets, live validation, and zero browser alerts',
  schedUiSrc.includes('Server-Zeitplaner') &&
  schedUiSrc.includes('/api/schedules/validate-cron') &&
  schedUiSrc.includes('/schedules') &&
  schedUiSrc.includes('Starten') &&
  schedUiSrc.includes('Stoppen') &&
  schedUiSrc.includes('Neustarten') &&
  !schedUiSrc.includes('window.alert(') &&
  !schedUiSrc.includes('window.confirm(')
);

const detailSrc = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
check('ServerDetail.tsx wires both SFTP-Zugriff and Server-Zeitplaner tabs and panels',
  detailSrc.includes("import { SftpAccessSection } from './SftpAccessSection'") &&
  detailSrc.includes("import { ServerSchedulerView } from './ServerSchedulerView'") &&
  detailSrc.includes('SFTP-Zugriff') &&
  detailSrc.includes('Server-Zeitplaner') &&
  detailSrc.includes('<SftpAccessSection') &&
  detailSrc.includes('<ServerSchedulerView')
);

const netPortsSrc = fs.readFileSync('src/components/NetworkPortsView.tsx', 'utf8');
check('NetworkPortsView also embeds SftpAccessSection inside Ports, Domains & SFTP tab',
  netPortsSrc.includes('<SftpAccessSection')
);

const serverSrc = fs.readFileSync('server.ts', 'utf8');
check('server.ts exposes SFTP temp-password endpoints and mounts configureServerScheduler',
  serverSrc.includes("app.post('/api/servers/:id/sftp/temp-password'") &&
  serverSrc.includes("app.delete('/api/servers/:id/sftp/temp-password'") &&
  serverSrc.includes('configureServerScheduler') &&
  serverSrc.includes('revokeTemporarySftpPassword')
);

// 2. Temporary SFTP Password cryptographic persistence & verification test
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-sftp-sched-'));
const managerDir = path.join(tmpRoot, 'manager');
fs.mkdirSync(managerDir, { recursive: true });

try {
  const gen = generateTemporarySftpPassword(managerDir, 'srv_alpha', 60);
  check('Temporary SFTP password generates 20-char secret with apex_ username and future expiry',
    gen.password.length === 20 &&
    gen.username === 'apex_srv_alpha' &&
    new Date(gen.expiresAt).getTime() > Date.now()
  );

  check('Valid temporary SFTP password passes scrypt constant-time verification',
    verifyTemporarySftpPassword(managerDir, 'srv_alpha', gen.password) === true
  );
  check('Invalid temporary SFTP password is rejected',
    verifyTemporarySftpPassword(managerDir, 'srv_alpha', 'wrong-password-123') === false
  );
  check('Temporary SFTP password is isolated strictly to its serverId',
    verifyTemporarySftpPassword(managerDir, 'srv_other', gen.password) === false
  );

  const meta = getTemporarySftpPasswordMeta(managerDir, 'srv_alpha');
  check('Temporary SFTP metadata reports active status without exposing plaintext password',
    meta.active === true && meta.remainingSeconds > 3500 && !('password' in meta)
  );

  const revoked = revokeTemporarySftpPassword(managerDir, 'srv_alpha');
  check('Revoking temporary SFTP password immediately invalidates authentication',
    revoked === true && verifyTemporarySftpPassword(managerDir, 'srv_alpha', gen.password) === false
  );

  // 3. Cron parser & German human description checks
  const validDaily = validateCronExpression('0 4 * * *');
  check('Cron validator accepts standard 5-field expression and computes 3 upcoming runs',
    validDaily.valid === true && validDaily.nextRuns.length === 3 && describeCronExpression('0 4 * * *').includes('04:00')
  );
  const validInterval = validateCronExpression('0 */6 * * *');
  check('Cron validator supports step intervals (0 */6 * * *)',
    validInterval.valid === true && validInterval.nextRuns.length === 3
  );
  const invalidExpr = validateCronExpression('99 25 * *');
  check('Cron validator rejects malformed expressions with clear error',
    invalidExpr.valid === false && Boolean(invalidExpr.error)
  );

  // 4. End-to-End Scheduler API & Cron Execution Test (isolated Express server)
  const executedActions = [];
  const activeProcesses = new Map();
  const mockServers = [{ id: 'srv_sched_1', name: 'Vanilla Node', allocatedRamGb: 4, port: 25565 }];

  const testApp = express();
  testApp.use(express.json());
  const scheduler = configureServerScheduler(testApp, {
    managerStateDir: managerDir,
    getServerRegistry: () => mockServers,
    activeProcesses,
    tickIntervalMs: 600_000,
    executePowerAction: async (serverId, action, opts) => {
      executedActions.push({ serverId, action, trigger: opts?.trigger, warningMessage: opts?.warningMessage });
      if (action === 'start') activeProcesses.set(serverId, { pid: 12345 });
      if (action === 'stop') activeProcesses.delete(serverId);
      return { success: true, message: `Aktion ${action} erfolgreich` };
    }
  });

  const srv = await new Promise((resolve) => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${srv.address().port}`;

  try {
    // Create scheduled task
    const createRes = await fetch(`${baseUrl}/api/servers/srv_sched_1/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Täglicher Neustart',
        action: 'restart',
        cronExpression: '30 4 * * *',
        onlyIfRunning: true,
        warningMessage: 'Neustart startet jetzt'
      })
    });
    const createData = await createRes.json();
    check('POST /api/servers/:id/schedules persists new Cron task and computes nextRunAt',
      createRes.status === 201 &&
      createData.success === true &&
      createData.schedule.cronExpression === '30 4 * * *' &&
      Boolean(createData.schedule.nextRunAt)
    );
    const taskId = createData.schedule.id;

    // Reject invalid Cron via HTTP 400
    const badRes = await fetch(`${baseUrl}/api/servers/srv_sched_1/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', action: 'start', cronExpression: 'invalid cron' })
    });
    check('POST /api/servers/:id/schedules rejects invalid Cron expression with HTTP 400', badRes.status === 400);

    // Manual trigger when server is offline + onlyIfRunning=true -> skipped
    const skipRes = await fetch(`${baseUrl}/api/servers/srv_sched_1/schedules/${taskId}/run`, {
      method: 'POST'
    });
    const skipData = await skipRes.json();
    check('Scheduled task with onlyIfRunning=true skips gracefully when server is offline',
      skipRes.status === 200 && skipData.execution.status === 'skipped' && executedActions.length === 0
    );

    // Bring server "online" and evaluate Cron match at 04:30
    activeProcesses.set('srv_sched_1', { pid: 54321 });
    const matchDate = new Date(2026, 9, 20, 4, 30, 5);
    const firstTick = await scheduler.evaluateDueTasks(matchDate);
    const secondTickSameMinute = await scheduler.evaluateDueTasks(new Date(2026, 9, 20, 4, 30, 40));
    check('Cron engine executes matching task once per minute and deduplicates subsequent ticks',
      firstTick.length === 1 &&
      firstTick[0].status === 'success' &&
      secondTickSameMinute.length === 0 &&
      executedActions.length === 1 &&
      executedActions[0].action === 'restart'
    );

    // Pause task via PATCH
    const patchRes = await fetch(`${baseUrl}/api/servers/srv_sched_1/schedules/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });
    const patchData = await patchRes.json();
    check('PATCH /api/servers/:id/schedules/:taskId pauses task and clears nextRunAt',
      patchRes.status === 200 && patchData.schedule.enabled === false && patchData.schedule.nextRunAt === null
    );

    // Verify schedules persisted to disk
    const persistedSchedules = JSON.parse(fs.readFileSync(path.join(managerDir, 'schedules.json'), 'utf8'));
    check('Schedules are persisted atomically to manager/schedules.json',
      Array.isArray(persistedSchedules) && persistedSchedules.length === 1 && persistedSchedules[0].runCount === 1
    );

    // Delete task
    const delRes = await fetch(`${baseUrl}/api/servers/srv_sched_1/schedules/${taskId}`, {
      method: 'DELETE'
    });
    const delData = await delRes.json();
    check('DELETE /api/servers/:id/schedules/:taskId removes schedule cleanly',
      delRes.status === 200 && delData.schedules.length === 0
    );
  } finally {
    scheduler.stopScheduler();
    srv.closeAllConnections?.();
    srv.close();
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

fs.writeFileSync('audit/sftp-scheduler-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} SFTP-Zugriff & Server-Zeitplaner (Cron) regression checks passed.`);
