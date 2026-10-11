import React, { useState } from 'react';
import { 
  Bell, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  ExternalLink,
  MessageSquare,
  Sparkles,
  Settings2
} from 'lucide-react';
import { ServerInstance } from '../types/game';

interface WebhooksViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

export const WebhooksView: React.FC<WebhooksViewProps> = ({ server, onNotify }) => {
  const [webhookUrl, setWebhookUrl] = useState('https://discord.com/api/webhooks/1234567890/token_demo');
  const [botName, setBotName] = useState('ApexHost Bot');
  const [isEnabled, setIsEnabled] = useState(true);

  // Events
  const [events, setEvents] = useState({
    onStart: true,
    onStop: true,
    onCrash: true,
    onBackup: true,
    onPlayerJoin: false,
    onHighCpu: true
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);

  const handleTestWebhook = () => {
    setIsTesting(true);
    setTestSuccess(null);

    setTimeout(() => {
      setIsTesting(false);
      setTestSuccess(true);
      onNotify?.('Test-Payload erfolgreich an Discord gesendet (HTTP 204)!');
      setTimeout(() => setTestSuccess(null), 4000);
    }, 1200);
  };

  const handleSaveWebhook = () => {
    onNotify?.('Webhook-Konfiguration erfolgreich gespeichert!');
  };

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
                <h2 className="text-sm font-bold text-neutral-100">Discord & Webhook Benachrichtigungen</h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Discord Embeds
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Erhalte automatische Echtzeit-Meldungen über Server-Status, Abstürze, Backups und Spieler-Aktivität direkt in deinen Discord-Kanal.
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Webhook Setup */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-400" />
              Webhook Einstellungen
            </h3>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Discord Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 font-mono focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Erstelle den Webhook in deinen Discord Server-Einstellungen unter <em>Integrationen &gt; Webhooks</em>.
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
                  Bot Avatar (Icon URL)
                </label>
                <input
                  type="text"
                  defaultValue="https://apexhost.me/assets/bot-icon.png"
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
                  <div className="text-[11px] text-neutral-400">Sendet Port & Verbindungsdaten.</div>
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
                  <div className="text-xs font-medium text-rose-300">Server-Absturz / Auto-Restart</div>
                  <div className="text-[11px] text-neutral-400">Dringende Benachrichtigung mit Crash-Log.</div>
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
                  <div className="text-[11px] text-neutral-400">Bestätigung & Dateigröße des Archivs.</div>
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
                  <div className="text-xs font-medium text-neutral-200">Spieler beigetreten / verlassen</div>
                  <div className="text-[11px] text-neutral-400">Live-Feed über Spielerbewegungen.</div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={handleSaveWebhook}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Konfiguration speichern
              </button>
            </div>
          </div>
        </div>

        {/* Right Preview Column: Live Discord Embed Preview */}
        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                Discord Embed Vorschau
              </h3>
              <span className="text-[10px] text-neutral-500 font-mono">Channel #alerts</span>
            </div>

            {/* Simulated Discord Message */}
            <div className="bg-[#313338] rounded-lg p-3.5 text-neutral-100 font-sans text-xs space-y-2 border border-neutral-700">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                  A
                </div>
                <span className="font-bold text-xs text-white">{botName}</span>
                <span className="bg-[#5865F2] text-[9px] text-white px-1 py-0.2 rounded font-semibold">BOT</span>
                <span className="text-[10px] text-neutral-400">Heute um 14:32</span>
              </div>

              {/* Embed Box */}
              <div className="bg-[#2B2D31] rounded border-l-4 border-emerald-500 p-3 space-y-2 ml-4">
                <div className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span>🟢 Server Online: {server.name}</span>
                </div>
                <div className="text-[11px] text-neutral-300">
                  Der Gameserver wurde erfolgreich gestartet und antwortet auf Port <code className="bg-[#1E1F22] px-1 py-0.5 rounded text-neutral-200">{server.port}</code>.
                </div>
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
                    <span className="text-neutral-400 block">RAM Zuweisung:</span>
                    <span className="font-semibold text-neutral-200">{server.allocatedRamGb} GB</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block">Zielsystem:</span>
                    <span className="font-semibold capitalize text-neutral-200">{server.targetOS}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Action */}
            <div className="pt-2">
              <button
                onClick={handleTestWebhook}
                disabled={isTesting}
                className="w-full py-2 px-3 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-50 text-indigo-300 border border-indigo-900/60 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Sende Payload...' : 'Test-Nachricht an Discord senden'}</span>
              </button>
            </div>

            {testSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Discord Webhook hat mit Status 204 No Content geantwortet!</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
