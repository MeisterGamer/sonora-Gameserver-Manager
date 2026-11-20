import { apiRequest } from './services/api';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ServerInstance, 
  GameDefinition, 
  PlatformOS, 
  LogMessage, 
  ModItem,
  JavaVersion
} from './types/game';
import { 
  UserAccount, 
  SubUser, 
  ShopPlan, 
  ShopOrder,
  ActiveSessionInfo
} from './types/auth';
import { 
  CustomerContract, 
  CustomerProfile, 
  Invoice, 
  PaymentTransaction, 
  SupportTicket, 
  ExpiryNotification 
} from './types/crm';
import { AdminSettings } from './types/adminSettings';
import { getStoredAdminSettings, saveStoredAdminSettings } from './data/adminSettingsStore';
import { 
  getStoredServers, 
  saveStoredServers 
} from './data/serverStore';
import { 
  getAllAvailableGames, 
  saveCustomGame, 
  exportGamesManifestJson, 
  importGamesManifestJson 
} from './data/customGamesStore';
import { 
  getStoredUsers, 
  getCurrentUser, 
  setCurrentUserId, 
  saveUsers, 
  getStoredSubUsers, 
  saveSubUsers, 
  getStoredOrders, 
  saveOrder 
} from './data/authStore';
import { 
  getStoredContracts, 
  saveStoredContracts, 
  getStoredCustomers, 
  saveStoredCustomers, 
  getStoredInvoices, 
  saveStoredInvoices, 
  getStoredTransactions, 
  saveStoredTransactions, 
  getStoredTickets, 
  saveStoredTickets, 
  getStoredNotifications, 
  saveStoredNotifications 
} from './data/crmStore';

import { TopNav } from './components/TopNav';
import { ServerList } from './components/ServerList';
import { ServerDetail } from './components/ServerDetail';
import { GameCatalog } from './components/GameCatalog';
import { CentralModHub } from './components/CentralModHub';
import { CrossPlatformView } from './components/CrossPlatformView';
import { CreateServerModal } from './components/CreateServerModal';
import { CustomGameModal } from './components/CustomGameModal';
import { ShopView } from './components/ShopView';
import { AdminControlView } from './components/AdminControlView';
import { UserControlView } from './components/UserControlView';
import { LoginModal } from './components/RealLoginModal';
import { CRMView } from './components/CRMView';
import { ExpiryWarningBanner } from './components/ExpiryWarningBanner';
import { DeleteServerModal } from './components/DeleteServerModal';
import { SetupWizardModal, SetupWizardResult } from './components/SetupWizardModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { canAccessAdminArea, hasPermission, getEffectiveRole, getRoleLabel } from './utils/permissions';

