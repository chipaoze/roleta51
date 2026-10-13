import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [source, backup] = process.argv.slice(2);
if (!source || !backup) throw new Error('Informe origem e destino.');
if (existsSync(backup)) throw new Error('O backup de destino já existe.');
const database = new DatabaseSync(source);
database.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
const state = JSON.parse(row.data);
console.log(JSON.stringify({
  revision: Number(row.revision),
  bytes: Buffer.byteLength(row.data),
  users: state.users.length,
  walletTotal: Object.values(state.economy.wallets || {}).reduce((sum, value) => sum + Number(value || 0), 0),
  boxes: (state.economy.mysteryBoxes || []).length,
  purchases: (state.economy.purchases || []).length,
}));
database.close();
