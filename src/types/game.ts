export type PlatformOS = 'windows' | 'linux' | 'macos';

export type GameCategory = 
  | 'minecraft'
  | 'survival'
  | 'fps'
  | 'sandbox'
  | 'rpg'
  | 'simulation'
  | 'strategy'
  | 'coop'
  | 'custom';

export type ModdingFramework = 
  | 'spigot_paper'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'steam_workshop'
  | 'umod_oxide'
  | 'bepinex'
  | 'sourcemod'
  | 'ue4ss'
  | 'custom'
  | 'none';

export interface GameDefinition {
  id: string;
  name: string;
  category: GameCategory;
  steamAppId?: number;
  iconUrl?: string;
  bannerColor: string;
  defaultPort: number;
  queryPort?: number;
  rconPort?: number;
  minRamGb: number;
  recommendedRamGb: number;
  modFramework: ModdingFramework;
  supportedPlatforms: PlatformOS[];
  executable: {
    windows: string;
    linux: string;
    macos: string;
  };
  defaultStartArgs: {
    windows: string;
    linux: string;
    macos: string;
  };
  configFiles: {
    name: string;
    path: string;
    type: 'properties' | 'ini' | 'yaml' | 'json' | 'cfg';
    defaultContent: string;
  }[];
  description: string;
  isCustom?: boolean;
}

export type ServerStatus = 'offline' | 'starting' | 'running' | 'stopping' | 'updating';

export type JavaVersion = 
  | 'Java 26'
  | 'Java 25'
  | 'Java 24'
  | 'Java 23'
  | 'Java 22'
  | 'Java 21'
  | 'GraalVM 21+'
  | 'Temurin 21+'
  | 'Corretto 21+'
  | 'Zulu 21+'
  | 'Java 17'
  | 'Java 11'
  | 'Java 8';

export interface ServerInstance {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  category: GameCategory;
  steamAppId?: number;
  linuxExecutable?: string;
  linuxStartArgs?: string;
  status: ServerStatus;
  allocatedRamGb: number;
  port: number;
  queryPort: number;
  rconPort?: number;
  targetOS: PlatformOS;
  autoRestart: boolean;
  version: string;
  javaVersion?: JavaVersion;
  minecraftType?: string;
  uptimeSeconds: number;
  cpuUsagePercent: number;
  ramUsageMb: number;
  maxRamMb: number;
  diskUsageMb: number;
  networkInKb: number;
  networkOutKb: number;
  currentPlayers: number;
  maxPlayers: number;
  tps: number;
  installedMods: InstalledMod[];
  configFiles: Record<string, string>;
  createdAt: string;
}

export interface ModVersionItem {
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  releaseDate: string;
  changelog?: string;
  fileSize: string;
}

export interface ModBundlePreset {
  id: string;
  name: string;
  description: string;
  gameId: string;
  gameName: string;
  loader: string;
  targetVersion: string;
  modIds: string[];
  tags: string[];
  bannerColor: string;
}

export interface ModItem {
  id: string;
  name: string;
  gameId: string;
  category: 'Performance' | 'Admin & Werkzeuge' | 'Gameplay' | 'Welt & Dimensionen' | 'Sicherheit' | 'Wirtschaft' | 'Utility';
  author: string;
  downloads: string;
  version: string;
  description: string;
  longDescription?: string;
  source: 'SpigotMC' | 'Modrinth' | 'CurseForge' | 'Steam Workshop' | 'uMod' | 'Thunderstore' | 'GitHub';
  fileSize: string;
  tags: string[];
  iconUrl?: string;
  loaders?: string[];
  supportedVersions?: string[];
  dependencies?: string[];
  incompatibilities?: string[];
  versionsList?: ModVersionItem[];
  sourceUrl?: string;
  license?: string;
}

export interface InstalledMod {
  id: string;
  modId: string;
  name: string;
  version: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  enabled: boolean;
  installedAt: string;
  source: string;
  fileSize: string;
  dependencies?: string[];
}

export interface PlayerInfo {
  id: string;
  username: string;
  pingMs: number;
  ip: string;
  joinedAt: string;
  isOp: boolean;
  isWhitelisted: boolean;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SUCCESS';
  message: string;
}

export interface BackupItem {
  id: string;
  name: string;
  createdAt: string;
  fileSizeMb: number;
  type: 'manual' | 'scheduled';
}

export interface ScheduledTask {
  id: string;
  name: string;
  type: 'restart' | 'backup' | 'command';
  cronExpression: string;
  command?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
}

export interface ServerFileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes: number;
  lastModified: string;
  content?: string;
  isEditable?: boolean;
}

export interface ServerAuditLog {
  id: string;
  serverId: string;
  action: 'start' | 'stop' | 'restart' | 'kill' | 'config_edit' | 'mod_install' | 'mod_uninstall' | 'backup' | 'command' | 'port_change';
  user: string;
  details: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'success';
}

export interface PortAllocation {
  id: string;
  port: number;
  type: 'primary' | 'query' | 'rcon' | 'web';
  protocol: 'TCP' | 'UDP' | 'TCP/UDP';
  serviceName: string;
  isPrimary?: boolean;
}
