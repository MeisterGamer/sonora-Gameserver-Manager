import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { AuthController } from './auth.ts';

export type ScheduledPowerAction = 'start' | 'stop' | 'restart';

export interface ScheduledTaskRecord {
  id: string;
  serverId: string;
  name: string;
  action: ScheduledPowerAction;
  cronExpression: string;
  enabled: boolean;
  onlyIfRunning: boolean;
  warningMessage: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastRunAt: string | null;
  lastRunStatus: 'idle' | 'success' | 'skipped' | 'error';
  lastRunMessage: string | null;
  runCount: number;
}

export interface ScheduleExecutionLog {
  id: string;
  taskId: string;
  serverId: string;
  taskName: string;
  action: ScheduledPowerAction;
  trigger: 'cron' | 'manual';
  executedAt: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
}

export interface ParsedCronExpression {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domWildcard: boolean;
  dowWildcard: boolean;
}

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
  humanSchedule?: string;
  nextRuns: string[];
}

export interface ServerSchedulerDeps {
  auth?: AuthController;
  managerStateDir: string;
  getServerRegistry: () => any[];
  activeProcesses: Map<string, any>;
  executePowerAction: (
    serverId: string,
    action: ScheduledPowerAction,
    options?: { warningMessage?: string; trigger?: 'cron' | 'manual'; taskName?: string }
  ) => Promise<{ success: boolean; message: string; skipped?: boolean }>;
  canUserAccessServer?: (user: any, server: any) => boolean;
  recordAuditLog?: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'security' | 'success';
  }) => void;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  tickIntervalMs?: number;
}

export interface ServerSchedulerController {
  listServerSchedules: (serverId: string) => ScheduledTaskRecord[];
  runTaskById: (serverId: string, taskId: string, trigger?: 'cron' | 'manual') => Promise<ScheduleExecutionLog>;
  evaluateDueTasks: (now?: Date) => Promise<ScheduleExecutionLog[]>;
  cleanupServerSchedules: (serverId: string) => void;
  stopScheduler: () => void;
}

const WEEKDAY_NAMES_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function parseCronField(
  field: string,
  min: number,
  max: number,
  normalizeDow = false
): { values: Set<number>; error?: string } {
  const values = new Set<number>();
  const trimmed = field.trim();
  if (!trimmed) {
    return { values, error: 'Leeres Cron-Feld.' };
  }

  const parts = trimmed.split(',');
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) return { values, error: `Ungültiges Segment in "${field}".` };

    const [rangePart, stepPart, extra] = seg.split('/');
    if (extra !== undefined) {
      return { values, error: `Zu viele "/" in "${seg}".` };
    }

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) {
        return { values, error: `Ungültige Schrittweite "${stepPart}" in "${seg}".` };
      }
      step = parseInt(stepPart, 10);
      if (step <= 0 || step > max - min + 1) {
        return { values, error: `Schrittweite "${step}" außerhalb des gültigen Bereichs.` };
      }
    }

    let start = min;
    let end = max;

    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [sStr, eStr, extraDash] = rangePart.split('-');
      if (extraDash !== undefined || !/^\d+$/.test(sStr) || !/^\d+$/.test(eStr)) {
        return { values, error: `Ungültiger Bereich "${rangePart}".` };
      }
      start = parseInt(sStr, 10);
      end = parseInt(eStr, 10);
      if (start < min || end > max || start > end) {
        return { values, error: `Bereich "${rangePart}" liegt außerhalb von ${min}–${max}.` };
      }
    } else {
      if (!/^\d+$/.test(rangePart)) {
        return { values, error: `Ungültiger Wert "${rangePart}" (erwartet ${min}–${max}).` };
      }
      start = parseInt(rangePart, 10);
      end = stepPart !== undefined ? max : start;
      if (start < min || start > max) {
        return { values, error: `Wert "${start}" liegt außerhalb von ${min}–${max}.` };
      }
    }

    for (let v = start; v <= end; v += step) {
      values.add(normalizeDow && v === 7 ? 0 : v);
    }
  }

  if (values.size === 0) {
    return { values, error: `Keine gültigen Werte in "${field}".` };
  }

  return { values };
}

