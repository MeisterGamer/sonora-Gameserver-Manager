import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Express } from 'express';
import { confinedPath, instancePath } from './paths.ts';

const run = promisify(execFile);

export interface BackupHooks {
  stopServer?: (id: string) => Promise<void>;
  isServerRunning?: (id: string) => boolean;
  recordAuditLog?: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'security' | 'success';
  }) => void;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
}

export function configureBackups(
  app: Express,
  root: string,
  state: string,
  registered: (id: string) => any,
  exclusive: (id: string, action: () => Promise<any>) => Promise<any>,
  assertStopped: (id: string) => void,
  saveRegistry: () => void,
  hooks?: BackupHooks
) {
  const directory = (id: string) => {
    registered(id);
    const dir = path.join(state, 'backups', id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  const metadata = (id: string, backupId: unknown) => {
    if (typeof backupId !== 'string' || !/^bk_[0-9]+_[a-f0-9]+$/.test(backupId)) {
      throw new Error('Ungültige Backup-ID');
    }
    const dir = directory(id);
    const metaPath = confinedPath(dir, backupId + '.json');
    const archivePath = confinedPath(dir, backupId + '.tar.gz');
    if (!fs.existsSync(metaPath) || !fs.existsSync(archivePath)) {
      throw new Error('Backup wurde nicht gefunden.');
    }
    const info = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return { info, archive: archivePath, meta: metaPath };
  };

  const checkTree = (dir: string): number => {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()) || /[\r\n\\:]/.test(entry.name)) {
        throw new Error('Backup enthält nicht unterstützte Verknüpfungen/Sonderdateien/Dateinamen');
      }
      if (entry.isFile()) {
        if (fs.statSync(path.join(dir, entry.name)).nlink > 1) {
          throw new Error('Hardlinks werden in Backups derzeit nicht unterstützt');
        }
        count += 1;
      }
      if (entry.isDirectory()) {
        count += checkTree(path.join(dir, entry.name));
      }
    }
    return count;
  };

  const hashFile = async (file: string) => {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };

  const listBackupsForServer = (id: string) => {
    const dir = directory(id);
    return fs
      .readdirSync(dir)
      .filter(file => /^bk_[0-9]+_[a-f0-9]+\.json$/.test(file))
      .map(file => {
        try {
          return JSON.parse(fs.readFileSync(confinedPath(dir, file), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  };

  const createArchiveInternal = async (
    id: string,
    opts: { label?: string; notes?: string; type?: 'manual' | 'scheduled' | 'pre_rollback' } = {}
  ) => {
    const source = instancePath(root, id);
    if (!fs.existsSync(source)) {
      fs.mkdirSync(source, { recursive: true });
    }
    const fileCount = checkTree(source);
    const backupId = 'bk_' + Date.now() + '_' + randomBytes(6).toString('hex');
    const backupDir = directory(id);
    const archive = confinedPath(backupDir, backupId + '.tar.gz');
    try {
      const tarCreateArgs =
        process.platform === 'win32'
          ? ['-czf', archive, '-C', source, '.']
          : ['--warning=no-file-changed', '-czf', archive, '-C', source, '.'];
      await run('tar', tarCreateArgs, { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
      const server = registered(id);
      const cleanLabel = String(opts.label || '').trim().slice(0, 80);
      const cleanNotes = String(opts.notes || '').trim().slice(0, 240);
      const info = {
        id: backupId,
        name: backupId + '.tar.gz',
        label: cleanLabel || (opts.type === 'pre_rollback' ? 'Sicherheits-Snapshot vor Rollback' : 'Manuelles Backup'),
        notes: cleanNotes || undefined,
        createdAt: new Date().toISOString(),
        fileSizeMb: fs.statSync(archive).size / 1048576,
        fileCount,
        type: opts.type || 'manual',
        sha256: await hashFile(archive),
        server: {
          version: server.version,
          minecraftType: server.minecraftType,
          installedMods: server.installedMods
        }
      };
      fs.writeFileSync(confinedPath(backupDir, backupId + '.json'), JSON.stringify(info, null, 2), {
        flag: 'wx',
        mode: 0o600
      });
      return info;
    } catch (error) {
      if (fs.existsSync(archive)) fs.unlinkSync(archive);
      throw error;
    }
  };

  // --- LIST BACKUPS ---
  app.get('/api/servers/:id/backups', (req, res) => {
    try {
      const backups = listBackupsForServer(req.params.id);
      const totalSizeMb = backups.reduce((sum, b) => sum + (Number(b.fileSizeMb) || 0), 0);
      res.json({
        success: true,
        backups,
        totalSizeMb: Math.round(totalSizeMb * 100) / 100
      });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  // --- CREATE MANUAL BACKUP ---
  app.post(['/api/servers/:id/backups', '/api/servers/:id/backup'], async (req, res) => {
    try {
      const backup = await exclusive(req.params.id, async () => {
        const allowLive = req.body?.allowRunning || req.query?.allowRunning;
        if (!allowLive) {
          assertStopped(req.params.id);
        }
        return createArchiveInternal(req.params.id, {
          label: req.body?.label || req.body?.name,
          notes: req.body?.notes,
          type: req.body?.type === 'scheduled' ? 'scheduled' : 'manual'
        });
      });

      hooks?.appendLog?.(
        req.params.id,
        'SUCCESS',
        `[Backup-Manager] Backup "${backup.label}" (${backup.fileSizeMb.toFixed(2)} MB) erstellt.`
      );
      hooks?.recordAuditLog?.({
        serverId: req.params.id,
        action: 'backup',
        details: `Backup "${backup.label}" (${backup.name}, ${backup.fileSizeMb.toFixed(2)} MB) erstellt.`,
        severity: 'success'
      });

      res.json({
        success: true,
        backup,
        backups: listBackupsForServer(req.params.id),
        message: `Backup „${backup.label}“ erfolgreich erstellt (${backup.fileSizeMb.toFixed(2)} MB).`
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // --- DOWNLOAD BACKUP ARCHIVE ---
  app.get('/api/servers/:id/backups/:backupId/download', (req, res) => {
    try {
      const backup = metadata(req.params.id, req.params.backupId);
      res.download(backup.archive, backup.info.name);
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  // --- ONE-CLICK ROLLBACK / RESTORE ---
  app.post(
    ['/api/servers/:id/backups/:backupId/restore', '/api/servers/:id/backups/:backupId/rollback'],
    async (req, res) => {
      try {
        const result = await exclusive(req.params.id, async () => {
          const autoStop = req.body?.autoStop !== false;
          const createSafetyBackup = req.body?.createSafetyBackup === true;

          // If server is running, optionally stop gracefully before rollback
          if (hooks?.isServerRunning?.(req.params.id)) {
            if (autoStop && hooks.stopServer) {
              await hooks.stopServer(req.params.id);
            } else {
              assertStopped(req.params.id);
            }
          } else {
            assertStopped(req.params.id);
          }

          const backup = metadata(req.params.id, req.params.backupId);
          if ((await hashFile(backup.archive)) !== backup.info.sha256) {
            throw new Error('Backup-Prüfsumme (SHA-256) ungültig; Rollback aus Sicherheitsgründen abgebrochen.');
          }

          const listing = await run('tar', ['-tvzf', backup.archive], {
            timeout: 120000,
            maxBuffer: 16 * 1024 * 1024
          });
          if (listing.stdout.split(/\r?\n/).some(line => line && !['d', '-'].includes(line[0]))) {
            throw new Error('Archiv enthält nicht unterstützte Verknüpfungen/Sonderdateien.');
          }

          const names = await run('tar', ['-tzf', backup.archive], {
            timeout: 120000,
            maxBuffer: 16 * 1024 * 1024
          });

          // Optional safety snapshot before replacing current server files
          let safetyBackup: any = null;
          const source = instancePath(root, req.params.id);
          if (createSafetyBackup && fs.existsSync(source)) {
            try {
              safetyBackup = await createArchiveInternal(req.params.id, {
                label: `Auto-Sicherung vor Rollback (${backup.info.label || backup.info.id})`,
                type: 'pre_rollback'
              });
            } catch {
              // Non-fatal: recovery copy below still preserves previous state
            }
          }

          const stage = fs.mkdtempSync(path.join(root, '.restore-'));
          try {
            for (const name of names.stdout.split(/\r?\n/).filter(Boolean)) {
              confinedPath(stage, name);
            }
            await run('tar', ['-xzf', backup.archive, '-C', stage], {
              timeout: 30 * 60 * 1000,
              maxBuffer: 4 * 1024 * 1024
            });
            checkTree(stage);

            const recovery = path.join(state, 'restore-recovery');
            fs.mkdirSync(recovery, { recursive: true });
            const previous = path.join(recovery, req.params.id + '-' + Date.now());
            const hadSource = fs.existsSync(source);
            if (hadSource) {
              fs.renameSync(source, previous);
            }
            try {
              fs.renameSync(stage, source);
            } catch (error) {
              if (hadSource && fs.existsSync(previous)) {
                fs.renameSync(previous, source);
              }
              throw error;
            }
          } catch (err) {
            if (fs.existsSync(stage)) {
              fs.rmSync(stage, { recursive: true, force: true });
            }
            throw err;
          }

          if (backup.info.server) {
            Object.assign(registered(req.params.id), backup.info.server);
            saveRegistry();
          }

          return { restoredBackup: backup.info, safetyBackup };
        });

        hooks?.appendLog?.(
          req.params.id,
          'SUCCESS',
          `[Backup-Manager] Rollback auf "${result.restoredBackup.label || result.restoredBackup.name}" erfolgreich durchgeführt.`
        );
        hooks?.recordAuditLog?.({
          serverId: req.params.id,
          action: 'backup',
          details: `Rollback auf Backup "${result.restoredBackup.label || result.restoredBackup.name}" durchgeführt.`,
          severity: 'warning'
        });

        res.json({
          success: true,
          restoredBackup: result.restoredBackup,
          safetyBackup: result.safetyBackup,
          backups: listBackupsForServer(req.params.id),
          message: result.safetyBackup
            ? `Rollback auf „${result.restoredBackup.label || result.restoredBackup.name}“ abgeschlossen. Vorheriger Zustand als Sicherheits-Snapshot gespeichert.`
            : `Rollback auf „${result.restoredBackup.label || result.restoredBackup.name}“ erfolgreich abgeschlossen.`
        });
      } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
      }
    }
  );

  // --- DELETE BACKUP ---
  app.delete('/api/servers/:id/backups/:backupId', async (req, res) => {
    try {
      await exclusive(req.params.id, async () => {
        const backup = metadata(req.params.id, req.params.backupId);
        fs.unlinkSync(backup.archive);
        fs.unlinkSync(backup.meta);
      });
      hooks?.recordAuditLog?.({
        serverId: req.params.id,
        action: 'backup',
        details: `Backup ${req.params.backupId} gelöscht.`,
        severity: 'warning'
      });
      res.json({ success: true, backups: listBackupsForServer(req.params.id) });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
}
