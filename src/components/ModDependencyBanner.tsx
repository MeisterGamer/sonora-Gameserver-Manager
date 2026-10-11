import React from 'react';
import { AlertTriangle, CheckCircle, Download, ShieldAlert, Sparkles } from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';

interface ModDependencyBannerProps {
  server: ServerInstance;
  onInstallMod: (mod: ModItem) => void;
  onNotify?: (msg: string) => void;
}

export const ModDependencyBanner: React.FC<ModDependencyBannerProps> = ({
  server,
  onInstallMod,
  onNotify
}) => {
  const installedModIds = server.installedMods.map(m => m.modId.toLowerCase());

  // Check common dependencies
  const missingIssues: { modName: string; requiredId: string; requiredName: string; reason: string }[] = [];

  if (installedModIds.includes('essentialsx') && !installedModIds.includes('vault')) {
    missingIssues.push({
      modName: 'EssentialsX',
      requiredId: 'vault',
      requiredName: 'Vault',
      reason: 'Wirtschafts-API und Chat-Präfixe sind ohne Vault deaktiviert.'
    });
  }

  const hasFabricMods = server.installedMods.some(m => 
    m.name.toLowerCase().includes('sodium') || 
    m.name.toLowerCase().includes('lithium') || 
    m.name.toLowerCase().includes('create')
  );
  if (hasFabricMods && !installedModIds.includes('fabric_api') && server.minecraftType === 'fabric') {
    missingIssues.push({
      modName: 'Fabric Mods (Sodium / Lithium)',
      requiredId: 'fabric_api',
      requiredName: 'Fabric API',
      reason: 'Fabric API stellt zentrale Hooks bereit, die von fast allen Fabric-Mods vorausgesetzt werden.'
    });
  }

  if (installedModIds.includes('rust_kits') && !installedModIds.includes('oxide_core')) {
    missingIssues.push({
      modName: 'Rust Kits',
      requiredId: 'oxide_core',
      requiredName: 'Oxide / uMod Core',
      reason: 'Rust C#-Plugins erfordern das Oxide Hook-System.'
    });
  }

  if (missingIssues.length === 0) return null;

  const handleResolve = (issue: typeof missingIssues[0]) => {
    const modToInstall = MODS_AND_PLUGINS_DATABASE.find(m => m.id === issue.requiredId) || {
      id: issue.requiredId,
      name: issue.requiredName,
      gameId: server.category === 'minecraft' ? 'minecraft' : server.gameId,
      category: 'Utility' as const,
      author: 'Official Dev',
      downloads: '10M+',
      version: 'Latest',
      description: `Erforderliche Kern-Abhängigkeit für ${issue.modName}`,
      source: 'SpigotMC' as const,
      fileSize: '1.5 MB',
      tags: ['Dependency', 'Core']
    };

    onInstallMod(modToInstall);
    onNotify?.(`Abhängigkeit "${issue.requiredName}" wurde erfolgreich installiert!`);
  };

  return (
    <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 text-xs space-y-2">
      <div className="flex items-center gap-2 text-amber-300 font-bold">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>Erforderliche Mod-Abhängigkeiten fehlen ({missingIssues.length})</span>
      </div>

      <div className="space-y-2 pt-1">
        {missingIssues.map((issue, idx) => (
          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950/80 p-2.5 rounded-lg border border-amber-900/50">
            <div>
              <div className="text-neutral-200 font-medium">
                <strong className="text-amber-200">{issue.modName}</strong> benötigt <strong className="text-emerald-400">{issue.requiredName}</strong>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">{issue.reason}</p>
            </div>

            <button
              onClick={() => handleResolve(issue)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3 h-3" />
              <span>{issue.requiredName} installieren</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
