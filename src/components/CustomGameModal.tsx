import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { GameDefinition, GameCategory, ModdingFramework } from '../types/game';

interface CustomGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (game: GameDefinition) => void;
}

interface CustomGameExamplePreset {
  id: string;
  label: string;
  name: string;
  slug: string;
  category: GameCategory;
  steamAppId: string;
  defaultPort: number;
  queryPort: number;
  recommendedRamGb: number;
  modFramework: ModdingFramework;
  windowsExe: string;
  linuxExe: string;
  macosExe: string;
  startArgs: string;
  configFileName: string;
  configContent: string;
  description: string;
}

const CUSTOM_GAME_EXAMPLES: CustomGameExamplePreset[] = [
  {
    id: 'terraria_tmod',
    label: 'Terraria (tModLoader)',
    name: 'Terraria tModLoader',
    slug: 'terraria_tmodloader',
    category: 'sandbox',
    steamAppId: '1281930',
    defaultPort: 7777,
    queryPort: 7778,
    recommendedRamGb: 4,
    modFramework: 'custom',
    windowsExe: 'tModLoaderServer.exe',
    linuxExe: './start-tModLoaderServer.sh',
    macosExe: './start-tModLoaderServer.sh',
    startArgs: '-config serverconfig.txt -port 7777',
    configFileName: 'serverconfig.txt',
    configContent: 'worldname=SonoraWorld\nmaxplayers=16\nport=7777\ndifficulty=1\n',
    description: 'Gemoddeter Terraria Dedicated Server mit tModLoader und Workshop-Unterstützung.'
  },
  {
    id: 'satisfactory_example',
    label: 'Satisfactory Dedicated',
    name: 'Satisfactory Dedicated',
    slug: 'satisfactory_custom',
    category: 'simulation',
    steamAppId: '1690800',
    defaultPort: 7777,
    queryPort: 15777,
    recommendedRamGb: 12,
    modFramework: 'custom',
    windowsExe: 'FactoryServer.exe',
    linuxExe: './FactoryServer.sh',
    macosExe: './FactoryServer.sh',
    startArgs: '-Port=7777 -log -unattended',
    configFileName: 'Engine.ini',
    configContent: '[/Script/OnlineSubsystemUtils.IpNetDriver]\nMaxClientRate=1048576\n',
    description: 'Fabrikbau- & Automatisierungs-Server für kooperative Multiplayer-Fabriken.'
  },
  {
    id: 'vintage_story',
    label: 'Vintage Story',
    name: 'Vintage Story Dedicated',
    slug: 'vintage_story',
    category: 'survival',
    steamAppId: '',
    defaultPort: 42420,
    queryPort: 42420,
    recommendedRamGb: 6,
    modFramework: 'custom',
    windowsExe: 'VintagestoryServer.exe',
    linuxExe: './VintagestoryServer',
    macosExe: './VintagestoryServer',
    startArgs: '--dataPath ./data --port 42420',
    configFileName: 'serverconfig.json',
    configContent: '{\n  "ServerName": "Sonora Vintage Story",\n  "Port": 42420,\n  "MaxClients": 16,\n  "AllowPvP": true\n}',
    description: 'Kompromissloses Voxel-Survival-Spiel mit eigenem .NET-Server ohne Steam-Abhängigkeit.'
  }
];

