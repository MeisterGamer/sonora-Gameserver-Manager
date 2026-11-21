import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  HardDrive,
  Thermometer,
  Database,
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Sliders,
  Save,
  Check,
  Activity,
  FolderTree
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { ServerInstance } from '../types/game';

interface DiskIoMetrics {
  readMbPerSec: number;
  writeMbPerSec: number;
  totalMbPerSec: number;
  readIops: number;
  writeIops: number;
  totalIops: number;
  utilizationPercent: number;
  deviceCount: number;
  source: 'proc_diskstats' | 'estimated';
}

interface InodeMetrics {
  filesystem: string;
  mountPoint: string;
  used: number;
  total: number;
  free: number;
  usedPercent: number;
  serverFileCount: number;
  source: 'df_inodes' | 'estimated';
}

interface DiskSpaceMetrics {
  filesystem: string;
  mountPoint: string;
  usedGb: number;
  totalGb: number;
  freeGb: number;
  usedPercent: number;
}

interface ThermalSensorReading {
  id: string;
  name: string;
  label: string;
  celsius: number;
  source: 'thermal_zone' | 'hwmon' | 'estimated';
}

interface TemperatureMetrics {
  cpuCelsius: number;
  maxCelsius: number;
  sensors: ThermalSensorReading[];
  sensorSource: 'sysfs' | 'estimated';
}

interface HardwareHealthSample {
  timestamp: string;
  timeLabel: string;
  diskIo: DiskIoMetrics;
  inodes: InodeMetrics;
  diskSpace: DiskSpaceMetrics;
  temperature: TemperatureMetrics;
}

interface HardwareHealthThresholds {
  diskIoWarnMbPerSec: number;
  diskIoCritMbPerSec: number;
  inodeWarnPercent: number;
  inodeCritPercent: number;
  tempWarnCelsius: number;
  tempCritCelsius: number;
  diskSpaceWarnPercent: number;
  diskSpaceCritPercent: number;
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
  cooldownSeconds: number;
}

interface HardwareAlertNotification {
  id: string;
  serverId: string;
  serverName: string;
  metric: 'disk_io' | 'inodes' | 'temperature' | 'disk_space';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  currentValue: number;
  thresholdValue: number;
  unit: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

interface HardwareHealthPayload {
  success: boolean;
  serverId: string;
  status: 'healthy' | 'warning' | 'critical';
  current: HardwareHealthSample;
  history: HardwareHealthSample[];
  thresholds: HardwareHealthThresholds;
  notifications: HardwareAlertNotification[];
  newlyTriggered?: HardwareAlertNotification[];
  unacknowledgedCount: number;
}

interface HardwareHealthViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
  onAlertCountChange?: (count: number) => void;
}

