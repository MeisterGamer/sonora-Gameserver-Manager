# Current release

See [Linux Update 04](LINUX-UPDATE04.md) and [English changelog](CHANGELOG-UPDATE04-EN-2026-10-11.md).

# Sonora Gameserver Manager

Local repair release 0.1.2 / Update 04, 2026-10-11.

Update 04 supersedes the earlier /opt deployment instructions. Install in place with `sudo bash install.sh`; the manager stays stopped. Application data, Node, SteamCMD, JDKs and installation backups remain inside this checkout. See [Linux Update 04](LINUX-UPDATE04.md).
Baseline: 63b986a2caa03c54486824c4821c470e80f28bb5.

This release replaces several simulated operations with actual backend operations. It is a local administrator manager, not a completed multi-tenant hosting platform.

## Implemented

- Password-verified administrator login, salted scrypt password storage, HttpOnly/SameSite session cookies, expiration, login throttling and origin checks.
- API protection and instance/file path confinement, including junction/symlink checks.
- Persistent instance registry; process start, stop, real kill and restart; asynchronous spawn error handling and operation locks.
- Backend-authoritative process state and bounded logs. Minecraft readiness uses the Paper startup log; native-game running state means the process exists, not that a game port has been verified.
- Real console stdin commands, filesystem listing/edit/create/delete/download/upload.
- Actual tar.gz backups, SHA-256 verification, download, restore, recovery copies and backup deletion.
- Paper, Purpur and Vanilla installation through their official APIs, provider checksum verification and engine-specific JARs. Experimental Paper/Purpur builds require explicit consent; explicitly selected versions are retained.
- Dedicated Linux SteamCMD installation/public-branch updates for Palworld, Rust, Valheim and Garry's Mod, including executable checks and per-instance ports. Unsupported catalogue adapters are disabled.
- Compatible Modrinth Paper/Spigot/Bukkit plugins: SHA-512 verification, installation, activation/deactivation and removal. Required dependency resolution is not implemented.

## Requirements

Node.js 24+, npm, and tar for backups. pnpm 11.25.0 is invoked through npm exec, so a global pnpm installation is unnecessary. The lockfile is included. pnpm-workspace.yaml uses the hoisted linker because E: is exFAT and does not support directory symlinks.

Paper 1.20/1.21 uses Java 21; Paper 26.1+ requires Java 25. The launcher checks the selected version and rejects an insufficient runtime. See the [Paper requirements](https://docs.papermc.io/paper/getting-started/). Older Paper versions have not received a complete runtime compatibility adapter in this release.

## Manual setup

No manager or game service was started while preparing this release.

From the project directory:

    npm exec --yes --package=pnpm@11.25.0 -- pnpm install --frozen-lockfile --ignore-scripts
    npm exec --yes --package=pnpm@11.25.0 -- pnpm run lint
    npm exec --yes --package=pnpm@11.25.0 -- pnpm test
    npm exec --yes --package=pnpm@11.25.0 -- pnpm run build

Copy .env.example to .env and set SONORA_ADMIN_USERNAME and a private password of at least 12 characters before the first start. Leave SONORA_BIND_HOST=127.0.0.1 for local use. The example selects production mode.

Only when you choose to start the manager yourself:

    npm exec --yes --package=pnpm@11.25.0 -- pnpm start

The panel is at http://127.0.0.1:3000. When no initial password is supplied, the first start generates one in data/manager/admin-bootstrap.txt. The salted hash is saved in data/manager/admin.json. Save the generated credentials privately and remove the bootstrap text afterward. Do not put credentials into update archives.

Set SONORA_PUBLIC_ORIGIN to the HTTPS origin when using a reverse proxy. This enables correct origin validation and Secure cookies without trusting arbitrary forwarded headers. Public deployment and the Linux service installation still need deployment tests.

For Ubuntu/Debian Linux x64, see [Linux Update 04](LINUX-UPDATE04.md). `sudo bash install.sh` installs in the current directory and leaves the manager stopped. It installs project-local Node and JDK 25; additional JDKs are installed on demand. Previous data is copied only into an empty local data directory and original copies are retained. Neither this command nor the JDK selection starts a game instance.

Paper's currently published 26.3 builds are alpha/beta, so this version requires the experimental-build checkbox. The complete [93-entry catalogue review](INSTALLER-CATALOG-AUDIT-2026-10-11.md) identifies seven implemented adapters and 86 pending entries; the prototype's large catalogue is not proof of working installers.

Create an instance, install its files, and explicitly accept the Minecraft EULA in eula.txt before manually starting Minecraft. Optional installation during creation downloads files only and never starts the game.

## Storage and recovery

data/servers/<id> contains instance files. data/manager contains authentication state, metadata, backups and recovery folders.

Deleting an instance stops it and moves its files into data/manager/deleted. Restore retains previous files in data/manager/restore-recovery. No automated retention policy is configured; these folders consume disk space.

Backups require a stopped instance and tar. Symlinks, hardlinks and special files are explicitly unsupported. Uploads are limited to 32 MiB; the text editor to 1 MiB. Direct downloads have no editor size limit.

Legacy browser-local server/CRM data is preserved but is no longer authoritative. Importing browser-only instances or unmanaged existing directories is not implemented. Existing directories are never silently overwritten.

After unexpected manager termination, a recorded PID that may still exist blocks duplicate starts. Automatic process adoption is not implemented; examine that process on the host first. Normal shutdown attempts to stop owned game processes.

## Still unavailable

Customer accounts/ownership/RBAC, payment gateways, real prepaid contracts, billing, SFTP, scheduled jobs, automatic crash restarts, DNS provisioning, remote nodes, Docker runners, player/RCON querying, measured process metrics, webhook delivery and additional engines/provider download adapters.

Affected UI entry points now report the unavailable capability instead of producing a simulated success. Legacy prototype components remain in the source for future work; they are not evidence of backend support.

## Verification

The original audit reproduced ten backend defects. Update 04 has 67 backend checks, 50 installer checks, seven frontend-handler checks, 26 JDK checks and 24 launch checks (174 total). TypeScript and the production build pass. The Linux shell source parses with the tree-sitter Bash grammar; this is not a systemd deployment test. A large main-bundle warning remains.

Lifecycle tests use simulated children and an Express routing fixture. Archive tests use actual tar only on tiny isolated directories. No real game process, HTTP listener or browser was started. This is not browser, Linux deployment or live game compatibility certification.

See ../audit/AUDIT-01-2026-10-11.md for original findings and docs/CHANGELOG-UPDATE04-EN-2026-10-11.md for current repairs.
