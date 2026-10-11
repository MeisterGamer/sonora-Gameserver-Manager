import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';

export function configureAuth(app: Express, stateDir: string) {
  fs.mkdirSync(stateDir, { recursive: true });
  const accountFile = path.join(stateDir, 'admin.json');
  let account: { username: string; salt: string; hash: string };
  if (fs.existsSync(accountFile)) account = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
  else {
    const password = process.env.SONORA_ADMIN_PASSWORD || randomBytes(24).toString('base64url');
    if (password.length < 12) throw new Error('SONORA_ADMIN_PASSWORD muss mindestens 12 Zeichen enthalten');
    const salt = randomBytes(16).toString('hex');
    account = { username: process.env.SONORA_ADMIN_USERNAME || 'admin', salt, hash: scryptSync(password, salt, 64).toString('hex') };
    fs.writeFileSync(accountFile, JSON.stringify(account), { mode: 0o600, flag: 'wx' });
    if (!process.env.SONORA_ADMIN_PASSWORD) {
      const credentialsFile = path.join(stateDir, 'admin-bootstrap.txt');
      fs.writeFileSync(credentialsFile, `Sonora local administrator\nUsername: ${account.username}\nPassword: ${password}\nKeep this file private; remove it after saving the credentials.\n`, { mode: 0o600, flag: 'wx' });
      console.log(`[Sonora] Erstzugang lokal gespeichert: ${credentialsFile}`);
    }
  }
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  const sessionDuration = 8 * 60 * 60 * 1000;
  const publicOrigin = process.env.SONORA_PUBLIC_ORIGIN ? new URL(process.env.SONORA_PUBLIC_ORIGIN).origin : '';
  const user = { id: 'local-admin', username: account.username, email: '', role: 'admin', balance: 0,
    status: 'active', avatarInitials: account.username.slice(0, 2).toUpperCase(), createdAt: '', twoFactorEnabled: false, apiToken: '' };
  const tokenFrom = (req: Request) => {
    const cookie = req.headers.cookie || '';
    return cookie.split(';').map(c => c.trim()).find(c => c.startsWith('sonora_session='))?.slice('sonora_session='.length) || '';
  };
  const authorized = (req: Request) => {
    const token = tokenFrom(req);
    const expiry = sessions.get(token);
    if (!expiry || expiry <= Date.now()) { sessions.delete(token); return false; }
    return true;
  };
  const sameOrigin = (req: Request) => {
    const origin = req.headers.origin;
    return (!origin || origin === (publicOrigin || req.protocol + '://' + req.get('host'))) && req.headers['sec-fetch-site'] !== 'cross-site';
  };
  app.post('/api/auth/login', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ success: false, error: 'Fremder Request-Ursprung' });
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const ip = req.ip || 'unknown';
    const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 10 || attempts.size >= 1000) return res.status(429).json({ success: false, error: 'Zu viele Anmeldeversuche; später erneut versuchen' });
    attempt.count++; attempts.set(ip, attempt);
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 1024) {
      return res.status(401).json({ success: false, error: 'Anmeldung fehlgeschlagen' });
    }
    const actual = scryptSync(password, account.salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(account.hash, 'hex')) || username !== account.username) {
      return res.status(401).json({ success: false, error: 'Anmeldung fehlgeschlagen' });
    }
    for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
    if (sessions.size >= 100) return res.status(429).json({ success: false, error: 'Zu viele aktive Sitzungen' });
    attempts.delete(ip);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, now + sessionDuration);
    res.cookie('sonora_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure || publicOrigin.startsWith('https://'), maxAge: sessionDuration, path: '/' });
    res.json({ success: true, user });
  });
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (!authorized(req)) return res.status(401).json({ success: false, error: 'Bitte mit dem lokalen Manager-Administratorkonto anmelden' });
    if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({ success: false, error: 'Fremder Request-Ursprung' });
    next();
  });
  app.get('/api/auth/session', (_req, res) => res.json({ success: true, user }));
  app.post('/api/auth/logout', (req, res) => {
    sessions.delete(tokenFrom(req));
    res.clearCookie('sonora_session', { path: '/' });
    res.json({ success: true });
  });
}
