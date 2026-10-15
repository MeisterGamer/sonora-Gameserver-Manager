/**
 * Sonora Game Server Manager - Syntax Highlighting Utility
 * High-performance tokenizer & syntax highlighter for .properties, .yml/.yaml, and .json configuration files.
 */

export type SupportedLanguage = 'properties' | 'yaml' | 'json' | 'generic';

export type TokenType =
  | 'comment'
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'operator'
  | 'variable'
  | 'url'
  | 'section'
  | 'tag'
  | 'whitespace'
  | 'text';

export interface Token {
  type: TokenType;
  text: string;
}

export interface SyntaxValidationResult {
  isValid: boolean;
  message?: string;
  line?: number;
  column?: number;
  type: SupportedLanguage;
}

/**
 * Detect language by filename or file extension.
 */
export function detectLanguage(fileNameOrExt: string): SupportedLanguage {
  const clean = fileNameOrExt.toLowerCase().trim();
  const ext = clean.includes('.') ? clean.split('.').pop() || '' : clean;

  if (['properties', 'cfg', 'ini', 'conf', 'env'].includes(ext)) {
    return 'properties';
  }
  if (['yml', 'yaml'].includes(ext)) {
    return 'yaml';
  }
  if (['json', 'jsonc', 'json5'].includes(ext)) {
    return 'json';
  }
  return 'generic';
}

/**
 * Safe HTML escape for rendering highlighted code.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get CSS class names for a given token type.
 */
export function getTokenClassName(type: TokenType, lang: SupportedLanguage): string {
  switch (type) {
    case 'comment':
      return 'text-neutral-500 italic';
    case 'section':
      return 'text-amber-400 font-bold';
    case 'key':
      if (lang === 'properties') return 'text-emerald-400 font-semibold';
      if (lang === 'yaml') return 'text-sky-300 font-semibold';
      return 'text-sky-300 font-semibold'; // json
    case 'string':
      if (lang === 'json') return 'text-emerald-300';
      if (lang === 'yaml') return 'text-amber-300';
      return 'text-neutral-200';
    case 'number':
      return 'text-violet-400 font-mono font-medium';
    case 'boolean':
      return 'text-amber-400 font-semibold';
    case 'null':
      return 'text-rose-400 italic font-semibold';
    case 'punctuation':
    case 'operator':
      return 'text-neutral-500';
    case 'variable':
      return 'text-pink-400 font-medium';
    case 'url':
      return 'text-cyan-400 underline decoration-cyan-500/40 underline-offset-2';
    case 'tag':
      return 'text-fuchsia-400 font-semibold';
    default:
      return 'text-neutral-200';
  }
}

/**
 * Tokenize a single line of Java .properties / .cfg / .ini
 */
export function tokenizePropertiesLine(line: string): Token[] {
  const tokens: Token[] = [];
  const trimmed = line.trim();

  // Empty line
  if (!line) {
    return [{ type: 'whitespace', text: '' }];
  }

  // Full comment line (# or ! or ;)
  if (trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith(';')) {
    return [{ type: 'comment', text: line }];
  }

  // INI/CFG Section Header: [SectionName]
  const sectionMatch = line.match(/^(\s*)(\[[^\]]+\])(.*)$/);
  if (sectionMatch) {
    if (sectionMatch[1]) tokens.push({ type: 'whitespace', text: sectionMatch[1] });
    tokens.push({ type: 'section', text: sectionMatch[2] });
    if (sectionMatch[3]) {
      tokens.push(...tokenizeValue(sectionMatch[3], 'properties'));
    }
    return tokens;
  }

  // Key=Value or Key:Value delimiter
  const sepMatch = line.match(/^(\s*)([^=:]+?)\s*([=:])\s*(.*)$/);
  if (sepMatch) {
    const [, indent, rawKey, sep, rawValue] = sepMatch;
    if (indent) tokens.push({ type: 'whitespace', text: indent });
    tokens.push({ type: 'key', text: rawKey });
    tokens.push({ type: 'punctuation', text: sep });

    // Leading space after delimiter
    const valueMatch = line.slice((indent || '').length + rawKey.length + sep.length);
    const valueIndent = valueMatch.match(/^\s*/)?.[0] || '';
    if (valueIndent) tokens.push({ type: 'whitespace', text: valueIndent });

    tokens.push(...tokenizeValue(rawValue, 'properties'));
    return tokens;
  }

  // Fallback: check for trailing comment or value
  return tokenizeValue(line, 'properties');
}

