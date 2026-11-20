export type LogFixId =
  | 'jarfile_missing'
  | 'permission_denied'
  | 'missing_library'
  | 'missing_executable'
  | 'steam_app_incomplete'
  | 'eula_not_accepted'
  | 'java_version_mismatch'
  | 'port_in_use';

export type LogIssueSeverity = 'critical' | 'warning';

export interface LogEntryLike {
  id?: string;
  timestamp?: string;
  level?: string;
  message: string;
}

export interface DetectedLogIssue {
  id: string;
  fixId: LogFixId;
  title: string;
  severity: LogIssueSeverity;
  category: 'filesystem' | 'permissions' | 'libraries' | 'steamcmd' | 'runtime' | 'network';
  description: string;
  filesystemAction: string;
  fixLabel: string;
  matchedLine: string;
  matchedTimestamp?: string;
  occurrences: number;
}

interface LogPatternRule {
  fixId: LogFixId;
  title: string;
  severity: LogIssueSeverity;
  category: DetectedLogIssue['category'];
  description: string;
  filesystemAction: string;
  fixLabel: string;
  patterns: RegExp[];
}

export const LOG_ERROR_RULES: LogPatternRule[] = [
  {
    fixId: 'jarfile_missing',
    title: 'Server-JAR nicht gefunden oder beschädigt',
    severity: 'critical',
    category: 'filesystem',
    description:
      'Java konnte die Server-JAR (z. B. paper.jar, server.jar) nicht öffnen oder die Datei fehlt / ist unvollständig.',
    filesystemAction:
      'Lädt die verifizierte Server-JAR neu herunter, prüft die Integrität auf dem Dateisystem und aktualisiert start.sh.',
    fixLabel: 'Quick-Fix: JAR & Startskript reparieren',
    patterns: [
      /unable to access jarfile/i,
      /invalid or corrupt jarfile/i,
      /error:\s*could not find or load main class/i,
      /keine gültige server-jar/i,
      /jar_missing/i
    ]
  },
  {
    fixId: 'permission_denied',
    title: 'Fehlende Ausführungsrechte (Permission denied)',
    severity: 'critical',
    category: 'permissions',
    description:
      'Das Betriebssystem hat den Start oder Dateizugriff blockiert, weil dem Server-Binary oder Skript die Ausführungsrechte (+x) fehlen.',
    filesystemAction:
      'Setzt chmod 755 rekursiv auf Server-Binaries, Startskripte (.sh / .x86_64) und prüft Verzeichnis-Schreibrechte.',
    fixLabel: 'Quick-Fix: Dateirechte (chmod +x) setzen',
    patterns: [
      /permission denied/i,
      /\beacces\b/i,
      /cannot execute\b/i,
      /operation not permitted/i,
      /ist nicht ausführbar/i
    ]
  },
  {
    fixId: 'missing_library',
    title: 'Fehlende Laufzeit-Bibliothek (Shared Library / steamclient.so)',
    severity: 'critical',
    category: 'libraries',
    description:
      'Eine benötigte Linux-Bibliothek (z. B. steamclient.so, lib32gcc, libstdc++.so) konnte beim Start nicht geladen werden.',
    filesystemAction:
      'Legt fehlende steamclient.so-Symlinks in ~/.steam/sdk64, ~/.steam/sdk32 und server/linux64 an und konfiguriert LD_LIBRARY_PATH.',
    fixLabel: 'Quick-Fix: Bibliotheken & Symlinks reparieren',
    patterns: [
      /missing library/i,
      /error while loading shared libraries/i,
      /cannot open shared object file/i,
      /dlopen failed trying to load/i,
      /unable to locate steamclient\.so/i,
      /steamclient\.so.*no such file/i,
      /lib32gcc|libstdc\+\+\.so.*not found/i
    ]
  },
  {
    fixId: 'steam_app_incomplete',
    title: 'SteamCMD / Spiel-App-Daten unvollständig',
    severity: 'critical',
    category: 'steamcmd',
    description:
      'Die SteamCMD-Installation oder der App-Download (appmanifest / Spieldateien) wurde nicht vollständig abgeschlossen.',
    filesystemAction:
      'Bereinigt unvollständige Steam-Download-Fragmente, verifiziert SteamCMD & appmanifest StateFlags und stellt die Spieldateien wieder her.',
    fixLabel: 'Quick-Fix: Steam-App-Daten verifizieren',
    patterns: [
      /steam_app_incomplete/i,
      /steamapi_init\(\)\s*failed/i,
      /app state.*not fully installed/i,
      /appmanifest_.*unvollständig/i,
      /steamcmd.*fehlgeschlagen/i,
      /failed to install app/i,
      /missing configuration.*steam/i
    ]
  },
  {
    fixId: 'missing_executable',
    title: 'Fehlende Server-Executable im Verzeichnis',
    severity: 'critical',
    category: 'filesystem',
    description:
      'Die konfigurierte Startdatei bzw. Server-Binary existiert nicht im Instanzverzeichnis oder der Pfad stimmt nicht überein.',
    filesystemAction:
      'Prüft das Serververzeichnis auf vorhandene Binaries, installiert fehlende Spieldateien neu und korrigiert den Startpfad.',
    fixLabel: 'Quick-Fix: Executable wiederherstellen',
    patterns: [
      /exec_missing/i,
      /keine ausführbare.*datei/i,
      /spawn\s+\S+\s+enoent/i,
      /\bno such file or directory\b.*(\.sh|\.x86_64|server|dedicated|srcds|palserver|rustdedicated|valheim|bedrock)/i,
      /command not found.*(server|srcds|palserver|rustdedicated|valheim)/i
    ]
  },
  {
    fixId: 'eula_not_accepted',
    title: 'Minecraft EULA nicht akzeptiert',
    severity: 'warning',
    category: 'filesystem',
    description:
      'Der Server wurde beendet, weil eula=true in der Datei eula.txt noch nicht gesetzt ist.',
    filesystemAction:
      'Schreibt eula=true direkt in die eula.txt im Serververzeichnis.',
    fixLabel: 'Quick-Fix: eula.txt akzeptieren',
    patterns: [
      /you need to agree to the eula/i,
      /failed to load eula\.txt/i,
      /eula=false/i
    ]
  },
  {
    fixId: 'java_version_mismatch',
    title: 'Inkompatible Java-Version erkannt',
    severity: 'critical',
    category: 'runtime',
    description:
      'Die geladene Server-JAR oder ein Plugin benötigt eine neuere Java-Laufzeitumgebung (z. B. Java 21 oder Java 25).',
    filesystemAction:
      'Stellt das passende portable OpenJDK bereit und aktualisiert die konfigurierte Java-Version der Server-Instanz.',
    fixLabel: 'Quick-Fix: Passendes JDK bereitstellen',
    patterns: [
      /unsupportedclassversionerror/i,
      /has been compiled by a more recent version of the java runtime/i,
      /requires java \d+/i
    ]
  },
  {
    fixId: 'port_in_use',
    title: 'Port bereits belegt (Bind-Fehler)',
    severity: 'warning',
    category: 'network',
    description:
      'Der konfigurierte Server-Port konnte nicht gebunden werden, da er bereits durch einen anderen Prozess belegt ist oder eine veraltete Lock-Datei existiert.',
    filesystemAction:
      'Entfernt verwaiste Lock-Dateien (z. B. session.lock) und synchronisiert server.properties mit einem freien Instanz-Port.',
    fixLabel: 'Quick-Fix: Lock bereinigen & Port prüfen',
    patterns: [
      /failed to bind to port/i,
      /address already in use/i,
      /java\.net\.bindexception/i,
      /perhaps a server is already running on that port/i
    ]
  }
];

