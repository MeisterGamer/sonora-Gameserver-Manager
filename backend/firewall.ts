import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Express, Request, Response } from 'express';
import type { AuthController } from './auth.ts';
import type { PermissionsController } from './permissions.ts';

export type FirewallProtocol = 'tcp' | 'udp';

export interface ManagedFirewallRule {
  id: string;
  serverId: string;
  serverName: string;
  port: number;
  protocol: FirewallProtocol;
  purpose: 'game' | 'query' | 'rcon' | 'manual';
  appliedOnHost: boolean;
  backend: 'ufw' | 'iptables' | 'recorded-only';
  note?: string;
  createdAt: string;
}

export interface FirewallDeps {
  auth: AuthController;
  permissions?: PermissionsController;
  managerStateDir: string;
  getServerRegistry: () => any[];
  recordAuditLog?: (entry: {
    serverId: string;
    action: string;
    user?: string;
    details: string;
    severity?: 'info' | 'warning' | 'security' | 'success';
  }) => void;
  appendLog?: (serverId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string) => void;
  dryRunHostCommands?: boolean;
}

export interface FirewallController {
  openPortsForServer: (server: {
    id: string;
    name?: string;
    port?: number;
    queryPort?: number;
    rconPort?: number;
    category?: string;
    gameId?: string;
  }) => ManagedFirewallRule[];
  closePortsForServer: (serverId: string) => { removed: ManagedFirewallRule[]; keptSharedPorts: number[] };
  syncAllServerPorts: () => { opened: number; cleaned: number; totalRules: number };
  listRules: () => ManagedFirewallRule[];
  getHostFirewallStatus: () => {
    platform: NodeJS.Platform;
    ufwAvailable: boolean;
    ufwActive: boolean;
    iptablesAvailable: boolean;
    ddosSysctlInstalled: boolean;
    fail2banActive: boolean;
    autoPortManagementEnabled: boolean;
    protectedSystemPorts: number[];
    rulesCount: number;
  };
}

// System ports that automated server deletion must NEVER close
const PROTECTED_SYSTEM_PORTS = new Set<number>([22, 80, 443, 2022, 3000]);

function sanitizePort(val: unknown): number | null {
  const num = Math.round(Number(val));
  if (!Number.isFinite(num) || num < 1024 || num > 65535) return null;
  if (PROTECTED_SYSTEM_PORTS.has(num)) return null;
  return num;
}

