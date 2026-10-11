import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import express from 'express';
import { confinedPath, instancePath } from './paths.ts';

export function configureFiles(app: Express, root: string, registered: (id: string) => any, exclusive: (id: string, action: () => Promise<any>) => Promise<any>) {
  const filePath = (id: string, value: unknown) => {
    registered(id);
    if (typeof value !== 'string') throw new Error('Dateipfad fehlt');
    return confinedPath(instancePath(root, id), value.replace(/^\/+/, ''));
  };
  app.get('/api/servers/:id/files', (req, res) => {
    const directory = filePath(req.params.id, req.query.path || '');
    const base = instancePath(root, req.params.id);
    const files = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => !entry.isSymbolicLink()).map(entry => {
      const target = confinedPath(base, path.relative(base, path.join(directory, entry.name)).split(path.sep).join('/'));
      const stat = fs.statSync(target);
      return { name: entry.name, path: '/' + path.relative(base, target).split(path.sep).join('/'), type: stat.isDirectory() ? 'directory' : 'file',
        sizeBytes: stat.size, lastModified: stat.mtime.toISOString(), isEditable: stat.isFile() && stat.size <= 1048576 && /\.(txt|json|yml|yaml|properties|cfg|ini|conf|log|xml|toml)$/i.test(entry.name) };
    });
    res.json({ success: true, files });
  });
  app.get('/api/servers/:id/file', (req, res) => {
    const target = filePath(req.params.id, req.query.path);
    if (fs.statSync(target).size > 1048576) throw new Error('Texteditor unterstützt Dateien bis 1 MiB; Download verwenden');
    res.json({ success: true, content: fs.readFileSync(target, 'utf8') });
  });
  app.get('/api/servers/:id/download', (req, res) => {
    const target = filePath(req.params.id, req.query.path);
    if (!fs.statSync(target).isFile()) throw new Error('Nur Dateien können heruntergeladen werden');
    res.download(target, path.basename(target));
  });
  app.post('/api/servers/:id/file', async (req, res) => {
    await exclusive(req.params.id, async () => {
      const target = filePath(req.params.id, req.body.path);
      if (typeof req.body.content !== 'string' || Buffer.byteLength(req.body.content) > 1048576) throw new Error('Text muss kleiner als 1 MiB sein');
      if (!fs.statSync(path.dirname(target)).isDirectory()) throw new Error('Übergeordneter Ordner fehlt');
      const temporary = confinedPath(instancePath(root, req.params.id), path.relative(instancePath(root, req.params.id), target + '.sonora-tmp').split(path.sep).join('/'));
      fs.writeFileSync(temporary, req.body.content, { flag: 'wx' });
      try { fs.renameSync(temporary, target); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    });
    res.json({ success: true });
  });
  app.post('/api/servers/:id/directory', async (req, res) => {
    await exclusive(req.params.id, async () => { fs.mkdirSync(filePath(req.params.id, req.body.path)); });
    res.json({ success: true });
  });
  app.post('/api/servers/:id/upload', express.raw({ type: 'application/octet-stream', limit: '32mb' }), async (req, res) => {
    await exclusive(req.params.id, async () => {
      if (!Buffer.isBuffer(req.body)) throw new Error('Binärer Dateiinhalt erforderlich');
      const target = filePath(req.params.id, req.query.path);
      fs.writeFileSync(target, req.body, { flag: 'wx' }); // Never overwrite an existing upload target.
    });
    res.json({ success: true });
  });
  app.delete('/api/servers/:id/file', async (req, res) => {
    await exclusive(req.params.id, async () => {
      const target = filePath(req.params.id, req.body.path);
      if (target === instancePath(root, req.params.id)) throw new Error('Instanzwurzel kann hier nicht gelöscht werden');
      if (fs.statSync(target).isDirectory()) fs.rmdirSync(target); // Empty directories only.
      else fs.unlinkSync(target);
    });
    res.json({ success: true });
  });
}
