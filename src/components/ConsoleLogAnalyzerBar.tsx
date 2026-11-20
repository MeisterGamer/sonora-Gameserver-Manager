import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Play,
  RotateCw,
  ShieldCheck,
  Stethoscope,
  Wrench
} from 'lucide-react';
import type { LogMessage, ServerInstance } from '../types/game';
import {
  analyzeConsoleLogs,
  type DetectedLogIssue,
  type LogFixId
} from '../utils/logPatterns';

interface QuickFixResponseItem {
  fixId: LogFixId;
  status: 'fixed' | 'failed';
  message: string;
  filesystemChanges: string[];
}

interface ConsoleLogAnalyzerBarProps {
  server: ServerInstance;
  logs: LogMessage[];
  canQuickFix?: boolean;
  onStartServer?: () => void;
  onNotify?: (msg: string) => void;
  onServerUpdated?: () => void;
  onOpenDiagnostics?: () => void;
}

export const ConsoleLogAnalyzerBar: React.FC<ConsoleLogAnalyzerBarProps> = ({
  server,
  logs,
  canQuickFix = true,
  onStartServer,
  onNotify,
  onServerUpdated,
  onOpenDiagnostics
}) => {
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<QuickFixResponseItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Instant real-time detection directly from live console logs
  const detectedIssues: DetectedLogIssue[] = useMemo(
    () => analyzeConsoleLogs(logs),
    [logs]
  );

  const runQuickFix = async (fixIds: LogFixId[], key: string) => {
    setFixingId(key);
    setErrorMsg(null);
    setLastResults([]);
    try {
      const res = await fetch(`/api/servers/${server.id}/log-analysis/quick-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fixIds.length === 1 ? { fixId: fixIds[0] } : { fixIds })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Quick-Fix konnte nicht ausgeführt werden.');
      }
      const items: QuickFixResponseItem[] = Array.isArray(data.results) ? data.results : [];
      setLastResults(items);
      const fixedCount = items.filter((r) => r.status === 'fixed').length;
      if (fixedCount > 0) {
        onNotify?.(`Quick-Fix abgeschlossen: ${fixedCount} Fehler direkt auf Dateisystem-Ebene behoben.`);
        onServerUpdated?.();
      } else {
        setErrorMsg(items[0]?.message || data.message || 'Fehler konnte nicht automatisch behoben werden.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Netzwerkfehler beim Ausführen des Quick-Fix.';
      setErrorMsg(msg);
      onNotify?.(`Quick-Fix Fehler: ${msg}`);
    } finally {
      setFixingId(null);
    }
  };

  // Compact active status bar when console logs are clean
  if (detectedIssues.length === 0) {
    return (
      <div
        data-testid="console-log-analyzer"
        className="rounded-xl border border-neutral-800 bg-neutral-900/90 px-4 py-3 text-xs space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-neutral-200 flex items-center gap-2">
                <span>Automatische Echtzeit-Log-Analyse aktiv</span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {logs.length} Zeilen überwacht
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate">
                Erkennt JAR-Fehler, Berechtigungsprobleme (Permission denied), fehlende Bibliotheken &amp; unvollständige SteamCMD-Downloads in Echtzeit.
              </p>
            </div>
          </div>

          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vollständige Diagnose</span>
            </button>
          )}
        </div>

        {lastResults.length > 0 && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/35 p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Dateisystem-Reparatur erfolgreich abgeschlossen</span>
              </div>
              {server.status === 'offline' && onStartServer && (
                <button
                  type="button"
                  onClick={onStartServer}
                  className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Server jetzt starten</span>
                </button>
              )}
            </div>
            <ul className="space-y-1 text-[11px] text-emerald-200/90 font-mono pl-6 list-disc">
              {lastResults.flatMap((r) =>
                r.filesystemChanges.length > 0 ? r.filesystemChanges : [r.message]
              ).map((change, idx) => (
                <li key={idx}>{change}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="console-log-analyzer"
      role="alert"
      className="rounded-xl border border-rose-500/50 bg-neutral-900/95 p-4 space-y-3 text-xs shadow-lg shadow-rose-950/20"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
            <FileWarning className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-200 flex items-center gap-2">
              <span>Echtzeit-Log-Analyse: {detectedIssues.length} bekannte Fehler erkannt</span>
            </h3>
            <p className="text-[11px] text-neutral-400">
              Direkte Behebung auf Dateisystem-Ebene über Quick-Fix verfügbar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canQuickFix && detectedIssues.length > 1 && (
            <button
              type="button"
              onClick={() => runQuickFix(detectedIssues.map((i) => i.fixId), 'all')}
              disabled={fixingId !== null}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {fixingId === 'all' ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wrench className="w-3.5 h-3.5" />
              )}
              <span>{fixingId === 'all' ? 'Behebe alle...' : `Alle ${detectedIssues.length} Fehler beheben`}</span>
            </button>
          )}
          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
              <span>Diagnose</span>
            </button>
          )}
        </div>
      </div>

      {/* Detected Issues List */}
      <div className="space-y-2.5">
        {detectedIssues.map((issue) => {
          const isFixingThis = fixingId === issue.fixId || fixingId === 'all';
          return (
            <div
              key={issue.id}
              data-testid={`log-issue-${issue.fixId}`}
              className={`rounded-lg border p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                issue.severity === 'critical'
                  ? 'bg-rose-950/25 border-rose-800/60'
                  : 'bg-amber-950/25 border-amber-800/60'
              }`}
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      issue.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  />
                  <span className="font-bold text-neutral-100">{issue.title}</span>
                  {issue.occurrences > 1 && (
                    <span className="text-[10px] font-mono text-neutral-400">
                      ({issue.occurrences}× erkannt)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-300 leading-snug">{issue.description}</p>
                <div className="rounded bg-neutral-950/80 border border-neutral-800 px-2.5 py-1.5 font-mono text-[11px] text-rose-300 break-all">
                  {issue.matchedTimestamp ? `[${issue.matchedTimestamp}] ` : ''}
                  {issue.matchedLine}
                </div>
                <p className="text-[11px] text-emerald-400/90">
                  Dateisystem-Aktion: {issue.filesystemAction}
                </p>
              </div>

              {canQuickFix && (
                <button
                  type="button"
                  data-testid={`quick-fix-btn-${issue.fixId}`}
                  onClick={() => runQuickFix([issue.fixId], issue.fixId)}
                  disabled={fixingId !== null}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors shadow-sm shadow-emerald-950/50"
                >
                  {isFixingThis ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Repariere...</span>
                    </>
                  ) : (
                    <>
                      <Wrench className="w-3.5 h-3.5" />
                      <span>{issue.fixLabel}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-950/50 px-3 py-2 text-[11px] text-rose-200">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
