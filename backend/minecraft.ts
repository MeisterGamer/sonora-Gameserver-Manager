import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { confinedPath } from './paths.ts';
import { downloadPaper, paperVersions, paperJavaVersion } from './paper.ts';

const headers = { 'User-Agent': 'Sonora-Manager/0.1.1 (https://github.com/MeisterGamer/sonora-Gameserver-Manager)' };
const versionPattern = /^\d+\.\d+(?:\.\d+)?$/;
export const MINECRAFT_JARS: Record<string, string> = { paper: 'paper.jar', purpur: 'purpur.jar', vanilla: 'server.jar' };
function officialUrl(value: string, hosts: string[]) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port) throw new Error('Ungültiger offizieller Downloadhost');
  return url;
}
async function json(url: string | URL, request: typeof fetch) {
  const response = await request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Downloadmetadaten nicht verfügbar (HTTP ' + response.status + ')');
  return response.json() as Promise<any>;
}
async function vanillaManifest(request: typeof fetch) {
  const manifest = await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', request);
  if (!Array.isArray(manifest.versions)) throw new Error('Minecraft-Versionsliste ungültig');
  return manifest.versions.filter((entry: any) => entry.type === 'release' && versionPattern.test(entry.id));
}
export async function minecraftVersions(engine: string, request: typeof fetch = fetch) {
  if (engine === 'paper') return paperVersions(request);
  const raw = engine === 'vanilla' ? (await vanillaManifest(request)).map((entry: any) => entry.id)
    : engine === 'purpur' ? (await json('https://api.purpurmc.org/v2/purpur', request)).versions : [];
  if (!Array.isArray(raw) || !raw.length) throw new Error('Kein Versionsadapter für diese Engine verfügbar');
  return [...new Set<string>(raw.filter((entry): entry is string => typeof entry === 'string' && versionPattern.test(entry)))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
export async function downloadMinecraft(dir: string, engine: string, version: string, request: typeof fetch = fetch, allowExperimental = false) {
  if (!MINECRAFT_JARS[engine] || !versionPattern.test(version)) throw new Error('Minecraft-Engine oder Version ungültig');
  if (engine === 'paper') return { ...await downloadPaper(dir, version, request, allowExperimental), requiredJava: paperJavaVersion(version) };
  let url: URL, algorithm: string, expected: string, build: number | undefined, requiredJava: number, channel = 'STABLE';
  if (engine === 'purpur') {
    const metadata = await json('https://api.purpurmc.org/v2/purpur/' + version + '/latest', request);
    if (metadata.result !== 'SUCCESS' || metadata.version !== version || !/^\d+$/.test(String(metadata.build)) || !/^[a-f0-9]{32}$/i.test(metadata.md5 || '')) throw new Error('Purpur-Build-Metadaten ungültig');
    if (metadata.metadata?.type === 'experimental') {
      if (!allowExperimental) throw new Error('Experimenteller Purpur-Build benötigt ausdrückliche Freigabe');
      channel = 'EXPERIMENTAL';
    }
    build = Number(metadata.build); requiredJava = paperJavaVersion(version);
    url = new URL('https://api.purpurmc.org/v2/purpur/' + version + '/' + build + '/download');
    algorithm = 'md5'; expected = metadata.md5.toLowerCase();
  } else {
    const selected = (await vanillaManifest(request)).find((entry: any) => entry.id === version);
    if (!selected) throw new Error('Minecraft-Release ' + version + ' nicht verfügbar; kein Versionswechsel');
    const metadataUrl = officialUrl(selected.url, ['piston-meta.mojang.com', 'launchermeta.mojang.com']);
    const response = await request(metadataUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Minecraft-Versionsmetadaten nicht verfügbar');
    const text = await response.text();
    if (!/^[a-f0-9]{40}$/i.test(selected.sha1 || '') || createHash('sha1').update(text).digest('hex') !== selected.sha1.toLowerCase()) throw new Error('Minecraft-Metadaten-Prüfsumme ungültig');
    const metadata = JSON.parse(text), application = metadata.downloads?.server;
    if (metadata.id !== version || !/^[a-f0-9]{40}$/i.test(application?.sha1 || '')) throw new Error('Kein verifizierbarer Vanilla-Server für diese Version');
    url = officialUrl(application.url, ['piston-data.mojang.com', 'launcher.mojang.com']);
    algorithm = 'sha1'; expected = application.sha1.toLowerCase();
    requiredJava = metadata.javaVersion?.majorVersion || 8;
    if (!Number.isInteger(requiredJava) || requiredJava < 8 || requiredJava > 99) throw new Error('Java-Metadaten ungültig');
  }
  const response = await request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error('Minecraft-Server-Download fehlgeschlagen');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of response.body as any) {
    size += chunk.length;
    if (size > 256 * 1024 * 1024) throw new Error('Minecraft-Server-Datei zu groß');
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || createHash(algorithm).update(buffer).digest('hex') !== expected) throw new Error('Minecraft-JAR oder Hersteller-Prüfsumme ungültig');
  const jarPath = confinedPath(dir, MINECRAFT_JARS[engine]), temporary = confinedPath(dir, randomUUID() + '.download');
  try { fs.writeFileSync(temporary, buffer, { flag: 'wx' }); fs.renameSync(temporary, jarPath); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { success: true, version, build, channel, allowExperimental, requiredJava, fileSizeMb: (buffer.length / 1048576).toFixed(1), jarPath };
}
