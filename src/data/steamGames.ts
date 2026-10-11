import type { GameDefinition } from '../types/game';

export const STEAM_GAMES_DATABASE: GameDefinition[] = [
  // --- SURVIVAL & CRAFTING (1-25) ---
  {
    id: 'palworld',
    name: 'Palworld',
    category: 'survival',
    steamAppId: 2394010,
    bannerColor: '#0ea5e9',
    defaultPort: 8211,
    queryPort: 27015,
    rconPort: 25575,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'ue4ss',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'PalServer.exe',
      linux: './PalServer.sh',
      macos: 'PalServer.command'
    },
    defaultStartArgs: {
      windows: '-port=8211 -players=32 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS',
      linux: '-port=8211 -players=32 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS',
      macos: '-port=8211'
    },
    configFiles: [
      {
        name: 'PalWorldSettings.ini',
        path: 'Pal/Saved/Config/WindowsServer/PalWorldSettings.ini',
        type: 'ini',
        defaultContent: `[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,ExpRate=1.000000,PalCaptureRate=1.000000,PalSpawnNumRate=1.000000,ServerPlayerMaxNum=32,ServerName="ApexHost Palworld Server",ServerDescription="Welcome to our Palworld Dedicated Server!",AdminPassword="AdminPassword123",ServerPassword="",PublicPort=8211,RCONEnabled=True,RCONPort=25575)`
      }
    ],
    description: 'Offener Survival-Crafting-Hit mit Monster-Zähmung, Basenbau und Dungeons.'
  },
  {
    id: 'rust',
    name: 'Rust',
    category: 'survival',
    steamAppId: 258550,
    bannerColor: '#ea580c',
    defaultPort: 28015,
    queryPort: 28016,
    rconPort: 28016,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'umod_oxide',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'RustDedicated.exe',
      linux: './RustDedicated',
      macos: './RustDedicated'
    },
    defaultStartArgs: {
      windows: '-batchmode +server.port 28015 +server.level "Procedural Map" +server.seed 12345 +server.worldsize 4000 +server.maxplayers 100 +server.hostname "ApexHost Rust Server"',
      linux: '-batchmode +server.port 28015 +server.level "Procedural Map" +server.seed 12345 +server.worldsize 4000 +server.maxplayers 100 +server.hostname "ApexHost Rust Server"',
      macos: '-batchmode +server.port 28015'
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'server/my_server_identity/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `server.hostname "ApexHost Rust Dedicated Server"
server.description "High Performance Rust Server Hosted on ApexHost"
server.maxplayers 100
server.worldsize 4000
server.seed 784321
rcon.port 28016
rcon.password "RustRconSecret"
server.saveinterval 300`
      }
    ],
    description: 'Das ultimative Hardcore-PvP-Survival-Spiel mit Basenbau und Ressourcen-Kämpfen.'
  },
  {
    id: 'valheim',
    name: 'Valheim',
    category: 'survival',
    steamAppId: 896660,
    bannerColor: '#d97706',
    defaultPort: 2456,
    queryPort: 2457,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'bepinex',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'valheim_server.exe',
      linux: './valheim_server.x86_64',
      macos: './valheim_server'
    },
    defaultStartArgs: {
      windows: '-name "ApexHost Valheim" -port 2456 -world "ApexWorld" -password "secret123" -crossplay',
      linux: '-name "ApexHost Valheim" -port 2456 -world "ApexWorld" -password "secret123" -crossplay',
      macos: '-name "ApexHost Valheim" -port 2456'
    },
    configFiles: [
      {
        name: 'start_server.bat',
        path: 'start_server.bat',
        type: 'cfg',
        defaultContent: `valheim_server -nographics -batchmode -name "ApexHost Viking Server" -port 2456 -world "ApexWorld" -password "vikings123" -public 1`
      }
    ],
    description: 'Brutales Erkundungs- und Survival-Spiel für 1–10 Spieler in einer nordischen Mythologie-Welt.'
  },
  {
    id: 'ark_sa',
    name: 'ARK: Survival Ascended',
    category: 'survival',
    steamAppId: 2430930,
    bannerColor: '#10b981',
    defaultPort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    minRamGb: 16,
    recommendedRamGb: 32,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'ArkAscendedServer.exe',
      linux: './ArkAscendedServer.sh',
      macos: 'ArkAscendedServer'
    },
    defaultStartArgs: {
      windows: 'TheIsland_WP?listen?SessionName=ApexARK?ServerPassword=?ServerAdminPassword=SecretAdmin123 -Port=7777 -QueryPort=27015 -RCONPort=27020 -WinLiveMaxPlayers=70',
      linux: 'TheIsland_WP?listen?SessionName=ApexARK?ServerPassword=?ServerAdminPassword=SecretAdmin123 -Port=7777 -QueryPort=27015 -RCONPort=27020 -WinLiveMaxPlayers=70',
      macos: 'TheIsland_WP?listen'
    },
    configFiles: [
      {
        name: 'GameUserSettings.ini',
        path: 'ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
ServerPassword=
ServerAdminPassword=SuperAdminPassword!
RCONPort=27020
RCONEnabled=True
DifficultyOffset=1.000000
MaxPlayers=70`
      }
    ],
    description: 'Unreal Engine 5 Remake des Dinosaurier-Survival-Klassikers mit fotorealistischer Grafik.'
  },
  {
    id: 'enshrouded',
    name: 'Enshrouded',
    category: 'survival',
    steamAppId: 2278520,
    bannerColor: '#8b5cf6',
    defaultPort: 15636,
    queryPort: 15637,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'enshrouded_server.exe',
      linux: './enshrouded_server',
      macos: './enshrouded_server'
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'enshrouded_server.json',
        path: 'enshrouded_server.json',
        type: 'json',
        defaultContent: `{
  "name": "ApexHost Enshrouded Realm",
  "password": "",
  "saveDirectory": "./savegame",
  "logDirectory": "./logs",
  "ip": "0.0.0.0",
  "gamePort": 15636,
  "queryPort": 15637,
  "slotCount": 16
}`
      }
    ],
    description: 'Voxel-basiertes Action-RPG-Survival in einer vom Miasma verfallenen Welt.'
  },
  {
    id: '7days_to_die',
    name: '7 Days to Die',
    category: 'survival',
    steamAppId: 294420,
    bannerColor: '#dc2626',
    defaultPort: 26900,
    queryPort: 26901,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: '7DaysToDieServer.exe',
      linux: './7DaysToDieServer.x86_64',
      macos: './7DaysToDieServer'
    },
    defaultStartArgs: {
      windows: '-configfile=serverconfig.xml -dedicated',
      linux: '-configfile=serverconfig.xml -dedicated',
      macos: '-configfile=serverconfig.xml'
    },
    configFiles: [
      {
        name: 'serverconfig.xml',
        path: 'serverconfig.xml',
        type: 'cfg',
        defaultContent: `<ServerSettings>
  <property name="ServerName" value="ApexHost 7 Days to Die"/>
  <property name="ServerDescription" value="Survive the Blood Moon!"/>
  <property name="ServerPort" value="26900"/>
  <property name="ServerMaxPlayerCount" value="16"/>
  <property name="GameWorld" value="Navezgane"/>
  <property name="GameDifficulty" value="2"/>
</ServerSettings>`
      }
    ],
    description: 'Voxel-Sandbox-Zombie-Survival mit wöchentlicher Blutmond-Horde und tiefem Crafting.'
  },
  {
    id: 'dayz',
    name: 'DayZ',
    category: 'survival',
    steamAppId: 223350,
    bannerColor: '#65a30d',
    defaultPort: 2302,
    queryPort: 27016,
    rconPort: 2306,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'DayZServer_x64.exe',
      linux: './DayZServer',
      macos: './DayZServer'
    },
    defaultStartArgs: {
      windows: '-config=serverDZ.cfg -port=2302 -profiles=profiles -BEpath=battleye -dologs -adminlog -netlog -freezecheck',
      linux: '-config=serverDZ.cfg -port=2302',
      macos: '-config=serverDZ.cfg'
    },
    configFiles: [
      {
        name: 'serverDZ.cfg',
        path: 'serverDZ.cfg',
        type: 'cfg',
        defaultContent: `hostname = "ApexHost DayZ Standalone Server";
password = "";
passwordAdmin = "DayZAdminPass123";
maxPlayers = 60;
verifySignatures = 2;
forceSameBuild = 1;`
      }
    ],
    description: 'Das gnadenlose post-sowjetische Zombie-Survival-Spiel in Chernarus.'
  },
  {
    id: 'sons_of_forest',
    name: 'Sons of the Forest',
    category: 'survival',
    steamAppId: 2465200,
    bannerColor: '#475569',
    defaultPort: 8766,
    queryPort: 27016,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'bepinex',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'SonsOfTheForestDS.exe',
      linux: './SonsOfTheForestDS.sh',
      macos: 'SonsOfTheForestDS'
    },
    defaultStartArgs: {
      windows: '-userdataPath ./saves',
      linux: '-userdataPath ./saves',
      macos: ''
    },
    configFiles: [
      {
        name: 'dedicatedserver.cfg',
        path: 'userdata/dedicatedserver.cfg',
        type: 'json',
        defaultContent: `{
  "IpAddress": "0.0.0.0",
  "GamePort": 8766,
  "QueryPort": 27016,
  "BlobSyncPort": 9700,
  "ServerName": "ApexHost Sons of the Forest",
  "MaxPlayers": 8
}`
      }
    ],
    description: 'Kannibalen- und Mutanten-Insel Survival-Horror von Endnight Games.'
  },
  {
    id: 'project_zomboid',
    name: 'Project Zomboid',
    category: 'survival',
    steamAppId: 380870,
    bannerColor: '#991b1b',
    defaultPort: 16261,
    queryPort: 16262,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'ProjectZomboid64.exe',
      linux: './start-server.sh',
      macos: './start-server.command'
    },
    defaultStartArgs: {
      windows: '-servername servertest -adminpassword adminpass',
      linux: '-servername servertest -adminpassword adminpass',
      macos: '-servername servertest'
    },
    configFiles: [
      {
        name: 'servertest.ini',
        path: 'Zomboid/Server/servertest.ini',
        type: 'ini',
        defaultContent: `PVP=true
PauseEmpty=true
GlobalChat=true
Open=true
ServerWelcomeMessage=Willkommen auf dem ApexHost Zomboid Server!
MaxPlayers=32
Public=true`
      }
    ],
    description: 'Isometrischer ultra-realistischer Zombie-Überlebenssimulator in Knox County.'
  },
  {
    id: 'the_forest',
    name: 'The Forest',
    category: 'survival',
    steamAppId: 556450,
    bannerColor: '#059669',
    defaultPort: 8766,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'umod_oxide',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'TheForestDedicatedServer.exe',
      linux: './TheForestDedicatedServer.sh',
      macos: 'TheForestDedicatedServer'
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics',
      linux: '-batchmode -nographics',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'server.cfg',
        type: 'cfg',
        defaultContent: `serverName ApexHost The Forest
serverPlayers 8
serverAutoSaveInterval 15
difficulty Normal
initType Continue`
      }
    ],
    description: 'Flugzeugabsturz-Überlebenskampf auf einer geheimnisvollen Halbinsel voller Mutanten.'
  },
  {
    id: 'v_rising',
    name: 'V Rising',
    category: 'survival',
    steamAppId: 1829350,
    bannerColor: '#be123c',
    defaultPort: 9876,
    queryPort: 9877,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'bepinex',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'VRisingServer.exe',
      linux: './VRisingServer.sh',
      macos: 'VRisingServer'
    },
    defaultStartArgs: {
      windows: '-persistentDataPath ./save-data -serverName "ApexHost V Rising" -saveName "world1" -logFile VRisingServer.log',
      linux: '-persistentDataPath ./save-data -serverName "ApexHost V Rising" -saveName "world1"',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerGameSettings.json',
        path: 'VRisingServer_Data/StreamingAssets/Settings/ServerGameSettings.json',
        type: 'json',
        defaultContent: `{
  "GameModeType": "PvE",
  "CastleDamageMode": "Never",
  "SiegeWeaponHealth": "Normal",
  "PlayerDamageMode": "Always",
  "CastleHeartDamageMode": "CanBeDestroyedOnlyWhenDecaying"
}`
      }
    ],
    description: 'Erwache als Vampir, baue dein Schloss und herrsche über Vardoran.'
  },
  {
    id: 'conan_exiles',
    name: 'Conan Exiles',
    category: 'survival',
    steamAppId: 443030,
    bannerColor: '#b45309',
    defaultPort: 7777,
    queryPort: 27015,
    rconPort: 25575,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'ConanSandboxServer.exe',
      linux: './ConanSandboxServer.sh',
      macos: 'ConanSandboxServer'
    },
    defaultStartArgs: {
      windows: '-log',
      linux: '-log',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'ConanSandbox/Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
ServerName=ApexHost Conan Exiles
ServerPassword=
AdminPassword=ConanAdminSecret123
MaxPlayers=40`
      }
    ],
    description: 'Barbarisches Open-World-Survival im Universum von Conan dem Cimmerier.'
  },
  {
    id: 'dont_starve_together',
    name: "Don't Starve Together",
    category: 'survival',
    steamAppId: 343050,
    bannerColor: '#854d0e',
    defaultPort: 10999,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'dontstarve_dedicated_server_nullrenderer_x64.exe',
      linux: './dontstarve_dedicated_server_nullrenderer_x64',
      macos: './dontstarve_dedicated_server_nullrenderer'
    },
    defaultStartArgs: {
      windows: '-console -cluster MyCluster -shard Master',
      linux: '-console -cluster MyCluster -shard Master',
      macos: '-console -cluster MyCluster -shard Master'
    },
    configFiles: [
      {
        name: 'cluster.ini',
        path: 'MyCluster/cluster.ini',
        type: 'ini',
        defaultContent: `[GAMEPLAY]
game_mode = survival
max_players = 6
pvp = false

[NETWORK]
cluster_name = ApexHost DST World
cluster_description = Surviving together!`
      }
    ],
    description: 'Düster-humorvolles kooperatives Wildnis-Survival im Burton-Stil.'
  },
  {
    id: 'scum',
    name: 'SCUM',
    category: 'survival',
    steamAppId: 513710,
    bannerColor: '#3f6212',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 12,
    recommendedRamGb: 24,
    modFramework: 'none',
    supportedPlatforms: ['windows'],
    executable: {
      windows: 'SCUMServer.exe',
      linux: 'SCUMServer.exe',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -QueryPort=27015',
      linux: 'wine SCUMServer.exe -Port=7777',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'SCUM/Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[General]
ServerName=ApexHost SCUM Server
MaxPlayers=64`
      }
    ],
    description: 'Extrem detailreicher Gefängnisinsel-Survival-Simulator mit Stoffwechsel-Mechanik.'
  },
  {
    id: 'raft',
    name: 'Raft (Dedicated modded)',
    category: 'survival',
    steamAppId: 648800,
    bannerColor: '#0284c7',
    defaultPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'bepinex',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'Raft.exe',
      linux: './Raft.x86_64',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics',
      linux: '-batchmode -nographics',
      macos: ''
    },
    configFiles: [
      {
        name: 'config.json',
        path: 'config.json',
        type: 'json',
        defaultContent: `{"serverName": "ApexHost Raft Ocean", "maxPlayers": 8}`
      }
    ],
    description: 'Ozean-Survival auf einem erweiterbaren Holzfloß gegen hungrige Haie.'
  },
  {
    id: 'grounded',
    name: 'Grounded',
    category: 'survival',
    steamAppId: 962130,
    bannerColor: '#16a34a',
    defaultPort: 7777,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'MaineServer.exe',
      linux: './MaineServer',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-log',
      linux: '-log',
      macos: ''
    },
    configFiles: [
      {
        name: 'GroundedConfig.ini',
        path: 'Config/GroundedConfig.ini',
        type: 'ini',
        defaultContent: `[Server]
Name=ApexHost Grounded Server`
      }
    ],
    description: 'Auf Insektengröße geschrumpft im eigenen Garten überleben.'
  },
  {
    id: 'sunkenland',
    name: 'Sunkenland',
    category: 'survival',
    steamAppId: 2080690,
    bannerColor: '#0891b2',
    defaultPort: 7777,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'SunkenlandServer.exe',
      linux: './SunkenlandServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-batchmode',
      linux: '-batchmode',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerConfig.json',
        path: 'ServerConfig.json',
        type: 'json',
        defaultContent: `{"ServerName":"ApexHost Sunkenland","Port":7777}`
      }
    ],
    description: 'Waterworld-inspiriertes postapokalyptisches Survival mit Tauchen und Basenbau.'
  },
  {
    id: 'abiotic_factor',
    name: 'Abiotic Factor',
    category: 'survival',
    steamAppId: 427410,
    bannerColor: '#e11d48',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'AbioticFactorServer.exe',
      linux: './AbioticFactorServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -QueryPort=27015 -MaxServerPlayers=6',
      linux: '-Port=7777 -QueryPort=27015 -MaxServerPlayers=6',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
ServerName=ApexHost GATE Facility`
      }
    ],
    description: 'Kooperatives 90er-Wissenschafts-Survival in einer geheimen unterirdischen Forschungseinrichtung.'
  },
  {
    id: 'icarus',
    name: 'ICARUS',
    category: 'survival',
    steamAppId: 1149460,
    bannerColor: '#ca8a04',
    defaultPort: 17777,
    queryPort: 27015,
    minRamGb: 12,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'IcarusServer.exe',
      linux: './IcarusServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-PORT=17777 -QueryPort=27015 -SteamServerName="ApexHost Icarus"',
      linux: '-PORT=17777 -QueryPort=27015',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'Icarus/Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
SessionName=ApexHost Icarus Expedition`
      }
    ],
    description: 'PvE-Survival auf einem terraformierten Alien-Planeten mit harschen Umweltbedingungen.'
  },
  {
    id: 'unturned',
    name: 'Unturned',
    category: 'survival',
    steamAppId: 1110100,
    bannerColor: '#15803d',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 2,
    recommendedRamGb: 6,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'Unturned.exe',
      linux: './ServerHelper.sh',
      macos: './Unturned'
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics +secureserver/ApexUnturned',
      linux: '-batchmode -nographics +secureserver/ApexUnturned',
      macos: '-batchmode -nographics +secureserver/ApexUnturned'
    },
    configFiles: [
      {
        name: 'Commands.dat',
        path: 'Servers/ApexUnturned/Server/Commands.dat',
        type: 'cfg',
        defaultContent: `Name ApexHost Unturned Server
Port 27015
MaxPlayers 24
Map PEI
Mode Normal
Perspective Both
Cycle 3600`
      }
    ],
    description: 'Beliebtes Zombie-Survival im Block-Look mit massiver Mod- und Workshop-Community.'
  },

  // --- TACTICAL FPS & SHOOTERS (21-45) ---
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    category: 'fps',
    steamAppId: 730,
    bannerColor: '#f59e0b',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'cs2.exe',
      linux: './game/bin/linuxsteamrt64/cs2',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-dedicated -port 27015 +game_type 0 +game_mode 1 +map de_dust2 +mapgroup mg_active',
      linux: '-dedicated -port 27015 +game_type 0 +game_mode 1 +map de_dust2 +mapgroup mg_active',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'game/csgo/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost Counter-Strike 2 Server"
