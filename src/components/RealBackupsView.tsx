import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { BackupItem, ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';
import {
  Archive,
  Download,
  RotateCcw,
  Trash2,
  ShieldCheck,
  Clock,
  FileArchive,
  AlertTriangle,
  Search,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';

interface BackupsViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

type BackupFilter = 'all' | 'manual' | 'pre_rollback';

const QUICK_LABELS = [
  'Vor Plugin-Update',
  'Welt-Checkpoint',
  'Vor Config-Änderung',
  'Tägliche Sicherung'
];

function formatSize(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '0.00 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTypeLabel(type: BackupItem['type']): string {
  switch (type) {
    case 'pre_rollback':
      return 'Sicherheits-Snapshot';
    case 'scheduled':
      return 'Geplant';
    default:
      return 'Manuell';
  }
}

export function BackupsView({ server, onNotify }: BackupsViewProps) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Manual backup creation fields
  const [backupLabel, setBackupLabel] = useState('');
  const [backupNotes, setBackupNotes] = useState('');

  // Filter / Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<BackupFilter>('all');

  // Rollback & Delete inline confirmation state
  const [pendingAction, setPendingAction] = useState<{ type: 'restore' | 'delete'; backup: BackupItem } | null>(null);
  const [createSafetySnapshot, setCreateSafetySnapshot] = useState(true);
  const [copiedShaId, setCopiedShaId] = useState<string | null>(null);

  const base = '/api/servers/' + server.id + '/backups';

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest(base);
      setBackups(Array.isArray(data.backups) ? data.backups : []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Backups konnten nicht geladen werden.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    setPendingAction(null);
    setMessage('');
    refresh(false);
  }, [refresh]);

  const run = async (url: string, method: string, success: string, payload: any = {}, label = 'Verarbeite...') => {
    setBusy(true);
    setBusyLabel(label);
    setMessage('');
    setError('');
    try {
      const result = await apiRequest(url, method, payload);
      if (Array.isArray(result.backups)) {
        setBackups(result.backups);
      } else {
        await refresh(true);
      }
      const msg = result.message || success;
      setMessage(msg);
      onNotify?.(msg);
    } catch (err: any) {
      setError(err.message || 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const handleCreateBackup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const labelToUse = backupLabel.trim() || 'Manuelles Backup';
    await run(
      base,
      'POST',
      `Backup „${labelToUse}“ erfolgreich erstellt.`,
      {
        allowRunning: true,
        label: labelToUse,
        notes: backupNotes.trim()
      },
      'Erstelle Backup-Archiv...'
    );
    setBackupLabel('');
    setBackupNotes('');
  };

  const handleOneClickRollback = async (backup: BackupItem) => {
    setPendingAction(null);
    await run(
      base + '/' + backup.id + '/restore',
      'POST',
      `Rollback auf „${backup.label || backup.name}“ abgeschlossen.`,
      {
        autoStop: true,
        createSafetyBackup: createSafetySnapshot
      },
      'Führe Rollback durch...'
    );
  };

  const handleConfirmPending = async () => {
    if (!pendingAction) return;
    const { type, backup } = pendingAction;
    if (type === 'restore') {
      await handleOneClickRollback(backup);
    } else {
      setPendingAction(null);
      await run(base + '/' + backup.id, 'DELETE', 'Backup endgültig gelöscht.', {}, 'Lösche Backup...');
    }
  };

  const copySha = (backup: BackupItem) => {
    if (!backup.sha256) return;
    navigator.clipboard?.writeText(backup.sha256).catch(() => {});
    setCopiedShaId(backup.id);
    onNotify?.('SHA-256 Prüfsumme kopiert.');
    setTimeout(() => setCopiedShaId((curr) => (curr === backup.id ? null : curr)), 2000);
  };

  const totalSizeMb = useMemo(
    () => backups.reduce((sum, b) => sum + (Number(b.fileSizeMb) || 0), 0),
    [backups]
  );

  const filteredBackups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return backups.filter((b) => {
      if (filterType !== 'all' && b.type !== filterType) return false;
      if (!q) return true;
      return (
        (b.label || '').toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.sha256 || '').toLowerCase().includes(q)
      );
    });
  }, [backups, filterType, searchQuery]);

  const latestBackup = backups[0] || null;

  return (
    <div className="space-y-6">
      {/* Header & Summary KPI Bar */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-neutral-100 tracking-tight flex items-center gap-2">
              <Archive className="w-4 h-4 text-emerald-400" />
              <span>Backup-Manager</span>
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
              <span>Manuelle Sicherungen, SHA-256-Integritätsprüfung und 1-Klick-Rollback</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-neutral-300">
                {backups.length} {backups.length === 1 ? 'Archiv' : 'Archive'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-neutral-300">
                {formatSize(totalSizeMb)} belegt
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refresh(false)}
              disabled={busy || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Aktualisieren</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleCreateBackup()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              title="Create Backup (Archiviert das aktuelle Spieldatenverzeichnis)"
            >
              <Archive className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>{busy ? busyLabel || 'Archivierung läuft…' : 'Create Backup'}</span>
            </button>
          </div>
        </div>

        {/* 3-Column Compact Status Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800 mt-5 pt-4 border-t border-neutral-800 text-xs">
          <div className="pb-3 sm:pb-0 sm:pr-4">
            <div className="text-neutral-400">Gespeicherte Sicherungen</div>
            <div className="mt-1 font-mono tabular-nums text-lg font-bold text-neutral-100">
              {backups.length}
            </div>
          </div>
          <div className="py-3 sm:py-0 sm:px-4">
            <div className="text-neutral-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-sky-400" />
              <span>Belegter Backup-Speicher</span>
            </div>
            <div className="mt-1 font-mono tabular-nums text-lg font-bold text-sky-400">
              {formatSize(totalSizeMb)}
            </div>
          </div>
          <div className="pt-3 sm:pt-0 sm:pl-4">
            <div className="text-neutral-400">Letzte Sicherung</div>
            <div className="mt-1 font-mono tabular-nums text-sm font-semibold text-neutral-200">
              {latestBackup ? formatDateTime(latestBackup.createdAt) : 'Noch keine'}
            </div>
          </div>
        </div>
      </section>

      {/* Manual Backup Creator Form */}
      <form onSubmit={handleCreateBackup} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">
              Manuelles Backup erstellen
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Sichert Welten, Konfigurationen, Mods und Plugins als prüfsummengesichertes <span className="font-mono text-neutral-300">.tar.gz</span>-Archiv auf dem Host.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_LABELS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setBackupLabel(preset)}
                className="px-2.5 py-1 rounded-md bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-300 cursor-pointer transition-colors whitespace-nowrap"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-xs text-neutral-400 mb-1">Bezeichnung (optional)</label>
            <input
              type="text"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              maxLength={80}
              placeholder="z. B. Vor Update auf 1.21.4"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs text-neutral-400 mb-1">Notiz (optional)</label>
            <input
              type="text"
              value={backupNotes}
              onChange={(e) => setBackupNotes(e.target.value)}
              maxLength={240}
              placeholder="z. B. Neuer Spawn-Bereich fertiggestellt"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Jetzt sichern</span>
            </button>
          </div>
        </div>
      </form>

      {/* Status & Error Banners */}
      {message && (
        <div role="status" className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage('')}
            className="text-emerald-300/80 hover:text-emerald-200 cursor-pointer whitespace-nowrap"
          >
            Schließen
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-300/80 hover:text-rose-200 cursor-pointer whitespace-nowrap"
          >
            Schließen
          </button>
        </div>
      )}

      {/* Existing Backups & Rollback List */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-neutral-200">
              Vorhandene Backups ({filteredBackups.length})
            </h3>
            <label className="hidden sm:inline-flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createSafetySnapshot}
                onChange={(e) => setCreateSafetySnapshot(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-emerald-500 focus:ring-0"
              />
              <span>Auto-Sicherung vor Rollback anlegen</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Suchen (Name, Notiz, SHA)..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 focus:outline-none focus:border-neutral-700 w-52"
              />
            </div>

            {/* Type Filter */}
            <div className="inline-flex items-center p-0.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs">
              {([
                { key: 'all', label: 'Alle' },
                { key: 'manual', label: 'Manuell' },
                { key: 'pre_rollback', label: 'Vor-Rollback' }
              ] as { key: BackupFilter; label: string }[]).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterType(f.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                    filterType === f.key
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && backups.length === 0 ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 rounded-lg bg-neutral-950 animate-pulse" />
            ))}
          </div>
        ) : filteredBackups.length === 0 ? (
          <div className="text-center py-12 px-5">
            <FileArchive className="w-9 h-9 text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-200 text-sm font-semibold">
              {backups.length === 0
                ? 'Noch keine Backups für diesen Server vorhanden'
                : 'Keine Backups passen zu deiner Suche'}
            </p>
            <p className="text-neutral-400 text-xs mt-1 max-w-md mx-auto">
              {backups.length === 0
                ? 'Erstelle oben dein erstes manuelles Backup, um den aktuellen Serverzustand sicher zu archivieren und jederzeit per 1-Klick-Rollback wiederherzustellen.'
                : 'Passe Suchbegriff oder Filter an, um vorhandene Sicherungen anzuzeigen.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {filteredBackups.map((backup) => (
              <div
                key={backup.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-neutral-800/25 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-semibold text-neutral-100 truncate">
                      {backup.label || backup.name}
                    </span>
                    <span className="text-xs text-neutral-500">·</span>
                    <span className="text-xs font-mono tabular-nums text-emerald-400">
                      {formatSize(backup.fileSizeMb)}
                    </span>
                    <span className="text-xs text-neutral-500">·</span>
                    <span className={`text-xs ${backup.type === 'pre_rollback' ? 'text-amber-400' : 'text-neutral-400'}`}>
                      {formatTypeLabel(backup.type)}
                    </span>
                    {typeof backup.fileCount === 'number' && (
                      <>
                        <span className="text-xs text-neutral-500">·</span>
                        <span className="text-xs font-mono tabular-nums text-neutral-400">
                          {backup.fileCount} Dateien
                        </span>
                      </>
                    )}
                  </div>

                  {backup.notes && (
                    <p className="text-xs text-neutral-300">{backup.notes}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400 font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-neutral-500" />
                      <span>{formatDateTime(backup.createdAt)}</span>
                    </span>
                    <span className="text-neutral-500 truncate max-w-[220px]" title={backup.name}>
                      {backup.name}
                    </span>
                    {backup.sha256 && (
                      <button
                        type="button"
                        onClick={() => copySha(backup)}
                        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                        title={`SHA-256 kopieren: ${backup.sha256}`}
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span>SHA: {backup.sha256.slice(0, 10)}…</span>
                        {copiedShaId === backup.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Row Actions: 1-Click Rollback, Download, Delete */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={base + '/' + backup.id + '/download'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                    title="Archiv (.tar.gz) herunterladen"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>

                  {pendingAction?.backup.id === backup.id ? (
                    <div className="inline-flex items-center gap-1.5 bg-neutral-950 border border-amber-500/50 rounded-lg px-2.5 py-1 text-xs">
                      <span className="text-amber-200 whitespace-nowrap">
                        {pendingAction.type === 'restore'
                          ? server.status === 'running'
                            ? 'Server stoppen & Rollback?'
                            : 'Auf diesen Stand zurückrollen?'
                          : 'Endgültig löschen?'}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleConfirmPending}
                        className={`px-2 py-0.5 rounded font-semibold text-white cursor-pointer whitespace-nowrap ${
                          pendingAction.type === 'delete'
                            ? 'bg-rose-600 hover:bg-rose-500'
                            : 'bg-amber-600 hover:bg-amber-500'
                        }`}
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingAction(null)}
                        className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded cursor-pointer whitespace-nowrap"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleOneClickRollback(backup)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        title="Mit einem Klick auf diesen früheren Zustand zurückrollen (Rollback)"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback</span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingAction({ type: 'delete', backup })}
                        className="p-1.5 rounded-lg bg-neutral-950 hover:bg-rose-950/70 border border-neutral-800 hover:border-rose-800 text-neutral-400 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                        title="Backup endgültig löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export const BackupManagerView = BackupsView;
