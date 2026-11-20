import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Express, Request, Response } from 'express';
import type { AuthController, StoredUserAccount } from './auth';
import type { PermissionsController } from './permissions';
import type { FirewallController } from './firewall';
import {
  isJavaMinecraftSpec,
  isBedrockSpec,
  isValidJarFile,
  findForgeArgsFile,
  getPrimaryJarNameForEngine,
  ensureServerPropertiesPort,
  searchExecutableRecursive
} from './installerHelpers';

export type DiagnosticSeverity = 'ok' | 'warning' | 'error';
export type DiagnosticCategory = 'files' | 'dependencies' | 'startup' | 'installation' | 'network';

export interface DiagnosticCheck {
  id: string;
  category: DiagnosticCategory;
  title: string;
  status: DiagnosticSeverity;
  message: string;
  details: string;
  filePath?: string;
  fixable: boolean;
  fixActionLabel?: string;
}

export interface ServerDiagnosticReport {
  serverId: string;
  serverName: string;
  engineLabel: string;
  category: string;
  scannedAt: string;
  overallStatus: 'healthy' | 'warning' | 'critical';
  installationStatus: 'installing' | 'installed' | 'failed';
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    autoFixableCount: number;
  };
  checks: DiagnosticCheck[];
}

export interface QuickFixActionResult {
  checkId: string;
  title: string;
  status: 'fixed' | 'skipped' | 'failed';
  message: string;
}

export interface ServerDiagnosticsDeps {
  auth: AuthController;
  permissions?: PermissionsController | null;
  firewall?: FirewallController | null;
  dataDir: string;
  jdksDir: string;
  getServerRegistry: () => any[];
  upsertServerInRegistry: (server: any) => void;
  canUserAccessServer: (user: StoredUserAccount | null, server: any) => boolean;
  getRequiredJdkMajor: (version?: string, javaVersion?: string) => number;
  ensureJdk: (jdksDir: string, major: number, onProgress?: (pct: number, msg: string) => void) => Promise<string>;
  findGameExecutable: (srvDir: string, preferredExec?: string) => string | null;
  installMinecraftServer: (
    serverId: string,
    srvDir: string,
    requestedVersion?: string,
    requestedEngine?: string,
    requestedJava?: string,
    requestedPort?: number
  ) => Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; forgeArgsFile?: string | null; engine: string; version: string; javaMajor: number }>;
  installBedrockServer: (serverId: string, srvDir: string, port?: number) => Promise<boolean>;
  installSteamGameServer: (
    serverId: string,
    srvDir: string,
    gameSpec: { name: string; gameId?: string; steamAppId?: number; executable?: string; category?: string }
  ) => Promise<{ success: boolean; method: string; executablePath?: string; message?: string }>;
  setInstallProgress?: (serverId: string, percent: number, stage: string, message: string) => void;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  recordAuditLog?: (entry: { serverId: string; action: string; user?: string; details: string; severity?: 'info' | 'warning' | 'security' }) => void;
}

export interface ServerDiagnosticsController {
  scanServer: (server: any) => ServerDiagnosticReport;
  runQuickFix: (
    server: any,
    options?: { issueIds?: string[]; actorUsername?: string }
  ) => Promise<{
    success: boolean;
    actionsTaken: QuickFixActionResult[];
    report: ServerDiagnosticReport;
    server: any;
  }>;
}

