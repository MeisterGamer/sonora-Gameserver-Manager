# Update 04 — in-place Linux deployment, JDK selection and corrected launchers

Date: 2026-10-11, 15:29:14 CEST (Europe/Berlin). Release: 0.1.2.

The previous deployment spread the application across /opt and the Java selector did not control the executable actually launched. Generated scripts assumed server.jar and host Java, regardless of the selected engine. This update keeps the application in its existing directory and makes the selected JDK and engine determine the real launch.

- Replaced /opt release deployment with an in-place installer. Node, caches, package store, JDKs, game data, SteamCMD and backup files remain within the checkout.
- Added a local manager launcher and local systemd template. The service uses the installation owner and a project-local Node binary, eliminating the root-directory/sonora permission mismatch. Systemd registration remains standard OS configuration.
- Preserved previous service units and disabled stale overrides in a local backup. Previous data is copied only to an empty local data directory; originals and existing local data are preserved. Existing local environment configuration takes priority.
- Added JDK 7–26 provider metadata discovery, SHA-256 verification, bounded streaming downloads, temporary-directory cleanup, archive path checks and exact java/javac major verification. Same-major concurrent installation requests share one job. Installed runtimes are reused after executable checks.
- Replaced the simulated JVM tuning modal with actual JDK installation and selection. Running instances reject replacement. Selection persists in the backend registry.
- Minecraft start uses an absolute selected JDK executable and matching JAVA_HOME/PATH. Too-old and invalid runtime selections are rejected. Full JDK 25 is provisioned by the Linux installer; other majors are downloaded on demand.
- Introduced a shared Minecraft launch plan used by both backend process start and exported launch scripts. Corrected Paper/Purpur/Vanilla JAR names, fractional RAM in MiB, working directories, EULA checks and direct exec signal propagation.
- Corrected native Linux exported launchers to use verified adapter executables and quoted per-instance arguments. Valheim retains its library environment and per-instance saves directory.
- Exported game service templates use the backend's real installation directory and user. Unsupported adapters and Docker deployment no longer generate fabricated runnable commands. Windows/macOS Minecraft launchers require a manually installed native JDK via JAVA_HOME.
- Bumped health identity to version 0.1.2 / Update 04 and rebuilt frontend assets.

Validation: 67 backend, 50 installer, 7 frontend, 26 JDK and 24 launch regression checks (174 total); TypeScript compilation; production frontend build; Bash syntax parsing. Official provider metadata returned stable Linux-x64 packages for all 20 requested majors during this audit. No Java, game or manager process was started by the tests. The remote Ubuntu installation, old-data adoption and real game launches have not been certified by these isolated checks.

Remaining scope: only the previously enabled seven game adapters are implemented; 86 catalogue entries remain disabled. Browser-only prototype instances require registry/data review. Native Windows/macOS runtime installation, Docker deployment and arbitrary engine support are not completed by this update. This is a repair to the current installer/runtime/launch paths, not certification of the entire hosting platform.
