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
  Sparkles
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
  
  // Command History (Up / Down arrow key cycling)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const logContainerRef = useRef<HTMLDivElement>(null);

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
