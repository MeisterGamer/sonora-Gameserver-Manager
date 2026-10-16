import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Save, 
  FileCode, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Sliders, 
  Code2, 
  Copy, 
  ExternalLink, 
  Sparkles, 
  Search, 
  Info,
  Maximize2,
  Minimize2,
  FileText
} from 'lucide-react';
import { ServerFileItem } from '../types/game';
import { SyntaxCodeEditor } from './SyntaxCodeEditor';

interface ConfigEditModalProps {
  isOpen: boolean;
  file: ServerFileItem | null;
  serverId: string;
  serverCategory?: string;
  onClose: () => void;
  onSaved: (filePath: string, newContent: string) => void;
  initialContent?: string;
}

export const ConfigEditModal: React.FC<ConfigEditModalProps> = ({
  isOpen,
  file,
  serverId,
  serverCategory,
  onClose,
  onSaved,
  initialContent
}) => {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'gui'>('raw');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Determine file type syntax
  const fileExt = useMemo(() => {
    if (!file) return '';
    const parts = file.name.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }, [file]);

  const isKeyValueFile = useMemo(() => {
    return ['properties', 'cfg', 'ini', 'env', 'conf'].includes(fileExt);
  }, [fileExt]);

  const fileTypeLabel = useMemo(() => {
    switch (fileExt) {
      case 'properties': return 'Java Properties';
      case 'yml':
      case 'yaml': return 'YAML Konfiguration';
      case 'json': return 'JSON Dokument';
      case 'toml': return 'TOML Konfiguration';
      case 'cfg':
      case 'ini': return 'Konfigurationsdatei';
      case 'txt': return 'Textdatei';
      case 'log': return 'Server Logfile';
      case 'sh': return 'Shell Script';
      default: return 'Serverdatei';
    }
  }, [fileExt]);

  // Load content when modal opens or file changes
  useEffect(() => {
    if (!isOpen || !file) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    // Default to Code-Editor tab for exact fidelity; users can toggle GUI for properties
    setActiveTab('raw');

    const loadContent = async () => {
      try {
        const cleanPath = file.path.replace(/^\/+/, '');
        const res = await fetch(`/api/servers/${serverId}/files/content?file=${encodeURIComponent(cleanPath)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.content !== undefined) {
            setContent(data.content);
            setOriginalContent(data.content);
            setIsLoading(false);
            return;
          }
        }
      } catch (err: any) {
        // Fallback below
      }

      if (isMounted) {
        const fallback = initialContent ?? file.content ?? (file.name === 'eula.txt' ? 'eula=true\n' : (file.name === 'server.properties' ? `server-port=25565\nmotd=§aApexHost Minecraft Server§r\nonline-mode=true\nmax-players=20\n` : ''));
        setContent(fallback);
        setOriginalContent(fallback);
        setIsLoading(false);
      }
    };

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [isOpen, file, serverId, initialContent, fileExt]);

  // Handle Ctrl/Cmd+S saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (isOpen && file && !isSaving) {
          e.preventDefault();
          handleSave();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleSave = async () => {
    if (!file) return;
    setIsSaving(true);
    setErrorMessage(null);

    const cleanPath = file.path.replace(/^\/+/, '');

    try {
      const res = await fetch(`/api/servers/${serverId}/files/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: cleanPath,
          content
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler beim Speichern der Datei');
      }

      setOriginalContent(content);
      setSaveSuccess(true);
      onSaved(file.path, content);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Verbindung zum Server fehlgeschlagen');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (window.confirm('Möchtest du alle ungespeicherten Änderungen an dieser Datei verwerfen?')) {
      setContent(originalContent);
      setErrorMessage(null);
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Helper for Key-Value parsed items
  const parsedKeyValue = useMemo(() => {
    if (!isKeyValueFile) return [];
    const lines = content.split('\n');
    const items: { key: string; value: string; comment?: string; isComment: boolean; lineIdx: number }[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        items.push({ key: '', value: line, isComment: true, lineIdx: idx });
      } else {
        const sepIdx = line.indexOf('=');
        if (sepIdx > -1) {
          const key = line.substring(0, sepIdx).trim();
          const value = line.substring(sepIdx + 1).trim();
          items.push({ key, value, isComment: false, lineIdx: idx });
        } else {
          items.push({ key: '', value: line, isComment: true, lineIdx: idx });
        }
      }
    });

    return items;
  }, [content, isKeyValueFile]);

  const updateKeyValue = (key: string, newVal: string) => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^(\\s*${escapedKey}\\s*[:=]\\s*).*$`, 'm');
    let updated: string;
    if (regex.test(content)) {
      updated = content.replace(regex, `$1${newVal}`);
    } else {
      updated = content.endsWith('\n') ? `${content}${key}=${newVal}\n` : `${content}\n${key}=${newVal}\n`;
    }
    setContent(updated);
  };

  const lineCount = useMemo(() => content.split('\n').length, [content]);

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div 
        className={`bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col transition-all overflow-hidden ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[88vh] max-h-[820px]'
        }`}
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-neutral-100 text-sm truncate font-mono">
                  {file.name}
                </h3>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {fileTypeLabel}
                </span>
                {content !== originalContent && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Nicht gespeichert
                  </span>
                )}
              </div>
              <p className="text-neutral-400 text-xs font-mono truncate mt-0.5">
                {file.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Switcher (if key-value) */}
            {isKeyValueFile && (
              <div className="bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 hidden sm:flex items-center">
                <button
                  onClick={() => setActiveTab('gui')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                    activeTab === 'gui' 
                      ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-xs' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>GUI-Maske</span>
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                    activeTab === 'raw' 
                      ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-xs' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Code-Editor</span>
                </button>
              </div>
            )}

            <button
              onClick={handleCopyContent}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-neutral-100 transition-colors cursor-pointer hidden md:flex items-center gap-1 text-xs"
              title="Inhalt in Zwischenablage kopieren"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copySuccess ? 'Kopiert' : 'Kopieren'}</span>
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-rose-950/60 border border-neutral-800 hover:border-rose-800 text-neutral-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Schließen (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status / Alert Bar */}
        {errorMessage && (
          <div className="bg-rose-950/60 border-b border-rose-900/60 px-4 py-2.5 text-xs text-rose-300 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-neutral-950">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono">Lade Server-Konfiguration...</p>
            </div>
          ) : activeTab === 'gui' && isKeyValueFile ? (
            /* GUI Settings View */
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-lg p-3 text-xs text-neutral-400 flex items-center justify-between">
                <span>
                  Visuelle Bearbeitung für <code className="text-emerald-400 font-mono font-semibold">{file.name}</code>. Änderungen werden automatisch im Raw-Code synchronisiert.
                </span>
                <span className="text-[11px] font-mono text-neutral-500">
                  {parsedKeyValue.filter(p => !p.isComment).length} Parameter erkannt
                </span>
              </div>

              {/* Minecraft server.properties quick helper cards */}
              {file.name === 'server.properties' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-3">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">Server MOTD</span>
                    <input 
                      type="text"
                      value={parsedKeyValue.find(p => p.key === 'motd')?.value || ''}
                      onChange={(e) => updateKeyValue('motd', e.target.value)}
                      placeholder="ApexHost Minecraft Server"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-700 font-mono"
                    />
                  </div>

                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">Max Spieler</span>
                    <input 
                      type="number"
                      value={parsedKeyValue.find(p => p.key === 'max-players')?.value || '20'}
                      onChange={(e) => updateKeyValue('max-players', e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-700 font-mono"
                    />
                  </div>

                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-1.5">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">Schwierigkeit</span>
                    <select
                      value={parsedKeyValue.find(p => p.key === 'difficulty')?.value || 'hard'}
                      onChange={(e) => updateKeyValue('difficulty', e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:border-neutral-700 font-mono cursor-pointer"
                    >
                      <option value="peaceful">peaceful</option>
                      <option value="easy">easy</option>
                      <option value="normal">normal</option>
                      <option value="hard">hard</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Full Key-Value List */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg divide-y divide-neutral-800/80 overflow-hidden">
                {parsedKeyValue.filter(item => !item.isComment).map((item) => {
                  const isBoolean = item.value === 'true' || item.value === 'false';
                  return (
                    <div key={item.key} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-neutral-850/40 transition-colors">
                      <div className="min-w-0 pr-2">
                        <span className="font-mono text-xs font-semibold text-neutral-200 block truncate">
                          {item.key}
                        </span>
                      </div>
                      
                      <div className="sm:w-64 shrink-0 flex items-center gap-2">
                        {isBoolean ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateKeyValue(item.key, item.value === 'true' ? 'false' : 'true')}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                item.value === 'true' ? 'bg-emerald-600' : 'bg-neutral-800'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  item.value === 'true' ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span className="font-mono text-xs text-neutral-400">
                              {item.value}
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={item.value}
                            onChange={(e) => updateKeyValue(item.key, e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-100 font-mono focus:outline-none focus:border-neutral-700"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Raw Code Editor View with Syntax Highlighting for .properties, .yml, .json */
            <div className="flex-1 flex flex-col min-h-0 p-3 bg-neutral-950 overflow-hidden">
              <SyntaxCodeEditor
                value={content}
                onChange={setContent}
                fileName={file.name}
              />
              {/* Hidden reference for backwards compatibility & line counting */}
              <textarea ref={textareaRef} value={content} readOnly className="hidden" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-3 text-neutral-500 font-mono text-[11px] self-start sm:self-auto">
            <span>{lineCount} Zeilen</span>
            <span>•</span>
            <span>{content.length} Zeichen</span>
            <span>•</span>
            <span>UTF-8</span>
            <span className="hidden md:inline">• Speichern mit Strg+S</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={handleRevert}
              disabled={content === originalContent || isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg border border-neutral-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Änderungen verwerfen"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Zurücksetzen</span>
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors cursor-pointer"
            >
              Abbrechen
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Wird gespeichert...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Gespeichert!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Speichern</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
