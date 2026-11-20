import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';

export interface AdminAccount {
  username: string;
  email?: string;
  salt: string;
  hash: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StoredUserAccount {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  salt: string;
  hash: string;
  balance: number;
  status: 'active' | 'suspended';
  customerNumber: string;
  fullName: string;
  company: string;
  phone: string;
  street: string;
  zipCity: string;
  country: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string;
  apiToken: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export interface PublicUserPayload {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  balance: number;
  status: 'active' | 'suspended';
  avatarInitials: string;
  createdAt: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  twoFactorOtpAuthUrl?: string;
  apiToken: string;
  customerNumber: string;
  fullName: string;
  company: string;
  phone: string;
  street: string;
  zipCity: string;
  country: string;
  lastLoginAt?: string;
  effectiveRole?: 'admin' | 'moderator' | 'user';
  permissions?: string[];
}

export interface ActiveSessionRecord {
  userId: string;
  expiresAt: number;
  createdAt: string;
  ip: string;
  userAgent: string;
}

export interface AuthController {
  extractToken: (req: Request) => string;
  getSessionUser: (req: Request) => StoredUserAccount | null;
  toPublicUser: (user: StoredUserAccount, includeSensitive?: boolean) => PublicUserPayload;
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
  checkOriginGuard: (req: Request, res: Response, next: NextFunction) => void;
  listUsers: () => StoredUserAccount[];
  getUserById: (id: string) => StoredUserAccount | null;
  findUserByEmailOrUsername: (identifier: string) => StoredUserAccount | null;
  updateUser: (id: string, patch: Partial<StoredUserAccount>) => StoredUserAccount | null;
  deleteUser: (id: string) => boolean;
  invalidateUserSessions: (userId: string, exceptToken?: string) => number;
  listUserSessions: (userId: string, currentToken?: string) => Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    ip: string;
    userAgent: string;
    isCurrent: boolean;
  }>;
  setOnUserRegisteredHook: (hook: (user: StoredUserAccount, welcomeBonus: number) => void) => void;
  setPermissionsResolver: (resolver: (user: StoredUserAccount) => { role: 'admin' | 'moderator' | 'user'; permissions: string[] }) => void;
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string') return { valid: false, reason: 'Passwort muss ein Text sein.' };
  if (password.length < 10) return { valid: false, reason: 'Das Passwort muss mindestens 10 Zeichen lang sein.' };
  if (password.length > 128) return { valid: false, reason: 'Das Passwort darf maximal 128 Zeichen lang sein.' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Das Passwort muss mindestens einen Großbuchstaben enthalten.' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'Das Passwort muss mindestens einen Kleinbuchstaben enthalten.' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Das Passwort muss mindestens eine Ziffer enthalten.' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, reason: 'Das Passwort muss mindestens ein Sonderzeichen enthalten (!@#$%^&* etc.).' };
  }
  return { valid: true };
}

export function validateUsername(username: string): { valid: boolean; reason?: string } {
  if (typeof username !== 'string') return { valid: false, reason: 'Benutzername muss ein Text sein.' };
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return { valid: false, reason: 'Der Benutzername muss zwischen 3 und 32 Zeichen lang sein.' };
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(trimmed)) {
    return { valid: false, reason: 'Der Benutzername darf nur Buchstaben, Zahlen, Bindestrich, Punkt und Unterstrich enthalten.' };
  }
  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (typeof email !== 'string') return { valid: false, reason: 'E-Mail muss ein Text sein.' };
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 120) {
    return { valid: false, reason: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, reason: 'Ungültiges E-Mail-Format.' };
  }
  return { valid: true };
}

