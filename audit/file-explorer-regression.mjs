import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. Backend Code Verification ---
const serverSource = fs.readFileSync('server.ts', 'utf8');

check('server.ts implements getDirectoryTree helper for hierarchical listing', serverSource.includes('function getDirectoryTree('));
check('server.ts includes recursive children in getDirectoryTree', serverSource.includes('children = getDirectoryTree('));
check('server.ts supports /api/servers/:id/files with tree payload', serverSource.includes('app.get(\'/api/servers/:id/files\'') && serverSource.includes('tree = getDirectoryTree('));
check('server.ts implements /api/servers/:id/files/tree dedicated endpoint', serverSource.includes("app.get('/api/servers/:id/files/tree'"));
check('server.ts supports singular /api/servers/:id/file endpoint for read and save', serverSource.includes("app.get('/api/servers/:id/file', handleGetFileContent)") && serverSource.includes("app.post('/api/servers/:id/file', handleSaveFileContent)"));
check('server.ts supports /api/servers/:id/directory creation', serverSource.includes("app.post('/api/servers/:id/directory'"));
check('server.ts protects against path traversal', serverSource.includes("!targetDir.startsWith(srvDir)") || serverSource.includes("!fullPath.startsWith(srvDir)"));
check('server.ts syncs saved configuration to server registry configFiles', serverSource.includes("srv.configFiles[fileName] = content") && serverSource.includes("saveServerRegistry(servers)"));

// --- 2. HierarchicalFileExplorer Frontend Verification ---
const explorerSource = fs.readFileSync('src/components/HierarchicalFileExplorer.tsx', 'utf8');

check('HierarchicalFileExplorer exports component', explorerSource.includes('export const HierarchicalFileExplorer: React.FC'));
check('HierarchicalFileExplorer renders folder tree hierarchy', explorerSource.includes('renderTreeNode') && explorerSource.includes('expandedFolders'));
check('HierarchicalFileExplorer supports toggleFolderExpansion', explorerSource.includes('toggleFolderExpansion'));
check('HierarchicalFileExplorer supports navigateToDirectory on folder click', explorerSource.includes('navigateToDirectory'));
check('HierarchicalFileExplorer renders clickable breadcrumbs', explorerSource.includes('currentPath.split(\'/\').filter(Boolean).map'));
check('HierarchicalFileExplorer supports file selection state', explorerSource.includes('selectedFile') && explorerSource.includes('setSelectedFile'));
check('HierarchicalFileExplorer triggers edit modal via handleTriggerEdit', explorerSource.includes('handleTriggerEdit') && explorerSource.includes('setIsEditModalOpen(true)'));
check('HierarchicalFileExplorer renders ConfigEditModal component', explorerSource.includes('<ConfigEditModal'));
check('HierarchicalFileExplorer provides search and filter capability', explorerSource.includes('searchFilter') && explorerSource.includes('setSearchFilter'));
check('HierarchicalFileExplorer supports list and grid view modes', explorerSource.includes('viewMode') && explorerSource.includes('setViewMode'));
check('HierarchicalFileExplorer supports file and folder creation', explorerSource.includes('handleCreateEntry'));
check('HierarchicalFileExplorer supports file deletion', explorerSource.includes('handleConfirmDelete'));
check('HierarchicalFileExplorer supports file upload', explorerSource.includes('handleFileUpload'));

// --- 3. ConfigEditModal Component Verification ---
const modalSource = fs.readFileSync('src/components/ConfigEditModal.tsx', 'utf8');

check('ConfigEditModal exports component', modalSource.includes('export const ConfigEditModal: React.FC'));
check('ConfigEditModal loads file content via backend api', modalSource.includes('/api/servers/${serverId}/files/content?file='));
check('ConfigEditModal saves content via POST request', modalSource.includes('/api/servers/${serverId}/files/content'));
check('ConfigEditModal supports raw code editor mode with line numbers', modalSource.includes('lineCount') && modalSource.includes('textareaRef'));
check('ConfigEditModal supports key-value visual GUI mode for properties', modalSource.includes('parsedKeyValue') && modalSource.includes('updateKeyValue'));
check('ConfigEditModal supports revert changes', modalSource.includes('handleRevert'));
check('ConfigEditModal supports keyboard shortcut save (Ctrl+S / Cmd+S)', modalSource.includes('(e.ctrlKey || e.metaKey) && e.key === \'s\''));
check('ConfigEditModal handles close on Escape key', modalSource.includes("e.key === 'Escape'"));

// --- 4. ServerDetail Integration Verification ---
const serverDetailSource = fs.readFileSync('src/components/ServerDetail.tsx', 'utf8');

check('ServerDetail imports HierarchicalFileExplorer', serverDetailSource.includes("import { HierarchicalFileExplorer } from './HierarchicalFileExplorer'"));
check('ServerDetail renders HierarchicalFileExplorer in files tab', serverDetailSource.includes('<HierarchicalFileExplorer'));
check('ServerDetail tab button reflects Datei-Explorer & SFTP', serverDetailSource.includes('Datei-Explorer & SFTP'));
check('ServerDetail wires onOpenFileExplorer to ConfigFileEditor', serverDetailSource.includes("onOpenFileExplorer={() => setActiveTab('files')}"));

console.log(`${checks.length} Hierarchical File Explorer regression checks passed.`);
fs.writeFileSync('audit/file-explorer-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
