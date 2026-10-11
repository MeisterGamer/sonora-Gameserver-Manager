import React, { useState } from 'react';
import { 
  Terminal, 
  Package, 
  FileCode, 
  Users, 
  Archive, 
  Layers, 
  Play, 
  Square, 
  RotateCw, 
  Zap, 
  Trash2,
  ArrowLeft,
  Cpu,
  HardDrive,
  Activity,
  Globe,
  Folder,
  Radio,
  Wifi,
  Sparkles,
  DownloadCloud,
  ShieldAlert,
  Bell,
  Coffee
} from 'lucide-react';
import { ServerInstance, LogMessage, ModItem, JavaVersion } from '../types/game';
import { ConsoleView } from './ConsoleView';
import { ModPluginBrowser } from './RealModPluginBrowser';
import { ConfigFileEditor } from './ConfigFileEditor';
import { PlayerManager } from './PlayerManager';
import { BackupsView } from './RealBackupsView';
import { CrossPlatformView } from './CrossPlatformView';
import { FileManagerView } from './RealFileManagerView';
import { MetricsView } from './MetricsView';
import { NetworkPortsView } from './NetworkPortsView';
import { UpdateManagerView } from './RealUpdateManagerView';
import { AuditLogView } from './AuditLogView';
import { WebhooksView } from './WebhooksView';
import { JavaRuntimeModal } from './JavaRuntimeModal';

interface ServerDetailProps {
  server: ServerInstance;
  onBack: () => void;
  onStartServer: (id: string) => void;
  onStopServer: (id: string) => void;
  onRestartServer: (id: string) => void;
  onKillServer: (id: string) => void;
  onSendCommand: (id: string, cmd: string) => void;
  logs: LogMessage[];
  onClearLogs: () => void;
  onInstallMod: (serverId: string, mod: ModItem, restartServer?: boolean) => void;
  onUninstallMod: (serverId: string, installedModId: string) => void;
  onToggleMod: (serverId: string, installedModId: string, enabled: boolean) => void;
  onSaveConfigFile: (serverId: string, filename: string, content: string) => void;
  onUpdateVersion?: (serverId: string, newVersion: string, notes?: string, javaVersion?: JavaVersion) => void;
  onUpdateJavaVersion?: (serverId: string, javaVersion: JavaVersion, restart?: boolean) => void;
  onDeleteServer?: (id: string) => void;
  allServers?: ServerInstance[];
  onNotify?: (msg: string) => void;
}

