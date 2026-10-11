# Sonora Update 02 — English Changelog

Date: 2026-10-11. Time: 13:18:49 +0200 (Europe/Berlin).
Baseline: 63b986a2caa03c54486824c4821c470e80f28bb5.
Release: 0.1.0. Archive: Sonora-Update02-2026-10-11.zip.

## Authentication and isolation

- Added actual administrator authentication, salted scrypt hashes, timing-safe comparison, eight-hour sessions, logout invalidation, HttpOnly/SameSite cookies and login-attempt limits.
- Browser-local demo roles no longer grant API access. Removed the password-free role-switch login.
- Restricted the default listener to loopback. Added HTTPS public-origin configuration for reverse proxies and mutation-origin checks.
- Validated instance identifiers and confined paths, including existing symlink/junction ancestors.
- Blocked executable/file traversal, invalid resource values, unsupported platforms and unsupported engines.
- Added JSON API errors and rejection handling for asynchronous Express routes.
- Excluded runtime data/credentials from source and update packaging.

## Process management

- Replaced stop-only restart with stop confirmation followed by a replacement start.
- Added immediate SIGKILL handling and registered error listeners before awaiting spawn.
- Made cleanup depend on child identity so old close events cannot delete a replacement.
- Serialized installation/power/file operations per instance.
- Added persistent instance definitions and runtime PID records. Possible orphan processes block duplicate starts.
- Added graceful manager shutdown; automatic process adoption/restart is not claimed.
- Added Minecraft TCP-port, version-dependent Java and explicit EULA checks.
- Preserved quoted native arguments and rejected unterminated quotes.
- SteamCMD signal termination now fails instead of reporting successful installation.
- Bounded log entry/tail sizes and rotated logs at approximately 10 MiB.

## Files, archives and data retention

- Added actual file listing, text read/write, folder creation, empty-folder/file deletion, download and binary upload.
- Text writes use temporary files and rename; uploads refuse existing targets.
- Added real tar.gz backups with SHA-256 metadata.
- Added verified restore, archive path/type checks and recovery copies of previous files.
- Restore also restores saved version/plugin metadata.
- Added actual backup download/deletion; running instances cannot be backed up/restored.
- Instance removal stops the process and retains files for recovery before removing registry metadata.
- Preserved legacy browser data instead of silently overwriting it during migration.

## Downloads, plugins and updates

- Switched Paper to the v3 stable-build Downloads API with identifying User-Agent and SHA-256 checks.
- Removed silent version substitution and invented engine changes.
- Added compatible Modrinth Paper/Spigot/Bukkit downloads, SHA-512 verification and CDN restrictions.
- Plugin activation/deactivation, removal and registry updates now act on actual files.
- Unresolved required dependencies and unavailable providers fail explicitly.
- Updates call the actual installer and optionally create a real pre-update archive. Games remain stopped.
- Optional installation during create has a reported outcome; a failed installation retains the created instance and reports the error.

## Frontend and tooling

- Removed demo initial server rows/logs and timer-based fabricated status transitions.
- Loaded instance state from the backend.
- Console commands no longer invent player/TPS/OP/save confirmations.
- Replaced reachable mock file, backup, plugin and update views with backend-connected components.
- Create/delete forms await backend completion and retain/report failure.
- Unimplemented CRM/payment/SFTP/scheduler/remote/DNS/player/metric/webhook entry points report limitations.
- Corrected Java/metric claims and removed simulated crash-restart/snapshot promises.
- Added Node 24 requirement, portable clean command, test commands and a lockfile.
- Added hoisted pnpm configuration for legacy and v11 formats.
- Replaced Vite __dirname usage with import.meta.dirname.
- Updated Linux installer source to Node 24, a dedicated service account, loopback binding and dirty-checkout preservation. Removed public panel/SFTP firewall exposure. Installer was not executed.

## Validation and limits

- Ten original backend defects reproduced against the saved baseline.
- 53 backend checks and seven actual-handler frontend checks pass.
- Real tar backup/restore/tamper/delete checks use tiny isolated fixtures.
- React startup server-render smoke check passes.
- TypeScript and production build pass; a large-bundle warning remains.
- No real HTTP service, game server, browser, SteamCMD download or Linux installer was started.
- Browser interactions, all-game adapters, live downloads and Linux deployment remain unverified.

This repairs the local manager foundation. Multi-tenant hosting, billing, SFTP, scheduling, monitoring and remote-node systems remain incomplete and are documented in README.md.
