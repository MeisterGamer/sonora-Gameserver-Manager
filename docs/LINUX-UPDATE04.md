# Linux Update 04 — installation in the existing directory

2026-10-11, 15:29:14 CEST (Europe/Berlin).

These instructions replace Update 03's /opt release layout. Nothing has been remotely installed by the source-code repair.

From the existing checkout:

```bash
cd /root/sonora-Gameserver-Manager
git pull --ff-only
sudo bash install.sh
```

Save/review any local Git changes if `git pull` refuses; do not force-reset the checkout. The installer uses the files in this directory and leaves the manager stopped. Stop game instances before upgrading.

Local layout:

```text
sonora-Gameserver-Manager/
  server.ts, src/, backend/, dist/, node_modules/
  start-manager.sh
  sonora-manager.service
  .env
  .runtime/                 Node, npm cache, pnpm store and JDKs
    jdks/jdk-7/ ... jdk-26/ JDKs installed on demand
  data/servers/             actual game instance directories
  data/manager/             registry, authentication and process state
  data/steamcmd/
  backups/install-*/        previous service units and disabled overrides
```

The installer provisions full JDK 25. Other JDKs are installed when selected in an instance's JDK dialog or on its next start. The provider's live GA metadata is checked; no fallback to another major. Java and javac must both report the selected major. Minecraft 26.2/26.3 selects at least JDK 25; selecting 26 does not force another Minecraft version.

Previously configured data is copied only into an empty local `data` directory. Existing local data is not merged or overwritten. Previous copies under /opt remain untouched. Existing local `.env` takes priority; otherwise the previous deployment's `.env` is copied. If both old and local datasets exist, inspect them before choosing an authoritative registry; the installer prints which data it retained. Browser-only instances from the original prototype have no automatic registry migration.

The local service template is registered with systemd under `/etc/systemd/system/sonora-manager.service`; this OS registration is the only application configuration outside the project. The service runs as the installation-directory owner, with the local launcher and local Node. On a checkout owned by root in /root, that owner is root. Previous service overrides are preserved in the local backup and disabled to prevent stale /opt/nvm paths from winning.

After successful installation, explicitly start **one** manager:

```bash
sudo systemctl start sonora-manager
sudo systemctl show sonora-manager -p User -p WorkingDirectory -p ExecStart
curl --fail http://127.0.0.1:3000/api/health
```

Expected health: version `0.1.2`, update `04`. Alternatively run `bash start-manager.sh` in the checkout, with the systemd instance stopped. Do not run both. Reload the browser with Ctrl+F5.

The default listener is loopback. For remote access from your PC:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@65.108.138.243
```

Open `http://127.0.0.1:3000` on the PC. Existing TLS proxy arrangements can remain in use.

Export game `start.sh` into that instance's `data/servers/<id>/` folder. It derives the installation root from its location, uses the actual Paper/Purpur/Vanilla JAR and the selected local JDK. Install the game files and accept the Minecraft EULA first. The script does not download files or modify server.properties; the instance's configured port comes from server.properties. Standalone game systemd units must not run concurrently with the manager's instance process. Native Windows/macOS JDK installation and Docker deployment are not implemented by this Linux installer.

Provider: [Azul official Metadata API documentation](https://docs.azul.com/core/install/metadata-api).

Validation here was isolated regression testing, TypeScript compilation, production frontend compilation and Bash syntax parsing. Actual apt/systemd installation and real game execution on the remote Ubuntu host still require verification.
