# Update 03 — Linux deployment and game installers

Date: 2026-10-11. Time: 14:11:43 +0200 (Europe/Berlin).
Previous revision: 42c765b2000bc782ff969ad28a8157ab1c052cc3.
Separate archive: Sonora-Update03-2026-10-11.zip.

## Reported problems and confirmed causes

The Linux systemd service used a working directory below `/root` and the root user's nvm `npx`. The unprivileged `sonora` user failed at `200/CHDIR`. A second, older application already existed under `/opt/sonora-manager`, so fixing the service path alone started outdated installer code with a hardcoded Paper 1.21.4 suggestion and a nonexistent SFTP workflow.

Official Paper metadata checked on 2026-10-11 lists 86 builds for 26.3, with ALPHA/BETA channels and no STABLE build. Minecraft 26.3 is a Mojang release, but this does not imply that its Paper builds are stable. Installation now requires explicit experimental consent when no stable build exists and never switches to a different Minecraft version silently.

## Deployment repairs

- Replaced the Ubuntu/Debian x86_64 installer with deployment of the selected Git HEAD into a unique `/opt/sonora-releases/<timestamp>-<revision>-<pid>` directory.
- Download the official Node.js 24 distribution and verify its SHA-256 before using it from a shared runtime path. Root's nvm is no longer used by systemd.
- Install Java 25 from the distribution when available; otherwise download a Temurin 25 JRE from the Adoptium API and verify its SHA-256.
- Use pinned pnpm through `npm exec`; a global pnpm installation is unnecessary.
- Keep existing `/opt/sonora-manager/data` and existing environment configuration. Back up the previous service unit and drop-ins. Replace the known path-repair override and check the effective working directory.
- Check Node, dependencies, frontend files, environment-file access and data permissions as `sonora` before changing the service.
- Default deployment leaves the manager stopped. `--start` explicitly starts it and checks the health endpoint for up to 30 attempts. No game instance is started by the deployment script.
- Keep loopback binding. Remote access uses an SSH tunnel or an administrator-configured HTTPS proxy.
- Ensure shell scripts are checked out with LF line endings.

## Minecraft installer repairs

- Separate Paper, Purpur and Vanilla provider adapters and engine-specific JAR filenames. Other engines are clearly disabled until implemented.
- Populate version selectors from the selected provider instead of the prototype's hardcoded version/snapshot list.
- Paper: select the highest stable build, or prefer beta over alpha only after explicit experimental consent. Verify SHA-256 and JAR signature.
- Purpur: install the selected version/build, require consent for experimental metadata and verify the provider's MD5 checksum and JAR signature. MD5 is a provider integrity check, not a cryptographic authenticity guarantee; requests use official HTTPS endpoints.
- Vanilla: use Mojang's release manifest, verify version metadata SHA-1 and the server JAR SHA-1, and use the required Java version from that metadata. Snapshot entries are excluded.
- Bound archive downloads to 256 MiB and install through unique temporary files. Invalid hashes preserve the previously installed JAR.
- Preserve EULA acceptance as an explicit user action. Download/install never starts Minecraft.
- Persist installation errors and the pending-install flag. Provide a visible retry entry point on the instance page.

## Steam installer repairs and catalogue review

- Implemented dedicated Linux profiles for Palworld, Rust, Valheim and Garry's Mod. This is not a claim that every catalogue product has an implemented installer.
- Use provider-owned AppIDs and defined executable paths. Reject an incorrect AppID and unsupported adapters before instance creation.
- Replace fixed catalogue ports with the allocated instance ports.
- Keep Valheim worlds in instance-specific save directories and provide its Linux library path and Steam application environment.
- Keep portable SteamCMD under persistent writable data. Use an argument-based tar invocation and bounded download timeout; check that the launcher exists.
- Serialize SteamCMD installations across instances. Select the public branch explicitly and require the app-specific success message plus a readable, nonempty server executable. Exit code zero alone cannot report success.
- Stop installer children on manager shutdown and apply a two-hour SteamCMD process limit.
- Remove the fake offline/bypass claim from creation UI.
- Structurally audited all 93 catalogue entries: 7 implemented, 86 disabled/pending. See `INSTALLER-CATALOG-AUDIT-2026-10-11.md` for each entry and the remaining work. Products needing licensed authentication, Wine, a different download provider, additional configuration or a missing engine adapter remain pending; they are not silently installed through a guessed generic script.

## Validation and limits

62 backend regression checks, 49 installer regression checks and 7 frontend-handler checks passed (118 total). TypeScript, production build and React render smoke validation passed. The Bash source parses without syntax errors using the tree-sitter Bash grammar.

Backend process tests use mocked children. Archive tests operate only on isolated fixtures. Read-only requests checked official Paper, Mojang, Purpur and Adoptium metadata; no production game downloads, live manager listeners or game servers were started. Ubuntu/systemd deployment, full browser behavior and live game compatibility still require verification on the Linux host. A large frontend bundle warning remains.

Old browser-only instance records are not automatically adopted. Existing instance files are retained; arbitrary existing directories are not overwritten or registered without a defined migration procedure. An administrator must review any nonstandard previous data path before deployment because this installer explicitly uses `/opt/sonora-manager/data`.

## Primary references

- https://docs.papermc.io/misc/downloads-service/
- https://docs.papermc.io/paper/getting-started/
- https://purpurmc.org/docs/purpur/
- https://www.minecraft.net/en-us/download/server
- https://nodejs.org/en/download
- https://adoptium.net/installation/
- https://docs.palworldgame.com/getting-started/deploy-dedicated-server/
- https://wiki.facepunch.com/rust/creating-a-server
- https://www.valheimgame.com/support/a-guide-to-dedicated-servers/
- https://wiki.facepunch.com/gmod/Downloading_a_Dedicated_Server
