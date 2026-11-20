import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import express from 'express';
import { analyzeConsoleLogs } from '../src/utils/logPatterns.ts';
import {
  parseSteamAppManifest,
  verifySteamCmdInstallation,
  verifySteamAppDataDownloaded
} from '../backend/installerHelpers.ts';
import { configureAuth } from '../backend/auth.ts';
import { configureLogAnalyzer } from '../backend/logAnalyzer.ts';

async function runTests() {
  console.log('=== Real-Time Log-Analyzer & SteamCMD Pre-Start Verification Regression Suite ===');

  // 1. Real-time pattern detection for all known error signatures
  {
    const sampleLogs = [
      { id: '1', timestamp: '10:00:01', level: 'ERROR', message: 'Error: Unable to access jarfile paper.jar' },
      { id: '2', timestamp: '10:00:02', level: 'ERROR', message: 'bash: ./PalServer.sh: Permission denied' },
      { id: '3', timestamp: '10:00:03', level: 'ERROR', message: 'error while loading shared libraries: steamclient.so: cannot open shared object file (Missing library)' },
      { id: '4', timestamp: '10:00:04', level: 'WARN', message: 'You need to agree to the EULA in order to run the server.' },
      { id: '5', timestamp: '10:00:05', level: 'ERROR', message: 'java.lang.UnsupportedClassVersionError: compiled by a more recent version of the Java Runtime' },
      { id: '6', timestamp: '10:00:06', level: 'ERROR', message: '**** FAILED TO BIND TO PORT!' }
    ];

    const detected = analyzeConsoleLogs(sampleLogs);
    const fixIds = detected.map((d) => d.fixId);
    assert.ok(fixIds.includes('jarfile_missing'), 'Detects "Unable to access jarfile"');
    assert.ok(fixIds.includes('permission_denied'), 'Detects "Permission denied"');
    assert.ok(fixIds.includes('missing_library'), 'Detects "Missing library" / shared object errors');
    assert.ok(fixIds.includes('eula_not_accepted'), 'Detects EULA error');
    assert.ok(fixIds.includes('java_version_mismatch'), 'Detects UnsupportedClassVersionError');
    assert.ok(fixIds.includes('port_in_use'), 'Detects FAILED TO BIND TO PORT');

    // Verify quick-fix marker clears the fixed issue in real time
    const afterFix = analyzeConsoleLogs([
      ...sampleLogs,
      { id: '7', timestamp: '10:00:10', level: 'SUCCESS', message: '[LOG-QUICK-FIX:permission_denied:OK] Rechte repariert' }
    ]);
    assert.equal(afterFix.some((d) => d.fixId === 'permission_denied'), false, 'Cleared issue disappears after Quick-Fix marker');
    assert.equal(afterFix.some((d) => d.fixId === 'jarfile_missing'), true, 'Unfixed issues remain visible');
    console.log('✓ Test 1 passed: Real-time log pattern recognition & live clearing verified');
  }

  // 2. SteamCMD installation & Steam appmanifest StateFlags pre-start verification
  {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-steam-verify-'));
    try {
      // Partial SteamCMD directory (missing linux32/steamcmd & steamclient.so)
      const steamDir = path.join(tmpRoot, 'steamcmd');
      fs.mkdirSync(steamDir, { recursive: true });
      const steamSh = path.join(steamDir, 'steamcmd.sh');
      fs.writeFileSync(steamSh, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

      const incompleteCmd = verifySteamCmdInstallation(steamSh);
      assert.equal(incompleteCmd.installed, true);
      assert.equal(incompleteCmd.completed, false, 'SteamCMD without linux32/steamcmd & verified marker must be marked incomplete');

      // Complete SteamCMD directory
      fs.mkdirSync(path.join(steamDir, 'linux32'), { recursive: true });
      fs.mkdirSync(path.join(steamDir, 'linux64'), { recursive: true });
      fs.writeFileSync(path.join(steamDir, 'linux32', 'steamcmd'), 'binary', { mode: 0o755 });
      fs.writeFileSync(path.join(steamDir, 'linux64', 'steamclient.so'), 'so');
      fs.writeFileSync(path.join(steamDir, '.sonora-steamcmd-verified'), 'verified_at=now\n');

      const completeCmd = verifySteamCmdInstallation(steamSh);
      assert.equal(completeCmd.completed, true, 'Verified SteamCMD with linux32/steamcmd + steamclient.so passes');

      // Steam app-data check: incomplete StateFlags=1026 + leftover downloading dir
      const srvDir = path.join(tmpRoot, 'srv_pal');
      fs.mkdirSync(path.join(srvDir, 'steamapps', 'downloading', '2394010'), { recursive: true });
      fs.writeFileSync(path.join(srvDir, 'steamapps', 'downloading', '2394010', 'partial.pak'), 'tmp');
      fs.writeFileSync(
        path.join(srvDir, 'steamapps', 'appmanifest_2394010.acf'),
        '"AppState"\n{\n\t"appid"\t"2394010"\n\t"StateFlags"\t"1026"\n}\n'
      );
      const execPath = path.join(srvDir, 'PalServer.sh');
      fs.writeFileSync(execPath, '#!/usr/bin/env bash\necho ok\n', { mode: 0o755 });

      const badManifest = parseSteamAppManifest(srvDir, 2394010);
      assert.equal(badManifest.exists, true);
      assert.equal(badManifest.stateFlags, 1026);
      assert.equal(badManifest.fullyInstalled, false);

      const badCheck = verifySteamAppDataDownloaded(srvDir, 2394010, execPath);
      assert.equal(badCheck.ready, false, 'Incomplete appmanifest & downloading staging must fail pre-start check');
      assert.equal(badCheck.hasPendingDownload, true);

      // Now simulate fully installed StateFlags=4 and clean downloading folder
      fs.rmSync(path.join(srvDir, 'steamapps', 'downloading', '2394010'), { recursive: true, force: true });
      fs.writeFileSync(
        path.join(srvDir, 'steamapps', 'appmanifest_2394010.acf'),
        '"AppState"\n{\n\t"appid"\t"2394010"\n\t"StateFlags"\t"4"\n\t"buildid"\t"14501234"\n}\n'
      );
      const goodCheck = verifySteamAppDataDownloaded(srvDir, 2394010, execPath);
      assert.equal(goodCheck.ready, true, 'Fully installed StateFlags=4 + valid executable passes pre-start check');
      assert.equal(goodCheck.manifest.fullyInstalled, true);
      console.log('✓ Test 2 passed: SteamCMD & appmanifest StateFlags pre-start integrity checks verified');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  // 3. Live Express API integration test for /api/servers/:id/log-analysis & /quick-fix on real filesystem
  {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-logfix-api-'));
    const dataDir = path.join(tmpRoot, 'servers');
    const jdksDir = path.join(tmpRoot, 'jdks');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(jdksDir, { recursive: true });

    const servers = [
      {
        id: 'srv_pal_1',
        name: 'Palworld Test',
        category: 'survival',
        gameId: 'palworld',
        steamAppId: 2394010,
        linuxExecutable: 'PalServer.sh',
        port: 8211
      },
      {
        id: 'srv_mc_1',
        name: 'Paper Test',
        category: 'minecraft',
        gameId: 'mc_paper',
        minecraftType: 'paper',
        version: '1.21.4',
        port: 25565
      }
    ];

    // Prepare broken filesystem states
    const palDir = path.join(dataDir, 'srv_pal_1');
    fs.mkdirSync(path.join(palDir, 'steamapps', 'downloading', '2394010'), { recursive: true });
    fs.writeFileSync(path.join(palDir, 'steamapps', 'downloading', '2394010', 'chunk.tmp'), 'partial');
    fs.writeFileSync(
      path.join(palDir, 'steamapps', 'appmanifest_2394010.acf'),
      '"AppState"\n{\n\t"appid"\t"2394010"\n\t"StateFlags"\t"1026"\n}\n'
    );
    const palExec = path.join(palDir, 'PalServer.sh');
    fs.writeFileSync(palExec, '#!/usr/bin/env bash\necho pal\n', { mode: 0o644 }); // Missing +x permission!

    const mcDir = path.join(dataDir, 'srv_mc_1');
    fs.mkdirSync(mcDir, { recursive: true });
    fs.writeFileSync(path.join(mcDir, 'eula.txt'), 'eula=false\n', 'utf8');

    const logMap = new Map([
      [
        'srv_pal_1',
        [
          { id: 'p1', timestamp: '12:00:01', level: 'ERROR', message: 'bash: ./PalServer.sh: Permission denied' },
          { id: 'p2', timestamp: '12:00:02', level: 'ERROR', message: 'dlopen failed trying to load: steamclient.so (Missing library)' },
          { id: 'p3', timestamp: '12:00:03', level: 'ERROR', message: '[STEAM_APP_INCOMPLETE] appmanifest_2394010.acf unvollständig' }
        ]
      ],
      [
        'srv_mc_1',
        [
          { id: 'm1', timestamp: '12:00:01', level: 'ERROR', message: 'Error: Unable to access jarfile paper.jar' },
          { id: 'm2', timestamp: '12:00:02', level: 'WARN', message: 'You need to agree to the EULA in order to run the server.' }
        ]
      ]
    ]);

    const app = express();
    app.use(express.json());
    const auth = configureAuth(app, tmpRoot);

    configureLogAnalyzer(app, {
      auth,
      dataDir,
      jdksDir,
      getServerRegistry: () => servers,
      upsertServerInRegistry: (srv) => {
        const idx = servers.findIndex((s) => s.id === srv.id);
        if (idx >= 0) servers[idx] = srv;
      },
      canUserAccessServer: () => true,
      getServerLogs: (id) => logMap.get(id) || [],
      detectSteamCmd: () => null,
      ensureSteamClientSymlinks: () => {},
      findGameExecutable: (dir, pref) => {
        const p = path.join(dir, pref || 'PalServer.sh');
        return fs.existsSync(p) ? p : null;
      },
      getRequiredJdkMajor: () => 21,
      ensureJdk: async () => path.join(jdksDir, 'jdk-21'),
      installMinecraftServer: async (_id, dir) => {
        const jar = path.join(dir, 'paper.jar');
        fs.writeFileSync(jar, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4096, 1)]));
        return { success: true, jarPath: jar, engine: 'paper', version: '1.21.4', javaMajor: 21 };
      },
      installBedrockServer: async () => true,
      installSteamGameServer: async (_id, dir) => {
        const p = path.join(dir, 'PalServer.sh');
        fs.writeFileSync(p, '#!/usr/bin/env bash\necho fixed\n', { mode: 0o755 });
        return true;
      },
      appendLog: (id, level, message) => {
        if (!logMap.has(id)) logMap.set(id, []);
        logMap.get(id).push({ id: String(Date.now()), timestamp: '12:01:00', level, message });
      }
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // Analyze Palworld logs + pre-start status
      const palAnalysis = await (await fetch(`${baseUrl}/api/servers/srv_pal_1/log-analysis`)).json();
      assert.equal(palAnalysis.success, true);
      assert.equal(palAnalysis.issues.length, 3, 'Detects permission_denied, missing_library, and steam_app_incomplete');
      assert.equal(palAnalysis.preStartStatus.ready, false, 'Pre-start status flags incomplete Steam manifest/downloading');

      // Execute Quick-Fix for all 3 Palworld issues on filesystem
      const palFixRes = await (
        await fetch(`${baseUrl}/api/servers/srv_pal_1/log-analysis/quick-fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixIds: ['permission_denied', 'missing_library', 'steam_app_incomplete'] })
        })
      ).json();
      assert.equal(palFixRes.success, true, 'All 3 Palworld filesystem Quick-Fixes succeed');
      assert.equal(palFixRes.remainingIssues.length, 0, 'Remaining log issues cleared after Quick-Fix');
      assert.equal(palFixRes.preStartStatus.ready, true, 'Pre-start status is now READY after Quick-Fix');
      fs.accessSync(palExec, fs.constants.X_OK); // Verify chmod +x on filesystem!
      assert.equal(fs.existsSync(path.join(palDir, '.sonora-ld-env.sh')), true, 'LD_LIBRARY_PATH helper created on disk');
      assert.equal(fs.existsSync(path.join(palDir, 'steamapps', 'downloading', '2394010')), false, 'Leftover downloading staging removed');

      // Execute Quick-Fix for Minecraft jarfile_missing & eula_not_accepted
      const mcFixRes = await (
        await fetch(`${baseUrl}/api/servers/srv_mc_1/log-analysis/quick-fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixIds: ['jarfile_missing', 'eula_not_accepted'] })
        })
      ).json();
      assert.equal(mcFixRes.success, true, 'Minecraft JAR & EULA Quick-Fixes succeed');
      assert.equal(fs.existsSync(path.join(mcDir, 'paper.jar')), true, 'paper.jar restored on disk');
      assert.equal(fs.existsSync(path.join(mcDir, 'start.sh')), true, 'start.sh created on disk');
      assert.match(fs.readFileSync(path.join(mcDir, 'eula.txt'), 'utf8'), /eula=true/, 'eula.txt set to eula=true');
      console.log('✓ Test 3 passed: Live Log-Analyzer API & filesystem Quick-Fix repairs verified');
    } finally {
      server.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  // 4. Static wiring verification: ServerDetail places ConsoleLogAnalyzerBar directly below ConsoleView, and install.sh includes SteamCMD verification
  {
    const detailTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ServerDetail.tsx'), 'utf8');
    const consoleIdx = detailTsx.indexOf('<ConsoleView');
    const analyzerIdx = detailTsx.indexOf('<ConsoleLogAnalyzerBar');
    assert.ok(consoleIdx > 0 && analyzerIdx > consoleIdx, 'ConsoleLogAnalyzerBar must be rendered directly below ConsoleView in ServerDetail.tsx');

    const installShPath = path.resolve(process.cwd(), 'install.sh');
    execSync(`bash -n "${installShPath}"`, { stdio: 'pipe' });
    const installSh = fs.readFileSync(installShPath, 'utf8');
    assert.match(installSh, /verify_steamcmd_ready\(\)/, 'install.sh defines verify_steamcmd_ready()');
    assert.match(installSh, /\.sonora-steamcmd-verified/, 'install.sh writes .sonora-steamcmd-verified marker upon SteamCMD verification');
    assert.match(installSh, /\/usr\/local\/sbin\/sonora-verify-steam\.sh/, 'install.sh installs host pre-start verification script');
    assert.match(installSh, /"StateFlags"/, 'install.sh pre-start script verifies Steam appmanifest StateFlags=4');
    console.log('✓ Test 4 passed: ServerDetail UI placement & install.sh SteamCMD verification verified');
  }

  console.log('ALL REAL-TIME LOG-ANALYZER & STEAMCMD PRE-START REGRESSION TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Regression failed:', err);
  process.exit(1);
});
