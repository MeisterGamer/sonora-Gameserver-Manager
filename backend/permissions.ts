import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';
import type { AuthController, StoredUserAccount } from './auth.ts';

export type RbacRole = 'admin' | 'moderator' | 'user';

export type SystemPermission =
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

export interface PermissionDefinition {
  key: SystemPermission;
  label: string;
  description: string;
  scope: 'user' | 'admin';
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // User / Server Scope
  { key: 'servers.view', label: 'Server anzeigen', description: 'Eigene und freigegebene Gameserver-Instanzen einsehen', scope: 'user' },
  { key: 'servers.create', label: 'Server erstellen', description: 'Neue Gameserver-Instanzen direkt bereitstellen', scope: 'user' },
  { key: 'servers.delete', label: 'Server löschen', description: 'Eigene Gameserver-Instanzen entfernen', scope: 'user' },
  { key: 'servers.power', label: 'Power-Steuerung', description: 'Server starten, stoppen, neustarten und Force-Kill ausführen', scope: 'user' },
  { key: 'servers.console', label: 'Konsole & Befehle', description: 'Live-Konsole einsehen und RCON-/Konsolenbefehle senden', scope: 'user' },
  { key: 'servers.files', label: 'Dateien & SFTP', description: 'Datei-Manager, Upload/ZIP und SFTP-Zugriff verwenden', scope: 'user' },
  { key: 'servers.backups', label: 'Backups & Rollback', description: 'Manuelle Backups anlegen und 1-Klick-Rollback ausführen', scope: 'user' },
  { key: 'servers.mods', label: 'Mods, Plugins & Configs', description: 'Erweiterungen installieren und Konfigurationsdateien bearbeiten', scope: 'user' },
  { key: 'servers.scheduler', label: 'Server-Zeitplaner', description: 'Automatisierte Cron-Aufgaben für Server verwalten', scope: 'user' },
  { key: 'servers.security', label: 'Sicherheit & Netzwerk', description: 'DDoS-Filter-Status prüfen und Latenzmessungen ausführen', scope: 'user' },

  // Admin Scope (strictly separated from user area)
  { key: 'admin.panel', label: 'Admin-Bereich betreten', description: 'Zugang zur getrennten Administrations-Oberfläche', scope: 'admin' },
  { key: 'admin.users', label: 'Benutzerverwaltung', description: 'Benutzerkonten einsehen, sperren, Guthaben anpassen und löschen', scope: 'admin' },
  { key: 'admin.permissions', label: 'Rechtesystem & Rollen', description: 'Rollenvorlagen und individuelle Benutzerrechte bearbeiten', scope: 'admin' },
  { key: 'admin.system', label: 'System, Nodes & Setup', description: 'Host-Diagnose, Remote-Nodes, OS-Skripte und Setup-Assistent', scope: 'admin' },
  { key: 'admin.firewall', label: 'Firewall & DDoS-Schutz', description: 'Debian UFW/iptables Port-Freigaben und Kernel-DDoS verwalten', scope: 'admin' },
  { key: 'admin.settings', label: 'Globale Einstellungen', description: 'Steam-Modus, API-Schlüssel, Wartungsmodus und Standardwerte', scope: 'admin' },
  { key: 'admin.all_servers', label: 'Alle Kunden-Server', description: 'Globaler Zugriff auf sämtliche Server-Instanzen aller Nutzer', scope: 'admin' },
  { key: 'admin.billing', label: 'CRM, Verträge & Tickets', description: 'Globale Rechnungen, Prepaid-Verträge und alle Support-Tickets', scope: 'admin' }
];

export const ALL_SYSTEM_PERMISSIONS: SystemPermission[] = PERMISSION_CATALOG.map(p => p.key);
export const ADMIN_ONLY_PERMISSIONS: SystemPermission[] = PERMISSION_CATALOG.filter(p => p.scope === 'admin').map(p => p.key);
export const USER_DEFAULT_PERMISSIONS: SystemPermission[] = PERMISSION_CATALOG.filter(p => p.scope === 'user').map(p => p.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<RbacRole, SystemPermission[]> = {
  admin: [...ALL_SYSTEM_PERMISSIONS],
  moderator: [
    'servers.view',
    'servers.power',
    'servers.console',
    'servers.backups',
    'servers.security',
    'admin.panel',
    'admin.all_servers',
    'admin.billing'
  ],
  user: [
    'servers.view',
    'servers.create',
    'servers.delete',
    'servers.power',
    'servers.console',
    'servers.files',
    'servers.backups',
    'servers.mods',
    'servers.scheduler',
    'servers.security'
  ]
};

export interface UserPermissionOverride {
  role?: RbacRole;
  granted: SystemPermission[];
  denied: SystemPermission[];
  updatedAt: string;
}

export interface RbacStore {
  rolePermissions: Record<RbacRole, SystemPermission[]>;
  userOverrides: Record<string, UserPermissionOverride>;
}

export interface PermissionsDeps {
  auth: AuthController;
  managerStateDir: string;
  recordAuditLog?: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'security' | 'success';
  }) => void;
}

