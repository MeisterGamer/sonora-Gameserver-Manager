import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export const JDK_VERSIONS = Array.from({ length: 20 }, (_, index) => index + 7);
export function javaMajor(output: string) {
  const match = output.match(/(?:version\s+"|(?:openjdk|javac)\s+)(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1] === '1' ? match[2] : match[1]) : 0;
}
export function selectedJava(value: unknown, required: number) {
  if (value === undefined || value === '') return required;
  const match = typeof value === 'string' && /^Java (\d+)$/.exec(value);
  const major = match ? Number(match[1]) : 0;
  if (!JDK_VERSIONS.includes(major)) throw new Error('JDK-Version muss zwischen 7 und 26 liegen');
  if (major < required) throw new Error('Diese Minecraft-Version benötigt mindestens JDK ' + required);
  return major;
}
export async function jdkPackage(major: number, request: typeof fetch = fetch) {
  if (!JDK_VERSIONS.includes(major)) throw new Error('Ungültige JDK-Version');
  const query = new URLSearchParams({ java_version: String(major), os: 'linux', arch: 'x64', archive_type: 'tar.gz', java_package_type: 'jdk', javafx_bundled: 'false', crac_supported: 'false', release_status: 'ga', availability_types: 'CA', latest: 'true', include_fields: 'sha256_hash', page_size: '100' });
  const response = await request('https://api.azul.com/metadata/v1/zulu/packages/?' + query, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error('JDK-Anbieter antwortet mit HTTP ' + response.status);
  const packages = await response.json();
  if (!Array.isArray(packages)) throw new Error('Ungültige JDK-Metadaten');
  const found = packages.filter(item => item.java_version?.[0] === major &&
    typeof item.name === 'string' && /^zulu[\d.]+-ca-jdk[\d.]+-linux_x64\.tar\.gz$/.test(item.name) &&
    /^[a-f0-9]{64}$/.test(item.sha256_hash) && item.download_url === 'https://cdn.azul.com/zulu/bin/' + item.name)
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) { const delta = (b.java_version[i] || 0) - (a.java_version[i] || 0); if (delta) return delta; }
      return (b.openjdk_build_number || 0) - (a.openjdk_build_number || 0);
    })[0];
  if (!found) throw new Error('Kein stabiles Linux-x64-JDK ' + major + ' beim Anbieter verfügbar');
  return { major, url: found.download_url as string, sha256: found.sha256_hash as string, version: found.java_version.join('.') as string };
}
export function jdkHome(root: string, major: number) {
  if (!JDK_VERSIONS.includes(major)) throw new Error('Ungültige JDK-Version');
  return path.join(root, 'jdk-' + major);
}
export async function verifyJdk(home: string, major: number, execute = run) {
  for (const tool of ['java', 'javac']) {
    const executable = path.join(home, 'bin', tool);
    fs.accessSync(executable, fs.constants.X_OK);
    const result = await execute(executable, ['-version'], { timeout: 10000 });
    if (javaMajor(result.stdout + '\n' + result.stderr) !== major) throw new Error('Installiertes ' + tool + ' entspricht nicht JDK ' + major);
  }
  return path.join(home, 'bin', 'java');
}
const jobs = new Map<string, Promise<string>>();
export async function ensureJdk(root: string, major: number) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('JDK-Installation unterstützt derzeit Linux x64');
  return installJdk(root, major);
}
// The request/executor arguments allow isolated regression tests without starting Java.
export async function installJdk(root: string, major: number, request: typeof fetch = fetch, execute = run) {
  const home = jdkHome(root, major);
  if (fs.existsSync(home)) return verifyJdk(home, major, execute);
  if (jobs.has(home)) return jobs.get(home)!;
  const job = (async () => {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = fs.mkdtempSync(path.join(root, '.install-' + major + '-'));
    try {
      const metadata = await jdkPackage(major, request);
      const response = await request(metadata.url, { signal: AbortSignal.timeout(300000), redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('JDK-Download fehlgeschlagen');
      const archive = path.join(temporary, randomUUID() + '.tar.gz');
      const fd = fs.openSync(archive, 'wx', 0o600), hash = createHash('sha256');
      let bytes = 0;
      try {
        for await (const value of response.body as any) {
          const chunk = Buffer.from(value); bytes += chunk.length;
          if (bytes > 512 * 1048576) throw new Error('JDK-Archiv überschreitet 512 MiB');
          hash.update(chunk); fs.writeFileSync(fd, chunk);
        }
      } finally { fs.closeSync(fd); }
      if (hash.digest('hex') !== metadata.sha256) throw new Error('JDK-SHA256-Prüfung fehlgeschlagen');
      const listing = await execute('tar', ['-tzf', archive], { timeout: 30000, maxBuffer: 16 * 1048576 });
      if (listing.stdout.split('\n').filter(Boolean).some(name => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Unsicherer Archivpfad');
      const extracted = path.join(temporary, 'jdk'); fs.mkdirSync(extracted);
      await execute('tar', ['-xzf', archive, '--strip-components=1', '--no-same-owner', '--no-same-permissions', '-C', extracted], { timeout: 120000 });
      await verifyJdk(extracted, major, execute);
      fs.writeFileSync(path.join(extracted, 'SONORA-JDK.json'), JSON.stringify(metadata, null, 2));
      fs.renameSync(extracted, home);
      return path.join(home, 'bin', 'java');
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  })();
  jobs.set(home, job);
  try { return await job; } finally { jobs.delete(home); }
}
