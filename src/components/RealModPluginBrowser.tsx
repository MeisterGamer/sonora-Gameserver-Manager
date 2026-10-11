import React, { useState } from 'react';
import { ServerInstance, ModItem } from '../types/game';
import { apiRequest } from '../services/api';
interface Props {
  server: ServerInstance; allServers?: ServerInstance[];
  onInstallMod: (mod: ModItem, restart?: boolean) => void | Promise<void>;
  onUninstallMod: (id: string) => void | Promise<void>;
  onToggleMod: (id: string, enabled: boolean) => void | Promise<void>;
}
export function ModPluginBrowser({ server, onInstallMod, onUninstallMod, onToggleMod }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage('');
    try { await task(); setMessage(success); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => { const response = await apiRequest('/api/live/modrinth/search?query=' + encodeURIComponent(query)); setResults(response.hits || []); }, '');
  };
  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
    <h2 className="font-bold">Modrinth / Paper-Plugins</h2>
    <p className="text-sm text-neutral-400">Server für Dateiänderungen stoppen. Der Installer prüft Spielversion, Loader und SHA-512. Projekte mit erforderlichen Abhängigkeiten sowie andere Anbieter sind derzeit nicht automatisch installierbar.</p>
    <form onSubmit={search} className="flex gap-3"><input aria-label="Plugins suchen" value={query} onChange={event => setQuery(event.target.value)} className="bg-neutral-800 rounded p-2 flex-1" /><button disabled={busy}>Suchen</button></form>
    {message && <p role="status" className="text-amber-300">{message}</p>}
    {results.map(mod => <div key={mod.id} className="flex gap-3 items-center border-b border-neutral-800 pb-2">
      <span className="flex-1">{mod.name}<small className="block text-neutral-400">{mod.description}</small></span>
      <button disabled={busy || server.status !== 'offline'} onClick={() => run(async () => { await onInstallMod(mod); }, 'Plugin-Datei auf dem Host gespeichert.')}>Installieren</button>
    </div>)}
    <h3 className="font-semibold">Tatsächlich installierte Plugins</h3>
    {(server.installedMods || []).map(mod => <div key={mod.id} className="flex gap-3 items-center border-b border-neutral-800 pb-2">
      <span className="flex-1">{mod.name} · {mod.version} · {mod.enabled ? 'aktiv' : 'deaktiviert'}</span>
      <button disabled={busy || server.status !== 'offline'} onClick={() => run(async () => { await onToggleMod(mod.id, !mod.enabled); }, 'Plugindatei umbenannt.')}>{mod.enabled ? 'Deaktivieren' : 'Aktivieren'}</button>
      <button disabled={busy || server.status !== 'offline'} className="text-red-400" onClick={() => { if (window.confirm('Plugindatei entfernen?')) run(async () => { await onUninstallMod(mod.id); }, 'Plugindatei entfernt.'); }}>Entfernen</button>
    </div>)}
  </section>;
}
