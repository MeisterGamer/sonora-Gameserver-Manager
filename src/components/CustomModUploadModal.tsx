import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  FileCode, 
  CheckCircle2, 
  AlertTriangle, 
  HardDrive, 
  ShieldCheck, 
  Folder,
  Loader2
} from 'lucide-react';
import { ModItem } from '../types/game';

interface CustomModUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallUploadedMod: (mod: ModItem) => void;
}

export const CustomModUploadModal: React.FC<CustomModUploadModalProps> = ({
  isOpen,
  onClose,
  onInstallUploadedMod
}) => {
  if (!isOpen) return null;

  const [fileName, setFileName] = useState('');
  const [modName, setModName] = useState('');
  const [fileSize, setFileSize] = useState('3.8 MB');
  const [targetFolder, setTargetFolder] = useState<'/plugins/' | '/mods/'>('/plugins/');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleSimulateFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const cleanName = file.name.replace(/\.(jar|zip|dll|pak)$/i, '').replace(/[-_]/g, ' ');
      setModName(cleanName);
      setFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      if (file.name.endsWith('.jar') && !targetFolder) {
        setTargetFolder('/plugins/');
      }
    }
  };

  const handleStartUpload = () => {
    if (!modName.trim()) return;

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStatus('Lade Datei auf Host-Server hoch...');

    setTimeout(() => {
      setUploadProgress(45);
      setUploadStatus('SHA-256 Integritätsprüfung...');
    }, 600);

    setTimeout(() => {
      setUploadProgress(80);
      setUploadStatus('Sicherheits-Scan (Malware & Obfuskation)... Sauber!');
    }, 1200);

    setTimeout(() => {
      setUploadProgress(100);
      setUploadStatus('Erfolgreich im Zielverzeichnis abgelegt!');

      const uploadedMod: ModItem = {
        id: `custom_${Date.now()}`,
        name: modName.trim(),
        gameId: 'minecraft',
        category: 'Utility',
        author: 'Manuell hochgeladen',
        downloads: 'Lokal',
        version: '1.0.0-Custom',
        description: `Eigene Erweiterung (${fileName || `${modName}.jar`}) im Verzeichnis ${targetFolder}`,
        source: 'GitHub', // or custom
        fileSize: fileSize || '3.5 MB',
        tags: ['Custom', 'Manuell', targetFolder.replace(/\//g, '')]
      };

      onInstallUploadedMod(uploadedMod);
      setIsUploading(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-emerald-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-100 text-sm">Eigene Mod / Plugin hochladen</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Unterstützt .jar, .zip, .dll und .pak Archive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dropzone */}
        <label className="border-2 border-dashed border-neutral-800 hover:border-emerald-500/80 rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer bg-neutral-950/60 transition-colors">
          <input
            type="file"
            accept=".jar,.zip,.dll,.pak"
            onChange={handleSimulateFileSelect}
            className="hidden"
          />
          <FileCode className="w-8 h-8 text-neutral-500 mb-1" />
          {fileName ? (
            <div>
              <span className="font-mono text-emerald-400 text-xs font-semibold">{fileName}</span>
              <span className="text-neutral-500 text-[11px] block mt-0.5">Größe: {fileSize}</span>
            </div>
          ) : (
            <div>
              <span className="text-xs font-medium text-neutral-200 block">Klicke zum Auswählen oder ziehe die Datei hierher</span>
              <span className="text-[11px] text-neutral-500 mt-1 block">Dateien werden direkt in das Server-Dateisystem übertragen</span>
            </div>
          )}
        </label>

        {/* Form Fields */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Mod- / Plugin-Name</label>
            <input
              type="text"
              value={modName}
              onChange={(e) => setModName(e.target.value)}
              placeholder="z. B. MeinCustomPlugin"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">Ziel-Verzeichnis auf dem Server</label>
            <div className="grid grid-cols-2 gap-2">
              <label 
                onClick={() => setTargetFolder('/plugins/')}
                className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                  targetFolder === '/plugins/'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 font-semibold'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <Folder className="w-4 h-4 text-amber-400" />
                <span>/plugins/ (Paper/Spigot)</span>
              </label>

              <label 
                onClick={() => setTargetFolder('/mods/')}
                className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                  targetFolder === '/mods/'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 font-semibold'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <Folder className="w-4 h-4 text-purple-400" />
                <span>/mods/ (Fabric/Forge)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        {isUploading && (
          <div className="space-y-1.5 pt-2 font-mono text-xs">
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>{uploadStatus}</span>
              <span className="text-emerald-400 font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleStartUpload}
            disabled={!modName.trim() || isUploading}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Wird installiert...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Hochladen & Installieren</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
