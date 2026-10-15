import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { 
  buildZipArchive, 
  getTargetDirAndExt, 
  buildVerifiedModArtifact,
  configureMods 
} from '../backend/mods.ts';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. ZIP Archive Builder Verification ---
const testFiles = {
  'plugin.yml': 'name: TestPlugin\nversion: "1.0.0"\nmain: org.test.Main\n',
  'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nCreated-By: Sonora\n'
};
const zipBuf = buildZipArchive(testFiles);
check('buildZipArchive produces valid PK header (0x50, 0x4B, 0x03, 0x04)', zipBuf[0] === 0x50 && zipBuf[1] === 0x4B && zipBuf[2] === 0x03 && zipBuf[3] === 0x04);
check('buildZipArchive size is non-trivial', zipBuf.length > 200);

// --- 2. Target Directory & Extension Determination ---
const paperServer = { category: 'minecraft', minecraftType: 'paper', gameId: 'mc_paper', version: '1.21.4' };
const purpurServer = { category: 'minecraft', minecraftType: 'purpur', gameId: 'mc_purpur', version: '1.21.4' };
const spigotServer = { category: 'minecraft', minecraftType: 'spigot', gameId: 'mc_spigot', version: '1.21.4' };
const fabricServer = { category: 'minecraft', minecraftType: 'fabric', gameId: 'mc_fabric', version: '1.21.4' };
const forgeServer = { category: 'minecraft', minecraftType: 'forge', gameId: 'mc_forge', version: '1.20.1' };
const neoforgeServer = { category: 'minecraft', minecraftType: 'neoforge', gameId: 'mc_neoforge', version: '1.21.4' };
const rustServer = { category: 'survival', gameId: 'rust', name: 'Rust Server' };
const valheimServer = { category: 'survival', gameId: 'valheim', name: 'Valheim Server' };
const terrariaServer = { category: 'adventure', gameId: 'terraria', name: 'Terraria Server' };

check('Paper servers target plugins/ directory', getTargetDirAndExt(paperServer, { id: 'luckperms' }).dir === 'plugins');
check('Purpur servers target plugins/ directory', getTargetDirAndExt(purpurServer, { id: 'essentialsx' }).dir === 'plugins');
check('Spigot servers target plugins/ directory', getTargetDirAndExt(spigotServer, { id: 'worldedit' }).dir === 'plugins');
check('Fabric servers target mods/ directory', getTargetDirAndExt(fabricServer, { id: 'sodium' }).dir === 'mods');
check('Forge servers target mods/ directory', getTargetDirAndExt(forgeServer, { id: 'jei' }).dir === 'mods');
check('NeoForge servers target mods/ directory', getTargetDirAndExt(neoforgeServer, { id: 'create' }).dir === 'mods');
check('Rust servers target oxide/plugins/ directory', getTargetDirAndExt(rustServer, { id: 'kits' }).dir === 'oxide/plugins');
check('Rust plugins use .cs extension', getTargetDirAndExt(rustServer, { id: 'kits' }).ext === '.cs');
check('Valheim servers target BepInEx/plugins/ directory', getTargetDirAndExt(valheimServer, { id: 'valheimplus' }).dir === 'BepInEx/plugins');
check('Terraria servers target tModLoader/Mods/ directory', getTargetDirAndExt(terrariaServer, { id: 'calamity' }).dir === 'tModLoader/Mods');

// Mod with fabric loader tag targeting mods folder even on generic server
check('Mod with Fabric loader routes to mods/ directory', getTargetDirAndExt(paperServer, { id: 'sodium', loaders: ['fabric'] }).dir === 'mods');

// --- 3. Artifact Generation Verification ---
const bukkitJar = buildVerifiedModArtifact({ id: 'luckperms', name: 'LuckPerms', version: '5.4.140' }, 'bukkit');
check('Bukkit artifact is valid PK archive', bukkitJar[0] === 0x50 && bukkitJar[1] === 0x4B);
check('Bukkit artifact contains plugin.yml', bukkitJar.toString('utf8').includes('plugin.yml') && bukkitJar.toString('utf8').includes('LuckPerms'));

const fabricJar = buildVerifiedModArtifact({ id: 'sodium', name: 'Sodium', version: '0.6.9' }, 'fabric');
check('Fabric artifact is valid PK archive', fabricJar[0] === 0x50 && fabricJar[1] === 0x4B);
check('Fabric artifact contains fabric.mod.json', fabricJar.toString('utf8').includes('fabric.mod.json') && fabricJar.toString('utf8').includes('Sodium'));

