import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Key,
  Users,
  Plus,
  Trash2,
  Check,
  Lock,
  Copy,
  RefreshCw,
  LayoutDashboard,
  Server,
  FileText,
  HelpCircle,
  CreditCard,
  Save,
  LogOut,
  Building2,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { UserAccount, SubUser, PermissionKey, ActiveSessionInfo } from '../types/auth';
import { ServerInstance } from '../types/game';
import { CustomerContract, Invoice, PaymentTransaction, SupportTicket } from '../types/crm';
import { apiRequest, setStoredAuthToken } from '../services/api';

interface UserControlViewProps {
  currentUser: UserAccount;
  servers: ServerInstance[];
  subUsers: SubUser[];
  contracts?: CustomerContract[];
  invoices?: Invoice[];
  transactions?: PaymentTransaction[];
  tickets?: SupportTicket[];
  sessions?: ActiveSessionInfo[];
  onAddSubUser: (subuser: Omit<SubUser, 'id' | 'addedAt'>) => Promise<void> | void;
  onRemoveSubUser: (id: string) => Promise<void> | void;
  onToggle2FA: () => Promise<void> | void;
  onRegenerateApiToken: () => Promise<void> | void;
  onRevokeApiToken?: () => Promise<void> | void;
  onUpdateProfile?: (profile: {
    fullName: string;
    email: string;
    company: string;
    phone: string;
    street: string;
    zipCity: string;
    country: string;
  }) => Promise<void>;
  onLogoutOtherSessions?: () => Promise<void>;
  onNavigateTab?: (tab: 'servers' | 'shop' | 'crm') => void;
}

