import fs from 'node:fs';
import path from 'node:path';

export function serverId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) {
    throw new Error('Ungültige Instanz-ID');
  }
  return value;
}

export function confinedPath(root: string, relative: string): string {
  if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative) || /[\\:]/.test(relative)) {
    throw new Error('Ungültiger relativer Pfad');
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  const cleanWinPath = (p: string) => p.replace(/^\\\\\?\\/, '');
  const inside = (base: string, candidate: string) => {
    const normBase = cleanWinPath(path.normalize(base));
    const normCand = cleanWinPath(path.normalize(candidate));
    const rel = path.relative(normBase, normCand);
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  };
  if (!inside(resolvedRoot, target)) throw new Error('Pfad verlässt das Instanzverzeichnis');
  // Check existing ancestors as well: a symlink/junction must not escape the root.
  let ancestor = target;
  while (!fs.existsSync(ancestor) && ancestor !== resolvedRoot) ancestor = path.dirname(ancestor);
  if (fs.existsSync(resolvedRoot) && fs.existsSync(ancestor)) {
    if (!inside(fs.realpathSync(resolvedRoot), fs.realpathSync(ancestor))) throw new Error('Verknüpfung verlässt das Instanzverzeichnis');
  }
  return target;
}

export function instancePath(root: string, id: unknown): string {
  return confinedPath(root, serverId(id));
}

export function readFileTail(file: string, bytes = 256 * 1024): string {
  const size = fs.statSync(file).size;
  const length = Math.min(size, bytes);
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const actual = fs.readSync(descriptor, buffer, 0, length, size - length);
    const text = buffer.subarray(0, actual).toString('utf8');
    return size > length ? text.slice(text.indexOf('\n') + 1) : text;
  } finally { fs.closeSync(descriptor); }
}

export function parseArguments(raw: string | string[]): string[] {
  if (Array.isArray(raw)) {
    if (raw.length > 100 || raw.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Ungültige Argumente');
    return raw;
  }
  if (typeof raw !== 'string' || raw.length > 8192 || raw.includes('\0')) throw new Error('Ungültige Argumente');
  const result: string[] = [];
  let current = '', quote = '', started = false;
  for (const char of raw) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) {
      if (started) { result.push(current); current = ''; started = false; }
    } else { current += char; started = true; }
  }
  if (quote) throw new Error('Nicht geschlossenes Anführungszeichen in Startargumenten');
  if (started) result.push(current);
  return result;
}
