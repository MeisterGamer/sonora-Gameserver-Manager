import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export type DownloadedArtifactKind = 'jar' | 'zip_bundle' | 'installer_jar' | 'invalid';

export interface ArtifactInspection {
  kind: DownloadedArtifactKind;
  valid: boolean;
  reason?: string;
  entryCount?: number;
  hasManifest?: boolean;
  nestedJarName?: string;
}

const NON_JAVA_MINECRAFT_IDS = new Set(['mc_bedrock', 'bedrock']);

/**
 * Accurately determines whether a server specification is a Java-based Minecraft server.
 * Prevents sandbox, simulation, rpg, coop, strategy, and Bedrock servers from being
 * misrouted into installMinecraftServer() or launched with `java -jar paper.jar`.
 */
export function isJavaMinecraftSpec(spec: {
  category?: string;
  gameId?: string;
  minecraftType?: string;
  steamAppId?: number | string | null;
}): boolean {
  const cat = String(spec.category || '').toLowerCase().trim();
  const gameId = String(spec.gameId || '').toLowerCase().trim();
  const mcType = String(spec.minecraftType || '').toLowerCase().trim();

  if (NON_JAVA_MINECRAFT_IDS.has(gameId) || NON_JAVA_MINECRAFT_IDS.has(mcType)) {
    return false;
  }

  // Explicit non-Minecraft Steam/dedicated categories are NEVER Java Minecraft
  if (cat && cat !== 'minecraft') {
    return false;
  }

  // Explicit Steam AppID without minecraft category is always a Steam dedicated server
  if (spec.steamAppId && Number(spec.steamAppId) > 0 && cat !== 'minecraft') {
    return false;
  }

  if (cat === 'minecraft') return true;
  if (gameId.startsWith('mc_')) return true;
  if (mcType && !NON_JAVA_MINECRAFT_IDS.has(mcType)) return true;

  return false;
}

export function isBedrockSpec(spec: {
  category?: string;
  gameId?: string;
  minecraftType?: string;
}): boolean {
  const gameId = String(spec.gameId || '').toLowerCase().trim();
  const mcType = String(spec.minecraftType || '').toLowerCase().trim();
  return NON_JAVA_MINECRAFT_IDS.has(gameId) || NON_JAVA_MINECRAFT_IDS.has(mcType);
}

/**
 * Inspects a downloaded buffer to distinguish a runnable JAR (which is itself a ZIP
 * with PK\x03\x04 magic bytes!) from a multi-file server ZIP bundle (e.g. Forge/NeoForge
 * archive containing libraries/ + run.sh) or a Forge/NeoForge installer JAR.
 *
 * CRITICAL: Never unzip runnable JAR files (paper.jar, purpur.jar, server.jar, etc.)!
 */
export function inspectDownloadedArtifact(
  buffer: Buffer | null,
  options: { sourceUrl?: string; engine?: string; buildLabel?: string } = {}
): ArtifactInspection {
  if (!buffer || buffer.length < 4096) {
    return {
      kind: 'invalid',
      valid: false,
      reason: `Datei zu klein (${buffer?.length || 0} Bytes) — vermutlich eine Fehlerseite statt einer gültigen Server-Datei.`
    };
  }

  // Verify ZIP/JAR magic signature PK\x03\x04
  const hasPkHeader =
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (!hasPkHeader) {
    const preview = buffer.slice(0, 64).toString('utf8').replace(/\s+/g, ' ').trim();
    return {
      kind: 'invalid',
      valid: false,
      reason: `Kein gültiges JAR/ZIP-Archiv (Header: "${preview.slice(0, 32)}").`
    };
  }

  const urlLower = String(options.sourceUrl || '').toLowerCase();
  const buildLower = String(options.buildLabel || '').toLowerCase();
  const engineLower = String(options.engine || '').toLowerCase();

  let entries: string[] = [];
  try {
    const zip = new AdmZip(buffer);
    entries = zip.getEntries().map(e => e.entryName);
  } catch (err: any) {
    return {
      kind: 'invalid',
      valid: false,
      reason: `Beschädigtes ZIP/JAR-Archiv: ${err?.message || 'Konnte Einträge nicht lesen'}`
    };
  }

  if (entries.length === 0) {
    return { kind: 'invalid', valid: false, reason: 'Leeres Archiv empfangen.' };
  }

  const entrySet = new Set(entries);
  const hasManifest = entrySet.has('META-INF/MANIFEST.MF');
  const hasInstallProfile = entrySet.has('install_profile.json');
  const hasClassFiles = entries.some(e => e.endsWith('.class'));
  const hasLibrariesFolder = entries.some(e => e.startsWith('libraries/'));
  const hasRunScript = entries.some(e => /^(run|start)\.(sh|bat)$/i.test(e));
  const nestedJar = entries.find(e => !e.includes('/') && e.toLowerCase().endsWith('.jar'));

  // 1. Forge / NeoForge official installer JAR (contains install_profile.json)
  if (
    hasInstallProfile ||
    urlLower.includes('-installer.jar') ||
    buildLower.includes('installer')
  ) {
    return {
      kind: 'installer_jar',
      valid: true,
      entryCount: entries.length,
      hasManifest
    };
  }

  // 2. Explicit multi-file server ZIP bundle (never a single runnable .jar!)
  const isExplicitZipBundle =
    urlLower.endsWith('.zip') ||
    (!hasManifest && !hasClassFiles && (hasLibrariesFolder || hasRunScript || Boolean(nestedJar))) ||
    ((engineLower === 'forge' || engineLower === 'neoforge') && hasLibrariesFolder && (hasRunScript || Boolean(nestedJar)) && !hasClassFiles);

  if (isExplicitZipBundle) {
    return {
      kind: 'zip_bundle',
      valid: true,
      entryCount: entries.length,
      hasManifest,
      nestedJarName: nestedJar
    };
  }

  // 3. Runnable Java JAR (Paper, Purpur, Vanilla, Fabric, Quilt, Spigot, Velocity, BungeeCord, Geyser)
  return {
    kind: 'jar',
    valid: true,
    entryCount: entries.length,
    hasManifest
  };
}

