import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';

const filename = process.argv[2];
if (!filename) throw new Error('Informe o SQLite de teste.');
const database = new DatabaseSync(filename);
const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
const state = JSON.parse(row.data);
const id = 'resilience-smoke-user';
const secondId = 'resilience-smoke-user-2';
const username = 'resilience_smoke';
const secondUsername = 'resilience_smoke_2';
const password = 'smoke-test-only-51';
const salt = randomBytes(16).toString('hex');
const template = state.users.find((user) => user.active) || {};
state.users = state.users.filter((user) => ![id, secondId].includes(user.id) && ![username, secondUsername].includes(user.username));
state.users.push({
  ...template,
  id,
  username,
  displayName: 'Teste de resiliência',
  role: 'participant',
  active: true,
  approved: true,
  mustChangePassword: false,
  avatarDataUrl: null,
  passwordSalt: salt,
  passwordHash: scryptSync(password, salt, 64).toString('hex'),
  createdAt: new Date().toISOString(),
});
state.users.push({
  ...template,
  id: secondId,
  username: secondUsername,
  displayName: 'Segundo teste de resiliência',
  role: 'participant',
  active: true,
  approved: true,
  mustChangePassword: false,
  avatarDataUrl: null,
  passwordSalt: salt,
  passwordHash: scryptSync(password, salt, 64).toString('hex'),
  createdAt: new Date().toISOString(),
});
state.rememberTokens = (state.rememberTokens || []).filter((entry) => ![id, secondId].includes(entry.userId));
state.economy.wallets[id] = 1000;
state.economy.wallets[secondId] = 2000;
state.economy.mysteryBoxes = (state.economy.mysteryBoxes || []).filter((entry) => ![id, secondId].includes(entry.userId));
state.economy.mysteryBoxes.push(
  { id: 'smoke-box-compact', userId: id, boxId: 'box-sonda', acquiredAt: new Date().toISOString() },
  { id: 'smoke-box-legacy', userId: id, boxId: 'box-sonda', acquiredAt: new Date().toISOString() },
  { id: 'smoke-box-user-a', userId: id, boxId: 'box-sonda', acquiredAt: new Date().toISOString() },
  { id: 'smoke-box-user-b', userId: secondId, boxId: 'box-sonda', acquiredAt: new Date().toISOString() },
);
state.economy.creditAdjustments = (state.economy.creditAdjustments || []).filter((entry) => ![id, secondId].includes(entry.userId));
database.prepare('UPDATE app_state SET data = ?, revision = ?, updated_at = ? WHERE id = 1')
  .run(JSON.stringify(state), Number(row.revision || 0) + 1, new Date().toISOString());
database.close();
console.log(JSON.stringify({ username, password }));
