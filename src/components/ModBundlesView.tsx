import React, { useState } from 'react';
import { 
  Package, 
  Download, 
  Check, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight,
  Loader2
} from 'lucide-react';
import { ModBundlePreset, ModItem, ServerInstance } from '../types/game';
import { CURATED_MOD_BUNDLES } from '../data/modBundles';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';

interface ModBundlesViewProps {
  server?: ServerInstance;
  onInstallMod: (mod: ModItem) => void;
  onNotify?: (msg: string) => void;
}

export const ModBundlesView: React.FC<ModBundlesViewProps> = ({
  server,
  onInstallMod,
  onNotify
}) => {
  const [installingBundleId, setInstallingBundleId] = useState<string | null>(null);
  const [installedBundles, setInstalledBundles] = useState<string[]>([]);

  const handleInstallBundle = (bundle: ModBundlePreset) => {
    setInstallingBundleId(bundle.id);

    setTimeout(() => {
      // Find all mods belonging to this bundle
      const modsToInstall: ModItem[] = bundle.modIds.map(id => {
        const found = MODS_AND_PLUGINS_DATABASE.find(m => m.id === id);
        if (found) return found;
        return {
          id,
          name: id,
          gameId: bundle.gameId,
          category: 'Utility',
          author: 'Bundle Author',
          downloads: 'Kuratierte Sammlung',
          version: '1.0.0',
          description: `Teil des ${bundle.name} Bundles`,
          source: 'Modrinth',
          fileSize: '2.0 MB',
          tags: bundle.tags
        };
      });

      // Install each mod
      modsToInstall.forEach(mod => {
        onInstallMod(mod);
      });

      setInstalledBundles(prev => [...prev, bundle.id]);
      setInstallingBundleId(null);
      onNotify?.(`Bundle "${bundle.name}" (${bundle.modIds.length} Erweiterungen) erfolgreich installiert!`);
    }, 1400);
  };

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-neutral-100 text-sm">Kuratierte Modpacks & Bundle-Presets</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Installiere aufeinander abgestimmte Erweiterungs-Pakete für maximale Performance, Sicherheit oder SMP-Features mit nur 1 Klick.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 self-start sm:self-auto">
          {CURATED_MOD_BUNDLES.length} fertige Pakete verfügbar
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CURATED_MOD_BUNDLES.map((bundle) => {
          const isInstalling = installingBundleId === bundle.id;
          const isInstalled = installedBundles.includes(bundle.id);

          return (
            <div 
              key={bundle.id}
              className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between hover:border-neutral-700 transition-all space-y-4 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-neutral-100 text-sm flex items-center gap-2">
                      <span>{bundle.name}</span>
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                      <span className="font-medium text-emerald-400">{bundle.gameName}</span>
                      <span>·</span>
                      <span className="font-mono text-neutral-300">Loader: {bundle.loader}</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
                    {bundle.targetVersion}
                  </span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                  {bundle.description}
                </p>

                {/* Included Mods List */}
                <div className="bg-neutral-950/80 rounded-lg p-3 border border-neutral-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-semibold">
                    <span>Enthaltene Komponenten:</span>
                    <span className="font-mono">{bundle.modIds.length} Mods/Plugins</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bundle.modIds.map((id) => (
                      <span 
                        key={id}
                        className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-200"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Install Action Button */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {bundle.tags.map(t => (
                    <span key={t} className="text-[10px] text-neutral-500 font-mono">
                      #{t}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleInstallBundle(bundle)}
                  disabled={isInstalling || isInstalled}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    isInstalled
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  }`}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Wird installiert...</span>
                    </>
                  ) : isInstalled ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Paket installiert</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Paket mit 1 Klick installieren</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
