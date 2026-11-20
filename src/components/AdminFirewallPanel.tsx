import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Plus,
  Trash2,
  Flame,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Network
} from 'lucide-react';
import { apiRequest } from '../services/api';

interface FirewallRuleItem {
  id: string;
  serverId: string;
  serverName: string;
  port: number;
  protocol: 'tcp' | 'udp';
  purpose: 'game' | 'query' | 'rcon' | 'manual';
  appliedOnHost: boolean;
  backend: 'ufw' | 'iptables' | 'recorded-only';
  note?: string;
  createdAt: string;
}

interface HostFirewallStatus {
  platform: string;
  ufwAvailable: boolean;
  ufwActive: boolean;
  iptablesAvailable: boolean;
  ddosSysctlInstalled: boolean;
  fail2banActive: boolean;
  autoPortManagementEnabled: boolean;
  protectedSystemPorts: number[];
  rulesCount: number;
}

export const AdminFirewallPanel: React.FC = () => {
  const [hostStatus, setHostStatus] = useState<HostFirewallStatus | null>(null);
  const [rules, setRules] = useState<FirewallRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newPort, setNewPort] = useState('25565');
  const [newProtocol, setNewProtocol] = useState<'tcp' | 'udp'>('tcp');
  const [newLabel, setNewLabel] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  const loadFirewall = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/firewall');
      if (res?.success) {
        setHostStatus(res.hostStatus || null);
        setRules(Array.isArray(res.rules) ? res.rules : []);
      }
    } catch (err: any) {
      showNotice('err', err.message || 'Firewall-Status konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirewall();
  }, [loadFirewall]);

  const handleSyncPorts = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest('/api/admin/firewall/sync', 'POST', {});
      await loadFirewall();
      showNotice('ok', res?.message || 'Alle Server-Ports wurden synchronisiert.');
    } catch (err: any) {
      showNotice('err', err.message || 'Synchronisation fehlgeschlagen.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(newPort, 10);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      showNotice('err', 'Bitte einen gültigen Port zwischen 1024 und 65535 angeben.');
      return;
    }
    try {
      const res = await apiRequest('/api/admin/firewall/ports', 'POST', {
        port: portNum,
        protocol: newProtocol,
        label: newLabel.trim() || `Manuell (${portNum}/${newProtocol})`
      });
      setNewLabel('');
      await loadFirewall();
      showNotice('ok', res?.message || `Port ${portNum}/${newProtocol} freigegeben.`);
    } catch (err: any) {
      showNotice('err', err.message || 'Port konnte nicht freigegeben werden.');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const res = await apiRequest(`/api/admin/firewall/ports/${ruleId}`, 'DELETE');
      await loadFirewall();
      showNotice('ok', res?.message || 'Port-Regel entfernt.');
    } catch (err: any) {
      showNotice('err', err.message || 'Port-Regel konnte nicht entfernt werden.');
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center gap-2 ${
            toast.type === 'ok'
              ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700/60 text-rose-200'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{toast.text}</span>
        </div>
      )}

      {/* Host Security & DDoS Protection Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-1.5">
            <span>Debian UFW Firewall</span>
            {hostStatus?.ufwActive ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="text-sm font-bold text-neutral-100">
            {hostStatus?.ufwActive
              ? 'Aktiv (UFW)'
              : hostStatus?.ufwAvailable
              ? 'Installiert (Inaktiv)'
              : hostStatus?.iptablesAvailable
              ? 'iptables Fallback'
              : 'Regel-Sync Modus'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Auto-Port-Steuerung bei Create/Delete aktiv
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-1.5">
            <span>Kernel DDoS-Schutz</span>
            <Flame className={`w-4 h-4 ${hostStatus?.ddosSysctlInstalled ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <div className="text-sm font-bold text-neutral-100">
            {hostStatus?.ddosSysctlInstalled ? 'Hardening Aktiv' : 'Per install.sh einrichtbar'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 font-mono">
            99-sonora-ddos.conf + SONORA_DDOS
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-1.5">
            <span>Fail2ban Schutz</span>
            <Lock className={`w-4 h-4 ${hostStatus?.fail2banActive ? 'text-emerald-400' : 'text-neutral-500'}`} />
          </div>
          <div className="text-sm font-bold text-neutral-100">
            {hostStatus?.fail2banActive ? 'Aktiv (SSH Jail)' : 'Nicht aktiv'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Brute-Force Prävention (Debian)
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-1.5">
            <span>Verwaltete Server-Ports</span>
            <Network className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
            {rules.length} <span className="text-xs text-neutral-500 font-normal">Regeln</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5 font-mono">
            Geschützt: {(hostStatus?.protectedSystemPorts || [22, 80, 443, 2022, 3000]).join(', ')}
          </div>
        </div>
      </div>

      {/* Manual Port Rule Form + Sync Toolbar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              <span>Automatische Port-Freigabe &amp; Firewall-Regeln</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Beim Erstellen eines Gameservers werden Game- &amp; Query-Ports automatisch geöffnet und beim Löschen wieder sicher entfernt.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncPorts}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Alle Server-Ports synchronisieren</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          <div className="sm:col-span-3">
            <label className="block text-neutral-400 mb-1">Port (1024–65535)</label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-neutral-400 mb-1">Protokoll</label>
            <select
              value={newProtocol}
              onChange={(e) => setNewProtocol(e.target.value as 'tcp' | 'udp')}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 font-mono focus:border-rose-500 focus:outline-none"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
          <div className="sm:col-span-5">
            <label className="block text-neutral-400 mb-1">Beschreibung / Dienst</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="z.B. Dynmap Webkarte oder Voicechat"
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Port öffnen</span>
            </button>
          </div>
        </form>
      </div>

      {/* Rules Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <h4 className="font-semibold text-neutral-100 text-xs">Aktive Firewall-Regeln ({rules.length})</h4>
          <button
            type="button"
            onClick={loadFirewall}
            disabled={loading}
            className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Neu laden</span>
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            Noch keine dynamischen Gameserver-Ports registriert. Beim Erstellen eines Servers werden Ports automatisch geöffnet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/70 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Server / Dienst</th>
                  <th className="px-4 py-2.5 font-medium">Port</th>
                  <th className="px-4 py-2.5 font-medium">Protokoll</th>
                  <th className="px-4 py-2.5 font-medium">Zweck</th>
                  <th className="px-4 py-2.5 font-medium">Host-Backend</th>
                  <th className="px-4 py-2.5 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-100">{rule.serverName}</div>
                      <div className="text-[10px] font-mono text-neutral-500">{rule.serverId}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-emerald-400 tabular-nums">
                      {rule.port}
                    </td>
                    <td className="px-4 py-3 font-mono uppercase text-neutral-300">
                      {rule.protocol}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 capitalize">
                      {rule.purpose}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <span
                        className={
                          rule.appliedOnHost
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                        title={rule.note || ''}
                      >
                        {rule.backend} {rule.appliedOnHost ? '✓' : '(vorgemerkt)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                        title="Firewall-Regel entfernen & Port schließen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
