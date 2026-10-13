import React, { useState, useEffect } from 'react';
import { ServerInstance, JavaVersion } from '../types/game';
import { apiRequest } from '../services/api';
interface Props { server: ServerInstance; onUpdateVersion?: (version: string, notes?: string, java?: JavaVersion) => void; onNotify?: (message: string) => void; }
export function UpdateManagerView({ server, onUpdateVersion, onNotify }: Props) {
  const [version, setVersion] = useState(server.version);
  const [backup, setBackup] = useState(!server.requiresInstall);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStep, setProgressStep] = useState<string>('');
  const [versions, setVersions] = useState<string[]>([]);
  const [allowExperimental, setAllowExperimental] = useState(server.allowExperimental === true);

  useEffect(() => {
    setVersion(server.version);
    if (server.category !== 'minecraft') return;
    let cancelled = false;
    apiRequest('/api/installers/' + (server.minecraftType || 'paper') + '/versions').then(data => {
      if (!cancelled) setVersions(data.versions);
    }).catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [server.id]);

  const update = async () => {
    setBusy(true);
    setMessage('Initialisiere Installationsprozess…');
    setProgressPercent(10);
    setProgressStep('init');

    const base = '/api/servers/' + server.id;

    let isDone = false;
    const pollTimer = setInterval(async () => {
      if (isDone) return;
      try {
        const res = await fetch(`/api/servers/${server.id}/install/progress`);
        if (res.ok) {
          const data = await res.json();
          if (data.progress) {
            setProgressPercent(data.progress.percent || 10);
            if (data.progress.message) {
              setMessage(data.progress.message);
            }
            if (data.progress.step) {
              setProgressStep(data.progress.step);
            }
          }
        }
      } catch {}
    }, 500);

    try {
      if (backup) {
        setMessage('Sicherheitsarchiv wird erstellt…');
        setProgressPercent(15);
        await apiRequest(base + '/backups', 'POST', {});
      }
      setMessage('Spieldateien & portables Java werden installiert…');
      const result = await apiRequest(base + '/install', 'POST', {
        version: server.category === 'minecraft' ? version : undefined,
        allowExperimental,
        minecraftType: server.minecraftType
      });
      isDone = true;
      clearInterval(pollTimer);
      setProgressPercent(100);
      if (result.version) onUpdateVersion?.(result.version);
      setMessage('Installation erfolgreich abgeschlossen! Server und Java sind startbereit.');
      onNotify?.('Spieldateien und Java-Laufzeit erfolgreich eingerichtet.');
    } catch (error: any) {
      isDone = true;
      clearInterval(pollTimer);
      setMessage('Fehler: ' + error.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
    <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
      <div>
        <h2 className="font-bold text-neutral-100 text-base">{server.requiresInstall ? 'Spieldateien & Java installieren' : 'Spieldateien aktualisieren'}</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Installiert die offizielle Server-JAR ({server.minecraftType?.toUpperCase() || 'Minecraft'}) und lädt die passende portable Java-Laufzeitumgebung herunter.
        </p>
      </div>
      {busy && (
        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800 animate-pulse">
          {progressPercent}%
        </span>
      )}
    </div>

    {server.installationError && <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/50">Letzte Installation: {server.installationError}</p>}

    {/* Live Progress Bar when busy */}
    {busy && (
      <div className="bg-neutral-950 border border-emerald-500/40 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-emerald-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            {message || 'Installation läuft...'}
          </span>
          <span className="font-mono text-emerald-400 font-bold">{progressPercent} / 100%</span>
        </div>
        <div className="h-2.5 w-full bg-neutral-900 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-neutral-500 font-mono pt-1">
          <span>Server-JAR</span>
          <span>Portables OpenJDK</span>
          <span>Konfiguration</span>
          <span>Bereit</span>
        </div>
      </div>
    )}

    {server.category === 'minecraft' && (
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
        <label className="block text-xs font-medium text-neutral-300 mb-1.5">{server.minecraftType || 'paper'}-Version auswählen:</label>
        <select 
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-lg p-2 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono" 
          value={version} 
          disabled={busy}
          onChange={event => setVersion(event.target.value)}
        >
          <option value={server.version}>{server.version} (Aktuell)</option>
          {versions.filter(item => item !== server.version).map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    )}

    <div className="space-y-2 text-xs text-neutral-300">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" disabled={busy} checked={backup} onChange={event => setBackup(event.target.checked)} className="accent-emerald-500 rounded" />
        <span>Vor der Installation automatisches Sicherheitsarchiv erstellen</span>
      </label>

      {server.category === 'minecraft' && server.minecraftType !== 'vanilla' && (
        <label className="flex items-center gap-2 text-amber-300/90 cursor-pointer">
          <input type="checkbox" disabled={busy} checked={allowExperimental} onChange={event => setAllowExperimental(event.target.checked)} className="accent-emerald-500 rounded" />
          <span>Experimentelle Builds ausdrücklich erlauben, falls kein stabiler Release-Build existiert</span>
        </label>
      )}
    </div>

    <div className="pt-2 flex items-center justify-between">
      <button 
        disabled={busy} 
        onClick={update} 
        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg px-4 py-2 transition-colors cursor-pointer shadow-sm shadow-emerald-600/30 flex items-center gap-2"
      >
        <span>{busy ? 'Installation läuft…' : server.requiresInstall ? 'Spieldateien jetzt installieren' : 'Update durchführen'}</span>
      </button>

      {message && !busy && <p role="status" className="text-xs text-emerald-400 font-mono">{message}</p>}
    </div>
  </section>;
}