/**
 * Tokenize a single line of YAML (.yml, .yaml)
 */
export function tokenizeYamlLine(line: string): Token[] {
  const tokens: Token[] = [];
  if (!line) return [{ type: 'whitespace', text: '' }];

  // Leading whitespace
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  let rest = line.slice(indent.length);
  if (indent) tokens.push({ type: 'whitespace', text: indent });

  // Full comment line
  if (rest.startsWith('#')) {
    tokens.push({ type: 'comment', text: rest });
    return tokens;
  }

  // Document start / end: --- or ...
  if (rest.startsWith('---') || rest.startsWith('...')) {
    tokens.push({ type: 'punctuation', text: rest.slice(0, 3) });
    rest = rest.slice(3);
    if (rest) tokens.push(...tokenizeYamlValueWithComments(rest));
    return tokens;
  }

  // List bullet: "- " or "-"
  if (rest.startsWith('- ') || rest === '-') {
    tokens.push({ type: 'operator', text: '-' });
    rest = rest.slice(1);
    const spaceMatch = rest.match(/^(\s+)/);
    if (spaceMatch) {
      tokens.push({ type: 'whitespace', text: spaceMatch[1] });
      rest = rest.slice(spaceMatch[1].length);
    }
  }

  // Key: value pair
  // Key can be word or quoted string followed by ":"
  const keyMatch = rest.match(/^([a-zA-Z0-9_\-\.\/]+|"[^"]*"|'[^']*')\s*(:)(\s+|$)/);
  if (keyMatch) {
    const fullKeyMatch = keyMatch[0];
    const key = keyMatch[1];
    tokens.push({ type: 'key', text: key });
    
    // Spaces between key and colon
    const beforeColonSpaces = fullKeyMatch.slice(key.length, fullKeyMatch.indexOf(':'));
    if (beforeColonSpaces) tokens.push({ type: 'whitespace', text: beforeColonSpaces });

    tokens.push({ type: 'punctuation', text: ':' });

    const afterColonSpaces = fullKeyMatch.slice(fullKeyMatch.indexOf(':') + 1);
    if (afterColonSpaces) tokens.push({ type: 'whitespace', text: afterColonSpaces });

    rest = rest.slice(fullKeyMatch.length);
  }

  if (rest) {
    tokens.push(...tokenizeYamlValueWithComments(rest));
  }

  return tokens;
}

/**
 * Handle YAML values along with possible inline comments
 */
function tokenizeYamlValueWithComments(str: string): Token[] {
  const tokens: Token[] = [];
  // Check for inline comment preceded by space
  const commentIndex = str.search(/\s+#/);
  if (commentIndex !== -1) {
    const valuePart = str.slice(0, commentIndex);
    const commentPart = str.slice(commentIndex);
    tokens.push(...tokenizeValue(valuePart, 'yaml'));
    tokens.push({ type: 'comment', text: commentPart });
  } else {
    tokens.push(...tokenizeValue(str, 'yaml'));
  }
  return tokens;
}

/**
 * Tokenize a single line of JSON
 */
export function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  if (!line) return [{ type: 'whitespace', text: '' }];

  let i = 0;
  const len = line.length;

  while (i < len) {
    const char = line[i];

    // Whitespace
    if (/\s/.test(char)) {
      let space = '';
      while (i < len && /\s/.test(line[i])) {
        space += line[i++];
      }
      tokens.push({ type: 'whitespace', text: space });
      continue;
    }

    // Comments in JSONC / relaxed json: // or /*
    if (char === '/' && line[i + 1] === '/') {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }

    // Punctuation
    if (['{', '}', '[', ']', ',', ':'].includes(char)) {
      tokens.push({ type: 'punctuation', text: char });
      i++;
      continue;
    }

    // Strings (keys or string values)
    if (char === '"' || char === "'") {
      const quote = char;
      let str = quote;
      i++;
      let escaped = false;
      while (i < len) {
        const c = line[i++];
        str += c;
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === quote) {
          break;
        }
      }

      // Check if this string is a JSON key (followed by optional whitespace and ':')
      const remaining = line.slice(i);
      const isKey = /^\s*:/.test(remaining);
      tokens.push({ type: isKey ? 'key' : 'string', text: str });
      continue;
    }

    // Booleans / null / numbers
    const wordMatch = line.slice(i).match(/^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (wordMatch) {
      const word = wordMatch[1];
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', text: word });
      } else if (word === 'null') {
        tokens.push({ type: 'null', text: word });
      } else if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(word)) {
        tokens.push({ type: 'number', text: word });
      } else {
        tokens.push({ type: 'text', text: word });
      }
      i += word.length;
      continue;
    }

    // Fallback single character
    tokens.push({ type: 'text', text: char });
    i++;
  }

  return tokens;
}