/**
 * Real-time log analyzer used both client-side (instant zero-latency console banner)
 * and server-side (GET /api/servers/:id/log-analysis).
 * Scans the most recent log lines so resolved historical errors that happened before
 * a clean restart/fix are naturally superseded when newer logs clear or fix them.
 */
export function analyzeConsoleLogs(entries: LogEntryLike[], maxRecentLines = 250): DetectedLogIssue[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const slice = entries.slice(-maxRecentLines);

  // Track last quick-fix completion index per fixId so already-fixed alerts disappear immediately in real time
  const lastFixedIndex = new Map<string, number>();
  let lastGlobalFixIndex = -1;
  let lastHealthyStartIndex = -1;

  for (let i = 0; i < slice.length; i++) {
    const msg = String(slice[i]?.message || '');
    const fixMarker = msg.match(/\[LOG-QUICK-FIX:([a-z_]+):OK\]/i);
    if (fixMarker) {
      lastFixedIndex.set(fixMarker[1].toLowerCase(), i);
    }
    if (/\[LOG-QUICK-FIX:ALL:OK\]/i.test(msg)) {
      lastGlobalFixIndex = i;
    }
    if (/\[READY\]|Done \([0-9.]+s\)! For help|Server ist online und bereit/i.test(msg)) {
      lastHealthyStartIndex = i;
    }
  }

  const found = new Map<LogFixId, DetectedLogIssue>();

  for (let i = 0; i < slice.length; i++) {
    const entry = slice[i];
    const msg = String(entry?.message || '').trim();
    if (!msg) continue;

    // Skip our own quick-fix confirmation messages to prevent self-triggering
    if (msg.includes('[LOG-QUICK-FIX') || msg.includes('[QUICK-FIX]')) continue;

    for (const rule of LOG_ERROR_RULES) {
      const clearedAt = Math.max(lastGlobalFixIndex, lastFixedIndex.get(rule.fixId) ?? -1, lastHealthyStartIndex);
      if (i <= clearedAt) continue;

      if (rule.patterns.some((rx) => rx.test(msg))) {
        const existing = found.get(rule.fixId);
        if (existing) {
          existing.occurrences += 1;
          existing.matchedLine = msg;
          existing.matchedTimestamp = entry?.timestamp;
        } else {
          found.set(rule.fixId, {
            id: `log_${rule.fixId}`,
            fixId: rule.fixId,
            title: rule.title,
            severity: rule.severity,
            category: rule.category,
            description: rule.description,
            filesystemAction: rule.filesystemAction,
            fixLabel: rule.fixLabel,
            matchedLine: msg,
            matchedTimestamp: entry?.timestamp,
            occurrences: 1
          });
        }
      }
    }
  }

  return Array.from(found.values()).sort((a, b) => {
    if (a.severity === b.severity) return b.occurrences - a.occurrences;
    return a.severity === 'critical' ? -1 : 1;
  });
}