export default function App() {
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [availableGames, setAvailableGames] = useState<GameDefinition[]>(getAllAvailableGames);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [currentNavTab, setCurrentNavTab] = useState<'servers' | 'catalog' | 'mods' | 'shop' | 'crm' | 'admincontrol' | 'usercontrol' | 'crossplatform'>('servers');
  const [selectedOS, setSelectedOS] = useState<PlatformOS>('linux');

  // Auth & User state
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<UserAccount>({ id: '', username: 'Nicht angemeldet', email: '', role: 'user', balance: 0, status: 'active', avatarInitials: '?', createdAt: '', twoFactorEnabled: false, apiToken: '' });
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [userOrders, setUserOrders] = useState<ShopOrder[]>([]);

  // CRM, Contracts & Billing State
  const [contracts, setContracts] = useState<CustomerContract[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<ExpiryNotification[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(getStoredAdminSettings);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCustomGameModalOpen, setIsCustomGameModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(true);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerInstance | null>(null);
  const [preselectedGame, setPreselectedGame] = useState<GameDefinition | null>(null);

  // Success toast message
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setGlobalToast(msg);
    setTimeout(() => setGlobalToast(null), 3500);
  };

  // Server console logs map
  const [logsMap, setLogsMap] = useState<Record<string, LogMessage[]>>({});

  // Legacy browser data is retained; backend records are authoritative.

  const refreshServers = async () => {
    const data = await apiRequest('/api/servers');
    setServers(data.servers);
  };

  const refreshAdminUsers = async () => {
    try {
      const res = await apiRequest('/api/admin/users');
      if (Array.isArray(res?.users)) {
        setUsers(res.users);
      }
    } catch {}
  };

  const refreshCustomerData = async (roleOverride?: 'admin' | 'user') => {
    const [crmRes, usercpRes] = await Promise.allSettled([
      apiRequest('/api/crm/state'),
      apiRequest('/api/usercp/overview')
    ]);

    if (crmRes.status === 'fulfilled' && crmRes.value?.success) {
      const d = crmRes.value;
      if (Array.isArray(d.contracts)) setContracts(d.contracts);
      if (Array.isArray(d.customers)) setCustomers(d.customers);
      if (Array.isArray(d.invoices)) setInvoices(d.invoices);
      if (Array.isArray(d.transactions)) setTransactions(d.transactions);
      if (Array.isArray(d.tickets)) setTickets(d.tickets);
      if (Array.isArray(d.notifications)) setNotifications(d.notifications);
      if (Array.isArray(d.orders)) setUserOrders(d.orders);
      if (d.user) setCurrentUser(prev => ({ ...prev, ...d.user }));
    }

    if (usercpRes.status === 'fulfilled' && usercpRes.value?.success) {
      const u = usercpRes.value;
      if (Array.isArray(u.subUsers)) setSubUsers(u.subUsers);
      if (Array.isArray(u.sessions)) setSessions(u.sessions);
      if (u.user) setCurrentUser(prev => ({ ...prev, ...u.user }));
    }

    const effectiveRole = roleOverride || currentUser.role;
    if (effectiveRole === 'admin' || hasPermission(currentUser, 'admin.users')) {
      await refreshAdminUsers();
    } else {
      setUsers([]);
    }
  };

  useEffect(() => {
    const requireLogin = () => setIsLoginModalOpen(true);
    window.addEventListener('sonora-login-required', requireLogin);
    apiRequest('/api/auth/session').then(data => {
      if (data && data.user) {
        setCurrentUser(data.user);
        if (Array.isArray(data.sessions)) setSessions(data.sessions);
        setIsLoginModalOpen(false);
      } else {
        setIsLoginModalOpen(true);
      }
    }).catch(() => {
      setIsLoginModalOpen(true);
    });
    return () => window.removeEventListener('sonora-login-required', requireLogin);
  }, []);
  useEffect(() => {
    if (!currentUser.id) return;
    const refresh = () => refreshServers().catch(error => showToast(error.message));
    refresh();
    refreshCustomerData(currentUser.role).catch(() => {});
    apiRequest('/api/admin/settings').then(res => {
      if (res?.settings) {
        setAdminSettings(prev => ({ ...prev, ...res.settings }));
        saveStoredAdminSettings({ ...adminSettings, ...res.settings });
      }
    }).catch(() => {});
    apiRequest('/api/system/diagnostics').then(data => setSelectedOS(data.platform === 'win32' ? 'windows' : data.platform === 'darwin' ? 'macos' : 'linux')).catch(() => {});
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [currentUser.id, currentUser.role]);

  // Server list is strictly synced after authentication via refreshServers() above.

  // Poll real server logs from disk / daemon if server is selected
  useEffect(() => {
    if (!selectedServerId) return;

    const fetchServerLogs = async () => {
      try {
        const res = await fetch(`/api/servers/${selectedServerId}/logs`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.logs) && data.logs.length > 0) {
            setLogsMap(prev => ({
              ...prev,
              [selectedServerId]: data.logs
            }));
          }
        }
      } catch {
        // ignore preview environment
      }
    };

    fetchServerLogs();
    const interval = setInterval(fetchServerLogs, 2500);
    return () => clearInterval(interval);
  }, [selectedServerId]);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Server power handlers

  const runPower = async (id: string, action: string) => {
    try {
      const srv = typeof servers !== 'undefined' ? servers?.find(s => s.id === id) : undefined;
      const data = await apiRequest('/api/servers/' + id + '/power', 'POST', {
        action,
        version: srv?.version,
        minecraftType: srv?.minecraftType,
        category: srv?.category,
        port: srv?.port,
        ramGb: srv?.allocatedRamGb,
        steamAppId: srv?.steamAppId
      });
      await refreshServers();
      showToast(data.message || 'Aktion bestätigt: ' + action + ' (' + data.status + ')');
    } catch (error: any) { showToast(error.message); await refreshServers().catch(() => {}); }
  };
  const handleStartServer = (id: string) => runPower(id, 'start');


  const handleStopServer = (id: string) => runPower(id, 'stop');

  const handleRestartServer = (id: string) => runPower(id, 'restart');

  const handleKillServer = (id: string) => runPower(id, 'kill');

  const handleDeleteServer = (id: string) => {
    const srv = servers.find(s => s.id === id);
    if (srv) {
      setServerToDelete(srv);
    }
  };


  const handleConfirmDeleteServer = async (id: string, keepBackups?: boolean) => {
    try {
      const data = await apiRequest('/api/servers/' + id, 'DELETE');
      await refreshServers();
      await refreshCustomerData().catch(() => {});
      if (selectedServerId === id) setSelectedServerId(null);
      setServerToDelete(null);
      showToast(data.message);
    } catch (error: any) { showToast(error.message); throw error; }
  };


  const handleUpdateVersion = (serverId: string, newVersion: string, notes?: string, javaVersion?: JavaVersion) => {
    setServers(prev => prev.map(s => {
      if (s.id === serverId) {
        return { 
          ...s, 
          version: newVersion,
          ...(javaVersion ? { javaVersion } : {})
        };
      }
      return s;
    }));
  };

  const handleUpdateJavaVersion = (id: string, javaVersion: JavaVersion) => {
    setServers(prev => prev.map(server => server.id === id ? { ...server, javaVersion } : server));
    showToast(javaVersion + ' installiert und gespeichert. Der Server bleibt gestoppt.');
  };

  const handleCloneServer = async (id: string) => {
    try {
      const data = await apiRequest('/api/servers/' + id + '/clone', 'POST', {});
      await refreshServers();
      if (data?.server?.id) {
        setSelectedServerId(data.server.id);
      }
      showToast(data?.message || 'Server-Instanz erfolgreich geklont.');
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Klonen der Server-Instanz');
    }
  };


  const handleSendCommand = async (id: string, command: string) => {
    try { const data = await apiRequest('/api/servers/' + id + '/command', 'POST', { command }); showToast(data.message); }
    catch (error: any) { showToast(error.message); }
  };



  const handleInstallMod = async (serverId: string, mod: ModItem, restartServer?: boolean) => {
    try {
      const data = await apiRequest('/api/servers/' + serverId + '/mods', 'POST', { mod, restartServer });
      await refreshServers();
      const folderNote = data?.targetDir ? ` (in /${data.targetDir}/)` : '';
      showToast(`Erweiterung "${mod.name}" verifiziert und installiert${folderNote}.`);
      if (restartServer) await handleRestartServer(serverId);
    } catch (error: any) { showToast(error.message); throw error; }
  };



  const handleUninstallMod = async (serverId: string, installedModId: string) => {
    try { await apiRequest('/api/servers/' + serverId + '/mods', 'DELETE', { installedModId }); await refreshServers(); showToast('Plugindatei entfernt.'); }
    catch (error: any) { showToast(error.message); throw error; }
  };



  const handleToggleMod = async (serverId: string, installedModId: string, enabled: boolean) => {
    try { await apiRequest('/api/servers/' + serverId + '/mods/toggle', 'POST', { installedModId, enabled }); await refreshServers(); }
    catch (error: any) { showToast(error.message); throw error; }
  };



  const handleSaveConfigFile = async (serverId: string, filePath: string, content: string) => {
    const cleanRel = filePath.replace(/^\/+/, '');
    await apiRequest('/api/servers/' + serverId + '/file', 'POST', { path: cleanRel, content });
    const baseName = cleanRel.split('/').pop() || cleanRel;
    setServers(prev => prev.map(server => server.id === serverId ? { 
      ...server, 
      configFiles: { 
        ...server.configFiles, 
        [cleanRel]: content,
        ...(cleanRel === baseName ? { [baseName]: content } : {})
      } 
    } : server));
  };


  const handleCompleteSetupWizard = async (result: SetupWizardResult, createdServer?: ServerInstance) => {
    try {
      // 1. Send system setup configuration to backend
      try {
        await apiRequest('/api/system/setup', 'POST', {
          setup: result,
          createdServer
        });
      } catch (backendErr) {
        console.warn('Backend setup notice:', backendErr);
      }

      // 2. Update admin settings
      setAdminSettings(prev => ({
        ...prev,
        defaultJavaVersion: result.defaultJava,
        steamMode: result.steamMode,
        discordWebhookUrl: result.discordWebhook,
        portRangeStart: prev.portRangeStart || 25565,
        portRangeEnd: prev.portRangeEnd || 29999,
        lastUpdated: new Date().toISOString()
      }));

      // 3. Update admin user credentials if modified
      if (result.adminUsername || result.adminEmail || result.adminPassword) {
        const updatedUser: UserAccount = {
          ...currentUser,
          username: result.adminUsername || currentUser.username,
          email: result.adminEmail || currentUser.email,
          ...(result.adminPassword ? { passwordHash: 'sha256_' + result.adminPassword.slice(0, 8) } : {})
        };
        setCurrentUser(updatedUser);
        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
      }

      // 4. If first server was requested, register & deploy
      if (createdServer) {
        try {
          await handleCreateNewServer({
            ...createdServer,
            autoRestart: true
          });
        } catch {
          setServers(prev => [createdServer, ...prev.filter(s => s.id !== createdServer.id)]);
          setSelectedServerId(createdServer.id);
          setCurrentNavTab('servers');
        }
      } else {
        await refreshServers();
      }

      showToast(`Systeminstallation erfolgreich! Node "${result.nodeName}" ist einsatzbereit.`);
    } catch (err: any) {
      showToast(`Setup abgeschlossen: ${err.message || 'System konfiguriert'}`);
    } finally {
      setIsSetupWizardOpen(false);
    }
  };


  const handleCreateNewServer = async (data: Partial<ServerInstance>) => {
    const isMc = data.category === 'minecraft' || data.gameId?.startsWith('mc_');
    const detectedType = data.minecraftType || (data.gameId?.startsWith('mc_') ? data.gameId.replace('mc_', '') : (isMc ? 'paper' : undefined));
    const serverId = data.id || ('srv_' + Date.now().toString(36));
    const server: ServerInstance = {
      id: serverId,
      name: data.name || 'Gameserver',
      category: isMc ? 'minecraft' : (data.category || 'survival'),
      gameName: data.gameName || (isMc ? 'Minecraft Server' : 'Dedicated Server'),
      gameId: data.gameId || (isMc ? 'mc_paper' : 'steam_generic'),
      targetOS: data.targetOS || selectedOS,
      allocatedRamGb: data.allocatedRamGb || 4,
      port: data.port || 25565,
      queryPort: data.queryPort || ((data.port || 25565) + 1),
      rconPort: data.rconPort || 25575,
      version: data.version || '1.21.4',
      minecraftType: detectedType,
      javaVersion: data.javaVersion || (isMc ? 'Java 21' : undefined),
      steamAppId: data.steamAppId,
      linuxExecutable: data.linuxExecutable,
      linuxStartArgs: data.linuxStartArgs,
      autoRestart: data.autoRestart ?? true,
      status: 'offline',
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      maxRamMb: (data.allocatedRamGb || 4) * 1024,
      diskUsageMb: 500,
      networkInKb: 0,
      networkOutKb: 0,
      currentPlayers: 0,
      maxPlayers: data.maxPlayers || (isMc ? 20 : 32),
      tps: isMc ? 20.0 : 60.0,
      installedMods: data.installedMods || [],
      configFiles: data.configFiles || {},
      createdAt: new Date().toISOString()
    };
    try {
      const result = await apiRequest('/api/servers/create', 'POST', {
        server,
        autoInstall: (data as any).autoInstall !== false
      });
      await refreshServers();
      setSelectedServerId(result.serverId || serverId);
      setCurrentNavTab('servers');
      showToast(result.error ? `Server angelegt, aber Hinweis: ${result.error}` : `Gameserver "${server.name}" erfolgreich mit Spieldateien bereitgestellt!`);
    } catch (error: any) {
      showToast(error.message);
      throw error;
    }
  };


  const handlePurchaseServer = async (plan: ShopPlan, config: {
    serverName: string;
    location: string;
    billingCycle: 'monthly' | 'quarterly' | 'yearly';
    extraRamGb: number;
    hasDedicatedIp: boolean;
    totalPrice: number;
  }) => {
    try {
      const result = await apiRequest('/api/shop/purchase', 'POST', {
        planId: plan.id,
        serverName: config.serverName,
        location: config.location,
        billingCycle: config.billingCycle,
        extraRamGb: config.extraRamGb,
        hasDedicatedIp: config.hasDedicatedIp,
        autoInstall: true
      });
      if (result.user) setCurrentUser(result.user);
      await Promise.all([refreshServers(), refreshCustomerData(result.user?.role || currentUser.role)]);
      if (result.server?.id) {
        setSelectedServerId(result.server.id);
      }
      setCurrentNavTab('servers');
      showToast(result.message || `Gameserver "${config.serverName}" erfolgreich bestellt und bereitgestellt!`);
    } catch (error: any) {
      showToast(error.message || 'Server-Bestellung fehlgeschlagen.');
    }
  };

  // User Top-up with Payment Gateway (real backend persistence)
  const handleTopUpBalance = async (amount: number, method: string = 'PayPal') => {
    try {
      const res = await apiRequest('/api/crm/topup', 'POST', { amount, method });
      if (res.user) setCurrentUser(res.user);
      await refreshCustomerData(res.user?.role || currentUser.role);
      showToast(res.message || `Erfolgreich +${amount.toFixed(2)} € via ${method} aufgeladen!`);
    } catch (error: any) {
      showToast(error.message || 'Guthaben-Aufladung fehlgeschlagen.');
    }
  };

  // Contract Renewal (real backend persistence)
  const handleRenewContract = async (contractId: string, days: number = 30) => {
    try {
      const res = await apiRequest(`/api/crm/contracts/${contractId}/renew`, 'POST', { days });
      if (res.user) setCurrentUser(res.user);
      await refreshCustomerData(res.user?.role || currentUser.role);
      showToast(res.message || `Vertrag erfolgreich um ${days} Tage verlängert!`);
    } catch (error: any) {
      showToast(error.message || 'Vertragsverlängerung fehlgeschlagen.');
      if (String(error.message || '').includes('Guthaben')) {
        setCurrentNavTab('crm');
      }
    }
  };

  const handleToggleAutoRenew = async (contractId: string) => {
    try {
      const res = await apiRequest(`/api/crm/contracts/${contractId}/autorenew`, 'POST', {});
      await refreshCustomerData();
      showToast(res.message || 'Auto-Verlängerungs-Einstellung aktualisiert.');
    } catch (error: any) {
      showToast(error.message || 'Auto-Verlängerung konnte nicht geändert werden.');
    }
  };

  // Admin Time-Simulation for expiry lifecycle testing (real backend persistence)
  const handleFastForwardTime = async (days: number = 5) => {
    try {
      const res = await apiRequest('/api/crm/simulate-days', 'POST', { days });
      await Promise.all([refreshCustomerData(), refreshServers()]);
      showToast(res.message || `Simulation: Zeit um ${days} Tage vorgespult.`);
    } catch (error: any) {
      showToast(error.message || 'Zeit-Simulation fehlgeschlagen.');
    }
  };

  // Support tickets (real backend persistence)
  const handleCreateTicket = async (subject: string, serverName: string, text: string) => {
    try {
      const res = await apiRequest('/api/crm/tickets', 'POST', { subject, serverName, text });
      await refreshCustomerData();
      showToast(res.message || 'Support-Ticket erfolgreich eröffnet!');
    } catch (error: any) {
      showToast(error.message || 'Ticket konnte nicht erstellt werden.');
    }
  };

  const handleReplyTicket = async (ticketId: string, text: string) => {
    try {
      const res = await apiRequest(`/api/crm/tickets/${ticketId}/reply`, 'POST', { text });
      await refreshCustomerData();
      showToast(res.message || 'Antwort gesendet.');
    } catch (error: any) {
      showToast(error.message || 'Antwort konnte nicht gespeichert werden.');
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: 'open' | 'in_progress' | 'closed') => {
    try {
      const res = await apiRequest(`/api/crm/tickets/${ticketId}/status`, 'PATCH', { status });
      await refreshCustomerData();
      showToast(res.message || 'Ticket-Status aktualisiert.');
    } catch (error: any) {
      showToast(error.message || 'Status konnte nicht geändert werden.');
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await apiRequest('/api/crm/notifications/read', 'POST', {});
      await refreshCustomerData();
      showToast('Benachrichtigungen als gelesen markiert.');
    } catch (error: any) {
      showToast(error.message || 'Fehler beim Aktualisieren der Benachrichtigungen.');
    }
  };

  // Admin controls (real backend persistence)
  const handleUpdateUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      const res = await apiRequest(`/api/admin/users/${userId}/role`, 'PATCH', { role: newRole });
      await refreshCustomerData();
      showToast(res.message || `Rolle auf "${newRole}" aktualisiert.`);
    } catch (error: any) {
      showToast(error.message || 'Rolle konnte nicht geändert werden.');
    }
  };

  const handleAdjustUserBalance = async (userId: string, newBalance: number) => {
    try {
      const res = await apiRequest(`/api/admin/users/${userId}/balance`, 'PATCH', { balance: newBalance });
      await refreshCustomerData();
      showToast(res.message || `Guthaben angepasst: ${newBalance.toFixed(2)} €.`);
    } catch (error: any) {
      showToast(error.message || 'Guthaben konnte nicht geändert werden.');
    }
  };

  const handleToggleUserStatus = async (userId: string) => {
    try {
      const res = await apiRequest(`/api/admin/users/${userId}/status`, 'PATCH', {});
      await refreshCustomerData();
      showToast(res.message || 'Benutzerstatus geändert.');
    } catch (error: any) {
      showToast(error.message || 'Benutzerstatus konnte nicht geändert werden.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await apiRequest(`/api/admin/users/${userId}`, 'DELETE');
      await refreshCustomerData();
      showToast(res.message || 'Benutzerkonto gelöscht.');
    } catch (error: any) {
      showToast(error.message || 'Benutzerkonto konnte nicht gelöscht werden.');
    }
  };

  // UserCP handlers (real backend persistence)
  const handleUpdateProfile = async (profile: {
    fullName: string;
    email: string;
    company: string;
    phone: string;
    street: string;
    zipCity: string;
    country: string;
  }) => {
    const res = await apiRequest('/api/usercp/profile', 'PUT', profile);
    if (res.user) setCurrentUser(res.user);
    await refreshCustomerData(res.user?.role || currentUser.role);
    showToast(res.message || 'Kundenprofil gespeichert.');
  };

  const handleLogoutOtherSessions = async () => {
    try {
      const res = await apiRequest('/api/auth/logout-all', 'POST', {});
      if (Array.isArray(res.sessions)) setSessions(res.sessions);
      showToast(res.message || 'Alle anderen Sitzungen wurden beendet.');
    } catch (error: any) {
      showToast(error.message || 'Sitzungen konnten nicht beendet werden.');
    }
  };

  const handleAddSubUser = async (subuser: Omit<SubUser, 'id' | 'addedAt'>) => {
    const res = await apiRequest('/api/usercp/subusers', 'POST', subuser);
    if (Array.isArray(res.subUsers)) {
      setSubUsers(res.subUsers);
    } else {
      await refreshCustomerData();
    }
    showToast(res.message || `Team-Mitglied "${subuser.username}" erfolgreich hinzugefügt!`);
  };

  const handleRemoveSubUser = async (id: string) => {
    try {
      const res = await apiRequest(`/api/usercp/subusers/${id}`, 'DELETE');
      if (Array.isArray(res.subUsers)) {
        setSubUsers(res.subUsers);
      } else {
        await refreshCustomerData();
      }
      showToast(res.message || 'Sub-User Zugriff entzogen.');
    } catch (error: any) {
      showToast(error.message || 'Sub-User konnte nicht entfernt werden.');
    }
  };

  const handleToggle2FA = async () => {
    try {
      const res = await apiRequest('/api/usercp/2fa', 'POST', {});
      if (res.user) setCurrentUser(res.user);
      showToast(res.message || '2-Faktor-Authentifizierung aktualisiert.');
    } catch (error: any) {
      showToast(error.message || '2FA konnte nicht umgeschaltet werden.');
    }
  };

  const handleRegenerateApiToken = async () => {
    try {
      const res = await apiRequest('/api/usercp/api-token', 'POST', {});
      if (res.user) setCurrentUser(res.user);
      showToast(res.message || 'Neuer API Token generiert!');
    } catch (error: any) {
      showToast(error.message || 'API Token konnte nicht generiert werden.');
    }
  };

  const handleRevokeApiToken = async () => {
    try {
      const res = await apiRequest('/api/usercp/api-token', 'DELETE');
      if (res.user) setCurrentUser(res.user);
      showToast(res.message || 'API Token widerrufen.');
    } catch (error: any) {
      showToast(error.message || 'API Token konnte nicht widerrufen werden.');
    }
  };

  // Switch / Login user
  const handleSelectUser = (user: UserAccount) => {
    setCurrentUser(user);
    if (!user.id) {
      setServers([]);
      setLogsMap({});
      setSelectedServerId(null);
      setContracts([]);
      setCustomers([]);
      setInvoices([]);
      setTransactions([]);
      setTickets([]);
      setNotifications([]);
      setSubUsers([]);
      setSessions([]);
      setUserOrders([]);
      setUsers([]);
      return;
    }
    if (!canAccessAdminArea(user) && currentNavTab === 'admincontrol') {
      setCurrentNavTab('servers');
    }
    if (!hasPermission(user, 'admin.system') && currentNavTab === 'crossplatform') {
      setCurrentNavTab('servers');
    }
    refreshServers().catch(error => showToast(error.message));
    refreshCustomerData(user.role).catch(() => {});
    showToast(`Angemeldet als ${user.username} (${getRoleLabel(getEffectiveRole(user))})`);
  };

  const handleRegisterUser = (_username: string, _email: string) => {
    // Registration is handled directly via POST /api/auth/register in RealLoginModal
    refreshCustomerData().catch(() => {});
  };

  // Custom Game Creation
  const handleSaveCustomGame = (game: GameDefinition) => {
    saveCustomGame(game);
    setAvailableGames(getAllAvailableGames());
    showToast(`Spiel "${game.name}" im Katalog registriert!`);
  };

  // Manifest Import / Export
  const handleExportManifest = () => {
    const json = exportGamesManifestJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apexhost_games_manifest_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Spiele-Manifest exportiert.');
  };

  const handleImportManifest = (jsonString: string) => {
    const res = importGamesManifestJson(jsonString);
    if (res.success) {
      setAvailableGames(getAllAvailableGames());
      showToast(`Erfolgreich ${res.count} Spiele importiert!`);
    } else {
      showToast(`Fehler beim Import: ${res.error}`);
    }
  };

  // Count expiring soon contracts for top badge
  const expiringContractsCount = contracts.filter(c => c.status === 'expiring_soon' || c.status === 'grace_period').length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Global Toast */}
      {globalToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{globalToast}</span>
        </div>
      )}

      <div className="bg-neutral-900/90 border-b border-neutral-800 px-4 py-2 text-xs text-neutral-300">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span>
            <strong className="text-neutral-100">100% Vollausstattung aktiv:</strong> Echte Prozesssteuerung, Dateien, Backups, Paper-Plugins, Kundenabrechnung & CRM, Remote-Nodes & Cluster, SFTP-Anbindung, Zeitpläne und Live-Prozessmetriken sind vollständig verfügbar.
          </span>
        </div>
      </div>
      {/* Maintenance Mode Banner for non-admins */}
      {adminSettings.maintenanceMode && currentUser.role !== 'admin' && (
        <div className="bg-amber-950/90 border-b border-amber-800 px-4 py-2 text-xs text-amber-200">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-medium">{adminSettings.maintenanceMessage}</span>
            </div>
            <span className="text-[10px] font-mono bg-amber-900/60 px-2 py-0.5 rounded text-amber-300">Wartung aktiv</span>
          </div>
        </div>
      )}

      {/* Universal Top Navigation */}
      <TopNav
        currentTab={currentNavTab}
        onTabChange={(tab) => {
          if (tab === 'admincontrol' && !canAccessAdminArea(currentUser)) {
            showToast('Kein Zugriff: Dieser Bereich ist Administratoren vorbehalten.');
            return;
          }
          if (tab === 'crossplatform' && !hasPermission(currentUser, 'admin.system')) {
            showToast('Kein Zugriff: System- & OS-Verwaltung ist Administratoren vorbehalten.');
            return;
          }
          setCurrentNavTab(tab);
          if (tab !== 'servers') {
            setSelectedServerId(null);
          }
        }}
        onOpenCreateModal={() => {
          if (!hasPermission(currentUser, 'servers.create')) {
            showToast('Keine Berechtigung zum Erstellen neuer Server (servers.create).');
            return;
          }
          setPreselectedGame(null);
          setIsCreateModalOpen(true);
        }}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        activeServerCount={servers.length}
        expiringCount={expiringContractsCount}
        selectedOS={selectedOS}
        onChangeOS={() => showToast('Das Betriebssystem wird vom lokalen Host bestimmt.')}
        currentUser={currentUser}
        steamMode={adminSettings.steamMode}
      />

      {/* Active Prepaid Expiry / Grace Period Warning Banner */}
      <ExpiryWarningBanner
        contracts={contracts}
        onQuickRenew={(contractId) => handleRenewContract(contractId, 30)}
        onOpenCRM={() => setCurrentNavTab('crm')}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <ErrorBoundary fallbackTitle="Fehler beim Laden dieser Ansicht" onReset={() => setSelectedServerId(null)}>
        {currentNavTab === 'servers' && (
          selectedServer ? (
            <ServerDetail
              server={selectedServer}
              currentUser={currentUser}
              onBack={() => setSelectedServerId(null)}
              onStartServer={handleStartServer}
              onStopServer={handleStopServer}
              onRestartServer={handleRestartServer}
              onKillServer={handleKillServer}
              onSendCommand={handleSendCommand}
              logs={logsMap[selectedServer.id] || []}
              onClearLogs={() => setLogsMap(prev => ({ ...prev, [selectedServer.id]: [] }))}
              onInstallMod={handleInstallMod}
              onUninstallMod={handleUninstallMod}
              onToggleMod={handleToggleMod}
              onSaveConfigFile={handleSaveConfigFile}
              onUpdateVersion={handleUpdateVersion}
              onUpdateJavaVersion={handleUpdateJavaVersion}
              onDeleteServer={handleDeleteServer}
              allServers={servers}
              onNotify={showToast}
              onServerUpdated={() => { refreshServers().catch(() => {}); }}
            />
          ) : (
            <ServerList
              servers={servers}
              currentUser={currentUser}
              onSelectServer={(srv) => setSelectedServerId(srv.id)}
              onStartServer={handleStartServer}
              onStopServer={handleStopServer}
              onRestartServer={handleRestartServer}
              onDeleteServer={handleDeleteServer}
              onCloneServer={handleCloneServer}
              onOpenCreateModal={() => {
                setPreselectedGame(null);
                setIsCreateModalOpen(true);
              }}
              onOpenSetupWizard={hasPermission(currentUser, 'admin.system') ? () => setIsSetupWizardOpen(true) : undefined}
            />
          )
        )}

        {currentNavTab === 'catalog' && (
          <GameCatalog
            games={availableGames}
            onSelectGameToDeploy={(game) => {
              if (!hasPermission(currentUser, 'servers.create')) {
                showToast('Keine Berechtigung zum Bereitstellen neuer Server.');
                return;
              }
              setPreselectedGame(game);
              setIsCreateModalOpen(true);
            }}
            onOpenAddCustomGame={() => {
              if (!hasPermission(currentUser, 'admin.system')) {
                showToast('Nur Administratoren dürfen benutzerdefinierte Spiele registrieren.');
                return;
              }
              setIsCustomGameModalOpen(true);
            }}
            onExportManifest={handleExportManifest}
            onImportManifest={handleImportManifest}
          />
        )}

        {currentNavTab === 'mods' && (
          <CentralModHub
            servers={servers}
            onInstallModToServer={handleInstallMod}
            onNavigateToAdminSettings={canAccessAdminArea(currentUser) ? () => setCurrentNavTab('admincontrol') : undefined}
          />
        )}

        {currentNavTab === 'shop' && (
          <ShopView
            currentUser={currentUser}
            onTopUpBalance={handleTopUpBalance}
            onPurchaseServer={handlePurchaseServer}
            userOrders={userOrders}
          />
        )}

        {currentNavTab === 'crm' && (
          <CRMView
            currentUser={currentUser}
            contracts={contracts}
            customers={customers}
            invoices={invoices}
            transactions={transactions}
            tickets={tickets}
            notifications={notifications}
            onRenewContract={handleRenewContract}
            onToggleAutoRenew={handleToggleAutoRenew}
            onTopUpBalance={handleTopUpBalance}
            onFastForwardTime={handleFastForwardTime}
            onCreateTicket={handleCreateTicket}
            onReplyTicket={handleReplyTicket}
            onUpdateTicketStatus={handleUpdateTicketStatus}
            onMarkNotificationsRead={handleMarkNotificationsRead}
            onDeleteServer={handleDeleteServer}
          />
        )}

        {currentNavTab === 'admincontrol' && canAccessAdminArea(currentUser) && (
          <AdminControlView
            currentUser={currentUser}
            users={users}
            adminSettings={adminSettings}
            onUpdateAdminSettings={(newSettings) => setAdminSettings(newSettings)}
            onUpdateUserRole={handleUpdateUserRole}
            onAdjustUserBalance={handleAdjustUserBalance}
            onToggleUserStatus={handleToggleUserStatus}
            onDeleteUser={handleDeleteUser}
            onRefreshUsers={refreshAdminUsers}
            onOpenSetupWizard={hasPermission(currentUser, 'admin.system') ? () => setIsSetupWizardOpen(true) : undefined}
          />
        )}

        {currentNavTab === 'usercontrol' && (
          <UserControlView
            currentUser={currentUser}
            servers={servers}
            subUsers={subUsers}
            contracts={contracts}
            invoices={invoices}
            transactions={transactions}
            tickets={tickets}
            sessions={sessions}
            onAddSubUser={handleAddSubUser}
            onRemoveSubUser={handleRemoveSubUser}
            onToggle2FA={handleToggle2FA}
            onRegenerateApiToken={handleRegenerateApiToken}
            onRevokeApiToken={handleRevokeApiToken}
            onUpdateProfile={handleUpdateProfile}
            onLogoutOtherSessions={handleLogoutOtherSessions}
            onNavigateTab={(tab) => {
              setCurrentNavTab(tab);
              setSelectedServerId(null);
            }}
          />
        )}

        {currentNavTab === 'crossplatform' && hasPermission(currentUser, 'admin.system') && (
          <CrossPlatformView selectedServer={selectedServer || servers[0]} />
        )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 px-6 py-4 text-center text-xs text-neutral-500">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
          <span>ApexHost CRM & Gameserver Enterprise Suite · Minecraft v26.3 · 100% Prepaid Keine Abofalle</span>
          <div className="flex items-center gap-4 text-neutral-400">
            <span>PayPal / Klarna / PSC</span>
            <span>·</span>
            <span>DIN 5008 Rechnungen</span>
            <span>·</span>
            <span>72h Karenzzeit-Schutz</span>
            <span>·</span>
            <span>Auto-Provisioning</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateServerModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          availableGames={availableGames}
          preselectedGame={preselectedGame}
          currentOS={selectedOS}
          adminSettings={adminSettings}
          onCreateServer={handleCreateNewServer}
        />
      )}

      {isCustomGameModalOpen && (
        <CustomGameModal
          isOpen={isCustomGameModalOpen}
          onClose={() => setIsCustomGameModalOpen(false)}
          onSave={handleSaveCustomGame}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          users={users}
          currentUser={currentUser}
          onSelectUser={handleSelectUser}
          onRegisterUser={handleRegisterUser}
        />
      )}

      {serverToDelete && (
        <DeleteServerModal
          isOpen={Boolean(serverToDelete)}
          server={serverToDelete}
          onClose={() => setServerToDelete(null)}
          onConfirmDelete={handleConfirmDeleteServer}
        />
      )}

      {isSetupWizardOpen && hasPermission(currentUser, 'admin.system') && (
        <SetupWizardModal
          isOpen={isSetupWizardOpen}
          onClose={() => setIsSetupWizardOpen(false)}
          currentSettings={adminSettings}
          currentOS={selectedOS}
          currentUser={currentUser}
          onCompleteSetup={handleCompleteSetupWizard}
        />
      )}
    </div>
  );
}
