import { RbacRole, SystemPermissionKey, UserAccount } from '../types/auth';

const DEFAULT_USER_PERMISSIONS: SystemPermissionKey[] = [
  'servers.view',
  'servers.create',
  'servers.delete',
  'servers.power',
  'servers.console',
  'servers.files',
  'servers.backups',
  'servers.mods',
  'servers.scheduler',
  'servers.security',
];

const DEFAULT_MODERATOR_PERMISSIONS: SystemPermissionKey[] = [
  ...DEFAULT_USER_PERMISSIONS,
  'admin.panel',
  'admin.all_servers',
  'admin.users',
];

export function getEffectiveRole(user: UserAccount | null | undefined): RbacRole {
  if (!user) return 'user';
  if (user.role === 'admin' || user.effectiveRole === 'admin') return 'admin';
  if (user.effectiveRole === 'moderator') return 'moderator';
  return 'user';
}

export function isAdministrator(user: UserAccount | null | undefined): boolean {
  return getEffectiveRole(user) === 'admin';
}

export function hasPermission(
  user: UserAccount | null | undefined,
  permission: SystemPermissionKey
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.effectiveRole === 'admin') return true;
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }
  const role = getEffectiveRole(user);
  if (role === 'moderator') return DEFAULT_MODERATOR_PERMISSIONS.includes(permission);
  return DEFAULT_USER_PERMISSIONS.includes(permission);
}

export function canAccessAdminArea(user: UserAccount | null | undefined): boolean {
  if (!user) return false;
  return (
    isAdministrator(user) ||
    hasPermission(user, 'admin.panel') ||
    hasPermission(user, 'admin.users') ||
    hasPermission(user, 'admin.permissions') ||
    hasPermission(user, 'admin.firewall') ||
    hasPermission(user, 'admin.settings') ||
    hasPermission(user, 'admin.system')
  );
}

export function getRoleLabel(role: RbacRole): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'moderator') return 'Moderator / Support';
  return 'Kunde / Benutzer';
}
