import { requiredPaperJava } from './installerSupport.ts';
export function minecraftLaunch(server: { minecraftType?: string; version: string; requiredJava?: number; javaVersion?: string; allocatedRamGb: number }) {
  const jar = ({ paper: 'paper.jar', purpur: 'purpur.jar', vanilla: 'server.jar' } as Record<string, string>)[server.minecraftType || 'paper'];
  if (!jar) throw new Error('Kein geprüfter Startadapter für diese Minecraft-Engine');
  const minimum = server.requiredJava || requiredPaperJava(server.version);
  const match = server.javaVersion && /^Java (\d+)$/.exec(server.javaVersion);
  const major = server.javaVersion ? (match ? Number(match[1]) : 0) : minimum;
  if (!Number.isInteger(major) || major < Math.max(7, minimum) || major > 26) throw new Error('Ungültiges oder zu altes JDK für diese Instanz');
  const memory = Math.floor(server.allocatedRamGb * 1024);
  if (!Number.isFinite(memory) || memory < 1024 || memory > 131072) throw new Error('Ungültige RAM-Zuweisung');
  return { jar, major, args: ['-Xmx' + memory + 'M', '-Xms1G', major >= 8 ? '-XX:+UseG1GC' : '-XX:+UseParallelGC', '-jar', jar, 'nogui'] };
}
export function splitLaunchArguments(input: string): string[] {
  const result: string[] = []; let current = '', quote = '', started = false;
  for (const char of input) {
    if (quote) { if (char === quote) quote = ''; else current += char; started = true; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) { result.push(current); current = ''; started = false; } }
    else { current += char; started = true; }
  }
  if (quote) throw new Error('Nicht geschlossenes Anführungszeichen in Startargumenten');
  if (started) result.push(current);
  return result;
}
