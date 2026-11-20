import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Plus, Trash2, AlertCircle, Ban, RotateCw } from 'lucide-react';
import { ServerInstance, PlayerInfo } from '../types/game';
import { apiRequest } from '../services/api';

interface PlayerManagerProps {
  server: ServerInstance;
  onKickPlayer: (username: string) => void;
  onBanPlayer: (username: string) => void;
  onToggleOp: (username: string) => void;
  onNotify?: (msg: string) => void;
}

interface BannedEntry {
  name: string;
  reason?: string;
  created?: string;
}

export const PlayerManager: React.FC<PlayerManagerProps> = ({
  server,
  onNotify
}) => {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [ops, setOps] = useState<{ name: string; level?: number }[]>([]);
  const [banned, setBanned] = useState<BannedEntry[]>([]);
  const [whitelistActive, setWhitelistActive] = useState(false);
  const [newWhitelistUser, setNewWhitelistUser] = useState('');
  const [manualActionUser, setManualActionUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPlayers = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await apiRequest(`/api/servers/${server.id}/players`);
      setPlayers(Array.isArray(data.onlinePlayers) ? data.onlinePlayers : []);
      setWhitelist(Array.isArray(data.whitelist) ? data.whitelist : []);
      setOps(Array.isArray(data.ops) ? data.ops : []);
      setBanned(Array.isArray(data.banned) ? data.banned : []);
      setWhitelistActive(Boolean(data.whitelistEnabled));
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Spielerdaten konnten nicht vom Server geladen werden.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadPlayers(true);
    const timer = setInterval(() => {
      loadPlayers(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [loadPlayers]);

  const handleToggleWhitelistEnabled = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const next = !whitelistActive;
      await apiRequest(`/api/servers/${server.id}/players/whitelist`, 'POST', {
        action: 'toggle',
        enabled: next
      });
      setWhitelistActive(next);
      onNotify?.(`Whitelist ${next ? 'aktiviert' : 'deaktiviert'}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Fehler beim Umschalten der Whitelist.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newWhitelistUser.trim();
    if (!clean) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/players/whitelist`, 'POST', {
        action: 'add',
        username: clean
      });
      setWhitelist(Array.isArray(res.whitelist) ? res.whitelist : whitelist);
      setNewWhitelistUser('');
      onNotify?.(`"${clean}" zur Whitelist hinzugefügt.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Spieler konnte nicht hinzugefügt werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveWhitelist = async (user: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/players/whitelist`, 'POST', {
        action: 'remove',
        username: user
      });
      setWhitelist(Array.isArray(res.whitelist) ? res.whitelist : whitelist.filter(u => u !== user));
      onNotify?.(`"${user}" von der Whitelist entfernt.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Spieler konnte nicht entfernt werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpToggle = async (username: string, currentlyOp: boolean) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/servers/${server.id}/players/op`, 'POST', {
        username,
        op: !currentlyOp
      });
      await loadPlayers(false);
      onNotify?.(!currentlyOp ? `OP-Rechte an "${username}" vergeben.` : `OP-Rechte von "${username}" entzogen.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'OP-Status konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (username: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/servers/${server.id}/players/kick`, 'POST', { username });
      await loadPlayers(false);
      onNotify?.(`"${username}" wurde vom Server gekickt.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Kick fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleBan = async (username: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/servers/${server.id}/players/ban`, 'POST', {
        action: 'ban',
        username
      });
      await loadPlayers(false);
      onNotify?.(`"${username}" wurde dauerhaft gebannt.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Ban fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnban = async (username: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/servers/${server.id}/players/ban`, 'POST', {
        action: 'unban',
        username
      });
      await loadPlayers(false);
      onNotify?.(`"${username}" wurde entbannt.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Entbannen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Online Players & Ban Moderation Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-neutral-100 text-sm">Aktuell verbundene Spieler</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono tabular-nums text-neutral-400">
                  {players.length} / {server.maxPlayers} Online
                </span>
                <button
                  onClick={() => loadPlayers(true)}
                  disabled={loading}
                  className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                  title="Spielerliste aktualisieren"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {server.status !== 'running' ? (
              <div className="p-8 text-center text-neutral-500 text-xs">
                Der Server ist derzeit offline. Starte den Server, um live verbundene Spieler zu verwalten (Whitelist, OP & Bannlisten sind auch offline bearbeitbar).
              </div>
            ) : players.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-xs">
                Aktuell sind keine Spieler auf diesem Server verbunden.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/80">
                {players.map((p) => (
                  <div key={p.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs text-neutral-200">
                        {p.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-xs text-neutral-100">{p.username}</span>
                          {p.isOp && (
                            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-0.5">
                              <Shield className="w-3 h-3 fill-amber-400/20" />
                              <span>Admin/OP</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5 font-mono">
                          <span className="tabular-nums">{p.pingMs} ms</span>
                          <span className="text-neutral-600">·</span>
                          <span>{p.joinedAt}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => handleOpToggle(p.username, p.isOp)}
                        className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                          p.isOp ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {p.isOp ? 'OP entziehen' : 'OP geben'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleKick(p.username)}
                        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Kicken
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleBan(p.username)}
                        className="px-2 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Bannen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct Moderation / OP & Banned Players List */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" />
                <span>Operatoren & Gebannte Spieler ({banned.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualActionUser}
                  onChange={(e) => setManualActionUser(e.target.value)}
                  placeholder="Spielername..."
                  className="px-2.5 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  disabled={busy || !manualActionUser.trim()}
                  onClick={() => {
                    const u = manualActionUser.trim();
                    setManualActionUser('');
                    handleOpToggle(u, ops.some(o => o.name.toLowerCase() === u.toLowerCase()));
                  }}
                  className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-white rounded text-xs font-medium cursor-pointer"
                >
                  OP setzen
                </button>
                <button
                  type="button"
                  disabled={busy || !manualActionUser.trim()}
                  onClick={() => {
                    const u = manualActionUser.trim();
                    setManualActionUser('');
                    handleBan(u);
                  }}
                  className="px-2.5 py-1 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white rounded text-xs font-medium cursor-pointer"
                >
                  Bannen
                </button>
              </div>
            </div>

            {ops.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ops.map(o => (
                  <span key={o.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 border border-amber-800/60 text-amber-200 text-xs font-mono">
                    <Shield className="w-3 h-3 text-amber-400" />
                    <span>{o.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleOpToggle(o.name, true)}
                      className="text-amber-400 hover:text-rose-300 ml-1 cursor-pointer"
                      title="OP entziehen"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {banned.length === 0 ? (
              <div className="text-xs text-neutral-500 py-2">Keine Spieler auf der Bannliste (`banned-players.json`).</div>
            ) : (
              <div className="space-y-1.5">
                {banned.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800 text-xs">
                    <div>
                      <span className="font-mono text-rose-300 font-semibold">{entry.name}</span>
                      {entry.reason && <span className="text-neutral-500 ml-2">({entry.reason})</span>}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleUnban(entry.name)}
                      className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-emerald-700 text-neutral-200 text-xs cursor-pointer transition-colors"
                    >
                      Entbannen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Whitelist Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-100 text-sm">Zugangs-Whitelist</h3>
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleWhitelistEnabled}
                className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                  whitelistActive
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {whitelistActive ? 'Whitelist Aktiv' : 'Inaktiv (Frei)'}
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Speichert direkt in <code className="font-mono text-neutral-300">whitelist.json</code> &amp; <code className="font-mono text-neutral-300">server.properties</code>.
            </p>

            {/* Add form */}
            <form onSubmit={handleAddWhitelist} className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newWhitelistUser}
                onChange={(e) => setNewWhitelistUser(e.target.value)}
                placeholder="Spielername..."
                className="flex-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Whitelist users */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {whitelist.length === 0 ? (
                <div className="text-xs text-neutral-500 py-3 text-center">Keine Einträge in `whitelist.json`.</div>
              ) : (
                whitelist.map((user) => (
                  <div key={user} className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800/80 text-xs">
                    <span className="font-mono text-neutral-300">{user}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemoveWhitelist(user)}
                      className="text-neutral-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                      title="Von Whitelist entfernen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800 text-[11px] text-neutral-500 mt-4">
            Änderungen werden auf dem Host gespeichert und an laufende Prozesse weitergeleitet.
          </div>
        </div>
      </div>
    </div>
  );
};
