import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ShieldAlert,
  Box
} from 'lucide-react';

export interface PreFlightCheckData {
  serverId?: string;
  canLaunch: boolean;
  isWindowsExecutable: boolean;
  missingCompatibilityLayer: boolean;
  executableName: string;
  platform: string;
  hasWine: boolean;
  hasXvfb: boolean;
  hasPodman: boolean;
  hasDocker: boolean;
  detectedRuntime: 'wine' | 'podman' | 'docker' | 'none';
  runtimeSummary: string;
  envFlagEnabled: boolean;
  warningTitle: string;
  warningMessage: string;
  installInstructions: {
    debianWine: string;
    podman: string;
    docker: string;
    envFlag: string;
  };
  checkedAt: string;
}

interface WindowsPreFlightBannerProps {
  preflight: PreFlightCheckData | null;
  isScanning: boolean;
  launchBlocked?: boolean;
  onRescan: () => void;
  onNotify?: (msg: string) => void;
}

export const WindowsPreFlightBanner: React.FC<WindowsPreFlightBannerProps> = ({
  preflight,
  isScanning,
  launchBlocked = false,
  onRescan,
  onNotify
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!preflight || !preflight.isWindowsExecutable) {
    return null;
  }

  const handleCopy = async (key: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedKey(key);
      onNotify?.('Installationsbefehl in die Zwischenablage kopiert.');
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      onNotify?.('Kopieren nicht möglich – bitte Befehl manuell markieren.');
    }
  };

  // Compatibility layer is available -> compact readiness confirmation strip
  if (!preflight.missingCompatibilityLayer && preflight.canLaunch) {
    const runtimeLabel =
      preflight.detectedRuntime === 'wine'
        ? preflight.hasXvfb
          ? 'Wine + Xvfb'
          : 'Wine (headless)'
        : preflight.detectedRuntime === 'podman'
        ? 'Podman Container'
        : preflight.detectedRuntime === 'docker'
        ? 'Docker Container'
        : 'Nativ';

    return (
      <div
        data-testid="windows-preflight-ready"
        className="border border-sky-500/35 bg-sky-950/20 rounded-xl px-4 py-3 text-xs text-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sky-200">
                Pre-Flight Check bestanden ({runtimeLabel})
              </span>
              <span className="font-mono text-[11px] text-neutral-400">
                {preflight.executableName}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 truncate">
              Windows-Executable erkannt – kompatible Laufzeitumgebung ist installiert und startbereit.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRescan}
          disabled={isScanning}
          className="self-end sm:self-auto px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/70 text-neutral-300 rounded-lg text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Prüfe...' : 'Neu prüfen'}</span>
        </button>
      </div>
    );
  }

  // Missing Wine & Docker/Podman -> prominent Pre-Flight Warning Banner
  const installOptions = [
    {
      key: 'wine',
      title: 'Option 1 (Empfohlen): Wine + Xvfb installieren (Debian / Ubuntu)',
      badge: 'Nativ & schnell',
      command: preflight.installInstructions.debianWine
    },
    {
      key: 'podman',
      title: 'Option 2: Podman Container-Engine installieren (Rootless)',
      badge: 'Isoliert',
      command: preflight.installInstructions.podman
    },
    {
      key: 'docker',
      title: 'Option 3: Docker Engine installieren',
      badge: 'Container',
      command: preflight.installInstructions.docker
    }
  ];

  return (
    <div
      role="alert"
      data-testid="windows-preflight-warning"
      className={`border rounded-xl p-4 text-xs text-neutral-200 space-y-3.5 shadow-md animate-in fade-in ${
        launchBlocked
          ? 'border-rose-500/60 bg-rose-950/35 shadow-rose-950/30'
          : 'border-amber-500/55 bg-amber-950/30 shadow-amber-950/25'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
              launchBlocked
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
            }`}
          >
            {launchBlocked ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-bold text-sm ${launchBlocked ? 'text-rose-200' : 'text-amber-200'}`}>
                {preflight.warningTitle ||
                  `Pre-Flight Checker: Windows-Kompatibilitätsschicht für "${preflight.executableName}" fehlt`}
              </h3>
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-950/80 border border-amber-500/40 text-amber-300">
                {launchBlocked ? 'Start blockiert' : 'Pre-Flight Warnung'}
              </span>
            </div>
            <p className="text-neutral-300 text-xs leading-relaxed">
              {preflight.warningMessage}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRescan}
          disabled={isScanning}
          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shrink-0 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanne Umgebung...' : 'Erneut prüfen (Pre-Flight Scan)'}</span>
        </button>
      </div>

      {/* Environment Scan Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-950/75 border border-neutral-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-200">Wine / Wine64</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-rose-400">
            {preflight.hasWine ? 'Vorhanden' : 'Fehlt'}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-950/75 border border-neutral-800">
          <div className="flex items-center gap-2">
            <Box className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-200">Podman</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-rose-400">
            {preflight.hasPodman ? 'Vorhanden' : 'Fehlt'}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-950/75 border border-neutral-800">
          <div className="flex items-center gap-2">
            <Box className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-200">Docker</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-rose-400">
            {preflight.hasDocker ? 'Vorhanden' : 'Fehlt'}
          </span>
        </div>
      </div>

      {/* Copyable Installation Instructions */}
      <div className="space-y-2 pt-1 border-t border-amber-500/20">
        <p className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
          Installationsanleitung (eine der folgenden Laufzeiten auf dem Linux-Host ausführen):
        </p>
        <div className="space-y-2">
          {installOptions.map((opt) => (
            <div
              key={opt.key}
              className="rounded-lg bg-neutral-950/85 border border-neutral-800 p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-neutral-200">
                  {opt.title}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                  {opt.badge}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-black/50 border border-neutral-800/80 rounded px-2.5 py-1.5">
                <code className="font-mono text-[11px] text-emerald-300 break-all select-all">
                  {opt.command}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(opt.key, opt.command)}
                  className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/70 transition-colors cursor-pointer shrink-0"
                  title="Befehl kopieren"
                >
                  {copiedKey === opt.key ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400">
          Nach der Installation auf dem Server klicke oben auf <strong className="text-neutral-200">„Erneut prüfen (Pre-Flight Scan)“</strong>, um den Serverstart freizuschalten.
        </p>
      </div>
    </div>
  );
};
