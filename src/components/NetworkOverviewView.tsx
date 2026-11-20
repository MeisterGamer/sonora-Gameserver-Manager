import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  Globe,
  Activity,
  Wifi,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

interface RegionalLatencySample {
  regionId: string;
  regionName: string;
  city: string;
  countryCode: string;
  latencyMs: number;
  packetLossPercent: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  probeTarget: string;
  measurementMode: 'live-tcp' | 'estimated-fiber';
}

interface NetworkProbeSnapshot {
  timestamp: string;
  label: string;
  serverId: string;
  hostIp: string;
  hostName: string;
  serverPort: number;
  gamePortReachable: boolean;
  currentPingMs: number;
  minPingMs: number;
  maxPingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  probesSent: number;
  probesReceived: number;
  measurementMode: 'live-tcp' | 'estimated-fiber';
  regions: RegionalLatencySample[];
}

interface HistoryPoint {
  timestamp: string;
  label: string;
  pingMs: number;
  jitterMs: number;
  packetLossPercent: number;
}

interface NetworkOverviewResponse {
  success: boolean;
  snapshot: NetworkProbeSnapshot;
  history: HistoryPoint[];
  error?: string;
}

interface NetworkOverviewViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

function getQualityColor(quality: RegionalLatencySample['quality']): string {
  switch (quality) {
    case 'excellent': return '#34d399';
    case 'good': return '#38bdf8';
    case 'fair': return '#f59e0b';
    case 'poor': return '#f43f5e';
  }
}

function getQualityLabel(quality: RegionalLatencySample['quality']): string {
  switch (quality) {
    case 'excellent': return 'Exzellent';
    case 'good': return 'Gut';
    case 'fair': return 'Mittel';
    case 'poor': return 'Hoch';
  }
}

function getQualityTextClass(quality: RegionalLatencySample['quality']): string {
  switch (quality) {
    case 'excellent': return 'text-emerald-400';
    case 'good': return 'text-sky-400';
    case 'fair': return 'text-amber-400';
    case 'poor': return 'text-rose-400';
  }
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface RegionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RegionalLatencySample }>;
}

const RegionTooltip: React.FC<RegionTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-neutral-950/95 border border-neutral-700 rounded-lg px-3 py-2.5 shadow-xl text-xs min-w-[190px]">
      <div className="font-semibold text-neutral-100 pb-1 mb-1.5 border-b border-neutral-800 flex items-center justify-between gap-3">
        <span>{r.city} ({r.countryCode})</span>
        <span className={getQualityTextClass(r.quality)}>{getQualityLabel(r.quality)}</span>
      </div>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-neutral-400 font-sans">Region</span>
          <span className="text-neutral-200 font-sans">{r.regionName}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-neutral-400 font-sans">Latenz</span>
          <span className="text-neutral-100 font-bold">{r.latencyMs.toFixed(1)} ms</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-neutral-400 font-sans">Paketverlust</span>
          <span className="text-neutral-200">{r.packetLossPercent.toFixed(1)} %</span>
        </div>
      </div>
    </div>
  );
};

