import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import express from 'express';
import AdmZip from 'adm-zip';
import {
  inspectDownloadedArtifact,
  isJavaMinecraftSpec,
  isBedrockSpec,
  isValidJarFile,
  findForgeArgsFile,
  getPrimaryJarNameForEngine,
  ensureServerPropertiesPort,
  searchExecutableRecursive
} from '../backend/installerHelpers.ts';
import { configureAuth } from '../backend/auth.ts';
import { configurePermissions } from '../backend/permissions.ts';
import { configureFirewall, computeServerPortSpecs } from '../backend/firewall.ts';

function makeFakeJarBuffer(extraEntries = []) {
  const zip = new AdmZip();
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nMain-Class: io.papermc.paperclip.Main\n'));
  zip.addFile('io/papermc/paperclip/Main.class', crypto.randomBytes(6144));
  for (const [name, content] of extraEntries) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function makeFakeZipBundleBuffer() {
  const zip = new AdmZip();
  zip.addFile('paper.jar', makeFakeJarBuffer());
  zip.addFile('start.sh', Buffer.from('#!/usr/bin/env bash\njava -jar paper.jar nogui\n'));
  return zip.toBuffer();
}

function makeFakeForgeInstallerJarBuffer() {
  const zip = new AdmZip();
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nMain-Class: net.minecraftforge.installer.SimpleInstaller\n'));
  zip.addFile('install_profile.json', Buffer.from('{"spec":1,"profile":"forge","version":"1.21.1-forge"}\n'));
  zip.addFile('net/minecraftforge/installer/SimpleInstaller.class', crypto.randomBytes(6144));
  return zip.toBuffer();
}

async function runTests() {
  console.log('=== Installer / RBAC / Firewall / Debian install.sh Regression Suite ===');

  // 1. JAR vs ZIP detection — THE ROOT CAUSE FIX FOR "Unable to access jarfile paper.jar"
  {
    const paperJarBuf = makeFakeJarBuffer();
    assert.equal(paperJarBuf[0], 0x50, 'JAR starts with ZIP magic byte P');
    assert.equal(paperJarBuf[1], 0x4b, 'JAR starts with ZIP magic byte K');
    const inspected = inspectDownloadedArtifact(paperJarBuf, {
      sourceUrl: 'https://fill-data.papermc.io/v1/objects/paper-1.21.4-224.jar',
      engine: 'paper',
      buildLabel: 'Paper 1.21.4'
    });
    assert.equal(inspected.kind, 'jar', 'Paper JAR MUST be recognized as runnable jar (NEVER unzipped!)');

    const bundleBuf = makeFakeZipBundleBuffer();
    const inspectedBundle = inspectDownloadedArtifact(bundleBuf, {
      sourceUrl: 'https://example.invalid/server-bundle.zip',
      engine: 'paper',
      buildLabel: 'Server Bundle'
    });
    assert.equal(inspectedBundle.kind, 'zip_bundle', 'Multi-file ZIP bundle containing a JAR must be classified as zip_bundle');

    const forgeInstBuf = makeFakeForgeInstallerJarBuffer();
    const inspectedForge = inspectDownloadedArtifact(forgeInstBuf, {
      sourceUrl: 'https://maven.minecraftforge.net/forge-installer.jar',
      engine: 'forge',
      buildLabel: 'Forge Installer'
    });
    assert.equal(inspectedForge.kind, 'installer_jar', 'Forge installer JAR with install_profile.json must be classified as installer_jar');

    const html404Buf = Buffer.from('<!DOCTYPE html><html><body>404 Not Found</body></html>', 'utf8');
    const inspectedInvalid = inspectDownloadedArtifact(html404Buf, {
      sourceUrl: 'https://example.invalid/paper.jar',
      engine: 'paper',
      buildLabel: 'Broken 404'
    });
    assert.equal(inspectedInvalid.kind, 'invalid', 'HTML error page must be rejected as invalid');
    console.log('✓ Test 1 passed: Artifact classifier preserves runnable JARs and rejects corrupt/HTML downloads');
  }

  // 2. Game routing (Minecraft Java vs Bedrock vs ALL Steam/Dedicated categories)
  {
    // Java Minecraft engines
    for (const mcGame of ['mc_paper', 'mc_purpur', 'mc_fabric', 'mc_quilt', 'mc_forge', 'mc_neoforge', 'mc_spigot', 'mc_vanilla', 'mc_velocity', 'mc_bungeecord', 'mc_geyser']) {
      assert.equal(isJavaMinecraftSpec({ category: 'minecraft', gameId: mcGame }), true, `${mcGame} must route to Java MC`);
      assert.equal(isBedrockSpec({ category: 'minecraft', gameId: mcGame }), false, `${mcGame} must NOT route to Bedrock`);
    }
    // Bedrock
    assert.equal(isBedrockSpec({ category: 'minecraft', gameId: 'mc_bedrock', minecraftType: 'bedrock' }), true, 'mc_bedrock must route to Bedrock');
    assert.equal(isJavaMinecraftSpec({ category: 'minecraft', gameId: 'mc_bedrock', minecraftType: 'bedrock' }), false, 'mc_bedrock must NOT route to Java MC');

    // Non-Minecraft categories that previously broke (sandbox, simulation, rpg, coop, strategy)
    for (const nonMc of [
      { category: 'survival', gameId: 'palworld', steamAppId: 2394010 },
      { category: 'survival', gameId: 'rust', steamAppId: 258550 },
      { category: 'fps', gameId: 'cs2', steamAppId: 730 },
      { category: 'sandbox', gameId: 'satisfactory' },
      { category: 'simulation', gameId: 'openttd' },
      { category: 'rpg', gameId: 'remnant_2' },
      { category: 'coop', gameId: 'overcooked_ayce' },
      { category: 'strategy', gameId: 'freeciv' }
    ]) {
      assert.equal(isJavaMinecraftSpec(nonMc), false, `${nonMc.gameId} (${nonMc.category}) must NEVER route to Java MC`);
      assert.equal(isBedrockSpec(nonMc), false, `${nonMc.gameId} (${nonMc.category}) must NEVER route to Bedrock`);
    }

    assert.equal(getPrimaryJarNameForEngine('paper'), 'paper.jar');
    assert.equal(getPrimaryJarNameForEngine('purpur'), 'purpur.jar');
    assert.equal(getPrimaryJarNameForEngine('fabric'), 'fabric-server-launch.jar');
    assert.equal(getPrimaryJarNameForEngine('velocity'), 'velocity.jar');
    assert.equal(getPrimaryJarNameForEngine('neoforge'), 'neoforge-server.jar');
    console.log('✓ Test 2 passed: All 13 Minecraft engines & all 6+ Steam/Dedicated categories route accurately');
  }

  // 3. Disk JAR verification, Forge unix_args discovery, recursive executable search, server.properties port
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-inst-'));
    try {
      const jarPath = path.join(tmpDir, 'paper.jar');
      fs.writeFileSync(jarPath, makeFakeJarBuffer());
      assert.equal(isValidJarFile(jarPath), true, 'Valid Paper JAR passes isValidJarFile');

      const badJarPath = path.join(tmpDir, 'bad.jar');
      fs.writeFileSync(badJarPath, '<html>not a jar</html>');
      assert.equal(isValidJarFile(badJarPath), false, 'HTML file fails isValidJarFile');

      const forgeArgsDir = path.join(tmpDir, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.90');
      fs.mkdirSync(forgeArgsDir, { recursive: true });
      fs.writeFileSync(path.join(forgeArgsDir, 'unix_args.txt'), '-cp libraries/foo.jar');
      const foundArgs = findForgeArgsFile(tmpDir);
      assert.ok(foundArgs && foundArgs.endsWith('unix_args.txt'), 'findForgeArgsFile locates NeoForge unix_args.txt');

      const nestedBinDir = path.join(tmpDir, 'Pal', 'Binaries', 'Linux');
      fs.mkdirSync(nestedBinDir, { recursive: true });
      fs.writeFileSync(path.join(nestedBinDir, 'PalServer-Linux-Test'), '#!/bin/sh\necho ok\n', { mode: 0o755 });
      const foundNested = searchExecutableRecursive(tmpDir, ['PalServer-Linux-Test']);
      assert.ok(foundNested && foundNested.endsWith('PalServer-Linux-Test'), 'searchExecutableRecursive finds nested Steam binary');

      ensureServerPropertiesPort(tmpDir, 25577, 'Paper Test', 40);
      const props = fs.readFileSync(path.join(tmpDir, 'server.properties'), 'utf8');
      assert.match(props, /server-port=25577/, 'server.properties port synchronized');
      console.log('✓ Test 3 passed: Disk JAR validation, Forge args detection, nested binary lookup, and server.properties sync');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 4. RBAC Permissions & Automated Firewall API Integration Test (Isolated Express Server)
  {
    const tmpState = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-rbac-fw-'));
    const app = express();
    app.use(express.json());

    const auth = configureAuth(app, tmpState);
    const permissions = configurePermissions(app, {
      auth,
      managerStateDir: tmpState
    });
    auth.setPermissionsResolver((u) => ({
      role: permissions.getEffectiveRole(u),
      permissions: permissions.getEffectivePermissions(u)
    }));

    const mockRegistry = [];
    const firewall = configureFirewall(app, {
      auth,
      permissions,
      managerStateDir: tmpState,
      getServerRegistry: () => mockRegistry,
      dryRunHostCommands: true
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const reqJson = async (method, urlPath, body, cookie) => {
      const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const setCookie = res.headers.get('set-cookie')?.split(';')[0] || '';
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data, cookie: setCookie };
    };

    try {
      // Bootstrap Admin + Register normal User
      const setupAdmin = await reqJson('POST', '/api/auth/setup', {
        username: 'RootAdmin',
        email: 'admin@sonora.local',
        password: 'AdminPassword123!'
      });
      assert.ok(setupAdmin.status === 200 || setupAdmin.status === 201, `Admin bootstrap succeeds (got ${setupAdmin.status})`);
      const adminCookie = setupAdmin.cookie;
      assert.ok(Array.isArray(setupAdmin.data.user.permissions) && setupAdmin.data.user.permissions.includes('admin.permissions'), 'Admin gets admin.permissions');

      const regUser = await reqJson('POST', '/api/auth/register', {
        username: 'KundeTest',
        email: 'kunde@sonora.local',
        password: 'UserPassword123!'
      });
      assert.ok(regUser.status === 200 || regUser.status === 201, `Customer registration succeeds (got ${regUser.status})`);
      const userCookie = regUser.cookie;
      const userId = regUser.data.user.id;
      assert.equal(regUser.data.user.effectiveRole, 'user');
      assert.equal(regUser.data.user.permissions.includes('admin.panel'), false, 'Regular user must NOT have admin.panel');
      assert.equal(regUser.data.user.permissions.includes('admin.firewall'), false, 'Regular user must NOT have admin.firewall');

      // Regular user MUST be blocked (403) from Admin RBAC and Admin Firewall endpoints
      const userRbacAttempt = await reqJson('GET', '/api/admin/rbac', undefined, userCookie);
      assert.equal(userRbacAttempt.status, 403, 'Regular user blocked from /api/admin/rbac');

      const userFwAttempt = await reqJson('GET', '/api/admin/firewall', undefined, userCookie);
      assert.equal(userFwAttempt.status, 403, 'Regular user blocked from /api/admin/firewall');

      // Admin CAN view and update RBAC role templates & user grants/denies
      const adminRbac = await reqJson('GET', '/api/admin/rbac', undefined, adminCookie);
      assert.equal(adminRbac.status, 200);
      assert.ok(adminRbac.data.catalog.length >= 16, 'Permission catalog has all granular permissions');

      // Deny servers.delete for this specific user and verify effectivePermissions
      const denyRes = await reqJson('PUT', `/api/admin/rbac/users/${userId}`, {
        role: 'user',
        granted: [],
        denied: ['servers.delete']
      }, adminCookie);
      assert.equal(denyRes.status, 200);
      assert.equal(denyRes.data.user.effectivePermissions.includes('servers.delete'), false, 'Deny override removes servers.delete');

      // Verify user's /api/auth/permissions reflects the deny override
      const userPerms = await reqJson('GET', '/api/auth/permissions', undefined, userCookie);
      assert.equal(userPerms.status, 200);
      assert.equal(userPerms.data.permissions.includes('servers.delete'), false, 'User /api/auth/permissions reflects deny');

      // Automated Firewall Open on Server Create & Close on Server Delete (keeping shared + protected ports!)
      const srvA = { id: 'srv_a', name: 'Paper Alpha', category: 'minecraft', gameId: 'mc_paper', port: 25565, queryPort: 25566 };
      const srvB = { id: 'srv_b', name: 'Paper Beta', category: 'minecraft', gameId: 'mc_paper', port: 25570, queryPort: 25566 }; // shares queryPort 25566
      mockRegistry.push(srvA, srvB);

      const openedA = firewall.openPortsForServer(srvA);
      assert.equal(openedA.length, 3, 'Opens TCP 25565, UDP 25565, UDP 25566 for srvA');
      const openedB = firewall.openPortsForServer(srvB);
      assert.equal(openedB.length, 3, 'Opens TCP 25570, UDP 25570, UDP 25566 for srvB');

      // Remove srvA from registry & close ports
      mockRegistry.splice(0, 1);
      const closedA = firewall.closePortsForServer('srv_a');
      assert.equal(closedA.removed.length, 3, 'Removes all 3 rules belonging to srvA');
      assert.ok(closedA.keptSharedPorts.includes(25566), 'Shared query port 25566 is kept open on host for srvB');

      // Verify protected system ports are NEVER touched
      const protectedSpecs = computeServerPortSpecs({ port: 22, queryPort: 3000, category: 'minecraft' });
      assert.equal(protectedSpecs.length, 0, 'Protected system ports (22, 3000) are excluded from server rules');

      const fwGet = await reqJson('GET', '/api/admin/firewall', undefined, adminCookie);
      assert.equal(fwGet.status, 200);
      assert.equal(fwGet.data.rules.length, 3, 'Remaining 3 rules belong to srvB');

      console.log('✓ Test 4 passed: RBAC Admin/User enforcement & automated Firewall open/close lifecycle');
    } finally {
      server.close();
      fs.rmSync(tmpState, { recursive: true, force: true });
    }
  }

  // 5. Debian install.sh verification (syntax, UFW, DDoS sysctl + iptables + fail2ban, systemd autostart, sudoers)
  {
    const installScriptPath = path.resolve(process.cwd(), 'install.sh');
    const scriptText = fs.readFileSync(installScriptPath, 'utf8');
    execSync(`bash -n "${installScriptPath}"`, { stdio: 'pipe' });

    assert.match(scriptText, /https:\/\/github\.com\/MeisterGamer\/sonora-Gameserver-Manager/, 'install.sh targets official GitHub repository');
    assert.match(scriptText, /git clone --depth 1 --branch "\$REPO_BRANCH" "\$REPO_URL" "\$SOURCE_DIR"/, 'install.sh clones repository when executed standalone');
    assert.match(scriptText, /archive\/refs\/heads\/\$\{REPO_BRANCH\}\.tar\.gz/, 'install.sh provides GitHub tarball fallback download');
    assert.match(scriptText, /ufw default deny incoming/, 'install.sh configures UFW default deny incoming');
    assert.match(scriptText, /ufw limit "\$\{SSH_PORT\}\/tcp"/, 'install.sh rate-limits SSH via UFW');
    assert.match(scriptText, /ufw --force enable/, 'install.sh enables UFW firewall');
    assert.match(scriptText, /\/etc\/sysctl\.d\/99-sonora-ddos\.conf/, 'install.sh writes Kernel DDoS sysctl hardening');
    assert.match(scriptText, /net\.ipv4\.tcp_syncookies = 1/, 'install.sh enables TCP SYN cookies');
    assert.match(scriptText, /SONORA_DDOS/, 'install.sh creates iptables SONORA_DDOS anti-flood chain');
    assert.match(scriptText, /\/etc\/fail2ban\/jail\.d\/sonora\.local/, 'install.sh configures Fail2ban SSH protection');
    assert.match(scriptText, /\/etc\/sudoers\.d\/sonora-firewall/, 'install.sh writes sudoers rule for automatic port management');
    assert.match(scriptText, /systemctl enable sonora-manager\.service/, 'install.sh enables systemd boot autostart');
    const helpOut = execSync(`bash "${installScriptPath}" --help`, { encoding: 'utf8' });
    assert.match(helpOut, /MeisterGamer\/sonora-Gameserver-Manager/, 'install.sh --help displays GitHub repository URL');
    console.log('✓ Test 5 passed: Debian install.sh syntax valid with GitHub Download, Firewall, DDoS protection, Fail2ban & Autostart');
  }

  console.log('ALL INSTALLER / RBAC / FIREWALL / DEBIAN INSTALL.SH TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Regression failed:', err);
  process.exit(1);
});
