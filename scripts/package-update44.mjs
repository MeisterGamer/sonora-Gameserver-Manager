/**
 * Package Sonora Update 44 into a separate, uniquely named ZIP file (pure Node.js, no Python).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'updates');
fs.mkdirSync(outputDir, { recursive: true });

const archiveName = 'Sonora-Update44-2026-11-03.zip';
const archivePath = path.join(outputDir, archiveName);

const includeFiles = [
  'server.ts',
  'install.sh',
  'start-manager.sh',
  'install.bat',
  'start-manager.bat',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'metadata.json',
  'README.md',
  'AGENTS.md',
  '.env.example',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.gitattributes',
  '.gitignore'
];

const includeDirs = [
  'src',
  'backend',
  'dist',
  'audit',
  'scripts'
];

const excludedSegments = new Set(['node_modules', '.git', '__pycache__', 'updates']);
const filesToPack = new Map();

function walkDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedSegments.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile()) {
      const rel = path.relative(root, fullPath).split(path.sep).join('/');
      if (!rel.endsWith('.py')) {
        filesToPack.set(rel, fullPath);
      }
    }
  }
}

for (const file of includeFiles) {
  const fullPath = path.join(root, file);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    filesToPack.set(file, fullPath);
  }
}

for (const dir of includeDirs) {
  const fullDir = path.join(root, dir);
  if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
    walkDir(fullDir);
  }
}

const sortedNames = Array.from(filesToPack.keys()).sort();
const entriesMeta = {};
const zip = new AdmZip();

for (const relName of sortedNames) {
  const fullPath = filesToPack.get(relName);
  const content = fs.readFileSync(fullPath);
  entriesMeta[relName] = {
    bytes: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex')
  };
  zip.addFile(relName, content);
}

zip.writeZip(archivePath);
const zipBytes = fs.readFileSync(archivePath);

const meta = {
  archive: archiveName,
  size_bytes: zipBytes.length,
  sha256: crypto.createHash('sha256').update(zipBytes).digest('hex'),
  files_count: sortedNames.length,
  created_at: new Date().toISOString(),
  description:
    'Update 44 (ohne Python): Schliesst alle verbleibenden Schlupfloecher fuer VRisingServer.exe MZ: not found / Exit Code 2 unter Linux: ' +
    '(1) Entfernt Execute-Bit (chmod 644) von .exe-Dateien unter Linux, damit /bin/sh & execvp keine PE-Binaries mehr als Shell-Skript ausfuehren; ' +
    '(2) ServerDiagnostics & SteamCMD generieren Wine/Podman/Docker-sichere start.sh/run.sh Wrapper statt `exec ./VRisingServer.exe`; ' +
    '(3) server.ts erkennt und repariert fehlerhafte .sh-Wrapper automatisch beim Start und erzwingt einen harten Last-Line-Guard vor spawn(); ' +
    '(4) Debian-13-sichere Wine-Pfaderkennung (/usr/lib/wine/wine64, wine xvfb) & verbesserter Log-Analyzer Quick-Fix.',
  files: entriesMeta
};

const metaPath = path.join(outputDir, archiveName.replace(/\.zip$/i, '.json'));
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

console.log(`Created update archive: ${archiveName} (${zipBytes.length} bytes)`);
