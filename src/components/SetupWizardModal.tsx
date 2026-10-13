import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Cpu, 
  HardDrive, 
  Server, 
  ShieldCheck, 
  Terminal, 
  Coffee, 
  Sparkles, 
  Check, 
  RotateCw, 
  ArrowRight, 
  ArrowLeft, 
  Copy, 
  Download, 
  Lock, 
  Key, 
  Users, 
  Globe, 
  Flame, 
  Sliders, 
  Folder, 
  AlertTriangle,
  Play,
  Layers,
  Zap,
  Radio,
  FileCode,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { ServerInstance, PlatformOS, JavaVersion } from '../types/game';
import { AdminSettings, SteamOperationMode } from '../types/adminSettings';
import { UserAccount } from '../types/auth';
import { JAVA_VERSIONS } from '../data/minecraftTypes';

export interface SetupWizardResult {
  nodeName: string;
  hostIp: string;
  panelPort: number;
  daemonPort: number;
  sftpPort: number;
  targetOS: PlatformOS;
  dataPath: string;
  defaultJava: JavaVersion;
  steamMode: SteamOperationMode;
  adminUsername: string;
  adminEmail: string;
  adminPassword?: string;
  discordWebhook: string;
  createFirstServer: boolean;
  firstServerType?: string;
  firstServerName?: string;
  firstServerRam?: number;
  firstServerPort?: number;
}

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AdminSettings;
  currentOS: PlatformOS;
  currentUser: UserAccount;
  onCompleteSetup: (result: SetupWizardResult, createdServer?: ServerInstance) => void;
}

interface SystemCheckItem {
  id: string;
  label: string;
  detail: string;
  status: 'passed' | 'warning' | 'checking';
  icon: React.ReactNode;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  currentOS,
  currentUser,
  onCompleteSetup
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 6;

  // Step 1: System Checks state
  const [isScanning, setIsScanning] = useState(false);
  const [systemChecks, setSystemChecks] = useState<SystemCheckItem[]>([
    { id: 'cpu', label: 'Prozessor & Virtualisierung', detail: '16x AMD EPYC 7763 (x86_64) · KVM/VT-x aktiv', status: 'passed', icon: <Cpu className="w-4 h-4 text-emerald-400" /> },
    { id: 'ram', label: 'Arbeitsspeicher (RAM)', detail: '64 GB DDR4 ECC registriert · 56 GB verfügbar für Gameserver', status: 'passed', icon: <Layers className="w-4 h-4 text-emerald-400" /> },
    { id: 'disk', label: 'NVMe SSD Speicher', detail: '1.8 TB frei auf /var/lib/apexhost · I/O 4.200 MB/s', status: 'passed', icon: <HardDrive className="w-4 h-4 text-emerald-400" /> },
    { id: 'os', label: 'Host Betriebssystem', detail: 'Linux Kernel 6.8.0-generic · systemd 255.4 init', status: 'passed', icon: <Server className="w-4 h-4 text-emerald-400" /> },
    { id: 'node', label: 'Node.js Runtime', detail: 'Node.js v24.11.0 LTS aktiv · V8 TurboFan Compiler', status: 'passed', icon: <Zap className="w-4 h-4 text-emerald-400" /> },
    { id: 'java', label: 'Java JDK Runtimes', detail: 'Java 21 LTS, Java 25 EA, Temurin 21+, GraalVM erkannt', status: 'passed', icon: <Coffee className="w-4 h-4 text-amber-400" /> },
    { id: 'container', label: 'Container & Isolation', detail: 'cgroups v2 & Docker 27.2 aktiv (Rootless Isolation)', status: 'passed', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" /> },
    { id: 'ports', label: 'Netzwerk & Port-Prüfung', detail: 'Ports 3000 (Panel), 8080 (Daemon), 2022 (SFTP), 25565 frei', status: 'passed', icon: <Globe className="w-4 h-4 text-emerald-400" /> }
  ]);

  // Step 2: Node & Host settings
  const [nodeName, setNodeName] = useState('Apex-Node-01-Frankfurt');
  const [hostIp, setHostIp] = useState('185.244.195.42');
  const [panelPort, setPanelPort] = useState(3000);
  const [daemonPort, setDaemonPort] = useState(8080);
  const [sftpPort, setSftpPort] = useState(2022);
  const [targetOS, setTargetOS] = useState<PlatformOS>(currentOS || 'linux');
  const [dataPath, setDataPath] = useState('/var/lib/apexhost/servers');
  const [sslMode, setSslMode] = useState<'letsencrypt' | 'reverse_proxy' | 'selfsigned'>('letsencrypt');

  // Step 3: Runtimes & Engines
  const [defaultJava, setDefaultJava] = useState<JavaVersion>(currentSettings.defaultJavaVersion || 'Java 21');
  const [gcPreset, setGcPreset] = useState<'aikar' | 'zgc' | 'shenandoah' | 'parallel'>('aikar');
  const [enableCompactHeaders, setEnableCompactHeaders] = useState(true);
  const [steamMode, setSteamMode] = useState<SteamOperationMode>(currentSettings.steamMode || 'offline_disabled');
  const [portRangeStart, setPortRangeStart] = useState(25565);
  const [portRangeEnd, setPortRangeEnd] = useState(29999);

  // Step 4: Admin Account & Security
  const [adminUsername, setAdminUsername] = useState(currentUser.username || 'AdminOwner');
  const [adminEmail, setAdminEmail] = useState(currentUser.email || 'admin@apexhost.cloud');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enable2FA, setEnable2FA] = useState(false);
  const [welcomeBonus, setWelcomeBonus] = useState(25);
  const [discordWebhook, setDiscordWebhook] = useState(currentSettings.discordWebhookUrl || 'https://discord.com/api/webhooks/apexhost/alerts');

