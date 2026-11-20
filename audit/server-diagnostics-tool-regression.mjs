import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import AdmZip from 'adm-zip';
import { configureAuth } from '../backend/auth.ts';
import { configurePermissions } from '../backend/permissions.ts';
import { configureFirewall } from '../backend/firewall.ts';
import { configureServerDiagnostics } from '../backend/serverDiagnostics.ts';
import { isValidJarFile } from '../backend/installerHelpers.ts';

function makeValidJarBuffer() {
  const zip = new AdmZip();
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nMain-Class: io.papermc.paperclip.Main\n'));
  zip.addFile('io/papermc/paperclip/Main.class', crypto.randomBytes(6144));
  return zip.toBuffer();
}

async function runTests() {
  console.log('=== Server-Diagnose-Tool & Quick-Fix Regression Suite ===');

  // 1. Static Frontend & Backend Integration Checks
  {
    const toolSrc = fs.readFileSync('src/components/ServerDiagnosticsTool.tsx', 'utf8');
    const detailSrc = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');
    const serverSrc = fs.readFileSync('server.ts', 'utf8');

    assert.ok(toolSrc.includes('export const ServerDiagnosticsTool'), 'ServerDiagnosticsTool component exported');
    assert.ok(toolSrc.includes('/diagnostics/quick-fix'), 'ServerDiagnosticsTool calls /diagnostics/quick-fix');
    assert.ok(toolSrc.includes('Quick-Fix ausführen'), 'ServerDiagnosticsTool renders Quick-Fix button');
    assert.ok(detailSrc.includes("import { ServerDiagnosticsTool } from './ServerDiagnosticsTool'"), 'ServerDetail imports ServerDiagnosticsTool');
    assert.ok(detailSrc.includes("activeTab === 'diagnostics'"), 'ServerDetail renders diagnostics tab panel');
    assert.ok(detailSrc.includes('Server-Diagnose'), 'ServerDetail displays Server-Diagnose tab button');
    assert.ok(serverSrc.includes('configureServerDiagnostics'), 'server.ts mounts configureServerDiagnostics');
    console.log('✓ Test 1 passed: Static UI & backend wiring verified');
  }

  // 2. End-to-End Live Scan & Quick-Fix Integration Test (Paper MC + Steam Binary Permission Repair)
  {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-diag-'));
    const stateDir = path.join(tmpRoot, 'state');
    const dataDir = path.join(tmpRoot, 'data');
    const jdksDir = path.join(tmpRoot, 'jdks');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(jdksDir, { recursive: true });

    const app = express();
    app.use(express.json());

    const auth = configureAuth(app, stateDir);
    const permissions = configurePermissions(app, { auth, managerStateDir: stateDir });
    auth.setPermissionsResolver((u) => ({
      role: permissions.getEffectiveRole(u),
      permissions: permissions.getEffectivePermissions(u)
    }));

    const registry = [
      {
        id: 'srv_paper_broken',
        name: 'Paper Broken Test',
        gameId: 'mc_paper',
        gameName: 'Minecraft Paper',
        category: 'minecraft',
        minecraftType: 'paper',
        version: '1.21.4',
        javaVersion: 'Java 21',
        port: 25565,
        queryPort: 25566,
        allocatedRamGb: 4,
        maxPlayers: 30,
        installationStatus: 'failed',
        installationError: 'Error: Unable to access jarfile paper.jar'
      },
      {
        id: 'srv_palworld_chmod',
        name: 'Palworld Perms Test',
        gameId: 'palworld',
        gameName: 'Palworld',
        category: 'survival',
        executable: 'PalServer.sh',
        port: 8211,
        allocatedRamGb: 8,
        installationStatus: 'failed',
        installationError: 'EACCES: permission denied'
      }
    ];

    // Seed broken Paper directory: extracted META-INF residue (no paper.jar), bad port in server.properties, no eula.txt, no start.sh
    const paperDir = path.join(dataDir, 'srv_paper_broken');
    fs.mkdirSync(path.join(paperDir, 'META-INF'), { recursive: true });
    fs.writeFileSync(path.join(paperDir, 'META-INF', 'MANIFEST.MF'), 'Manifest-Version: 1.0\n');
    fs.writeFileSync(path.join(paperDir, 'server.properties'), 'server-port=19999\nmotd=Old\n');

    // Seed Palworld directory with non-executable PalServer.sh
    const palDir = path.join(dataDir, 'srv_palworld_chmod');
    fs.mkdirSync(palDir, { recursive: true });
    fs.writeFileSync(path.join(palDir, 'PalServer.sh'), '#!/usr/bin/env bash\necho ok\n', { mode: 0o644 });

    const firewall = configureFirewall(app, {
      auth,
      permissions,
      managerStateDir: stateDir,
      getServerRegistry: () => registry,
      dryRunHostCommands: true
    });

    configureServerDiagnostics(app, {
      auth,
      permissions,
      firewall,
      dataDir,
      jdksDir,
      getServerRegistry: () => registry,
      upsertServerInRegistry: (updated) => {
        const idx = registry.findIndex(s => s.id === updated.id);
        if (idx >= 0) registry[idx] = updated;
        else registry.push(updated);
      },
      canUserAccessServer: () => true,
      getRequiredJdkMajor: () => 21,
      ensureJdk: async (dir, major) => {
        const binDir = path.join(dir, `jdk-${major}`, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const javaBin = path.join(binDir, process.platform === 'win32' ? 'java.exe' : 'java');
        fs.writeFileSync(javaBin, '#!/bin/sh\necho "openjdk 21"\n', { mode: 0o755 });
        return javaBin;
      },
      findGameExecutable: (dir, preferred) => {
        const candidate = preferred ? path.join(dir, preferred) : null;
        return candidate && fs.existsSync(candidate) ? candidate : null;
      },
      installMinecraftServer: async (_id, dir, version, engine) => {
        const jarPath = path.join(dir, 'paper.jar');
        fs.writeFileSync(jarPath, makeValidJarBuffer());
        return {
          success: true,
          build: 'test-224',
          fileSizeMb: '0.1',
          jarPath,
          engine: engine || 'paper',
          version: version || '1.21.4',
          javaMajor: 21
        };
      },
      installBedrockServer: async () => true,
      installSteamGameServer: async () => ({ success: true, method: 'mock' })
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
      const setupAdmin = await reqJson('POST', '/api/auth/setup', {
        username: 'DiagAdmin',
        email: 'diag@sonora.local',
        password: 'AdminPassword123!'
      });
      assert.ok(setupAdmin.status === 200 || setupAdmin.status === 201);
      const cookie = setupAdmin.cookie;

      // Scan broken Paper server
      const scanBefore = await reqJson('GET', '/api/servers/srv_paper_broken/diagnostics', undefined, cookie);
      assert.equal(scanBefore.status, 200);
      assert.equal(scanBefore.data.report.overallStatus, 'critical', 'Broken Paper server reports critical status');
      assert.ok(scanBefore.data.report.summary.errors >= 3, 'Detects missing JAR, missing EULA, failed installation status');
      assert.ok(scanBefore.data.report.summary.autoFixableCount >= 5, 'Multiple issues marked auto-fixable');
      const jarCheck = scanBefore.data.report.checks.find(c => c.id === 'core_game_binary');
      assert.match(jarCheck.message, /entpackte/i, 'Detects accidentally extracted JAR residue');
      console.log('✓ Test 2 passed: Broken Paper server issues accurately scanned');

      // Execute full Quick-Fix on Paper server
      const fixRes = await reqJson('POST', '/api/servers/srv_paper_broken/diagnostics/quick-fix', {}, cookie);
      assert.equal(fixRes.status, 200);
      assert.equal(fixRes.data.success, true, 'Quick-Fix completes cleanly');
      assert.equal(fixRes.data.report.overallStatus, 'healthy', 'Post-fix report is 100% healthy');
      assert.equal(fixRes.data.report.summary.errors, 0, 'Zero critical errors after Quick-Fix');
      assert.equal(fixRes.data.report.summary.warnings, 0, 'Zero warnings after Quick-Fix');
      assert.equal(fixRes.data.server.installationStatus, 'installed', 'Registry installationStatus corrected to installed');
      assert.equal(isValidJarFile(path.join(paperDir, 'paper.jar')), true, 'Valid paper.jar restored on disk');
      assert.match(fs.readFileSync(path.join(paperDir, 'eula.txt'), 'utf8'), /eula=true/, 'eula.txt repaired');
      assert.match(fs.readFileSync(path.join(paperDir, 'server.properties'), 'utf8'), /server-port=25565/, 'server.properties port synchronized');
      assert.ok(fs.existsSync(path.join(paperDir, 'start.sh')), 'start.sh generated');
      console.log('✓ Test 3 passed: Quick-Fix restored JAR, JDK, EULA, server.properties, start.sh, Firewall & installationStatus');

      // Scan & Quick-Fix Palworld non-executable binary + failed status
      const palScanBefore = await reqJson('GET', '/api/servers/srv_palworld_chmod/diagnostics', undefined, cookie);
      assert.equal(palScanBefore.status, 200);
      assert.equal(palScanBefore.data.report.overallStatus, 'critical');
      const palFix = await reqJson('POST', '/api/servers/srv_palworld_chmod/diagnostics/quick-fix', {}, cookie);
      assert.equal(palFix.status, 200);
      assert.equal(palFix.data.report.overallStatus, 'healthy', 'Palworld healthy after chmod +x & status Quick-Fix');
      assert.equal(palFix.data.server.installationStatus, 'installed', 'Palworld installationStatus corrected to installed');
      console.log('✓ Test 4 passed: Steam/Dedicated binary permissions & installation status repaired via Quick-Fix');
    } finally {
      server.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  console.log('ALL SERVER-DIAGNOSE-TOOL & QUICK-FIX TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Diagnostics regression failed:', err);
  process.exit(1);
});
