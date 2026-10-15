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
  let executable = path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!fs.existsSync(executable)) {
    if (fs.existsSync(path.join(home, 'bin', 'java'))) {
      executable = path.join(home, 'bin', 'java');
    } else if (fs.existsSync(path.join(home, 'bin', 'java.exe'))) {
      executable = path.join(home, 'bin', 'java.exe');
    } else {
      throw new Error('Java-Executable nicht gefunden: ' + executable);
    }
  }
  try { fs.chmodSync(executable, 0o755); } catch {}

  const binDir = path.join(home, 'bin');
  if (fs.existsSync(binDir)) {
    try {
      for (const f of fs.readdirSync(binDir)) {
        try { fs.chmodSync(path.join(binDir, f), 0o755); } catch {}
      }
    } catch {}
  }

  try {
    const result = await execute(executable, ['-version'], { timeout: 30000 });
    const output = (result.stdout || '') + '\n' + (result.stderr || '');
    const detected = javaMajor(output);
    if (detected && detected !== major) {
      throw new Error('Installiertes Java (' + detected + ') entspricht nicht JDK ' + major);
    }
  } catch (err: any) {
    if (err.message && err.message.includes('entspricht nicht')) {
      throw err;
    }
    const combined = (err.stdout || '') + '\n' + (err.stderr || '');
    const detected = javaMajor(combined);
    if (detected && detected !== major) {
      throw new Error('Installiertes Java (' + detected + ') entspricht nicht JDK ' + major);
    }
    if (detected !== major) {
      throw new Error('Java-Verifizierung fehlgeschlagen: ' + err.message);
    }
  }
  const javac = path.join(path.dirname(executable), process.platform === 'win32' ? 'javac.exe' : 'javac');
  const targetJavac = fs.existsSync(javac) ? javac : path.join(path.dirname(executable), 'javac');
  if (fs.existsSync(targetJavac)) {
    try {
      await execute(targetJavac, ['-version'], { timeout: 30000 });
    } catch {}
  }
  return executable;
}
const jobs = new Map<string, Promise<string>>();
export type ProgressCallback = (percent: number, message: string) => void;

export async function ensureJdk(root: string, major: number, onProgress?: ProgressCallback) {
  if ((process.platform !== 'linux' && process.platform !== 'win32') || (process.arch !== 'x64' && process.arch !== 'arm64')) {
    throw new Error('JDK-Installation unterstützt derzeit Linux x64 und Windows x64');
  }
  return installJdk(root, major, fetch, run, onProgress);
}

// The request/executor arguments allow isolated regression tests without starting Java.
export async function installJdk(
  root: string,
  major: number,
  request: typeof fetch = fetch,
  execute = run,
  onProgress?: ProgressCallback
) {
  const home = jdkHome(root, major);
  if (fs.existsSync(home)) {
    onProgress?.(100, `Portables JDK ${major} bereits vorhanden.`);
    return verifyJdk(home, major, execute);
  }
  if (jobs.has(home)) return jobs.get(home)!;

  const job = (async () => {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = fs.mkdtempSync(path.join(root, '.install-' + major + '-'));
    try {
      onProgress?.(15, `Frage JDK-Metadaten für OpenJDK ${major} ab...`);
      let downloadUrl = '';
      let expectedSha256: string | null = null;
      let metaDetails: any = null;

      // Strategy A: Azul Zulu
      try {
        const metadata = await jdkPackage(major, request);
        downloadUrl = metadata.url;
        expectedSha256 = metadata.sha256;
        metaDetails = metadata;
      } catch (azulErr: any) {
        // Strategy B: Adoptium (Eclipse Temurin) Fallback for common LTS releases
        if ([8, 11, 17, 21].includes(major)) {
          onProgress?.(20, `Azul Zulu nicht verfügbar (${azulErr.message}), nutze Eclipse Temurin ${major}...`);
          downloadUrl = `https://api.adoptium.net/v3/binary/latest/${major}/ga/linux/x64/jdk/hotspot/normal/eclipse`;
          metaDetails = { major, provider: 'Adoptium / Eclipse Temurin', url: downloadUrl };
        } else {
          throw azulErr;
        }
      }

      onProgress?.(25, `Starte Download von JDK ${major}...`);
      const response = await request(downloadUrl, {
        signal: AbortSignal.timeout(300000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Sonora-Gameserver-Manager/2.0' }
      });
      if (!response.ok || !response.body) throw new Error(`JDK-Download fehlgeschlagen (HTTP ${response.status})`);

      const totalBytes = Number(response.headers.get('content-length')) || 0;
      const archive = path.join(temporary, randomUUID() + '.tar.gz');
      const fd = fs.openSync(archive, 'wx', 0o600);
      const hash = createHash('sha256');
      let bytes = 0;
      let lastPercent = 25;

      try {
        for await (const value of response.body as any) {
          const chunk = Buffer.from(value);
          bytes += chunk.length;
          if (bytes > 512 * 1048576) throw new Error('JDK-Archiv überschreitet 512 MiB');
          hash.update(chunk);
          fs.writeFileSync(fd, chunk);

          if (totalBytes > 0) {
            const dlPercent = Math.min(80, Math.floor((bytes / totalBytes) * 55) + 25);
            if (dlPercent >= lastPercent + 5) {
              lastPercent = dlPercent;
              const mb = (bytes / (1024 * 1024)).toFixed(1);
              const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
              onProgress?.(dlPercent, `Lade portables JDK ${major} herunter (${mb}/${totalMb} MB)...`);
            }
          }
        }
      } finally {
        fs.closeSync(fd);
      }

      const calculatedSha = hash.digest('hex');
      if (expectedSha256 && calculatedSha !== expectedSha256) {
        throw new Error('JDK-SHA256-Prüfung fehlgeschlagen');
      }

      onProgress?.(85, `Entpacke portables OpenJDK ${major}...`);
      const listing = await execute('tar', ['-tzf', archive]);
      const entries = (listing.stdout || '').split('\n').filter(Boolean);
      for (const entry of entries) {
        if (entry.includes('../') || entry.startsWith('/') || entry.startsWith('..')) {
          throw new Error('Ungültiger Archivpfad (Path Traversal erkannt)');
        }
      }

      const extracted = path.join(temporary, 'jdk');
      fs.mkdirSync(extracted, { recursive: true });
      await execute('tar', ['-xzf', archive, '--strip-components=1', '--no-same-owner', '-C', extracted], { timeout: 120000 });

      const binDir = path.join(extracted, 'bin');
      if (fs.existsSync(binDir)) {
        try {
          for (const f of fs.readdirSync(binDir)) {
            try { fs.chmodSync(path.join(binDir, f), 0o755); } catch {}
          }
        } catch {}
      }

      onProgress?.(92, `Verifiziere Java-Laufzeitumgebung (JDK ${major})...`);
      await verifyJdk(extracted, major, execute);

      fs.writeFileSync(path.join(extracted, 'SONORA-JDK.json'), JSON.stringify({ ...metaDetails, sha256: calculatedSha }, null, 2));
      fs.renameSync(extracted, home);

      onProgress?.(100, `Portables JDK ${major} erfolgreich eingerichtet.`);
      const returnBin = process.platform === 'win32' && fs.existsSync(path.join(home, 'bin', 'java.exe'))
        ? path.join(home, 'bin', 'java.exe')
        : path.join(home, 'bin', 'java');
      return returnBin;
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  })();
  jobs.set(home, job);
  try { return await job; } finally { jobs.delete(home); }
}
