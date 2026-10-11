import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, ShieldAlert, Check } from 'lucide-react';
import { ServerInstance } from '../types/game';

interface DeleteServerModalProps {
  isOpen: boolean;
  server: ServerInstance | null;
  onClose: () => void;
  onConfirmDelete: (serverId: string, keepBackups?: boolean) => void | Promise<void>;
}

export const DeleteServerModal: React.FC<DeleteServerModalProps> = ({
  isOpen,
  server,
  onClose,
  onConfirmDelete
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');
  const [keepBackups, setKeepBackups] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!isOpen || !server) return null;

  const requiresInputMatch = confirmationInput.trim().toLowerCase() === server.name.trim().toLowerCase() || confirmationInput.trim() === 'DELETE' || confirmationInput.trim() === 'LÖSCHEN';

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onConfirmDelete(server.id, keepBackups);
      setConfirmationInput('');
      onClose();
    } catch (error: any) { setDeleteError(error.message); }
    finally { setIsDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-neutral-900 border border-rose-900/60 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl shadow-rose-950/40 text-neutral-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with warning banner */}
        <div className="bg-rose-950/60 border-b border-rose-900/40 p-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-900/80 border border-rose-700/60 flex items-center justify-center text-rose-300 shrink-0">
              <Trash2 className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-200">Server aus der Verwaltung entfernen</h3>
              <p className="text-xs text-rose-300/80">Dateien werden auf dem Host zur Wiederherstellung aufbewahrt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {deleteError && <p role="alert" className="text-red-400">{deleteError}</p>}
          {/* Target Server Card */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 font-medium">Zielserver:</span>
              <span className="font-mono text-[11px] text-neutral-500">ID: {server.id}</span>
            </div>
            <div className="text-sm font-bold text-neutral-100">{server.name}</div>
            <div className="flex items-center gap-2 text-neutral-400 font-mono text-[11px]">
              <span>{server.gameName}</span>
              <span>·</span>
              <span>Port: {server.port}</span>
              <span>·</span>
              <span>{server.allocatedRamGb} GB RAM</span>
            </div>
          </div>

          {/* Warning text */}
          <div className="bg-rose-950/30 border border-rose-900/30 rounded-xl p-3 flex items-start gap-2.5 text-rose-300/90 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p>
              Der Prozess wird gestoppt und die Instanz aus der Verwaltung entfernt. Vorhandene Dateien und Backups werden zur Wiederherstellung auf dem Host aufbewahrt.
            </p>
          </div>

          {/* Checkbox keep backup */}
          <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800/80 cursor-pointer hover:bg-neutral-800/40 transition-colors">
            <input
              type="checkbox"
              checked={true}
              disabled
              onChange={(e) => setKeepBackups(e.target.checked)}
              className="w-4 h-4 rounded text-rose-600 bg-neutral-900 border-neutral-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-neutral-300 font-medium">
              Vorhandene Dateien und Backups auf dem Host behalten
            </span>
          </label>

          {/* Confirmation input safety */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-neutral-300 font-medium">
              Tippe zur Bestätigung <span className="font-mono font-bold text-rose-400">"{server.name}"</span> oder <span className="font-mono font-bold text-rose-400">DELETE</span> ein:
            </label>
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={server.name}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-rose-500"
              autoFocus
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!requiresInputMatch || isDeleting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
              requiresInputMatch && !isDeleting
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                : 'bg-rose-950/50 text-rose-400/40 border border-rose-900/40 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Wird gelöscht...' : 'Instanz entfernen'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
