with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace signature and start of installMinecraftServer
old_func_sig = """async function installMinecraftServer(
  serverId: string,
  srvDir: string,
  requestedVersion?: string,
  requestedEngine?: string
): Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; engine: string; version: string }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien...`);"""

new_func_sig = """async function installMinecraftServer(
  serverId: string,
  srvDir: string,
  requestedVersion?: string,
  requestedEngine?: string,
  requestedJava?: string
): Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; engine: string; version: string; javaMajor: number }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien & Java-Laufzeit...`);
  setInstallProgress(serverId, 10, 'init', 'Bereite Serververzeichnis vor...');"""

content = content.replace(old_func_sig, new_func_sig)

# Update before downloading jar
old_dl_prep = """  appendLog(serverId, 'INFO', `[ENGINE] Gewählte Server-Engine: ${engine.toUpperCase()} | Zielversion: ${targetVer}`);"""
new_dl_prep = """  appendLog(serverId, 'INFO', `[ENGINE] Gewählte Server-Engine: ${engine.toUpperCase()} | Zielversion: ${targetVer}`);
  setInstallProgress(serverId, 25, 'download_jar', `Lade Server-JAR (${engine.toUpperCase()} ${targetVer})...`);"""
content = content.replace(old_dl_prep, new_dl_prep)

# Update end of installMinecraftServer to download portable JDK
old_func_end = """  const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] Server-JAR (${fileSizeMb} MB, Build: ${buildNum}) erfolgreich gespeichert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt. Der Minecraft-Server (${engine.toUpperCase()} ${targetVer}) ist nun 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return { success: true, build: buildNum, fileSizeMb, jarPath: primaryPath, engine, version: targetVer };
}"""

new_func_end = """  const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] Server-JAR (${fileSizeMb} MB, Build: ${buildNum}) erfolgreich gespeichert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt.`);
  setInstallProgress(serverId, 50, 'jar_ready', `Server-JAR (${fileSizeMb} MB) erfolgreich gespeichert.`);

  // --- AUTOMATIC PORTABLE JAVA INSTALLATION ---
  const jdkMajor = getRequiredJdkMajor(targetVer, requestedJava);
  setInstallProgress(serverId, 55, 'check_java', `Prüfe portables Java (JDK ${jdkMajor}) für ${engine.toUpperCase()} ${targetVer}...`);
  appendLog(serverId, 'INFO', `[JAVA RUNTIME] Prüfe portables Java (JDK ${jdkMajor}) in .runtime/jdks...`);

  const portableJavaHome = path.join(JDKS_DIR, `jdk-${jdkMajor}`);
  const portableJavaBin = path.join(portableJavaHome, 'bin', 'java');

  if (fs.existsSync(portableJavaBin)) {
    setInstallProgress(serverId, 90, 'java_ready', `Portables JDK ${jdkMajor} ist bereits einsatzbereit.`);
    appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} bereits vorhanden (${portableJavaBin}).`);
  } else {
    setInstallProgress(serverId, 60, 'download_java', `Lade portables JDK ${jdkMajor} für Linux x64 herunter...`);
    appendLog(serverId, 'INFO', `[JAVA RUNTIME] Lade portables OpenJDK ${jdkMajor} herunter und richte es ein...`);
    try {
      await ensureJdk(JDKS_DIR, jdkMajor);
      setInstallProgress(serverId, 90, 'java_ready', `Portables JDK ${jdkMajor} erfolgreich eingerichtet & verifiziert.`);
      appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} erfolgreich eingerichtet: ${portableJavaBin}`);
    } catch (jdkErr: any) {
      appendLog(serverId, 'WARN', `[JAVA HINWEIS] Portables JDK ${jdkMajor} Download-Hinweis: ${jdkErr.message}. Fallback auf Host-Java.`);
    }
  }

  setInstallProgress(serverId, 100, 'done', `Gameserver (${engine.toUpperCase()} ${targetVer}) und Java ${jdkMajor} sind startbereit!`);
  appendLog(serverId, 'SUCCESS', `[FERTIG] Instanz vollständig eingerichtet und 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return { success: true, build: buildNum, fileSizeMb, jarPath: primaryPath, engine, version: targetVer, javaMajor: jdkMajor };
}"""

content = content.replace(old_func_end, new_func_end)

# Update app.post('/api/servers/create') call
old_create_inst = """        const engineType = server.minecraftType || (server.gameId && server.gameId.startsWith('mc_') ? server.gameId.replace('mc_', '') : 'paper');
        installResult = await installMinecraftServer(serverId, srvDir, server.version, engineType);"""

new_create_inst = """        const engineType = server.minecraftType || (server.gameId && server.gameId.startsWith('mc_') ? server.gameId.replace('mc_', '') : 'paper');
        installResult = await installMinecraftServer(serverId, srvDir, server.version, engineType, server.javaVersion);"""
