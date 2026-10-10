import React, { useState } from 'react';
import { Archive, Plus, RotateCcw, Download, Trash2, Clock, Calendar, Check, AlertCircle } from 'lucide-react';
import { BackupItem, ScheduledTask, ServerInstance } from '../types/game';

interface BackupsViewProps {
  server: ServerInstance;
}

export const BackupsView: React.FC<BackupsViewProps> = ({ server }) => {
  const [backups, setBackups] = useState<BackupItem[]>([
    {
      id: 'bk_1',
      name: `${server.id}_world_full_2026-10-10_12-00.tar.gz`,
      createdAt: '2026-10-10 12:00',
      fileSizeMb: 1420,
      type: 'scheduled'
    },
    {
      id: 'bk_2',
      name: `${server.id}_manual_before_update.tar.gz`,
      createdAt: '2026-10-09 18:30',
      fileSizeMb: 1390,
      type: 'manual'
    }
  ]);

  const [tasks, setTasks] = useState<ScheduledTask[]>([
    {
      id: 'tsk_1',
      name: 'Täglicher Server-Neustart (RAM Bereinigung)',
      type: 'restart',
      cronExpression: '0 4 * * * (Jeden Tag um 04:00 Uhr)',
      enabled: true,
      lastRun: 'Gestern 04:00',
      nextRun: 'Morgen 04:00'
    },
    {
      id: 'tsk_2',
      name: 'Automatische Welt-Sicherung',
      type: 'backup',
      cronExpression: '0 */6 * * * (Alle 6 Stunden)',
      enabled: true,
      lastRun: 'Heute 12:00',
      nextRun: 'Heute 18:00'
    },
    {
      id: 'tsk_3',
      name: 'Restart-Warnung an Spieler',
      type: 'command',
      cronExpression: '50 3 * * * (10 Min vor Reboot)',
      command: 'say [Server] Automatischer Neustart in 10 Minuten!',
      enabled: true,
      lastRun: 'Gestern 03:50',
      nextRun: 'Morgen 03:50'
    }
  ]);

  const [creatingBackup, setCreatingBackup] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleCreateBackup = () => {
    setCreatingBackup(true);
    setTimeout(() => {
      const newBackup: BackupItem = {
        id: `bk_${Date.now()}`,
        name: `${server.id}_snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`,
        createdAt: 'Gerade eben',
        fileSizeMb: Math.round(server.diskUsageMb * 0.9) || 1200,
        type: 'manual'
      };
      setBackups([newBackup, ...backups]);
      setCreatingBackup(false);
      setSuccessToast('Backup erfolgreich komprimiert und gespeichert!');
      setTimeout(() => setSuccessToast(null), 3000);
    }, 1200);
  };

  const handleRestoreBackup = (b: BackupItem) => {
    if (confirm(`Möchtest du das Backup "${b.name}" wirklich wiederherstellen? Bestehende Weltdaten werden überschrieben.`)) {
      setSuccessToast(`Backup "${b.name}" wurde erfolgreich wiederhergestellt!`);
      setTimeout(() => setSuccessToast(null), 3500);
    }
  };

  const handleDeleteBackup = (id: string) => {
    setBackups(backups.filter(b => b.id !== id));
  };

  const handleToggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Backups Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Archive className="w-4 h-4 text-emerald-400" />
              <span>Backups & Welt-Snapshots</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Erstelle 1-Klick Vollsicherungen aller Welten, Konfigurationen und Datenbanken.
            </p>
          </div>

          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{creatingBackup ? 'Komprimiere Daten...' : 'Neues Backup erstellen'}</span>
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Keine Backups vorhanden. Klicke oben auf "Neues Backup erstellen".
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {backups.map((b) => (
              <div key={b.id} className="p-4 flex items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-medium text-neutral-200">{b.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                      <span>Erstellt: {b.createdAt}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{b.fileSizeMb} MB</span>
                      <span>·</span>
                      <span className="capitalize">{b.type === 'manual' ? 'Manuell' : 'Automatisch (Cron)'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestoreBackup(b)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs font-medium cursor-pointer transition-colors"
                    title="Diesen Stand wiederherstellen"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Wiederherstellen</span>
                  </button>
                  <button
                    onClick={() => {
                      alert(`Download von ${b.name} gestartet.`);
                    }}
                    className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Als TAR/ZIP herunterladen"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(b.id)}
                    className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Backup löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled Tasks / Cron Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800">
          <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Automatisierte Zeitpläne (Cron Aufgaben)</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Automatisiere Neustarts, periodische Backups und RCON-Serverbefehle im Hintergrund.
          </p>
        </div>

        <div className="divide-y divide-neutral-800/80">
          {tasks.map((task) => (
            <div key={task.id} className="p-4 flex items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${task.enabled ? 'text-neutral-100' : 'text-neutral-500'}`}>
                    {task.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800">
                    {task.cronExpression}
                  </span>
                </div>
                {task.command && (
                  <div className="text-[11px] font-mono text-emerald-400 mt-1">
                    Befehl: {task.command}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-1">
                  <span>Letzte Ausführung: {task.lastRun || 'Nie'}</span>
                  <span>·</span>
                  <span>Nächste Ausführung: {task.nextRun}</span>
                </div>
              </div>

              <div>
                <button
                  onClick={() => handleToggleTask(task.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                    task.enabled
                      ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {task.enabled ? 'Aktiviert' : 'Deaktiviert'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
