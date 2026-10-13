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

export function configureAuth(app: Express, stateDir: string) {
  fs.mkdirSync(stateDir, { recursive: true });
  const accountFile = path.join(stateDir, 'admin.json');

  let account: AdminAccount | null = null;
  const loadAccount = () => {
    if (fs.existsSync(accountFile)) {
      try {
        account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
      } catch {
        account = null;
      }
    } else {
      account = null;
    }
  };
  loadAccount();

  // Active Sessions: token -> expiry timestamp
  const sessions = new Map<string, number>();

  // Rate Limiting: key (IP or user) -> { count, lockedUntil }
  const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout after 5 failures
  const sessionDuration = 24 * 60 * 60 * 1000; // 24 hours

  // Cleanup expired sessions & attempts every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of sessions.entries()) {
      if (expiry <= now) sessions.delete(token);
    }
    for (const [key, record] of loginAttempts.entries()) {
      if (record.lockedUntil <= now) loginAttempts.delete(key);
    }
  }, 10 * 60 * 1000);

  const getUserPayload = () => {
    if (!account) return null;
    return {
      id: 'local-admin',
      username: account.username,
      email: account.email || '',
      role: 'admin',
      balance: 100,
      status: 'active',
      avatarInitials: account.username.slice(0, 2).toUpperCase(),
      createdAt: account.createdAt,
      twoFactorEnabled: false,
      apiToken: ''
    };
  };

  const extractToken = (req: Request): string => {
    // 1. Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    // 2. Cookie sonora_session
    const cookie = req.headers.cookie || '';
    const cookieToken = cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('sonora_session='))
      ?.slice('sonora_session='.length);
    if (cookieToken) return cookieToken;

    return '';
  };

  const isAuthorized = (req: Request): boolean => {
    const token = extractToken(req);
    if (!token) return false;
    const expiry = sessions.get(token);
    if (!expiry || expiry <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  };

  // Safe Origin Validation (prevents external CSRF attacks while allowing Google Cloud Run, iFrame & local host)
  const isAllowedOrigin = (req: Request): boolean => {
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
    if (!origin) return true; // Direct same-origin requests often have no origin header

    try {
      const url = new URL(origin);
      const host = url.hostname.toLowerCase();
      const currentHost = (req.get('host') || '').split(':')[0].toLowerCase();

      // Allow localhost / loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;

      // Allow current host
      if (host === currentHost) return true;

      // Allow official Google Cloud Run deployment subdomains
      if (host.endsWith('.run.app')) return true;

      // Allow Google AI Studio domain where iFrames are embedded
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

  // --- 1. AUTH STATUS (Public, checks if admin is initialized) ---
  app.get('/api/auth/status', (_req, res) => {
    loadAccount();
    res.json({
      success: true,
      initialized: !!account,
      username: account ? account.username : null
    });
  });

  // --- 2. ADMIN FIRST-TIME SETUP (Strictly only when NO admin account exists) ---
  app.post('/api/auth/setup', checkOriginGuard, (req, res) => {
    loadAccount();
    if (account) {
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
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const salt = randomBytes(32).toString('hex');
    const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

    account = {
      username: cleanUsername,
      email: cleanEmail,
      salt,
      hash,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(accountFile, JSON.stringify(account, null, 2), { mode: 0o600 });
    console.log(`[Sonora Auth] Administrator "${cleanUsername}" wurde sicher initialisiert (scrypt + 256-bit Salt).`);

    // Create session
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + sessionDuration);
    setSecureSessionCookie(res, token);

    res.json({
      success: true,
      message: 'Administrator erfolgreich und sicher eingerichtet.',
      user: getUserPayload(),
      token
    });
  });

  // --- 3. SECURE LOGIN (With Brute-Force Rate Limiting & Timing-Safe Verification) ---
  app.post('/api/auth/login', checkOriginGuard, (req, res) => {
    loadAccount();
    if (!account) {
      return res.status(400).json({
        success: false,
        error: 'Es ist noch kein Administrator eingerichtet. Bitte Ersteinrichtung durchführen.',
        needsSetup: true
      });
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateKey = `${ip}:${(req.body?.username || '').trim().toLowerCase()}`;
    const now = Date.now();
    const attemptRecord = loginAttempts.get(rateKey) || { count: 0, lockedUntil: 0 };

    if (attemptRecord.lockedUntil > now) {
      const waitSeconds = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Sicherheitssperre aktiv: Zu viele fehlgeschlagene Versuche. Bitte warten Sie noch ${waitSeconds} Sekunden.`
      });
    }

    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) {
      return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten.' });
    }

    // Verify username match constant-time check
    const providedUser = Buffer.from(username.trim().toLowerCase());
    const expectedUser = Buffer.from(account.username.toLowerCase());
    const usernameMatch = providedUser.length === expectedUser.length && timingSafeEqual(providedUser, expectedUser);

    // Compute scrypt hash
    const computedHash = scryptSync(password, account.salt, 64, { N: 16384, r: 8, p: 1 });
    const storedHash = Buffer.from(account.hash, 'hex');
    const passwordMatch = computedHash.length === storedHash.length && timingSafeEqual(computedHash, storedHash);

    if (!usernameMatch || !passwordMatch) {
      attemptRecord.count += 1;
      if (attemptRecord.count >= MAX_ATTEMPTS) {
        attemptRecord.lockedUntil = now + LOCKOUT_MS;
      }
      loginAttempts.set(rateKey, attemptRecord);

      return res.status(401).json({
        success: false,
        error: 'Benutzername oder Passwort ist falsch.'
      });
    }

    // Successful login: reset failed attempts
    loginAttempts.delete(rateKey);

    // Generate high-entropy session token
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, now + sessionDuration);
    setSecureSessionCookie(res, token);

    res.json({
      success: true,
      message: 'Erfolgreich angemeldet.',
      user: getUserPayload(),
      token
    });
  });

  // --- 4. CHECK SESSION (Authenticated) ---
  app.get('/api/auth/session', (req, res) => {
    loadAccount();
    if (!account) {
      return res.json({ success: false, needsSetup: true, user: null });
    }
    if (!isAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Nicht angemeldet', user: null });
    }
    res.json({ success: true, user: getUserPayload() });
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

  // --- 6. CHANGE PASSWORD (Strictly requires existing active authentication + current password) ---
  app.post('/api/auth/change-password', checkOriginGuard, (req, res) => {
    loadAccount();
    if (!isAuthorized(req)) {
      return res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte vorher anmelden.' });
    }
    if (!account) {
      return res.status(400).json({ success: false, error: 'Kein Administrator-Konto vorhanden.' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'Ungültige Anfragedaten.' });
    }

    // Verify current password
    const checkHash = scryptSync(currentPassword, account.salt, 64, { N: 16384, r: 8, p: 1 });
    const storedHash = Buffer.from(account.hash, 'hex');
    if (checkHash.length !== storedHash.length || !timingSafeEqual(checkHash, storedHash)) {
      return res.status(400).json({ success: false, error: 'Das aktuelle Passwort ist nicht korrekt.' });
    }

    // Validate new password strength
    const pCheck = validatePasswordStrength(newPassword);
    if (!pCheck.valid) {
      return res.status(400).json({ success: false, error: pCheck.reason });
    }

    // Re-hash with fresh CSPRNG salt
    const newSalt = randomBytes(32).toString('hex');
    const newHash = scryptSync(newPassword, newSalt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

    account.salt = newSalt;
    account.hash = newHash;
    account.updatedAt = new Date().toISOString();

    fs.writeFileSync(accountFile, JSON.stringify(account, null, 2), { mode: 0o600 });

    // Invalidate all existing sessions for security
    sessions.clear();

    // Generate new session token for the current user
    const newToken = randomBytes(32).toString('base64url');
    sessions.set(newToken, Date.now() + sessionDuration);
    setSecureSessionCookie(res, newToken);

    console.log(`[Sonora Auth] Administrator-Passwort für "${account.username}" sicher geändert. Alle alten Sitzungen wurden ungültig gemacht.`);
    res.json({
      success: true,
      message: 'Passwort erfolgreich aktualisiert. Alle vorherigen Sitzungen wurden aus Sicherheitsgründen beendet.',
      token: newToken
    });
  });
}
