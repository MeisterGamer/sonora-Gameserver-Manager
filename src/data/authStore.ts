import { UserAccount, SubUser, NodeInfo, ShopOrder, AuditLogItem, PermissionKey } from '../types/auth';

const USERS_STORAGE_KEY = 'apexhost_users_data';
const CURRENT_USER_KEY = 'apexhost_current_user_id';
const ORDERS_STORAGE_KEY = 'apexhost_orders_data';
const SUBUSERS_STORAGE_KEY = 'apexhost_subusers_data';

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'usr_admin',
    username: 'SuperAdmin',
    email: 'admin@apexhost.cloud',
    role: 'admin',
    balance: 250.00,
    status: 'active',
    avatarInitials: 'SA',
    createdAt: '2026-01-15',
    twoFactorEnabled: true,
    apiToken: 'apex_live_adm_9948194821a8f90'
  },
  {
    id: 'usr_dominik',
    username: 'Dominik',
    email: 'dominik.neumail@gmail.com',
    role: 'user',
    balance: 45.00,
    status: 'active',
    avatarInitials: 'DO',
    createdAt: '2026-03-20',
    twoFactorEnabled: false,
    apiToken: 'apex_live_usr_7718291040b2e11'
  },
  {
    id: 'usr_gamer99',
    username: 'PixelWarrior',
    email: 'warrior@games.de',
    role: 'user',
    balance: 12.50,
    status: 'active',
    avatarInitials: 'PW',
    createdAt: '2026-06-10',
    twoFactorEnabled: true,
    apiToken: 'apex_live_usr_1239821894c7a55'
  }
];

export const INITIAL_NODES: NodeInfo[] = [
  {
    id: 'node_fra_01',
    name: 'Node-01 (Frankfurt Equinix)',
    location: 'Frankfurt am Main, DE',
    ip: '185.120.44.10',
    online: true,
    cpuUsage: 34,
    ramUsageGb: 78,
    maxRamGb: 256,
    diskUsageGb: 1240,
    maxDiskGb: 4000,
    activeServersCount: 14
  },
  {
    id: 'node_flk_02',
    name: 'Node-02 (Falkenstein DC)',
    location: 'Falkenstein, DE',
    ip: '142.132.88.24',
    online: true,
    cpuUsage: 48,
    ramUsageGb: 142,
    maxRamGb: 256,
    diskUsageGb: 2180,
    maxDiskGb: 4000,
    activeServersCount: 22
  },
  {
    id: 'node_ash_03',
    name: 'Node-03 (Virginia East)',
    location: 'Ashburn, USA',
    ip: '64.225.10.82',
    online: true,
    cpuUsage: 22,
    ramUsageGb: 64,
    maxRamGb: 128,
    diskUsageGb: 920,
    maxDiskGb: 2000,
    activeServersCount: 9
  }
];

export const INITIAL_SUBUSERS: SubUser[] = [
  {
    id: 'sub_1',
    username: 'ModMaster_Tim',
    email: 'tim@gamingteam.com',
    serverId: 'srv_paper_smp',
    serverName: 'Survival SMP Season 4',
    permissions: ['console_read', 'console_write', 'power_control', 'mods_manage'],
    addedAt: '2026-10-08'
  },
  {
    id: 'sub_2',
    username: 'ServerBuilder_Lara',
    email: 'lara@guild.org',
    serverId: 'srv_palworld_prime',
    serverName: 'Palworld Official Co-op',
    permissions: ['console_read', 'files_edit', 'backups_manage'],
    addedAt: '2026-10-09'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  { id: 'aud_1', timestamp: 'Heute 14:10', actor: 'SuperAdmin', action: 'User Rolle geändert', target: 'Dominik (Admin Rechte vergeben)', severity: 'security' },
  { id: 'aud_2', timestamp: 'Heute 13:45', actor: 'Dominik', action: 'Server gestartet', target: 'Survival SMP Season 4 (Port 25565)', severity: 'info' },
  { id: 'aud_3', timestamp: 'Heute 12:20', actor: 'Dominik', action: 'Guthaben aufgeladen', target: '+50.00 € via PayPal', severity: 'info' },
  { id: 'aud_4', timestamp: 'Gestern 18:30', actor: 'SuperAdmin', action: 'Node Wartungsmodus', target: 'Node-01 Frankfurt Kernel Update', severity: 'warn' }
];

export function getStoredUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_USERS;
  }
}

export function getCurrentUser(): UserAccount {
  const users = getStoredUsers();
  const currentId = localStorage.getItem(CURRENT_USER_KEY) || 'usr_dominik';
  const found = users.find(u => u.id === currentId);
  return found || users[0];
}

export function setCurrentUserId(userId: string): void {
  localStorage.setItem(CURRENT_USER_KEY, userId);
}

export function saveUsers(users: UserAccount[]): void {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function getStoredSubUsers(): SubUser[] {
  try {
    const raw = localStorage.getItem(SUBUSERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SUBUSERS_STORAGE_KEY, JSON.stringify(INITIAL_SUBUSERS));
      return INITIAL_SUBUSERS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_SUBUSERS;
  }
}

export function saveSubUsers(subusers: SubUser[]): void {
  localStorage.setItem(SUBUSERS_STORAGE_KEY, JSON.stringify(subusers));
}

export function getStoredOrders(): ShopOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveOrder(order: ShopOrder): void {
  const orders = getStoredOrders();
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([order, ...orders]));
}
