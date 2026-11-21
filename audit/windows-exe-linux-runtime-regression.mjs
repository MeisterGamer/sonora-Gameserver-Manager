import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import {
  isWindowsPeExecutable,
  detectLinuxWindowsRuntimes,
  buildWindowsExeLaunchPlan,
  extractUnwrappedWindowsExeFromShellScript,
  resolveEffectiveWindowsExecutable,
  generateLinuxWindowsWrapperScript,
  sanitizeExistingWindowsExeServers
} from '../backend/windowsRuntime.ts';
import { analyzeConsoleLogs } from '../src/utils/logPatterns.ts';

const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};

// --- 1. Binary Magic-Byte Detection (PE MZ vs ELF vs Bash Shebang) ---
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-win-compat-test-'));
try {
  const vrisingExe = path.join(tmpDir, 'VRisingServer.exe');
  fs.writeFileSync(vrisingExe, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])); // Real DOS/PE MZ header

  const linuxElf = path.join(tmpDir, 'RustDedicated');
  fs.writeFileSync(linuxElf, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00])); // Real ELF header

  const bashScript = path.join(tmpDir, 'VRisingServer.sh');
  fs.writeFileSync(bashScript, '#!/usr/bin/env bash\necho ok\n', 'utf8');

  check('isWindowsPeExecutable detects VRisingServer.exe (MZ header)', isWindowsPeExecutable(vrisingExe) === true);
  check('isWindowsPeExecutable returns false for native Linux ELF binary', isWindowsPeExecutable(linuxElf) === false);
  check('isWindowsPeExecutable returns false for bash shebang script', isWindowsPeExecutable(bashScript) === false);

  // --- 2. Runtime Probing & Launch Plan: Wine + Xvfb ---
  const wineRuntimes = detectLinuxWindowsRuntimes((cmd) => {
    if (cmd === 'wine64') return '/usr/bin/wine64';
    if (cmd === 'xvfb-run') return '/usr/bin/xvfb-run';
    return null;
  }, 'linux');
  check('detectLinuxWindowsRuntimes detects Wine + Xvfb as preferred runtime',
    wineRuntimes.hasWine && wineRuntimes.hasXvfb && wineRuntimes.preferredRuntime === 'wine'
  );

  const winePlan = buildWindowsExeLaunchPlan({
    execPath: vrisingExe,
    srvDir: tmpDir,
    parsedArgs: ['-persistentDataPath', './save-data', '-serverName', 'V Rising Test'],
    serverId: 'srv_mwoz1wng',
    env: {},
    detectedRuntimes: wineRuntimes
  });
  check('Wine launch plan wraps VRisingServer.exe in xvfb-run + wine64 with isolated .wineprefix',
    winePlan.canLaunch === true &&
    winePlan.runtime === 'wine' &&
    winePlan.command === '/usr/bin/xvfb-run' &&
    winePlan.args.includes('/usr/bin/wine64') &&
    winePlan.args.includes(vrisingExe) &&
    winePlan.env.WINEARCH === 'win64' &&
    Boolean(winePlan.env.WINEPREFIX && winePlan.env.WINEPREFIX.endsWith('.wineprefix'))
  );

  // --- 3. Launch Plan: Podman Container Fallback (no Wine installed) ---
  const podmanRuntimes = detectLinuxWindowsRuntimes((cmd) => (cmd === 'podman' ? '/usr/bin/podman' : null), 'linux');
  check('detectLinuxWindowsRuntimes falls back to Podman when Wine is absent',
    !podmanRuntimes.hasWine && podmanRuntimes.hasPodman && podmanRuntimes.preferredRuntime === 'podman'
  );

  const podmanPlan = buildWindowsExeLaunchPlan({
    execPath: vrisingExe,
    srvDir: tmpDir,
    parsedArgs: ['-port', '9876'],
    serverId: 'srv_mwoz1wng',
    env: {},
    detectedRuntimes: podmanRuntimes
  });
  check('Podman launch plan uses --network host, mounts /srv/game:Z, and provides stopCommand',
    podmanPlan.canLaunch === true &&
    podmanPlan.runtime === 'podman' &&
    podmanPlan.command === '/usr/bin/podman' &&
    podmanPlan.args.includes('--network') &&
    podmanPlan.args.includes('host') &&
    podmanPlan.args.includes(`${tmpDir}:/srv/game:Z`) &&
    podmanPlan.args.includes('/srv/game/VRisingServer.exe') &&
    podmanPlan.stopCommand?.command === '/usr/bin/podman' &&
    podmanPlan.stopCommand?.args[0] === 'stop'
  );

  // --- 4. Launch Plan: Docker Container Fallback ---
  const dockerRuntimes = detectLinuxWindowsRuntimes((cmd) => (cmd === 'docker' ? '/usr/bin/docker' : null), 'linux');
  const dockerPlan = buildWindowsExeLaunchPlan({
    execPath: vrisingExe,
    srvDir: tmpDir,
    parsedArgs: ['-port', '9876'],
    serverId: 'srv_mwoz1wng',
    env: {},
    detectedRuntimes: dockerRuntimes
  });
  check('Docker launch plan mounts /srv/game:rw and runs wine64 inside container',
    dockerPlan.canLaunch === true &&
    dockerPlan.runtime === 'docker' &&
    dockerPlan.command === '/usr/bin/docker' &&
    dockerPlan.args.includes(`${tmpDir}:/srv/game:rw`) &&
    dockerPlan.stopCommand?.command === '/usr/bin/docker'
  );

  // --- 5. Launch Plan: No Wine / No Podman / No Docker -> Refuses direct native execution ---
  const noRuntimes = detectLinuxWindowsRuntimes(() => null, 'linux');
  const blockedPlan = buildWindowsExeLaunchPlan({
    execPath: vrisingExe,
    srvDir: tmpDir,
    parsedArgs: [],
    serverId: 'srv_mwoz1wng',
    env: {},
    detectedRuntimes: noRuntimes
  });
  check('Without Wine/Podman/Docker, launch plan blocks direct .exe execution with clear error code & Debian install hint',
    blockedPlan.canLaunch === false &&
    blockedPlan.errorCode === 'WINDOWS_EXE_NEEDS_WINE_OR_CONTAINER' &&
    Boolean(blockedPlan.installHint && blockedPlan.installHint.includes('wine') && blockedPlan.installHint.includes('podman'))
  );

  // --- 5b. Broken .sh wrapper calling ./VRisingServer.exe directly is intercepted & wrapped safely ---
  const brokenStartSh = path.join(tmpDir, 'start.sh');
  fs.writeFileSync(brokenStartSh, '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nexec "./VRisingServer.exe" "$@"\n', 'utf8');
  const unwrapped = extractUnwrappedWindowsExeFromShellScript(brokenStartSh, tmpDir);
  check('extractUnwrappedWindowsExeFromShellScript detects broken start.sh directly invoking VRisingServer.exe',
    unwrapped === vrisingExe
  );
  const resolvedWrapped = resolveEffectiveWindowsExecutable(brokenStartSh, tmpDir);
  check('resolveEffectiveWindowsExecutable marks broken start.sh wrapper as Windows PE target',
    resolvedWrapped.isWindowsPe === true &&
    resolvedWrapped.viaBrokenShellWrapper === true &&
    resolvedWrapped.targetExePath === vrisingExe
  );

  // Generated wrapper script must pass `bash -n` and NEVER directly invoke `./VRisingServer.exe` without Wine/Podman/Docker
  const safeWrapperContent = generateLinuxWindowsWrapperScript('VRisingServer.exe');
  const safeWrapperFile = path.join(tmpDir, 'safe-start.sh');
  fs.writeFileSync(safeWrapperFile, safeWrapperContent, 'utf8');
  execSync(`bash -n "${safeWrapperFile}"`, { stdio: 'pipe' });
  check('generateLinuxWindowsWrapperScript passes bash -n and routes through wine/podman/docker',
    safeWrapperContent.includes('WINE_BIN') &&
    safeWrapperContent.includes('podman run') &&
    safeWrapperContent.includes('docker run') &&
    safeWrapperContent.includes('WINDOWS_EXE_NEEDS_WINE_OR_CONTAINER') &&
    extractUnwrappedWindowsExeFromShellScript(safeWrapperFile, tmpDir) === null
  );

  // --- 5c. Boot-time sanitizer strips +x from VRisingServer.exe & repairs broken start.sh ---
  const mockDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-sanitize-data-'));
  try {
    const mockSrv = path.join(mockDataDir, 'srv_mwoz1wng');
    fs.mkdirSync(mockSrv, { recursive: true });
    const mockExe = path.join(mockSrv, 'VRisingServer.exe');
    fs.writeFileSync(mockExe, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
    fs.chmodSync(mockExe, 0o755);
    const mockStartSh = path.join(mockSrv, 'start.sh');
    fs.writeFileSync(mockStartSh, '#!/usr/bin/env bash\nexec "./VRisingServer.exe" "$@"\n', 'utf8');

    const sanitizeResult = sanitizeExistingWindowsExeServers(mockDataDir);
    const fixedMode = fs.statSync(mockExe).mode & 0o777;
    const fixedScript = fs.readFileSync(mockStartSh, 'utf8');
    check('sanitizeExistingWindowsExeServers strips +x from VRisingServer.exe (0644) and repairs broken start.sh',
      sanitizeResult.strippedExeCount === 1 &&
      sanitizeResult.repairedScriptsCount === 1 &&
      (fixedMode & 0o111) === 0 &&
      fixedScript.includes('WINE_BIN') &&
      extractUnwrappedWindowsExeFromShellScript(mockStartSh, mockSrv) === null
    );
  } finally {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
  }

  check('Wine + Xvfb launch plan avoids hardcoding stale DISPLAY=:99 and always sets HOME',
    winePlan.env.DISPLAY === undefined &&
    Boolean(winePlan.env.HOME)
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// --- 6. Real-Time Log-Analyzer detects exact user VRisingServer.exe MZ crash ---
const userCrashLogs = [
  { message: '/srv/sonora-gameserver-manager/data/servers/srv_mwoz1wng/VRisingServer.exe: 1: MZ\ufffd\ufffd\ufffd\ufffd@\ufffd\ufffd: not found' },
  { message: '/srv/sonora-gameserver-manager/data/servers/srv_mwoz1wng/VRisingServer.exe: 2: Syntax error: word unexpected (expecting ")")' },
  { message: 'Gameserver beendet (Exit Code: 2, Signal: none).' }
];
const detected = analyzeConsoleLogs(userCrashLogs);
check('Real-time Log-Analyzer detects VRisingServer.exe MZ / Syntax error crash as windows_exe_on_linux',
  detected.some(d => d.fixId === 'windows_exe_on_linux' && d.severity === 'critical')
);

// --- 7. Integration & install.sh Verification ---
const serverSrc = fs.readFileSync('server.ts', 'utf8');
check('server.ts routes Windows PE .exe executables (and broken .sh wrappers) through buildWindowsExeLaunchPlan with hard spawn guard',
  serverSrc.includes('resolveEffectiveWindowsExecutable(execPath, srvDir)') &&
  serverSrc.includes('buildWindowsExeLaunchPlan(') &&
  serverSrc.includes('isWindowsPeExecutable(spawnCommand)') &&
  serverSrc.includes('/api/system/windows-runtime')
);
const diagSrc = fs.readFileSync('backend/serverDiagnostics.ts', 'utf8');
check('serverDiagnostics.ts generates Wine/Podman/Docker-safe start.sh wrapper for .exe servers',
  diagSrc.includes('generateLinuxWindowsWrapperScript(relExec)')
);
check('server.ts SteamCMD retries with +@sSteamCmdForcePlatformType windows when Linux depot is invalid and Wine/Podman/Docker exists',
  serverSrc.includes("runSteamCmdOnce('windows')")
);

const installSh = fs.readFileSync('install.sh', 'utf8');
check('install.sh installs Wine + Xvfb + Podman/Docker, Hardware-Health tools, and verifies MZ PE binaries in sonora-verify-steam.sh',
  installSh.includes('apt_install_preferred wine64 wine') &&
  installSh.includes('apt_install_preferred xvfb') &&
  installSh.includes('apt_install_preferred podman') &&
  installSh.includes('apt_install_preferred docker.io') &&
  installSh.includes('apt_install_preferred lm-sensors') &&
  installSh.includes('EXEC_MAGIC="$(head -c 2')
);
check('install.sh never runs chmod -R 755 over data/servers .exe files and auto-repairs existing .exe servers with sonora-run-win-exe.sh',
  !installSh.includes('chmod -R 755 "$SOURCE_DIR"') &&
  installSh.includes('repair_existing_windows_servers()') &&
  installSh.includes('/usr/local/sbin/sonora-run-win-exe.sh') &&
  installSh.includes('/usr/lib/wine/wine64') &&
  installSh.includes('/usr/lib/wine:/usr/games') &&
  installSh.includes('SONORA_ALLOW_WIN_EXE=true')
);

execSync('bash -n install.sh', { stdio: 'pipe' });
check('install.sh passes bash -n syntax validation', true);

execSync('bash -n start-manager.sh', { stdio: 'pipe' });
const startMgrSh = fs.readFileSync('start-manager.sh', 'utf8');
check('start-manager.sh passes bash -n, loads .env, and preserves /usr/lib/wine:/usr/games in PATH',
  startMgrSh.includes('/usr/lib/wine:/usr/games') &&
  startMgrSh.includes('.env')
);

console.log(`${checks.length} Windows-.exe on Linux (Wine / Podman / Docker) regression checks passed.`);
fs.writeFileSync('audit/windows-exe-linux-runtime-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
