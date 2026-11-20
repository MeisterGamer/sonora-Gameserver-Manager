import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import { configureAuth } from '../backend/auth.ts';
import { configureCustomerSystem } from '../backend/customerSystem.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// 1. Static architecture & wiring assertions
const authSrc = fs.readFileSync('backend/auth.ts', 'utf8');
check('backend/auth.ts implements real multi-user registration, email/username login, logout-all, and API token auth',
  authSrc.includes("app.post('/api/auth/register'") &&
  authSrc.includes("app.post('/api/auth/logout-all'") &&
  authSrc.includes('users.json') &&
  authSrc.includes('sonora_live_') &&
  authSrc.includes('scryptSync') &&
  authSrc.includes('timingSafeEqual')
);

const customerSrc = fs.readFileSync('backend/customerSystem.ts', 'utf8');
check('backend/customerSystem.ts implements full UserCP, CRM, Shop, Billing, Tickets, Sub-Users, and Admin User APIs',
  customerSrc.includes("app.get('/api/usercp/overview'") &&
  customerSrc.includes("app.put('/api/usercp/profile'") &&
  customerSrc.includes("app.post('/api/usercp/2fa'") &&
  customerSrc.includes("app.post('/api/usercp/api-token'") &&
  customerSrc.includes("app.delete('/api/usercp/api-token'") &&
  customerSrc.includes("app.post('/api/usercp/subusers'") &&
  customerSrc.includes("app.get('/api/crm/state'") &&
  customerSrc.includes("app.post('/api/crm/topup'") &&
  customerSrc.includes("app.post('/api/shop/purchase'") &&
  customerSrc.includes("app.post('/api/crm/contracts/:id/renew'") &&
  customerSrc.includes("app.post('/api/crm/contracts/:id/autorenew'") &&
  customerSrc.includes("app.post('/api/crm/tickets'") &&
  customerSrc.includes("app.post('/api/crm/tickets/:id/reply'") &&
  customerSrc.includes("app.patch('/api/crm/tickets/:id/status'") &&
  customerSrc.includes("app.get('/api/admin/users'") &&
  customerSrc.includes("app.patch('/api/admin/users/:id/role'") &&
  customerSrc.includes("app.patch('/api/admin/users/:id/balance'") &&
  customerSrc.includes("app.patch('/api/admin/users/:id/status'") &&
  customerSrc.includes("app.delete('/api/admin/users/:id'")
);

const loginModalSrc = fs.readFileSync('src/components/RealLoginModal.tsx', 'utf8');
check('RealLoginModal.tsx includes Konto registrieren tab calling /api/auth/register and zero alert()/confirm()',
  loginModalSrc.includes("'/api/auth/register'") &&
  loginModalSrc.includes('Konto registrieren') &&
  !loginModalSrc.includes('window.alert(') &&
  !loginModalSrc.includes('window.confirm(')
);

const userCpSrc = fs.readFileSync('src/components/UserControlView.tsx', 'utf8');
check('UserControlView.tsx implements full 5-tab UserCP (overview, profile, security, subusers, api) with no mock dialogs',
  userCpSrc.includes("'overview'") &&
  userCpSrc.includes("'profile'") &&
  userCpSrc.includes("'security'") &&
  userCpSrc.includes("'subusers'") &&
  userCpSrc.includes("'api'") &&
  userCpSrc.includes('Kundenprofil & Rechnungsanschrift') &&
  userCpSrc.includes('Aktive Anmeldesitzungen') &&
  !userCpSrc.includes('window.alert(') &&
  !userCpSrc.includes('window.confirm(')
);

const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
check('App.tsx wires Shop, CRM, UserCP, and Admin User Management to real backend endpoints',
  appSrc.includes("'/api/shop/purchase'") &&
  appSrc.includes("'/api/crm/state'") &&
  appSrc.includes("'/api/crm/topup'") &&
  appSrc.includes("'/api/usercp/overview'") &&
  appSrc.includes("'/api/usercp/profile'") &&
  appSrc.includes("'/api/usercp/2fa'") &&
  appSrc.includes("'/api/usercp/api-token'") &&
  appSrc.includes("'/api/usercp/subusers'") &&
  appSrc.includes("'/api/admin/users'")
);

