import { ModItem } from '../types/game';
import { MODS_AND_PLUGINS_DATABASE } from '../data/modsAndPlugins';
import { getStoredAdminSettings } from '../data/adminSettingsStore';

export type ModProviderSource = 'all' | 'modrinth' | 'spigot' | 'curseforge' | 'steam_workshop' | 'local';

export interface SearchOptions {
  query: string;
  provider: ModProviderSource;
  gameId?: string;
  category?: string;
}

export interface SearchResult {
  source: string;
  total: number;
  items: ModItem[];
  isLiveApi: boolean;
  message?: string;
}

// 1. Live Query to Modrinth REST API (Real, Free, No API Key required!)
export async function searchModrinthLive(query: string, limit: number = 20): Promise<ModItem[]> {
  try {
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ApexHost-GameServerManager/1.0 (contact@apexhost.cloud)'
      }
    });

    if (!response.ok) {
      // Try local backend proxy
      const proxyRes = await fetch(`/api/live/modrinth/search?query=${encodeURIComponent(query)}&limit=${limit}`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        return data.hits || [];
      }
      throw new Error(`Modrinth HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.hits || []).map((hit: any) => ({
      id: `mr_${hit.project_id}`,
      name: hit.title,
      gameId: 'minecraft',
      category: hit.categories?.includes('optimization') ? 'Performance' : 
                hit.categories?.includes('utility') ? 'Utility' : 
                hit.categories?.includes('technology') ? 'Gameplay' : 'Gameplay',
      author: hit.author,
      downloads: hit.downloads > 1000000 
        ? `${(hit.downloads / 1000000).toFixed(1)}M` 
        : hit.downloads > 1000 
        ? `${(hit.downloads / 1000).toFixed(0)}K` 
        : `${hit.downloads}`,
      version: hit.latest_version || 'Latest',
      description: hit.description || 'Modrinth Community Projekt',
      source: 'Modrinth' as const,
      fileSize: 'Modrinth JAR',
      tags: [...(hit.display_categories || []), ...(hit.versions ? hit.versions.slice(0, 3) : [])]
    }));
  } catch (err) {
    console.warn('Direct Modrinth query failed, using proxy or fallback', err);
    try {
      const proxyRes = await fetch(`/api/live/modrinth/search?query=${encodeURIComponent(query)}&limit=${limit}`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        return data.hits || [];
      }
    } catch {}
    return [];
  }
}

// 2. Live Query to SpigotMC / Spiget API (Real, Free, No API Key required!)
export async function searchSpigetLive(query: string, limit: number = 20): Promise<ModItem[]> {
  try {
    let url = '';
    if (query.trim()) {
      url = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=${limit}&sort=-downloads`;
    } else {
      url = `https://api.spiget.org/v2/resources/free?size=${limit}&sort=-downloads`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const proxyRes = await fetch(`/api/live/spiget/search?query=${encodeURIComponent(query)}&size=${limit}`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        return data.hits || [];
      }
      throw new Error(`Spiget HTTP ${response.status}`);
    }

    const list = await response.json();
    return (Array.isArray(list) ? list : []).map((item: any) => ({
      id: `spiget_${item.id}`,
      name: item.name,
      gameId: 'minecraft',
      category: 'Utility' as const,
      author: `Spigot #${item.id}`,
      downloads: item.downloads > 1000000 
        ? `${(item.downloads / 1000000).toFixed(1)}M` 
        : item.downloads > 1000 
        ? `${(item.downloads / 1000).toFixed(0)}K` 
        : `${item.downloads || 0}`,
      version: item.version?.id ? `v${item.version.id}` : 'Latest',
      description: item.tag || 'SpigotMC Community Plugin',
      source: 'SpigotMC' as const,
      fileSize: 'Spigot JAR',
      tags: ['Paper', 'Spigot', 'Bukkit', 'Plugin']
    }));
  } catch (err) {
    console.warn('Spiget direct query failed, trying proxy', err);
    try {
      const proxyRes = await fetch(`/api/live/spiget/search?query=${encodeURIComponent(query)}&size=${limit}`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        return data.hits || [];
      }
    } catch {}
    return [];
  }
}

// 3. Live Query to CurseForge (via Server Proxy with CURSEFORGE_API_KEY or Admin Settings Key)
export async function searchCurseForgeProxy(query: string, gameId: string = '432'): Promise<{ hits: ModItem[]; hasApiKey: boolean; message?: string }> {
  try {
    const settings = getStoredAdminSettings();
    const headers: Record<string, string> = {};
    if (settings.curseForgeApiKey) {
      headers['x-curseforge-key'] = settings.curseForgeApiKey.trim();
    }

    const res = await fetch(`/api/live/curseforge/search?query=${encodeURIComponent(query)}&gameId=${gameId}`, {
      headers
    });
    if (res.ok) {
      const data = await res.json();
      return {
        hits: data.hits || [],
        hasApiKey: data.hasApiKey !== false,
        message: data.message
      };
    }
  } catch (err) {
    console.warn('CurseForge proxy query error', err);
  }
  return { hits: [], hasApiKey: false, message: 'Keine Verbindung zum CurseForge Proxy.' };
}

