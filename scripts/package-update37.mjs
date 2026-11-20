/**
 * Package Sonora Update 37 into a separate, uniquely named ZIP file (pure Node.js, no Python).
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

const archiveName = 'Sonora-Update37-2026-10-27.zip';
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
    'Debian 12/13 apt-Konflikt behoben: iptables-persistent aus install.sh entfernt (kollidierte mit ufw: Breaks iptables-persistent), ' +
    'Basispakete (git, curl, build-essential usw.) getrennt von ufw/iptables/fail2ban installiert und die iptables Anti-DDoS-Kette ' +
    '(SONORA_DDOS) konfliktfrei über /usr/local/sbin/sonora-ddos-apply.sh + systemd-Dienst sonora-ddos.service bootfest persistiert.',
  files: entriesMeta
};

const metaPath = path.join(outputDir, archiveName.replace(/\.zip$/i, '.json'));
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

console.log(`Created update archive: ${archiveName} (${zipBytes.length} bytes)`);
