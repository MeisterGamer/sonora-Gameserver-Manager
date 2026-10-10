# ApexHost — Gameserver Manager & Prepaid CRM 🎮

> **Fortschrittlicher, hochgradig erweiterbarer Multi-Platform Gameserver Manager** für über 100 Steam Games und sämtliche Minecraft-Varianten, inklusive Mod- & Plugin-Browser, rollenbasierter Benutzerverwaltung, Prepaid-Kundenmanagementsystem und flexiblen Admin-Settings.

---

## 📋 Inhaltsverzeichnis

1. [Übersicht & Highlights](#-übersicht--highlights)
2. [Unterstützte Plattformen & Betriebssysteme](#-unterstützte-plattformen--betriebssysteme)
3. [Spiele-Bibliothek](#-spiele-bibliothek)
   - [100+ Steam Games](#100-steam-games)
   - [Minecraft aller Arten & Versionen (bis 26.3)](#minecraft-aller-arten--versionen)
4. [Mod- & Plugin-Browser (Echte APIs)](#-mod---plugin-browser-echte-apis)
5. [Kundenmanagementsystem (CRM) & Prepaid-Billing](#-kundenmanagementsystem-crm--prepaid-billing)
   - [Prepaid-Philosophie & Guthabensystem](#prepaid-philosophie--guthabensystem)
   - [Automatisches Warn- & Ablaufsystem](#automatisches-warn---ablaufsystem)
   - [Zahlungsschnittstellen & Rechnungsstellung](#zahlungsschnittstellen--rechnungsstellung)
   - [Support-Ticket-System](#support-ticket-system)
6. [Benutzer- & Admin-Control (RBAC)](#-benutzer---admin-control-rbac)
7. [Admin Settings & Steam-Offline-Bypass](#-admin-settings--steam-offline-bypass)
8. [Erweiterbarkeit — Neue Spiele & Modloader hinzufügen](#-erweiterbarkeit--neue-spiele-hinzufügen)
9. [Installation & Schnellstart (Node.js 24)](#-installation--schnellstart-nodejs-24)
10. [Konfiguration & Umgebungsvariablen](#-konfiguration--umgebungsvariablen)
11. [Projektstruktur](#-projektstruktur)
12. [Lizenz & Support](#-lizenz--support)

---

## 🌟 Übersicht & Highlights

ApexHost ist als All-in-One-Lösung für Hosting-Provider, Gaming-Communities und Server-Administratoren konzipiert. Die Anwendung kombiniert ein intuitives Frontend mit einer leistungsfähigen Node.js-Backend-Architektur.

- 🚀 **Node.js 24 & Full-Stack Architektur:** Express-Backend mit integriertem Vite-Middleware-Proxying, React 19, TypeScript und Tailwind CSS.
- 🕹️ **100+ Steam Dedicated Server:** Fertig vorkonfiguriert mit SteamCMD-Parametern, Startskripten und Portzuweisungen.
- ⛏️ **Minecraft Komplett-Suite:** Vanilla, Paper, Purpur, Spigot, Forge, Fabric, NeoForge, Bedrock, BungeeCord und Velocity — inklusive moderner Snapshot- & Release-Auswahl bis **Version 26.3**.
- 🔌 **Echte Mod- & Plugin-Suche:** Nahtlose Integration mit **Modrinth**, **CurseForge**, **SpigotMC** und **Steam Workshop** mit dynamischer API-Key-Verwaltung.
- 💳 **100% Prepaid-Finanzsystem:** Keine Schuldenfallen oder Abofallen für Endkunden. Automatisierte Guthabenabbuchung, 7-/3-/1-Tage-Ablaufwarnungen, konfigurierbare Kulanzzeiten (Grace Period) und Auto-Suspend.
- 🛡️ **Steam Offline & Notfall-Modus:** Funktioniert auch dann reibungslos, wenn kein Steam-Account oder keine Steam-Web-API zur Verfügung steht (Offline-Bypass, Anonymous SteamCMD und Emulation).
- 🧩 **Kinderleichte Erweiterbarkeit:** Neue Spiele werden deklarativ in standardisierten TypeScript-Strukturen definiert.

---

## 💻 Unterstützte Plattformen & Betriebssysteme

ApexHost generiert betriebssystemspezifische Start-, Installations- und Wartungsskripte:

| Betriebssystem | Installationsmethode | Startskripte | Besonderheiten |
| :--- | :--- | :--- | :--- |
| **Linux (Ubuntu, Debian, RHEL, Arch)** | SteamCMD, native Binaries, Java 8/11/17/21 | `start.sh`, `systemd`-Units, `screen`/`tmux` | Automatisches Setzen von `chmod +x`, Low-Memory-Optimierungen |
| **Microsoft Windows** | SteamCMD Windows, native `.exe` | `start.bat`, PowerShell-Scripts | Automatisches Handling von Pfad-Backslashes und CMD-Flags |
| **Apple macOS (Apple Silicon / Intel)** | Native Ports, Homebrew, Rosetta 2 | `start_macos.sh`, ZSH-Launcher | Java-Matrix für arm64/x86_64, BSD-kompatible Flags |
| **Docker / Container** | OCI-Images, Pterodactyl-kompatibel | `Dockerfile`, `docker-compose.yml` | Port-Mapping und Volume-Mounts vorkonfiguriert |

Der gewünschte OS-Modus kann direkt in der oberen Navigationsleiste per Dropdown gewechselt werden, wodurch alle generierten Befehle und Pfade in Echtzeit angepasst werden.

---

## 🎮 Spiele-Bibliothek

### 100+ Steam Games

ApexHost enthält vorkonfigurierte Profile für mehr als 100 Steam Dedicated Server, unter anderem:

- **Survival & Sandbox:** Palworld (AppID 2394010), Valheim (896660), Enshrouded (2278520), Rust (258550), ARK: Survival Evolved (376030), ARK: Survival Ascended (2430930), 7 Days to Die (294420), The Forest (556450), Sons of the Forest (2465200), Conan Exiles (443030), V Rising (1829350), Project Zomboid (380870), Terraria (105600), Raft, Starbound, Grounded, Core Keeper, Sunkenland, Nightingale.
- **Shooter & Taktik:** Counter-Strike 2 (730), Team Fortress 2 (232250), Left 4 Dead 2 (222860), DayZ (223350), Squad (403240), Insurgency: Sandstorm (581330), Arma 3 (233780), Arma Reforger, Hell Let Loose, Pavlov VR, Garry's Mod (4020).
- **Simulation, Strategie & Indie:** Satisfactory (1690800), Factorio (427520), Space Engineers (298740), Farming Simulator 22/25, Euro Truck Simulator 2, Assetto Corsa, BeamNG.drive, Unturned, Astroneer.

Jedes Spielprofil enthält:
- Standard-Ports (Game-Port, Query-Port, RCON-Port)
- Minimale und empfohlene RAM-/CPU-Konfiguration
- SteamCMD App-ID und anonymes Download-Flag
- Spezifische Startparameter und Config-Dateipfade

### Minecraft aller Arten & Versionen

ApexHost deckt das gesamte Spektrum des Minecraft-Ökosystems ab:

#### Unterstützte Servertypen (Server Jars):
1. **PaperMC:** Hochoptimierte Server-Software für Spigot/Bukkit-Plugins.
2. **Purpur:** Leistungsstarker Paper-Fork mit erweiterten Gameplay-Konfigurationsmöglichkeiten.
3. **Spigot:** Der klassische Standard für Plugin-Server.
4. **Minecraft Vanilla:** Das offizielle Original von Mojang.
5. **Forge:** Der Traditions-Modloader für umfangreiche Tech- und Magic-Modpacks.
6. **Fabric:** Schlanker, extrem schneller Modloader für moderne Versionen.
7. **NeoForge:** Der moderne Nachfolger für neue Mod-Generationen.
8. **Bedrock Dedicated Server (BDS):** Für Spieler auf Mobilgeräten, Konsolen und Windows 10/11.
9. **BungeeCord / Velocity:** High-Performance Proxies für Server-Netzwerke.

#### Unterstützte Versionen:
- **Aktuellste Versionen & Snapshots:** **Version 26.3**, 1.21.4, 1.21.1, 1.21, 1.20.6, 1.20.4, 1.20.1
- **Klassiker & Modpack-Standards:** 1.19.4, 1.18.2, 1.16.5, 1.12.2, 1.7.10
- Automatische Erkennung und Auswahl der passenden **Java-Laufzeitumgebung** (Java 8, 17 oder 21).

---

## 🔍 Mod- & Plugin-Browser (Echte APIs)

Der integrierte Mod- und Plugin-Browser ermöglicht die direkte Suche nach Erweiterungen ohne manuelle Downloads von Drittanbieterseiten:

### 1. Modrinth API (Nativ & ohne Key)
- Fragt live die offizielle Modrinth REST API (`https://api.modrinth.com/v2/search`) ab.
- Filtert nach Kategorie (Mods vs. Plugins), Minecraft-Version und Loader (Fabric, Forge, NeoForge, Paper, Spigot).
- 1-Klick-Installation mit Versions-Downloadlink und Lizenzinformationen.

### 2. CurseForge Eternal API (Proxy)
- Proxy-Anbindung über `/api/live/curseforge/search`.
- Unterstützt die offizielle **CurseForge Eternal API** (GameID `432` für Minecraft, sowie Steam-Mod-Titel).
- API-Key kann entweder als Umgebungsvariable `CURSEFORGE_API_KEY` oder direkt in den **Admin Settings** ohne Server-Neustart hinterlegt werden.

### 3. SpigotMC / Polymart
- Suche nach Bukkit/Spigot/Paper Plugins (EssentialsX, LuckPerms, Vault, WorldEdit, CoreProtect etc.).
- Vorkonfigurierte, verifizierte Metadaten mit direkten Installationsskripten.

### 4. Steam Workshop Proxy
- Abfrage des Steam Workshop über die Steam Web API (`ISteamRemoteStorage/GetPublishedFileDetails`).
- Suchabfrage über `/api/live/steam/workshop`.
- Automatischer Fallback auf kuratierte Workshop-Items bei fehlendem Steam-Schlüssel.

---

## 💼 Kundenmanagementsystem (CRM) & Prepaid-Billing

Das integrierte Kunden- und Finanzsystem ist speziell für Hosting-Services nach dem **Prepaid-Prinzip** aufgebaut:

### Prepaid-Philosophie & Guthabensystem
- **Kein Post-Paid / Kein Schuldenrisiko:** Server werden ausschließlich aus zuvor aufgeladenem Kundenguthaben bezahlt.
- **Willkommensguthaben (Welcome Bonus):** Neue Benutzer erhalten bei der Registrierung ein Startguthaben (Standard: `5,00 €`, in Admin Settings konfigurierbar).
- **Laufzeitverträge:** Server laufen auf flexibler Laufzeitbasis (z. B. 30 Tage) und verlängern sich automatisch, solange ausreichend Guthaben vorhanden ist.

### Automatisches Warn- & Ablaufsystem
1. **7 Tage vor Ablauf:** Erste Erinnerungsbenachrichtigung im Dashboard.
2. **3 Tage vor Ablauf:** Gelbes Warnbanner mit 1-Klick-Verlängerungsoption (`Quick Renew`).
3. **1 Tag vor Ablauf:** Kritisches rotes Warnbanner und Alarmbenachrichtigung.
4. **Ablaufdatum erreicht (Grace Period):** 
   - Der Server bleibt für eine konfigurierbare Frist (Standard: 3 Tage Kulanz) geschützt.
   - Nach Ablauf der Kulanzfrist schaltet das System den Server automatisch auf `suspended` (Pausiert).
   - Nach weiteren 7 Tagen erfolgt die endgültige Datenbereinigung, um Ressourcen freizugeben.

### Zahlungsschnittstellen & Rechnungsstellung
- Integrierter **Zahlungs-Simulator** für verschiedene Zahlungsanbieter:
  - 💳 **Kreditkarte / Stripe**
  - 🅿️ **PayPal**
  - ⚡ **Sofort / Klarna**
  - 🪙 **Kryptowährungen (Bitcoin, Ethereum, USDT)**
  - 🎫 **Paysafecard**
- Sofortige Gutschrift auf das Kundenkonto.
- Automatische Erstellung ordnungsgemäßer **Rechnungen (Invoices)** inklusive Steuerausweis (konfigurierbarer MwSt.-Satz, Standard 19 %).

### Support-Ticket-System
- Kunden können Support-Tickets zu bestehenden Servern erstellen (Kategorien: Technisch, Abrechnung, Mod-Hilfe, Sonstiges).
- Administratoren können Tickets beantworten, priorisieren und schließen.

---

## 👥 Benutzer- & Admin-Control (RBAC)

ApexHost besitzt eine zweistufige Rechteverwaltung:

### 1. Regulärer Kunde (User)
- Übersicht über eigene Serverinstanzen.
- Server starten, stoppen, neustarten und konfigurieren.
- Nutzung des Mod- & Plugin-Browsers für eigene Server.
- Verwaltung des Prepaid-Guthabens, Rechnungsansicht und Support-Tickets.
- Quick-Renew von ablaufenden Servern.

### 2. Administrator (Root / Superadmin)
- **Gesamtsystem-Monitoring:** Übersicht aller Server aller Benutzer, Ressourcenauslastung (RAM, CPU, Festplatte).
- **Kundenverwaltung:** Benutzerkonten einsehen, sperren (`banned`), entsperren, Rollen zuweisen (User ↔ Admin).
- **Finanz-Intervention:** Manuelle Guthabenanpassungen (+ / - Beträge direkt buchen).
- **Systemweite Einstellungen (Admin Settings):** Globale Parameter zentral steuern.

---

## ⚙️ Admin Settings & Steam-Offline-Bypass

Wenn gerade **kein Steam-Account**, kein Steam Guard oder kein Steam-Web-API-Schlüssel zur Verfügung steht, greift das flexible Betriebsmodus-System in den **Admin Settings**:

| Steam-Modus | Funktionsweise | Wann nutzen? |
| :--- | :--- | :--- |
| **`offline_disabled` (Offline / Bypass)** | Aktiviert `-nosteam`, `-insecure` und `-lan` Startflags. Server werden ohne Validierungszwang gestartet. | **Standardmäßig aktiv!** Ideal, wenn Steam nicht zur Verfügung steht oder Server lokal getestet werden. |
| **`anonymous` (SteamCMD Anonym)** | Führt SteamCMD-Downloads ausschließlich über `login anonymous` aus. | Für alle Spiele, deren Dedicated Server öffentlich ohne Kaufnachweis downloadbar sind. |
| **`mock_emulated` (Emulation)** | Simuliert Serverdateien und Logs für Demonstrations-, Staging- oder Schulungszwecke ohne Plattenplatz. | Entwickler-Modus / Demos. |
| **`authenticated` (Vollständig)** | Nutzt hinterlegte Steam-Credentials und den Steam-Web-API-Key für geschützte Titel. | Produktivbetrieb mit vorhandenem Steam-Konto. |

### Weitere Admin-Konfigurationsoptionen:
- **API-Schlüssel:** Direkte Eingabe von CurseForge-, Steam-, Modrinth- und Spigot-Keys im UI mit Speicherung im lokalen Speicher (kein Server-Neustart nötig).
- **Abrechnungsparameter:** Willkommensbonus in Euro, Kulanzfrist (Tage), Auto-Suspend Toggle, MwSt.-Satz.
- **Ressourcen-Limits:** Standard-RAM-Zuweisung (Standard 6 GB, bis 32 GB), Standard-Minecraft-Version, Port-Bereiche (Start: 25565 / 7777).
- **Wartungsmodus (Maintenance Mode):** Schaltet die Benutzeroberfläche für reguläre Kunden in den Wartungsmodus mit anpassbarer Infomeldung; Admins behalten vollen Zugriff.
- **Discord Webhook:** Optionaler Webhook für Alarmmeldungen bei Server-Abstürzen oder Ablaufwarnungen.

---

## 🧩 Erweiterbarkeit — Neue Spiele hinzufügen

Das System ist so aufgebaut, dass neue Spiele mit minimalem Aufwand hinzugefügt werden können.

### Spieldefinition in `src/data/games.ts` ergänzen:

```typescript
import { GameDefinition } from '../types/game';

export const MEIN_NEUES_SPIEL: GameDefinition = {
  id: 'mein-spiel-server',
  name: 'Mein Tolles Spiel Dedicated Server',
  category: 'survival', // 'minecraft' | 'shooter' | 'survival' | 'strategy' | 'indie'
  steamAppId: 1234560,  // Steam App ID (falls Steam-Spiel)
  defaultPort: 27015,
  queryPort: 27016,
  minRamGb: 4,
  recommendedRamGb: 8,
  description: 'Dedicated Server für Mein Tolles Spiel mit automatischer Update-Funktion.',
  iconUrl: 'https://images.unsplash.com/photo-...',
  configFiles: ['ServerSettings.ini', 'Config/Game.json'],
  launchParameters: {
    windows: 'GameServer.exe -Port={port} -QueryPort={queryPort} -log',
    linux: './GameServer.sh -Port={port} -QueryPort={queryPort} -nosteam',
    macos: './GameServer_mac -Port={port} -QueryPort={queryPort}'
  },
  supportsMods: true,
  modSources: ['steam_workshop', 'local']
};
```

Nach dem Hinzufügen zum Array `GAMES_CATALOG` steht das Spiel sofort im Server-Erstellungsdialog, im Shop und in allen Skript-Generatoren zur Verfügung.

---

## 🚀 Installation & Schnellstart (Node.js 24)

### Voraussetzungen
- **Node.js:** Version 24.x LTS (oder Node.js >= 20.x)
- **Paketmanager:** npm, yarn, pnpm oder bun

### 1. Repository klonen oder herunterladen
```bash
git clone https://github.com/example/gameserver-manager.git
cd gameserver-manager
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Umgebungsvariablen einrichten (Optional)
```bash
cp .env.example .env
```
*(Die API-Keys für CurseForge und Steam können alternativ jederzeit direkt im Admin-Interface eingegeben werden!)*

### 4. Entwicklungsserver starten
```bash
npm run dev
```
Der Server startet standardmäßig auf Port **3000** (`http://localhost:3000`).

### 5. Für Produktion kompilieren und starten
```bash
npm run build
npm start
```

---

## 🔐 Konfiguration & Umgebungsvariablen

Die Konfiguration kann über die `.env`-Datei oder zur Laufzeit im Admin-Panel vorgenommen werden:

| Variable | Beschreibung | Standard | Notwendig? |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP-Port für Backend & Frontend | `3000` | Nein |
| `CURSEFORGE_API_KEY` | API-Key der CurseForge Eternal Console | - | Nein (kann im UI gesetzt werden) |
| `STEAM_API_KEY` | Steam Web API Key für Workshop-Suchen | - | Nein (Offline-Bypass aktiv) |
| `GEMINI_API_KEY` | Optional für KI-gestützte Serverdiagnosen | - | Nein |

---

## 📁 Projektstruktur

```
├── .env.example              # Vorlage für Umgebungsvariablen
├── index.html                # HTML-Einstiegspunkt
├── metadata.json             # Metadaten des AI Studio Applets
├── package.json              # Abhängigkeiten & Scripts (Node.js 24)
├── server.ts                 # Express Backend & API-Proxies (CurseForge, Steam)
├── tsconfig.json             # TypeScript-Konfiguration
├── vite.config.ts            # Vite Build & Tailwind Plugin Setup
│
└── src/
    ├── App.tsx               # Hauptanwendung mit Routing & State-Synchronisation
    ├── main.tsx              # React DOM Einstiegspunkt
    │
    ├── components/           # UI-Komponenten
    │   ├── AdminControlView.tsx      # Admin-Verwaltung, Benutzerkonten & Settings
    │   ├── CreateServerModal.tsx     # Wizard zur Servererstellung (mit Steam-Bypass-Badge)
    │   ├── CRMView.tsx               # Prepaid-Kundenmanagement, Invoices & Tickets
    │   ├── ExpiryWarningBanner.tsx   # Warnbanner für ablaufende Prepaid-Server
    │   ├── LoginModal.tsx            # Authentifizierung & Benutzerwechsel
    │   ├── ModBrowserModal.tsx       # Live-Browser für Modrinth, CurseForge, Spigot
    │   ├── ServerCard.tsx            # Server-Statuskarte (Start, Stop, Logs, Stats)
    │   ├── ServerDetailModal.tsx     # Detaillierte Serversteuerung & Konsole
    │   ├── ShopView.tsx              # Tarif- und Server-Shop
    │   └── TopNav.tsx                # Navigationsleiste mit OS- & Steam-Status-Badge
    │
    ├── data/                 # Datenspeicher & Datenbanken
    │   ├── adminSettingsStore.ts     # Verwaltung & Persistenz der Admin-Settings
    │   ├── authStore.ts              # Benutzerkonten & Rollen (Demo-Profile)
    │   ├── crmStore.ts               # Verträge, Rechnungen, Transaktionen & Tickets
    │   ├── games.ts                  # Katalog mit 100+ Steam-Spielen & Minecraft-Typen
    │   ├── modsAndPlugins.ts         # Kuratierte Offline-Fallback-Erweiterungen
    │   └── serverStore.ts            # Instanzenspeicher der aktiven Server
    │
    ├── services/             # Externe Schnittstellen & Business-Logik
    │   └── liveModService.ts         # Echte REST-Clients für Modrinth, CurseForge & Steam
    │
    └── types/                # TypeScript Schnittstellendefinitionen
        ├── adminSettings.ts          # Settings-Typen & Steam-Modi
        ├── auth.ts                   # Benutzer- und Rollentypen
        ├── crm.ts                    # Verträge, Invoices & Tickets
        └── game.ts                   # GameDefinition, Minecraft-Typen & OS
```

---

## 📄 Lizenz & Support

Dieses Projekt steht unter der **MIT-Lizenz**. Es kann frei für private Communities oder kommerzielle Hosting-Dienste modifiziert und betrieben werden.
