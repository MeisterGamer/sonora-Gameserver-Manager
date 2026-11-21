import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

export type WindowsCompatRuntimeKind = 'wine' | 'podman' | 'docker' | 'none';
export type WindowsRuntimePreference = 'auto' | 'wine' | 'podman' | 'docker';

export interface DetectedWindowsRuntimes {
  platform: NodeJS.Platform;
  hasWine: boolean;
  wineBin: string | null;
  hasXvfb: boolean;
  xvfbRunBin: string | null;
  hasPodman: boolean;
  podmanBin: string | null;
  hasDocker: boolean;
  dockerBin: string | null;
  preferredRuntime: WindowsCompatRuntimeKind;
  containerImage: string;
  summary: string;
}

export interface WindowsExeLaunchPlan {
  canLaunch: boolean;
  runtime: WindowsCompatRuntimeKind;
  runtimeLabel: string;
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  winePrefix?: string;
  containerName?: string;
  stopCommand?: { command: string; args: string[] };
  errorCode?: string;
  errorMessage?: string;
  installHint?: string;
}

export type CommandProbeFn = (cmd: string, absoluteCandidates?: string[]) => string | null;

export const DEFAULT_WINE_CONTAINER_IMAGE =
  process.env.SONORA_WINE_CONTAINER_IMAGE || 'scottyhardy/docker-wine:latest';

/**
 * Accurately determines whether a file on disk is a Windows PE executable (MZ header or .exe/.bat/.cmd)
 * rather than a native Linux ELF binary or `#!` shell script.
 */
export function isWindowsPeExecutable(filePath: string): boolean {
  const lower = String(filePath || '').toLowerCase();
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const fd = fs.openSync(filePath, 'r');
      const head = Buffer.alloc(4);
      const bytesRead = fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);

      // Native Linux ELF binary (\x7fELF) -> never Windows PE
      if (bytesRead >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
        return false;
      }
      // Unix shebang script (#!) -> never Windows PE
      if (bytesRead >= 2 && head[0] === 0x23 && head[1] === 0x21) {
        return false;
      }
      // Windows PE / DOS MZ header (0x4D 0x5A)
      if (bytesRead >= 2 && head[0] === 0x4d && head[1] === 0x5a) {
        return true;
      }
    }
  } catch {
    // Fallback to extension check below
  }

  return lower.endsWith('.exe') || lower.endsWith('.bat') || lower.endsWith('.cmd');
}

function defaultProbeCommand(cmd: string, absoluteCandidates: string[] = []): string | null {
  for (const cand of absoluteCandidates) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        fs.accessSync(cand, fs.constants.X_OK);
        return cand;
      }
    } catch {}
  }

  try {
    const out = execSync(`command -v ${cmd}`, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (out) return out.split('\n')[0].trim();
  } catch {}

  return null;
}

/**
 * Detects available compatibility runtimes on Linux for running Windows `.exe` dedicated servers
 * (e.g. V Rising, Enshrouded, Space Engineers, Sons of the Forest, Conan Exiles, ASA):
 *  1. Wine (`wine64` / `wine`) + optional headless `xvfb-run`
 *  2. Podman (daemonless OCI container runtime)
 *  3. Docker (OCI container runtime)
 */
