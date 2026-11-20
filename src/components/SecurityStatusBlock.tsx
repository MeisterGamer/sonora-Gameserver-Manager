import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle,
  Zap
} from 'lucide-react';
import { ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

type DdosProtectionLevel = 'standard' | 'strict' | 'mitigation';

interface BlockedAttackEvent {
  id: string;
  timestamp: string;
  sourceIp: string;
  attackVector: string;
  peakRateMbps: number;
  packetsDropped: number;
  action: 'blocked' | 'mitigated';
  rule: string;
  originRegion: string;
  isTest?: boolean;
}

interface SecurityStatusResponse {
  success: boolean;
  serverId: string;
  ddosFilterEnabled: boolean;
  protectionLevel: DdosProtectionLevel;
  rateLimitPps: number;
  updatedAt: string;
  stats: {
    totalBlocked: number;
    blockedLast24h: number;
    totalPacketsDropped: number;
  };
  events: BlockedAttackEvent[];
}

interface SecurityStatusBlockProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

const LEVEL_LABELS: Record<DdosProtectionLevel, string> = {
  standard: 'Standard',
  strict: 'Streng',
  mitigation: 'Dauer-Mitigation'
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export const SecurityStatusBlock: React.FC<SecurityStatusBlockProps> = ({
  server,
  onNotify
}) => {
  const [data, setData] = useState<SecurityStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState<boolean>(true);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: SecurityStatusResponse = await apiRequest(`/api/servers/${encodeURIComponent(server.id)}/security`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Sicherheits-Status konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    setConfirmClear(false);
    loadSecurity();
  }, [loadSecurity]);

  const handleToggleDdos = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const nextEnabled = !data.ddosFilterEnabled;
      const res: SecurityStatusResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/security/ddos`,
        'PATCH',
        { ddosFilterEnabled: nextEnabled }
      );
      setData(res);
      onNotify?.(`DDoS-Filter für ${server.name} wurde ${nextEnabled ? 'aktiviert' : 'deaktiviert'}.`);
    } catch (err: any) {
      setError(err.message || 'DDoS-Filter konnte nicht umgeschaltet werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleLevelChange = async (level: DdosProtectionLevel) => {
    setBusy(true);
    setError(null);
    try {
      const res: SecurityStatusResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/security/ddos`,
        'PATCH',
        { protectionLevel: level }
      );
      setData(res);
      onNotify?.(`DDoS-Schutzstufe auf „${LEVEL_LABELS[level]}“ gesetzt.`);
    } catch (err: any) {
      setError(err.message || 'Schutzstufe konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunFilterTest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res: SecurityStatusResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/security/test-mitigation`,
        'POST'
      );
      setData(res);
      setShowLog(true);
      onNotify?.('DDoS-Filter-Regeltest erfolgreich protokolliert.');
    } catch (err: any) {
      setError(err.message || 'Filter-Test konnte nicht ausgeführt werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearLog = async () => {
    setBusy(true);
    setError(null);
    try {
      const res: SecurityStatusResponse = await apiRequest(
        `/api/servers/${encodeURIComponent(server.id)}/security/events`,
        'DELETE'
      );
      setData(res);
      setConfirmClear(false);
      onNotify?.('Angriffs-Protokoll geleert.');
    } catch (err: any) {
      setError(err.message || 'Protokoll konnte nicht geleert werden.');
    } finally {
      setBusy(false);
    }
  };

  const isActive = data?.ddosFilterEnabled ?? true;
  const events = data?.events || [];

  return (
    <section
      aria-label="Sicherheits-Status"
      className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
    >
      {/* Top Status Strip */}
      <div className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg border shrink-0 ${
            isActive
              ? 'bg-emerald-950/60 border-emerald-800/70 text-emerald-400'
              : 'bg-rose-950/60 border-rose-800/70 text-rose-400'
          }`}>
            {isActive ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <h3 className="text-xs font-bold text-neutral-100">Sicherheits-Status</h3>
              <span aria-hidden="true" className="text-neutral-600">·</span>
              <span className={`text-xs font-semibold ${isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {loading ? 'Prüfe DDoS-Filter...' : isActive ? 'DDoS-Filter aktiv' : 'DDoS-Filter inaktiv'}
              </span>
              {data && (
                <>
                  <span aria-hidden="true" className="text-neutral-600">·</span>
                  <span className="text-xs text-neutral-400 font-mono tabular-nums">
                    {data.stats.blockedLast24h} blockiert (24h)
                  </span>
                  <span aria-hidden="true" className="text-neutral-600">·</span>
                  <span className="text-xs text-neutral-400 font-mono tabular-nums">
                    Limit {(data.rateLimitPps / 1000).toFixed(0)}k pps
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              L4/L7-Angriffserkennung für Port {server.port} · Letzte blockierte Ereignisse im Protokoll
            </p>
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {data && (
            <div className="inline-flex items-center p-0.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs">
              {(['standard', 'strict', 'mitigation'] as DdosProtectionLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={busy}
                  onClick={() => handleLevelChange(lvl)}
                  className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                    data.protectionLevel === lvl
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {LEVEL_LABELS[lvl]}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={busy || loading}
            onClick={handleToggleDdos}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-neutral-950 hover:bg-rose-950/60 border-neutral-800 hover:border-rose-800 text-neutral-300 hover:text-rose-300'
                : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
            }`}
          >
            {isActive ? 'Filter deaktivieren' : 'Filter aktivieren'}
          </button>

          <button
            type="button"
            disabled={busy || !isActive}
            onClick={handleRunFilterTest}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
            title="Prüft aktive DDoS-Regel und protokolliert ein Test-Ereignis"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Filter-Test</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLog((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
          >
            <span>Log ({events.length})</span>
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mx-5 mb-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Blocked Attacks Log Display */}
      {showLog && (
        <div className="border-t border-neutral-800 bg-neutral-950/50">
          <div className="px-5 py-2 border-b border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
            <span className="flex items-center gap-1.5 font-medium text-neutral-300">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Letzte blockierte Angriffe</span>
            </span>
            {events.length > 0 && (
              confirmClear ? (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-rose-300">Log leeren?</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleClearLog}
                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
                  >
                    Nein
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1 text-neutral-500 hover:text-rose-400 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Log leeren</span>
                </button>
              )
            )}
          </div>

          {events.length === 0 ? (
            <div className="px-5 py-3.5 text-xs text-neutral-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>
                Keine blockierten Angriffe protokolliert. Der DDoS-Schutz überwacht eingehende Pakete auf Port {server.port}.
              </span>
              {isActive && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRunFilterTest}
                  className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  Regel-Test protokollieren
                </button>
              )}
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto divide-y divide-neutral-800/70">
              {events.slice(0, 8).map((ev) => (
                <div
                  key={ev.id}
                  className="px-5 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs hover:bg-neutral-900/60 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
                    <span className="font-mono tabular-nums text-neutral-500">
                      {formatTime(ev.timestamp)}
                    </span>
                    <span className="font-semibold text-amber-300">{ev.attackVector}</span>
                    <span className="font-mono text-neutral-300">{ev.sourceIp}</span>
                    <span className="text-neutral-500 font-mono text-[11px]">({ev.rule})</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] shrink-0">
                    <span className="text-neutral-400">{ev.peakRateMbps} Mbit/s</span>
                    <span className="text-neutral-400">{ev.packetsDropped.toLocaleString('de-DE')} Pkt.</span>
                    <span className="text-emerald-400 font-sans font-semibold">
                      {ev.action === 'mitigated' ? 'Gefiltert' : 'Blockiert'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
