import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { downloadPaper, paperVersions, paperJavaVersion } from '../backend/paper.ts';
import { STEAM_INSTALLERS, installerSupport } from '../src/data/installerSupport.ts';
import { STEAM_GAMES_DATABASE } from '../src/data/steamGames.ts';
import { steamProfile, installedSteamExecutable, normalizeSteamDefinition } from '../backend/gameInstaller.ts';
import { downloadMinecraft, minecraftVersions } from '../backend/minecraft.ts';
const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Sonora-Installer-Test-'));
const bytes = Buffer.from('PK\u0003\u0004Fixture only, never executed');
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
let builds, content = bytes, requested = [];
const stable = id => ({ id, channel: 'STABLE', downloads: { 'server:default': { url: 'https://fill-data.papermc.io/test.jar', checksums: { sha256: hash } } } });
const request = async (url, options) => {
  requested.push({ url: String(url), options });
  return String(url).startsWith('https://fill.papermc.io/')
    ? { ok: true, json: async () => builds }
    : { ok: true, body: (async function* () { yield content; })() };
};
try {
  builds = [stable(1), { ...stable(50), channel: 'BETA' }, stable(9)];
  check('Highest stable build is chosen regardless of response order', (await downloadPaper(root, '26.3', request)).build === 9);
  check('Requested version is never silently replaced', requested[0].url.includes('/26.3/builds'));
  check('Download request rejects redirects and identifies application', requested.every(item => item.options.redirect === 'error' && item.options.headers['User-Agent'].includes('Sonora-Manager')));
  check('Verified archive bytes are installed', fs.readFileSync(path.join(root, 'paper.jar')).equals(bytes));
  content = Buffer.from('corrupted');
  await assert.rejects(downloadPaper(root, '26.3', request), /SHA-256/);
  check('Checksum failure preserves previous working JAR', fs.readFileSync(path.join(root, 'paper.jar')).equals(bytes));
  content = bytes; builds = [stable(9)];
  builds[0].downloads['server:default'].url = 'https://127.0.0.1/internal';
  await assert.rejects(downloadPaper(root, '26.3', request), /Downloadhost/); checks.push('Untrusted download host rejected');
  builds = [{ ...stable(3), channel: 'BETA' }];
  await assert.rejects(downloadPaper(root, '26.3', request), /stabiler/); checks.push('Beta-only version fails without fallback');
  check('Explicit experimental consent installs the requested beta build', (await downloadPaper(root, '26.3', request, true)).channel === 'BETA');
  builds = [{ ...stable(5), channel: 'ALPHA' }, { ...stable(3), channel: 'BETA' }];
  check('Experimental consent prefers beta over alpha', (await downloadPaper(root, '26.3', request, true)).build === 3);
  await assert.rejects(downloadPaper(root, '../26.3', request), /konkrete/); checks.push('Invalid version rejected before network request');
  await assert.rejects(paperVersions(async () => ({ ok: true, json: async () => ({}) })), /keine/); checks.push('Malformed versions response fails explicitly');
  for (const [version, expected] of [['26.3', 25], ['1.21.11', 21], ['1.20.4', 21], ['1.19.4', 17], ['1.16.5', 16], ['1.16.4', 11], ['1.8.8', 8]]) check('Required Java for Paper ' + version, paperJavaVersion(version) === expected);
  let experimental = true;
  const purpurRequest = async url => String(url).endsWith('/download')
    ? { ok: true, body: (async function* () { yield bytes; })() }
    : { ok: true, json: async () => ({ result: 'SUCCESS', version: '26.3', build: '5', metadata: experimental ? { type: 'experimental' } : {}, md5: crypto.createHash('md5').update(bytes).digest('hex') }) };
  await assert.rejects(downloadMinecraft(root, 'purpur', '26.3', purpurRequest), /Freigabe/); checks.push('Experimental Purpur requires explicit consent');
  check('Purpur installs its own verified JAR with explicit consent', (await downloadMinecraft(root, 'purpur', '26.3', purpurRequest, true)).channel === 'EXPERIMENTAL' && fs.readFileSync(path.join(root, 'purpur.jar')).equals(bytes));
  experimental = false;
  check('Stable Purpur does not need experimental consent', (await downloadMinecraft(root, 'purpur', '26.3', purpurRequest)).channel === 'STABLE');
  const metadataText = JSON.stringify({ id: '26.3', javaVersion: { majorVersion: 25 }, downloads: { server: { url: 'https://piston-data.mojang.com/fixture/server.jar', sha1: crypto.createHash('sha1').update(bytes).digest('hex') } } });
  let metadataHash = crypto.createHash('sha1').update(metadataText).digest('hex');
  const vanillaRequest = async url => String(url).endsWith('version_manifest_v2.json')
    ? { ok: true, json: async () => ({ versions: [{ id: '26.3', type: 'release', url: 'https://piston-meta.mojang.com/fixture/version.json', sha1: metadataHash }, { id: '26.4-snapshot-3', type: 'snapshot' }] }) }
    : String(url).endsWith('/version.json') ? { ok: true, text: async () => metadataText }
    : { ok: true, body: (async function* () { yield bytes; })() };
  check('Vanilla versions come from release manifest and exclude snapshots', JSON.stringify(await minecraftVersions('vanilla', vanillaRequest)) === JSON.stringify(['26.3']));
  const vanilla = await downloadMinecraft(root, 'vanilla', '26.3', vanillaRequest);
  check('Vanilla installs official server.jar with verified metadata and archive', vanilla.requiredJava === 25 && fs.readFileSync(path.join(root, 'server.jar')).equals(bytes));
  check('Installing another engine leaves Paper JAR intact', fs.readFileSync(path.join(root, 'paper.jar')).equals(bytes));
  metadataHash = '0'.repeat(40);
  await assert.rejects(downloadMinecraft(root, 'vanilla', '26.3', vanillaRequest), /Metadaten-Prüfsumme/); checks.push('Tampered Vanilla metadata rejected before downloading server');
  await assert.rejects(downloadMinecraft(root, 'vanilla', '26.999', vanillaRequest), /kein Versionswechsel/); checks.push('Unavailable Vanilla version never falls back');
  await assert.rejects(downloadMinecraft(root, 'forge', '26.3', request), /Engine/); checks.push('Unimplemented Minecraft engines are rejected');
  for (const [gameId, profile] of Object.entries(STEAM_INSTALLERS)) {
    const game = STEAM_GAMES_DATABASE.find(item => item.id === gameId);
    check('Catalogue/profile agree for ' + gameId, game?.steamAppId === profile.appId && !installerSupport(game, 'linux'));
    const server = { gameId, steamAppId: profile.appId, port: 30123, queryPort: 30124, rconPort: 30125 };
    normalizeSteamDefinition(server);
    check('Launch port is allocated instance port for ' + gameId, server.linuxStartArgs.includes('30123'));
    assert.throws(() => installedSteamExecutable(root, server), /fehlt/); checks.push('Missing executable rejected for ' + gameId);
    assert.throws(() => steamProfile({ ...server, steamAppId: 1 }), /AppID/); checks.push('Wrong dedicated AppID rejected for ' + gameId);
  }
  const installer = fs.readFileSync('install.sh', 'utf8');
  check('Linux deployment exports clean shared runtime path', installer.includes('export PATH="$NODE_ROOT/bin:') && !installer.includes('$(which npx)'));
  check('Linux service deploys committed immutable source', installer.includes('git -C "$SOURCE_DIR" archive HEAD') && installer.includes('WorkingDirectory=$RELEASE_DIR'));
  check('Default deployment does not start manager', installer.includes('START=false') && installer.includes('if $START; then'));
  check('Repair override is replaced and persistent data path pinned', installer.includes('"$UNIT.d/paths.conf"') && installer.includes('Environment=APEXHOST_DATA_DIR=$DATA_ROOT/servers'));
  check('Service user preflight runs before unit replacement', installer.indexOf('"$RELEASE_DIR/scripts/check-runtime.mjs"') < installer.indexOf('cat > "$UNIT"'));
  check('Node and fallback Java archives require SHA256 verification', (installer.match(/sha256sum --check/g) || []).length === 2);
  console.log(checks.length + ' installer regression checks passed. No live services/game processes started.');
  fs.writeFileSync('audit/installer-regression.json', JSON.stringify({ checks, servicesStarted: false, networkUsed: false }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
