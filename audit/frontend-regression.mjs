import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
function handler(file, from, to, names, context) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, 'Source markers found');
  const code = stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' });
  return vm.runInNewContext('(async () => { ' + code + '; return {' + names + '}; })()', context);
}

let fail = true, requests = [], messages = [], refreshes = 0;
const context = {
  apiRequest: async (url, method, body) => { requests.push({ url, method, body }); if (fail) throw new Error('OFFLINE FIXTURE'); return { success: true, status: body.action === 'start' ? 'starting' : 'offline' }; },
  refreshServers: async () => { refreshes++; },
  showToast: value => messages.push(value),
};
const power = await handler('src/App.tsx', '  const runPower', '  const handleDeleteServer', 'handleStartServer, handleStopServer, handleRestartServer, handleKillServer', context);
await power.handleStartServer('fixture');
check('Network/start failure has no fabricated success', messages.length === 1 && messages[0] === 'OFFLINE FIXTURE');
messages = []; await power.handleStopServer('fixture');
check('Stop failure is reported instead of simulated exit', messages.length === 1 && messages[0] === 'OFFLINE FIXTURE');
fail = false; await power.handleRestartServer('fixture');
check('UI restart requests atomic backend restart', requests.at(-1).body.action === 'restart');
await power.handleKillServer('fixture');
check('UI kill actually calls backend', requests.at(-1).body.action === 'kill');

let selected = false, refreshed = false, createMessage = '';
const create = await handler('src/App.tsx', '  const handleCreateNewServer', '  const handlePurchaseServer', 'handleCreateNewServer', {
  selectedOS: 'windows', apiRequest: async () => { throw new Error('CREATE FAILURE'); },
  refreshServers: async () => { refreshed = true; }, setSelectedServerId: () => { selected = true; },
  setCurrentNavTab() {}, showToast: message => { createMessage = message; },
});
await assert.rejects(create.handleCreateNewServer({ name: 'Fixture' }), /CREATE FAILURE/);
check('Failed create does not invent/select an instance', !selected && !refreshed && createMessage === 'CREATE FAILURE');

let loggedIn = false, closed = false, passwordSent = false, loginError = '';
const login = await handler('src/components/RealLoginModal.tsx', '  const login', '  const logout', 'login', {
  username: 'admin', password: 'wrong', setBusy() {}, setError: message => { loginError = message; }, setPassword() {},
  apiRequest: async (_url, _method, body) => { passwordSent = body.password === 'wrong'; throw new Error('AUTH FAILURE'); },
  onSelectUser: () => { loggedIn = true; }, onClose: () => { closed = true; },
});
await login.login({ preventDefault() {} });
check('Login sends password and preserves rejected state', passwordSent && !loggedIn && !closed && loginError === 'AUTH FAILURE');

let fileMessages = [];
const fileActions = await handler('src/components/RealFileManagerView.tsx', '  const action', '  const open', 'action', {
  setBusy() {}, setMessage: message => fileMessages.push(message), refresh: async () => {},
});
await fileActions.action(async () => { throw new Error('WRITE FAILURE'); }, 'SAVED');
check('File save failure cannot show saved confirmation', fileMessages.at(-1) === 'WRITE FAILURE' && !fileMessages.includes('SAVED'));
fs.writeFileSync('audit/frontend-regression.json', JSON.stringify({ checks, servicesStarted: false, browsersStarted: false }, null, 2));
console.log(checks.length + ' original-handler frontend regression checks passed (no browser/service).');
