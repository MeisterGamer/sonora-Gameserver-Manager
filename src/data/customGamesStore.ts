import { GameDefinition } from '../types/game';
import { ALL_STEAM_GAMES } from './steamGames';
import { MINECRAFT_TYPES, getMinecraftGameDefinition } from './minecraftTypes';

const CUSTOM_GAMES_STORAGE_KEY = 'apexhost_custom_games';

export function getBuiltInMinecraftGames(): GameDefinition[] {
  return MINECRAFT_TYPES.map(t => getMinecraftGameDefinition(t));
}

export function getAllAvailableGames(): GameDefinition[] {
  const customGames = getCustomGames();
  const mcGames = getBuiltInMinecraftGames();
  return [...mcGames, ...ALL_STEAM_GAMES, ...customGames];
}

export function getCustomGames(): GameDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GAMES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load custom games from localStorage', err);
    return [];
  }
}

export function saveCustomGame(game: GameDefinition): void {
  const current = getCustomGames();
  const existingIdx = current.findIndex(g => g.id === game.id);
  let updated: GameDefinition[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...game, isCustom: true };
  } else {
    updated = [...current, { ...game, isCustom: true }];
  }
  localStorage.setItem(CUSTOM_GAMES_STORAGE_KEY, JSON.stringify(updated));
}

export function deleteCustomGame(gameId: string): void {
  const current = getCustomGames();
  const filtered = current.filter(g => g.id !== gameId);
  localStorage.setItem(CUSTOM_GAMES_STORAGE_KEY, JSON.stringify(filtered));
}

export function exportGamesManifestJson(): string {
  const all = getAllAvailableGames();
  return JSON.stringify(all, null, 2);
}

export function importGamesManifestJson(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, count: 0, error: 'JSON muss ein Array von Spiel-Definitionen sein.' };
    }
    const current = getCustomGames();
    let importedCount = 0;
    const merged = [...current];

    for (const item of parsed) {
      if (item.id && item.name && item.defaultPort) {
        const idx = merged.findIndex(g => g.id === item.id);
        const gameDef: GameDefinition = {
          ...item,
          isCustom: true,
          supportedPlatforms: item.supportedPlatforms || ['windows', 'linux', 'macos'],
          executable: item.executable || { windows: `${item.id}.exe`, linux: `./${item.id}.sh`, macos: `./${item.id}` },
          defaultStartArgs: item.defaultStartArgs || { windows: '', linux: '', macos: '' },
          configFiles: item.configFiles || [],
          bannerColor: item.bannerColor || '#0ea5e9'
        };
        if (idx >= 0) {
          merged[idx] = gameDef;
        } else {
          merged.push(gameDef);
        }
        importedCount++;
      }
    }
    localStorage.setItem(CUSTOM_GAMES_STORAGE_KEY, JSON.stringify(merged));
    return { success: true, count: importedCount };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Ungültiges JSON-Format' };
  }
}
