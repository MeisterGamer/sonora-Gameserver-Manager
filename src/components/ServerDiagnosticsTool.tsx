import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope,
  RefreshCw,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileWarning,
  Cpu,
  Terminal,
  Network,
  HardDrive
} from 'lucide-react';
import { ServerInstance } from '../types/game';

export type DiagnosticSeverity = 'ok' | 'warning' | 'error';
export type DiagnosticCategory = 'files' | 'dependencies' | 'startup' | 'installation' | 'network';

export interface DiagnosticCheck {
  id: string;
  category: DiagnosticCategory;
  title: string;
  status: DiagnosticSeverity;
  message: string;
  details: string;
  filePath?: string;
  fixable: boolean;
  fixActionLabel?: string;
}

export interface ServerDiagnosticReport {
  serverId: string;
  serverName: string;
  engineLabel: string;
  category: string;
  scannedAt: string;
  overallStatus: 'healthy' | 'warning' | 'critical';
  installationStatus: 'installing' | 'installed' | 'failed';
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    autoFixableCount: number;
  };
  checks: DiagnosticCheck[];
}

export interface QuickFixActionResult {
  checkId: string;
  title: string;
  status: 'fixed' | 'skipped' | 'failed';
  message: string;
}

interface ServerDiagnosticsToolProps {
  server: ServerInstance;
  canQuickFix?: boolean;
  onNotify?: (msg: string) => void;
  onServerUpdated?: () => void;
}

type FilterMode = 'all' | 'issues' | 'fixable' | 'passed';

const CATEGORY_META: Record<DiagnosticCategory, { label: string; icon: React.ReactNode }> = {
  files: { label: 'Spieldateien', icon: <HardDrive className="w-3.5 h-3.5 text-neutral-400" /> },
  dependencies: { label: 'Abhängigkeiten', icon: <Cpu className="w-3.5 h-3.5 text-neutral-400" /> },
  startup: { label: 'Start-Konfiguration', icon: <Terminal className="w-3.5 h-3.5 text-neutral-400" /> },
  installation: { label: 'Installationsstatus', icon: <FileWarning className="w-3.5 h-3.5 text-neutral-400" /> },
  network: { label: 'Netzwerk & Ports', icon: <Network className="w-3.5 h-3.5 text-neutral-400" /> }
};

