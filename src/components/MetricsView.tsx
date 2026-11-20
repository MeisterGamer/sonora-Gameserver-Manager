import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  CheckCircle2,
  RotateCw,
  ShieldCheck,
  Flame,
  Sparkles,
  Coffee
} from 'lucide-react';
import { ServerInstance } from '../types/game';

interface MetricsViewProps {
  server: ServerInstance;
  onSendCommand?: (cmd: string) => void;
  onNotify?: (msg: string) => void;
  onOpenJavaModal?: () => void;
}

interface DiskBreakdown {
  worldsBytes: number;
  modsBytes: number;
  coreBytes: number;
  logsBytes: number;
  otherBytes: number;
  totalBytes: number;
  totalMb: number;
}

interface LiveStatsPayload {
  running: boolean;
  pid: number | null;
  threads: number | null;
  hostIp: string;
  hostName: string;
  cpuCores: number;
  diskUsageMb: number;
  diskBreakdown?: DiskBreakdown;
  cpuUsagePercent: number;
  ramUsageMb: number;
  tps: number;
  networkInKb: number;
  networkOutKb: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const MetricsView: React.FC<MetricsViewProps> = ({
  server,
  onSendCommand,
  onNotify,
  onOpenJavaModal
}) => {
  const initialCpu = server.status === 'running' ? Math.round(server.cpuUsagePercent || 0) : 0;
  const maxRamMb = Math.max(1024, (server.allocatedRamGb || 4) * 1024);
  const initialRamPct = server.status === 'running' ? Math.min(100, Math.round(((server.ramUsageMb || 0) / maxRamMb) * 100)) : 0;
  const initialNet = server.status === 'running' ? Math.round(server.networkInKb || 0) : 0;

  const [cpuHistory, setCpuHistory] = useState<number[]>(() => Array(12).fill(initialCpu));
  const [ramHistory, setRamHistory] = useState<number[]>(() => Array(12).fill(initialRamPct));
  const [netInHistory, setNetInHistory] = useState<number[]>(() => Array(12).fill(initialNet));
  const [liveStats, setLiveStats] = useState<LiveStatsPayload | null>(null);
  const [actionBusy, setActionBusy] = useState<'gc' | 'timings' | null>(null);

  useEffect(() => {
    let active = true;
    const cpuVal = server.status === 'running' ? Math.round(server.cpuUsagePercent || 0) : 0;
    const ramVal = server.status === 'running' ? Math.min(100, Math.round(((server.ramUsageMb || 0) / maxRamMb) * 100)) : 0;
    const netVal = server.status === 'running' ? Math.round(server.networkInKb || 0) : 0;
    setCpuHistory(Array(12).fill(cpuVal));
    setRamHistory(Array(12).fill(ramVal));
    setNetInHistory(Array(12).fill(netVal));

    const pollStats = async () => {
      try {
        const res = await fetch(`/api/servers/${server.id}/stats`, { credentials: 'same-origin' });
        if (!res.ok) return;
        const data: LiveStatsPayload = await res.json();
        if (!active) return;
        setLiveStats(data);
        const nextCpu = Math.max(0, Math.min(100, Number(data.cpuUsagePercent || 0)));
        const nextRamPct = Math.max(0, Math.min(100, Math.round(((data.ramUsageMb || 0) / maxRamMb) * 100)));
        const nextNet = Math.max(0, Number(data.networkInKb || 0));
        setCpuHistory(prev => [...prev.slice(1), nextCpu]);
        setRamHistory(prev => [...prev.slice(1), nextRamPct]);
        setNetInHistory(prev => [...prev.slice(1), nextNet]);
      } catch {
        // Keep last valid state on transient poll error
      }
    };

    pollStats();
    const interval = setInterval(pollStats, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [server.id, maxRamMb]);

  const handleForceGc = () => {
    if (!onSendCommand || server.status !== 'running') return;
    setActionBusy('gc');
    const cmd = server.category === 'minecraft' ? 'gc' : 'status';
    onSendCommand(cmd);
    onNotify?.(`Befehl "${cmd}" an den Server-Prozess übermittelt (Ausgabe in der Konsole).`);
    setTimeout(() => setActionBusy(null), 500);
  };

  const handleGenerateTimings = () => {
    if (!onSendCommand || server.status !== 'running') return;
    setActionBusy('timings');
    const cmd = server.category === 'minecraft' ? 'timings report' : 'stats';
    onSendCommand(cmd);
    onNotify?.(`Diagnose-Befehl "${cmd}" an den Server gesendet. Prüfe die Live-Konsole auf das Ergebnis.`);
    setTimeout(() => setActionBusy(null), 500);
  };

  const handleSaveAll = () => {
    if (!onSendCommand || server.status !== 'running') return;
    const cmd = server.category === 'minecraft' ? 'save-all' : 'save';
    onSendCommand(cmd);
    onNotify?.(`Speicherbefehl "${cmd}" an den laufenden Server übermittelt.`);
  };

  const isRunning = liveStats ? liveStats.running : server.status === 'running';
  const cpuPercent = liveStats ? liveStats.cpuUsagePercent : (isRunning ? server.cpuUsagePercent : 0);
  const ramMb = liveStats ? liveStats.ramUsageMb : (isRunning ? server.ramUsageMb : 0);
  const netInKb = liveStats ? liveStats.networkInKb : (isRunning ? server.networkInKb : 0);
  const netOutKb = liveStats ? liveStats.networkOutKb : (isRunning ? server.networkOutKb : 0);
  const currentTps = isRunning ? (liveStats?.tps ?? server.tps ?? 20.0) : 0;

  const isMc = server.category === 'minecraft';
  const maxTps = isMc ? 20.0 : 60.0;
  const tpsHealth = !isRunning
    ? 'offline'
    : currentTps >= maxTps * 0.95
    ? 'excellent'
    : currentTps >= maxTps * 0.85
    ? 'good'
    : 'degraded';

  const breakdown = liveStats?.diskBreakdown;
  const totalDiskBytes = breakdown?.totalBytes || 0;
  const totalDiskMb = liveStats?.diskUsageMb ?? server.diskUsageMb ?? 0;

  const worldsBytes = breakdown?.worldsBytes ?? 0;
  const modsBytes = breakdown?.modsBytes ?? 0;
  const coreBytes = breakdown?.coreBytes ?? 0;
  const logsBytes = (breakdown?.logsBytes ?? 0) + (breakdown?.otherBytes ?? 0);

  const pct = (part: number) => (totalDiskBytes > 0 ? Math.max(part > 0 ? 2 : 0, Math.round((part / totalDiskBytes) * 100)) : 0);
  const worldsPct = pct(worldsBytes);
  const modsPct = pct(modsBytes);
  const corePct = pct(coreBytes);
  const logsPct = totalDiskBytes > 0 ? Math.max(0, 100 - worldsPct - modsPct - corePct) : 0;

  const generateSvgPath = (data: number[], max: number, width: number = 300, height: number = 60) => {
    const safeMax = Math.max(1, max);
    const points = data.map((val, idx) => {
      const x = (idx / Math.max(1, data.length - 1)) * width;
      const clamped = Math.max(0, Math.min(safeMax, val));
      const y = height - (clamped / safeMax) * height;
      return `${x},${y}`;
    });
    return `M 0,${height} L ` + points.join(' L ') + ` L ${width},${height} Z`;
  };

  const netChartMax = Math.max(100, ...netInHistory);

  return (
    <div className="space-y-6">
      {/* Top Telemetry Header Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>Prozessor (vCPU)</span>
            </span>
            <span className="text-xs font-mono font-bold text-sky-400">{cpuPercent.toFixed(1)}%</span>
          </div>

          <div className="my-3 h-12 w-full overflow-hidden">
            <svg viewBox="0 0 300 60" className="w-full h-full preserve-3d">
              <path
                d={generateSvgPath(cpuHistory, 100, 300, 60)}
                fill="rgba(56, 189, 248, 0.15)"
                stroke="#38bdf8"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>Host-Kerne: {liveStats?.cpuCores ?? '-'} vCores</span>
            <span>Status: {isRunning ? 'Aktiv' : 'Idle'}</span>
          </div>
        </div>

        {/* RAM Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Arbeitsspeicher (RAM)</span>
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {(ramMb / 1024).toFixed(2)} / {server.allocatedRamGb} GB
            </span>
          </div>

          <div className="my-3 h-12 w-full overflow-hidden">
            <svg viewBox="0 0 300 60" className="w-full h-full">
              <path
                d={generateSvgPath(ramHistory, 100, 300, 60)}
                fill="rgba(52, 211, 153, 0.15)"
                stroke="#34d399"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>RSS: {Math.round(ramMb)} MB</span>
            <span>Limit: {server.allocatedRamGb * 1024} MB</span>
          </div>
        </div>

        {/* TPS / Tickrate Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-purple-400" />
              <span>{isMc ? 'Tickrate (TPS)' : 'Server Tickrate'}</span>
            </span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
              tpsHealth === 'excellent'
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : tpsHealth === 'good'
                ? 'bg-amber-950 text-amber-400 border-amber-800'
                : tpsHealth === 'offline'
                ? 'bg-neutral-950 text-neutral-400 border-neutral-800'
                : 'bg-rose-950 text-rose-400 border-rose-800'
            }`}>
              {currentTps.toFixed(1)} / {maxTps}
            </span>
          </div>

          <div className="my-3 flex flex-col justify-center items-center">
            <div className="text-2xl font-black font-mono tracking-tight text-neutral-100">
              {currentTps.toFixed(1)} <span className="text-xs text-neutral-500 font-normal">TPS</span>
            </div>
            <div className="text-[11px] text-neutral-400 font-medium mt-1">
              {isRunning
                ? currentTps > 0
                  ? `Tick-Intervall: ${(1000 / Math.max(1, currentTps)).toFixed(1)} ms`
                  : 'Warte auf Tick-Messung'
                : 'Server ist gestoppt'}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>Status: {isRunning ? 'Live' : 'Offline'}</span>
            <span>Ziel: {maxTps.toFixed(1)} TPS</span>
          </div>
        </div>

        {/* Network Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-amber-400" />
              <span>Netzwerk I/O</span>
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">
              {netInKb} KB/s
            </span>
          </div>

          <div className="my-3 h-12 w-full overflow-hidden">
            <svg viewBox="0 0 300 60" className="w-full h-full">
              <path
                d={generateSvgPath(netInHistory, netChartMax, 300, 60)}
                fill="rgba(251, 191, 36, 0.15)"
                stroke="#fbbf24"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>Inbound: {netInKb} KB/s</span>
            <span>Outbound: {netOutKb} KB/s</span>
          </div>
        </div>
      </div>

      {/* Quick Diagnostics & Performance Actions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-neutral-100 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>Echtzeit-Optimierung & Server-Aktionen</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleForceGc}
            disabled={actionBusy === 'gc' || !isRunning}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 shrink-0">
              <RotateCw className={`w-4 h-4 ${actionBusy === 'gc' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Garbage Collection ausführen</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Sendet Speicherbefehl an den laufenden Prozess</div>
            </div>
          </button>

          <button
            onClick={handleSaveAll}
            disabled={!isRunning}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Sofortige Welt-Sicherung</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Sendet save-all / save an die Konsole</div>
            </div>
          </button>

          <button
            onClick={handleGenerateTimings}
            disabled={actionBusy === 'timings' || !isRunning}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800/60 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Lag- & Timings-Report</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Triggert Profiler/Timings im Server-Terminal</div>
            </div>
          </button>
        </div>
      </div>

      {/* Storage Breakdown & System Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Storage Distribution */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <span>Reale Speicher-Verteilung</span>
            </h4>
            <span className="text-xs font-mono text-neutral-400">
              {totalDiskMb >= 1024 ? `${(totalDiskMb / 1024).toFixed(2)} GB` : `${totalDiskMb} MB`} Gesamt
            </span>
          </div>

          <div className="w-full bg-neutral-950 h-3 rounded-full overflow-hidden flex mb-4 border border-neutral-800">
            {totalDiskBytes > 0 ? (
              <>
                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${worldsPct}%` }} title={`Welten & Kartendaten (${worldsPct}%)`} />
                <div className="bg-purple-500 h-full transition-all" style={{ width: `${modsPct}%` }} title={`Mods & Plugins (${modsPct}%)`} />
                <div className="bg-sky-500 h-full transition-all" style={{ width: `${corePct}%` }} title={`Server Core & Binaries (${corePct}%)`} />
                <div className="bg-amber-500 h-full transition-all" style={{ width: `${logsPct}%` }} title={`Logs & Konfigurationsdateien (${logsPct}%)`} />
              </>
            ) : (
              <div className="bg-neutral-800 h-full w-full" title="Noch keine Dateien im Instanzverzeichnis" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Welten & Maps: <strong className="font-mono">{formatBytes(worldsBytes)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
              <span>Mods & Plugins: <strong className="font-mono">{formatBytes(modsBytes)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
              <span>Server-Core & Jars: <strong className="font-mono">{formatBytes(coreBytes)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>Logs & Sonstiges: <strong className="font-mono">{formatBytes(logsBytes)}</strong></span>
            </div>
          </div>
        </div>

        {/* Runtime & Process Inspector */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Laufzeit- & Prozess-Inspektor</span>
          </h4>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Prozess-ID (PID)</span>
              <span className="font-mono text-neutral-200">
                {liveStats?.pid ? `#${liveStats.pid} (${liveStats.hostName})` : 'Offline (Kein Prozess)'}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <div className="flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-neutral-400">Java / Laufzeitumgebung</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-neutral-200">
                  {server.javaVersion || (server.category === 'minecraft' ? 'Java 21' : server.targetOS)}
                </span>
                {server.category === 'minecraft' && onOpenJavaModal && (
                  <button
                    onClick={onOpenJavaModal}
                    className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold border border-neutral-700 transition-colors cursor-pointer"
                  >
                    Verwalten
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Aktive OS-Threads</span>
              <span className="font-mono text-neutral-200">
                {liveStats?.threads !== null && liveStats?.threads !== undefined
                  ? `${liveStats.threads} Threads (${liveStats.cpuCores} Host-Kerne)`
                  : isRunning
                  ? `Aktiv (${liveStats?.cpuCores ?? '-'} Host-Kerne)`
                  : `0 Threads`}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Host-Adresse & Port</span>
              <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{liveStats?.hostIp || '127.0.0.1'}:{server.port}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