export const NetworkOverviewView: React.FC<NetworkOverviewViewProps> = ({
  server,
  onNotify
}) => {
  const [snapshot, setSnapshot] = useState<NetworkProbeSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [probing, setProbing] = useState<boolean>(false);
  const [autoProbe, setAutoProbe] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data: NetworkOverviewResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/network/overview`
      );
      setSnapshot(data.snapshot);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err: any) {
      setError(err.message || 'Netzwerk-Übersicht konnte nicht geladen werden.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadOverview(false);
  }, [loadOverview]);

  useEffect(() => {
    if (!autoProbe) return;
    const timer = setInterval(() => {
      loadOverview(true);
    }, 30_000);
    return () => clearInterval(timer);
  }, [autoProbe, loadOverview]);

  const handleProbeNow = async () => {
    setProbing(true);
    setError(null);
    try {
      const data: NetworkOverviewResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/network/probe`,
        'POST'
      );
      setSnapshot(data.snapshot);
      setHistory(Array.isArray(data.history) ? data.history : []);
      onNotify?.(`Latenzmessung abgeschlossen: ${data.snapshot.currentPingMs.toFixed(1)} ms (${data.snapshot.packetLossPercent.toFixed(1)} % Verlust).`);
    } catch (err: any) {
      setError(err.message || 'Latenzmessung fehlgeschlagen.');
    } finally {
      setProbing(false);
    }
  };

  const bestRegion = useMemo(() => {
    if (!snapshot?.regions?.length) return null;
    return [...snapshot.regions].sort((a, b) => a.latencyMs - b.latencyMs)[0];
  }, [snapshot]);

  const lossStatus = useMemo(() => {
    const loss = snapshot?.packetLossPercent ?? 0;
    if (loss <= 0.5) return { label: 'Stabil', cls: 'text-emerald-400' };
    if (loss <= 5) return { label: 'Erhöht', cls: 'text-amber-400' };
    return { label: 'Kritisch', cls: 'text-rose-400' };
  }, [snapshot]);

  return (
    <div className="space-y-6">
      {/* Top Overview Card & KPI Strip */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-100 tracking-tight flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>Netzwerk-Übersicht</span>
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
              <span>Aktueller Ping, Paketverlust und geographische Verbindungslatenz</span>
              {snapshot && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-neutral-300">
                    {snapshot.hostIp}:{snapshot.serverPort}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Stand {formatTimestamp(snapshot.timestamp)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAutoProbe((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                autoProbe
                  ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{autoProbe ? 'Auto 30s: An' : 'Auto 30s: Aus'}</span>
            </button>

            <button
              type="button"
              onClick={handleProbeNow}
              disabled={probing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
              <span>{probing ? 'Messe Latenz...' : 'Latenz jetzt messen'}</span>
            </button>
          </div>
        </div>

        {/* 4-Column Network Telemetry KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800 mt-5 pt-5 border-t border-neutral-800">
          <div className="pb-4 sm:pb-0 sm:pr-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Wifi className="w-3.5 h-3.5 text-sky-400" />
                <span>Aktueller Ping</span>
              </span>
              <span className="text-neutral-500">RTT</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-sky-400">
                {snapshot ? `${snapshot.currentPingMs.toFixed(1)} ms` : '—'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-neutral-400 font-mono tabular-nums">
              {snapshot ? `Min ${snapshot.minPingMs.toFixed(1)} ms · Max ${snapshot.maxPingMs.toFixed(1)} ms` : 'Messung läuft...'}
            </div>
          </div>

          <div className="py-4 sm:py-0 sm:px-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paketverlust</span>
              </span>
              <span className={`font-semibold ${lossStatus.cls}`}>{lossStatus.label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-mono tabular-nums ${lossStatus.cls}`}>
                {snapshot ? `${snapshot.packetLossPercent.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-neutral-400 font-mono tabular-nums">
              {snapshot ? `${snapshot.probesReceived} / ${snapshot.probesSent} Pakete empfangen` : '—'}
            </div>
          </div>

          <div className="py-4 sm:py-0 sm:px-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Jitter (Schwankung)</span>
              <span className="text-neutral-500">Varianz</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                {snapshot ? `${snapshot.jitterMs.toFixed(1)} ms` : '—'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-neutral-400">
              {snapshot?.gamePortReachable
                ? `Game-Port ${snapshot.serverPort} erreichbar`
                : `Host-Node erreichbar (Server offline)`}
            </div>
          </div>

          <div className="pt-4 sm:pt-0 sm:pl-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Niedrigste Regionslatenz</span>
              <span className="text-neutral-500">Optimum</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                {bestRegion ? `${bestRegion.latencyMs.toFixed(1)} ms` : '—'}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-neutral-400 truncate">
              {bestRegion ? `${bestRegion.city} (${bestRegion.countryCode}) · ${bestRegion.regionName}` : '—'}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="bg-rose-950/35 border border-rose-800/70 rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadOverview(false)}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer whitespace-nowrap"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {loading && !snapshot && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="h-4 w-56 bg-neutral-800 rounded animate-pulse mb-4" />
            <div className="h-[260px] bg-neutral-950 rounded-lg animate-pulse" />
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="h-4 w-48 bg-neutral-800 rounded animate-pulse mb-4" />
            <div className="h-[260px] bg-neutral-950 rounded-lg animate-pulse" />
          </div>
        </div>
      )}

      {snapshot && (
        <>
          {/* Charts Row: Regional Latency Comparison + Live Ping Trend */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Geographic Regional Latency Bar Chart */}
            <div className="xl:col-span-7 bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">
                    Geographische Verbindungslatenz nach Regionen
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Antwortzeit (ms) zu internationalen Spielregionen ·{' '}
                    {snapshot.measurementMode === 'live-tcp'
                      ? 'Direkte TCP-Messung'
                      : 'Host-RTT + kalibriertes Glasfaser-Routing'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-emerald-400" />≤30 ms</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-sky-400" />≤65 ms</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-amber-400" />≤120 ms</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-xs bg-rose-400" />&gt;120 ms</span>
                </div>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={snapshot.regions}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#737373"
                      tick={{ fill: '#a3a3a3', fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => `${v} ms`}
                    />
                    <YAxis
                      type="category"
                      dataKey="city"
                      width={90}
                      stroke="#737373"
                      tick={{ fill: '#e5e5e5', fontSize: 12 }}
                      tickLine={false}
                    />
                    <Tooltip content={<RegionTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="latencyMs" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
                      {snapshot.regions.map((reg) => (
                        <Cell key={reg.regionId} fill={getQualityColor(reg.quality)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ping History Trend */}
            <div className="xl:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-neutral-100">
                  Ping- &amp; Jitter-Verlauf
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Letzte {history.length} Latenzmessungen zum Server-Node
                </p>
              </div>

              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#737373"
                      tick={{ fill: '#a3a3a3', fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#737373"
                      tick={{ fill: '#a3a3a3', fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}ms`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0a0a',
                        borderColor: '#404040',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(val: any, name: any) => [
                        `${Number(val || 0).toFixed(1)} ms`,
                        name === 'pingMs' ? 'Ping' : 'Jitter'
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="pingMs"
                      name="pingMs"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#38bdf8' }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="jitterMs"
                      name="jitterMs"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Node: {snapshot.hostName}</span>
                </span>
                <span className="font-mono tabular-nums">{snapshot.hostIp}:{snapshot.serverPort}</span>
              </div>
            </div>
          </div>

          {/* Regional Latency Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-200">
                Regionale Latenz-Matrix ({snapshot.regions.length} Regionen)
              </span>
              <span className="text-neutral-500">Sortiert nach geographischer Entfernung</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/60">
                    <th className="py-2.5 px-5 font-medium">Region</th>
                    <th className="py-2.5 px-4 font-medium">Standort</th>
                    <th className="py-2.5 px-4 font-medium text-right">Latenz</th>
                    <th className="py-2.5 px-4 font-medium text-right">Paketverlust</th>
                    <th className="py-2.5 px-4 font-medium">Bewertung</th>
                    <th className="py-2.5 px-5 font-medium text-right">Messmethode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70">
                  {snapshot.regions.map((reg) => (
                    <tr key={reg.regionId} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-2.5 px-5 font-medium text-neutral-200 whitespace-nowrap">
                        {reg.regionName}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-300 whitespace-nowrap">
                        {reg.city} ({reg.countryCode})
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${getQualityTextClass(reg.quality)}`}>
                        {reg.latencyMs.toFixed(1)} ms
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-neutral-300">
                        {reg.packetLossPercent.toFixed(1)} %
                      </td>
                      <td className={`py-2.5 px-4 font-medium ${getQualityTextClass(reg.quality)}`}>
                        {getQualityLabel(reg.quality)}
                      </td>
                      <td className="py-2.5 px-5 text-right text-neutral-500 font-mono text-[11px] whitespace-nowrap">
                        {reg.measurementMode === 'live-tcp' ? 'Live-TCP' : 'Glasfaser-Basis'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
