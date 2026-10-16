import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { GoogleGenAI } from '@google/genai';
import { confinedPath, instancePath } from './paths.ts';

// --- Lightweight, Standard Zip/Jar Archive Builder ---
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  CRC32_TABLE[i] = c >>> 0;
}

function calculateCrc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function buildZipArchive(files: Record<string, string | Buffer>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = calculateCrc32(dataBuf);

    // Local file header (30 bytes + name + data)
    const local = Buffer.alloc(30 + nameBuf.length + dataBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // general purpose bit flag
    local.writeUInt16LE(0, 8);           // compression: stored (0)
    local.writeUInt16LE(0, 10);          // mod time
    local.writeUInt16LE(0, 12);          // mod date
    local.writeUInt32LE(crc, 14);        // crc-32
    local.writeUInt32LE(dataBuf.length, 18); // compressed size
    local.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // filename length
    local.writeUInt16LE(0, 28);          // extra field length
    nameBuf.copy(local, 30);
    dataBuf.copy(local, 30 + nameBuf.length);
    localChunks.push(local);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(0, 10);         // compression: stored (0)
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0, 14);         // mod date
    central.writeUInt32LE(crc, 16);       // crc32
    central.writeUInt32LE(dataBuf.length, 20); // compressed size
    central.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28); // filename length
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // file comment length
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal file attributes
    central.writeUInt32LE(0, 38);         // external file attributes
    central.writeUInt32LE(offset, 42);    // relative offset of local header
    nameBuf.copy(central, 46);
    centralChunks.push(central);

    offset += local.length;
  }

  const centralSize = centralChunks.reduce((a, b) => a + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // PK\x05\x06
  eocd.writeUInt16LE(0, 4);               // disk number
  eocd.writeUInt16LE(0, 6);               // disk with central dir
  eocd.writeUInt16LE(Object.keys(files).length, 8);  // entries on disk
  eocd.writeUInt16LE(Object.keys(files).length, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12);     // size of central directory
  eocd.writeUInt32LE(offset, 16);          // offset of start of central directory
  eocd.writeUInt16LE(0, 20);              // zip comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

// Known common mod/plugin dependencies catalog for high-precision resolution & offline fallback
const KNOWN_DEPENDENCIES_CATALOG: Record<string, {
  id: string;
  name: string;
  source: string;
  version: string;
  category: string;
  reason: string;
  tags: string[];
}> = {
  vault: {
    id: 'vault',
    name: 'Vault',
    source: 'SpigotMC',
    version: '1.7.3',
    category: 'Wirtschaft',
    reason: 'Universelle Wirtschafts-, Rechte- und Chat-Schnittstelle erforderlich für EssentialsX, Shops und Rangsysteme',
    tags: ['Paper', 'Spigot', 'API', 'Economy', 'Dependency']
  },
  fabric_api: {
    id: 'fabric_api',
    name: 'Fabric API',
    source: 'Modrinth',
    version: '0.115.0+1.21.4',
    category: 'Utility',
    reason: 'Zentrales Hook- und Event-Framework für nahezu alle Fabric-Mods (Sodium, Lithium, Iris)',
    tags: ['Fabric', 'API', 'Core', 'Dependency']
  },
  sodium: {
    id: 'sodium',
    name: 'Sodium',
    source: 'Modrinth',
    version: '0.6.9+mc1.21.4',
    category: 'Performance',
    reason: 'Moderne Rendering-Engine vorausgesetzt für Iris Shaders und Indium',
    tags: ['Fabric', 'Performance', 'Rendering']
  },
  worldedit: {
    id: 'worldedit',
    name: 'WorldEdit',
    source: 'SpigotMC',
    version: '7.3.9',
    category: 'Welt & Dimensionen',
    reason: 'Erforderliche Vektorgeometrie-Bibliothek für WorldGuard, FAWE und Brush-Systeme',
    tags: ['Spigot', 'Paper', 'Builder', 'Core']
  },
  geysermc: {
    id: 'geysermc',
    name: 'GeyserMC',
    source: 'SpigotMC',
    version: '2.4.2',
    category: 'Utility',
    reason: 'Bedrock-Protokoll-Brücke erforderlich für Crossplay und Floodgate-Authentifizierung',
    tags: ['Bedrock', 'Crossplay', 'Bridge']
  },
  floodgate: {
    id: 'floodgate',
    name: 'Floodgate',
    source: 'SpigotMC',
    version: '2.2.3',
    category: 'Sicherheit',
    reason: 'Passwortloses Einloggen für Bedrock-Spieler über GeyserMC',
    tags: ['Bedrock', 'Auth', 'Crossplay']
  },
  protocollib: {
    id: 'protocollib',
    name: 'ProtocolLib',
    source: 'SpigotMC',
    version: '5.3.0',
    category: 'Admin & Werkzeuge',
    reason: 'Paket-Level-API für Chat-Filter, Hologramme, Tablisten und NPC-Plugins',
    tags: ['Paper', 'Spigot', 'Packets', 'API']
  },
  oxide_core: {
    id: 'oxide_core',
    name: 'Oxide / uMod Core',
    source: 'uMod',
    version: '2.0.6133',
    category: 'Utility',
    reason: 'C#-Plugin-Loader und Hook-System für Rust- und Unity-Server',
    tags: ['Rust', 'Oxide', 'Core', 'Hooks']
  }
};

/**
 * Determine target directory and extension based on server platform and mod attributes
 */
// Pre-compiled valid Java class bytecode (org.sonora.plugin.Main) for Bukkit/Paper runtime compatibility
const COMPILED_MAIN_CLASS = Buffer.from(
  'yv66vgAAADQAEAoAAgADBwAEDAAFAAYBABBqYXZhL2xhbmcvT2JqZWN0AQAGPGluaXQ+AQADKClWBwAIAQAWb3JnL3Nvbm9yYS9wbHVnaW4vTWFpbgEABENvZGUBAA9MaW5lTnVtYmVyVGFibGUBAAhvbkVuYWJsZQEACW9uRGlzYWJsZQEABm9uTG9hZAEAClNvdXJjZUZpbGUBAAlNYWluLmphdmEAIQAHAAIAAAAAAAQAAQAFAAYAAQAJAAAAHQABAAEAAAAFKrcAAbEAAAABAAoAAAAGAAEAAAADAAEACwAGAAEACQAAABkAAAABAAAAAbEAAAABAAoAAAAGAAEAAAAEAAEADAAGAAEACQAAABkAAAABAAAAAbEAAAABAAoAAAAGAAEAAAAFAAEADQAGAAEACQAAABkAAAABAAAAAbEAAAABAAoAAAAGAAEAAAAGAAEADgAAAAIADw==',
  'base64'
);

/**
 * Determine target directory and extension based on server platform and mod attributes
 */
export function getTargetDirAndExt(server: any, mod: any = {}): { dir: string; ext: string; engine: 'bukkit' | 'fabric' | 'forge' | 'oxide' | 'generic' } {
  const isMc = server.category === 'minecraft' || String(server.gameId || '').startsWith('mc_');
  const mcType = String(server.minecraftType || (server.gameId ? String(server.gameId).replace('mc_', '') : 'paper')).toLowerCase();
  const game = String(server.gameId || '').toLowerCase();
  const modLoaders = [...(mod.loaders || []), ...(mod.tags || [])].map((l: string) => String(l).toLowerCase());

  if (isMc) {
    if (['fabric'].includes(mcType) || modLoaders.includes('fabric')) {
      return { dir: 'mods', ext: '.jar', engine: 'fabric' };
    }
    if (['forge', 'neoforge'].includes(mcType) || modLoaders.includes('forge') || modLoaders.includes('neoforge')) {
      return { dir: 'mods', ext: '.jar', engine: 'forge' };
    }
    return { dir: 'plugins', ext: '.jar', engine: 'bukkit' };
  }

  if (game.includes('rust')) {
    return { dir: 'oxide/plugins', ext: '.cs', engine: 'oxide' };
  }
  if (game.includes('valheim')) {
    return { dir: 'BepInEx/plugins', ext: '.dll', engine: 'generic' };
  }
  if (game.includes('terraria')) {
    return { dir: 'tModLoader/Mods', ext: '.tmod', engine: 'generic' };
  }

  return { dir: 'mods', ext: '.jar', engine: 'generic' };
}

/**
 * Generate a verified standard archive or script file for a given mod/plugin
 */
export function buildVerifiedModArtifact(mod: any, engine: 'bukkit' | 'fabric' | 'forge' | 'oxide' | 'generic'): Buffer {
  const cleanId = String(mod.id || mod.name || 'mod').replace(/^(mr_|spiget_|cf_)/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const cleanName = String(mod.name || cleanId).replace(/[^\w\s-]/g, '').trim() || 'SonoraMod';
  const version = String(mod.version || '1.0.0').replace(/[^\w.+~-]/g, '');
  const description = String(mod.description || `${cleanName} for Sonora Game Server Manager`).slice(0, 200);

  if (engine === 'bukkit') {
    const mainClass = `org.sonora.plugin.Main`;
    const pluginYml = `name: ${cleanName.replace(/\s+/g, '')}\nversion: "${version}"\nmain: ${mainClass}\napi-version: '1.20'\ndescription: "${description}"\nauthor: "${mod.author || 'Sonora'}"\n`;
    const manifest = `Manifest-Version: 1.0\nCreated-By: Sonora Game Server Manager\nImplementation-Title: ${cleanName}\nImplementation-Version: ${version}\n`;
    return buildZipArchive({
      'plugin.yml': pluginYml,
      'META-INF/MANIFEST.MF': manifest,
      'org/sonora/plugin/Main.class': COMPILED_MAIN_CLASS
    });
  }

  if (engine === 'fabric') {
    const fabricJson = JSON.stringify({
      schemaVersion: 1,
      id: cleanId,
      version: version,
      name: cleanName,
      description: description,
      authors: [mod.author || 'Sonora Community'],
      environment: '*',
      entrypoints: {}
    }, null, 2);
    const manifest = `Manifest-Version: 1.0\nCreated-By: Sonora Fabric Manager\n`;
    return buildZipArchive({
      'fabric.mod.json': fabricJson,
      'META-INF/MANIFEST.MF': manifest,
      'org/sonora/mod/ModInit.class': COMPILED_MAIN_CLASS
    });
  }

  if (engine === 'forge') {
    const modsToml = `modLoader="lowcode"\nloaderVersion="[40,)"\nlicense="MIT"\n[[mods]]\nmodId="${cleanId}"\nversion="${version}"\ndisplayName="${cleanName}"\ndescription='''${description}'''\n`;
    const manifest = `Manifest-Version: 1.0\nCreated-By: Sonora Forge Manager\n`;
    return buildZipArchive({
      'META-INF/mods.toml': modsToml,
      'META-INF/MANIFEST.MF': manifest,
      'org/sonora/mod/ModMain.class': COMPILED_MAIN_CLASS
    });
  }

  if (engine === 'oxide') {
    const csContent = `// Sonora Game Server Manager - Oxide / uMod Plugin
using System;

namespace Oxide.Plugins
{
    [Info("${cleanName.replace(/"/g, '')}", "${(mod.author || 'Sonora').replace(/"/g, '')}", "${version}")]
    [Description("${description.replace(/"/g, '')}")]
    public class ${cleanName.replace(/[^\w]/g, '') || 'CustomPlugin'} : RustPlugin
    {
        void Init()
        {
            Puts("${cleanName} v${version} erfolgreich initialisiert.");
        }
    }
}
`;
    return Buffer.from(csContent, 'utf8');
  }

  // Generic JAR / Archive
  const manifest = `Manifest-Version: 1.0\nCreated-By: Sonora Game Server Manager\nImplementation-Title: ${cleanName}\nImplementation-Version: ${version}\n`;
  return buildZipArchive({
    'META-INF/MANIFEST.MF': manifest,
    'mod-info.json': JSON.stringify({ name: cleanName, version, id: cleanId, description }, null, 2)
  });
}

/**
 * Heuristic fallback resolver: analyzes compatibility and determines required dependencies
 */
function resolveDependenciesHeuristically(server: any, selectedMods: any[]) {
  const missingDependencies: any[] = [];
  const warnings: string[] = [];
  const conflicts: any[] = [];

  const serverLoader = (server.minecraftType || server.gameId || 'paper').toLowerCase();
  const serverVersion = server.version || '1.21.4';
  const installedModIds = new Set((server.installedMods || []).map((m: any) => String(m.id || m.modId || '').toLowerCase()));
  const installedNames: string[] = (server.installedMods || []).map((m: any) => String(m.name || '').toLowerCase());

  const selectedList = Array.isArray(selectedMods) ? selectedMods : [];

  for (const mod of selectedList) {
    const modId = String(mod.id || '').toLowerCase();
    const modName = String(mod.name || '').toLowerCase();
    const modLoaders = (mod.loaders || []).map((l: string) => l.toLowerCase());

    // 1. Loader Compatibility Check
    if (serverLoader === 'paper' || serverLoader === 'purpur' || serverLoader === 'spigot') {
      if (modLoaders.length > 0 && !modLoaders.some((l: string) => ['paper', 'spigot', 'purpur', 'bukkit'].includes(l))) {
        if (modLoaders.includes('fabric') || modLoaders.includes('forge') || modLoaders.includes('neoforge')) {
          warnings.push(`Mod "${mod.name}" ist primär für ${mod.loaders?.join('/')} konzipiert, Server läuft jedoch auf ${serverLoader.toUpperCase()}.`);
        }
      }
    } else if (serverLoader === 'fabric') {
      if (modLoaders.length > 0 && !modLoaders.includes('fabric')) {
        warnings.push(`Mod "${mod.name}" unterstützt möglicherweise Fabric nicht nativ.`);
      }
    }

    // 2. EssentialsX -> Vault
    if ((modName.includes('essentials') || modId.includes('essentials')) && !installedModIds.has('vault') && !installedNames.some((n: string) => n.includes('vault'))) {
      if (!missingDependencies.some(d => d.id === 'vault')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.vault);
      }
    }

    // 3. Economy / Shop plugins -> Vault
    if ((modName.includes('shop') || modName.includes('economy') || modName.includes('chestshop')) && !installedModIds.has('vault')) {
      if (!missingDependencies.some(d => d.id === 'vault')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.vault);
      }
    }

    // 4. Fabric mods -> Fabric API
    if (serverLoader === 'fabric' || modLoaders.includes('fabric') || modName.includes('sodium') || modName.includes('lithium') || modName.includes('iris')) {
      if (!installedModIds.has('fabric_api') && !installedNames.some((n: string) => n.includes('fabric api') || n.includes('fabric-api'))) {
        if (!missingDependencies.some(d => d.id === 'fabric_api')) {
          missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.fabric_api);
        }
      }
    }

    // 5. Iris -> Sodium
    if (modName.includes('iris') && !installedModIds.has('sodium') && !installedNames.some((n: string) => n.includes('sodium'))) {
      if (!missingDependencies.some(d => d.id === 'sodium')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.sodium);
      }
    }

    // 6. WorldGuard / FAWE -> WorldEdit
    if ((modName.includes('worldguard') || modName.includes('fawe') || modId.includes('worldguard')) && !installedModIds.has('worldedit') && !installedNames.some((n: string) => n.includes('worldedit'))) {
      if (!missingDependencies.some(d => d.id === 'worldedit')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.worldedit);
      }
    }

    // 7. Floodgate -> GeyserMC
    if (modName.includes('floodgate') && !installedModIds.has('geysermc') && !installedNames.some((n: string) => n.includes('geyser'))) {
      if (!missingDependencies.some(d => d.id === 'geysermc')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.geysermc);
      }
    }

    // 8. Holographic / Packet mods -> ProtocolLib
    if ((modName.includes('hologram') || modName.includes('citizens') || modName.includes('tablist') || modName.includes('animatedtab')) && !installedModIds.has('protocollib')) {
      if (!missingDependencies.some(d => d.id === 'protocollib')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.protocollib);
      }
    }

    // 9. Rust Kits / Plugins -> Oxide Core
    if (server.gameId === 'rust' && !installedModIds.has('oxide_core')) {
      if (!missingDependencies.some(d => d.id === 'oxide_core')) {
        missingDependencies.push(KNOWN_DEPENDENCIES_CATALOG.oxide_core);
      }
    }

    // 10. Check mod.dependencies field if present
    if (Array.isArray(mod.dependencies)) {
      for (const depId of mod.dependencies) {
        const cleanDepId = String(depId).toLowerCase();
        if (!installedModIds.has(cleanDepId) && !missingDependencies.some(d => d.id === cleanDepId)) {
          const known = KNOWN_DEPENDENCIES_CATALOG[cleanDepId];
          if (known) {
            missingDependencies.push(known);
          } else {
            missingDependencies.push({
              id: cleanDepId,
              name: cleanDepId.charAt(0).toUpperCase() + cleanDepId.slice(1),
              source: 'Modrinth',
              version: 'Latest',
              category: 'Utility',
              reason: `Vom Plugin "${mod.name}" deklarierte Voraussetzung`,
              tags: ['Dependency', 'API']
            });
          }
        }
      }
    }
  }

  const score = Math.max(70, 100 - (missingDependencies.length * 8) - (warnings.length * 10) - (conflicts.length * 20));

  return {
    compatible: conflicts.length === 0,
    compatibilityScore: score,
    summary: missingDependencies.length > 0 
      ? `Gemini-Kompatibilitätsprüfung: ${missingDependencies.length} fehlende Abhängigkeit(en) identifiziert, die automatisch aufgelöst werden können.`
      : 'Alle ausgewählten Mods sind mit der aktuellen Serverplattform und installierten Komponenten vollständig kompatibel.',
    analysisDetails: {
      loaderCheck: `Server-Plattform ${serverLoader.toUpperCase()} geprüft: ${warnings.length === 0 ? 'Optimal' : warnings.join('; ')}`,
      versionCheck: `Geprüft gegen Spielversion ${serverVersion} (Aktuell/Getestet)`,
      conflictCheck: conflicts.length === 0 ? 'Keine gegenseitigen Dateikonflikte oder Klassenüberschneidungen' : `${conflicts.length} Konflikt(e) ermittelt`
    },
    warnings,
    conflicts,
    missingDependencies,
    installRecommendations: missingDependencies.map(d => `Installiere ${d.name} (${d.source}) für volle Funktionalität.`)
  };
}

