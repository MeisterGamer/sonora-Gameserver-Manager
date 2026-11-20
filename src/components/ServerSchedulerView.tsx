import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  X
} from 'lucide-react';
import { ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

type PowerAction = 'start' | 'stop' | 'restart';
type ScheduleBuilderMode = 'daily' | 'interval' | 'weekly' | 'cron';

interface ScheduledTaskItem {
  id: string;
  serverId: string;
  name: string;
  action: PowerAction;
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
  humanSchedule: string;
  nextRunAt: string | null;
  nextRuns: string[];
}

interface ScheduleHistoryEntry {
  id: string;
  taskId: string;
  serverId: string;
  taskName: string;
  action: PowerAction;
  trigger: 'cron' | 'manual';
  executedAt: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
}

interface CronPreviewState {
  valid: boolean;
  error?: string;
  humanSchedule?: string;
  nextRuns: string[];
}

interface ServerSchedulerViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

const PRESETS: { label: string; name: string; action: PowerAction; cron: string; warning?: string }[] = [
  {
    label: 'Täglich 04:00 Neustart',
    name: 'Nächtlicher Neustart',
    action: 'restart',
    cron: '0 4 * * *',
    warning: 'Geplanter Server-Neustart in Kürze — bitte Fortschritt sichern.'
  },
  {
    label: 'Alle 6 Std. Neustart',
    name: 'Regelmäßiger 6h-Neustart',
    action: 'restart',
    cron: '0 */6 * * *',
    warning: 'Automatischer 6-Stunden-Neustart wird eingeleitet.'
  },
  {
    label: 'Mo–Fr 08:00 Start',
    name: 'Werktags-Start',
    action: 'start',
    cron: '0 8 * * 1-5'
  },
  {
    label: 'Täglich 02:00 Stopp',
    name: 'Nacht-Abschaltung',
    action: 'stop',
    cron: '0 2 * * *',
    warning: 'Der Server fährt für die Nachtruhe herunter.'
  },
  {
    label: 'Sonntags 05:00 Neustart',
    name: 'Wöchentliche Wartung',
    action: 'restart',
    cron: '0 5 * * 0',
    warning: 'Wöchentlicher Wartungs-Neustart.'
  }
];

const WEEKDAYS = [
  { value: '1', label: 'Mo' },
  { value: '2', label: 'Di' },
  { value: '3', label: 'Mi' },
  { value: '4', label: 'Do' },
  { value: '5', label: 'Fr' },
  { value: '6', label: 'Sa' },
  { value: '0', label: 'So' }
];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatActionLabel(action: PowerAction): string {
  switch (action) {
    case 'start': return 'Starten';
    case 'stop': return 'Stoppen';
    case 'restart': return 'Neustarten';
  }
}

function getActionTextClass(action: PowerAction): string {
  switch (action) {
    case 'start': return 'text-emerald-400';
    case 'stop': return 'text-rose-400';
    case 'restart': return 'text-amber-400';
  }
}

export const ServerSchedulerView: React.FC<ServerSchedulerViewProps> = ({
  server,
  onNotify
}) => {
  const [schedules, setSchedules] = useState<ScheduledTaskItem[]>([]);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [timezone, setTimezone] = useState<string>('UTC');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit Form state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState<string>('Nächtlicher Neustart');
  const [taskAction, setTaskAction] = useState<PowerAction>('restart');
  const [builderMode, setBuilderMode] = useState<ScheduleBuilderMode>('daily');
  const [dailyTime, setDailyTime] = useState<string>('04:00');
  const [intervalHours, setIntervalHours] = useState<number>(6);
  const [selectedDays, setSelectedDays] = useState<string[]>(['1', '2', '3', '4', '5']);
  const [cronExpression, setCronExpression] = useState<string>('0 4 * * *');
  const [onlyIfRunning, setOnlyIfRunning] = useState<boolean>(true);
  const [warningMessage, setWarningMessage] = useState<string>('Geplanter Neustart — bitte Spielstand sichern.');
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cronPreview, setCronPreview] = useState<CronPreviewState | null>(null);

  // Row states
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadSchedules = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/api/servers/${encodeURIComponent(server.id)}/schedules`);
      if (Array.isArray(data.schedules)) setSchedules(data.schedules);
      if (Array.isArray(data.history)) setHistory(data.history);
      if (data.timezone) setTimezone(data.timezone);
    } catch (err: any) {
      setError(err.message || 'Zeitpläne konnten nicht geladen werden.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    setConfirmDeleteId(null);
    loadSchedules(false);
  }, [loadSchedules]);

  // Live validate Cron expression whenever it changes while form is open
  useEffect(() => {
    if (!isFormOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest('/api/schedules/validate-cron', 'POST', { cronExpression });
        if (!cancelled) {
          setCronPreview({
            valid: Boolean(res.valid),
            error: res.error,
            humanSchedule: res.humanSchedule,
            nextRuns: Array.isArray(res.nextRuns) ? res.nextRuns : []
          });
        }
      } catch {
        if (!cancelled) {
          setCronPreview({ valid: false, error: 'Cron-Prüfung fehlgeschlagen.', nextRuns: [] });
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cronExpression, isFormOpen]);

  // Synchronize visual builder -> Cron expression
  const syncBuilderToCron = (
    mode: ScheduleBuilderMode,
    timeStr: string,
    everyHours: number,
    days: string[]
  ) => {
    const [hRaw, mRaw] = (timeStr || '04:00').split(':');
    const h = Math.min(23, Math.max(0, Number(hRaw) || 0));
    const m = Math.min(59, Math.max(0, Number(mRaw) || 0));

    if (mode === 'daily') {
      setCronExpression(`${m} ${h} * * *`);
    } else if (mode === 'interval') {
      const clampedH = Math.min(23, Math.max(1, Number(everyHours) || 6));
      setCronExpression(`0 */${clampedH} * * *`);
    } else if (mode === 'weekly') {
      const dowStr = days.length > 0 ? days.join(',') : '*';
      setCronExpression(`${m} ${h} * * ${dowStr}`);
    }
  };

  const openCreateForm = () => {
    setEditingTaskId(null);
    setTaskName('Nächtlicher Neustart');
    setTaskAction('restart');
    setBuilderMode('daily');
    setDailyTime('04:00');
    setIntervalHours(6);
    setSelectedDays(['1', '2', '3', '4', '5']);
    setCronExpression('0 4 * * *');
    setOnlyIfRunning(true);
    setWarningMessage('Geplanter Neustart — bitte Spielstand sichern.');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (task: ScheduledTaskItem) => {
    setEditingTaskId(task.id);
    setTaskName(task.name);
    setTaskAction(task.action);
    setBuilderMode('cron');
    setCronExpression(task.cronExpression);
    setOnlyIfRunning(task.onlyIfRunning);
    setWarningMessage(task.warningMessage || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setTaskName(preset.name);
    setTaskAction(preset.action);
    setBuilderMode('cron');
    setCronExpression(preset.cron);
    setWarningMessage(preset.warning || '');
    setOnlyIfRunning(preset.action !== 'start');
  };

  const toggleWeekday = (dayVal: string) => {
    setSelectedDays((prev) => {
      const next = prev.includes(dayVal)
        ? prev.filter((d) => d !== dayVal)
        : [...prev, dayVal];
      syncBuilderToCron('weekly', dailyTime, intervalHours, next);
      return next;
    });
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!taskName.trim()) {
      setFormError('Bitte gib einen Namen für die geplante Aufgabe an.');
      return;
    }
    if (cronPreview && !cronPreview.valid) {
      setFormError(cronPreview.error || 'Bitte gib einen gültigen 5-Felder-Cron-Ausdruck ein.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: taskName.trim(),
        action: taskAction,
        cronExpression: cronExpression.trim(),
        onlyIfRunning: taskAction === 'start' ? false : onlyIfRunning,
        warningMessage: taskAction === 'start' ? '' : warningMessage.trim()
      };

      if (editingTaskId) {
        const res = await apiRequest(
          `/api/servers/${encodeURIComponent(server.id)}/schedules/${encodeURIComponent(editingTaskId)}`,
          'PATCH',
          payload
        );
        if (Array.isArray(res.schedules)) setSchedules(res.schedules);
        onNotify?.(`Zeitplan-Aufgabe „${payload.name}“ aktualisiert.`);
      } else {
        const res = await apiRequest(
          `/api/servers/${encodeURIComponent(server.id)}/schedules`,
          'POST',
          { ...payload, enabled: true }
        );
        if (Array.isArray(res.schedules)) setSchedules(res.schedules);
        onNotify?.(`Neue Aufgabe „${payload.name}“ (${payload.cronExpression}) angelegt.`);
      }
      setIsFormOpen(false);
      setEditingTaskId(null);
    } catch (err: any) {
      setFormError(err.message || 'Aufgabe konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (task: ScheduledTaskItem) => {
    setTogglingTaskId(task.id);
    try {
      const res = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/schedules/${encodeURIComponent(task.id)}`,
        'PATCH',
        { enabled: !task.enabled }
      );
      if (Array.isArray(res.schedules)) setSchedules(res.schedules);
      onNotify?.(`Aufgabe „${task.name}“ ${!task.enabled ? 'aktiviert' : 'pausiert'}.`);
    } catch (err: any) {
      setError(err.message || 'Status konnte nicht geändert werden.');
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleRunNow = async (task: ScheduledTaskItem) => {
    setRunningTaskId(task.id);
    setError(null);
    try {
      const res = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/schedules/${encodeURIComponent(task.id)}/run`,
        'POST'
      );
      if (Array.isArray(res.schedules)) setSchedules(res.schedules);
      if (Array.isArray(res.history)) setHistory(res.history);
      onNotify?.(`Aufgabe „${task.name}“ ausgeführt: ${res.execution?.message || 'Erledigt'}`);
    } catch (err: any) {
      setError(err.message || 'Aufgabe konnte nicht sofort ausgeführt werden.');
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleDeleteTask = async (task: ScheduledTaskItem) => {
    try {
      const res = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/schedules/${encodeURIComponent(task.id)}`,
        'DELETE'
      );
      if (Array.isArray(res.schedules)) setSchedules(res.schedules);
      setConfirmDeleteId(null);
      onNotify?.(`Zeitplan-Aufgabe „${task.name}“ gelöscht.`);
    } catch (err: any) {
      setError(err.message || 'Aufgabe konnte nicht gelöscht werden.');
    }
  };

  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-100 tracking-tight">
              Server-Zeitplaner
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
              <span>Automatisierte Start-, Stopp- und Neustart-Aufgaben per Uhrzeit oder Cron-Ausdruck</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-neutral-300">
                {activeCount} von {schedules.length} aktiv
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-neutral-400">Zeitzone: {timezone}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Neue Aufgabe planen</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-950/35 border border-rose-800/70 rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadSchedules(false)}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer whitespace-nowrap"
          >
            Erneut laden
          </button>
        </div>
      )}

      {/* Create / Edit Task Form */}
      {isFormOpen && (
        <form onSubmit={handleSaveTask} className="bg-neutral-900 border border-emerald-800/60 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-emerald-400" />
              <span>{editingTaskId ? 'Geplante Aufgabe bearbeiten' : 'Neue geplante Aufgabe erstellen'}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingTaskId(null);
              }}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 cursor-pointer"
              title="Formular schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-400">Schnell-Vorlagen</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 hover:text-neutral-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <div role="alert" className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Name & Action */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Aufgabenname
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  maxLength={80}
                  placeholder="z. B. Nächtlicher Wartungs-Neustart"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Auszuführende Server-Aktion
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['start', 'stop', 'restart'] as PowerAction[]).map((act) => {
                    const selected = taskAction === act;
                    return (
                      <button
                        key={act}
                        type="button"
                        onClick={() => setTaskAction(act)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          selected
                            ? act === 'start'
                              ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                              : act === 'stop'
                              ? 'bg-rose-950/70 border-rose-600 text-rose-300'
                              : 'bg-amber-950/70 border-amber-600 text-amber-300'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {act === 'start' && <Play className="w-3.5 h-3.5" />}
                        {act === 'stop' && <Square className="w-3.5 h-3.5" />}
                        {act === 'restart' && <RotateCw className="w-3.5 h-3.5" />}
                        <span>{formatActionLabel(act)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {taskAction !== 'start' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Vorab-Nachricht im Spiel-Chat (optional)
                    </label>
                    <input
                      type="text"
                      value={warningMessage}
                      onChange={(e) => setWarningMessage(e.target.value)}
                      maxLength={180}
                      placeholder="z. B. Geplanter Neustart in Kürze..."
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyIfRunning}
                      onChange={(e) => setOnlyIfRunning(e.target.checked)}
                      className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
                    />
                    <span>Nur ausführen, wenn der Server gerade online ist</span>
                  </label>
                </div>
              )}
            </div>

            {/* Schedule Timing & Cron Expression */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Zeitplan-Modus
                </label>
                <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
                  {([
                    { key: 'daily', label: 'Täglich' },
                    { key: 'interval', label: 'Intervall' },
                    { key: 'weekly', label: 'Wochentage' },
                    { key: 'cron', label: 'Cron (5 Felder)' }
                  ] as { key: ScheduleBuilderMode; label: string }[]).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setBuilderMode(m.key);
                        if (m.key !== 'cron') {
                          syncBuilderToCron(m.key, dailyTime, intervalHours, selectedDays);
                        }
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        builderMode === m.key
                          ? 'bg-neutral-800 text-neutral-100 font-semibold'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {builderMode === 'daily' && (
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Tägliche Uhrzeit</label>
                  <input
                    type="time"
                    value={dailyTime}
                    onChange={(e) => {
                      setDailyTime(e.target.value);
                      syncBuilderToCron('daily', e.target.value, intervalHours, selectedDays);
                    }}
                    className="px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono tabular-nums text-neutral-100 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              )}

              {builderMode === 'interval' && (
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Ausführen alle X Stunden</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={23}
                      value={intervalHours}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setIntervalHours(val);
                        syncBuilderToCron('interval', dailyTime, val, selectedDays);
                      }}
                      className="w-24 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono tabular-nums text-neutral-100 focus:outline-none focus:border-emerald-600"
                    />
                    <span className="text-xs text-neutral-400">Stunden (jeweils zur vollen Stunde)</span>
                  </div>
                </div>
              )}

              {builderMode === 'weekly' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1.5">Wochentage</label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const active = selectedDays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleWeekday(d.value)}
                            className={`px-2.5 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                              active
                                ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">Uhrzeit</label>
                    <input
                      type="time"
                      value={dailyTime}
                      onChange={(e) => {
                        setDailyTime(e.target.value);
                        syncBuilderToCron('weekly', e.target.value, intervalHours, selectedDays);
                      }}
                      className="px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono tabular-nums text-neutral-100 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              )}

              {/* Direct Cron Expression Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-neutral-300">
                    Cron-Ausdruck (Min Std Tag Mon Wochentag)
                  </label>
                  <span className="text-[11px] font-mono text-neutral-500">z. B. 0 4 * * *</span>
                </div>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => {
                    setBuilderMode('cron');
                    setCronExpression(e.target.value);
                  }}
                  placeholder="0 4 * * *"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Live Cron Preview */}
              {cronPreview && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    cronPreview.valid
                      ? 'bg-neutral-950 border-neutral-800 text-neutral-300'
                      : 'bg-rose-950/40 border-rose-800/70 text-rose-200'
                  }`}
                >
                  {cronPreview.valid ? (
                    <div className="space-y-1.5">
                      <div className="font-medium text-emerald-400">
                        {cronPreview.humanSchedule}
                      </div>
                      {cronPreview.nextRuns.length > 0 && (
                        <div className="text-[11px] text-neutral-400 font-mono tabular-nums">
                          Nächste Ausführungen: {cronPreview.nextRuns.map((r) => formatDateTime(r)).join(' · ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>{cronPreview.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingTaskId(null);
              }}
              className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving || (cronPreview !== null && !cronPreview.valid)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              {saving ? 'Speichere...' : editingTaskId ? 'Änderungen speichern' : 'Aufgabe anlegen'}
            </button>
          </div>
        </form>
      )}

      {/* Scheduled Tasks List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-200">
            Geplante Aufgaben ({schedules.length})
          </span>
          <span className="text-neutral-500">
            Cron-Prüfung läuft automatisch im Hintergrund
          </span>
        </div>

        {loading && schedules.length === 0 ? (
          <div className="p-5 space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="h-16 rounded-lg bg-neutral-950 animate-pulse" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <CalendarClock className="w-8 h-8 text-neutral-600 mx-auto" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-neutral-200">
                Noch keine Zeitplan-Aufgaben eingerichtet
              </div>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Plane automatisierte Server-Starts, nächtliche Neustarts oder Abschaltungen mit präzisen Uhrzeiten oder 5-Felder-Cron-Ausdrücken.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Erste Aufgabe planen</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {schedules.map((task) => (
              <div
                key={task.id}
                className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                  task.enabled ? 'hover:bg-neutral-800/25' : 'opacity-65 bg-neutral-950/30'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-semibold text-neutral-100 truncate">
                      {task.name}
                    </span>
                    <span className={`text-xs font-semibold ${getActionTextClass(task.action)}`}>
                      {formatActionLabel(task.action)}
                    </span>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span className="text-xs font-mono text-neutral-300">
                      {task.cronExpression}
                    </span>
                    <span aria-hidden="true" className="text-neutral-600">·</span>
                    <span className={`text-xs ${task.enabled ? 'text-emerald-400' : 'text-neutral-500'}`}>
                      {task.enabled ? 'Aktiv' : 'Pausiert'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-400">
                    <span>{task.humanSchedule}</span>
                    {task.enabled && task.nextRunAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-neutral-300">
                          <Clock className="w-3 h-3 text-sky-400" />
                          <span>Nächster Lauf: {formatDateTime(task.nextRunAt)}</span>
                        </span>
                      </>
                    )}
                    {task.lastRunAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Zuletzt: {formatDateTime(task.lastRunAt)} ({task.lastRunStatus})
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(task)}
                    disabled={togglingTaskId === task.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      task.enabled
                        ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300 hover:bg-emerald-950'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {task.enabled ? 'Pausieren' : 'Aktivieren'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunNow(task)}
                    disabled={runningTaskId === task.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
                    title="Diese Aufgabe sofort ausführen"
                  >
                    <Zap className={`w-3.5 h-3.5 text-amber-400 ${runningTaskId === task.id ? 'animate-spin' : ''}`} />
                    <span>{runningTaskId === task.id ? 'Läuft...' : 'Jetzt ausführen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditForm(task)}
                    className="p-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors"
                    title="Aufgabe bearbeiten"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {confirmDeleteId === task.id ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800 text-xs">
                      <span className="text-rose-200 whitespace-nowrap">Löschen?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task)}
                        className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
                      >
                        Nein
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(task.id)}
                      className="p-1.5 rounded-lg bg-neutral-950 hover:bg-rose-950/70 border border-neutral-800 hover:border-rose-800 text-neutral-400 hover:text-rose-300 cursor-pointer transition-colors"
                      title="Aufgabe löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Execution Log */}
      {history.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-200">
              Ausführungsprotokoll ({history.length})
            </span>
            <span className="text-neutral-500">Automatische &amp; manuelle Läufe</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/60">
                  <th className="py-2.5 px-5 font-medium">Zeitpunkt</th>
                  <th className="py-2.5 px-4 font-medium">Aufgabe</th>
                  <th className="py-2.5 px-4 font-medium">Aktion</th>
                  <th className="py-2.5 px-4 font-medium">Auslöser</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-5 font-medium">Meldung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70">
                {history.slice(0, 12).map((entry) => (
                  <tr key={entry.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono tabular-nums text-neutral-300 whitespace-nowrap">
                      {formatDateTime(entry.executedAt)}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-200 font-medium whitespace-nowrap">
                      {entry.taskName}
                    </td>
                    <td className={`py-2.5 px-4 font-semibold whitespace-nowrap ${getActionTextClass(entry.action)}`}>
                      {formatActionLabel(entry.action)}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-400 whitespace-nowrap">
                      {entry.trigger === 'cron' ? 'Zeitplan (Cron)' : 'Manuell'}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {entry.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Erfolgreich</span>
                        </span>
                      ) : entry.status === 'skipped' ? (
                        <span className="text-amber-400 font-medium">Übersprungen</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Fehler</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-5 text-neutral-400 max-w-md truncate" title={entry.message}>
                      {entry.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
