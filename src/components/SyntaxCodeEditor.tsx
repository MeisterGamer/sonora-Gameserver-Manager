import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  detectLanguage, 
  highlightLineToHtml, 
  validateJson, 
  validateYaml, 
  validateProperties,
  formatJson,
  SupportedLanguage,
  SyntaxValidationResult
} from '../utils/syntaxHighlighter';
import { 
  Check, 
  AlertCircle, 
  Sparkles, 
  Search, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Code2, 
  FileCode2,
  WrapText,
  Eye,
  SlidersHorizontal,
  Wand2
} from 'lucide-react';

interface SyntaxCodeEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  fileName: string;
  readOnly?: boolean;
  className?: string;
}

export const SyntaxCodeEditor: React.FC<SyntaxCodeEditorProps> = ({
  value,
  onChange,
  fileName,
  readOnly = false,
  className = ''
}) => {
  const language = useMemo<SupportedLanguage>(() => detectLanguage(fileName), [fileName]);
  const [syntaxEnabled, setSyntaxEnabled] = useState<boolean>(true);
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState<number>(0);
  const [activeLine, setActiveLine] = useState<number>(1);
  const [formatFeedback, setFormatFeedback] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const lineGutterRef = useRef<HTMLDivElement | null>(null);

  // Compute validation
  const validationResult = useMemo<SyntaxValidationResult>(() => {
    switch (language) {
      case 'json':
        return validateJson(value);
      case 'yaml':
        return validateYaml(value);
      case 'properties':
        return validateProperties(value);
      default:
        return { isValid: true, type: 'generic' };
    }
  }, [value, language]);

  // Split lines for line numbering and rendering
  const lines = useMemo(() => value.split('\n'), [value]);
  const lineCount = lines.length;

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const matches: { line: number; col: number; len: number }[] = [];
    lines.forEach((line, lineIdx) => {
      let startIndex = 0;
      const lower = line.toLowerCase();
      while ((startIndex = lower.indexOf(query, startIndex)) !== -1) {
        matches.push({ line: lineIdx + 1, col: startIndex, len: query.length });
        startIndex += query.length;
      }
    });
    return matches;
  }, [lines, searchQuery]);

  // Synchronize scrolling between textarea and pre/line gutter
  const handleScroll = useCallback(() => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;

    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Update cursor position line tracking
  const updateCursorLine = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart || 0;
    const lineNum = value.slice(0, pos).split('\n').length;
    setActiveLine(lineNum);
  };

  // Keyboard navigation & smart Tab handling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Intercept Tab to insert 2 spaces
    if (e.key === 'Tab' && !readOnly) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = '  ';

      const nextVal = value.substring(0, start) + spaces + value.substring(end);
      onChange(nextVal);

      // Restore cursor position after state flush
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }

    // Ctrl+F / Cmd+F to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  };

  // Format JSON action
  const handleFormatJson = () => {
    if (language !== 'json') return;
    const res = formatJson(value, 2);
    if (res.success) {
      onChange(res.formatted);
      setFormatFeedback('JSON formatiert');
      setTimeout(() => setFormatFeedback(null), 2000);
    } else {
      setFormatFeedback('Fehler: Ungültiges JSON');
      setTimeout(() => setFormatFeedback(null), 3000);
    }
  };

  // Jump to next/prev search match
  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchMatches.length;
    setCurrentMatchIdx(nextIdx);
    scrollToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIdx(prevIdx);
    scrollToMatch(prevIdx);
  };

  const scrollToMatch = (matchIdx: number) => {
    const match = searchMatches[matchIdx];
    if (!match || !textareaRef.current) return;
    const lineIndex = match.line - 1;
    const lineHeight = 20; // approximate font-mono 12px line height
    textareaRef.current.scrollTop = Math.max(0, lineIndex * lineHeight - 60);
    handleScroll();
  };

  // Language display properties
  const languageLabel = useMemo(() => {
    switch (language) {
      case 'json':
        return { name: 'JSON', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'yaml':
        return { name: 'YAML', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
      case 'properties':
        return { name: 'Java Properties', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      default:
        return { name: 'Text / Config', badge: 'bg-neutral-800 text-neutral-400 border-neutral-700' };
    }
  }, [language]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 bg-neutral-950 border border-neutral-800/80 rounded-lg overflow-hidden shadow-inner ${className}`}>
      {/* Editor Toolbar */}
      <div className="bg-neutral-900/90 border-b border-neutral-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Syntax Language Chip */}
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${languageLabel.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${syntaxEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
            {languageLabel.name}
          </span>

          {/* Validation Status Indicator */}
          {validationResult.type !== 'generic' && (
            <div 
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                validationResult.isValid 
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' 
                  : 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
              }`}
              title={validationResult.message}
            >
              {validationResult.isValid ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
              )}
              <span className="truncate max-w-[220px] sm:max-w-[320px]">
                {validationResult.message || (validationResult.isValid ? 'Syntax OK' : 'Syntaxfehler')}
              </span>
            </div>
          )}

          {formatFeedback && (
            <span className="text-xs font-mono text-cyan-300 animate-in fade-in">
              {formatFeedback}
            </span>
          )}
        </div>

        {/* Editor Controls */}
        <div className="flex items-center gap-1.5">
          {/* JSON Formatter Button */}
          {language === 'json' && !readOnly && (
            <button
              type="button"
              onClick={handleFormatJson}
              className="flex items-center gap-1 px-2.5 py-1 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 hover:text-emerald-300 text-xs font-mono rounded border border-neutral-700/60 transition-colors cursor-pointer"
              title="JSON mit 2 Leerzeichen formatieren"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Formatieren</span>
            </button>
          )}

          {/* Search Toggle */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1.5 rounded border text-xs font-mono transition-colors cursor-pointer flex items-center gap-1 ${
              isSearchOpen || searchQuery 
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60' 
                : 'bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-neutral-700/60'
            }`}
            title="Suchen (Strg+F)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Suchen</span>
          </button>

          {/* Word Wrap Toggle */}
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`p-1.5 rounded border text-xs transition-colors cursor-pointer ${
              wordWrap 
                ? 'bg-neutral-800 text-emerald-400 border-neutral-700' 
                : 'bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-neutral-700/60'
            }`}
            title={wordWrap ? 'Zeilenumbruch aktiv' : 'Zeilenumbruch deaktiviert'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Syntax Highlighting Toggle */}
          <button
            type="button"
            onClick={() => setSyntaxEnabled(!syntaxEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono transition-colors cursor-pointer ${
              syntaxEnabled 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60' 
                : 'bg-neutral-850 hover:bg-neutral-800 text-neutral-400 border-neutral-700/60'
            }`}
            title="Syntax-Highlighting ein-/ausschalten"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">{syntaxEnabled ? 'Syntax: An' : 'Syntax: Aus'}</span>
          </button>
        </div>
      </div>

      {/* In-File Search Bar (when opened) */}
      {isSearchOpen && (
        <div className="bg-neutral-900 border-b border-neutral-800 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIdx(0);
              }}
              placeholder="In Datei suchen (z. B. port, motd, true)..."
              autoFocus
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-100 font-mono focus:outline-none focus:border-neutral-700"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {searchQuery && (
              <span className="text-[11px] font-mono text-neutral-400">
                {searchMatches.length > 0 
                  ? `${currentMatchIdx + 1} von ${searchMatches.length}` 
                  : 'Keine Treffer'}
              </span>
            )}
            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={searchMatches.length === 0}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 transition-colors cursor-pointer"
              title="Vorheriger Treffer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={searchMatches.length === 0}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-300 transition-colors cursor-pointer"
              title="Nächster Treffer"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
              }}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer ml-1"
              title="Suche schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 flex min-h-0 relative bg-neutral-950 overflow-hidden font-mono text-xs">
        {/* Line Gutter */}
        <div 
          ref={lineGutterRef}
          aria-hidden="true"
          className="w-12 bg-neutral-950/95 text-neutral-600 text-right pr-2 py-3 select-none border-r border-neutral-800/80 overflow-hidden leading-[1.625rem] shrink-0"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isErrorLine = validationResult.line === lineNum;
            const isCursorLine = activeLine === lineNum;
            return (
              <div 
                key={lineNum} 
                className={`transition-colors ${
                  isErrorLine 
                    ? 'text-rose-400 font-bold bg-rose-950/40' 
                    : isCursorLine 
                    ? 'text-neutral-400 font-semibold' 
                    : ''
                }`}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Code Canvas Container */}
        <div className="flex-1 relative overflow-hidden">
          {/* Synchronized Syntax Highlight Backdrop */}
          {syntaxEnabled && (
            <pre
              ref={preRef}
              aria-hidden="true"
              className={`absolute inset-0 p-3 m-0 font-mono text-xs leading-[1.625rem] pointer-events-none select-none overflow-hidden ${
                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
              }`}
              style={{
                tabSize: 2,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
              }}
            >
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                const isErrorLine = validationResult.line === lineNum;
                const html = highlightLineToHtml(line, language);

                return (
                  <div 
                    key={idx}
                    className={`${isErrorLine ? 'bg-rose-950/30 ring-1 ring-rose-500/30 rounded-xs' : ''}`}
                    dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
                  />
                );
              })}
              {/* Extra spacing at bottom */}
              <div className="h-10" />
            </pre>
          )}

          {/* Interactive Textarea Layer */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              updateCursorLine();
            }}
            onScroll={handleScroll}
            onSelect={updateCursorLine}
            onClick={updateCursorLine}
            onKeyUp={updateCursorLine}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className={`w-full h-full p-3 font-mono text-xs leading-[1.625rem] bg-transparent resize-none border-none outline-none focus:ring-0 ${
              syntaxEnabled 
                ? 'text-transparent caret-emerald-400 selection:bg-emerald-900/50 selection:text-transparent' 
                : 'text-neutral-200 caret-emerald-400 selection:bg-emerald-900/80 selection:text-white'
            } ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'} overflow-y-auto`}
            style={{
              tabSize: 2,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
            }}
            placeholder="Konfigurationsdatei bearbeiten..."
          />
        </div>
      </div>

      {/* Editor Status Bar */}
      <div className="bg-neutral-950 border-t border-neutral-800/80 px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-neutral-500 shrink-0">
        <div className="flex items-center gap-3">
          <span>Zeile {activeLine}, Spalte 1</span>
          <span>•</span>
          <span>{lineCount} Zeilen</span>
          <span>•</span>
          <span>{value.length} Zeichen</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">Tab = 2 Leerzeichen</span>
          <span>•</span>
          <span className="capitalize">{language} Modus</span>
        </div>
      </div>
    </div>
  );
};
