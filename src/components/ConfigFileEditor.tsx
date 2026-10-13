import React, { useState } from 'react';
import { FileText, Save, RotateCcw, Check, Sliders, Code2, Copy, Coffee } from 'lucide-react';
import { ServerInstance } from '../types/game';

interface ConfigFileEditorProps {
  server: ServerInstance;
  onSaveConfigFile: (filename: string, content: string) => void;
  onOpenJavaModal?: () => void;
}

export const ConfigFileEditor: React.FC<ConfigFileEditorProps> = ({
  server,
  onSaveConfigFile,
  onOpenJavaModal
}) => {
  const configFiles = server.configFiles || {};
  const fileNames = Object.keys(configFiles);
  const [selectedFile, setSelectedFile] = useState<string>(fileNames[0] || 'server.properties');
  const [fileContent, setFileContent] = useState<string>(configFiles[selectedFile] || '');
  const [mode, setMode] = useState<'gui' | 'raw'>('gui');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync if selected file changes
  const handleSelectFile = (name: string) => {
    setSelectedFile(name);
    setFileContent(configFiles[name] || '');
    setSavedSuccess(false);
  };

  const handleSave = () => {
    onSaveConfigFile(selectedFile, fileContent);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // Helper to parse key-value for GUI
  const getPropValue = (key: string, defaultVal: string = ''): string => {
    const match = fileContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : defaultVal;
  };

  const updatePropValue = (key: string, newVal: string) => {
    let updated: string;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(fileContent)) {
      updated = fileContent.replace(regex, `${key}=${newVal}`);
    } else {
      updated = fileContent + `\n${key}=${newVal}`;
    }
    setFileContent(updated);
  };

  const isPropertiesFile = selectedFile.endsWith('.properties') || selectedFile.endsWith('.cfg') || selectedFile.endsWith('.ini');

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[560px]">
      {/* File Sidebar */}
      <div className="w-full md:w-64 bg-neutral-950 border-r border-neutral-800 p-3 flex flex-col justify-between shrink-0">
        <div>
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-2 py-1.5 mb-1">
            Konfigurationsdateien
          </div>
          <div className="space-y-1">
            {fileNames.map((name) => (
              <button
                key={name}
                onClick={() => handleSelectFile(name)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-mono transition-colors text-left cursor-pointer ${
                  selectedFile === name
                    ? 'bg-neutral-800 text-emerald-400 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-900 px-2 space-y-2">
          {server.category === 'minecraft' && onOpenJavaModal && (
            <button
              onClick={onOpenJavaModal}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <Coffee className="w-3.5 h-3.5 text-amber-400" />
                <span>Java 21+ & Flags</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/50">
                {server.javaVersion || 'Java 21'}
              </span>
            </button>
          )}
          <div className="text-[11px] text-neutral-500">
            Dateien werden in Echtzeit im Server-Root synchronisiert.
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 flex flex-col bg-neutral-900">
        {/* Top Control Bar */}
        <div className="px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold text-neutral-200">{selectedFile}</span>
            {isPropertiesFile && (
              <div className="flex items-center gap-1 bg-neutral-950 p-0.5 rounded border border-neutral-800 text-xs">
                <button
                  onClick={() => setMode('gui')}
                  className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer ${mode === 'gui' ? 'bg-neutral-800 text-emerald-400 font-medium' : 'text-neutral-400'}`}
                >
                  <Sliders className="w-3 h-3" />
                  <span>GUI-Optionen</span>
                </button>
                <button
                  onClick={() => setMode('raw')}
                  className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer ${mode === 'raw' ? 'bg-neutral-800 text-emerald-400 font-medium' : 'text-neutral-400'}`}
                >
                  <Code2 className="w-3 h-3" />
                  <span>Editor (Raw)</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Gespeichert!</span>
              </span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Änderungen speichern</span>
            </button>
          </div>
        </div>

        {/* Content Mode */}
        {mode === 'gui' && isPropertiesFile ? (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[500px]">
            <div>
              <h3 className="text-sm font-semibold text-neutral-200 mb-1">Häufige Server-Einstellungen</h3>
              <p className="text-xs text-neutral-400">Passe die Kernparameter bequem über das Formular an.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Server Name / MOTD */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Server Name / MOTD</label>
                <input
                  type="text"
                  value={getPropValue('motd', getPropValue('server-name', server.name))}
                  onChange={(e) => updatePropValue('motd', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Max Players */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Maximale Spieleranzahl</label>
                <input
                  type="number"
                  value={getPropValue('max-players', getPropValue('MaxPlayers', `${server.maxPlayers}`))}
                  onChange={(e) => updatePropValue('max-players', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Server Port */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Server Port</label>
                <input
                  type="number"
                  value={getPropValue('server-port', getPropValue('Port', `${server.port}`))}
                  onChange={(e) => updatePropValue('server-port', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* RCON Port */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">RCON Remote Console Port</label>
                <input
                  type="number"
                  value={getPropValue('rcon.port', '25575')}
                  onChange={(e) => updatePropValue('rcon.port', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* PvP Toggle */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">PvP (Spieler gegen Spieler)</label>
                <select
                  value={getPropValue('pvp', 'true')}
                  onChange={(e) => updatePropValue('pvp', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="true">Aktiviert (PvP erlaubt)</option>
                  <option value="false">Deaktiviert (Friedlich)</option>
                </select>
              </div>

              {/* Whitelist Toggle */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Whitelist / Zugangskontrolle</label>
                <select
                  value={getPropValue('white-list', 'false')}
                  onChange={(e) => updatePropValue('white-list', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="false">Deaktiviert (Jeder kann beitreten)</option>
                  <option value="true">Aktiviert (Nur gelistete Spieler)</option>
                </select>
              </div>

              {/* Difficulty */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Schwierigkeitsgrad</label>
                <select
                  value={getPropValue('difficulty', 'normal')}
                  onChange={(e) => updatePropValue('difficulty', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="peaceful">Peaceful</option>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              {/* View Distance */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Sichtweite (Sichtbare Chunks)</label>
                <input
                  type="number"
                  min="4"
                  max="32"
                  value={getPropValue('view-distance', '10')}
                  onChange={(e) => updatePropValue('view-distance', e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Raw Editor */
          <div className="flex-1 p-2 bg-neutral-950">
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="w-full h-[470px] bg-transparent text-neutral-200 font-mono text-xs p-3 leading-relaxed focus:outline-none resize-none"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
};