/**
 * Verifies a JAR file on disk exists, has realistic size, and is a valid ZIP/JAR.
 */
export function isValidJarFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 4096) return false;
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  } catch {
    return false;
  }
}

/**
 * Locates Forge / NeoForge 1.17+ args file (unix_args.txt or win_args.txt) inside libraries/.
 */
export function findForgeArgsFile(srvDir: string, platform: NodeJS.Platform = process.platform): string | null {
  const targetName = platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  const roots = [
    path.join(srvDir, 'libraries', 'net', 'neoforged', 'neoforge'),
    path.join(srvDir, 'libraries', 'net', 'minecraftforge', 'forge')
  ];

  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    try {
      const subdirs = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const dir of subdirs) {
        const candidate = path.join(base, dir.name, targetName);
        if (fs.existsSync(candidate)) {
          return path.relative(srvDir, candidate);
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Returns the canonical primary JAR filename for a given Minecraft engine.
 */
export function getPrimaryJarNameForEngine(engine: string): string {
  const e = engine.toLowerCase().replace(/^mc_/, '');
  if (e === 'paper') return 'paper.jar';
  if (e === 'purpur') return 'purpur.jar';
  if (e === 'fabric') return 'fabric-server-launch.jar';
  if (e === 'quilt') return 'quilt-server-launch.jar';
  if (e === 'neoforge') return 'neoforge-server.jar';
  if (e === 'forge') return 'forge-server.jar';
  if (e === 'spigot') return 'spigot.jar';
  if (e === 'velocity') return 'velocity.jar';
  if (e === 'bungeecord') return 'BungeeCord.jar';
  if (e === 'geyser') return 'Geyser.jar';
  return 'server.jar';
}

/**
 * Recursively searches for a game executable inside a server directory (up to depth 4)
 * so SteamCMD installs nested inside subdirectories (e.g. Pal/Binaries/Linux) are found.
 */
export function searchExecutableRecursive(dir: string, targetNames: string[], maxDepth = 4, depth = 0): string | null {
  if (depth > maxDepth || !fs.existsSync(dir)) return null;
  const lowerTargets = new Set(targetNames.map(n => path.basename(n).toLowerCase()));
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && lowerTargets.has(entry.name.toLowerCase())) {
        return path.join(dir, entry.name);
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !['steamapps', 'logs', 'backups', 'node_modules', '.git'].includes(entry.name)) {
        const found = searchExecutableRecursive(path.join(dir, entry.name), targetNames, maxDepth, depth + 1);
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

/**
 * Ensures `server-port=<port>` is properly written in `server.properties`.
 */
export function ensureServerPropertiesPort(srvDir: string, port: number, motd?: string, maxPlayers?: number): void {
  const propsPath = path.join(srvDir, 'server.properties');
  const safePort = Number.isFinite(port) && port >= 1024 && port <= 65535 ? Math.round(port) : 25565;
  if (!fs.existsSync(propsPath)) {
    fs.writeFileSync(
      propsPath,
      `server-port=${safePort}\nquery.port=${safePort}\nmotd=${motd || '§aSonora Minecraft Server§r'}\nonline-mode=true\nmax-players=${maxPlayers || 20}\n`,
      'utf8'
    );
    return;
  }
  try {
    let text = fs.readFileSync(propsPath, 'utf8');
    if (/^server-port=/m.test(text)) {
      text = text.replace(/^server-port=.*$/m, `server-port=${safePort}`);
    } else {
      text += `\nserver-port=${safePort}\n`;
    }
    fs.writeFileSync(propsPath, text, 'utf8');
  } catch {}
}

/**
 * Shell-quote-aware CLI argument splitter so quoted arguments like
 * `+server.hostname "My Rust Server"` or `-name "Valheim World"` are never corrupted.
 */
export function splitCommandArgs(rawArgs: string): string[] {
  const input = String(rawArgs || '').trim();
  if (!input) return [];
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escapeNext = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Normalizes and applies the allocated server port, queryPort, rconPort, and maxPlayers
 * into Steam dedicated server launch arguments while preserving quoted strings.
 */
export function applySteamServerArgs(
  rawArgs: string | undefined,
  opts: {
    port?: number;
    queryPort?: number;
    rconPort?: number;
    maxPlayers?: number;
    serverName?: string;
  }
): string[] {
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Math.round(Number(opts.port)) : 27015;
  const queryPort = Number.isFinite(Number(opts.queryPort)) && Number(opts.queryPort) > 0 ? Math.round(Number(opts.queryPort)) : port + 1;
  const rconPort = Number.isFinite(Number(opts.rconPort)) && Number(opts.rconPort) > 0 ? Math.round(Number(opts.rconPort)) : 25575;
  const maxPlayers = Number.isFinite(Number(opts.maxPlayers)) && Number(opts.maxPlayers) > 0 ? Math.round(Number(opts.maxPlayers)) : 32;

  let template = String(rawArgs || '').trim();
  if (!template) {
    return [`-port=${port}`, `-queryport=${queryPort}`, `-players=${maxPlayers}`];
  }

  // Replace explicit template placeholders if present
  template = template
    .replace(/\{\{PORT\}\}/gi, String(port))
    .replace(/\{\{QUERY_PORT\}\}/gi, String(queryPort))
    .replace(/\{\{RCON_PORT\}\}/gi, String(rconPort))
    .replace(/\{\{MAX_PLAYERS\}\}/gi, String(maxPlayers));

  if (opts.serverName) {
    template = template.replace(/\{\{SERVER_NAME\}\}/gi, opts.serverName.replace(/"/g, ''));
  }

  const tokens = splitCommandArgs(template);
  let hasPort = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const lower = tok.toLowerCase();

    // Key=Value forms: -port=8211, -Port=7777, +server.port=28015, --port=27015
    if (/^(--?port|\+server\.port|\+hostport)=/i.test(tok)) {
      tokens[i] = `${tok.split('=')[0]}=${port}`;
      hasPort = true;
      continue;
    }
    if (/^(--?queryport|\+server\.queryport)=/i.test(tok)) {
      tokens[i] = `${tok.split('=')[0]}=${queryPort}`;
      continue;
    }
    if (/^(--?rconport|\+rcon\.port)=/i.test(tok)) {
      tokens[i] = `${tok.split('=')[0]}=${rconPort}`;
      continue;
    }
    if (/^(--?players|\+server\.maxplayers|\+maxplayers|-winlivemaxplayers)=/i.test(tok)) {
      tokens[i] = `${tok.split('=')[0]}=${maxPlayers}`;
      continue;
    }

    // Space-separated forms: -port 2456, +server.port 28015, -queryport 27015, +rcon.port 28016
    if ((lower === '-port' || lower === '--port' || lower === '+server.port' || lower === '+hostport') && i + 1 < tokens.length) {
      tokens[i + 1] = String(port);
      hasPort = true;
      i++;
      continue;
    }
    if ((lower === '-queryport' || lower === '--queryport' || lower === '+server.queryport') && i + 1 < tokens.length) {
      tokens[i + 1] = String(queryPort);
      i++;
      continue;
    }
    if ((lower === '-rconport' || lower === '--rconport' || lower === '+rcon.port') && i + 1 < tokens.length) {
      tokens[i + 1] = String(rconPort);
      i++;
      continue;
    }
    if ((lower === '-players' || lower === '--players' || lower === '+server.maxplayers' || lower === '+maxplayers') && i + 1 < tokens.length) {
      tokens[i + 1] = String(maxPlayers);
      i++;
      continue;
    }
  }

  if (!hasPort) {
    tokens.push(`-port=${port}`);
  }
  return tokens;
}

/**
 * Checks whether an executable on disk is a text script with a `#!` shebang (or `.sh`)
 * so Linux can launch it reliably via `bash` even on restricted/noexec mounts, whereas
 * native ELF binaries are spawned directly.
 */
export function isShebangScript(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(4);
    const bytesRead = fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    if (bytesRead >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
      return false; // Native ELF binary
    }
    if (bytesRead >= 2 && head[0] === 0x23 && head[1] === 0x21) {
      return true; // `#!` shebang script
    }
    return filePath.toLowerCase().endsWith('.sh');
  } catch {
    return filePath.toLowerCase().endsWith('.sh');
  }
}

export interface SteamAppManifestInfo {
  exists: boolean;
  manifestPath: string;
  appId: number;
  stateFlags: number | null;
  buildId: string | null;
  bytesDownloaded: number | null;
  bytesToDownload: number | null;
  fullyInstalled: boolean;
}

/**
 * Parses a Valve SteamCMD `steamapps/appmanifest_<appId>.acf` file to determine
 * whether the game download actually reached Valve's StateFullyInstalled (`StateFlags === 4`).
 */
export function parseSteamAppManifest(srvDir: string, steamAppId: number): SteamAppManifestInfo {
  const manifestPath = path.join(srvDir, 'steamapps', `appmanifest_${steamAppId}.acf`);
  if (!steamAppId || steamAppId <= 0 || !fs.existsSync(manifestPath)) {
    return {
      exists: false,
      manifestPath,
      appId: steamAppId,
      stateFlags: null,
      buildId: null,
      bytesDownloaded: null,
      bytesToDownload: null,
      fullyInstalled: false
    };
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const stateMatch = raw.match(/"StateFlags"\s+"(\d+)"/i);
    const buildMatch = raw.match(/"buildid"\s+"([^"]+)"/i);
    const downloadedMatch = raw.match(/"BytesDownloaded"\s+"(\d+)"/i);
    const toDownloadMatch = raw.match(/"BytesToDownload"\s+"(\d+)"/i);

    const stateFlags = stateMatch ? Number(stateMatch[1]) : null;
    const bytesDownloaded = downloadedMatch ? Number(downloadedMatch[1]) : null;
    const bytesToDownload = toDownloadMatch ? Number(toDownloadMatch[1]) : null;

    // Valve StateFlags bitmask: 4 === StateFullyInstalled (no pending update/staging bits)
    const fullyInstalled = stateFlags === 4;

    return {
      exists: true,
      manifestPath,
      appId: steamAppId,
      stateFlags,
      buildId: buildMatch ? buildMatch[1] : null,
      bytesDownloaded,
      bytesToDownload,
      fullyInstalled
    };
  } catch {
    return {
      exists: true,
      manifestPath,
      appId: steamAppId,
      stateFlags: null,
      buildId: null,
      bytesDownloaded: null,
      bytesToDownload: null,
      fullyInstalled: false
    };
  }
}

export interface SteamCmdVerification {
  installed: boolean;
  completed: boolean;
  steamCmdPath: string | null;
  hasLinux32Binary: boolean;
  hasSteamClient64: boolean;
  hasSteamClient32: boolean;
  hasVerifiedMarker: boolean;
  issues: string[];
}

/**
 * Verifies whether Valve SteamCMD is completely installed and bootstrapped on disk
 * (script + linux32/steamcmd binary + steamclient.so / package bootstrap artifacts).
 */
export function verifySteamCmdInstallation(steamCmdBin: string | null): SteamCmdVerification {
  const issues: string[] = [];
  if (!steamCmdBin || !fs.existsSync(steamCmdBin)) {
    return {
      installed: false,
      completed: false,
      steamCmdPath: steamCmdBin,
      hasLinux32Binary: false,
      hasSteamClient64: false,
      hasSteamClient32: false,
      hasVerifiedMarker: false,
      issues: ['SteamCMD-Binary wurde nicht auf dem Host gefunden.']
    };
  }

  const rootDir = path.dirname(steamCmdBin);
  const candidateRoots = Array.from(new Set([rootDir, '/opt/steamcmd']));
  const homeDir = process.env.HOME || '';

  const hasLinux32Binary = candidateRoots.some((r) => {
    const p = path.join(r, 'linux32', 'steamcmd');
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  });

  const hasSteamClient64 =
    candidateRoots.some((r) => fs.existsSync(path.join(r, 'linux64', 'steamclient.so'))) ||
    (homeDir ? fs.existsSync(path.join(homeDir, '.steam', 'sdk64', 'steamclient.so')) : false);

  const hasSteamClient32 =
    candidateRoots.some((r) => fs.existsSync(path.join(r, 'linux32', 'steamclient.so'))) ||
    (homeDir ? fs.existsSync(path.join(homeDir, '.steam', 'sdk32', 'steamclient.so')) : false);

  const hasVerifiedMarker = candidateRoots.some(
    (r) =>
      fs.existsSync(path.join(r, '.sonora-steamcmd-verified')) ||
      fs.existsSync(path.join(r, 'package', 'steam_cmd_linux.installed'))
  );

  if (process.platform !== 'win32') {
    if (!hasLinux32Binary && !steamCmdBin.endsWith('/usr/games/steamcmd')) {
      issues.push('SteamCMD 32-Bit-Kernbinary (linux32/steamcmd) fehlt — Installation unvollständig.');
    }
    if (!hasSteamClient64 && !hasSteamClient32 && !hasVerifiedMarker) {
      issues.push('SteamCMD-Bootstrap noch nicht abgeschlossen (steamclient.so fehlt).');
    }
  }

  const completed =
    process.platform === 'win32'
      ? fs.existsSync(steamCmdBin) && fs.statSync(steamCmdBin).size > 0
      : hasVerifiedMarker || (hasLinux32Binary && (hasSteamClient64 || hasSteamClient32));

  return {
    installed: true,
    completed,
    steamCmdPath: steamCmdBin,
    hasLinux32Binary,
    hasSteamClient64,
    hasSteamClient32,
    hasVerifiedMarker,
    issues
  };
}

export interface SteamAppDataVerification {
  ready: boolean;
  srvDirExists: boolean;
  manifest: SteamAppManifestInfo;
  hasPendingDownload: boolean;
  executablePath: string | null;
  executableValid: boolean;
  executableIsScript: boolean;
  needsRepair: boolean;
  issues: string[];
}

/**
 * Robust pre-start check verifying that Steam app data is completely downloaded
 * (no incomplete appmanifest StateFlags, no leftover steamapps/downloading staging files)
 * and that the game executable exists and is non-empty before running the start command.
 */
export function verifySteamAppDataDownloaded(
  srvDir: string,
  steamAppId: number,
  detectedExecPath: string | null
): SteamAppDataVerification {
  const issues: string[] = [];
  const srvDirExists = fs.existsSync(srvDir);
  const manifest = parseSteamAppManifest(srvDir, steamAppId);

  if (!srvDirExists) {
    issues.push(`Server-Verzeichnis "${srvDir}" existiert nicht.`);
  }

  // Check for interrupted SteamCMD staging downloads
  let hasPendingDownload = false;
  if (steamAppId > 0) {
    const downloadingDir = path.join(srvDir, 'steamapps', 'downloading', String(steamAppId));
    try {
      if (fs.existsSync(downloadingDir) && fs.readdirSync(downloadingDir).length > 0) {
        hasPendingDownload = true;
        issues.push(`Unvollständiger SteamCMD-Download erkannt (steamapps/downloading/${steamAppId} nicht leer).`);
      }
    } catch {}
  }

  // If a SteamCMD appmanifest exists, its StateFlags MUST equal 4 (StateFullyInstalled)
  if (manifest.exists && !manifest.fullyInstalled) {
    issues.push(
      `Steam App-Manifest appmanifest_${steamAppId}.acf unvollständig (StateFlags=${manifest.stateFlags ?? 'unbekannt'}, erwartet 4).`
    );
  }

  let executableValid = false;
  let executableIsScript = false;
  if (!detectedExecPath || !fs.existsSync(detectedExecPath)) {
    issues.push('Keine ausführbare Server-Datei (Executable) im Spielverzeichnis gefunden.');
  } else {
    try {
      const stat = fs.statSync(detectedExecPath);
      executableValid = stat.isFile() && stat.size > 0;
      executableIsScript = isShebangScript(detectedExecPath);
      if (!executableValid) {
        issues.push(`Server-Executable "${path.basename(detectedExecPath)}" ist leer (0 Bytes) oder keine reguläre Datei.`);
      }
    } catch {
      issues.push(`Kein Lesezugriff auf Server-Executable "${detectedExecPath}".`);
    }
  }

  const ready = srvDirExists && executableValid && !hasPendingDownload && (!manifest.exists || manifest.fullyInstalled);
  const needsRepair = !ready;

  return {
    ready,
    srvDirExists,
    manifest,
    hasPendingDownload,
    executablePath: detectedExecPath,
    executableValid,
    executableIsScript,
    needsRepair,
    issues
  };
}


