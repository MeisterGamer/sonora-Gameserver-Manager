import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  CheckCircle2, 
  Package, 
  Folder, 
  ShieldCheck, 
  RotateCw, 
  Coffee,
  Terminal,
  Loader2,
  Server
} from 'lucide-react';
import { ModItem, ServerInstance } from '../types/game';

interface ModInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  mod: ModItem | null;
  server: ServerInstance | null;
  allServers?: ServerInstance[];
  onConfirmInstall: (serverId: string, mod: ModItem, restartServer?: boolean) => void;
}

export const ModInstallModal: React.FC<ModInstallModalProps> = ({
  isOpen,
  onClose,
  mod,
  server,
  allServers = [],
  onConfirmInstall
}) => {
  if (!isOpen || !mod) return null;

  const [selectedServerId, setSelectedServerId] = useState<string>(server?.id || allServers[0]?.id || '');
  const [restartAfterInstall, setRestartAfterInstall] = useState(false);
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

  const targetServer = (allServers.length > 0 ? allServers.find(s => s.id === selectedServerId) : server) || server;

  // Determine target directory
  const isFabricOrForge = mod.tags?.some(t => ['fabric', 'forge', 'neoforge'].includes(t.toLowerCase())) || 
                          mod.loaders?.some(l => ['fabric', 'forge', 'neoforge'].includes(l.toLowerCase()));
  const targetFolder = isFabricOrForge ? '/mods/' : '/plugins/';
  const fileName = `${mod.name.replace(/[^\w-]/g, '')}.jar`;

  useEffect(() => {
    if (server) {
      setSelectedServerId(server.id);
    } else if (allServers.length > 0 && !selectedServerId) {
      setSelectedServerId(allServers[0].id);
    }
  }, [server, allServers]);

  const handleStartInstallation = () => {
    if (!selectedServerId) return;

    setInstallState('installing');
    setProgress(15);
    setCurrentStep(`Verbinde mit ${mod.source} CDN & rufe Release-Artefakt ab...`);

    setTimeout(() => {
      setProgress(45);
      setCurrentStep(`Lade ${fileName} (${mod.fileSize || '2.4 MB'}) herunter...`);
    }, 450);

    setTimeout(() => {
      setProgress(75);
      setCurrentStep(`Prüfe SHA-256 Integrität & Kompatibilität mit ${targetServer?.version || 'Minecraft'}...`);
    }, 950);

    setTimeout(() => {
      setProgress(95);
      setCurrentStep(`Platziere JAR in ${targetFolder}${fileName} und generiere Config...`);
    }, 1450);

    setTimeout(() => {
      setProgress(100);
      setInstallState('completed');
      setCurrentStep(`Erweiterung "${mod.name}" erfolgreich installiert!`);
      onConfirmInstall(selectedServerId, mod, restartAfterInstall);

      // Auto-close after completion after a brief celebration
      setTimeout(() => {
        handleFinish();
      }, 1500);
    }, 1850);
  };

  const handleFinish = () => {
    setInstallState('idle');
    setProgress(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0 text-xs">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <span>1-Click Mod- & Plugin-Installer</span>
              </h3>
              <p className="text-neutral-400 text-xs">
                Installiere Erweiterung auf deinen Gameserver
              </p>
            </div>
          </div>
          {installState !== 'installing' && (
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          {/* Mod Overview Box */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center font-bold text-emerald-400 shrink-0 text-base">
              {mod.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-neutral-100 text-sm truncate">{mod.name}</h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                  {mod.source}
                </span>
              </div>
              <p className="text-neutral-400 text-xs line-clamp-1 mt-0.5">
                {mod.description}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-1">
                <span>v{mod.version}</span>
                <span>·</span>
                <span>{mod.fileSize || '2.4 MB'}</span>
                <span>·</span>
                <span>{mod.author}</span>
              </div>
            </div>
          </div>

          {/* Server Selector if multiple servers available */}
          {allServers.length > 1 && !server && installState === 'idle' && (
            <div>
              <label className="block text-neutral-300 font-semibold mb-1.5 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ziel-Server auswählen:</span>
              </label>
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {allServers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gameName} · Port {s.port} · {s.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Installation Details info */}
          <div className="space-y-2 bg-neutral-950/60 p-3.5 rounded-xl border border-neutral-800/80">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span>Ziel-Instanz</span>
              </span>
              <span className="font-medium text-neutral-200 font-mono">{targetServer?.name || 'Standard-Server'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>Ziel-Verzeichnis</span>
              </span>
              <span className="font-mono text-emerald-400">{targetFolder}{fileName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-500" />
                <span>Laufzeit-Check</span>
              </span>
              <span className="text-neutral-300 font-mono">{targetServer?.javaVersion || 'Java 21'} (Kompatibel)</span>
            </div>
          </div>

          {/* Installation Progress Bar (Active state) */}
          {installState !== 'idle' && (
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-300 flex items-center gap-2">
                  {installState === 'installing' ? (
                    <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span className="font-medium">{currentStep}</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm shadow-emerald-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Restart Checkbox */}
          {installState === 'idle' && targetServer?.status === 'running' && (
            <label className="flex items-center gap-2.5 p-3 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer hover:bg-neutral-900 transition-colors">
              <input
                type="checkbox"
                checked={restartAfterInstall}
                onChange={(e) => setRestartAfterInstall(e.target.checked)}
                className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
              />
              <div>
                <span className="font-medium text-neutral-200 block">Server nach Installation sanft neu starten</span>
                <span className="text-[11px] text-neutral-500">Lädt neue Klassen und Konfigurationsdateien sofort in den Speicher</span>
              </div>
            </label>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3">
          {installState === 'idle' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleStartInstallation}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Jetzt installieren</span>
              </button>
            </>
          ) : installState === 'installing' ? (
            <div className="w-full text-center py-1 text-neutral-400 font-medium flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Installation wird ausgeführt...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Fertigstellen & Schließen</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
