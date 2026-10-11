import React, { useState } from 'react';
import { ServerInstance, JavaVersion } from '../types/game';
import { apiRequest } from '../services/api';
interface Props { server: ServerInstance; onUpdateVersion?: (version: string, notes?: string, java?: JavaVersion) => void; onNotify?: (message: string) => void; }
export function UpdateManagerView({ server, onUpdateVersion, onNotify }: Props) {
  const [version, setVersion] = useState(server.version);
  const [backup, setBackup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const update = async () => {
    setBusy(true); setMessage('');
    const base = '/api/servers/' + server.id;
    try {
      if (backup) { setMessage('Sicherheitsarchiv wird erstellt…'); await apiRequest(base + '/backups', 'POST', {}); }
      setMessage('Spieldateien werden installiert…');
      const result = await apiRequest(base + '/install', 'POST', { version: server.category === 'minecraft' ? version : undefined });
      if (result.version) onUpdateVersion?.(result.version);
      setMessage('Installation vom Backend bestätigt. Der Server bleibt gestoppt.');
      onNotify?.('Spieldateien erfolgreich aktualisiert.');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
    <h2 className="font-bold">Spieldateien aktualisieren</h2>
    <p className="text-sm text-neutral-400">Server zuerst vollständig stoppen. Paper wird für die ausdrücklich ausgewählte Version installiert; Steam verwendet den öffentlichen Zweig. Andere Engines und Beta-Zweige sind noch nicht implementiert.</p>
    {server.category === 'minecraft' && <label className="block">Paper-Version<input className="bg-neutral-800 rounded p-2 ml-3" value={version} onChange={event => setVersion(event.target.value)} /></label>}
    <label className="block"><input type="checkbox" checked={backup} onChange={event => setBackup(event.target.checked)} /> Vorher echtes Sicherheitsarchiv erstellen</label>
    <button disabled={busy} onClick={update} className="bg-emerald-700 rounded p-2">{busy ? 'Aktion läuft…' : 'Update installieren'}</button>
    {message && <p role="status" className="text-amber-300">{message}</p>}
  </section>;
}