export const CustomGameModal: React.FC<CustomGameModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('');
  const [category, setCategory] = useState<GameCategory>('custom');
  const [steamAppId, setSteamAppId] = useState<string>('');
  const [defaultPort, setDefaultPort] = useState<number>(7777);
  const [queryPort, setQueryPort] = useState<number>(27015);
  const [recommendedRamGb, setRecommendedRamGb] = useState<number>(8);
  const [modFramework, setModFramework] = useState<ModdingFramework>('custom');
  const [description, setDescription] = useState('');
  const [windowsExe, setWindowsExe] = useState('server.exe');
  const [linuxExe, setLinuxExe] = useState('./server.x86_64');
  const [macosExe, setMacosExe] = useState('./server');
  const [startArgs, setStartArgs] = useState('-port 7777 -log');
  const [configFileName, setConfigFileName] = useState('server_config.json');
  const [configContent, setConfigContent] = useState('{\n  "ServerName": "ApexHost Custom Server",\n  "Port": 7777,\n  "MaxPlayers": 16\n}');

  if (!isOpen) return null;

  const applyPreset = (preset: CustomGameExamplePreset) => {
    setName(preset.name);
    setGameId(preset.slug);
    setCategory(preset.category);
    setSteamAppId(preset.steamAppId);
    setDefaultPort(preset.defaultPort);
    setQueryPort(preset.queryPort);
    setRecommendedRamGb(preset.recommendedRamGb);
    setModFramework(preset.modFramework);
    setWindowsExe(preset.windowsExe);
    setLinuxExe(preset.linuxExe);
    setMacosExe(preset.macosExe);
    setStartArgs(preset.startArgs);
    setConfigFileName(preset.configFileName);
    setConfigContent(preset.configContent);
    setDescription(preset.description);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!gameId) {
      setGameId(val.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gameId.trim()) return;

    const newGame: GameDefinition = {
      id: gameId.trim(),
      name: name.trim(),
      category,
      steamAppId: steamAppId ? parseInt(steamAppId, 10) : undefined,
      bannerColor: '#10b981',
      defaultPort,
      queryPort,
      minRamGb: Math.max(1, Math.floor(recommendedRamGb / 2)),
      recommendedRamGb,
      modFramework,
      supportedPlatforms: ['windows', 'linux', 'macos'],
      executable: {
        windows: windowsExe || `${gameId}.exe`,
        linux: linuxExe || `./${gameId}`,
        macos: macosExe || `./${gameId}`
      },
      defaultStartArgs: {
        windows: startArgs,
        linux: startArgs,
        macos: startArgs
      },
      configFiles: [
        {
          name: configFileName || 'config.json',
          path: configFileName || 'config.json',
          type: configFileName.endsWith('.json') ? 'json' : 'ini',
          defaultContent: configContent
        }
      ],
      description: description || `Benutzerdefiniertes Spiel ${name} mit voller Plattformunterstützung.`,
      isCustom: true
    };

    onSave(newGame);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>Neues Spiel zum Manager hinzufügen</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Erweitere den Gameserver Manager um beliebige Steam-, Binary- oder Script-basierte Spiele.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive 1-Click Examples Bar */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Spiel-Beispiele (1-Klick Vorlage laden)
          </div>
          <div className="flex flex-wrap gap-2">
            {CUSTOM_GAME_EXAMPLES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-2.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/50 text-xs text-neutral-200 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Spielname</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="z. B. Vintage Story, Terraria tModLoader..."
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Eindeutige ID (Slug)</label>
              <input
                type="text"
                required
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="z. B. vintage_story"
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Genre / Kategorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GameCategory)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="survival">Survival &amp; Crafting</option>
                <option value="fps">Taktik-Shooter / FPS</option>
                <option value="sandbox">Sandbox &amp; Bauen</option>
                <option value="simulation">Simulation &amp; Logistik</option>
                <option value="coop">Ko-Op &amp; Party</option>
                <option value="rpg">RPG &amp; Rollenspiel</option>
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Steam AppID (Optional)</label>
              <input
                type="number"
                value={steamAppId}
                onChange={(e) => setSteamAppId(e.target.value)}
                placeholder="z. B. 1281930"
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Standard Spiel-Port</label>
              <input
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(parseInt(e.target.value, 10) || 7777)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Empfohlener RAM (GB)</label>
              <input
                type="number"
                value={recommendedRamGb}
                onChange={(e) => setRecommendedRamGb(parseInt(e.target.value, 10) || 4)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Modding Framework</label>
              <select
                value={modFramework}
                onChange={(e) => setModFramework(e.target.value as ModdingFramework)}
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="steam_workshop">Steam Workshop</option>
                <option value="bepinex">BepInEx (Unity)</option>
                <option value="umod_oxide">Oxide / uMod</option>
                <option value="sourcemod">SourceMod (Source Engine)</option>
                <option value="ue4ss">UE4SS (Unreal Engine)</option>
                <option value="custom">Benutzerdefiniert</option>
                <option value="none">Kein Modding</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Start-Argumente</label>
              <input
                type="text"
                value={startArgs}
                onChange={(e) => setStartArgs(e.target.value)}
                placeholder="-port 7777 -batchmode"
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">Kurzbeschreibung</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Worum geht es in diesem Spiel?"
              className="w-full h-16 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded cursor-pointer transition-colors"
            >
              Spiel im Katalog speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
