import React, { useEffect, useState } from 'react';
import { ServerInstance, JavaVersion } from '../types/game';
import { apiRequest } from '../services/api';
import { requiredPaperJava } from '../data/installerSupport';
import { Coffee, RotateCw, CheckCircle2, AlertTriangle, X, Download } from 'lucide-react';

interface Props { 
  server: ServerInstance; 
  isOpen: boolean; 
  onClose: () => void; 
  onSaveJava: (id: string, version: JavaVersion, restart: boolean) => void; 
}

export function JavaRuntimeModal({ server, isOpen, onClose, onSaveJava }: Props) {
  const minimum = server.requiredJava || requiredPaperJava(server.version);
  const [selected, setSelected] = useState(server.javaVersion || ('Java ' + minimum));
  const [versions, setVersions] = useState<{ major: number; available: boolean; installed: boolean; version?: string; error?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [downloadPercent, setDownloadPercent] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setVersions([]); 
    setMessage('Prüfe portable Java-Laufzeitumgebungen…');
    setSelected(server.javaVersion || ('Java ' + minimum));
    apiRequest('/api/java/versions').then(data => { 
      if (!cancelled) { 
        setVersions(data.versions); 
        setMessage(''); 
      } 
    }).catch(error => { 
      if (!cancelled) setMessage(error.message); 
    });
    return () => { cancelled = true; };
  }, [isOpen, server.id, server.javaVersion, minimum]);

  if (!isOpen) return null;

  const chosen = versions.find(item => selected === 'Java ' + item.major);

  const save = async () => {
    setBusy(true); 
    setMessage(`Lade portables OpenJDK für ${selected} herunter…`);
    setDownloadPercent(20);

    const timer = setInterval(() => {
      setDownloadPercent(prev => {
        if (prev >= 90) return prev;
        return prev + 15;
      });
    }, 600);

    try {
      const result = await apiRequest('/api/servers/' + server.id + '/java', 'POST', { javaVersion: selected });
      clearInterval(timer);
      setDownloadPercent(100);
      setMessage(`JDK erfolgreich eingerichtet und als Standard zugewiesen!`);
      setTimeout(() => {
        onSaveJava(server.id, result.javaVersion, false); 
        onClose();
      }, 700);
    } catch (error: any) { 
      clearInterval(timer);
      setMessage('Fehler: ' + error.message); 
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <section role="dialog" aria-modal="true" aria-label="JDK auswählen" className="bg-neutral-900 rounded-xl border border-neutral-700 p-6 max-w-xl w-full space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-neutral-100">Portable Java-Laufzeitumgebung</h2>
              <p className="text-xs text-neutral-400">JDK 7–26 für {server.name}</p>
            </div>
          </div>
          {!busy && (
            <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-xs text-neutral-300 space-y-2">
          <p>
            Die gewählte Minecraft-Version ({server.version}) erfordert mindestens <strong className="text-amber-400 font-mono">JDK {minimum}</strong>. 
            Portables Java wird automatisch geladen und isoliert in <code className="text-emerald-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">.runtime/jdks</code> verwaltet.
          </p>
        </div>

        {/* Live progress when downloading */}
        {busy && (
          <div className="bg-neutral-950 border border-amber-500/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300 flex items-center gap-2">
                <RotateCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                {message}
              </span>
              <span className="font-mono text-amber-400 font-bold">{downloadPercent}%</span>
            </div>
            <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, downloadPercent)}%` }}
              />
            </div>
          </div>
        )}

        <label className="block text-xs font-medium text-neutral-200">
          Gewünschte Java-Version auswählen
          <select 
            className="block w-full bg-neutral-950 border border-neutral-800 text-neutral-200 rounded-lg p-2.5 mt-1.5 text-xs focus:outline-none focus:border-emerald-500 font-mono" 
            value={selected} 
            disabled={busy || !versions.length} 
            onChange={event => setSelected(event.target.value)}
          >
            {!versions.length && <option value={selected}>{selected}</option>}
            {versions.map(item => (
              <option 
                key={item.major} 
                value={'Java ' + item.major} 
                disabled={item.major < minimum || (!item.available && !item.installed)}
              >
                Java {item.major} {item.installed ? '· Bereits portabel installiert' : item.available ? '· Portabler Download verfügbar (' + item.version + ')' : '· Nicht verfügbar'}
                {item.major < minimum ? ' (Zu alt für MC ' + server.version + ')' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Offizielle Multi-Mirror Bereitstellung (Azul Zulu & Adoptium / Temurin)</span>
          </div>
          <p>
            Vollständig autark auf Linux x64 ohne Root-Rechte. Jedes Archiv wird mit SHA-256 verifiziert und direkt für diese Serverinstanz eingebunden.
          </p>
        </div>

        {message && !busy && <p role="status" className="text-xs text-amber-300 font-mono">{message}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
          <button 
            disabled={busy} 
            onClick={onClose}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-lg transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
          <button 
            disabled={busy || !chosen || (!chosen.available && !chosen.installed) || chosen.major < minimum} 
            onClick={save} 
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-600/30 flex items-center gap-2"
          >
            {busy ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Wird installiert…</span>
              </>
            ) : (
              <span>Portables JDK herunterladen & setzen</span>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
