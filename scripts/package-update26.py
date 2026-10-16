"""Package Sonora Update 26 into a separate, uniquely named ZIP file."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
output_dir = root / 'updates'
output_dir.mkdir(parents=True, exist_ok=True)

now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=2)))
archive_name = 'Sonora-Update26-2026-10-16.zip'
archive_path = output_dir / archive_name

# Files and directories to package
include_files = [
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
]

include_dirs = [
    'src',
    'backend',
    'dist',
    'audit',
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
                if not any(part in rel for part in ['node_modules', '.git', '__pycache__', 'updates']):
                    files_to_pack[rel] = file

entries = {}
for name, file in sorted(files_to_pack.items()):
    b = file.read_bytes()
    entries[name] = {
        'bytes': len(b),
        'sha256': hashlib.sha256(b).hexdigest()
    }

with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for name, file in sorted(files_to_pack.items()):
        zf.write(file, arcname=name)

meta = {
    'archive': archive_name,
    'size_bytes': archive_path.stat().st_size,
    'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
    'files_count': len(files_to_pack),
    'created_at': now.isoformat(),
    'description': "Implementierung echter Live-Abfragen für Spieler, CPU-Last und Tickrate (TPS): Minecraft Server List Ping (SLP) über TCP-Socket, PID-basierte Prozessor- und RAM-Echtzeiterfassung via ps/wmic, Parser für Spieler-Joins/Leaves und TPS-Logs in stdout, neuer Endpunkt /api/servers/:id/stats und dynamische Live-Gauges in ServerDetail und ServerList.",
    'files': entries
}

meta_path = output_dir / (archive_path.stem + '.json')
meta_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')

print(f"Created update archive: {archive_path.name} ({archive_path.stat().st_size} bytes)")
