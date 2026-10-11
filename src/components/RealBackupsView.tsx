import React, { useEffect, useState } from 'react';
import { BackupItem, ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';
export function BackupsView({ server }: { server: ServerInstance }) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const base = '/api/servers/' + server.id + '/backups';
  const refresh = async () => { const data = await apiRequest(base); setBackups(data.backups); };
  useEffect(() => { refresh().catch(error => setMessage(error.message)); }, [server.id]);
  const run = async (url: string, method: string, success: string) => {
    setBusy(true); setMessage('');
    try { const result = await apiRequest(url, method, {}); await refresh(); setMessage(result.message || success); }
    catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
    <h2 className="font-bold">Backups auf dem Host</h2>
    <p className="text-sm text-neutral-400">Server vor Sicherung oder Wiederherstellung vollständig stoppen. Der Host benötigt das Programm tar. Zeitpläne sind noch nicht implementiert.</p>
    <button disabled={busy} onClick={() => run(base, 'POST', 'Archiv gespeichert und Prüfsumme erfasst.')} className="bg-emerald-700 rounded p-2">{busy ? 'Aktion läuft…' : 'Backup erstellen'}</button>
    {message && <p role="status" className="text-amber-300">{message}</p>}
    {backups.map(backup => <div key={backup.id} className="flex flex-wrap gap-3 items-center border-b border-neutral-800 pb-3">
      <span className="flex-1">{backup.name}<small className="block text-neutral-400">{backup.createdAt} · {backup.fileSizeMb.toFixed(2)} MiB</small></span>
      <a href={base + '/' + backup.id + '/download'}>Download</a>
      <button disabled={busy} onClick={() => { if (window.confirm('Dieses Backup wiederherstellen? Vorherige Dateien werden separat aufbewahrt.')) run(base + '/' + backup.id + '/restore', 'POST', 'Wiederhergestellt.'); }}>Wiederherstellen</button>
      <button disabled={busy} className="text-red-400" onClick={() => { if (window.confirm('Dieses Backup endgültig löschen?')) run(base + '/' + backup.id, 'DELETE', 'Backup gelöscht.'); }}>Löschen</button>
    </div>)}
    {!backups.length && <p>Noch keine tatsächlichen Backups vorhanden.</p>}
  </section>;
}