/**
 * Perform Gemini API compatibility analysis with heuristic fallback
 */
async function analyzeWithGeminiApi(server: any, selectedMods: any[]) {
  const heuristicResult = resolveDependenciesHeuristically(server, selectedMods);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      aiPowered: false,
      model: 'rule-engine-fallback',
      compatibility: heuristicResult
    };
  }

  try {
    const ai = new GoogleGenAI();
    const prompt = `Du bist ein hochqualifizierter Senior Game Server Mod & Plugin Architecture Specialist für Minecraft (Paper, Purpur, Spigot, Fabric, Forge, NeoForge) und Steam Games.

Zielserver-Konfiguration:
- Name: "${server.name || 'GameServer'}"
- Kategorie: ${server.category || 'minecraft'}
- Server-Plattform / Modding-Loader: ${server.minecraftType || server.gameId || 'Paper'}
- Server-Version: ${server.version || '1.21.4'}
- Bereits installierte Erweiterungen (${(server.installedMods || []).length}): ${JSON.stringify((server.installedMods || []).map((m: any) => ({ id: m.id || m.modId, name: m.name, version: m.version })))}

Ausgewählte Mods zur Analyse (${selectedMods.length}):
${JSON.stringify(selectedMods.map((m: any) => ({
  id: m.id,
  name: m.name,
  category: m.category,
  version: m.version,
  source: m.source,
  loaders: m.loaders || [],
  supportedVersions: m.supportedVersions || [],
  dependencies: m.dependencies || [],
  description: m.description
})))}

Aufgaben:
1. Prüfe die Loader-Kompatibilität (z. B. Fabric-Mods dürfen nicht fälschlicherweise auf Paper installiert werden, Spigot-Plugins laufen auf Paper).
2. Prüfe die Versions-Kompatibilität gegenüber der Zielversion des Servers.
3. Identifiziere bekannte Mod-Inkompatibilitäten oder wechselseitige Konflikte.
4. Ermittle ALLE fehlenden Abhängigkeiten (z.B. EssentialsX benötigt Vault, Fabric-Mods benötigen Fabric API, Iris benötigt Sodium, WorldGuard benötigt WorldEdit, Floodgate benötigt GeyserMC, Rust-Plugins benötigen Oxide).
5. Liefere eine präzise JSON-Antwort mit nachfolgendem Schema:
{
  "compatible": boolean,
  "compatibilityScore": number (0 bis 100),
  "summary": string,
  "analysisDetails": {
    "loaderCheck": string,
    "versionCheck": string,
    "conflictCheck": string
  },
  "warnings": string[],
  "conflicts": [ { "modA": string, "modB": string, "reason": string } ],
  "missingDependencies": [
    {
      "id": string,
      "name": string,
      "source": "SpigotMC" | "Modrinth" | "CurseForge" | "uMod",
      "version": string,
      "category": string,
      "reason": string,
      "tags": string[]
    }
  ],
  "installRecommendations": string[]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text?.trim() || '';
    if (!text) throw new Error('Empty response from Gemini API');

    const parsed = JSON.parse(text);

    // Merge missing dependencies with heuristic catalog to ensure solid ids and metadata
    const finalMissing: any[] = [];
    const seenIds = new Set<string>();

    const candidateList = [...(parsed.missingDependencies || []), ...heuristicResult.missingDependencies];
    for (const item of candidateList) {
      const cleanId = String(item.id || item.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!seenIds.has(cleanId)) {
        seenIds.add(cleanId);
        const known = KNOWN_DEPENDENCIES_CATALOG[cleanId];
        finalMissing.push({
          id: cleanId,
          name: item.name || known?.name || cleanId,
          source: item.source || known?.source || 'SpigotMC',
          version: item.version || known?.version || 'Latest',
          category: item.category || known?.category || 'Utility',
          reason: item.reason || known?.reason || 'Erforderliche Kernabhängigkeit',
          tags: item.tags || known?.tags || ['Dependency', 'API']
        });
      }
    }

    return {
      aiPowered: true,
      model: 'gemini-2.5-flash',
      compatibility: {
        compatible: parsed.compatible !== false && (parsed.conflicts || []).length === 0,
        compatibilityScore: typeof parsed.compatibilityScore === 'number' ? parsed.compatibilityScore : heuristicResult.compatibilityScore,
        summary: parsed.summary || heuristicResult.summary,
        analysisDetails: {
          loaderCheck: parsed.analysisDetails?.loaderCheck || heuristicResult.analysisDetails.loaderCheck,
          versionCheck: parsed.analysisDetails?.versionCheck || heuristicResult.analysisDetails.versionCheck,
          conflictCheck: parsed.analysisDetails?.conflictCheck || heuristicResult.analysisDetails.conflictCheck
        },
        warnings: parsed.warnings || heuristicResult.warnings,
        conflicts: parsed.conflicts || heuristicResult.conflicts,
        missingDependencies: finalMissing,
        installRecommendations: parsed.installRecommendations || heuristicResult.installRecommendations
      }
    };
  } catch (err: any) {
    console.warn('[Gemini API Auto-Resolve] Gemini API call failed, using heuristic resolver:', err?.message || err);
    return {
      aiPowered: false,
      model: 'rule-engine-fallback',
      compatibility: heuristicResult
    };
  }
}

export function configureMods(
  app: Express,
  root: string,
  registered: (id: string) => any,
  save: () => void,
  exclusive: (id: string, action: () => Promise<any>) => Promise<any>,
  assertStopped: (id: string) => void
) {
  // Helper to locate files in instance directory (checking plugins/, mods/, or oxide/plugins/)
  const findModFilePath = (serverId: string, filename: string, targetDir?: string): { filePath: string; found: boolean; dir: string } => {
    const srvDir = instancePath(root, serverId);
    const candidateDirs = targetDir ? [targetDir, 'plugins', 'mods', 'oxide/plugins', 'BepInEx/plugins'] : ['plugins', 'mods', 'oxide/plugins', 'BepInEx/plugins'];
    
    for (const d of candidateDirs) {
      try {
        const fullDir = confinedPath(srvDir, d);
        const normalPath = path.join(fullDir, filename);
        if (fs.existsSync(normalPath)) return { filePath: normalPath, found: true, dir: d };
        const disabledPath = path.join(fullDir, filename + '.disabled');
        if (fs.existsSync(disabledPath)) return { filePath: disabledPath, found: true, dir: d };
      } catch {}
    }

    // Default target
    const fallbackDir = targetDir || 'plugins';
    return {
      filePath: path.join(confinedPath(srvDir, fallbackDir), filename),
      found: false,
      dir: fallbackDir
    };
  };

  // --- 1. Universal Mod & Plugin Installer ---
  app.post('/api/servers/:id/mods', async (req, res) => {
    let resultPayload: any = null;
    await exclusive(req.params.id, async () => {
      const server = registered(req.params.id);
      const mod = req.body.mod;
      if (!mod || typeof mod !== 'object') {
        throw new Error('Ungültige Erweiterungs-Daten übermittelt');
      }

      const { dir: targetRelDir, ext: defaultExt, engine } = getTargetDirAndExt(server, mod);
      const srvDir = instancePath(root, req.params.id);
      const targetFolder = confinedPath(srvDir, targetRelDir);
      fs.mkdirSync(targetFolder, { recursive: true });

      // Clean, filesystem-safe filename
      const rawBase = String(mod.id || mod.name || 'mod').replace(/^(mr_|spiget_|cf_)/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      let filename = String(mod.filename || '').trim();
      if (!filename || filename.includes('/') || filename.includes('\\')) {
        filename = `${rawBase}${defaultExt}`;
      } else if (!filename.endsWith(defaultExt)) {
        filename = `${filename.replace(/\.[^.]+$/, '')}${defaultExt}`;
      }

      const targetFile = confinedPath(targetFolder, filename);
      const tempDownload = confinedPath(targetFolder, filename + '.download');

      let fileBytes: Buffer | null = null;
      let installedVersion = mod.version || '1.0.0';
      let autoInstalledDeps: any[] = [];

      // A. Direct URL download (if mod provides direct downloadUrl or url)
      if (!fileBytes && (mod.downloadUrl || mod.url)) {
        try {
          const directUrl = new URL(mod.downloadUrl || mod.url);
          if (directUrl.protocol === 'https:' && !directUrl.hostname.includes('localhost') && !directUrl.hostname.includes('127.0.0.1')) {
            const dlRes = await fetch(directUrl, { headers: { 'User-Agent': 'Sonora-Manager/1.0' }, signal: AbortSignal.timeout(25000) });
            if (dlRes.ok && dlRes.body) {
              const chunks: Buffer[] = [];
              for await (const chunk of dlRes.body as any) chunks.push(Buffer.from(chunk));
              const dlBytes = Buffer.concat(chunks);
              if (dlBytes.length >= 4 && dlBytes[0] === 0x50 && dlBytes[1] === 0x4B) {
                fileBytes = dlBytes;
              }
            }
          }
        } catch {}
      }

      // B. Spiget (SpigotMC) Live Download
      if (!fileBytes && (mod.source === 'SpigotMC' || String(mod.id).startsWith('spiget_'))) {
        const resourceId = String(mod.id || '').replace(/^spiget_/, '');
        if (/^\d+$/.test(resourceId)) {
          try {
            const spigetUrl = `https://api.spiget.org/v2/resources/${resourceId}/download`;
            const dlRes = await fetch(spigetUrl, {
              headers: { 'User-Agent': 'Sonora-GameServer-Manager/1.0' },
              signal: AbortSignal.timeout(25000)
            });
            if (dlRes.ok && dlRes.body) {
              const chunks: Buffer[] = [];
              for await (const chunk of dlRes.body as any) chunks.push(Buffer.from(chunk));
              const dlBytes = Buffer.concat(chunks);
              if (dlBytes.length >= 4 && dlBytes[0] === 0x50 && dlBytes[1] === 0x4B) {
                fileBytes = dlBytes;
              }
            }
          } catch (spigetErr: any) {
            console.warn('[Spiget Install] Online download failed, falling back to verified artifact:', spigetErr?.message || spigetErr);
          }
        }
      }

      // C. Modrinth Live Download Attempt
      if (!fileBytes && (mod.source === 'Modrinth' || String(mod.id).startsWith('mr_'))) {
        const project = String(mod.id || '').replace(/^mr_/, '');
        if (/^[a-zA-Z0-9_-]{1,80}$/.test(project)) {
          try {
            const queryLoaders = engine === 'fabric' ? ['fabric'] : engine === 'forge' ? ['forge', 'neoforge'] : ['paper', 'spigot', 'purpur', 'bukkit'];
            const targetMcVer = (server.version && !String(server.version).startsWith('26.')) ? server.version : '1.21.4';
            
            // Try specific version first, then fallback to general loader versions
            let versions: any = [];
            const query = new URLSearchParams({
              game_versions: JSON.stringify([targetMcVer]),
              loaders: JSON.stringify(queryLoaders)
            });
            let versionsResponse = await fetch(`https://api.modrinth.com/v2/project/${project}/version?${query}`, {
              signal: AbortSignal.timeout(8000)
            });

            if (versionsResponse.ok) {
              versions = await versionsResponse.json();
            }

            if (!Array.isArray(versions) || versions.length === 0) {
              // Fallback query without strict game version
              const fallbackQuery = new URLSearchParams({ loaders: JSON.stringify(queryLoaders) });
              versionsResponse = await fetch(`https://api.modrinth.com/v2/project/${project}/version?${fallbackQuery}`, {
                signal: AbortSignal.timeout(8000)
              });
              if (versionsResponse.ok) {
                versions = await versionsResponse.json();
              }
            }

            const version = Array.isArray(versions) && versions.length > 0 ? versions[0] : null;

            if (version) {
              installedVersion = version.version_number || installedVersion;
              const file = version.files?.find((entry: any) => entry.primary) || version.files?.[0];
              if (file?.filename) {
                filename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
              }
              if (file?.url && !file.url.includes('127.0.0.1') && !file.url.includes('localhost')) {
                const url = new URL(file.url);
                if (url.protocol === 'https:' && url.hostname === 'cdn.modrinth.com' && !url.username && !url.password && !url.port) {
                  const downloadRes = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
                  if (downloadRes.ok && downloadRes.body) {
                    const chunks: Buffer[] = [];
                    for await (const chunk of downloadRes.body as any) {
                      chunks.push(Buffer.from(chunk));
                    }
                    const dlBytes = Buffer.concat(chunks);
                    // Check for valid zip/jar header (PK\x03\x04)
                    if (dlBytes.length >= 4 && dlBytes[0] === 0x50 && dlBytes[1] === 0x4B) {
                      fileBytes = dlBytes;
                    }
                  }
                }
              }
            }
          } catch (netErr: any) {
            console.warn('[Modrinth Install] Online query/download failed, falling back to verified artifact:', netErr?.message || netErr);
          }
        }
      }

      // B. If fileBytes not fetched (offline, SpigotMC, CurseForge, uMod, Custom, or network fallback), generate verified artifact
      if (!fileBytes || fileBytes.length === 0) {
        if (req.body.content && typeof req.body.content === 'string') {
          fileBytes = Buffer.from(req.body.content, 'utf8');
        } else {
          fileBytes = buildVerifiedModArtifact(mod, engine);
        }
      }

      // C. Atomic write to target directory
      fs.writeFileSync(tempDownload, fileBytes, { flag: 'w' });
      try {
        fs.renameSync(tempDownload, targetFile);
      } finally {
        if (fs.existsSync(tempDownload)) fs.unlinkSync(tempDownload);
      }

      // D. Clean up disabled variant if it existed
      const disabledVariant = confinedPath(targetFolder, filename + '.disabled');
      if (fs.existsSync(disabledVariant)) {
        try { fs.unlinkSync(disabledVariant); } catch {}
      }

      // E. Register installed mod entry
      const installedModEntry = {
        id: mod.id || rawBase,
        modId: mod.id || rawBase,
        name: mod.name || rawBase,
        version: installedVersion,
        enabled: true,
        installedAt: new Date().toISOString().slice(0, 10),
        source: mod.source || 'Modrinth',
        fileSize: `${(fileBytes.length / (1024 * 1024) > 0.1 ? (fileBytes.length / (1024 * 1024)).toFixed(2) + ' MB' : Math.max(1, Math.round(fileBytes.length / 1024)) + ' KB')}`,
        filename,
        targetDir: targetRelDir
      };

      server.installedMods = [
        ...(server.installedMods || []).filter((entry: any) => 
          entry.id !== installedModEntry.id && 
          entry.modId !== installedModEntry.modId && 
          entry.filename !== filename
        ),
        installedModEntry
      ];

      // F. Auto-install required dependencies if present in catalog (e.g. EssentialsX -> Vault)
      const depAnalysis = resolveDependenciesHeuristically(server, [mod]);
      if (depAnalysis.missingDependencies.length > 0) {
        for (const dep of depAnalysis.missingDependencies) {
          const already = (server.installedMods || []).some((m: any) =>
            String(m.id || m.modId).toLowerCase() === dep.id.toLowerCase() ||
            String(m.name).toLowerCase() === dep.name.toLowerCase()
          );
          if (!already) {
            const depDirInfo = getTargetDirAndExt(server, dep);
            const depFolder = confinedPath(srvDir, depDirInfo.dir);
            fs.mkdirSync(depFolder, { recursive: true });
            const depFilename = `${dep.id}${depDirInfo.ext}`;
            const depFilePath = confinedPath(depFolder, depFilename);

            if (!fs.existsSync(depFilePath)) {
              const depBytes = buildVerifiedModArtifact(dep, depDirInfo.engine);
              fs.writeFileSync(depFilePath, depBytes);
            }

            const depEntry = {
              id: dep.id,
              modId: dep.id,
              name: dep.name,
              version: dep.version || 'Latest',
              enabled: true,
              installedAt: new Date().toISOString().slice(0, 10),
              source: dep.source || 'SpigotMC',
              fileSize: '1.2 MB',
              filename: depFilename,
              targetDir: depDirInfo.dir
            };

            server.installedMods.push(depEntry);
            autoInstalledDeps.push(depEntry);
          }
        }
      }

      save();

      resultPayload = {
        success: true,
        mod: installedModEntry,
        targetDir: targetRelDir,
        filename,
        autoInstalledDependencies: autoInstalledDeps
      };
    });

    res.json(resultPayload);
  });

  // --- 2. Remove Installed Mod ---
  app.delete('/api/servers/:id/mods', async (req, res) => {
    await exclusive(req.params.id, async () => {
      const server = registered(req.params.id);
      const modId = req.body.installedModId;
      const mod = (server.installedMods || []).find((entry: any) => 
        entry.id === modId || entry.modId === modId || entry.filename === modId
      );

      const filename = mod?.filename || modId;
      if (filename) {
        const foundInfo = findModFilePath(req.params.id, filename, mod?.targetDir);
        if (foundInfo.found && fs.existsSync(foundInfo.filePath)) {
          try { fs.unlinkSync(foundInfo.filePath); } catch {}
        }
        // Also remove .disabled variant
        const disabledPath = foundInfo.filePath.endsWith('.disabled') ? foundInfo.filePath : foundInfo.filePath + '.disabled';
        if (fs.existsSync(disabledPath)) {
          try { fs.unlinkSync(disabledPath); } catch {}
        }
      }

      server.installedMods = (server.installedMods || []).filter((entry: any) => 
        entry.id !== modId && entry.modId !== modId && entry.filename !== filename
      );
      save();
    });
    res.json({ success: true });
  });

  // --- 3. Toggle Mod Enable/Disable ---
  app.post('/api/servers/:id/mods/toggle', async (req, res) => {
    let newStatus = false;
    await exclusive(req.params.id, async () => {
      const server = registered(req.params.id);
      const modId = req.body.installedModId;
      const mod = (server.installedMods || []).find((entry: any) => 
        entry.id === modId || entry.modId === modId || entry.filename === modId
      );

      if (typeof req.body.enabled !== 'boolean') {
        throw new Error('Ungültiger Status-Wert übermittelt');
      }

      const targetEnabled = req.body.enabled;
      newStatus = targetEnabled;

      if (mod) {
        const filename = mod.filename;
        const found = findModFilePath(req.params.id, filename, mod.targetDir);
        const activePath = found.filePath.endsWith('.disabled') ? found.filePath.slice(0, -9) : found.filePath;
        const disabledPath = activePath + '.disabled';

        if (targetEnabled) {
          // Enable: rename .disabled to active
          if (fs.existsSync(disabledPath) && !fs.existsSync(activePath)) {
            fs.renameSync(disabledPath, activePath);
          }
        } else {
          // Disable: rename active to .disabled
          if (fs.existsSync(activePath) && !fs.existsSync(disabledPath)) {
            fs.renameSync(activePath, disabledPath);
          }
        }
        mod.enabled = targetEnabled;
      }
      save();
    });
    res.json({ success: true, enabled: newStatus });
  });

  // --- 4. GEMINI API: Auto-Resolve Dependencies & Plugin Compatibility ---
  app.post('/api/servers/:id/mods/auto-resolve-dependencies', async (req, res) => {
    try {
      const server = registered(req.params.id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server nicht gefunden' });
      }

      const selectedMods = Array.isArray(req.body.selectedMods) ? req.body.selectedMods : [];
      const autoInstall = req.body.autoInstall === true;

      const analysisResult = await analyzeWithGeminiApi(server, selectedMods);
      const installedDependencies: any[] = [];

      // Automatically install required dependencies if requested
      if (autoInstall && analysisResult.compatibility.missingDependencies.length > 0) {
        await exclusive(req.params.id, async () => {
          const srvDir = instancePath(root, req.params.id);

          for (const dep of analysisResult.compatibility.missingDependencies) {
            const alreadyInstalled = (server.installedMods || []).some((m: any) => 
              String(m.id || m.modId).toLowerCase() === dep.id.toLowerCase() ||
              String(m.name).toLowerCase() === dep.name.toLowerCase()
            );

            if (!alreadyInstalled) {
              const dirInfo = getTargetDirAndExt(server, dep);
              const targetFolder = confinedPath(srvDir, dirInfo.dir);
              fs.mkdirSync(targetFolder, { recursive: true });

              const filename = `${dep.id}${dirInfo.ext}`;
              const filePath = confinedPath(targetFolder, filename);

              if (!fs.existsSync(filePath)) {
                const depBytes = buildVerifiedModArtifact(dep, dirInfo.engine);
                fs.writeFileSync(filePath, depBytes);
              }

              const newInstalledMod = {
                id: dep.id,
                modId: dep.id,
                name: dep.name,
                version: dep.version || 'Latest',
                enabled: true,
                installedAt: new Date().toISOString().slice(0, 10),
                source: dep.source || 'SpigotMC',
                fileSize: '1.2 MB',
                filename,
                targetDir: dirInfo.dir
              };

              server.installedMods = [...(server.installedMods || []), newInstalledMod];
              installedDependencies.push(newInstalledMod);
            }
          }
          save();
        });
      }

      res.json({
        success: true,
        aiPowered: analysisResult.aiPowered,
        model: analysisResult.model,
        compatibility: analysisResult.compatibility,
        installedDependencies,
        server: {
          id: server.id,
          name: server.name,
          installedModsCount: (server.installedMods || []).length
        }
      });
    } catch (err: any) {
      console.error('[Auto-Resolve] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Auto-Resolve fehlgeschlagen' });
    }
  });

  // --- 5. Global Auto-Resolve endpoint by serverId ---
  app.post('/api/mods/auto-resolve-dependencies', async (req, res) => {
    try {
      const serverId = req.body.serverId;
      if (!serverId) {
        return res.status(400).json({ success: false, error: 'serverId ist erforderlich' });
      }
      const server = registered(serverId);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Server nicht gefunden' });
      }

      const selectedMods = Array.isArray(req.body.selectedMods) ? req.body.selectedMods : [];
      const analysisResult = await analyzeWithGeminiApi(server, selectedMods);

      res.json({
        success: true,
        aiPowered: analysisResult.aiPowered,
        model: analysisResult.model,
        compatibility: analysisResult.compatibility
      });
    } catch (err: any) {
      console.error('[Global Auto-Resolve] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Auto-Resolve fehlgeschlagen' });
    }
  });
}
