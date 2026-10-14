// Exercise actual backend handlers with no TCP listener and no game processes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repo = process.cwd();
const sandbox = fs.mkdtempSync(path.join(repo, 'audit', 'regression-'));
const dataDir = path.join(sandbox, 'data', 'servers');
fs.mkdirSync(dataDir, { recursive: true });
const routes = new Map(), params = new Map(), spawns = [], checks = [];
let authGate, failSpawn = false, fakeListen = 0;
let fetchImpl = () => { throw new Error('External network disabled in regression'); };
const app = {
  use(...args) { if (args[0] === '/api' && args[1].length === 3) authGate = args[1]; },
  param(name, handler) { params.set(name, handler); },
  get(route, ...handlers) { routes.set('GET ' + route, handlers); },
  post(route, ...handlers) { routes.set('POST ' + route, handlers); },
  put(route, ...handlers) { routes.set('PUT ' + route, handlers); },
  delete(route, ...handlers) { routes.set('DELETE ' + route, handlers); },
  listen(_port, _host, callback) { fakeListen++; callback?.(); return { close(callback) { callback?.(); } }; },
};
function express() { return app; }
express.json = () => (_req, _res, next) => next?.();
express.static = () => (_req, _res, next) => next?.();
function spawn(executable, args, options) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.pid = 99000 + spawns.length;
  child.kills = [];
  child.stdin = { writable: true, write(value) { child.lastInput = value; if (value === 'stop\n') setImmediate(() => child.emit('close', 0, null)); } };
  child.kill = signal => { child.kills.push(signal); setImmediate(() => child.emit('close', null, signal)); return true; };
  spawns.push({ executable, args, options, child });
  const shouldFail = failSpawn; failSpawn = false;
  setImmediate(() => child.emit(shouldFail ? 'error' : 'spawn', ...(shouldFail ? [Object.assign(new Error('Fixture spawn failure'), { code: 'ENOENT' })] : [])));
  return child;
}
const context = vm.createContext({
  console: { log() {}, error() {} }, Buffer, URL, URLSearchParams, AbortSignal,
  process: { env: { NODE_ENV: 'production', APEXHOST_DATA_DIR: dataDir }, platform: 'linux', cwd: () => repo,
    once() {}, exit() { throw new Error('Unexpected manager exit in regression'); },
    kill() { throw Object.assign(new Error('Not alive'), { code: 'ESRCH' }); } },
  fetch: (...args) => fetchImpl(...args), setTimeout, clearTimeout,
});
const imports = {
  express: { default: express }, dotenv: { default: { config() {} } },
  path: { default: path }, url: { fileURLToPath }, fs: { default: fs }, os: { default: os },
  'node:crypto': { createHash: crypto.createHash },
  child_process: { exec: (_cmd, callback) => callback(null, '', 'openjdk version "25.0.1"'), execSync: (_cmd) => Buffer.from('openjdk version "25.0.1"'), execFile() { throw new Error('Unexpected extraction in fixture'); }, spawn, ChildProcess: EventEmitter },
  net: { default: { createServer() {
    const net = new EventEmitter(); net.listen = () => setImmediate(() => net.emit('listening')); net.close = () => {}; return net;
  } } },
};
const javaModule = await import('../backend/java.ts');
imports['./backend/java.ts'] = { ...javaModule, ensureJdk: async (root, major) => path.join(root, 'jdk-' + major, 'bin', 'java') };
imports['./backend/java'] = imports['./backend/java.ts'];
const password = 'Regression-Fixture-Password-Only';
const previous = Object.fromEntries(['SONORA_ADMIN_PASSWORD', 'SONORA_ADMIN_USERNAME', 'SONORA_PUBLIC_ORIGIN'].map(key => [key, process.env[key]]));
process.env.SONORA_ADMIN_PASSWORD = password;
process.env.SONORA_ADMIN_USERNAME = 'admin';
delete process.env.SONORA_PUBLIC_ORIGIN;
const module = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync('server.ts', 'utf8'), { mode: 'strip' }), {
  context, identifier: pathToFileURL(path.join(repo, 'server.ts')).href,
  initializeImportMeta(meta) { meta.url = pathToFileURL(path.join(repo, 'server.ts')).href; },
});
await module.link(async name => {
  let values = imports[name];
  if (!values && (name.startsWith('./backend/') || name.startsWith('./src/data/'))) {
    let target = path.join(repo, name);
    if (!fs.existsSync(target) && fs.existsSync(target + '.ts')) target += '.ts';
    values = await import(pathToFileURL(target).href);
  }
  assert.ok(values, 'Unexpected import ' + name);
  return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
});
try { await module.evaluate(); } finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
assert.equal(fakeListen, 1);
let cookie = '';
async function call(method, route, id, body = {}, query = {}, authenticated = true, extra = {}) {
  const req = { method, params: id && typeof id === 'object' ? id : id ? { id } : {}, body, query, ip: '127.0.0.1',
    headers: { cookie: authenticated ? cookie : '', ...extra }, protocol: 'http', secure: false, get: () => 'localhost:3000' };
  const res = { statusCode: 200, body: null, headersSent: false,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; this.headersSent = true; return this; },
    cookie(name, value) { cookie = name + '=' + value; },
    clearCookie() { cookie = ''; },
  };
  const next = error => { if (error) res.status(error.status || 400).json({ success: false, error: error.message }); };
  if (route !== '/api/auth/login') authGate(req, res, next);
  if (res.headersSent) return res;
  if (req.params.id) params.get('id')(req, res, next, req.params.id);
  if (res.headersSent) return res;
  for (const handler of routes.get(method + ' ' + route)) {
    await handler(req, res, next);
    if (res.headersSent) break;
  }
  return res;
}
function check(name, condition) { assert.ok(condition, name); checks.push(name); }

