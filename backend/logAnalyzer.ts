import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { AuthController, StoredUserAccount } from './auth';
import type { PermissionsController } from './permissions';
import {
  analyzeConsoleLogs,
  type DetectedLogIssue,
  type LogEntryLike,
  type LogFixId
} from '../src/utils/logPatterns';
import {
  isJavaMinecraftSpec,
  isBedrockSpec,
  isValidJarFile,
  findForgeArgsFile,
  getPrimaryJarNameForEngine,
  ensureServerPropertiesPort,
  verifySteamCmdInstallation,
  verifySteamAppDataDownloaded
} from './installerHelpers';
import {
  detectLinuxWindowsRuntimes,
  isWindowsPeExecutable,
  resolveEffectiveWindowsExecutable,
  generateLinuxWindowsWrapperScript
} from './windowsRuntime';
import { execSync } from 'node:child_process';

export interface LogAnalyzerDeps {
  auth: AuthController;
  permissions?: PermissionsController | null;
  dataDir: string;
  jdksDir: string;
  getServerRegistry: () => any[];
  upsertServerInRegistry: (server: any) => void;
  canUserAccessServer: (user: StoredUserAccount | null, server: any) => boolean;
  getServerLogs: (serverId: string) => LogEntryLike[];
  detectSteamCmd: () => string | null;
  ensureSteamClientSymlinks: (steamCmdBin?: string | null, srvDir?: string) => void;
  findGameExecutable: (srvDir: string, preferredExec?: string) => string | null;
  getRequiredJdkMajor: (version?: string, javaVersion?: string) => number;
  ensureJdk: (jdksDir: string, major: number) => Promise<string>;
  installMinecraftServer: (
    serverId: string,
    srvDir: string,
    requestedVersion?: string,
    requestedEngine?: string,
    requestedJava?: string,
    requestedPort?: number
  ) => Promise<{ success: boolean; jarPath: string; forgeArgsFile?: string | null; engine: string; version: string; javaMajor: number }>;
  installBedrockServer: (serverId: string, srvDir: string, port?: number) => Promise<boolean>;
  installSteamGameServer: (
    serverId: string,
    srvDir: string,
    steamAppId: number,
    preferredGameId?: string
  ) => Promise<boolean>;
  appendLog: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  recordAuditLog?: (entry: { serverId: string; action: string; user?: string; details: string; severity?: 'info' | 'warning' | 'security' }) => void;
}

export interface LogQuickFixResultItem {
  fixId: LogFixId;
  status: 'fixed' | 'failed';
  message: string;
  filesystemChanges: string[];
}

function readDiskLatestLogLines(srvDir: string, maxLines = 150): LogEntryLike[] {
  const logFile = path.join(srvDir, 'logs', 'latest.log');
  if (!fs.existsSync(logFile)) return [];
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const rawLines = content.split(/\r?\n/).filter(Boolean).slice(-maxLines);
    return rawLines.map((line, idx) => ({
      id: `disk_${idx}`,
      message: line
    }));
  } catch {
    return [];
  }
}

function chmodRecursiveExecutables(dir: string, changed: string[], maxDepth = 3, depth = 0) {
  if (depth > maxDepth || !fs.existsSync(dir)) return;
  try {
    fs.chmodSync(dir, 0o755);
  } catch {}
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'backups', 'world', 'world_nether', 'world_the_end'].includes(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        chmodRecursiveExecutables(full, changed, maxDepth, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        const isExecCandidate =
          lower.endsWith('.sh') ||
          lower.endsWith('.x86_64') ||
          lower.includes('server') ||
          lower.includes('dedicated') ||
          lower === 'srcds_run' ||
          lower === 'srcds_linux' ||
          lower === 'hlds_run' ||
          lower === 'bedrock_server' ||
          lower === 'cs2';
        if (isExecCandidate) {
          try {
            fs.chmodSync(full, 0o755);
            changed.push(`chmod 755 ${path.basename(full)}`);
          } catch {}
        }
      }
    }
  } catch {}
}