export interface PermissionsController {
  getEffectiveRole: (user: StoredUserAccount | null | undefined) => RbacRole;
  getEffectivePermissions: (user: StoredUserAccount | null | undefined) => SystemPermission[];
  hasPermission: (user: StoredUserAccount | null | undefined, perm: SystemPermission) => boolean;
  isAdminLevel: (user: StoredUserAccount | null | undefined) => boolean;
  requirePermission: (perm: SystemPermission) => (req: Request, res: Response, next: NextFunction) => void;
  getStore: () => RbacStore;
}

const VALID_PERM_SET = new Set<string>(ALL_SYSTEM_PERMISSIONS);

function sanitizePermList(input: unknown): SystemPermission[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<SystemPermission>();
  for (const item of input) {
    if (typeof item === 'string' && VALID_PERM_SET.has(item)) {
      unique.add(item as SystemPermission);
    }
  }
  return Array.from(unique);
}

export function configurePermissions(app: Express, deps: PermissionsDeps): PermissionsController {
  fs.mkdirSync(deps.managerStateDir, { recursive: true });
  const storePath = path.join(deps.managerStateDir, 'permissions.json');

  const readStore = (): RbacStore => {
    try {
      if (fs.existsSync(storePath)) {
        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        return {
          rolePermissions: {
            admin: [...ALL_SYSTEM_PERMISSIONS],
            moderator: sanitizePermList(parsed?.rolePermissions?.moderator || DEFAULT_ROLE_PERMISSIONS.moderator),
            user: sanitizePermList(parsed?.rolePermissions?.user || DEFAULT_ROLE_PERMISSIONS.user)
          },
          userOverrides: parsed?.userOverrides && typeof parsed.userOverrides === 'object' ? parsed.userOverrides : {}
        };
      }
    } catch {}
    return {
      rolePermissions: {
        admin: [...ALL_SYSTEM_PERMISSIONS],
        moderator: [...DEFAULT_ROLE_PERMISSIONS.moderator],
        user: [...DEFAULT_ROLE_PERMISSIONS.user]
      },
      userOverrides: {}
    };
  };

  let store: RbacStore = readStore();

  const writeStore = (next: RbacStore) => {
    store = next;
    try {
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
    } catch {}
  };

  const getEffectiveRole = (user: StoredUserAccount | null | undefined): RbacRole => {
    if (!user) return 'user';
    if (user.id === 'local-admin' || user.role === 'admin') return 'admin';
    const overrideRole = store.userOverrides[user.id]?.role;
    if (overrideRole === 'admin' || overrideRole === 'moderator' || overrideRole === 'user') {
      return overrideRole;
    }
    return 'user';
  };

  const getEffectivePermissions = (user: StoredUserAccount | null | undefined): SystemPermission[] => {
    if (!user) return [];
    const role = getEffectiveRole(user);
    if (role === 'admin') {
      return [...ALL_SYSTEM_PERMISSIONS];
    }

    const base = new Set<SystemPermission>(store.rolePermissions[role] || DEFAULT_ROLE_PERMISSIONS[role] || []);
    const override = store.userOverrides[user.id];
    if (override) {
      for (const p of sanitizePermList(override.granted)) base.add(p);
      for (const p of sanitizePermList(override.denied)) base.delete(p);
    }
    return Array.from(base);
  };

  const hasPermission = (user: StoredUserAccount | null | undefined, perm: SystemPermission): boolean => {
    if (!user) return false;
    return getEffectivePermissions(user).includes(perm);
  };

  const isAdminLevel = (user: StoredUserAccount | null | undefined): boolean => {
    if (!user) return false;
    const role = getEffectiveRole(user);
    return role === 'admin' || hasPermission(user, 'admin.panel');
  };

  const requirePermission = (perm: SystemPermission) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = deps.auth.getSessionUser(req);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte anmelden.' });
      }
      if (!hasPermission(user, perm)) {
        return res.status(403).json({
          success: false,
          error: `Zugriff verweigert: Fehlende Berechtigung (${perm}).`,
          requiredPermission: perm
        });
      }
      (req as any).authUser = user;
      next();
    };
  };

  // --- USER SELF PERMISSIONS ENDPOINT ---
  app.get('/api/auth/permissions', deps.auth.requireAuth, (req: Request, res: Response) => {
    const user: StoredUserAccount = (req as any).authUser;
    const effectiveRole = getEffectiveRole(user);
    const permissions = getEffectivePermissions(user);
    res.json({
      success: true,
      userId: user.id,
      role: effectiveRole,
      isAdmin: effectiveRole === 'admin',
      hasAdminPanelAccess: permissions.includes('admin.panel'),
      permissions
    });
  });

  // --- ADMIN RBAC MANAGEMENT ENDPOINTS ---
  app.get('/api/admin/rbac', requirePermission('admin.permissions'), (_req: Request, res: Response) => {
    store = readStore();
    const users = deps.auth.listUsers().map(u => {
      const effectiveRole = getEffectiveRole(u);
      const override = store.userOverrides[u.id] || { granted: [], denied: [], updatedAt: '' };
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        baseRole: u.role,
        effectiveRole,
        status: u.status,
        customerNumber: u.customerNumber,
        granted: sanitizePermList(override.granted),
        denied: sanitizePermList(override.denied),
        effectivePermissions: getEffectivePermissions(u)
      };
    });

    res.json({
      success: true,
      catalog: PERMISSION_CATALOG,
      rolePermissions: store.rolePermissions,
      users
    });
  });

  app.put('/api/admin/rbac/roles/:role', requirePermission('admin.permissions'), (req: Request, res: Response) => {
    const roleParam = req.params.role as RbacRole;
    if (roleParam !== 'moderator' && roleParam !== 'user') {
      return res.status(400).json({
        success: false,
        error: 'Nur die Rollen "moderator" und "user" können angepasst werden. Die Rolle "admin" behält immer Vollzugriff.'
      });
    }

    const requested = sanitizePermList(req.body?.permissions);
    // Strict separation: standard 'user' role cannot be granted admin-scope permissions globally
    const filtered = roleParam === 'user'
      ? requested.filter(p => !ADMIN_ONLY_PERMISSIONS.includes(p))
      : requested;

    const nextStore: RbacStore = {
      ...readStore(),
      rolePermissions: {
        ...store.rolePermissions,
        admin: [...ALL_SYSTEM_PERMISSIONS],
        [roleParam]: filtered
      }
    };
    writeStore(nextStore);

    const actor: StoredUserAccount = (req as any).authUser;
    deps.recordAuditLog?.({
      serverId: 'system',
      action: 'rbac_role_update',
      user: actor.username,
      details: `Rollenvorlage "${roleParam}" aktualisiert (${filtered.length} Berechtigungen aktiv).`,
      severity: 'security'
    });

    res.json({
      success: true,
      role: roleParam,
      permissions: filtered,
      rolePermissions: nextStore.rolePermissions,
      message: `Rollen-Rechte für "${roleParam}" gespeichert.`
    });
  });

  app.put('/api/admin/rbac/users/:userId', requirePermission('admin.permissions'), (req: Request, res: Response) => {
    const targetId = req.params.userId;
    const actor: StoredUserAccount = (req as any).authUser;
    const target = deps.auth.getUserById(targetId);

    if (!target) {
      return res.status(404).json({ success: false, error: 'Benutzerkonto nicht gefunden.' });
    }
    if (target.id === 'local-admin' && req.body?.role && req.body.role !== 'admin') {
      return res.status(400).json({ success: false, error: 'Der primäre Root-Administrator kann nicht herabgestuft werden.' });
    }

    const reqRole = req.body?.role as RbacRole | undefined;
    const nextRole: RbacRole = reqRole === 'admin' || reqRole === 'moderator' || reqRole === 'user'
      ? reqRole
      : getEffectiveRole(target);

    // Sync base auth role ('admin' vs 'user')
    const baseAuthRole: 'admin' | 'user' = nextRole === 'admin' ? 'admin' : 'user';
    if (target.role !== baseAuthRole) {
      deps.auth.updateUser(target.id, { role: baseAuthRole });
    }

    const granted = nextRole === 'admin' ? [] : sanitizePermList(req.body?.granted);
    const denied = nextRole === 'admin' ? [] : sanitizePermList(req.body?.denied).filter(p => !granted.includes(p));

    const current = readStore();
    const nextStore: RbacStore = {
      ...current,
      userOverrides: {
        ...current.userOverrides,
        [target.id]: {
          role: nextRole,
          granted,
          denied,
          updatedAt: new Date().toISOString()
        }
      }
    };
    writeStore(nextStore);

    const updatedUser = deps.auth.getUserById(target.id)!;
    deps.recordAuditLog?.({
      serverId: 'system',
      action: 'rbac_user_update',
      user: actor.username,
      details: `Berechtigungen für "${target.username}" aktualisiert (Rolle: ${nextRole}, +${granted.length} / -${denied.length} Sonderregeln).`,
      severity: 'security'
    });

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        baseRole: updatedUser.role,
        effectiveRole: getEffectiveRole(updatedUser),
        granted,
        denied,
        effectivePermissions: getEffectivePermissions(updatedUser)
      },
      message: `Berechtigungen für "${target.username}" gespeichert.`
    });
  });

  return {
    getEffectiveRole,
    getEffectivePermissions,
    hasPermission,
    isAdminLevel,
    requirePermission,
    getStore: () => readStore()
  };
}
