import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldOff,
  AlertCircle,
  Terminal,
  Server,
  Clock
} from 'lucide-react';
import { ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

interface TempPasswordMeta {
  active: boolean;
  username: string;
  createdAt: string | null;
  expiresAt: string | null;
  ttlMinutes: number | null;
  remainingSeconds: number;
}

interface SftpInfoPayload {
  success: boolean;
  running: boolean;
  host: string;
  hostName?: string;
  port: number;
  username: string;
  adminUsername?: string;
  rootDirectory: string;
  sftpUri?: string;
  tempPassword?: TempPasswordMeta;
}

interface SftpAccessSectionProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

const TTL_OPTIONS = [
  { minutes: 15, label: '15 Min' },
  { minutes: 60, label: '1 Std' },
  { minutes: 240, label: '4 Std' },
  { minutes: 1440, label: '24 Std' }
];

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Abgelaufen';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} Std ${String(m).padStart(2, '0')} Min`;
  return `${m} Min ${String(s).padStart(2, '0')} Sek`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export const SftpAccessSection: React.FC<SftpAccessSectionProps> = ({
  server,
  onNotify
}) => {
  const [info, setInfo] = useState<SftpInfoPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [ttlMinutes, setTtlMinutes] = useState<number>(60);
  const [generating, setGenerating] = useState<boolean>(false);
  const [revoking, setRevoking] = useState<boolean>(false);

  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadSftpInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: SftpInfoPayload = await apiRequest(`/api/servers/${encodeURIComponent(server.id)}/sftp`);
      setInfo(data);
      setRemainingSeconds(data.tempPassword?.remainingSeconds || 0);
    } catch (err: any) {
      setError(err.message || 'SFTP-Verbindungsdaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    setGeneratedPassword(null);
    loadSftpInfo();
  }, [loadSftpInfo]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds > 0]);

  const copyValue = (key: string, value: string, label: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    onNotify?.(`${label} in die Zwischenablage kopiert.`);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const handleGenerateTempPassword = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/sftp/temp-password`,
        'POST',
        { ttlMinutes }
      );
      setGeneratedPassword(data.password || null);
      setShowPassword(true);
      setRemainingSeconds(Math.round((data.ttlMinutes || ttlMinutes) * 60));
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              host: data.host || prev.host,
              port: data.port || prev.port,
              username: data.username || prev.username,
              sftpUri: data.sftpUri || prev.sftpUri,
              tempPassword: {
                active: true,
                username: data.username || prev.username,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                ttlMinutes: data.ttlMinutes || ttlMinutes,
                remainingSeconds: Math.round((data.ttlMinutes || ttlMinutes) * 60)
              }
            }
          : prev
      );
      onNotify?.(`Temporäres SFTP-Passwort generiert (gültig für ${data.ttlMinutes || ttlMinutes} Minuten).`);
    } catch (err: any) {
      setError(err.message || 'Temporäres Passwort konnte nicht erstellt werden.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeTempPassword = async () => {
    setRevoking(true);
    setError(null);
    try {
      await apiRequest(`/api/servers/${encodeURIComponent(server.id)}/sftp/temp-password`, 'DELETE');
      setGeneratedPassword(null);
      setRemainingSeconds(0);
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              tempPassword: {
                active: false,
                username: prev.username,
                createdAt: null,
                expiresAt: null,
                ttlMinutes: null,
                remainingSeconds: 0
              }
            }
          : prev
      );
      onNotify?.('Temporäres SFTP-Passwort sofort widerrufen.');
    } catch (err: any) {
      setError(err.message || 'Temporäres Passwort konnte nicht widerrufen werden.');
    } finally {
      setRevoking(false);
    }
  };

  const host = info?.host || window.location.hostname || '127.0.0.1';
  const port = info?.port || 2022;
  const username = info?.username || `apex_${server.id}`;
  const sftpUri = info?.sftpUri || `sftp://${username}@${host}:${port}`;
  const cliCommand = `sftp -P ${port} ${username}@${host}`;
  const hasActiveTempPass = remainingSeconds > 0 && Boolean(info?.tempPassword?.active || generatedPassword);

  return (
    <div className="space-y-6">
      {/* Header & Connection Details */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-100 tracking-tight">
              SFTP-Zugriff
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
              <span>Direkter Dateizugriff über FileZilla, WinSCP, Cyberduck oder Terminal</span>
              <span aria-hidden="true">·</span>
              <span className={info?.running ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                {loading ? 'Prüfe Dienst...' : info?.running ? `SFTP-Dienst aktiv (Port ${port})` : `SFTP-Dienst inaktiv (Port ${port})`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-neutral-300">Verzeichnis: {info?.rootDirectory || `/${server.id}`}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => copyValue('uri', sftpUri, 'SFTP-Verbindungs-URI')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedKey === 'uri' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === 'uri' ? 'URI kopiert' : 'SFTP-URI kopieren'}</span>
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={loadSftpInfo}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer whitespace-nowrap"
            >
              Erneut laden
            </button>
          </div>
        )}

        {/* 3-Column Connection Credentials Grid */}
        {loading && !info ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 rounded-lg bg-neutral-950 border border-neutral-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-800 mt-5">
            {/* Host */}
            <div className="pb-4 md:pb-0 md:pr-5">
              <div className="text-xs text-neutral-400 font-medium mb-1.5">Server-Host (Adresse)</div>
              <div className="flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                <span className="font-mono tabular-nums text-xs text-neutral-100 truncate" title={host}>
                  {host}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('host', host, 'SFTP-Host')}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer shrink-0"
                  title="Host kopieren"
                >
                  {copiedKey === 'host' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {info?.hostName && info.hostName !== host && (
                <div className="text-[11px] text-neutral-500 font-mono mt-1.5 truncate">
                  Hostname: {info.hostName}
                </div>
              )}
            </div>

            {/* Port */}
            <div className="py-4 md:py-0 md:px-5">
              <div className="text-xs text-neutral-400 font-medium mb-1.5">SFTP-Port</div>
              <div className="flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                <span className="font-mono tabular-nums text-xs text-emerald-400 font-semibold">
                  {port}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('port', String(port), 'SFTP-Port')}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer shrink-0"
                  title="Port kopieren"
                >
                  {copiedKey === 'port' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[11px] text-neutral-500 mt-1.5">
                Protokoll: SFTP (SSH File Transfer)
              </div>
            </div>

            {/* Username */}
            <div className="pt-4 md:pt-0 md:pl-5">
              <div className="text-xs text-neutral-400 font-medium mb-1.5">Benutzername</div>
              <div className="flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                <span className="font-mono text-xs text-sky-400 font-semibold truncate" title={username}>
                  {username}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('user', username, 'SFTP-Benutzername')}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer shrink-0"
                  title="Benutzernamen kopieren"
                >
                  {copiedKey === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-[11px] text-neutral-500 mt-1.5">
                Isoliert auf das Verzeichnis dieser Instanz
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Temporary Password Generator */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span>Temporäres SFTP-Passwort</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Erzeugt ein zeitlich begrenztes, kryptografisch gesichertes Einmal-Passwort (scrypt-Hash) nur für diesen Server. Nach Ablauf wird der Zugriff automatisch ungültig.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center p-1 bg-neutral-950 border border-neutral-800 rounded-lg">
              {TTL_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => setTtlMinutes(opt.minutes)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    ttlMinutes === opt.minutes
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleGenerateTempPassword}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              <span>{generating ? 'Generiere...' : 'Temporäres Passwort generieren'}</span>
            </button>
          </div>
        </div>

        {/* Active / Generated Password Display */}
        {generatedPassword ? (
          <div className="p-4 rounded-lg bg-neutral-950 border border-emerald-800/70 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-emerald-400 font-semibold">
                Neues temporäres Passwort aktiv — bitte jetzt kopieren (wird nach Verlassen der Ansicht nicht erneut angezeigt)
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-neutral-300">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Restzeit: {formatRemaining(remainingSeconds)}</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 flex items-center justify-between gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3.5 py-2.5">
                <span className="font-mono text-sm text-neutral-100 tracking-wide select-all break-all">
                  {showPassword ? generatedPassword : '••••••••••••••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 cursor-pointer shrink-0"
                  title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => copyValue('tempPass', generatedPassword, 'Temporäres SFTP-Passwort')}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                {copiedKey === 'tempPass' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'tempPass' ? 'Kopiert' : 'Passwort kopieren'}</span>
              </button>

              <button
                type="button"
                onClick={handleRevokeTempPassword}
                disabled={revoking}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-neutral-800 hover:bg-rose-950 text-neutral-300 hover:text-rose-300 border border-neutral-700 hover:border-rose-800 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldOff className="w-3.5 h-3.5" />
                <span>{revoking ? 'Widerrufe...' : 'Widerrufen'}</span>
              </button>
            </div>
          </div>
        ) : hasActiveTempPass ? (
          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="text-neutral-200 font-medium">
                Ein temporäres SFTP-Passwort ist derzeit aktiv (gesichert gespeichert).
              </div>
              <div className="text-neutral-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                <span>Läuft ab: {formatDateTime(info?.tempPassword?.expiresAt)}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400">Restzeit: {formatRemaining(remainingSeconds)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRevokeTempPassword}
              disabled={revoking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-rose-950 text-neutral-300 hover:text-rose-300 border border-neutral-700 hover:border-rose-800 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              <span>{revoking ? 'Widerrufe...' : 'Aktives Passwort widerrufen'}</span>
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800/80 text-xs text-neutral-400">
            Aktuell ist kein temporäres SFTP-Passwort aktiv. Klicke oben auf <span className="text-neutral-200 font-medium">„Temporäres Passwort generieren“</span>, um sofort zeitlich begrenzte Zugangsdaten für deinen SFTP-Client zu erstellen.
          </div>
        )}
      </div>

      {/* Quick Connect Client Reference */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-sky-400" />
              <span>FileZilla / WinSCP Schnellverbindung</span>
            </h4>
            <div className="text-xs text-neutral-400 space-y-1.5 font-mono">
              <div className="flex justify-between py-1 border-b border-neutral-800/70">
                <span className="text-neutral-500 font-sans">Übertragungsprotokoll</span>
                <span className="text-neutral-200">SFTP (SSH File Transfer Protocol)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-800/70">
                <span className="text-neutral-500 font-sans">Server / Rechnername</span>
                <span className="text-neutral-200">{host}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-800/70">
                <span className="text-neutral-500 font-sans">Port</span>
                <span className="text-emerald-400 tabular-nums">{port}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500 font-sans">Benutzername</span>
                <span className="text-sky-400">{username}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kommandozeile (Linux / macOS / PowerShell)</span>
            </h4>
            <p className="text-xs text-neutral-400">
              Verbinde dich direkt aus dem Terminal und gib anschließend das generierte temporäre Passwort ein:
            </p>
            <div className="flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5">
              <code className="font-mono text-xs text-emerald-300 truncate">{cliCommand}</code>
              <button
                type="button"
                onClick={() => copyValue('cli', cliCommand, 'SFTP-Terminalbefehl')}
                className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 cursor-pointer shrink-0"
                title="Befehl kopieren"
              >
                {copiedKey === 'cli' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