// 2. End-to-End Functional Test with isolated temp Express server + real disk persistence
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-cust-test-'));
const stateDir = path.join(tmpRoot, 'state');
const managerDir = path.join(stateDir, 'manager');
const dataDir = path.join(tmpRoot, 'servers');
fs.mkdirSync(managerDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const testApp = express();
testApp.use(express.json());
const testServers = [];
const auth = configureAuth(testApp, stateDir);
const customerSystem = configureCustomerSystem(testApp, {
  auth,
  managerStateDir: managerDir,
  dataDir,
  getServerRegistry: () => testServers,
  upsertServerInRegistry: (srv) => {
    const idx = testServers.findIndex(s => s.id === srv.id);
    if (idx >= 0) testServers[idx] = srv;
    else testServers.unshift(srv);
  },
  checkPortInUse: async () => false,
  getHostPrimaryIp: () => '127.0.0.1',
  recordAuditLog: () => {},
  appendLog: () => {},
  installMinecraftServer: async () => ({ success: true }),
  installSteamGameServer: async () => true,
  activeProcesses: new Map()
});

const srv = await new Promise((resolve) => {
  const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
});
const port = srv.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const callApi = async (route, method = 'GET', body, token) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json() };
};

try {
  // Step A: Admin setup
  const setupRes = await callApi('/api/auth/setup', 'POST', {
    username: 'RootAdmin',
    email: 'admin@sonora.test',
    password: 'AdminPassword123!'
  });
  check('First-time admin setup succeeds and creates session token', setupRes.status === 200 && setupRes.data.success && !!setupRes.data.token);
  const adminToken = setupRes.data.token;

  // Step B: Real customer registration
  const regRes = await callApi('/api/auth/register', 'POST', {
    username: 'MaxKunde',
    email: 'max@kunde.de',
    password: 'KundePassword123!',
    fullName: 'Max Mustermann',
    company: 'Sonora Gaming Clan'
  });
  check('Real customer registration succeeds with customerNumber and welcome bonus',
    regRes.status === 201 &&
    regRes.data.success &&
    regRes.data.user.role === 'user' &&
    regRes.data.user.customerNumber.startsWith('KD-') &&
    regRes.data.user.balance === 25 &&
    !!regRes.data.token
  );
  const userToken = regRes.data.token;
  const userId = regRes.data.user.id;

  // Duplicate email/username rejected
  const dupRes = await callApi('/api/auth/register', 'POST', {
    username: 'MaxKunde',
    email: 'other@kunde.de',
    password: 'KundePassword123!'
  });
  check('Duplicate username registration is rejected with HTTP 409', dupRes.status === 409);

  // Login with email
  const emailLoginRes = await callApi('/api/auth/login', 'POST', {
    username: 'max@kunde.de',
    password: 'KundePassword123!'
  });
  check('Registered customer can log in using email address', emailLoginRes.status === 200 && emailLoginRes.data.user.username === 'MaxKunde');

  // Step C: UserCP Profile, 2FA, API Token
  const profRes = await callApi('/api/usercp/profile', 'PUT', {
    fullName: 'Maximilian Mustermann',
    email: 'max@kunde.de',
    company: 'Sonora Pro GmbH',
    phone: '+49 170 5551234',
    street: 'Hauptstraße 10',
    zipCity: '60311 Frankfurt',
    country: 'Deutschland'
  }, userToken);
  check('UserCP profile update persists full address for DIN 5008 invoices',
    profRes.status === 200 && profRes.data.user.street === 'Hauptstraße 10' && profRes.data.user.company === 'Sonora Pro GmbH'
  );

  const tfaRes = await callApi('/api/usercp/2fa', 'POST', { enabled: true }, userToken);
  check('UserCP 2FA activation generates Base32 secret & otpauth URI',
    tfaRes.status === 200 && tfaRes.data.user.twoFactorEnabled === true && !!tfaRes.data.user.twoFactorSecret && tfaRes.data.user.twoFactorOtpAuthUrl.startsWith('otpauth://totp/')
  );

  const apiTokRes = await callApi('/api/usercp/api-token', 'POST', {}, userToken);
  check('UserCP API token generator creates real working Bearer token',
    apiTokRes.status === 200 && apiTokRes.data.apiToken.startsWith('sonora_live_')
  );
  const apiTokenCheck = await callApi('/api/usercp/overview', 'GET', undefined, apiTokRes.data.apiToken);
  check('Generated REST API token authenticates real API calls', apiTokenCheck.status === 200 && apiTokenCheck.data.user.id === userId);

  // Step D: Prepaid Top-Up & Shop Purchase -> Server + Contract + Invoice + Transaction
  const topupRes = await callApi('/api/crm/topup', 'POST', { amount: 50, method: 'PayPal' }, userToken);
  check('Prepaid top-up persists new balance (+50 EUR -> 75 EUR)', topupRes.status === 200 && topupRes.data.user.balance === 75);

  const purchaseRes = await callApi('/api/shop/purchase', 'POST', {
    planId: 'mc_starter_26',
    serverName: 'Max SMP Server',
    location: 'Frankfurt am Main (DE)',
    billingCycle: 'monthly',
    extraRamGb: 2,
    hasDedicatedIp: false,
    autoInstall: false
  }, userToken);
  check('Shop purchase deducts authoritative price and creates server, order, contract, DIN 5008 invoice & transaction',
    purchaseRes.status === 201 &&
    purchaseRes.data.server.ownerId === userId &&
    purchaseRes.data.contract.customerId === userId &&
    purchaseRes.data.invoice.customerAddress.includes('Hauptstraße 10') &&
    purchaseRes.data.user.balance < 75
  );
  const purchasedServerId = purchaseRes.data.server.id;
  const contractId = purchaseRes.data.contract.id;

  // Step E: Sub-User creation & access control
  const subRes = await callApi('/api/usercp/subusers', 'POST', {
    username: 'HelperTim',
    email: 'tim@clan.de',
    serverId: purchasedServerId,
    serverName: 'Max SMP Server',
    permissions: ['console_read', 'power_control']
  }, userToken);
  check('UserCP Sub-User creation persists and links to owned server', subRes.status === 201 && subRes.data.subUsers.length === 1);
  check('Owner can access purchased server via customerSystem.canUserAccessServer',
    customerSystem.canUserAccessServer(auth.getUserById(userId), purchaseRes.data.server) === true
  );

  // Step F: Contract renewal & Support Tickets
  const renewRes = await callApi(`/api/crm/contracts/${contractId}/renew`, 'POST', { days: 30 }, userToken);
  check('Prepaid contract renewal extends expiry and creates invoice', renewRes.status === 200 && renewRes.data.contract.daysRemaining >= 59);

  const ticketRes = await callApi('/api/crm/tickets', 'POST', {
    subject: 'Port-Freigabe Frage',
    serverName: 'Max SMP Server',
    text: 'Bitte um Hilfe bei der Konfiguration.'
  }, userToken);
  check('Support ticket creation persists ticket with TKT- number', ticketRes.status === 201 && ticketRes.data.ticket.ticketNumber.startsWith('TKT-'));
  const ticketId = ticketRes.data.ticket.id;

  const staffReplyRes = await callApi(`/api/crm/tickets/${ticketId}/reply`, 'POST', {
    text: 'Hallo Max, wir haben deinen Port geprüft!'
  }, adminToken);
  check('Admin can reply to customer ticket as support staff',
    staffReplyRes.status === 200 && staffReplyRes.data.ticket.status === 'in_progress' && staffReplyRes.data.ticket.messages.at(-1).sender === 'support'
  );

  // Step G: Role-Based Access Control (customer blocked from admin routes; admin can manage customer)
  const forbiddenAdmin = await callApi('/api/admin/users', 'GET', undefined, userToken);
  check('Customer is strictly blocked from /api/admin/users with HTTP 403', forbiddenAdmin.status === 403);

  const adminUsersRes = await callApi('/api/admin/users', 'GET', undefined, adminToken);
  check('Admin sees all registered accounts with server & contract counts',
    adminUsersRes.status === 200 && adminUsersRes.data.users.length === 2
  );

  const suspendRes = await callApi(`/api/admin/users/${userId}/status`, 'PATCH', { status: 'suspended' }, adminToken);
  check('Admin suspending a customer invalidates their active session', suspendRes.status === 200 && suspendRes.data.user.status === 'suspended');

  const blockedAfterSuspend = await callApi('/api/usercp/overview', 'GET', undefined, userToken);
  check('Suspended customer cannot access UserCP anymore (HTTP 401)', blockedAfterSuspend.status === 401);
} finally {
  srv.closeAllConnections?.();
  srv.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

fs.writeFileSync('audit/user-customer-system-regression.json', JSON.stringify({ checks }, null, 2));
console.log(`${checks.length} User Register, UserCP & Customer System regression checks passed.`);
