import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import {
  Activity,
  Cpu,
  Wifi,
  RefreshCw,
  Download,
  Trash2,
  AlertCircle,
  Layers,
  LayoutGrid,
  Clock
} from 'lucide-react';
import { ServerInstance } from '../types/game';

export interface PerformanceHistorySample {
  timestamp: number;
  isoTime: string;
  label: string;
  cpuPercent: number;
  ramUsedMb: number;
  ramAllocatedMb: number;
  ramPercent: number;
  networkInKb: number;
  networkOutKb: number;
  tps: number;
  players: number;
  running: boolean;
}

export interface PerformanceHistorySummary {
  avgCpu: number;
  peakCpu: number;
  currentCpu: number;
  avgRamMb: number;
  peakRamMb: number;
  currentRamMb: number;
  avgRamPercent: number;
  peakRamPercent: number;
  currentRamPercent: number;
  allocatedRamMb: number;
  avgNetInKb: number;
  peakNetInKb: number;
  currentNetInKb: number;
  avgNetOutKb: number;
  peakNetOutKb: number;
  currentNetOutKb: number;
  uptimeRatioPercent: number;
}

interface HistoryApiResponse {
  success: boolean;
  serverId: string;
  range: TimeRange;
  running: boolean;
  allocatedRamMb: number;
  totalStored24h: number;
  recordingSince: string | null;
  lastSampleAt: string | null;
  summary: PerformanceHistorySummary;
  samples: PerformanceHistorySample[];
  error?: string;
}

type TimeRange = '1h' | '6h' | '12h' | '24h';
type LayoutMode = 'split' | 'combined';
type RamUnit = 'mb' | 'percent';

interface PerformanceMonitorViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '1h', label: '1 Std' },
  { key: '6h', label: '6 Std' },
  { key: '12h', label: '12 Std' },
  { key: '24h', label: '24 Std' }
];

function formatFullTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatRamValue(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatNetworkRate(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB/s`;
  return `${kb.toFixed(1)} KB/s`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload: PerformanceHistorySample & { networkTotalKb: number };
  }>;
  unitFormatter?: (dataKey: string, value: number) => string;
}

const TelemetryTooltip: React.FC<CustomTooltipProps> = ({ active, payload, unitFormatter }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-neutral-950/95 border border-neutral-700 rounded-lg px-3 py-2.5 shadow-xl text-xs min-w-[190px]">
      <div className="flex items-center justify-between gap-4 pb-1.5 mb-1.5 border-b border-neutral-800">
        <span className="font-mono tabular-nums text-neutral-200 font-semibold">
          {formatFullTimestamp(point.isoTime)}
        </span>
        <span className={point.running ? 'text-emerald-400 font-medium' : 'text-neutral-500 font-medium'}>
          {point.running ? 'Aktiv' : 'Offline'}
        </span>
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono tabular-nums font-semibold text-neutral-100">
              {unitFormatter ? unitFormatter(entry.dataKey, Number(entry.value || 0)) : entry.value}
            </span>
          </div>
        ))}
      </div>
      {point.running && (
        <div className="mt-2 pt-1.5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400 font-mono tabular-nums">
          <span>TPS: {point.tps.toFixed(1)}</span>
          <span>Spieler: {point.players}</span>
        </div>
      )}
    </div>
  );
};

export const PerformanceMonitorView: React.FC<PerformanceMonitorViewProps> = ({
  server,
  onNotify
}) => {
  const [range, setRange] = useState<TimeRange>('24h');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');
  const [ramUnit, setRamUnit] = useState<RamUnit>('mb');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [samplingNow, setSamplingNow] = useState<boolean>(false);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<HistoryApiResponse | null>(null);

  const loadHistory = useCallback(async (selectedRange: TimeRange, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/metrics/history?range=${selectedRange}`, {
        credentials: 'same-origin'
      });
      const data: HistoryApiResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setHistoryData(data);
    } catch (err: any) {
      setError(err.message || 'Verlaufsdaten konnten nicht geladen werden.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadHistory(range, false);
  }, [loadHistory, range]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadHistory(range, true);
    }, 15_000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadHistory, range]);

  const handleCaptureSample = async () => {
    setSamplingNow(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/metrics/sample`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range })
      });
      const data: HistoryApiResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setHistoryData(data);
      onNotify?.('Neuer Leistungs-Messpunkt erfolgreich erfasst und gespeichert.');
    } catch (err: any) {
      setError(err.message || 'Messpunkt konnte nicht erfasst werden.');
    } finally {
      setSamplingNow(false);
    }
  };

  const handleClearHistory = async () => {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/metrics/history`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      const data: HistoryApiResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setHistoryData(data);
      setConfirmClear(false);
      onNotify?.('24h-Leistungsverlauf zurückgesetzt.');
    } catch (err: any) {
      setError(err.message || 'Verlauf konnte nicht zurückgesetzt werden.');
    } finally {
      setClearing(false);
    }
  };

  const chartData = useMemo(() => {
    const samples = historyData?.samples || [];
    return samples.map((s) => ({
      ...s,
      networkTotalKb: Math.round((s.networkInKb + s.networkOutKb) * 10) / 10
    }));
  }, [historyData]);

  const allocatedRamMb = historyData?.allocatedRamMb || Math.max(512, (server.allocatedRamGb || 4) * 1024);
  const summary = historyData?.summary;

  const handleExportCsv = () => {
    if (!chartData.length) return;
    const header = [
      'Zeitstempel (ISO)',
      'Uhrzeit',
      'Status',
      'CPU (%)',
      'RAM Belegt (MB)',
      'RAM Limit (MB)',
      'RAM (%)',
      'Netzwerk Inbound (KB/s)',
      'Netzwerk Outbound (KB/s)',
      'TPS',
      'Spieler'
    ];
    const rows = chartData.map((s) => [
      s.isoTime,
      s.label,
      s.running ? 'Aktiv' : 'Offline',
      s.cpuPercent.toFixed(1),
      String(s.ramUsedMb),
      String(s.ramAllocatedMb),
      s.ramPercent.toFixed(1),
      s.networkInKb.toFixed(1),
      s.networkOutKb.toFixed(1),
      s.tps.toFixed(1),
      String(s.players)
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leistungs-monitor-${server.id}-${range}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify?.(`Leistungsdaten (${chartData.length} Messpunkte) als CSV exportiert.`);
  };

  const recentSnapshots = useMemo(() => {
    return [...chartData].reverse().slice(0, 8);
  }, [chartData]);

  return (
    <div className="space-y-6">
      {/* Top Bar: Title, Metadata & Controls */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-bold text-neutral-100 tracking-tight">
              Leistungs-Monitor
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
              <span>Historische CPU-, RAM- &amp; Netzwerkauslastung (letzte {range === '24h' ? '24 Stunden' : range === '12h' ? '12 Stunden' : range === '6h' ? '6 Stunden' : '60 Minuten'})</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-neutral-300">
                {chartData.length} {chartData.length === 1 ? 'Messpunkt' : 'Messpunkte'}
              </span>
              {historyData?.lastSampleAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Stand {formatFullTimestamp(historyData.lastSampleAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Time Range Segmented Selector */}
            <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    range === opt.key
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Layout Mode Toggle */}
            <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
              <button
                type="button"
                onClick={() => setLayoutMode('split')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  layoutMode === 'split'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Einzeldiagramme für CPU, RAM und Netzwerk"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Einzeln</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('combined')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  layoutMode === 'combined'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Alle Metriken auf einer gemeinsamen Zeitachse"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Kombi</span>
              </button>
            </div>

            {/* Auto-Refresh Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                autoRefresh
                  ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
              title="Automatische Aktualisierung alle 15 Sekunden umschalten"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{autoRefresh ? 'Auto 15s: An' : 'Auto 15s: Aus'}</span>
            </button>

            {/* Capture Sample Now */}
            <button
              type="button"
              onClick={handleCaptureSample}
              disabled={samplingNow}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${samplingNow ? 'animate-spin' : ''}`} />
              <span>{samplingNow ? 'Erfasse...' : 'Messpunkt erfassen'}</span>
            </button>

            {/* CSV Export */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={chartData.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Verlaufsdaten als CSV-Datei herunterladen"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {/* Inline Reset Confirmation */}
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={chartData.length === 0}
                className="p-2 rounded-lg bg-neutral-950 hover:bg-rose-950/60 border border-neutral-800 hover:border-rose-800/70 text-neutral-400 hover:text-rose-300 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                title="Gespeicherten Verlauf zurücksetzen"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/50 border border-rose-800/70 text-xs">
                <span className="text-rose-200 font-medium whitespace-nowrap">Verlauf leeren?</span>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={clearing}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer whitespace-nowrap"
                >
                  {clearing ? '...' : 'Ja'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer whitespace-nowrap"
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Summary KPI Strip (Single-Elevation Divider Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800 mt-5 pt-5 border-t border-neutral-800">
          <div className="pb-4 sm:pb-0 sm:pr-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>CPU-Auslastung</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-500">Zeitraum {range}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-sky-400">
                {(summary?.currentCpu ?? 0).toFixed(1)}%
              </span>
              <span className="text-xs text-neutral-400">aktuell</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400 font-mono tabular-nums">
              <span>Ø {(summary?.avgCpu ?? 0).toFixed(1)}%</span>
              <span aria-hidden="true">·</span>
              <span>Spitze {(summary?.peakCpu ?? 0).toFixed(1)}%</span>
            </div>
          </div>

          <div className="py-4 sm:py-0 sm:px-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>RAM-Auslastung</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-500">
                Limit {formatRamValue(allocatedRamMb)}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                {formatRamValue(summary?.currentRamMb ?? 0)}
              </span>
              <span className="text-xs font-mono tabular-nums text-neutral-400">
                ({(summary?.currentRamPercent ?? 0).toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400 font-mono tabular-nums">
              <span>Ø {formatRamValue(summary?.avgRamMb ?? 0)}</span>
              <span aria-hidden="true">·</span>
              <span>Spitze {formatRamValue(summary?.peakRamMb ?? 0)}</span>
            </div>
          </div>

          <div className="py-4 sm:py-0 sm:px-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span>Netzwerk Inbound (RX)</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-500">Eingehend</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                {formatNetworkRate(summary?.currentNetInKb ?? 0)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400 font-mono tabular-nums">
              <span>Ø {formatNetworkRate(summary?.avgNetInKb ?? 0)}</span>
              <span aria-hidden="true">·</span>
              <span>Spitze {formatNetworkRate(summary?.peakNetInKb ?? 0)}</span>
            </div>
          </div>

          <div className="pt-4 sm:pt-0 sm:pl-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Wifi className="w-3.5 h-3.5 text-purple-400" />
                <span>Netzwerk Outbound (TX)</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-500">Ausgehend</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-purple-400">
                {formatNetworkRate(summary?.currentNetOutKb ?? 0)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400 font-mono tabular-nums">
              <span>Ø {formatNetworkRate(summary?.avgNetOutKb ?? 0)}</span>
              <span aria-hidden="true">·</span>
              <span>Spitze {formatNetworkRate(summary?.peakNetOutKb ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div role="alert" className="bg-rose-950/35 border border-rose-800/70 rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadHistory(range, false)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            Erneut laden
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !historyData && (
        <div className="space-y-4" aria-busy="true">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="h-4 w-44 bg-neutral-800 rounded animate-pulse mb-4" />
            <div className="h-[250px] w-full bg-neutral-950 rounded-lg animate-pulse" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="h-4 w-40 bg-neutral-800 rounded animate-pulse mb-4" />
              <div className="h-[230px] w-full bg-neutral-950 rounded-lg animate-pulse" />
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="h-4 w-48 bg-neutral-800 rounded animate-pulse mb-4" />
              <div className="h-[230px] w-full bg-neutral-950 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Notice when recording has just started */}
      {!loading && historyData && chartData.length < 2 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-300">
          <div>
            <span className="font-semibold text-neutral-100">Aufzeichnung gestartet</span>
            <span className="text-neutral-400 ml-2">
              Für diesen Server wurden bisher {chartData.length} Messpunkt(e) persistent erfasst. Der Verlauf baut sich automatisch im 60-Sekunden-Takt über 24 Stunden auf oder kann sofort manuell erweitert werden.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCaptureSample}
            disabled={samplingNow}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            Jetzt weiteren Messpunkt erfassen
          </button>
        </div>
      )}

      {/* Main Recharts Visualizations */}
      {historyData && (
        layoutMode === 'split' ? (
          <div className="space-y-4">
            {/* 1. CPU Usage 24h AreaChart */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">
                    CPU-Auslastung (Verlauf {range})
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Prozessorlast des Server-Prozesses in Prozent · Warnschwelle bei 80 %
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-neutral-400">
                  <span>Ø {(summary?.avgCpu ?? 0).toFixed(1)} %</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-400 font-semibold">Max {(summary?.peakCpu ?? 0).toFixed(1)} %</span>
                </div>
              </div>

              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`cpuGrad-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#737373"
                      tick={{ fill: '#a3a3a3', fontSize: 11 }}
                      tickLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={[0, 100]}
                      stroke="#737373"
                      tick={{ fill: '#a3a3a3', fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={
                        <TelemetryTooltip
                          unitFormatter={(_key, val) => `${val.toFixed(1)} %`}
                        />
                      }
                    />
                    <ReferenceLine
                      y={80}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeOpacity={0.65}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpuPercent"
                      name="CPU-Last"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill={`url(#cpuGrad-${server.id})`}
                      isAnimationActive={false}
                      dot={chartData.length <= 12 ? { r: 3, fill: '#38bdf8', strokeWidth: 0 } : false}
                      activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0a0a0a', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. RAM & Network Split Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* RAM Usage Chart */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      RAM-Belegung (Verlauf {range})
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Zugewiesen: {formatRamValue(allocatedRamMb)} · Spitze: {formatRamValue(summary?.peakRamMb ?? 0)}
                    </p>
                  </div>
                  <div className="inline-flex items-center p-0.5 bg-neutral-950 border border-neutral-800 rounded-md text-xs">
                    <button
                      type="button"
                      onClick={() => setRamUnit('mb')}
                      className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                        ramUnit === 'mb' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      MB
                    </button>
                    <button
                      type="button"
                      onClick={() => setRamUnit('percent')}
                      className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                        ramUnit === 'percent' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`ramGrad-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#737373"
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        domain={ramUnit === 'percent' ? [0, 100] : [0, allocatedRamMb]}
                        stroke="#737373"
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => (ramUnit === 'percent' ? `${v}%` : `${v}`)}
                      />
                      <Tooltip
                        content={
                          <TelemetryTooltip
                            unitFormatter={(key, val) =>
                              key === 'ramPercent' ? `${val.toFixed(1)} %` : `${Math.round(val)} MB`
                            }
                          />
                        }
                      />
                      <ReferenceLine
                        y={ramUnit === 'percent' ? 85 : Math.round(allocatedRamMb * 0.85)}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                      />
                      <Area
                        type="monotone"
                        dataKey={ramUnit === 'percent' ? 'ramPercent' : 'ramUsedMb'}
                        name={ramUnit === 'percent' ? 'RAM (%)' : 'RAM (MB)'}
                        stroke="#34d399"
                        strokeWidth={2}
                        fill={`url(#ramGrad-${server.id})`}
                        isAnimationActive={false}
                        dot={chartData.length <= 12 ? { r: 3, fill: '#34d399', strokeWidth: 0 } : false}
                        activeDot={{ r: 4, fill: '#34d399', stroke: '#0a0a0a', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Network I/O Chart */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Netzwerkauslastung (Inbound &amp; Outbound)
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Datenübertragungsrate in KB/s · Host-Schnittstellenmessung
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
                      <span>RX (Inbound)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-purple-400 inline-block" />
                      <span>TX (Outbound)</span>
                    </span>
                  </div>
                </div>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`netInGrad-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id={`netOutGrad-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#737373"
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        stroke="#737373"
                        tick={{ fill: '#a3a3a3', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => `${v}`}
                      />
                      <Tooltip
                        content={
                          <TelemetryTooltip
                            unitFormatter={(_key, val) => formatNetworkRate(val)}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="networkInKb"
                        name="Inbound (RX)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill={`url(#netInGrad-${server.id})`}
                        isAnimationActive={false}
                        dot={chartData.length <= 12 ? { r: 3, fill: '#f59e0b', strokeWidth: 0 } : false}
                        activeDot={{ r: 4, fill: '#f59e0b', stroke: '#0a0a0a', strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="networkOutKb"
                        name="Outbound (TX)"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fill={`url(#netOutGrad-${server.id})`}
                        isAnimationActive={false}
                        dot={chartData.length <= 12 ? { r: 3, fill: '#a855f7', strokeWidth: 0 } : false}
                        activeDot={{ r: 4, fill: '#a855f7', stroke: '#0a0a0a', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Combined Overlay Chart */
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">
                  Kombinierte Korrelations-Ansicht ({range})
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  CPU (%) &amp; RAM (%) auf der linken Achse · Netzwerk Gesamt (KB/s) auf der rechten Achse
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-400 inline-block" />
                  <span>CPU (%)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400 inline-block" />
                  <span>RAM (%)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
                  <span>Netzwerk Gesamt (KB/s)</span>
                </span>
              </div>
            </div>

            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`combCpu-${server.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    tick={{ fill: '#a3a3a3', fontSize: 11 }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    stroke="#737373"
                    tick={{ fill: '#a3a3a3', fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    yAxisId="net"
                    orientation="right"
                    stroke="#737373"
                    tick={{ fill: '#f59e0b', fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v) => `${v} KB/s`}
                  />
                  <Tooltip
                    content={
                      <TelemetryTooltip
                        unitFormatter={(key, val) =>
                          key === 'networkTotalKb' ? formatNetworkRate(val) : `${val.toFixed(1)} %`
                        }
                      />
                    }
                  />
                  <Area
                    yAxisId="pct"
                    type="monotone"
                    dataKey="cpuPercent"
                    name="CPU"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill={`url(#combCpu-${server.id})`}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="ramPercent"
                    name="RAM"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="net"
                    type="monotone"
                    dataKey="networkTotalKb"
                    name="Netzwerk Gesamt"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      )}

      {/* High-Density Recent Snapshots Table */}
      {historyData && recentSnapshots.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-200">
              Letzte erfasste Messpunkte
            </h3>
            <span className="text-xs text-neutral-500 font-mono tabular-nums">
              {historyData.recordingSince ? `Aufzeichnung seit ${formatFullTimestamp(historyData.recordingSince)}` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/60">
                  <th className="py-2.5 px-5 font-medium">Zeitpunkt</th>
                  <th className="py-2.5 px-4 font-medium">Zustand</th>
                  <th className="py-2.5 px-4 font-medium text-right">CPU</th>
                  <th className="py-2.5 px-4 font-medium text-right">RAM</th>
                  <th className="py-2.5 px-4 font-medium text-right">Inbound (RX)</th>
                  <th className="py-2.5 px-4 font-medium text-right">Outbound (TX)</th>
                  <th className="py-2.5 px-5 font-medium text-right">TPS / Spieler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono tabular-nums">
                {recentSnapshots.map((row) => (
                  <tr key={row.timestamp} className="hover:bg-neutral-800/35 transition-colors">
                    <td className="py-2.5 px-5 text-neutral-300 whitespace-nowrap">
                      {formatFullTimestamp(row.isoTime)}
                    </td>
                    <td className={`py-2.5 px-4 font-sans ${row.running ? 'text-emerald-400' : 'text-neutral-500'}`}>
                      {row.running ? 'Online' : 'Offline'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sky-400">
                      {row.cpuPercent.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">
                      {formatRamValue(row.ramUsedMb)} ({row.ramPercent.toFixed(0)}%)
                    </td>
                    <td className="py-2.5 px-4 text-right text-amber-400">
                      {formatNetworkRate(row.networkInKb)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-purple-400">
                      {formatNetworkRate(row.networkOutKb)}
                    </td>
                    <td className="py-2.5 px-5 text-right text-neutral-300">
                      {row.tps.toFixed(1)} · {row.players}
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
