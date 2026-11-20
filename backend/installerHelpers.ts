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
