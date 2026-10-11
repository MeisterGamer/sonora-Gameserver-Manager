import React, { useState, useEffect } from 'react';
import { X, Server, Layers, Cpu, HardDrive, Check, Sparkles, ShieldCheck } from 'lucide-react';
import { GameDefinition, ServerInstance, PlatformOS, JavaVersion } from '../types/game';
import { MINECRAFT_TYPES, MINECRAFT_VERSIONS, MINECRAFT_SERVER_PROPERTIES_DEFAULT } from '../data/minecraftTypes';
import { AdminSettings } from '../types/adminSettings';
import { getStoredAdminSettings } from '../data/adminSettingsStore';
import { installerSupport, STEAM_INSTALLERS, requiredPaperJava } from '../data/installerSupport';
import { apiRequest } from '../services/api';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableGames: GameDefinition[];
  preselectedGame?: GameDefinition | null;
  currentOS: PlatformOS;
  adminSettings?: AdminSettings;
  onCreateServer: (serverData: Partial<ServerInstance>) => void | Promise<void>;
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [paperVersions, setPaperVersions] = useState<string[]>([]);
  const [versionsError, setVersionsError] = useState('');
  const [allowExperimental, setAllowExperimental] = useState(false);

  // Minecraft specific
  const [mcVersion, setMcVersion] = useState<string>(currentSettings.defaultMinecraftVersion || '26.3');
  const [mcJava, setMcJava] = useState<JavaVersion>(currentSettings.defaultJavaVersion || 'Java 25');

  const handleMcVersionChange = (newVer: string) => setMcVersion(newVer);
  useEffect(() => {
    if (/^\d+\.\d+(?:\.\d+)?$/.test(mcVersion)) setMcJava(('Java ' + requiredPaperJava(mcVersion)) as JavaVersion);
  }, [mcVersion]);

  useEffect(() => {
    if (preselectedGame) {
      setSelectedGameId(preselectedGame.id);
      setPort(preselectedGame.defaultPort);
      setRamGb(preselectedGame.recommendedRamGb || currentSettings.defaultRamAllocationGb || 6);
      setInstanceName(`${preselectedGame.name} Server`);
    }
  }, [preselectedGame]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPaperVersions([]); setVersionsError('');
    const engine = selectedGameId.replace(/^mc_/, '');
    if (!['paper', 'purpur', 'vanilla'].includes(engine)) return;
    apiRequest('/api/installers/' + engine + '/versions').then(data => {
      if (cancelled) return;
      setPaperVersions(data.versions);
      setMcVersion(current => data.versions.includes(current) ? current : data.versions[0]);
    }).catch(error => { if (!cancelled) setVersionsError(error.message); });
    return () => { cancelled = true; };
  }, [isOpen, selectedGameId]);

  if (!isOpen) return null;

  const activeGame = availableGames.find(g => g.id === selectedGameId) || availableGames[0];
  const isMinecraft = activeGame?.category === 'minecraft';
  const unavailable = activeGame ? installerSupport(activeGame, currentOS) : 'Kein Spiel ausgewählt';

  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    const g = availableGames.find(item => item.id === gameId);
    if (g) {
      setPort(g.defaultPort);
      setRamGb(g.recommendedRamGb || 4);
      setInstanceName(`${g.name} Server`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim() || !activeGame) return;
    if (unavailable || isMinecraft && !paperVersions.includes(mcVersion)) return;

    const newServer: Partial<ServerInstance> & { autoInstall?: boolean } = {
      name: instanceName.trim(),
      gameId: activeGame.id,
      gameName: activeGame.name,
      category: activeGame.category,
      steamAppId: STEAM_INSTALLERS[activeGame.id]?.appId,
      linuxExecutable: activeGame.executable?.linux,
      linuxStartArgs: activeGame.defaultStartArgs?.linux,
      status: 'offline',
      allocatedRamGb: ramGb,
      port,
      queryPort: activeGame.queryPort ? port + activeGame.queryPort - activeGame.defaultPort : port + 1,
      rconPort: activeGame.rconPort || 25575,
      targetOS,
      autoRestart,
      version: isMinecraft ? mcVersion : 'Latest',
      allowExperimental: isMinecraft && allowExperimental,
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
    newServer.minecraftType = isMinecraft ? activeGame.id.replace(/^mc_/, '') : undefined;
    setCreating(true); setCreateError('');
    try { await onCreateServer(newServer); onClose(); }
    catch (error: any) { setCreateError(error.message); }
    finally { setCreating(false); }
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
              Paper, Purpur und Vanilla sowie die freigegebenen Linux-Steam-Adapter werden unterstützt. Weitere Installer sind im Katalog gekennzeichnet.
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
          {createError && <p role="alert" className="text-red-400">{createError}</p>}
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
                  <option key={g.id} value={g.id} disabled={!!installerSupport(g, currentOS)}>{g.name}{installerSupport(g, currentOS) ? ' – Installer fehlt' : ''}</option>
                ))}
              </optgroup>
              <optgroup label="Steam Games & Dedicated Server">
                {availableGames.filter(g => g.category !== 'minecraft').map(g => (
                  <option key={g.id} value={g.id} disabled={!!installerSupport(g, currentOS)}>{g.name}{installerSupport(g, currentOS) ? ' – Installer fehlt' : ''}</option>
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
                    SteamCMD: anonymer Dedicated-Server-Download, Internet erforderlich
                  </span>
                )}
              </span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">
              {unavailable || 'Downloadadapter vorhanden'}
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
                  {!paperVersions.length && <option value="">{versionsError ? 'Versionsliste nicht erreichbar' : 'Versionen werden geladen…'}</option>}
                  {paperVersions.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1 flex items-center justify-between">
                  <span>Erforderliche Java-Version auf dem Host</span>
                </label>
                <select
                  value={mcJava}
                  disabled
                  onChange={(e) => setMcJava(e.target.value as JavaVersion)}
                  className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                >
                  <option value={mcJava}>{mcJava} – Host-Laufzeit wird beim Start geprüft</option>
                </select>
              </div>
            </div>
          )}

          {versionsError && isMinecraft && <p role="alert" className="text-red-400">{versionsError}</p>}
          {isMinecraft && activeGame.id !== 'mc_vanilla' && <label className="block text-amber-300"><input type="checkbox" checked={allowExperimental} onChange={event => setAllowExperimental(event.target.checked)} /> Experimentelle Builds ausdrücklich erlauben, wenn kein stabiler Build existiert</label>}
          {unavailable && <p role="alert" className="text-amber-300">{unavailable}</p>}
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
              checked={false}
              disabled
              onChange={(e) => setAutoRestart(e.target.checked)}
              className="accent-emerald-500 cursor-pointer"
            />
            <label htmlFor="autoRestartCheckbox" className="text-neutral-300 cursor-pointer">
              Automatische Wiederanläufe nach Abstürzen sind noch nicht implementiert
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
                ? 'Installiert die gewählte Engine und Version. Minecraft-EULA danach selbst im Dateimanager akzeptieren.'
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
              disabled={creating || !!unavailable || isMinecraft && !paperVersions.includes(mcVersion)}
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
