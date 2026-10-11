# Linux deployment — Update 03

Run on the Ubuntu/Debian x86_64 host. No remote commands were executed while preparing this update.

## Update and deploy

From your existing source checkout (for example `/root/sonora-Gameserver-Manager`):

```bash
git status --short
git pull --ff-only
sudo bash install.sh
```

Save any local changes before pulling; the installer refuses tracked source changes and deploys committed HEAD. It prepares a new immutable release, replaces the service paths and leaves the manager stopped. Runtime data under `/opt/sonora-manager/data` is retained. Review nonstandard old data paths first; they are not automatically moved. Never copy secrets into a public commit or ZIP.

Choose to start the manager afterward:

```bash
sudo systemctl start sonora-manager
sudo systemctl show sonora-manager -p WorkingDirectory -p ExecStart -p ActiveState -p SubState
sudo journalctl -u sonora-manager -n 60 --no-pager
curl --fail http://127.0.0.1:3000/api/health
```

The health response must identify version `0.1.1`, update `03`. The effective working directory must be the newly printed release path, not `/root` or the old `/opt/sonora-manager` source. To explicitly deploy and start together, use `sudo bash install.sh --start` instead of the stopped deployment command.

## Remote panel access

Run this on your own PC, keeping the SSH terminal open:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@65.108.138.243
```

Then open `http://127.0.0.1:3000` in that PC's browser. If local port 3000 is already occupied, choose `-L 3001:127.0.0.1:3000` and open local port 3001. Public IP port 3000 is not exposed automatically. Persistent public access needs an HTTPS proxy and the matching `SONORA_PUBLIC_ORIGIN`.

## Install Minecraft 26.3

1. Open the instance's installation/update page in the new panel.
2. Select its engine and version `26.3`.
3. For Paper 26.3, explicitly enable experimental builds: its published builds currently have only beta/alpha channels. Purpur may also label a build experimental.
4. Install the files. The server stays stopped. Failed installation retains the specific error and a retry button.
5. Verify that Java 25 is available to the service and explicitly accept the Minecraft EULA in the instance's `eula.txt` after reading it.
6. Start the game yourself from the panel.

Do not switch the server to 1.21.4 to work around a failed 26.3 download. The old automatic downgrade and SFTP hint identify obsolete source; check the health version and effective service directory.

## Scope

The complete 93-entry source catalogue is documented in `INSTALLER-CATALOG-AUDIT-2026-10-11.md`. Paper, Purpur, Vanilla, Palworld, Rust, Valheim and Garry's Mod have implemented installers. The other 86 entries remain disabled until their actual download, authentication, configuration and startup adapters exist. They are not certified by a successful archive download or this update.

Existing unmanaged instance directories and browser-only records require migration review. Files are retained, but they are not automatically registered with invented metadata.