check('Unauthenticated API denied', (await call('GET', '/api/servers')).statusCode === 401);
check('Wrong password denied', (await call('POST', '/api/auth/login', null, { username: 'admin', password: 'wrong' })).statusCode === 401);
check('Correct password accepted', (await call('POST', '/api/auth/login', null, { username: 'admin', password })).body.success);
check('Cross-site mutation denied', (await call('POST', '/api/servers/create', null, {}, {}, true, { origin: 'https://foreign.invalid' })).statusCode === 403);
const definition = { id: 'fixture', category: 'minecraft', name: 'Fixture', port: 25570, allocatedRamGb: 4, minecraftType: 'paper', version: '1.21.4', targetOS: 'linux' };
check('Traversal create rejected', (await call('POST', '/api/servers/create', null, { server: { ...definition, id: '../escaped' } })).statusCode === 400);
check('Traversal log read rejected', (await call('GET', '/api/servers/:id/logs', '..')).statusCode === 400);
check('Outside executable rejected', (await call('POST', '/api/servers/create', null, { server: { ...definition, linuxExecutable: '../../escape' } })).statusCode === 400);
check('Unsupported engine rejected', (await call('POST', '/api/servers/create', null, { server: { ...definition, minecraftType: 'forge' } })).statusCode === 400);
check('Cross-platform claim rejected', (await call('POST', '/api/servers/create', null, { server: { ...definition, targetOS: 'windows' } })).statusCode === 400);
check('Create persists actual instance', (await call('POST', '/api/servers/create', null, { server: definition })).statusCode === 201 && fs.existsSync(path.join(sandbox, 'data', 'manager', 'servers.json')));
check('Duplicate create preserves data', (await call('POST', '/api/servers/create', null, { server: definition })).statusCode === 409);
check('New EULA is not auto-accepted', fs.readFileSync(path.join(dataDir, 'fixture', 'eula.txt'), 'utf8').includes('eula=false'));
check('File write reaches host fixture', (await call('POST', '/api/servers/:id/file', 'fixture', { path: 'test.txt', content: 'REAL FIXTURE' })).body.success && fs.readFileSync(path.join(dataDir, 'fixture', 'test.txt'), 'utf8') === 'REAL FIXTURE');
check('File traversal denied', (await call('POST', '/api/servers/:id/file', 'fixture', { path: '../escape.txt', content: 'FAIL' })).statusCode === 400);
check('File read returns actual data', (await call('GET', '/api/servers/:id/file', 'fixture', {}, { path: 'test.txt' })).body.content === 'REAL FIXTURE');
check('Binary upload handler stores actual bytes', (await call('POST', '/api/servers/:id/upload', 'fixture', Buffer.from('BINARY FIXTURE'), { path: 'upload.bin' })).body.success && fs.readFileSync(path.join(dataDir, 'fixture', 'upload.bin'), 'utf8') === 'BINARY FIXTURE');
check('Upload does not overwrite existing files', (await call('POST', '/api/servers/:id/upload', 'fixture', Buffer.from('REPLACE'), { path: 'upload.bin' })).statusCode === 400 && fs.readFileSync(path.join(dataDir, 'fixture', 'upload.bin'), 'utf8') === 'BINARY FIXTURE');
check('Offline command is not falsely successful', (await call('POST', '/api/servers/:id/command', 'fixture', { command: 'save-all' })).statusCode === 409);
fs.writeFileSync(path.join(dataDir, 'fixture', 'paper.jar'), 'FIXTURE ONLY');
check('Start requires EULA acceptance', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'start' })).statusCode === 400);
fs.writeFileSync(path.join(dataDir, 'fixture', 'eula.txt'), 'eula=true\n');
failSpawn = true;
check('Spawn errors return failure without unhandled event', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'start' })).statusCode === 400);
check('Valid process start remains starting until ready', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'start' })).body.status === 'starting');
const old = spawns.at(-1).child;
old.stdout.emit('data', Buffer.from('Done (1.1s)! For help, type "help"\n'));
check('Readiness updates actual state', (await call('GET', '/api/servers')).body.servers[0].status === 'running');
check('Console sends actual stdin command', (await call('POST', '/api/servers/:id/command', 'fixture', { command: 'save-all' })).body.success && old.lastInput === 'save-all\n');
check('Multiline command rejected', (await call('POST', '/api/servers/:id/command', 'fixture', { command: 'say a\nstop' })).statusCode === 400);
const count = spawns.length;
check('Restart launches a replacement', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'restart' })).body.success && spawns.length === count + 1);
old.emit('close', 0, null);
check('Old close cannot remove replacement', (await call('GET', '/api/servers/:id/logs', 'fixture')).body.isRunning === true);
const replacement = spawns.at(-1).child;
check('Kill immediately sends SIGKILL', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'kill' })).body.success && replacement.kills[0] === 'SIGKILL');