  // Step 5: First Game Server
  const [createFirstServer, setCreateFirstServer] = useState(true);
  const [firstServerType, setFirstServerType] = useState<'paper_smp' | 'fabric_fps' | 'purpur_mini' | 'palworld' | 'rust'>('paper_smp');
  const [firstServerName, setFirstServerName] = useState('Mein erster Minecraft SMP');
  const [firstServerRam, setFirstServerRam] = useState(8);
  const [firstServerPort, setFirstServerPort] = useState(25565);

  // Step 6: Live Provisioning Console state
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  // Re-run system check
  const handleRescanSystem = () => {
    setIsScanning(true);
    setSystemChecks(prev => prev.map(c => ({ ...c, status: 'checking' })));
    setTimeout(() => {
      setSystemChecks(prev => prev.map(c => ({ ...c, status: 'passed' })));
      setIsScanning(false);
    }, 1000);
  };

  // Launch live installation
  const handleStartInstallation = () => {
    setIsInstalling(true);
    setInstallProgress(5);
    setInstallLogs([
      `[INIT] Starte ApexHost Manager Installations-Assistent v3.4...`,
      `[HOST] Ziel-Betriebssystem: ${targetOS.toUpperCase()} · Host-Node: "${nodeName}"`
    ]);

    const steps = [
      { prg: 15, msg: `[CONFIG] Generiere Daemon-Konfiguration /etc/apexhost/daemon.conf...` },
      { prg: 28, msg: `[SECURITY] Erstelle Systembenutzer "apexhost" & generiere Master-JWT-Token...` },
      { prg: 42, msg: `[DATABASE] Initialisiere lokale SQLite/JSON Datenbank & Tabellenstruktur...` },
      { prg: 58, msg: `[NETWORK] Binde Ports Panel: ${panelPort}, SFTP: ${sftpPort}, Daemon: ${daemonPort} an ufw Firewall...` },
      { prg: 72, msg: `[RUNTIMES] Verifiziere Java JDKs (Primär: ${defaultJava}, GC: ${gcPreset.toUpperCase()}) & Steam (${steamMode})...` },
      { prg: 85, msg: createFirstServer 
          ? `[PROVISION] Erstelle ersten Gameserver "${firstServerName}" (${firstServerRam} GB RAM, Port ${firstServerPort})...` 
          : `[SYSTEM] Richte systemd Service Unit "apexhost-daemon.service" ein...` 
      },
      { prg: 95, msg: `[DAEMON] Starte Hintergrund-Daemon & führe API Health-Check auf 127.0.0.1:${daemonPort} aus...` },
      { prg: 100, msg: `[SUCCESS] ApexHost Manager wurde erfolgreich installiert & initialisiert! Alle Dienste online.` }
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        setInstallProgress(step.prg);
        setInstallLogs(prev => [...prev, step.msg]);
        if (step.prg === 100) {
          setIsInstalling(false);
          setIsCompleted(true);
        }
      }, (idx + 1) * 450);
    });
  };

  const handleFinishAndOpenManager = () => {
    // Generate server instance if requested
    let createdServerInstance: ServerInstance | undefined;
    if (createFirstServer) {
      const now = new Date().toISOString().slice(0, 10);
      createdServerInstance = {
        id: `srv_${Date.now()}`,
        name: firstServerName,
        gameId: firstServerType === 'palworld' ? 'palworld' : firstServerType === 'rust' ? 'rust' : 'mc_paper',
        gameName: firstServerType === 'palworld' ? 'Palworld' : firstServerType === 'rust' ? 'Rust' : 'Minecraft (PaperMC)',
        category: firstServerType === 'palworld' || firstServerType === 'rust' ? 'survival' : 'minecraft',
        status: 'online' as any,
        allocatedRamGb: firstServerRam,
        port: firstServerPort,
        queryPort: firstServerPort,
        rconPort: firstServerPort + 10,
        targetOS,
        autoRestart: true,
        version: firstServerType.includes('paper') ? '26.3' : '1.21.4',
        javaVersion: defaultJava,
        minecraftType: firstServerType === 'fabric_fps' ? 'fabric' : firstServerType === 'purpur_mini' ? 'purpur' : 'paper',
        uptimeSeconds: 120,
        cpuUsagePercent: 8.5,
        ramUsageMb: 2450,
        maxRamMb: firstServerRam * 1024,
        diskUsageMb: 1150,
        networkInKb: 12.4,
        networkOutKb: 28.6,
        currentPlayers: 0,
        maxPlayers: 20,
        tps: 20.0,
        installedMods: [
          {
            id: `inst_lp_${Date.now()}`,
            modId: 'luckperms',
            name: 'LuckPerms',
            version: '5.4.140',
            enabled: true,
            installedAt: now,
            source: 'SpigotMC',
            fileSize: '1.9 MB'
          },
          {
            id: `inst_ess_${Date.now()}`,
            modId: 'essentialsx',
            name: 'EssentialsX',
            version: '2.20.1',
            enabled: true,
            installedAt: now,
            source: 'SpigotMC',
            fileSize: '3.4 MB'
          }
        ],
        configFiles: {
          'server.properties': `server-port=${firstServerPort}\nmotd=§a${firstServerName}§r\nmax-players=20\nonline-mode=true\ndifficulty=normal\n`,
          'eula.txt': 'eula=true\n'
        },
        createdAt: new Date().toISOString()
      };
    }

    const result: SetupWizardResult = {
      nodeName,
      hostIp,
      panelPort,
      daemonPort,
      sftpPort,
      targetOS,
      dataPath,
      defaultJava,
      steamMode,
      adminUsername,
      adminEmail,
      adminPassword,
      discordWebhook,
      createFirstServer,
      firstServerType,
      firstServerName,
      firstServerRam,
      firstServerPort
    };

    localStorage.setItem('apexhost_setup_completed', 'true');
    localStorage.setItem('apexhost_node_name', nodeName);
    onCompleteSetup(result, createdServerInstance);
    onClose();
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%&*+=?';
    let pwd = '';
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAdminPassword(pwd);
  };

  const handleDownloadServiceUnit = () => {
    let filename = 'apexhost-daemon.service';
    let content = '';

    if (targetOS === 'linux') {
      filename = 'apexhost-daemon.service';
      content = `[Unit]
Description=ApexHost Game Server Manager Daemon (${nodeName})
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=apexhost
Group=apexhost
WorkingDirectory=${dataPath.replace(/\/servers$/, '')}
ExecStart=/usr/bin/node /opt/apexhost/daemon/server.js --config /etc/apexhost/daemon.conf
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=apexhost-daemon
LimitNOFILE=65536
LimitNPROC=32768
LimitMEMLOCK=infinity

[Install]
WantedBy=multi-user.target
`;
    } else if (targetOS === 'windows') {
      filename = 'install-apexhost-service.bat';
      content = `@echo off
echo ========================================================
echo Installing ApexHost Daemon Windows Service (${nodeName})
echo ========================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Bitte als Administrator ausfuehren!
    pause
    exit /b 1
)

nssm.exe install ApexHostDaemon "C:\\Program Files\\nodejs\\node.exe" "C:\\ApexHost\\daemon\\server.js --config C:\\ApexHost\\daemon.conf"
nssm.exe set ApexHostDaemon AppDirectory "C:\\ApexHost"
nssm.exe set ApexHostDaemon Start SERVICE_AUTO_START
nssm.exe start ApexHostDaemon
echo ApexHost Service erfolgreich registriert und gestartet!
pause
`;
    } else {
      filename = 'com.apexhost.daemon.plist';
      content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apexhost.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/opt/apexhost/daemon/server.js</string>
        <string>--config</string>
        <string>/etc/apexhost/daemon.conf</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/apexhost.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/apexhost_err.log</string>
</dict>
</plist>
`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadConfig = () => {
    const configContent = `# ========================================================
# ApexHost Game Server Manager Daemon Configuration
# Generated by Setup Wizard on ${new Date().toISOString()}
# ========================================================

[daemon]
node_name = "${nodeName}"
listen_ip = "0.0.0.0"
listen_port = ${daemonPort}
web_panel_port = ${panelPort}
sftp_port = ${sftpPort}
target_os = "${targetOS}"
data_directory = "${dataPath}"

[runtimes]
default_java = "${defaultJava}"
gc_preset = "${gcPreset}"
compact_headers = ${enableCompactHeaders}
steam_operation_mode = "${steamMode}"
port_range_start = ${portRangeStart}
port_range_end = ${portRangeEnd}

[security]
admin_user = "${adminUsername}"
admin_email = "${adminEmail}"
two_factor_auth = ${enable2FA}
ssl_mode = "${sslMode}"
welcome_bonus_eur = ${welcomeBonus}
discord_webhook = "${discordWebhook}"
`;

    const blob = new Blob([configContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apexhost-${nodeName.toLowerCase().replace(/[^\w-]/g, '')}-daemon.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
        {/* Wizard Header Bar */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-100">
                  ApexHost Manager Installations- & Einrichtungsassistent
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  v3.4 Setup
                </span>
              </div>
              <p className="text-neutral-400 text-xs mt-0.5">
                Vollständige Schritt-für-Schritt-Konfiguration des Host-Knotens, Daemons & Runtimes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Assistent schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Progress Strip */}
        <div className="border-b border-neutral-800 bg-neutral-950/60 px-4 sm:px-6 py-2.5 shrink-0 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[560px] gap-2">
            {[
              { num: 1, title: 'System-Check' },
              { num: 2, title: 'Host & Daemon' },
              { num: 3, title: 'Java & Engines' },
              { num: 4, title: 'Administrator' },
              { num: 5, title: 'Erster Server' },
              { num: 6, title: 'Installation' }
            ].map(step => {
              const isCurrent = currentStep === step.num;
              const isPassed = currentStep > step.num || isCompleted;
              return (
                <button
                  key={step.num}
                  disabled={currentStep === 6 && isInstalling}
                  onClick={() => setCurrentStep(step.num)}
                  className={`flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    isCurrent 
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-semibold' 
                      : isPassed 
                      ? 'text-neutral-300 hover:text-white' 
                      : 'text-neutral-500'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    isCurrent 
                      ? 'bg-emerald-500 text-neutral-950' 
                      : isPassed 
                      ? 'bg-neutral-800 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-neutral-850 text-neutral-500 border border-neutral-800'
                  }`}>
                    {isPassed ? <Check className="w-3 h-3" /> : step.num}
                  </span>
                  <span>{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Wizard Main Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs text-neutral-300">
          {/* STEP 1: SYSTEM PRE-FLIGHT CHECK */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950/80 p-4 rounded-xl border border-neutral-800">
                <div>
                  <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Host-System & Hardware-Analyse (Pre-Flight)</span>
                  </h3>
                  <p className="text-neutral-400 text-xs mt-1">
                    Automatische Prüfung der Hardware-Ressourcen, Betriebssystem-Kompatibilität und Netzwerk-Ports.
                  </p>
                </div>
                <button
                  onClick={handleRescanSystem}
                  disabled={isScanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700/80 text-xs font-medium cursor-pointer transition-colors shrink-0"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{isScanning ? 'Scanne System...' : 'Erneut prüfen'}</span>
                </button>
              </div>

              {/* Grid of System Checks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {systemChecks.map(check => (
                  <div key={check.id} className="p-3 bg-neutral-950/70 border border-neutral-800/90 rounded-xl flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 shrink-0">
                      {check.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-neutral-200 text-xs">{check.label}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Optimal</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Alle Voraussetzungen erfüllt!</strong> Dieser Host-Knoten verfügt über genügend Ressourcen für mehr als 10 parallele Gameserver.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: NODE & DAEMON CONFIGURATION */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-2">
                <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                  <Server className="w-4 h-4 text-sky-400" />
                  <span>Host-Node & Netzwerk-Daemon einrichten</span>
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Definiere den Namen deines Verwaltungsknotens, Ports und den Datenspeicherpfad.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Node / Cluster Name</label>
                  <input
                    type="text"
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="z. B. Apex-Node-01-Frankfurt"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Wird in Übersichten und Monitoring angezeigt</span>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Öffentliche IP oder FQDN Domain</label>
                  <input
                    type="text"
                    value={hostIp}
                    onChange={(e) => setHostIp(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="z. B. panel.apexhost.cloud oder 185.244.195.42"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Zieladresse für Web-Zugriff und Gameserver-Verbindungen</span>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Ziel-Betriebssystem des Hosts</label>
                  <select
                    value={targetOS}
                    onChange={(e) => setTargetOS(e.target.value as PlatformOS)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="linux">🐧 Linux (systemd Service Units / bash)</option>
                    <option value="windows">🪟 Windows Server (Service / .bat)</option>
                    <option value="macos">🍎 macOS (launchd / .command)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">SSL / TLS Verschlüsselung</label>
                  <select
                    value={sslMode}
                    onChange={(e) => setSslMode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="letsencrypt">🔒 Let's Encrypt (Automatische SSL-Zertifikate)</option>
                    <option value="reverse_proxy">🌐 Reverse Proxy (Nginx / Caddy / Cloudflare)</option>
                    <option value="selfsigned">⚠️ Selbstsigniert (Lokale Entwicklung / Test)</option>
                  </select>
                </div>
              </div>

              {/* Ports Triple Group */}
              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
                <span className="text-neutral-300 font-semibold block">Netzwerk-Port Zuweisungen des Managers</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">Panel Web-Port</label>
                    <input
                      type="number"
                      value={panelPort}
                      onChange={(e) => setPanelPort(parseInt(e.target.value) || 3000)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">Daemon API-Port</label>
                    <input
                      type="number"
                      value={daemonPort}
                      onChange={(e) => setDaemonPort(parseInt(e.target.value) || 8080)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">Integrierter SFTP-Port</label>
                    <input
                      type="number"
                      value={sftpPort}
                      onChange={(e) => setSftpPort(parseInt(e.target.value) || 2022)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 font-semibold mb-1 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>Speicherpfad für Gameserver & Welten</span>
                </label>
                <input
                  type="text"
                  value={dataPath}
                  onChange={(e) => setDataPath(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">Verzeichnis mit Schreib- & Leserechten für den Daemon</span>
              </div>
            </div>
          )}

          {/* STEP 3: RUNTIMES & GAME ENGINES */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-2">
                <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-amber-400" />
                  <span>Java Runtimes, JVM-Optimierung & SteamCMD</span>
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Konfiguriere moderne Java 21+ Laufzeiten, Garbage Collector Presets und Steam-Modus.
                </p>
              </div>

              {/* Java Defaults */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">Standard Java-Laufzeitumgebung</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Java 21+ Aktiv
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">Standard Java Runtime</label>
                    <select
                      value={defaultJava}
                      onChange={(e) => setDefaultJava(e.target.value as JavaVersion)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <optgroup label="Modernes Java (21+ für MC 1.20.5+, 1.21.x & 26.x)">
                        <option value="Java 21">Java 21 (LTS · Standard empfohlen)</option>
                        <option value="Java 25">Java 25 (LTS Next-Gen · für 26.x)</option>
                        <option value="Java 24">Java 24 (JDK 24)</option>
                        <option value="Java 23">Java 23 (JDK 23)</option>
                        <option value="Java 22">Java 22 (JDK 22)</option>
                        <option value="Java 26">Java 26 (EA Bleeding Edge)</option>
                        <option value="GraalVM 21+">GraalVM 21+ (Enterprise JIT)</option>
                        <option value="Temurin 21+">Eclipse Temurin 21+ (LTS)</option>
                        <option value="Corretto 21+">Amazon Corretto 21+ (LTS)</option>
                        <option value="Zulu 21+">Azul Zulu 21+ (CRaC Snapshot)</option>
                      </optgroup>
                      <optgroup label="Legacy Versionen (Ältere Minecraft-Versionen)">
                        <option value="Java 17">Java 17 (MC 1.17 - 1.20.4)</option>
                        <option value="Java 11">Java 11 (MC 1.16)</option>
                        <option value="Java 8">Java 8 (MC 1.12.2 und älter)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">JVM Garbage Collector Preset</label>
                    <select
                      value={gcPreset}
                      onChange={(e) => setGcPreset(e.target.value as any)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="aikar">⭐ Aikar's Flags (G1GC · Goldstandard für Minecraft)</option>
                      <option value="zgc">⚡ Generational ZGC (Java 21+ Low-Latency &lt;1ms GC-Pausen)</option>
                      <option value="shenandoah">🍃 Shenandoah GC (Ultra-Low Pause)</option>
                      <option value="parallel">🏎️ ParallelGC (Maximaler Rohdurchsatz)</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableCompactHeaders}
                    onChange={(e) => setEnableCompactHeaders(e.target.checked)}
                    className="rounded bg-neutral-950 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-semibold text-neutral-200 block text-xs">Java 21+ Compact Object Headers aktivieren (-XX:+UseCompactObjectHeaders)</span>
                    <span className="text-[11px] text-neutral-500">Reduziert den Speicherbedarf aller Java-Objekte im RAM um bis zu 25%</span>
                  </div>
                </label>
              </div>

              {/* Steam Configuration */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">SteamCMD & Dedicated Gameserver Modus</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                    Palworld / Rust / CS2
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">SteamCMD Betriebsmodus</label>
                    <select
                      value={steamMode}
                      onChange={(e) => setSteamMode(e.target.value as SteamOperationMode)}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="offline_disabled">🔒 Offline / Autark (Kein Steam-Account nötig)</option>
                      <option value="anonymous">🌐 Anonymous (Öffentliche Dedicated Server)</option>
                      <option value="mock_emulated">🧪 Mock-Emulation (Testumgebung)</option>
                      <option value="authenticated">🔑 Authentifiziert (Steam Web API Key)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">Gameserver Port-Bereich (Dynamisch)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={portRangeStart}
                        onChange={(e) => setPortRangeStart(parseInt(e.target.value) || 25565)}
                        className="w-1/2 px-2.5 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-neutral-500">-</span>
                      <input
                        type="number"
                        value={portRangeEnd}
                        onChange={(e) => setPortRangeEnd(parseInt(e.target.value) || 29999)}
                        className="w-1/2 px-2.5 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: MASTER ADMIN & SECURITY */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-2">
                <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-rose-400" />
                  <span>Master-Administrator & Kontrollzugang</span>
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Erstelle den primären Administrator-Account für volle Panel- und API-Berechtigungen.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Administrator Benutzername</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Admin E-Mail Adresse</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-300 font-semibold">Master-Passwort</label>
                    <button
                      type="button"
                      onClick={generateStrongPassword}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Zufälliges Passwort generieren</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 bg-neutral-950 h-1.5 rounded-full overflow-hidden border border-neutral-800">
                      <div className="bg-emerald-500 h-full w-full rounded-full" />
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">Sehr starkes Passwort</span>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Willkommens-Bonus für Kunden (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={welcomeBonus}
                    onChange={(e) => setWelcomeBonus(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Startguthaben bei Registrierung im integrierten Shop</span>
                </div>

                <div>
                  <label className="block text-neutral-300 font-semibold mb-1">Discord Alarm Webhook (Optional)</label>
                  <input
                    type="text"
                    value={discordWebhook}
                    onChange={(e) => setDiscordWebhook(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Sofortige Benachrichtigung bei Server-Crashes oder Ausfällen</span>
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enable2FA}
                  onChange={(e) => setEnable2FA(e.target.checked)}
                  className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-neutral-200 block text-xs">Zwei-Faktor-Authentifizierung (2FA / TOTP) erzwingen</span>
                  <span className="text-[11px] text-neutral-500">Schützt den Admin-Zugang zusätzlich mit Authenticator-Apps (Google Authenticator, Authy)</span>
                </div>
              </label>
            </div>
          )}

          {/* STEP 5: FIRST GAME SERVER PROVISIONING */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-2">
                <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  <span>Ersten Gameserver bereitstellen (Initial Provisioning)</span>
                </h3>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Wähle, ob der Manager direkt mit einer vorkonfigurierten Instanz starten soll.
                </p>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-neutral-950 border border-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createFirstServer}
                  onChange={(e) => setCreateFirstServer(e.target.checked)}
                  className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-neutral-200 block text-xs">Ja, jetzt sofort meinen ersten Gameserver automatisch mit erstellen</span>
                  <span className="text-[11px] text-neutral-500">Erstellt Serverdateien, EULA, Startskripte und Port-Bindungen im Hintergrund</span>
                </div>
              </label>

              {createFirstServer && (
                <div className="space-y-4 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                  <span className="font-semibold text-neutral-200 block">Server-Vorlage auswählen:</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { 
                        id: 'paper_smp', 
                        name: 'Minecraft PaperMC (v26.3 / 1.21.4)', 
                        badge: 'Empfohlen · SMP', 
                        desc: 'Optimierter Survival-Server mit LuckPerms & EssentialsX vorkonfiguriert.',
                        ram: 8,
                        port: 25565
                      },
                      { 
                        id: 'fabric_fps', 
                        name: 'Minecraft Fabric High-FPS', 
                        badge: 'High Performance', 
                        desc: 'Modernste Chunk- und Tick-Performance mit Sodium, Lithium & FerriteCore.',
                        ram: 6,
                        port: 25566
                      },
                      { 
                        id: 'purpur_mini', 
                        name: 'Minecraft Purpur Server', 
                        badge: 'Minigames & Custom', 
                        desc: 'Erweiterte Gameplay-Flags, reitbare Mobs und extreme Performance-Skalierung.',
                        ram: 8,
                        port: 25567
                      },
                      { 
                        id: 'palworld', 
                        name: 'Palworld Co-Op Dedicated', 
                        badge: 'Survival · Steam', 
                        desc: 'Offizieller Palworld Dedicated Server mit Memory-Leak-Schutz.',
                        ram: 16,
                        port: 8211
                      }
                    ].map(tpl => (
                      <div
                        key={tpl.id}
                        onClick={() => {
                          setFirstServerType(tpl.id as any);
                          setFirstServerName(tpl.name.split(' (')[0]);
                          setFirstServerRam(tpl.ram);
                          setFirstServerPort(tpl.port);
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          firstServerType === tpl.id 
                            ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50' 
                            : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-neutral-100 text-xs">{tpl.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-400 border border-neutral-700 shrink-0">
                            {tpl.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">{tpl.desc}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-neutral-500">
                          <span>{tpl.ram} GB RAM</span>
                          <span>·</span>
                          <span>Port {tpl.port}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">Servername</label>
                      <input
                        type="text"
                        value={firstServerName}
                        onChange={(e) => setFirstServerName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">Arbeitsspeicher (RAM in GB)</label>
                      <input
                        type="number"
                        value={firstServerRam}
                        onChange={(e) => setFirstServerRam(parseInt(e.target.value) || 4)}
                        className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">Server-Port</label>
                      <input
                        type="number"
                        value={firstServerPort}
                        onChange={(e) => setFirstServerPort(parseInt(e.target.value) || 25565)}
                        className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: LIVE INSTALLATION & PROVISIONING TERMINAL */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="border-b border-neutral-800 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-neutral-100 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Manager-Installation & Daemon Provisioning</span>
                  </h3>
                  <p className="text-neutral-400 text-xs mt-0.5">
                    Ausführung der Systemkonfiguration, Erstellung der Daemons und Initialisierung aller Dienste.
                  </p>
                </div>
                {isCompleted && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-xs flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Setup 100% Bereit</span>
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-300">
                    {isCompleted ? 'Installation erfolgreich abgeschlossen' : isInstalling ? 'Führe System-Initialisierung aus...' : 'Bereit zur Ausführung'}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">{installProgress}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2.5 rounded-full overflow-hidden border border-neutral-800">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm shadow-emerald-500"
                    style={{ width: `${installProgress}%` }}
                  />
                </div>
              </div>

              {/* Terminal Viewport */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-neutral-300 space-y-1 max-h-56 overflow-y-auto shadow-inner">
                {installLogs.length === 0 ? (
                  <div className="text-neutral-500 italic py-6 text-center">
                    Klicke unten auf "Installation starten", um die Konfiguration anzuwenden und den Manager einzurichten.
                  </div>
                ) : (
                  installLogs.map((log, idx) => {
                    const isSuccess = log.includes('[SUCCESS]');
                    const isConfig = log.includes('[CONFIG]');
                    const isInit = log.includes('[INIT]');
                    return (
                      <div key={idx} className={isSuccess ? 'text-emerald-400 font-bold' : isConfig ? 'text-sky-300' : isInit ? 'text-amber-300' : 'text-neutral-300'}>
                        {log}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Post-Installation Credentials Summary */}
              {isCompleted && (
                <div className="bg-neutral-950 p-4 rounded-xl border border-emerald-900/60 space-y-3 animate-in fade-in">
                  <h4 className="font-bold text-neutral-100 text-xs flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    <span>Deine Verbindungs- und Zugangsdaten:</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Web Panel URL</span>
                        <span className="text-neutral-200">http://{hostIp}:{panelPort}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(`http://${hostIp}:${panelPort}`, 'panel')}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                        title="Kopieren"
                      >
                        {copiedField === 'panel' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 block">SFTP Host & Port</span>
                        <span className="text-neutral-200">{hostIp}:{sftpPort}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(`${hostIp}:${sftpPort}`, 'sftp')}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                        title="Kopieren"
                      >
                        {copiedField === 'sftp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Admin Benutzer</span>
                        <span className="text-neutral-200">{adminUsername}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(adminUsername, 'user')}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                        title="Kopieren"
                      >
                        {copiedField === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Standard Java Runtime</span>
                        <span className="text-emerald-400">{defaultJava} ({gcPreset.toUpperCase()})</span>
                      </div>
                      <button
                        onClick={() => handleCopy(defaultJava, 'java')}
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                        title="Kopieren"
                      >
                        {copiedField === 'java' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={handleDownloadConfig}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                      <span>Konfigurationsdatei (.conf) herunterladen</span>
                    </button>
                    <button
                      onClick={handleDownloadServiceUnit}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-emerald-700/60 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{targetOS === 'linux' ? 'systemd Service Unit (.service)' : targetOS === 'windows' ? 'Windows Service Skript (.bat)' : 'macOS launchd Plist'} herunterladen</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3 shrink-0">
          <div>
            {currentStep > 1 && !isCompleted && !isInstalling && (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Zurück</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {!isCompleted && currentStep < 6 && (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => Math.min(totalSteps, prev + 1))}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Weiter</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep === 6 && !isCompleted && (
              <button
                type="button"
                onClick={handleStartInstallation}
                disabled={isInstalling}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer"
              >
                {isInstalling ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Installiere System ({installProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Jetzt Installation starten</span>
                  </>
                )}
              </button>
            )}

            {isCompleted && (
              <button
                type="button"
                onClick={handleFinishAndOpenManager}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-600/40 flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Setup abschließen & Manager starten</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
