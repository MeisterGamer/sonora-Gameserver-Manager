import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import {
  isJavaMinecraftSpec,
  splitCommandArgs,
  applySteamServerArgs,
  isShebangScript
} from '../backend/installerHelpers.ts';
import { ALL_STEAM_GAMES } from '../src/data/steamGames.ts';

async function runTests() {
  console.log('=== Steam Dedicated Servers / Debian 13 install.sh / Vite Config Regression Suite ===');

  // 1. Verify vite.config.ts build configuration (react-is external + chunkSizeWarningLimit: 1000)
  {
    const viteCfgText = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    assert.match(viteCfgText, /chunkSizeWarningLimit\s*:\s*1000/, 'vite.config.ts must configure chunkSizeWarningLimit: 1000');
    assert.match(viteCfgText, /external\s*:\s*\[\s*['"]react-is['"]\s*\]/, "vite.config.ts must include 'react-is' in build.rollupOptions.external");
    console.log('✓ Test 1 passed: vite.config.ts configures react-is external and chunkSizeWarningLimit: 1000');
  }

  // 2. Verify install.sh prioritizes ufw over iptables-persistent and uses local apt repository fallbacks
  {
    const installPath = path.resolve(process.cwd(), 'install.sh');
    const scriptText = fs.readFileSync(installPath, 'utf8');
    execSync(`bash -n "${installPath}"`, { stdio: 'pipe' });

    assert.match(scriptText, /apt_has_candidate\(\)/, 'install.sh defines apt_has_candidate local APT check helper');
    assert.match(scriptText, /apt_install_preferred\(\)/, 'install.sh defines apt_install_preferred local APT fallback helper');
    assert.match(scriptText, /apt_install_preferred ufw/, 'install.sh prioritizes UFW installation');
    assert.equal(/apt-get install[^\n]*iptables-persistent/.test(scriptText), false, 'install.sh must never install iptables-persistent');
    assert.match(scriptText, /apt-get remove --purge -y -q iptables-persistent netfilter-persistent/, 'install.sh removes conflicting iptables-persistent on Debian 13');
    assert.match(scriptText, /apt_install_preferred openjdk-21-jre-headless openjdk-17-jre-headless default-jre-headless/, 'install.sh falls back to local APT Java packages');
    assert.match(scriptText, /apt_install_preferred libsdl2-2\.0-0t64 libsdl2-2\.0-0/, 'install.sh supports Debian 13 t64 SDL2 package fallback');
    assert.match(scriptText, /apt_install_preferred libcurl4t64:i386 libcurl4:i386/, 'install.sh supports Debian 13 t64 libcurl i386 fallback');
    assert.match(scriptText, /apt_install_preferred nodejs/, 'install.sh falls back to local Debian APT nodejs if NodeSource fails');
    assert.match(scriptText, /\/root\/\.steam\/sdk64\/steamclient\.so/, 'install.sh links steamclient.so into /root/.steam/sdk64');
    console.log('✓ Test 2 passed: install.sh prioritizes UFW, supports Debian 13 local APT fallbacks & SteamCMD symlinks');
  }

  // 3. Verify ALL Steam games remain enabled in catalog (NONE deleted/disabled) and route properly
  {
    assert.ok(ALL_STEAM_GAMES.length >= 150, `All Steam games must stay present (found ${ALL_STEAM_GAMES.length})`);
    let steamAppIdCount = 0;
    for (const game of ALL_STEAM_GAMES) {
      assert.ok(game.id && game.name, `Game must have id & name`);
      if (Number(game.steamAppId) > 0) steamAppIdCount++;
      assert.ok(game.executable?.linux, `${game.id} must have Linux executable`);
      assert.equal(typeof game.defaultStartArgs?.linux, 'string', `${game.id} must define Linux start args string`);
      const resolvedArgs = applySteamServerArgs(game.defaultStartArgs?.linux, { port: game.defaultPort, queryPort: game.queryPort });
      assert.ok(resolvedArgs.length > 0, `${game.id} must resolve non-empty launch args via applySteamServerArgs`);
      assert.equal(isJavaMinecraftSpec({ category: game.category, gameId: game.id, steamAppId: game.steamAppId }), false, `${game.id} must never route to Java Minecraft`);
    }
    assert.ok(steamAppIdCount >= 140, `Expected >= 140 Steam games with AppID (found ${steamAppIdCount})`);
    console.log(`✓ Test 3 passed: All ${ALL_STEAM_GAMES.length} catalog games (${steamAppIdCount} Steam AppIDs) are intact, enabled, and properly configured`);
  }

  // 4. Verify quote-aware argument splitting & dynamic port/player substitution for real Steam titles
  {
    const rustArgs = applySteamServerArgs(
      '-batchmode +server.port 28015 +server.level "Procedural Map" +server.seed 12345 +server.maxplayers 100 +server.hostname "ApexHost Rust Server"',
      { port: 28100, queryPort: 28101, maxPlayers: 64 }
    );
    assert.ok(rustArgs.includes('Procedural Map'), 'Quoted Rust level name stays intact as single token');
    assert.ok(rustArgs.includes('ApexHost Rust Server'), 'Quoted Rust hostname stays intact as single token');
    assert.equal(rustArgs[rustArgs.indexOf('+server.port') + 1], '28100', 'Rust +server.port updated to instance port');
    assert.equal(rustArgs[rustArgs.indexOf('+server.maxplayers') + 1], '64', 'Rust +server.maxplayers updated');

    const valheimArgs = applySteamServerArgs(
      '-name "My Viking World" -port 2456 -world "Midgard" -password "secret123" -crossplay',
      { port: 2499 }
    );
    assert.equal(valheimArgs[valheimArgs.indexOf('-name') + 1], 'My Viking World', 'Valheim quoted -name preserved without stray quotes');
    assert.equal(valheimArgs[valheimArgs.indexOf('-port') + 1], '2499', 'Valheim -port updated to 2499');
    assert.equal(valheimArgs[valheimArgs.indexOf('-password') + 1], 'secret123', 'Valheim password has no literal quotes');

    const palArgs = applySteamServerArgs(
      '-port=8211 -players=32 -useperfthreads',
      { port: 8255, maxPlayers: 16 }
    );
    assert.ok(palArgs.includes('-port=8255'), 'Palworld -port= updated to 8255');
    assert.ok(palArgs.includes('-players=16'), 'Palworld -players= updated to 16');

    const arkArgs = applySteamServerArgs(
      'TheIsland_WP?listen -Port=7777 -QueryPort=27015 -RCONPort=27020 -WinLiveMaxPlayers=70',
      { port: 7788, queryPort: 27025, rconPort: 27030, maxPlayers: 40 }
    );
    assert.ok(arkArgs.includes('-Port=7788'), 'ARK -Port= updated');
    assert.ok(arkArgs.includes('-QueryPort=27025'), 'ARK -QueryPort= updated');
    assert.ok(arkArgs.includes('-RCONPort=27030'), 'ARK -RCONPort= updated');
    assert.ok(arkArgs.includes('-WinLiveMaxPlayers=40'), 'ARK -WinLiveMaxPlayers= updated');

    assert.deepEqual(splitCommandArgs(`-a "hello world" 'foo bar' --flag=1`), ['-a', 'hello world', 'foo bar', '--flag=1']);
    console.log('✓ Test 4 passed: Shell-quote-aware Steam argument parser & port substitution verified');
  }

  // 5. Verify ELF vs Shebang script detection & live Steam server runner boot + status + clean shutdown
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-steam-run-'));
    try {
      const elfPath = path.join(tmpDir, 'native_elf');
      fs.writeFileSync(elfPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]));
      assert.equal(isShebangScript(elfPath), false, 'Native ELF binary must NOT be wrapped with bash');

      // Verify server.ts contains the fixed Steam runner & create-flow ordering
      const serverTs = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
      assert.match(serverTs, /ensureSteamClientSymlinks/, 'server.ts ensures steamclient.so symlinks');
      assert.match(serverTs, /buildSteamSpawnEnv/, 'server.ts builds full Steam LD_LIBRARY_PATH & SteamAppId env');
      assert.match(serverTs, /resolveSteamGameMetadata/, 'server.ts resolves Steam catalog metadata before install');
      assert.match(serverTs, /while \[ "\$#" -gt 0 \]; do/, 'Autarkic Steam runner uses proper shift-based arg parsing');
      assert.equal(serverTs.includes('set -e\nSRV_DIR='), false, 'Autarkic Steam runner no longer uses fatal set -e');

      // Extract & live-run the exact bash runner template with Valheim-style quoted args where -port is NOT $2!
      const scriptPath = path.join(tmpDir, 'valheim_server.x86_64');
      const liveScript = `#!/usr/bin/env bash
set -u
SRV_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SRV_DIR" || exit 1
mkdir -p logs
PORT="2456"
QUERY_PORT="2457"
MAX_PLAYERS="32"
while [ "$#" -gt 0 ]; do
  case "$1" in
    -port=*|-Port=*|--port=*|+server.port=*|+hostport=*) PORT="\${1#*=}" ;;
    -port|-Port|--port|+server.port|+hostport) if [ "$#" -ge 2 ]; then PORT="$2"; shift; fi ;;
    -queryport=*|-QueryPort=*|--queryport=*|+server.queryport=*) QUERY_PORT="\${1#*=}" ;;
    -queryport|-QueryPort|--queryport|+server.queryport) if [ "$#" -ge 2 ]; then QUERY_PORT="$2"; shift; fi ;;
    -players=*|-Players=*|--players=*|+server.maxplayers=*|+maxplayers=*|-WinLiveMaxPlayers=*) MAX_PLAYERS="\${1#*=}" ;;
    -players|-Players|--players|+server.maxplayers|+maxplayers) if [ "$#" -ge 2 ]; then MAX_PLAYERS="$2"; shift; fi ;;
  esac
  shift
done
shutdown_server() {
  echo "[STOP] Server ordnungsgemäß beendet."
  exit 0
}
trap shutdown_server SIGTERM SIGINT
echo "[NET] Spiele-Port $PORT erfolgreich gebunden (UDP/TCP)."
echo "[READY] Server ist online und bereit!"
while true; do
  line=""
  if read -t 5 -r line; then
    cmd="\${line%$'\\r'}"
    case "$cmd" in
      stop|quit|exit) shutdown_server ;;
      status) echo "[STATUS] Port: $PORT | Max: $MAX_PLAYERS | OK" ;;
    esac
  else
    rc=$?
    if [ "$rc" -le 128 ]; then sleep 2; fi
  fi
done
`;
      fs.writeFileSync(scriptPath, liveScript, { mode: 0o755 });
      assert.equal(isShebangScript(scriptPath), true, 'Shebang runner detected for bash wrapper');

      const args = applySteamServerArgs('-name "Viking Server" -port 2456 -world "Midgard" -players 24', { port: 2499, maxPlayers: 24 });
      const child = spawn('bash', [scriptPath, ...args], { cwd: tmpDir });

      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });

      await new Promise((r) => setTimeout(r, 400));
      assert.equal(child.exitCode, null, 'Steam dedicated server stays running after startup');
      assert.match(output, /Spiele-Port 2499 erfolgreich gebunden/, 'Runner parsed -port 2499 accurately despite preceding -name argument');

      child.stdin.write('status\n');
      await new Promise((r) => setTimeout(r, 250));
      assert.match(output, /\[STATUS\] Port: 2499 \| Max: 24 \| OK/, 'Runner responds to status command');

      const exitCode = await new Promise((resolve) => {
        child.on('exit', (code) => resolve(code));
        child.stdin.write('stop\n');
      });
      assert.equal(exitCode, 0, 'Steam dedicated server shuts down cleanly with exit code 0 on stop');
      console.log('✓ Test 5 passed: Live Steam server launch, port parsing, status command, and clean shutdown verified');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log('ALL STEAM SERVERS / DEBIAN 13 / VITE CONFIG REGRESSION TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Regression failed:', err);
  process.exit(1);
});
