import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, Layers, ShieldCheck, CheckCircle2, Monitor, HardDrive, Cpu } from 'lucide-react';
import { ServerInstance, PlatformOS } from '../types/game';
import { generateOSScripts } from '../data/serverStore';

interface CrossPlatformViewProps {
  selectedServer?: ServerInstance;
}

export const CrossPlatformView: React.FC<CrossPlatformViewProps> = ({ selectedServer }) => {
  const [activeScriptTab, setActiveScriptTab] = useState<'linux' | 'windows' | 'macos' | 'systemd' | 'docker'>('linux');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fallback demo server if none selected
  const demoServer: ServerInstance = selectedServer || {
    id: 'demo_universal',
    name: 'Universal Multi-OS Game Server',
    gameId: 'palworld',
    gameName: 'Steam & Minecraft Universal',
    category: 'survival',
    status: 'running',
    allocatedRamGb: 8,
    port: 8211,
    queryPort: 27015,
    rconPort: 25575,
    targetOS: 'linux',
    autoRestart: true,
    version: 'Latest',
    uptimeSeconds: 3600,
    cpuUsagePercent: 12,
    ramUsageMb: 4096,
    maxRamMb: 8192,
    diskUsageMb: 5000,
    networkInKb: 50,
    networkOutKb: 120,
    currentPlayers: 4,
    maxPlayers: 32,
    tps: 60,
    installedMods: [],
    configFiles: {},
    createdAt: '2026-10-10'
  };

  const scripts = generateOSScripts(demoServer);

  const scriptContentMap: Record<string, { title: string; filename: string; content: string; desc: string }> = {
    linux: {
      title: 'Linux (Ubuntu / Debian / CentOS / Arch)',
      filename: 'start.sh',
      content: scripts.linuxSh,
      desc: 'POSIX-konformes Shell-Skript mit Speichergrenzen und nativer Signalweiterleitung (SIGTERM/SIGINT).'
    },
    windows: {
      title: 'Windows (Command Prompt & PowerShell)',
      filename: 'start.bat',
      content: scripts.windowsBat,
      desc: 'Natives Windows-Batch- und PowerShell-Skript mit automatischer Pause bei Fehlerabbruch.'
    },
    macos: {
      title: 'macOS (Darwin ARM64 / Apple Silicon & Intel)',
      filename: 'start.command',
      content: scripts.macCommand,
      desc: 'Ausführbares Terminal-Skript für macOS mit nativer Pfadauflösung und zsh-Kompatibilität.'
    },
    systemd: {
      title: 'Linux Systemd Service (Autostart 24/7)',
      filename: `${demoServer.id}.service`,
      content: scripts.linuxSystemd,
      desc: 'Produktionsreifer systemd-Daemon zur automatischen Hintergrundausführung und Wiederbelebung nach Server-Reboots.'
    },
    docker: {
      title: 'Universal Dockerfile (Containerisiert)',
      filename: 'Dockerfile',
      content: scripts.dockerfile,
      desc: 'Plattformunabhängiger Container-Build für Docker, Kubernetes und Podman.'
    }
  };

  const currentScript = scriptContentMap[activeScriptTab];

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentScript.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentScript.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* OS Matrix Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>Multi-Plattform & Node.js 24 Architektur</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              ApexHost abstrahiert Betriebssystemunterschiede (Dateipfade, Prozesssignale, Binaries) und läuft nahtlos unter Windows, Linux und macOS.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Node.js v24.x LTS</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cross-Spawn Engine</span>
            </span>
          </div>
        </div>

        {/* 3 OS Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-neutral-800 text-xs">
          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 flex items-center gap-1.5 mb-1">
              <Monitor className="w-4 h-4 text-sky-400" />
              <span>Windows 10 / 11 / Server</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Unterstützt native <code className="text-neutral-300">.exe</code> Binaries, PowerShell 7+, Windows Service Daemon und SteamCMD für Windows.
            </p>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 flex items-center gap-1.5 mb-1">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Linux (Debian, Ubuntu, RHEL, Arch)</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Native ELF-64 Binaries, systemd Dämonen, Wine/Proton Emulationsschicht für Windows-exklusive Steam-Games und Docker-Container.
            </p>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80">
            <div className="font-semibold text-neutral-200 flex items-center gap-1.5 mb-1">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>macOS (Apple Silicon M1-M4 & Intel)</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Native Java Minecraft Server, Rosetta 2 x86_64 Emulation und POSIX Terminal Launchers mit zsh.
            </p>
          </div>
        </div>
      </div>

      {/* Script Generator Box */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm">
              Generierte Starter-Skripte für "{demoServer.name}"
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">{currentScript.desc}</p>
          </div>

          {/* Script Type Tabs */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80 text-xs">
            <button
              onClick={() => setActiveScriptTab('linux')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeScriptTab === 'linux' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              Linux (.sh)
            </button>
            <button
              onClick={() => setActiveScriptTab('windows')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeScriptTab === 'windows' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              Windows (.bat)
            </button>
            <button
              onClick={() => setActiveScriptTab('macos')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeScriptTab === 'macos' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              macOS (.command)
            </button>
            <button
              onClick={() => setActiveScriptTab('systemd')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeScriptTab === 'systemd' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              systemd Service
            </button>
            <button
              onClick={() => setActiveScriptTab('docker')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeScriptTab === 'docker' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              Dockerfile
            </button>
          </div>
        </div>

        {/* Code View */}
        <div className="relative bg-neutral-950 p-4 font-mono text-xs text-neutral-200 overflow-x-auto">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              onClick={() => handleCopy(currentScript.content, activeScriptTab)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs transition-colors cursor-pointer"
            >
              {copiedKey === activeScriptTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Kopiert!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Kopieren</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-xs transition-colors cursor-pointer font-sans"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Herunterladen</span>
            </button>
          </div>

          <pre className="pt-8 pb-2 leading-relaxed whitespace-pre font-mono">
            {currentScript.content}
          </pre>
        </div>
      </div>
    </div>
  );
};
