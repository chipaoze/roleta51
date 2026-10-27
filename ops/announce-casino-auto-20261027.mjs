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
  if (state.settings.casinoAutoRelease20261027) {
    database.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, releaseVersion: state.settings.releaseVersion }));
  } else {
    const now = new Date().toISOString();
    state.settings.casinoAutoRelease20261027 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(),
      title: 'Giro automático na Roleta e no Caça-Níquel',
      message: 'A pauta aprovada do Pastel chegou aos jogos! Escolha 10, 20 ou 30 giros, defina o valor por giro e use bônus diário ou saldo da Loja 51. Cada giro é cobrado separadamente. Você pode parar após o giro em andamento. Também reduzimos as consultas durante a sequência para manter o site leve. Veja os detalhes em Atualizações.',
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
