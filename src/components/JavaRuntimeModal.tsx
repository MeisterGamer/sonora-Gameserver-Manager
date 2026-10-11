import React, { useEffect, useState } from 'react';
import { ServerInstance, JavaVersion } from '../types/game';
import { apiRequest } from '../services/api';
import { requiredPaperJava } from '../data/installerSupport';
interface Props { server: ServerInstance; isOpen: boolean; onClose: () => void; onSaveJava: (id: string, version: JavaVersion, restart: boolean) => void; }
export function JavaRuntimeModal({ server, isOpen, onClose, onSaveJava }: Props) {
  const minimum = server.requiredJava || requiredPaperJava(server.version);
  const [selected, setSelected] = useState(server.javaVersion || ('Java ' + minimum));
  const [versions, setVersions] = useState<{ major: number; available: boolean; installed: boolean; version?: string; error?: string }[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setVersions([]); setMessage('Prüfe verfügbare JDKs…');
    setSelected(server.javaVersion || ('Java ' + minimum));
    apiRequest('/api/java/versions').then(data => { if (!cancelled) { setVersions(data.versions); setMessage(''); } })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [isOpen, server.id, server.javaVersion, minimum]);
  if (!isOpen) return null;
  const chosen = versions.find(item => selected === 'Java ' + item.major);
  const save = async () => {
    setBusy(true); setMessage('JDK wird heruntergeladen, geprüft und installiert…');
    try {
      const result = await apiRequest('/api/servers/' + server.id + '/java', 'POST', { javaVersion: selected });
      onSaveJava(server.id, result.javaVersion, false); onClose();
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <section role="dialog" aria-modal="true" aria-label="JDK auswählen" className="bg-neutral-900 rounded-xl border border-neutral-700 p-6 max-w-xl w-full space-y-4">
      <h2 className="font-bold text-lg">JDK 7–26 für {server.name}</h2>
      <p>Die Instanz benötigt mindestens JDK {minimum}. Installation und Wechsel erfordern einen gestoppten Server.</p>
      <label className="block">Java Development Kit<select className="block w-full bg-neutral-800 p-2 mt-2" value={selected} disabled={busy || !versions.length} onChange={event => setSelected(event.target.value)}>
        {!versions.length && <option value={selected}>{selected}</option>}
        {versions.map(item => <option key={item.major} value={'Java ' + item.major} disabled={item.major < minimum || (!item.available && !item.installed)}>
          JDK {item.major} {item.installed ? '· installiert' : item.available ? '· verfügbar (' + item.version + ')' : '· nicht verfügbar'}{item.major < minimum ? ' · zu alt' : ''}
        </option>)}
      </select></label>
      <p className="text-sm text-neutral-400">Getrennte Azul-Zulu-JDKs auf Linux x64. Downloads werden mit SHA-256 geprüft. Ein neueres JDK kann bei alten Plugins oder Modpacks inkompatibel sein.</p>
      {message && <p role="status" className="text-amber-300">{message}</p>}
      <div className="flex gap-3"><button disabled={busy || !chosen || (!chosen.available && !chosen.installed) || chosen.major < minimum} onClick={save} className="bg-emerald-700 rounded p-2">{busy ? 'Installiert…' : 'JDK installieren und auswählen'}</button><button disabled={busy} onClick={onClose}>Schließen</button></div>
    </section>
  </div>;
}
