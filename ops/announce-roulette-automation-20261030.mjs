import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const db = new DatabaseSync(process.argv[2] || '/var/lib/area51/data/area51.sqlite');
try {
  db.exec('BEGIN IMMEDIATE');
  const row = db.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado.');
  const state = JSON.parse(String(row.data));
  state.settings ||= {};
  if (state.settings.rouletteAutomationNotice20261030) {
    db.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true }));
  } else {
    const now = new Date().toISOString();
    state.settings.rouletteAutomationNotice20261030 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(),
      title: 'Proteção da Roleta 51',
      message: 'Detectamos automações da Roleta feitas fora do site. Por isso, a API agora aguarda o tempo de um giro antes de aceitar outra aposta da mesma conta. O giro manual não tem cota diária; o modo automático mantém limites próprios. A aposta mínima é 0,10 Crédito 51, mas qualquer baú exige aposta de pelo menos 100 Créditos 51. A atualização já está disponível para todos.',
      imageFilename: null,
      createdAt: now,
      createdBy: 'Administração',
      seenUserIds: [],
    };
    const result = db.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (Number(result.changes || 0) !== 1) throw new Error('Conflito de revisão.');
    db.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, announcementId: state.settings.announcement.id }));
  }
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  throw error;
} finally {
  db.close();
}
