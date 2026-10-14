import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. Backend Code Verification ---
const serverSource = fs.readFileSync('server.ts', 'utf8');
const modsSource = fs.readFileSync('backend/mods.ts', 'utf8');

check('server.ts imports configureMods', serverSource.includes("import { configureMods } from './backend/mods'"));
check('server.ts invokes configureMods', serverSource.includes('configureMods('));

check('backend/mods.ts imports @google/genai', modsSource.includes("import { GoogleGenAI } from '@google/genai'"));
check('backend/mods.ts implements /api/servers/:id/mods/auto-resolve-dependencies', modsSource.includes("'/api/servers/:id/mods/auto-resolve-dependencies'"));
check('backend/mods.ts implements /api/mods/auto-resolve-dependencies', modsSource.includes("'/api/mods/auto-resolve-dependencies'"));
check('backend/mods.ts targets gemini-2.5-flash model', modsSource.includes('gemini-2.5-flash'));
check('backend/mods.ts includes Vault dependency rule', modsSource.includes('vault') && modsSource.includes('EssentialsX'));
check('backend/mods.ts includes Fabric API dependency rule', modsSource.includes('fabric_api') && modsSource.includes('Fabric'));
check('backend/mods.ts includes WorldEdit dependency rule', modsSource.includes('worldedit') && modsSource.includes('WorldGuard'));
check('backend/mods.ts includes Sodium dependency rule', modsSource.includes('sodium') && modsSource.includes('Iris'));
check('backend/mods.ts includes auto-install support for dependencies', modsSource.includes('dep of analysisResult.compatibility.missingDependencies') && modsSource.includes('server.installedMods ='));

// --- 2. CentralModHub Frontend Verification ---
const centralModHubSource = fs.readFileSync('src/components/CentralModHub.tsx', 'utf8');

check('CentralModHub imports AutoResolveModal', centralModHubSource.includes("import { AutoResolveModal } from './AutoResolveModal'"));
check('CentralModHub has Auto-Resolve Dependencies button in top banner', centralModHubSource.includes('Auto-Resolve Dependencies'));
check('CentralModHub has handleOpenAutoResolve function', centralModHubSource.includes('handleOpenAutoResolve'));
check('CentralModHub supports multi-select state selectedModIds', centralModHubSource.includes('selectedModIds'));
check('CentralModHub supports toggleModSelection', centralModHubSource.includes('toggleModSelection'));
check('CentralModHub renders Multi-Select & Auto-Resolve Toolbar', centralModHubSource.includes('Multi-Select & Auto-Resolve Toolbar'));
check('CentralModHub renders AutoResolveModal component', centralModHubSource.includes('<AutoResolveModal'));

// --- 3. AutoResolveModal Component Verification ---
const modalSource = fs.readFileSync('src/components/AutoResolveModal.tsx', 'utf8');

check('AutoResolveModal calls auto-resolve-dependencies endpoint', modalSource.includes('/api/servers/\' + server.id + \'/mods/auto-resolve-dependencies'));
check('AutoResolveModal shows Gemini AI model badge', modalSource.includes('Gemini AI'));
check('AutoResolveModal renders compatibility score', modalSource.includes('compatibilityScore'));
check('AutoResolveModal displays missing dependencies', modalSource.includes('missingDependencies'));
check('AutoResolveModal provides handleInstallAllDependencies', modalSource.includes('handleInstallAllDependencies'));

console.log(`${checks.length} Gemini API Mod Auto-Resolve regression checks passed.`);
fs.writeFileSync('audit/gemini-autoresolve-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
