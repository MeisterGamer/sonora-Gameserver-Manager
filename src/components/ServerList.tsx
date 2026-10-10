import React from 'react';
import { Server, Play, Square, RotateCw, Terminal, Plus, Trash2, Cpu, Activity, Users, Layers, ExternalLink } from 'lucide-react';
import { ServerInstance } from '../types/game';

interface ServerListProps {
  servers: ServerInstance[];
  onSelectServer: (server: ServerInstance) => void;
  onStartServer: (id: string) => void;
  onStopServer: (id: string) => void;
  onRestartServer: (id: string) => void;
  onDeleteServer: (id: string) => void;
  onOpenCreateModal: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
  onOpenCreateModal
}) => {
  const onlineCount = servers.filter(s => s.status === 'running').length;
  const totalPlayers = servers.reduce((sum, s) => sum + (s.status === 'running' ? s.currentPlayers : 0), 0);
  const totalAllocatedRam = servers.reduce((sum, s) => sum + s.allocatedRamGb, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online</span>
          </span>
        );
      case 'starting':
      case 'stopping':
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="capitalize">{status}</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-neutral-600" />
            <span>Offline</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-neutral-400 mb-1 flex items-center justify-between">
            <span>Aktive Instanzen</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
            {onlineCount} <span className="text-xs text-neutral-500 font-normal">/ {servers.length} Server</span>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-neutral-400 mb-1 flex items-center justify-between">
            <span>Aktive Spieler</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
            {totalPlayers} <span className="text-xs text-neutral-500 font-normal">Spieler online</span>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-neutral-400 mb-1 flex items-center justify-between">
            <span>Zugewiesener RAM</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
            {totalAllocatedRam} <span className="text-xs text-neutral-500 font-normal">GB Arbeitsspeicher</span>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-neutral-400 mb-1 flex items-center justify-between">
            <span>Host Node Runtime</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-semibold font-mono text-neutral-100 mt-1">
            Node.js v24.2.0
          </div>
          <div className="text-[11px] text-neutral-500">Cross-Platform Ready</div>
        </div>
      </div>

      {/* Server Instances Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-neutral-100 text-sm">Deine Gameserver Instanzen</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Verwalte, starte und überwache alle konfigurierten Instanzen in Echtzeit.
            </p>
          </div>
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Server hinzufügen</span>
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            Keine Gameserver eingerichtet. Klicke auf "Server hinzufügen", um deinen ersten Server bereitzustellen.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {servers.map((server) => {
              const isRunning = server.status === 'running';

              return (
                <div
                  key={server.id}
                  className="p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors"
                >
                  {/* Left: Server details */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-300 shrink-0 mt-0.5">
                      <Server className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onSelectServer(server)}
                          className="font-bold text-neutral-100 text-sm hover:text-emerald-400 transition-colors cursor-pointer text-left"
                        >
                          {server.name}
                        </button>
                        {getStatusBadge(server.status)}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-1">
                        <span className="font-medium text-neutral-300">{server.gameName}</span>
                        <span>·</span>
                        <span className="font-mono">Port: {server.port}</span>
                        <span>·</span>
                        <span className="font-mono">{server.allocatedRamGb} GB RAM</span>
                        <span>·</span>
                        <span className="capitalize font-mono">OS: {server.targetOS}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Live Stats */}
                  <div className="flex items-center gap-6 text-xs text-neutral-400">
                    <div>
                      <div className="text-[11px] text-neutral-500">Spieler</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {isRunning ? `${server.currentPlayers} / ${server.maxPlayers}` : '-'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-neutral-500">CPU Last</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {isRunning ? `${server.cpuUsagePercent}%` : '-'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-neutral-500">Tickrate</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {isRunning ? `${server.tps} TPS` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    {/* Power Toggle */}
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => onRestartServer(server.id)}
                          className="p-2 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Neustarten"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onStopServer(server.id)}
                          className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-rose-900/60"
                          title="Stoppen"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onStartServer(server.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Start</span>
                      </button>
                    )}

                    {/* Manage Button */}
                    <button
                      onClick={() => onSelectServer(server)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Konsole & Mods</span>
                    </button>

                    <button
                      onClick={() => onDeleteServer(server.id)}
                      className="p-2 text-neutral-500 hover:text-rose-400 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Instanz löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
