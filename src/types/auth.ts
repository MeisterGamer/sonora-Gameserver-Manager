export type UserRole = 'admin' | 'user';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  balance: number; // in Euros
  status: 'active' | 'suspended';
  avatarInitials: string;
  createdAt: string;
  twoFactorEnabled: boolean;
  apiToken: string;
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
