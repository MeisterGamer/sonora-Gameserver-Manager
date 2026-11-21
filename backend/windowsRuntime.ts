import fs from 'node:fs';
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

  const wine64Bin = probe('wine64', ['/usr/bin/wine64', '/usr/local/bin/wine64', '/opt/wine-staging/bin/wine64', '/opt/wine-stable/bin/wine64']);
  const wine32Bin = probe('wine', ['/usr/bin/wine', '/usr/local/bin/wine', '/opt/wine-staging/bin/wine', '/opt/wine-stable/bin/wine']);
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
      WINEPREFIX: winePrefix,
      WINEARCH: 'win64',
      WINEDEBUG: process.env.WINEDEBUG || '-all',
      WINEDLLOVERRIDES: 'mscoree,mshtml=',
      SDL_VIDEODRIVER: 'dummy',
      DISPLAY: params.env.DISPLAY || ':99'
    };

    const wineExecArgs = isBatchFile
      ? ['cmd', '/c', params.execPath, ...params.parsedArgs]
      : [params.execPath, ...params.parsedArgs];

    if (runtimes.hasXvfb && runtimes.xvfbRunBin) {
      return {
        canLaunch: true,
        runtime: 'wine',
        runtimeLabel: `Wine (${path.basename(runtimes.wineBin)}) + Xvfb Headless`,
        command: runtimes.xvfbRunBin,
        args: ['--auto-servernum', '--server-args=-screen 0 1024x768x24', runtimes.wineBin, ...wineExecArgs],
        env: wineEnv,
        winePrefix
      };
    }

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
    'Debian/Ubuntu installieren: sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine wine64 xvfb  (oder Container-Runtime: sudo apt-get install -y podman)';

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
