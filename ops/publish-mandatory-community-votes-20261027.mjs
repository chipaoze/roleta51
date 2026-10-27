import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const VOTE_ID = 'aada2c47-167a-438b-85e6-efcdeb82348b';
const database = new DatabaseSync(process.argv[2] || '/var/lib/area51/data/area51.sqlite');
try {
  database.exec('BEGIN IMMEDIATE');
  const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado');
  const state = JSON.parse(String(row.data));
  state.settings ||= {};
  const vote = (state.communityVotes || []).find((item) => item.id === VOTE_ID);
  if (!vote || vote.status !== 'closed' || vote.outcome !== 'rejected' || vote.closedBy !== 'automatic-deadline') throw new Error('Pauta histórica não encontrada ou resultado diferente do esperado');
  if (state.settings.mandatoryCommunityVotesRelease20261027) {
    database.exec('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, releaseVersion: state.settings.releaseVersion, implementationStatus: vote.implementationStatus }));
  } else {
    const now = new Date().toISOString();
    vote.implementationStatus = 'done';
    vote.implementationReason = 'admin-decision';
    vote.implementedAt = now;
    vote.implementedBy = 'Administração';
    state.settings.mandatoryCommunityVotesRelease20261027 = now;
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(),
      title: 'Voto obrigatório nas pautas',
      message: 'A proposta do Davi foi implementada por decisão administrativa. Ao abrir uma pauta, cada participante elegível precisa votar A favor ou Contra para continuar usando o portal. Havendo mais de uma, elas aparecem uma por vez. O resultado original da proposta não foi alterado: ela terminou sem maioria no prazo. Veja os detalhes em Atualizações.',
      imageFilename: null,
      createdAt: now,
      createdBy: 'Administração',
      seenUserIds: [],
    };
    const result = database.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (result.changes !== 1) throw new Error('Conflito de revisão; publicação cancelada');
    database.exec('COMMIT');
    console.log(JSON.stringify({ publishedAt: now, releaseVersion: state.settings.releaseVersion, voteId: vote.id, outcome: vote.outcome, implementationStatus: vote.implementationStatus, implementationReason: vote.implementationReason }));
  }
} catch (error) {
  try { database.exec('ROLLBACK'); } catch {}
  throw error;
} finally {
  database.close();
}
