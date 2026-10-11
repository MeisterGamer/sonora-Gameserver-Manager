// Only profiles with a dedicated download and a defined native Linux launch path
// are enabled. The prototype catalogue remains available for future adapters.
export const STEAM_INSTALLERS: Record<string, { appId: number; executable: string }> = {
  palworld: { appId: 2394010, executable: 'PalServer.sh' },
  rust: { appId: 258550, executable: 'RustDedicated' },
  valheim: { appId: 896660, executable: 'valheim_server.x86_64' },
  gmod: { appId: 4020, executable: 'srcds_run' },
};
export function requiredPaperJava(version: string) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Ungültige Paper-Version');
  const [major, minor, patch = 0] = version.split('.').map(Number);
  if (major >= 26) return 25;
  if (major !== 1) throw new Error('Unbekannte Paper-Versionsreihe');
  if (minor >= 20) return 21;
  if (minor >= 17) return 17;
  if (minor === 16 && patch >= 5) return 16;
  return minor >= 12 ? 11 : 8;
}
export function installerSupport(game: { id: string; category: string }, os: string) {
  if (game.category === 'minecraft') return ['mc_paper', 'mc_purpur', 'mc_vanilla'].includes(game.id) ? '' : 'Für diese Engine fehlt ein eigener Installer';
  if (os !== 'linux') return 'Steam-Installer derzeit nur für Linux';
  return STEAM_INSTALLERS[game.id] ? '' : 'Dedicated-Download und Linux-Startadapter noch nicht verifiziert';
}
