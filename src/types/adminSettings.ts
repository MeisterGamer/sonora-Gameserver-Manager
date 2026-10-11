import { JavaVersion } from './game';

export type SteamOperationMode = 'anonymous' | 'offline_disabled' | 'mock_emulated' | 'authenticated';

export interface AdminSettings {
  // Steam Configuration (Crucial when Steam is not available)
  steamMode: SteamOperationMode;
  defaultGameFocus: 'minecraft' | 'all' | 'steam';
  enableSteamWorkshopCache: boolean;
  steamcmdPath: string;
  allowAnonymousDownloads: boolean;
  steamApiKey: string;
  steamOfflineBypass: boolean;

  // External Mod & Plugin Browser API Keys
  curseForgeApiKey: string;
  modrinthApiToken: string;
  spigotApiToken: string;

  // Server & Resource Defaults
  defaultRamAllocationGb: number;
  maxRamPerServerGb: number;
  defaultJavaVersion: JavaVersion;
  defaultMinecraftVersion: string;
  portRangeStart: number;
  portRangeEnd: number;

  // Prepaid & Expiry System
  welcomeBonusEur: number;
  gracePeriodHours: number;
  warningDaysBefore: number;
  taxRatePercent: number;
  autoSuspendOnExpiry: boolean;

  // Maintenance & Integrations
  maintenanceMode: boolean;
  maintenanceMessage: string;
  discordWebhookUrl: string;
  allowCustomerServerCreation: boolean;
  lastUpdated: string;
}
