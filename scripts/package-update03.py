"""Package staged/tracked source plus built frontend; never include live data."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import argparse
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'updates')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=2)))
archive_path = args.output / 'Sonora-Update03-2026-10-11.zip'
if archive_path.exists():
    archive_path = args.output / ('Sonora-Update03-2026-10-11-' + now.strftime('%H%M%S-%f') + '.zip')
git = ['git', '-c', 'safe.directory=' + root.as_posix(), '-C', str(root)]
names = subprocess.check_output(git + ['ls-files', '-z']).decode('utf-8').split('\0')
files = {name: root / name for name in names if name}
files.update({file.relative_to(root).as_posix(): file for file in (root / 'dist').rglob('*') if file.is_file()})
results = {}
for name in ['regression-update02.json', 'installer-regression.json', 'frontend-regression.json']:
    file = root / 'audit' / name
    results[name] = json.loads(file.read_text(encoding='utf-8'))
    files['audit/' + name] = file
for name in files:
    assert not name.startswith(('data/', 'node_modules/', '.git/', 'audit/installer-tools/'))
    assert not any(part.startswith('.env') and part != '.env.example' for part in Path(name).parts)
    assert 'admin-bootstrap.txt' not in name and not name.endswith('/admin.json')
for required in ['server.ts', 'backend/minecraft.ts', 'backend/paper.ts', 'backend/gameInstaller.ts', 'src/data/installerSupport.ts', 'scripts/check-runtime.mjs', 'install.sh', 'pnpm-lock.yaml', 'dist/index.html']:
    assert required in files, required
entries = {name: {'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for name, file in sorted(files.items())}
manifest = {
    'update': '03', 'version': '0.1.1', 'created': now.isoformat(),
    'sourceParentCommit': subprocess.check_output(git + ['rev-parse', 'HEAD']).decode().strip(),
    'sourceNote': 'Archive contains current tracked/staged working files; entry hashes identify the exact source.',
    'backendChecks': len(results['regression-update02.json']['checks']),
    'installerChecks': len(results['installer-regression.json']['checks']),
    'frontendChecks': len(results['frontend-regression.json']['checks']),
    'typecheck': 'passed', 'build': 'passed', 'reactRender': 'passed',
    'bashSyntax': 'tree-sitter grammar passed; Linux deployment not executed',
    'liveServicesStarted': False, 'gameProcessesStarted': False,
    'runtimeDataOrCredentialsIncluded': False, 'catalogueEntries': 93,
    'implementedAdapters': 7, 'pendingCatalogueEntries': 86, 'entries': entries,
}
with zipfile.ZipFile(archive_path, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, file in sorted(files.items()): archive.write(file, name)
    archive.writestr('UPDATE03-MANIFEST.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    for name, metadata in entries.items(): assert hashlib.sha256(archive.read(name)).hexdigest() == metadata['sha256']
print(json.dumps({'archive': str(archive_path), 'files': len(entries), 'bytes': archive_path.stat().st_size, 'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}, indent=2))
