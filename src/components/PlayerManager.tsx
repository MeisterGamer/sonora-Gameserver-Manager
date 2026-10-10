import React, { useState } from 'react';
import { Users, UserX, Shield, ShieldAlert, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { ServerInstance, PlayerInfo } from '../types/game';

interface PlayerManagerProps {
  server: ServerInstance;
  onKickPlayer: (username: string) => void;
  onBanPlayer: (username: string) => void;
  onToggleOp: (username: string) => void;
}

export const PlayerManager: React.FC<PlayerManagerProps> = ({
  server,
  onKickPlayer,
  onBanPlayer,
  onToggleOp
}) => {
  // Sample realistic online players based on server state
  const [players, setPlayers] = useState<PlayerInfo[]>([
    {
      id: 'p1',
      username: 'GamerAlex',
      pingMs: 24,
      ip: '192.168.1.104',
      joinedAt: 'vor 42 Min',
      isOp: true,
      isWhitelisted: true
    },
    {
      id: 'p2',
      username: 'ShadowCrafter',
      pingMs: 38,
      ip: '84.115.42.12',
      joinedAt: 'vor 1 Std 15 Min',
      isOp: false,
      isWhitelisted: true
    },
    {
      id: 'p3',
      username: 'NordicViking',
      pingMs: 19,
      ip: '178.62.90.4',
      joinedAt: 'vor 22 Min',
      isOp: false,
      isWhitelisted: true
    },
    {
      id: 'p4',
      username: 'PixelExplorer',
      pingMs: 52,
      ip: '93.184.216.34',
      joinedAt: 'vor 5 Min',
      isOp: false,
      isWhitelisted: true
    }
  ]);

  const [whitelist, setWhitelist] = useState<string[]>([
    'GamerAlex',
    'ShadowCrafter',
    'NordicViking',
    'PixelExplorer',
    'AdminDave'
  ]);
  const [newWhitelistUser, setNewWhitelistUser] = useState('');
  const [whitelistActive, setWhitelistActive] = useState(false);

  const handleAddWhitelist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelistUser.trim()) return;
    if (!whitelist.includes(newWhitelistUser.trim())) {
      setWhitelist([...whitelist, newWhitelistUser.trim()]);
    }
    setNewWhitelistUser('');
  };

  const handleRemoveWhitelist = (user: string) => {
    setWhitelist(whitelist.filter(u => u !== user));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Online Players Table */}
      <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-neutral-100 text-sm">Aktuell verbundene Spieler</h3>
          </div>
          <span className="text-xs font-mono tabular-nums text-neutral-400">
            {players.length} / {server.maxPlayers} Online
          </span>
        </div>

        {server.status !== 'running' ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Der Server ist derzeit offline. Starte den Server, um verbundene Spieler zu sehen.
          </div>
        ) : players.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            Keine Spieler online.
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
                      <span>{p.ip}</span>
                      <span className="text-neutral-600">·</span>
                      <span>{p.joinedAt}</span>
                    </div>
                  </div>
                </div>

                {/* Player Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setPlayers(players.map(item => item.id === p.id ? { ...item, isOp: !item.isOp } : item));
                      onToggleOp(p.username);
                    }}
                    className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      p.isOp ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                    title={p.isOp ? 'Rechte entziehen' : 'Admin/OP Rechte geben'}
                  >
                    {p.isOp ? 'Entziehen' : 'OP geben'}
                  </button>
                  <button
                    onClick={() => {
                      setPlayers(players.filter(item => item.id !== p.id));
                      onKickPlayer(p.username);
                    }}
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs transition-colors cursor-pointer"
                    title="Spieler vom Server kicken"
                  >
                    Kicken
                  </button>
                  <button
                    onClick={() => {
                      setPlayers(players.filter(item => item.id !== p.id));
                      onBanPlayer(p.username);
                    }}
                    className="px-2 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs transition-colors cursor-pointer"
                    title="Spieler dauerhaft bannen"
                  >
                    Bannen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Whitelist Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-neutral-100 text-sm">Zugangs-Whitelist</h3>
            <button
              onClick={() => setWhitelistActive(!whitelistActive)}
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
            Wenn aktiv, können nur autorisierte Spieler den Server betreten.
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
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Whitelist users */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {whitelist.map((user) => (
              <div key={user} className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800/80 text-xs">
                <span className="font-mono text-neutral-300">{user}</span>
                <button
                  onClick={() => handleRemoveWhitelist(user)}
                  className="text-neutral-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                  title="Von Whitelist entfernen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-800 text-[11px] text-neutral-500">
          Änderungen werden über RCON synchronisiert.
        </div>
      </div>
    </div>
  );
};
