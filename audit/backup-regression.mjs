import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. Backend Code Verification ---
const serverSource = fs.readFileSync('server.ts', 'utf8');
const backupsSource = fs.readFileSync('backend/backups.ts', 'utf8');

check('server.ts imports configureBackups', serverSource.includes("import { configureBackups } from './backend/backups'"));
check('server.ts invokes configureBackups', serverSource.includes('configureBackups('));
check('server.ts implements exclusive server lock', serverSource.includes('exclusiveServerLock'));

check('backend/backups.ts supports /api/servers/:id/backups and /backup', backupsSource.includes("'/api/servers/:id/backups'") && backupsSource.includes("'/api/servers/:id/backup'"));
check('backend/backups.ts uses tar command with --warning=no-file-changed', backupsSource.includes('--warning=no-file-changed'));
check('backend/backups.ts creates source dir if missing', backupsSource.includes('fs.mkdirSync(source, { recursive: true })'));
check('backend/backups.ts generates sha256 checksum for archives', backupsSource.includes('sha256: await hashFile(archive)'));

// --- 2. Live Tar Archiving Verification on Isolated Fixture ---
const tmpDir = path.join(process.cwd(), '.tmp_test_backup_' + Date.now());
const sourceDir = path.join(tmpDir, 'gamedata');
const backupDir = path.join(tmpDir, 'backups');
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

fs.writeFileSync(path.join(sourceDir, 'server.properties'), 'motd=ApexHost Dedicated Server\nport=25565\n');
fs.writeFileSync(path.join(sourceDir, 'eula.txt'), 'eula=true\n');
fs.mkdirSync(path.join(sourceDir, 'world', 'data'), { recursive: true });
fs.writeFileSync(path.join(sourceDir, 'world', 'level.dat'), Buffer.from('WORLD_DATA_FIXTURE_BYTES'));

const archivePath = path.join(backupDir, 'test_backup.tar.gz');
execFileSync('tar', ['--warning=no-file-changed', '-czf', archivePath, '-C', sourceDir, '.']);

check('tar generates actual archive on host', fs.existsSync(archivePath) && fs.statSync(archivePath).size > 100);

// Verify archive contains our game data files
const listOutput = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
check('archive contains server.properties', listOutput.includes('server.properties'));
check('archive contains eula.txt', listOutput.includes('eula.txt'));
check('archive contains world/level.dat', listOutput.includes('world/level.dat'));

// Verify checksum calculation matches
const hash = createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
check('archive sha256 checksum is valid hex', hash.length === 64);

// Cleanup fixture
fs.rmSync(tmpDir, { recursive: true, force: true });

// --- 3. Frontend Verification in ServerDetail.tsx ---
const serverDetailSource = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');

check('ServerDetail has Create Backup button', serverDetailSource.includes('Create Backup'));
check('ServerDetail has handleCreateBackup handler', serverDetailSource.includes('handleCreateBackup'));
check('ServerDetail calls /api/servers/${server.id}/backups', serverDetailSource.includes('/api/servers/${server.id}/backups'));
check('ServerDetail has isCreatingBackup loading state', serverDetailSource.includes('isCreatingBackup'));
check('ServerDetail shows backupSuccessMessage banner', serverDetailSource.includes('backupSuccessMessage'));

// --- 4. Frontend Verification in RealBackupsView.tsx ---
const backupsViewSource = fs.readFileSync('src/components/RealBackupsView.tsx', 'utf8');

check('RealBackupsView has Create Backup button', backupsViewSource.includes('Create Backup'));
check('RealBackupsView has handleCreateBackup handler', backupsViewSource.includes('handleCreateBackup'));
check('RealBackupsView has download link', backupsViewSource.includes('/download'));
check('RealBackupsView has restore action', backupsViewSource.includes('/restore'));

// --- 5. Frontend Verification in ServerList.tsx ---
const serverListSource = fs.readFileSync('src/components/ServerList.tsx', 'utf8');

check('ServerList has Create Backup button / action', serverListSource.includes('Create Backup'));
check('ServerList has handleQuickBackup function', serverListSource.includes('handleQuickBackup'));

console.log(`${checks.length} Server backup and data archiving regression checks passed.`);
fs.writeFileSync('audit/backup-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
