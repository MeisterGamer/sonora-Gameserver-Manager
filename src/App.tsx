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
  ModItem 
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
import { LoginModal } from './components/LoginModal';
import { CRMView } from './components/CRMView';
import { ExpiryWarningBanner } from './components/ExpiryWarningBanner';

export default function App() {
  const [servers, setServers] = useState<ServerInstance[]>(getStoredServers);
  const [availableGames, setAvailableGames] = useState<GameDefinition[]>(getAllAvailableGames);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [currentNavTab, setCurrentNavTab] = useState<'servers' | 'catalog' | 'mods' | 'shop' | 'crm' | 'admincontrol' | 'usercontrol' | 'crossplatform'>('servers');
  const [selectedOS, setSelectedOS] = useState<PlatformOS>('linux');

  // Auth & User state
  const [users, setUsers] = useState<UserAccount[]>(getStoredUsers);
  const [currentUser, setCurrentUser] = useState<UserAccount>(getCurrentUser);
  const [subUsers, setSubUsers] = useState<SubUser[]>(getStoredSubUsers);
  const [userOrders, setUserOrders] = useState<ShopOrder[]>(getStoredOrders);

  // CRM, Contracts & Billing State
  const [contracts, setContracts] = useState<CustomerContract[]>(getStoredContracts);
  const [customers, setCustomers] = useState<CustomerProfile[]>(getStoredCustomers);
  const [invoices, setInvoices] = useState<Invoice[]>(getStoredInvoices);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>(getStoredTransactions);
  const [tickets, setTickets] = useState<SupportTicket[]>(getStoredTickets);
  const [notifications, setNotifications] = useState<ExpiryNotification[]>(getStoredNotifications);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(getStoredAdminSettings);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCustomGameModalOpen, setIsCustomGameModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [preselectedGame, setPreselectedGame] = useState<GameDefinition | null>(null);

  // Success toast message
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setGlobalToast(msg);
    setTimeout(() => setGlobalToast(null), 3500);
  };

  // Server console logs map
  const [logsMap, setLogsMap] = useState<Record<string, LogMessage[]>>({
    srv_paper_smp: [
      { id: 'l1', timestamp: '12:00:01', level: 'INFO', message: 'Starting PaperMC 26.3 server on 0.0.0.0:25565...' },
      { id: 'l2', timestamp: '12:00:03', level: 'INFO', message: 'Loading recipes, dimensions and datapacks for Minecraft 26.3...' },
      { id: 'l3', timestamp: '12:00:06', level: 'INFO', message: '[LuckPerms] Loading configuration and storage provider (H2)...' },
      { id: 'l4', timestamp: '12:00:07', level: 'INFO', message: '[EssentialsX] Loaded 12 modules and 4 warps.' },
      { id: 'l5', timestamp: '12:00:09', level: 'INFO', message: '[CoreProtect] Database connection established.' },
      { id: 'l6', timestamp: '12:00:10', level: 'INFO', message: 'Preparing spawn area for world: 100%' },
      { id: 'l7', timestamp: '12:00:11', level: 'SUCCESS', message: 'Done (10.421s)! For help, type "help"' },
      { id: 'l8', timestamp: '12:15:30', level: 'INFO', message: 'GamerAlex joined the game [192.168.1.104:54210]' },
      { id: 'l9', timestamp: '12:18:44', level: 'INFO', message: 'ShadowCrafter joined the game [84.115.42.12:49812]' },
      { id: 'l10', timestamp: '12:40:12', level: 'INFO', message: '[Server: Saved 3 worlds to disk]' }
    ],
    srv_palworld_prime: [
      { id: 'p1', timestamp: '13:30:00', level: 'INFO', message: '[PalServer] Initializing Unreal Engine Dedicated Server on UDP:8211...' },
      { id: 'p2', timestamp: '13:30:04', level: 'INFO', message: '[PalServer] Loading world save "world1" (32 players max)...' },
      { id: 'p3', timestamp: '13:30:08', level: 'SUCCESS', message: '[PalServer] Server started successfully and listening on port 8211.' },
      { id: 'p4', timestamp: '13:45:10', level: 'INFO', message: '[PalServer] Connected Steam client 76561198012345678' }
    ],
    srv_rust_pvp: [
      { id: 'r1', timestamp: '08:00:00', level: 'INFO', message: 'Server process stopped.' }
    ]
  });

  // Sync state to localStorage
  useEffect(() => { saveStoredServers(servers); }, [servers]);
  useEffect(() => { saveUsers(users); }, [users]);
  useEffect(() => { saveSubUsers(subUsers); }, [subUsers]);
  useEffect(() => { saveStoredContracts(contracts); }, [contracts]);
  useEffect(() => { saveStoredCustomers(customers); }, [customers]);
  useEffect(() => { saveStoredInvoices(invoices); }, [invoices]);
  useEffect(() => { saveStoredTransactions(transactions); }, [transactions]);
  useEffect(() => { saveStoredTickets(tickets); }, [tickets]);
  useEffect(() => { saveStoredNotifications(notifications); }, [notifications]);
  useEffect(() => { saveStoredAdminSettings(adminSettings); }, [adminSettings]);

  // Live telemetry ticker for active servers
  useEffect(() => {
    const timer = setInterval(() => {
      setServers((prevServers) =>
        prevServers.map((srv) => {
          if (srv.status === 'running') {
            const cpuDelta = (Math.random() * 4 - 2);
            const newCpu = Math.max(5, Math.min(85, Math.round((srv.cpuUsagePercent + cpuDelta) * 10) / 10));
            const ramDelta = Math.floor(Math.random() * 40 - 20);
            const newRam = Math.max(1024, Math.min(srv.allocatedRamGb * 1024, srv.ramUsageMb + ramDelta));
            const netIn = Math.max(10, Math.round((srv.networkInKb + Math.random() * 10 - 5) * 10) / 10);
            const netOut = Math.max(30, Math.round((srv.networkOutKb + Math.random() * 20 - 10) * 10) / 10);

            return {
              ...srv,
              uptimeSeconds: srv.uptimeSeconds + 3,
              cpuUsagePercent: newCpu,
              ramUsageMb: newRam,
              networkInKb: netIn,
              networkOutKb: netOut
            };
          }
          return srv;
        })
      );
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Server power handlers
  const handleStartServer = (id: string) => {
    // Check if contract is expired or in grace period
    const contract = contracts.find(c => c.serverId === id);
    if (contract && contract.status === 'grace_period') {
      alert(`Der Server "${contract.serverName}" befindet sich in der Karenzzeit und ist abgelaufen. Bitte verlängere zuerst das Prepaid-Guthaben!`);
      setCurrentNavTab('crm');
      return;
    }

    setServers(servers.map(s => s.id === id ? { ...s, status: 'starting' } : s));
    const now = new Date().toTimeString().slice(0, 8);
    const target = servers.find(s => s.id === id);

    setLogsMap(prev => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        { id: `log_${Date.now()}_1`, timestamp: now, level: 'INFO', message: `Initializing process on ${target?.targetOS || 'linux'} (NodeJS 24 Managed)...` },
        { id: `log_${Date.now()}_2`, timestamp: now, level: 'INFO', message: `Allocating ${target?.allocatedRamGb || 4} GB RAM with optimal GC flags.` }
      ]
    }));

    setTimeout(() => {
      setServers(prev => prev.map(s => s.id === id ? {
        ...s,
        status: 'running',
        uptimeSeconds: 1,
        cpuUsagePercent: 12.5,
        ramUsageMb: Math.round((s.allocatedRamGb * 1024) * 0.35)
      } : s));

      const doneTime = new Date().toTimeString().slice(0, 8);
      setLogsMap(prev => ({
        ...prev,
        [id]: [
          ...(prev[id] || []),
          { id: `log_${Date.now()}_3`, timestamp: doneTime, level: 'SUCCESS', message: `Server started successfully and listening on 0.0.0.0:${target?.port || 25565}` }
        ]
      }));
    }, 1800);
  };

  const handleStopServer = (id: string) => {
    setServers(servers.map(s => s.id === id ? { ...s, status: 'stopping' } : s));
    const now = new Date().toTimeString().slice(0, 8);
    setLogsMap(prev => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        { id: `log_${Date.now()}_1`, timestamp: now, level: 'WARN', message: 'Sending SIGTERM: Gracefully saving world state...' }
      ]
    }));

    setTimeout(() => {
      setServers(prev => prev.map(s => s.id === id ? {
        ...s,
        status: 'offline',
        uptimeSeconds: 0,
        cpuUsagePercent: 0,
        ramUsageMb: 0,
        currentPlayers: 0
      } : s));

      const stopTime = new Date().toTimeString().slice(0, 8);
      setLogsMap(prev => ({
        ...prev,
        [id]: [
          ...(prev[id] || []),
          { id: `log_${Date.now()}_2`, timestamp: stopTime, level: 'INFO', message: 'Process exited with code 0 (Offline).' }
        ]
      }));
    }, 1400);
  };

  const handleRestartServer = (id: string) => {
    handleStopServer(id);
    setTimeout(() => { handleStartServer(id); }, 1800);
  };

  const handleKillServer = (id: string) => {
    setServers(servers.map(s => s.id === id ? {
      ...s,
      status: 'offline',
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      currentPlayers: 0
    } : s));
    const now = new Date().toTimeString().slice(0, 8);
    setLogsMap(prev => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        { id: `log_${Date.now()}`, timestamp: now, level: 'ERROR', message: 'SIGKILL received: Process forcefully terminated.' }
      ]
    }));
  };

  const handleDeleteServer = (id: string) => {
    if (confirm('Möchtest du diesen Gameserver wirklich unwiderruflich löschen?')) {
      setServers(servers.filter(s => s.id !== id));
      setContracts(contracts.filter(c => c.serverId !== id));
      if (selectedServerId === id) {
        setSelectedServerId(null);
      }
      showToast('Server erfolgreich gelöscht.');
    }
  };

  // Interactive Command Execution
  const handleSendCommand = (id: string, cmd: string) => {
    const timestamp = new Date().toTimeString().slice(0, 8);
    const targetServer = servers.find(s => s.id === id);
    const isMc = targetServer?.category === 'minecraft';

    let responseLevel: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO';
    let responseText = '';

    const lower = cmd.toLowerCase().trim();

    if (lower === 'help') {
      responseText = isMc
        ? 'Verfügbare Befehle: list, tps, op <spieler>, deop <spieler>, kick <spieler>, ban <spieler>, say <nachricht>, save-all, whitelist <on|off|add>, stop'
        : 'Verfügbare Befehle: status, rcon status, say <nachricht>, kick <spieler>, save, restart, players';
    } else if (lower === 'list' || lower === 'players') {
      responseText = `Es sind ${targetServer?.currentPlayers || 0} von maximal ${targetServer?.maxPlayers || 20} Spielern online: GamerAlex, ShadowCrafter, NordicViking`;
    } else if (lower === 'tps') {
      responseText = `Aktuelle Server-Tickrate: TPS: ${targetServer?.tps || 20.0} (50.0ms tick), RAM: ${targetServer?.ramUsageMb || 4000}MB / ${targetServer?.maxRamMb || 8192}MB`;
    } else if (lower.startsWith('say ')) {
      const msg = cmd.slice(4);
      responseText = `[Server Broadcast]: ${msg}`;
    } else if (lower === 'save-all' || lower === 'save') {
      responseLevel = 'SUCCESS';
      responseText = 'Welt-Sicherung abgeschlossen. Alle Chunks und Spielerdaten auf Festplatte synchronisiert.';
    } else if (lower.startsWith('op ')) {
      const user = cmd.slice(3).trim();
      responseLevel = 'SUCCESS';
      responseText = `Dem Spieler '${user}' wurden Administrator-Rechte (OP Stufe 4) erteilt.`;
    } else if (lower.startsWith('kick ')) {
      const user = cmd.slice(5).trim();
      responseLevel = 'WARN';
      responseText = `Spieler '${user}' wurde durch die Konsole vom Server gekickt.`;
    } else if (lower.startsWith('ban ')) {
      const user = cmd.slice(4).trim();
      responseLevel = 'ERROR';
      responseText = `Spieler '${user}' wurde dauerhaft auf der Ban-Liste eingetragen.`;
    } else if (lower.startsWith('whitelist ')) {
      responseLevel = 'SUCCESS';
      responseText = `Whitelist-Einstellung aktualisiert: ${cmd.slice(10)}`;
    } else if (lower === 'stop') {
      handleStopServer(id);
      return;
    } else {
      responseText = `Befehl ausgeführt: "${cmd}"`;
    }

    setLogsMap(prev => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        { id: `cmd_${Date.now()}`, timestamp, level: 'INFO', message: `> ${cmd}` },
        { id: `res_${Date.now()}`, timestamp, level: responseLevel, message: responseText }
      ]
    }));
  };

  // Mod management
  const handleInstallMod = (serverId: string, mod: ModItem) => {
    setServers(servers.map(s => {
      if (s.id !== serverId) return s;
      const already = s.installedMods.find(m => m.modId === mod.id);
      if (already) return s;
      return {
        ...s,
        installedMods: [
          ...s.installedMods,
          {
            id: `inst_${Date.now()}`,
            modId: mod.id,
            name: mod.name,
            version: mod.version,
            enabled: true,
            installedAt: new Date().toISOString().slice(0, 10),
            source: mod.source,
            fileSize: mod.fileSize
          }
        ]
      };
    }));

    const now = new Date().toTimeString().slice(0, 8);
    setLogsMap(prev => ({
      ...prev,
      [serverId]: [
        ...(prev[serverId] || []),
        { id: `mod_${Date.now()}`, timestamp: now, level: 'SUCCESS', message: `Mod/Plugin "${mod.name}" v${mod.version} erfolgreich installiert.` }
      ]
    }));
    showToast(`"${mod.name}" wurde auf dem Server installiert.`);
  };

  const handleUninstallMod = (serverId: string, installedModId: string) => {
    setServers(servers.map(s => {
      if (s.id !== serverId) return s;
      return {
        ...s,
        installedMods: s.installedMods.filter(m => m.id !== installedModId)
      };
    }));
    showToast('Erweiterung deinstalliert.');
  };

  const handleToggleMod = (serverId: string, installedModId: string, enabled: boolean) => {
    setServers(servers.map(s => {
      if (s.id !== serverId) return s;
      return {
        ...s,
        installedMods: s.installedMods.map(m => m.id === installedModId ? { ...m, enabled } : m)
      };
    }));
  };

  const handleSaveConfigFile = (serverId: string, filename: string, content: string) => {
    setServers(servers.map(s => {
      if (s.id !== serverId) return s;
      return {
        ...s,
        configFiles: {
          ...s.configFiles,
          [filename]: content
        }
      };
    }));
  };

  // Manual server creation
  const handleCreateNewServer = (data: Partial<ServerInstance>) => {
    const newId = `srv_${Date.now().toString(36)}`;
    const newServer: ServerInstance = {
      id: newId,
      name: data.name || 'Gameserver',
      gameId: data.gameId || 'mc_paper',
      gameName: data.gameName || 'Minecraft',
      category: data.category || 'minecraft',
      status: 'offline',
      allocatedRamGb: data.allocatedRamGb || adminSettings.defaultRamAllocationGb || 6,
      port: data.port || 25565,
      queryPort: data.queryPort || 25565,
      rconPort: data.rconPort || 25575,
      targetOS: data.targetOS || selectedOS,
      autoRestart: data.autoRestart ?? true,
      version: data.version || adminSettings.defaultMinecraftVersion || '26.3',
      javaVersion: data.javaVersion || adminSettings.defaultJavaVersion || 'Java 21',
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      maxRamMb: (data.allocatedRamGb || adminSettings.defaultRamAllocationGb || 6) * 1024,
      diskUsageMb: 1200,
      networkInKb: 0,
      networkOutKb: 0,
      currentPlayers: 0,
      maxPlayers: data.maxPlayers || 20,
      tps: data.tps || 20.0,
      installedMods: [],
      configFiles: data.configFiles || {},
      createdAt: new Date().toISOString()
    };

    setServers([newServer, ...servers]);
    setLogsMap(prev => ({
      ...prev,
      [newId]: [
        { id: 'init', timestamp: new Date().toTimeString().slice(0, 8), level: 'INFO', message: `Server-Instanz "${newServer.name}" (Minecraft ${newServer.version}) bereitgestellt auf Node 01.` }
      ]
    }));

    // Create 30-day Prepaid contract for this server
    const newContract: CustomerContract = {
      id: `cnt_${Date.now().toString(36)}`,
      customerId: currentUser.id,
      customerName: currentUser.username,
      serverId: newId,
      serverName: newServer.name,
      gameName: newServer.gameName,
      planName: 'Manueller Test-Server',
      monthlyPrice: 0.00,
      startDate: new Date().toISOString().slice(0, 10),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      daysRemaining: 30,
      autoRenew: true,
      status: 'active',
      location: 'Frankfurt am Main (DE)',
      ipAddress: `185.120.44.10:${newServer.port}`
    };
    setContracts([newContract, ...contracts]);

    setSelectedServerId(newId);
    setCurrentNavTab('servers');
    showToast(`Server "${newServer.name}" erfolgreich erstellt!`);
  };

  // Shop Purchase with Auto-Provisioning
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
    setCurrentUserId(user.id);
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

      {/* Top Warning Banner for Expiring Servers / Grace Period */}
      <ExpiryWarningBanner
        contracts={contracts}
        onQuickRenew={(contractId) => handleRenewContract(contractId, 30)}
        onOpenCRM={() => setCurrentNavTab('crm')}
      />

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
        activeServerCount={servers.length}
        expiringCount={expiringContractsCount}
        selectedOS={selectedOS}
        onChangeOS={setSelectedOS}
        currentUser={currentUser}
        steamMode={adminSettings.steamMode}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
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
            />
          ) : (
            <ServerList
              servers={servers}
              onSelectServer={(srv) => setSelectedServerId(srv.id)}
              onStartServer={handleStartServer}
              onStopServer={handleStopServer}
              onRestartServer={handleRestartServer}
              onDeleteServer={handleDeleteServer}
              onOpenCreateModal={() => {
                setPreselectedGame(null);
                setIsCreateModalOpen(true);
              }}
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
      <CreateServerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        availableGames={availableGames}
        preselectedGame={preselectedGame}
        currentOS={selectedOS}
        adminSettings={adminSettings}
        onCreateServer={handleCreateNewServer}
      />

      <CustomGameModal
        isOpen={isCustomGameModalOpen}
        onClose={() => setIsCustomGameModalOpen(false)}
        onSave={handleSaveCustomGame}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        users={users}
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
        onRegisterUser={handleRegisterUser}
      />
    </div>
  );
}
