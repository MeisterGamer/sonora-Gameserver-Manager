import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Send, 
  Trash2, 
  Download, 
  ArrowDown, 
  Play, 
  Square, 
  RotateCw,
  Search,
  Filter,
  SlidersHorizontal,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Server,
  Coffee,
  Copy,
  Check,
  Folder,
  FileText,
  Activity
} from 'lucide-react';
import { ServerInstance, LogMessage } from '../types/game';

interface ConsoleViewProps {
  server: ServerInstance;
  onSendCommand: (cmd: string) => void;
  logs: LogMessage[];
  onClearLogs: () => void;
  onStartServer: () => void;
  onStopServer: () => void;
  onRestartServer: () => void;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({
  server,
  onSendCommand,
  logs,
  onClearLogs,
  onStartServer,
  onStopServer,
  onRestartServer
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'>('ALL');
  
  // Host Diagnostics & Real File State
  const [showDiag, setShowDiag] = useState(false);
  const [hostDiag, setHostDiag] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isInstallingServer, setIsInstallingServer] = useState(false);
  const [installSuccessMsg, setInstallSuccessMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Command History (Up / Down arrow key cycling)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch host diagnostics on load or toggle
  const fetchDiagnostics = async () => {
    setIsDiagnosing(true);
    try {
      const res = await fetch('/api/system/diagnostics');
      if (res.ok) {
        const data = await res.json();
        setHostDiag(data);
      }
    } catch {
      // preview environment
    } finally {
      setIsDiagnosing(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [server.id]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleInstallServer = async () => {
    setIsInstallingServer(true);
    setInstallSuccessMsg(null);
    try {
      const res = await fetch(`/api/servers/${server.id}/install`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: server.category,
          version: server.version,
          steamAppId: server.steamAppId,
          port: server.port
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInstallSuccessMsg(data.message || (server.category === 'minecraft' 
          ? `PaperMC ${data.version || server.version} installiert. EULA im Dateimanager ausdrücklich akzeptieren.`
          : `${server.gameName} erfolgreich via SteamCMD bereitgestellt!`));
        fetchDiagnostics();
      } else {
        alert(data.error || 'Installation fehlgeschlagen.');
      }
    } catch (e: any) {
      alert(`Fehler bei der Installation: ${e.message}`);
    } finally {
      setIsInstallingServer(false);
    }
  };

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = commandInput.trim();
    if (!clean) return;
    onSendCommand(clean);
    setHistory(prev => [clean, ...prev.filter(h => h !== clean)].slice(0, 50));
    setHistoryIndex(-1);
    setCommandInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIdx);
        setCommandInput(history[nextIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommandInput(history[nextIdx] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  const handleDownloadLogs = () => {
    const content = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server.id}_console_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRunning = server.status === 'running';

  const quickCommands = server.category === 'minecraft'
    ? ['list', 'tps', 'save-all', 'say Hallo Server!', 'whitelist list', 'gamerule keepInventory true', 'timings report']
    : ['status', 'save', 'say Wartungsarbeiten!', 'rcon status', 'players', 'sv_lan 0'];

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-[620px] bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden shadow-inner">
      {/* Top Console Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 text-xs gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-neutral-200">Interactive RCON / Terminal</span>
          <span className="text-neutral-500">·</span>
          <span className="font-mono text-neutral-400">{server.name} ({server.version})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Power Controls */}
          {server.status === 'offline' ? (
            <button
              onClick={onStartServer}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-xs font-medium cursor-pointer transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Starten</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onRestartServer}
                disabled={server.status !== 'running'}
                className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                title="Neustarten"
              >
                <RotateCw className="w-3 h-3" />
                <span>Neustart</span>
              </button>
              <button
                onClick={onStopServer}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 rounded text-xs font-medium cursor-pointer transition-colors"
                title="Server stoppen"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stoppen</span>
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Host Diagnostics Toggle */}
          <button
            onClick={() => setShowDiag(!showDiag)}
            className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 cursor-pointer font-medium ${
              showDiag 
                ? 'bg-amber-950/80 text-amber-300 border border-amber-800' 
                : hostDiag?.java?.installed === false
                ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                : 'bg-neutral-800 text-neutral-300 hover:text-white'
            }`}
            title="Dedicated Host-Diagnose & Problembehebung"
          >
            {hostDiag?.java?.installed === false ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Server-Diagnose</span>
            {hostDiag?.java?.installed === false && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </button>

          <button
            onClick={handleInstallServer}
            disabled={isInstallingServer}
            className="px-2.5 py-1 rounded text-xs bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5 cursor-pointer font-medium transition-colors"
            title="Server-Dateien jetzt herunterladen & einrichten (PaperMC / SteamCMD)"
          >
            {isInstallingServer ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden sm:inline">Server installieren</span>
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer ${
              autoScroll ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Auto-Scroll an/aus"
          >
            <ArrowDown className="w-3 h-3" />
            <span className="hidden sm:inline">Auto-Scroll</span>
          </button>

          <button
            onClick={handleDownloadLogs}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
            title="Logs als Textdatei exportieren"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
            title="Konsole leeren"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="px-3 py-1.5 bg-neutral-900/80 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-500">Filter:</span>
          {(['ALL', 'INFO', 'WARN', 'ERROR', 'SUCCESS'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                filterLevel === lvl
                  ? lvl === 'ERROR' ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : lvl === 'WARN' ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : lvl === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-800/60'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3 h-3 text-neutral-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="In Logs suchen..."
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="pl-7 pr-2.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded text-[11px] text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-700 w-36 sm:w-48"
          />
        </div>
      </div>

      {/* Host Diagnostics & Problembehebung Panel */}
      {(showDiag || hostDiag?.java?.installed === false) && (
        <div className="p-3.5 bg-neutral-900/95 border-b border-neutral-800 space-y-3 text-xs animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-neutral-100">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Dedicated Server Diagnose & Verbindungshilfe</span>
              {hostDiag && (
                <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                  Host: {hostDiag.hostName} ({hostDiag.platform})
                </span>
              )}
            </div>
            <button
              onClick={() => setShowDiag(false)}
              className="text-neutral-500 hover:text-neutral-300 text-xs cursor-pointer"
            >
              Schließen ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Java Check Card */}
            <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
              hostDiag?.java?.installed === false 
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-200' 
                : 'bg-neutral-950/70 border-neutral-800 text-neutral-300'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold flex items-center gap-1.5 text-xs">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    <span>Java Runtime auf Ubuntu Host</span>
                  </span>
                  {hostDiag?.java?.installed ? (
                    <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-800">
                      ✓ Installiert ({hostDiag.java.version})
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono bg-rose-950 text-rose-300 px-1.5 py-0.2 rounded border border-rose-800 font-bold">
                      ✗ Nicht installiert!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 leading-tight">
                  {hostDiag?.java?.installed 
                    ? `Java ist betriebsbereit. Version: ${hostDiag.java.version}` 
                    : 'Die Instanz verwendet ihr separat gewähltes JDK; Host-Java ist nur eine Diagnose.'}
                </p>
              </div>

              {hostDiag?.java?.installed === false && (
                <div className="mt-2 flex items-center justify-between gap-2 p-1.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] font-mono">
                  <span className="text-neutral-200 truncate">sudo apt install -y openjdk-21-jre-headless</span>
                  <button
                    onClick={() => handleCopy('sudo apt update && sudo apt install -y openjdk-21-jre-headless', 'java')}
                    className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white shrink-0 cursor-pointer"
                    title="Befehl kopieren"
                  >
                    {copiedKey === 'java' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>

            {/* Port & Firewall Check Card */}
            <div className="p-2.5 rounded-lg border bg-neutral-950/70 border-neutral-800 text-neutral-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold flex items-center gap-1.5 text-xs">
                    <ShieldAlert className="w-3.5 h-3.5 text-sky-400" />
                    <span>Firewall Port 25565 (Minecraft)</span>
                  </span>
                  <span className="text-[10px] font-mono bg-neutral-900 text-neutral-300 px-1.5 py-0.2 rounded border border-neutral-700">
                    Port {server.port || 25565}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-tight">
                  Auf Ubuntu blockiert UFW oft Ports. Gib Port 25565 per SSH frei:
                </p>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 p-1.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] font-mono">
                <span className="text-neutral-200 truncate">sudo ufw allow {server.port || 25565}/tcp</span>
                <button
                  onClick={() => handleCopy(`sudo ufw allow ${server.port || 25565}/tcp && sudo ufw reload`, 'ufw')}
                  className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white shrink-0 cursor-pointer"
                  title="Befehl kopieren"
                >
                  {copiedKey === 'ufw' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          {/* Server JAR & Log File Paths Card */}
          <div className="p-2.5 bg-neutral-950/80 rounded-lg border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <span className="font-semibold text-neutral-200 block text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Log-Dateien auf dem Server & JAR-Setup</span>
              </span>
              <span className="text-[11px] text-neutral-400 block mt-0.5">
                Speicherort der Logs: <code className="text-emerald-400 font-mono">data/servers/{server.id}/logs/latest.log</code>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleCopy(`tail -f data/servers/${server.id}/logs/latest.log`, 'logtail')}
                className="flex items-center gap-1 px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded text-[11px] border border-neutral-700 cursor-pointer"
                title="SSH-Befehl kopieren, um Logs live im Terminal mitzulesen"
              >
                {copiedKey === 'logtail' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>tail -f Befehl</span>
              </button>

              <button
                onClick={handleInstallServer}
                disabled={isInstallingServer}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shadow-sm"
              >
                {isInstallingServer ? (
                  <>
                    <RotateCw className="w-3 h-3 animate-spin" />
                    <span>Installiere {server.category === 'minecraft' ? 'PaperMC' : 'SteamCMD'}...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" />
                    <span>{server.category === 'minecraft' ? 'PaperMC JAR & EULA bereitstellen' : `${server.gameName} via SteamCMD installieren`}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {installSuccessMsg && (
            <div className="p-2 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[11px] flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{installSuccessMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Prominent Warning & 1-Click Install Banner if server has no files on disk */}
      {hostDiag?.servers && (() => {
        const diskEntry = hostDiag.servers.find((s: any) => s.id === server.id);
        if (diskEntry && !diskEntry.hasJar && !diskEntry.hasExec) {
          return (
            <div className="mx-3 my-2 p-3 bg-gradient-to-r from-amber-950/80 via-neutral-900 to-neutral-950 border border-amber-700/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-neutral-100 flex items-center gap-1.5">
                    <span>Server-Dateien noch nicht installiert</span>
                    <span className="px-1.5 py-0.2 bg-amber-950 text-amber-300 rounded text-[10px] border border-amber-800">
                      {server.category === 'minecraft' ? 'Keine Server-JAR' : 'Keine Game-Binaries'}
                    </span>
                  </h4>
                  <p className="text-neutral-400 text-[11px] mt-0.5 leading-snug">
                    {server.category === 'minecraft'
                      ? 'Lade die offizielle PaperMC Server-JAR mit 1 Klick herunter. EULA wird automatisch akzeptiert.'
                      : server.steamAppId
                      ? `Lade ${server.gameName} (Steam AppID ${server.steamAppId}) über SteamCMD automatisch herunter.`
                      : 'Initialisiere die Server-Dateien auf deinem Linux Host.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleInstallServer}
                disabled={isInstallingServer}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-md shadow-emerald-900/40"
              >
                {isInstallingServer ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Lade herunter...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Jetzt mit 1 Klick installieren</span>
                  </>
                )}
              </button>
            </div>
          );
        }
        return null;
      })()}

      {/* Terminal Output Area */}
      <div 
        ref={logContainerRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1 select-text scrollbar-thin scrollbar-thumb-neutral-800"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-neutral-500 italic py-8 text-center">
            {logs.length === 0 ? 'Keine Konsolennachrichten vorhanden. Starte den Server, um Live-Logs zu empfangen.' : 'Keine Treffer für den aktuellen Filter.'}
          </div>
        ) : (
          filteredLogs.map((log) => {
            let levelColor = 'text-neutral-300';
            let badgeColor = 'text-neutral-500';

            if (log.level === 'WARN') {
              levelColor = 'text-amber-300';
              badgeColor = 'text-amber-400 font-semibold';
            } else if (log.level === 'ERROR') {
              levelColor = 'text-rose-400';
              badgeColor = 'text-rose-500 font-bold';
            } else if (log.level === 'SUCCESS') {
              levelColor = 'text-emerald-300';
              badgeColor = 'text-emerald-400 font-semibold';
            }

            return (
              <div key={log.id} className="leading-relaxed hover:bg-neutral-900/40 px-1 rounded flex items-start gap-2">
                <span className="text-neutral-600 shrink-0 select-none text-[11px]">[{log.timestamp}]</span>
                <span className={`shrink-0 select-none text-[11px] ${badgeColor}`}>[{log.level}]</span>
                <span className={`break-all ${levelColor}`}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Command Suggestions */}
      <div className="px-3 py-1.5 bg-neutral-900/60 border-t border-neutral-800/80 flex items-center gap-2 overflow-x-auto text-[11px]">
        <span className="text-neutral-500 shrink-0 font-medium">Befehle:</span>
        {quickCommands.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => onSendCommand(cmd)}
            disabled={!isRunning}
            className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Interactive Command Input Form with Up/Down Arrow cycling */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2.5 bg-neutral-900 border-t border-neutral-800">
        <span className="text-emerald-500 font-mono font-bold text-sm pl-2 select-none">&gt;</span>
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Befehl eingeben (Pfeiltasten ↑ / ↓ für Historie)..." : "Server ist offline – starte den Server, um Befehle auszuführen"}
          disabled={!isRunning}
          className="flex-1 bg-transparent text-neutral-100 placeholder-neutral-500 text-xs font-mono focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isRunning || !commandInput.trim()}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer shadow-sm shadow-emerald-600/30"
        >
          <span>Senden</span>
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