content = content.replace(old_create_inst, new_create_inst)

# Update app.post('/api/servers/:id/install') call
old_manual_inst = """      const targetEngine = minecraftType || engine || 'paper';
      const result = await installMinecraftServer(serverId, srvDir, version, targetEngine);"""

new_manual_inst = """      const targetEngine = minecraftType || engine || 'paper';
      const currentServers = getServerRegistry();
      const currentSrv = currentServers.find(s => s.id === serverId);
      const reqJava = req.body.javaVersion || currentSrv?.javaVersion;
      const result = await installMinecraftServer(serverId, srvDir, version, targetEngine, reqJava);"""
content = content.replace(old_manual_inst, new_manual_inst)

# Update power start logic
old_power_java = """      // Check Java on host
      const javaCheck = await detectJava();
      if (!javaCheck.installed) {
        appendLog(serverId, 'ERROR', `========================================================================`);
        appendLog(serverId, 'ERROR', `[KRITISCHER FEHLER] Java Runtime (JDK/JRE) ist auf dem Host NICHT installiert!`);
        appendLog(serverId, 'WARN',  `Um Minecraft ausführen zu können, installiere Java 21 auf deinem Ubuntu-Server:`);
        appendLog(serverId, 'INFO',  `> Befehl: sudo apt update && sudo apt install -y openjdk-21-jre-headless`);
        appendLog(serverId, 'ERROR', `========================================================================`);
        return res.status(400).json({
          success: false,
          error: 'Java 21 ist auf diesem Dedicated Server nicht installiert.',
          solution: 'sudo apt update && sudo apt install -y openjdk-21-jre-headless',
          code: 'JAVA_MISSING'
        });
      }

      // Check for JAR file - AUTO-INSTALL IF MISSING!
      const potentialJars = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar'];
      let foundJar = potentialJars.find(j => fs.existsSync(path.join(srvDir, j)));

      if (!foundJar) {
        const mcEngine = minecraftType || 'paper';
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte sofortige automatische Installation (${mcEngine.toUpperCase()})...`);
        try {
          const autoRes = await installMinecraftServer(serverId, srvDir, version, mcEngine);
          foundJar = path.basename(autoRes.jarPath) || 'server.jar';
        } catch (downloadErr: any) {
          appendLog(serverId, 'ERROR', `Automatischer Download fehlgeschlagen: ${downloadErr.message}`);
          return res.status(400).json({
            success: false,
            error: `Keine Server-JAR gefunden und automatischer Download fehlgeschlagen: ${downloadErr.message}`,
            dir: srvDir,
            code: 'JAR_MISSING'
          });
        }
      }

      // Spawn Java process
      try {
        appendLog(serverId, 'INFO', `Führe aus: java -Xmx${ramGb}G -Xms1G -jar ${foundJar} nogui`);
        const child = spawn('java', [
          `-Xmx${ramGb}G`,
          `-Xms1G`,
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-jar',
          foundJar,
          'nogui'
        ], {
          cwd: srvDir,
          env: { ...process.env }
        });"""

