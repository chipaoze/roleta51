import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function usage() {
  console.error('Uso: node tools/import-d1-backup.mjs <backup.sql> <destino.sqlite>');
  process.exitCode = 2;
}

const [, , sourceFile, destinationFile] = process.argv;
if (!sourceFile || !destinationFile) usage();
else if (!existsSync(sourceFile)) {
  console.error(`Backup não encontrado: ${sourceFile}`);
  process.exitCode = 2;
} else if (existsSync(destinationFile)) {
  // Importing must never silently replace a staged or live data file.
  console.error(`Destino já existe e foi preservado: ${destinationFile}`);
  process.exitCode = 2;
} else {
  mkdirSync(path.dirname(destinationFile), { recursive: true });
  const database = new DatabaseSync(destinationFile);
  try {
    database.exec(readFileSync(sourceFile, 'utf8'));
    const integrity = database.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') throw new Error(`SQLite integrity_check: ${integrity?.integrity_check}`);

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (!tables.some((table) => table.name === 'app_state')) throw new Error('Backup não contém a tabela app_state.');

    const state = database.prepare('SELECT revision, length(data) AS bytes FROM app_state WHERE id = 1').get();
    if (!state) throw new Error('Backup não contém o estado principal (app_state.id = 1).');
    console.info(JSON.stringify({ ok: true, tables: tables.map((table) => table.name), revision: state.revision, stateBytes: state.bytes }));
  } catch (error) {
    console.error(`Importação recusada: ${error.message}`);
    process.exitCode = 1;
  } finally {
    database.close();
  }
}
