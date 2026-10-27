import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('wallpaper voter names remain hidden until every eligible participant votes', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'wallpaper-voter-reveal-test';
  const names = ['Ana', 'Bia', 'Caio'];
  const ids = ['ana', 'bia', 'caio'];
  seed.users = ids.map((id, index) => ({ id, username: id, displayName: names[index], role: 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }));
  seed.economy = { wallets: Object.fromEntries(ids.map((id) => [id, 100])) };
  for (const key of ['draws', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.settings.currentRoundId = 'round-reveal';
  seed.settings.roundName = 'Rodada de teste';
  seed.submissions = ids.map((id, index) => ({ id: `wallpaper-${id}`, roundId: 'round-reveal', userId: id, uploader: names[index], title: `Wallpaper ${names[index]}`, filename: `${id}.png`, createdAt: new Date().toISOString() }));
  seed.votings = [{ id: 'vote-reveal', roundId: 'round-reveal', roundName: 'Rodada de teste', submissionIds: seed.submissions.map((item) => item.id), requiredVoterIds: ids, votes: [
    { userId: 'ana', bestId: 'wallpaper-bia', worstId: 'wallpaper-caio', createdAt: new Date().toISOString() },
    { userId: 'bia', bestId: 'wallpaper-caio', worstId: 'wallpaper-ana', createdAt: new Date().toISOString() },
  ], status: 'open', scoresApplied: false, openedAt: new Date().toISOString(), closedAt: null }];
  seed.scores = {}; seed.communityVotes = [];
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'caio', password: 'senha-local' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const before = await (await fetch(base + '/api/state', { headers: { cookie } })).json();
    assert.equal(before.voting.status, 'open');
    for (const entry of before.voting.entries) {
      assert.equal(entry.bestVotes, null);
      assert.equal(entry.bestVoters, null);
      assert.equal(entry.worstVoters, null);
    }
    const finalVote = await fetch(base + '/api/vote', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ bestId: 'wallpaper-ana', worstId: 'wallpaper-bia' }) });
    assert.equal(finalVote.status, 200);
    const after = await finalVote.json();
    assert.equal(after.voting.status, 'closed');
    assert.equal(after.voting.receivedVotes, after.voting.totalVoters);
    const byId = Object.fromEntries(after.voting.entries.map((entry) => [entry.id, entry]));
    assert.deepEqual(byId['wallpaper-ana'].bestVoters, ['Caio']);
    assert.deepEqual(byId['wallpaper-ana'].worstVoters, ['Bia']);
    assert.deepEqual(byId['wallpaper-bia'].bestVoters, ['Ana']);
    assert.deepEqual(byId['wallpaper-bia'].worstVoters, ['Caio']);
    assert.deepEqual(byId['wallpaper-caio'].bestVoters, ['Bia']);
    assert.deepEqual(byId['wallpaper-caio'].worstVoters, ['Ana']);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
