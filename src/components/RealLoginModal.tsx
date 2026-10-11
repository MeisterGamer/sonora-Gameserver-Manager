import React, { useState } from 'react';
import { UserAccount } from '../types/auth';
import { apiRequest } from '../services/api';

interface Props {
  isOpen: boolean; onClose: () => void; users: UserAccount[]; currentUser: UserAccount;
  onSelectUser: (user: UserAccount) => void; onRegisterUser: (username: string, email: string) => void;
}
export function LoginModal({ isOpen, onClose, currentUser, onSelectUser }: Props) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await apiRequest('/api/auth/login', 'POST', { username, password });
      setPassword(''); onSelectUser(result.user); onClose();
    } catch (failure: any) { setError(failure.message); } finally { setBusy(false); }
  };
  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', 'POST', {});
      onSelectUser({ ...currentUser, id: '', username: 'Nicht angemeldet', role: 'user' });
    } catch (failure: any) { setError(failure.message); }
  };
  return <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
    <form onSubmit={login} className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md space-y-4">
      <h2 className="text-lg font-bold">Manager-Anmeldung</h2>
      <p className="text-sm text-neutral-400">Melde dich mit dem lokalen Administratorkonto an.</p>
      <label className="block">Benutzername<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} className="block w-full bg-neutral-800 p-2 rounded mt-1" /></label>
      <label className="block">Passwort<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="block w-full bg-neutral-800 p-2 rounded mt-1" /></label>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <button disabled={busy} className="bg-emerald-700 p-2 rounded disabled:opacity-50">{busy ? 'Anmeldung läuft…' : 'Anmelden'}</button>
      {currentUser.id && <><button type="button" onClick={onClose} className="ml-3">Schließen</button><button type="button" onClick={logout} className="ml-3">Abmelden</button></>}
    </form>
  </div>;
}
