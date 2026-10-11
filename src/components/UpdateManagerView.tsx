import React, { useState } from 'react';
import { 
  DownloadCloud, 
  RotateCw, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  Terminal, 
  Sparkles,
  Server,
  Coffee,
  HardDrive
} from 'lucide-react';
import { ServerInstance, JavaVersion } from '../types/game';
import { MINECRAFT_VERSIONS } from '../data/minecraftTypes';

interface UpdateManagerViewProps {
  server: ServerInstance;
  onUpdateVersion?: (newVersion: string, notes?: string, javaVersion?: JavaVersion) => void;
  onNotify?: (msg: string) => void;
}

export const UpdateManagerView: React.FC<UpdateManagerViewProps> = ({
  server,
  onUpdateVersion,
  onNotify
}) => {
  const isMinecraft = server.category === 'minecraft';

  // Minecraft specific state
  const [selectedEngine, setSelectedEngine] = useState<string>(server.minecraftType || 'paper');
  const [selectedVersion, setSelectedVersion] = useState<string>(server.version || '26.3');
  const [selectedJava, setSelectedJava] = useState<JavaVersion>(
    server.javaVersion || 'Java 25'
  );

  // Steam specific state
  const [selectedBranch, setSelectedBranch] = useState<'public' | 'beta' | 'experimental' | 'staging'>('public');
  const [branchPassword, setBranchPassword] = useState('');
  const [validateFiles, setValidateFiles] = useState(true);
  const [autoUpdateOnBoot, setAutoUpdateOnBoot] = useState(server.autoRestart);

  // Update process simulation
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStep, setUpdateStep] = useState<string>('');
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [createBackupFirst, setCreateBackupFirst] = useState(true);

  const engines = [
    { id: 'paper', name: 'PaperMC', desc: 'Hochoptimierte Plugin-Engine für Spigot/Bukkit (Empfohlen)', tag: 'High-Perf' },
    { id: 'purpur', name: 'Purpur', desc: 'Erweiterter Paper-Fork mit noch mehr Anpassungsoptionen', tag: 'Custom' },
    { id: 'fabric', name: 'Fabric', desc: 'Ultra-leichter, modularer Modloader für moderne Versionen', tag: 'Mods' },
    { id: 'neoforge', name: 'NeoForge', desc: 'Moderner Nachfolger von Forge mit stabiler API', tag: 'Mods' },
    { id: 'forge', name: 'Forge', desc: 'Klassischer Modloader für umfangreiche Modpacks', tag: 'Modpacks' },
    { id: 'vanilla', name: 'Vanilla', desc: 'Offizieller Mojang Server ohne Mods oder Plugins', tag: 'Standard' },
    { id: 'bedrock', name: 'Bedrock Dedicated', desc: 'Für Cross-Play & mobile Spieler (Win 10/iOS/Android/Konsolen)', tag: 'Bedrock' },
  ];

  const steamBranches = [
    { id: 'public', name: 'public (Standard Release)', desc: 'Offizielle und stabile Produktiv-Version' },
    { id: 'beta', name: 'beta (Öffentlicher Testzweig)', desc: 'Vorabversion für kommende Patches und Balance-Changes' },
    { id: 'experimental', name: 'experimental (Entwickler-Builds)', desc: 'Neueste Features und tägliche Experimente' },
    { id: 'staging', name: 'staging (QA Testumgebung)', desc: 'Nur mit internem Passwort freischaltbar' },
  ];

  const handleStartUpdate = () => {
    setIsUpdating(true);
    setUpdateProgress(5);
    setUpdateLogs([]);

    const logs: string[] = [];
    const pushLog = (msg: string) => {
      const time = new Date().toLocaleTimeString();
      logs.push(`[${time}] ${msg}`);
      setUpdateLogs([...logs]);
    };

    if (isMinecraft) {
      pushLog(`Initialisiere Versions-Upgrade für "${server.name}"...`);
      setUpdateStep('Sicherheitsüberprüfung...');

      setTimeout(() => {
        setUpdateProgress(20);
        if (createBackupFirst) {
          pushLog(`[Backup] Erstelle Sicherheits-Snapshot vor dem Update: backup_pre_update_${Date.now()}.tar.gz`);
          pushLog(`[Backup] Speichere server.properties, world/ und plugins/ ... Abgeschlossen!`);
        }
        setUpdateStep('Herunterladen der Server-Software...');
      }, 700);

      setTimeout(() => {
        setUpdateProgress(50);
        pushLog(`[Download] Frage Version-Manifest für ${selectedEngine.toUpperCase()} v${selectedVersion} ab...`);
        pushLog(`[Download] https://api.papermc.io/v2/projects/${selectedEngine}/versions/${selectedVersion}/builds/latest/download`);
        pushLog(`[Download] 42.8 MB / 42.8 MB (100%) - Download beendet.`);
        setUpdateStep('Prüfsumme & Integrität verifizieren...');
      }, 1500);

      setTimeout(() => {
        setUpdateProgress(80);
        pushLog(`[Integrität] Berechne SHA-256 Prüfsumme: a98f12c8e3... OK`);
        pushLog(`[Java] Konfiguriere Java-Laufzeitumgebung: ${selectedJava} (Flags: -XX:+UseG1GC -XX:+ParallelRefProcEnabled)`);
        pushLog(`[Dateisystem] Ersetze server.jar mit neuer Version ${selectedVersion}...`);
        setUpdateStep('Installation abschließen...');
      }, 2300);

      setTimeout(() => {
        setUpdateProgress(100);
        pushLog(`[Erfolg] Update auf ${selectedEngine.toUpperCase()} ${selectedVersion} (${selectedJava}) erfolgreich!`);
        setIsUpdating(false);
        onUpdateVersion?.(selectedVersion, `${selectedEngine} ${selectedVersion}`, selectedJava);
        onNotify?.(`Server erfolgreich auf ${selectedEngine.toUpperCase()} ${selectedVersion} mit ${selectedJava} aktualisiert!`);
      }, 3100);

    } else {
      // Steam game update
      pushLog(`Initialisiere SteamCMD Update für AppID ${server.gameId}...`);
      setUpdateStep('SteamCMD initialisieren...');

      setTimeout(() => {
        setUpdateProgress(25);
        pushLog(`[SteamCMD] Logging into Steam via anonymous / token auth...`);
        pushLog(`[SteamCMD] Set target branch: "${selectedBranch}"`);
        if (branchPassword) {
          pushLog(`[SteamCMD] Unlocking branch with provided beta password: ***`);
        }
        setUpdateStep('Prüfe App-Dateien & Delta-Updates...');
      }, 800);

      setTimeout(() => {
        setUpdateProgress(60);
        pushLog(`[SteamCMD] Update state (0x3) : Validating installation...`);
        if (validateFiles) {
          pushLog(`[SteamCMD] Validating file hashes against Steam CDN...`);
        }
        pushLog(`[SteamCMD] Downloading delta payload: 124.5 MB / 124.5 MB`);
        setUpdateStep('Anwenden des Patches...');
      }, 1600);

      setTimeout(() => {
        setUpdateProgress(90);
        pushLog(`[SteamCMD] Committing patch to game directory...`);
        pushLog(`[SteamCMD] Success! App "${server.gameName}" fully installed and verified.`);
        setUpdateStep('Fertigstellen...');
      }, 2400);

      setTimeout(() => {
        setUpdateProgress(100);
        const newVer = selectedBranch === 'public' ? 'v1.4.2' : `${selectedBranch}-build-${Date.now().toString().slice(-4)}`;
        pushLog(`[Erfolg] Steam Server erfolgreich auf Branch "${selectedBranch}" aktualisiert.`);
        setIsUpdating(false);
        onUpdateVersion?.(newVer, `Branch: ${selectedBranch}`);
        onNotify?.(`Serverdateien über SteamCMD erfolgreich aktualisiert!`);
      }, 3200);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-emerald-400 shrink-0">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-neutral-100">Update- & Versions-Zentrum</h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {isMinecraft ? 'Minecraft Multi-Engine' : 'SteamCMD Updater'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Verwalte Server-Engines, Spiel-Versionen, Steam-Zweige (Beta/Experimental) und automatische Datei-Prüfungen.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-neutral-950 border border-neutral-800 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-neutral-500">Aktuelle Version: </span>
              <span className="font-mono font-bold text-emerald-400">{server.version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Grid */}
      {isMinecraft ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Engine and Version Picker */}
          <div className="lg:col-span-2 space-y-6">
            {/* Engine Selection */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                1. Server-Software / Modloader wählen
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {engines.map((eng) => (
                  <label
                    key={eng.id}
                    onClick={() => setSelectedEngine(eng.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedEngine === eng.id
                        ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/30'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="minecraftEngine"
                      checked={selectedEngine === eng.id}
                      onChange={() => setSelectedEngine(eng.id)}
                      className="mt-1 text-emerald-500 focus:ring-emerald-500 bg-neutral-900 border-neutral-700"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-neutral-100">{eng.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                          {eng.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">{eng.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Version & Java Picker */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                2. Ziel-Version & Java-Laufzeitumgebung
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Minecraft Version
                  </label>
                  <select
                    value={selectedVersion}
                    onChange={(e) => {
                      const ver = e.target.value;
                      setSelectedVersion(ver);
                      // Auto pick suitable Java version
                      if (ver.startsWith('26.')) {
                        setSelectedJava('Java 25');
                      } else if (ver.startsWith('1.21') || ver.startsWith('1.20.6') || ver.startsWith('1.20.5')) {
                        setSelectedJava('Java 21');
                      } else if (ver.startsWith('1.20') || ver.startsWith('1.19') || ver.startsWith('1.18')) {
                        setSelectedJava('Java 17');
                      } else if (ver.startsWith('1.16') || ver.startsWith('1.17')) {
                        setSelectedJava('Java 11');
                      } else {
                        setSelectedJava('Java 8');
                      }
                    }}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                  >
                    <optgroup label="Aktuelle Snapshots & Versionen (2026 / 1.21+)">
                      <option value="26.3">Version 26.3 (Neuester Experimental Snapshot)</option>
                      <option value="1.21.4">1.21.4 (Tricky Trials Update - Neueste Stable)</option>
                      <option value="1.21.1">1.21.1 (Empfohlene Plugin-Stabilität)</option>
                      <option value="1.21">1.21.0</option>
                      <option value="1.20.6">1.20.6</option>
                      <option value="1.20.4">1.20.4 (Weit verbreiteter Standard)</option>
                      <option value="1.20.1">1.20.1 (Sehr stabiles Modpack-Ökosystem)</option>
                    </optgroup>
                    <optgroup label="Ältere Versionen & Modpack-Klassiker">
                      <option value="1.19.4">1.19.4</option>
                      <option value="1.18.2">1.18.2 (Caves & Cliffs)</option>
                      <option value="1.16.5">1.16.5 (Nether Update - Modpack-Favorit)</option>
                      <option value="1.12.2">1.12.2 (Legendärer Modpack-Standard)</option>
                      <option value="1.7.10">1.7.10 (Klassiker)</option>
                    </optgroup>
                  </select>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Unterstützt sowohl brandaktuelle Snapshots als auch zeitlose Klassiker.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center justify-between">
                    <span>Java Laufzeitumgebung</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Modern (21+)</span>
                  </label>
                  <select
                    value={selectedJava}
                    onChange={(e) => setSelectedJava(e.target.value as JavaVersion)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    <optgroup label="Modernes Java (21+ für 1.20.5+, 1.21.x & 26.x Snapshots)">
                      <option value="Java 25">Java 25 (LTS Next-Gen · Voraussetzung für 26.x)</option>
                      <option value="Java 24">Java 24 (JDK 24 · Compact Object Headers JEP 450)</option>
                      <option value="Java 23">Java 23 (JDK 23 · Generational ZGC)</option>
                      <option value="Java 22">Java 22 (JDK 22 · FFM & Vector API)</option>
                      <option value="Java 21">Java 21 (LTS · Offizieller Produktions-Standard)</option>
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
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Wird automatisch konfiguriert für optimale Garbage-Collection (Aikar's Flags oder ZGC).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Action & Safety Panel */}
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Sicherheitsoptionen
              </h3>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createBackupFirst}
                  onChange={(e) => setCreateBackupFirst(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Automatischer Vorab-Snapshot</div>
                  <div className="text-[11px] text-neutral-400">Erstellt ein sofortiges Backup vor Überschreiben der Serverdateien.</div>
                </div>
              </label>

              <div className="pt-3 border-t border-neutral-800">
                <button
                  onClick={handleStartUpdate}
                  disabled={isUpdating}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                  <span>{isUpdating ? 'Wird aktualisiert...' : `Auf ${selectedEngine.toUpperCase()} ${selectedVersion} wechseln`}</span>
                </button>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-xs space-y-2 text-neutral-400">
              <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                Zero-Downtime Vorbereitung
              </div>
              <p className="text-[11px]">
                Vorhandene Welten, Plugin-Configs und Whitelist-Dateien bleiben unberührt. Nur die Server-Ausführungsdatei wird aktualisiert.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Steam Game Specific Update Center */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Steam Branch Picker */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-400" />
                Steam Dedicated Server Branch (Release-Zweig)
              </h3>
              <div className="space-y-2.5">
                {steamBranches.map((br) => (
                  <label
                    key={br.id}
                    onClick={() => setSelectedBranch(br.id as any)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedBranch === br.id
                        ? 'bg-sky-950/40 border-sky-500/80 ring-1 ring-sky-500/30'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="steamBranch"
                      checked={selectedBranch === br.id}
                      onChange={() => setSelectedBranch(br.id as any)}
                      className="mt-1 text-sky-500 focus:ring-sky-500 bg-neutral-900 border-neutral-700"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-neutral-100">{br.name}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{br.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedBranch !== 'public' && (
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Beta-Zweig Passwort (Optional / falls vom Entwickler geschützt)
                  </label>
                  <input
                    type="password"
                    value={branchPassword}
                    onChange={(e) => setBranchPassword(e.target.value)}
                    placeholder="z.B. testing123 (oder leer lassen bei öffentlichen Betas)"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>

            {/* SteamCMD Flags */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                SteamCMD Installationsoptionen
              </h3>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={validateFiles}
                  onChange={(e) => setValidateFiles(e.target.checked)}
                  className="mt-0.5 rounded text-sky-500 focus:ring-sky-500 bg-neutral-950 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Dateien validieren (+app_update validate)</div>
                  <div className="text-[11px] text-neutral-400">Prüft alle Spieldateien auf Korruption und repariert beschädigte Binärdateien.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoUpdateOnBoot}
                  onChange={(e) => setAutoUpdateOnBoot(e.target.checked)}
                  className="mt-0.5 rounded text-sky-500 focus:ring-sky-500 bg-neutral-950 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Automatisches Update bei jedem Serverstart</div>
                  <div className="text-[11px] text-neutral-400">Verhindert Versionskonflikte nach offiziellen Steam-Patches.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-sky-400" />
                Update ausführen
              </h3>
              <p className="text-xs text-neutral-400">
                Lade den neuesten Patch für <strong className="text-neutral-200">{server.gameName}</strong> via SteamCMD herunter.
              </p>

              <button
                onClick={handleStartUpdate}
                disabled={isUpdating}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <DownloadCloud className={`w-4 h-4 ${isUpdating ? 'animate-bounce' : ''}`} />
                <span>{isUpdating ? 'SteamCMD läuft...' : 'Jetzt via SteamCMD patchen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress & Live Console Output during update */}
      {(isUpdating || updateLogs.length > 0) && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-3 font-mono">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-300 font-bold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Live Update-Protokoll {updateStep && `— ${updateStep}`}
            </span>
            <span className="text-emerald-400 font-bold">{updateProgress}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${updateProgress}%` }}
            />
          </div>

          {/* Terminal Box */}
          <div className="bg-black/90 p-3 rounded-lg border border-neutral-800 text-[11px] text-neutral-300 max-h-48 overflow-y-auto space-y-1">
            {updateLogs.map((log, i) => (
              <div key={i} className="leading-relaxed font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
