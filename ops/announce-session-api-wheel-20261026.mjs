import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const databasePath = process.argv[2] || '/var/lib/area51/data/area51.sqlite';
const database = new DatabaseSync(databasePath);
try {
  database.exec('BEGIN IMMEDIATE');
  const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado');
  const state = JSON.parse(String(row.data));
  state.settings ||= {};
  if (state.settings.sessionApiWheelRelease20261026) {
    database.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, releaseVersion: state.settings.releaseVersion }));
  } else {
    const now = new Date().toISOString();
    state.settings.sessionApiWheelRelease20261026 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(),
      title: 'Acesso e jogos mais estáveis',
      message: 'Melhoramos o acesso em mais de um aparelho e reduzimos o processamento do histórico do cassino para deixar votos e jogos mais estáveis. A mesma tentativa de voto ou aposta pode recuperar uma confirmação sem registrar ou cobrar outra vez. Na roleta, números, resultado, aviso e saldo agora acompanham o fim do giro, mesmo se você trocar de página. Confira os detalhes em Atualizações.',
      imageFilename: null,
      createdAt: now,
      createdBy: 'Administração',
      seenUserIds: [],
    };
    const result = database.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (result.changes !== 1) throw new Error('Conflito de revisão; aviso não publicado');
    database.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, announcementId: state.settings.announcement.id, revision: Number(row.revision) + 1 }));
  }
} catch (error) {
  try { database.exec('ROLLBACK'); } catch {}
  throw error;
} finally {
  database.close();
}
