import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Express } from 'express';
import { confinedPath, instancePath } from './paths.ts';

const run = promisify(execFile);
export function configureBackups(app: Express, root: string, state: string, registered: (id: string) => any,
  exclusive: (id: string, action: () => Promise<any>) => Promise<any>, assertStopped: (id: string) => void, saveRegistry: () => void) {
  const directory = (id: string) => { registered(id); const dir = path.join(state, 'backups', id); fs.mkdirSync(dir, { recursive: true }); return dir; };
  const metadata = (id: string, backupId: unknown) => {
    if (typeof backupId !== 'string' || !/^bk_[0-9]+_[a-f0-9]+$/.test(backupId)) throw new Error('Ungültige Backup-ID');
    const dir = directory(id);
    const info = JSON.parse(fs.readFileSync(confinedPath(dir, backupId + '.json'), 'utf8'));
    return { info, archive: confinedPath(dir, backupId + '.tar.gz'), meta: confinedPath(dir, backupId + '.json') };
  };
  const checkTree = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile() || /[\r\n\\:]/.test(entry.name)) throw new Error('Backup enthält nicht unterstützte Verknüpfungen/Sonderdateien/Dateinamen');
      if (entry.isFile() && fs.statSync(path.join(dir, entry.name)).nlink > 1) throw new Error('Hardlinks werden in Backups derzeit nicht unterstützt');
      if (entry.isDirectory()) checkTree(path.join(dir, entry.name));
    }
  };
  const hashFile = async (file: string) => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };
  app.get('/api/servers/:id/backups', (req, res) => {
    const dir = directory(req.params.id);
    const backups = fs.readdirSync(dir).filter(file => /^bk_[0-9]+_[a-f0-9]+\.json$/.test(file)).map(file => {
      const info = JSON.parse(fs.readFileSync(confinedPath(dir, file), 'utf8'));
      return info;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, backups });
  });
  app.post(['/api/servers/:id/backups', '/api/servers/:id/backup'], async (req, res) => {
    try {
      const backup = await exclusive(req.params.id, async () => {
        const allowLive = req.body?.allowRunning || req.query?.allowRunning;
        if (!allowLive) {
          assertStopped(req.params.id);
        }
        const source = instancePath(root, req.params.id);
        if (!fs.existsSync(source)) {
          fs.mkdirSync(source, { recursive: true });
        }
        checkTree(source);
        const id = 'bk_' + Date.now() + '_' + randomBytes(6).toString('hex');
        const backupDir = directory(req.params.id);
        const archive = confinedPath(backupDir, id + '.tar.gz');
        try {
          const tarCreateArgs = process.platform === 'win32'
            ? ['-czf', archive, '-C', source, '.']
            : ['--warning=no-file-changed', '-czf', archive, '-C', source, '.'];
          await run('tar', tarCreateArgs, { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
          const server = registered(req.params.id);
          const info = {
            id,
            name: id + '.tar.gz',
            createdAt: new Date().toISOString(),
            fileSizeMb: fs.statSync(archive).size / 1048576,
            type: 'manual',
            sha256: await hashFile(archive),
            server: {
              version: server.version,
              minecraftType: server.minecraftType,
              installedMods: server.installedMods
            }
          };
          fs.writeFileSync(confinedPath(backupDir, id + '.json'), JSON.stringify(info, null, 2), { flag: 'wx', mode: 0o600 });
          return info;
        } catch (error) {
          if (fs.existsSync(archive)) fs.unlinkSync(archive);
          throw error;
        }
      });
      res.json({ success: true, backup, message: `Backup erfolgreich erstellt (${backup.name}).` });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  app.get('/api/servers/:id/backups/:backupId/download', (req, res) => {
    const backup = metadata(req.params.id, req.params.backupId);
    res.download(backup.archive, backup.info.name);
  });
  app.post('/api/servers/:id/backups/:backupId/restore', async (req, res) => {
    await exclusive(req.params.id, async () => {
      assertStopped(req.params.id);
      const backup = metadata(req.params.id, req.params.backupId);
      if (await hashFile(backup.archive) !== backup.info.sha256) throw new Error('Backup-Prüfsumme ungültig; Wiederherstellung abgebrochen');
      const listing = await run('tar', ['-tvzf', backup.archive], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
      if (listing.stdout.split(/\r?\n/).some(line => line && !['d', '-'].includes(line[0]))) throw new Error('Archiv enthält Verknüpfungen/Sonderdateien');
      const names = await run('tar', ['-tzf', backup.archive], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
      const stage = fs.mkdtempSync(path.join(root, '.restore-'));
      for (const name of names.stdout.split(/\r?\n/).filter(Boolean)) confinedPath(stage, name);
      await run('tar', ['-xzf', backup.archive, '-C', stage], { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
      checkTree(stage);
      const source = instancePath(root, req.params.id);
      const recovery = path.join(state, 'restore-recovery');
      fs.mkdirSync(recovery, { recursive: true });
      const previous = path.join(recovery, req.params.id + '-' + Date.now());
      fs.renameSync(source, previous);
      try { fs.renameSync(stage, source); }
      catch (error) { fs.renameSync(previous, source); throw error; }
      if (backup.info.server) {
        Object.assign(registered(req.params.id), backup.info.server);
        saveRegistry();
      }
    });
    res.json({ success: true, message: 'Backup wiederhergestellt; vorherige Dateien im Wiederherstellungsordner erhalten' });
  });
  app.delete('/api/servers/:id/backups/:backupId', async (req, res) => {
    await exclusive(req.params.id, async () => { const backup = metadata(req.params.id, req.params.backupId); fs.unlinkSync(backup.archive); fs.unlinkSync(backup.meta); });
    res.json({ success: true });
  });
}