/**
 * Helper to tokenize generic / properties / yaml values
 */
function tokenizeValue(val: string, lang: SupportedLanguage): Token[] {
  const tokens: Token[] = [];
  let remaining = val;

  while (remaining.length > 0) {
    // Leading whitespace
    const ws = remaining.match(/^(\s+)/);
    if (ws) {
      tokens.push({ type: 'whitespace', text: ws[1] });
      remaining = remaining.slice(ws[1].length);
      continue;
    }

    // URL or IP pattern
    const urlMatch = remaining.match(/^(https?:\/\/[^\s]+|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|localhost(?::\d+)?)/);
    if (urlMatch) {
      tokens.push({ type: 'url', text: urlMatch[1] });
      remaining = remaining.slice(urlMatch[1].length);
      continue;
    }

    // Variables like ${VAR_NAME} or %VAR_NAME%
    const varMatch = remaining.match(/^(\$\{[^}]+\}|%[^%]+%)/);
    if (varMatch) {
      tokens.push({ type: 'variable', text: varMatch[1] });
      remaining = remaining.slice(varMatch[1].length);
      continue;
    }

    // Quoted strings
    const strMatch = remaining.match(/^("[^"]*"|'[^']*')/);
    if (strMatch) {
      tokens.push({ type: 'string', text: strMatch[1] });
      remaining = remaining.slice(strMatch[1].length);
      continue;
    }

    // YAML Anchor / Alias: &anchor or *alias
    if (lang === 'yaml') {
      const anchorMatch = remaining.match(/^([&*][a-zA-Z0-9_\-]+)/);
      if (anchorMatch) {
        tokens.push({ type: 'tag', text: anchorMatch[1] });
        remaining = remaining.slice(anchorMatch[1].length);
        continue;
      }
    }

    // Boolean keywords
    const boolMatch = remaining.match(/^(true|false|yes|no|on|off)(?=\s|$|,|;|\]|\})/i);
    if (boolMatch) {
      tokens.push({ type: 'boolean', text: boolMatch[1] });
      remaining = remaining.slice(boolMatch[1].length);
      continue;
    }

    // Null keywords
    const nullMatch = remaining.match(/^(null|none|nil|~)(?=\s|$|,|;|\]|\})/i);
    if (nullMatch) {
      tokens.push({ type: 'null', text: nullMatch[1] });
      remaining = remaining.slice(nullMatch[1].length);
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|$|,|;|\]|\})/);
    if (numMatch) {
      tokens.push({ type: 'number', text: numMatch[1] });
      remaining = remaining.slice(numMatch[1].length);
      continue;
    }

    // Operators / Punctuation
    const punctMatch = remaining.match(/^([,;:[\]{}|=])/);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', text: punctMatch[1] });
      remaining = remaining.slice(punctMatch[1].length);
      continue;
    }

    // Word / Generic text chunk
    const chunkMatch = remaining.match(/^[^\s,;:[\]{}|="$%&*/]+/);
    if (chunkMatch) {
      tokens.push({ type: 'text', text: chunkMatch[0] });
      remaining = remaining.slice(chunkMatch[0].length);
      continue;
    }

    // Single character catch-all
    tokens.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

/**
 * Tokenize a line according to the specified language.
 */
export function tokenizeLine(line: string, lang: SupportedLanguage): Token[] {
  switch (lang) {
    case 'properties':
      return tokenizePropertiesLine(line);
    case 'yaml':
      return tokenizeYamlLine(line);
    case 'json':
      return tokenizeJsonLine(line);
    default:
      return [{ type: 'text', text: line }];
  }
}

/**
 * Highlight a single line into HTML.
 */
export function highlightLineToHtml(line: string, lang: SupportedLanguage): string {
  const tokens = tokenizeLine(line, lang);
  return tokens
    .map(tok => {
      const escaped = escapeHtml(tok.text);
      if (tok.type === 'whitespace') return escaped;
      const className = getTokenClassName(tok.type, lang);
      return `<span class="${className}">${escaped}</span>`;
    })
    .join('');
}

/**
 * Highlight entire multi-line code into HTML lines.
 */
export function highlightCodeToHtml(code: string, lang: SupportedLanguage): string {
  const lines = code.split('\n');
  return lines.map(line => highlightLineToHtml(line, lang)).join('\n');
}

/**
 * Validate JSON content and return line/col information if syntax error occurs.
 */
export function validateJson(code: string): SyntaxValidationResult {
  if (!code.trim()) {
    return { isValid: true, message: 'Leere JSON Datei', type: 'json' };
  }

  try {
    JSON.parse(code);
    return { isValid: true, message: 'Gültiges JSON', type: 'json' };
  } catch (err: any) {
    const message = err.message || 'JSON Syntaxfehler';
    let line: number | undefined;
    let column: number | undefined;

    // Extract position from message like "at position 42 (line 3 column 5)"
    const posMatch = message.match(/position\s+(\d+)/i);
    const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);

    if (lineColMatch) {
      line = parseInt(lineColMatch[1], 10);
      column = parseInt(lineColMatch[2], 10);
    } else if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const prefix = code.slice(0, pos);
      line = prefix.split('\n').length;
      column = (prefix.split('\n').pop()?.length || 0) + 1;
    }

    return {
      isValid: false,
      message: line ? `Zeile ${line}: ${message}` : message,
      line,
      column,
      type: 'json'
    };
  }
}

