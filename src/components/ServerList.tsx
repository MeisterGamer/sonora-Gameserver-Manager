import React, { useState } from 'react';
import { 
  Server, 
  Play, 
  Square, 
  RotateCw, 
  Terminal, 
  Plus, 
  Trash2, 
  Cpu, 
  Activity, 
  Users, 
  Layers, 
  Search,
  CheckSquare,
  Square as SquareIcon,
  Copy,
  Filter,
  CheckCircle2,
  HardDrive,
  Sparkles
} from 'lucide-react';
import { ServerInstance } from '../types/game';

interface ServerListProps {
  servers: ServerInstance[];
  onSelectServer: (server: ServerInstance) => void;
  onStartServer: (id: string) => void;
  onStopServer: (id: string) => void;
  onRestartServer: (id: string) => void;
  onDeleteServer: (id: string) => void;
  onCloneServer?: (id: string) => void;
  onOpenCreateModal: () => void;
  onOpenSetupWizard?: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
  onCloneServer,
  onOpenCreateModal,
  onOpenSetupWizard
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'offline'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const onlineCount = servers.filter(s => s.status === 'running').length;
  const totalPlayers = servers.reduce((sum, s) => sum + (s.status === 'running' ? s.currentPlayers : 0), 0);
  const totalAllocatedRam = servers.reduce((sum, s) => sum + s.allocatedRamGb, 0);

  // Filtered servers
  const filteredServers = servers.filter(server => {
    const matchesSearch = 
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.gameName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.port.toString().includes(searchQuery) ||
      server.targetOS.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'running' && server.status === 'running') ||
      (statusFilter === 'offline' && server.status === 'offline');

    const matchesCategory = 
      categoryFilter === 'all' || server.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const allFilteredSelected = 
    filteredServers.length > 0 && 
    filteredServers.every(s => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredServers.map(s => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Bulk actions
  const handleBulkStart = () => {
    selectedIds.forEach(id => onStartServer(id));
  };

  const handleBulkStop = () => {
    selectedIds.forEach(id => onStopServer(id));
  };

  const handleBulkRestart = () => {
    selectedIds.forEach(id => onRestartServer(id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length > 0) {
      // Trigger deletion for first or prompt
      onDeleteServer(selectedIds[0]);
    }
  };

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
            <span className="text-xs text-neutral-500 font-normal">Noch nicht abgefragt</span>
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

      {/* Filter and Bulk Action Toolbar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between text-xs">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Instanzen filtern nach Name, Spiel, Port oder OS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Alle Status</option>
            <option value="running">Nur Online</option>
            <option value="offline">Nur Offline</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Alle Kategorien</option>
            <option value="minecraft">Minecraft</option>
            <option value="survival">Survival</option>
            <option value="fps">FPS / Shooter</option>
            <option value="simulation">Simulation</option>
          </select>

          {onOpenSetupWizard && (
            <button
              onClick={onOpenSetupWizard}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-950 hover:bg-neutral-850 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 shadow-sm"
              title="Installations- und Einrichtungsassistent starten"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Setup-Assistent</span>
            </button>
          )}

          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 shadow-sm shadow-emerald-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Server hinzufügen</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Strip (Visible when items selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-emerald-300 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{selectedIds.length} von {servers.length} Servern ausgewählt</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkStart}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Ausgewählte starten</span>
            </button>

            <button
              onClick={handleBulkStop}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stoppen</span>
            </button>

            <button
              onClick={handleBulkRestart}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>Neustarten</span>
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1 text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
            >
              Abwählen
            </button>
          </div>
        </div>
      )}

      {/* Server Instances Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
              title={allFilteredSelected ? 'Alle abwählen' : 'Alle markieren'}
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              ) : (
                <SquareIcon className="w-4 h-4 text-neutral-600" />
              )}
            </button>

            <div>
              <h2 className="font-semibold text-neutral-100 text-sm">Deine Gameserver Instanzen ({filteredServers.length})</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Verwalte, starte und überwache alle konfigurierten Instanzen in Echtzeit.
              </p>
            </div>
          </div>
        </div>

        {filteredServers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            {servers.length === 0 
              ? 'Keine Gameserver eingerichtet. Klicke auf "Server hinzufügen", um deinen ersten Server bereitzustellen.'
              : 'Keine Server gefunden, die den Such- und Filterkriterien entsprechen.'}
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {filteredServers.map((server) => {
              const isRunning = server.status === 'running';
              const isSelected = selectedIds.includes(server.id);

              return (
                <div
                  key={server.id}
                  className={`p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-emerald-950/20' : 'hover:bg-neutral-800/30'
                  }`}
                >
                  {/* Left: Checkbox & details */}
                  <div className="flex items-start gap-3.5">
                    <button
                      onClick={() => toggleSelectOne(server.id)}
                      className="mt-2.5 text-neutral-400 hover:text-neutral-200 cursor-pointer shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <SquareIcon className="w-4 h-4 text-neutral-600" />
                      )}
                    </button>

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
                        <span>·</span>
                        <span className="font-mono text-emerald-400/90 font-medium">v{server.version}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Live Stats */}
                  <div className="flex items-center gap-6 text-xs text-neutral-400">
                    <div>
                      <div className="text-[11px] text-neutral-500">Spieler</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {'Nicht abgefragt'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-neutral-500">CPU Last</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {'Nicht erfasst'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-neutral-500">Tickrate</div>
                      <div className="font-mono font-semibold text-neutral-200 tabular-nums">
                        {'Nicht erfasst'}
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
                      <span>Verwalten</span>
                    </button>

                    {/* Clone Server Button */}
                    {onCloneServer && (
                      <button
                        onClick={() => onCloneServer(server.id)}
                        className="p-2 text-neutral-400 hover:text-sky-300 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                        title="Serverinstanz klonen (Duplizieren)"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Server Button */}
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
