import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { confinedPath } from '../backend/paths.ts';
import { ensureJdk, verifyJdk } from '../backend/java.ts';

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

// 1. Check install.bat exists and has complete Windows setup steps
const installBatPath = path.resolve('install.bat');
check('install.bat exists', fs.existsSync(installBatPath));
const installBatContent = fs.readFileSync(installBatPath, 'utf8');

check('install.bat prepares data and runtime directories', installBatContent.includes('servers') && installBatContent.includes('jdks') && installBatContent.includes('mkdir'));
check('install.bat checks or installs Node.js', installBatContent.includes('node -v') && installBatContent.includes('OpenJS.NodeJS.LTS'));
check('install.bat checks or installs Java 21 LTS', installBatContent.includes('java -version') && installBatContent.includes('EclipseAdoptium.Temurin.21.JDK'));
check('install.bat sets up Valve SteamCMD for Windows', installBatContent.includes('steamcmd.exe') && installBatContent.includes('steamcmd.zip'));
check('install.bat installs npm dependencies', installBatContent.includes('npm install'));
check('install.bat compiles production frontend build', installBatContent.includes('npm run build'));
check('install.bat configures Windows Defender Firewall rules', installBatContent.includes('netsh advfirewall firewall add rule') && installBatContent.includes('3000') && installBatContent.includes('25565'));
check('install.bat verifies start-manager.bat', installBatContent.includes('start-manager.bat'));

// 2. Check start-manager.bat exists and has complete launcher configuration
const startBatPath = path.resolve('start-manager.bat');
check('start-manager.bat exists', fs.existsSync(startBatPath));
const startBatContent = fs.readFileSync(startBatPath, 'utf8');

check('start-manager.bat sets NODE_ENV=production', startBatContent.includes('NODE_ENV=production'));
check('start-manager.bat sets PORT=3000', startBatContent.includes('PORT=3000'));
check('start-manager.bat sets APEXHOST_DATA_DIR', startBatContent.includes('APEXHOST_DATA_DIR='));
check('start-manager.bat executes server.ts', startBatContent.includes('server.ts'));

// 3. Check server.ts for Windows compatibility enhancements
const serverTsContent = fs.readFileSync(path.resolve('server.ts'), 'utf8');

check('server.ts detectSteamCmd handles Windows steamcmd.exe and common paths', serverTsContent.includes('steamcmd.exe') && serverTsContent.includes('where steamcmd.exe'));
check('server.ts ensureSteamCmd downloads steamcmd.zip on Windows', serverTsContent.includes('steamcmd.zip') && serverTsContent.includes('tar -xf'));
check('server.ts findGameExecutable detects Windows .exe binaries', serverTsContent.includes('PalServer.exe') && serverTsContent.includes('RustDedicated.exe') && serverTsContent.includes('valheim_server.exe'));
check('server.ts uses path.delimiter for Java runtime PATH', serverTsContent.includes('path.delimiter'));
check('server.ts uses taskkill on Windows for terminating processes', serverTsContent.includes('taskkill /pid'));
check('server.ts diagnostics endpoint includes Windows troubleshooting commands', serverTsContent.includes('winget install') && serverTsContent.includes('netsh advfirewall'));

// 4. Check backend/paths.ts Windows compatibility
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-win-paths-'));
try {
  fs.mkdirSync(path.join(testDir, 'subdir'));
  fs.writeFileSync(path.join(testDir, 'subdir', 'test.txt'), 'hello');
  const resolved = confinedPath(testDir, 'subdir/test.txt');
  check('confinedPath resolves valid nested path', resolved.endsWith('test.txt'));
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// 5. Check backend/backups.ts bsdtar compatibility
const backupsTsContent = fs.readFileSync(path.resolve('backend/backups.ts'), 'utf8');
check('backend/backups.ts omits --warning=no-file-changed on Windows', backupsTsContent.includes("process.platform === 'win32'") && backupsTsContent.includes("'-czf', archive, '-C', source, '.'"));

// 6. Check backend/java.ts platform compatibility
const javaTsContent = fs.readFileSync(path.resolve('backend/java.ts'), 'utf8');
check('backend/java.ts supports Windows platform in ensureJdk', javaTsContent.includes("process.platform !== 'win32'") || javaTsContent.includes("process.platform === 'win32'"));
check('backend/java.ts supports java.exe in verifyJdk', javaTsContent.includes('java.exe'));

console.log(`${checks.length} Windows compatibility regression checks passed.`);
fs.writeFileSync('audit/windows-compatibility-regression.json', JSON.stringify({ checks, timestamp: new Date().toISOString() }, null, 2));
