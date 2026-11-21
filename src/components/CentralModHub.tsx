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
  AlertCircle,
  Sliders,
  Trash2,
  CheckSquare,
  Square,
  Zap,
  Tag,
  RefreshCw,
  ShieldCheck,
  Database,
  X
} from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';
import { searchUnifiedMods, ModProviderSource } from '../services/liveModService';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';
import { ModDetailModal } from './ModDetailModal';
import { CustomModUploadModal } from './CustomModUploadModal';
import { ModBundlesView } from './ModBundlesView';
import { ModInstallModal } from './ModInstallModal';
import { AutoResolveModal } from './AutoResolveModal';

interface IndexedModResultItem extends ModItem {
  compatibilityStatus?: 'exact' | 'minor' | 'universal' | 'incompatible' | 'unverified';
  compatibilityLabel?: string;
  matchedTags?: string[];
  relevanceScore?: number;
}

interface TagFacet {
  key: string;
  label: string;
  count: number;
}

interface VersionFacet {
  version: string;
  count: number;
}

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
  const [compatibilityMode, setCompatibilityMode] = useState<'compatible' | 'strict' | 'all'>('compatible');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'all' | 'any'>('all');
  const [showAllTags, setShowAllTags] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'downloads' | 'name'>('relevance');

  // Server-side index metadata & facets
  const [availableTagFacets, setAvailableTagFacets] = useState<TagFacet[]>([]);
  const [availableVersionFacets, setAvailableVersionFacets] = useState<VersionFacet[]>([]);
  const [totalIndexedMods, setTotalIndexedMods] = useState<number>(MODS_AND_PLUGINS_DATABASE.length);
  const [lastIndexedAt, setLastIndexedAt] = useState<string | null>(null);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);

  const [targetServerId, setTargetServerId] = useState<string>(servers[0]?.id || '');
  const [installedNotification, setInstalledNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-sync targetServerId if servers change or was initially empty
  useEffect(() => {
    if ((!targetServerId || !servers.some(s => s.id === targetServerId)) && servers.length > 0) {
      setTargetServerId(servers[0].id);
    }
  }, [servers, targetServerId]);

  // Live search state
  const [isLoading, setIsLoading] = useState(false);
  const [displayItems, setDisplayItems] = useState<IndexedModResultItem[]>(MODS_AND_PLUGINS_DATABASE);
  const [apiSourceLabel, setApiSourceLabel] = useState<string>('Serverseitiger Mod-Index');
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Mod detail, Install, Upload & Auto-Resolve modals
  const [selectedModForDetail, setSelectedModForDetail] = useState<ModItem | null>(null);
  const [selectedModForInstall, setSelectedModForInstall] = useState<ModItem | null>(null);
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set());
  const [isAutoResolveModalOpen, setIsAutoResolveModalOpen] = useState(false);

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
    { id: 'NeoForge', label: 'NeoForge' },
    { id: 'Velocity', label: 'Velocity / Proxy' }
  ];

  const baseGameVersions = ['26.3', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'];
  const gameVersions = [
    { id: 'all', label: 'Alle MC-Versionen' },
    ...Array.from(
      new Set([
        ...availableVersionFacets.map(v => v.version),
        ...baseGameVersions
      ])
    ).map(v => {
      const facet = availableVersionFacets.find(f => f.version === v);
      return {
        id: v,
        label: facet ? `MC ${v} (${facet.count})` : `MC ${v}`
      };
    })
  ];

  const toggleTagFilter = (tagKey: string) => {
    const clean = tagKey.trim().toLowerCase().replace(/\s+/g, '-');
    if (!clean) return;
    setSelectedTags(prev =>
      prev.includes(clean) ? prev.filter(t => t !== clean) : [...prev, clean]
    );
  };

  // Fetch initial server-side mod index facets (tags, MC versions, counts)
  useEffect(() => {
    let active = true;
    const loadFacets = async () => {
      try {
        const res = await fetch('/api/mods/index/facets');
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data?.success && active) {
          setTotalIndexedMods(Number(data.totalIndexed) || MODS_AND_PLUGINS_DATABASE.length);
          setLastIndexedAt(data.lastIndexedAt || null);
          if (Array.isArray(data.facets?.tags)) setAvailableTagFacets(data.facets.tags);
          if (Array.isArray(data.facets?.mcVersions)) setAvailableVersionFacets(data.facets.mcVersions);
        }
      } catch {}
    };
    loadFacets();
    return () => { active = false; };
  }, []);

  const handleRebuildIndex = async () => {
    setIsRebuildingIndex(true);
    try {
      const res = await fetch('/api/mods/index/rebuild', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data?.success) {
        setTotalIndexedMods(Number(data.totalIndexed) || MODS_AND_PLUGINS_DATABASE.length);
        setLastIndexedAt(data.lastIndexedAt || new Date().toISOString());
        if (Array.isArray(data.facets?.tags)) setAvailableTagFacets(data.facets.tags);
        if (Array.isArray(data.facets?.mcVersions)) setAvailableVersionFacets(data.facets.mcVersions);
        setInstalledNotification(
          `Serverseitiger Mod-Index erfolgreich neu aufgebaut (${data.totalIndexed} Mods · ${data.tagsCount} Tags · ${data.mcVersionsCount} MC-Versionen).`
        );
        setTimeout(() => setInstalledNotification(null), 4000);
      }
    } catch {
      setErrorMessage('Mod-Index konnte nicht neu aufgebaut werden.');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setIsRebuildingIndex(false);
    }
  };

  // Perform server-side indexed search with debounce (falls back to unified client search if backend unavailable)
  useEffect(() => {
    let isCancelled = false;
    const executeSearch = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
        params.set('tagMode', tagMode);
        if (selectedVersion !== 'all') {
          params.set('mcVersion', selectedVersion);
          params.set('compatibility', compatibilityMode);
        }
        if (selectedLoader !== 'all') params.set('loader', selectedLoader);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (selectedProvider !== 'all') params.set('provider', selectedProvider);
        params.set('sort', sortBy);
        if (searchQuery.trim().length >= 2 && (selectedProvider === 'all' || selectedProvider === 'modrinth')) {
          params.set('refreshLive', 'true');
        }

        const res = await fetch(`/api/mods/index/search?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data?.success) {
            setDisplayItems(Array.isArray(data.items) ? data.items : []);
            setApiSourceLabel(data.source || 'Serverseitiger Mod-Index');
            setIsLiveApi(Boolean(data.isLiveApi));
            setTotalIndexedMods(Number(data.totalIndexed) || totalIndexedMods);
            if (data.lastIndexedAt) setLastIndexedAt(data.lastIndexedAt);
            if (Array.isArray(data.facets?.tags) && selectedTags.length === 0 && !searchQuery.trim()) {
              setAvailableTagFacets(data.facets.tags);
            }
            setInfoMessage(null);
            return;
          }
        }

        // Graceful fallback if backend index route is unreachable
        const result = await searchUnifiedMods({
          query: searchQuery,
          provider: selectedProvider,
          category: selectedCategory
        });

        if (!isCancelled) {
          let list = result.items;
          if (selectedLoader !== 'all') {
            list = list.filter(m => {
              const tagsAndLoaders = [...m.tags, ...(m.loaders || [])].map(t => t.toLowerCase());
              return tagsAndLoaders.some(t => t.includes(selectedLoader.toLowerCase()));
            });
          }
          if (selectedVersion !== 'all') {
            list = list.filter(m => !m.supportedVersions || m.supportedVersions.includes(selectedVersion));
          }
          if (selectedTags.length > 0) {
            list = list.filter(m => {
              const mTags = m.tags.map(t => t.toLowerCase().replace(/\s+/g, '-'));
              return tagMode === 'all'
                ? selectedTags.every(st => mTags.includes(st))
                : selectedTags.some(st => mTags.includes(st));
            });
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
    }, 280);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedProvider, selectedCategory, selectedLoader, selectedVersion, compatibilityMode, selectedTags, tagMode, sortBy]);

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

  const handleDirectInstall = (mod: ModItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!targetServerId) {
      setErrorMessage('Bitte wähle zuerst einen Ziel-Server aus der Auswahlliste oben aus!');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    setInstallingModId(mod.id);
    handleInstall(mod);
    setTimeout(() => {
      setInstallingModId(null);
    }, 450);
  };

  const toggleModSelection = (modId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedModIds(prev => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedModIds(new Set(displayItems.map(m => m.id)));
  };

  const handleClearSelection = () => {
    setSelectedModIds(new Set());
  };

  const handleOpenAutoResolve = () => {
    if (!targetServerId) {
      setErrorMessage('Bitte wähle zuerst einen Ziel-Server aus der Auswahlliste oben aus!');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    setIsAutoResolveModalOpen(true);
  };

  const selectedModsList = displayItems.filter(m => selectedModIds.has(m.id));
  const modsForAutoResolve = selectedModsList.length > 0 
    ? selectedModsList 
    : (displayItems.length > 0 ? displayItems.slice(0, 5) : []);

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

        {/* Target Server Selector, Auto-Resolve & Custom Upload Buttons */}
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

          {/* Prominent Auto-Resolve Dependencies button in top action bar */}
          <button
            onClick={handleOpenAutoResolve}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-emerald-600/25 active:scale-95 border border-emerald-500/40"
            title="Abhängigkeiten & Kompatibilität mit Gemini API automatisch analysieren und installieren"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Auto-Resolve Dependencies</span>
            {selectedModIds.size > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-200 rounded-full text-[10px] font-mono border border-emerald-700/60 ml-0.5">
                {selectedModIds.size}
              </span>
            )}
          </button>

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
                <option value="relevance">Sortierung: Relevanz</option>
                <option value="downloads">Sortierung: Beliebtheit</option>
                <option value="name">Sortierung: Name (A-Z)</option>
              </select>
            </div>

            {/* Minecraft Compatibility & Target-Server Sync Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-800/80 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-neutral-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  MC-Kompatibilität:
                </span>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCompatibilityMode('compatible')}
                    className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                      compatibilityMode === 'compatible' ? 'bg-emerald-600 text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Kompatibel (inkl. Minor-Reihe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompatibilityMode('strict')}
                    className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                      compatibilityMode === 'strict' ? 'bg-emerald-600 text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Nur Exakt
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompatibilityMode('all')}
                    className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                      compatibilityMode === 'all' ? 'bg-emerald-600 text-white font-semibold' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Alle zeigen
                  </button>
                </div>

                {currentTargetServer && currentTargetServer.category === 'minecraft' && currentTargetServer.version && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVersion(currentTargetServer.version);
                      setCompatibilityMode('compatible');
                      if (currentTargetServer.minecraftType) {
                        const t = currentTargetServer.minecraftType.toLowerCase();
                        if (t.includes('fabric')) setSelectedLoader('Fabric');
                        else if (t.includes('neoforge')) setSelectedLoader('NeoForge');
                        else if (t.includes('forge')) setSelectedLoader('Forge');
                        else if (t.includes('paper') || t.includes('purpur') || t.includes('spigot')) setSelectedLoader('Paper');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/60 text-emerald-300 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    Zielserver-Version übernehmen (MC {currentTargetServer.version})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleRebuildIndex}
                disabled={isRebuildingIndex}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50"
                title="Serverseitigen Mod- & Tag-Index neu erstellen"
              >
                <RefreshCw className={`w-3 h-3 text-emerald-400 ${isRebuildingIndex ? 'animate-spin' : ''}`} />
                <span>Index aktualisieren</span>
              </button>
            </div>

            {/* Server-Side Indexed Tag Filter Bar */}
            {availableTagFacets.length > 0 && (
              <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-300 font-semibold">
                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Indexierte Tags ({availableTagFacets.length})</span>
                    {selectedTags.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-mono">
                        {selectedTags.length} aktiv
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    {selectedTags.length > 1 && (
                      <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-md p-0.5">
                        <button
                          type="button"
                          onClick={() => setTagMode('all')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${
                            tagMode === 'all' ? 'bg-emerald-600 text-white font-semibold' : 'text-neutral-400'
                          }`}
                        >
                          Alle (UND)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTagMode('any')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${
                            tagMode === 'any' ? 'bg-emerald-600 text-white font-semibold' : 'text-neutral-400'
                          }`}
                        >
                          Mind. ein Tag (ODER)
                        </button>
                      </div>
                    )}
                    {selectedTags.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedTags([])}
                        className="flex items-center gap-1 text-neutral-400 hover:text-rose-300 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>Tags zurücksetzen</span>
                      </button>
                    )}
                    {availableTagFacets.length > 16 && (
                      <button
                        type="button"
                        onClick={() => setShowAllTags(prev => !prev)}
                        className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline"
                      >
                        {showAllTags ? 'Weniger Tags' : `Alle ${availableTagFacets.length} Tags`}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(showAllTags ? availableTagFacets : availableTagFacets.slice(0, 16)).map(tf => {
                    const isActive = selectedTags.includes(tf.key);
                    return (
                      <button
                        key={tf.key}
                        type="button"
                        onClick={() => toggleTagFilter(tf.key)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 border ${
                          isActive
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200 font-semibold'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                        }`}
                      >
                        <span>#{tf.label}</span>
                        <span className={`text-[10px] font-mono ${isActive ? 'text-emerald-300' : 'text-neutral-500'}`}>
                          {tf.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400 font-mono pt-1 border-t border-neutral-800">
              <span className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-emerald-400" />
                <span>Index: {totalIndexedMods} Mods · {availableTagFacets.length} Tags</span>
                {lastIndexedAt && (
                  <span className="text-neutral-500">
                    (Stand: {new Date(lastIndexedAt).toLocaleTimeString('de-DE')})
                  </span>
                )}
              </span>
              <span>
                Quelle: <span className="text-neutral-200 font-bold">{apiSourceLabel}</span> ({displayItems.length} Treffer)
              </span>
            </div>
          </div>

          {/* Multi-Select & Auto-Resolve Toolbar */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (selectedModIds.size === displayItems.length && displayItems.length > 0) {
                    handleClearSelection();
                  } else {
                    handleSelectAllVisible();
                  }
                }}
                className="flex items-center gap-1.5 text-neutral-300 hover:text-white cursor-pointer font-medium"
              >
                {selectedModIds.size > 0 && selectedModIds.size === displayItems.length ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : selectedModIds.size > 0 ? (
                  <CheckSquare className="w-4 h-4 text-emerald-500/70" />
                ) : (
                  <Square className="w-4 h-4 text-neutral-500" />
                )}
                <span>
                  {selectedModIds.size > 0 
                    ? `${selectedModIds.size} von ${displayItems.length} Mods ausgewählt` 
                    : 'Alle sichtbaren Mods auswählen'}
                </span>
              </button>

              {selectedModIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
                >
                  Auswahl aufheben
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAutoResolve}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm shadow-emerald-600/30 active:scale-95"
                title="Ausgewählte Mods mit Gemini API auf Kompatibilität prüfen und Abhängigkeiten auflösen"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Auto-Resolve Dependencies {selectedModIds.size > 0 ? `(${selectedModIds.size} ausgewählt)` : ''}</span>
              </button>
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
              {displayItems.map((mod) => {
                const isInstalledOnCurrent = (currentTargetServer?.installedMods || []).some(inst => 
                  inst.modId.toLowerCase() === mod.id.toLowerCase() ||
                  inst.name.toLowerCase().trim() === mod.name.toLowerCase().trim()
                );
                const isSelected = selectedModIds.has(mod.id);

                return (
                <div 
                  key={mod.id}
                  onClick={() => setSelectedModForDetail(mod)}
                  className={`bg-neutral-900 border rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer group hover:bg-neutral-850/60 ${
                    isSelected ? 'border-emerald-500/80 ring-1 ring-emerald-500/40 bg-emerald-950/20' : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => toggleModSelection(mod.id, e)}
                          className="text-neutral-500 hover:text-emerald-400 p-0.5 cursor-pointer shrink-0 transition-colors"
                          title={isSelected ? "Auswahl entfernen" : "Mod auswählen für Auto-Resolve"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400" />
                          )}
                        </button>
                        <h4 className="font-semibold text-neutral-100 text-sm group-hover:text-emerald-400 transition-colors truncate">
                          {mod.name}
                        </h4>
                      </div>
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

                    {/* Minecraft Version Compatibility Badge */}
                    {selectedVersion !== 'all' && mod.compatibilityStatus && (
                      <div className="mb-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            mod.compatibilityStatus === 'exact'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/70'
                              : mod.compatibilityStatus === 'minor' || mod.compatibilityStatus === 'universal'
                              ? 'bg-sky-950/80 text-sky-300 border-sky-700/70'
                              : 'bg-rose-950/70 text-rose-300 border-rose-700/60'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{mod.compatibilityLabel || `MC ${selectedVersion}`}</span>
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1 mb-3">
                      {mod.tags.slice(0, 5).map(t => {
                        const tagKey = t.trim().toLowerCase().replace(/\s+/g, '-');
                        const isTagSelected = selectedTags.includes(tagKey);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTagFilter(tagKey);
                            }}
                            title={`Nach Tag "${t}" filtern`}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                              isTagSelected
                                ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500'
                                : 'text-neutral-400 bg-neutral-950 border-neutral-800 hover:border-emerald-700 hover:text-emerald-300'
                            }`}
                          >
                            #{t}
                          </button>
                        );
                      })}
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

                    {isInstalledOnCurrent ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                          <Check className="w-3.5 h-3.5" />
                          <span>Installiert</span>
                        </span>
                        <button
                          onClick={() => setSelectedModForInstall(mod)}
                          className="text-[10px] text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
                        >
                          Neu
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => handleDirectInstall(mod, e)}
                          disabled={installingModId === mod.id}
                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700 text-white rounded text-xs font-bold cursor-pointer transition-all shadow-sm shadow-emerald-600/30 active:scale-95"
                        >
                          {installingModId === mod.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Installiere...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>1-Click Install</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedModForInstall(mod);
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                          title="Erweiterte Installationsoptionen"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
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
          onInstallMod={(m) => {
            setSelectedModForDetail(null);
            setSelectedModForInstall(m);
          }}
          isInstalled={(currentTargetServer?.installedMods || []).some(inst => 
            inst.modId.toLowerCase() === selectedModForDetail.id.toLowerCase() ||
            inst.name.toLowerCase().trim() === selectedModForDetail.name.toLowerCase().trim()
          ) || false}
        />
      )}

      {/* 1-Click Interactive Mod Install Modal */}
      {selectedModForInstall && (
        <ModInstallModal
          isOpen={!!selectedModForInstall}
          onClose={() => setSelectedModForInstall(null)}
          mod={selectedModForInstall}
          server={currentTargetServer || null}
          allServers={servers}
          onConfirmInstall={(srvId, modToInstall, restart) => {
            onInstallModToServer(srvId, modToInstall);
            const srv = servers.find(s => s.id === srvId);
            setInstalledNotification(`"${modToInstall.name}" wurde erfolgreich auf "${srv?.name || srvId}" installiert!`);
            setTimeout(() => setInstalledNotification(null), 3500);
          }}
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

      {/* Gemini AI Auto-Resolve Dependencies Modal */}
      <AutoResolveModal
        isOpen={isAutoResolveModalOpen}
        onClose={() => setIsAutoResolveModalOpen(false)}
        server={currentTargetServer || null}
        selectedMods={modsForAutoResolve}
        onInstallDependency={(mod) => {
          handleInstall(mod);
        }}
        onRefreshServer={() => {
          if (targetServerId) {
            const target = servers.find(s => s.id === targetServerId);
            if (target) {
              setInstalledNotification(`Abhängigkeit für "${target.name}" installiert!`);
              setTimeout(() => setInstalledNotification(null), 3500);
            }
          }
        }}
      />
    </div>
  );
};
