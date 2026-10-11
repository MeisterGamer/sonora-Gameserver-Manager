import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Check, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  ExternalLink, 
  Filter, 
  Package, 
  Globe, 
  Loader2, 
  Sparkles,
  Upload,
  RotateCw,
  Info,
  CheckCircle2,
  ArrowUpDown,
  Layers,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { ModItem, InstalledMod, ServerInstance } from '../types/game';
import { searchUnifiedMods, ModProviderSource } from '../services/liveModService';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';
import { ModDetailModal } from './ModDetailModal';
import { CustomModUploadModal } from './CustomModUploadModal';
import { ModBundlesView } from './ModBundlesView';
import { ModDependencyBanner } from './ModDependencyBanner';

interface ModPluginBrowserProps {
  server: ServerInstance;
  onInstallMod: (mod: ModItem) => void;
  onUninstallMod: (installedModId: string) => void;
  onToggleMod: (installedModId: string, enabled: boolean) => void;
}

export const ModPluginBrowser: React.FC<ModPluginBrowserProps> = ({
  server,
  onInstallMod,
  onUninstallMod,
  onToggleMod
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'bundles' | 'installed'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ModProviderSource>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLoader, setSelectedLoader] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'downloads' | 'name' | 'newest'>('downloads');
  const [filterGameScope, setFilterGameScope] = useState<'server-only' | 'all'>('server-only');

  const [isLoading, setIsLoading] = useState(false);
  const [displayItems, setDisplayItems] = useState<ModItem[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>('Katalog');
  const [isLiveApi, setIsLiveApi] = useState(false);

  // Mod detail modal state
  const [selectedModForDetail, setSelectedModForDetail] = useState<ModItem | null>(null);

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Updates simulation state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updatesAvailableMap, setUpdatesAvailableMap] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const categories = [
    'all',
    'Performance',
    'Admin & Werkzeuge',
    'Gameplay',
    'Welt & Dimensionen',
    'Sicherheit',
    'Wirtschaft',
    'Utility'
  ];

  const loaders = [
    { id: 'all', label: 'Alle Loader' },
    { id: 'Paper', label: 'Paper / Spigot / Purpur' },
    { id: 'Fabric', label: 'Fabric' },
    { id: 'Forge', label: 'Forge' },
    { id: 'NeoForge', label: 'NeoForge' }
  ];

  const gameVersions = [
    { id: 'all', label: 'Alle Versionen' },
    { id: '26.3', label: 'v26.3 (Snapshot)' },
    { id: '1.21.4', label: 'v1.21.4 (Latest)' },
    { id: '1.20.4', label: 'v1.20.4' },
    { id: '1.16.5', label: 'v1.16.5' },
    { id: '1.12.2', label: 'v1.12.2' }
  ];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live search effect
  useEffect(() => {
    let cancelled = false;
    const runSearch = async () => {
      setIsLoading(true);
      try {
        const res = await searchUnifiedMods({
          query: searchQuery,
          provider: selectedProvider,
          category: selectedCategory
        });

        if (!cancelled) {
          let list = res.items;

          // 1. Filter by server scope
          if (filterGameScope === 'server-only') {
            if (server.category === 'minecraft') {
              list = list.filter(m => m.gameId === 'minecraft');
            } else {
              list = list.filter(m => m.gameId === server.gameId || m.gameId === server.id);
            }
          }

          // 2. Filter by Loader
          if (selectedLoader !== 'all') {
            list = list.filter(m => {
              const tagsAndLoaders = [...m.tags, ...(m.loaders || [])].map(t => t.toLowerCase());
              return tagsAndLoaders.some(t => t.includes(selectedLoader.toLowerCase()));
            });
          }

          // 3. Filter by Version
          if (selectedVersion !== 'all') {
            list = list.filter(m => {
              if (!m.supportedVersions) return true;
              return m.supportedVersions.includes(selectedVersion);
            });
          }

          // 4. Sort
          if (sortBy === 'name') {
            list.sort((a, b) => a.name.localeCompare(b.name));
          } else if (sortBy === 'downloads') {
            // Sort by downloads roughly
            const parseDls = (d: string) => {
              if (d.includes('M')) return parseFloat(d) * 1000000;
              if (d.includes('K')) return parseFloat(d) * 1000;
              return parseFloat(d) || 0;
            };
            list.sort((a, b) => parseDls(b.downloads) - parseDls(a.downloads));
          }

          setDisplayItems(list);
          setSourceLabel(res.source);
          setIsLiveApi(res.isLiveApi);
        }
      } catch (err) {
        console.error('Error fetching mods', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      runSearch();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedProvider, selectedCategory, selectedLoader, selectedVersion, sortBy, filterGameScope, server]);

  const isModInstalled = (modId: string) => {
    return server.installedMods.some(m => m.modId === modId);
  };

  // Check for updates simulation
  const handleCheckUpdates = () => {
    setIsCheckingUpdates(true);
    setTimeout(() => {
      const updates: Record<string, string> = {};
      server.installedMods.forEach((inst, idx) => {
        // simulate available update for some mods
        if (idx % 2 === 0) {
          const parts = inst.version.split('.');
          if (parts.length >= 2) {
            const lastNum = parseInt(parts[parts.length - 1], 10) || 1;
            parts[parts.length - 1] = `${lastNum + 1}`;
            updates[inst.id] = parts.join('.');
          } else {
            updates[inst.id] = `${inst.version}.1-hotfix`;
          }
        }
      });
      setUpdatesAvailableMap(updates);
      setIsCheckingUpdates(false);
      const count = Object.keys(updates).length;
      showToast(`${count} ${count === 1 ? 'Update gefunden' : 'Updates gefunden'}!`);
    }, 1200);
  };

  const handleUpdateSingleMod = (installedId: string) => {
    const newVer = updatesAvailableMap[installedId];
    if (newVer) {
      setUpdatesAvailableMap(prev => {
        const copy = { ...prev };
        delete copy[installedId];
        return copy;
      });
      showToast(`Mod erfolgreich auf Version ${newVer} aktualisiert!`);
    }
  };

  const handleUpdateAllMods = () => {
    const count = Object.keys(updatesAvailableMap).length;
    setUpdatesAvailableMap({});
    showToast(`Alle ${count} Erweiterungen wurden erfolgreich aktualisiert!`);
  };

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 border border-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar & Action Strip */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'browse'
                ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Live-Browser Durchsuchen
          </button>

          <button
            onClick={() => setActiveTab('bundles')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bundles'
                ? 'bg-neutral-800 text-amber-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Kuratierte Bundles</span>
          </button>

          <button
            onClick={() => setActiveTab('installed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'installed'
                ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Installiert ({server.installedMods.length})</span>
            {Object.keys(updatesAvailableMap).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Right Action Tools: Upload & Quick Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors border border-neutral-700/60"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Eigene Mod (.jar/.zip) hochladen</span>
          </button>
        </div>
      </div>

      {/* Main Browse Tab */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {/* Search & Provider & Filter Controls Row */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
              {/* Search Bar */}
              <div className="relative flex-1">
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Live nach Mods & Plugins suchen (z. B. Sodium, LuckPerms, EssentialsX, Dynmap)..."
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Source Provider Dropdown */}
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ModProviderSource)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">🌐 Alle Quellen</option>
                <option value="modrinth">🟢 Modrinth (Live)</option>
                <option value="spigot">📜 SpigotMC (Live)</option>
                <option value="curseforge">🔥 CurseForge</option>
                <option value="steam_workshop">⚙️ Workshop</option>
              </select>

              {/* Loader Dropdown */}
              <select
                value={selectedLoader}
                onChange={(e) => setSelectedLoader(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {loaders.map(l => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>

              {/* Game Version Dropdown */}
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {gameVersions.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="downloads">Sortierung: Beliebtheit</option>
                <option value="name">Sortierung: Name (A-Z)</option>
              </select>
            </div>

            {/* Category Pills Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs pt-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-md transition-colors shrink-0 cursor-pointer font-medium ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                  }`}
                >
                  {cat === 'all' ? 'Alle Kategorien' : cat}
                </button>
              ))}
            </div>

            {/* Meta indicator bar */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/80">
              <div className="flex items-center gap-2">
                {isLiveApi && (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live-API Aktiv</span>
                  </span>
                )}
                <span>Quelle: <strong className="text-neutral-300">{sourceLabel}</strong> ({displayItems.length} Treffer)</span>
              </div>

              <div className="flex items-center gap-2 text-neutral-500">
                <span>Zielserver: <strong className="text-neutral-300">{server.name}</strong></span>
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          {displayItems.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400 space-y-2">
              <Package className="w-8 h-8 mx-auto text-neutral-500" />
              <p className="font-medium text-sm text-neutral-200">Keine Erweiterungen gefunden</p>
              <p className="text-xs text-neutral-500">
                Versuche andere Filterkriterien oder setze den Loader-Filter zurück.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayItems.map((mod) => {
                const installed = isModInstalled(mod.id);
                return (
                  <div
                    key={mod.id}
                    onClick={() => setSelectedModForDetail(mod)}
                    className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all cursor-pointer group hover:bg-neutral-850/60"
                  >
                    <div>
                      {/* Title & Source */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="font-semibold text-neutral-100 text-sm group-hover:text-emerald-400 transition-colors">
                          {mod.name}
                        </h4>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                          mod.source === 'Modrinth' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          mod.source === 'SpigotMC' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          mod.source === 'CurseForge' ? 'bg-orange-950 text-orange-300 border border-orange-800' :
                          'bg-neutral-800 text-neutral-300'
                        }`}>
                          {mod.source}
                        </span>
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-2">
                        <span>von {mod.author}</span>
                        <span>·</span>
                        <span className="tabular-nums font-mono">{mod.downloads} DLs</span>
                        <span>·</span>
                        <span className="tabular-nums font-mono">{mod.fileSize}</span>
                      </div>

                      <p className="text-xs text-neutral-300 line-clamp-2 mb-3 leading-relaxed">
                        {mod.description}
                      </p>

                      {/* Tag list */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {mod.tags.slice(0, 4).map(t => (
                          <span key={t} className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Button & Details hint */}
                    <div 
                      className="pt-2 border-t border-neutral-800 flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setSelectedModForDetail(mod)}
                        className="text-[11px] text-neutral-400 hover:text-neutral-200 cursor-pointer flex items-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Details</span>
                      </button>

                      {installed ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>Installiert</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            onInstallMod(mod);
                            showToast(`"${mod.name}" wurde installiert!`);
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer shadow-sm shadow-emerald-600/20"
                        >
                          <Download className="w-3 h-3" />
                          <span>1-Click Install</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Curated Bundles Tab */}
      {activeTab === 'bundles' && (
        <ModBundlesView
          server={server}
          onInstallMod={(m) => onInstallMod(m)}
          onNotify={showToast}
        />
      )}

      {/* Installed Mods Tab */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {/* Missing Dependencies Banner */}
          <ModDependencyBanner
            server={server}
            onInstallMod={onInstallMod}
            onNotify={showToast}
          />

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-200 text-sm">Aktive Erweiterungen auf diesem Server</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Verzeichnis: <code className="text-neutral-300 font-mono">/mods/</code> oder <code className="text-neutral-300 font-mono">/plugins/</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-medium cursor-pointer transition-colors"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdates ? 'Prüfe Updates...' : 'Nach Updates suchen'}</span>
                </button>

                {Object.keys(updatesAvailableMap).length > 0 && (
                  <button
                    onClick={handleUpdateAllMods}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Alle {Object.keys(updatesAvailableMap).length} Updates installieren</span>
                  </button>
                )}
              </div>
            </div>

            {server.installedMods.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 text-xs space-y-2">
                <Package className="w-8 h-8 mx-auto text-neutral-600" />
                <p>Es sind derzeit keine Mods oder Plugins auf diesem Server installiert.</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium cursor-pointer"
                >
                  Jetzt Erweiterungen durchsuchen
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/80">
                {server.installedMods.map((item) => {
                  const hasUpdate = updatesAvailableMap[item.id];

                  return (
                    <div 
                      key={item.id} 
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors"
                    >
                      <div className="flex items-start gap-3.5">
                        <button
                          onClick={() => onToggleMod(item.id, !item.enabled)}
                          className="cursor-pointer mt-0.5"
                          title={item.enabled ? 'Deaktivieren' : 'Aktivieren'}
                        >
                          {item.enabled ? (
                            <ToggleRight className="w-6 h-6 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-neutral-500" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-semibold ${item.enabled ? 'text-neutral-100' : 'text-neutral-400 line-through'}`}>
                              {item.name}
                            </span>
                            <span className="text-xs font-mono text-neutral-400">v{item.version}</span>
                            {hasUpdate && (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                <Sparkles className="w-3 h-3" /> Update auf v{hasUpdate} verfügbar
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1 flex-wrap">
                            <span>Quelle: {item.source}</span>
                            <span>·</span>
                            <span className="font-mono tabular-nums">{item.fileSize}</span>
                            <span>·</span>
                            <span>Installiert: {item.installedAt}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {hasUpdate && (
                          <button
                            onClick={() => handleUpdateSingleMod(item.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            <Download className="w-3 h-3" />
                            <span>Aktualisieren</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            onUninstallMod(item.id);
                            showToast(`"${item.name}" wurde deinstalliert.`);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Erweiterung deinstallieren"
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
      )}

      {/* Mod Detail Modal */}
      {selectedModForDetail && (
        <ModDetailModal
          isOpen={!!selectedModForDetail}
          onClose={() => setSelectedModForDetail(null)}
          mod={selectedModForDetail}
          server={server}
          onInstallMod={(m) => {
            onInstallMod(m);
            showToast(`"${m.name}" wurde installiert!`);
          }}
          onUninstallMod={(id) => onUninstallMod(id)}
          isInstalled={isModInstalled(selectedModForDetail.id)}
        />
      )}

      {/* Custom Upload Modal */}
      <CustomModUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onInstallUploadedMod={(mod) => {
          onInstallMod(mod);
          showToast(`"${mod.name}" wurde erfolgreich hochgeladen und installiert!`);
        }}
      />
    </div>
  );
};
