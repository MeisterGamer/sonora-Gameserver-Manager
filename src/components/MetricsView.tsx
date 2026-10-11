import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Users, 
  Zap, 
  Clock, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCw, 
  ShieldCheck, 
  Flame,
  Globe,
  Terminal,
  Sparkles
} from 'lucide-react';
import { ServerInstance } from '../types/game';

interface MetricsViewProps {
  server: ServerInstance;
  onSendCommand?: (cmd: string) => void;
  onNotify?: (msg: string) => void;
}

export const MetricsView: React.FC<MetricsViewProps> = ({
  server,
  onSendCommand,
  onNotify
}) => {
  // Simulated dynamic realtime telemetry history
  const [cpuHistory, setCpuHistory] = useState<number[]>([12, 18, 15, 24, 28, 22, 19, 31, 26, 20, 25, 22]);
  const [ramHistory, setRamHistory] = useState<number[]>([42, 43, 44, 46, 48, 47, 49, 51, 50, 48, 52, 50]);
  const [netInHistory, setNetInHistory] = useState<number[]>([120, 180, 240, 310, 190, 280, 340, 290, 410, 320, 280, 310]);
  const [isCleaningGc, setIsCleaningGc] = useState(false);
  const [isTimingReport, setIsTimingReport] = useState(false);

  // Periodic heartbeat animation
  useEffect(() => {
    if (server.status !== 'running') return;
    const interval = setInterval(() => {
      setCpuHistory(prev => {
        const delta = (Math.random() - 0.5) * 8;
        const nextVal = Math.max(5, Math.min(95, Math.round(server.cpuUsagePercent + delta)));
        return [...prev.slice(1), nextVal];
      });
      setNetInHistory(prev => {
        const nextNet = Math.max(80, Math.round(300 + (Math.random() - 0.5) * 150));
        return [...prev.slice(1), nextNet];
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [server.status, server.cpuUsagePercent]);

  const handleForceGc = () => {
    setIsCleaningGc(true);
    if (onSendCommand) onSendCommand('gc');
    setTimeout(() => {
      setIsCleaningGc(false);
      if (onNotify) onNotify('JVM Garbage Collection (G1GC) ausgeführt. 380 MB RAM freigegeben!');
    }, 1200);
  };

  const handleGenerateTimings = () => {
    setIsTimingReport(true);
    if (onSendCommand) onSendCommand('timings report');
    setTimeout(() => {
      setIsTimingReport(false);
      if (onNotify) onNotify('Lag- & Performance-Report generiert: https://timings.aikar.co/apex-report-2026');
    }, 1500);
  };

  const handleSaveAll = () => {
    if (onSendCommand) onSendCommand(server.category === 'minecraft' ? 'save-all' : 'save');
    if (onNotify) onNotify('Welt und Chunks erfolgreich synchron auf Festplatte gesichert.');
  };

  const isMc = server.category === 'minecraft';
  const maxTps = isMc ? 20.0 : 60.0;
  const currentTps = server.tps;
  const tpsHealth = currentTps >= maxTps * 0.95 ? 'excellent' : currentTps >= maxTps * 0.85 ? 'good' : 'degraded';

  // SVG Area path generator
  const generateSvgPath = (data: number[], max: number, width: number = 300, height: number = 60) => {
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - (val / max) * height;
      return `${x},${y}`;
    });
    return `M 0,${height} L ` + points.join(' L ') + ` L ${width},${height} Z`;
  };

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
            <span className="text-xs font-mono font-bold text-sky-400">{server.cpuUsagePercent}%</span>
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
            <span>Kern-Zuweisung: 4 vCores</span>
            <span>Freq: 3.8 GHz Turbo</span>
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
              {(server.ramUsageMb / 1024).toFixed(1)} / {server.allocatedRamGb} GB
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
            <span>Heap: {Math.round(server.ramUsageMb * 0.85)} MB</span>
            <span>Max: {server.allocatedRamGb * 1024} MB</span>
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
                : 'bg-rose-950 text-rose-400 border-rose-800'
            }`}>
              {currentTps} / {maxTps}
            </span>
          </div>

          <div className="my-3 flex flex-col justify-center items-center">
            <div className="text-2xl font-black font-mono tracking-tight text-neutral-100">
              {currentTps.toFixed(1)} <span className="text-xs text-neutral-500 font-normal">TPS</span>
            </div>
            <div className="text-[11px] text-emerald-400 font-medium mt-1">
              MSPT (Tick Time): ~18.4 ms (Optimal)
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>Stabilität: 99.98%</span>
            <span>Ziel: 20.0 TPS</span>
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
              {server.networkInKb} KB/s
            </span>
          </div>

          <div className="my-3 h-12 w-full overflow-hidden">
            <svg viewBox="0 0 300 60" className="w-full h-full">
              <path
                d={generateSvgPath(netInHistory, 600, 300, 60)}
                fill="rgba(251, 191, 36, 0.15)"
                stroke="#fbbf24"
                strokeWidth="2"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>Inbound: {server.networkInKb} KB/s</span>
            <span>Outbound: {server.networkOutKb} KB/s</span>
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
            disabled={isCleaningGc || server.status !== 'running'}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 shrink-0">
              <RotateCw className={`w-4 h-4 ${isCleaningGc ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Garbage Collection erzwingen</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">JVM Ram säubern & ungenutzte Heap-Objekte freigeben</div>
            </div>
          </button>

          <button
            onClick={handleSaveAll}
            disabled={server.status !== 'running'}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Sofortige Welt-Sicherung</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Chunks & Spielerdaten synchron auf NVMe flashen</div>
            </div>
          </button>

          <button
            onClick={handleGenerateTimings}
            disabled={isTimingReport || server.status !== 'running'}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800/60 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200">Lag- & Timings-Report</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Detaillierte Analyse aller Entitäten, Ticks & Mods</div>
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
              <span>NVMe Speicher-Verteilung</span>
            </h4>
            <span className="text-xs font-mono text-neutral-400">
              {(server.diskUsageMb / 1024).toFixed(2)} GB Gesamt
            </span>
          </div>

          <div className="w-full bg-neutral-950 h-3 rounded-full overflow-hidden flex mb-4 border border-neutral-800">
            <div className="bg-emerald-500 h-full" style={{ width: '60%' }} title="Welt & Kartendaten (60%)" />
            <div className="bg-purple-500 h-full" style={{ width: '25%' }} title="Mods & Plugins (25%)" />
            <div className="bg-sky-500 h-full" style={{ width: '10%' }} title="Server Core & Binaries (10%)" />
            <div className="bg-amber-500 h-full" style={{ width: '5%' }} title="Logs & Crash-Reports (5%)" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Welten & Dimensionen: ~1.8 GB</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>Mods & Erweiterungen: ~540 MB</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>Server-Jar & Binaries: ~120 MB</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Logs & Backups: ~85 MB</span>
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
              <span className="font-mono text-neutral-200">#49102 (Isolated Cgroup)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Java / Laufzeitumgebung</span>
              <span className="font-mono text-neutral-200">{server.javaVersion || 'OpenJDK 21.0.3 (GraalVM / Aikar Flags)'}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">Aktive OS-Threads</span>
              <span className="font-mono text-neutral-200">38 Threads (Pool size: 64)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800/80">
              <span className="text-neutral-400">DDoS-Schutz Status</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Voxility / Corero 2.4 Tbps Aktiv</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
