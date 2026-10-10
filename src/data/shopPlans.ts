import { ShopPlan } from '../types/auth';

export const SHOP_PLANS: ShopPlan[] = [
  {
    id: 'mc_starter_26',
    name: 'Minecraft Cloud (v26.3)',
    tagline: 'Ideal für kleine Survival-Runden & Vanilla/Paper SMP',
    category: 'minecraft',
    gameId: 'mc_paper',
    defaultGameName: 'Minecraft (PaperMC 26.3)',
    priceMonthly: 4.99,
    ramGb: 4,
    vCores: 2,
    nvmeDiskGb: 40,
    slots: '1-15 Spieler',
    features: [
      'Minecraft 26.3 & alle Vorversionen',
      'High-Performance PaperMC / Purpur',
      '4 GB DDR5 High-Speed RAM',
      '40 GB Gen4 NVMe SSD',
      'Täglich automatisches Backup',
      'Kostenlose Subdomain (.apexhost.me)'
    ]
  },
  {
    id: 'mc_modded_beast',
    name: 'Minecraft Modpack Beast',
    tagline: 'Für gigantische Modpacks (ATM, Create, Cobblemon) & 50+ Plugins',
    category: 'minecraft',
    gameId: 'mc_forge',
    defaultGameName: 'Minecraft (Forge / NeoForge 26.3)',
    priceMonthly: 14.99,
    ramGb: 12,
    vCores: 4,
    nvmeDiskGb: 120,
    slots: 'Unbegrenzt',
    isPopular: true,
    badge: 'Bestseller',
    features: [
      'Vollständige Mod & Plugin Browser Integration',
      '12 GB DDR5 Dedicated RAM',
      '4 High-GHz Ryzen vCores',
      '120 GB NVMe Speicher',
      'Aikar’s JVM Flags vorkonfiguriert',
      'Dynamischer Heap & Crash-Guard'
    ]
  },
  {
    id: 'steam_survival_pro',
    name: 'Steam Survival Titan',
    tagline: 'Entwickelt für Palworld, Rust, ARK: Survival Ascended & Enshrouded',
    category: 'steam',
    gameId: 'palworld',
    defaultGameName: 'Palworld / Rust Survival',
    priceMonthly: 19.99,
    ramGb: 16,
    vCores: 6,
    nvmeDiskGb: 160,
    slots: 'Bis zu 64 Spieler',
    features: [
      'SteamCMD 1-Click Update System',
      '16 GB DDR5 RAM für speicherhungrige Open-Worlds',
      '6 vCores mit bis zu 4.8 GHz',
      '160 GB NVMe für riesige Kartendaten',
      'uMod / Oxide & UE4SS Mod-Manager',
      'Corero 2.4 Tbps DDoS-Schutz'
    ]
  },
  {
    id: 'tactical_fps_ultra',
    name: 'CS2 & Tactical FPS 128-Tick',
    tagline: 'Kompromisslose Tickrate für Counter-Strike 2, TF2 & Squad',
    category: 'steam',
    gameId: 'cs2',
    defaultGameName: 'Counter-Strike 2 Dedicated',
    priceMonthly: 9.99,
    ramGb: 8,
    vCores: 4,
    nvmeDiskGb: 60,
    slots: '24 Spieler',
    features: [
      'Sub-Tick & 128-Tick Scrim Ready',
      'CounterStrikeSharp Plugin-Manager',
      'Garantierte CPU-Ressourcen (Single-Core Boost)',
      'Sub-Millisekunden Routing',
      'RCON Web-Konsole & MatchZy Vorlage',
      'Automatische Demo-Aufzeichnung (.dem)'
    ]
  },
  {
    id: 'universal_extreme_node',
    name: 'Enterprise Dedicated Slice',
    tagline: 'Für Mega-Communities, Server-Netzwerke & Proxy-Clustern',
    category: 'extreme',
    gameId: 'mc_velocity',
    defaultGameName: 'Velocity + Paper Multi-Server',
    priceMonthly: 34.99,
    ramGb: 32,
    vCores: 8,
    nvmeDiskGb: 350,
    slots: 'Unbegrenzt',
    badge: 'Maximum Power',
    features: [
      '32 GB DDR5 RAM Isolation',
      '8 dedizierte AMD EPYC Cores',
      '350 GB NVMe Enterprise Storage',
      'Eigene dedizierte IPv4 Adresse inklusive',
      'BungeeCord & Velocity Netzwerk-Hub',
      'Prioritäts-Support & SLA 99.9%'
    ]
  },
  {
    id: 'sandbox_starter',
    name: 'Co-Op & Sandbox Classic',
    tagline: 'Perfekt für 7 Days to Die, Valheim, Project Zomboid & Terraria',
    category: 'starter',
    gameId: 'valheim',
    defaultGameName: 'Valheim / Zomboid Co-op',
    priceMonthly: 6.99,
    ramGb: 6,
    vCores: 2,
    nvmeDiskGb: 50,
    slots: '1-16 Spieler',
    features: [
      'BepInEx Mod Loader Unterstützung',
      '6 GB DDR5 RAM',
      'Crossplay-Unterstützung (Steam + Konsolen)',
      '50 GB NVMe Speicher',
      'Automatische Zeitplan-Neustarts',
      'Voller FTP- & Dateimanager-Zugang'
    ]
  }
];

export const SERVER_LOCATIONS = [
  { id: 'fra', name: 'Frankfurt am Main (DE)', pingMs: 7, flag: '🇩🇪', ddos: '2.4 Tbps Corero' },
  { id: 'flk', name: 'Falkenstein (DE)', pingMs: 11, flag: '🇩🇪', ddos: 'Hetzner DDoS Guard' },
  { id: 'ash', name: 'Ashburn / Virginia (US East)', pingMs: 72, flag: '🇺🇸', ddos: 'Path.net Anycast' },
  { id: 'tok', name: 'Tokyo (JP)', pingMs: 178, flag: '🇯🇵', ddos: 'Cloudflare Magic' }
];
