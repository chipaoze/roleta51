import { randomBytes, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const password = process.env.AREA51_E2E_PASSWORD;
if (!password || password.length < 12) throw new Error('Defina AREA51_E2E_PASSWORD com ao menos 12 caracteres.');

const file = new URL('../seed-database.json', import.meta.url);
const database = JSON.parse(await readFile(file, 'utf8'));
database.users.forEach((user) => {
  const passwordSalt = randomBytes(16).toString('hex');
  user.passwordSalt = passwordSalt;
  user.passwordHash = scryptSync(password, passwordSalt, 64).toString('hex');
  user.active = true;
  user.approved = true;
  user.eligible = true;
  user.mustChangePassword = false;
});
database.rememberTokens = [];
database.gateAuthorizations = [];
await writeFile(file, JSON.stringify(database, null, 2) + '\n', 'utf8');
