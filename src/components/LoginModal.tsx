import React, { useState } from 'react';
import { X, User, Lock, Mail, Shield, Check, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { UserAccount } from '../types/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  currentUser: UserAccount;
  onSelectUser: (user: UserAccount) => void;
  onRegisterUser: (username: string, email: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onSelectUser,
  onRegisterUser
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'login' | 'register'>('switch');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase() || u.username.toLowerCase() === emailInput.toLowerCase());
    if (found) {
      onSelectUser(found);
      onClose();
    } else {
      alert('Kein Benutzer mit dieser E-Mail / diesem Benutzernamen gefunden. Wähle "Schnell-Wechsel" oder erstelle ein Konto!');
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newEmail.trim()) return;
    onRegisterUser(newUsername.trim(), newEmail.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span>Authentifizierung & Benutzer-Rollen</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Wechsle zwischen Administrator und Kunden-Konto oder melde dich an.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800/80 text-xs">
          <button
            onClick={() => setActiveTab('switch')}
            className={`flex-1 py-1.5 font-medium rounded-md transition-colors cursor-pointer text-center ${
              activeTab === 'switch' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
            }`}
          >
            1-Klick Rollenwechsel
          </button>
          <button
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-1.5 font-medium rounded-md transition-colors cursor-pointer text-center ${
              activeTab === 'login' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`flex-1 py-1.5 font-medium rounded-md transition-colors cursor-pointer text-center ${
              activeTab === 'register' ? 'bg-neutral-800 text-emerald-400 font-semibold' : 'text-neutral-400'
            }`}
          >
            Registrieren
          </button>
        </div>

        {/* Tab 1: Fast Switch */}
        {activeTab === 'switch' && (
          <div className="space-y-3">
            <div className="text-xs text-neutral-400">
              Wähle ein vorkonfiguriertes Test-Profil, um die Admin- oder User-Funktionen direkt auszuprobieren:
            </div>

            <div className="space-y-2">
              {users.map((u) => {
                const isCurrent = u.id === currentUser.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSelectUser(u);
                      onClose();
                    }}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-neutral-800/90 border-emerald-500/80 shadow-sm'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/60'
                    }`}
                  >
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
                            {u.role === 'admin' ? 'Admin' : 'Kunde'}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                          {u.email} · {u.balance.toFixed(2)} € Guthaben
                        </div>
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <Check className="w-4 h-4" />
                        <span>Aktiv</span>
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500 flex items-center gap-1 group-hover:text-neutral-300">
                        <span>Auswählen</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Standard Login */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">E-Mail oder Benutzername</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="admin@apexhost.cloud oder Dominik..."
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Passwort</label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-4 h-4" />
              <span>Anmelden</span>
            </button>
          </form>
        )}

        {/* Tab 3: Register */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Gewünschter Benutzername</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="z. B. CraftMaster99"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">E-Mail-Adresse</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@beispiel.de"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="p-2.5 rounded bg-neutral-950 border border-neutral-800 text-[11px] text-emerald-400">
              🎁 <strong>Willkommens-Bonus:</strong> Neue Konten erhalten automatisch 25.00 € Startguthaben zum Testen des Shopsystems!
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>Konto erstellen</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
