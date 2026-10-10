import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, Trash2, Download, ArrowDown, Play, Square, RotateCw } from 'lucide-react';
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
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onSendCommand(commandInput.trim());
    setCommandInput('');
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
    ? ['list', 'tps', 'save-all', 'say Hallo Welt!', 'whitelist list']
    : ['status', 'save', 'say Wartung in 10 Min', 'rcon status', 'players'];

  return (
    <div className="flex flex-col h-[600px] bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden shadow-inner">
      {/* Top Console Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-neutral-200">Live Server-Konsole & Terminal</span>
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
            className={`p-1.5 rounded transition-colors ${autoScroll ? 'text-emerald-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'}`}
            title={autoScroll ? 'Auto-Scroll aktiv' : 'Auto-Scroll pausiert'}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClearLogs}
            className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors"
            title="Konsole leeren"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDownloadLogs}
            className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded hover:bg-neutral-800 transition-colors"
            title="Logdatei herunterladen"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Output Stream */}
      <div 
        ref={logContainerRef}
        className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 select-text bg-neutral-950"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-neutral-600 italic">
            Konsole ist bereit. Starte den Server, um Live-Logs zu empfangen.
          </div>
        ) : (
          logs.map((log) => {
            let levelColor = 'text-neutral-300';
            let badgeColor = 'text-neutral-400';
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
                <span className="text-neutral-500 shrink-0 select-none">[{log.timestamp}]</span>
                <span className={`shrink-0 select-none ${badgeColor}`}>[{log.level}]</span>
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

      {/* Interactive Command Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2.5 bg-neutral-900 border-t border-neutral-800">
        <span className="text-emerald-500 font-mono font-bold text-sm pl-2 select-none">&gt;</span>
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder={isRunning ? "Befehl eingeben (z. B. 'help', 'list', 'tps', 'say Text')..." : "Server ist offline – starte den Server, um Befehle auszuführen"}
          disabled={!isRunning}
          className="flex-1 bg-transparent text-neutral-100 placeholder-neutral-500 text-xs font-mono focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isRunning || !commandInput.trim()}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <span>Senden</span>
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
