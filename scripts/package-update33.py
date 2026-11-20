"""Package Sonora Update 33 into a separate, uniquely named ZIP file."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
output_dir = root / 'updates'
output_dir.mkdir(parents=True, exist_ok=True)

now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=2)))
archive_name = 'Sonora-Update33-2026-10-23.zip'
archive_path = output_dir / archive_name

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
    'description': (
        "100% reparierter Gameserver-Installer für alle Minecraft-Engines (Paper, Purpur, Spigot, Vanilla, "
        "Fabric, Quilt, Forge, NeoForge, Velocity, BungeeCord, Geyser, Bedrock) sowie alle Steam-/Dedicated-Kategorien "
        "(kein fälschliches Entpacken von .jar-Dateien, korrektes Kategorie-Routing, Forge/NeoForge unix_args-Start, "
        "rekursive Binary-Suche). Vollständige Trennung von Admin- und User-Inhalten mit granularem RBAC-Rechtesystem "
        "(Rollen Admin/Moderator/Benutzer, 18 Berechtigungen, Benutzer-Overrides). Produktionsreifes Debian install.sh "
        "mit UFW-Firewall, Kernel-Sysctl- & iptables-DDoS-Schutz (SONORA_DDOS), Fail2ban, systemd-Autostart sowie "
        "automatischer Port-Freigabe beim Server-Erstellen und automatischer Port-Löschung beim Server-Löschen."
    ),
    'files': entries
}

meta_path = output_dir / (archive_path.stem + '.json')
meta_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')

print(f"Created update archive: {archive_path.name} ({archive_path.stat().st_size} bytes)")