export const ServerDiagnosticsTool: React.FC<ServerDiagnosticsToolProps> = ({
  server,
  canQuickFix = true,
  onNotify,
  onServerUpdated
}) => {
  const [report, setReport] = useState<ServerDiagnosticReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isFixing, setIsFixing] = useState<boolean>(false);
  const [fixingCheckId, setFixingCheckId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [lastFixActions, setLastFixActions] = useState<QuickFixActionResult[] | null>(null);

  const runScan = useCallback(async (isManual = false) => {
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const endpoint = isManual
        ? `/api/servers/${encodeURIComponent(server.id)}/diagnostics/scan`
        : `/api/servers/${encodeURIComponent(server.id)}/diagnostics`;
      const res = await fetch(endpoint, {
        method: isManual ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.report) {
        throw new Error(data.error || 'Diagnose-Scan konnte nicht durchgeführt werden.');
      }
      setReport(data.report);
      if (isManual) {
        onNotify?.(
          data.report.overallStatus === 'healthy'
            ? 'Diagnose abgeschlossen: Alle Prüfungen bestanden.'
            : `Diagnose abgeschlossen: ${data.report.summary.errors} Fehler, ${data.report.summary.warnings} Warnungen gefunden.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verbindungsfehler beim Ausführen der Server-Diagnose.');
    } finally {
      setIsScanning(false);
    }
  }, [server.id, onNotify]);

  useEffect(() => {
    setLastFixActions(null);
    runScan(false);
  }, [server.id, runScan]);

  const handleQuickFix = async (issueIds?: string[]) => {
    if (!canQuickFix) {
      onNotify?.('Fehlende Berechtigung für Quick-Fix-Reparaturen.');
      return;
    }
    setIsFixing(true);
    setFixingCheckId(issueIds && issueIds.length === 1 ? issueIds[0] : null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/diagnostics/quick-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(issueIds && issueIds.length > 0 ? { issueIds } : {})
      });
      const data = await res.json();
      if (!res.ok || !data.report) {
        throw new Error(data.error || 'Quick-Fix konnte nicht ausgeführt werden.');
      }

      setReport(data.report);
      setLastFixActions(Array.isArray(data.actionsTaken) ? data.actionsTaken : []);

      const fixedCount = (data.actionsTaken || []).filter((a: QuickFixActionResult) => a.status === 'fixed').length;
      const failedCount = (data.actionsTaken || []).filter((a: QuickFixActionResult) => a.status === 'failed').length;

      if (failedCount === 0 && fixedCount > 0) {
        onNotify?.(`Quick-Fix erfolgreich: ${fixedCount} Problem(e) behoben und Installationsstatus verifiziert.`);
      } else if (fixedCount > 0) {
        onNotify?.(`Quick-Fix teilweise erfolgreich: ${fixedCount} behoben, ${failedCount} fehlgeschlagen.`);
      } else if (failedCount > 0) {
        onNotify?.(`Quick-Fix konnte ${failedCount} Problem(e) nicht automatisch lösen. Details im Bericht prüfen.`);
      } else {
        onNotify?.('Keine automatisch behebbaren Probleme vorhanden.');
      }

      onServerUpdated?.();
    } catch (err: any) {
      const msg = err?.message || 'Netzwerkfehler beim Ausführen des Quick-Fix.';
      setErrorMsg(msg);
      onNotify?.(msg);
    } finally {
      setIsFixing(false);
      setFixingCheckId(null);
    }
  };

  const filteredChecks = (report?.checks || []).filter((check) => {
    if (filterMode === 'issues') return check.status !== 'ok';
    if (filterMode === 'fixable') return check.status !== 'ok' && check.fixable;
    if (filterMode === 'passed') return check.status === 'ok';
    return true;
  });

  const formatTimestamp = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const overallLabel = report?.overallStatus === 'healthy'
    ? 'Startbereit & fehlerfrei'
    : report?.overallStatus === 'warning'
      ? 'Warnungen erkannt'
      : 'Kritische Fehler erkannt';

  const overallColorClass = report?.overallStatus === 'healthy'
    ? 'text-emerald-400'
    : report?.overallStatus === 'warning'
      ? 'text-amber-400'
      : 'text-rose-400';

  const installStatusLabel = report?.installationStatus === 'failed'
    ? 'Fehlgeschlagen'
    : report?.installationStatus === 'installing'
      ? 'Installiert...'
      : 'Installiert';

  return (
    <section
      aria-label="Server-Diagnose-Tool"
      className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
    >
      {/* Header Toolbar */}
      <div className="p-5 sm:p-6 border-b border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 className="text-base font-semibold text-neutral-100 tracking-tight">
              Server-Diagnose-Tool
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
            <span>{report?.engineLabel || `${server.gameName || server.name}`}</span>
            <span aria-hidden="true">·</span>
            <span className={overallColorClass}>{report ? overallLabel : 'Scan läuft...'}</span>
            <span aria-hidden="true">·</span>
            <span>
              Installationsstatus:{' '}
              <span className="text-neutral-200 font-medium">{installStatusLabel}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Letzter Scan: {formatTimestamp(report?.scannedAt)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => runScan(true)}
            disabled={isScanning || isFixing}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 border border-neutral-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanne Dateien...' : 'Erneut scannen'}</span>
          </button>

          {canQuickFix && (
            <button
              type="button"
              onClick={() => handleQuickFix()}
              disabled={isScanning || isFixing || !report || report.summary.autoFixableCount === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 border border-emerald-500/40"
            >
              <Wrench className={`w-3.5 h-3.5 ${isFixing ? 'animate-spin' : ''}`} />
              <span>
                {isFixing
                  ? 'Quick-Fix läuft...'
                  : report && report.summary.autoFixableCount > 0
                    ? `Quick-Fix ausführen (${report.summary.autoFixableCount})`
                    : 'Quick-Fix (Alles OK)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Metric Strip (Single-Elevation Grid with Hairline Dividers) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800 border-b border-neutral-800 bg-neutral-950/50">
        <div className="px-5 py-3.5">
          <div className="text-xs text-neutral-400">Geprüfte Punkte</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100 font-mono tabular-nums">
            {report ? report.summary.total : '—'}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs text-neutral-400">Bestanden</div>
          <div className="mt-1 text-lg font-semibold text-emerald-400 font-mono tabular-nums">
            {report ? report.summary.passed : '—'}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs text-neutral-400">Warnungen</div>
          <div className="mt-1 text-lg font-semibold text-amber-400 font-mono tabular-nums">
            {report ? report.summary.warnings : '—'}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs text-neutral-400">Kritische Fehler</div>
          <div className="mt-1 text-lg font-semibold text-rose-400 font-mono tabular-nums">
            {report ? report.summary.errors : '—'}
          </div>
        </div>
      </div>

      {/* Error State */}
      {errorMsg && (
        <div
          role="alert"
          className="px-5 py-3.5 bg-rose-950/30 border-b border-rose-900/50 flex items-center justify-between gap-4 text-xs text-rose-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => runScan(true)}
            className="text-rose-300 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Quick-Fix Execution Summary */}
      {lastFixActions && lastFixActions.length > 0 && (
        <div className="px-5 py-4 bg-emerald-950/20 border-b border-neutral-800 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-emerald-300">
              Ausgeführte Quick-Fix-Aktionen ({lastFixActions.length})
            </h3>
            <button
              type="button"
              onClick={() => setLastFixActions(null)}
              className="text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer whitespace-nowrap"
            >
              Ausblenden
            </button>
          </div>
          <ul className="space-y-1.5 text-xs">
            {lastFixActions.map((act, idx) => (
              <li key={`${act.checkId}-${idx}`} className="flex items-start gap-2.5">
                {act.status === 'fixed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 text-neutral-300">
                  <span className="font-medium text-neutral-100">{act.title}:</span>{' '}
                  <span>{act.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter Bar */}
      <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-900">
        <div className="flex items-center gap-1 p-1 bg-neutral-950 rounded-lg border border-neutral-800">
          {([
            { id: 'all', label: `Alle (${report?.summary.total ?? 0})` },
            {
              id: 'issues',
              label: `Probleme (${(report?.summary.errors ?? 0) + (report?.summary.warnings ?? 0)})`
            },
            { id: 'fixable', label: `Quick-Fix (${report?.summary.autoFixableCount ?? 0})` },
            { id: 'passed', label: `Bestanden (${report?.summary.passed ?? 0})` }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                filterMode === tab.id
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-neutral-500">
          Prüft Spieldateien, Java/Steam-Abhängigkeiten, EULA, Start-Skripte, Ports &amp; Registry-Status
        </div>
      </div>

      {/* Diagnostic Check Rows */}
      {isScanning && !report ? (
        <div className="divide-y divide-neutral-800/80">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-3.5 w-48 bg-neutral-800 rounded" />
                <div className="h-3 w-96 max-w-full bg-neutral-800/60 rounded" />
              </div>
              <div className="h-7 w-24 bg-neutral-800 rounded" />
            </div>
          ))}
        </div>
      ) : filteredChecks.length === 0 ? (
        <div className="px-6 py-12 text-center space-y-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
          <p className="text-sm font-medium text-neutral-200">
            {filterMode === 'all'
              ? 'Keine Prüfpunkte vorhanden'
              : 'Keine Einträge für diesen Filter gefunden'}
          </p>
          <p className="text-xs text-neutral-400">
            {filterMode === 'issues' || filterMode === 'fixable'
              ? 'Alle automatisch prüfbaren Dateien und Start-Konfigurationen sind fehlerfrei.'
              : 'Wähle einen anderen Filter oder starte einen neuen Scan.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/80">
          {filteredChecks.map((check) => {
            const catMeta = CATEGORY_META[check.category] || CATEGORY_META.files;
            const statusText =
              check.status === 'ok'
                ? 'Bestanden'
                : check.status === 'warning'
                  ? 'Warnung'
                  : 'Fehler';
            const statusColor =
              check.status === 'ok'
                ? 'text-emerald-400'
                : check.status === 'warning'
                  ? 'text-amber-400'
                  : 'text-rose-400';

            const isThisFixing = isFixing && (fixingCheckId === null || fixingCheckId === check.id);

            return (
              <div
                key={check.id}
                className="px-5 py-4 hover:bg-neutral-800/30 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-0.5 shrink-0">
                    {check.status === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : check.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-neutral-100">
                        {check.title}
                      </span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span className={`text-xs font-medium ${statusColor}`}>
                        {statusText}
                      </span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                        {catMeta.icon}
                        <span>{catMeta.label}</span>
                      </span>
                    </div>

                    <p className="text-xs text-neutral-200 leading-relaxed">
                      {check.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span>{check.details}</span>
                      {check.filePath && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-neutral-400 break-all">
                            {check.filePath}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {check.status !== 'ok' && check.fixable && canQuickFix && (
                  <div className="shrink-0 sm:pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleQuickFix([check.id])}
                      disabled={isFixing || isScanning}
                      className="px-3.5 py-1.5 bg-neutral-800 hover:bg-emerald-600 text-neutral-100 hover:text-white disabled:opacity-50 rounded-lg text-xs font-medium border border-neutral-700 hover:border-emerald-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    >
                      <Wrench className={`w-3.5 h-3.5 ${isThisFixing ? 'animate-spin' : ''}`} />
                      <span>{isThisFixing ? 'Behebe...' : (check.fixActionLabel || 'Quick-Fix')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