new_power_java = """      // 1. Resolve Portable Java JDK
      const currentRegistry = getServerRegistry();
      const currentSrv = currentRegistry.find(s => s.id === serverId);
      const chosenJava = currentSrv?.javaVersion || req.body.javaVersion;
      const jdkMajor = getRequiredJdkMajor(version, chosenJava);
      const portableJavaHome = path.join(JDKS_DIR, `jdk-${jdkMajor}`);
      let javaBin = 'java';
      let runtimeEnv: Record<string, string> = { ...process.env };

      if (fs.existsSync(path.join(portableJavaHome, 'bin', 'java'))) {
        javaBin = path.join(portableJavaHome, 'bin', 'java');
        runtimeEnv.JAVA_HOME = portableJavaHome;
        runtimeEnv.PATH = `${path.join(portableJavaHome, 'bin')}:${process.env.PATH || ''}`;
        appendLog(serverId, 'INFO', `[JAVA RUNTIME] Verwende portables JDK ${jdkMajor}: ${javaBin}`);
      } else {
        appendLog(serverId, 'INFO', `[JAVA RUNTIME] Portables JDK ${jdkMajor} wird für den Start bereitgestellt...`);
        try {
          const installedPath = await ensureJdk(JDKS_DIR, jdkMajor);
          javaBin = installedPath;
          runtimeEnv.JAVA_HOME = portableJavaHome;
          runtimeEnv.PATH = `${path.join(portableJavaHome, 'bin')}:${process.env.PATH || ''}`;
          appendLog(serverId, 'SUCCESS', `[JAVA RUNTIME] Portables JDK ${jdkMajor} einsatzbereit: ${javaBin}`);
        } catch (jdkErr: any) {
          appendLog(serverId, 'WARN', `Portables JDK ${jdkMajor} nicht verfügbar (${jdkErr.message}). Prüfe Host-Java...`);
          const javaCheck = await detectJava();
          if (javaCheck.installed) {
            javaBin = 'java';
            appendLog(serverId, 'INFO', `Verwende Host-Java (${javaCheck.version}).`);
          } else {
            appendLog(serverId, 'ERROR', `Weder portables JDK ${jdkMajor} noch Host-Java ist verfügbar.`);
            return res.status(400).json({
              success: false,
              error: `Portables JDK ${jdkMajor} konnte nicht geladen werden (${jdkErr.message}) und Host-Java ist nicht installiert.`,
              code: 'JAVA_MISSING'
            });
          }
        }
      }

      // 2. Check for JAR file - AUTO-INSTALL IF MISSING!
      const potentialJars = ['paper.jar', 'server.jar', 'purpur.jar', 'fabric-server-launch.jar', 'neoforge-server.jar', 'forge-server.jar', 'spigot.jar'];
      let foundJar = potentialJars.find(j => fs.existsSync(path.join(srvDir, j)));

      if (!foundJar) {
        const mcEngine = minecraftType || 'paper';
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte sofortige automatische Installation (${mcEngine.toUpperCase()})...`);
        try {
          const autoRes = await installMinecraftServer(serverId, srvDir, version, mcEngine, chosenJava);
          foundJar = path.basename(autoRes.jarPath) || 'server.jar';
        } catch (downloadErr: any) {
          appendLog(serverId, 'ERROR', `Automatischer Download fehlgeschlagen: ${downloadErr.message}`);
          return res.status(400).json({
            success: false,
            error: `Keine Server-JAR gefunden und automatischer Download fehlgeschlagen: ${downloadErr.message}`,
            dir: srvDir,
            code: 'JAR_MISSING'
          });
        }
      }

      // Spawn Java process
      try {
        appendLog(serverId, 'INFO', `Führe aus: ${javaBin} -Xmx${ramGb}G -Xms1G -jar ${foundJar} nogui`);
        const child = spawn(javaBin, [
          `-Xmx${ramGb}G`,
          `-Xms1G`,
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-jar',
          foundJar,
          'nogui'
        ], {
          cwd: srvDir,
          env: runtimeEnv
        });"""

content = content.replace(old_power_java, new_power_java)

# Add new endpoints before app.use(express.static(...))
new_endpoints = """
// --- PORTABLE JAVA ENDPOINTS ---
app.get('/api/java/versions', (_req, res) => {
  try {
    const list = JDK_VERSIONS.map(major => {
      const javaBin = path.join(JDKS_DIR, `jdk-${major}`, 'bin', 'java');
      const isInstalled = fs.existsSync(javaBin);
      return {
        major,
        available: true,
        installed: isInstalled,
        version: `${major}.0`
      };
    });
    res.json({ success: true, versions: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/servers/:id/java', async (req, res) => {
  const serverId = req.params.id;
  const { javaVersion } = req.body;
  if (!javaVersion) return res.status(400).json({ error: 'javaVersion erforderlich' });
  const major = getRequiredJdkMajor(undefined, javaVersion);
  if (activeProcesses.has(serverId)) {
    return res.status(409).json({ error: 'Server läuft. Vor dem JDK-Wechsel bitte stoppen.' });
  }
  appendLog(serverId, 'INFO', `[JAVA] Richte ${javaVersion} (JDK ${major}) ein...`);
  try {
    await ensureJdk(JDKS_DIR, major);
    const servers = getServerRegistry();
    const idx = servers.findIndex(s => s.id === serverId);
    if (idx >= 0) {
      servers[idx].javaVersion = `Java ${major}`;
      saveServerRegistry(servers);
    }
    appendLog(serverId, 'SUCCESS', `[JAVA] ${javaVersion} erfolgreich als Standard für diese Instanz gesetzt.`);
    res.json({ success: true, javaVersion: `Java ${major}` });
  } catch (err: any) {
    appendLog(serverId, 'ERROR', `[JAVA FEHLER] Konnte JDK ${major} nicht einrichten: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- INSTALLATION PROGRESS ENDPOINT ---
app.get('/api/servers/:id/install/progress', (req, res) => {
  const serverId = req.params.id;
  const progress = installProgressMap.get(serverId) || {
    serverId,
    percent: 100,
    step: 'idle',
    message: 'Bereit',
    timestamp: Date.now()
  };
  res.json({ success: true, progress });
});
"""

if "/api/java/versions" not in content:
    target_marker = "app.use(express.static(path.resolve(__dirname, 'dist')));"
    if target_marker in content:
        content = content.replace(target_marker, new_endpoints + "\n    " + target_marker)
    else:
        content += "\n" + new_endpoints

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 2 applied successfully!')
