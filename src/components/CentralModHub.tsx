import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Check, 
  Package, 
  Sparkles, 
  Globe, 
  Loader2, 
  Key, 
  Info, 
  ExternalLink,
  Upload,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';
import { searchUnifiedMods, ModProviderSource } from '../services/liveModService';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';
import { ModDetailModal } from './ModDetailModal';
import { CustomModUploadModal } from './CustomModUploadModal';
import { ModBundlesView } from './ModBundlesView';

interface CentralModHubProps {
  servers: ServerInstance[];
  onInstallModToServer: (serverId: string, mod: ModItem) => void;
  onNavigateToAdminSettings?: () => void;
}

export const CentralModHub: React.FC<CentralModHubProps> = ({
  servers,
  onInstallModToServer,
  onNavigateToAdminSettings
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'bundles'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ModProviderSource>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLoader, setSelectedLoader] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'downloads' | 'name'>('downloads');

  const [targetServerId, setTargetServerId] = useState<string>(servers[0]?.id || '');
  const [installedNotification, setInstalledNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live search state
  const [isLoading, setIsLoading] = useState(false);
  const [displayItems, setDisplayItems] = useState<ModItem[]>(MODS_AND_PLUGINS_DATABASE);
  const [apiSourceLabel, setApiSourceLabel] = useState<string>('Kuratierter Katalog');
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Mod detail & Upload modal
  const [selectedModForDetail, setSelectedModForDetail] = useState<ModItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

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

  // Perform live search with debounce
  useEffect(() => {
    let isCancelled = false;
    const executeSearch = async () => {
      setIsLoading(true);
      try {
        const result = await searchUnifiedMods({
          query: searchQuery,
          provider: selectedProvider,
          category: selectedCategory
        });

        if (!isCancelled) {
          let list = result.items;

          // Filter by Loader
          if (selectedLoader !== 'all') {
            list = list.filter(m => {
              const tagsAndLoaders = [...m.tags, ...(m.loaders || [])].map(t => t.toLowerCase());
              return tagsAndLoaders.some(t => t.includes(selectedLoader.toLowerCase()));
            });
          }

          // Filter by Version
          if (selectedVersion !== 'all') {
            list = list.filter(m => {
              if (!m.supportedVersions) return true;
              return m.supportedVersions.includes(selectedVersion);
            });
          }

          // Sort
          if (sortBy === 'name') {
            list.sort((a, b) => a.name.localeCompare(b.name));
          } else if (sortBy === 'downloads') {
            const parseDls = (d: string) => {
              if (d.includes('M')) return parseFloat(d) * 1000000;
              if (d.includes('K')) return parseFloat(d) * 1000;
              return parseFloat(d) || 0;
            };
            list.sort((a, b) => parseDls(b.downloads) - parseDls(a.downloads));
          }

          setDisplayItems(list);
          setApiSourceLabel(result.source);
          setIsLiveApi(result.isLiveApi);
          setInfoMessage(result.message || null);
        }
      } catch (err) {
        console.error('Search error', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      executeSearch();
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedProvider, selectedCategory, selectedLoader, selectedVersion, sortBy]);

  const handleInstall = (mod: ModItem) => {
    if (!targetServerId) {
      setErrorMessage('Bitte wähle zuerst einen Ziel-Server aus der Auswahlliste oben aus!');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    const target = servers.find(s => s.id === targetServerId);
    onInstallModToServer(targetServerId, mod);
    setInstalledNotification(`"${mod.name}" wurde erfolgreich auf "${target?.name || targetServerId}" installiert!`);
    setTimeout(() => setInstalledNotification(null), 3000);
  };

  const currentTargetServer = servers.find(s => s.id === targetServerId);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              <span>Zentraler Live Mod- & Plugin-Hub</span>
            </h2>
            {isLiveApi && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Echtzeit Live-API</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Durchsucht echte Repositories: <strong>Modrinth</strong>, <strong>SpigotMC / Spiget</strong>, <strong>CurseForge</strong> und <strong>Steam Workshop</strong>.
          </p>
        </div>

        {/* Target Server Selector & Custom Upload Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {servers.length > 0 && (
            <div className="flex items-center gap-2 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-xs">
              <span className="text-neutral-400 font-medium shrink-0">Zielserver:</span>
              <select
                value={targetServerId}
                onChange={(e) => setTargetServerId(e.target.value)}
                className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-neutral-900 text-neutral-100">
                    {s.name} ({s.gameName})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors border border-neutral-700/60"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Manuelle Mod hochladen</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher: Browse vs Bundles */}
      <div className="flex items-center gap-2 bg-neutral-900 p-1.5 rounded-xl border border-neutral-800 w-fit text-xs">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
            activeTab === 'browse'
              ? 'bg-neutral-800 text-emerald-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Alle Erweiterungen durchsuchen
        </button>

        <button
          onClick={() => setActiveTab('bundles')}
          className={`px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'bundles'
              ? 'bg-neutral-800 text-amber-400 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Kuratierte Modpacks & Bundles</span>
        </button>
      </div>

      {/* Notifications */}
      {installedNotification && (
        <div className="p-3 bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{installedNotification}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-950 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tab: Curated Bundles */}
      {activeTab === 'bundles' && (
        <ModBundlesView
          server={currentTargetServer}
          onInstallMod={(mod) => handleInstall(mod)}
          onNotify={(msg) => setInstalledNotification(msg)}
        />
      )}

      {/* Tab: Browse */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {/* API Key & Architecture Info Callout */}
          <div className="p-3.5 bg-neutral-900/80 border border-neutral-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-300">
            <div className="flex items-start gap-3">
              <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-neutral-100">Live-APIs & Key-Konfiguration: </strong>
                <span className="text-neutral-300">
                  <strong>Modrinth</strong> und <strong>SpigotMC</strong> sind 100% öffentlich und werden in Echtzeit ohne Registrierung abgefragt.
                  Für <strong>CurseForge</strong> (Eternal API) und <strong>Steam Workshop</strong> kannst du Keys direkt in den <strong className="text-rose-400 font-semibold">Admin Settings</strong> hinterlegen.
                </span>
              </div>
            </div>

            {onNavigateToAdminSettings && (
              <button
                onClick={onNavigateToAdminSettings}
                className="px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 text-rose-300 hover:text-rose-200 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors shrink-0"
              >
                Zu den Admin Settings
              </button>
            )}
          </div>

          {infoMessage && (
            <div className="p-3 bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs rounded-xl flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
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
                  placeholder="Echtzeit-Suche (z. B. Sodium, LuckPerms, Create, Vault, Oxide, Brita)..."
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Live Provider Selector */}
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ModProviderSource)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium text-xs"
              >
                <option value="all">🌐 Alle Quellen (Kombiniert)</option>
                <option value="modrinth">🟢 Modrinth (Live-API · Frei)</option>
                <option value="spigot">📜 SpigotMC / Spiget (Live-API · Frei)</option>
                <option value="curseforge">🔥 CurseForge (Live API)</option>
                <option value="steam_workshop">⚙️ Steam Workshop</option>
              </select>

              {/* Loader Dropdown */}
              <select
                value={selectedLoader}
                onChange={(e) => setSelectedLoader(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {loaders.map(l => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>

              {/* Version Dropdown */}
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {gameVersions.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="downloads">Sortierung: Beliebtheit</option>
                <option value="name">Sortierung: Name (A-Z)</option>
              </select>
            </div>

            {/* Active Source indicator & Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs pt-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-md transition-colors shrink-0 cursor-pointer font-medium ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                  }`}
                >
                  {cat === 'all' ? 'Alle Kategorien' : cat}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-neutral-400 font-mono text-right pt-1 border-t border-neutral-800">
              Quelle: <span className="text-neutral-200 font-bold">{apiSourceLabel}</span> ({displayItems.length} Treffer)
            </div>
          </div>

          {/* Results Grid */}
          {displayItems.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-10 text-center text-neutral-400">
              <Package className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
              <p className="font-semibold text-sm text-neutral-200">Keine Ergebnisse gefunden</p>
              <p className="text-xs text-neutral-500 mt-1">
                Versuche einen anderen Suchbegriff oder wechsle den Repository-Anbieter zu "Modrinth" oder "Alle Quellen".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayItems.map((mod) => (
                <div
                  key={mod.id}
                  onClick={() => setSelectedModForDetail(mod)}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-all cursor-pointer group hover:bg-neutral-850/60"
                >
                  <div>
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

                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-2">
                      <span>von {mod.author}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{mod.downloads} DLs</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{mod.fileSize}</span>
                    </div>

                    <p className="text-xs text-neutral-300 line-clamp-2 mb-3 leading-relaxed">
                      {mod.description}
                    </p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {mod.tags.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

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

                    <button
                      onClick={() => handleInstall(mod)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors shadow-sm"
                    >
                      <Download className="w-3 h-3" />
                      <span>1-Click Install</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mod Detail Modal */}
      {selectedModForDetail && (
        <ModDetailModal
          isOpen={!!selectedModForDetail}
          onClose={() => setSelectedModForDetail(null)}
          mod={selectedModForDetail}
          server={currentTargetServer}
          onInstallMod={(m) => handleInstall(m)}
          isInstalled={currentTargetServer?.installedMods.some(inst => inst.modId === selectedModForDetail.id) || false}
        />
      )}

      {/* Custom Upload Modal */}
      <CustomModUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onInstallUploadedMod={(mod) => {
          handleInstall(mod);
        }}
      />
    </div>
  );
};
