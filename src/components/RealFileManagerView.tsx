import React, { useEffect, useState } from 'react';
import { ServerInstance, ServerFileItem } from '../types/game';
import { apiRequest } from '../services/api';

interface Props { server: ServerInstance; onSaveConfigFile?: (filename: string, content: string) => void; onNotify?: (message: string) => void; }
export function FileManagerView({ server }: Props) {
  const [directory, setDirectory] = useState('/');
  const [files, setFiles] = useState<ServerFileItem[]>([]);
  const [selected, setSelected] = useState<ServerFileItem | null>(null);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const base = '/api/servers/' + server.id;
  const refresh = async () => { const result = await apiRequest(base + '/files?path=' + encodeURIComponent(directory)); setFiles(result.files); };
  useEffect(() => { setSelected(null); refresh().catch(error => setMessage(error.message)); }, [server.id, directory]);
  const action = async (task: () => Promise<void>, success: string) => {
    setBusy(true); setMessage('');
    try { await task(); await refresh(); setMessage(success); }
    catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  };
  const open = (file: ServerFileItem) => {
    if (file.type === 'directory') { setDirectory(file.path); return; }
    if (!file.isEditable) { setMessage('Binärdatei oder Datei größer als 1 MiB; Download verwenden.'); return; }
    action(async () => { const data = await apiRequest(base + '/file?path=' + encodeURIComponent(file.path)); setSelected(file); setContent(data.content); }, '');
  };
  const create = (folder: boolean) => {
    const name = window.prompt(folder ? 'Ordnername' : 'Dateiname');
    if (!name) return;
    if (/[/\\]/.test(name) || name === '.' || name === '..') { setMessage('Bitte einen einzelnen Datei-/Ordnernamen eingeben.'); return; }
    action(async () => { await apiRequest(base + (folder ? '/directory' : '/file'), 'POST', { path: directory.replace(/\/$/, '') + '/' + name, content: '' }); }, 'Auf dem Host angelegt.');
  };
  const upload = (file?: File) => {
    if (!file) return;
    action(async () => {
      if (file.size > 32 * 1024 * 1024) throw new Error('Upload unterstützt Dateien bis 32 MiB.');
      const response = await fetch(base + '/upload?path=' + encodeURIComponent(directory.replace(/\/$/, '') + '/' + file.name), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
    }, 'Datei auf dem Host gespeichert.');
  };
  return <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
    <h2 className="font-bold">Dateien auf dem Host</h2>
    <div className="flex gap-3 flex-wrap">
      <button disabled={busy || directory === '/'} onClick={() => setDirectory(directory.split('/').slice(0, -1).join('/') || '/')}>Zurück</button>
      <button disabled={busy} onClick={() => action(refresh, '')}>Aktualisieren</button>
      <button disabled={busy} onClick={() => create(false)}>Datei anlegen</button>
      <button disabled={busy} onClick={() => create(true)}>Ordner anlegen</button>
      <label className="cursor-pointer">Datei hochladen<input className="hidden" type="file" disabled={busy} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </div>
    <p className="font-mono text-sm">{directory}</p>
    {message && <p role="status" className="text-amber-300">{message}</p>}
    <div className="space-y-2">{files.map(file => <div key={file.path} className="flex gap-4 items-center border-b border-neutral-800 pb-2">
      <button disabled={busy} onClick={() => open(file)} className="flex-1 text-left">{file.type === 'directory' ? '📁 ' : ''}{file.name}</button>
      <span className="text-xs text-neutral-400">{file.type === 'file' ? file.sizeBytes + ' Bytes' : 'Ordner'}</span>
      {file.type === 'file' && <a href={base + '/download?path=' + encodeURIComponent(file.path)}>Download</a>}
      <button disabled={busy} onClick={() => {
        if (!window.confirm('Auf dem Host löschen: ' + file.path + '? Ordner müssen leer sein.')) return;
        action(async () => { await apiRequest(base + '/file', 'DELETE', { path: file.path }); if (selected?.path === file.path) setSelected(null); }, 'Auf dem Host gelöscht.');
      }} className="text-red-400">Löschen</button>
    </div>)}</div>
    {selected && <div className="space-y-2">
      <h3>{selected.path}</h3>
      <textarea aria-label="Dateiinhalt" value={content} onChange={event => setContent(event.target.value)} className="w-full min-h-72 bg-neutral-950 p-3 font-mono text-sm" />
      <button disabled={busy} className="bg-emerald-700 rounded p-2" onClick={() => action(async () => { await apiRequest(base + '/file', 'POST', { path: selected.path, content }); }, 'Auf dem Host gespeichert.')}>Speichern</button>
    </div>}
  </section>;
}