const forgeJar = buildVerifiedModArtifact({ id: 'jei', name: 'Just Enough Items', version: '15.0.0' }, 'forge');
check('Forge artifact is valid PK archive', forgeJar[0] === 0x50 && forgeJar[1] === 0x4B);
check('Forge artifact contains META-INF/mods.toml', forgeJar.toString('utf8').includes('META-INF/mods.toml'));

const oxideScript = buildVerifiedModArtifact({ id: 'kits', name: 'Kits', version: '1.0.5' }, 'oxide');
check('Oxide artifact is C# code with Oxide.Plugins', oxideScript.toString('utf8').includes('Oxide.Plugins') && oxideScript.toString('utf8').includes('RustPlugin'));

// --- 4. Live Server Integration Mock Testing ---
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-mods-test-'));
try {
  const mockServers = [
    { id: 'srv_paper', name: 'My Paper Server', category: 'minecraft', minecraftType: 'paper', gameId: 'mc_paper', version: '1.21.4', installedMods: [] },
    { id: 'srv_fabric', name: 'My Fabric Server', category: 'minecraft', minecraftType: 'fabric', gameId: 'mc_fabric', version: '1.21.4', installedMods: [] },
    { id: 'srv_forge', name: 'My Forge Server', category: 'minecraft', minecraftType: 'forge', gameId: 'mc_forge', version: '1.20.1', installedMods: [] },
    { id: 'srv_rust', name: 'My Rust Server', category: 'survival', gameId: 'rust', version: 'Latest', installedMods: [] }
  ];

  for (const s of mockServers) {
    fs.mkdirSync(path.join(tmpRoot, s.id), { recursive: true });
  }

  const registered = (id) => {
    const found = mockServers.find(s => s.id === id);
    if (!found) throw new Error('Not found');
    return found;
  };

  const routes = {};
  const mockApp = {
    post: (path, handler) => { routes['POST ' + path] = handler; },
    delete: (path, handler) => { routes['DELETE ' + path] = handler; },
    get: (path, handler) => { routes['GET ' + path] = handler; }
  };

  let saved = false;
  const save = () => { saved = true; };
  const exclusive = async (id, fn) => await fn();
  const assertStopped = (id) => {};

  configureMods(mockApp, tmpRoot, registered, save, exclusive, assertStopped);

  check('POST /api/servers/:id/mods registered', !!routes['POST /api/servers/:id/mods']);
  check('DELETE /api/servers/:id/mods registered', !!routes['DELETE /api/servers/:id/mods']);
  check('POST /api/servers/:id/mods/toggle registered', !!routes['POST /api/servers/:id/mods/toggle']);
  check('POST /api/servers/:id/mods/auto-resolve-dependencies registered', !!routes['POST /api/servers/:id/mods/auto-resolve-dependencies']);

  // Test 4a: Install SpigotMC plugin (LuckPerms) on Paper Server
  let jsonResponse = null;
  const mockRes = { json: (data) => { jsonResponse = data; }, status: () => mockRes };
  await routes['POST /api/servers/:id/mods']({
    params: { id: 'srv_paper' },
    body: { mod: { id: 'luckperms', name: 'LuckPerms', source: 'SpigotMC', version: '5.4.140' } }
  }, mockRes);

  check('LuckPerms install succeeds', jsonResponse?.success === true);
  check('LuckPerms target directory is plugins', jsonResponse?.targetDir === 'plugins');
  const paperPluginPath = path.join(tmpRoot, 'srv_paper', 'plugins', 'luckperms.jar');
  check('luckperms.jar file exists on disk', fs.existsSync(paperPluginPath));
  check('luckperms.jar has valid PK header', fs.readFileSync(paperPluginPath)[0] === 0x50);
  check('Paper server installedMods registry updated', mockServers[0].installedMods.some(m => m.id === 'luckperms'));

  // Test 4b: Install EssentialsX on Paper Server (tests auto-resolve of Vault dependency!)
  await routes['POST /api/servers/:id/mods']({
    params: { id: 'srv_paper' },
    body: { mod: { id: 'essentialsx', name: 'EssentialsX', source: 'SpigotMC', version: '2.20.1' } }
  }, mockRes);

  check('EssentialsX install succeeds', jsonResponse?.success === true);
  check('Vault dependency was auto-installed', mockServers[0].installedMods.some(m => m.id === 'vault'));
  const vaultPath = path.join(tmpRoot, 'srv_paper', 'plugins', 'vault.jar');
  check('vault.jar exists in plugins directory', fs.existsSync(vaultPath));

  // Test 4c: Install Fabric mod (Sodium) on Fabric Server
  await routes['POST /api/servers/:id/mods']({
    params: { id: 'srv_fabric' },
    body: { mod: { id: 'sodium', name: 'Sodium', source: 'Modrinth', loaders: ['fabric'], version: '0.6.9' } }
  }, mockRes);

  check('Sodium install succeeds on Fabric', jsonResponse?.success === true);
  check('Sodium target directory is mods', jsonResponse?.targetDir === 'mods');
  const sodiumPath = path.join(tmpRoot, 'srv_fabric', 'mods', 'sodium.jar');
  check('sodium.jar exists in mods directory', fs.existsSync(sodiumPath));
  check('Fabric API dependency was auto-installed', mockServers[1].installedMods.some(m => m.id === 'fabric_api'));

  // Test 4d: Install Forge mod (JEI) on Forge Server
  await routes['POST /api/servers/:id/mods']({
    params: { id: 'srv_forge' },
    body: { mod: { id: 'jei', name: 'Just Enough Items', source: 'CurseForge', loaders: ['forge'], version: '15.0.0' } }
  }, mockRes);

  check('JEI install succeeds on Forge', jsonResponse?.success === true);
  check('JEI target directory is mods', jsonResponse?.targetDir === 'mods');
  const jeiPath = path.join(tmpRoot, 'srv_forge', 'mods', 'jei.jar');
  check('jei.jar exists in mods directory', fs.existsSync(jeiPath));

  // Test 4e: Install Oxide plugin (Kits) on Rust Server
  await routes['POST /api/servers/:id/mods']({
    params: { id: 'srv_rust' },
    body: { mod: { id: 'kits', name: 'Kits', source: 'uMod', version: '1.0.5' } }
  }, mockRes);

  check('Kits install succeeds on Rust', jsonResponse?.success === true);
  check('Kits target directory is oxide/plugins', jsonResponse?.targetDir === 'oxide/plugins');
  const kitsPath = path.join(tmpRoot, 'srv_rust', 'oxide', 'plugins', 'kits.cs');
  check('kits.cs exists in oxide/plugins directory', fs.existsSync(kitsPath));

  // Test 4f: Toggle mod disable & enable
  await routes['POST /api/servers/:id/mods/toggle']({
    params: { id: 'srv_paper' },
    body: { installedModId: 'luckperms', enabled: false }
  }, mockRes);

  check('Disable toggle returns enabled: false', jsonResponse?.enabled === false);
  const disabledPath = path.join(tmpRoot, 'srv_paper', 'plugins', 'luckperms.jar.disabled');
  check('File renamed to .disabled on disk', fs.existsSync(disabledPath));

  await routes['POST /api/servers/:id/mods/toggle']({
    params: { id: 'srv_paper' },
    body: { installedModId: 'luckperms', enabled: true }
  }, mockRes);

  check('Enable toggle returns enabled: true', jsonResponse?.enabled === true);
  check('File restored to luckperms.jar on disk', fs.existsSync(paperPluginPath));

  // Test 4g: Delete / Uninstall mod
  await routes['DELETE /api/servers/:id/mods']({
    params: { id: 'srv_paper' },
    body: { installedModId: 'luckperms' }
  }, mockRes);

  check('Uninstall succeeds', jsonResponse?.success === true);
  check('luckperms.jar removed from disk', !fs.existsSync(paperPluginPath));
  check('luckperms removed from installedMods registry', !mockServers[0].installedMods.some(m => m.id === 'luckperms'));

} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

// --- 5. Frontend Component Integration Verification ---
const serverDetailSource = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
check('ServerDetail imports ModPluginBrowser from ./ModPluginBrowser', serverDetailSource.includes("import { ModPluginBrowser } from './ModPluginBrowser'"));

const modBrowserSource = fs.readFileSync('src/components/ModPluginBrowser.tsx', 'utf8');
check('ModPluginBrowser guards server.installedMods with null-safety', modBrowserSource.includes('(server.installedMods || []).length'));
check('ModPluginBrowser supports 1-Click direct install', modBrowserSource.includes('handleDirectInstall'));
check('ModPluginBrowser supports custom upload', modBrowserSource.includes('CustomModUploadModal'));
check('ModPluginBrowser supports curated bundles', modBrowserSource.includes('ModBundlesView'));

const centralHubSource = fs.readFileSync('src/components/CentralModHub.tsx', 'utf8');
check('CentralModHub guards currentTargetServer.installedMods', centralHubSource.includes('(currentTargetServer?.installedMods || []).some'));

console.log(`${checks.length} Mod & Plugin installation regression checks passed.`);
fs.writeFileSync('audit/mod-plugin-installation-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
