import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../seed-database.json', import.meta.url);
const target = new URL('../seed-remote.sql', import.meta.url);
const state = (await readFile(source, 'utf8')).replaceAll("'", "''");
const timestamp = new Date().toISOString();

await writeFile(
  target,
  `INSERT OR REPLACE INTO app_state (id, data, revision, updated_at) VALUES (1, '${state}', 1, '${timestamp}');\n`,
);

