import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Settings2,
  Code2,
  Save
} from 'lucide-react';
import { ServerInstance } from '../types/game';
import { apiRequest } from '../services/api';

interface WebhooksViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

type ExampleKey = 'start' | 'crash' | 'backup';

export const WebhooksView: React.FC<WebhooksViewProps> = ({ server, onNotify }) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [botName, setBotName] = useState('ApexHost Bot');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  const [events, setEvents] = useState({
    onStart: true,
    onStop: true,
    onCrash: true,
    onBackup: true,
    onPlayerJoin: false,
    onHighCpu: true
  });

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Interactive payload examples switcher
  const [previewExample, setPreviewExample] = useState<ExampleKey>('start');
  const [showJsonExample, setShowJsonExample] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTestResult(null);
    setSaveError(null);
    apiRequest(`/api/servers/${server.id}/webhooks`)
      .then((data) => {
        if (!active || !data?.config) return;
        setWebhookUrl(data.config.webhookUrl || '');
        setBotName(data.config.botName || 'ApexHost Bot');
        setAvatarUrl(data.config.avatarUrl || '');
        setIsEnabled(Boolean(data.config.isEnabled));
        if (data.config.events) {
          setEvents(prev => ({ ...prev, ...data.config.events }));
        }
      })
      .catch((err) => {
        if (active) setSaveError(err.message || 'Webhook-Konfiguration konnte nicht geladen werden.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [server.id]);

  const handleSaveWebhook = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await apiRequest(`/api/servers/${server.id}/webhooks`, 'POST', {
        webhookUrl: webhookUrl.trim(),
        botName: botName.trim() || 'ApexHost Bot',
        avatarUrl: avatarUrl.trim(),
        isEnabled,
        events
      });
      onNotify?.('Webhook-Konfiguration dauerhaft auf dem Host gespeichert!');
    } catch (err: any) {
      setSaveError(err.message || 'Fehler beim Speichern der Webhook-Konfiguration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const data = await apiRequest(`/api/servers/${server.id}/webhooks/test`, 'POST', {
        webhookUrl: webhookUrl.trim(),
        botName: botName.trim() || 'ApexHost Bot'
      });
      const msg = data.message || `Webhook zugestellt (HTTP ${data.status}).`;
      setTestResult({ ok: true, message: msg });
      onNotify?.(msg);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Test-Versand fehlgeschlagen.' });
    } finally {
      setIsTesting(false);
    }
  };

  const EXAMPLE_META: Record<ExampleKey, {
    label: string;
    borderClass: string;
    colorInt: number;
    title: string;
    description: string;
    extraFieldLabel: string;
    extraFieldValue: string;
  }> = {
    start: {
      label: 'Server Online',
      borderClass: 'border-emerald-500',
      colorInt: 0x10b981,
      title: `Server Online: ${server.name}`,
      description: `Der Gameserver wurde erfolgreich gestartet und ist auf Port ${server.port} erreichbar.`,
      extraFieldLabel: 'RAM Zuweisung:',
      extraFieldValue: `${server.allocatedRamGb} GB`
    },
    crash: {
      label: 'Absturz-Warnung',
      borderClass: 'border-rose-500',
      colorInt: 0xf43f5e,
      title: `Absturz erkannt: ${server.name}`,
      description: `Der Server-Prozess wurde unerwartet beendet (Exit-Code 137 / OutOfMemory).`,
      extraFieldLabel: 'Diagnose:',
      extraFieldValue: 'Crash-Log erfasst'
    },
    backup: {
      label: 'Backup Fertig',
      borderClass: 'border-sky-500',
      colorInt: 0x0ea5e9,
      title: `Backup abgeschlossen: ${server.name}`,
      description: `Vollständige Welt- & Konfigurations-Sicherung als .tar.gz Archiv mit SHA-256 Prüfsumme erstellt.`,
      extraFieldLabel: 'Speicher-Pfad:',
      extraFieldValue: `/backups/${server.id}/`
    }
  };

  const currentEx = EXAMPLE_META[previewExample];
  const sampleJsonPayload = JSON.stringify({
    username: botName || 'ApexHost Bot',
    ...(avatarUrl.trim() ? { avatar_url: avatarUrl.trim() } : {}),
    embeds: [
      {
        title: currentEx.title,
        description: currentEx.description,
        color: currentEx.colorInt,
        fields: [
          { name: 'Spiel', value: server.gameName, inline: true },
          { name: 'Version', value: server.version, inline: true },
          { name: currentEx.extraFieldLabel.replace(':', ''), value: currentEx.extraFieldValue, inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  }, null, 2);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-indigo-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-neutral-100">Discord &amp; Webhook Benachrichtigungen</h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Echtzeit-Dispatch
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Erhalte echte HTTP-Webhook-Meldungen bei Server-Starts, Stopps, Abstürzen, Backups und Spieler-Beitritten direkt in Discord.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
              />
              <span className="font-medium">Webhook aktiv</span>
            </label>
          </div>
        </div>
      </div>

      {saveError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Webhook Setup */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-400" />
                <span>Webhook Einstellungen {loading ? '(Lädt...)' : ''}</span>
              </h3>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Discord Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/123456789012345678/..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Erstelle einen Webhook in deinen Discord Server-Einstellungen unter <em>Integrationen &gt; Webhooks</em> und füge die URL hier ein.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Bot Name
                </label>
                <input
                  type="text"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Bot Avatar (Optional URL)
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://beispiel.de/bot-avatar.png"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Trigger Events */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
              Abonnierte Ereignisse (Triggers)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onStart}
                  onChange={(e) => setEvents({ ...events, onStart: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Server gestartet</div>
                  <div className="text-[11px] text-neutral-400">Sendet Port &amp; Verbindungsdaten.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onStop}
                  onChange={(e) => setEvents({ ...events, onStop: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Server gestoppt</div>
                  <div className="text-[11px] text-neutral-400">Meldung bei geplantem Herunterfahren.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onCrash}
                  onChange={(e) => setEvents({ ...events, onCrash: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-rose-300">Server-Absturz / Fehler</div>
                  <div className="text-[11px] text-neutral-400">Dringende Benachrichtigung mit Exit-Code.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onBackup}
                  onChange={(e) => setEvents({ ...events, onBackup: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Backup abgeschlossen</div>
                  <div className="text-[11px] text-neutral-400">Bestätigung &amp; Dateigröße des Archivs.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onHighCpu}
                  onChange={(e) => setEvents({ ...events, onHighCpu: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-amber-300">Hohe Lastwarnung (&gt;90% CPU/RAM)</div>
                  <div className="text-[11px] text-neutral-400">Frühwarnsystem für Performance-Lags.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.onPlayerJoin}
                  onChange={(e) => setEvents({ ...events, onPlayerJoin: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500 bg-neutral-900 border-neutral-700"
                />
                <div>
                  <div className="text-xs font-medium text-neutral-200">Spieler beigetreten</div>
                  <div className="text-[11px] text-neutral-400">Live-Feed bei Spieler-Beitritten im Log.</div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={handleSaveWebhook}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Speichere...' : 'Konfiguration speichern'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Preview Column: Discord Embed & Payload Examples */}
        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>Discord Payload Beispiele</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowJsonExample(v => !v)}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-indigo-300 hover:text-indigo-200 flex items-center gap-1 cursor-pointer"
              >
                <Code2 className="w-3 h-3" />
                <span>{showJsonExample ? 'Embed-Vorschau' : 'JSON Beispiel'}</span>
              </button>
            </div>

            {/* Example Selector Tabs */}
            <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-[11px]">
              {(['start', 'crash', 'backup'] as ExampleKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreviewExample(key)}
                  className={`flex-1 py-1 px-2 rounded cursor-pointer transition-colors ${
                    previewExample === key
                      ? 'bg-neutral-800 text-indigo-300 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {EXAMPLE_META[key].label}
                </button>
              ))}
            </div>

            {showJsonExample ? (
              <pre className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-60">
                {sampleJsonPayload}
              </pre>
            ) : (
              <div className="bg-[#313338] rounded-lg p-3.5 text-neutral-100 font-sans text-xs space-y-2 border border-neutral-700">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                    {(botName || 'A').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="font-bold text-xs text-white">{botName || 'ApexHost Bot'}</span>
                  <span className="bg-[#5865F2] text-[9px] text-white px-1 py-0.2 rounded font-semibold">BOT</span>
                  <span className="text-[10px] text-neutral-400">Beispiel-Embed</span>
                </div>

                {/* Embed Box */}
                <div className={`bg-[#2B2D31] rounded border-l-4 ${currentEx.borderClass} p-3 space-y-2 ml-4`}>
                  <div className="font-bold text-xs text-white">{currentEx.title}</div>
                  <div className="text-[11px] text-neutral-300">{currentEx.description}</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-neutral-700/60">
                    <div>
                      <span className="text-neutral-400 block">Spiel:</span>
                      <span className="font-semibold text-neutral-200">{server.gameName}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Version:</span>
                      <span className="font-semibold text-neutral-200">{server.version}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">{currentEx.extraFieldLabel}</span>
                      <span className="font-semibold text-neutral-200">{currentEx.extraFieldValue}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Zielsystem:</span>
                      <span className="font-semibold capitalize text-neutral-200">{server.targetOS}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Test Action */}
            <div className="pt-2">
              <button
                onClick={handleTestWebhook}
                disabled={isTesting}
                className="w-full py-2 px-3 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-50 text-indigo-300 border border-indigo-900/60 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Sende echten Test-Request...' : 'Test-Nachricht an Webhook senden'}</span>
              </button>
            </div>

            {testResult && (
              <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                testResult.ok
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}>
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
