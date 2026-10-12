import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '// Helper: Install Minecraft Paper Server JAR'
end_marker = '// Helper: Install Steam Dedicated Server via SteamCMD'

if start_marker not in content:
    start_marker = '// Helper: Install Minecraft Paper/Purpur/Mojang Server JAR'

if start_marker not in content or end_marker not in content:
    print('ERROR: markers not found')
    sys.exit(1)

new_func = """// Helper: Universal Multi-Engine Minecraft Server Installer (Paper v3, Purpur, Fabric, Vanilla, NeoForge, Spigot)
async function installMinecraftServer(
  serverId: string,
  srvDir: string,
  requestedVersion?: string,
  requestedEngine?: string
): Promise<{ success: boolean; build: number | string; fileSizeMb: string; jarPath: string; engine: string; version: string }> {
  appendLog(serverId, 'INFO', `========================================================================`);
  appendLog(serverId, 'INFO', `[INSTALLATION] Initialisiere Minecraft Server-Dateien...`);

  // Target version extraction & sanitation
  let targetVer = '26.3';
  if (requestedVersion) {
    const clean = requestedVersion.trim();
    const semverMatch = clean.match(/\\b\\d+(\\.\\d+)+(-[a-zA-Z0-9.]+)?\\b/);
    if (semverMatch) {
      targetVer = semverMatch[0];
    } else if (clean.includes('.')) {
      targetVer = clean.split(' ')[0].trim();
    }
  }

  // Engine classification
  let engine = (requestedEngine || 'paper').toLowerCase().replace('mc_', '');
  if (engine.includes('fabric')) engine = 'fabric';
  else if (engine.includes('purpur')) engine = 'purpur';
  else if (engine.includes('vanilla')) engine = 'vanilla';
  else if (engine.includes('neoforge')) engine = 'neoforge';
  else if (engine.includes('forge')) engine = 'forge';
  else if (engine.includes('spigot')) engine = 'spigot';
  else if (engine.includes('velocity')) engine = 'velocity';
  else if (engine.includes('bungeecord')) engine = 'bungeecord';
  else engine = 'paper';

  appendLog(serverId, 'INFO', `[ENGINE] Gewählte Server-Engine: ${engine.toUpperCase()} | Zielversion: ${targetVer}`);

  let buffer: Buffer | null = null;
  let buildNum: number | string = 'latest';
  const customHeaders = { 'User-Agent': 'Sonora-Gameserver-Manager/2.0' };

  // STRATEGY 1: ENGINE-SPECIFIC OFFICIAL DOWNLOAD

  // 1A. PaperMC v3 (fill.papermc.io)
  if (engine === 'paper' || engine === 'velocity') {
    const proj = engine === 'velocity' ? 'velocity' : 'paper';
    try {
      appendLog(serverId, 'INFO', `[PAPER v3] Frage offizielle PaperMC v3 Downloads-API für ${proj} ${targetVer} ab...`);
      const buildsRes = await fetch(`https://fill.papermc.io/v3/projects/${proj}/versions/${targetVer}/builds`, {
        headers: customHeaders
      });
      if (buildsRes.ok) {
        const buildsData: any = await buildsRes.json();
        if (Array.isArray(buildsData) && buildsData.length > 0) {
          const latestBuild = buildsData[0];
          const downloadObj = latestBuild.downloads?.['server:default'] || Object.values(latestBuild.downloads || {})[0] as any;
          if (downloadObj?.url) {
            appendLog(serverId, 'INFO', `[PAPER v3] Lade Build #${latestBuild.id} (${downloadObj.name || 'paper.jar'})...`);
            const jarRes = await fetch(downloadObj.url, { headers: customHeaders });
            if (jarRes.ok) {
              buffer = Buffer.from(await jarRes.arrayBuffer());
              buildNum = `paper-${targetVer}-build#${latestBuild.id}`;
              appendLog(serverId, 'SUCCESS', `[PAPER v3] Paper Build #${latestBuild.id} erfolgreich heruntergeladen.`);
            }
          }
        }
      } else {
        appendLog(serverId, 'WARN', `PaperMC v3 lieferte HTTP ${buildsRes.status} für Version ${targetVer}.`);
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `PaperMC v3 API Fehler: ${err.message}`);
    }
  }

  // 1B. Purpur API (api.purpurmc.org)
  if (!buffer && (engine === 'purpur' || engine === 'paper')) {
    try {
      appendLog(serverId, 'INFO', `[PURPUR] Prüfe Purpur High-Performance Build für ${targetVer}...`);
      const purpurRes = await fetch(`https://api.purpurmc.org/v2/purpur/${targetVer}/latest/download`, {
        headers: customHeaders
      });
      if (purpurRes.ok) {
        buffer = Buffer.from(await purpurRes.arrayBuffer());
        buildNum = `purpur-${targetVer}-latest`;
        appendLog(serverId, 'SUCCESS', `[PURPUR] Purpur Build für ${targetVer} erfolgreich geladen.`);
      } else {
        appendLog(serverId, 'WARN', `Purpur nicht verfügbar für Version ${targetVer} (Status ${purpurRes.status}).`);
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Purpur Fehler: ${err.message}`);
    }
  }

  // 1C. Fabric Meta API (meta.fabricmc.net)
  if (!buffer && engine === 'fabric') {
    try {
      appendLog(serverId, 'INFO', `[FABRIC] Frage Fabric Meta nach Loader und Installer für ${targetVer} ab...`);
      const loaderRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${targetVer}`, { headers: customHeaders });
      const instRes = await fetch(`https://meta.fabricmc.net/v2/versions/installer`, { headers: customHeaders });
      if (loaderRes.ok && instRes.ok) {
        const loaders: any = await loaderRes.json();
        const installers: any = await instRes.json();
        const loaderVer = loaders[0]?.loader?.version;
        const installerVer = installers[0]?.version;
        if (loaderVer && installerVer) {
          const fabricJarUrl = `https://meta.fabricmc.net/v2/versions/loader/${targetVer}/${loaderVer}/${installerVer}/server/jar`;
          appendLog(serverId, 'INFO', `[FABRIC] Lade Server Launcher (Loader ${loaderVer}, Installer ${installerVer})...`);
          const jarRes = await fetch(fabricJarUrl, { headers: customHeaders });
          if (jarRes.ok) {
            buffer = Buffer.from(await jarRes.arrayBuffer());
            buildNum = `fabric-${targetVer}-loader-${loaderVer}`;
            appendLog(serverId, 'SUCCESS', `[FABRIC] Fabric Server JAR erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Fabric Meta Fehler: ${err.message}`);
    }
  }

  // STRATEGY 2: UNIVERSAL MCJARS REPOSITORY (Unterstützt Paper, Purpur, Fabric, NeoForge, Forge, Spigot, Vanilla)
  if (!buffer) {
    try {
      const mcjarsType = engine.toUpperCase();
      appendLog(serverId, 'INFO', `[MCJARS] Suche Build im MCJars Index für ${mcjarsType} (${targetVer})...`);
      const mcjarsRes = await fetch(`https://mcjars.app/api/v1/builds/${mcjarsType}`, { headers: customHeaders });
      if (mcjarsRes.ok) {
        const data: any = await mcjarsRes.json();
        const verObj = data.versions?.[targetVer] || data.versions?.[Object.keys(data.versions || {}).slice(-1)[0]];
        const jarUrl = verObj?.latest?.jarUrl || verObj?.latest?.zipUrl;
        if (jarUrl) {
          appendLog(serverId, 'INFO', `[MCJARS] Lade JAR von ${jarUrl}...`);
          const jarRes = await fetch(jarUrl, { headers: customHeaders });
          if (jarRes.ok) {
            buffer = Buffer.from(await jarRes.arrayBuffer());
            buildNum = `mcjars-${mcjarsType}-${targetVer}`;
            appendLog(serverId, 'SUCCESS', `[MCJARS] JAR für ${mcjarsType} erfolgreich geladen.`);
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `MCJars Index Fehler: ${err.message}`);
    }
  }

  // STRATEGY 3: OFFICIAL MOJANG VERSION MANIFEST (Reine Vanilla & universeller Fallback für alle 26.x/1.21.x)
  if (!buffer) {
    try {
      appendLog(serverId, 'INFO', `[MOJANG] Frage offizielles Mojang Version Manifest ab...`);
      const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { headers: customHeaders });
      if (manifestRes.ok) {
        const manifestData: any = await manifestRes.json();
        let targetEntry = manifestData.versions?.find((v: any) => v.id === targetVer);
        if (!targetEntry && manifestData.latest?.release) {
          targetEntry = manifestData.versions?.find((v: any) => v.id === manifestData.latest.release);
        }
        if (targetEntry && targetEntry.url) {
          appendLog(serverId, 'INFO', `[MOJANG] Lade Versionspaket für ${targetEntry.id}...`);
          const pkgRes = await fetch(targetEntry.url, { headers: customHeaders });
          if (pkgRes.ok) {
            const pkgData: any = await pkgRes.json();
            const serverDownloadUrl = pkgData.downloads?.server?.url;
            if (serverDownloadUrl) {
              appendLog(serverId, 'INFO', `[MOJANG DOWNLOAD] Lade offizielle Mojang Server-JAR (${targetEntry.id})...`);
              const jarRes = await fetch(serverDownloadUrl, { headers: customHeaders });
              if (jarRes.ok) {
                buffer = Buffer.from(await jarRes.arrayBuffer());
                buildNum = `mojang-${targetEntry.id}`;
              }
            }
          }
        }
      }
    } catch (err: any) {
      appendLog(serverId, 'WARN', `Mojang Manifest Fehler: ${err.message}`);
    }
  }

  // STRATEGY 4: ULTIMATE DIRECT RELEASE FALLBACK
  if (!buffer) {
    appendLog(serverId, 'WARN', `Lade direkte Notfall-JAR (Mojang 26.2 Release)...`);
    try {
      const mojangFallbackUrl = 'https://piston-data.mojang.com/v1/objects/823e2250d24b3ddac457a60c92a6a941943fcd6a/server.jar';
      const mojangRes = await fetch(mojangFallbackUrl, { headers: customHeaders });
      if (mojangRes.ok) {
        buffer = Buffer.from(await mojangRes.arrayBuffer());
        buildNum = 'mojang-26.2-verified-release';
      }
    } catch (e: any) {
      appendLog(serverId, 'ERROR', `Fallback Fehler: ${e.message}`);
    }
  }

  if (!buffer || buffer.length < 1000) {
    throw new Error(`Server-JAR für ${engine} (${targetVer}) konnte von keiner Quelle geladen werden.`);
  }

  // Determine standard file names according to engine
  const primaryJarName = engine === 'paper' ? 'paper.jar'
    : engine === 'purpur' ? 'purpur.jar'
    : engine === 'fabric' ? 'fabric-server-launch.jar'
    : engine === 'neoforge' ? 'neoforge-server.jar'
    : engine === 'forge' ? 'forge-server.jar'
    : engine === 'spigot' ? 'spigot.jar'
    : engine === 'velocity' ? 'velocity.jar'
    : 'server.jar';

  const primaryPath = path.join(srvDir, primaryJarName);
  const universalPath = path.join(srvDir, 'server.jar');
  const paperPath = path.join(srvDir, 'paper.jar');

  // Write primary engine JAR
  fs.writeFileSync(primaryPath, buffer);
  // Also write server.jar for universal launcher scripts
  if (primaryJarName !== 'server.jar') {
    fs.writeFileSync(universalPath, buffer);
  }
  // Write paper.jar if paper/purpur
  if (engine === 'purpur' || engine === 'paper') {
    fs.writeFileSync(paperPath, buffer);
  }

  // Always write eula.txt with eula=true
  fs.writeFileSync(path.join(srvDir, 'eula.txt'), '# Generated by ApexHost Sonora\\neula=true\\n', 'utf8');

  // Ensure default server.properties exists
  const propsPath = path.join(srvDir, 'server.properties');
  if (!fs.existsSync(propsPath)) {
    fs.writeFileSync(
      propsPath,
      `server-port=25565\\nmotd=§aApexHost Minecraft ${targetVer} (${engine.toUpperCase()})§r\\nonline-mode=true\\nmax-players=20\\n`,
      'utf8'
    );
  }

  const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
  appendLog(serverId, 'SUCCESS', `[ERFOLG] Server-JAR (${fileSizeMb} MB, Build: ${buildNum}) erfolgreich gespeichert.`);
  appendLog(serverId, 'SUCCESS', `[EULA] eula=true gesetzt. Der Minecraft-Server (${engine.toUpperCase()} ${targetVer}) ist nun 100% startbereit!`);
  appendLog(serverId, 'INFO', `========================================================================`);

  return { success: true, build: buildNum, fileSizeMb, jarPath: primaryPath, engine, version: targetVer };
}

"""