export function detectLinuxWindowsRuntimes(
  probe: CommandProbeFn = defaultProbeCommand,
  platform: NodeJS.Platform = process.platform
): DetectedWindowsRuntimes {
  const containerImage = process.env.SONORA_WINE_CONTAINER_IMAGE || DEFAULT_WINE_CONTAINER_IMAGE;

  if (platform === 'win32') {
    return {
      platform,
      hasWine: false,
      wineBin: null,
      hasXvfb: false,
      xvfbRunBin: null,
      hasPodman: false,
      podmanBin: null,
      hasDocker: false,
      dockerBin: null,
      preferredRuntime: 'none',
      containerImage,
      summary: 'Native Windows Host (kein Wine/Container nötig)'
    };
  }

  const wine64Bin = probe('wine64', [
    '/usr/bin/wine64',
    '/usr/local/bin/wine64',
    '/usr/lib/wine/wine64',
    '/usr/bin/wine64-stable',
    '/usr/bin/wine64-development',
    '/opt/wine-staging/bin/wine64',
    '/opt/wine-stable/bin/wine64'
  ]);
  const wine32Bin = probe('wine', [
    '/usr/bin/wine',
    '/usr/local/bin/wine',
    '/usr/lib/wine/wine',
    '/usr/bin/wine-stable',
    '/usr/bin/wine-development',
    '/opt/wine-staging/bin/wine',
    '/opt/wine-stable/bin/wine'
  ]);
  const wineBin = wine64Bin || wine32Bin;
  const xvfbRunBin = probe('xvfb-run', ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run']);
  const podmanBin = probe('podman', ['/usr/bin/podman', '/usr/local/bin/podman']);
  const dockerBin = probe('docker', ['/usr/bin/docker', '/usr/local/bin/docker']);

  const hasWine = Boolean(wineBin);
  const hasXvfb = Boolean(xvfbRunBin);
  const hasPodman = Boolean(podmanBin);
  const hasDocker = Boolean(dockerBin);

  let preferredRuntime: WindowsCompatRuntimeKind = 'none';
  const envPref = String(process.env.SONORA_WIN_RUNTIME || 'auto').toLowerCase();
  if (envPref === 'podman' && hasPodman) preferredRuntime = 'podman';
  else if (envPref === 'docker' && hasDocker) preferredRuntime = 'docker';
  else if (envPref === 'wine' && hasWine) preferredRuntime = 'wine';
  else if (hasWine) preferredRuntime = 'wine';
  else if (hasPodman) preferredRuntime = 'podman';
  else if (hasDocker) preferredRuntime = 'docker';

  const parts: string[] = [];
  if (hasWine) parts.push(hasXvfb ? `Wine (${path.basename(wineBin!)}) + Xvfb` : `Wine (${path.basename(wineBin!)})`);
  if (hasPodman) parts.push('Podman');
  if (hasDocker) parts.push('Docker');

  return {
    platform,
    hasWine,
    wineBin,
    hasXvfb,
    xvfbRunBin,
    hasPodman,
    podmanBin,
    hasDocker,
    dockerBin,
    preferredRuntime,
    containerImage,
    summary: parts.length > 0
      ? `Verfügbar: ${parts.join(', ')}`
      : 'Kein Wine, Podman oder Docker auf dem Linux-Host installiert'
  };
}

export interface BuildWindowsLaunchParams {
  execPath: string;
  srvDir: string;
  parsedArgs: string[];
  serverId: string;
  env: Record<string, string | undefined>;
  runtimePreference?: WindowsRuntimePreference;
  detectedRuntimes?: DetectedWindowsRuntimes;
}

/**
 * Builds a real execution plan for launching a Windows `.exe` dedicated server on Linux
 * via Wine (+ Xvfb headless virtual framebuffer) or Podman/Docker container.
 * Prevents Linux from ever trying to directly `execve` a Windows MZ binary (which fails with
 * `MZ...: not found` / `Syntax error: word unexpected` / Exit Code 2).
 */
export function buildWindowsExeLaunchPlan(params: BuildWindowsLaunchParams): WindowsExeLaunchPlan {
  const runtimes = params.detectedRuntimes || detectLinuxWindowsRuntimes();
  const pref: WindowsRuntimePreference =
    params.runtimePreference ||
    ((process.env.SONORA_WIN_RUNTIME as WindowsRuntimePreference) || 'auto');

  const chooseRuntime = (): WindowsCompatRuntimeKind => {
    if (pref === 'wine' && runtimes.hasWine) return 'wine';
    if (pref === 'podman' && runtimes.hasPodman) return 'podman';
    if (pref === 'docker' && runtimes.hasDocker) return 'docker';
    if (runtimes.hasWine) return 'wine';
    if (runtimes.hasPodman) return 'podman';
    if (runtimes.hasDocker) return 'docker';
    return 'none';
  };

  const selected = chooseRuntime();
  const execBase = path.basename(params.execPath);
  const relExec = path.relative(params.srvDir, params.execPath).replace(/\\/g, '/');
  const winePrefix = path.join(params.srvDir, '.wineprefix');
  const isBatchFile = /\.(bat|cmd)$/i.test(execBase);

  if (selected === 'wine' && runtimes.wineBin) {
    try {
      fs.mkdirSync(winePrefix, { recursive: true });
    } catch {}

    const wineEnv: Record<string, string | undefined> = {
      ...params.env,
      HOME: params.env.HOME || os.homedir() || params.srvDir,
      XDG_RUNTIME_DIR: params.env.XDG_RUNTIME_DIR || '/tmp',
      WINEPREFIX: winePrefix,
      WINEARCH: 'win64',
      WINEDEBUG: process.env.WINEDEBUG || '-all',
      WINEDLLOVERRIDES: 'mscoree,mshtml=',
      SDL_VIDEODRIVER: 'dummy'
    };

    const wineExecArgs = isBatchFile
      ? ['cmd', '/c', params.execPath, ...params.parsedArgs]
      : [params.execPath, ...params.parsedArgs];

    if (runtimes.hasXvfb && runtimes.xvfbRunBin) {
      // Let xvfb-run --auto-servernum allocate a conflict-free DISPLAY cleanly (avoid stale :99 lock collisions)
      delete wineEnv.DISPLAY;
      return {
        canLaunch: true,
        runtime: 'wine',
        runtimeLabel: `Wine (${path.basename(runtimes.wineBin)}) + Xvfb Headless`,
        command: runtimes.xvfbRunBin,
        args: ['--auto-servernum', '-s', '-screen 0 1024x768x24', runtimes.wineBin, ...wineExecArgs],
        env: wineEnv,
        winePrefix
      };
    }

    wineEnv.DISPLAY = params.env.DISPLAY || ':99';
    return {
      canLaunch: true,
      runtime: 'wine',
      runtimeLabel: `Wine (${path.basename(runtimes.wineBin)})`,
      command: runtimes.wineBin,
      args: wineExecArgs,
      env: wineEnv,
      winePrefix
    };
  }

  if ((selected === 'podman' && runtimes.podmanBin) || (selected === 'docker' && runtimes.dockerBin)) {
    const engineBin = selected === 'podman' ? runtimes.podmanBin! : runtimes.dockerBin!;
    const safeContainerName = `sonora-win-${params.serverId.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 48)}`;
    const volumeFlag = selected === 'podman' ? `${params.srvDir}:/srv/game:Z` : `${params.srvDir}:/srv/game:rw`;
    const containerExecPath = `/srv/game/${relExec}`;
    const innerWineCmd = isBatchFile
      ? ['xvfb-run', '--auto-servernum', 'wine64', 'cmd', '/c', containerExecPath, ...params.parsedArgs]
      : ['xvfb-run', '--auto-servernum', 'wine64', containerExecPath, ...params.parsedArgs];

    return {
      canLaunch: true,
      runtime: selected,
      runtimeLabel: `${selected === 'podman' ? 'Podman' : 'Docker'} Wine-Container (${runtimes.containerImage})`,
      command: engineBin,
      args: [
        'run',
        '--rm',
        '-i',
        '--name',
        safeContainerName,
        '--network',
        'host',
        '-v',
        volumeFlag,
        '-w',
        '/srv/game',
        '-e',
        'WINEPREFIX=/srv/game/.wineprefix',
        '-e',
        'WINEARCH=win64',
        '-e',
        'WINEDEBUG=-all',
        '-e',
        'WINEDLLOVERRIDES=mscoree,mshtml=',
        runtimes.containerImage,
        ...innerWineCmd
      ],
      env: params.env,
      winePrefix,
      containerName: safeContainerName,
      stopCommand: {
        command: engineBin,
        args: ['stop', '-t', '10', safeContainerName]
      }
    };
  }

  const installHint =
    'Debian/Ubuntu installieren: sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine xvfb  (oder Container-Runtime: sudo apt-get install -y podman)';

  return {
    canLaunch: false,
    runtime: 'none',
    runtimeLabel: 'Keine Windows-Kompatibilitäts-Runtime gefunden',
    command: '',
    args: [],
    env: params.env,
    errorCode: 'WINDOWS_EXE_NEEDS_WINE_OR_CONTAINER',
    errorMessage:
      `Windows-Binary "${execBase}" kann unter Linux nicht direkt ausgeführt werden (erfordert Wine + Xvfb oder Docker/Podman).`,
    installHint
  };
}

/**
 * Inspects a Linux shell script (e.g. start.sh / VRisingServer.sh) to detect if it tries to
 * directly execute a Windows `.exe` file without Wine / Podman / Docker / Proton.
 * If so, returns the resolved path to that `.exe` file so Sonora can intercept and launch it
 * safely via Wine/Podman/Docker instead of crashing with `MZ: not found` (Exit Code 2).
 */
export function extractUnwrappedWindowsExeFromShellScript(
  scriptPath: string,
  srvDir: string
): string | null {
  try {
    if (!scriptPath || !fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
      return null;
    }
    const stat = fs.statSync(scriptPath);
    if (stat.size === 0 || stat.size > 65536) return null;
    const content = fs.readFileSync(scriptPath, 'utf8');
    // Only inspect text scripts
    if (content.includes('\0')) return null;
    // If the script already invokes wine, podman, docker, or proton, it's already wrapped
    if (/\b(wine64|wine|podman|docker|proton|xvfb-run)\b/i.test(content)) {
      return null;
    }
    const match = content.match(/(?:^|[\s"'=])((?:\.\/|\/)?[^\s"'`;&|]+\.exe)\b/im);
    if (!match) return null;
    const rawTarget = match[1].replace(/^['"]|['"]$/g, '');
    const candidates = [
      path.isAbsolute(rawTarget) ? rawTarget : path.resolve(path.dirname(scriptPath), rawTarget),
      path.resolve(srvDir, rawTarget.replace(/^\.\//, ''))
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return cand;
      }
    }
  } catch {}
  return null;
}

/**
 * Resolves whether a target executable path is a Windows PE binary directly OR a broken
 * shell wrapper script that attempts to execute a `.exe` directly on Linux.
 */
export function resolveEffectiveWindowsExecutable(
  execPath: string | null | undefined,
  srvDir: string
): { isWindowsPe: boolean; targetExePath: string | null; viaBrokenShellWrapper: boolean } {
  const clean = String(execPath || '').trim();
  if (!clean) {
    return { isWindowsPe: false, targetExePath: null, viaBrokenShellWrapper: false };
  }
  if (isWindowsPeExecutable(clean)) {
    return { isWindowsPe: true, targetExePath: clean, viaBrokenShellWrapper: false };
  }
  const wrappedExe = extractUnwrappedWindowsExeFromShellScript(clean, srvDir);
  if (wrappedExe) {
    return { isWindowsPe: true, targetExePath: wrappedExe, viaBrokenShellWrapper: true };
  }
  return { isWindowsPe: false, targetExePath: null, viaBrokenShellWrapper: false };
}

/**
 * Generates a safe Linux bash wrapper script (`start.sh` / `run.sh`) for a Windows `.exe`
 * dedicated server that routes execution through Wine (+ Xvfb), Podman, or Docker and NEVER
 * executes the `.exe` binary directly via `/bin/sh`.
 */
export function generateLinuxWindowsWrapperScript(
  relExec: string,
  containerImage: string = DEFAULT_WINE_CONTAINER_IMAGE
): string {
  const cleanRel = String(relExec || 'Server.exe').replace(/\\/g, '/').replace(/^\.\//, '');
  const safeRel = cleanRel.replace(/["`$\\]/g, '');
  const safeImage = String(containerImage || DEFAULT_WINE_CONTAINER_IMAGE).replace(/["`$\\]/g, '');

  return `#!/usr/bin/env bash
# Generated by Sonora Gameserver Manager (Linux Windows-PE Compatibility Wrapper)
set -euo pipefail
SRV_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SRV_DIR"

TARGET_EXE="${safeRel}"
export WINEPREFIX="$SRV_DIR/.wineprefix"
export WINEARCH=win64
export WINEDEBUG="\${WINEDEBUG:--all}"
export WINEDLLOVERRIDES="mscoree,mshtml="
export SDL_VIDEODRIVER=dummy

WINE_BIN=""
for cand in wine64 /usr/bin/wine64 /usr/lib/wine/wine64 wine /usr/bin/wine /usr/lib/wine/wine; do
  if command -v "$cand" >/dev/null 2>&1; then
    WINE_BIN="$(command -v "$cand")"
    break
  elif [ -x "$cand" ]; then
    WINE_BIN="$cand"
    break
  fi
done

if [ -n "$WINE_BIN" ]; then
  mkdir -p "$WINEPREFIX"
  if command -v xvfb-run >/dev/null 2>&1; then
    exec xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" "$WINE_BIN" "$SRV_DIR/$TARGET_EXE" "$@"
  fi
  exec "$WINE_BIN" "$SRV_DIR/$TARGET_EXE" "$@"
fi

if command -v podman >/dev/null 2>&1; then
  exec podman run --rm -i --network host -v "$SRV_DIR:/srv/game:Z" -w /srv/game \\
    -e WINEPREFIX=/srv/game/.wineprefix -e WINEARCH=win64 -e WINEDEBUG=-all -e WINEDLLOVERRIDES="mscoree,mshtml=" \\
    "${safeImage}" xvfb-run --auto-servernum wine64 "/srv/game/$TARGET_EXE" "$@"
fi

if command -v docker >/dev/null 2>&1; then
  exec docker run --rm -i --network host -v "$SRV_DIR:/srv/game:rw" -w /srv/game \\
    -e WINEPREFIX=/srv/game/.wineprefix -e WINEARCH=win64 -e WINEDEBUG=-all -e WINEDLLOVERRIDES="mscoree,mshtml=" \\
    "${safeImage}" xvfb-run --auto-servernum wine64 "/srv/game/$TARGET_EXE" "$@"
fi

echo "[FEHLER] [WINDOWS_EXE_NEEDS_WINE_OR_CONTAINER] Windows-Binary \\"$TARGET_EXE\\" kann unter Linux nicht direkt gestartet werden." >&2
echo "Bitte installiere Wine + Xvfb (sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine xvfb) oder Podman (sudo apt-get install -y podman)." >&2
exit 1
`;
}

/**
 * Boot-time sanitizer for Linux hosts:
 *  - Strips `+x` (chmod 0644) from Windows `.exe`/`.dll`/`.bat`/`.cmd` files inside existing server directories
 *    so POSIX `execvp`/`/bin/sh` can NEVER accidentally interpret an MZ binary as a shell script.
 *  - Automatically rewrites any broken `start.sh` / `run.sh` that directly invokes a `.exe` without Wine/Podman/Docker.
 */
export function sanitizeExistingWindowsExeServers(dataDir: string): {
  strippedExeCount: number;
  repairedScriptsCount: number;
} {
  let strippedExeCount = 0;
  let repairedScriptsCount = 0;
  if (process.platform === 'win32' || !dataDir || !fs.existsSync(dataDir)) {
    return { strippedExeCount, repairedScriptsCount };
  }

  try {
    const serverEntries = fs.readdirSync(dataDir, { withFileTypes: true });
    for (const srvEntry of serverEntries) {
      if (!srvEntry.isDirectory()) continue;
      const srvDir = path.join(dataDir, srvEntry.name);

      const walkStripExe = (dir: string, depth = 0) => {
        if (depth > 3) return;
        let items: fs.Dirent[] = [];
        try {
          items = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const item of items) {
          if (item.isDirectory()) {
            if (!['steamapps', 'logs', 'backups', '.wineprefix', 'node_modules'].includes(item.name)) {
              walkStripExe(path.join(dir, item.name), depth + 1);
            }
          } else if (item.isFile() && /\.(exe|dll|bat|cmd)$/i.test(item.name)) {
            const full = path.join(dir, item.name);
            try {
              const mode = fs.statSync(full).mode & 0o777;
              if ((mode & 0o111) !== 0) {
                fs.chmodSync(full, 0o644);
                strippedExeCount++;
              }
            } catch {}
          }
        }
      };

      walkStripExe(srvDir);

      for (const scriptName of ['start.sh', 'run.sh']) {
        const scriptPath = path.join(srvDir, scriptName);
        const unwrappedExe = extractUnwrappedWindowsExeFromShellScript(scriptPath, srvDir);
        if (unwrappedExe) {
          const relExe = path.relative(srvDir, unwrappedExe).replace(/\\/g, '/');
          try {
            fs.writeFileSync(scriptPath, generateLinuxWindowsWrapperScript(relExe), 'utf8');
            fs.chmodSync(scriptPath, 0o755);
            repairedScriptsCount++;
          } catch {}
        }
      }
    }
  } catch {}

  return { strippedExeCount, repairedScriptsCount };
}

export interface PreFlightCheckResult {
  canLaunch: boolean;
  isWindowsExecutable: boolean;
  missingCompatibilityLayer: boolean;
  executableName: string;
  platform: NodeJS.Platform;
  hasWine: boolean;
  hasXvfb: boolean;
  hasPodman: boolean;
  hasDocker: boolean;
  detectedRuntime: WindowsCompatRuntimeKind;
  runtimeSummary: string;
  envFlagEnabled: boolean;
  warningTitle: string;
  warningMessage: string;
  installInstructions: {
    debianWine: string;
    podman: string;
    docker: string;
    envFlag: string;
  };
  checkedAt: string;
}

/**
 * Checks whether a host environment variable flag explicitly permits Windows .exe paths on Linux.
 */
export function isWindowsExeEnvFlagSet(
  env: Record<string, string | undefined> = process.env
): boolean {
  const isTruthy = (val?: string) => {
    const clean = String(val || '').trim().toLowerCase();
    return clean === '1' || clean === 'true' || clean === 'yes' || clean === 'on';
  };
  if (
    isTruthy(env.SONORA_ALLOW_WIN_EXE) ||
    isTruthy(env.ALLOW_WINDOWS_EXE) ||
    isTruthy(env.VITE_ALLOW_WINDOWS_EXE)
  ) {
    return true;
  }
  const rt = String(env.SONORA_WIN_RUNTIME || '').trim().toLowerCase();
  return rt === 'wine' || rt === 'docker' || rt === 'podman';
}

/**
 * Pre-Flight Checker that scans the environment for `wine` or `docker`/`podman`
 * before allowing a user to launch a Windows executable (.exe) on Linux.
 */
export function runWindowsExePreFlightCheck(params: {
  execPathOnDisk?: string | null;
  configuredExecutable?: string | null;
  srvDir?: string | null;
  targetOS?: string | null;
  detectedRuntimes?: DetectedWindowsRuntimes;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}): PreFlightCheckResult {
  const platform = params.platform || process.platform;
  const env = params.env || process.env;
  const runtimes = params.detectedRuntimes || detectLinuxWindowsRuntimes(undefined, platform);
  const envFlagEnabled = isWindowsExeEnvFlagSet(env);

  const configured = String(params.configuredExecutable || '').trim();
  const onDisk = String(params.execPathOnDisk || '').trim();
  const resolved = onDisk && params.srvDir
    ? resolveEffectiveWindowsExecutable(onDisk, params.srvDir)
    : { isWindowsPe: Boolean(onDisk && isWindowsPeExecutable(onDisk)), targetExePath: onDisk || null, viaBrokenShellWrapper: false };
  const effectivePath = resolved.targetExePath || onDisk || configured || 'server';
  const executableName = path.basename(effectivePath);

  const isWinByDisk = resolved.isWindowsPe;
  const isWinByName = /\.exe$/i.test(configured) || /\.exe$/i.test(onDisk);
  const isWindowsExecutable = isWinByDisk || isWinByName;

  const installInstructions = {
    debianWine: 'sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine xvfb',
    podman: 'sudo apt-get update && sudo apt-get install -y podman',
    docker: 'sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl enable --now docker',
    envFlag: 'SONORA_ALLOW_WIN_EXE=true'
  };

  const checkedAt = new Date().toISOString();

  if (platform === 'win32' || !isWindowsExecutable) {
    return {
      canLaunch: true,
      isWindowsExecutable,
      missingCompatibilityLayer: false,
      executableName,
      platform,
      hasWine: runtimes.hasWine,
      hasXvfb: runtimes.hasXvfb,
      hasPodman: runtimes.hasPodman,
      hasDocker: runtimes.hasDocker,
      detectedRuntime: runtimes.preferredRuntime,
      runtimeSummary: runtimes.summary,
      envFlagEnabled,
      warningTitle: '',
      warningMessage: '',
      installInstructions,
      checkedAt
    };
  }

  const hasCompatLayer = runtimes.hasWine || runtimes.hasPodman || runtimes.hasDocker;

  if (!hasCompatLayer) {
    return {
      canLaunch: false,
      isWindowsExecutable: true,
      missingCompatibilityLayer: true,
      executableName,
      platform,
      hasWine: false,
      hasXvfb: runtimes.hasXvfb,
      hasPodman: false,
      hasDocker: false,
      detectedRuntime: 'none',
      runtimeSummary: runtimes.summary,
      envFlagEnabled,
      warningTitle: `Pre-Flight Check fehlgeschlagen: Kompatibilitätsschicht für "${executableName}" fehlt`,
      warningMessage:
        `Die Windows-Executable "${executableName}" kann unter Linux nicht ohne Wine oder Docker/Podman gestartet werden. Der Pre-Flight Checker hat weder "wine" noch "docker" oder "podman" im System gefunden. Installiere eine der folgenden Kompatibilitätsschichten und führe den Check erneut aus.`,
      installInstructions,
      checkedAt
    };
  }

  return {
    canLaunch: true,
    isWindowsExecutable: true,
    missingCompatibilityLayer: false,
    executableName,
    platform,
    hasWine: runtimes.hasWine,
    hasXvfb: runtimes.hasXvfb,
    hasPodman: runtimes.hasPodman,
    hasDocker: runtimes.hasDocker,
    detectedRuntime: runtimes.preferredRuntime,
    runtimeSummary: runtimes.summary,
    envFlagEnabled,
    warningTitle: '',
    warningMessage: '',
    installInstructions,
    checkedAt
  };
}