export const HardwareHealthView: React.FC<HardwareHealthViewProps> = ({
  server,
  onNotify,
  onAlertCountChange
}) => {
  const [data, setData] = useState<HardwareHealthPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThresholds, setShowThresholds] = useState(false);
  const [draftThresholds, setDraftThresholds] = useState<HardwareHealthThresholds | null>(null);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);
  const [ackBusyId, setAckBusyId] = useState<string | null>(null);

  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef<boolean>(true);

  const notifyNewAlerts = useCallback(
    (notifications: HardwareAlertNotification[], newlyTriggered?: HardwareAlertNotification[]) => {
      if (!onNotify) return;
      const toCheck = newlyTriggered && newlyTriggered.length > 0 ? newlyTriggered : notifications;
      for (const alert of toCheck) {
        if (alert.acknowledged) continue;
        if (!seenAlertIdsRef.current.has(alert.id)) {
          seenAlertIdsRef.current.add(alert.id);
          // Notify on all newly triggered alerts or active critical alerts on initial load
          if (!isFirstFetchRef.current || alert.severity === 'critical' || (newlyTriggered && newlyTriggered.length > 0)) {
            const prefix = alert.severity === 'critical' ? 'KRITISCH' : 'WARNUNG';
            onNotify(`[Hardware-Health · ${prefix}] ${alert.message}`);
          }
        }
      }
      isFirstFetchRef.current = false;
    },
    [onNotify]
  );

  const fetchHardwareHealth = useCallback(
    async (manual: boolean = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/hardware-health`);
        const json: HardwareHealthPayload = await res.json();
        if (!res.ok || !json.success) {
          throw new Error((json as any)?.error || `HTTP ${res.status}`);
        }
        setData(json);
        setError(null);
        setDraftThresholds(prev => prev ?? json.thresholds);
        onAlertCountChange?.(json.unacknowledgedCount || 0);
        notifyNewAlerts(json.notifications || [], json.newlyTriggered);
      } catch (err: any) {
        setError(err?.message || 'Hardware-Health Daten konnten nicht geladen werden.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [server.id, notifyNewAlerts, onAlertCountChange]
  );

  useEffect(() => {
    seenAlertIdsRef.current.clear();
    isFirstFetchRef.current = true;
    setDraftThresholds(null);
    fetchHardwareHealth(false);
    const interval = setInterval(() => fetchHardwareHealth(false), 5000);
    return () => clearInterval(interval);
  }, [fetchHardwareHealth]);

  const handleSaveThresholds = async () => {
    if (!draftThresholds) return;
    setIsSavingThresholds(true);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/hardware-health/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftThresholds)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || 'Schwellenwerte konnten nicht gespeichert werden.');
      }
      setData(prev =>
        prev
          ? {
              ...prev,
              status: json.status,
              thresholds: json.thresholds,
              notifications: json.notifications,
              unacknowledgedCount: json.unacknowledgedCount
            }
          : prev
      );
      setDraftThresholds(json.thresholds);
      onAlertCountChange?.(json.unacknowledgedCount || 0);
      if (Array.isArray(json.newlyTriggered) && json.newlyTriggered.length > 0) {
        notifyNewAlerts(json.notifications, json.newlyTriggered);
      } else {
        onNotify?.('Hardware-Health Schwellenwerte gespeichert.');
      }
    } catch (err: any) {
      onNotify?.(err?.message || 'Fehler beim Speichern der Schwellenwerte.');
    } finally {
      setIsSavingThresholds(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    setAckBusyId(alertId);
    try {
      const res = await fetch(
        `/api/servers/${encodeURIComponent(server.id)}/hardware-health/notifications/${encodeURIComponent(alertId)}/ack`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setData(prev =>
          prev
            ? {
                ...prev,
                notifications: json.notifications,
                unacknowledgedCount: json.unacknowledgedCount
              }
            : prev
        );
        onAlertCountChange?.(json.unacknowledgedCount || 0);
      }
    } catch {
      // ignore transient errors
    } finally {
      setAckBusyId(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    setAckBusyId('ALL');
    try {
      const res = await fetch(
        `/api/servers/${encodeURIComponent(server.id)}/hardware-health/notifications/ack-all`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setData(prev =>
          prev
            ? {
                ...prev,
                notifications: json.notifications,
                unacknowledgedCount: 0
              }
            : prev
        );
        onAlertCountChange?.(0);
        onNotify?.('Alle Hardware-Benachrichtigungen wurden quittiert.');
      }
    } catch {
      // ignore
    } finally {
      setAckBusyId(null);
    }
  };

  const formatNumber = (val: number) => new Intl.NumberFormat('de-DE').format(Math.round(val));

  const getLevelColor = (val: number, warn: number, crit: number) => {
    if (val >= crit) return { text: 'text-rose-400', bar: 'bg-rose-500', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Kritisch' };
    if (val >= warn) return { text: 'text-amber-400', bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Warnung' };
    return { text: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Normal' };
  };

  if (isLoading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-10 text-center text-neutral-400">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-3" />
        <p className="text-sm">Hardware-Health Sensoren (Disk-IO, Inodes, Temperatur) werden ausgelesen...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-neutral-900 border border-rose-500/30 rounded-xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-rose-300">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error || 'Keine Hardware-Daten verfügbar.'}</span>
        </div>
        <button
          onClick={() => fetchHardwareHealth(true)}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium cursor-pointer"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const { current, history, thresholds, notifications, unacknowledgedCount, status } = data;
  const ioState = getLevelColor(current.diskIo.totalMbPerSec, thresholds.diskIoWarnMbPerSec, thresholds.diskIoCritMbPerSec);
  const inodeState = getLevelColor(current.inodes.usedPercent, thresholds.inodeWarnPercent, thresholds.inodeCritPercent);
  const tempState = getLevelColor(current.temperature.maxCelsius, thresholds.tempWarnCelsius, thresholds.tempCritCelsius);
  const diskState = getLevelColor(current.diskSpace.usedPercent, thresholds.diskSpaceWarnPercent, thresholds.diskSpaceCritPercent);

  const chartData = history.map(point => ({
    time: point.timeLabel,
    readMb: point.diskIo.readMbPerSec,
    writeMb: point.diskIo.writeMbPerSec,
    totalMb: point.diskIo.totalMbPerSec,
    cpuTemp: point.temperature.cpuCelsius,
    maxTemp: point.temperature.maxCelsius,
    inodePct: point.inodes.usedPercent
  }));

  const statusMeta =
    status === 'critical'
      ? {
          border: 'border-rose-500/40 bg-rose-950/20',
          icon: <AlertOctagon className="w-5 h-5 text-rose-400" />,
          title: 'Kritischer Hardware-Zustand erkannt',
          desc: 'Mindestens ein kritischer Schwellenwert wurde überschritten. Sofortige Prüfung empfohlen.'
        }
      : status === 'warning'
      ? {
          border: 'border-amber-500/40 bg-amber-950/20',
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
          title: 'Hardware-Warnung aktiv',
          desc: 'Ein Hardware-Indikator nähert sich dem definierten Schwellenwert.'
        }
      : {
          border: 'border-emerald-500/30 bg-emerald-950/15',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          title: 'Hardware-Health im Optimalbereich',
          desc: 'Disk-IO, Inode-Limit und Host-Temperatur liegen innerhalb der konfigurierten Grenzwerte.'
        };

  return (
    <div className="space-y-5">
      {/* Status Banner & Controls */}
      <div className={`border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${statusMeta.border}`}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-neutral-900/80 border border-neutral-800 shrink-0">
            {statusMeta.icon}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">{statusMeta.title}</h2>
              {unacknowledgedCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {unacknowledgedCount} aktive Benachrichtigung{unacknowledgedCount === 1 ? '' : 'en'}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">{statusMeta.desc}</p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Letztes Live-Sample: {current.timeLabel} · Auto-Polling alle 5s · Mount: {current.inodes.mountPoint}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowThresholds(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              showThresholds
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Schwellenwerte</span>
          </button>
          <button
            onClick={() => fetchHardwareHealth(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Aktualisieren</span>
          </button>
        </div>
      </div>

      {/* Configurable Thresholds Panel */}
      {showThresholds && draftThresholds && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Schwellenwerte & Automatische Benachrichtigungen
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Beim Überschreiten dieser Grenzwerte werden automatisch Benutzer-Benachrichtigungen, Server-Log-Warnungen und bei kritischen Werten Webhooks ausgelöst.
              </p>
            </div>
            <button
              onClick={handleSaveThresholds}
              disabled={isSavingThresholds}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingThresholds ? 'Speichere...' : 'Schwellenwerte speichern'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                Disk-IO (MB/s)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-neutral-400">
                  Warnung
                  <input
                    type="number"
                    min={1}
                    value={draftThresholds.diskIoWarnMbPerSec}
                    onChange={e => setDraftThresholds({ ...draftThresholds, diskIoWarnMbPerSec: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[11px] text-neutral-400">
                  Kritisch
                  <input
                    type="number"
                    min={1}
                    value={draftThresholds.diskIoCritMbPerSec}
                    onChange={e => setDraftThresholds({ ...draftThresholds, diskIoCritMbPerSec: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-purple-400" />
                Inode-Limit (%)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-neutral-400">
                  Warnung %
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={draftThresholds.inodeWarnPercent}
                    onChange={e => setDraftThresholds({ ...draftThresholds, inodeWarnPercent: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[11px] text-neutral-400">
                  Kritisch %
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draftThresholds.inodeCritPercent}
                    onChange={e => setDraftThresholds({ ...draftThresholds, inodeCritPercent: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                Temperatur (°C)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-neutral-400">
                  Warnung °C
                  <input
                    type="number"
                    min={20}
                    max={115}
                    value={draftThresholds.tempWarnCelsius}
                    onChange={e => setDraftThresholds({ ...draftThresholds, tempWarnCelsius: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[11px] text-neutral-400">
                  Kritisch °C
                  <input
                    type="number"
                    min={20}
                    max={125}
                    value={draftThresholds.tempCritCelsius}
                    onChange={e => setDraftThresholds({ ...draftThresholds, tempCritCelsius: Number(e.target.value) })}
                    className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-emerald-400" />
                Benachrichtigung
              </div>
              <div className="space-y-1.5 text-xs text-neutral-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftThresholds.notifyOnWarning}
                    onChange={e => setDraftThresholds({ ...draftThresholds, notifyOnWarning: e.target.checked })}
                  />
                  <span>Bei Warnungen melden</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftThresholds.notifyOnCritical}
                    onChange={e => setDraftThresholds({ ...draftThresholds, notifyOnCritical: e.target.checked })}
                  />
                  <span>Bei kritischen Werten melden</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3 Core Hardware KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Disk-IO Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Disk-IO Durchsatz</h3>
                  <span className="text-[11px] text-neutral-500">
                    Quelle: {current.diskIo.source === 'proc_diskstats' ? `/proc/diskstats (${current.diskIo.deviceCount} Laufwerke)` : 'Host-Schätzung'}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${ioState.badge}`}>
                {ioState.label}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-3">
              <span className={`text-3xl font-bold font-mono ${ioState.text}`}>
                {current.diskIo.totalMbPerSec.toFixed(2)}
              </span>
              <span className="text-xs text-neutral-400">MB/s gesamt</span>
            </div>

            <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 mb-3">
              <div
                className={`h-full transition-all duration-500 ${ioState.bar}`}
                style={{ width: `${Math.min(100, (current.diskIo.totalMbPerSec / Math.max(thresholds.diskIoCritMbPerSec, 1)) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">Lesen</div>
                <div className="font-mono font-semibold text-sky-400">{current.diskIo.readMbPerSec.toFixed(2)} MB/s</div>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">Schreiben</div>
                <div className="font-mono font-semibold text-amber-400">{current.diskIo.writeMbPerSec.toFixed(2)} MB/s</div>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">IOPS</div>
                <div className="font-mono font-semibold text-neutral-200">{formatNumber(current.diskIo.totalIops)}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
            <span>I/O-Auslastung: {current.diskIo.utilizationPercent}%</span>
            <span>Grenzen: {thresholds.diskIoWarnMbPerSec} / {thresholds.diskIoCritMbPerSec} MB/s</span>
          </div>
        </div>

        {/* Inode-Limit Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Database className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Inode-Limit & Dateisystem</h3>
                  <span className="text-[11px] text-neutral-500">
                    {current.inodes.filesystem} ({current.inodes.mountPoint})
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${inodeState.badge}`}>
                {inodeState.label}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-3">
              <span className={`text-3xl font-bold font-mono ${inodeState.text}`}>
                {current.inodes.usedPercent.toFixed(1)}%
              </span>
              <span className="text-xs text-neutral-400">Inodes belegt</span>
            </div>

            <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 mb-3">
              <div
                className={`h-full transition-all duration-500 ${inodeState.bar}`}
                style={{ width: `${Math.min(100, current.inodes.usedPercent)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">Belegt</div>
                <div className="font-mono font-semibold text-neutral-200">{formatNumber(current.inodes.used)}</div>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">Frei</div>
                <div className="font-mono font-semibold text-emerald-400">{formatNumber(current.inodes.free)}</div>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-2">
                <div className="text-[10px] text-neutral-500">Server-Dateien</div>
                <div className="font-mono font-semibold text-purple-300">{formatNumber(current.inodes.serverFileCount)}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
            <span className={diskState.text}>
              Speicher: {current.diskSpace.usedGb} / {current.diskSpace.totalGb} GB ({current.diskSpace.usedPercent}%)
            </span>
            <span>Grenzen: {thresholds.inodeWarnPercent}% / {thresholds.inodeCritPercent}%</span>
          </div>
        </div>

        {/* Temperature Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Thermometer className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Hardware-Temperatur</h3>
                  <span className="text-[11px] text-neutral-500">
                    {current.temperature.sensorSource === 'sysfs' ? 'Linux sysfs Sensoren (Live)' : 'Container-Schätzung'}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${tempState.badge}`}>
                {tempState.label}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-3">
              <span className={`text-3xl font-bold font-mono ${tempState.text}`}>
                {current.temperature.maxCelsius.toFixed(1)}°C
              </span>
              <span className="text-xs text-neutral-400">
                Max (CPU: {current.temperature.cpuCelsius.toFixed(1)}°C)
              </span>
            </div>

            <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 mb-3">
              <div
                className={`h-full transition-all duration-500 ${tempState.bar}`}
                style={{ width: `${Math.min(100, (current.temperature.maxCelsius / 105) * 100)}%` }}
              />
            </div>

            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
              {current.temperature.sensors.slice(0, 4).map(sensor => (
                <div
                  key={sensor.id}
                  className="flex items-center justify-between text-xs bg-neutral-950 border border-neutral-800/80 rounded px-2.5 py-1.5"
                >
                  <span className="text-neutral-300 truncate pr-2">{sensor.label}</span>
                  <span className="font-mono font-semibold text-amber-300 shrink-0">{sensor.celsius.toFixed(1)}°C</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
            <span>{current.temperature.sensors.length} Sensor(en) aktiv</span>
            <span>Grenzen: {thresholds.tempWarnCelsius}°C / {thresholds.tempCritCelsius}°C</span>
          </div>
        </div>
      </div>

      {/* Live Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Disk-IO Verlauf (Lesen / Schreiben in MB/s)
            </h3>
            <span className="text-[11px] text-neutral-500">Letzte {chartData.length} Messpunkte</span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="time" stroke="#737373" fontSize={10} />
                <YAxis stroke="#737373" fontSize={10} unit=" MB/s" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }}
                />
                <ReferenceLine y={thresholds.diskIoWarnMbPerSec} stroke="#f59e0b" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="readMb" name="Lesen (MB/s)" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.18} />
                <Area type="monotone" dataKey="writeMb" name="Schreiben (MB/s)" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-400" />
              Temperatur-Verlauf (°C)
            </h3>
            <span className="text-[11px] text-neutral-500">
              Warnung ab {thresholds.tempWarnCelsius}°C · Kritisch ab {thresholds.tempCritCelsius}°C
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="time" stroke="#737373" fontSize={10} />
                <YAxis stroke="#737373" fontSize={10} domain={[20, 100]} unit="°C" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }}
                />
                <ReferenceLine y={thresholds.tempWarnCelsius} stroke="#f59e0b" strokeDasharray="4 4" />
                <ReferenceLine y={thresholds.tempCritCelsius} stroke="#ef4444" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="maxTemp" name="Max. Sensor (°C)" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                <Area type="monotone" dataKey="cpuTemp" name="CPU (°C)" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Automatic User Notifications Feed */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Automatische Schwellenwert-Benachrichtigungen ({notifications.length})
            </h3>
          </div>
          {unacknowledgedCount > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              disabled={ackBusyId === 'ALL'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Alle quittieren ({unacknowledgedCount})</span>
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-6 text-center text-neutral-500 text-xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-500/60 mx-auto mb-2" />
            Keine Hardware-Schwellenwert-Überschreitungen für diesen Server protokolliert.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {notifications.map(alert => {
              const isCrit = alert.severity === 'critical';
              return (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    alert.acknowledged
                      ? 'bg-neutral-950/60 border-neutral-800 opacity-65'
                      : isCrit
                      ? 'bg-rose-950/25 border-rose-500/40'
                      : 'bg-amber-950/25 border-amber-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${
                          isCrit
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isCrit ? 'Kritisch' : 'Warnung'}
                      </span>
                      <span className="text-xs font-semibold text-white">{alert.title}</span>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {alert.currentValue} {alert.unit} (Limit: {alert.thresholdValue} {alert.unit})
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300">{alert.message}</p>
                    <div className="text-[10px] text-neutral-500">
                      Ausgelöst: {new Date(alert.createdAt).toLocaleString('de-DE')}
                      {alert.acknowledged && alert.acknowledgedAt
                        ? ` · Quittiert am ${new Date(alert.acknowledgedAt).toLocaleString('de-DE')}`
                        : ''}
                    </div>
                  </div>

                  {!alert.acknowledged ? (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={ackBusyId === alert.id}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      Quittieren
                    </button>
                  ) : (
                    <span className="text-[11px] text-emerald-400 font-medium shrink-0 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Quittiert
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
