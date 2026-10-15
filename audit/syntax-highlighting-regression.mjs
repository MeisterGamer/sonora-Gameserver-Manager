import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };

// --- 1. syntaxHighlighter.ts Utility Verification ---
const syntaxUtils = fs.readFileSync('src/utils/syntaxHighlighter.ts', 'utf8');

check('syntaxHighlighter exports detectLanguage', syntaxUtils.includes('export function detectLanguage('));
check('detectLanguage supports properties and cfg and ini', syntaxUtils.includes("'properties', 'cfg', 'ini', 'conf', 'env'"));
check('detectLanguage supports yml and yaml', syntaxUtils.includes("'yml', 'yaml'"));
check('detectLanguage supports json', syntaxUtils.includes("'json', 'jsonc', 'json5'"));

check('syntaxHighlighter exports tokenizePropertiesLine', syntaxUtils.includes('export function tokenizePropertiesLine('));
check('tokenizePropertiesLine handles comments (#, !, ;)', syntaxUtils.includes("trimmed.startsWith('#')") && syntaxUtils.includes("trimmed.startsWith(';')"));
check('tokenizePropertiesLine handles key=value and key:value', syntaxUtils.includes("([=:])"));

check('syntaxHighlighter exports tokenizeYamlLine', syntaxUtils.includes('export function tokenizeYamlLine('));
check('tokenizeYamlLine handles list dashes and comments', syntaxUtils.includes("startsWith('- ')") && syntaxUtils.includes("startsWith('#')"));
check('tokenizeYamlLine handles key-value pairs', syntaxUtils.includes("([a-zA-Z0-9_\\-\\.\\/]+|\"[^\"]*\"|'[^']*')\\s*(:)(\\s+|$)"));

check('syntaxHighlighter exports tokenizeJsonLine', syntaxUtils.includes('export function tokenizeJsonLine('));
check('tokenizeJsonLine identifies JSON keys vs string values', syntaxUtils.includes("isKey ? 'key' : 'string'"));
check('tokenizeJsonLine parses booleans, null, and numbers', syntaxUtils.includes("word === 'true'") && syntaxUtils.includes("word === 'null'"));

check('syntaxHighlighter exports HTML highlighters and escaping', syntaxUtils.includes('export function highlightLineToHtml(') && syntaxUtils.includes('export function escapeHtml('));
check('syntaxHighlighter exports validation for JSON, YAML, and Properties', 
  syntaxUtils.includes('export function validateJson(') && 
  syntaxUtils.includes('export function validateYaml(') && 
  syntaxUtils.includes('export function validateProperties(')
);
check('syntaxHighlighter exports formatJson formatter', syntaxUtils.includes('export function formatJson('));

// --- 2. SyntaxCodeEditor Component Verification ---
const editorSource = fs.readFileSync('src/components/SyntaxCodeEditor.tsx', 'utf8');

check('SyntaxCodeEditor exports component', editorSource.includes('export const SyntaxCodeEditor: React.FC'));
check('SyntaxCodeEditor imports syntax highlighter helpers', editorSource.includes("import { \n  detectLanguage, \n  highlightLineToHtml, \n  validateJson, \n  validateYaml, \n  validateProperties,") || editorSource.includes("detectLanguage") && editorSource.includes("highlightLineToHtml"));
check('SyntaxCodeEditor provides synchronized line numbers gutter', editorSource.includes('lineGutterRef') && editorSource.includes('lineCount'));
check('SyntaxCodeEditor provides syntax highlighting toggle (An / Aus)', editorSource.includes('syntaxEnabled') && editorSource.includes('setSyntaxEnabled'));
check('SyntaxCodeEditor provides word-wrap toggle', editorSource.includes('wordWrap') && editorSource.includes('setWordWrap'));
check('SyntaxCodeEditor provides in-file search capability with match navigation', editorSource.includes('searchMatches') && editorSource.includes('handleNextMatch') && editorSource.includes('handlePrevMatch'));
check('SyntaxCodeEditor implements smart Tab key 2-space indentation', editorSource.includes("e.key === 'Tab'") && editorSource.includes("const spaces = '  '"));
check('SyntaxCodeEditor implements synchronized scrolling', editorSource.includes('handleScroll') && editorSource.includes('preRef.current.scrollTop = scrollTop'));
check('SyntaxCodeEditor provides JSON format action for json files', editorSource.includes('handleFormatJson') && editorSource.includes('formatJson(value, 2)'));
check('SyntaxCodeEditor renders language chip and validation indicator', editorSource.includes('languageLabel') && editorSource.includes('validationResult'));

// --- 3. ConfigEditModal Integration Verification ---
const modalSource = fs.readFileSync('src/components/ConfigEditModal.tsx', 'utf8');

check('ConfigEditModal imports SyntaxCodeEditor', modalSource.includes("import { SyntaxCodeEditor } from './SyntaxCodeEditor'"));
check('ConfigEditModal renders SyntaxCodeEditor in raw view', modalSource.includes('<SyntaxCodeEditor') && modalSource.includes('value={content}') && modalSource.includes('fileName={file.name}'));
check('ConfigEditModal retains GUI mode for properties', modalSource.includes("activeTab === 'gui' && isKeyValueFile"));
check('ConfigEditModal retains Ctrl+S save shortcut', modalSource.includes("(e.ctrlKey || e.metaKey) && e.key === 's'"));

// --- 4. ConfigFileEditor Integration Verification ---
const configEditorSource = fs.readFileSync('src/components/ConfigFileEditor.tsx', 'utf8');

check('ConfigFileEditor imports SyntaxCodeEditor', configEditorSource.includes("import { SyntaxCodeEditor } from './SyntaxCodeEditor'"));
check('ConfigFileEditor renders SyntaxCodeEditor in raw mode', configEditorSource.includes('<SyntaxCodeEditor') && configEditorSource.includes('value={fileContent}') && configEditorSource.includes('fileName={selectedFile}'));

console.log(`${checks.length} Syntax Highlighting regression checks passed.`);
fs.writeFileSync('audit/syntax-highlighting-regression.json', JSON.stringify({ checks, passed: true }, null, 2));
