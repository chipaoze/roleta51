import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const path = process.argv.slice(2).find((argument) => !argument.startsWith('--')) || '/var/lib/area51/data/area51.sqlite';
const publish = process.argv.includes('--publish');
const database = new DatabaseSync(path);
const pautaId = '03fd718b-1397-472f-98c8-b418925d1c2a';
try {
  if (publish) database.exec('BEGIN IMMEDIATE');
  const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado');
  const state = JSON.parse(row.data);
  const pauta = (state.communityVotes || []).find((item) => item.id === pautaId);
  if (!pauta || pauta.status !== 'closed' || pauta.outcome !== 'approved') throw new Error('Pauta aprovada não encontrada no estado esperado');
  if (!publish) {
    console.log(JSON.stringify({ revision: row.revision, releaseVersion: state.settings?.releaseVersion, pautaStatus: pauta.implementationStatus, published: Boolean(state.settings?.dailyDutyReleasedAt) }));
  } else {
    if (state.settings.dailyDutyReleasedAt) throw new Error('Atualização já publicada');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (day !== '2026-10-28') throw new Error('A ativação hoje exige publicação em 28/10 no horário de Brasília');
    const now = new Date().toISOString();
    state.settings.dailyDutyReleasedAt = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(), title: 'Nova regra: postagem e água diárias',
      message: 'A partir de hoje, publique uma frase ou imagem no feed E registre água pelo menos uma vez. À meia-noite de Brasília será conferido o dia anterior. Quem deixar faltar qualquer meta verá o Site Desconfigurado e ficará sem a página de Jogos durante todo o dia seguinte, sem Antídoto. Outras maldições seguem independentes e podem aceitar Antídoto normalmente. Registros de água agora são definitivos. Confira a regra em Atualizações.',
      imageFilename: null, createdAt: now, createdBy: 'Administração', seenUserIds: [],
    };
    pauta.implementationStatus = 'done';
    pauta.implementedAt = now;
    pauta.implementedBy = 'admin';
    const result = database.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (result.changes !== 1) throw new Error('Conflito de revisão; nada publicado');
    database.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, revision: Number(row.revision) + 1, announcementId: state.settings.announcement.id, pautaStatus: pauta.implementationStatus }));
  }
} catch (error) {
  if (publish) database.exec('ROLLBACK');
  throw error;
} finally {
  database.close();
}
