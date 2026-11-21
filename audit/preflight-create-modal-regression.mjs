/**
 * Regression Suite: CreateServerModal .exe Validation & Windows Pre-Flight Checker
 * Verifies:
 *  1. .exe paths on Linux/macOS are rejected unless a Windows container (Docker/Podman)
 *     or an explicit environment variable flag (SONORA_ALLOW_WIN_EXE / ALLOW_WINDOWS_EXE) is set.
 *  2. Linux-compatible shell scripts (.sh) and native Linux binaries pass validation without flags.
 *  3. Pre-Flight Checker scans for wine, docker, and podman before launching a Windows .exe,
 *     returns canLaunch: false + install instructions when missing, and canLaunch: true when present.
 *  4. CreateServerModal.tsx, ServerDetail.tsx, WindowsPreFlightBanner.tsx, and server.ts are wired cleanly.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isExeFilePath,
  suggestLinuxExecutable,
  validateServerExecutablePath
} from '../src/utils/executableValidation.ts';
import {
  isWindowsExeEnvFlagSet,
  runWindowsExePreFlightCheck
} from '../backend/windowsRuntime.ts';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('Running Pre-Flight Checker & CreateServerModal .exe Validation Regression Suite...');

// 1. Executable path validation logic
test('isExeFilePath identifies .exe case-insensitively', () => {
  assert.equal(isExeFilePath('VRisingServer.exe'), true);
  assert.equal(isExeFilePath('./PalServer.EXE'), true);
  assert.equal(isExeFilePath('start.sh'), false);
  assert.equal(isExeFilePath('RustDedicated'), false);
});

test('suggestLinuxExecutable converts .exe to .sh suggestion', () => {
  assert.equal(suggestLinuxExecutable('./VRisingServer.exe'), 'VRisingServer.sh');
  assert.equal(suggestLinuxExecutable('Server.EXE'), 'Server.sh');
  assert.equal(suggestLinuxExecutable(''), 'start.sh');
});

test('Linux target rejects .exe when neither Windows container nor env flag is set', () => {
  const res = validateServerExecutablePath({
    executablePath: 'VRisingServer.exe',
    targetOS: 'linux',
    useWindowsContainer: false,
    envFlagAllowWindowsExe: false,
    windowsRuntimeMode: 'none'
  });
  assert.equal(res.valid, false);
  assert.equal(res.isWindowsExe, true);
  assert.equal(res.requiresLinuxExecutable, true);
  assert.equal(res.suggestedLinuxPath, 'VRisingServer.sh');
  assert.match(res.error || '', /\.exe/i);
  assert.match(res.error || '', /Docker\/Podman/i);
});

test('macOS target also rejects .exe when neither container nor env flag is set', () => {
  const res = validateServerExecutablePath({
    executablePath: 'EnshroudedServer.exe',
    targetOS: 'macos',
    useWindowsContainer: false,
    envFlagAllowWindowsExe: false
  });
  assert.equal(res.valid, false);
  assert.equal(res.requiresLinuxExecutable, true);
});

test('Linux target permits .exe when Windows container (Podman or Docker) is enabled', () => {
  const podmanRes = validateServerExecutablePath({
    executablePath: 'VRisingServer.exe',
    targetOS: 'linux',
    useWindowsContainer: true,
    windowsRuntimeMode: 'podman'
  });
  assert.equal(podmanRes.valid, true);
  assert.equal(podmanRes.isWindowsExe, true);
  assert.match(podmanRes.info || '', /Podman/i);

  const dockerRes = validateServerExecutablePath({
    executablePath: 'VRisingServer.exe',
    targetOS: 'linux',
    useWindowsContainer: true,
    windowsRuntimeMode: 'docker'
  });
  assert.equal(dockerRes.valid, true);
  assert.match(dockerRes.info || '', /Docker/i);
});

test('Linux target permits .exe when environment variable flag is set', () => {
  const envRes = validateServerExecutablePath({
    executablePath: 'VRisingServer.exe',
    targetOS: 'linux',
    useWindowsContainer: false,
    envFlagAllowWindowsExe: true
  });
  assert.equal(envRes.valid, true);
  assert.equal(envRes.isWindowsExe, true);
  assert.match(envRes.info || '', /SONORA_ALLOW_WIN_EXE/i);
});

test('Linux target allows .sh scripts and native Linux binaries without flags', () => {
  for (const execPath of ['PalServer.sh', 'start_server.sh', 'RustDedicated', 'valheim_server.x86_64']) {
    const res = validateServerExecutablePath({
      executablePath: execPath,
      targetOS: 'linux',
      useWindowsContainer: false,
      envFlagAllowWindowsExe: false
    });
    assert.equal(res.valid, true, `Expected ${execPath} to be valid on Linux`);
    assert.equal(res.isWindowsExe, false);
  }
});

test('Windows target allows .exe natively', () => {
  const res = validateServerExecutablePath({
    executablePath: 'VRisingServer.exe',
    targetOS: 'windows',
    useWindowsContainer: false,
    envFlagAllowWindowsExe: false
  });
  assert.equal(res.valid, true);
  assert.equal(res.isWindowsExe, true);
});

// 2. Host environment flag detection
test('isWindowsExeEnvFlagSet detects SONORA_ALLOW_WIN_EXE, ALLOW_WINDOWS_EXE, and SONORA_WIN_RUNTIME', () => {
  assert.equal(isWindowsExeEnvFlagSet({}), false);
  assert.equal(isWindowsExeEnvFlagSet({ SONORA_ALLOW_WIN_EXE: 'false' }), false);
  assert.equal(isWindowsExeEnvFlagSet({ SONORA_ALLOW_WIN_EXE: 'true' }), true);
  assert.equal(isWindowsExeEnvFlagSet({ ALLOW_WINDOWS_EXE: '1' }), true);
  assert.equal(isWindowsExeEnvFlagSet({ SONORA_WIN_RUNTIME: 'podman' }), true);
  assert.equal(isWindowsExeEnvFlagSet({ SONORA_WIN_RUNTIME: 'docker' }), true);
  assert.equal(isWindowsExeEnvFlagSet({ SONORA_WIN_RUNTIME: 'wine' }), true);
});

// 3. Pre-Flight Checker behavior
test('Pre-Flight Checker blocks launch & returns install instructions when wine/docker/podman are missing', () => {
  const result = runWindowsExePreFlightCheck({
    configuredExecutable: 'VRisingServer.exe',
    targetOS: 'linux',
    platform: 'linux',
    env: {},
    detectedRuntimes: {
      platform: 'linux',
      hasWine: false,
      wineBin: null,
      hasXvfb: false,
      xvfbBin: null,
      hasPodman: false,
      podmanBin: null,
      hasDocker: false,
      dockerBin: null,
      preferredRuntime: 'none',
      containerImage: 'docker.io/scottyhardy/docker-wine:latest',
      summary: 'Keine Windows-Kompatibilitäts-Runtime erkannt'
    }
  });

  assert.equal(result.isWindowsExecutable, true);
  assert.equal(result.canLaunch, false);
  assert.equal(result.missingCompatibilityLayer, true);
  assert.equal(result.detectedRuntime, 'none');
  assert.match(result.warningTitle, /VRisingServer\.exe/);
  assert.match(result.warningMessage, /Wine|Docker|Podman/i);
  assert.match(result.installInstructions.debianWine, /wine\s+xvfb/);
  assert.match(result.installInstructions.podman, /podman/);
  assert.match(result.installInstructions.docker, /docker\.io/);
});

test('Pre-Flight Checker allows launch when Wine is detected', () => {
  const result = runWindowsExePreFlightCheck({
    configuredExecutable: 'VRisingServer.exe',
    targetOS: 'linux',
    platform: 'linux',
    detectedRuntimes: {
      platform: 'linux',
      hasWine: true,
      wineBin: '/usr/bin/wine64',
      hasXvfb: true,
      xvfbBin: '/usr/bin/xvfb-run',
      hasPodman: false,
      podmanBin: null,
      hasDocker: false,
      dockerBin: null,
      preferredRuntime: 'wine',
      containerImage: 'docker.io/scottyhardy/docker-wine:latest',
      summary: 'Wine (/usr/bin/wine64) + Xvfb'
    }
  });

  assert.equal(result.isWindowsExecutable, true);
  assert.equal(result.canLaunch, true);
  assert.equal(result.missingCompatibilityLayer, false);
  assert.equal(result.detectedRuntime, 'wine');
  assert.equal(result.hasWine, true);
});

test('Pre-Flight Checker allows launch when Podman or Docker is detected', () => {
  const podmanResult = runWindowsExePreFlightCheck({
    configuredExecutable: 'VRisingServer.exe',
    platform: 'linux',
    detectedRuntimes: {
      platform: 'linux',
      hasWine: false,
      wineBin: null,
      hasXvfb: false,
      xvfbBin: null,
      hasPodman: true,
      podmanBin: '/usr/bin/podman',
      hasDocker: false,
      dockerBin: null,
      preferredRuntime: 'podman',
      containerImage: 'docker.io/scottyhardy/docker-wine:latest',
      summary: 'Podman'
    }
  });
  assert.equal(podmanResult.canLaunch, true);
  assert.equal(podmanResult.detectedRuntime, 'podman');

  const dockerResult = runWindowsExePreFlightCheck({
    configuredExecutable: 'VRisingServer.exe',
    platform: 'linux',
    detectedRuntimes: {
      platform: 'linux',
      hasWine: false,
      wineBin: null,
      hasXvfb: false,
      xvfbBin: null,
      hasPodman: false,
      podmanBin: null,
      hasDocker: true,
      dockerBin: '/usr/bin/docker',
      preferredRuntime: 'docker',
      containerImage: 'docker.io/scottyhardy/docker-wine:latest',
      summary: 'Docker'
    }
  });
  assert.equal(dockerResult.canLaunch, true);
  assert.equal(dockerResult.detectedRuntime, 'docker');
});

test('Pre-Flight Checker detects PE magic header even on disk and skips native Linux scripts/ELF', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-preflight-'));
  try {
    const peFile = path.join(tmpDir, 'GameServer.exe');
    fs.writeFileSync(peFile, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));

    const shFile = path.join(tmpDir, 'start.sh');
    fs.writeFileSync(shFile, '#!/usr/bin/env bash\necho ok\n');

    const peCheck = runWindowsExePreFlightCheck({
      execPathOnDisk: peFile,
      configuredExecutable: 'GameServer.exe',
      platform: 'linux',
      detectedRuntimes: {
        platform: 'linux',
        hasWine: false,
        wineBin: null,
        hasXvfb: false,
        xvfbBin: null,
        hasPodman: false,
        podmanBin: null,
        hasDocker: false,
        dockerBin: null,
        preferredRuntime: 'none',
        containerImage: 'docker.io/scottyhardy/docker-wine:latest',
        summary: 'none'
      }
    });
    assert.equal(peCheck.isWindowsExecutable, true);
    assert.equal(peCheck.canLaunch, false);

    const shCheck = runWindowsExePreFlightCheck({
      execPathOnDisk: shFile,
      configuredExecutable: 'start.sh',
      platform: 'linux',
      detectedRuntimes: {
        platform: 'linux',
        hasWine: false,
        wineBin: null,
        hasXvfb: false,
        xvfbBin: null,
        hasPodman: false,
        podmanBin: null,
        hasDocker: false,
        dockerBin: null,
        preferredRuntime: 'none',
        containerImage: 'docker.io/scottyhardy/docker-wine:latest',
        summary: 'none'
      }
    });
    assert.equal(shCheck.isWindowsExecutable, false);
    assert.equal(shCheck.canLaunch, true);
    assert.equal(shCheck.missingCompatibilityLayer, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 4. Static wiring verification across frontend & backend
test('CreateServerModal, ServerDetail, WindowsPreFlightBanner, and server.ts are properly wired', () => {
  const modalSrc = fs.readFileSync(path.resolve('src/components/CreateServerModal.tsx'), 'utf8');
  assert.match(modalSrc, /validateServerExecutablePath/);
  assert.match(modalSrc, /useWindowsContainer/);
  assert.match(modalSrc, /exe-validation-error/);
  assert.match(modalSrc, /\/api\/system\/windows-runtime/);

  const detailSrc = fs.readFileSync(path.resolve('src/components/ServerDetail.tsx'), 'utf8');
  assert.match(detailSrc, /WindowsPreFlightBanner/);
  assert.match(detailSrc, /\/api\/servers\/\$\{encodeURIComponent\(server\.id\)\}\/preflight/);
  assert.match(detailSrc, /handleStartWithPreFlight/);
  assert.match(detailSrc, /handleRestartWithPreFlight/);

  const bannerSrc = fs.readFileSync(path.resolve('src/components/WindowsPreFlightBanner.tsx'), 'utf8');
  assert.match(bannerSrc, /windows-preflight-warning/);
  assert.match(bannerSrc, /role="alert"/);
  assert.match(bannerSrc, /installInstructions\.debianWine/);
  assert.match(bannerSrc, /installInstructions\.podman/);
  assert.match(bannerSrc, /installInstructions\.docker/);

  const serverSrc = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  assert.match(serverSrc, /LINUX_EXECUTABLE_REQUIRED/);
  assert.match(serverSrc, /\/api\/servers\/:id\/preflight/);
  assert.match(serverSrc, /allowWindowsExeEnvFlag:\s*isWindowsExeEnvFlagSet\(\)/);
});

console.log(`ALL ${passed} PRE-FLIGHT & CREATE-MODAL VALIDATION REGRESSION TESTS PASSED!`);
