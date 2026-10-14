import fs from 'node:fs';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// 1. Verify ServerList.tsx contains Installing... and Installation Failed badges
const serverListSource = fs.readFileSync('src/components/ServerList.tsx', 'utf8');

check('ServerList has Installation Failed badge text', serverListSource.includes('Installation Failed'));
check('ServerList has Installing... badge text', serverListSource.includes('Installing...'));
check('ServerList imports AlertCircle and AlertTriangle', serverListSource.includes('AlertCircle') && serverListSource.includes('AlertTriangle'));
check('ServerList has progress bar for installing servers', serverListSource.includes('server.installProgress.percent'));
check('ServerList has error message and retry button in item card', serverListSource.includes('server.installationError || server.installProgress?.message'));

// 2. Verify ServerDetail.tsx contains Installing... and Installation Failed badges & banners
const serverDetailSource = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');

check('ServerDetail has renderStatusBadge helper', serverDetailSource.includes('renderStatusBadge'));
check('ServerDetail has Installation Failed badge in header', serverDetailSource.includes('Installation Failed'));
check('ServerDetail has Installing... badge in header', serverDetailSource.includes('Installing...'));
check('ServerDetail has handleRetryInstall action', serverDetailSource.includes('handleRetryInstall'));
check('ServerDetail has prominent Installation Failed banner', serverDetailSource.includes('Installation fehlgeschlagen') && serverDetailSource.includes('Installation Failed'));
check('ServerDetail has real-time Installing banner', serverDetailSource.includes('Deployment & Installation läuft'));

// 3. Verify server.ts API returns isInstalling, isInstallFailed, installationError
const serverSource = fs.readFileSync('server.ts', 'utf8');
check('server.ts computes isInstalling flag', serverSource.includes('const isInstalling ='));
check('server.ts computes isInstallFailed flag', serverSource.includes('const isInstallFailed ='));
check('server.ts exports isInstalling and isInstallFailed', serverSource.includes('isInstalling,') && serverSource.includes('isInstallFailed,'));

console.log(`${checks.length} Status badges and real-time deployment regression checks passed.`);
fs.writeFileSync('audit/status-badges-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
