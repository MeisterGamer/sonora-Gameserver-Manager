import { STEAM_INSTALLERS } from '../src/data/installerSupport.ts';
import { STEAM_GAMES_DATABASE } from '../src/data/steamGames.ts';
import fs from 'node:fs';
import { confinedPath } from './paths.ts';

export function steamProfile(server: { gameId?: string; steamAppId?: number }) {
  const profile = STEAM_INSTALLERS[server.gameId || ''];
  if (!profile) throw new Error('Für dieses Spiel fehlt ein verifizierter Linux-Dedicated-Installer');
  if (server.steamAppId !== profile.appId) throw new Error('Falsche Dedicated-Server-AppID; Instanz mit dem aktuellen Katalog neu anlegen');
  return profile;
}
export function installedSteamExecutable(dir: string, server: { gameId?: string; steamAppId?: number }) {
  const file = confinedPath(dir, steamProfile(server).executable);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.statSync(file).size) throw new Error('Dedicated-Server-Datei fehlt: ' + steamProfile(server).executable);
  fs.accessSync(file, fs.constants.R_OK);
  return file;
}
export function normalizeSteamDefinition(server: any) {
  const profile = steamProfile(server);
  const game = STEAM_GAMES_DATABASE.find(entry => entry.id === server.gameId)!;
  server.linuxExecutable = profile.executable;
  // Instance-specific ports replace the catalogue's fixed defaults.
  let args = game.defaultStartArgs.linux;
  args = args.replace(/([+-](?:server\.)?port(?:=|\s+))\d+/gi, '$1' + server.port);
  if (Number.isInteger(server.queryPort)) args = args.replace(/([+-](?:server\.)?queryport(?:=|\s+))\d+/gi, '$1' + server.queryPort);
  if (Number.isInteger(server.rconPort)) args = args.replace(/([+-]rcon\.port\s+)\d+/gi, '$1' + server.rconPort);
  if (server.gameId === 'rust' && Number.isInteger(server.queryPort)) args += ' +server.queryport ' + server.queryPort;
  server.linuxStartArgs = args;
}