function generateCustomerNumber(existing: StoredUserAccount[]): string {
  const year = new Date().getFullYear();
  const used = new Set(existing.map(u => u.customerNumber));
  for (let i = 0; i < 50; i++) {
    const num = `KD-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!used.has(num)) return num;
  }
  return `KD-${year}-${Date.now().toString().slice(-6)}`;
}

function computeInitials(username: string, fullName?: string): string {
  const source = (fullName || username || 'U').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function generateBase32Secret(byteLength = 20): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

export function configureAuth(app: Express, stateDir: string): AuthController {
  fs.mkdirSync(stateDir, { recursive: true });
  const accountFile = path.join(stateDir, 'admin.json');
  const usersFile = path.join(stateDir, 'users.json');
  const adminSettingsFile = path.join(stateDir, 'manager', 'admin-settings.json');

  let account: AdminAccount | null = null;
  let users: StoredUserAccount[] = [];
  let onUserRegisteredHook: ((user: StoredUserAccount, welcomeBonus: number) => void) | null = null;
  let permissionsResolver: ((user: StoredUserAccount) => { role: 'admin' | 'moderator' | 'user'; permissions: string[] }) | null = null;

  const getWelcomeBonusEur = (): number => {
    try {
      if (fs.existsSync(adminSettingsFile)) {
        const cfg = JSON.parse(fs.readFileSync(adminSettingsFile, 'utf8'));
        if (typeof cfg?.welcomeBonusEur === 'number' && Number.isFinite(cfg.welcomeBonusEur) && cfg.welcomeBonusEur >= 0) {
          return Math.round(cfg.welcomeBonusEur * 100) / 100;
        }
      }
    } catch {}
    return 25.0;
  };

  const saveUsersToDisk = () => {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  };

  const syncLegacyAdminFile = (adminUser: StoredUserAccount) => {
    const legacy: AdminAccount = {
      username: adminUser.username,
      email: adminUser.email,
      salt: adminUser.salt,
      hash: adminUser.hash,
      createdAt: adminUser.createdAt,
      updatedAt: adminUser.updatedAt
    };
    account = legacy;
    fs.writeFileSync(accountFile, JSON.stringify(legacy, null, 2), { mode: 0o600 });
  };

  const loadAccounts = () => {
    // Load legacy admin.json
    if (fs.existsSync(accountFile)) {
      try {
        account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
      } catch {
        account = null;
      }
    } else {
      account = null;
    }

    // Load multi-user users.json
    if (fs.existsSync(usersFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        users = Array.isArray(parsed) ? parsed : [];
      } catch {
        users = [];
      }
    } else {
      users = [];
    }

    // Keep legacy admin.json & users.json synchronized (supports npm run admin:reset)
    if (account) {
      const existingAdminIdx = users.findIndex(u => u.id === 'local-admin');
      if (existingAdminIdx === -1) {
        const migratedAdmin: StoredUserAccount = {
          id: 'local-admin',
          username: account.username,
          email: account.email || 'admin@apexhost.local',
          role: 'admin',
          salt: account.salt,
          hash: account.hash,
          balance: 100,
          status: 'active',
          customerNumber: 'KD-ADMIN-0001',
          fullName: account.username,
          company: 'ApexHost Administration',
          phone: '',
          street: '',
          zipCity: '',
          country: 'Deutschland',
          twoFactorEnabled: false,
          twoFactorSecret: '',
          apiToken: '',
          createdAt: account.createdAt || new Date().toISOString(),
          updatedAt: account.updatedAt
        };
        users.unshift(migratedAdmin);
        saveUsersToDisk();
      } else {
        // If scripts/reset-admin.ts modified admin.json, sync hash/salt/username back into users.json
        const existing = users[existingAdminIdx];
        if (existing.hash !== account.hash || existing.salt !== account.salt || existing.username !== account.username) {
          users[existingAdminIdx] = {
            ...existing,
            username: account.username,
            email: account.email || existing.email,
            salt: account.salt,
            hash: account.hash,
            updatedAt: account.updatedAt || new Date().toISOString()
          };
          saveUsersToDisk();
        }
      }
    } else if (users.some(u => u.role === 'admin')) {
      // Admin exists in users.json but admin.json was deleted (e.g., reset-admin); treat as uninitialized if local-admin was deleted
      const localAdmin = users.find(u => u.id === 'local-admin');
      if (!localAdmin) {
        const primaryAdmin = users.find(u => u.role === 'admin');
        if (primaryAdmin) {
          account = {
            username: primaryAdmin.username,
            email: primaryAdmin.email,
            salt: primaryAdmin.salt,
            hash: primaryAdmin.hash,
            createdAt: primaryAdmin.createdAt,
            updatedAt: primaryAdmin.updatedAt
          };
        }
      }
    }
  };
  loadAccounts();

  // Active Sessions: token -> ActiveSessionRecord
  const sessions = new Map<string, ActiveSessionRecord>();

  // Rate Limiting: key (IP or user) -> { count, lockedUntil }
  const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout after 5 failures
  const sessionDuration = 24 * 60 * 60 * 1000; // 24 hours

  // Cleanup expired sessions & attempts every 10 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [key, record] of loginAttempts.entries()) {
      if (record.lockedUntil <= now) loginAttempts.delete(key);
    }
  }, 10 * 60 * 1000);
  cleanupInterval.unref?.();

  const toPublicUser = (user: StoredUserAccount, includeSensitive = false): PublicUserPayload => {
    const payload: PublicUserPayload = {
      id: user.id,
      username: user.username,
      email: user.email || '',
      role: user.role,
      balance: Math.round((Number(user.balance) || 0) * 100) / 100,
      status: user.status || 'active',
      avatarInitials: computeInitials(user.username, user.fullName),
      createdAt: user.createdAt,
      twoFactorEnabled: !!user.twoFactorEnabled,
      apiToken: includeSensitive ? (user.apiToken || '') : (user.apiToken ? `${user.apiToken.slice(0, 14)}••••••••` : ''),
      customerNumber: user.customerNumber || 'KD-2026-0000',
      fullName: user.fullName || user.username,
      company: user.company || '',
      phone: user.phone || '',
      street: user.street || '',
      zipCity: user.zipCity || '',
      country: user.country || 'Deutschland',
      lastLoginAt: user.lastLoginAt
    };
    if (includeSensitive && user.twoFactorEnabled && user.twoFactorSecret) {
      payload.twoFactorSecret = user.twoFactorSecret;
      payload.twoFactorOtpAuthUrl = `otpauth://totp/ApexHost:${encodeURIComponent(user.username)}?secret=${user.twoFactorSecret}&issuer=ApexHost`;
    }
    if (permissionsResolver) {
      try {
        const resolved = permissionsResolver(user);
        payload.effectiveRole = resolved.role;
        payload.permissions = resolved.permissions;
      } catch {}
    } else {
      payload.effectiveRole = user.role;
    }
    return payload;
  };

  const extractToken = (req: Request): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const cookie = req.headers.cookie || '';
    const cookieToken = cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('sonora_session='))
      ?.slice('sonora_session='.length);
    if (cookieToken) return cookieToken;
    return '';
  };

  const getSessionUser = (req: Request): StoredUserAccount | null => {
    const token = extractToken(req);
    if (!token) return null;

    // 1. Check session token
    const session = sessions.get(token);
    if (session) {
      if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
      }
      loadAccounts();
      const user = users.find(u => u.id === session.userId) || null;
      if (!user || user.status === 'suspended') {
        sessions.delete(token);
        return null;
      }
      return user;
    }

    // 2. Check persistent REST API Token (sonora_live_...)
    if (token.startsWith('sonora_live_') && token.length >= 24) {
      loadAccounts();
      const tokenBuf = Buffer.from(token);
      for (const u of users) {
        if (!u.apiToken || u.status === 'suspended') continue;
        const storedBuf = Buffer.from(u.apiToken);
        if (tokenBuf.length === storedBuf.length && timingSafeEqual(tokenBuf, storedBuf)) {
          return u;
        }
      }
    }

    return null;
  };

  const isAllowedOrigin = (req: Request): boolean => {
    const origin = req.headers.origin || (req.headers.referer ? (() => { try { return new URL(req.headers.referer!).origin; } catch { return ''; } })() : '');
    if (!origin) return true;

    try {
      const url = new URL(origin);
      const host = url.hostname.toLowerCase();
      const currentHost = (req.get('host') || '').split(':')[0].toLowerCase();

      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
      if (host === currentHost) return true;
      if (host.endsWith('.run.app')) return true;
      if (host === 'aistudio.google.com' || host.endsWith('.google.com')) return true;

      return false;
    } catch {
      return false;
    }
  };

  const checkOriginGuard = (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({
        success: false,
        error: 'Sicherheitswarnung: Anforderung von nicht autorisiertem Ursprung blockiert (CSRF-Schutz aktiv).'
      });
    }
    next();
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte anmelden.' });
    }
    (req as any).authUser = user;
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte anmelden.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Zugriff verweigert: Administratorrechte erforderlich.' });
    }
    (req as any).authUser = user;
    next();
  };

  const setSecureSessionCookie = (res: Response, token: string) => {
    try {
      res.cookie('sonora_session', token, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: sessionDuration,
        path: '/'
      });
    } catch {}
  };

  const createSessionForUser = (req: Request, res: Response, userId: string): string => {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    sessions.set(token, {
      userId,
      expiresAt: now + sessionDuration,
      createdAt: new Date(now).toISOString(),
      ip: req.ip || req.socket.remoteAddress || '127.0.0.1',
      userAgent: String(req.headers['user-agent'] || 'Unbekannter Client').slice(0, 140)
    });
    setSecureSessionCookie(res, token);
    return token;
  };

  const invalidateUserSessions = (userId: string, exceptToken?: string): number => {
    let removed = 0;
    for (const [tok, rec] of sessions.entries()) {
      if (rec.userId === userId && tok !== exceptToken) {
        sessions.delete(tok);
        removed++;
      }
    }
    return removed;
  };

  const listUserSessions = (userId: string, currentToken?: string) => {
    const now = Date.now();
    const list: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      ip: string;
      userAgent: string;
      isCurrent: boolean;
    }> = [];
    for (const [tok, rec] of sessions.entries()) {
      if (rec.expiresAt <= now) {
        sessions.delete(tok);
        continue;
      }
      if (rec.userId === userId) {
        list.push({
          id: tok.slice(0, 10),
          createdAt: rec.createdAt,
          expiresAt: new Date(rec.expiresAt).toISOString(),
          ip: rec.ip,
          userAgent: rec.userAgent,
          isCurrent: !!currentToken && tok === currentToken
        });
      }
    }
    return list;
  };

  // --- 1. AUTH STATUS (Public, checks if admin is initialized) ---
  app.get('/api/auth/status', (_req, res) => {
    loadAccounts();
    const primaryAdmin = users.find(u => u.id === 'local-admin') || users.find(u => u.role === 'admin') || null;
    res.json({
      success: true,
      initialized: !!account || !!primaryAdmin,
      username: primaryAdmin ? primaryAdmin.username : (account ? account.username : null),
      allowRegistration: true,
      userCount: users.length
    });
  });

  // --- 2. ADMIN FIRST-TIME SETUP (Strictly only when NO admin account exists) ---
  app.post('/api/auth/setup', checkOriginGuard, (req, res) => {
    loadAccounts();
    if (account || users.some(u => u.role === 'admin')) {
      return res.status(400).json({
        success: false,
        error: 'Sicherheitsrichtlinie: Administrator ist bereits eingerichtet. Diese Funktion ist dauerhaft gesperrt.'
      });
    }

    const { username, password, email } = req.body || {};

    const uCheck = validateUsername(username);
    if (!uCheck.valid) {
      return res.status(400).json({ success: false, error: uCheck.reason });
    }

    const pCheck = validatePasswordStrength(password);
    if (!pCheck.valid) {
      return res.status(400).json({ success: false, error: pCheck.reason });
    }

    const cleanUsername = username.trim();
    const cleanEmail = typeof email === 'string' && email.trim() ? email.trim() : `${cleanUsername.toLowerCase()}@apexhost.local`;
    const salt = randomBytes(32).toString('hex');
    const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    const nowIso = new Date().toISOString();

    const adminUser: StoredUserAccount = {
      id: 'local-admin',
      username: cleanUsername,
      email: cleanEmail,
      role: 'admin',
      salt,
      hash,
      balance: 100,
      status: 'active',
      customerNumber: 'KD-ADMIN-0001',
      fullName: cleanUsername,
      company: 'ApexHost Administration',
      phone: '',
      street: '',
      zipCity: '',
      country: 'Deutschland',
      twoFactorEnabled: false,
      twoFactorSecret: '',
      apiToken: '',
      createdAt: nowIso,
      lastLoginAt: nowIso
    };

    users = [adminUser, ...users.filter(u => u.id !== 'local-admin')];
    saveUsersToDisk();
    syncLegacyAdminFile(adminUser);

    console.log(`[Sonora Auth] Administrator "${cleanUsername}" wurde sicher initialisiert (scrypt + 256-bit Salt).`);

    const token = createSessionForUser(req, res, adminUser.id);
    res.json({
      success: true,
      message: 'Administrator erfolgreich und sicher eingerichtet.',
      user: toPublicUser(adminUser, true),
      token
    });
  });

  // --- 2b. REAL USER SELF-REGISTRATION ---
  app.post('/api/auth/register', checkOriginGuard, (req, res) => {
    loadAccounts();
    if (!account && !users.some(u => u.role === 'admin')) {
      return res.status(400).json({
        success: false,
        error: 'Bitte zuerst die Administrator-Ersteinrichtung abschließen.',
        needsSetup: true
      });
    }

    const {
      username,
      email,
      password,
      fullName,
      company,
      phone,
      street,
      zipCity,
      country
    } = req.body || {};

    const uCheck = validateUsername(username);
    if (!uCheck.valid) {
      return res.status(400).json({ success: false, error: uCheck.reason });
    }

    const eCheck = validateEmail(email);
    if (!eCheck.valid) {
      return res.status(400).json({ success: false, error: eCheck.reason });
    }

    const pCheck = validatePasswordStrength(password);
    if (!pCheck.valid) {
      return res.status(400).json({ success: false, error: pCheck.reason });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return res.status(409).json({ success: false, error: `Der Benutzername "${cleanUsername}" ist bereits vergeben.` });
    }
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, error: `Die E-Mail-Adresse "${cleanEmail}" ist bereits registriert.` });
    }

    const salt = randomBytes(32).toString('hex');
    const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    const welcomeBonus = getWelcomeBonusEur();
    const nowIso = new Date().toISOString();

    const newUser: StoredUserAccount = {
      id: `usr_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
      username: cleanUsername,
      email: cleanEmail,
      role: 'user',
      salt,
      hash,
      balance: welcomeBonus,
      status: 'active',
      customerNumber: generateCustomerNumber(users),
      fullName: typeof fullName === 'string' && fullName.trim() ? fullName.trim().slice(0, 80) : cleanUsername,
      company: typeof company === 'string' ? company.trim().slice(0, 80) : '',
      phone: typeof phone === 'string' ? phone.trim().slice(0, 40) : '',
      street: typeof street === 'string' ? street.trim().slice(0, 100) : '',
      zipCity: typeof zipCity === 'string' ? zipCity.trim().slice(0, 80) : '',
      country: typeof country === 'string' && country.trim() ? country.trim().slice(0, 60) : 'Deutschland',
      twoFactorEnabled: false,
      twoFactorSecret: '',
      apiToken: '',
      createdAt: nowIso,
      lastLoginAt: nowIso
    };

    users.push(newUser);
    saveUsersToDisk();

    if (onUserRegisteredHook) {
      try {
        onUserRegisteredHook(newUser, welcomeBonus);
      } catch (hookErr) {
        console.error('[Sonora Auth] onUserRegisteredHook failed:', hookErr);
      }
    }

    const token = createSessionForUser(req, res, newUser.id);
    console.log(`[Sonora Auth] Neuer Kunde "${cleanUsername}" (${newUser.customerNumber}) registriert (+${welcomeBonus.toFixed(2)} € Startguthaben).`);

    res.status(201).json({
      success: true,
      message: `Konto "${cleanUsername}" erfolgreich registriert! Kundennummer: ${newUser.customerNumber}`,
      user: toPublicUser(newUser, true),
      welcomeBonus,
      token
    });
  });

  // --- 3. SECURE LOGIN (Multi-User by Username OR Email, Rate Limiting, Timing-Safe) ---
  app.post('/api/auth/login', checkOriginGuard, (req, res) => {
    loadAccounts();
    if (!account && users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Es ist noch kein Administrator eingerichtet. Bitte Ersteinrichtung durchführen.',
        needsSetup: true
      });
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rawIdentifier = typeof req.body?.username === 'string'
      ? req.body.username
      : (typeof req.body?.email === 'string' ? req.body.email : '');
    const normalizedId = rawIdentifier.trim().toLowerCase();
    const rateKey = `${ip}:${normalizedId}`;
    const now = Date.now();
    const attemptRecord = loginAttempts.get(rateKey) || { count: 0, lockedUntil: 0 };

    if (attemptRecord.lockedUntil > now) {
      const waitSeconds = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Sicherheitssperre aktiv: Zu viele fehlgeschlagene Versuche. Bitte warten Sie noch ${waitSeconds} Sekunden.`
      });
    }

    const { password } = req.body || {};
    if (!normalizedId || typeof password !== 'string' || password.length > 128) {
      return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten.' });
    }

    const targetUser = users.find(
      u => u.username.toLowerCase() === normalizedId || (u.email && u.email.toLowerCase() === normalizedId)
    ) || null;

    // Constant-time scrypt execution even when user is not found to prevent timing enumeration
    const saltToUse = targetUser ? targetUser.salt : (account?.salt || '00'.repeat(32));
    const expectedHex = targetUser ? targetUser.hash : (account?.hash || '00'.repeat(64));
    const computedHash = scryptSync(password, saltToUse, 64, { N: 16384, r: 8, p: 1 });
    const storedHash = Buffer.from(expectedHex, 'hex');
    const passwordMatch = !!targetUser && computedHash.length === storedHash.length && timingSafeEqual(computedHash, storedHash);

    if (!passwordMatch || !targetUser) {
      attemptRecord.count += 1;
      if (attemptRecord.count >= MAX_ATTEMPTS) {
        attemptRecord.lockedUntil = now + LOCKOUT_MS;
      }
      loginAttempts.set(rateKey, attemptRecord);

      return res.status(401).json({
        success: false,
        error: 'Benutzername/E-Mail oder Passwort ist falsch.'
      });
    }

    if (targetUser.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Dieses Benutzerkonto wurde durch einen Administrator gesperrt.'
      });
    }

    loginAttempts.delete(rateKey);
    targetUser.lastLoginAt = new Date(now).toISOString();
    saveUsersToDisk();

    const token = createSessionForUser(req, res, targetUser.id);
    res.json({
      success: true,
      message: 'Erfolgreich angemeldet.',
      user: toPublicUser(targetUser, true),
      token
    });
  });

  // --- 4. CHECK SESSION (Authenticated) ---
  app.get('/api/auth/session', (req, res) => {
    loadAccounts();
    if (!account && users.length === 0) {
      return res.json({ success: false, needsSetup: true, user: null });
    }
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Nicht angemeldet', user: null });
    }
    const currentToken = extractToken(req);
    res.json({
      success: true,
      user: toPublicUser(user, true),
      sessions: listUserSessions(user.id, currentToken)
    });
  });

  // --- 5. LOGOUT ---
  app.post('/api/auth/logout', (req, res) => {
    const token = extractToken(req);
    if (token) sessions.delete(token);
    try {
      res.clearCookie('sonora_session', { path: '/' });
    } catch {}
    res.json({ success: true, message: 'Erfolgreich abgemeldet.' });
  });

  // --- 5b. LOGOUT ALL OTHER SESSIONS ---
  app.post('/api/auth/logout-all', checkOriginGuard, requireAuth, (req, res) => {
    const user: StoredUserAccount = (req as any).authUser;
    const currentToken = extractToken(req);
    const removed = invalidateUserSessions(user.id, currentToken);
    res.json({
      success: true,
      removedCount: removed,
      sessions: listUserSessions(user.id, currentToken),
      message: `${removed} weitere Sitzung(en) wurden beendet.`
    });
  });

  // --- 6. CHANGE PASSWORD (Works for ANY authenticated user) ---
  app.post('/api/auth/change-password', checkOriginGuard, (req, res) => {
    loadAccounts();
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte vorher anmelden.' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'Ungültige Anfragedaten.' });
    }

    const checkHash = scryptSync(currentPassword, user.salt, 64, { N: 16384, r: 8, p: 1 });
    const storedHash = Buffer.from(user.hash, 'hex');
    if (checkHash.length !== storedHash.length || !timingSafeEqual(checkHash, storedHash)) {
      return res.status(400).json({ success: false, error: 'Das aktuelle Passwort ist nicht korrekt.' });
    }

    const pCheck = validatePasswordStrength(newPassword);
    if (!pCheck.valid) {
      return res.status(400).json({ success: false, error: pCheck.reason });
    }

    const newSalt = randomBytes(32).toString('hex');
    const newHash = scryptSync(newPassword, newSalt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

    user.salt = newSalt;
    user.hash = newHash;
    user.updatedAt = new Date().toISOString();
    saveUsersToDisk();

    if (user.id === 'local-admin') {
      syncLegacyAdminFile(user);
    }

    invalidateUserSessions(user.id);
    const newToken = createSessionForUser(req, res, user.id);

    console.log(`[Sonora Auth] Passwort für "${user.username}" sicher geändert. Alle alten Sitzungen wurden ungültig gemacht.`);
    res.json({
      success: true,
      message: 'Passwort erfolgreich aktualisiert. Alle vorherigen Sitzungen wurden aus Sicherheitsgründen beendet.',
      token: newToken
    });
  });

  return {
    extractToken,
    getSessionUser,
    toPublicUser,
    requireAuth,
    requireAdmin,
    checkOriginGuard,
    listUsers: () => {
      loadAccounts();
      return users;
    },
    getUserById: (id: string) => {
      loadAccounts();
      return users.find(u => u.id === id) || null;
    },
    findUserByEmailOrUsername: (identifier: string) => {
      loadAccounts();
      const norm = identifier.trim().toLowerCase();
      return users.find(u => u.username.toLowerCase() === norm || u.email.toLowerCase() === norm) || null;
    },
    updateUser: (id: string, patch: Partial<StoredUserAccount>) => {
      loadAccounts();
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      users[idx] = {
        ...users[idx],
        ...patch,
        id: users[idx].id,
        updatedAt: new Date().toISOString()
      };
      saveUsersToDisk();
      if (users[idx].id === 'local-admin') {
        syncLegacyAdminFile(users[idx]);
      }
      return users[idx];
    },
    deleteUser: (id: string) => {
      loadAccounts();
      const before = users.length;
      users = users.filter(u => u.id !== id);
      if (users.length === before) return false;
      invalidateUserSessions(id);
      saveUsersToDisk();
      return true;
    },
    invalidateUserSessions,
    listUserSessions,
    setOnUserRegisteredHook: (hook) => {
      onUserRegisteredHook = hook;
    },
    setPermissionsResolver: (resolver) => {
      permissionsResolver = resolver;
    }
  };
}
