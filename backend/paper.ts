import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { confinedPath } from './paths.ts';

const headers = { 'User-Agent': 'Sonora-Manager/0.1.1 (https://github.com/MeisterGamer/sonora-Gameserver-Manager)' };
const versionPattern = /^\d+\.\d+(?:\.\d+)?$/;
export { requiredPaperJava as paperJavaVersion } from '../src/data/installerSupport.ts';
export async function paperVersions(request: typeof fetch = fetch) {
  const response = await request('https://fill.papermc.io/v3/projects/paper', { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Paper-Versionsliste nicht verfügbar (HTTP ' + response.status + ')');
  const data = await response.json() as any;
  const versions = [...new Set<string>(Object.values(data.versions || {}).flat().filter((entry): entry is string => typeof entry === 'string' && versionPattern.test(entry)))];
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!versions.length) throw new Error('Paper liefert keine verwendbaren Versionen');
  return versions;
}
export async function downloadPaper(dir: string, version: string, request: typeof fetch = fetch, allowExperimental = false) {
  if (!version || !versionPattern.test(version)) throw new Error('Eine konkrete Paper-Version ist erforderlich');
  const response = await request('https://fill.papermc.io/v3/projects/paper/versions/' + version + '/builds', { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Paper ' + version + ' nicht verfügbar (HTTP ' + response.status + '); kein Versionswechsel');
  const data = await response.json() as any;
  const all = Array.isArray(data) ? data.filter(entry => ['STABLE', 'BETA', 'ALPHA'].includes(entry.channel) && Number.isSafeInteger(entry.id)) : [];
  const stable = all.filter(entry => entry.channel === 'STABLE');
  const beta = all.filter(entry => entry.channel === 'BETA');
  const builds = stable.length ? stable : allowExperimental ? beta.length ? beta : all.filter(entry => entry.channel === 'ALPHA') : [];
  builds.sort((a, b) => b.id - a.id);
  const build = builds[0], application = build?.downloads?.['server:default'];
  if (!application?.url || !/^[a-f0-9]{64}$/i.test(application.checksums?.sha256 || '')) throw new Error('Kein verifizierbarer stabiler Paper-Build für ' + version + '. Beta/Alpha nur mit ausdrücklicher Freigabe installieren; kein Versionswechsel.');
  const url = new URL(application.url);
  if (url.protocol !== 'https:' || url.hostname !== 'fill-data.papermc.io' || url.port || url.username || url.password) throw new Error('Paper-Downloadhost ungültig');
  const download = await request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!download.ok) throw new Error('Paper-Download fehlgeschlagen (HTTP ' + download.status + ')');
  const chunks: Buffer[] = []; let size = 0;
  const maximum = 256 * 1024 * 1024;
  if (Number(download.headers?.get('content-length')) > maximum) throw new Error('Paper-Datei zu groß');
  if (!download.body) throw new Error('Paper-Download enthält keine Daten');
  for await (const chunk of download.body as any) {
    size += chunk.length;
    if (size > maximum) throw new Error('Paper-Datei zu groß');
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || createHash('sha256').update(buffer).digest('hex') !== application.checksums.sha256.toLowerCase()) throw new Error('Paper-Datei oder SHA-256 ungültig');
  const jarPath = confinedPath(dir, 'paper.jar'), temporary = confinedPath(dir, 'paper.jar.' + randomUUID() + '.download');
  try {
    fs.writeFileSync(temporary, buffer, { flag: 'wx' });
    fs.renameSync(temporary, jarPath);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { success: true, version, build: build.id, channel: build.channel, allowExperimental, fileSizeMb: (buffer.length / 1048576).toFixed(1), jarPath };
}