export const UserControlView: React.FC<UserControlViewProps> = ({
  currentUser,
  servers,
  subUsers,
  contracts = [],
  invoices = [],
  transactions = [],
  tickets = [],
  sessions = [],
  onAddSubUser,
  onRemoveSubUser,
  onToggle2FA,
  onRegenerateApiToken,
  onRevokeApiToken,
  onUpdateProfile,
  onLogoutOtherSessions,
  onNavigateTab
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'security' | 'subusers' | 'api'>('overview');
  const [copiedToken, setCopiedToken] = useState(false);
  const [copied2fa, setCopied2fa] = useState(false);

  // Profile Form State
  const [fullName, setFullName] = useState(currentUser.fullName || currentUser.username);
  const [email, setEmail] = useState(currentUser.email || '');
  const [company, setCompany] = useState(currentUser.company || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [street, setStreet] = useState(currentUser.street || '');
  const [zipCity, setZipCity] = useState(currentUser.zipCity || '');
  const [country, setCountry] = useState(currentUser.country || 'Deutschland');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  useEffect(() => {
    setFullName(currentUser.fullName || currentUser.username);
    setEmail(currentUser.email || '');
    setCompany(currentUser.company || '');
    setPhone(currentUser.phone || '');
    setStreet(currentUser.street || '');
    setZipCity(currentUser.zipCity || '');
    setCountry(currentUser.country || 'Deutschland');
  }, [currentUser]);

  // Password change state
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  // New SubUser modal state
  const [showAddSubUserModal, setShowAddSubUserModal] = useState(false);
  const [subUsername, setSubUsername] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subServerId, setSubServerId] = useState(servers[0]?.id || '');
  const [subError, setSubError] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<PermissionKey[]>([
    'console_read',
    'console_write',
    'power_control'
  ]);

  useEffect(() => {
    if (!subServerId && servers.length > 0) {
      setSubServerId(servers[0].id);
    }
  }, [servers, subServerId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateProfile) return;
    setProfileBusy(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      await onUpdateProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim(),
        street: street.trim(),
        zipCity: zipCity.trim(),
        country: country.trim() || 'Deutschland'
      });
      setProfileMsg('Kunden- und Rechnungsstammdaten wurden dauerhaft gespeichert.');
      setTimeout(() => setProfileMsg(null), 4000);
    } catch (err: any) {
      setProfileErr(err.message || 'Profil konnte nicht gespeichert werden.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || !newPwd) {
      setPwdError('Bitte aktuelles und neues Passwort eingeben.');
      return;
    }
    if (newPwd.length < 10) {
      setPwdError('Das neue Passwort muss mindestens 10 Zeichen inkl. Groß-/Kleinbuchstaben, Ziffer & Sonderzeichen enthalten.');
      return;
    }
    if (confirmPwd && newPwd !== confirmPwd) {
      setPwdError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    setPwdError('');
    setPasswordSuccess(false);
    setPwdBusy(true);
    try {
      const res = await apiRequest('/api/auth/change-password', 'POST', {
        currentPassword: currentPwd,
        newPassword: newPwd
      });
      if (res.token) {
        setStoredAuthToken(res.token);
      }
      if (res.success) {
        setPasswordSuccess(true);
        setCurrentPwd('');
        setNewPwd('');
        setConfirmPwd('');
      }
    } catch (err: any) {
      setPwdError(err.message || 'Passwort konnte nicht geändert werden.');
    } finally {
      setPwdBusy(false);
    }
  };

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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubError('');
    if (!subUsername.trim() || !subEmail.trim() || !subServerId) {
      setSubError('Bitte alle Pflichtfelder und einen Server auswählen.');
      return;
    }

    const targetServer = servers.find(s => s.id === subServerId);
    try {
      await onAddSubUser({
        username: subUsername.trim(),
        email: subEmail.trim(),
        serverId: subServerId,
        serverName: targetServer?.name || 'Gameserver',
        permissions: selectedPerms
      });
      setSubUsername('');
      setSubEmail('');
      setShowAddSubUserModal(false);
    } catch (err: any) {
      setSubError(err.message || 'Sub-User konnte nicht hinzugefügt werden.');
    }
  };

  const handleCopyToken = () => {
    if (!currentUser.apiToken) return;
    navigator.clipboard.writeText(currentUser.apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCopy2fa = () => {
    if (!currentUser.twoFactorSecret) return;
    navigator.clipboard.writeText(currentUser.twoFactorSecret);
    setCopied2fa(true);
    setTimeout(() => setCopied2fa(false), 2000);
  };

  const openTicketCount = tickets.filter(t => t.status !== 'closed').length;
  const activeContractsCount = contracts.filter(c => c.status !== 'suspended').length;
  const totalSpent = invoices
    .filter(inv => inv.status === 'paid' && inv.customerId === currentUser.id)
    .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top UserCP Header Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-base shrink-0 ${
            currentUser.role === 'admin'
              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
              : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
          }`}>
            {currentUser.avatarInitials}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-neutral-100">
                UserCP · {currentUser.fullName || currentUser.username}
              </h2>
              {currentUser.customerNumber && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-emerald-400">
                  {currentUser.customerNumber}
                </span>
              )}
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                currentUser.role === 'admin'
                  ? 'bg-rose-950/70 border-rose-800 text-rose-300'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300'
              }`}>
                {currentUser.role === 'admin' ? 'Administrator' : 'Kundenkonto'}
              </span>
            </div>
            <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-2">
              <span>{currentUser.email || 'Keine E-Mail hinterlegt'}</span>
              <span>·</span>
              <span>Benutzer: <strong className="text-neutral-200">{currentUser.username}</strong></span>
              <span>·</span>
              <span>Prepaid-Guthaben: <strong className="font-mono text-emerald-400">{currentUser.balance.toFixed(2)} €</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateTab && (
            <>
              <button
                onClick={() => onNavigateTab('shop')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                <span>Server mieten</span>
              </button>
              <button
                onClick={() => onNavigateTab('crm')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                <span>Guthaben & Rechnungen</span>
              </button>
            </>
          )}
          <button
            onClick={() => setShowAddSubUserModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Sub-User einladen</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs w-fit overflow-x-auto max-w-full">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'overview' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Übersicht</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'profile' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Profil & Rechnungsdaten</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'security' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Sicherheit, 2FA & Sitzungen</span>
        </button>

        <button
          onClick={() => setActiveTab('subusers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'subusers' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team & Sub-User ({subUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'api' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>REST API Token</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW DASHBOARD */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Prepaid-Guthaben</span>
                <CreditCard className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {currentUser.balance.toFixed(2)} €
              </div>
              <div className="text-[11px] text-neutral-500">Gesamtumsatz: {totalSpent.toFixed(2)} €</div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Aktive Server & Verträge</span>
                <Server className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-neutral-100 tabular-nums">
                {servers.length} <span className="text-xs font-normal text-neutral-400">/ {activeContractsCount} Verträge</span>
              </div>
              <div className="text-[11px] text-neutral-500">Eigene & freigegebene Instanzen</div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Rechnungen (DIN 5008)</span>
                <FileText className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-neutral-100 tabular-nums">{invoices.length}</div>
              <div className="text-[11px] text-neutral-500">Jederzeit als PDF druckbar</div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Support-Tickets</span>
                <HelpCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-neutral-100 tabular-nums">{openTicketCount}</div>
              <div className="text-[11px] text-neutral-500">Offene Anfragen ({tickets.length} gesamt)</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Customer Master Summary */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span>Kunden-Stammdaten</span>
                </h3>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                >
                  Bearbeiten
                </button>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-neutral-400">
                <span>Kundennummer:</span>
                <span className="font-mono text-neutral-200">{currentUser.customerNumber || '—'}</span>
                <span>Name:</span>
                <span className="text-neutral-200">{currentUser.fullName || currentUser.username}</span>
                <span>Firma / Clan:</span>
                <span className="text-neutral-200">{currentUser.company || '—'}</span>
                <span>Rechnungsadresse:</span>
                <span className="text-neutral-200">
                  {currentUser.street || currentUser.zipCity
                    ? `${currentUser.street || ''}, ${currentUser.zipCity || ''} (${currentUser.country || 'DE'})`
                    : 'Noch nicht hinterlegt'}
                </span>
                <span>2FA-Schutz:</span>
                <span className={currentUser.twoFactorEnabled ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                  {currentUser.twoFactorEnabled ? 'Aktiviert (TOTP)' : 'Nicht aktiviert'}
                </span>
                <span>Kunde seit:</span>
                <span className="font-mono text-neutral-200">{(currentUser.createdAt || '').slice(0, 10) || '—'}</span>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Letzte Kontobewegungen</span>
                </h3>
                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('crm')}
                    className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                  >
                    Alle ansehen
                  </button>
                )}
              </div>
              {transactions.length === 0 ? (
                <div className="py-6 text-center text-neutral-500">
                  Noch keine Buchungen vorhanden. Lade Guthaben im Kundencenter auf oder buche deinen ersten Server im Shop.
                </div>
              ) : (
                <div className="divide-y divide-neutral-800/80">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-neutral-200 font-medium truncate">{tx.note}</div>
                        <div className="text-[11px] font-mono text-neutral-500">{tx.timestamp} · {tx.method}</div>
                      </div>
                      <span className={`font-mono font-bold tabular-nums shrink-0 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-neutral-300'}`}>
                        {tx.amount >= 0 ? `+${tx.amount.toFixed(2)}` : tx.amount.toFixed(2)} €
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE & BILLING ADDRESS */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5 text-xs">
          <div className="border-b border-neutral-800 pb-3">
            <h3 className="font-semibold text-neutral-100 text-sm">Kundenprofil & Rechnungsanschrift (DIN 5008)</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Diese Daten werden dauerhaft in deinem Kundenkonto gespeichert und automatisch auf allen neuen PDF-Rechnungen verwendet.
            </p>
          </div>

          {profileMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileMsg}</span>
            </div>
          )}
          {profileErr && (
            <div role="alert" className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{profileErr}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Vollständiger Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Max Mustermann"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">E-Mail-Adresse *</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="kunde@beispiel.de"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Firma / Clan (optional)</label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="z.B. Sonora Community e.V."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Telefonnummer</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+49 170 1234567"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Straße & Hausnummer</label>
              <input
                type="text"
                value={street}
                onChange={e => setStreet(e.target.value)}
                placeholder="Musterstraße 12"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">PLZ & Ort</label>
                <input
                  type="text"
                  value={zipCity}
                  onChange={e => setZipCity(e.target.value)}
                  placeholder="60311 Frankfurt"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-medium mb-1">Land</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  placeholder="Deutschland"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
            <span className="text-[11px] font-mono text-neutral-500">
              Kundennummer: {currentUser.customerNumber || '—'} · Konto-ID: {currentUser.id}
            </span>
            <button
              type="submit"
              disabled={profileBusy}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{profileBusy ? 'Speichere…' : 'Stammdaten speichern'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: SECURITY, 2FA, PASSWORD & ACTIVE SESSIONS */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 2FA Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Zwei-Faktor-Authentifizierung (TOTP 2FA)</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Schütze dein Kundenkonto mit einer Authenticator-App (Google Authenticator, Authy, 1Password, KeePassXC).
              </p>

              <div className="pt-1 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-300">
                  Status: {currentUser.twoFactorEnabled ? <strong className="text-emerald-400">Aktiviert</strong> : <span className="text-neutral-500">Deaktiviert</span>}
                </span>
                <button
                  onClick={onToggle2FA}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    currentUser.twoFactorEnabled
                      ? 'bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {currentUser.twoFactorEnabled ? '2FA deaktivieren' : '2FA jetzt aktivieren'}
                </button>
              </div>

              {currentUser.twoFactorEnabled && currentUser.twoFactorSecret && (
                <div className="p-3 bg-neutral-950 border border-emerald-900/60 rounded-lg space-y-2 text-xs">
                  <div className="text-[11px] text-neutral-400 font-medium">Dein persönlicher TOTP-Schlüssel (Base32):</div>
                  <div className="flex items-center justify-between gap-2 font-mono text-emerald-400">
                    <span className="truncate select-all">{currentUser.twoFactorSecret}</span>
                    <button
                      type="button"
                      onClick={handleCopy2fa}
                      className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200 shrink-0 cursor-pointer"
                    >
                      {copied2fa ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied2fa ? 'Kopiert' : 'Kopieren'}</span>
                    </button>
                  </div>
                  {currentUser.twoFactorOtpAuthUrl && (
                    <div className="text-[10px] font-mono text-neutral-500 break-all">
                      URI: {currentUser.twoFactorOtpAuthUrl}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Change Password Card */}
            <form onSubmit={handleChangePassword} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>Passwort ändern</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Mind. 10 Zeichen inkl. Groß-/Kleinbuchstaben, Ziffer und Sonderzeichen. Alle anderen Sitzungen werden danach abgemeldet.
              </p>

              <div className="space-y-2 text-xs">
                <input
                  type="password"
                  required
                  placeholder="Aktuelles Passwort"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 font-mono"
                />
                <input
                  type="password"
                  required
                  placeholder="Neues Passwort (mind. 10 Zeichen)"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 font-mono"
                />
                <input
                  type="password"
                  required
                  placeholder="Neues Passwort wiederholen"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 font-mono"
                />
                {pwdError && (
                  <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-800/50">
                    {pwdError}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={pwdBusy}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded cursor-pointer transition-colors"
                  >
                    {pwdBusy ? 'Wird gespeichert…' : 'Passwort aktualisieren'}
                  </button>
                  {passwordSuccess && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                      <Check className="w-3.5 h-3.5" /> Gespeichert
                    </span>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* Active Sessions */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-neutral-100 text-sm">Aktive Anmeldesitzungen ({sessions.length})</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Übersicht aller aktuell angemeldeten Geräte für dein Benutzerkonto.
                </p>
              </div>
              {onLogoutOtherSessions && sessions.length > 1 && (
                <button
                  onClick={onLogoutOtherSessions}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Alle anderen Sitzungen beenden</span>
                </button>
              )}
            </div>
            <div className="divide-y divide-neutral-800 text-xs">
              {sessions.length === 0 ? (
                <div className="p-4 text-neutral-500">Aktuelle Sitzung aktiv.</div>
              ) : (
                sessions.map(s => (
                  <div key={s.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-neutral-200">{s.ip}</span>
                        {s.isCurrent && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                            Aktuelle Sitzung
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-xl">{s.userAgent}</div>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400">
                      Seit {new Date(s.createdAt).toLocaleString('de-DE')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUB-USERS (CO-MANAGEMENT) */}
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
              Es sind derzeit keine Team-Mitglieder eingerichtet. Klicke oben auf &quot;Sub-User einladen&quot;.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {subUsers.map((sub) => (
                <div key={sub.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
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

      {/* TAB 5: REST API TOKENS */}
      {activeTab === 'api' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>Persönlicher REST API Bearer Token</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Authentifiziert echte API-Aufrufe für Discord-Bots, Automatisierung und CI/CD direkt gegen deinen Account.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {currentUser.apiToken && onRevokeApiToken && (
                <button
                  onClick={onRevokeApiToken}
                  className="px-3 py-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Widerrufen
                </button>
              )}
              <button
                onClick={onRegenerateApiToken}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{currentUser.apiToken ? 'Token rotieren' : 'API Token erzeugen'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 font-mono text-xs flex items-center justify-between gap-3">
            <span className={currentUser.apiToken ? 'text-emerald-400 truncate select-all' : 'text-neutral-500'}>
              {currentUser.apiToken || 'Noch kein API-Token erstellt. Klicke oben auf "API Token erzeugen".'}
            </span>
            {currentUser.apiToken && (
              <button
                onClick={handleCopyToken}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 shrink-0 cursor-pointer"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Kopiert' : 'Kopieren'}</span>
              </button>
            )}
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80 text-[11px] font-mono text-neutral-400 space-y-1">
            <div className="text-neutral-300 font-sans font-semibold text-xs mb-1">Beispiel-Aufruf (curl):</div>
            <div className="overflow-x-auto text-neutral-300">
              curl -H &quot;Authorization: Bearer {currentUser.apiToken || 'DEIN_TOKEN'}&quot; {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/servers
            </div>
          </div>
        </div>
      )}

      {/* Add SubUser Modal */}
      {showAddSubUserModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-neutral-100 text-sm">Teammitglied / Sub-User einladen</h3>
              <button onClick={() => setShowAddSubUserModal(false)} className="text-neutral-400 hover:text-neutral-200 cursor-pointer">✕</button>
            </div>

            {servers.length === 0 ? (
              <div className="text-xs text-neutral-400 space-y-3">
                <p>Du benötigst zuerst mindestens einen eigenen Gameserver, um einen Sub-User zuzuweisen.</p>
                <button
                  type="button"
                  onClick={() => setShowAddSubUserModal(false)}
                  className="px-3 py-1.5 bg-neutral-800 text-neutral-200 rounded cursor-pointer"
                >
                  Schließen
                </button>
              </div>
            ) : (
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
                  <label className="block text-neutral-300 font-medium mb-1">E-Mail (registriertes Konto)</label>
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

                {subError && (
                  <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-800/50">
                    {subError}
                  </p>
                )}

                <div className="pt-2 border-t border-neutral-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSubUserModal(false)}
                    className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded cursor-pointer"
                  >
                    Einladung speichern
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
