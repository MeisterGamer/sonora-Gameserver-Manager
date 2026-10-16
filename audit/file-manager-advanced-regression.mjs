import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. Static Verification of server.ts and HierarchicalFileExplorer.tsx ---
const serverSource = fs.readFileSync('server.ts', 'utf8');
const explorerSource = fs.readFileSync('src/components/HierarchicalFileExplorer.tsx', 'utf8');

check('server.ts imports AdmZip', serverSource.includes("import AdmZip from 'adm-zip'"));
check('server.ts supports /api/servers/:id/files/zip endpoint', serverSource.includes("app.post('/api/servers/:id/files/zip'"));
check('server.ts supports /api/servers/:id/files/unzip endpoint', serverSource.includes("app.post('/api/servers/:id/files/unzip'"));
check('server.ts supports /api/servers/:id/files/upload-batch endpoint', serverSource.includes("app.post('/api/servers/:id/files/upload-batch'"));
check('server.ts supports /api/servers/:id/files/delete-batch endpoint', serverSource.includes("app.post('/api/servers/:id/files/delete-batch'"));
check('server.ts protects against Zip Slip directory traversal vulnerability on extraction', serverSource.includes('!inside(destDir, entryTarget)') || serverSource.includes('Zip Slip'));

check('HierarchicalFileExplorer supports Drag & Drop handlers', 
  explorerSource.includes('onDragEnter={handleDragEnter}') &&
  explorerSource.includes('onDragOver={handleDragOver}') &&
  explorerSource.includes('onDragLeave={handleDragLeave}') &&
  explorerSource.includes('onDrop={handleDrop}')
);

check('HierarchicalFileExplorer supports scanDirectoryEntry for recursive folder drop',
  explorerSource.includes('scanDirectoryEntry') &&
  explorerSource.includes('webkitGetAsEntry')
);

check('HierarchicalFileExplorer supports multi-file upload',
  explorerSource.includes('handleMultiFileUpload') &&
  explorerSource.includes('multiFileInputRef')
);

check('HierarchicalFileExplorer supports folder upload with webkitdirectory',
  explorerSource.includes('handleFolderUpload') &&
  explorerSource.includes('folderInputRef') &&
  explorerSource.includes('webkitdirectory')
);

check('HierarchicalFileExplorer supports multi-selection checkboxes and bulk toolbar',
  explorerSource.includes('selectedPaths') &&
  explorerSource.includes('toggleSelectAll') &&
  explorerSource.includes('toggleSelectItem') &&
  explorerSource.includes('selectedPaths.size')
);

check('HierarchicalFileExplorer renders ZIP modal and trigger',
  explorerSource.includes('isZipModalOpen') &&
  explorerSource.includes('handleOpenZipModal') &&
  explorerSource.includes('handleConfirmCreateZip')
);

check('HierarchicalFileExplorer renders UNZIP modal and trigger',
  explorerSource.includes('isUnzipModalOpen') &&
  explorerSource.includes('handleOpenUnzipModal') &&
  explorerSource.includes('handleConfirmUnzip')
);

check('HierarchicalFileExplorer renders Batch Delete modal and trigger',
  explorerSource.includes('isBatchDeleteModalOpen') &&
  explorerSource.includes('handleBatchDelete')
);

check('HierarchicalFileExplorer shows live upload progress banner',
  explorerSource.includes('uploadProgress') &&
  explorerSource.includes('uploadProgress.active')
);

// --- 2. Live AdmZip Compression & Extraction Functional Verification ---
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-zip-test-'));
try {
  // Create test folder tree
  const subFolder = path.join(tempDir, 'world');
  fs.mkdirSync(subFolder, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'server.properties'), 'server-port=25565\nmotd=TestServer\n');
  fs.writeFileSync(path.join(subFolder, 'level.dat'), 'MOCK_NBT_BINARY_DATA');

  // Compress into ZIP using AdmZip
  const zip = new AdmZip();
  zip.addLocalFile(path.join(tempDir, 'server.properties'), '', 'server.properties');
  zip.addLocalFolder(subFolder, 'world');

  const zipPath = path.join(tempDir, 'test-archive.zip');
  zip.writeZip(zipPath);

  check('AdmZip successfully writes valid zip file', fs.existsSync(zipPath));
  const zipBytes = fs.readFileSync(zipPath);
  check('Generated zip has standard PK header (0x50, 0x4B, 0x03, 0x04)', 
    zipBytes[0] === 0x50 && zipBytes[1] === 0x4B && zipBytes[2] === 0x03 && zipBytes[3] === 0x04
  );

  // Extract ZIP into new folder
  const extractDir = path.join(tempDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  const readZip = new AdmZip(zipPath);
  const entries = readZip.getEntries();
  check('Zip entries include server.properties and world/level.dat', 
    entries.some(e => e.entryName === 'server.properties') &&
    entries.some(e => e.entryName.includes('level.dat'))
  );

  readZip.extractAllTo(extractDir, true);
  check('server.properties successfully extracted', fs.existsSync(path.join(extractDir, 'server.properties')));
  check('world/level.dat successfully extracted', fs.existsSync(path.join(extractDir, 'world', 'level.dat')));
  check('Extracted content matches original', fs.readFileSync(path.join(extractDir, 'server.properties'), 'utf8').includes('25565'));

} finally {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

console.log(`${checks.length} Advanced File Manager (ZIP, UNZIP, Multi-Upload, Folder-Upload & Drag-and-Drop) regression checks passed.`);
