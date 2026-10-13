import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync('/var/lib/area51/data/area51.sqlite');
const row = database.prepare('SELECT data, revision, updated_at FROM app_state WHERE id = 1').get();
const state = JSON.parse(row.data);
const votes = (state.communityVotes || []).map((item) => ({
  id: item.id,
  subject: item.subject,
  status: item.status,
  author: item.authorName,
  createdAt: item.createdAt,
  closedAt: item.closedAt || null,
  decision: item.decision || null,
  votes: (item.votes || []).map((vote) => ({ name: vote.userName, vote: vote.vote })),
}));
console.log(JSON.stringify({ revision: Number(row.revision), updatedAt: row.updated_at, votes }, null, 2));
database.close();