export const ServerDetail: React.FC<ServerDetailProps> = ({
  server,
  onBack,
  onStartServer,
  onStopServer,
  onRestartServer,
  onKillServer,
  onSendCommand,
  logs,
  onClearLogs,
  onInstallMod,
  onUninstallMod,
  onToggleMod,
  onSaveConfigFile,
  onUpdateVersion,
  onUpdateJavaVersion,
  onDeleteServer,
  allServers,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<
    'console' | 'metrics' | 'files' | 'mods' | 'config' | 'network' | 'players' | 'backups' | 'updates' | 'audit' | 'webhooks' | 'crossplatform'
  >('console');
  const [isJavaModalOpen, setIsJavaModalOpen] = useState(false);

  const formatUptime = (seconds: number) => {
    if (seconds <= 0) return 'Offline';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
      case 'starting': return 'text-amber-400 bg-amber-950/80 border-amber-800';
      case 'stopping': return 'text-amber-400 bg-amber-950/80 border-amber-800';
      default: return 'text-neutral-400 bg-neutral-900 border-neutral-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 transition-colors cursor-pointer"
              title="Zurück zur Übersicht"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold text-neutral-100 tracking-tight">{server.name}</h1>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(server.status)}`}>
                  {server.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-1">
                <span className="font-medium text-neutral-300">{server.gameName}</span>
                <span>·</span>
                <span className="font-mono">Port: {server.port}</span>
                <span>·</span>
                <span className="capitalize">{server.targetOS}</span>
                <span>·</span>
                <span>Uptime: {formatUptime(server.uptimeSeconds)}</span>
                {server.category === 'minecraft' && (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => onNotify?.('Verwendet wird das Java des Hosts. Separate Laufzeitwahl ist noch nicht implementiert.')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono transition-colors cursor-pointer group"
                      title="Java 21+ Laufzeit & JVM-Flags konfigurieren"
                    >
                      <Coffee className="w-3 h-3 text-amber-400 group-hover:rotate-12 transition-transform" />
                      <span>{'Host-Java'}</span>
                      <span className="text-[10px] text-amber-400/80 underline ml-0.5 font-sans">Ändern</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Power Actions */}
          <div className="flex items-center gap-2">
            {server.status === 'offline' ? (
              <button
                onClick={() => onStartServer(server.id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm shadow-emerald-600/30"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Server starten</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onRestartServer(server.id)}
                  disabled={server.status !== 'running'}
                  className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                  title="Sanfter Neustart"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Neustarten</span>
                </button>
                <button
                  onClick={() => onStopServer(server.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-rose-800/60"
                  title="Server stoppen"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stoppen</span>
                </button>
                <button
                  onClick={() => onKillServer(server.id)}
                  className="p-2 bg-neutral-800 hover:bg-rose-900/60 text-neutral-400 hover:text-rose-300 rounded-lg text-xs transition-colors cursor-pointer"
                  title="Sofort beenden (Force Kill)"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {onDeleteServer && (
              <button
                onClick={() => onDeleteServer(server.id)}
                className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-rose-950/80 text-neutral-400 hover:text-rose-300 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-neutral-800 hover:border-rose-900/60"
                title="Serverinstanz & Daten löschen"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-rose-400" />
                <span className="hidden sm:inline">Server löschen</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Gauges Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-neutral-800 text-xs">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>CPU Last</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-200">{'Nicht erfasst'}</span>
            </div>
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-sky-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, server.cpuUsagePercent)}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>RAM Auslastung</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-200">
                {'Nicht erfasst · Limit: ' + server.allocatedRamGb + ' GB'}
              </span>
            </div>
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (server.ramUsageMb / (server.allocatedRamGb * 1024)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Spieler</span>
              </span>
              <span className="font-mono tabular-nums text-neutral-200">
                {'Nicht abgefragt'}
              </span>
            </div>
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (server.currentPlayers / server.maxPlayers) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span>Tickrate / TPS</span>
              </span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold">{'Nicht erfasst'}</span>
            </div>
            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (server.tps / (server.category === 'minecraft' ? 20 : 60)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-neutral-800 pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'console'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Konsole</span>
        </button>

        <button
          onClick={() => onNotify?.('Prozessmetriken sind noch nicht implementiert; es werden keine Messwerte simuliert.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'metrics'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span>Performance & Metriken</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'files'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-amber-400" />
          <span>Datei-Manager & SFTP</span>
        </button>

        <button
          onClick={() => setActiveTab('mods')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'mods'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-purple-400" />
          <span>Mods & Plugins ({server.installedMods.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'config'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Config-Editor</span>
        </button>

        <button
          onClick={() => onNotify?.('DNS-/Portänderungen sind noch nicht implementiert.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'network'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Ports & Domains</span>
        </button>

        <button
          onClick={() => onNotify?.('Spielerabfrage/RCON noch nicht implementiert; echte Befehle über die Konsole senden.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'players'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Spieler ({server.currentPlayers})</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'backups'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-emerald-400" />
          <span>Backups & Cron-Jobs</span>
        </button>

        <button
          onClick={() => setActiveTab('updates')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'updates'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <DownloadCloud className="w-3.5 h-3.5 text-sky-400" />
          <span>Updates & Versionen</span>
        </button>

        <button
          onClick={() => onNotify?.('Separate Audit-Ereignisdatenbank ist noch nicht implementiert. Reale Prozesslogs stehen in der Konsole.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'audit'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>Audit-Log</span>
        </button>

        <button
          onClick={() => onNotify?.('Webhook-Ereignisse sind noch nicht implementiert; es wird keine Zustellung simuliert.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'webhooks'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5 text-indigo-400" />
          <span>Discord & Webhooks</span>
        </button>

        <button
          onClick={() => onNotify?.('Remote-/Containerverwaltung ist noch nicht implementiert. Ausführung erfolgt auf dem lokalen Host.')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === 'crossplatform'
              ? 'bg-neutral-800 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>OS Skripte</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'console' && (
        <ConsoleView
          server={server}
          onSendCommand={(cmd) => onSendCommand(server.id, cmd)}
          logs={logs}
          onClearLogs={onClearLogs}
          onStartServer={() => onStartServer(server.id)}
          onStopServer={() => onStopServer(server.id)}
          onRestartServer={() => onRestartServer(server.id)}
        />
      )}

      {activeTab === 'metrics' && (
        <MetricsView
          server={server}
          onSendCommand={(cmd) => onSendCommand(server.id, cmd)}
          onNotify={onNotify}
          onOpenJavaModal={() => setIsJavaModalOpen(true)}
        />
      )}

      {activeTab === 'files' && (
        <FileManagerView
          server={server}
          onSaveConfigFile={(fn, c) => onSaveConfigFile(server.id, fn, c)}
          onNotify={onNotify}
        />
      )}

      {activeTab === 'network' && (
        <NetworkPortsView
          server={server}
          onNotify={onNotify}
        />
      )}

      {activeTab === 'mods' && (
        <ModPluginBrowser
          server={server}
          onInstallMod={(mod, restart) => onInstallMod(server.id, mod, restart)}
          onUninstallMod={(id) => onUninstallMod(server.id, id)}
          onToggleMod={(id, en) => onToggleMod(server.id, id, en)}
          allServers={allServers}
        />
      )}

      {activeTab === 'config' && (
        <ConfigFileEditor
          server={server}
          onSaveConfigFile={(fn, c) => onSaveConfigFile(server.id, fn, c)}
          onOpenJavaModal={() => setIsJavaModalOpen(true)}
        />
      )}

      {activeTab === 'players' && (
        <PlayerManager
          server={server}
          onKickPlayer={(u) => onSendCommand(server.id, `kick ${u}`)}
          onBanPlayer={(u) => onSendCommand(server.id, `ban ${u}`)}
          onToggleOp={(u) => onSendCommand(server.id, `op ${u}`)}
        />
      )}

      {activeTab === 'backups' && (
        <BackupsView server={server} />
      )}

      {activeTab === 'updates' && (
        <UpdateManagerView
          server={server}
          onUpdateVersion={(newVer, notes, javaVer) => onUpdateVersion?.(server.id, newVer, notes, javaVer)}
          onNotify={onNotify}
        />
      )}

      {activeTab === 'audit' && (
        <AuditLogView server={server} />
      )}

      {activeTab === 'webhooks' && (
        <WebhooksView server={server} onNotify={onNotify} />
      )}

      {activeTab === 'crossplatform' && (
        <CrossPlatformView selectedServer={server} />
      )}

      {/* Java 21+ Runtime & JVM Tuning Modal */}
      {server.category === 'minecraft' && (
        <JavaRuntimeModal
          server={server}
          isOpen={isJavaModalOpen}
          onClose={() => setIsJavaModalOpen(false)}
          onSaveJava={(sId, newJava, restart) => {
            onUpdateJavaVersion?.(sId, newJava, restart);
            if (restart) {
              onRestartServer(sId);
            }
          }}
        />
      )}
    </div>
  );
};
