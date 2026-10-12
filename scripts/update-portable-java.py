import sys

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports at the top
top_import = """import { ensureJdk, jdkHome, JDK_VERSIONS } from './backend/java';
"""

if "import { ensureJdk" not in content:
    content = top_import + content

# 2. Add JDKS_DIR and progress map
jdks_dir_def = """// Persistent Portable Java (JDKs) directory
const JDKS_DIR = path.resolve(process.cwd(), '.runtime', 'jdks');
try {
  if (!fs.existsSync(JDKS_DIR)) {
    fs.mkdirSync(JDKS_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[ApexHost] Could not create JDKS_DIR:', e);
}

// Live installation progress tracker (0-100%)
const installProgressMap = new Map<string, {
  serverId: string;
  percent: number;
  step: string;
  message: string;
  timestamp: number;
}>();

function setInstallProgress(serverId: string, percent: number, step: string, message: string) {
  installProgressMap.set(serverId, { serverId, percent, step, message, timestamp: Date.now() });
  appendLog(serverId, 'INFO', `[FORTSCHRITT ${percent}%] ${message}`);
}

function getRequiredJdkMajor(version?: string, javaVersion?: string): number {
  if (javaVersion) {
    const match = javaVersion.match(/\\b(?:Java|JDK)\\s*(\\d+)\\b/i);
    if (match) return Number(match[1]);
  }
  if (version) {
    const clean = version.trim();
    if (clean.startsWith('26.') || clean.startsWith('25.')) return 25;
    if (clean.startsWith('1.21') || clean.startsWith('1.20.6') || clean.startsWith('1.20.5')) return 21;
    if (clean.startsWith('1.20') || clean.startsWith('1.19') || clean.startsWith('1.18')) return 17;
    if (clean.startsWith('1.17') || clean.startsWith('1.16')) return 11;
  }
  return 21;
}
"""

if "const JDKS_DIR" not in content:
    # insert before function getServerRegistry
    pos = content.find('// Persistent server registry')
    if pos >= 0:
        content = content[:pos] + jdks_dir_def + '\n' + content[pos:]

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 1 applied successfully!')
