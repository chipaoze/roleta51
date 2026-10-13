import { DatabaseSync } from 'node:sqlite';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Informe origem e destino.');
const database = new DatabaseSync(source);
database.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
database.close();
