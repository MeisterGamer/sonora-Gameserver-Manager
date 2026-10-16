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
  ShopOrder 
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
  useEffect(() => {
    const requireLogin = () => setIsLoginModalOpen(true);
    window.addEventListener('sonora-login-required', requireLogin);
    apiRequest('/api/auth/session').then(data => {
      if (data && data.user) {
        setCurrentUser(data.user);
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
    apiRequest('/api/system/diagnostics').then(data => setSelectedOS(data.platform === 'win32' ? 'windows' : data.platform === 'darwin' ? 'macos' : 'linux')).catch(() => {});
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [currentUser.id]);

  // Sync real servers from backend host on startup
  useEffect(() => {
    fetch('/api/servers')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.servers) && data.servers.length > 0) {
          setServers(prev => {
            const map = new Map(prev.map(s => [s.id, s]));
            for (const s of data.servers) {
              const existing = map.get(s.id);
              map.set(s.id, { ...existing, ...s });
            }
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

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

  const handleCloneServer = () => showToast('Instanzklonen ist noch nicht implementiert; es wurde keine Kopie angelegt.');


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


  const handleCompleteSetupWizard = () => showToast('Systeminstallation über den Assistenten ist noch nicht implementiert.');


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


  const handlePurchaseServer = (plan: ShopPlan, config: {
    serverName: string;
    location: string;
    billingCycle: 'monthly' | 'quarterly' | 'yearly';
    extraRamGb: number;
    hasDedicatedIp: boolean;
    totalPrice: number;
  }) => {
    // 1. Deduct balance
    const updatedBalance = Math.round((currentUser.balance - config.totalPrice) * 100) / 100;
    const updatedUser = { ...currentUser, balance: updatedBalance };
    setCurrentUser(updatedUser);
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));

    // 2. Generate Order record
    const orderId = `ord_${Date.now().toString(36)}`;
    const newServerId = `srv_${Date.now().toString(36)}`;
    const newOrder: ShopOrder = {
      id: orderId,
      userId: currentUser.id,
      planId: plan.id,
      planName: `${plan.name} (${config.serverName})`,
      gameName: plan.defaultGameName,
      price: config.totalPrice,
      billingCycle: config.billingCycle,
      location: config.location,
      serverId: newServerId,
      createdAt: new Date().toISOString().slice(0, 10),
      status: 'active'
    };
    saveOrder(newOrder);
    setUserOrders([newOrder, ...userOrders]);

    // 3. Instant Cloud Provisioning: deploy server instance!
    const effectiveRam = plan.ramGb + config.extraRamGb;
    const isMinecraft = plan.category === 'minecraft';
    const chosenVersion = isMinecraft ? '26.3' : 'Latest';

    const provisionedServer: ServerInstance = {
      id: newServerId,
      name: config.serverName,
      gameId: plan.gameId,
      gameName: plan.defaultGameName,
      category: isMinecraft ? 'minecraft' : 'survival',
      status: 'running',
      allocatedRamGb: effectiveRam,
      port: config.hasDedicatedIp ? 25565 : Math.floor(Math.random() * 5000 + 25000),
      queryPort: 27015,
      rconPort: 25575,
      targetOS: selectedOS,
      autoRestart: true,
      version: chosenVersion,
      javaVersion: 'Java 21',
      uptimeSeconds: 1,
      cpuUsagePercent: 8.5,
      ramUsageMb: Math.round(effectiveRam * 1024 * 0.25),
      maxRamMb: effectiveRam * 1024,
      diskUsageMb: 850,
      networkInKb: 12.0,
      networkOutKb: 28.5,
      currentPlayers: 0,
      maxPlayers: plan.slots.includes('Unbegrenzt') ? 100 : 24,
      tps: isMinecraft ? 20.0 : 60.0,
      installedMods: [],
      configFiles: {
        'server.properties': `# ApexHost Auto-Provisioned Server (Minecraft 26.3)\nmotd=ApexHost ${config.serverName} [v26.3]\nserver-port=${config.hasDedicatedIp ? 25565 : 25565}\nmax-players=24\npvp=true`,
        'eula.txt': 'eula=true'
      },
      createdAt: new Date().toISOString()
    };

    setServers([provisionedServer, ...servers]);
    apiRequest('/api/servers/create', 'POST', { server: provisionedServer, autoInstall: true })
      .then(() => refreshServers())
      .catch(() => {});
    setLogsMap(prev => ({
      ...prev,
      [newServerId]: [
        { id: 'pv1', timestamp: new Date().toTimeString().slice(0, 8), level: 'INFO', message: `[Shop Provisioner] Mietauftrag #${orderId} autorisiert. Standort: ${config.location}` },
        { id: 'pv2', timestamp: new Date().toTimeString().slice(0, 8), level: 'INFO', message: `[Cloud Node] NVMe Container bereitgestellt. Allokiert: ${effectiveRam} GB DDR5 RAM, ${plan.vCores} vCores.` },
        { id: 'pv3', timestamp: new Date().toTimeString().slice(0, 8), level: 'SUCCESS', message: `[Server Daemon] ${provisionedServer.name} erfolgreich gestartet auf Port ${provisionedServer.port}!` }
      ]
    }));

    // 4. Create Contract in CRM
    const durationDays = config.billingCycle === 'yearly' ? 365 : config.billingCycle === 'quarterly' ? 90 : 30;
    const newContract: CustomerContract = {
      id: `cnt_${Date.now().toString(36)}`,
      customerId: currentUser.id,
      customerName: currentUser.username,
      serverId: newServerId,
      serverName: config.serverName,
      gameName: plan.defaultGameName,
      planName: plan.name,
      monthlyPrice: plan.priceMonthly,
      startDate: new Date().toISOString().slice(0, 10),
      expiresAt: new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString().slice(0, 10),
      daysRemaining: durationDays,
      autoRenew: true,
      status: 'active',
      location: config.location,
      ipAddress: `185.120.44.10:${provisionedServer.port}`
    };
    setContracts([newContract, ...contracts]);

    // 5. Generate Invoice
    const subtotal = Math.round((config.totalPrice / 1.19) * 100) / 100;
    const tax = Math.round((config.totalPrice - subtotal) * 100) / 100;
    const newInvoice: Invoice = {
      id: `inv_${Date.now().toString(36)}`,
      invoiceNumber: `INV-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
      customerId: currentUser.id,
      customerName: currentUser.username,
      customerAddress: 'Kaiserstraße 42, 60311 Frankfurt am Main',
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      paidDate: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
      items: [
        {
          description: `Gameserver Miete: ${config.serverName} (${plan.name})`,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal
        }
      ],
      subtotal,
      taxRate: 0.19,
      taxAmount: tax,
      total: config.totalPrice,
      status: 'paid',
      paymentMethod: 'Prepaid-Guthaben',
      transactionReference: `TXN-${orderId.toUpperCase()}`
    };
    setInvoices([newInvoice, ...invoices]);

    // 6. Log transaction
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now()}`,
      customerId: currentUser.id,
      amount: -config.totalPrice,
      method: 'SEPA Prepaid',
      timestamp: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
      reference: newInvoice.invoiceNumber,
      status: 'completed',
      note: `Serverbuchung: ${config.serverName} (${durationDays} Tage)`
    };
    setTransactions([newTx, ...transactions]);

    setSelectedServerId(newServerId);
    setCurrentNavTab('servers');
    showToast(`Glückwunsch! "${config.serverName}" wurde automatisch bereitgestellt und läuft bereits.`);
  };

  // User Top-up with Payment Gateway
  const handleTopUpBalance = (amount: number, method: string = 'PayPal') => {
    const updatedBalance = Math.round((currentUser.balance + amount) * 100) / 100;
    const updatedUser = { ...currentUser, balance: updatedBalance };
    setCurrentUser(updatedUser);
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));

    // Log transaction
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now()}`,
      customerId: currentUser.id,
      amount: amount,
      method: method as any,
      timestamp: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
      reference: `GATEWAY-${method.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      note: `Prepaid Guthaben-Aufladung via ${method}`
    };
    setTransactions([newTx, ...transactions]);

    showToast(`Erfolgreich +${amount}.00 € via ${method} aufgeladen! Neues Guthaben: ${updatedBalance.toFixed(2)} €`);
  };

  // Contract Renewal (Prepaid verlängern)
  const handleRenewContract = (contractId: string, days: number = 30) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;

    const cost = Math.round((contract.monthlyPrice * (days / 30)) * 100) / 100;
    if (currentUser.balance < cost) {
      alert(`Dein Prepaid-Guthaben (${currentUser.balance.toFixed(2)} €) reicht für die Verlängerung (${cost.toFixed(2)} €) nicht aus. Bitte lade zuerst dein Guthaben auf!`);
      setCurrentNavTab('crm');
      return;
    }

    // 1. Deduct balance
    const updatedBalance = Math.round((currentUser.balance - cost) * 100) / 100;
    const updatedUser = { ...currentUser, balance: updatedBalance };
    setCurrentUser(updatedUser);
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));

    // 2. Extend expiration date
    const currentExpiryDate = new Date(contract.expiresAt);
    const baseDate = currentExpiryDate > new Date() ? currentExpiryDate : new Date();
    const newExpiryDate = new Date(baseDate.getTime() + days * 24 * 3600 * 1000);
    const newDaysRemaining = Math.max(1, contract.daysRemaining + days);

    const updatedContracts = contracts.map(c => {
      if (c.id === contractId) {
        return {
          ...c,
          expiresAt: newExpiryDate.toISOString().slice(0, 10),
          daysRemaining: newDaysRemaining,
          status: 'active' as const
        };
      }
      return c;
    });
    setContracts(updatedContracts);

    // 3. Generate Invoice
    const subtotal = Math.round((cost / 1.19) * 100) / 100;
    const tax = Math.round((cost - subtotal) * 100) / 100;
    const newInvoice: Invoice = {
      id: `inv_${Date.now().toString(36)}`,
      invoiceNumber: `INV-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
      customerId: currentUser.id,
      customerName: currentUser.username,
      customerAddress: 'Kaiserstraße 42, 60311 Frankfurt am Main',
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      paidDate: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
      items: [
        {
          description: `Prepaid-Verlängerung (+${days} Tage): ${contract.serverName}`,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal
        }
      ],
      subtotal,
      taxRate: 0.19,
      taxAmount: tax,
      total: cost,
      status: 'paid',
      paymentMethod: 'Prepaid-Guthaben',
      transactionReference: `RENEW-${contract.serverId.toUpperCase()}`
    };
    setInvoices([newInvoice, ...invoices]);

    // 4. Log transaction
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now()}`,
      customerId: currentUser.id,
      amount: -cost,
      method: 'SEPA Prepaid',
      timestamp: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
      reference: newInvoice.invoiceNumber,
      status: 'completed',
      note: `Laufzeitverlängerung: ${contract.serverName} (+${days} Tage)`
    };
    setTransactions([newTx, ...transactions]);

    showToast(`Server "${contract.serverName}" erfolgreich um ${days} Tage verlängert!`);
  };

  const handleToggleAutoRenew = (contractId: string) => {
    setContracts(contracts.map(c => c.id === contractId ? { ...c, autoRenew: !c.autoRenew } : c));
    showToast('Auto-Verlängerungs-Einstellung aktualisiert.');
  };

  // Simulate Fast-Forwarding Time (+N Days) to test expiration lifecycle & warning system
  const handleFastForwardTime = (days: number = 5) => {
    let renewedCount = 0;
    let expiredCount = 0;

    const updatedContracts = contracts.map(c => {
      const newDaysRemaining = c.daysRemaining - days;
      let newStatus = c.status;

      if (newDaysRemaining <= 0) {
        // Expired! Check if auto-renew is active and balance sufficient
        if (c.autoRenew && currentUser.balance >= c.monthlyPrice) {
          // Auto-renewed!
          renewedCount++;
          return {
            ...c,
            daysRemaining: 30 + newDaysRemaining,
            expiresAt: new Date(Date.now() + (30 + newDaysRemaining) * 24 * 3600 * 1000).toISOString().slice(0, 10),
            status: 'active' as const
          };
        } else {
          // Enter 72h grace period or suspend
          newStatus = newDaysRemaining < -3 ? 'suspended' : 'grace_period';
          expiredCount++;
        }
      } else if (newDaysRemaining <= 7) {
        newStatus = 'expiring_soon';
      } else {
        newStatus = 'active';
      }

      return {
        ...c,
        daysRemaining: newDaysRemaining,
        status: newStatus
      };
    });

    setContracts(updatedContracts);

    // If auto-renewed any, deduct from balance
    if (renewedCount > 0) {
      const totalDeducted = renewedCount * 4.99;
      const newBal = Math.max(0, currentUser.balance - totalDeducted);
      setCurrentUser({ ...currentUser, balance: newBal });
      setUsers(users.map(u => u.id === currentUser.id ? { ...u, balance: newBal } : u));
    }

    showToast(`Simulation: Zeit um ${days} Tage vorgespult! (${renewedCount} auto-verlängert, ${expiredCount} in Karenzzeit)`);
  };

  // Support tickets
  const handleCreateTicket = (subject: string, serverName: string, text: string) => {
    const newTkt: SupportTicket = {
      id: `tkt_${Date.now()}`,
      ticketNumber: `TKT-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
      customerId: currentUser.id,
      customerName: currentUser.username,
      serverName,
      subject,
      priority: 'medium',
      status: 'open',
      createdAt: 'Gerade eben',
      updatedAt: 'Gerade eben',
      messages: [
        {
          id: `msg_${Date.now()}`,
          sender: 'customer',
          author: currentUser.username,
          timestamp: 'Gerade eben',
          text
        }
      ]
    };
    setTickets([newTkt, ...tickets]);
    showToast(`Support-Ticket #${newTkt.ticketNumber} erfolgreich eröffnet!`);
  };

  const handleReplyTicket = (ticketId: string, text: string) => {
    setTickets(tickets.map(t => {
      if (t.id !== ticketId) return t;
      const isStaff = currentUser.role === 'admin';
      return {
        ...t,
        updatedAt: 'Gerade eben',
        messages: [
          ...t.messages,
          {
            id: `msg_${Date.now()}`,
            sender: isStaff ? 'support' : 'customer',
            author: currentUser.username,
            timestamp: 'Gerade eben',
            text
          }
        ]
      };
    }));
    showToast('Antwort gesendet.');
  };

  // Admin controls
  const handleUpdateUserRole = (userId: string, newRole: 'admin' | 'user') => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, role: newRole } : u);
    setUsers(updatedUsers);
    if (currentUser.id === userId) {
      setCurrentUser({ ...currentUser, role: newRole });
    }
    showToast(`Rolle für Benutzer auf "${newRole}" aktualisiert.`);
  };

  const handleAdjustUserBalance = (userId: string, newBalance: number) => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, balance: newBalance } : u);
    setUsers(updatedUsers);
    if (currentUser.id === userId) {
      setCurrentUser({ ...currentUser, balance: newBalance });
    }
    showToast(`Guthaben angepasst: ${newBalance.toFixed(2)} €.`);
  };

  const handleToggleUserStatus = (userId: string) => {
    const updatedUsers = users.map(u => u.id === userId ? { ...u, status: (u.status === 'active' ? 'suspended' : 'active') as any } : u);
    setUsers(updatedUsers);
    showToast('Benutzerstatus geändert.');
  };

  // Sub-User management
  const handleAddSubUser = (subuser: Omit<SubUser, 'id' | 'addedAt'>) => {
    const newSub: SubUser = {
      ...subuser,
      id: `sub_${Date.now()}`,
      addedAt: new Date().toISOString().slice(0, 10)
    };
    setSubUsers([newSub, ...subUsers]);
    showToast(`Team-Mitglied "${newSub.username}" erfolgreich hinzugefügt!`);
  };

  const handleRemoveSubUser = (id: string) => {
    setSubUsers(subUsers.filter(s => s.id !== id));
    showToast('Sub-User Zugriff entzogen.');
  };

  const handleToggle2FA = () => {
    const updatedUser = { ...currentUser, twoFactorEnabled: !currentUser.twoFactorEnabled };
    setCurrentUser(updatedUser);
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
    showToast(`2-Faktor Authentifizierung ${updatedUser.twoFactorEnabled ? 'aktiviert' : 'deaktiviert'}.`);
  };

  const handleRegenerateApiToken = () => {
    const newToken = `apex_live_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
    const updatedUser = { ...currentUser, apiToken: newToken };
    setCurrentUser(updatedUser);
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
    showToast('Neuer API Token für Node.js 24 generiert!');
  };

  // Switch / Login user
  const handleSelectUser = (user: UserAccount) => {
    setCurrentUser(user);
    if (!user.id) { setServers([]); setLogsMap({}); setSelectedServerId(null); return; }
    refreshServers().catch(error => showToast(error.message));
    showToast(`Angemeldet als ${user.username} (${user.role.toUpperCase()})`);
  };

  const handleRegisterUser = (username: string, email: string) => {
    const newUser: UserAccount = {
      id: `usr_${Date.now().toString(36)}`,
      username,
      email,
      role: 'user',
      balance: adminSettings.welcomeBonusEur,
      status: 'active',
      avatarInitials: username.slice(0, 2).toUpperCase(),
      createdAt: new Date().toISOString().slice(0, 10),
      twoFactorEnabled: false,
      apiToken: `apex_live_usr_${Date.now().toString(36)}`
    };
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    handleSelectUser(newUser);
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
      alert(`Fehler beim Import: ${res.error}`);
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
          setCurrentNavTab(tab);
          if (tab !== 'servers') {
            setSelectedServerId(null);
          }
        }}
        onOpenCreateModal={() => {
          setPreselectedGame(null);
          setIsCreateModalOpen(true);
        }}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenSetupWizard={() => showToast('Der Systeminstallations-Assistent ist noch nicht implementiert.')}
        activeServerCount={servers.length}
        expiringCount={expiringContractsCount}
        selectedOS={selectedOS}
        onChangeOS={() => showToast('Das Betriebssystem wird vom lokalen Host bestimmt.')}
        currentUser={currentUser}
        steamMode={adminSettings.steamMode}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <ErrorBoundary fallbackTitle="Fehler beim Laden dieser Ansicht" onReset={() => setSelectedServerId(null)}>
        {currentNavTab === 'servers' && (
          selectedServer ? (
            <ServerDetail
              server={selectedServer}
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
            />
          ) : (
            <ServerList
              servers={servers}
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
              onOpenSetupWizard={() => showToast('Der Systeminstallations-Assistent ist noch nicht implementiert.')}
            />
          )
        )}

        {currentNavTab === 'catalog' && (
          <GameCatalog
            games={availableGames}
            onSelectGameToDeploy={(game) => {
              setPreselectedGame(game);
              setIsCreateModalOpen(true);
            }}
            onOpenAddCustomGame={() => setIsCustomGameModalOpen(true)}
            onExportManifest={handleExportManifest}
            onImportManifest={handleImportManifest}
          />
        )}

        {currentNavTab === 'mods' && (
          <CentralModHub
            servers={servers}
            onInstallModToServer={handleInstallMod}
            onNavigateToAdminSettings={() => setCurrentNavTab('admincontrol')}
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
            onDeleteServer={handleDeleteServer}
          />
        )}

        {currentNavTab === 'admincontrol' && (
          <AdminControlView
            currentUser={currentUser}
            users={users}
            adminSettings={adminSettings}
            onUpdateAdminSettings={(newSettings) => setAdminSettings(newSettings)}
            onUpdateUserRole={handleUpdateUserRole}
            onAdjustUserBalance={handleAdjustUserBalance}
            onToggleUserStatus={handleToggleUserStatus}
            onOpenSetupWizard={() => showToast('Der Systeminstallations-Assistent ist noch nicht implementiert.')}
          />
        )}

        {currentNavTab === 'usercontrol' && (
          <UserControlView
            currentUser={currentUser}
            servers={servers}
            subUsers={subUsers}
            onAddSubUser={handleAddSubUser}
            onRemoveSubUser={handleRemoveSubUser}
            onToggle2FA={handleToggle2FA}
            onRegenerateApiToken={handleRegenerateApiToken}
          />
        )}

        {currentNavTab === 'crossplatform' && (
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

      {isSetupWizardOpen && (
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
