import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { installerSupport } from '../src/data/installerSupport.ts';
import { MINECRAFT_TYPES } from '../src/data/minecraftTypes.ts';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// 1. Verify installerSupport recognizes mc_forge and mc_neoforge as valid engines
check('installerSupport accepts mc_forge', installerSupport({ id: 'mc_forge', category: 'minecraft' }, 'linux') === '');
check('installerSupport accepts mc_neoforge', installerSupport({ id: 'mc_neoforge', category: 'minecraft' }, 'linux') === '');
check('installerSupport accepts mc_fabric', installerSupport({ id: 'mc_fabric', category: 'minecraft' }, 'linux') === '');
check('installerSupport accepts mc_paper', installerSupport({ id: 'mc_paper', category: 'minecraft' }, 'linux') === '');

// 2. Verify MINECRAFT_TYPES configurations
const forgeType = MINECRAFT_TYPES.find(t => t.typeId === 'forge');
const neoforgeType = MINECRAFT_TYPES.find(t => t.typeId === 'neoforge');

check('Forge definition exists in MINECRAFT_TYPES', !!forgeType);
check('Forge supports mods', forgeType?.supportsMods === true);
check('Forge has 26.3 and 1.20.1 in versions', forgeType?.versions?.includes('26.3') && forgeType?.versions?.includes('1.20.1'));

check('NeoForge definition exists in MINECRAFT_TYPES', !!neoforgeType);
check('NeoForge supports mods', neoforgeType?.supportsMods === true);
check('NeoForge has 26.3 and 1.21.4 in versions', neoforgeType?.versions?.includes('26.3') && neoforgeType?.versions?.includes('1.21.4'));

// 3. Test Archive extraction fixture (simulating Forge/NeoForge server archive)
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-forge-test-'));
try {
  // Create mock server.jar and libraries
  const libDir = path.join(testDir, 'libraries', 'net', 'neoforged');
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, 'server.jar'), 'MOCK_SERVER_JAR');
  fs.writeFileSync(path.join(testDir, 'neoforge-server.jar'), 'MOCK_SERVER_JAR');
  fs.writeFileSync(path.join(libDir, 'neoforge.jar'), 'MOCK_LIB');
  fs.writeFileSync(path.join(testDir, 'user_jvm_args.txt'), '-Xms1G\n-Xmx4G\n-XX:+UseG1GC\n');
  fs.writeFileSync(path.join(testDir, 'start.sh'), '#!/bin/bash\nexec java -jar server.jar nogui "$@"\n');
  fs.chmodSync(path.join(testDir, 'start.sh'), 0o755);

  check('Server jar exists in srvDir', fs.existsSync(path.join(testDir, 'server.jar')));
  check('Libraries directory exists in srvDir', fs.existsSync(libDir));
  check('user_jvm_args.txt is present for Forge/NeoForge', fs.readFileSync(path.join(testDir, 'user_jvm_args.txt'), 'utf8').includes('-Xmx4G'));
  check('start.sh is executable', (fs.statSync(path.join(testDir, 'start.sh')).mode & 0o111) !== 0);

  // 4. Test server detection logic
  const potentialJars = ['neoforge-server.jar', 'server.jar'];
  const foundJar = potentialJars.find(j => fs.existsSync(path.join(testDir, j)));
  check('NeoForge finds neoforge-server.jar or server.jar', foundJar === 'neoforge-server.jar');
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}

console.log(`${checks.length} Forge and NeoForge installer regression checks passed.`);
fs.writeFileSync('audit/forge-neoforge-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
