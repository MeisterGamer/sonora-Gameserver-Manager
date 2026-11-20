import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Express, Request } from 'express';
import { type AuthController, type StoredUserAccount, generateBase32Secret, validateEmail } from './auth.ts';
import type {
  CustomerContract,
  CustomerProfile,
  Invoice,
  PaymentTransaction,
  SupportTicket,
  ExpiryNotification
} from '../src/types/crm.ts';
import type { SubUser, ShopOrder, PermissionKey } from '../src/types/auth.ts';
import { SHOP_PLANS } from '../src/data/shopPlans.ts';

export interface CustomerSystemDeps {
  auth: AuthController;
  managerStateDir: string;
  dataDir: string;
  getServerRegistry: () => any[];
  upsertServerInRegistry: (server: any) => void;
  checkPortInUse: (port: number) => Promise<boolean>;
  getHostPrimaryIp: () => string;
  recordAuditLog: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'success' | 'security';
  }) => void;
  appendLog: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  installMinecraftServer: (serverId: string, srvDir: string, version?: string, engineType?: string, javaVersion?: string) => Promise<any>;
  installSteamGameServer: (serverId: string, srvDir: string, steamAppId: number, gameId?: string) => Promise<boolean>;
  onServerCreated?: (server: any) => void;
  activeProcesses: Map<string, any>;
}

export interface CustomerSystemController {
  canUserAccessServer: (user: StoredUserAccount, server: any) => boolean;
  getSubUsersForUser: (user: StoredUserAccount) => SubUser[];
  cleanupServerRecords: (serverId: string) => void;
}

const VALID_PERMISSIONS: PermissionKey[] = [
  'console_read',
  'console_write',
  'power_control',
  'files_edit',
  'mods_manage',
  'backups_manage'
];

const VALID_PAYMENT_METHODS = [
  'PayPal',
  'Kreditkarte',
  'Sofort / Klarna',
  'Paysafecard',
  'Krypto (BTC/ETH)',
  'SEPA Prepaid'
] as const;

