import React, { useState, useEffect } from 'react';
import { 
  X, 
  Server, 
  Layers, 
  Cpu, 
  HardDrive, 
  Check, 
  Sparkles, 
  ShieldCheck,
  CheckCircle2,
  RotateCw,
  AlertTriangle,
  Play,
  CheckCheck
} from 'lucide-react';
import { GameDefinition, ServerInstance, PlatformOS, JavaVersion } from '../types/game';
import { MINECRAFT_TYPES, MINECRAFT_VERSIONS, MINECRAFT_SERVER_PROPERTIES_DEFAULT } from '../data/minecraftTypes';
import { AdminSettings } from '../types/adminSettings';
import { getStoredAdminSettings } from '../data/adminSettingsStore';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableGames: GameDefinition[];
  preselectedGame?: GameDefinition | null;
  currentOS: PlatformOS;
  adminSettings?: AdminSettings;
  onCreateServer: (serverData: Partial<ServerInstance>) => Promise<any> | void;
  onStartServerDirectly?: (serverId: string) => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  availableGames,
  preselectedGame,
  currentOS,
  adminSettings: propSettings,
  onCreateServer
}) => {
  const currentSettings = propSettings || getStoredAdminSettings();
  const [selectedGameId, setSelectedGameId] = useState<string>(preselectedGame?.id || availableGames[0]?.id || 'mc_paper');
  const [instanceName, setInstanceName] = useState<string>('Mein Neuer Gameserver');
  const [port, setPort] = useState<number>(25565);
  const [ramGb, setRamGb] = useState<number>(currentSettings.defaultRamAllocationGb || 6);
  const [targetOS, setTargetOS] = useState<PlatformOS>(currentOS);
  const [autoRestart, setAutoRestart] = useState<boolean>(true);
  const [autoInstallFiles, setAutoInstallFiles] = useState<boolean>(true);

  // Minecraft specific
  const [mcVersion, setMcVersion] = useState<string>(currentSettings.defaultMinecraftVersion || '1.21.4');
  const [mcJava, setMcJava] = useState<JavaVersion>(currentSettings.defaultJavaVersion || 'Java 21');

  const handleMcVersionChange = (newVer: string) => {
    setMcVersion(newVer);
    if (newVer.startsWith('26.')) {
      setMcJava('Java 25');
    } else if (newVer.startsWith('1.21') || newVer.startsWith('1.20.6') || newVer.startsWith('1.20.5')) {
      setMcJava('Java 21');
    } else if (newVer.startsWith('1.20') || newVer.startsWith('1.19') || newVer.startsWith('1.18')) {
      setMcJava('Java 17');
    } else if (newVer.startsWith('1.16') || newVer.startsWith('1.17')) {
      setMcJava('Java 11');
    } else {
      setMcJava('Java 8');
    }
  };

  useEffect(() => {
    if (preselectedGame) {
      setSelectedGameId(preselectedGame.id);
      setPort(preselectedGame.defaultPort);
      setRamGb(preselectedGame.recommendedRamGb || currentSettings.defaultRamAllocationGb || 6);
      setInstanceName(`${preselectedGame.name} Server`);
    }
  }, [preselectedGame]);

  if (!isOpen) return null;

  const activeGame = availableGames.find(g => g.id === selectedGameId) || availableGames[0];
  const isMinecraft = activeGame?.category === 'minecraft';

  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    const g = availableGames.find(item => item.id === gameId);
    if (g) {
      setPort(g.defaultPort);
      setRamGb(g.recommendedRamGb || 4);
      setInstanceName(`${g.name} Server`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim() || !activeGame) return;

    const newServer: Partial<ServerInstance> & { autoInstall?: boolean } = {
      name: instanceName.trim(),
      gameId: activeGame.id,
      gameName: activeGame.name,
      category: activeGame.category,
      steamAppId: activeGame.steamAppId,
      linuxExecutable: activeGame.executable?.linux,
      linuxStartArgs: activeGame.defaultStartArgs?.linux,
      status: 'offline',
      allocatedRamGb: ramGb,
      port,
      queryPort: activeGame.queryPort || (port + 1),
      rconPort: activeGame.rconPort || 25575,
      targetOS,
      autoRestart,
      version: isMinecraft ? mcVersion : 'Latest',
      javaVersion: isMinecraft ? mcJava : undefined,
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      maxRamMb: ramGb * 1024,
      diskUsageMb: 1200,
      networkInKb: 0,
      networkOutKb: 0,
      currentPlayers: 0,
      maxPlayers: isMinecraft ? 20 : 32,
      tps: isMinecraft ? 20.0 : 60.0,
      installedMods: [],
      configFiles: activeGame.configFiles.reduce((acc, f) => {
        acc[f.name] = f.defaultContent;
        return acc;
      }, {} as Record<string, string>)
    };

    (newServer as any).autoInstall = autoInstallFiles;
    onCreateServer(newServer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-400" />
              <span>Neuen Gameserver erstellen</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Wähle aus über 100 Steam Games oder Minecraft aller Arten mit nativer OS-Kompatibilität.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Game Selector */}
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Spiel / Server-Software auswählen</label>
            <select
              value={selectedGameId}
              onChange={(e) => handleGameChange(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
            >
              <optgroup label="Minecraft Varianten">
                {availableGames.filter(g => g.category === 'minecraft').map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </optgroup>
              <optgroup label="Steam Games & Dedicated Server">
                {availableGames.filter(g => g.category !== 'minecraft').map(g => (
                  <option key={g.id} value={g.id}>{g.name} (Port: {g.defaultPort})</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Status info based on Steam Mode & Game type */}
          <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isMinecraft ? 'bg-emerald-400' : 'bg-sky-400'}`} />
              <span className="text-neutral-300">
                {isMinecraft ? (
                  <span>Minecraft Runtime: <strong>100% autark</strong> (Kein Steam erforderlich)</span>
                ) : (
                  <span>
                    Steam-Betriebsmodus: <strong className="text-neutral-100 uppercase">{currentSettings.steamMode.replace('_', ' ')}</strong> (Offline-Bypass aktiv)
                  </span>
                )}
              </span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">
              {currentSettings.steamOfflineBypass ? 'Bypass: AN' : 'Bypass: AUS'}
            </span>
          </div>

          {/* Minecraft Specific Options */}
          {isMinecraft && (
            <div className="p-3.5 bg-neutral-950 border border-neutral-800/80 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">Minecraft Version</label>
                <select
                  value={mcVersion}
                  onChange={(e) => handleMcVersionChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {MINECRAFT_VERSIONS.map(v => (
                    <option key={v} value={v}>
                      {v} {v === '26.3' ? '(Neuester Snapshot)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1 flex items-center justify-between">
                  <span>Java Runtime Umgebung</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Modern (21+)</span>
                </label>
                <select
                  value={mcJava}
                  onChange={(e) => setMcJava(e.target.value as JavaVersion)}
                  className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                >
                  <optgroup label="Modernes Java (21+ für 1.20.5+, 1.21.x & 26.x Snapshots)">
                    <option value="Java 25">Java 25 (LTS Next-Gen · Erforderlich für 26.x)</option>
                    <option value="Java 24">Java 24 (JDK 24 · Compact Object Headers)</option>
                    <option value="Java 23">Java 23 (JDK 23 · Generational ZGC)</option>
                    <option value="Java 22">Java 22 (JDK 22 · Vector API & FFM)</option>
                    <option value="Java 21">Java 21 (LTS · Produktions-Standard)</option>
                    <option value="GraalVM 21+">GraalVM 21+ (Ultra High-Performance JIT)</option>
                    <option value="Temurin 21+">Eclipse Temurin 21+ (Adoptium Enterprise LTS)</option>
                    <option value="Corretto 21+">Amazon Corretto 21+ (Cloud & Container LTS)</option>
                    <option value="Zulu 21+">Azul Zulu 21+ (CRaC Instant-Checkpoint)</option>
                    <option value="Java 26">Java 26 (JDK 26 Early Access)</option>
                  </optgroup>
                  <optgroup label="Ältere Versionen (LTS & Legacy)">
                    <option value="Java 17">Java 17 (LTS · Für 1.18 bis 1.20.4)</option>
                    <option value="Java 11">Java 11 (Legacy LTS für 1.16/1.17)</option>
                    <option value="Java 8">Java 8 (Legacy für 1.12.2 und älter)</option>
                  </optgroup>
                </select>
              </div>
            </div>
          )}

          {/* Server Name */}
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Server Name / Instanz-Bezeichnung</label>
            <input
              type="text"
              required
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="z. B. Community Survival SMP"
              className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Server Port */}
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Spiel-Port</label>
              <input
                type="number"
                required
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Target Operating System */}
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Ziel-Betriebssystem</label>
              <select
                value={targetOS}
                onChange={(e) => setTargetOS(e.target.value as PlatformOS)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="linux">Linux (x86_64 / systemd)</option>
                <option value="windows">Windows (.exe / batch)</option>
                <option value="macos">macOS (Darwin ARM64 / zsh)</option>
              </select>
            </div>
          </div>

          {/* RAM Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-neutral-300 font-medium">Zugewiesener Arbeitsspeicher (RAM)</label>
              <span className="font-mono text-emerald-400 font-bold tabular-nums">{ramGb} GB</span>
            </div>
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={ramGb}
              onChange={(e) => setRamGb(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono mt-0.5">
              <span>1 GB (Basic)</span>
              <span>8 GB (Optimal)</span>
              <span>16 GB (Heavy Mods)</span>
              <span>32 GB (Mega)</span>
            </div>
          </div>

          {/* Auto Restart Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoRestartCheckbox"
              checked={autoRestart}
              onChange={(e) => setAutoRestart(e.target.checked)}
              className="accent-emerald-500 cursor-pointer"
            />
            <label htmlFor="autoRestartCheckbox" className="text-neutral-300 cursor-pointer">
              Automatischer Neustart bei unerwartetem Absturz (Crash-Guard)
            </label>
          </div>

          {/* Auto Download & Install Server Files Toggle */}
          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoInstallCheckbox"
                checked={autoInstallFiles}
                onChange={(e) => setAutoInstallFiles(e.target.checked)}
                className="accent-emerald-500 cursor-pointer w-4 h-4"
              />
              <label htmlFor="autoInstallCheckbox" className="text-emerald-300 font-semibold cursor-pointer flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Server-Dateien nach Erstellung sofort automatisch installieren</span>
              </label>
            </div>
            <p className="text-[11px] text-neutral-400 pl-6">
              {isMinecraft 
                ? 'Lädt automatisch die offizielle PaperMC Server-JAR herunter und akzeptiert die EULA, damit der Server sofort gestartet werden kann.' 
                : activeGame.steamAppId 
                ? `Installiert das Spiel automatisch via SteamCMD (AppID: ${activeGame.steamAppId}) direkt auf deinen Server.` 
                : 'Initialisiert das Server-Verzeichnis und alle Standard-Konfigurationsdateien.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded cursor-pointer transition-colors shadow-sm shadow-emerald-600/30"
            >
              Server jetzt bereitstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
