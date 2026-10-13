#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline';

const stateDir = path.resolve(process.cwd(), 'data');
const accountFile = path.join(stateDir, 'admin.json');

console.log('================================================================');
console.log('  Sonora Gameserver Manager - Administrator CLI Emergency Tool  ');
console.log('================================================================');
console.log('Sicheres lokales Host-Tool: Keine Netzwerk-Exposition.');
console.log('');

async function main() {
  let existingUser = 'Admin';
  if (fs.existsSync(accountFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
      if (data && data.username) existingUser = data.username;
    } catch {}
  }

  const args = process.argv.slice(2);
  let username = existingUser;
  let password = '';

  if (args.length >= 2) {
    username = args[0].trim();
    password = args[1].trim();
  } else if (args.length === 1) {
    password = args[0].trim();
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const ask = (query: string): Promise<string> =>
      new Promise(resolve => rl.question(query, resolve));

    const usernameInput = await ask(`Administrator-Benutzername [Standard: ${existingUser}]: `);
    if (usernameInput.trim()) username = usernameInput.trim();

    const passwordInput = await ask('Neues Administrator-Passwort (mind. 10 Zeichen): ');
    password = passwordInput.trim();
    rl.close();
  }

  if (password.length < 10) {
    console.error('\nFEHLER: Das Passwort muss mindestens 10 Zeichen lang sein.');
    process.exit(1);
  }

  const salt = randomBytes(32).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    accountFile,
    JSON.stringify(
      {
        username,
        email: '',
        salt,
        hash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    { mode: 0o600 }
  );

  console.log('\nERFOLG: Administrator-Konto wurde sicher auf dem Host aktualisiert.');
  console.log(`Benutzername: ${username}`);
  console.log('Sie können sich jetzt mit diesen Anmeldedaten im Webinterface einloggen.');
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
