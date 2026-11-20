import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Globe,
  Check,
  Copy,
  Trash2,
  AlertCircle,
  Radio,
  Layers
} from 'lucide-react';
import { ServerInstance, PortAllocation } from '../types/game';
import { apiRequest } from '../services/api';
import { SftpAccessSection } from './SftpAccessSection';

interface NetworkPortsViewProps {
  server: ServerInstance;
  onNotify?: (msg: string) => void;
}

export const NetworkPortsView: React.FC<NetworkPortsViewProps> = ({
  server,
  onNotify
}) => {
  const [ports, setPorts] = useState<PortAllocation[]>([
    {
      id: 'p_primary',
      port: server.port,
      type: 'primary',
      protocol: 'TCP/UDP',
      serviceName: 'Haupt-Gameport (Verbindung für Spieler)',
      isPrimary: true
    }
  ]);
  const [hostIp, setHostIp] = useState('127.0.0.1');
  const [hostName, setHostName] = useState('localhost');
  const [customSubdomain, setCustomSubdomain] = useState(
    server.name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  );
  const [subdomainSaved, setSubdomainSaved] = useState(false);
  const [copiedPort, setCopiedPort] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New port modal state
  const [isAddPortModalOpen, setIsAddPortModalOpen] = useState(false);
  const [newPortNumber, setNewPortNumber] = useState<number>(server.port + 100);
  const [newPortService, setNewPortService] = useState('Voice-Chat (Simple Voice Chat)');
  const [newPortProtocol, setNewPortProtocol] = useState<'TCP' | 'UDP' | 'TCP/UDP'>('UDP');

  const loadPorts = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/servers/${server.id}/ports`);
      if (Array.isArray(data.ports)) setPorts(data.ports);
      if (data.hostIp) setHostIp(data.hostIp);
      if (data.hostName) setHostName(data.hostName);
      if (data.customSubdomain) setCustomSubdomain(data.customSubdomain);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Port-Daten konnten nicht geladen werden.');
    }
  }, [server.id]);

  useEffect(() => {
    setConfirmDeleteId(null);
    loadPorts();
  }, [loadPorts]);

  const handleCopy = (port: number) => {
    navigator.clipboard.writeText(`${hostIp}:${port}`);
    setCopiedPort(port);
    setTimeout(() => setCopiedPort(null), 2000);
  };

  const handleAddPort = async () => {
    setBusy(true);
    setModalError(null);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/ports`, 'POST', {
        port: newPortNumber,
        serviceName: newPortService,
        protocol: newPortProtocol
      });
      if (res.port) {
        setPorts(prev => [...prev, res.port]);
      } else {
        await loadPorts();
      }
      setIsAddPortModalOpen(false);
      onNotify?.(`Port ${newPortNumber} (${newPortProtocol}) erfolgreich reserviert.`);
    } catch (err: any) {
      setModalError(err.message || 'Port konnte nicht zugewiesen werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePort = async (id: string, portNum: number) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/servers/${server.id}/ports/${id}`, 'DELETE');
      setPorts(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteId(null);
      onNotify?.(`Port ${portNum} freigegeben.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Port konnte nicht freigegeben werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSubdomain = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/domain`, 'POST', {
        subdomain: customSubdomain
      });
      if (res.customSubdomain) setCustomSubdomain(res.customSubdomain);
      setSubdomainSaved(true);
      onNotify?.(`Subdomain ${res.customSubdomain || customSubdomain}.apexhost.me gespeichert!`);
      setTimeout(() => setSubdomainSaved(false), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Subdomain konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-100">Netzwerk &amp; Port-Zuweisungen</h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
              Host: {hostName}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Verwalte persistierte Host-Ports für Voice-Chat-Mods, RCON, Webkarten (Dynmap) und Subdomain-Einträge.
          </p>
        </div>

        <button
          onClick={() => {
            setModalError(null);
            setIsAddPortModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 shadow-sm shadow-emerald-600/30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Zusätzlichen Port anfordern</span>
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Port Allocation Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-300">
          <span className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Aktive Port-Zuweisungen ({ports.length})</span>
          </span>
          <span className="text-neutral-500 text-[11px] font-mono">Host IP: {hostIp}</span>
        </div>

        <div className="divide-y divide-neutral-800/80">
          {ports.map((p) => {
            const isBasePort = p.isPrimary || p.id === 'p_primary' || p.id === 'p_query' || p.id === 'p_rcon';
            return (
              <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-neutral-950/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg font-mono font-bold text-xs border ${
                    p.isPrimary
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800'
                  }`}>
                    :{p.port}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-200">{p.serviceName}</span>
                      {p.isPrimary && (
                        <span className="px-1.5 py-0.2 text-[10px] bg-emerald-900/50 text-emerald-300 rounded font-bold uppercase tracking-wider">
                          Primär
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-neutral-400 text-[11px] mt-0.5">
                      <span className="font-mono text-sky-400">{p.protocol}</span>
                      <span>·</span>
                      <span className="font-mono">{hostIp}:{p.port}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(p.port)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 cursor-pointer transition-colors"
                  >
                    {copiedPort === p.port ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPort === p.port ? 'Kopiert' : 'Adresse kopieren'}</span>
                  </button>

                  {!isBasePort && (
                    confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-800 rounded-lg px-2 py-1">
                        <span className="text-[11px] text-rose-200">Freigeben?</span>
                        <button
                          disabled={busy}
                          onClick={() => handleDeletePort(p.id, p.port)}
                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] cursor-pointer"
                        >
                          Nein
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-950/80 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Port freigeben"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subdomain & SRV Record Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subdomain */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>Server-Subdomain Konfiguration</span>
          </h4>
          <p className="text-xs text-neutral-400 mb-4">
            Hinterlege einen eindeutigen Alias-Namen für die Instanz-Verbindung und SRV-Konfiguration.
          </p>

          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs">
              <input
                type="text"
                value={customSubdomain}
                onChange={(e) => setCustomSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="bg-transparent font-mono text-neutral-200 focus:outline-none flex-1 text-right"
              />
              <span className="text-emerald-400 font-mono pl-1 select-none font-semibold">.apexhost.me</span>
            </div>

            <button
              onClick={handleSaveSubdomain}
              disabled={busy}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shadow-sm shadow-emerald-600/30"
            >
              {subdomainSaved ? 'Gespeichert!' : 'Speichern'}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-neutral-500 font-mono">
            Ziel-Adresse: <span className="text-neutral-300 font-bold">{customSubdomain}.apexhost.me:{server.port}</span>
          </div>
        </div>

        {/* SRV Record Generator */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Eigene Domain via DNS SRV-Record</span>
          </h4>
          <p className="text-xs text-neutral-400 mb-3">
            Für deine eigene Domain bei Cloudflare, Namecheap oder Hetzner:
          </p>

          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-[11px] font-mono text-neutral-300 space-y-1">
            <div><span className="text-neutral-500">Dienst / Service:</span> {server.category === 'minecraft' ? '_minecraft._tcp.play' : `_${server.category}._tcp.play`}</div>
            <div><span className="text-neutral-500">Protokoll:</span> TCP</div>
            <div><span className="text-neutral-500">Priorität / Gewichtung:</span> 0 / 5</div>
            <div><span className="text-neutral-500">Ziel-Port:</span> <span className="text-emerald-400">{server.port}</span></div>
            <div><span className="text-neutral-500">Ziel-Host:</span> {hostName} ({hostIp})</div>
          </div>
        </div>
      </div>

      {/* SFTP-Zugriff Section */}
      <SftpAccessSection server={server} onNotify={onNotify} />

      {/* Modal: Add Additional Port */}
      {isAddPortModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-sm font-bold text-neutral-100 mb-2 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Zusätzlichen Port anfordern</span>
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Prüft automatisch auf freie Ports auf diesem Host (<span className="font-mono">{hostIp}</span>) und speichert die Reservierung.
            </p>

            {modalError && (
              <div role="alert" className="mb-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Port-Nummer (1024–65535)</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={newPortNumber}
                  onChange={(e) => setNewPortNumber(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 font-mono focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 block mb-1">Verwendungszweck / Mod</label>
                <input
                  type="text"
                  value={newPortService}
                  onChange={(e) => setNewPortService(e.target.value)}
                  placeholder="z.B. Simple Voice Chat, Dynmap, GeyserMC"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-400 block mb-1">Protokoll</label>
                <select
                  value={newPortProtocol}
                  onChange={(e) => setNewPortProtocol(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-neutral-700 cursor-pointer"
                >
                  <option value="UDP">UDP (Voice Chat, Fast Queries)</option>
                  <option value="TCP">TCP (Websites, Dynmap, RCON)</option>
                  <option value="TCP/UDP">TCP/UDP (Kombiniert)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  onClick={() => setIsAddPortModalOpen(false)}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAddPort}
                  disabled={busy}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {busy ? 'Prüfe Host-Port...' : 'Zuweisen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
