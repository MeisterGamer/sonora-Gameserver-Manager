import { ModBundlePreset } from '../types/game';

export const CURATED_MOD_BUNDLES: ModBundlePreset[] = [
  {
    id: 'bundle_smp_essentials',
    name: 'Paper/Purpur SMP Community Suite',
    description: 'Das ultimative Komplettpaket für Survival-Mehrspieler-Server: Rechteverwaltung, Teleportation, Chat, Weltschutz, Ingame-Karte und Transaktions-API.',
    gameId: 'minecraft',
    gameName: 'Minecraft (Paper/Purpur/Spigot)',
    loader: 'Paper / Spigot',
    targetVersion: '1.20 - 26.3',
    modIds: ['luckperms', 'essentialsx', 'vault', 'coreprotect', 'dynmap', 'worldedit'],
    tags: ['Community', 'Verwaltung', 'Must-Have', 'Wirtschaft'],
    bannerColor: 'from-emerald-900/60 to-emerald-950/80'
  },
  {
    id: 'bundle_fabric_performance',
    name: 'Fabric Ultra-High FPS & Low-Lag Pack',
    description: 'Maximale Server- & Client-Performance: Bis zu 400% FPS-Steigerung, optimierte Entity-Ticks, reduzierte RAM-Zuweisung und asynchrones Chunk-Laden.',
    gameId: 'minecraft',
    gameName: 'Minecraft (Fabric)',
    loader: 'Fabric',
    targetVersion: '1.21.4 - 26.3',
    modIds: ['sodium', 'lithium', 'ferritecore', 'fabric_api'],
    tags: ['FPS Boost', 'Zero Lag', 'Optimization', 'Low RAM'],
    bannerColor: 'from-sky-900/60 to-blue-950/80'
  },
  {
    id: 'bundle_security_anti_cheat',
    name: 'Server Security & Anti-Griefing Defense',
    description: 'Schützt deinen Server vor Hackern, X-Rayern, Griefing und Spam. Ermöglicht lückenlose Rollbacks von Truhen und Blöcken auf Sekundenebene.',
    gameId: 'minecraft',
    gameName: 'Minecraft (Paper/Purpur)',
    loader: 'Paper / Purpur',
    targetVersion: '1.18 - 26.3',
    modIds: ['coreprotect', 'luckperms', 'vault'],
    tags: ['Security', 'Anti-Grief', 'Rollback', 'Logs'],
    bannerColor: 'from-rose-900/60 to-red-950/80'
  },
  {
    id: 'bundle_palworld_optimized',
    name: 'Palworld Co-op Performance & Mod Suite',
    description: 'Optimiert Palworld Dedicated Server: Behebt Speicherlecks, verbessert Pal-Wegfindung und schaltet Lua-Scripting für Admins frei.',
    gameId: 'palworld',
    gameName: 'Palworld',
    loader: 'UE4SS / Native',
    targetVersion: 'v0.3.8+',
    modIds: ['palworld_mod_framework', 'palworld_memory_leak_fix'],
    tags: ['Palworld', 'QoL', 'Fixes', 'Co-op'],
    bannerColor: 'from-amber-900/60 to-amber-950/80'
  },
  {
    id: 'bundle_rust_vanilla_plus',
    name: 'Rust Vanilla+ Essentials (Oxide/uMod)',
    description: 'Bietet Kits, verbesserten Ressourcen-Loot, schnelles Schmelzen und Admin-Tools für Rust Dedicated Server.',
    gameId: 'rust',
    gameName: 'Rust',
    loader: 'Oxide / uMod',
    targetVersion: 'Wipe 2026',
    modIds: ['oxide_core', 'rust_kits', 'rust_gather_manager'],
    tags: ['Rust', '2x Gather', 'Kits', 'Oxide'],
    bannerColor: 'from-orange-900/60 to-neutral-950'
  }
];
