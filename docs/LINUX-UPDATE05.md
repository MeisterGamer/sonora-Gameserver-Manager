# Linux Update 05

This corrects Update 04's quoted WorkingDirectory values. The application layout and data preservation described in [Update 04](LINUX-UPDATE04.md) remain unchanged. The current health identity is **version 0.1.3, update 05**.

Run in the existing installation directory:

```bash
cd /root/sonora-Gameserver-Manager
git pull --ff-only && sudo bash install.sh
```

No manual edits or force resets are required. If Git reports local modifications, save and review them before updating. The previously saved installer stash must not be reapplied over the current installer.

The installer rechecks dependencies and the frontend, reuses installed JDK 25, verifies the corrected local unit and registers it with systemd. It does **not** start the manager by default. No application data is deleted or overwritten by this correction.

After a successful installation, inspect without starting:

```bash
sudo systemctl show sonora-manager --no-pager -p WorkingDirectory -p ExecStart
```

Expected WorkingDirectory: `/root/sonora-Gameserver-Manager`. ExecStart points to `start-manager.sh` in that directory.

Reference: [systemd's official execution-environment documentation](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml).