// 4. Live Query to Steam Workshop (via Server Proxy with STEAM_API_KEY or Admin Settings Key)
export async function searchSteamWorkshopProxy(query: string, appId: string = '258550'): Promise<{ hits: ModItem[]; hasApiKey: boolean; message?: string }> {
  try {
    const settings = getStoredAdminSettings();
    const headers: Record<string, string> = {};
    if (settings.steamApiKey) {
      headers['x-steam-key'] = settings.steamApiKey.trim();
    }

    const res = await fetch(`/api/live/steam/workshop?query=${encodeURIComponent(query)}&appId=${appId}`, {
      headers
    });
    if (res.ok) {
      const data = await res.json();
      return {
        hits: data.hits || [],
        hasApiKey: data.hasApiKey !== false,
        message: data.message
      };
    }
  } catch (err) {
    console.warn('Steam Workshop proxy query error', err);
  }
  return { hits: [], hasApiKey: false };
}

// 5. Unified Search orchestrating providers and graceful fallbacks
export async function searchUnifiedMods(options: SearchOptions): Promise<SearchResult> {
  const { query, provider, category } = options;

  // Modrinth Provider
  if (provider === 'modrinth') {
    const liveItems = await searchModrinthLive(query, 30);
    if (liveItems.length > 0) {
      const filtered = category && category !== 'all' ? liveItems.filter(i => i.category === category) : liveItems;
      return { source: 'Modrinth (Echte Live-API)', total: filtered.length, items: filtered, isLiveApi: true };
    }
  }

  // SpigotMC / Spiget Provider
  if (provider === 'spigot') {
    const liveItems = await searchSpigetLive(query, 30);
    if (liveItems.length > 0) {
      return { source: 'SpigotMC (Echte Live-API)', total: liveItems.length, items: liveItems, isLiveApi: true };
    }
  }

  // CurseForge Provider
  if (provider === 'curseforge') {
    const cfResult = await searchCurseForgeProxy(query);
    if (cfResult.hits.length > 0) {
      return { source: 'CurseForge (Live API)', total: cfResult.hits.length, items: cfResult.hits, isLiveApi: true };
    }
    // If no API key configured, return curated CurseForge items with notification
    const localCf = MODS_AND_PLUGINS_DATABASE.filter(m => m.source === 'CurseForge');
    return { 
      source: 'CurseForge (Kuratierter Katalog)', 
      total: localCf.length, 
      items: localCf, 
      isLiveApi: false, 
      message: cfResult.message || 'Tipp: Trage einen CURSEFORGE_API_KEY in der .env ein, um die Live-API unbegrenzt abzufragen!' 
    };
  }

  // Steam Workshop Provider
  if (provider === 'steam_workshop') {
    const steamResult = await searchSteamWorkshopProxy(query);
    if (steamResult.hits.length > 0) {
      return { source: 'Steam Workshop (Live API)', total: steamResult.hits.length, items: steamResult.hits, isLiveApi: true };
    }
    const localWorkshop = MODS_AND_PLUGINS_DATABASE.filter(m => m.source === 'Steam Workshop');
    return {
      source: 'Steam Workshop (Kuratierter Katalog)',
      total: localWorkshop.length,
      items: localWorkshop,
      isLiveApi: false,
      message: 'Steam Workshop durchsucht. Optionaler STEAM_API_KEY in der .env schaltet alle privaten Steam-Web-APIs frei.'
    };
  }

  // Default 'all': Query Modrinth Live if search query provided, merge with local verified catalog
  if (query.trim().length >= 2) {
    const [mrItems, spigetItems] = await Promise.all([
      searchModrinthLive(query, 15),
      searchSpigetLive(query, 10)
    ]);

    const localMatches = MODS_AND_PLUGINS_DATABASE.filter(m => 
      m.name.toLowerCase().includes(query.toLowerCase()) || 
      m.description.toLowerCase().includes(query.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );

    const merged = [...mrItems, ...spigetItems, ...localMatches];
    // Deduplicate by name
    const unique = Array.from(new Map(merged.map(item => [item.name.toLowerCase(), item])).values());
    const filtered = category && category !== 'all' ? unique.filter(i => i.category === category) : unique;

    return {
      source: 'Kombinierte Live-Suche (Modrinth + SpigotMC + Katalog)',
      total: filtered.length,
      items: filtered,
      isLiveApi: true
    };
  }

  // If empty query, show curated database
  const localFiltered = MODS_AND_PLUGINS_DATABASE.filter(m => {
    if (category && category !== 'all' && m.category !== category) return false;
    return true;
  });

  return {
    source: 'Kuratierter Hub (Modrinth, Spigot, CurseForge & Workshop)',
    total: localFiltered.length,
    items: localFiltered,
    isLiveApi: false
  };
}