function commandExists(bin: string): boolean {
  if (process.platform !== 'linux') return false;
  try {
    execFileSync('which', [bin], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export function computeServerPortSpecs(server: {
  port?: number;
  queryPort?: number;
  rconPort?: number;
  category?: string;
  gameId?: string;
}): Array<{ port: number; protocol: FirewallProtocol; purpose: 'game' | 'query' | 'rcon' }> {
  const specs: Array<{ port: number; protocol: FirewallProtocol; purpose: 'game' | 'query' | 'rcon' }> = [];
  const seen = new Set<string>();

  const add = (portVal: unknown, protocol: FirewallProtocol, purpose: 'game' | 'query' | 'rcon') => {
    const p = sanitizePort(portVal);
    if (!p) return;
    const key = `${p}/${protocol}`;
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ port: p, protocol, purpose });
  };

  const gamePort = sanitizePort(server.port);
  const isBedrock = String(server.gameId || '').toLowerCase() === 'mc_bedrock';
  const isMinecraftJava = String(server.category || '').toLowerCase() === 'minecraft' && !isBedrock;

  if (gamePort) {
    if (isBedrock) {
      add(gamePort, 'udp', 'game');
    } else if (isMinecraftJava) {
      add(gamePort, 'tcp', 'game');
      add(gamePort, 'udp', 'game');
    } else {
      // Dedicated Steam / UDP+TCP games
      add(gamePort, 'tcp', 'game');
      add(gamePort, 'udp', 'game');
    }
  }

  const queryPort = sanitizePort(server.queryPort);
  if (queryPort && queryPort !== gamePort) {
    add(queryPort, 'udp', 'query');
  }

  return specs;
}

export function configureFirewall(app: Express, deps: FirewallDeps): FirewallController {
  fs.mkdirSync(deps.managerStateDir, { recursive: true });
  const rulesFile = path.join(deps.managerStateDir, 'firewall-rules.json');

  const readRules = (): ManagedFirewallRule[] => {
    try {
      if (fs.existsSync(rulesFile)) {
        const parsed = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {}
    return [];
  };

  let rules: ManagedFirewallRule[] = readRules();

  const writeRules = (next: ManagedFirewallRule[]) => {
    rules = next;
    try {
      fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2), 'utf8');
    } catch {}
  };

  const executeHostPortAction = (
    action: 'open' | 'close',
    port: number,
    protocol: FirewallProtocol,
    serverId: string
  ): { applied: boolean; backend: 'ufw' | 'iptables' | 'recorded-only'; note: string } => {
    if (deps.dryRunHostCommands || process.platform !== 'linux') {
      return {
        applied: false,
        backend: 'recorded-only',
        note: deps.dryRunHostCommands
          ? 'Dry-Run aktiv (Regel persistent vorgemerkt)'
          : `Nicht-Linux Host (${process.platform}) — Regel lokal protokolliert`
      };
    }

    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const hasUfw = commandExists('ufw');
    const hasIptables = commandExists('iptables');
    const safeTag = `Sonora:${serverId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)}`;

    // Helper to run either directly as root or via non-interactive sudo (configured by install.sh)
    const runPrivileged = (bin: string, args: string[]) => {
      if (isRoot) {
        execFileSync(bin, args, { stdio: 'ignore', timeout: 5000 });
      } else {
        execFileSync('sudo', ['-n', bin, ...args], { stdio: 'ignore', timeout: 5000 });
      }
    };

    if (hasUfw) {
      try {
        if (action === 'open') {
          runPrivileged('ufw', ['allow', `${port}/${protocol}`, 'comment', safeTag]);
        } else {
          runPrivileged('ufw', ['--force', 'delete', 'allow', `${port}/${protocol}`]);
        }
        return {
          applied: true,
          backend: 'ufw',
          note: `UFW ${action === 'open' ? 'freigegeben' : 'entfernt'}: ${port}/${protocol}`
        };
      } catch (err: any) {
        // Fall through to iptables or recorded-only if non-root without sudoers
        if (!hasIptables) {
          return {
            applied: false,
            backend: 'recorded-only',
            note: `UFW benötigt Root/sudoers (${err?.message || 'Permission denied'}) — Regel vorgemerkt`
          };
        }
      }
    }

    if (hasIptables) {
      try {
        const flag = action === 'open' ? '-A' : '-D';
        runPrivileged('iptables', [flag, 'INPUT', '-p', protocol, '--dport', String(port), '-j', 'ACCEPT']);
        return {
          applied: true,
          backend: 'iptables',
          note: `iptables ${action === 'open' ? 'freigegeben' : 'entfernt'}: ${port}/${protocol}`
        };
      } catch (err: any) {
        return {
          applied: false,
          backend: 'recorded-only',
          note: `iptables benötigt Root/sudoers (${err?.message || 'Permission denied'}) — Regel vorgemerkt`
        };
      }
    }

    return {
      applied: false,
      backend: 'recorded-only',
      note: 'Kein UFW/iptables auf diesem Host gefunden — Regel persistent vorgemerkt'
    };
  };

  const openPortsForServer: FirewallController['openPortsForServer'] = (server) => {
    const specs = computeServerPortSpecs(server);
    const current = readRules();
    const added: ManagedFirewallRule[] = [];

    for (const spec of specs) {
      const existing = current.find(
        r => r.serverId === server.id && r.port === spec.port && r.protocol === spec.protocol
      );
      if (existing) {
        added.push(existing);
        continue;
      }

      const execRes = executeHostPortAction('open', spec.port, spec.protocol, server.id);
      const rule: ManagedFirewallRule = {
        id: `fw_${server.id}_${spec.port}_${spec.protocol}`,
        serverId: server.id,
        serverName: server.name || server.id,
        port: spec.port,
        protocol: spec.protocol,
        purpose: spec.purpose,
        appliedOnHost: execRes.applied,
        backend: execRes.backend,
        note: execRes.note,
        createdAt: new Date().toISOString()
      };
      current.push(rule);
      added.push(rule);
    }

    writeRules(current);

    if (added.length > 0) {
      const portSummary = added.map(r => `${r.port}/${r.protocol.toUpperCase()}`).join(', ');
      deps.appendLog?.(
        server.id,
        'SUCCESS',
        `[FIREWALL] Ports automatisch freigegeben: ${portSummary} (${added[0].backend}).`
      );
      deps.recordAuditLog?.({
        serverId: server.id,
        action: 'firewall_open',
        user: 'Firewall-Automatik',
        details: `Ports automatisch freigegeben: ${portSummary}`,
        severity: 'security'
      });
    }

    return added;
  };

  const closePortsForServer: FirewallController['closePortsForServer'] = (serverId) => {
    const current = readRules();
    const targetRules = current.filter(r => r.serverId === serverId);
    const remaining = current.filter(r => r.serverId !== serverId);
    const keptSharedPorts: number[] = [];

    for (const rule of targetRules) {
      // Never close a port still required by another registered server or a protected system port
      const sharedByOther = remaining.some(r => r.port === rule.port && r.protocol === rule.protocol);
      if (sharedByOther || PROTECTED_SYSTEM_PORTS.has(rule.port)) {
        keptSharedPorts.push(rule.port);
        continue;
      }
      executeHostPortAction('close', rule.port, rule.protocol, serverId);
    }

    writeRules(remaining);

    if (targetRules.length > 0) {
      const portSummary = targetRules.map(r => `${r.port}/${r.protocol.toUpperCase()}`).join(', ');
      deps.recordAuditLog?.({
        serverId,
        action: 'firewall_close',
        user: 'Firewall-Automatik',
        details: `Server-Ports automatisch geschlossen/entfernt: ${portSummary}`,
        severity: 'security'
      });
    }

    return { removed: targetRules, keptSharedPorts };
  };

  const syncAllServerPorts: FirewallController['syncAllServerPorts'] = () => {
    const activeServers = deps.getServerRegistry();
    const activeIds = new Set(activeServers.map(s => s.id));
    const current = readRules();

    // Clean orphaned server rules (keep manual rules)
    let cleaned = 0;
    const orphanedIds = new Set(
      current.filter(r => r.purpose !== 'manual' && !activeIds.has(r.serverId)).map(r => r.serverId)
    );
    for (const orphanId of orphanedIds) {
      const res = closePortsForServer(orphanId);
      cleaned += res.removed.length;
    }

    // Ensure all active servers have their ports opened
    let opened = 0;
    for (const srv of activeServers) {
      const before = readRules().filter(r => r.serverId === srv.id).length;
      const afterRules = openPortsForServer(srv);
      if (afterRules.length > before) {
        opened += afterRules.length - before;
      }
    }

    return { opened, cleaned, totalRules: readRules().length };
  };

  const getHostFirewallStatus: FirewallController['getHostFirewallStatus'] = () => {
    const ufwAvailable = commandExists('ufw');
    const iptablesAvailable = commandExists('iptables');
    let ufwActive = false;
    if (ufwAvailable && !deps.dryRunHostCommands) {
      try {
        const out = execFileSync('ufw', ['status'], { encoding: 'utf8', timeout: 2500 });
        ufwActive = out.includes('Status: active');
      } catch {
        try {
          const out = execFileSync('sudo', ['-n', 'ufw', 'status'], { encoding: 'utf8', timeout: 2500 });
          ufwActive = out.includes('Status: active');
        } catch {}
      }
    }

    const ddosSysctlInstalled = fs.existsSync('/etc/sysctl.d/99-sonora-ddos.conf');
    let fail2banActive = false;
    if (process.platform === 'linux' && !deps.dryRunHostCommands) {
      try {
        const out = execFileSync('systemctl', ['is-active', 'fail2ban'], { encoding: 'utf8', timeout: 2000 });
        fail2banActive = out.trim() === 'active';
      } catch {}
    }

    return {
      platform: process.platform,
      ufwAvailable,
      ufwActive,
      iptablesAvailable,
      ddosSysctlInstalled,
      fail2banActive,
      autoPortManagementEnabled: true,
      protectedSystemPorts: Array.from(PROTECTED_SYSTEM_PORTS),
      rulesCount: readRules().length
    };
  };

  const guardFirewallAdmin = (req: Request, res: Response, next: () => void) => {
    if (deps.permissions) {
      return deps.permissions.requirePermission('admin.firewall')(req, res, next);
    }
    return deps.auth.requireAdmin(req, res, next);
  };

  // --- ADMIN FIREWALL ENDPOINTS ---
  app.get('/api/admin/firewall', guardFirewallAdmin, (_req: Request, res: Response) => {
    res.json({
      success: true,
      status: getHostFirewallStatus(),
      rules: readRules()
    });
  });

  app.post('/api/admin/firewall/sync', guardFirewallAdmin, (req: Request, res: Response) => {
    const summary = syncAllServerPorts();
    res.json({
      success: true,
      summary,
      status: getHostFirewallStatus(),
      rules: readRules(),
      message: `Firewall synchronisiert (${summary.opened} neu freigegeben, ${summary.cleaned} verwaiste Regeln entfernt).`
    });
  });

  app.post('/api/admin/firewall/ports', guardFirewallAdmin, (req: Request, res: Response) => {
    const port = sanitizePort(req.body?.port);
    const protocol: FirewallProtocol = req.body?.protocol === 'udp' ? 'udp' : 'tcp';
    const noteLabel = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 60) : 'Manuelle Freigabe';

    if (!port) {
      return res.status(400).json({
        success: false,
        error: 'Ungültiger oder geschützter Port (erlaubt: 1024–65535, ausgenommen System-Ports 22/80/443/2022/3000).'
      });
    }

    const current = readRules();
    if (current.some(r => r.port === port && r.protocol === protocol && r.purpose === 'manual')) {
      return res.status(409).json({ success: false, error: `Port ${port}/${protocol.toUpperCase()} ist bereits manuell freigegeben.` });
    }

    const execRes = executeHostPortAction('open', port, protocol, 'manual');
    const rule: ManagedFirewallRule = {
      id: `fw_manual_${port}_${protocol}`,
      serverId: 'manual',
      serverName: noteLabel,
      port,
      protocol,
      purpose: 'manual',
      appliedOnHost: execRes.applied,
      backend: execRes.backend,
      note: execRes.note,
      createdAt: new Date().toISOString()
    };
    current.push(rule);
    writeRules(current);

    res.status(201).json({
      success: true,
      rule,
      rules: current,
      message: `Port ${port}/${protocol.toUpperCase()} freigegeben.`
    });
  });

  app.delete('/api/admin/firewall/ports/:ruleId', guardFirewallAdmin, (req: Request, res: Response) => {
    const ruleId = req.params.ruleId;
    const current = readRules();
    const target = current.find(r => r.id === ruleId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Firewall-Regel nicht gefunden.' });
    }

    const remaining = current.filter(r => r.id !== ruleId);
    const shared = remaining.some(r => r.port === target.port && r.protocol === target.protocol);
    if (!shared && !PROTECTED_SYSTEM_PORTS.has(target.port)) {
      executeHostPortAction('close', target.port, target.protocol, target.serverId);
    }
    writeRules(remaining);

    res.json({
      success: true,
      rules: remaining,
      message: `Port-Regel ${target.port}/${target.protocol.toUpperCase()} entfernt.`
    });
  });

  return {
    openPortsForServer,
    closePortsForServer,
    syncAllServerPorts,
    listRules: () => readRules(),
    getHostFirewallStatus
  };
}
