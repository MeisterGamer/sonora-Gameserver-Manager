import { AdminSettings } from '../types/adminSettings';

const ADMIN_SETTINGS_KEY = 'apexhost_admin_system_settings';

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  // Steam is set to anonymous/offline friendly so everything works without a Steam account!
  steamMode: 'offline_disabled',
  defaultGameFocus: 'minecraft',
  enableSteamWorkshopCache: true,
  steamcmdPath: '/usr/games/steamcmd',
  allowAnonymousDownloads: true,
  steamApiKey: '',
  steamOfflineBypass: true,

  // External Mod & Plugin Browser API Keys
  curseForgeApiKey: '',
  modrinthApiToken: '',
  spigotApiToken: '',

  defaultRamAllocationGb: 6,
  maxRamPerServerGb: 32,
  defaultJavaVersion: 'Java 21',
  defaultMinecraftVersion: '26.3',
  portRangeStart: 25565,
  portRangeEnd: 29999,

  welcomeBonusEur: 25.00,
  gracePeriodHours: 72,
  warningDaysBefore: 7,
  taxRatePercent: 19,
  autoSuspendOnExpiry: true,

  maintenanceMode: false,
  maintenanceMessage: 'Systemwartung: Unser Cluster wird derzeit routinemäßig optimiert. Alle aktiven Gameserver laufen unterbrechungsfrei weiter.',
  discordWebhookUrl: 'https://discord.com/api/webhooks/apexhost/alerts',
  allowCustomerServerCreation: true,
  lastUpdated: new Date().toISOString().slice(0, 10)
};

export function getStoredAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(DEFAULT_ADMIN_SETTINGS));
      return DEFAULT_ADMIN_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ADMIN_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export function saveStoredAdminSettings(settings: AdminSettings): void {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify({
    ...settings,
    lastUpdated: new Date().toISOString().slice(0, 10)
  }));
}
