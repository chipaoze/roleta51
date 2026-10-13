import { DatabaseSync } from 'node:sqlite';

const filename = process.argv[2];
if (!filename) throw new Error('Informe o banco SQLite.');
const database = new DatabaseSync(filename);
console.log(JSON.stringify(database.prepare('PRAGMA integrity_check').get()));
database.close();
