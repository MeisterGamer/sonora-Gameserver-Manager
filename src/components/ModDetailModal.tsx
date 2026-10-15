import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Check, 
  ExternalLink, 
  Layers, 
  Calendar, 
  HardDrive, 
  ShieldCheck, 
  FileText, 
  GitBranch, 
  Users, 
  AlertTriangle,
  Sparkles,
  PackageCheck,
  CheckCircle2
} from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';

interface ModDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  mod: ModItem | null;
  server?: ServerInstance;
  onInstallMod: (mod: ModItem) => void;
  onUninstallMod?: (modId: string) => void;
  isInstalled: boolean;
}

export const ModDetailModal: React.FC<ModDetailModalProps> = ({
  isOpen,
  onClose,
  mod,
  server,
  onInstallMod,
  onUninstallMod,
  isInstalled
}) => {
  if (!isOpen || !mod) return null;

  const [activeSection, setActiveSection] = useState<'overview' | 'versions' | 'dependencies'>('overview');
  const [selectedVersion, setSelectedVersion] = useState<string>(mod.version || 'Latest');

  // Simulated version history if not explicitly provided
  const versions = mod.versionsList || [
    {
      versionNumber: mod.version || '1.0.0',
      gameVersions: mod.supportedVersions || ['1.21.4', '1.20.4', '26.3'],
      loaders: mod.loaders || ['Fabric', 'Paper', 'Purpur'],
      releaseDate: 'Vor 3 Tagen',
      changelog: 'Stabilitätsverbesserungen, Bugfixes und Unterstützung für die neueste Version.',
      fileSize: mod.fileSize || '2.4 MB'
    },
    {
      versionNumber: 'Vorherige Version (LTS)',
      gameVersions: ['1.20.1', '1.19.4'],
      loaders: mod.loaders || ['Fabric', 'Paper'],
      releaseDate: 'Vor 2 Monaten',
      changelog: 'LTS-Build für ältere Server-Umgebungen.',
      fileSize: mod.fileSize || '2.3 MB'
    }
  ];

  const dependencies = mod.dependencies || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-0 my-8">
        {/* Top Header */}
        <div className="p-6 border-b border-neutral-800 bg-neutral-950/60 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-lg">
              {mod.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-bold text-neutral-100">{mod.name}</h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                  mod.source === 'Modrinth' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                  mod.source === 'SpigotMC' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                  mod.source === 'CurseForge' ? 'bg-orange-950 text-orange-300 border border-orange-800' :
                  'bg-neutral-800 text-neutral-300'
                }`}>
                  {mod.source}
                </span>
                {isInstalled && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Installiert</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1 flex-wrap">
                <span>von <strong className="text-neutral-300">{mod.author}</strong></span>
                <span>·</span>
                <span className="font-mono tabular-nums">{mod.downloads} Downloads</span>
                <span>·</span>
                <span className="font-mono">Lizenz: {mod.license || 'Open Source'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-neutral-800 text-xs">
          <button
            onClick={() => setActiveSection('overview')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeSection === 'overview'
                ? 'border-emerald-400 text-emerald-400 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Übersicht & Info
          </button>
          <button
            onClick={() => setActiveSection('versions')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeSection === 'versions'
                ? 'border-emerald-400 text-emerald-400 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Versionen & Downloads ({versions.length})
          </button>
          <button
            onClick={() => setActiveSection('dependencies')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeSection === 'dependencies'
                ? 'border-emerald-400 text-emerald-400 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Abhängigkeiten ({dependencies.length})
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[55vh] overflow-y-auto space-y-4 text-xs">
          {activeSection === 'overview' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">Beschreibung</h4>
                <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-line bg-neutral-950 p-4 rounded-xl border border-neutral-800/80">
                  {mod.longDescription || mod.description}
                </p>
              </div>

              {/* Supported Platforms / Loaders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block mb-1 flex items-center gap-1.5 font-medium">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Unterstützte Modloader</span>
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(mod.loaders || ['Fabric', 'Forge', 'Paper', 'Spigot']).map(l => (
                      <span key={l} className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-200 font-mono text-[11px]">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                  <span className="text-neutral-400 block mb-1 flex items-center gap-1.5 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Getestete Spielversionen</span>
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(mod.supportedVersions || ['1.21.4', '1.20.4', '26.3']).map(v => (
                      <span key={v} className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-emerald-400 font-mono text-[11px]">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Kategorien & Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {mod.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-neutral-950 border border-neutral-800 rounded-md text-[11px] text-neutral-300 font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'versions' && (
            <div className="space-y-3">
              <p className="text-neutral-400 text-xs">
                Wähle die passende Version für dein Server-Setup aus. Bei der 1-Klick-Installation wird die gewünschte Version automatisch heruntergeladen.
              </p>

              <div className="divide-y divide-neutral-800/80 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                {versions.map((ver, idx) => (
                  <div 
                    key={idx}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-900/40 transition-colors ${
                      selectedVersion === ver.versionNumber ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-100 text-xs font-mono">{ver.versionNumber}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">· {ver.releaseDate}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">· {ver.fileSize}</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">{ver.changelog}</p>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-neutral-500 font-mono">
                        <span>Kompatibel mit: {ver.gameVersions.join(', ')}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedVersion(ver.versionNumber);
                        onInstallMod({ ...mod, version: ver.versionNumber });
                      }}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-emerald-600 text-neutral-200 hover:text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Diese Version laden</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'dependencies' && (
            <div className="space-y-3">
              {dependencies.length === 0 ? (
                <div className="bg-neutral-950 p-6 rounded-xl border border-neutral-800 text-center text-neutral-400 space-y-1">
                  <PackageCheck className="w-8 h-8 mx-auto text-emerald-400 mb-1" />
                  <p className="font-medium text-neutral-200">Keine weiteren Abhängigkeiten erforderlich</p>
                  <p className="text-[11px] text-neutral-500">Diese Mod läuft eigenständig ohne zusätzliche Bibliotheken oder Hilfs-Plugins.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-neutral-400">
                    Für die einwandfreie Funktion sind folgende Pakete erforderlich:
                  </p>
                  <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
                    {dependencies.map((depId) => {
                      const isDepInstalled = (server?.installedMods || []).some(m => m.modId === depId || m.id === depId);
                      return (
                        <div key={depId} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-neutral-200">{depId}</span>
                            {isDepInstalled ? (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Bereits installiert
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Fehlt noch
                              </span>
                            )}
                          </div>

                          {!isDepInstalled && (
                            <button
                              onClick={() => {
                                onInstallMod({
                                  id: depId,
                                  name: depId,
                                  gameId: mod.gameId,
                                  category: 'Utility',
                                  author: 'Dependency Dev',
                                  downloads: '10M+',
                                  version: 'Latest',
                                  description: `Abhängigkeit für ${mod.name}`,
                                  source: mod.source,
                                  fileSize: '1.2 MB',
                                  tags: ['Dependency']
                                });
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Mitinstallieren
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between gap-3">
          <div className="text-neutral-400 text-xs font-mono">
            Größe: <strong className="text-neutral-200">{mod.fileSize}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              Schließen
            </button>

            {isInstalled ? (
              <button
                onClick={() => {
                  const targetInst = (server?.installedMods || []).find(m => 
                    m.modId === mod.id || m.id === mod.id || m.name.toLowerCase().trim() === mod.name.toLowerCase().trim()
                  );
                  if (targetInst && onUninstallMod) {
                    onUninstallMod(targetInst.id);
                    onClose();
                  }
                }}
                className="px-4 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Deinstallieren
              </button>
            ) : (
              <button
                onClick={() => {
                  onInstallMod(mod);
                  onClose();
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm shadow-emerald-600/30 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>1-Click Installation</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
