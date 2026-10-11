import React, { useState, useEffect } from 'react';
import { ServerInstance, JavaVersion } from '../types/game';
import { apiRequest } from '../services/api';
interface Props { server: ServerInstance; onUpdateVersion?: (version: string, notes?: string, java?: JavaVersion) => void; onNotify?: (message: string) => void; }
export function UpdateManagerView({ server, onUpdateVersion, onNotify }: Props) {
  const [version, setVersion] = useState(server.version);
  const [backup, setBackup] = useState(!server.requiresInstall);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
    setBusy(true); setMessage('');
    const base = '/api/servers/' + server.id;
    try {
      if (backup) { setMessage('Sicherheitsarchiv wird erstellt…'); await apiRequest(base + '/backups', 'POST', {}); }
      setMessage('Spieldateien werden installiert…');
      const result = await apiRequest(base + '/install', 'POST', { version: server.category === 'minecraft' ? version : undefined, allowExperimental });
      if (result.version) onUpdateVersion?.(result.version);
      setMessage('Installation vom Backend bestätigt. Der Server bleibt gestoppt.');
      onNotify?.('Spieldateien erfolgreich aktualisiert.');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
    <h2 className="font-bold">{server.requiresInstall ? 'Spieldateien installieren' : 'Spieldateien aktualisieren'}</h2>
    {server.installationError && <p role="alert" className="text-red-400">Letzte Installation: {server.installationError}</p>}
    <p className="text-sm text-neutral-400">Server zuerst vollständig stoppen. Minecraft wird für die gewählte Engine und Version installiert; Steam verwendet den öffentlichen Zweig. Der Server wird danach nicht automatisch gestartet.</p>
    {server.category === 'minecraft' && <label className="block">{server.minecraftType || 'paper'}-Version<select className="bg-neutral-800 rounded p-2 ml-3" value={version} onChange={event => setVersion(event.target.value)}><option value={server.version}>{server.version}</option>{versions.filter(item => item !== server.version).map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
    <label className="block"><input type="checkbox" checked={backup} onChange={event => setBackup(event.target.checked)} /> Vorher echtes Sicherheitsarchiv erstellen</label>
    {server.category === 'minecraft' && server.minecraftType !== 'vanilla' && <label className="block text-amber-300"><input type="checkbox" checked={allowExperimental} onChange={event => setAllowExperimental(event.target.checked)} /> Experimentelle Builds ausdrücklich erlauben, falls kein stabiler Build existiert</label>}
    <button disabled={busy} onClick={update} className="bg-emerald-700 rounded p-2">{busy ? 'Aktion läuft…' : 'Update installieren'}</button>
    {message && <p role="status" className="text-amber-300">{message}</p>}
  </section>;
}
