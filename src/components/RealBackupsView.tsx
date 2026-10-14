import React, { useEffect, useState } from 'react';
import { BackupItem, ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';
import { Archive, Download, RotateCcw, Trash2, ShieldCheck, Clock, FileArchive, AlertTriangle } from 'lucide-react';

export function BackupsView({ server }: { server: ServerInstance }) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const base = '/api/servers/' + server.id + '/backups';

  const refresh = async () => {
    const data = await apiRequest(base);
    setBackups(data.backups || []);
  };

  useEffect(() => {
    refresh().catch(err => setError(err.message));
  }, [server.id]);

  const run = async (url: string, method: string, success: string, payload: any = {}) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await apiRequest(url, method, payload);
      await refresh();
      setMessage(result.message || success);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBackup = () => {
    run(base, 'POST', 'Archiv des Spieldatenverzeichnisses erfolgreich gespeichert.', { allowRunning: true });
  };

  const handleRestore = (backup: BackupItem) => {
    if (server.status === 'running') {
      if (!window.confirm('Achtung: Der Server läuft aktuell! Vor der Wiederherstellung wird dringend empfohlen, den Server zu stoppen. Trotzdem fortfahren?')) {
        return;
      }
    } else if (!window.confirm(`Möchtest du das Backup "${backup.name}" wirklich wiederherstellen? Vorherige Dateien werden separat im Wiederherstellungsordner gesichert.`)) {
      return;
    }
    run(base + '/' + backup.id + '/restore', 'POST', 'Backup erfolgreich wiederhergestellt.');
  };

  const handleDelete = (backup: BackupItem) => {
    if (window.confirm(`Möchtest du das Backup "${backup.name}" endgültig von der Festplatte löschen?`)) {
      run(base + '/' + backup.id, 'DELETE', 'Backup gelöscht.');
    }
  };

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-neutral-100">Host-Backups & Snapshots</h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Archiviert das gesamte Spieldatenverzeichnis (inkl. Konfigurationen, Welten und Mods) als komprimiertes <span className="font-mono text-neutral-300">.tar.gz</span>-Archiv.
          </p>
        </div>

        {/* Primary Create Backup Button */}
        <button
          disabled={busy}
          onClick={handleCreateBackup}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm shadow-emerald-600/30 shrink-0"
          title="Create Backup (Archiviert das aktuelle Spieldatenverzeichnis)"
        >
          <Archive className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          <span>{busy ? 'Archivierung läuft…' : 'Create Backup'}</span>
        </button>
      </div>

      {message && (
        <div role="status" className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs rounded-lg flex items-center gap-2 animate-in fade-in">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs rounded-lg flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Vorhandene Archive ({backups.length})
        </h3>

        {backups.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40">
            <FileArchive className="w-10 h-10 text-neutral-600 mx-auto mb-2.5" />
            <p className="text-neutral-300 text-xs font-medium">Noch keine Backups für diesen Server vorhanden.</p>
            <p className="text-neutral-500 text-[11px] mt-1 max-w-sm mx-auto">
              Klicke oben auf <span className="text-emerald-400 font-semibold font-mono">Create Backup</span>, um eine vollständige Momentaufnahme deiner Spieldateien auf dem Host zu erstellen.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/50">
            {backups.map(backup => (
              <div key={backup.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-neutral-900/60 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Archive className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-neutral-100 truncate">{backup.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                        {backup.fileSizeMb.toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        <span>{new Date(backup.createdAt).toLocaleString('de-DE')}</span>
                      </span>
                      {backup.sha256 && (
                        <span className="font-mono text-neutral-500 text-[10px] truncate max-w-xs" title={`SHA-256: ${backup.sha256}`}>
                          SHA: {backup.sha256.slice(0, 12)}…
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <a
                    href={base + '/' + backup.id + '/download'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors"
                    title="Archiv herunterladen"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>

                  <button
                    disabled={busy}
                    onClick={() => handleRestore(backup)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    title="Dieses Backup wiederherstellen"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Wiederherstellen</span>
                  </button>

                  <button
                    disabled={busy}
                    onClick={() => handleDelete(backup)}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    title="Backup endgültig löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