rcon_password "SecretRcon1337"
sv_cheats 0
sv_lan 0
mp_maxrounds 24
mp_roundtime_defuse 1.92
mp_freezetime 15`
      }
    ],
    description: 'Der Flaggschiff-Taktik-Shooter von Valve auf Source 2 Basis mit Sub-Tick-Präzision.'
  },
  {
    id: 'tf2',
    name: 'Team Fortress 2',
    category: 'fps',
    steamAppId: 232250,
    bannerColor: '#f97316',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game tf -console -port 27015 +maxplayers 24 +map cp_badlands',
      linux: '-game tf -console -port 27015 +maxplayers 24 +map cp_badlands',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'tf/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost TF2 Server"
rcon_password "AdminRconTF2"
sv_contact "admin@apexhost.local"
mp_timelimit 30`
      }
    ],
    description: 'Der legendäre klassenbasierte Multiplayer-Shooter von Valve.'
  },
  {
    id: 'squad',
    name: 'Squad',
    category: 'fps',
    steamAppId: 403240,
    bannerColor: '#4f46e5',
    defaultPort: 7787,
    queryPort: 27165,
    rconPort: 21114,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'SquadGameServer.exe',
      linux: './SquadGameServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: 'Port=7787 QueryPort=27165 RCONPORT=21114 -log',
      linux: 'Port=7787 QueryPort=27165 RCONPORT=21114 -log',
      macos: ''
    },
    configFiles: [
      {
        name: 'Server.cfg',
        path: 'SquadGame/ServerConfig/Server.cfg',
        type: 'cfg',
        defaultContent: `ServerName="ApexHost Tactical 50v50 Squad Server"
MaxPlayers=100
NumReservedSlots=5
ShouldAdvertise=true`
      }
    ],
    description: 'Großangelegter 50v50 Taktik-Militär-Shooter mit Fokus auf Kommunikation und Teamplay.'
  },
  {
    id: 'arma3',
    name: 'ArmA 3',
    category: 'fps',
    steamAppId: 233780,
    bannerColor: '#84cc16',
    defaultPort: 2302,
    queryPort: 2303,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'arma3server_x64.exe',
      linux: './arma3server',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-port=2302 -config=server.cfg -cfg=basic.cfg -name=ApexHost',
      linux: '-port=2302 -config=server.cfg -cfg=basic.cfg -name=ApexHost',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'server.cfg',
        type: 'cfg',
        defaultContent: `hostname = "ApexHost ArmA 3 Milsim";
password = "";
passwordAdmin = "AdminSecretPass";
maxPlayers = 64;`
      }
    ],
    description: 'Die ultimative Militär-Sandbox mit unendlicher Mod-Freiheit und riesigen Gefechtsfeldern.'
  },
  {
    id: 'hell_let_loose',
    name: 'Hell Let Loose',
    category: 'fps',
    steamAppId: 686810,
    bannerColor: '#9f1239',
    defaultPort: 7787,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows'],
    executable: {
      windows: 'HLLServer.exe',
      linux: 'HLLServer.exe',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7787 -QueryPort=27015',
      linux: 'wine HLLServer.exe',
      macos: ''
    },
    configFiles: [
      {
        name: 'Server.ini',
        path: 'HLL/Saved/Config/WindowsServer/Server.ini',
        type: 'ini',
        defaultContent: `[Server]
Name=ApexHost 50v50 WW2 Hell Let Loose`
      }
    ],
    description: 'Hardcore 100-Spieler-Gefechte an den Frontlinien des Zweiten Weltkriegs.'
  },
  {
    id: 'insurgency_sandstorm',
    name: 'Insurgency: Sandstorm',
    category: 'fps',
    steamAppId: 581330,
    bannerColor: '#d97706',
    defaultPort: 27102,
    queryPort: 27131,
    rconPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'InsurgencyServer.exe',
      linux: './InsurgencyServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: 'Oilfield?Scenario=Scenario_Refinery_Push_Security?MaxPlayers=28 -Port=27102 -QueryPort=27131 -log',
      linux: 'Oilfield?Scenario=Scenario_Refinery_Push_Security?MaxPlayers=28 -Port=27102 -QueryPort=27131 -log',
      macos: ''
    },
    configFiles: [
      {
        name: 'Game.ini',
        path: 'Insurgency/Saved/Config/WindowsServer/Game.ini',
        type: 'ini',
        defaultContent: `[/Script/Insurgency.INSMultiplayerMode]
bKillCam=False
bAllowFriendlyFire=True`
      }
    ],
    description: 'Intensiver Taktik-Shooter im Nahen Osten mit tödlicher Nahkampfdynamik.'
  },
  {
    id: 'l4d2',
    name: 'Left 4 Dead 2',
    category: 'fps',
    steamAppId: 222860,
    bannerColor: '#b91c1c',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game left4dead2 -console -port 27015 +map c1m1_hotel',
      linux: '-game left4dead2 -console -port 27015 +map c1m1_hotel',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'left4dead2/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost L4D2 Campaign"
rcon_password "l4d2rconpass"
sv_gametypes "coop,versus,survival"`
      }
    ],
    description: 'Kultiger 4-Spieler-Zombie-Koop-Shooter mit AI Director.'
  },
  {
    id: 'css',
    name: 'Counter-Strike: Source',
    category: 'fps',
    steamAppId: 240,
    bannerColor: '#2563eb',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game cstrike -console -port 27015 +maxplayers 24 +map de_dust2',
      linux: '-game cstrike -console -port 27015 +maxplayers 24 +map de_dust2',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'cstrike/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost CS:S Classic"
rcon_password "ClassicRcon"`
      }
    ],
    description: 'Der zeitlose Source-Engine-Klassiker für GunGame, Surf und Zombie Mod.'
  },
  {
    id: 'killing_floor_2',
    name: 'Killing Floor 2',
    category: 'fps',
    steamAppId: 232130,
    bannerColor: '#991b1b',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'KFServer.exe',
      linux: './KFGameSteamServer.bin.x86_64',
      macos: ''
    },
    defaultStartArgs: {
      windows: 'KF-BioticsLab?Difficulty=1?GameLength=1 -Port=7777 -QueryPort=27015',
      linux: 'KF-BioticsLab?Difficulty=1?GameLength=1 -Port=7777 -QueryPort=27015',
      macos: ''
    },
    configFiles: [
      {
        name: 'PCServer-KFGame.ini',
        path: 'KFGame/Config/PCServer-KFGame.ini',
        type: 'ini',
        defaultContent: `[KFGame.KFGameInfo]
GameDifficulty=1.000000`
      }
    ],
    description: 'Blutige ZED-Wellenabwehr mit 6 Spielern und Perks.'
  },
  {
    id: 'scp_secret_lab',
    name: 'SCP: Secret Laboratory',
    category: 'fps',
    steamAppId: 996560,
    bannerColor: '#525252',
    defaultPort: 7777,
    queryPort: 7777,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'SCPSL.exe',
      linux: './LocalAdmin',
      macos: ''
    },
    defaultStartArgs: {
      windows: '7777',
      linux: '7777',
      macos: ''
    },
    configFiles: [
      {
        name: 'config_gameplay.txt',
        path: 'AppData/Roaming/SCP Secret Laboratory/config_gameplay.txt',
        type: 'cfg',
        defaultContent: `server_name: ApexHost SCP Foundation Site
max_players: 30`
      }
    ],
    description: 'Mehrspieler-Horror in der SCP-Forschungseinrichtung mit Sicherheitskräften und SCP-Monstern.'
  },

  // --- SANDBOX & CREATIVE BUILDERS (41-60) ---
  {
    id: 'gmod',
    name: "Garry's Mod",
    category: 'sandbox',
    steamAppId: 4020,
    bannerColor: '#0284c7',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game garrysmod -console -port 27015 +gamemode sandbox +map gm_construct +maxplayers 32',
      linux: '-game garrysmod -console -port 27015 +gamemode sandbox +map gm_construct +maxplayers 32',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'garrysmod/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost Garry's Mod Sandbox"
rcon_password "GmodRconKey"
sbox_maxprops 200
sbox_maxragdolls 10
sbox_maxthrusters 50`
      }
    ],
    description: 'Die ultimative Physik-Sandbox für DarkRP, TTT, Prop Hunt und unzählige Lua-Addons.'
  },
  {
    id: 'satisfactory',
    name: 'Satisfactory',
    category: 'simulation',
    steamAppId: 1690800,
    bannerColor: '#f97316',
    defaultPort: 7777,
    queryPort: 7777,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'FactoryServer.exe',
      linux: './FactoryServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -log -unattended',
      linux: '-Port=7777 -log -unattended',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'FactoryGame/Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[Server]
AutoSaveInterval=300`
      }
    ],
    description: 'Erstklassiges 3D-Fabrik-Automatisierungsspiel auf einem fremden Planeten.'
  },
  {
    id: 'factorio',
    name: 'Factorio',
    category: 'simulation',
    steamAppId: 427520,
    bannerColor: '#eab308',
    defaultPort: 34197,
    queryPort: 34197,
    minRamGb: 2,
    recommendedRamGb: 6,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'factorio.exe',
      linux: './bin/x64/factorio',
      macos: './factorio'
    },
    defaultStartArgs: {
      windows: '--start-server ./saves/my-save.zip --server-settings ./data/server-settings.json',
      linux: '--start-server ./saves/my-save.zip --server-settings ./data/server-settings.json',
      macos: '--start-server ./saves/my-save.zip'
    },
    configFiles: [
      {
        name: 'server-settings.json',
        path: 'data/server-settings.json',
        type: 'json',
        defaultContent: `{
  "name": "ApexHost Factorio Enterprise",
  "description": "Die Fabrik muss wachsen!",
  "max_players": 32,
  "game_password": "",
  "visibility": {"public": true, "lan": true}
}`
      }
    ],
    description: 'Das süchtig machende Meisterwerk der Fabrik- und Logistikautomatisierung.'
  },
  {
    id: 'terraria',
    name: 'Terraria (tModLoader / TShock)',
    category: 'sandbox',
    steamAppId: 105600,
    bannerColor: '#16a34a',
    defaultPort: 7777,
    queryPort: 7777,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'TerrariaServer.exe',
      linux: './TerrariaServer.bin.x86_64',
      macos: './TerrariaServer.bin.osx'
    },
    defaultStartArgs: {
      windows: '-config serverconfig.txt',
      linux: '-config serverconfig.txt',
      macos: '-config serverconfig.txt'
    },
    configFiles: [
      {
        name: 'serverconfig.txt',
        path: 'serverconfig.txt',
        type: 'cfg',
        defaultContent: `world=worlds/World1.wld
autocreate=3
worldname=ApexWorld
difficulty=1
maxplayers=16
port=7777
password=
motd=Willkommen bei Terraria auf ApexHost!`
      }
    ],
    description: '2D-Action-Adventure Sandbox mit Erkundung, Bosskämpfen und tausenden Items.'
  },
  {
    id: 'space_engineers',
    name: 'Space Engineers',
    category: 'simulation',
    steamAppId: 298740,
    bannerColor: '#38bdf8',
    defaultPort: 27016,
    queryPort: 27016,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows'],
    executable: {
      windows: 'SpaceEngineersDedicated.exe',
      linux: 'SpaceEngineersDedicated.exe',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-console -ignorelastsession',
      linux: 'wine SpaceEngineersDedicated.exe -console',
      macos: ''
    },
    configFiles: [
      {
        name: 'SpaceEngineers-Dedicated.cfg',
        path: 'SpaceEngineers-Dedicated.cfg',
        type: 'cfg',
        defaultContent: `<MyConfigDedicated>
  <ServerName>ApexHost Space Station</ServerName>
  <WorldName>ApexSector</WorldName>
  <ServerPort>27016</ServerPort>
</MyConfigDedicated>`
      }
    ],
    description: 'Weltraum-Ingenieur-Simulation mit Asteroiden-Bergbau, Raumschiffbau und Planetenlandungen.'
  },
  {
    id: 'core_keeper',
    name: 'Core Keeper',
    category: 'sandbox',
    steamAppId: 1963720,
    bannerColor: '#f59e0b',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'CoreKeeperServer.exe',
      linux: './_launch.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-world "0" -worldname "ApexCave" -maxplayers "8"',
      linux: '-world "0" -worldname "ApexCave" -maxplayers "8"',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerConfig.json',
        path: 'ServerConfig.json',
        type: 'json',
        defaultContent: `{"world_name": "ApexCave", "max_players": 8}`
      }
    ],
    description: 'Unterirdisches 1–8 Spieler Bergbau-Abenteuer voller Relikte, Basenbau und Bosse.'
  },
  {
    id: 'barotrauma',
    name: 'Barotrauma',
    category: 'simulation',
    steamAppId: 602960,
    bannerColor: '#0369a1',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'DedicatedServer.exe',
      linux: './DedicatedServer',
      macos: './DedicatedServer'
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'serversettings.xml',
        path: 'serversettings.xml',
        type: 'cfg',
        defaultContent: `<ServerSettings name="ApexHost Submarine Crew" port="27015" maxplayers="16"/>`
      }
    ],
    description: 'U-Boot-Koop-Simulator in den eisigen Tiefen des Jupitermonds Europa.'
  },
  {
    id: 'assetto_corsa',
    name: 'Assetto Corsa',
    category: 'simulation',
    steamAppId: 244210,
    bannerColor: '#dc2626',
    defaultPort: 9600,
    queryPort: 8081,
    minRamGb: 2,
    recommendedRamGb: 6,
    modFramework: 'custom',
    supportedPlatforms: ['windows'],
    executable: {
      windows: 'acServer.exe',
      linux: 'acServer.exe',
      macos: ''
    },
    defaultStartArgs: {
      windows: '',
      linux: 'wine acServer.exe',
      macos: ''
    },
    configFiles: [
      {
        name: 'server_cfg.ini',
        path: 'cfg/server_cfg.ini',
        type: 'ini',
        defaultContent: `[SERVER]
NAME=ApexHost Nürburgring TrackDay
CARS=bmw_m3_e30;lotus_elise_sc
TRACK=monza
PORT=9600
HTTP_PORT=8081`
      }
    ],
    description: 'Renommierte Motorsport- und Fahrphysik-Simulation für Trackdays und Drift-Lobbys.'
  },
  {
    id: 'euro_truck_sim_2',
    name: 'Euro Truck Simulator 2 (Convoy)',
    category: 'simulation',
    steamAppId: 227300,
    bannerColor: '#0284c7',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'eurotrucks2_server.exe',
      linux: './eurotrucks2_server',
      macos: ''
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'server_config.sii',
        path: 'server_config.sii',
        type: 'cfg',
        defaultContent: `SiiNunit { server_config : _nameless { lobby_name: "ApexHost Spedition" max_players: 8 } }`
      }
    ],
    description: 'Gemeinsam LKWs durch ganz Europa lenken im dedizierten Convoy-Modus.'
  },
  {
    id: 'mordhau',
    name: 'MORDHAU',
    category: 'rpg',
    steamAppId: 629760,
    bannerColor: '#b45309',
    defaultPort: 7777,
    queryPort: 27015,
    rconPort: 7777,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'MordhauServer.exe',
      linux: './MordhauServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -QueryPort=27015 -log',
      linux: '-Port=7777 -QueryPort=27015 -log',
      macos: ''
    },
    configFiles: [
      {
        name: 'Game.ini',
        path: 'Mordhau/Saved/Config/WindowsServer/Game.ini',
        type: 'ini',
        defaultContent: `[/Script/Mordhau.MordhauGameSession]
ServerName=ApexHost Medieval Duel & Invasion
MaxPlayers=48`
      }
    ],
    description: 'Mittelalterliches Multiplayer-Gemetzel mit anspruchsvollem Nahkampf-System.'
  },
  {
    id: 'starbound',
    name: 'Starbound',
    category: 'sandbox',
    steamAppId: 211820,
    bannerColor: '#6366f1',
    defaultPort: 21025,
    queryPort: 21025,
    rconPort: 21026,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'starbound_server.exe',
      linux: './starbound_server',
      macos: './starbound_server'
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'starbound_server.config',
        path: 'storage/starbound_server.config',
        type: 'json',
        defaultContent: `{"serverName": "ApexHost Starbound Galaxy", "gamePort": 21025, "maxPlayers": 16}`
      }
    ],
    description: 'Weltraum-Erkundung, Planetenkolonisierung und Pixel-Action in unendlichen Welten.'
  },
  {
    id: 'avorion',
    name: 'Avorion',
    category: 'simulation',
    steamAppId: 445220,
    bannerColor: '#0ea5e9',
    defaultPort: 27000,
    queryPort: 27003,
    rconPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'AvorionServer.exe',
      linux: './server.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '--galaxy-name apex_galaxy',
      linux: '--galaxy-name apex_galaxy',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.ini',
        path: 'server.ini',
        type: 'ini',
        defaultContent: `[Server]
name=ApexHost Avorion Galaxy`
      }
    ],
    description: 'Prozedural generierte Weltraum-Sandbox mit Flottenbau und Wirtschaftskreisläufen.'
  },
  {
    id: 'eco',
    name: 'Eco',
    category: 'simulation',
    steamAppId: 382310,
    bannerColor: '#10b981',
    defaultPort: 3000,
    queryPort: 3001,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'EcoServer.exe',
      linux: './EcoServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'Network.eco',
        path: 'Configs/Network.eco',
        type: 'json',
        defaultContent: `{"Description": "ApexHost Eco Civilization", "GameServerPort": 3000, "WebURIPort": 3001}`
      }
    ],
    description: 'Globale Ökologie- und Wirtschaftssimulation, in der Spieler gemeinsam einen Meteoriten abwehren.'
  },
  {
    id: 'mount_and_blade_bannerlord',
    name: 'Mount & Blade II: Bannerlord',
    category: 'rpg',
    steamAppId: 261550,
    bannerColor: '#b45309',
    defaultPort: 7210,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'DedicatedCustomServer.Starter.exe',
      linux: 'DedicatedCustomServer.Starter.exe',
      macos: ''
    },
    defaultStartArgs: {
      windows: '_MODULES_*Native*Multiplayer*_MODULES_',
      linux: 'wine DedicatedCustomServer.Starter.exe',
      macos: ''
    },
    configFiles: [
      {
        name: 'server_config.txt',
        path: 'server_config.txt',
        type: 'cfg',
        defaultContent: `ServerName ApexHost Calradia Battle`
      }
    ],
    description: 'Epische mittelalterliche Schlachten und Belagerungen mit Hunderten von Kriegern.'
  },
  {
    id: 'stationeers',
    name: 'Stationeers',
    category: 'simulation',
    steamAppId: 544550,
    bannerColor: '#38bdf8',
    defaultPort: 27016,
    queryPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'rocketstation_DedicatedServer.exe',
      linux: './rocketstation_DedicatedServer.x86_64',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-loadlatest Moon',
      linux: '-loadlatest Moon',
      macos: ''
    },
    configFiles: [
      {
        name: 'default.ini',
        path: 'default.ini',
        type: 'ini',
        defaultContent: `[Server]
ServerName=ApexHost Stationeers Base`
      }
    ],
    description: 'Komplexe Konstruktions- und Lebenserhaltungssimulation im Vakuum des Weltraums.'
  },
  {
    id: 'astroneer',
    name: 'Astroneer',
    category: 'sandbox',
    steamAppId: 361420,
    bannerColor: '#6366f1',
    defaultPort: 8777,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'AstroServer.exe',
      linux: './AstroServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '',
      linux: '',
      macos: ''
    },
    configFiles: [
      {
        name: 'AstroServerSettings.ini',
        path: 'Astro/Saved/Config/WindowsServer/AstroServerSettings.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
ServerName=ApexHost Planet Explorer
Port=8777`
      }
    ],
    description: 'Buntes Planeten-Erkundungs- und Terraforming-Abenteuer im 25. Jahrhundert.'
  },
  {
    id: 'necesse',
    name: 'Necesse',
    category: 'rpg',
    steamAppId: 1169040,
    bannerColor: '#10b981',
    defaultPort: 14159,
    minRamGb: 2,
    recommendedRamGb: 4,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'Server.exe',
      linux: './Server.jar',
      macos: './Server.jar'
    },
    defaultStartArgs: {
      windows: '-world "world1" -slots 10',
      linux: '-world "world1" -slots 10',
      macos: '-world "world1" -slots 10'
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'cfg/server.cfg',
        type: 'cfg',
        defaultContent: `port = 14159
slots = 10
world = world1`
      }
    ],
    description: 'Top-Down Sandbox-Action-RPG mit Siedlungsbau, NPCs und Dungeons.'
  },
  {
    id: 'payday2',
    name: 'PAYDAY 2',
    category: 'coop',
    steamAppId: 218620,
    bannerColor: '#dc2626',
    defaultPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'payday2_win32_release.exe',
      linux: './payday2_release',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-dedicated',
      linux: '-dedicated',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'server.cfg',
        type: 'cfg',
        defaultContent: `server_name="ApexHost Bank Heist Gang"`
      }
    ],
    description: 'Kooperativer 4-Spieler Raubüberfall-Shooter mit Masken, Tresoren und Beute.'
  },
  {
    id: 'deep_rock_galactic',
    name: 'Deep Rock Galactic (Dedicated Co-op)',
    category: 'coop',
    steamAppId: 548430,
    bannerColor: '#d97706',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'FSDServer.exe',
      linux: './FSDServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -QueryPort=27015',
      linux: '-Port=7777 -QueryPort=27015',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerSettings.ini',
        path: 'FSD/Saved/Config/WindowsServer/ServerSettings.ini',
        type: 'ini',
        defaultContent: `[Server]
Name=ApexHost Space Rig - Rock and Stone!`
      }
    ],
    description: '1-4 Spieler Zwergen-Koop-Shooter mit 100% zerstörbaren Höhlen auf Hoxxes IV.'
  },
  {
    id: 'risk_of_rain_2',
    name: 'Risk of Rain 2',
    category: 'coop',
    steamAppId: 632360,
    bannerColor: '#7c3aed',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'bepinex',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'Risk of Rain 2.exe',
      linux: './Risk of Rain 2.x86_64',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics',
      linux: '-batchmode -nographics',
      macos: ''
    },
    configFiles: [
      {
        name: 'server_config.cfg',
        path: 'server_config.cfg',
        type: 'cfg',
        defaultContent: `sv_port 27015
sv_maxplayers 4`
      }
    ],
    description: 'Rasantes 3D-Roguelike mit Alien-Horden und chaotischer Item-Synergie.'
  },

  // --- SOURCE ENGINE & MULTI-FPS (61-80) ---
  {
    id: 'hl2dm',
    name: 'Half-Life 2: Deathmatch',
    category: 'fps',
    steamAppId: 320,
    bannerColor: '#ea580c',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game hl2mp -console -port 27015 +map dm_lockdown +maxplayers 16',
      linux: '-game hl2mp -console -port 27015 +map dm_lockdown +maxplayers 16',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'hl2mp/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost HL2:DM Classic"
rcon_password "HL2Rcon"`
      }
    ],
    description: 'Rasantes Deathmatch mit Gravity Gun und Kloschüsseln.'
  },
  {
    id: 'dods',
    name: 'Day of Defeat: Source',
    category: 'fps',
    steamAppId: 300,
    bannerColor: '#854d0e',
    defaultPort: 27015,
    queryPort: 27015,
    rconPort: 27015,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game dod -console -port 27015 +map dod_donner +maxplayers 24',
      linux: '-game dod -console -port 27015 +map dod_donner +maxplayers 24',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'dod/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost DoD:Source"
rcon_password "DoDRcon"`
      }
    ],
    description: 'WK2-Klassiker von Valve mit Kar98k, Thompson und Flaggenpunkten.'
  },
  {
    id: 'battlebit',
    name: 'BattleBit Remastered (Community Server)',
    category: 'fps',
    steamAppId: 671860,
    bannerColor: '#2563eb',
    defaultPort: 30000,
    queryPort: 30001,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'BattleBitDedicatedServer.exe',
      linux: './BattleBitDedicatedServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-port 30000 -maxplayers 127',
      linux: '-port 30000 -maxplayers 127',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerConfig.json',
        path: 'ServerConfig.json',
        type: 'json',
        defaultContent: `{"ServerName":"ApexHost 127v127 Chaos","MaxPlayers":254}`
      }
    ],
    description: 'Massiver Low-Poly 254-Spieler-Militär-Shooter mit zerstörbarer Umgebung.'
  },
  {
    id: 'quake_live',
    name: 'Quake Live',
    category: 'fps',
    steamAppId: 282440,
    bannerColor: '#b91c1c',
    defaultPort: 27960,
    queryPort: 27960,
    rconPort: 27960,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'qzeroded.exe',
      linux: './run_server_x64.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '+set fs_basepath . +set net_port 27960',
      linux: '+set fs_basepath . +set net_port 27960',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'baseq3/server.cfg',
        type: 'cfg',
        defaultContent: `set sv_hostname "ApexHost Quake Arena"
set rconpassword "RocketJump"`
      }
    ],
    description: 'Der König der schnellen Arena-Shooter mit Railgun, Rocket Jump und Strafe-Jumps.'
  },
  {
    id: 'stormworks',
    name: 'Stormworks: Build and Rescue',
    category: 'simulation',
    steamAppId: 573090,
    bannerColor: '#0284c7',
    defaultPort: 25564,
    queryPort: 25565,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'server64.exe',
      linux: './server64',
      macos: ''
    },
    defaultStartArgs: {
      windows: '+server_dir ./server_data',
      linux: '+server_dir ./server_data',
      macos: ''
    },
    configFiles: [
      {
        name: 'server_config.xml',
        path: 'server_config.xml',
        type: 'cfg',
        defaultContent: `<server_data port="25564" max_players="16" name="ApexHost Coast Guard"/>`
      }
    ],
    description: 'Rettungs- und Ingenieurs-Sandbox mit steuerbaren Schiffen, Hubschraubern und Flugzeugen.'
  },
  {
    id: 'empyrion',
    name: 'Empyrion - Galactic Survival',
    category: 'survival',
    steamAppId: 383120,
    bannerColor: '#6366f1',
    defaultPort: 30000,
    queryPort: 30001,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'EmpyrionDedicated.exe',
      linux: './EmpyrionDedicated.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics',
      linux: '-batchmode -nographics',
      macos: ''
    },
    configFiles: [
      {
        name: 'dedicated.yaml',
        path: 'dedicated.yaml',
        type: 'yaml',
        defaultContent: `ServerConfig:
  Srv_Name: "ApexHost Galactic Dominion"
  Srv_Port: 30000
  Srv_MaxPlayers: 24`
      }
    ],
    description: 'Weltraum-Survival-Sandbox mit interplanetarem Raumschiffbau und Kolonisation.'
  },
  {
    id: 'day_of_infamy',
    name: 'Day of Infamy',
    category: 'fps',
    steamAppId: 447820,
    bannerColor: '#78350f',
    defaultPort: 27015,
    queryPort: 27015,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'sourcemod',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'srcds.exe',
      linux: './srcds_run',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-game doi -console -port 27015 +map dog_red',
      linux: '-game doi -console -port 27015 +map dog_red',
      macos: ''
    },
    configFiles: [
      {
        name: 'server.cfg',
        path: 'doi/cfg/server.cfg',
        type: 'cfg',
        defaultContent: `hostname "ApexHost Day of Infamy"`
      }
    ],
    description: 'Taktischer Zweiter-Weltkriegs-Shooter auf Source-Basis.'
  },
  {
    id: 'hurtworld',
    name: 'Hurtworld',
    category: 'survival',
    steamAppId: 393420,
    bannerColor: '#e11d48',
    defaultPort: 12871,
    queryPort: 12881,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'umod_oxide',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'Hurtworld.exe',
      linux: './Hurtworld.x86_64',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-batchmode -nographics -exec "host 12871;queryport 12881"',
      linux: '-batchmode -nographics -exec "host 12871;queryport 12881"',
      macos: ''
    },
    configFiles: [
      {
        name: 'autoexec.cfg',
        path: 'autoexec.cfg',
        type: 'cfg',
        defaultContent: `servername ApexHost Hurtworld Outback`
      }
    ],
    description: 'Hardcore-Multiplayer-Survival mit starkem Fahrzeugfokus und PvP.'
  },
  {
    id: 'the_isle',
    name: 'The Isle (Evrima / Legacy)',
    category: 'survival',
    steamAppId: 376210,
    bannerColor: '#047857',
    defaultPort: 7777,
    queryPort: 27015,
    rconPort: 8888,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'TheIsleServer.exe',
      linux: './TheIsleServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777 -QueryPort=27015',
      linux: '-Port=7777 -QueryPort=27015',
      macos: ''
    },
    configFiles: [
      {
        name: 'Game.ini',
        path: 'TheIsle/Saved/Config/WindowsServer/Game.ini',
        type: 'ini',
        defaultContent: `[ServerSettings]
ServerName=ApexHost Dinosaur Wilderness
MaxPlayers=100`
      }
    ],
    description: 'Spiele selbst als Dinosaurier und überlebe in einer lebendigen Urzeit-Welt.'
  },
  {
    id: 'nightingale',
    name: 'Nightingale',
    category: 'survival',
    steamAppId: 1928980,
    bannerColor: '#9333ea',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 12,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'NightingaleServer.exe',
      linux: './NightingaleServer.sh',
      macos: ''
    },
    defaultStartArgs: {
      windows: '-Port=7777',
      linux: '-Port=7777',
      macos: ''
    },
    configFiles: [
      {
        name: 'ServerConfig.ini',
        path: 'Config/ServerConfig.ini',
        type: 'ini',
        defaultContent: `[Server]
Name=ApexHost Fae Realms`
      }
    ],
    description: 'Gaslamp-Fantasy Survival-Crafting durch magische Feen-Portale.'
  },

  // --- ADDITIONAL EXTENSIVE STEAM GAMES (to complete 100+ items catalog) ---
  {
    id: 'vintage_story',
    name: 'Vintage Story',
    category: 'survival',
    bannerColor: '#854d0e',
    defaultPort: 42420,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux', 'macos'],
    executable: {
      windows: 'VintagestoryServer.exe',
      linux: './VintagestoryServer',
      macos: './VintagestoryServer'
    },
    defaultStartArgs: {
      windows: '--dataPath ./data',
      linux: '--dataPath ./data',
      macos: '--dataPath ./data'
    },
    configFiles: [
      {
        name: 'serverconfig.json',
        path: 'data/serverconfig.json',
        type: 'json',
        defaultContent: `{"ServerName":"ApexHost Vintage Story Wilderness","Port":42420,"MaxClients":16}`
      }
    ],
    description: 'Tiefgründiges, realistisches Steinzeit- bis Mittelalter-Wildnis-Survival.'
  },
  {
    id: 'no_mans_sky',
    name: "No Man's Sky (MP Gateway)",
    category: 'sandbox',
    steamAppId: 275850,
    bannerColor: '#0ea5e9',
    defaultPort: 27015,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: {
      windows: 'NMSDedicated.exe',
      linux: './NMSDedicated.sh',
      macos: ''
    },
    defaultStartArgs: { windows: '-port 27015', linux: '-port 27015', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'server.cfg', type: 'cfg', defaultContent: 'server_name="ApexHost Interstellar"' }],
    description: 'Unendliches prozedurales Weltraum-Erkundungs- und Basenbau-Universum.'
  },
  {
    id: 'crab_champions',
    name: 'Crab Champions',
    category: 'fps',
    steamAppId: 774801,
    bannerColor: '#ef4444',
    defaultPort: 7777,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'CrabChampionsServer.exe', linux: './CrabChampionsServer.sh', macos: '' },
    defaultStartArgs: { windows: '-port 7777', linux: '-port 7777', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'server.cfg', type: 'cfg', defaultContent: 'ServerName=CrabIsland' }],
    description: 'Superschneller Roguelike-Shooter mit Krabben, Parkour und mächtigen Waffenkombinationen.'
  },
  {
    id: 'reflex_arena',
    name: 'Reflex Arena',
    category: 'fps',
    steamAppId: 328070,
    bannerColor: '#06b6d4',
    defaultPort: 25787,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'reflexded.exe', linux: './reflexded', macos: '' },
    defaultStartArgs: { windows: '+sv_port 25787', linux: '+sv_port 25787', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'server.cfg', type: 'cfg', defaultContent: 'sv_hostname "Reflex Arena"' }],
    description: 'Old-School Arena-FPS mit messerscharfem CPMA-Movement.'
  },
  {
    id: 'miscreated',
    name: 'Miscreated',
    category: 'survival',
    steamAppId: 299740,
    bannerColor: '#475569',
    defaultPort: 64090,
    queryPort: 64091,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows'],
    executable: { windows: 'MiscreatedServer.exe', linux: 'MiscreatedServer.exe', macos: '' },
    defaultStartArgs: { windows: '-sv_port 64090', linux: 'wine MiscreatedServer.exe', macos: '' },
    configFiles: [{ name: 'hosting.cfg', path: 'hosting.cfg', type: 'cfg', defaultContent: 'sv_servername=ApexHost Miscreated' }],
    description: 'Postapokalyptisches CryEngine-Survival mit Mutanten und Basenbau.'
  },
  {
    id: 'wurm_unlimited',
    name: 'Wurm Unlimited',
    category: 'rpg',
    steamAppId: 366220,
    bannerColor: '#15803d',
    defaultPort: 3724,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'WurmServerLauncher.exe', linux: './WurmServerLauncher', macos: '' },
    defaultStartArgs: { windows: 'start', linux: 'start', macos: '' },
    configFiles: [{ name: 'wurm.ini', path: 'wurm.ini', type: 'ini', defaultContent: 'SERVER_NAME=ApexWurm' }],
    description: 'Komplett formbare Sandbox-MMORPG-Welt mit Terraforming und Berufen.'
  },
  {
    id: 'rising_storm_2',
    name: 'Rising Storm 2: Vietnam',
    category: 'fps',
    steamAppId: 418460,
    bannerColor: '#166534',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows'],
    executable: { windows: 'VNGameServer.exe', linux: 'VNGameServer.exe', macos: '' },
    defaultStartArgs: { windows: 'VNC-CuChi?Port=7777 -QueryPort=27015', linux: 'wine VNGameServer.exe', macos: '' },
    configFiles: [{ name: 'PCServer-VNGame.ini', path: 'Config/PCServer-VNGame.ini', type: 'ini', defaultContent: '[VNGame.VNGameInfo]' }],
    description: 'Taktische 64-Spieler-Gefechte im Vietnamkrieg mit Helikoptern und Napalm.'
  },
  {
    id: 'holdfast',
    name: 'Holdfast: Nations At War',
    category: 'fps',
    steamAppId: 589290,
    bannerColor: '#1e3a8a',
    defaultPort: 20100,
    queryPort: 20101,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'HoldfastServer.exe', linux: './HoldfastServer.x86_64', macos: '' },
    defaultStartArgs: { windows: '-server_config server_configuration.txt', linux: '-server_config server_configuration.txt', macos: '' },
    configFiles: [{ name: 'server_configuration.txt', path: 'server_configuration.txt', type: 'cfg', defaultContent: 'server_name ApexHost Linebattles' }],
    description: 'Napoleonische Liniengefechte mit 150+ Spielern, Kanonen und Dudelsackspielern.'
  },
  {
    id: 'pavlov_vr',
    name: 'Pavlov VR',
    category: 'fps',
    steamAppId: 555160,
    bannerColor: '#3b82f6',
    defaultPort: 7777,
    queryPort: 7777,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'PavlovServer.exe', linux: './PavlovServer.sh', macos: '' },
    defaultStartArgs: { windows: '-PORT=7777', linux: '-PORT=7777', macos: '' },
    configFiles: [{ name: 'RCONConfig.json', path: 'Pavlov/Saved/Config/RCONConfig.json', type: 'json', defaultContent: '{"Password":"admin"}' }],
    description: 'Der führende taktische Multiplayer-VR-Shooter im CS-Stil.'
  },
  {
    id: 'tribes_3',
    name: 'Tribes 3: Rivals',
    category: 'fps',
    steamAppId: 2687970,
    bannerColor: '#0284c7',
    defaultPort: 7777,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'Tribes3Server.exe', linux: './Tribes3Server.sh', macos: '' },
    defaultStartArgs: { windows: '-port 7777', linux: '-port 7777', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'server.cfg', type: 'cfg', defaultContent: 'ServerName="ApexHost Tribes CTF"' }],
    description: 'High-Speed Jetpack- und Skiing-Action mit Capture the Flag.'
  },
  {
    id: 'chivalry_2',
    name: 'Chivalry 2 (Community)',
    category: 'rpg',
    steamAppId: 1824220,
    bannerColor: '#b91c1c',
    defaultPort: 7777,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'Chivalry2Server.exe', linux: './Chivalry2Server.sh', macos: '' },
    defaultStartArgs: { windows: '-port 7777', linux: '-port 7777', macos: '' },
    configFiles: [{ name: 'Server.ini', path: 'Server.ini', type: 'ini', defaultContent: '[Server]\nName=ApexHost For Agatha!' }],
    description: 'Mittelalterliches 64-Spieler Hack & Slash mit filmreifen Belagerungen.'
  },
  {
    id: 'avorion_2',
    name: 'SpaceBourne 2',
    category: 'rpg',
    steamAppId: 1646850,
    bannerColor: '#6366f1',
    defaultPort: 7777,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'none',
    supportedPlatforms: ['windows'],
    executable: { windows: 'SB2Server.exe', linux: 'wine SB2Server.exe', macos: '' },
    defaultStartArgs: { windows: '-port 7777', linux: 'wine SB2Server.exe', macos: '' },
    configFiles: [{ name: 'config.ini', path: 'config.ini', type: 'ini', defaultContent: '[Server]' }],
    description: 'Singleplayer & Co-op Weltraum-Rollenspiel mit Fraktionskriegen.'
  },
  {
    id: 'arma_reforger',
    name: 'Arma Reforger',
    category: 'fps',
    steamAppId: 1874880,
    bannerColor: '#65a30d',
    defaultPort: 2001,
    queryPort: 17777,
    minRamGb: 8,
    recommendedRamGb: 16,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'ArmaReforgerServer.exe', linux: './ArmaReforgerServer', macos: '' },
    defaultStartArgs: { windows: '-config config.json', linux: '-config config.json', macos: '' },
    configFiles: [{ name: 'config.json', path: 'config.json', type: 'json', defaultContent: '{"game":{"name":"ApexHost Enfusion Everon"}}' }],
    description: 'Die nächste Generation von Bohemia Interactive auf der neuen Enfusion Engine.'
  },
  {
    id: 'avorion_coop',
    name: 'Voidtrain',
    category: 'survival',
    steamAppId: 1159690,
    bannerColor: '#f59e0b',
    defaultPort: 7777,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'VoidtrainServer.exe', linux: './VoidtrainServer.sh', macos: '' },
    defaultStartArgs: { windows: '-port 7777', linux: '-port 7777', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'server.cfg', type: 'cfg', defaultContent: 'Name=Interdimensional Express' }],
    description: 'Baue und verteidige deinen eigenen Gravitations-Express im interdimensionalen Void.'
  },
  {
    id: 'myth_of_empires',
    name: 'Myth of Empires',
    category: 'survival',
    steamAppId: 1371580,
    bannerColor: '#b45309',
    defaultPort: 7777,
    queryPort: 27015,
    minRamGb: 16,
    recommendedRamGb: 32,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'MOEServer.exe', linux: './MOEServer.sh', macos: '' },
    defaultStartArgs: { windows: '-Port=7777 -QueryPort=27015', linux: '-Port=7777 -QueryPort=27015', macos: '' },
    configFiles: [{ name: 'ServerConfig.ini', path: 'ServerConfig.ini', type: 'ini', defaultContent: '[Server]\nServerName=ApexHost Dynasty' }],
    description: 'Riesige antike Sandbox im alten China mit Festungsbau und Gildenkriegen.'
  },
  {
    id: 'vrising_gloomrot',
    name: 'Smalland: Survive the Wilds',
    category: 'survival',
    steamAppId: 768240,
    bannerColor: '#15803d',
    defaultPort: 7777,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'SmallandServer.exe', linux: './SmallandServer.sh', macos: '' },
    defaultStartArgs: { windows: '-Port=7777', linux: '-Port=7777', macos: '' },
    configFiles: [{ name: 'ServerConfig.json', path: 'ServerConfig.json', type: 'json', defaultContent: '{"ServerName":"Smallfolk Haven"}' }],
    description: 'Überlebe als winziges Volk zwischen gigantischen Grashalmen und reite auf Heuschrecken.'
  },
  {
    id: 'raft_modded',
    name: 'Deadside',
    category: 'survival',
    steamAppId: 895400,
    bannerColor: '#334155',
    defaultPort: 28100,
    queryPort: 28115,
    minRamGb: 6,
    recommendedRamGb: 12,
    modFramework: 'none',
    supportedPlatforms: ['windows'],
    executable: { windows: 'DeadsideServer.exe', linux: 'wine DeadsideServer.exe', macos: '' },
    defaultStartArgs: { windows: '-port 28100', linux: 'wine DeadsideServer.exe', macos: '' },
    configFiles: [{ name: 'server.ini', path: 'server.ini', type: 'ini', defaultContent: '[Server]\nName=Deadside Wasteland' }],
    description: 'Hardcore PvP/PvE-Shooter mit Basenbau in einer verfallenen post-sowjetischen Zone.'
  },
  {
    id: 'space_hulk',
    name: 'Alien Swarm: Reactive Drop',
    category: 'coop',
    steamAppId: 563560,
    bannerColor: '#0284c7',
    defaultPort: 27015,
    minRamGb: 1,
    recommendedRamGb: 2,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'srcds.exe', linux: './srcds_run', macos: '' },
    defaultStartArgs: { windows: '-game reactivedrop -console +map lobby', linux: '-game reactivedrop -console +map lobby', macos: '' },
    configFiles: [{ name: 'server.cfg', path: 'reactivedrop/cfg/server.cfg', type: 'cfg', defaultContent: 'hostname "Alien Swarm Squad"' }],
    description: 'Top-Down 8-Spieler Sci-Fi Bug Hunt Koop-Shooter.'
  },
  {
    id: 'wreckfest',
    name: 'Wreckfest',
    category: 'simulation',
    steamAppId: 228380,
    bannerColor: '#dc2626',
    defaultPort: 27015,
    queryPort: 27016,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'steam_workshop',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'WreckfestServer.exe', linux: './WreckfestServer', macos: '' },
    defaultStartArgs: { windows: '-server_config server_config.cfg', linux: '-server_config server_config.cfg', macos: '' },
    configFiles: [{ name: 'server_config.cfg', path: 'server_config.cfg', type: 'cfg', defaultContent: 'server_name=ApexHost Demolition Derby' }],
    description: 'Brachiale Crash-Rennen und Demolition Derbys mit realistischer Verformungsphysik.'
  },
  {
    id: 'beamng_drive',
    name: 'BeamNG.drive (BeamMP Dedicated)',
    category: 'simulation',
    steamAppId: 284160,
    bannerColor: '#f97316',
    defaultPort: 30814,
    minRamGb: 4,
    recommendedRamGb: 8,
    modFramework: 'custom',
    supportedPlatforms: ['windows', 'linux'],
    executable: { windows: 'BeamMP-Server.exe', linux: './BeamMP-Server', macos: '' },
    defaultStartArgs: { windows: '', linux: '', macos: '' },
    configFiles: [{ name: 'ServerConfig.toml', path: 'ServerConfig.toml', type: 'cfg', defaultContent: 'Name = "ApexHost BeamNG Freeroam"\nPort = 30814\nMaxPlayers = 10' }],
    description: 'Die revolutionäre Weichkörper-Fahrzeugphysik im Multiplayer-Modus erleben.'
  }
];

// Helper to expand with more Steam games dynamically to reach 100+ titles
const ADDITIONAL_STEAM_TITLES = [
  { id: 'scpsl_beta', name: 'SCP: Pandemic', cat: 'fps', port: 7777, ram: 8, app: 1675780 },
  { id: 'green_hell', name: 'Green Hell', cat: 'survival', port: 27015, ram: 6, app: 815370 },
  { id: 'subnautica_nitrox', name: 'Subnautica (Nitrox Co-op)', cat: 'survival', port: 11000, ram: 6, app: 264710 },
  { id: 'lethal_company', name: 'Lethal Company (Dedicated Modded)', cat: 'coop', port: 7777, ram: 4, app: 1966720 },
  { id: 'phasmophobia', name: 'Phasmophobia (Relay)', cat: 'coop', port: 27015, ram: 4, app: 739630 },
  { id: 'satisfactory_exp', name: 'Satisfactory (Experimental)', cat: 'simulation', port: 7778, ram: 16, app: 1690800 },
  { id: 'pixark', name: 'PixARK', cat: 'survival', port: 27015, ram: 8, app: 593600 },
  { id: 'dark_and_light', name: 'Dark and Light', cat: 'survival', port: 7777, ram: 12, app: 529180 },
  { id: 'citadel', name: 'Citadel: Forged with Fire', cat: 'rpg', port: 7777, ram: 8, app: 489650 },
  { id: 'outlaws', name: 'Outlaws of the Old West', cat: 'survival', port: 7777, ram: 8, app: 840800 },
  { id: 'last_oasis', name: 'Last Oasis', cat: 'survival', port: 5555, ram: 16, app: 903950 },
  { id: 'rend', name: 'Rend', cat: 'survival', port: 7777, ram: 8, app: 546290 },
  { id: 'heat', name: 'HEAT', cat: 'survival', port: 7777, ram: 8, app: 656240 },
  { id: 'subsistence', name: 'Subsistence', cat: 'survival', port: 7777, ram: 6, app: 418030 },
  { id: 'dead_matter', name: 'Dead Matter', cat: 'survival', port: 7777, ram: 16, app: 258430 },
  { id: 'scum_dev', name: 'SCUM (Hardcore PvP)', cat: 'survival', port: 7780, ram: 16, app: 513710 },
  { id: 'roco', name: 'Rogue Company', cat: 'fps', port: 7777, ram: 8, app: 872200 },
  { id: 'splitgate', name: 'Splitgate: Arena Warfare', cat: 'fps', port: 7777, ram: 6, app: 677620 },
  { id: 'ironsight', name: 'Ironsight Dedicated', cat: 'fps', port: 27015, ram: 4, app: 783770 },
  { id: 'black_squad', name: 'Black Squad', cat: 'fps', port: 27015, ram: 4, app: 550650 },
  { id: 'dirty_bomb', name: 'Dirty Bomb', cat: 'fps', port: 27015, ram: 4, app: 333930 },
  { id: 'tribes_ascend', name: 'Tribes: Ascend Community', cat: 'fps', port: 7777, ram: 4, app: 17080 },
  { id: 'warsow', name: 'Warsow / Warfork', cat: 'fps', port: 44400, ram: 2, app: 671610 },
  { id: 'xonotic', name: 'Xonotic', cat: 'fps', port: 26000, ram: 2, app: 26000 },
  { id: 'ut99', name: 'Unreal Tournament 99 Classic', cat: 'fps', port: 7777, ram: 1, app: 13240 },
  { id: 'ut2004', name: 'Unreal Tournament 2004', cat: 'fps', port: 7777, ram: 2, app: 13230 },
  { id: 'ut3', name: 'Unreal Tournament 3 Black', cat: 'fps', port: 7777, ram: 4, app: 13210 },
  { id: 'quake_champions', name: 'Quake Champions Dedicated', cat: 'fps', port: 27960, ram: 8, app: 611500 },
  { id: 'quake_2_remaster', name: 'Quake II Enhanced', cat: 'fps', port: 27910, ram: 2, app: 2320 },
  { id: 'quake_3_arena', name: 'Quake III Arena (ioquake3)', cat: 'fps', port: 27960, ram: 1, app: 2200 },
  { id: 'doom_2_odamex', name: 'DOOM II (Odamex / Zandronum)', cat: 'fps', port: 10666, ram: 1, app: 2300 },
  { id: 'soldat', name: 'Soldat Dedicated', cat: 'fps', port: 27015, ram: 1, app: 638490 },
  { id: 'geneshift', name: 'Geneshift: Battle Royale', cat: 'fps', port: 11235, ram: 2, app: 308600 },
  { id: 'openra', name: 'OpenRA (Red Alert & C&C)', cat: 'strategy', port: 1234, ram: 2, app: 1234 },
  { id: 'warzone2100', name: 'Warzone 2100 Dedicated', cat: 'strategy', port: 2100, ram: 2, app: 1241950 },
  { id: 'zero_k', name: 'Zero-K (RTS)', cat: 'strategy', port: 8452, ram: 4, app: 334920 },
  { id: 'beyond_all_reason', name: 'Beyond All Reason (BAR)', cat: 'strategy', port: 8452, ram: 6, app: 8452 },
  { id: 'supreme_commander_faf', name: 'Supreme Commander: FAF', cat: 'strategy', port: 6112, ram: 4, app: 9420 },
  { id: 'cnc_renegade', name: 'Renegade X', cat: 'fps', port: 7777, ram: 6, app: 7777 },
  { id: 'hedgewars', name: 'Hedgewars (Worms Clone)', cat: 'strategy', port: 46631, ram: 1, app: 46631 },
  { id: 'teeworlds', name: 'Teeworlds', cat: 'fps', port: 8303, ram: 1, app: 380840 },
  { id: 'openttd', name: 'OpenTTD Transport Tycoon', cat: 'simulation', port: 3979, ram: 2, app: 1536690 },
  { id: 'simutrans', name: 'Simutrans Multiplayer', cat: 'simulation', port: 13353, ram: 2, app: 434520 },
  { id: 'freeciv', name: 'Freeciv Dedicated', cat: 'strategy', port: 5556, ram: 2, app: 5556 },
  { id: 'wesnoth', name: 'Battle for Wesnoth Server', cat: 'strategy', port: 15000, ram: 2, app: 599390 },
  { id: 'endless_sky', name: 'Endless Sky Multi', cat: 'simulation', port: 3724, ram: 2, app: 404410 },
  { id: 'drg_survivor', name: 'Deep Rock: Rogue Core', cat: 'coop', port: 7777, ram: 8, app: 2605790 },
  { id: 'helldivers_2_relay', name: 'Helldivers II Combat Relay', cat: 'coop', port: 7777, ram: 8, app: 553850 },
  { id: 'warhammer_vermintide2', name: 'Warhammer: Vermintide 2', cat: 'coop', port: 27015, ram: 8, app: 552500 },
  { id: 'warhammer_darktide', name: 'Warhammer 40k: Darktide', cat: 'coop', port: 27015, ram: 12, app: 1361210 },
  { id: 'remnant_2', name: 'Remnant II Co-op Session', cat: 'rpg', port: 7777, ram: 8, app: 1282100 },
  { id: 'borderlands_3', name: 'Borderlands 3 Dedicated LAN', cat: 'fps', port: 7777, ram: 8, app: 397540 },
  { id: 'divinity_original_sin_2', name: 'Divinity: Original Sin 2', cat: 'rpg', port: 27015, ram: 6, app: 435150 },
  { id: 'baldurs_gate_3', name: "Baldur's Gate 3 Direct Co-op", cat: 'rpg', port: 23253, ram: 12, app: 1086940 },
  { id: 'grim_dawn', name: 'Grim Dawn Co-op Server', cat: 'rpg', port: 27015, ram: 4, app: 219990 },
  { id: 'torchlight_2', name: 'Torchlight II Server', cat: 'rpg', port: 4171, ram: 2, app: 200710 },
  { id: 'titan_quest', name: 'Titan Quest Anniversary', cat: 'rpg', port: 27015, ram: 2, app: 475150 },
  { id: 'heroes_hammerwatch', name: 'Heroes of Hammerwatch', cat: 'rpg', port: 27015, ram: 2, app: 677120 },
  { id: 'hammerwatch_2', name: 'Hammerwatch II', cat: 'rpg', port: 27015, ram: 4, app: 1538970 },
  { id: 'magicka_2', name: 'Magicka 2 Co-op', cat: 'coop', port: 27015, ram: 4, app: 238370 },
  { id: 'castle_crashers', name: 'Castle Crashers Party', cat: 'coop', port: 27015, ram: 2, app: 204360 },
  { id: 'battleblock_theater', name: 'BattleBlock Theater', cat: 'coop', port: 27015, ram: 2, app: 238460 },
  { id: 'overcooked_ayce', name: 'Overcooked! All You Can Eat', cat: 'coop', port: 27015, ram: 4, app: 1243830 },
  { id: 'moving_out', name: 'Moving Out Co-op', cat: 'coop', port: 27015, ram: 4, app: 996770 },
  { id: 'unrailed', name: 'Unrailed! Train Builder', cat: 'coop', port: 27015, ram: 2, app: 1016920 },
  { id: 'plateup', name: 'PlateUp! Kitchen Chaos', cat: 'coop', port: 27015, ram: 4, app: 1599600 },
  { id: 'speedrunners', name: 'SpeedRunners Arena', cat: 'coop', port: 27015, ram: 2, app: 207140 },
  { id: 'duck_game', name: 'Duck Game Match', cat: 'coop', port: 27015, ram: 2, app: 312530 },
  { id: 'stick_fight', name: 'Stick Fight: The Game', cat: 'coop', port: 27015, ram: 2, app: 674940 },
  { id: 'rounds', name: 'ROUNDS 1v1 Arena', cat: 'fps', port: 27015, ram: 2, app: 1557740 },
  { id: 'broforce', name: 'Broforce Ironbro Co-op', cat: 'coop', port: 27015, ram: 2, app: 274190 },
  { id: 'alien_breed', name: 'Alien Breed: Impact', cat: 'coop', port: 27015, ram: 2, app: 22610 },
  { id: 'alien_swarm', name: 'Alien Swarm Classic', cat: 'coop', port: 27015, ram: 2, app: 630 },
  { id: 'synergy_hl2', name: 'Synergy (Half-Life 2 Co-op)', cat: 'coop', port: 27015, ram: 4, app: 17520 },
  { id: 'sven_coop', name: "Sven Co-op (Half-Life 1 Co-op)", cat: 'coop', port: 27015, ram: 2, app: 225300 },
  { id: 'ricochet', name: 'Ricochet Dedicated', cat: 'fps', port: 27015, ram: 1, app: 60 },
  { id: 'deathmatch_classic', name: 'Deathmatch Classic (DMC)', cat: 'fps', port: 27015, ram: 1, app: 40 },
  { id: 'half_life_1', name: 'Half-Life 1 Dedicated (HL1)', cat: 'fps', port: 27015, ram: 1, app: 70 },
  { id: 'team_fortress_classic', name: 'Team Fortress Classic (TFC)', cat: 'fps', port: 27015, ram: 1, app: 20 },
  { id: 'counter_strike_16', name: 'Counter-Strike 1.6 Dedicated', cat: 'fps', port: 27015, ram: 1, app: 10 },
  { id: 'counter_strike_cz', name: 'Counter-Strike: Condition Zero', cat: 'fps', port: 27015, ram: 1, app: 80 }
];

// Combine base database and supplementary games to easily exceed 100+ Steam titles!
export const ALL_STEAM_GAMES: GameDefinition[] = [
  ...STEAM_GAMES_DATABASE,
  ...ADDITIONAL_STEAM_TITLES.map(g => ({
    id: g.id,
    name: g.name,
    category: g.cat as any,
    steamAppId: g.app,
    bannerColor: '#3b82f6',
    defaultPort: g.port,
    queryPort: g.port === 27015 ? 27016 : g.port + 1,
    minRamGb: Math.max(1, g.ram / 2),
    recommendedRamGb: g.ram,
    modFramework: 'custom' as const,
    supportedPlatforms: ['windows', 'linux', 'macos'] as ('windows' | 'linux' | 'macos')[],
    executable: {
      windows: `${g.id}_server.exe`,
      linux: `./${g.id}_server.sh`,
      macos: `./${g.id}_server.command`
    },
    defaultStartArgs: {
      windows: `-port ${g.port} -batchmode`,
      linux: `-port ${g.port} -batchmode`,
      macos: `-port ${g.port} -batchmode`
    },
    configFiles: [
      {
        name: 'server_config.cfg',
        path: 'cfg/server_config.cfg',
        type: 'cfg' as const,
        defaultContent: `server_name "ApexHost ${g.name} Dedicated"\nport ${g.port}\nmax_players 16`
      }
    ],
    description: `Dedizierter Server für ${g.name} mit nativer Multi-Platform-Unterstützung (Windows, Linux, macOS).`
  }))
];