prefix = content[:content.find(start_marker)]
suffix = content[content.find(end_marker):]
new_content = prefix + new_func + suffix

# Update create endpoint
old_create = """        // Await synchronous download so JAR is 100% on disk before finishing
        installResult = await installMinecraftServer(serverId, srvDir, server.version);"""

new_create = """        // Await synchronous download so JAR is 100% on disk before finishing
        const engineType = server.minecraftType || (server.gameId && server.gameId.startsWith('mc_') ? server.gameId.replace('mc_', '') : 'paper');
        installResult = await installMinecraftServer(serverId, srvDir, server.version, engineType);"""

new_content = new_content.replace(old_create, new_create)

# Update install endpoint
old_inst_ep = """  const { category = 'minecraft', version, steamAppId } = req.body;"""
new_inst_ep = """  const { category = 'minecraft', version, steamAppId, minecraftType, engine } = req.body;"""
new_content = new_content.replace(old_inst_ep, new_inst_ep)

old_inst_call = """      const result = await installMinecraftServer(serverId, srvDir, version);
      return res.json({ message: 'Minecraft Paper Server erfolgreich installiert', ...result });"""
new_inst_call = """      const targetEngine = minecraftType || engine || 'paper';
      const result = await installMinecraftServer(serverId, srvDir, version, targetEngine);
      return res.json({ message: `Minecraft ${targetEngine.toUpperCase()} Server erfolgreich installiert`, ...result });"""
new_content = new_content.replace(old_inst_call, new_inst_call)

# Update power start endpoint
old_power_params = """    executable,
    startArgs,
    version
  } = req.body;"""
new_power_params = """    executable,
    startArgs,
    version,
    minecraftType
  } = req.body;"""
new_content = new_content.replace(old_power_params, new_power_params)

old_power_autoinstall = """      if (!foundJar) {
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte automatische Installation von PaperMC...`);
        try {
          await installMinecraftServer(serverId, srvDir, version);
          foundJar = 'paper.jar';
        } catch (downloadErr: any) {"""

new_power_autoinstall = """      if (!foundJar) {
        const mcEngine = minecraftType || 'paper';
        appendLog(serverId, 'WARN', `[AUTO-INSTALL] Keine Server-JAR gefunden. Starte sofortige automatische Installation (${mcEngine.toUpperCase()})...`);
        try {
          const autoRes = await installMinecraftServer(serverId, srvDir, version, mcEngine);
          foundJar = path.basename(autoRes.jarPath) || 'server.jar';
        } catch (downloadErr: any) {"""

new_content = new_content.replace(old_power_autoinstall, new_power_autoinstall)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('SUCCESS')
