import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const file = process.argv[2] || '/var/lib/area51/data/area51.sqlite';
const db = new DatabaseSync(file);
try {
  db.exec('BEGIN IMMEDIATE');
  const row = db.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado.');
  const state = JSON.parse(String(row.data));
  state.settings ||= {};
  if (state.settings.rouletteBoxEconomyNotice20261030) {
    db.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, revision: Number(row.revision) }));
  } else {
    const now = new Date().toISOString();
    state.settings.rouletteBoxEconomyNotice20261030 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(),
      title: 'Roleta 51 e baús corrigidos',
      message: 'Identificamos que Rafael explorou repetidamente apostas de 0,01 Crédito 51 para obter caixas da Roleta. Corrigimos a aposta mínima e a chance de baú; removemos 471 caixas dessa origem ainda guardadas na conta dele. Não encontramos venda dessas caixas. Também ajustamos os ícones dos baús e dos prêmios na abertura em massa. A atualização já está disponível para todos.',
      imageFilename: null,
      createdAt: now,
      createdBy: 'Administração',
      seenUserIds: [],
    };
    const result = db.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (Number(result.changes || 0) !== 1) throw new Error('Conflito de revisão.');
    db.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, announcementId: state.settings.announcement.id, revision: Number(row.revision) + 1 }));
  }
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  throw error;
} finally {
  db.close();
}