export function configureCustomerSystem(app: Express, deps: CustomerSystemDeps): CustomerSystemController {
  const { auth, managerStateDir, dataDir } = deps;
  fs.mkdirSync(managerStateDir, { recursive: true });

  const ORDERS_FILE = path.join(managerStateDir, 'orders.json');
  const CONTRACTS_FILE = path.join(managerStateDir, 'contracts.json');
  const INVOICES_FILE = path.join(managerStateDir, 'invoices.json');
  const TRANSACTIONS_FILE = path.join(managerStateDir, 'transactions.json');
  const TICKETS_FILE = path.join(managerStateDir, 'tickets.json');
  const SUBUSERS_FILE = path.join(managerStateDir, 'subusers.json');
  const NOTIFICATIONS_FILE = path.join(managerStateDir, 'notifications.json');
  const ADMIN_SETTINGS_FILE = path.join(managerStateDir, 'admin-settings.json');

  const readJson = <T>(filePath: string, fallback: T): T => {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
      }
    } catch {}
    return fallback;
  };

  const writeJson = (filePath: string, data: unknown) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  };

  const getAdminBillingSettings = () => {
    const raw = readJson<Record<string, any>>(ADMIN_SETTINGS_FILE, {});
    return {
      warningDaysBefore: typeof raw.warningDaysBefore === 'number' ? raw.warningDaysBefore : 7,
      gracePeriodHours: typeof raw.gracePeriodHours === 'number' ? raw.gracePeriodHours : 72,
      taxRatePercent: typeof raw.taxRatePercent === 'number' ? raw.taxRatePercent : 19,
      autoSuspendOnExpiry: raw.autoSuspendOnExpiry !== false,
      portRangeStart: typeof raw.portRangeStart === 'number' ? raw.portRangeStart : 25565,
      portRangeEnd: typeof raw.portRangeEnd === 'number' ? raw.portRangeEnd : 29999,
      defaultMinecraftVersion: typeof raw.defaultMinecraftVersion === 'string' ? raw.defaultMinecraftVersion : '1.21.4',
      defaultJavaVersion: typeof raw.defaultJavaVersion === 'string' ? raw.defaultJavaVersion : 'Java 21'
    };
  };

  const formatTimestamp = (date = new Date()): string => {
    return `${date.toISOString().slice(0, 10)} ${date.toTimeString().slice(0, 5)}`;
  };

  const formatCustomerAddress = (user: StoredUserAccount): string => {
    const lines: string[] = [];
    if (user.company) lines.push(user.company);
    if (user.street) lines.push(user.street);
    if (user.zipCity) lines.push(user.zipCity);
    if (user.country) lines.push(user.country);
    if (lines.length === 0) {
      return `Kundennummer: ${user.customerNumber}\n${user.email || 'Keine Adresse hinterlegt'}`;
    }
    return lines.join('\n');
  };

  const nextInvoiceNumber = (existing: Invoice[]): string => {
    const year = new Date().getFullYear();
    const seq = existing.length + 1001;
    return `INV-${year}-${seq}`;
  };

  const nextTicketNumber = (existing: SupportTicket[]): string => {
    const year = new Date().getFullYear();
    const seq = existing.length + 1001;
    return `TKT-${year}-${seq}`;
  };

  // Register welcome bonus transaction automatically when a new user registers
  auth.setOnUserRegisteredHook((newUser, welcomeBonus) => {
    if (welcomeBonus > 0) {
      const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
      const tx: PaymentTransaction = {
        id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
        customerId: newUser.id,
        amount: welcomeBonus,
        method: 'SEPA Prepaid',
        timestamp: formatTimestamp(),
        reference: `WELCOME-${newUser.customerNumber}`,
        status: 'completed',
        note: `Neukunden-Startguthaben bei Registrierung (${newUser.customerNumber})`
      };
      transactions.unshift(tx);
      writeJson(TRANSACTIONS_FILE, transactions);
    }
    deps.recordAuditLog({
      serverId: 'system',
      action: 'register',
      user: newUser.username,
      details: `Neues Kundenkonto "${newUser.username}" (${newUser.customerNumber}, ${newUser.email}) registriert`,
      severity: 'success'
    });
  });

  const recomputeContracts = (): CustomerContract[] => {
    const settings = getAdminBillingSettings();
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const notifications = readJson<ExpiryNotification[]>(NOTIFICATIONS_FILE, []);
    const nowMs = Date.now();
    let changed = false;
    let notifChanged = false;

    const updated = contracts.map(c => {
      const expMs = Date.parse(c.expiresAt + 'T23:59:59Z');
      if (Number.isNaN(expMs)) return c;
      const daysRemaining = Math.ceil((expMs - nowMs) / (24 * 3600 * 1000));
      const graceDays = Math.max(1, Math.ceil(settings.gracePeriodHours / 24));
      let nextStatus = c.status;

      if (daysRemaining <= -graceDays) {
        nextStatus = 'suspended';
      } else if (daysRemaining <= 0) {
        nextStatus = 'grace_period';
      } else if (daysRemaining <= settings.warningDaysBefore) {
        nextStatus = 'expiring_soon';
      } else {
        nextStatus = 'active';
      }

      if (daysRemaining !== c.daysRemaining || nextStatus !== c.status) {
        changed = true;
      }

      if (nextStatus === 'expiring_soon' || nextStatus === 'grace_period' || nextStatus === 'suspended') {
        const notifType = nextStatus === 'suspended'
          ? 'suspended'
          : nextStatus === 'grace_period'
          ? 'grace_period'
          : daysRemaining <= 3 ? 'warning_3d' : 'warning_7d';
        const already = notifications.some(n => n.contractId === c.id && n.type === notifType && !n.read);
        if (!already) {
          notifications.unshift({
            id: `ntf_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
            contractId: c.id,
            serverName: c.serverName,
            type: notifType,
            daysLeft: daysRemaining,
            timestamp: formatTimestamp(),
            message: nextStatus === 'suspended'
              ? `Server "${c.serverName}" wurde nach Ablauf der Karenzzeit gesperrt.`
              : nextStatus === 'grace_period'
              ? `Server "${c.serverName}" ist abgelaufen und befindet sich in der ${settings.gracePeriodHours}h-Karenzzeit.`
              : `Server "${c.serverName}" läuft in ${daysRemaining} Tag(en) ab.`,
            read: false
          });
          notifChanged = true;
        }
      }

      return { ...c, daysRemaining, status: nextStatus };
    });

    if (changed) writeJson(CONTRACTS_FILE, updated);
    if (notifChanged) writeJson(NOTIFICATIONS_FILE, notifications.slice(0, 200));
    return updated;
  };

  const canUserAccessServer = (user: StoredUserAccount, server: any): boolean => {
    if (user.role === 'admin') return true;
    if (server.ownerId && server.ownerId === user.id) return true;
    const subUsers = readJson<SubUser[]>(SUBUSERS_FILE, []);
    const normEmail = (user.email || '').toLowerCase();
    const normUser = user.username.toLowerCase();
    return subUsers.some(
      sub =>
        sub.serverId === server.id &&
        ((sub.email && sub.email.toLowerCase() === normEmail) ||
          (sub.username && sub.username.toLowerCase() === normUser))
    );
  };

  const getSubUsersForUser = (user: StoredUserAccount): SubUser[] => {
    const all = readJson<SubUser[]>(SUBUSERS_FILE, []);
    if (user.role === 'admin') return all;
    const ownedServerIds = new Set(
      deps.getServerRegistry()
        .filter(s => s.ownerId === user.id)
        .map(s => s.id)
    );
    return all.filter(s => s.ownerId === user.id || ownedServerIds.has(s.serverId));
  };

  const buildCustomerProfiles = (targetUsers: StoredUserAccount[], invoices: Invoice[]): CustomerProfile[] => {
    return targetUsers.map(u => {
      const spent = invoices
        .filter(inv => inv.customerId === u.id && inv.status === 'paid')
        .reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName || u.username,
        company: u.company || undefined,
        email: u.email || '',
        phone: u.phone || 'Nicht hinterlegt',
        street: u.street || 'Nicht hinterlegt',
        zipCity: u.zipCity || 'Nicht hinterlegt',
        country: u.country || 'Deutschland',
        balance: Math.round((Number(u.balance) || 0) * 100) / 100,
        totalSpent: Math.round(spent * 100) / 100,
        customerNumber: u.customerNumber || 'KD-2026-0000',
        registeredAt: (u.createdAt || '').slice(0, 10),
        status: u.status || 'active'
      };
    });
  };

  const findNextFreePort = async (preferredPort: number): Promise<number> => {
    const settings = getAdminBillingSettings();
    const registry = deps.getServerRegistry();
    const usedPorts = new Set(registry.map(s => Number(s.port)).filter(Boolean));
    let port = preferredPort >= 1024 && preferredPort <= 65000 ? preferredPort : settings.portRangeStart;
    while (port <= Math.min(65000, Math.max(settings.portRangeEnd, port + 500))) {
      if (!usedPorts.has(port) && !(await deps.checkPortInUse(port))) {
        return port;
      }
      port++;
    }
    return preferredPort;
  };

  // ============================================================
  // 1. USERCP ENDPOINTS (/api/usercp/*)
  // ============================================================
  app.get('/api/usercp/overview', auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const currentToken = auth.extractToken(req);
    const contracts = recomputeContracts();
    const invoices = readJson<Invoice[]>(INVOICES_FILE, []);
    const tickets = readJson<SupportTicket[]>(TICKETS_FILE, []);
    const notifications = readJson<ExpiryNotification[]>(NOTIFICATIONS_FILE, []);
    const servers = deps.getServerRegistry().filter(s => canUserAccessServer(user, s));
    const userContracts = user.role === 'admin' ? contracts : contracts.filter(c => c.customerId === user.id);
    const userInvoices = user.role === 'admin' ? invoices : invoices.filter(i => i.customerId === user.id);
    const userTickets = user.role === 'admin' ? tickets : tickets.filter(t => t.customerId === user.id);
    const userContractIds = new Set(userContracts.map(c => c.id));
    const userNotifications = user.role === 'admin'
      ? notifications
      : notifications.filter(n => userContractIds.has(n.contractId));
    const totalSpent = invoices
      .filter(i => i.customerId === user.id && i.status === 'paid')
      .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

    res.json({
      success: true,
      user: {
        ...auth.toPublicUser(user, true),
        totalSpent: Math.round(totalSpent * 100) / 100
      },
      sessions: auth.listUserSessions(user.id, currentToken),
      subUsers: getSubUsersForUser(user),
      summary: {
        serverCount: servers.length,
        activeContractCount: userContracts.filter(c => c.status !== 'suspended').length,
        openTicketCount: userTickets.filter(t => t.status !== 'closed').length,
        invoiceCount: userInvoices.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        unreadNotifications: userNotifications.filter(n => !n.read).length
      }
    });
  });

  app.put('/api/usercp/profile', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const { fullName, email, company, phone, street, zipCity, country } = req.body || {};

    let nextEmail = user.email;
    if (typeof email === 'string' && email.trim()) {
      const check = validateEmail(email);
      if (!check.valid) {
        return res.status(400).json({ success: false, error: check.reason });
      }
      const cleanEmail = email.trim().toLowerCase();
      const duplicate = auth.listUsers().find(u => u.id !== user.id && u.email.toLowerCase() === cleanEmail);
      if (duplicate) {
        return res.status(409).json({ success: false, error: 'Diese E-Mail-Adresse wird bereits von einem anderen Konto verwendet.' });
      }
      nextEmail = cleanEmail;
    }

    const updated = auth.updateUser(user.id, {
      fullName: typeof fullName === 'string' ? fullName.trim().slice(0, 80) || user.username : user.fullName,
      email: nextEmail,
      company: typeof company === 'string' ? company.trim().slice(0, 80) : user.company,
      phone: typeof phone === 'string' ? phone.trim().slice(0, 40) : user.phone,
      street: typeof street === 'string' ? street.trim().slice(0, 100) : user.street,
      zipCity: typeof zipCity === 'string' ? zipCity.trim().slice(0, 80) : user.zipCity,
      country: typeof country === 'string' ? country.trim().slice(0, 60) || 'Deutschland' : user.country
    });

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }

    deps.recordAuditLog({
      serverId: 'system',
      action: 'profile_update',
      user: updated.username,
      details: `Kunden-Stammdaten aktualisiert (${updated.customerNumber})`,
      severity: 'info'
    });

    res.json({
      success: true,
      message: 'Profil- und Rechnungsdaten dauerhaft gespeichert.',
      user: auth.toPublicUser(updated, true)
    });
  });

  app.post('/api/usercp/2fa', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const desired = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !user.twoFactorEnabled;
    const secret = desired ? (user.twoFactorSecret || generateBase32Secret(20)) : '';

    const updated = auth.updateUser(user.id, {
      twoFactorEnabled: desired,
      twoFactorSecret: secret
    });

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }

    deps.recordAuditLog({
      serverId: 'system',
      action: '2fa_toggle',
      user: updated.username,
      details: `2-Faktor-Authentifizierung ${desired ? 'aktiviert' : 'deaktiviert'}`,
      severity: 'security'
    });

    res.json({
      success: true,
      message: desired ? '2-Faktor-Authentifizierung (TOTP) wurde aktiviert.' : '2-Faktor-Authentifizierung wurde deaktiviert.',
      user: auth.toPublicUser(updated, true)
    });
  });

  app.post('/api/usercp/api-token', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const newToken = `sonora_live_${randomBytes(24).toString('hex')}`;
    const updated = auth.updateUser(user.id, { apiToken: newToken });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }

    deps.recordAuditLog({
      serverId: 'system',
      action: 'api_token_rotate',
      user: updated.username,
      details: 'Persönlicher REST-API-Token neu generiert',
      severity: 'security'
    });

    res.json({
      success: true,
      message: 'Neuer kryptografischer API-Token generiert und gespeichert.',
      apiToken: newToken,
      user: auth.toPublicUser(updated, true)
    });
  });

  app.delete('/api/usercp/api-token', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const updated = auth.updateUser(user.id, { apiToken: '' });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }
    res.json({
      success: true,
      message: 'API-Token widerrufen.',
      user: auth.toPublicUser(updated, true)
    });
  });

  app.get('/api/usercp/subusers', auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    res.json({ success: true, subUsers: getSubUsersForUser(user) });
  });

  app.post('/api/usercp/subusers', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const { username, email, serverId, serverName, permissions } = req.body || {};

    if (typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Benutzername für Sub-User fehlt.' });
    }
    const eCheck = validateEmail(email || '');
    if (!eCheck.valid) {
      return res.status(400).json({ success: false, error: eCheck.reason });
    }
    if (typeof serverId !== 'string' || !serverId.trim()) {
      return res.status(400).json({ success: false, error: 'Bitte einen Ziel-Server auswählen.' });
    }

    const targetServer = deps.getServerRegistry().find(s => s.id === serverId);
    if (!targetServer) {
      return res.status(404).json({ success: false, error: 'Ausgewählter Server existiert nicht.' });
    }
    if (user.role !== 'admin' && targetServer.ownerId && targetServer.ownerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Du kannst nur für deine eigenen Server Sub-User einladen.' });
    }

    const cleanPerms: PermissionKey[] = Array.isArray(permissions)
      ? permissions.filter((p): p is PermissionKey => VALID_PERMISSIONS.includes(p))
      : ['console_read'];

    const allSubs = readJson<SubUser[]>(SUBUSERS_FILE, []);
    const newSub: SubUser = {
      id: `sub_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      ownerId: user.id,
      username: username.trim().slice(0, 40),
      email: email.trim().toLowerCase(),
      serverId: targetServer.id,
      serverName: serverName || targetServer.name || 'Gameserver',
      permissions: cleanPerms.length > 0 ? cleanPerms : ['console_read'],
      addedAt: new Date().toISOString().slice(0, 10)
    };
    allSubs.unshift(newSub);
    writeJson(SUBUSERS_FILE, allSubs);

    deps.recordAuditLog({
      serverId: targetServer.id,
      action: 'subuser_add',
      user: user.username,
      details: `Sub-User "${newSub.username}" (${newSub.email}) für Server "${newSub.serverName}" hinzugefügt`,
      severity: 'info'
    });

    res.status(201).json({
      success: true,
      message: `Team-Mitglied "${newSub.username}" dauerhaft hinzugefügt.`,
      subUser: newSub,
      subUsers: getSubUsersForUser(user)
    });
  });

  app.delete('/api/usercp/subusers/:id', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const subId = req.params.id;
    const allSubs = readJson<SubUser[]>(SUBUSERS_FILE, []);
    const target = allSubs.find(s => s.id === subId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Sub-User nicht gefunden.' });
    }
    if (user.role !== 'admin' && target.ownerId && target.ownerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung zum Entfernen dieses Sub-Users.' });
    }

    const remaining = allSubs.filter(s => s.id !== subId);
    writeJson(SUBUSERS_FILE, remaining);
    res.json({
      success: true,
      message: `Sub-User "${target.username}" entfernt.`,
      subUsers: getSubUsersForUser(user)
    });
  });

  // ============================================================
  // 2. CUSTOMER SYSTEM, CRM, BILLING & SHOP (/api/crm/*, /api/shop/*)
  // ============================================================
  app.get('/api/shop/plans', (_req, res) => {
    res.json({ success: true, plans: SHOP_PLANS });
  });

  app.get('/api/crm/state', auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const contracts = recomputeContracts();
    const allInvoices = readJson<Invoice[]>(INVOICES_FILE, []);
    const allTransactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
    const allTickets = readJson<SupportTicket[]>(TICKETS_FILE, []);
    const allNotifications = readJson<ExpiryNotification[]>(NOTIFICATIONS_FILE, []);
    const allOrders = readJson<ShopOrder[]>(ORDERS_FILE, []);
    const allUsers = auth.listUsers();

    const isAdmin = user.role === 'admin';
    const scopedContracts = isAdmin ? contracts : contracts.filter(c => c.customerId === user.id);
    const scopedInvoices = isAdmin ? allInvoices : allInvoices.filter(i => i.customerId === user.id);
    const scopedTransactions = isAdmin ? allTransactions : allTransactions.filter(t => t.customerId === user.id);
    const scopedTickets = isAdmin ? allTickets : allTickets.filter(t => t.customerId === user.id);
    const scopedOrders = isAdmin ? allOrders : allOrders.filter(o => o.userId === user.id);
    const scopedContractIds = new Set(scopedContracts.map(c => c.id));
    const scopedNotifications = isAdmin
      ? allNotifications
      : allNotifications.filter(n => scopedContractIds.has(n.contractId));
    const customers = buildCustomerProfiles(isAdmin ? allUsers : [user], allInvoices);

    res.json({
      success: true,
      user: auth.toPublicUser(user, true),
      contracts: scopedContracts,
      customers,
      invoices: scopedInvoices,
      transactions: scopedTransactions,
      tickets: scopedTickets,
      notifications: scopedNotifications,
      orders: scopedOrders
    });
  });

  app.post('/api/crm/topup', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const amount = Number(req.body?.amount);
    const rawMethod = typeof req.body?.method === 'string' ? req.body.method : 'PayPal';
    const method = VALID_PAYMENT_METHODS.includes(rawMethod as any) ? rawMethod : 'PayPal';

    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
      return res.status(400).json({ success: false, error: 'Aufladebetrag muss zwischen 1,00 € und 5.000,00 € liegen.' });
    }

    const cleanAmount = Math.round(amount * 100) / 100;
    const newBalance = Math.round(((Number(user.balance) || 0) + cleanAmount) * 100) / 100;
    const updatedUser = auth.updateUser(user.id, { balance: newBalance });
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }

    const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
    const ref = `TOPUP-${method.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}-${Date.now().toString().slice(-6)}`;
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      customerId: user.id,
      amount: cleanAmount,
      method: method as PaymentTransaction['method'],
      timestamp: formatTimestamp(),
      reference: ref,
      status: 'completed',
      note: `Prepaid Guthaben-Aufladung via ${method}`
    };
    transactions.unshift(newTx);
    writeJson(TRANSACTIONS_FILE, transactions);

    deps.recordAuditLog({
      serverId: 'system',
      action: 'balance_topup',
      user: user.username,
      details: `Prepaid-Aufladung +${cleanAmount.toFixed(2)} € via ${method} (Neues Guthaben: ${newBalance.toFixed(2)} €)`,
      severity: 'success'
    });

    res.json({
      success: true,
      message: `Erfolgreich +${cleanAmount.toFixed(2)} € via ${method} aufgeladen! Neues Guthaben: ${newBalance.toFixed(2)} €`,
      user: auth.toPublicUser(updatedUser, true),
      transaction: newTx
    });
  });

  app.post('/api/shop/purchase', auth.checkOriginGuard, auth.requireAuth, async (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const {
      planId,
      serverName,
      location,
      billingCycle = 'monthly',
      extraRamGb = 0,
      hasDedicatedIp = false,
      autoInstall = true
    } = req.body || {};

    const plan = SHOP_PLANS.find(p => p.id === planId);
    if (!plan) {
      return res.status(400).json({ success: false, error: 'Ausgewählter Tarif existiert nicht.' });
    }

    const safeExtraRam = Math.max(0, Math.min(32, parseInt(String(extraRamGb), 10) || 0));
    const safeCycle: 'monthly' | 'quarterly' | 'yearly' =
      billingCycle === 'quarterly' || billingCycle === 'yearly' ? billingCycle : 'monthly';

    // Server-authoritative price calculation (never trusts client-supplied price!)
    let monthlyBase = plan.priceMonthly + safeExtraRam * 1.0 + (hasDedicatedIp ? 2.5 : 0);
    const multiplier = safeCycle === 'yearly' ? 12 : safeCycle === 'quarterly' ? 3 : 1;
    const discount = safeCycle === 'yearly' ? 0.85 : safeCycle === 'quarterly' ? 0.95 : 1;
    const totalPrice = Math.round(monthlyBase * multiplier * discount * 100) / 100;
    const durationDays = safeCycle === 'yearly' ? 365 : safeCycle === 'quarterly' ? 90 : 30;

    if ((Number(user.balance) || 0) < totalPrice) {
      return res.status(400).json({
        success: false,
        error: `Nicht genügend Prepaid-Guthaben (${(Number(user.balance) || 0).toFixed(2)} € verfügbar, ${totalPrice.toFixed(2)} € benötigt).`
      });
    }

    // Deduct balance first
    const updatedBalance = Math.round((user.balance - totalPrice) * 100) / 100;
    const updatedUser = auth.updateUser(user.id, { balance: updatedBalance });
    if (!updatedUser) {
      return res.status(500).json({ success: false, error: 'Konto konnte nicht aktualisiert werden.' });
    }

    const billingCfg = getAdminBillingSettings();
    const cleanName = typeof serverName === 'string' && serverName.trim()
      ? serverName.trim().slice(0, 64)
      : `${plan.defaultGameName} Server`;
    const cleanLocation = typeof location === 'string' && location.trim()
      ? location.trim().slice(0, 80)
      : 'Frankfurt am Main (DE)';

    const isMc = plan.category === 'minecraft' || plan.gameId.startsWith('mc_');
    const serverId = `srv_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`;
    const orderId = `ord_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`;
    const preferredPort = isMc ? (hasDedicatedIp ? 25565 : billingCfg.portRangeStart) : 27015;
    const allocatedPort = await findNextFreePort(preferredPort);
    const effectiveRam = plan.ramGb + safeExtraRam;
    const srvDir = path.join(dataDir, serverId);
    fs.mkdirSync(srvDir, { recursive: true });

    if (isMc) {
      fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Generated by ApexHost Shop Provisioner\neula=true\n', 'utf8');
      fs.writeFileSync(
        path.join(srvDir, 'server.properties'),
        `server-port=${allocatedPort}\nmotd=§a${cleanName}§r\nonline-mode=true\nmax-players=${plan.slots.includes('Unbegrenzt') ? 100 : 24}\n`,
        'utf8'
      );
    }

    const provisionedServer = {
      id: serverId,
      ownerId: user.id,
      ownerUsername: user.username,
      name: cleanName,
      gameId: plan.gameId,
      gameName: plan.defaultGameName,
      category: isMc ? 'minecraft' : 'survival',
      allocatedRamGb: effectiveRam,
      port: allocatedPort,
      queryPort: allocatedPort + 1,
      rconPort: 25575,
      targetOS: 'linux',
      autoRestart: true,
      version: isMc ? billingCfg.defaultMinecraftVersion : 'Latest',
      minecraftType: isMc ? 'paper' : undefined,
      javaVersion: isMc ? billingCfg.defaultJavaVersion : undefined,
      uptimeSeconds: 0,
      cpuUsagePercent: 0,
      ramUsageMb: 0,
      maxRamMb: effectiveRam * 1024,
      diskUsageMb: 500,
      networkInKb: 0,
      networkOutKb: 0,
      currentPlayers: 0,
      maxPlayers: plan.slots.includes('Unbegrenzt') ? 100 : 24,
      tps: isMc ? 20.0 : 60.0,
      installedMods: [],
      configFiles: isMc
        ? {
            'server.properties': `server-port=${allocatedPort}\nmotd=§a${cleanName}§r\nonline-mode=true\nmax-players=${plan.slots.includes('Unbegrenzt') ? 100 : 24}\n`,
            'eula.txt': 'eula=true\n'
          }
        : {},
      createdAt: new Date().toISOString(),
      status: 'offline',
      isInstalled: false
    };

    deps.upsertServerInRegistry(provisionedServer);
    try { deps.onServerCreated?.(provisionedServer); } catch {}
    deps.appendLog(serverId, 'SUCCESS', `[Shop Provisioner] Auftrag #${orderId} für Kunde ${user.username} (${user.customerNumber}) bezahlt (${totalPrice.toFixed(2)} €). Port ${allocatedPort} zugewiesen.`);

    // Kick off real game installation in background (so checkout responds quickly without blocking HTTP)
    if (autoInstall) {
      const installPromise = isMc
        ? deps.installMinecraftServer(serverId, srvDir, provisionedServer.version, 'paper', provisionedServer.javaVersion)
        : deps.installSteamGameServer(serverId, srvDir, 0, plan.gameId);
      Promise.resolve(installPromise)
        .then(() => {
          deps.upsertServerInRegistry({ ...provisionedServer, isInstalled: true });
        })
        .catch((err: any) => {
          deps.appendLog(serverId, 'WARN', `[Shop Provisioner] Hintergrund-Installation Hinweis: ${err?.message || err}`);
        });
    }

    // Create Order
    const orders = readJson<ShopOrder[]>(ORDERS_FILE, []);
    const newOrder: ShopOrder = {
      id: orderId,
      userId: user.id,
      planId: plan.id,
      planName: `${plan.name} (${cleanName})`,
      gameName: plan.defaultGameName,
      price: totalPrice,
      billingCycle: safeCycle,
      location: cleanLocation,
      serverId,
      createdAt: new Date().toISOString().slice(0, 10),
      status: 'active'
    };
    orders.unshift(newOrder);
    writeJson(ORDERS_FILE, orders);

    // Create Contract
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const expiresDate = new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const newContract: CustomerContract = {
      id: `cnt_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      customerId: user.id,
      customerName: user.fullName || user.username,
      serverId,
      serverName: cleanName,
      gameName: plan.defaultGameName,
      planName: plan.name,
      monthlyPrice: Math.round(monthlyBase * 100) / 100,
      startDate: new Date().toISOString().slice(0, 10),
      expiresAt: expiresDate,
      daysRemaining: durationDays,
      autoRenew: true,
      status: 'active',
      location: cleanLocation,
      ipAddress: `${deps.getHostPrimaryIp()}:${allocatedPort}`
    };
    contracts.unshift(newContract);
    writeJson(CONTRACTS_FILE, contracts);

    // Create DIN 5008 Invoice
    const invoices = readJson<Invoice[]>(INVOICES_FILE, []);
    const taxRate = billingCfg.taxRatePercent / 100;
    const subtotal = Math.round((totalPrice / (1 + taxRate)) * 100) / 100;
    const taxAmount = Math.round((totalPrice - subtotal) * 100) / 100;
    const today = new Date().toISOString().slice(0, 10);
    const invNum = nextInvoiceNumber(invoices);
    const newInvoice: Invoice = {
      id: `inv_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      invoiceNumber: invNum,
      customerId: user.id,
      customerName: user.fullName || user.username,
      customerAddress: formatCustomerAddress(user),
      date: today,
      dueDate: today,
      paidDate: formatTimestamp(),
      items: [
        {
          description: `Gameserver Miete (${durationDays} Tage): ${cleanName} – ${plan.name}${safeExtraRam > 0 ? ` (+${safeExtraRam} GB RAM)` : ''}${hasDedicatedIp ? ' + Dedizierte IP' : ''}`,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal
        }
      ],
      subtotal,
      taxRate,
      taxAmount,
      total: totalPrice,
      status: 'paid',
      paymentMethod: 'Prepaid-Guthaben',
      transactionReference: `TXN-${orderId.toUpperCase()}`
    };
    invoices.unshift(newInvoice);
    writeJson(INVOICES_FILE, invoices);

    // Log Transaction
    const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      customerId: user.id,
      amount: -totalPrice,
      method: 'SEPA Prepaid',
      timestamp: formatTimestamp(),
      reference: invNum,
      status: 'completed',
      note: `Serverbuchung: ${cleanName} (${durationDays} Tage)`
    };
    transactions.unshift(newTx);
    writeJson(TRANSACTIONS_FILE, transactions);

    deps.recordAuditLog({
      serverId,
      action: 'shop_purchase',
      user: user.username,
      details: `Tarif "${plan.name}" für "${cleanName}" bestellt (${totalPrice.toFixed(2)} €, ${invNum}, Port ${allocatedPort})`,
      severity: 'success'
    });

    res.status(201).json({
      success: true,
      message: `Gameserver "${cleanName}" wurde bestellt und bereitgestellt (Port ${allocatedPort}, Rechnung ${invNum}).`,
      user: auth.toPublicUser(updatedUser, true),
      server: provisionedServer,
      order: newOrder,
      contract: newContract,
      invoice: newInvoice,
      transaction: newTx
    });
  });

  app.post('/api/crm/contracts/:id/renew', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const contractId = req.params.id;
    const days = Math.max(7, Math.min(365, parseInt(String(req.body?.days || 30), 10) || 30));

    const contracts = recomputeContracts();
    const idx = contracts.findIndex(c => c.id === contractId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Vertrag nicht gefunden.' });
    }
    const contract = contracts[idx];
    if (user.role !== 'admin' && contract.customerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Vertrag.' });
    }

    const cost = Math.round(contract.monthlyPrice * (days / 30) * 100) / 100;
    const payer = auth.getUserById(user.id);
    if (!payer || payer.balance < cost) {
      return res.status(400).json({
        success: false,
        error: `Prepaid-Guthaben (${(payer?.balance || 0).toFixed(2)} €) reicht für die Verlängerung (${cost.toFixed(2)} €) nicht aus.`
      });
    }

    const updatedBalance = Math.round((payer.balance - cost) * 100) / 100;
    const updatedUser = auth.updateUser(payer.id, { balance: updatedBalance })!;

    const currentExpiry = new Date(contract.expiresAt + 'T23:59:59Z');
    const baseTime = currentExpiry.getTime() > Date.now() ? currentExpiry.getTime() : Date.now();
    const newExpiryIso = new Date(baseTime + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const newDaysRemaining = Math.max(1, Math.ceil((Date.parse(newExpiryIso + 'T23:59:59Z') - Date.now()) / (24 * 3600 * 1000)));

    contracts[idx] = {
      ...contract,
      expiresAt: newExpiryIso,
      daysRemaining: newDaysRemaining,
      status: 'active'
    };
    writeJson(CONTRACTS_FILE, contracts);

    // Invoice
    const billingCfg = getAdminBillingSettings();
    const invoices = readJson<Invoice[]>(INVOICES_FILE, []);
    const taxRate = billingCfg.taxRatePercent / 100;
    const subtotal = Math.round((cost / (1 + taxRate)) * 100) / 100;
    const taxAmount = Math.round((cost - subtotal) * 100) / 100;
    const today = new Date().toISOString().slice(0, 10);
    const invNum = nextInvoiceNumber(invoices);
    const newInvoice: Invoice = {
      id: `inv_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      invoiceNumber: invNum,
      customerId: contract.customerId,
      customerName: updatedUser.fullName || updatedUser.username,
      customerAddress: formatCustomerAddress(updatedUser),
      date: today,
      dueDate: today,
      paidDate: formatTimestamp(),
      items: [
        {
          description: `Prepaid-Verlängerung (+${days} Tage): ${contract.serverName}`,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal
        }
      ],
      subtotal,
      taxRate,
      taxAmount,
      total: cost,
      status: 'paid',
      paymentMethod: 'Prepaid-Guthaben',
      transactionReference: `RENEW-${contract.serverId.toUpperCase()}`
    };
    invoices.unshift(newInvoice);
    writeJson(INVOICES_FILE, invoices);

    const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
    const newTx: PaymentTransaction = {
      id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      customerId: payer.id,
      amount: -cost,
      method: 'SEPA Prepaid',
      timestamp: formatTimestamp(),
      reference: invNum,
      status: 'completed',
      note: `Laufzeitverlängerung: ${contract.serverName} (+${days} Tage)`
    };
    transactions.unshift(newTx);
    writeJson(TRANSACTIONS_FILE, transactions);

    res.json({
      success: true,
      message: `Server "${contract.serverName}" erfolgreich um ${days} Tage verlängert (Rechnung ${invNum}).`,
      user: auth.toPublicUser(updatedUser, true),
      contract: contracts[idx],
      invoice: newInvoice,
      transaction: newTx
    });
  });

  app.post('/api/crm/contracts/:id/autorenew', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const contractId = req.params.id;
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const idx = contracts.findIndex(c => c.id === contractId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Vertrag nicht gefunden.' });
    }
    if (user.role !== 'admin' && contracts[idx].customerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Vertrag.' });
    }

    const nextAuto = typeof req.body?.autoRenew === 'boolean' ? req.body.autoRenew : !contracts[idx].autoRenew;
    contracts[idx] = { ...contracts[idx], autoRenew: nextAuto };
    writeJson(CONTRACTS_FILE, contracts);

    res.json({
      success: true,
      message: `Auto-Verlängerung für "${contracts[idx].serverName}" ${nextAuto ? 'aktiviert' : 'deaktiviert'}.`,
      contract: contracts[idx]
    });
  });

  app.post('/api/crm/tickets', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const { subject, serverName, text, priority } = req.body || {};

    if (typeof subject !== 'string' || !subject.trim() || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Betreff und Beschreibung dürfen nicht leer sein.' });
    }

    const tickets = readJson<SupportTicket[]>(TICKETS_FILE, []);
    const nowText = formatTimestamp();
    const ticketNumber = nextTicketNumber(tickets);
    const validPriority: SupportTicket['priority'] =
      priority === 'low' || priority === 'high' || priority === 'urgent' ? priority : 'medium';

    const newTicket: SupportTicket = {
      id: `tkt_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
      ticketNumber,
      customerId: user.id,
      customerName: user.fullName || user.username,
      serverName: typeof serverName === 'string' && serverName.trim() ? serverName.trim() : 'Allgemein',
      subject: subject.trim().slice(0, 120),
      priority: validPriority,
      status: 'open',
      createdAt: nowText,
      updatedAt: nowText,
      messages: [
        {
          id: `msg_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
          sender: 'customer',
          author: user.fullName || user.username,
          timestamp: nowText,
          text: text.trim().slice(0, 4000)
        }
      ]
    };

    tickets.unshift(newTicket);
    writeJson(TICKETS_FILE, tickets);

    deps.recordAuditLog({
      serverId: 'system',
      action: 'ticket_create',
      user: user.username,
      details: `Support-Ticket ${ticketNumber} eröffnet: "${newTicket.subject}"`,
      severity: 'info'
    });

    res.status(201).json({
      success: true,
      message: `Support-Ticket #${ticketNumber} erfolgreich eröffnet.`,
      ticket: newTicket
    });
  });

  app.post('/api/crm/tickets/:id/reply', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const ticketId = req.params.id;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, error: 'Antworttext darf nicht leer sein.' });
    }

    const tickets = readJson<SupportTicket[]>(TICKETS_FILE, []);
    const idx = tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden.' });
    }
    if (user.role !== 'admin' && tickets[idx].customerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf dieses Ticket.' });
    }

    const nowText = formatTimestamp();
    const isStaff = user.role === 'admin';
    tickets[idx] = {
      ...tickets[idx],
      status: isStaff ? 'in_progress' : (tickets[idx].status === 'closed' ? 'open' : tickets[idx].status),
      updatedAt: nowText,
      messages: [
        ...tickets[idx].messages,
        {
          id: `msg_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
          sender: isStaff ? 'support' : 'customer',
          author: isStaff ? `${user.username} (Support)` : (user.fullName || user.username),
          timestamp: nowText,
          text: text.slice(0, 4000)
        }
      ]
    };
    writeJson(TICKETS_FILE, tickets);

    res.json({
      success: true,
      message: 'Antwort gespeichert.',
      ticket: tickets[idx]
    });
  });

  app.patch('/api/crm/tickets/:id/status', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const ticketId = req.params.id;
    const status = req.body?.status;
    if (status !== 'open' && status !== 'in_progress' && status !== 'closed') {
      return res.status(400).json({ success: false, error: 'Ungültiger Ticket-Status.' });
    }

    const tickets = readJson<SupportTicket[]>(TICKETS_FILE, []);
    const idx = tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden.' });
    }
    if (user.role !== 'admin' && tickets[idx].customerId !== user.id) {
      return res.status(403).json({ success: false, error: 'Kein Zugriff auf dieses Ticket.' });
    }

    tickets[idx] = {
      ...tickets[idx],
      status,
      updatedAt: formatTimestamp()
    };
    writeJson(TICKETS_FILE, tickets);

    res.json({
      success: true,
      message: `Ticket #${tickets[idx].ticketNumber} auf "${status}" gesetzt.`,
      ticket: tickets[idx]
    });
  });

  app.post('/api/crm/notifications/read', auth.checkOriginGuard, auth.requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const notificationId = req.body?.id;
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const ownedContractIds = new Set(contracts.filter(c => user.role === 'admin' || c.customerId === user.id).map(c => c.id));
    const notifications = readJson<ExpiryNotification[]>(NOTIFICATIONS_FILE, []);

    const updated = notifications.map(n => {
      if (!ownedContractIds.has(n.contractId)) return n;
      if (!notificationId || n.id === notificationId) {
        return { ...n, read: true };
      }
      return n;
    });
    writeJson(NOTIFICATIONS_FILE, updated);
    res.json({ success: true, message: 'Benachrichtigungen als gelesen markiert.' });
  });

  app.post('/api/crm/simulate-days', auth.checkOriginGuard, auth.requireAdmin, (req, res) => {
    const days = Math.max(1, Math.min(90, parseInt(String(req.body?.days || 5), 10) || 5));
    const settings = getAdminBillingSettings();
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
    let renewedCount = 0;
    let expiredCount = 0;
    let suspendedCount = 0;

    const updatedContracts = contracts.map(c => {
      const expMs = Date.parse(c.expiresAt + 'T23:59:59Z') - days * 24 * 3600 * 1000;
      const newDaysRemaining = Math.ceil((expMs - Date.now()) / (24 * 3600 * 1000));
      let nextExpiry = new Date(expMs).toISOString().slice(0, 10);
      let nextStatus = c.status;

      if (newDaysRemaining <= 0) {
        const owner = auth.getUserById(c.customerId);
        if (c.autoRenew && owner && owner.balance >= c.monthlyPrice) {
          const newBal = Math.round((owner.balance - c.monthlyPrice) * 100) / 100;
          auth.updateUser(owner.id, { balance: newBal });
          nextExpiry = new Date(expMs + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          nextStatus = 'active';
          renewedCount++;
          transactions.unshift({
            id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
            customerId: owner.id,
            amount: -c.monthlyPrice,
            method: 'SEPA Prepaid',
            timestamp: formatTimestamp(),
            reference: `AUTORENEW-${c.serverId.toUpperCase()}`,
            status: 'completed',
            note: `Automatische Prepaid-Verlängerung: ${c.serverName} (+30 Tage)`
          });
        } else {
          const graceDays = Math.max(1, Math.ceil(settings.gracePeriodHours / 24));
          if (newDaysRemaining <= -graceDays) {
            nextStatus = 'suspended';
            suspendedCount++;
            if (settings.autoSuspendOnExpiry && deps.activeProcesses.has(c.serverId)) {
              try {
                deps.activeProcesses.get(c.serverId)?.process?.kill('SIGTERM');
                deps.activeProcesses.delete(c.serverId);
              } catch {}
            }
          } else {
            nextStatus = 'grace_period';
            expiredCount++;
          }
        }
      } else if (newDaysRemaining <= settings.warningDaysBefore) {
        nextStatus = 'expiring_soon';
      } else {
        nextStatus = 'active';
      }

      const finalDays = Math.ceil((Date.parse(nextExpiry + 'T23:59:59Z') - Date.now()) / (24 * 3600 * 1000));
      return { ...c, expiresAt: nextExpiry, daysRemaining: finalDays, status: nextStatus };
    });

    writeJson(CONTRACTS_FILE, updatedContracts);
    writeJson(TRANSACTIONS_FILE, transactions);

    res.json({
      success: true,
      message: `Zeit-Simulation (+${days} Tage): ${renewedCount} auto-verlängert, ${expiredCount} in Karenzzeit, ${suspendedCount} gesperrt.`,
      renewedCount,
      expiredCount,
      suspendedCount
    });
  });

  // ============================================================
  // 3. ADMIN USER MANAGEMENT (/api/admin/users*)
  // ============================================================
  app.get('/api/admin/users', auth.requireAdmin, (_req, res) => {
    const allUsers = auth.listUsers();
    const servers = deps.getServerRegistry();
    const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
    const invoices = readJson<Invoice[]>(INVOICES_FILE, []);

    const enriched = allUsers.map(u => {
      const spent = invoices
        .filter(inv => inv.customerId === u.id && inv.status === 'paid')
        .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
      return {
        ...auth.toPublicUser(u, false),
        totalSpent: Math.round(spent * 100) / 100,
        serverCount: servers.filter(s => s.ownerId === u.id).length,
        contractCount: contracts.filter(c => c.customerId === u.id).length
      };
    });

    res.json({ success: true, users: enriched });
  });

  app.patch('/api/admin/users/:id/role', auth.checkOriginGuard, auth.requireAdmin, (req, res) => {
    const actor: StoredUserAccount = (req as any).authUser;
    const targetId = req.params.id;
    const newRole = req.body?.role;
    if (newRole !== 'admin' && newRole !== 'user') {
      return res.status(400).json({ success: false, error: 'Ungültige Rolle (erlaubt: admin, user).' });
    }

    const target = auth.getUserById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    if (target.role === 'admin' && newRole === 'user') {
      const activeAdmins = auth.listUsers().filter(u => u.role === 'admin' && u.status === 'active');
      if (activeAdmins.length <= 1) {
        return res.status(400).json({ success: false, error: 'Der letzte aktive Administrator kann nicht herabgestuft werden.' });
      }
    }

    const updated = auth.updateUser(targetId, { role: newRole })!;
    deps.recordAuditLog({
      serverId: 'system',
      action: 'user_role_change',
      user: actor.username,
      details: `Rolle von "${updated.username}" geändert auf "${newRole}"`,
      severity: 'security'
    });

    res.json({
      success: true,
      message: `Rolle für "${updated.username}" auf "${newRole}" aktualisiert.`,
      user: auth.toPublicUser(updated, false)
    });
  });

  app.patch('/api/admin/users/:id/balance', auth.checkOriginGuard, auth.requireAdmin, (req, res) => {
    const actor: StoredUserAccount = (req as any).authUser;
    const targetId = req.params.id;
    const nextBalance = Number(req.body?.balance);
    if (!Number.isFinite(nextBalance) || nextBalance < 0 || nextBalance > 100000) {
      return res.status(400).json({ success: false, error: 'Guthaben muss zwischen 0,00 € und 100.000,00 € liegen.' });
    }

    const target = auth.getUserById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    const cleanBalance = Math.round(nextBalance * 100) / 100;
    const delta = Math.round((cleanBalance - (Number(target.balance) || 0)) * 100) / 100;
    const updated = auth.updateUser(targetId, { balance: cleanBalance })!;

    if (delta !== 0) {
      const transactions = readJson<PaymentTransaction[]>(TRANSACTIONS_FILE, []);
      transactions.unshift({
        id: `tx_${Date.now().toString(36)}_${randomBytes(2).toString('hex')}`,
        customerId: target.id,
        amount: delta,
        method: 'SEPA Prepaid',
        timestamp: formatTimestamp(),
        reference: `ADMIN-ADJ-${Date.now().toString().slice(-6)}`,
        status: 'completed',
        note: `Manuelle Guthaben-Anpassung durch Admin (${actor.username})`
      });
      writeJson(TRANSACTIONS_FILE, transactions);
    }

    deps.recordAuditLog({
      serverId: 'system',
      action: 'user_balance_adjust',
      user: actor.username,
      details: `Guthaben von "${updated.username}" angepasst auf ${cleanBalance.toFixed(2)} € (${delta >= 0 ? '+' : ''}${delta.toFixed(2)} €)`,
      severity: 'info'
    });

    res.json({
      success: true,
      message: `Guthaben für "${updated.username}" auf ${cleanBalance.toFixed(2)} € gesetzt.`,
      user: auth.toPublicUser(updated, false)
    });
  });

  app.patch('/api/admin/users/:id/status', auth.checkOriginGuard, auth.requireAdmin, (req, res) => {
    const actor: StoredUserAccount = (req as any).authUser;
    const targetId = req.params.id;
    const target = auth.getUserById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }
    if (target.id === actor.id) {
      return res.status(400).json({ success: false, error: 'Das eigene Administrator-Konto kann nicht gesperrt werden.' });
    }

    const nextStatus: 'active' | 'suspended' =
      req.body?.status === 'active' || req.body?.status === 'suspended'
        ? req.body.status
        : (target.status === 'active' ? 'suspended' : 'active');

    const updated = auth.updateUser(targetId, { status: nextStatus })!;
    if (nextStatus === 'suspended') {
      auth.invalidateUserSessions(targetId);
    }

    deps.recordAuditLog({
      serverId: 'system',
      action: 'user_status_change',
      user: actor.username,
      details: `Benutzerkonto "${updated.username}" wurde ${nextStatus === 'suspended' ? 'gesperrt' : 'reaktiviert'}`,
      severity: 'security'
    });

    res.json({
      success: true,
      message: `Konto "${updated.username}" ist jetzt ${nextStatus === 'suspended' ? 'gesperrt' : 'aktiv'}.`,
      user: auth.toPublicUser(updated, false)
    });
  });

  app.delete('/api/admin/users/:id', auth.checkOriginGuard, auth.requireAdmin, (req, res) => {
    const actor: StoredUserAccount = (req as any).authUser;
    const targetId = req.params.id;
    if (targetId === actor.id || targetId === 'local-admin') {
      return res.status(400).json({ success: false, error: 'Das Haupt-Administrator-Konto kann nicht gelöscht werden.' });
    }
    const target = auth.getUserById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    auth.deleteUser(targetId);
    deps.recordAuditLog({
      serverId: 'system',
      action: 'user_delete',
      user: actor.username,
      details: `Benutzerkonto "${target.username}" (${target.customerNumber}) gelöscht`,
      severity: 'warning'
    });

    res.json({
      success: true,
      message: `Benutzerkonto "${target.username}" dauerhaft gelöscht.`
    });
  });

  return {
    canUserAccessServer,
    getSubUsersForUser,
    cleanupServerRecords: (serverId: string) => {
      const contracts = readJson<CustomerContract[]>(CONTRACTS_FILE, []);
      const filteredContracts = contracts.filter(c => c.serverId !== serverId);
      if (filteredContracts.length !== contracts.length) {
        writeJson(CONTRACTS_FILE, filteredContracts);
      }
      const subUsers = readJson<SubUser[]>(SUBUSERS_FILE, []);
      const filteredSubs = subUsers.filter(s => s.serverId !== serverId);
      if (filteredSubs.length !== subUsers.length) {
        writeJson(SUBUSERS_FILE, filteredSubs);
      }
    }
  };
}
