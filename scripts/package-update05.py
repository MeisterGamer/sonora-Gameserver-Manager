"""Package Sonora Update 05 into a separate, uniquely named ZIP file."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
output_dir = root / 'updates'
output_dir.mkdir(parents=True, exist_ok=True)

now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=2)))
archive_name = 'Sonora-Update05-2026-10-12.zip'
archive_path = output_dir / archive_name

# Files and directories to package
include_files = [
    'server.ts',
    'install.sh',
    'start-manager.sh',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'README.md',
    'AGENTS.md',
    '.env.example'
]

include_dirs = [
    'src',
    'backend',
    'dist',
    'scripts'
]

files_to_pack = {}

for f in include_files:
    p = root / f
    if p.is_file():
        files_to_pack[f] = p

for d in include_dirs:
    dir_path = root / d
    if dir_path.is_dir():
        for file in dir_path.rglob('*'):
            if file.is_file():
                rel = file.relative_to(root).as_posix()
                if not any(part in rel for part in ['node_modules', '.git', '__pycache__']):
                    files_to_pack[rel] = file

entries = {}
for name, file in sorted(files_to_pack.items()):
    b = file.read_bytes()
    entries[name] = {
        'bytes': len(b),
        'sha256': hashlib.sha256(b).hexdigest()
    }

manifest = {
    'update': '05',
    'version': '0.1.5',
    'date': '2026-10-12',
    'created': now.isoformat(),
    'name': archive_name,
    'description': 'Universal Multi-Engine Minecraft Installer & Auto-Provisioning Fix: PaperMC v3 (fill.papermc.io), Purpur v2, Fabric Meta, Mojang Manifest, NeoForge, Spigot; automatic file download on server creation (no missing JAR on start); version sanitation for 26.x and 1.21.x; live diagnostics and real filesystem synchronization.',
    'files_count': len(entries),
    'entries': entries
}

# Write ZIP
if archive_path.exists():
    archive_path.unlink()

with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, file in sorted(files_to_pack.items()):
        archive.write(file, name)
    archive.writestr('UPDATE05-MANIFEST.json', json.dumps(manifest, indent=2))

print(f"Archive successfully created: {archive_path}")
print(f"Total files: {len(entries)}")
print(f"Archive size: {archive_path.stat().st_size / (1024 * 1024):.2f} MB")
print(f"SHA256: {hashlib.sha256(archive_path.read_bytes()).hexdigest()}")