fetchImpl = async () => ({ ok: false, status: 404 });
check('Unavailable version fails without fallback', (await call('POST', '/api/servers/:id/install', 'fixture', { version: '26.999' })).statusCode === 400);
const jar = Buffer.from('PK\u0003\u0004Verified fixture');
fetchImpl = async url => String(url).startsWith('https://fill.papermc.io/')
  ? { ok: true, json: async () => [{ id: 123, channel: 'STABLE', downloads: { 'server:default': { url: 'https://fill-data.papermc.io/fixture.jar', checksums: { sha256: crypto.createHash('sha256').update(jar).digest('hex') } } } }] }
  : { ok: true, body: (async function* () { yield jar; })() };
check('Verified Paper download installs requested version', (await call('POST', '/api/servers/:id/install', 'fixture', { version: '1.21.4' })).body.version === '1.21.4' && fs.readFileSync(path.join(dataDir, 'fixture', 'paper.jar')).equals(jar));
const first = call('POST', '/api/servers/:id/power', 'fixture', { action: 'start' });
check('Concurrent power action blocked', (await call('POST', '/api/servers/:id/power', 'fixture', { action: 'start' })).statusCode === 409);
await first;
await call('POST', '/api/servers/:id/power', 'fixture', { action: 'kill' });
check('JDK 26 selection is installed and persisted', (await call('POST', '/api/servers/:id/java', 'fixture', {javaVersion:'Java 26'})).body.javaVersion === 'Java 26');
check('Too-old JDK cannot replace selected runtime', (await call('POST', '/api/servers/:id/java', 'fixture', {javaVersion:'Java 8'})).statusCode === 400);
await call('POST', '/api/servers/:id/power', 'fixture', {action:'start'});
check('Actual launch uses selected absolute JDK path', spawns.at(-1).executable.endsWith(path.join('.runtime','jdks','jdk-26','bin','java')));
check('JAVA_HOME matches selected executable', spawns.at(-1).options.env.JAVA_HOME.endsWith(path.join('.runtime','jdks','jdk-26')));
check('Running instance rejects JDK replacement', (await call('POST', '/api/servers/:id/java', 'fixture', {javaVersion:'Java 25'})).statusCode === 409);
await call('POST', '/api/servers/:id/power', 'fixture', {action:'kill'});
const nativeDefinition = { ...definition, id: 'native', category: 'survival', gameId: 'valheim', port: 25573, steamAppId: 896660, linuxExecutable: 'valheim_server.x86_64', linuxStartArgs: '--name "two words"' };
await call('POST', '/api/servers/create', null, { server: nativeDefinition });
fs.writeFileSync(path.join(dataDir, 'native', 'valheim_server.x86_64'), 'FIXTURE ONLY');
check('Native start preserves argument quoting', (await call('POST', '/api/servers/:id/power', 'native', { action: 'start' })).body.success && spawns.at(-1).args[1] === 'ApexHost Valheim');
check('Valheim worlds use instance-specific storage', spawns.at(-1).args.includes('-savedir') && spawns.at(-1).args.includes(path.join(dataDir, 'native', 'saves')) && spawns.at(-1).options.env.SteamAppId === '892970');
await call('POST', '/api/servers/:id/power', 'native', { action: 'kill' });
fs.mkdirSync(path.join(sandbox, 'data', 'steamcmd'), { recursive: true });
fs.writeFileSync(path.join(sandbox, 'data', 'steamcmd', 'steamcmd.sh'), 'FIXTURE ONLY');
const steamInstall = call('POST', '/api/servers/:id/install', 'native');
await new Promise(resolve => setImmediate(resolve));
spawns.at(-1).child.emit('close', null, 'SIGTERM');
check('Signal-terminated SteamCMD fails instead of reporting success', (await steamInstall).statusCode === 400);
check('SteamCMD explicitly selects public branch', JSON.stringify(spawns.at(-1).args).includes('"-beta","public"'));
fs.unlinkSync(path.join(dataDir, 'native', 'valheim_server.x86_64'));
const missingFilesInstall = call('POST', '/api/servers/:id/install', 'native');
await new Promise(resolve => setImmediate(resolve));
spawns.at(-1).child.stdout.emit('data', Buffer.from("Success! App '896660' fully installed."));
spawns.at(-1).child.emit('close', 0, null);
check('SteamCMD success without actual server files fails', (await missingFilesInstall).statusCode === 400);
fs.writeFileSync(path.join(dataDir, 'native', 'valheim_server.x86_64'), 'FIXTURE ONLY');
const noConfirmationInstall = call('POST', '/api/servers/:id/install', 'native');
await new Promise(resolve => setImmediate(resolve));
spawns.at(-1).child.emit('close', 0, null);
check('SteamCMD exit zero alone is not falsely successful', (await noConfirmationInstall).statusCode === 400);
const confirmedInstall = call('POST', '/api/servers/:id/install', 'native');
await new Promise(resolve => setImmediate(resolve));
spawns.at(-1).child.stdout.emit('data', Buffer.from("Success! App '896660' fully installed."));
spawns.at(-1).child.emit('close', 0, null);
check('Confirmed Steam installation checks executable and saves state', (await confirmedInstall).body.success && JSON.parse(fs.readFileSync(path.join(sandbox, 'data', 'manager', 'servers.json'))).native.requiresInstall === false);
check('Selected native instance port reaches launch arguments', spawns.find(entry => entry.executable.endsWith('valheim_server.x86_64')).args.includes('25573'));
const unsupportedNative = { ...nativeDefinition, id: 'unsupported', port: 25610, gameId: 'space_engineers', steamAppId: 298740 };
check('Unsupported Windows-only catalogue adapter rejected before creating folder', (await call('POST', '/api/servers/create', null, { server: unsupportedNative })).statusCode === 400 && !fs.existsSync(path.join(dataDir, 'unsupported')));
fetchImpl = async () => ({ ok: false, status: 404 });
const failedAutoCreate = await call('POST', '/api/servers/create', null, { server: { ...definition, id: 'failed_install', port: 25611 }, autoInstall: true });
check('Failed auto-install retains instance with persistent error and retry state', failedAutoCreate.body.installationError && failedAutoCreate.body.server.requiresInstall && JSON.parse(fs.readFileSync(path.join(sandbox, 'data', 'manager', 'servers.json'))).failed_install.installationError);
fetchImpl = async () => ({ ok: true, json: async () => ({ versions: { '26': ['26.3', '26.1'], '1.21': ['1.21.4', '1.21.11'], malicious: ['../../outside', '26.3'] } }) });
const published = await call('GET', '/api/installers/paper/versions');
check('Versions endpoint uses published distinct sorted versions', JSON.stringify(published.body.versions) === JSON.stringify(['26.3', '26.1', '1.21.11', '1.21.4']));
const { parseArguments, confinedPath, instancePath, readFileTail } = await import('../backend/paths.ts');
check('Quoted and empty start arguments preserved', JSON.stringify(parseArguments('--name "two words" --empty ""')) === JSON.stringify(['--name', 'two words', '--empty', '']));
check('Unterminated quoted argument rejected', (() => { try { parseArguments('"broken'); return false; } catch { return true; } })());
const ntfsFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'Sonora-Path-Test-'));
fs.mkdirSync(path.join(ntfsFixture, 'inside')); fs.mkdirSync(path.join(ntfsFixture, 'outside'));
fs.symlinkSync(path.join(ntfsFixture, 'outside'), path.join(ntfsFixture, 'inside', 'junction'), 'junction');
check('Existing junction cannot escape instance root', (() => { try { confinedPath(path.join(ntfsFixture, 'inside'), 'junction/secret.txt'); return false; } catch { return true; } })());
check('Instance junction cannot escape server root', (() => { try { instancePath(path.join(ntfsFixture, 'inside'), 'junction'); return false; } catch { return true; } })());
const largeLog = path.join(sandbox, 'large-test.log');
fs.writeFileSync(largeLog, 'OLD\n'.repeat(100000) + 'NEWEST LINE\n');
check('Large log read is bounded and retains newest line', Buffer.byteLength(readFileTail(largeLog)) <= 256 * 1024 && readFileTail(largeLog).endsWith('NEWEST LINE\n'));
const realFetch = globalThis.fetch;
const plugin = Buffer.from('PK\u0003\u0004Plugin fixture');
let pluginHash = crypto.createHash('sha512').update(plugin).digest('hex');
let pluginHost = 'https://cdn.modrinth.com/fixture.jar';
let requiredDependency = false;
globalThis.fetch = async url => String(url).startsWith('https://api.modrinth.com/')
  ? { ok: true, json: async () => [{ game_versions: ['1.21.4'], loaders: ['paper'], version_number: '1.0',
      dependencies: requiredDependency ? [{ dependency_type: 'required' }] : [], files: [{ primary: true, url: pluginHost, size: plugin.length, hashes: { sha512: pluginHash } }] }] }
  : { ok: true, body: (async function* () { yield plugin; })() };
