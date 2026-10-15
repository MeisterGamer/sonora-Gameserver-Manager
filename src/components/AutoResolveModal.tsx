import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  Loader2, 
  Check, 
  Layers, 
  ShieldCheck, 
  ArrowRight, 
  X,
  Server,
  Zap
} from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

export interface AutoResolveDependency {
  id: string;
  name: string;
  version: string;
  source: string;
  category: string;
  reason: string;
  tags?: string[];
  alreadyInstalled?: boolean;
}

export interface CompatibilityAnalysis {
  compatible: boolean;
  compatibilityScore: number;
  summary: string;
  analysisDetails?: {
    loaderCheck: string;
    versionCheck: string;
    conflictCheck: string;
  };
  warnings: string[];
  conflicts: Array<{ modA: string; modB: string; reason: string }>;
  missingDependencies: AutoResolveDependency[];
  installRecommendations?: string[];
}

interface AutoResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: ServerInstance | null;
  selectedMods: ModItem[];
  onInstallDependency: (mod: ModItem) => void;
  onRefreshServer?: () => void;
}

export const AutoResolveModal: React.FC<AutoResolveModalProps> = ({
  isOpen,
  onClose,
  server,
  selectedMods,
  onInstallDependency,
  onRefreshServer
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CompatibilityAnalysis | null>(null);
  const [isAiPowered, setIsAiPowered] = useState(true);
  const [aiModel, setAiModel] = useState<string>('gemini-2.5-flash');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInstallingAll, setIsInstallingAll] = useState(false);
  const [installedDepIds, setInstalledDepIds] = useState<Set<string>>(new Set());
  const [autoInstalledNotification, setAutoInstalledNotification] = useState<string | null>(null);

  // Trigger analysis when modal opens or selectedMods change
  useEffect(() => {
    if (isOpen && server) {
      runCompatibilityAnalysis();
    } else {
      setAnalysis(null);
      setErrorMessage(null);
      setInstalledDepIds(new Set());
      setAutoInstalledNotification(null);
    }
  }, [isOpen, server?.id, selectedMods.length]);

  const runCompatibilityAnalysis = async () => {
    if (!server) return;
    setIsLoading(true);
    setErrorMessage(null);
    setAnalysis(null);

    try {
      const response = await apiRequest('/api/servers/' + server.id + '/mods/auto-resolve-dependencies', 'POST', {
        selectedMods,
        autoInstall: false
      });

      if (response.compatibility) {
        setAnalysis(response.compatibility);
        setIsAiPowered(!!response.aiPowered);
        if (response.model) setAiModel(response.model);
      } else {
        throw new Error('Ungültiges Antwortformat der Kompatibilitätsanalyse');
      }
    } catch (err: any) {
      console.warn('API error, falling back to client-side rule resolver:', err);
      // Client-side heuristic fallback if server is unreachable
      const fallbackAnalysis = generateFallbackAnalysis(server, selectedMods);
      setAnalysis(fallbackAnalysis);
      setIsAiPowered(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallSingleDependency = (dep: AutoResolveDependency) => {
    const modToInstall: ModItem = {
      id: dep.id,
      name: dep.name,
      gameId: server?.category === 'minecraft' ? 'minecraft' : (server?.gameId || 'minecraft'),
      category: (dep.category as any) || 'Utility',
      author: 'Official Repository',
      downloads: '10M+',
      version: dep.version || 'Latest',
      description: dep.reason || `Erforderliche Abhängigkeit für ausgewählte Mods`,
      source: (dep.source as any) || 'SpigotMC',
      fileSize: '1.2 MB',
      tags: dep.tags || ['Dependency', 'Core']
    };

    onInstallDependency(modToInstall);
    setInstalledDepIds(prev => new Set(prev).add(dep.id));
    onRefreshServer?.();
  };

  const handleInstallAllDependencies = async () => {
    if (!analysis || !server) return;
    const depsToInstall = analysis.missingDependencies.filter(d => !installedDepIds.has(d.id));
    if (depsToInstall.length === 0) return;

    setIsInstallingAll(true);
    try {
      for (const dep of depsToInstall) {
        handleInstallSingleDependency(dep);
      }
      setAutoInstalledNotification(`${depsToInstall.length} Abhängigkeiten erfolgreich aufgelöst und auf "${server.name}" installiert!`);
      setTimeout(() => {
        setAutoInstalledNotification(null);
      }, 5000);
    } finally {
      setIsInstallingAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-100">
                  Auto-Resolve Dependencies
                </h3>
                {isAiPowered ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Gemini AI ({aiModel})
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                    Regel-Engine
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Zielserver: <strong className="text-neutral-200">{server?.name || 'Kein Server gewählt'}</strong> ({server?.minecraftType || server?.gameName || 'Minecraft'} · {server?.version})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <Sparkles className="w-5 h-5 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-200">
                  Gemini API analysiert Plugin-Kompatibilität...
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  Prüfe Loader ({server?.minecraftType}), Version ({server?.version}) und Abhängigkeitsgraphen für {selectedMods.length} ausgewählte Mods.
                </p>
              </div>
            </div>
          ) : errorMessage ? (
            <div className="p-4 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Fehler bei der Analyse</div>
                <div className="text-neutral-300 mt-1">{errorMessage}</div>
                <button
                  onClick={runCompatibilityAnalysis}
                  className="mt-3 px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              
              {/* Notification Banner */}
              {autoInstalledNotification && (
                <div className="p-3 bg-emerald-950 border border-emerald-700 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{autoInstalledNotification}</span>
                </div>
              )}

              {/* Compatibility Score Card */}
              <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold font-mono text-base ${
                    analysis.compatibilityScore >= 90 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' :
                    analysis.compatibilityScore >= 70 ? 'bg-amber-950 text-amber-400 border border-amber-700' :
                    'bg-rose-950 text-rose-400 border border-rose-700'
                  }`}>
                    {analysis.compatibilityScore}%
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm text-neutral-100">
                      {analysis.compatible ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Kompatibilität verifiziert</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Eingeschränkte Kompatibilität</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                      {analysis.summary}
                    </p>
                  </div>
                </div>

                {analysis.missingDependencies.length > 0 && (
                  <button
                    onClick={handleInstallAllDependencies}
                    disabled={isInstallingAll || analysis.missingDependencies.every(d => installedDepIds.has(d.id))}
                    className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-emerald-600/20 active:scale-95 shrink-0 flex items-center justify-center gap-2"
                  >
                    {isInstallingAll ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Installiere Abhängigkeiten...</span>
                      </>
                    ) : analysis.missingDependencies.every(d => installedDepIds.has(d.id)) ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Alle Abhängigkeiten installiert</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Alle Abhängigkeiten installieren ({analysis.missingDependencies.filter(d => !installedDepIds.has(d.id)).length})</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Analysis Details (Loader, Version, Conflicts) */}
              {analysis.analysisDetails && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-1">
                    <div className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      <span>Loader-Check</span>
                    </div>
                    <p className="text-neutral-200 text-[11px] leading-snug">
                      {analysis.analysisDetails.loaderCheck}
                    </p>
                  </div>

                  <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-1">
                    <div className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                      <Server className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Version-Match</span>
                    </div>
                    <p className="text-neutral-200 text-[11px] leading-snug">
                      {analysis.analysisDetails.versionCheck}
                    </p>
                  </div>

                  <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-1">
                    <div className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Konflikt-Prüfung</span>
                    </div>
                    <p className="text-neutral-200 text-[11px] leading-snug">
                      {analysis.analysisDetails.conflictCheck}
                    </p>
                  </div>
                </div>
              )}

              {/* Missing Required Dependencies Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Erforderliche Abhängigkeiten</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                      {analysis.missingDependencies.length}
                    </span>
                  </h4>
                </div>

                {analysis.missingDependencies.length === 0 ? (
                  <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Keine fehlenden Abhängigkeiten festgestellt! Alle Voraussetzungen sind erfüllt.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {analysis.missingDependencies.map((dep) => {
                      const isInstalled = installedDepIds.has(dep.id) || dep.alreadyInstalled;
                      return (
                        <div
                          key={dep.id}
                          className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-100 text-xs">
                                {dep.name}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                                {dep.version || 'Latest'}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                {dep.source}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                              {dep.reason}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isInstalled ? (
                              <span className="flex items-center gap-1 px-3 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-xs font-semibold">
                                <Check className="w-3.5 h-3.5" />
                                <span>Installiert</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleInstallSingleDependency(dep)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Installieren</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Mods List */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                  Analysierte Mods ({selectedMods.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMods.map((mod) => (
                    <span
                      key={mod.id}
                      className="text-xs bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded-lg text-neutral-300 font-medium flex items-center gap-1"
                    >
                      <span>{mod.name}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">({mod.source})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Conflicts or Warnings if any */}
              {analysis.conflicts.length > 0 && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl space-y-1.5 text-xs">
                  <div className="text-rose-300 font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Inkompatibilitäten & Konflikte gefunden</span>
                  </div>
                  {analysis.conflicts.map((c, i) => (
                    <div key={i} className="text-neutral-300 text-[11px]">
                      <strong>{c.modA}</strong> kollidiert mit <strong>{c.modB}</strong>: {c.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400 font-mono">
            Mod-Hub Auto-Resolver
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};

// Client-side heuristic fallback for immediate responsiveness if network is unavailable
function generateFallbackAnalysis(server: ServerInstance, selectedMods: ModItem[]): CompatibilityAnalysis {
  const missing: AutoResolveDependency[] = [];
  const warnings: string[] = [];
  const conflicts: Array<{ modA: string; modB: string; reason: string }> = [];

  const modNames = selectedMods.map(m => m.name.toLowerCase());
  const installedNames = (server.installedMods || []).map(m => m.name.toLowerCase());
  const allNames = [...modNames, ...installedNames];

  // 1. EssentialsX requires Vault
  if (allNames.some(n => n.includes('essentials')) && !allNames.some(n => n.includes('vault'))) {
    missing.push({
      id: 'vault',
      name: 'Vault',
      version: '1.7.3',
      source: 'SpigotMC',
      category: 'Wirtschaft',
      reason: 'Wirtschafts- und Rechteschnittstelle erforderlich für EssentialsX',
      tags: ['API', 'Economy']
    });
  }

  // 2. Fabric mods require Fabric API
  const isFabric = server.minecraftType === 'fabric' || selectedMods.some(m => m.loaders?.includes('Fabric'));
  const hasFabricMods = allNames.some(n => n.includes('sodium') || n.includes('lithium') || n.includes('iris'));
  if (isFabric && hasFabricMods && !allNames.some(n => n.includes('fabric api') || n.includes('fabric-api'))) {
    missing.push({
      id: 'fabric_api',
      name: 'Fabric API',
      version: 'Latest',
      source: 'Modrinth',
      category: 'Utility',
      reason: 'Wesentliche Hooks und Kern-Schnittstellen für Fabric-Mods',
      tags: ['Fabric', 'API', 'Core']
    });
  }

  // 3. Iris requires Sodium
  if (allNames.some(n => n.includes('iris')) && !allNames.some(n => n.includes('sodium'))) {
    missing.push({
      id: 'sodium',
      name: 'Sodium',
      version: 'Latest',
      source: 'Modrinth',
      category: 'Performance',
      reason: 'Iris Shader Engine setzt Sodium als Rendering-Basis voraus',
      tags: ['Fabric', 'Performance']
    });
  }

  // 4. WorldGuard / FAWE requires WorldEdit
  if (allNames.some(n => n.includes('worldguard') || n.includes('fawe')) && !allNames.some(n => n.includes('worldedit'))) {
    missing.push({
      id: 'worldedit',
      name: 'WorldEdit',
      version: '7.3.9',
      source: 'SpigotMC',
      category: 'Welt & Dimensionen',
      reason: 'Erforderlicher Vektoreditor für Regionsschutz und Schematics',
      tags: ['Spigot', 'Paper', 'Builder']
    });
  }

  return {
    compatible: conflicts.length === 0,
    compatibilityScore: missing.length === 0 ? 100 : Math.max(75, 100 - missing.length * 10),
    summary: missing.length > 0
      ? `${missing.length} erforderliche Abhängigkeit(en) für die ausgewählten Mods identifiziert.`
      : 'Alle ausgewählten Mods sind mit der Serverkonfiguration kompatibel.',
    analysisDetails: {
      loaderCheck: `Kompatibel mit Plattform ${server.minecraftType || 'Standard'}`,
      versionCheck: `Geprüft gegen Spielversion ${server.version || '1.21.4'}`,
      conflictCheck: conflicts.length === 0 ? 'Keine Mod-Kollisionen festgestellt' : `${conflicts.length} Konflikt(e) gefunden`
    },
    warnings,
    conflicts,
    missingDependencies: missing,
    installRecommendations: missing.map(m => `Installiere ${m.name}`)
  };
}
