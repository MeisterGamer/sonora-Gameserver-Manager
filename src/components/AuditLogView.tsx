import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Terminal, 
  FileEdit, 
  RotateCw, 
  Play, 
  Square, 
  Zap, 
  Archive,
  Package,
  Radio
} from 'lucide-react';
import { ServerAuditLog, ServerInstance } from '../types/game';

interface AuditLogViewProps {
  server: ServerInstance;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ server }) => {
  const [logs, setLogs] = useState<ServerAuditLog[]>([
    {
      id: 'aud_1',
      serverId: server.id,
      action: 'start',
      user: 'admin (Max)',
      details: `Server-Instanz "${server.name}" gestartet (Port: ${server.port}, RAM: ${server.allocatedRamGb}GB)`,
      timestamp: 'Vor 15 Minuten',
      severity: 'success'
    },
    {
      id: 'aud_2',
      serverId: server.id,
      action: 'mod_install',
      user: 'admin (Max)',
      details: 'Mod "Dynmap" v3.7-beta erfolgreich installiert',
      timestamp: 'Vor 45 Minuten',
      severity: 'info'
    },
    {
      id: 'aud_3',
      serverId: server.id,
      action: 'config_edit',
      user: 'developer (Sarah)',
      details: 'Datei "server.properties" editiert: view-distance von 10 auf 14 geändert',
      timestamp: 'Gestern 19:42',
      severity: 'info'
    },
    {
      id: 'aud_4',
      serverId: server.id,
      action: 'backup',
      user: 'System-Cron',
      details: `Automatische Welt-Sicherung erfolgreich erstellt (${server.id}_world_full.tar.gz)`,
      timestamp: 'Gestern 12:00',
      severity: 'success'
    },
    {
      id: 'aud_5',
      serverId: server.id,
      action: 'command',
      user: 'moderator (Tim)',
      details: 'RCON-Befehl ausgeführt: "/say Wartungsarbeiten in 15 Minuten"',
      timestamp: 'Gestern 11:45',
      severity: 'info'
    },
    {
      id: 'aud_6',
      serverId: server.id,
      action: 'restart',
      user: 'System-Watchdog',
      details: 'Automatischer Neustart wegen RAM-Schwellenwert (Auto-Restart getriggert)',
      timestamp: 'Vor 2 Tagen',
      severity: 'warning'
    },
    {
      id: 'aud_7',
      serverId: server.id,
      action: 'port_change',
      user: 'admin (Max)',
      details: `Zusätzlichen Dynmap Web-Port 8123 (TCP) reserviert`,
      timestamp: 'Vor 3 Tagen',
      severity: 'info'
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'info' | 'warning' | 'success'>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = selectedSeverity === 'all' || log.severity === selectedSeverity;
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;

    return matchesSearch && matchesSeverity && matchesAction;
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'start': return <Play className="w-3.5 h-3.5 text-emerald-400" />;
      case 'stop': return <Square className="w-3.5 h-3.5 text-rose-400" />;
      case 'restart': return <RotateCw className="w-3.5 h-3.5 text-amber-400" />;
      case 'kill': return <Zap className="w-3.5 h-3.5 text-rose-500" />;
      case 'config_edit': return <FileEdit className="w-3.5 h-3.5 text-sky-400" />;
      case 'mod_install':
      case 'mod_uninstall': return <Package className="w-3.5 h-3.5 text-purple-400" />;
      case 'backup': return <Archive className="w-3.5 h-3.5 text-emerald-400" />;
      case 'command': return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
      case 'port_change': return <Radio className="w-3.5 h-3.5 text-indigo-400" />;
      default: return <Info className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const getSeverityBadge = (severity: 'info' | 'warning' | 'success') => {
    switch (severity) {
      case 'success':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">Erfolg</span>;
      case 'warning':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">Warnung</span>;
      case 'info':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">Info</span>;
    }
  };

  const handleExportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `audit_log_${server.id}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-100">Audit-Log & Aktivitätsprotokoll</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Vollständige Historie aller Benutzeraktionen, Konfigurationsänderungen, Backups und Systemereignisse.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportieren (JSON)</span>
            </button>
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-rose-950/60 text-neutral-400 hover:text-rose-300 border border-neutral-800 text-xs font-medium cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Leeren</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between text-xs">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Aktivitäten, Benutzer oder Befehle durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Alle Schweregrade</option>
            <option value="info">Info</option>
            <option value="warning">Warnungen</option>
            <option value="success">Erfolge</option>
          </select>

          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Alle Aktionen</option>
            <option value="start">Server Start</option>
            <option value="stop">Server Stop</option>
            <option value="restart">Neustart</option>
            <option value="config_edit">Config Bearbeitung</option>
            <option value="mod_install">Mod Installation</option>
            <option value="backup">Backup Erstellung</option>
            <option value="command">Befehl ausgeführt</option>
            <option value="port_change">Port geändert</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            Keine Protokolleinträge gefunden, die den Filtern entsprechen.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-800/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5">
                    {getActionIcon(log.action)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-neutral-200">{log.user}</span>
                      <span className="text-[11px] font-mono text-neutral-500">· {log.timestamp}</span>
                      {getSeverityBadge(log.severity)}
                    </div>
                    <div className="text-xs text-neutral-300 mt-1 font-mono break-all">
                      {log.details}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] font-mono uppercase text-neutral-500 bg-neutral-950 px-2 py-1 rounded border border-neutral-800">
                    {log.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