try {
  const mod = { id: 'mr_testplugin', source: 'Modrinth', name: 'Fixture Plugin' };
  check('Unsupported mod provider fails explicitly', (await call('POST', '/api/servers/:id/mods', 'fixture', { mod: { ...mod, source: 'CurseForge' } })).statusCode === 400);
  pluginHost = 'http://127.0.0.1/private';
  check('Plugin download cannot target internal host', (await call('POST', '/api/servers/:id/mods', 'fixture', { mod })).statusCode === 400);
  pluginHost = 'https://cdn.modrinth.com/fixture.jar'; pluginHash = 'BAD';
  check('Plugin checksum mismatch rejected', (await call('POST', '/api/servers/:id/mods', 'fixture', { mod })).statusCode === 400);
  pluginHash = crypto.createHash('sha512').update(plugin).digest('hex'); requiredDependency = true;
  check('Unresolved required dependency is not falsely installed', (await call('POST', '/api/servers/:id/mods', 'fixture', { mod })).statusCode === 400);
  requiredDependency = false;
  check('Plugin installs verified real bytes', (await call('POST', '/api/servers/:id/mods', 'fixture', { mod })).body.success && fs.readFileSync(path.join(dataDir, 'fixture', 'plugins', 'testplugin.jar')).equals(plugin));
  check('Disable changes actual plugin filename', (await call('POST', '/api/servers/:id/mods/toggle', 'fixture', { installedModId: 'testplugin', enabled: false })).body.success && fs.existsSync(path.join(dataDir, 'fixture', 'plugins', 'testplugin.jar.disabled')));
  check('Enable restores actual plugin filename', (await call('POST', '/api/servers/:id/mods/toggle', 'fixture', { installedModId: 'testplugin', enabled: true })).body.success && fs.existsSync(path.join(dataDir, 'fixture', 'plugins', 'testplugin.jar')));
  check('Uninstall removes actual plugin bytes', (await call('DELETE', '/api/servers/:id/mods', 'fixture', { installedModId: 'testplugin' })).body.success && !fs.existsSync(path.join(dataDir, 'fixture', 'plugins', 'testplugin.jar')));
} finally { globalThis.fetch = realFetch; }
// Real tar processes act only on this tiny fixture; no game process or service.
const backup = await call('POST', '/api/servers/:id/backups', 'fixture');
check('Backup creates an actual archive', backup.body.success && backup.body.backup.fileSizeMb > 0);
const backupId = backup.body.backup.id;
fs.writeFileSync(path.join(dataDir, 'fixture', 'test.txt'), 'CHANGED AFTER BACKUP');
const restored = await call('POST', '/api/servers/:id/backups/:backupId/restore', { id: 'fixture', backupId });
check('Restore recovers original fixture bytes', restored.body.success && fs.readFileSync(path.join(dataDir, 'fixture', 'test.txt'), 'utf8') === 'REAL FIXTURE');
check('Restore preserves previous files separately', fs.readdirSync(path.join(sandbox, 'data', 'manager', 'restore-recovery')).length === 1);
const archivePath = path.join(sandbox, 'data', 'manager', 'backups', 'fixture', backupId + '.tar.gz');
fs.appendFileSync(archivePath, 'TAMPER');
check('Tampered archive is rejected', (await call('POST', '/api/servers/:id/backups/:backupId/restore', { id: 'fixture', backupId })).statusCode === 400);
check('Instance-root deletion is denied', (await call('DELETE', '/api/servers/:id/file', 'fixture', { path: '/' })).statusCode === 400);
check('Backup deletion reaches actual filesystem', (await call('DELETE', '/api/servers/:id/backups/:backupId', { id: 'fixture', backupId })).body.success && !fs.existsSync(archivePath));
check('Instance deletion removes registry and preserves files', (await call('DELETE', '/api/servers/:id', 'fixture')).body.success && fs.readdirSync(path.join(sandbox, 'data', 'manager', 'deleted')).length === 1);
check('Logout invalidates server session', (await call('POST', '/api/auth/logout')).body.success && (await call('GET', '/api/servers')).statusCode === 401);
fs.writeFileSync('audit/regression-update02.json', JSON.stringify({ checks, sandbox, servicesStarted: false, gameProcessesStarted: false, externalNetworkUsed: false }, null, 2));
console.log(checks.length + ' backend regression checks passed. No real server/game processes started.');
