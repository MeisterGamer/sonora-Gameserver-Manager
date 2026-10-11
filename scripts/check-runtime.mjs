// Dependency/permission preflight only: no listener and no game process.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24+ required');
if (typeof express !== 'function') throw new Error('Express dependency unavailable');
for (const relative of ['server.ts', 'node_modules/tsx/dist/cli.mjs', 'dist/index.html']) fs.accessSync(path.join(root, relative), fs.constants.R_OK);
if (fs.existsSync(path.join(root, '.env'))) fs.accessSync(path.join(root, '.env'), fs.constants.R_OK);
fs.accessSync(path.dirname(process.env.APEXHOST_DATA_DIR), fs.constants.W_OK);
console.log('Service runtime, dependencies, frontend and data permissions verified');
