import React, { useState } from 'react';
import { User, Shield, Key, Users, Plus, Trash2, Check, Lock, Copy, RefreshCw } from 'lucide-react';
import { UserAccount, SubUser, PermissionKey } from '../types/auth';
import { ServerInstance } from '../types/game';

interface UserControlViewProps {
  currentUser: UserAccount;
  servers: ServerInstance[];
  subUsers: SubUser[];
  onAddSubUser: (subuser: Omit<SubUser, 'id' | 'addedAt'>) => void;
  onRemoveSubUser: (id: string) => void;
  onToggle2FA: () => void;
  onRegenerateApiToken: () => void;
}

export const UserControlView: React.FC<UserControlViewProps> = ({
  currentUser,
  servers,
  subUsers,
  onAddSubUser,
  onRemoveSubUser,
  onToggle2FA,
  onRegenerateApiToken
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'subusers' | 'api'>('subusers');
  const [copiedToken, setCopiedToken] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // New SubUser modal state
  const [showAddSubUserModal, setShowAddSubUserModal] = useState(false);
  const [subUsername, setSubUsername] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subServerId, setSubServerId] = useState(servers[0]?.id || '');
  const [selectedPerms, setSelectedPerms] = useState<PermissionKey[]>([
    'console_read',
    'console_write',
    'power_control'
  ]);

  const allPermissions: { key: PermissionKey; label: string; desc: string }[] = [
    { key: 'console_read', label: 'Konsole ansehen', desc: 'Darf Live-Serverlogs einsehen' },
    { key: 'console_write', label: 'Befehle senden', desc: 'Darf RCON- und Spielbefehle ausführen' },
    { key: 'power_control', label: 'Start / Stopp / Neustart', desc: 'Darf Server hoch- und herunterfahren' },
    { key: 'files_edit', label: 'Dateien & Konfiguration', desc: 'Darf server.properties und Konfigurationen ändern' },
    { key: 'mods_manage', label: 'Mods & Plugins verwalten', desc: 'Darf Erweiterungen installieren und entfernen' },
    { key: 'backups_manage', label: 'Backups erstellen', desc: 'Darf Snapshots anlegen und wiederherstellen' }
  ];

  const handleTogglePerm = (key: PermissionKey) => {
    if (selectedPerms.includes(key)) {
      setSelectedPerms(selectedPerms.filter(k => k !== key));
    } else {
      setSelectedPerms([...selectedPerms, key]);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subUsername.trim() || !subEmail.trim() || !subServerId) return;

    const targetServer = servers.find(s => s.id === subServerId);
    onAddSubUser({
      username: subUsername.trim(),
      email: subEmail.trim(),
      serverId: subServerId,
      serverName: targetServer?.name || 'Gameserver',
      permissions: selectedPerms
    });

    setSubUsername('');
    setSubEmail('');
    setShowAddSubUserModal(false);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(currentUser.apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center font-bold text-base text-emerald-400">
            {currentUser.avatarInitials}
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <span>Benutzer-Dashboard & Einstellungen: {currentUser.username}</span>
            </h2>
            <div className="text-xs text-neutral-400 mt-0.5">
              {currentUser.email} · Rolle: <span className="capitalize text-neutral-200">{currentUser.role}</span> · Guthaben: <span className="font-mono text-emerald-400">{currentUser.balance.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowAddSubUserModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Teammitglied / Sub-User einladen</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs w-fit">
        <button
          onClick={() => setActiveTab('subusers')}
          className={`flex items-center gap-2 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'subusers' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Sub-User & Team-Rechte ({subUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'profile' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Sicherheit & 2-Faktor</span>
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`flex items-center gap-2 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'api' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>API Tokens (Node.js 24)</span>
        </button>
      </div>

      {/* Tab 1: Sub-Users (Co-Management) */}
      {activeTab === 'subusers' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Berechtigte Team-Mitglieder (Sub-User)</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Erlaube Freunden oder Moderatoren den Zugriff auf bestimmte Server ohne Weitergabe deines Haupt-Passworts.
              </p>
            </div>
            <span className="text-xs font-mono text-neutral-400 tabular-nums">{subUsers.length} Sub-User</span>
          </div>

          {subUsers.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-xs">
              Es sind derzeit keine Team-Mitglieder eingerichtet. Klicke oben auf "Sub-User einladen".
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {subUsers.map((sub) => (
                <div key={sub.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-neutral-200">{sub.username}</span>
                      <span className="text-xs font-mono text-neutral-400">({sub.email})</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-950 text-emerald-400 border border-neutral-800">
                        Server: {sub.serverName}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sub.permissions.map((p) => (
                        <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-300 border border-neutral-800/80">
                          {p.replace('_', '.')}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRemoveSubUser(sub.id)}
                      className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Zugriff entziehen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Profile & 2FA */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Zwei-Faktor-Authentifizierung (2FA)</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Schütze dein Gameserver-Konto mit einer Authenticator-App (Google Authenticator, Authy, 1Password) vor unbefugtem Zugriff.
            </p>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Status: {currentUser.twoFactorEnabled ? <strong className="text-emerald-400">Aktiviert</strong> : <span className="text-neutral-500">Deaktiviert</span>}
              </span>
              <button
                onClick={onToggle2FA}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  currentUser.twoFactorEnabled
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {currentUser.twoFactorEnabled ? '2FA deaktivieren' : '2FA jetzt aktivieren'}
              </button>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Passwort ändern</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Verwende ein sicheres, mindestens 12-stelliges Kennwort für deinen Zugang.
            </p>

            <div className="space-y-2 text-xs">
              <input
                type="password"
                placeholder="Aktuelles Passwort"
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
              />
              <input
                type="password"
                placeholder="Neues Passwort"
                className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPasswordSuccess(true)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded cursor-pointer transition-colors"
                >
                  Passwort speichern
                </button>
                {passwordSuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Passwort erfolgreich aktualisiert
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: API Tokens */}
      {activeTab === 'api' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>REST API & Node.js 24 Automation Token</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Verbinde Discord-Bots, Webhooks oder CI/CD-Pipelines direkt mit deinem Server-Cluster.
              </p>
            </div>

            <button
              onClick={onRegenerateApiToken}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Neuen Token generieren</span>
            </button>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 font-mono text-xs flex items-center justify-between gap-3">
            <span className="text-emerald-400 truncate select-all">{currentUser.apiToken}</span>
            <button
              onClick={handleCopyToken}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 shrink-0 cursor-pointer"
            >
              {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedToken ? 'Kopiert' : 'Kopieren'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Add SubUser Modal */}
      {showAddSubUserModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-neutral-100 text-sm">Teammitglied / Sub-User einladen</h3>
              <button onClick={() => setShowAddSubUserModal(false)} className="text-neutral-400 hover:text-neutral-200">✕</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">Benutzername</label>
                <input
                  type="text"
                  required
                  value={subUsername}
                  onChange={(e) => setSubUsername(e.target.value)}
                  placeholder="z. B. ServerAdmin_Max"
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">E-Mail</label>
                <input
                  type="email"
                  required
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="max@gaming.de"
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">Server zuweisen</label>
                <select
                  value={subServerId}
                  onChange={(e) => setSubServerId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.gameName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">Granulare Berechtigungen</label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {allPermissions.map((perm) => (
                    <label key={perm.key} className="flex items-start gap-2 p-1.5 rounded hover:bg-neutral-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPerms.includes(perm.key)}
                        onChange={() => handleTogglePerm(perm.key)}
                        className="accent-emerald-500 mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-neutral-200">{perm.label}</div>
                        <div className="text-[11px] text-neutral-500">{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSubUserModal(false)}
                  className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded"
                >
                  Einladung versenden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
