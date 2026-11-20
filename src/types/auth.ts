export type UserRole = 'admin' | 'user';
export type RbacRole = 'admin' | 'moderator' | 'user';

export type SystemPermissionKey =
  | 'servers.view'
  | 'servers.create'
  | 'servers.delete'
  | 'servers.power'
  | 'servers.console'
  | 'servers.files'
  | 'servers.backups'
  | 'servers.mods'
  | 'servers.scheduler'
  | 'servers.security'
  | 'admin.panel'
  | 'admin.users'
  | 'admin.permissions'
  | 'admin.system'
  | 'admin.firewall'
  | 'admin.settings'
  | 'admin.all_servers'
  | 'admin.billing';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  effectiveRole?: RbacRole;
  permissions?: SystemPermissionKey[];
  balance: number; // in Euros
  status: 'active' | 'suspended';
  avatarInitials: string;
  createdAt: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorOtpAuthUrl?: string;
  apiToken: string;
  customerNumber?: string;
  fullName?: string;
  company?: string;
  phone?: string;
  street?: string;
  zipCity?: string;
  country?: string;
  totalSpent?: number;
  lastLoginAt?: string;
  serverCount?: number;
  contractCount?: number;
}

export interface ActiveSessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  isCurrent: boolean;
}

export type PermissionKey = 
  | 'console_read'
  | 'console_write'
  | 'power_control'
  | 'files_edit'
  | 'mods_manage'
  | 'backups_manage';

export interface SubUser {
  id: string;
  ownerId?: string;
  username: string;
  email: string;
  serverId: string;
  serverName: string;
  permissions: PermissionKey[];
  addedAt: string;
}

export interface NodeInfo {
  id: string;
  name: string;
  location: string;
  ip: string;
  online: boolean;
  cpuUsage: number;
  ramUsageGb: number;
  maxRamGb: number;
  diskUsageGb: number;
  maxDiskGb: number;
  activeServersCount: number;
}

export interface ShopPlan {
  id: string;
  name: string;
  tagline: string;
  category: 'minecraft' | 'steam' | 'extreme' | 'starter';
  gameId: string;
  defaultGameName: string;
  priceMonthly: number;
  ramGb: number;
  vCores: number;
  nvmeDiskGb: number;
  slots: string;
  isPopular?: boolean;
  badge?: string;
  features: string[];
}

export interface ShopOrder {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  gameName: string;
  price: number;
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  location: string;
  serverId: string;
  createdAt: string;
  status: 'active' | 'renewing' | 'cancelled';
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  severity: 'info' | 'warn' | 'security';
}