export function parseCronExpression(expression: string): { parsed?: ParsedCronExpression; error?: string; normalized?: string } {
  const normalized = String(expression || '').trim().replace(/\s+/g, ' ');
  const fields = normalized.split(' ');
  if (fields.length !== 5) {
    return { error: 'Ein Cron-Ausdruck benötigt genau 5 Felder: Minute Stunde Tag Monat Wochentag (z. B. "0 4 * * *").' };
  }

  const [minF, hourF, domF, monF, dowF] = fields;
  const minRes = parseCronField(minF, 0, 59);
  if (minRes.error) return { error: `Minute: ${minRes.error}` };
  const hourRes = parseCronField(hourF, 0, 23);
  if (hourRes.error) return { error: `Stunde: ${hourRes.error}` };
  const domRes = parseCronField(domF, 1, 31);
  if (domRes.error) return { error: `Tag des Monats: ${domRes.error}` };
  const monRes = parseCronField(monF, 1, 12);
  if (monRes.error) return { error: `Monat: ${monRes.error}` };
  const dowRes = parseCronField(dowF, 0, 7, true);
  if (dowRes.error) return { error: `Wochentag: ${dowRes.error}` };

  return {
    normalized,
    parsed: {
      minutes: minRes.values,
      hours: hourRes.values,
      daysOfMonth: domRes.values,
      months: monRes.values,
      daysOfWeek: dowRes.values,
      domWildcard: domF === '*',
      dowWildcard: dowF === '*'
    }
  };
}

export function matchesCronDate(parsed: ParsedCronExpression, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay(); // 0=Sunday .. 6=Saturday

  if (!parsed.minutes.has(minute)) return false;
  if (!parsed.hours.has(hour)) return false;
  if (!parsed.months.has(month)) return false;

  const domMatch = parsed.daysOfMonth.has(dom);
  const dowMatch = parsed.daysOfWeek.has(dow);

  // Standard Vixie Cron semantics: if both DOM and DOW are restricted, either matching triggers
  if (!parsed.domWildcard && !parsed.dowWildcard) {
    return domMatch || dowMatch;
  }
  return domMatch && dowMatch;
}