/**
 * Validate YAML basic syntax (detecting tab mixing, invalid mapping colons).
 */
export function validateYaml(code: string): SyntaxValidationResult {
  if (!code.trim()) {
    return { isValid: true, message: 'Leere YAML Datei', type: 'yaml' };
  }

  const lines = code.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    const line = lines[idx];

    // Check for hard tabs in YAML indentation
    if (/^\t+/.test(line)) {
      return {
        isValid: false,
        message: `Zeile ${lineNum}: YAML verbietet Tabs zur Einrückung. Bitte Leerzeichen verwenden.`,
        line: lineNum,
        type: 'yaml'
      };
    }

    // Check for colon without space after it (common syntax error: "key:value" instead of "key: value")
    const trimmed = line.trim();
    if (!trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      const badColon = trimmed.match(/^([a-zA-Z0-9_\-]+):([^\s\/#])/);
      if (badColon) {
        return {
          isValid: false,
          message: `Zeile ${lineNum}: Nach dem Doppelpunkt fehlt ein Leerzeichen ("${badColon[1]}: ${badColon[2]}...").`,
          line: lineNum,
          type: 'yaml'
        };
      }
    }
  }

  return { isValid: true, message: 'Gültige YAML Syntax', type: 'yaml' };
}

/**
 * Validate Properties file (checks for duplicate keys or malformed lines).
 */
export function validateProperties(code: string): SyntaxValidationResult {
  if (!code.trim()) {
    return { isValid: true, message: 'Leere Properties Datei', type: 'properties' };
  }

  const lines = code.split('\n');
  const seenKeys = new Map<string, number>();
  const duplicates: { key: string; line: number }[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith(';')) {
      return;
    }
    const sepIdx = line.indexOf('=');
    if (sepIdx > -1) {
      const key = line.substring(0, sepIdx).trim();
      if (seenKeys.has(key)) {
        duplicates.push({ key, line: idx + 1 });
      } else {
        seenKeys.set(key, idx + 1);
      }
    }
  });

  if (duplicates.length > 0) {
    const first = duplicates[0];
    return {
      isValid: false,
      message: `Zeile ${first.line}: Doppelter Parameter "${first.key}" (bereits in Zeile ${seenKeys.get(first.key)} definiert)`,
      line: first.line,
      type: 'properties'
    };
  }

  return {
    isValid: true,
    message: `${seenKeys.size} Parameter fehlerfrei geladen`,
    type: 'properties'
  };
}

/**
 * Format / Pretty print JSON code
 */
export function formatJson(code: string, spaces = 2): { formatted: string; success: boolean; error?: string } {
  try {
    const parsed = JSON.parse(code);
    const formatted = JSON.stringify(parsed, null, spaces);
    return { formatted, success: true };
  } catch (err: any) {
    return { formatted: code, success: false, error: err.message || 'JSON ungültig' };
  }
}