export function configureLogAnalyzer(app: Express, deps: LogAnalyzerDeps) {
  const authorize = (req: Request, res: Response, requireWrite: boolean) => {
    const user = deps.auth.getSessionUser(req);
    if (deps.auth.listUsers().length > 0) {
      if (!user) {
        res.status(401).json({ success: false, error: 'Anmeldung erforderlich.' });
        return null;
      }
      if (
        requireWrite &&
        deps.permissions &&
        !deps.permissions.hasPermission(user, 'servers.files') &&
        !deps.permissions.hasPermission(user, 'servers.power')
      ) {
        res.status(403).json({ success: false, error: 'Keine Berechtigung für Log-Quick-Fix auf Dateisystem-Ebene.' });
        return null;
      }
    }
    const server = deps.getServerRegistry().find((s) => s.id === req.params.id);
    if (!server) {
      res.status(404).json({ success: false, error: `Server "${req.params.id}" nicht gefunden.` });
      return null;
    }
    if (user && !deps.canUserAccessServer(user, server)) {
      res.status(403).json({ success: false, error: 'Kein Zugriff auf diesen Server.' });
      return null;
    }
    return { user, server };
  };

  const computePreStartStatus = (server: any) => {
    const srvDir = path.join(deps.dataDir, server.id);
    const isJavaMc = isJavaMinecraftSpec(server);
    const isBedrock = isBedrockSpec(server);

    if (isJavaMc) {
      const engineKey = String(server.minecraftType || server.gameId || 'paper')
        .toLowerCase()
        .replace(/^mc_/, '');
      const primaryJar = getPrimaryJarNameForEngine(engineKey);
      const validJar = [
        primaryJar,
        'paper.jar',
        'purpur.jar',
        'server.jar',
        'fabric-server-launch.jar',
        'quilt-server-launch.jar',
        'neoforge-server.jar',
        'forge-server.jar',
        'spigot.jar',
        'velocity.jar',
        'BungeeCord.jar',
        'Geyser.jar'
      ].find((j) => isValidJarFile(path.join(srvDir, j)));
      const forgeArgs = engineKey.includes('forge') ? findForgeArgsFile(srvDir) : null;
      const ready = Boolean(validJar || forgeArgs);
      return {
        type: 'minecraft_java' as const,
        ready,
        jarFile: validJar || null,
        forgeArgsFile: forgeArgs || null,
        issues: ready ? [] : [`Server-JAR (${primaryJar}) fehlt oder ist beschädigt.`]
      };
    }

    const steamCmdBin = deps.detectSteamCmd();
    const steamCmdCheck = verifySteamCmdInstallation(steamCmdBin);
    const preferredExec = isBedrock ? 'bedrock_server' : server.linuxExecutable;
    const detectedExec = deps.findGameExecutable(srvDir, preferredExec);
    const appId = Number(server.steamAppId || 0);
    const appDataCheck = verifySteamAppDataDownloaded(srvDir, appId, detectedExec);

    return {
      type: isBedrock ? ('minecraft_bedrock' as const) : ('steam_dedicated' as const),
      ready: appDataCheck.ready,
      steamCmd: steamCmdCheck,
      appData: appDataCheck,
      issues: appDataCheck.issues
    };
  };

  const applySingleFix = async (server: any, fixId: LogFixId): Promise<LogQuickFixResultItem> => {
    const srvDir = path.join(deps.dataDir, server.id);
    fs.mkdirSync(srvDir, { recursive: true });
    const changes: string[] = [];
    const isJavaMc = isJavaMinecraftSpec(server);
    const isBedrock = isBedrockSpec(server);

    try {
      if (fixId === 'jarfile_missing') {
        if (isJavaMc) {
          const engineKey = String(server.minecraftType || server.gameId || 'paper')
            .toLowerCase()
            .replace(/^mc_/, '');
          const res = await deps.installMinecraftServer(
            server.id,
            srvDir,
            server.version || '1.21.4',
            engineKey,
            server.javaVersion,
            Number(server.port) || 25565
          );
          const jarBase = path.basename(res.jarPath || getPrimaryJarNameForEngine(engineKey));
          const startSh = path.join(srvDir, 'start.sh');
          const launchLine = res.forgeArgsFile
            ? `exec java -Xmx${server.allocatedRamGb || 4}G -Xms1G @user_jvm_args.txt @${res.forgeArgsFile} nogui`
            : `exec java -Xmx${server.allocatedRamGb || 4}G -Xms1G -jar "${jarBase}" nogui`;
          fs.writeFileSync(startSh, `#!/usr/bin/env bash\ncd "$(dirname "$0")"\n${launchLine}\n`, { mode: 0o755 });
          changes.push(`Server-JAR bereitgestellt: ${jarBase}`, 'start.sh neu geschrieben (chmod 755)');
          server.isInstalled = true;
          delete server.installationError;
          deps.upsertServerInRegistry(server);
        } else {
          // Non-Java server got jarfile_missing -> ensure Steam/Bedrock executable
          const ok = isBedrock
            ? await deps.installBedrockServer(server.id, srvDir, Number(server.port) || 19132)
            : await deps.installSteamGameServer(server.id, srvDir, Number(server.steamAppId || 0), server.gameId);
          if (!ok) throw new Error('Spieldateien konnten nicht neu installiert werden.');
          changes.push('Spieldateien & Executable wiederhergestellt');
        }
        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Server-JAR / Startdateien auf Dateisystem-Ebene repariert.`);
        return { fixId, status: 'fixed', message: 'Server-JAR und Startskript erfolgreich wiederhergestellt.', filesystemChanges: changes };
      }

      if (fixId === 'permission_denied') {
        chmodRecursiveExecutables(srvDir, changes);
        const execPath = deps.findGameExecutable(srvDir, server.linuxExecutable);
        if (execPath && fs.existsSync(execPath)) {
          fs.chmodSync(execPath, 0o755);
          changes.push(`chmod 755 ${path.relative(srvDir, execPath)}`);
        }
        const startSh = path.join(srvDir, 'start.sh');
        if (fs.existsSync(startSh)) {
          fs.chmodSync(startSh, 0o755);
          changes.push('chmod 755 start.sh');
        }
        if (changes.length === 0) {
          fs.chmodSync(srvDir, 0o755);
          changes.push(`chmod 755 ${srvDir}`);
        }
        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Ausführungsrechte (${changes.length} Einträge) auf Dateisystem korrigiert.`);
        return { fixId, status: 'fixed', message: `Ausführungsrechte (chmod 755) für ${changes.length} Datei(en) wiederhergestellt.`, filesystemChanges: changes };
      }

      if (fixId === 'missing_library') {
        const steamCmdBin = deps.detectSteamCmd();
        deps.ensureSteamClientSymlinks(steamCmdBin, srvDir);
        changes.push('steamclient.so Symlinks geprüft/angelegt (~/.steam/sdk64, sdk32 & linux64)');

        // Ensure linux64 directory & start-env helper exist in srvDir
        const linux64Dir = path.join(srvDir, 'linux64');
        fs.mkdirSync(linux64Dir, { recursive: true });
        const envHelper = path.join(srvDir, '.sonora-ld-env.sh');
        fs.writeFileSync(
          envHelper,
          `#!/usr/bin/env bash\nexport LD_LIBRARY_PATH="${linux64Dir}:${srvDir}:$HOME/.steam/sdk64:$HOME/.steam/sdk32:/opt/steamcmd/linux64:/opt/steamcmd/linux32:\${LD_LIBRARY_PATH:-}"\n`,
          { mode: 0o755 }
        );
        changes.push('LD_LIBRARY_PATH-Laufzeitkonfiguration (.sonora-ld-env.sh) geschrieben');

        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Steam-Bibliothekspfade & Symlinks auf Dateisystem repariert.`);
        return { fixId, status: 'fixed', message: 'Laufzeit-Bibliotheken (steamclient.so Symlinks & LD_LIBRARY_PATH) repariert.', filesystemChanges: changes };
      }

      if (fixId === 'windows_exe_on_linux') {
        let runtimes = detectLinuxWindowsRuntimes();
        const winePrefixDir = path.join(srvDir, '.wineprefix');
        fs.mkdirSync(winePrefixDir, { recursive: true });
        changes.push(`Wine-Prefix-Verzeichnis initialisiert (${path.relative(srvDir, winePrefixDir) || '.wineprefix'})`);

        // If running as root on Debian/Ubuntu and neither Wine nor Podman/Docker is installed, try automatic APT setup
        if (runtimes.preferredRuntime === 'none' && process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0) {
          try {
            execSync(
              'dpkg --add-architecture i386 2>/dev/null || true; DEBIAN_FRONTEND=noninteractive apt-get update -qq && (DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wine xvfb || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq podman)',
              { timeout: 120_000, stdio: 'ignore' }
            );
            runtimes = detectLinuxWindowsRuntimes();
            if (runtimes.preferredRuntime !== 'none') {
              changes.push(`Kompatibilitäts-Runtime automatisch installiert: ${runtimes.summary}`);
            }
          } catch {}
        }

        const execPath = deps.findGameExecutable(srvDir, server.linuxExecutable || server.executable);
        const resolvedWin = resolveEffectiveWindowsExecutable(execPath, srvDir);
        const targetWinExe = resolvedWin.targetExePath || (execPath && isWindowsPeExecutable(execPath) ? execPath : null);
        if (targetWinExe) {
          const relExe = path.relative(srvDir, targetWinExe).replace(/\\/g, '/');
          // Remove +x bit from .exe on Linux so /bin/sh never executes MZ binary as a script
          try {
            fs.chmodSync(targetWinExe, 0o644);
            changes.push(`Execute-Bit von Windows-PE entfernt (chmod 644 ${relExe})`);
          } catch {}
          // Rewrite start.sh / run.sh with safe Wine/Podman/Docker wrapper
          const safeWrapper = generateLinuxWindowsWrapperScript(relExe);
          for (const scriptName of ['start.sh', 'run.sh']) {
            const p = path.join(srvDir, scriptName);
            fs.writeFileSync(p, safeWrapper, 'utf8');
            try { fs.chmodSync(p, 0o755); } catch {}
          }
          changes.push(`start.sh & run.sh mit Wine/Podman/Docker-Wrapper für ${relExe} aktualisiert`);
          server.linuxExecutable = relExe;
          server.windowsRuntime = runtimes.preferredRuntime !== 'none' ? runtimes.preferredRuntime : 'auto';
          deps.upsertServerInRegistry(server);
          changes.push(`Windows-Runtime-Profil gesetzt: ${server.windowsRuntime} (${path.basename(targetWinExe)})`);
        }

        if (runtimes.preferredRuntime !== 'none') {
          deps.appendLog(
            server.id,
            'SUCCESS',
            `[LOG-QUICK-FIX:${fixId}:OK] Windows-.exe Laufzeit bereit (${runtimes.summary}) — Server startet jetzt automatisch über ${runtimes.preferredRuntime}.`
          );
          return {
            fixId,
            status: 'fixed',
            message: `Windows-Kompatibilitäts-Runtime aktiv (${runtimes.summary}). Server kann jetzt gestartet werden.`,
            filesystemChanges: changes
          };
        }

        const hint = 'sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine xvfb (oder: sudo apt-get install -y podman)';
        deps.appendLog(server.id, 'WARN', `[WIN-COMPAT] Keine Wine/Podman/Docker-Runtime installiert. Bitte auf dem Host ausführen: ${hint}`);
        return {
          fixId,
          status: 'failed',
          message: `Weder Wine (+Xvfb) noch Podman/Docker auf dem Linux-Host gefunden. Bitte installieren: ${hint}`,
          filesystemChanges: changes
        };
      }

      if (fixId === 'missing_executable' || fixId === 'steam_app_incomplete') {
        const appId = Number(server.steamAppId || 0);
        // Clean interrupted SteamCMD staging downloads & broken appmanifest if StateFlags != 4
        if (appId > 0) {
          const downloadingDir = path.join(srvDir, 'steamapps', 'downloading', String(appId));
          if (fs.existsSync(downloadingDir)) {
            fs.rmSync(downloadingDir, { recursive: true, force: true });
            changes.push(`Unvollständiges Download-Staging entfernt (steamapps/downloading/${appId})`);
          }
          const manifestPath = path.join(srvDir, 'steamapps', `appmanifest_${appId}.acf`);
          if (fs.existsSync(manifestPath)) {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            if (!/"StateFlags"\s+"4"/i.test(raw)) {
              fs.rmSync(manifestPath, { force: true });
              changes.push(`Unvollständiges Manifest appmanifest_${appId}.acf bereinigt`);
            }
          }
        }

        const ok = isBedrock
          ? await deps.installBedrockServer(server.id, srvDir, Number(server.port) || 19132)
          : isJavaMc
          ? Boolean((await deps.installMinecraftServer(server.id, srvDir, server.version, server.minecraftType, server.javaVersion, Number(server.port) || 25565)).success)
          : await deps.installSteamGameServer(server.id, srvDir, appId, server.gameId);

        if (!ok) {
          throw new Error('Automatische Neuinstallation / Verifikation der Spieldateien fehlgeschlagen.');
        }

        const detectedExec = deps.findGameExecutable(srvDir, server.linuxExecutable);
        if (detectedExec) {
          if (process.platform !== 'win32' && isWindowsPeExecutable(detectedExec)) {
            try { fs.chmodSync(detectedExec, 0o644); } catch {}
          } else {
            try { fs.chmodSync(detectedExec, 0o755); } catch {}
          }
          server.linuxExecutable = path.relative(srvDir, detectedExec);
          changes.push(`Executable verifiziert: ${server.linuxExecutable}`);
        }
        deps.ensureSteamClientSymlinks(deps.detectSteamCmd(), srvDir);
        server.isInstalled = true;
        delete server.installationError;
        deps.upsertServerInRegistry(server);

        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Spieldateien & Executable verifiziert und wiederhergestellt.`);
        return {
          fixId,
          status: 'fixed',
          message: 'SteamCMD-/Spieldateien verifiziert und Server-Executable erfolgreich wiederhergestellt.',
          filesystemChanges: changes
        };
      }

      if (fixId === 'eula_not_accepted') {
        const eulaPath = path.join(srvDir, 'eula.txt');
        fs.writeFileSync(eulaPath, '# Accepted via Sonora Log-Analyzer Quick-Fix\neula=true\n', 'utf8');
        changes.push('eula.txt -> eula=true geschrieben');
        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Minecraft EULA (eula.txt) erfolgreich akzeptiert.`);
        return { fixId, status: 'fixed', message: 'eula.txt wurde auf eula=true gesetzt.', filesystemChanges: changes };
      }

      if (fixId === 'java_version_mismatch') {
        const targetMajor = Math.max(21, deps.getRequiredJdkMajor(server.version, server.javaVersion));
        await deps.ensureJdk(deps.jdksDir, targetMajor);
        server.javaVersion = `Java ${targetMajor}`;
        deps.upsertServerInRegistry(server);
        changes.push(`Portables OpenJDK ${targetMajor} bereitgestellt & zugewiesen`);
        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Kompatibles Java ${targetMajor} bereitgestellt.`);
        return { fixId, status: 'fixed', message: `Kompatible Java-Laufzeit (Java ${targetMajor}) bereitgestellt.`, filesystemChanges: changes };
      }

      if (fixId === 'port_in_use') {
        // Remove stale session.lock files in world folders & re-sync server.properties port
        for (const worldDir of ['world', 'world_nether', 'world_the_end']) {
          const lockPath = path.join(srvDir, worldDir, 'session.lock');
          if (fs.existsSync(lockPath)) {
            try {
              fs.rmSync(lockPath, { force: true });
              changes.push(`Veraltete Lock-Datei entfernt: ${worldDir}/session.lock`);
            } catch {}
          }
        }
        const safePort = Number(server.port) || 25565;
        if (isJavaMc) {
          ensureServerPropertiesPort(srvDir, safePort, server.name, server.maxPlayers);
          changes.push(`server.properties auf Port ${safePort} synchronisiert`);
        }
        deps.appendLog(server.id, 'SUCCESS', `[LOG-QUICK-FIX:${fixId}:OK] Port-Konfiguration & Lock-Dateien bereinigt (Port ${safePort}).`);
        return { fixId, status: 'fixed', message: `Lock-Dateien bereinigt und Port-Konfiguration (${safePort}) synchronisiert.`, filesystemChanges: changes };
      }

      return { fixId, status: 'failed', message: `Unbekannter Fix-Typ: ${fixId}`, filesystemChanges: [] };
    } catch (err: any) {
      deps.appendLog(server.id, 'ERROR', `[LOG-QUICK-FIX] Fehler bei ${fixId}: ${err?.message || err}`);
      return { fixId, status: 'failed', message: err?.message || 'Reparatur fehlgeschlagen', filesystemChanges: changes };
    }
  };

  // GET /api/servers/:id/log-analysis — Real-time console & disk log analysis + Pre-Start integrity check
  app.get('/api/servers/:id/log-analysis', (req, res) => {
    const ctx = authorize(req, res, false);
    if (!ctx) return;

    const srvDir = path.join(deps.dataDir, ctx.server.id);
    const liveLogs = deps.getServerLogs(ctx.server.id) || [];
    const combinedLogs = liveLogs.length > 0 ? liveLogs : readDiskLatestLogLines(srvDir);
    const issues: DetectedLogIssue[] = analyzeConsoleLogs(combinedLogs);
    const preStartStatus = computePreStartStatus(ctx.server);

    res.json({
      success: true,
      serverId: ctx.server.id,
      analyzedLineCount: combinedLogs.length,
      issues,
      preStartStatus,
      analyzedAt: new Date().toISOString()
    });
  });

  // POST /api/servers/:id/log-analysis/quick-fix — Execute targeted filesystem Quick-Fix
  app.post('/api/servers/:id/log-analysis/quick-fix', async (req, res) => {
    const ctx = authorize(req, res, true);
    if (!ctx) return;

    const requestedFixIds: LogFixId[] = [];
    if (typeof req.body?.fixId === 'string' && req.body.fixId.trim()) {
      requestedFixIds.push(req.body.fixId.trim() as LogFixId);
    } else if (Array.isArray(req.body?.fixIds) && req.body.fixIds.length > 0) {
      for (const id of req.body.fixIds) {
        if (typeof id === 'string' && id.trim()) requestedFixIds.push(id.trim() as LogFixId);
      }
    } else {
      const liveLogs = deps.getServerLogs(ctx.server.id) || [];
      const detected = analyzeConsoleLogs(liveLogs);
      for (const issue of detected) {
        requestedFixIds.push(issue.fixId);
      }
    }

    const uniqueFixIds = Array.from(new Set(requestedFixIds));
    if (uniqueFixIds.length === 0) {
      return res.json({
        success: true,
        results: [],
        message: 'Keine behebbaren Konsolenfehler gefunden.',
        preStartStatus: computePreStartStatus(ctx.server)
      });
    }

    const results: LogQuickFixResultItem[] = [];
    for (const fixId of uniqueFixIds) {
      const item = await applySingleFix(ctx.server, fixId);
      results.push(item);
    }

    if (results.every((r) => r.status === 'fixed') && uniqueFixIds.length > 1) {
      deps.appendLog(ctx.server.id, 'SUCCESS', `[LOG-QUICK-FIX:ALL:OK] Alle ${results.length} erkannten Probleme erfolgreich auf Dateisystem-Ebene behoben.`);
    }

    deps.recordAuditLog?.({
      serverId: ctx.server.id,
      action: 'quick_fix',
      user: ctx.user?.username || 'Admin',
      details: `Log-Analyzer Quick-Fix ausgeführt (${uniqueFixIds.join(', ')}): ${results.filter((r) => r.status === 'fixed').length}/${results.length} behoben`,
      severity: 'info'
    });

    const refreshedServer = deps.getServerRegistry().find((s) => s.id === ctx.server.id) || ctx.server;
    const updatedLogs = deps.getServerLogs(ctx.server.id) || [];
    const remainingIssues = analyzeConsoleLogs(updatedLogs);

    res.json({
      success: results.every((r) => r.status === 'fixed'),
      results,
      remainingIssues,
      preStartStatus: computePreStartStatus(refreshedServer),
      server: refreshedServer
    });
  });

  return {
    computePreStartStatus,
    applySingleFix
  };
}