function commandExists(cmd: string): boolean {
  try {
    const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(probe, { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function isFileExecutable(filePath: string): boolean {
  if (process.platform === 'win32') return true;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getEngineKey(server: any): string {
  return String(server.minecraftType || server.gameId || 'paper')
    .toLowerCase()
    .replace(/^mc_/, '')
    .trim();
}

function detectEngineLabel(server: any): string {
  if (isBedrockSpec(server)) return 'Minecraft Bedrock (C++)';
  if (isJavaMinecraftSpec(server)) {
    const eng = getEngineKey(server);
    return `Minecraft Java (${eng.toUpperCase()} ${server.version || 'latest'})`;
  }
  return `${server.gameName || server.gameId || 'Dedicated Server'} (${server.category || 'steam'})`;
}

export function configureServerDiagnostics(
  app: Express,
  deps: ServerDiagnosticsDeps
): ServerDiagnosticsController {
  const resolveServerDir = (serverId: string) => path.join(deps.dataDir, serverId);

  const scanServer = (server: any): ServerDiagnosticReport => {
    const srvDir = resolveServerDir(server.id);
    const checks: DiagnosticCheck[] = [];
    const isJavaMc = isJavaMinecraftSpec(server);
    const isBedrock = isBedrockSpec(server);
    const engineKey = getEngineKey(server);
    const dirExists = fs.existsSync(srvDir);

    // 1. Server Directory & Write Permissions
    if (!dirExists) {
      checks.push({
        id: 'server_directory',
        category: 'files',
        title: 'Server-Verzeichnis',
        status: 'error',
        message: 'Das Server-Verzeichnis existiert noch nicht auf dem Datenträger.',
        details: `Erwarteter Pfad: ${srvDir}`,
        filePath: srvDir,
        fixable: true,
        fixActionLabel: 'Verzeichnis anlegen'
      });
    } else {
      let writable = true;
      try {
        fs.accessSync(srvDir, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        writable = false;
      }
      checks.push({
        id: 'server_directory',
        category: 'files',
        title: 'Server-Verzeichnis & Schreibrechte',
        status: writable ? 'ok' : 'error',
        message: writable
          ? 'Server-Verzeichnis vorhanden und beschreibbar.'
          : 'Fehlende Lese-/Schreibrechte im Server-Verzeichnis.',
        details: `Pfad: ${srvDir}`,
        filePath: srvDir,
        fixable: !writable,
        fixActionLabel: !writable ? 'Rechte korrigieren' : undefined
      });
    }

    // 2. Core Game Binaries / JAR Verification
    let coreBinaryHealthy = false;
    let detectedExecPath: string | null = null;

    if (isJavaMc) {
      const primaryJarName = getPrimaryJarNameForEngine(engineKey);
      const candidateJars = Array.from(
        new Set([
          primaryJarName,
          'paper.jar',
          'purpur.jar',
          'spigot.jar',
          'fabric-server-launch.jar',
          'quilt-server-launch.jar',
          'neoforge-server.jar',
          'forge-server.jar',
          'velocity.jar',
          'BungeeCord.jar',
          'Geyser.jar',
          'server.jar'
        ])
      );
      const validJar = dirExists
        ? candidateJars.find(name => isValidJarFile(path.join(srvDir, name)))
        : undefined;
      const forgeArgsRel = dirExists && (engineKey.includes('forge')) ? findForgeArgsFile(srvDir) : null;

      // Detect accidentally extracted JAR contents (root cause of "Unable to access jarfile paper.jar")
      const hasExtractedJarResidue =
        dirExists &&
        !validJar &&
        !forgeArgsRel &&
        (fs.existsSync(path.join(srvDir, 'META-INF', 'MANIFEST.MF')) ||
          fs.existsSync(path.join(srvDir, 'io', 'papermc')));

      if (validJar || forgeArgsRel) {
        coreBinaryHealthy = true;
        const artifactRel = forgeArgsRel || validJar!;
        const statSizeMb = validJar
          ? (fs.statSync(path.join(srvDir, validJar)).size / (1024 * 1024)).toFixed(1)
          : null;
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Server-Engine & ausführbare JAR',
          status: 'ok',
          message: forgeArgsRel
            ? `Forge/NeoForge Start-Profil gefunden (${forgeArgsRel}).`
            : `Gültige Server-JAR verifiziert (${validJar}${statSizeMb ? `, ${statSizeMb} MB` : ''}).`,
          details: 'Archiv-Header (PK\\x03\\x04) und Dateigröße sind intakt.',
          filePath: artifactRel,
          fixable: false
        });
      } else {
        const corruptJarExists = dirExists && fs.existsSync(path.join(srvDir, primaryJarName));
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Server-Engine & ausführbare JAR',
          status: 'error',
          message: hasExtractedJarResidue
            ? `JAR-Datei "${primaryJarName}" fehlt — es wurden fälschlich entpackte .class/META-INF-Dateien erkannt.`
            : corruptJarExists
              ? `Datei "${primaryJarName}" ist beschädigt oder unvollständig (keine gültige JAR).`
              : `Erforderliche Server-JAR "${primaryJarName}" fehlt im Server-Verzeichnis.`,
          details: 'Quick-Fix lädt die offizielle Server-Engine neu herunter und prüft das Artefakt vor dem Speichern.',
          filePath: primaryJarName,
          fixable: true,
          fixActionLabel: 'Server-JAR reparieren'
        });
      }

      // 3A. Java Runtime Dependency Check
      const requiredMajor = deps.getRequiredJdkMajor(server.version, server.javaVersion);
      const portableJavaBin = path.join(
        deps.jdksDir,
        `jdk-${requiredMajor}`,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java'
      );
      const hasPortableJdk = fs.existsSync(portableJavaBin);
      const hasSystemJava = commandExists('java');

      if (hasPortableJdk) {
        checks.push({
          id: 'runtime_dependency',
          category: 'dependencies',
          title: `Java-Laufzeitumgebung (JDK ${requiredMajor})`,
          status: 'ok',
          message: `Portables JDK ${requiredMajor} ist installiert und einsatzbereit.`,
          details: `Binary: ${portableJavaBin}`,
          filePath: portableJavaBin,
          fixable: false
        });
      } else if (hasSystemJava) {
        checks.push({
          id: 'runtime_dependency',
          category: 'dependencies',
          title: `Java-Laufzeitumgebung (JDK ${requiredMajor})`,
          status: 'warning',
          message: `Portables JDK ${requiredMajor} fehlt — System-Java wird als Fallback genutzt.`,
          details: 'Für optimale Kompatibilität kann Quick-Fix das passende portable JDK automatisch einrichten.',
          filePath: portableJavaBin,
          fixable: true,
          fixActionLabel: `JDK ${requiredMajor} installieren`
        });
      } else {
        checks.push({
          id: 'runtime_dependency',
          category: 'dependencies',
          title: `Java-Laufzeitumgebung (JDK ${requiredMajor})`,
          status: 'error',
          message: `Weder portables JDK ${requiredMajor} noch System-Java gefunden.`,
          details: 'Ohne Java-Laufzeitumgebung kann der Minecraft-Server nicht gestartet werden.',
          filePath: portableJavaBin,
          fixable: true,
          fixActionLabel: `JDK ${requiredMajor} installieren`
        });
      }

      // 3B. Forge / NeoForge JVM args check
      if (engineKey.includes('forge')) {
        const jvmArgsPath = path.join(srvDir, 'user_jvm_args.txt');
        const hasJvmArgs = dirExists && fs.existsSync(jvmArgsPath);
        checks.push({
          id: 'forge_jvm_args',
          category: 'startup',
          title: 'Forge/NeoForge JVM-Argumente',
          status: hasJvmArgs ? 'ok' : 'warning',
          message: hasJvmArgs
            ? 'user_jvm_args.txt ist vorhanden und konfiguriert.'
            : 'user_jvm_args.txt fehlt — RAM-Limits für Forge/NeoForge sind nicht hinterlegt.',
          details: `Konfiguriertes RAM-Limit: ${server.allocatedRamGb || 4} GB`,
          filePath: 'user_jvm_args.txt',
          fixable: !hasJvmArgs,
          fixActionLabel: !hasJvmArgs ? 'JVM-Args erzeugen' : undefined
        });
      }

      // 4A. EULA Check (skip proxies velocity/bungeecord/geyser)
      const isProxy = ['velocity', 'bungeecord', 'geyser'].includes(engineKey);
      if (!isProxy) {
        const eulaPath = path.join(srvDir, 'eula.txt');
        const eulaContent = dirExists && fs.existsSync(eulaPath) ? fs.readFileSync(eulaPath, 'utf8') : '';
        const eulaAccepted = /^\s*eula\s*=\s*true\s*$/im.test(eulaContent);
        checks.push({
          id: 'minecraft_eula',
          category: 'startup',
          title: 'Minecraft EULA-Zustimmung',
          status: eulaAccepted ? 'ok' : 'error',
          message: eulaAccepted
            ? 'eula.txt vorhanden und akzeptiert (eula=true).'
            : 'eula.txt fehlt oder enthält nicht eula=true — Server bricht beim Start sofort ab.',
          details: 'Ohne akzeptierte EULA beendet sich jeder Minecraft-Server direkt nach dem Start.',
          filePath: 'eula.txt',
          fixable: !eulaAccepted,
          fixActionLabel: !eulaAccepted ? 'EULA akzeptieren' : undefined
        });

        // 4B. server.properties & Port Sync Check
        const propsPath = path.join(srvDir, 'server.properties');
        const propsExists = dirExists && fs.existsSync(propsPath);
        const propsText = propsExists ? fs.readFileSync(propsPath, 'utf8') : '';
        const portMatch = propsText.match(/^server-port\s*=\s*(\d+)/m);
        const configuredPort = Number(server.port) || 25565;
        const filePort = portMatch ? Number(portMatch[1]) : null;

        if (!propsExists) {
          checks.push({
            id: 'server_properties',
            category: 'startup',
            title: 'Start-Konfiguration (server.properties)',
            status: 'warning',
            message: 'server.properties fehlt im Server-Verzeichnis.',
            details: `Sollte auf Port ${configuredPort} und max. ${server.maxPlayers || 20} Spieler konfiguriert werden.`,
            filePath: 'server.properties',
            fixable: true,
            fixActionLabel: 'Konfiguration erzeugen'
          });
        } else if (filePort !== configuredPort) {
          checks.push({
            id: 'server_properties',
            category: 'startup',
            title: 'Start-Konfiguration (server.properties)',
            status: 'warning',
            message: `Port-Abweichung erkannt: server.properties nutzt Port ${filePort ?? 'unbekannt'}, Panel erwartet Port ${configuredPort}.`,
            details: 'Eine Port-Abweichung führt dazu, dass Spieler den Server nicht über die angezeigte Adresse erreichen.',
            filePath: 'server.properties',
            fixable: true,
            fixActionLabel: `Port auf ${configuredPort} angleichen`
          });
        } else {
          checks.push({
            id: 'server_properties',
            category: 'startup',
            title: 'Start-Konfiguration (server.properties)',
            status: 'ok',
            message: `server.properties synchronisiert (server-port=${configuredPort}).`,
            details: 'Konfigurationsdatei ist lesbar und stimmt mit dem zugewiesenen Server-Port überein.',
            filePath: 'server.properties',
            fixable: false
          });
        }
      }
    } else if (isBedrock) {
      // Minecraft Bedrock Dedicated Server
      const bedrockBinName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
      const bedrockBinPath = path.join(srvDir, bedrockBinName);
      const binExists = dirExists && fs.existsSync(bedrockBinPath);
      detectedExecPath = binExists ? bedrockBinPath : null;

      if (!binExists) {
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Bedrock Server-Binary',
          status: 'error',
          message: `Bedrock-Executable "${bedrockBinName}" nicht gefunden.`,
          details: 'Quick-Fix richtet die Bedrock Dedicated Server-Dateien neu ein.',
          filePath: bedrockBinName,
          fixable: true,
          fixActionLabel: 'Bedrock installieren'
        });
      } else if (!isFileExecutable(bedrockBinPath)) {
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Bedrock Server-Binary & Ausführungsrechte',
          status: 'error',
          message: `"${bedrockBinName}" vorhanden, aber nicht ausführbar (chmod +x fehlt).`,
          details: 'Ohne Ausführungsrechte schlägt der Start mit EACCES fehl.',
          filePath: bedrockBinName,
          fixable: true,
          fixActionLabel: 'Ausführungsrechte setzen'
        });
      } else {
        coreBinaryHealthy = true;
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Bedrock Server-Binary',
          status: 'ok',
          message: `"${bedrockBinName}" vorhanden und ausführbar.`,
          details: `Pfad: ${bedrockBinPath}`,
          filePath: bedrockBinName,
          fixable: false
        });
      }

      const propsPath = path.join(srvDir, 'server.properties');
      const propsExists = dirExists && fs.existsSync(propsPath);
      checks.push({
        id: 'server_properties',
        category: 'startup',
        title: 'Bedrock server.properties',
        status: propsExists ? 'ok' : 'warning',
        message: propsExists
          ? `server.properties vorhanden (UDP-Port ${server.port || 19132}).`
          : 'server.properties fehlt im Bedrock-Verzeichnis.',
        details: 'Definiert server-port, gamemode und max-players für Bedrock-Clients.',
        filePath: 'server.properties',
        fixable: !propsExists,
        fixActionLabel: !propsExists ? 'Konfiguration anlegen' : undefined
      });
    } else {
      // Steam / Dedicated Games
      const preferredExec = server.executable || undefined;
      const foundExec = dirExists
        ? deps.findGameExecutable(srvDir, preferredExec) ||
          (preferredExec ? searchExecutableRecursive(srvDir, [preferredExec]) : null)
        : null;
      detectedExecPath = foundExec;

      if (!foundExec) {
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Dedicated Server-Binary',
          status: 'error',
          message: `Keine ausführbare Spiel-Binary für ${server.gameName || server.gameId || 'Server'} gefunden.`,
          details: server.steamAppId
            ? `Erwartete Steam AppID: ${server.steamAppId}${preferredExec ? ` · Binary: ${preferredExec}` : ''}`
            : 'Quick-Fix startet die erneute Einrichtung der Spieldateien.',
          filePath: preferredExec || srvDir,
          fixable: true,
          fixActionLabel: 'Spieldateien reparieren'
        });
      } else if (!isFileExecutable(foundExec)) {
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Dedicated Server-Binary & Rechte',
          status: 'error',
          message: `Binary "${path.basename(foundExec)}" gefunden, aber nicht ausführbar (chmod +x fehlt).`,
          details: `Pfad: ${path.relative(srvDir, foundExec)}`,
          filePath: path.relative(srvDir, foundExec),
          fixable: true,
          fixActionLabel: 'Ausführungsrechte setzen'
        });
      } else {
        coreBinaryHealthy = true;
        checks.push({
          id: 'core_game_binary',
          category: 'files',
          title: 'Dedicated Server-Binary',
          status: 'ok',
          message: `Ausführbare Spiel-Binary verifiziert (${path.basename(foundExec)}).`,
          details: `Relativer Pfad: ${path.relative(srvDir, foundExec)}`,
          filePath: path.relative(srvDir, foundExec),
          fixable: false
        });
      }

      // SteamCMD dependency check
      if (server.steamAppId) {
        const hasSteamCmd = commandExists('steamcmd') || fs.existsSync('/usr/games/steamcmd');
        checks.push({
          id: 'runtime_dependency',
          category: 'dependencies',
          title: 'SteamCMD Abhängigkeit',
          status: hasSteamCmd ? 'ok' : coreBinaryHealthy ? 'warning' : 'error',
          message: hasSteamCmd
            ? 'SteamCMD ist auf dem Host verfügbar.'
            : coreBinaryHealthy
              ? 'SteamCMD nicht im PATH — lokale Spieldateien sind jedoch vorhanden.'
              : 'SteamCMD nicht installiert — automatische Steam-Downloads erfordern SteamCMD.',
          details: `Steam AppID: ${server.steamAppId}`,
          fixable: false
        });
      }
    }

    // 5. Start-Skripte (start.sh / start.bat)
    const startScriptName = process.platform === 'win32' ? 'start.bat' : 'start.sh';
    const startScriptPath = path.join(srvDir, startScriptName);
    const scriptExists = dirExists && fs.existsSync(startScriptPath);
    const scriptExecOk = scriptExists && isFileExecutable(startScriptPath);

    if (!scriptExists) {
      checks.push({
        id: 'startup_scripts',
        category: 'startup',
        title: `Start-Skript (${startScriptName})`,
        status: 'warning',
        message: `${startScriptName} fehlt im Server-Verzeichnis.`,
        details: 'Quick-Fix erzeugt saubere Start-Skripte (start.sh & start.bat) passend zur Server-Engine.',
        filePath: startScriptName,
        fixable: true,
        fixActionLabel: 'Start-Skript erzeugen'
      });
    } else if (!scriptExecOk) {
      checks.push({
        id: 'startup_scripts',
        category: 'startup',
        title: `Start-Skript (${startScriptName})`,
        status: 'warning',
        message: `${startScriptName} besitzt keine Ausführungsrechte (chmod +x).`,
        details: 'Quick-Fix setzt die Ausführungsrechte auf 0755.',
        filePath: startScriptName,
        fixable: true,
        fixActionLabel: 'Rechte reparieren'
      });
    } else {
      checks.push({
        id: 'startup_scripts',
        category: 'startup',
        title: `Start-Skript (${startScriptName})`,
        status: 'ok',
        message: `${startScriptName} vorhanden und startbereit.`,
        details: 'Direktstart über Shell und Manager-Daemon ist korrekt vorbereitet.',
        filePath: startScriptName,
        fixable: false
      });
    }

    // 6. Port Conflicts & Firewall Rules
    const allServers = deps.getServerRegistry();
    const myPort = Number(server.port) || 25565;
    const conflictingServer = allServers.find(
      s => s.id !== server.id && Number(s.port) === myPort
    );
    const fwRules = deps.firewall?.listRules().filter(r => r.serverId === server.id) || [];
    const hasFirewallCoverage = !deps.firewall || fwRules.length > 0;

    if (conflictingServer) {
      checks.push({
        id: 'network_ports',
        category: 'network',
        title: 'Port-Konflikt & Firewall-Freigabe',
        status: 'error',
        message: `Port-Konflikt: Port ${myPort} wird bereits von "${conflictingServer.name}" genutzt.`,
        details: 'Bitte einen eindeutigen Port in den Netzwerkeinstellungen vergeben oder den anderen Server anpassen.',
        fixable: false
      });
    } else if (!hasFirewallCoverage) {
      checks.push({
        id: 'network_ports',
        category: 'network',
        title: 'Port-Konflikt & Firewall-Freigabe',
        status: 'warning',
        message: `Port ${myPort} ist konfliktfrei, aber noch nicht in der verwalteten Firewall freigegeben.`,
        details: 'Quick-Fix trägt die benötigten TCP/UDP-Regeln automatisch in der Firewall ein.',
        fixable: true,
        fixActionLabel: 'Ports freigeben'
      });
    } else {
      checks.push({
        id: 'network_ports',
        category: 'network',
        title: 'Port-Konflikt & Firewall-Freigabe',
        status: 'ok',
        message: `Port ${myPort} ist konfliktfrei${fwRules.length > 0 ? ` (${fwRules.length} Firewall-Regeln aktiv)` : ''}.`,
        details: `Zugewiesener Game-Port: ${myPort}${server.queryPort ? ` · Query-Port: ${server.queryPort}` : ''}`,
        fixable: false
      });
    }

    // 7. Installation Registry Status Consistency
    const currentInstallStatus: 'installing' | 'installed' | 'failed' =
      server.installationStatus === 'failed'
        ? 'failed'
        : server.installationStatus === 'installing'
          ? 'installing'
          : 'installed';

    if (currentInstallStatus === 'failed' || server.installationError) {
      checks.push({
        id: 'installation_status',
        category: 'installation',
        title: 'Installationsstatus (Registry)',
        status: 'error',
        message: coreBinaryHealthy
          ? 'Installationsstatus steht auf "Fehlgeschlagen", obwohl die Spieldateien bereits vorhanden sind.'
          : `Installation als fehlgeschlagen markiert: ${server.installationError || 'Unbekannter Installationsfehler'}`,
        details: 'Quick-Fix behebt fehlende Dateien und setzt den Installationsstatus sauber auf "Installiert".',
        fixable: true,
        fixActionLabel: 'Status korrigieren'
      });
    } else if (currentInstallStatus === 'installing' && coreBinaryHealthy) {
      checks.push({
        id: 'installation_status',
        category: 'installation',
        title: 'Installationsstatus (Registry)',
        status: 'warning',
        message: 'Installationsstatus hängt im Zustand "Installiert...", obwohl die Server-Dateien vollständig sind.',
        details: 'Quick-Fix schließt den hängenden Installationsstatus sauber ab.',
        fixable: true,
        fixActionLabel: 'Status abschließen'
      });
    } else if (!coreBinaryHealthy && currentInstallStatus === 'installed') {
      checks.push({
        id: 'installation_status',
        category: 'installation',
        title: 'Installationsstatus (Registry)',
        status: 'warning',
        message: 'Server ist als "Installiert" markiert, es fehlen jedoch ausführbare Spieldateien.',
        details: 'Quick-Fix installiert die fehlenden Spieldateien und synchronisiert den Status.',
        fixable: true,
        fixActionLabel: 'Installation reparieren'
      });
    } else {
      checks.push({
        id: 'installation_status',
        category: 'installation',
        title: 'Installationsstatus (Registry)',
        status: 'ok',
        message: 'Installationsstatus ist konsistent (Installiert & startbereit).',
        details: detectedExecPath
          ? `Aktive Binary: ${path.basename(detectedExecPath)}`
          : 'Alle Kernkomponenten stimmen mit dem Registry-Status überein.',
        fixable: false
      });
    }

    const passed = checks.filter(c => c.status === 'ok').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const errors = checks.filter(c => c.status === 'error').length;
    const autoFixableCount = checks.filter(c => c.status !== 'ok' && c.fixable).length;
    const overallStatus: 'healthy' | 'warning' | 'critical' =
      errors > 0 ? 'critical' : warnings > 0 ? 'warning' : 'healthy';

    return {
      serverId: server.id,
      serverName: server.name || server.id,
      engineLabel: detectEngineLabel(server),
      category: server.category || 'minecraft',
      scannedAt: new Date().toISOString(),
      overallStatus,
      installationStatus: currentInstallStatus,
      summary: {
        total: checks.length,
        passed,
        warnings,
        errors,
        autoFixableCount
      },
      checks
    };
  };

  const runQuickFix = async (
    server: any,
    options: { issueIds?: string[]; actorUsername?: string } = {}
  ) => {
    const srvDir = resolveServerDir(server.id);
    const initialReport = scanServer(server);
    const targetIds = options.issueIds && options.issueIds.length > 0
      ? new Set(options.issueIds)
      : null;

    const shouldFix = (id: string) => {
      const item = initialReport.checks.find(c => c.id === id);
      if (!item || item.status === 'ok' || !item.fixable) return false;
      return !targetIds || targetIds.has(id);
    };

    const actionsTaken: QuickFixActionResult[] = [];
    const isJavaMc = isJavaMinecraftSpec(server);
    const isBedrock = isBedrockSpec(server);
    const engineKey = getEngineKey(server);

    deps.appendLog?.(server.id, 'INFO', `[DIAGNOSE QUICK-FIX] Starte automatische Reparatur (${targetIds ? `${targetIds.size} Zielpunkte` : 'vollständiger Quick-Fix'})...`);

    // 1. Directory & Permissions
    if (shouldFix('server_directory') || !fs.existsSync(srvDir)) {
      try {
        fs.mkdirSync(srvDir, { recursive: true });
        if (process.platform !== 'win32') {
          try { fs.chmodSync(srvDir, 0o755); } catch {}
        }
        actionsTaken.push({
          checkId: 'server_directory',
          title: 'Server-Verzeichnis',
          status: 'fixed',
          message: `Verzeichnis "${srvDir}" erstellt und Schreibrechte überprüft.`
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'server_directory',
          title: 'Server-Verzeichnis',
          status: 'failed',
          message: `Konnte Verzeichnis nicht anlegen: ${err.message}`
        });
      }
    }

    // 2. Runtime Dependency (Portable JDK for Java Minecraft)
    if (isJavaMc && shouldFix('runtime_dependency')) {
      const requiredMajor = deps.getRequiredJdkMajor(server.version, server.javaVersion);
      try {
        const javaBin = await deps.ensureJdk(deps.jdksDir, requiredMajor);
        actionsTaken.push({
          checkId: 'runtime_dependency',
          title: `Java-Laufzeitumgebung (JDK ${requiredMajor})`,
          status: 'fixed',
          message: `Portables JDK ${requiredMajor} eingerichtet (${javaBin}).`
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'runtime_dependency',
          title: `Java-Laufzeitumgebung (JDK ${requiredMajor})`,
          status: 'failed',
          message: `JDK-Download fehlgeschlagen: ${err.message}`
        });
      }
    }

    // 3. Core Game Binaries / JARs
    if (shouldFix('core_game_binary')) {
      if (isJavaMc) {
        try {
          const res = await deps.installMinecraftServer(
            server.id,
            srvDir,
            server.version,
            engineKey || 'paper',
            server.javaVersion,
            Number(server.port) || 25565
          );
          actionsTaken.push({
            checkId: 'core_game_binary',
            title: 'Server-Engine & ausführbare JAR',
            status: 'fixed',
            message: `${res.engine.toUpperCase()} (${res.version}, ${res.fileSizeMb} MB) neu installiert und verifiziert.`
          });
        } catch (err: any) {
          actionsTaken.push({
            checkId: 'core_game_binary',
            title: 'Server-Engine & ausführbare JAR',
            status: 'failed',
            message: `JAR-Reparatur fehlgeschlagen: ${err.message}`
          });
        }
      } else if (isBedrock) {
        const binName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
        const binPath = path.join(srvDir, binName);
        if (fs.existsSync(binPath) && !isFileExecutable(binPath)) {
          try {
            fs.chmodSync(binPath, 0o755);
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Bedrock Server-Binary',
              status: 'fixed',
              message: `Ausführungsrechte (chmod +x) für ${binName} gesetzt.`
            });
          } catch (err: any) {
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Bedrock Server-Binary',
              status: 'failed',
              message: `Rechte-Reparatur fehlgeschlagen: ${err.message}`
            });
          }
        } else {
          try {
            const ok = await deps.installBedrockServer(server.id, srvDir, Number(server.port) || 19132);
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Bedrock Server-Binary',
              status: ok ? 'fixed' : 'failed',
              message: ok
                ? 'Bedrock Dedicated Server neu eingerichtet.'
                : 'Bedrock-Installation konnte nicht abgeschlossen werden.'
            });
          } catch (err: any) {
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Bedrock Server-Binary',
              status: 'failed',
              message: `Bedrock-Reparatur fehlgeschlagen: ${err.message}`
            });
          }
        }
      } else {
        const existingExec = deps.findGameExecutable(srvDir, server.executable);
        if (existingExec && !isFileExecutable(existingExec)) {
          try {
            fs.chmodSync(existingExec, 0o755);
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Dedicated Server-Binary',
              status: 'fixed',
              message: `Ausführungsrechte (chmod +x) für ${path.basename(existingExec)} gesetzt.`
            });
          } catch (err: any) {
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Dedicated Server-Binary',
              status: 'failed',
              message: `Rechte-Reparatur fehlgeschlagen: ${err.message}`
            });
          }
        } else {
          try {
            const res = await deps.installSteamGameServer(server.id, srvDir, {
              name: server.gameName || server.name,
              gameId: server.gameId,
              steamAppId: server.steamAppId,
              executable: server.executable,
              category: server.category
            });
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Dedicated Server-Binary',
              status: res.success ? 'fixed' : 'failed',
              message: res.success
                ? `Spieldateien über ${res.method} repariert.`
                : res.message || 'Dedicated-Server-Installation fehlgeschlagen.'
            });
          } catch (err: any) {
            actionsTaken.push({
              checkId: 'core_game_binary',
              title: 'Dedicated Server-Binary',
              status: 'failed',
              message: `Steam/Dedicated-Reparatur fehlgeschlagen: ${err.message}`
            });
          }
        }
      }
    }

    // 4. EULA
    if (isJavaMc && shouldFix('minecraft_eula')) {
      try {
        fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Accepted via Sonora Diagnostics Quick-Fix\neula=true\n', 'utf8');
        actionsTaken.push({
          checkId: 'minecraft_eula',
          title: 'Minecraft EULA-Zustimmung',
          status: 'fixed',
          message: 'eula.txt auf eula=true gesetzt.'
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'minecraft_eula',
          title: 'Minecraft EULA-Zustimmung',
          status: 'failed',
          message: `Konnte eula.txt nicht schreiben: ${err.message}`
        });
      }
    }

    // 5. server.properties & Port Sync
    if ((isJavaMc || isBedrock) && shouldFix('server_properties')) {
      try {
        if (isJavaMc) {
          ensureServerPropertiesPort(
            srvDir,
            Number(server.port) || 25565,
            server.name || 'Sonora Minecraft Server',
            Number(server.maxPlayers) || 20
          );
        } else {
          const propsPath = path.join(srvDir, 'server.properties');
          const bedrockPort = Number(server.port) || 19132;
          fs.writeFileSync(
            propsPath,
            `server-name=${server.name || 'Sonora Bedrock Server'}\ngamemode=survival\ndifficulty=normal\nmax-players=${Number(server.maxPlayers) || 20}\nserver-port=${bedrockPort}\nserver-portv6=${bedrockPort + 1}\n`,
            'utf8'
          );
        }
        actionsTaken.push({
          checkId: 'server_properties',
          title: 'Start-Konfiguration (server.properties)',
          status: 'fixed',
          message: `server.properties auf Port ${Number(server.port) || (isBedrock ? 19132 : 25565)} synchronisiert.`
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'server_properties',
          title: 'Start-Konfiguration (server.properties)',
          status: 'failed',
          message: `Konnte server.properties nicht korrigieren: ${err.message}`
        });
      }
    }

    // 6. Forge/NeoForge user_jvm_args.txt
    if (isJavaMc && engineKey.includes('forge') && shouldFix('forge_jvm_args')) {
      try {
        const ramGb = Math.max(1, Number(server.allocatedRamGb) || 4);
        fs.writeFileSync(
          path.join(srvDir, 'user_jvm_args.txt'),
          `# Sonora Diagnostics Quick-Fix JVM Flags\n-Xms1G\n-Xmx${ramGb}G\n-XX:+UseG1GC\n-XX:+ParallelRefProcEnabled\n`,
          'utf8'
        );
        actionsTaken.push({
          checkId: 'forge_jvm_args',
          title: 'Forge/NeoForge JVM-Argumente',
          status: 'fixed',
          message: `user_jvm_args.txt mit -Xmx${ramGb}G erstellt.`
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'forge_jvm_args',
          title: 'Forge/NeoForge JVM-Argumente',
          status: 'failed',
          message: `Konnte user_jvm_args.txt nicht erstellen: ${err.message}`
        });
      }
    }

    // 7. Start-Skripte (start.sh / run.sh / start.bat)
    if (shouldFix('startup_scripts')) {
      try {
        const ramGb = Math.max(1, Number(server.allocatedRamGb) || 4);
        let shCmd = 'echo "Keine ausführbare Server-Datei gefunden" && exit 1';
        let batCmd = 'echo Keine ausfuehrbare Server-Datei gefunden & exit /b 1';

        if (isJavaMc) {
          const requiredMajor = deps.getRequiredJdkMajor(server.version, server.javaVersion);
          const portableJavaHome = path.join(deps.jdksDir, `jdk-${requiredMajor}`);
          const portableJavaSh = path.join(portableJavaHome, 'bin', 'java');
          const javaBin = fs.existsSync(portableJavaSh) ? portableJavaSh : 'java';
          const primaryJar = getPrimaryJarNameForEngine(engineKey);
          const targetJar = isValidJarFile(path.join(srvDir, primaryJar)) ? primaryJar : 'server.jar';
          const forgeArgs = engineKey.includes('forge') ? findForgeArgsFile(srvDir) : null;

          shCmd = forgeArgs
            ? `exec "${javaBin}" @user_jvm_args.txt "@${forgeArgs}" nogui "$@"`
            : `exec "${javaBin}" -Xms1G -Xmx${ramGb}G -XX:+UseG1GC -jar "${targetJar}" nogui "$@"`;
          batCmd = forgeArgs
            ? `java @user_jvm_args.txt "@${forgeArgs.replace(/\//g, '\\')}" nogui %*`
            : `java -Xms1G -Xmx${ramGb}G -XX:+UseG1GC -jar "${targetJar}" nogui %*`;
        } else if (isBedrock) {
          shCmd = 'LD_LIBRARY_PATH=. exec ./bedrock_server "$@"';
          batCmd = 'bedrock_server.exe %*';
        } else {
          const execPath = deps.findGameExecutable(srvDir, server.executable);
          if (execPath) {
            const relExec = path.relative(srvDir, execPath).replace(/\\/g, '/');
            shCmd = `exec "./${relExec}" "$@"`;
            batCmd = `"${relExec.replace(/\//g, '\\')}" %*`;
          }
        }

        const startSh = `#!/usr/bin/env bash\n# Generated by Sonora Server Diagnostics Quick-Fix\nset -euo pipefail\ncd "$(dirname "$0")"\n${shCmd}\n`;
        const startBat = `@echo off\r\nREM Generated by Sonora Server Diagnostics Quick-Fix\r\ncd /d "%~dp0"\r\n${batCmd}\r\n`;

        for (const name of ['start.sh', 'run.sh']) {
          const p = path.join(srvDir, name);
          fs.writeFileSync(p, startSh, 'utf8');
          if (process.platform !== 'win32') {
            try { fs.chmodSync(p, 0o755); } catch {}
          }
        }
        fs.writeFileSync(path.join(srvDir, 'start.bat'), startBat, 'utf8');
        fs.writeFileSync(path.join(srvDir, 'run.bat'), startBat, 'utf8');

        actionsTaken.push({
          checkId: 'startup_scripts',
          title: 'Start-Skripte',
          status: 'fixed',
          message: 'start.sh, run.sh und start.bat neu generiert und ausführbar gemacht.'
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'startup_scripts',
          title: 'Start-Skripte',
          status: 'failed',
          message: `Konnte Start-Skripte nicht erzeugen: ${err.message}`
        });
      }
    }

    // 8. Firewall Ports
    if (shouldFix('network_ports') && deps.firewall) {
      try {
        const opened = deps.firewall.openPortsForServer(server);
        actionsTaken.push({
          checkId: 'network_ports',
          title: 'Firewall-Port-Freigabe',
          status: 'fixed',
          message: `${opened.length} Firewall-Regel(n) für Server-Ports synchronisiert.`
        });
      } catch (err: any) {
        actionsTaken.push({
          checkId: 'network_ports',
          title: 'Firewall-Port-Freigabe',
          status: 'failed',
          message: `Firewall-Synchronisierung fehlgeschlagen: ${err.message}`
        });
      }
    }

    // 9. Re-scan filesystem & correct installationStatus in registry if binaries are healthy
    const midScan = scanServer(server);
    const binaryNowOk = midScan.checks.find(c => c.id === 'core_game_binary')?.status === 'ok';
    let updatedServer = { ...server };

    if (
      binaryNowOk &&
      (shouldFix('installation_status') ||
        server.installationStatus === 'failed' ||
        server.installationStatus === 'installing' ||
        Boolean(server.installationError))
    ) {
      updatedServer = {
        ...server,
        installationStatus: 'installed',
        installationError: undefined,
        installProgress: {
          percent: 100,
          stage: 'done',
          message: 'Installationsstatus durch Diagnose Quick-Fix verifiziert & korrigiert.',
          updatedAt: new Date().toISOString()
        }
      };
      deps.upsertServerInRegistry(updatedServer);
      deps.setInstallProgress?.(server.id, 100, 'done', 'Installationsstatus erfolgreich korrigiert.');
      actionsTaken.push({
        checkId: 'installation_status',
        title: 'Installationsstatus (Registry)',
        status: 'fixed',
        message: 'Installationsstatus erfolgreich auf "Installiert" zurückgesetzt und Fehlerstatus bereinigt.'
      });
    } else if (shouldFix('installation_status') && !binaryNowOk) {
      actionsTaken.push({
        checkId: 'installation_status',
        title: 'Installationsstatus (Registry)',
        status: 'failed',
        message: 'Installationsstatus bleibt fehlerhaft, da die Kern-Spieldatei noch nicht hergestellt werden konnte.'
      });
    }

    const finalReport = scanServer(updatedServer);
    const fixedCount = actionsTaken.filter(a => a.status === 'fixed').length;
    const failedCount = actionsTaken.filter(a => a.status === 'failed').length;

    deps.appendLog?.(
      server.id,
      failedCount === 0 ? 'SUCCESS' : 'WARN',
      `[DIAGNOSE QUICK-FIX] Abgeschlossen: ${fixedCount} behoben, ${failedCount} fehlgeschlagen. Neuer Status: ${finalReport.overallStatus.toUpperCase()}.`
    );

    deps.recordAuditLog?.({
      serverId: server.id,
      action: 'diagnostics_quick_fix',
      user: options.actorUsername || 'system',
      details: `Server-Diagnose Quick-Fix ausgeführt (${fixedCount} behoben, ${failedCount} fehlgeschlagen, Status: ${finalReport.overallStatus}).`,
      severity: failedCount > 0 ? 'warning' : 'info'
    });

    return {
      success: failedCount === 0,
      actionsTaken,
      report: finalReport,
      server: updatedServer
    };
  };

  // Helper: Auth + Ownership verification for server diagnostics endpoints
  const resolveAuthorizedServer = (req: Request, res: Response, requireWrite = false): { server: any; user: StoredUserAccount | null } | null => {
    const hasUsers = deps.auth.listUsers().length > 0;
    const user = deps.auth.getSessionUser(req);
    if (hasUsers && !user) {
      res.status(401).json({ success: false, error: 'Nicht autorisiert. Bitte anmelden.' });
      return null;
    }

    const srv = deps.getServerRegistry().find(s => s.id === req.params.id);
    if (!srv) {
      res.status(404).json({ success: false, error: 'Serverinstanz nicht gefunden.' });
      return null;
    }

    if (user && !deps.canUserAccessServer(user, srv)) {
      res.status(403).json({ success: false, error: 'Kein Zugriff auf diese Serverinstanz.' });
      return null;
    }

    if (requireWrite && user && deps.permissions) {
      const canRepair =
        deps.permissions.hasPermission(user, 'servers.files') ||
        deps.permissions.hasPermission(user, 'servers.power') ||
        deps.permissions.hasPermission(user, 'admin.all_servers');
      if (!canRepair) {
        res.status(403).json({
          success: false,
          error: 'Fehlende Berechtigung für Server-Reparatur (servers.files oder servers.power).'
        });
        return null;
      }
    }

    return { server: srv, user };
  };

  app.get('/api/servers/:id/diagnostics', (req: Request, res: Response) => {
    const resolved = resolveAuthorizedServer(req, res, false);
    if (!resolved) return;
    const report = scanServer(resolved.server);
    res.json({ success: true, report });
  });

  app.post('/api/servers/:id/diagnostics/scan', (req: Request, res: Response) => {
    const resolved = resolveAuthorizedServer(req, res, false);
    if (!resolved) return;
    const report = scanServer(resolved.server);
    res.json({ success: true, report });
  });

  app.post('/api/servers/:id/diagnostics/quick-fix', async (req: Request, res: Response) => {
    const resolved = resolveAuthorizedServer(req, res, true);
    if (!resolved) return;

    const issueIds = Array.isArray(req.body?.issueIds)
      ? req.body.issueIds.map((x: any) => String(x))
      : undefined;

    try {
      const result = await runQuickFix(resolved.server, {
        issueIds,
        actorUsername: resolved.user?.username || 'system'
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Quick-Fix fehlgeschlagen: ${err.message}`
      });
    }
  });

  return {
    scanServer,
    runQuickFix
  };
}
