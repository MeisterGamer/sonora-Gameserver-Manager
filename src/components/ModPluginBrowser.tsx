import React, { useState, useEffect } from 'react';
import { Search, Download, Check, Trash2, ToggleLeft, ToggleRight, ExternalLink, Filter, Package, Globe, Loader2, Sparkles } from 'lucide-react';
import { ModItem, InstalledMod, ServerInstance } from '../types/game';
import { searchUnifiedMods, ModProviderSource } from '../services/liveModService';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';

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
  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ModProviderSource>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterGameScope, setFilterGameScope] = useState<'server-only' | 'all'>('server-only');

  const [isLoading, setIsLoading] = useState(false);
  const [displayItems, setDisplayItems] = useState<ModItem[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>('Katalog');
  const [isLiveApi, setIsLiveApi] = useState(false);

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
          // If server-only filter is active
          let list = res.items;
          if (filterGameScope === 'server-only') {
            if (server.category === 'minecraft') {
              list = list.filter(m => m.gameId === 'minecraft');
            } else {
              list = list.filter(m => m.gameId === server.gameId || m.gameId === server.id);
            }
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
  }, [searchQuery, selectedProvider, selectedCategory, filterGameScope, server]);

  const isModInstalled = (modId: string) => {
    return server.installedMods.some(m => m.modId === modId);
  };

  return (
    <div className="space-y-4">
      {/* Top Filter and Tab Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tab Switcher */}
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
            onClick={() => setActiveTab('installed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'installed'
                ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Installiert ({server.installedMods.length})
          </button>
        </div>

        {/* Search & Provider Select */}
        <div className="flex flex-1 items-center gap-2 max-w-lg">
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
              placeholder="Live nach Mods & Plugins suchen (z. B. Sodium, LuckPerms)..."
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value as ModProviderSource)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">🌐 Alle Quellen</option>
            <option value="modrinth">🟢 Modrinth (Live)</option>
            <option value="spigot">📜 SpigotMC (Live)</option>
            <option value="curseforge">🔥 CurseForge</option>
            <option value="steam_workshop">⚙️ Workshop</option>
          </select>
        </div>
      </div>

      {/* Categories & Source Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md transition-colors shrink-0 cursor-pointer font-medium ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {cat === 'all' ? 'Alle Kategorien' : cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono shrink-0">
          {isLiveApi && (
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live-API</span>
            </span>
          )}
          <span>Quelle: {sourceLabel} ({displayItems.length})</span>
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'browse' ? (
        <div>
          {displayItems.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400">
              <Package className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
              <p className="font-medium text-sm text-neutral-200">Keine Mods oder Plugins gefunden</p>
              <p className="text-xs text-neutral-500 mt-1">Versuche andere Suchbegriffe oder wähle "Alle Quellen".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayItems.map((mod) => {
                const installed = isModInstalled(mod.id);
                return (
                  <div
                    key={mod.id}
                    className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-colors"
                  >
                    <div>
                      {/* Title & Source */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="font-semibold text-neutral-100 text-sm">{mod.name}</h4>
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
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono">{mod.downloads} DLs</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono">{mod.fileSize}</span>
                      </div>

                      <p className="text-xs text-neutral-300 line-clamp-3 mb-3 leading-relaxed">
                        {mod.description}
                      </p>

                      {/* Tag list */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {mod.tags.map(t => (
                          <span key={t} className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-neutral-400">v{mod.version}</span>
                      {installed ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>Installiert</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => onInstallMod(mod)}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors cursor-pointer"
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
      ) : (
        /* Installed Mods Tab */
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-200 text-sm">Aktive Erweiterungen auf diesem Server</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Installiert im Verzeichnis <code className="text-neutral-300 font-mono">/mods/</code> oder <code className="text-neutral-300 font-mono">/plugins/</code>
              </p>
            </div>
            <span className="text-xs font-mono text-neutral-400 tabular-nums">
              {server.installedMods.length} Pakete
            </span>
          </div>

          {server.installedMods.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">
              Es sind derzeit keine Mods oder Plugins auf diesem Server installiert.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/80">
              {server.installedMods.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onToggleMod(item.id, !item.enabled)}
                      className="cursor-pointer"
                      title={item.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      {item.enabled ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-neutral-500" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${item.enabled ? 'text-neutral-100' : 'text-neutral-400 line-through'}`}>
                          {item.name}
                        </span>
                        <span className="text-xs font-mono text-neutral-400">v{item.version}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                        <span>Quelle: {item.source}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{item.fileSize}</span>
                        <span>·</span>
                        <span>Installiert: {item.installedAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUninstallMod(item.id)}
                      className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Erweiterung deinstallieren"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
