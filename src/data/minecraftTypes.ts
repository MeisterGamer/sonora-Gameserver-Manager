import { GameDefinition } from '../types/game';

export interface MinecraftTypeInfo {
  typeId: string;
  name: string;
  tagline: string;
  category: 'Modern Plugins' | 'Modding Loaders' | 'Bedrock & Proxies' | 'Classic Vanilla';
  defaultPort: number;
  protocol: 'TCP' | 'UDP';
  supportsPlugins: boolean;
  supportsMods: boolean;
  supportedJava: ('Java 21' | 'Java 17' | 'Java 11' | 'Java 8')[];
  versions: string[];
  bannerColor: string;
  defaultJarName: string;
  jvmFlags: string;
  description: string;
  icon: string;
}

export const MINECRAFT_VERSIONS = [
  '26.3',
  '26.2',
  '26.1',
  '26.0',
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.20.6',
  '1.20.4',
  '1.20.2',
  '1.19.4',
  '1.18.2',
  '1.16.5',
  '1.12.2',
  '1.8.9',
  '1.7.10'
];

export const AIKARS_FLAGS = 
  '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true';

export const MINECRAFT_TYPES: MinecraftTypeInfo[] = [
  {
    typeId: 'paper',
    name: 'PaperMC',
    tagline: 'Die führende Hochleistungs-Serversoftware mit Plugin-Support',
    category: 'Modern Plugins',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: true,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#22c55e',
    defaultJarName: 'paper.jar',
    jvmFlags: `-Xms4G -Xmx4G ${AIKARS_FLAGS} -jar paper.jar --nogui`,
    description: 'Hochoptimierte Spigot-Weiterentwicklung. Behebt unzählige Lags und Sicherheitslücken, bietet volle Bukkit & Spigot Plugin-Kompatibilität.',
    icon: 'Scroll'
  },
  {
    typeId: 'purpur',
    name: 'Purpur',
    tagline: 'Ultramoderner Paper-Fork mit maximalen Anpassungsmöglichkeiten',
    category: 'Modern Plugins',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: true,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#a855f7',
    defaultJarName: 'purpur.jar',
    jvmFlags: `-Xms4G -Xmx4G ${AIKARS_FLAGS} -jar purpur.jar --nogui`,
    description: 'Basiert auf Paper und Pufferfish. Ermöglicht Reiten auf allen Mobs, benutzerdefinierte Rezepte, optimiertes Redstone und extreme Gameplay-Tweaks.',
    icon: 'Sparkles'
  },
  {
    typeId: 'spigot',
    name: 'Spigot',
    tagline: 'Der klassische Standard für Minecraft-Plugin-Server',
    category: 'Modern Plugins',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: true,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17', 'Java 11', 'Java 8'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#f97316',
    defaultJarName: 'spigot.jar',
    jvmFlags: `-Xms3G -Xmx3G -jar spigot.jar nogui`,
    description: 'Traditionelle Server-Software mit hoher Stabilität und Unterstützung für die riesige SpigotMC-Ressourcen-Bibliothek.',
    icon: 'Box'
  },
  {
    typeId: 'fabric',
    name: 'Fabric',
    tagline: 'Leichtgewichtige, moderne Modding-Plattform der nächsten Generation',
    category: 'Modding Loaders',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: ['Java 21', 'Java 17'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#38bdf8',
    defaultJarName: 'fabric-server-launch.jar',
    jvmFlags: `-Xms4G -Xmx4G -jar fabric-server-launch.jar nogui`,
    description: 'Extrem schneller Start, blitzschnelle Updates auf neue Minecraft-Versionen und erstklassige Performance-Mods wie Sodium, Lithium und FerriteCore.',
    icon: 'Cpu'
  },
  {
    typeId: 'neoforge',
    name: 'NeoForge',
    tagline: 'Die moderne, bereinigte Evolution von Forge',
    category: 'Modding Loaders',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: ['Java 21', 'Java 17'],
    versions: ['1.21.4', '1.21.1', '1.20.6', '1.20.4'],
    bannerColor: '#ec4899',
    defaultJarName: 'neoforge-server.jar',
    jvmFlags: `@user_jvm_args.txt @libraries/net/neoforged/neoforge/unix_args.txt nogui`,
    description: 'Von der ursprünglichen Forge-Community gegründete Weiterentwicklung für Versionen 1.20.4+ mit sauberer API und stabiler Mod-Unterstützung.',
    icon: 'Layers'
  },
  {
    typeId: 'forge',
    name: 'Minecraft Forge',
    tagline: 'Der legendäre Modloader für große Modpacks',
    category: 'Modding Loaders',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: ['Java 21', 'Java 17', 'Java 11', 'Java 8'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#eab308',
    defaultJarName: 'forge-server.jar',
    jvmFlags: `-Xms6G -Xmx6G -jar forge-server.jar nogui`,
    description: 'Standard-Plattform für umfangreiche Modpacks wie All The Mods, RLCraft, GregTech und Create Mod.',
    icon: 'Wrench'
  },
  {
    typeId: 'quilt',
    name: 'Quilt MC',
    tagline: 'Offenes, von der Community betriebenes modulares Modding-Ökosystem',
    category: 'Modding Loaders',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: ['Java 21', 'Java 17'],
    versions: ['1.21.4', '1.21.1', '1.20.4', '1.19.4'],
    bannerColor: '#8b5cf6',
    defaultJarName: 'quilt-server-launch.jar',
    jvmFlags: `-Xms4G -Xmx4G -jar quilt-server-launch.jar nogui`,
    description: 'Moderne Mod-Loader-Architektur kompatibel mit fast allen Fabric-Mods und Quilt-spezifischen Erweiterungen.',
    icon: 'Feather'
  },
  {
    typeId: 'vanilla',
    name: 'Vanilla (Mojang)',
    category: 'Classic Vanilla',
    tagline: 'Unverändertes Original-Erlebnis von Mojang Studios',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17', 'Java 8'],
    versions: MINECRAFT_VERSIONS,
    bannerColor: '#10b981',
    defaultJarName: 'server.jar',
    jvmFlags: `-Xms2G -Xmx2G -jar server.jar nogui`,
    description: 'Die offizielle unveränderte Server-JAR direkt von Mojang für reines Gameplay ohne Drittanbieter-Modifikationen.',
    icon: 'Compass'
  },
  {
    typeId: 'bedrock',
    name: 'Bedrock Dedicated Server (BDS)',
    tagline: 'Offizieller Server für Minecraft Bedrock Edition (Handy, Win 10/11, Konsole)',
    category: 'Bedrock & Proxies',
    defaultPort: 19132,
    protocol: 'UDP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: [],
    versions: ['1.21.50', '1.21.40', '1.21.20', '1.20.80'],
    bannerColor: '#0ea5e9',
    defaultJarName: 'bedrock_server.exe',
    jvmFlags: `LD_LIBRARY_PATH=. ./bedrock_server`,
    description: 'Nativer C++ Server von Mojang für Android, iOS, Windows 10/11 und Konsolen mit Add-On (.mcpack) Unterstützung.',
    icon: 'Smartphone'
  },
  {
    typeId: 'geyser',
    name: 'Geyser-StandAlone + Floodgate',
    tagline: 'Crossplay-Brücke: Verbindet Bedrock-Spieler mit Java-Servern',
    category: 'Bedrock & Proxies',
    defaultPort: 19132,
    protocol: 'UDP',
    supportsPlugins: false,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17'],
    versions: ['Latest Standalone'],
    bannerColor: '#06b6d4',
    defaultJarName: 'Geyser.jar',
    jvmFlags: `-Xms1G -Xmx1G -jar Geyser.jar`,
    description: 'Übersetzt Protokoll-Pakete in Echtzeit, sodass Smartphone- und Konsolenspieler auf Standard-Java-Servern spielen können.',
    icon: 'Repeat'
  },
  {
    typeId: 'velocity',
    name: 'Velocity Proxy',
    tagline: 'Ultra-performanter, moderner Minecraft-Netzwerk-Proxy',
    category: 'Bedrock & Proxies',
    defaultPort: 25577,
    protocol: 'TCP',
    supportsPlugins: true,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17'],
    versions: ['3.3.0', '3.2.0', '3.1.2'],
    bannerColor: '#6366f1',
    defaultJarName: 'velocity.jar',
    jvmFlags: `-Xms1G -Xmx2G -XX:+UseG1GC -jar velocity.jar`,
    description: 'Nächste Generation von Proxies nach BungeeCord mit integriertem Modern Forwarding, hervorragendem DDoS-Handling und Velocity-Plugins.',
    icon: 'Share2'
  },
  {
    typeId: 'bungeecord',
    name: 'BungeeCord',
    tagline: 'Klassischer Proxy zur Vernetzung mehrerer Minecraft-Server',
    category: 'Bedrock & Proxies',
    defaultPort: 25577,
    protocol: 'TCP',
    supportsPlugins: true,
    supportsMods: false,
    supportedJava: ['Java 21', 'Java 17', 'Java 8'],
    versions: ['Latest'],
    bannerColor: '#f43f5e',
    defaultJarName: 'BungeeCord.jar',
    jvmFlags: `-Xms1G -Xmx1G -jar BungeeCord.jar`,
    description: 'Erlaubt nahtloses Wechseln zwischen verschiedenen Unterservern (Lobby, Survival, Minigames) über Portale oder Befehle.',
    icon: 'Network'
  },
  {
    typeId: 'curseforge_modpack',
    name: 'CurseForge / FTB Modpack Server',
    tagline: 'Fertige Server für All The Mods, RLCraft, Better MC, Cobblemon etc.',
    category: 'Modding Loaders',
    defaultPort: 25565,
    protocol: 'TCP',
    supportsPlugins: false,
    supportsMods: true,
    supportedJava: ['Java 21', 'Java 17', 'Java 8'],
    versions: ['ATM 9', 'RLCraft 2.9', 'Better MC v24', 'Cobblemon 1.5', 'Vault Hunters 3'],
    bannerColor: '#f59e0b',
    defaultJarName: 'start.jar',
    jvmFlags: `-Xms8G -Xmx8G -jar server.jar nogui`,
    description: 'Vollständige Modpack-Server-Sets mit vorinstallierten 200+ Mods, Quests, angepassten Konfigurationen und Welten.',
    icon: 'Package'
  }
];

export const MINECRAFT_SERVER_PROPERTIES_DEFAULT = `# Minecraft Server Properties
# Generated by ApexHost Game Server Manager
enable-jmx-monitoring=false
rcon.port=25575
level-seed=
gamemode=survival
enable-command-block=true
enable-query=false
generator-settings={}
enforce-secure-profile=false
level-name=world
motd=§aApexHost §fMinecraft Dedicated Server §7[1.21.x]
query.port=25565
pvp=true
generate-structures=true
max-chained-neighbor-updates=1000000
difficulty=normal
network-compression-threshold=256
max-tick-time=60000
require-resource-pack=false
use-native-transport=true
max-players=20
online-mode=true
enable-status=true
allow-flight=false
broadcast-rcon-to-ops=true
view-distance=10
server-ip=0.0.0.0
resource-pack-prompt=
allow-nether=true
server-port=25565
enable-rcon=true
sync-chunk-writes=true
op-permission-level=4
prevent-proxy-connections=false
hide-online-players=false
resource-pack=
entity-broadcast-range-percentage=100
simulation-distance=8
rcon.password=ApexSecretPass123
player-idle-timeout=0
force-gamemode=false
rate-limit=0
hardcore=false
white-list=false
broadcast-console-to-ops=true
spawn-npcs=true
spawn-animals=true
function-permission-level=2
initial-enabled-packs=vanilla
level-type=minecraft\\:normal
text-filtering-config=
spawn-monsters=true
enforce-whitelist=false
spawn-protection=0
resource-pack-sha1=
max-world-size=29999984`;

export function getMinecraftGameDefinition(typeInfo: MinecraftTypeInfo): GameDefinition {
  return {
    id: `mc_${typeInfo.typeId}`,
    name: `Minecraft (${typeInfo.name})`,
    category: 'minecraft',
    bannerColor: typeInfo.bannerColor,
    defaultPort: typeInfo.defaultPort,
    queryPort: typeInfo.defaultPort,
    rconPort: 25575,
    minRamGb: typeInfo.category === 'Bedrock & Proxies' ? 1 : 2,
    recommendedRamGb: typeInfo.category === 'Modding Loaders' ? 8 : 4,
    modFramework: typeInfo.supportsPlugins ? 'spigot_paper' : typeInfo.supportsMods ? 'fabric' : 'none',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'run.bat',
      linux: './run.sh',
      macos: './run.command'
    },
    defaultStartArgs: {
      windows: `java ${typeInfo.jvmFlags}`,
      linux: `java ${typeInfo.jvmFlags}`,
      macos: `java ${typeInfo.jvmFlags}`
    },
    configFiles: [
      {
        name: 'server.properties',
        path: 'server.properties',
        type: 'properties',
        defaultContent: MINECRAFT_SERVER_PROPERTIES_DEFAULT
      },
      {
        name: 'eula.txt',
        path: 'eula.txt',
        type: 'cfg',
        defaultContent: '# By changing the setting below to TRUE you are indicating your agreement to the Mojang EULA (https://account.mojang.com/documents/minecraft_eula).\neula=true'
      }
    ],
    description: typeInfo.description
  };
}
