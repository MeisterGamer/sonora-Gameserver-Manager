import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { confinedPath, instancePath } from './paths.ts';

export function configureMods(app: Express, root: string, registered: (id: string) => any, save: () => void,
  exclusive: (id: string, action: () => Promise<any>) => Promise<any>, assertStopped: (id: string) => void) {
  const target = (id: string, filename: string) => confinedPath(instancePath(root, id), 'plugins/' + filename);
  app.post('/api/servers/:id/mods', async (req, res) => {
    await exclusive(req.params.id, async () => {
      assertStopped(req.params.id);
      const server = registered(req.params.id);
      const mod = req.body.mod;
      if (server.category !== 'minecraft' || server.minecraftType && server.minecraftType !== 'paper') throw new Error('Automatische Erweiterungsinstallation unterstützt derzeit Paper-Plugins');
      if (mod?.source !== 'Modrinth') throw new Error('Für diesen Anbieter ist noch kein geprüfter Downloadadapter implementiert');
      const project = String(mod.id || '').replace(/^mr_/, '');
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(project)) throw new Error('Ungültige Modrinth-Projekt-ID');
      const query = new URLSearchParams({ game_versions: JSON.stringify([server.version]), loaders: JSON.stringify(['paper', 'spigot', 'bukkit']) });
      const versionsResponse = await fetch('https://api.modrinth.com/v2/project/' + project + '/version?' + query, { signal: AbortSignal.timeout(30000) });
      if (!versionsResponse.ok) throw new Error('Modrinth-Versionen konnten nicht geladen werden');
      const versions: any = await versionsResponse.json();
      const version = versions.find((entry: any) => entry.game_versions?.includes(server.version) && entry.loaders?.some((loader: string) => ['paper', 'spigot', 'bukkit'].includes(loader)));
      if (!version) throw new Error('Kein Plugin für die installierte Paper-Version verfügbar');
      if (version.dependencies?.some((dependency: any) => dependency.dependency_type === 'required')) throw new Error('Erweiterung benötigt zusätzliche Abhängigkeiten; automatische Abhängigkeitsauflösung noch nicht implementiert');
      const file = version.files?.find((entry: any) => entry.primary) || version.files?.[0];
      if (!file?.hashes?.sha512 || file.size > 100 * 1024 * 1024) throw new Error('Unverifizierbarer oder zu großer Plugin-Download');
      const url = new URL(file.url);
      if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com' || url.username || url.password || url.port) throw new Error('Downloadhost nicht erlaubt');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error('Plugin-Download fehlgeschlagen');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of response.body as any) {
        size += chunk.length; if (size > 100 * 1024 * 1024) throw new Error('Plugin-Download zu groß');
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || createHash('sha512').update(bytes).digest('hex') !== file.hashes.sha512) throw new Error('Plugin-Datei oder Prüfsumme ungültig');
      const filename = project + '.jar';
      fs.mkdirSync(confinedPath(instancePath(root, req.params.id), 'plugins'), { recursive: true });
      const temporary = target(req.params.id, filename + '.download');
      fs.writeFileSync(temporary, bytes, { flag: 'wx' });
      try { fs.renameSync(temporary, target(req.params.id, filename)); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      const existing = server.installedMods?.find((entry: any) => entry.modId === mod.id);
      if (existing && !existing.enabled && fs.existsSync(target(req.params.id, existing.filename + '.disabled'))) fs.unlinkSync(target(req.params.id, existing.filename + '.disabled'));
      server.installedMods = [...(server.installedMods || []).filter((entry: any) => entry.modId !== mod.id), {
        id: project, modId: mod.id, name: mod.name || project, version: version.version_number, enabled: true,
        installedAt: new Date().toISOString().slice(0, 10), source: 'Modrinth', fileSize: (bytes.length / 1048576).toFixed(2) + ' MB', filename,
      }];
      save();
    });
    res.json({ success: true });
  });
  app.delete('/api/servers/:id/mods', async (req, res) => {
    await exclusive(req.params.id, async () => {
      assertStopped(req.params.id);
      const server = registered(req.params.id);
      const mod = server.installedMods.find((entry: any) => entry.id === req.body.installedModId);
      if (!mod?.filename) throw new Error('Installierte Erweiterung nicht gefunden');
      fs.unlinkSync(target(req.params.id, mod.filename + (mod.enabled ? '' : '.disabled')));
      server.installedMods = server.installedMods.filter((entry: any) => entry !== mod); save();
    });
    res.json({ success: true });
  });
  app.post('/api/servers/:id/mods/toggle', async (req, res) => {
    await exclusive(req.params.id, async () => {
      assertStopped(req.params.id);
      const server = registered(req.params.id);
      const mod = server.installedMods.find((entry: any) => entry.id === req.body.installedModId);
      if (!mod?.filename || typeof req.body.enabled !== 'boolean') throw new Error('Ungültige Erweiterung/Aktion');
      if (mod.enabled === req.body.enabled) return;
      fs.renameSync(target(req.params.id, mod.filename + (mod.enabled ? '' : '.disabled')), target(req.params.id, mod.filename + (req.body.enabled ? '' : '.disabled')));
      mod.enabled = req.body.enabled; save();
    });
    res.json({ success: true });
  });
}
