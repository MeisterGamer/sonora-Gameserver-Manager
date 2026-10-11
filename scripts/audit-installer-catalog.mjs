import fs from 'node:fs';
import { STEAM_GAMES_DATABASE } from '../src/data/steamGames.ts';
import { MINECRAFT_TYPES, getMinecraftGameDefinition } from '../src/data/minecraftTypes.ts';
import { STEAM_INSTALLERS, installerSupport } from '../src/data/installerSupport.ts';
const games = [...MINECRAFT_TYPES.map(getMinecraftGameDefinition), ...STEAM_GAMES_DATABASE];
const rows = games.map(game => {
  const problems = [];
  if (game.category !== 'minecraft' && /wine|\.exe/i.test(game.executable.linux)) problems.push('Linux command requires an unimplemented Windows/Wine runner');
  if (game.category !== 'minecraft' && !game.steamAppId) problems.push('No Steam download ID');
  if (game.category !== 'minecraft' && !STEAM_INSTALLERS[game.id]) problems.push('Dedicated ID, authentication, launch layout and config still need a provider-specific adapter');
  const unavailable = installerSupport(game, 'linux');
  return { id: game.id, name: game.name, steamAppId: game.steamAppId, executable: game.executable.linux, enabled: !unavailable, reason: [unavailable, ...problems].filter(Boolean).join('; ') };
});
const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = ['# Linux installer catalogue audit — Update 03', '', 'Date: 2026-10-11 (Europe/Berlin).', '',
  'This is a complete structural review of the source catalogue, not a live compatibility certification. Enabled entries have an implemented provider adapter; disabled entries must not advertise a working installer. Live deployment and game startup still require Linux validation.', '',
  `Entries reviewed: ${rows.length}. Enabled: ${rows.filter(row => row.enabled).length}. Pending: ${rows.filter(row => !row.enabled).length}.`, '',
  '| ID | Product | Download ID | Linux command | Installer | Finding |', '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(row => '| ' + [row.id, row.name, row.steamAppId, row.executable, row.enabled ? 'Implemented' : 'Disabled / pending', row.reason].map(escape).join(' | ') + ' |'), '',
  'Additional requirements: Paper/Purpur experimental builds need explicit consent; all Minecraft servers need explicit EULA acceptance. Valheim requires a configured world/password; game tokens, licensed downloads and Wine-based products have no generic bypass. Prototype config templates are not imported as verified production configuration.', '',
  'Known source defects include retail-game IDs in several dedicated-server entries and fabricated launch scripts. These entries are disabled until the exact provider download, authentication and runtime are implemented and verified.', ''];
fs.writeFileSync('docs/INSTALLER-CATALOG-AUDIT-2026-10-11.md', lines.join('\n'));
console.log(`${rows.length} catalogue entries reviewed; ${rows.filter(row => row.enabled).length} enabled, ${rows.filter(row => !row.enabled).length} pending.`);
