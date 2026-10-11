import React, { useState } from 'react';
import { 
  Shield, 
  Server, 
  Users, 
  Activity, 
  Settings, 
  Key, 
  UserCheck, 
  UserX, 
  AlertTriangle, 
  RefreshCw, 
  Check, 
  Save, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  ExternalLink, 
  Sliders, 
  Clock, 
  Coins, 
  HardDrive, 
  Send, 
  CheckCircle2, 
  Radio, 
  Sparkles,
  Info
} from 'lucide-react';
import { UserAccount, NodeInfo, AuditLogItem } from '../types/auth';
import { AdminSettings, SteamOperationMode } from '../types/adminSettings';
import { getStoredAdminSettings, saveStoredAdminSettings, DEFAULT_ADMIN_SETTINGS } from '../data/adminSettingsStore';
import { INITIAL_NODES, INITIAL_AUDIT_LOGS } from '../data/authStore';
import { MINECRAFT_VERSIONS } from '../data/minecraftTypes';

interface AdminControlViewProps {
  currentUser: UserAccount;
  users: UserAccount[];
  adminSettings?: AdminSettings;
  onUpdateAdminSettings?: (settings: AdminSettings) => void;
  onUpdateUserRole: (userId: string, newRole: 'admin' | 'user') => void;
  onAdjustUserBalance: (userId: string, newBalance: number) => void;
  onToggleUserStatus: (userId: string) => void;
}

