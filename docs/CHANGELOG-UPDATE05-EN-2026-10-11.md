# Update 05 — correct systemd WorkingDirectory values

Date: 2026-10-11, 15:41:21 CEST (Europe/Berlin). Release: 0.1.3.

Update 04 generated `WorkingDirectory="/root/sonora-Gameserver-Manager"`. On the reported Ubuntu system, systemd treated the quotes as literal characters and rejected the value as a non-absolute path. Installation stopped at the unit verification step before registering the new unit.

- Removed surrounding quotes from the manager unit's WorkingDirectory directive. ExecStart retains command-line quoting, which follows different parsing rules.
- Applied the same correction to exported standalone game units.
- Added regressions for the manager template and actual rendered game unit, checking unquoted absolute WorkingDirectory values.
- Bumped health identity to version 0.1.3 / Update 05 and rebuilt the frontend.

Validation: 51 installer and 25 launch checks passed, alongside TypeScript compilation and production frontend compilation. These tests do not execute systemd on the remote host. Other previous Update 04 regression suites are unchanged. No manager, Java or game process was started.

Update with `git pull --ff-only` and `sudo bash install.sh` in the existing checkout. The installer remains in place, retains local data and leaves the manager stopped. Existing verified project-local JDKs are reused. After success, the expected health identity is 0.1.3 / 05 when the administrator explicitly starts the manager.

The reported CPUAccounting warnings refer to installed XFS system units; they are separate from the fatal Sonora WorkingDirectory error. This update does not modify those OS units.
