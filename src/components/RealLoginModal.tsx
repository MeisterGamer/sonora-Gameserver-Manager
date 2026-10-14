import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types/auth';
import { apiRequest, setStoredAuthToken } from '../services/api';
import { Shield, KeyRound, Eye, EyeOff, Sparkles, CheckCircle2, AlertTriangle, X, Lock, Terminal } from 'lucide-react';

interface Props {
  isOpen: boolean; 
  onClose: () => void; 
  users: UserAccount[]; 
  currentUser: UserAccount;
  onSelectUser: (user: UserAccount) => void; 
  onRegisterUser: (username: string, email: string) => void;
}

export function LoginModal({ isOpen, onClose, currentUser, onSelectUser }: Props) {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [isChangePasswordMode, setIsChangePasswordMode] = useState(false);
  const [username, setUsername] = useState('Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Check backend auth status on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError('');
    setSuccessMsg('');
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setIsInitialized(data.initialized);
          if (data.username) {
            setUsername(data.username);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setIsInitialized(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Password rules validation helper
  const checkPasswordRules = (pwd: string) => {
    return {
      length: pwd.length >= 10,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
    };
  };

  const rules = checkPasswordRules(password);
  const allRulesPassed = rules.length && rules.upper && rules.lower && rules.number && rules.special;

  // Generate strong random password conforming to all security rules
  const handleGeneratePassword = () => {
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowers = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const specials = '!@#$%&*';
    const all = uppers + lowers + numbers + specials;

    let res = [
      uppers[Math.floor(Math.random() * uppers.length)],
      lowers[Math.floor(Math.random() * lowers.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      specials[Math.floor(Math.random() * specials.length)]
    ];

    for (let i = 4; i < 16; i++) {
      res.push(all[Math.floor(Math.random() * all.length)]);
    }

    // Shuffle
    const shuffled = res.sort(() => 0.5 - Math.random()).join('');
    setPassword(shuffled);
    setConfirmPassword(shuffled);
    setShowPassword(true);
    setError('');
  };

  // First-time setup submit
  const handleSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!allRulesPassed) {
      setError('Das Passwort erfüllt noch nicht alle Sicherheitsrichtlinien (mind. 10 Zeichen, Groß-/Kleinbuchstaben, Zahlen & Sonderzeichen).');
      return;
    }
    if (password !== confirmPassword) {
      setError('Die eingegebenen Passwörter stimmen nicht überein.');
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest('/api/auth/setup', 'POST', {
        username: username.trim(),
        password,
        email: email.trim()
      });
      if (result.token) {
        setStoredAuthToken(result.token);
      }
      setPassword('');
      setConfirmPassword('');
      setIsInitialized(true);
      onSelectUser(result.user);
      onClose();
    } catch (failure: any) {
      setError(failure.message || 'Ersteinrichtung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  // Standard login submit
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (typeof setSuccessMsg === 'function') setSuccessMsg('');
    try {
      const result = await apiRequest('/api/auth/login', 'POST', { username, password });
      if (result.token && typeof setStoredAuthToken === 'function') {
        setStoredAuthToken(result.token);
      }
      setPassword('');
      onSelectUser(result.user);
      onClose();
    } catch (failure: any) {
      setError(failure.message || 'Anmeldung fehlgeschlagen.');
      if (failure.needsSetup && typeof setIsInitialized === 'function') {
        setIsInitialized(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {};
  const handleLogin = login;

  // Authenticated Change Password submit
  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!allRulesPassed) {
      setError('Das neue Passwort erfüllt noch nicht alle Sicherheitsrichtlinien (mind. 10 Zeichen, Groß-/Kleinbuchstaben, Zahlen & Sonderzeichen).');
      return;
    }
    if (password !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest('/api/auth/change-password', 'POST', {
        currentPassword,
        newPassword: password
      });
      if (result.token) {
        setStoredAuthToken(result.token);
      }
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setIsChangePasswordMode(false);
      setSuccessMsg('Passwort erfolgreich und sicher aktualisiert.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (failure: any) {
      setError(failure.message || 'Passwortänderung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', 'POST', {});
      setStoredAuthToken(null);
      onSelectUser({ ...currentUser, id: '', username: 'Nicht angemeldet', role: 'user' });
    } catch (failure: any) {
      setStoredAuthToken(null);
      setError(failure.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-5 my-8 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100">
                {isChangePasswordMode
                  ? 'Passwort sicher ändern'
                  : isInitialized === false
                  ? 'Administrator-Ersteinrichtung'
                  : 'Sichere Manager-Anmeldung'}
              </h2>
              <p className="text-xs text-neutral-400">
                {isChangePasswordMode
                  ? 'Vorhandenes Passwort verifizieren und aktualisieren'
                  : isInitialized === false
                  ? 'Erster Start: Starkes Admin-Passwort erstellen'
                  : 'Mit lokalem Administrator-Konto anmelden'}
              </p>
            </div>
          </div>
          {currentUser.id && !busy && (
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 1. CHANGE PASSWORD VIEW (FOR AUTHENTICATED ADMIN) */}
        {isChangePasswordMode ? (
          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Aktuelles Passwort</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Aktuelles Passwort..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-neutral-300 font-medium">Neues starkes Passwort</label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Sicheres generieren</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mindestens 10 Zeichen..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 pr-10 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Neues Passwort wiederholen</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Passwort erneut eingeben..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Password security requirements badges */}
            <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[11px]">
              <span className={rules.length ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.length ? '✓' : '○'} Mind. 10 Zeichen
              </span>
              <span className={rules.upper ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.upper ? '✓' : '○'} Großbuchstabe (A-Z)
              </span>
              <span className={rules.lower ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.lower ? '✓' : '○'} Kleinbuchstabe (a-z)
              </span>
              <span className={rules.number ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.number ? '✓' : '○'} Ziffer (0-9)
              </span>
              <span className={rules.special ? 'text-emerald-400 font-medium col-span-2' : 'text-neutral-500 col-span-2'}>
                {rules.special ? '✓' : '○'} Sonderzeichen (!@#$%&* etc.)
              </span>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60 font-medium">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => { setIsChangePasswordMode(false); setError(''); }}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-600/30"
              >
                {busy ? 'Wird geprüft…' : 'Passwort aktualisieren'}
              </button>
            </div>
          </form>
        ) : isInitialized === false ? (
          /* 2. INITIAL SETUP VIEW (FIRST START ONLY) */
          <form onSubmit={handleSetup} className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-200/90 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
                <Sparkles className="w-4 h-4" />
                <span>Erster Start – Sicheres Administrator-Konto erstellen</span>
              </div>
              <p>
                Kein unsicheres Standard- oder Hardcoded-Passwort. Bitte vergeben Sie jetzt Ihr persönliches Administrator-Passwort.
              </p>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Administrator-Benutzername</label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Admin"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Administrator E-Mail (optional)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@local.domain"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-neutral-300 font-medium">Administrator-Passwort festlegen</label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Sicheres generieren</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mindestens 10 Zeichen..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 pr-10 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Passwort wiederholen</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Passwort erneut eingeben..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Password security badges */}
            <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[11px]">
              <span className={rules.length ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.length ? '✓' : '○'} Mind. 10 Zeichen
              </span>
              <span className={rules.upper ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.upper ? '✓' : '○'} Großbuchstabe (A-Z)
              </span>
              <span className={rules.lower ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.lower ? '✓' : '○'} Kleinbuchstabe (a-z)
              </span>
              <span className={rules.number ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {rules.number ? '✓' : '○'} Ziffer (0-9)
              </span>
              <span className={rules.special ? 'text-emerald-400 font-medium col-span-2' : 'text-neutral-500 col-span-2'}>
                {rules.special ? '✓' : '○'} Sonderzeichen (!@#$%&* etc.)
              </span>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60 font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-2 mt-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{busy ? 'Richte Administrator ein…' : 'Administrator jetzt sicher einrichten'}</span>
            </button>
          </form>
        ) : (
          /* 3. STANDARD SECURE LOGIN VIEW */
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            {successMsg && (
              <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded-lg text-emerald-300 text-xs">
                {successMsg}
              </div>
            )}

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Benutzername</label>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Passwort</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Passwort eingeben..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 pr-10 text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60 font-medium">
                {error}
              </p>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shadow-emerald-600/30"
              >
                {busy ? 'Anmeldung läuft…' : 'Sicher anmelden'}
              </button>

              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => { setIsChangePasswordMode(true); setError(''); setPassword(''); setConfirmPassword(''); }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  Passwort ändern
                </button>
              )}
            </div>

            {/* Host Console Emergency Recovery Note */}
            <div className="p-2.5 bg-neutral-950/80 border border-neutral-800 rounded-lg text-[11px] text-neutral-400 space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Host-Wiederherstellung:</span>
              </div>
              <p className="text-neutral-500">
                Aus 100% Sicherheitsgründen gibt es keine ungeschützte Web-Passwortrücksetzung. Bei Passwortverlust führen Sie auf der Serverkonsole <code className="text-neutral-300 font-mono">npm run admin:reset</code> aus.
              </p>
            </div>

            {currentUser.id && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded cursor-pointer"
                >
                  Schließen
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded border border-rose-800/60 cursor-pointer"
                >
                  Abmelden
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