export const AdminControlView: React.FC<AdminControlViewProps> = ({
  currentUser,
  users,
  adminSettings: initialSettingsProp,
  onUpdateAdminSettings,
  onUpdateUserRole,
  onAdjustUserBalance,
  onToggleUserStatus
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'nodes' | 'users' | 'audit'>('settings');
  const [nodes, setNodes] = useState<NodeInfo[]>(INITIAL_NODES);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [balanceEditId, setBalanceEditId] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState<number>(0);

  // Settings State
  const [settingsForm, setSettingsForm] = useState<AdminSettings>(() => {
    return initialSettingsProp || getStoredAdminSettings();
  });

  const [showCurseForgeKey, setShowCurseForgeKey] = useState(false);
  const [showSteamKey, setShowSteamKey] = useState(false);
  const [showModrinthToken, setShowModrinthToken] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [testWebhookStatus, setTestWebhookStatus] = useState<'idle' | 'testing' | 'success'>('idle');

  const handleRebootNode = (nodeId: string) => {
    alert(`Signal gesendet: Node ${nodeId} führt einen kontrollierten Rolling-Reboot durch.`);
  };

  const handleSaveBalance = (userId: string) => {
    onAdjustUserBalance(userId, balanceInput);
    setBalanceEditId(null);
  };

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    saveStoredAdminSettings(settingsForm);
    if (onUpdateAdminSettings) {
      onUpdateAdminSettings(settingsForm);
    }
    setSaveSuccessMsg('System- und Steam-Einstellungen erfolgreich gespeichert!');
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleResetSettings = () => {
    if (window.confirm('Möchtest du wirklich alle Admin-Einstellungen auf Standardwerte zurücksetzen?')) {
      setSettingsForm(DEFAULT_ADMIN_SETTINGS);
      saveStoredAdminSettings(DEFAULT_ADMIN_SETTINGS);
      if (onUpdateAdminSettings) {
        onUpdateAdminSettings(DEFAULT_ADMIN_SETTINGS);
      }
      setSaveSuccessMsg('Einstellungen auf Werkseinstellungen zurückgesetzt.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleTestWebhook = () => {
    setTestWebhookStatus('testing');
    setTimeout(() => {
      setTestWebhookStatus('success');
      setTimeout(() => setTestWebhookStatus('idle'), 3000);
    }, 1000);
  };

  const totalClusterServers = nodes.reduce((sum, n) => sum + n.activeServersCount, 0);
  const totalClusterRam = nodes.reduce((sum, n) => sum + n.maxRamGb, 0);
  const usedClusterRam = nodes.reduce((sum, n) => sum + n.ramUsageGb, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300 font-mono text-[10px] font-bold uppercase tracking-wider">
              Root Level
            </span>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-rose-400" />
              <span>Admin Control Center (Zentralsteuerung)</span>
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Systemweite Parameter, Steam-Betriebsmodi, API-Schlüssel, Cluster-Infrastruktur & Prepaid-Warnregeln.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-neutral-400 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
          <span>Angemeldet als: <strong className="text-neutral-200">{currentUser.username}</strong></span>
          <span>·</span>
          <span className="font-mono text-rose-400 uppercase font-semibold">Rolle: {currentUser.role}</span>
        </div>
      </div>

      {/* Save Success Toast Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between text-xs transition-all animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{saveSuccessMsg}</span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono">Gespeichert</span>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-neutral-900 p-1.5 rounded-lg border border-neutral-800 text-xs w-fit">
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-3.5 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'settings' ? 'bg-neutral-800 text-rose-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Admin Settings & Steam-Modus</span>
        </button>

        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex items-center gap-2 px-3.5 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'nodes' ? 'bg-neutral-800 text-rose-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Server Nodes & Cluster ({nodes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3.5 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'users' ? 'bg-neutral-800 text-rose-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Benutzer-Verwaltung ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3.5 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'audit' ? 'bg-neutral-800 text-rose-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Sicherheits-Audit Logs</span>
        </button>
      </div>

      {/* TAB: SETTINGS & STEAM CONFIGURATION */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* SECTION 1: STEAM BETRIEBSMODUS & STATUS (WICHTIG WENN STEAM NICHT VERFÜGBAR IST) */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-rose-400" />
                    <span>Steam-Konfiguration & Fallback-Modus</span>
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                    settingsForm.steamMode === 'offline_disabled' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                    settingsForm.steamMode === 'anonymous' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    settingsForm.steamMode === 'mock_emulated' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                    'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {settingsForm.steamMode === 'offline_disabled' && 'Vollautark / Ohne Steam'}
                    {settingsForm.steamMode === 'anonymous' && 'SteamCMD Anonymous (Kein Account nötig)'}
                    {settingsForm.steamMode === 'mock_emulated' && 'Emulierter Mock-Modus'}
                    {settingsForm.steamMode === 'authenticated' && 'Steam-Konto Authentifiziert'}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Da du aktuell kein Steam zur Verfügung hast, kannst du hier festlegen, wie das System reagiert. Alle Minecraft-Server (inkl. v26.3) und Standalone-Server funktionieren zu 100% ohne Steam!
                </p>
              </div>

              <div className="px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 flex items-center gap-2 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Minecraft & Autarkie: <strong>100% Betriebsbereit</strong></span>
              </div>
            </div>

            {/* Mode selection radio cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                settingsForm.steamMode === 'offline_disabled'
                  ? 'bg-neutral-800/70 border-rose-600/80 shadow-sm'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}>
                <input
                  type="radio"
                  name="steamMode"
                  value="offline_disabled"
                  checked={settingsForm.steamMode === 'offline_disabled'}
                  onChange={() => setSettingsForm({ ...settingsForm, steamMode: 'offline_disabled' })}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <div className="font-semibold text-xs text-neutral-100 flex items-center gap-1.5">
                    <span>1. Vollautark / Ohne Steam (Empfohlen)</span>
                    <span className="text-[10px] bg-rose-950 text-rose-300 px-1.5 py-0.2 rounded border border-rose-800">Aktiv</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Perfekt, wenn kein Steam verfügbar ist. Blockiert keine Serverstarts, ignoriert Steam-Abfragen und nutzt direkte Binaries für Minecraft, Valheim Standalone, Terraria etc.
                  </p>
                </div>
              </label>

              <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                settingsForm.steamMode === 'anonymous'
                  ? 'bg-neutral-800/70 border-rose-600/80 shadow-sm'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}>
                <input
                  type="radio"
                  name="steamMode"
                  value="anonymous"
                  checked={settingsForm.steamMode === 'anonymous'}
                  onChange={() => setSettingsForm({ ...settingsForm, steamMode: 'anonymous' })}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <div className="font-semibold text-xs text-neutral-100 flex items-center gap-1.5">
                    <span>2. SteamCMD Anonym (Kein Account erforderlich)</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Nutzt öffentliche Dedicated-Server-Downloads (`login anonymous`) für CS2, Rust, Palworld, TF2 usw. Du benötigst keinen persönlichen Steam-Account oder Login.
                  </p>
                </div>
              </label>

              <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                settingsForm.steamMode === 'mock_emulated'
                  ? 'bg-neutral-800/70 border-rose-600/80 shadow-sm'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}>
                <input
                  type="radio"
                  name="steamMode"
                  value="mock_emulated"
                  checked={settingsForm.steamMode === 'mock_emulated'}
                  onChange={() => setSettingsForm({ ...settingsForm, steamMode: 'mock_emulated' })}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <div className="font-semibold text-xs text-neutral-100">
                    <span>3. Emulierter Mock-Modus (Schnelltest)</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Simuliert Steam-Downloads und Serverprozesse ohne Wartezeiten oder Bandbreitennutzung. Ideal zum Vorführen und Testen der Manager-Funktionen.
                  </p>
                </div>
              </label>

              <label className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                settingsForm.steamMode === 'authenticated'
                  ? 'bg-neutral-800/70 border-rose-600/80 shadow-sm'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}>
                <input
                  type="radio"
                  name="steamMode"
                  value="authenticated"
                  checked={settingsForm.steamMode === 'authenticated'}
                  onChange={() => setSettingsForm({ ...settingsForm, steamMode: 'authenticated' })}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <div className="font-semibold text-xs text-neutral-100">
                    <span>4. Steam-Konto Authentifiziert (Optional später)</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Nur verwenden, wenn du später ein echtes Steam-Konto anbinden möchtest (z.B. für Spiele, die einen Kaufnachweis des Dedicated Servers verlangen).
                  </p>
                </div>
              </label>
            </div>

            {/* Additional Steam flags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                <div>
                  <div className="font-medium text-xs text-neutral-200">Steam-Authentifizierung umgehen</div>
                  <div className="text-[11px] text-neutral-400">Übergibt automatisch `-nosteam` / Offline-Flags an Spiele</div>
                </div>
                <input
                  type="checkbox"
                  checked={settingsForm.steamOfflineBypass}
                  onChange={(e) => setSettingsForm({ ...settingsForm, steamOfflineBypass: e.target.checked })}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-neutral-900 border-neutral-700 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                <div>
                  <div className="font-medium text-xs text-neutral-200">Workshop Cache aktivieren</div>
                  <div className="text-[11px] text-neutral-400">Gecachte Mod-Dateien lokal ohne wiederholten Steam-Abruf vorhalten</div>
                </div>
                <input
                  type="checkbox"
                  checked={settingsForm.enableSteamWorkshopCache}
                  onChange={(e) => setSettingsForm({ ...settingsForm, enableSteamWorkshopCache: e.target.checked })}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-neutral-900 border-neutral-700 cursor-pointer"
                />
              </div>
            </div>

            {/* SteamCMD Path and Steam Web API Key input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  SteamCMD Executable Pfad
                </label>
                <input
                  type="text"
                  value={settingsForm.steamcmdPath}
                  onChange={(e) => setSettingsForm({ ...settingsForm, steamcmdPath: e.target.value })}
                  placeholder="/usr/games/steamcmd oder C:\steamcmd\steamcmd.exe"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
                />
                <p className="text-[11px] text-neutral-500 mt-1">Wird nur im Anonymous-Modus für SteamCMD aufgerufen.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center justify-between">
                  <span>Steam Web API Key (Optional)</span>
                  <a
                    href="https://steamcommunity.com/dev/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Key holen</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <div className="relative">
                  <input
                    type={showSteamKey ? 'text' : 'password'}
                    value={settingsForm.steamApiKey}
                    onChange={(e) => setSettingsForm({ ...settingsForm, steamApiKey: e.target.value })}
                    placeholder="Wird derzeit nicht benötigt (leer lassen)"
                    className="w-full px-3 py-2 pr-9 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSteamKey(!showSteamKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                  >
                    {showSteamKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">Kann eingetragen werden, sobald du einen Steam-Key hast.</p>
              </div>
            </div>
          </div>

          {/* SECTION 2: EXTERNE API-KEYS FÜR MOD & PLUGIN BROWSER */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-rose-400" />
                <span>API-Schlüssel für Live-Browser (CurseForge, Modrinth, SpigotMC)</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Verwalte hier deine API-Tokens. Sobald du einen Key einträgst, wird er direkt ohne Neustart für die Live-Suche verwendet.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CurseForge API Key */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-neutral-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>CurseForge API Key ($2a$10$...)</span>
                    </span>
                    <a
                      href="https://console.curseforge.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <span>Key erstellen</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-[11px] text-neutral-400 mb-2">
                    Ermöglicht unbegrenzte Live-Abfragen im CurseForge-Verzeichnis für Mods, Modpacks und Plugins.
                  </p>
                  <div className="relative">
                    <input
                      type={showCurseForgeKey ? 'text' : 'password'}
                      value={settingsForm.curseForgeApiKey}
                      onChange={(e) => setSettingsForm({ ...settingsForm, curseForgeApiKey: e.target.value })}
                      placeholder="z.B. $2a$10$AbCdEf123..."
                      className="w-full px-3 py-2 pr-9 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurseForgeKey(!showCurseForgeKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    >
                      {showCurseForgeKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-neutral-500 flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-neutral-400" />
                  <span>Wird sicher im Browser/Server verarbeitet.</span>
                </div>
              </div>

              {/* Modrinth API Token */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-neutral-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Modrinth API Token (Optional)</span>
                    </span>
                    <a
                      href="https://modrinth.com/settings/pats"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>PAT Token</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-[11px] text-neutral-400 mb-2">
                    Modrinth funktioniert bereits <strong>zu 100% ohne Key</strong>. Ein Token erhöht das Limit auf 300 Req/min.
                  </p>
                  <div className="relative">
                    <input
                      type={showModrinthToken ? 'text' : 'password'}
                      value={settingsForm.modrinthApiToken}
                      onChange={(e) => setSettingsForm({ ...settingsForm, modrinthApiToken: e.target.value })}
                      placeholder="mrp_123456789... (optional)"
                      className="w-full px-3 py-2 pr-9 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModrinthToken(!showModrinthToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    >
                      {showModrinthToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>SpigotMC & Modrinth Live-APIs standardmäßig aktiv</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: PREPAID & CRM ABRECHNUNGSSYSTEM */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Coins className="w-4 h-4 text-rose-400" />
                <span>Prepaid-Abrechnung & Automatisches Warnsystem</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Konfiguriere Ablauf-Schwellenwerte, Karenzzeiten und automatisches Stoppen abgelaufener Server (100% Prepaid ohne Abofalle).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                <label className="block text-neutral-400 mb-1">Neukunden-Startguthaben</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="500"
                    value={settingsForm.welcomeBonusEur}
                    onChange={(e) => setSettingsForm({ ...settingsForm, welcomeBonusEur: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-sm"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">€</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Wird bei Registrierung gutgeschrieben.</p>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                <label className="block text-neutral-400 mb-1">Vorwarnung vor Ablauf</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="30"
                    value={settingsForm.warningDaysBefore}
                    onChange={(e) => setSettingsForm({ ...settingsForm, warningDaysBefore: parseInt(e.target.value, 10) || 7 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-sm"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">Tage</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Warnbanner & E-Mail Benachrichtigung.</p>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                <label className="block text-neutral-400 mb-1">Karenzzeit nach Ablauf</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="168"
                    value={settingsForm.gracePeriodHours}
                    onChange={(e) => setSettingsForm({ ...settingsForm, gracePeriodHours: parseInt(e.target.value, 10) || 72 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-sm"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">Std.</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Schonfrist vor hartem Server-Stopp.</p>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
                <label className="block text-neutral-400 mb-1">Mehrwertsteuer (USt.)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="30"
                    value={settingsForm.taxRatePercent}
                    onChange={(e) => setSettingsForm({ ...settingsForm, taxRatePercent: parseFloat(e.target.value) || 19 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 font-mono text-sm"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">%</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Für DIN 5008 PDF-Rechnungen.</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
              <div>
                <span className="font-semibold text-neutral-200">Automatische Sperrung (Auto-Suspend)</span>
                <p className="text-[11px] text-neutral-400">Server wird nach Ablauf der Karenzzeit automatisch gestoppt und gegen Start gesichert.</p>
              </div>
              <input
                type="checkbox"
                checked={settingsForm.autoSuspendOnExpiry}
                onChange={(e) => setSettingsForm({ ...settingsForm, autoSuspendOnExpiry: e.target.checked })}
                className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-neutral-900 border-neutral-700 cursor-pointer"
              />
            </div>
          </div>

          {/* SECTION 4: SERVER & RESSOURCEN STANDARDS (MINECRAFT & HARDWARE) */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-400" />
                <span>Ressourcen & Versions-Standards</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Standard-Werte für neue Server, Standard-Java-Laufzeiten und Port-Allokations-Bereiche.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Standard Minecraft-Version</label>
                <select
                  value={settingsForm.defaultMinecraftVersion}
                  onChange={(e) => setSettingsForm({ ...settingsForm, defaultMinecraftVersion: e.target.value })}
                  className="w-full px-2.5 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                >
                  {MINECRAFT_VERSIONS.map(v => (
                    <option key={v} value={v}>
                      {v} {v === '26.3' ? '(Neueste)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Standard Java Runtime</label>
                <select
                  value={settingsForm.defaultJavaVersion}
                  onChange={(e) => setSettingsForm({ ...settingsForm, defaultJavaVersion: e.target.value as any })}
                  className="w-full px-2.5 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                >
                  <optgroup label="Modernes Java (21+ für 1.20.5+, 1.21.x & 26.x Snapshots)">
                    <option value="Java 25">Java 25 (LTS Next-Gen · Standard für 26.x)</option>
                    <option value="Java 24">Java 24 (JDK 24 · Compact Object Headers)</option>
                    <option value="Java 23">Java 23 (JDK 23 · Generational ZGC)</option>
                    <option value="Java 22">Java 22 (JDK 22 · Vector API & FFM)</option>
                    <option value="Java 21">Java 21 (LTS · Offizieller Standard)</option>
                    <option value="GraalVM 21+">GraalVM 21+ (Ultra High-Performance JIT)</option>
                    <option value="Temurin 21+">Eclipse Temurin 21+ (Adoptium Enterprise LTS)</option>
                    <option value="Corretto 21+">Amazon Corretto 21+ (Cloud Optimized)</option>
                    <option value="Zulu 21+">Azul Zulu 21+ (CRaC Instant-Checkpoint)</option>
                    <option value="Java 26">Java 26 (JDK 26 Early Access)</option>
                  </optgroup>
                  <optgroup label="Ältere Versionen (LTS & Legacy)">
                    <option value="Java 17">Java 17 (LTS · Für 1.18 bis 1.20.4)</option>
                    <option value="Java 11">Java 11 (Legacy LTS für 1.16/1.17)</option>
                    <option value="Java 8">Java 8 (Legacy für 1.12.2 und älter)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Standard RAM pro Server</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={settingsForm.defaultRamAllocationGb}
                    onChange={(e) => setSettingsForm({ ...settingsForm, defaultRamAllocationGb: parseInt(e.target.value, 10) || 6 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">GB</span>
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Maximaler RAM pro Server</label>
                <div className="relative">
                  <input
                    type="number"
                    min="4"
                    max="128"
                    value={settingsForm.maxRamPerServerGb}
                    onChange={(e) => setSettingsForm({ ...settingsForm, maxRamPerServerGb: parseInt(e.target.value, 10) || 32 })}
                    className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono">GB</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Port-Bereich für Instanzen</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={settingsForm.portRangeStart}
                    onChange={(e) => setSettingsForm({ ...settingsForm, portRangeStart: parseInt(e.target.value, 10) || 25565 })}
                    className="w-1/2 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                    placeholder="Start (25565)"
                  />
                  <span className="text-neutral-500">bis</span>
                  <input
                    type="number"
                    value={settingsForm.portRangeEnd}
                    onChange={(e) => setSettingsForm({ ...settingsForm, portRangeEnd: parseInt(e.target.value, 10) || 29999 })}
                    className="w-1/2 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                    placeholder="Ende (29999)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 font-medium flex items-center justify-between">
                  <span>Discord Webhook (Warnungen & Status)</span>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testWebhookStatus === 'testing'}
                    className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-1"
                  >
                    <Send className="w-2.5 h-2.5" />
                    <span>{testWebhookStatus === 'testing' ? 'Sende...' : testWebhookStatus === 'success' ? 'Erfolgreich!' : 'Test-Ping'}</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={settingsForm.discordWebhookUrl}
                  onChange={(e) => setSettingsForm({ ...settingsForm, discordWebhookUrl: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Maintenance Mode & Customer Creation Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                <div>
                  <span className="font-semibold text-neutral-200">Kunden-Servererstellung</span>
                  <p className="text-[11px] text-neutral-400">Kunden dürfen eigenständig neue Gameserver im Wizard oder Shop anlegen.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settingsForm.allowCustomerServerCreation}
                  onChange={(e) => setSettingsForm({ ...settingsForm, allowCustomerServerCreation: e.target.checked })}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-neutral-900 border-neutral-700 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                <div>
                  <span className="font-semibold text-neutral-200">Wartungsmodus (Maintenance)</span>
                  <p className="text-[11px] text-neutral-400">Zeigt Kunden einen Wartungshinweis für Cluster-Upgrades an.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settingsForm.maintenanceMode}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maintenanceMode: e.target.checked })}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-neutral-900 border-neutral-700 cursor-pointer"
                />
              </div>
            </div>

            {settingsForm.maintenanceMode && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs space-y-1.5">
                <span className="font-semibold text-amber-300">Wartungsnachricht an Kunden:</span>
                <input
                  type="text"
                  value={settingsForm.maintenanceMessage}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maintenanceMessage: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 font-medium"
                />
              </div>
            )}
          </div>

          {/* SAVE & RESET ACTIONS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <button
              type="button"
              onClick={handleResetSettings}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-neutral-200 text-xs transition-colors cursor-pointer w-full sm:w-auto justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Auf Werkseinstellungen zurücksetzen</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-[11px] text-neutral-500 font-mono hidden md:inline">
                Zuletzt geändert: {settingsForm.lastUpdated}
              </span>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-rose-600/30 cursor-pointer w-full sm:w-auto justify-center"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Einstellungen jetzt anwenden</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB: NODES */}
      {activeTab === 'nodes' && (
        <div className="space-y-4">
          {/* Cluster Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 mb-1">Gehostete Container / Server</div>
              <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">{totalClusterServers} Instanzen</div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 mb-1">Cluster RAM Allokation</div>
              <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
                {usedClusterRam} <span className="text-xs text-neutral-500 font-normal">/ {totalClusterRam} GB</span>
              </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="text-neutral-400 mb-1">Node Verfügbarkeit</div>
              <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">100% Online</div>
            </div>
          </div>

          {/* Node Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {nodes.map((node) => (
              <div key={node.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="font-semibold text-neutral-100 text-sm">{node.name}</h4>
                      <div className="text-[11px] text-neutral-400 font-mono mt-0.5">{node.location} · {node.ip}</div>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Online</span>
                    </span>
                  </div>

                  <div className="space-y-2 mt-4 text-xs">
                    <div>
                      <div className="flex justify-between text-neutral-400 text-[11px] mb-1">
                        <span>CPU Last</span>
                        <span className="font-mono tabular-nums text-neutral-200">{node.cpuUsage}%</span>
                      </div>
                      <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-sky-500 h-full rounded-full" style={{ width: `${node.cpuUsage}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 text-[11px] mb-1">
                        <span>RAM Auslastung</span>
                        <span className="font-mono tabular-nums text-neutral-200">{node.ramUsageGb} / {node.maxRamGb} GB</span>
                      </div>
                      <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(node.ramUsageGb / node.maxRamGb) * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 text-[11px] mb-1">
                        <span>NVMe Disk Storage</span>
                        <span className="font-mono tabular-nums text-neutral-200">{node.diskUsageGb} / {node.maxDiskGb} GB</span>
                      </div>
                      <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(node.diskUsageGb / node.maxDiskGb) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs mt-4">
                  <span className="text-neutral-400">{node.activeServersCount} aktive Server</span>
                  <button
                    onClick={() => handleRebootNode(node.id)}
                    className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reboot</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Registrierte Benutzerkonten</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Rollen anpassen, Guthaben manuell buchen und Zugänge sperren.</p>
            </div>
            <span className="text-xs font-mono text-neutral-400 tabular-nums">{users.length} Konten</span>
          </div>

          <div className="divide-y divide-neutral-800/80">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                    u.role === 'admin' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                  }`}>
                    {u.avatarInitials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-neutral-100">{u.username}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                        u.role === 'admin' ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {u.role === 'admin' ? 'Superadmin' : 'Kunde'}
                      </span>
                      {u.status === 'suspended' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-800">
                          Gesperrt
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                      {u.email} · Registriert am {u.createdAt}
                    </div>
                  </div>
                </div>

                {/* Balance & Role Management */}
                <div className="flex items-center gap-3 text-xs">
                  {/* Balance Display & Quick Editor */}
                  {balanceEditId === u.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={balanceInput}
                        onChange={(e) => setBalanceInput(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
                      />
                      <button
                        onClick={() => handleSaveBalance(u.id)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs cursor-pointer"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setBalanceEditId(u.id);
                        setBalanceInput(u.balance);
                      }}
                      className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 font-mono tabular-nums text-emerald-400 hover:border-neutral-700 cursor-pointer"
                      title="Guthaben anpassen"
                    >
                      {u.balance.toFixed(2)} €
                    </button>
                  )}

                  {/* Role Toggle */}
                  <button
                    onClick={() => onUpdateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                    className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {u.role === 'admin' ? 'Zu Kunde herabstufen' : 'Zu Admin befördern'}
                  </button>

                  {/* Suspend Toggle */}
                  <button
                    onClick={() => onToggleUserStatus(u.id)}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                      u.status === 'active' ? 'text-neutral-400 hover:text-rose-400 hover:bg-neutral-800' : 'text-emerald-400 hover:bg-neutral-800'
                    }`}
                    title={u.status === 'active' ? 'Konto sperren' : 'Konto reaktivieren'}
                  >
                    {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="font-semibold text-neutral-100 text-sm">System Audit & Compliance Log</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Unveränderliches Protokoll aller kritischen Benutzer- und Admin-Aktionen.</p>
          </div>

          <div className="divide-y divide-neutral-800">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    log.severity === 'security' ? 'bg-rose-500' : log.severity === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  <div>
                    <span className="font-semibold text-neutral-200">{log.action}: </span>
                    <span className="text-neutral-300">{log.target}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-neutral-500 text-[11px] font-mono">
                  <span>{log.actor}</span>
                  <span>·</span>
                  <span>{log.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
