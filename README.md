# Sonora Gameserver Manager

Local repair release 0.1.0 / Update 02, 2026-10-11.
Baseline: 63b986a2caa03c54486824c4821c470e80f28bb5.

This release replaces several simulated operations with actual backend operations. It is a local administrator manager, not a completed multi-tenant hosting platform.

## Implemented

- Password-verified administrator login, salted scrypt password storage, HttpOnly/SameSite session cookies, expiration, login throttling and origin checks.
- API protection and instance/file path confinement, including junction/symlink checks.
- Persistent instance registry; process start, stop, real kill and restart; asynchronous spawn error handling and operation locks.
- Backend-authoritative process state and bounded logs. Minecraft readiness uses the Paper startup log; native-game running state means the process exists, not that a game port has been verified.
- Real console stdin commands, filesystem listing/edit/create/delete/download/upload.
- Actual tar.gz backups, SHA-256 verification, download, restore, recovery copies and backup deletion.
- Paper stable-build installation through the current v3 Downloads API with User-Agent and SHA-256 verification; explicitly requested versions are retained.
- Linux SteamCMD installation/public-branch updates. Other operating systems fail explicitly instead of downloading Linux binaries.
- Compatible Modrinth Paper/Spigot/Bukkit plugins: SHA-512 verification, installation, activation/deactivation and removal. Required dependency resolution is not implemented.

## Requirements

Node.js 24+, pnpm, and tar for backups. The pnpm lockfile is included. pnpm-workspace.yaml uses the hoisted linker because E: is exFAT and does not support directory symlinks.

Paper 1.20/1.21 uses Java 21; Paper 26.1+ requires Java 25. The launcher checks the selected version and rejects an insufficient runtime. See the [Paper requirements](https://docs.papermc.io/paper/getting-started/). Older Paper versions have not received a complete runtime compatibility adapter in this release.

## Manual setup

No manager or game service was started while preparing this release.

From the project directory:

    pnpm install --frozen-lockfile --ignore-scripts
    pnpm run lint
    pnpm test
    pnpm run build

Copy .env.example to .env and set SONORA_ADMIN_USERNAME and a private password of at least 12 characters before the first start. Leave SONORA_BIND_HOST=127.0.0.1 for local use. The example selects production mode.

Only when you choose to start the manager yourself:

    pnpm start

The panel is at http://127.0.0.1:3000. When no initial password is supplied, the first start generates one in data/manager/admin-bootstrap.txt. The salted hash is saved in data/manager/admin.json. Save the generated credentials privately and remove the bootstrap text afterward. Do not put credentials into update archives.

Set SONORA_PUBLIC_ORIGIN to the HTTPS origin when using a reverse proxy. This enables correct origin validation and Secure cookies without trusting arbitrary forwarded headers. Public deployment and the Linux service installation still need deployment tests.

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

The original audit reproduced ten backend defects. Update 02 has 53 backend checks, seven frontend-handler checks and a React server-render smoke check. TypeScript and the production build pass. A large main-bundle warning remains.

Lifecycle tests use simulated children and an Express routing fixture. Archive tests use actual tar only on tiny isolated directories. No real game process, HTTP listener or browser was started. This is not browser, Linux deployment or live game compatibility certification.

See audit/AUDIT-01-2026-10-11.md for original findings and docs/CHANGELOG-UPDATE02-EN-2026-10-11.md for repairs.
