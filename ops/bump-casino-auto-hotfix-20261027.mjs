import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(process.argv[2] || '/var/lib/area51/data/area51.sqlite');
try {
  database.exec('BEGIN IMMEDIATE');
  const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado');
  const state = JSON.parse(String(row.data));
  state.settings ||= {};
  if (state.settings.casinoAutoHotfix20261027) {
    database.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, releaseVersion: state.settings.releaseVersion }));
  } else {
    const now = new Date().toISOString();
    state.settings.casinoAutoHotfix20261027 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    const result = database.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (result.changes !== 1) throw new Error('Conflito de revisão; versão não publicada');
    database.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, revision: Number(row.revision) + 1 }));
  }
} catch (error) {
  try { database.exec('ROLLBACK'); } catch {}
  throw error;
} finally {
  database.close();
}
