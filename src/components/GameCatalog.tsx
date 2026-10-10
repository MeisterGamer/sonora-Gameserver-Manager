import React, { useState } from 'react';
import { Search, Plus, Download, Upload, ExternalLink, Cpu, HardDrive, Shield, Sparkles, Filter, Check } from 'lucide-react';
import { GameDefinition, GameCategory, PlatformOS } from '../types/game';
import { MINECRAFT_TYPES } from '../data/minecraftTypes';

interface GameCatalogProps {
  games: GameDefinition[];
  onSelectGameToDeploy: (game: GameDefinition) => void;
  onOpenAddCustomGame: () => void;
  onExportManifest: () => void;
  onImportManifest: (json: string) => void;
}

export const GameCatalog: React.FC<GameCatalogProps> = ({
  games,
  onSelectGameToDeploy,
  onOpenAddCustomGame,
  onExportManifest,
  onImportManifest
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterOS, setFilterOS] = useState<'all' | PlatformOS>('all');
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  const categories = [
    { id: 'all', label: `Alle (${games.length})` },
    { id: 'minecraft', label: `Minecraft (${games.filter(g => g.category === 'minecraft').length})` },
    { id: 'survival', label: 'Survival & Crafting' },
    { id: 'fps', label: 'Taktik-Shooter / FPS' },
    { id: 'sandbox', label: 'Sandbox & Bauen' },
    { id: 'simulation', label: 'Simulation & Logistik' },
    { id: 'coop', label: 'Ko-Op & Horror' },
    { id: 'rpg', label: 'RPG & Fantasy' },
    { id: 'custom', label: 'Benutzerdefiniert' }
  ];

  const filteredGames = games.filter((g) => {
    // Category filter
    if (selectedCategory === 'custom') {
      if (!g.isCustom) return false;
    } else if (selectedCategory !== 'all' && g.category !== selectedCategory) {
      return false;
    }

    // OS filter
    if (filterOS !== 'all' && !g.supportedPlatforms.includes(filterOS)) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = g.name.toLowerCase().includes(q);
      const matchDesc = g.description.toLowerCase().includes(q);
      const matchApp = g.steamAppId ? g.steamAppId.toString().includes(q) : false;
      const matchCat = g.category.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchApp && !matchCat) return false;
    }

    return true;
  });

  const getModFrameworkLabel = (mf: string) => {
    switch (mf) {
      case 'spigot_paper': return 'Paper & Spigot Plugins';
      case 'fabric': return 'Fabric Mods';
      case 'forge': return 'Forge Modpacks';
      case 'steam_workshop': return 'Steam Workshop';
      case 'umod_oxide': return 'uMod / Oxide';
      case 'bepinex': return 'BepInEx & Thunderstore';
      case 'sourcemod': return 'SourceMod';
      case 'ue4ss': return 'UE4SS Mods';
      case 'custom': return 'Benutzerdefiniert';
      default: return 'Kein Modding';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <span>Spiele-Katalog (100+ Steam Games & Minecraft)</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Vollständige Unterstützung aller Minecraft-Typen (Paper, Purpur, Forge, Bedrock) und über 100 Steam Dedicated Server.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenAddCustomGame}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors border border-neutral-700"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ Eigenes Spiel anlegen</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            title="Spiele-Manifest JSON importieren"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Manifest Importieren</span>
          </button>

          <button
            onClick={onExportManifest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            title="Alle Spiele als JSON exportieren"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportieren</span>
          </button>
        </div>
      </div>

      {/* Steam Availability Info Banner */}
      <div className="p-3 bg-neutral-900/90 border border-neutral-800 rounded-xl flex items-center justify-between text-xs text-neutral-300">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span>
            <strong>Minecraft & Standalone Games:</strong> 100% autark & ohne Steam nutzbar. Steam Dedicated Server nutzen den konfigurierten <strong>Offline-Bypass / Anonymous-Modus</strong>.
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 hidden sm:inline">
          Steam: Autark
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Spiel, Steam AppID oder Genre durchsuchen..."
            className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-400 font-medium shrink-0">Betriebssystem:</span>
          <select
            value={filterOS}
            onChange={(e) => setFilterOS(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Alle Plattformen</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
            <option value="macos">macOS</option>
          </select>
        </div>
      </div>

      {/* Category Pills (Functional Tabs) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer font-medium ${
              selectedCategory === cat.id
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredGames.map((game) => (
          <div
            key={game.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between hover:border-neutral-700 transition-colors group"
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-neutral-100 text-sm group-hover:text-emerald-400 transition-colors">
                    {game.name}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                    <span className="capitalize">{game.category}</span>
                    {game.steamAppId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">AppID: {game.steamAppId}</span>
                      </>
                    )}
                  </div>
                </div>

                <div 
                  className="w-3 h-3 rounded-full shrink-0 mt-1" 
                  style={{ backgroundColor: game.bannerColor }} 
                  title={`Genre: ${game.category}`}
                />
              </div>

              {/* Description */}
              <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed mb-3">
                {game.description}
              </p>

              {/* Specs & Capabilities */}
              <div className="space-y-1.5 text-[11px] text-neutral-400 border-t border-neutral-800/80 pt-2 mb-3">
                <div className="flex items-center justify-between">
                  <span>Standard-Port:</span>
                  <span className="font-mono text-neutral-200 tabular-nums">{game.defaultPort}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Empfohlener RAM:</span>
                  <span className="font-mono text-neutral-200 tabular-nums">{game.recommendedRamGb} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Mod-Unterstützung:</span>
                  <span className="text-emerald-400 font-medium truncate max-w-[150px]">
                    {getModFrameworkLabel(game.modFramework)}
                  </span>
                </div>
              </div>

              {/* OS Compatibility Tags */}
              <div className="flex items-center gap-1 mb-3">
                {game.supportedPlatforms.map((os) => (
                  <span
                    key={os}
                    className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800"
                  >
                    {os}
                  </span>
                ))}
                {game.isCustom && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    Custom
                  </span>
                )}
              </div>
            </div>

            {/* Deploy CTA */}
            <button
              onClick={() => onSelectGameToDeploy(game)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Server erstellen</span>
            </button>
          </div>
        ))}
      </div>

      {/* JSON Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <h3 className="text-base font-bold text-neutral-100">Spiele-Manifest JSON importieren</h3>
            <p className="text-xs text-neutral-400">
              Füge hier ein JSON-Array von Spiel-Definitionen ein, um den Katalog beliebig zu erweitern.
            </p>

            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='[ { "id": "my_game", "name": "Mein Spiel", "defaultPort": 7777, ... } ]'
              className="w-full h-44 bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-xs text-neutral-200 focus:outline-none focus:border-emerald-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  onImportManifest(importJsonText);
                  setShowImportModal(false);
                  setImportJsonText('');
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Importieren & Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