export function getNextCronRuns(expression: string, count = 3, fromDate = new Date()): string[] {
  const { parsed } = parseCronExpression(expression);
  if (!parsed) return [];

  const results: string[] = [];
  const cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Scan up to 366 days (max 527,040 minutes), skipping non-matching months/days/hours rapidly
  const maxTime = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  let guard = 0;

  while (results.length < count && cursor.getTime() <= maxTime && guard < 600_000) {
    guard++;

    if (!parsed.months.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const domMatch = parsed.daysOfMonth.has(cursor.getDate());
    const dowMatch = parsed.daysOfWeek.has(cursor.getDay());
    const dayValid = !parsed.domWildcard && !parsed.dowWildcard ? (domMatch || dowMatch) : (domMatch && dowMatch);
    if (!dayValid) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (parsed.minutes.has(cursor.getMinutes())) {
      results.push(cursor.toISOString());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return results;
}

export function describeCronExpression(expression: string): string {
  const normalized = String(expression || '').trim().replace(/\s+/g, ' ');
  const parts = normalized.split(' ');
  if (parts.length !== 5) return normalized;

  const [min, hour, dom, mon, dow] = parts;
  const pad2 = (v: string) => v.padStart(2, '0');

  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Alle ${min.slice(2)} Minuten`;
  }
  if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Stündlich zur Minute :${pad2(min)}`;
  }
  if (/^\d+$/.test(min) && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    return `Alle ${hour.slice(2)} Stunden (:${pad2(min)})`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*') {
    const timeStr = `${pad2(hour)}:${pad2(min)} Uhr`;
    if (dow === '*') return `Täglich um ${timeStr}`;
    if (dow === '1-5') return `Montag bis Freitag um ${timeStr}`;
    if (dow === '0,6' || dow === '6,0' || dow === '6-7') return `Am Wochenende um ${timeStr}`;
    if (/^\d$/.test(dow)) {
      const idx = Number(dow) === 7 ? 0 : Number(dow);
      return `Jeden ${WEEKDAY_NAMES_DE[idx]} um ${timeStr}`;
    }
    const dayLabels = dow
      .split(',')
      .map(d => {
        const n = Number(d);
        if (Number.isInteger(n) && n >= 0 && n <= 7) return WEEKDAY_SHORT_DE[n === 7 ? 0 : n];
        return d;
      })
      .join(', ');
    return `${dayLabels} um ${timeStr}`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return `Monatlich am ${dom}. um ${pad2(hour)}:${pad2(min)} Uhr`;
  }

  return `Cron: ${normalized}`;
}

export function validateCronExpression(expression: string, fromDate = new Date()): CronValidationResult {
  const res = parseCronExpression(expression);
  if (res.error || !res.normalized) {
    return { valid: false, error: res.error || 'Ungültiger Cron-Ausdruck.', nextRuns: [] };
  }
  return {
    valid: true,
    normalized: res.normalized,
    humanSchedule: describeCronExpression(res.normalized),
    nextRuns: getNextCronRuns(res.normalized, 3, fromDate)
  };
}

function minuteKey(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

export function configureServerScheduler(
  app: Express,
  deps: ServerSchedulerDeps
): ServerSchedulerController {
  const schedulesFile = path.join(deps.managerStateDir, 'schedules.json');
  const historyFile = path.join(deps.managerStateDir, 'schedule-history.json');

  if (!fs.existsSync(deps.managerStateDir)) {
    fs.mkdirSync(deps.managerStateDir, { recursive: true });
  }

  const readJsonArray = <T>(file: string): T[] => {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const writeJsonArray = <T>(file: string, data: T[]) => {
    try {
      if (!fs.existsSync(deps.managerStateDir)) {
        fs.mkdirSync(deps.managerStateDir, { recursive: true });
      }
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch {}
  };

  let schedules: ScheduledTaskRecord[] = readJsonArray<ScheduledTaskRecord>(schedulesFile);
  let history: ScheduleExecutionLog[] = readJsonArray<ScheduleExecutionLog>(historyFile);
  const firedMinuteByTask = new Map<string, string>();
  const runningTaskIds = new Set<string>();

  const persistSchedules = () => writeJsonArray(schedulesFile, schedules);
  const persistHistory = () => writeJsonArray(historyFile, history);

  const enrichTask = (task: ScheduledTaskRecord, now = new Date()) => {
    const nextRuns = task.enabled ? getNextCronRuns(task.cronExpression, 3, now) : [];
    return {
      ...task,
      humanSchedule: describeCronExpression(task.cronExpression),
      nextRunAt: nextRuns[0] || null,
      nextRuns
    };
  };

  const listServerSchedules = (serverId: string) =>
    schedules.filter(s => s.serverId === serverId);

  const runTaskById = async (
    serverId: string,
    taskId: string,
    trigger: 'cron' | 'manual' = 'manual'
  ): Promise<ScheduleExecutionLog> => {
    const task = schedules.find(s => s.id === taskId && s.serverId === serverId);
    if (!task) {
      throw new Error('Zeitplan-Aufgabe nicht gefunden.');
    }

    const nowIso = new Date().toISOString();
    const isRunning = deps.activeProcesses.has(serverId);

    if (task.onlyIfRunning && !isRunning && (task.action === 'stop' || task.action === 'restart')) {
      const entry: ScheduleExecutionLog = {
        id: `srun_${crypto.randomBytes(4).toString('hex')}`,
        taskId: task.id,
        serverId,
        taskName: task.name,
        action: task.action,
        trigger,
        executedAt: nowIso,
        status: 'skipped',
        message: 'Übersprungen: Server ist offline (Option „Nur wenn aktiv“ aktiviert).'
      };
      task.lastRunAt = nowIso;
      task.lastRunStatus = 'skipped';
      task.lastRunMessage = entry.message;
      task.updatedAt = nowIso;
      persistSchedules();

      history.unshift(entry);
      if (history.length > 250) history = history.slice(0, 250);
      persistHistory();
      deps.appendLog?.(serverId, 'INFO', `[Zeitplaner] "${task.name}" übersprungen (Server offline).`);
      return entry;
    }

    try {
      const execRes = await deps.executePowerAction(serverId, task.action, {
        warningMessage: task.warningMessage,
        trigger,
        taskName: task.name
      });

      const status: 'success' | 'skipped' | 'error' = execRes.skipped
        ? 'skipped'
        : execRes.success
        ? 'success'
        : 'error';

      const entry: ScheduleExecutionLog = {
        id: `srun_${crypto.randomBytes(4).toString('hex')}`,
        taskId: task.id,
        serverId,
        taskName: task.name,
        action: task.action,
        trigger,
        executedAt: nowIso,
        status,
        message: execRes.message || `Aktion "${task.action}" ausgeführt.`
      };

      task.lastRunAt = nowIso;
      task.lastRunStatus = status;
      task.lastRunMessage = entry.message;
      task.runCount = (task.runCount || 0) + 1;
      task.updatedAt = nowIso;
      persistSchedules();

      history.unshift(entry);
      if (history.length > 250) history = history.slice(0, 250);
      persistHistory();

      deps.appendLog?.(
        serverId,
        status === 'error' ? 'ERROR' : 'SUCCESS',
        `[Zeitplaner] "${task.name}" (${task.action.toUpperCase()}): ${entry.message}`
      );
      deps.recordAuditLog?.({
        serverId,
        action: task.action,
        user: trigger === 'cron' ? 'Server-Zeitplaner (Cron)' : 'Zeitplaner (Manuell)',
        details: `Geplante Aufgabe "${task.name}" (${task.cronExpression}): ${entry.message}`,
        severity: status === 'error' ? 'warning' : 'info'
      });

      return entry;
    } catch (err: any) {
      const entry: ScheduleExecutionLog = {
        id: `srun_${crypto.randomBytes(4).toString('hex')}`,
        taskId: task.id,
        serverId,
        taskName: task.name,
        action: task.action,
        trigger,
        executedAt: nowIso,
        status: 'error',
        message: err.message || 'Ausführung fehlgeschlagen.'
      };
      task.lastRunAt = nowIso;
      task.lastRunStatus = 'error';
      task.lastRunMessage = entry.message;
      task.updatedAt = nowIso;
      persistSchedules();

      history.unshift(entry);
      if (history.length > 250) history = history.slice(0, 250);
      persistHistory();
      deps.appendLog?.(serverId, 'ERROR', `[Zeitplaner] "${task.name}" fehlgeschlagen: ${entry.message}`);
      return entry;
    }
  };

  const evaluateDueTasks = async (now = new Date()): Promise<ScheduleExecutionLog[]> => {
    const mKey = minuteKey(now);
    const executed: ScheduleExecutionLog[] = [];

    for (const task of schedules) {
      if (!task.enabled) continue;
      if (firedMinuteByTask.get(task.id) === mKey) continue;
      if (runningTaskIds.has(task.id)) continue;

      const { parsed } = parseCronExpression(task.cronExpression);
      if (!parsed || !matchesCronDate(parsed, now)) continue;

      firedMinuteByTask.set(task.id, mKey);
      runningTaskIds.add(task.id);
      try {
        const log = await runTaskById(task.serverId, task.id, 'cron');
        executed.push(log);
      } finally {
        runningTaskIds.delete(task.id);
      }
    }

    return executed;
  };

  const cleanupServerSchedules = (serverId: string) => {
    const prevLen = schedules.length;
    schedules = schedules.filter(s => s.serverId !== serverId);
    if (schedules.length !== prevLen) persistSchedules();

    const prevHistLen = history.length;
    history = history.filter(h => h.serverId !== serverId);
    if (history.length !== prevHistLen) persistHistory();
  };

  const checkAccess = (req: Request, res: Response, serverId: string): boolean => {
    if (deps.auth && deps.canUserAccessServer) {
      const reqUser = deps.auth.getSessionUser(req);
      const srv = deps.getServerRegistry().find(s => s.id === serverId);
      if (reqUser && reqUser.role !== 'admin' && srv && !deps.canUserAccessServer(reqUser, srv)) {
        res.status(403).json({ success: false, error: 'Kein Zugriff auf den Zeitplaner dieses Servers.' });
        return false;
      }
    }
    return true;
  };

  // --- VALIDATE CRON EXPRESSION ---
  app.post('/api/schedules/validate-cron', (req: Request, res: Response) => {
    const expr = String(req.body?.cronExpression || '');
    const result = validateCronExpression(expr);
    res.json({ success: true, ...result });
  });

  // --- LIST SERVER SCHEDULES & EXECUTION HISTORY ---
  app.get('/api/servers/:id/schedules', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const now = new Date();
    const serverTasks = listServerSchedules(serverId).map(t => enrichTask(t, now));
    const serverHistory = history.filter(h => h.serverId === serverId).slice(0, 25);

    res.json({
      success: true,
      serverId,
      serverTime: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      schedules: serverTasks,
      history: serverHistory
    });
  });

  // --- CREATE SCHEDULED TASK ---
  app.post('/api/servers/:id/schedules', (req: Request, res: Response) => {
    const serverId = req.params.id;
    if (!checkAccess(req, res, serverId)) return;

    const { name, action, cronExpression, enabled = true, onlyIfRunning = false, warningMessage = '' } = req.body || {};
    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length > 80) {
      return res.status(400).json({ success: false, error: 'Bitte gib einen gültigen Aufgaben-Namen ein (1–80 Zeichen).' });
    }
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Aktion muss "start", "stop" oder "restart" sein.' });
    }

    const cronCheck = validateCronExpression(String(cronExpression || ''));
    if (!cronCheck.valid || !cronCheck.normalized) {
      return res.status(400).json({ success: false, error: cronCheck.error || 'Ungültiger Cron-Ausdruck.' });
    }

    const reqUser = deps.auth?.getSessionUser(req);
    const nowIso = new Date().toISOString();
    const record: ScheduledTaskRecord = {
      id: `sched_${crypto.randomBytes(5).toString('hex')}`,
      serverId,
      name: cleanName,
      action,
      cronExpression: cronCheck.normalized,
      enabled: Boolean(enabled),
      onlyIfRunning: Boolean(onlyIfRunning),
      warningMessage: String(warningMessage || '').trim().slice(0, 180),
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: reqUser?.username || 'Admin',
      lastRunAt: null,
      lastRunStatus: 'idle',
      lastRunMessage: null,
      runCount: 0
    };

    schedules.unshift(record);
    persistSchedules();

    deps.recordAuditLog?.({
      serverId,
      action: 'config',
      user: record.createdBy,
      details: `Zeitplan-Aufgabe "${record.name}" (${record.action}, Cron: ${record.cronExpression}) erstellt.`,
      severity: 'info'
    });

    res.status(201).json({
      success: true,
      schedule: enrichTask(record),
      schedules: listServerSchedules(serverId).map(t => enrichTask(t))
    });
  });

  // --- UPDATE SCHEDULED TASK ---
  app.patch('/api/servers/:id/schedules/:taskId', (req: Request, res: Response) => {
    const { id: serverId, taskId } = req.params;
    if (!checkAccess(req, res, serverId)) return;

    const task = schedules.find(s => s.id === taskId && s.serverId === serverId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Zeitplan-Aufgabe nicht gefunden.' });
    }

    const body = req.body || {};
    if (body.name !== undefined) {
      const cleanName = String(body.name).trim();
      if (!cleanName || cleanName.length > 80) {
        return res.status(400).json({ success: false, error: 'Ungültiger Aufgaben-Name.' });
      }
      task.name = cleanName;
    }
    if (body.action !== undefined) {
      if (!['start', 'stop', 'restart'].includes(body.action)) {
        return res.status(400).json({ success: false, error: 'Ungültige Aktion.' });
      }
      task.action = body.action;
    }
    if (body.cronExpression !== undefined) {
      const cronCheck = validateCronExpression(String(body.cronExpression));
      if (!cronCheck.valid || !cronCheck.normalized) {
        return res.status(400).json({ success: false, error: cronCheck.error || 'Ungültiger Cron-Ausdruck.' });
      }
      task.cronExpression = cronCheck.normalized;
    }
    if (body.enabled !== undefined) task.enabled = Boolean(body.enabled);
    if (body.onlyIfRunning !== undefined) task.onlyIfRunning = Boolean(body.onlyIfRunning);
    if (body.warningMessage !== undefined) task.warningMessage = String(body.warningMessage).trim().slice(0, 180);

    task.updatedAt = new Date().toISOString();
    persistSchedules();

    res.json({
      success: true,
      schedule: enrichTask(task),
      schedules: listServerSchedules(serverId).map(t => enrichTask(t))
    });
  });

  // --- DELETE SCHEDULED TASK ---
  app.delete('/api/servers/:id/schedules/:taskId', (req: Request, res: Response) => {
    const { id: serverId, taskId } = req.params;
    if (!checkAccess(req, res, serverId)) return;

    const idx = schedules.findIndex(s => s.id === taskId && s.serverId === serverId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Zeitplan-Aufgabe nicht gefunden.' });
    }
    const [removed] = schedules.splice(idx, 1);
    persistSchedules();
    firedMinuteByTask.delete(taskId);

    const reqUser = deps.auth?.getSessionUser(req);
    deps.recordAuditLog?.({
      serverId,
      action: 'config',
      user: reqUser?.username || 'Admin',
      details: `Zeitplan-Aufgabe "${removed.name}" (${removed.cronExpression}) gelöscht.`,
      severity: 'warning'
    });

    res.json({
      success: true,
      deletedId: taskId,
      schedules: listServerSchedules(serverId).map(t => enrichTask(t))
    });
  });

  // --- TRIGGER SCHEDULED TASK MANUALLY ---
  app.post('/api/servers/:id/schedules/:taskId/run', async (req: Request, res: Response) => {
    const { id: serverId, taskId } = req.params;
    if (!checkAccess(req, res, serverId)) return;

    try {
      const log = await runTaskById(serverId, taskId, 'manual');
      const task = schedules.find(s => s.id === taskId && s.serverId === serverId);
      res.json({
        success: log.status !== 'error',
        execution: log,
        schedule: task ? enrichTask(task) : null,
        schedules: listServerSchedules(serverId).map(t => enrichTask(t)),
        history: history.filter(h => h.serverId === serverId).slice(0, 25)
      });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  // Background Cron Ticker (checks every 20s, unref'd so Node exits cleanly)
  const tickMs = Math.max(5_000, deps.tickIntervalMs ?? 20_000);
  const ticker = setInterval(() => {
    evaluateDueTasks(new Date()).catch(() => {});
  }, tickMs);
  ticker.unref?.();

  return {
    listServerSchedules,
    runTaskById,
    evaluateDueTasks,
    cleanupServerSchedules,
    stopScheduler: () => clearInterval(ticker)
  };
}
