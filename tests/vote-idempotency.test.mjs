import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('a confirmed final vote can be retried without recording a second vote', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'vote-replay-test';
  seed.users = [{ id: 'voter', username: 'voter', displayName: 'Teste', role: 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }];
  seed.economy = { wallets: { voter: 100 } };
  for (const key of ['submissions', 'draws', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.votings = [{ id: 'voting-1', roundId: 'round-1', submissionIds: ['wallpaper-a', 'wallpaper-b'], requiredVoterIds: ['voter'], votes: [{ userId: 'voter', bestId: 'wallpaper-a', worstId: 'wallpaper-b', createdAt: new Date().toISOString() }], status: 'closed', scoresApplied: true, openedAt: new Date().toISOString(), closedAt: new Date().toISOString() }];
  seed.scores = {}; seed.communityVotes = [];
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'voter', password: 'senha-local' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const vote = (bestId, worstId) => fetch(base + '/api/vote', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ bestId, worstId }) });
    assert.equal((await vote('wallpaper-a', 'wallpaper-b')).status, 200);
    assert.equal((await vote('wallpaper-b', 'wallpaper-a')).status, 409);
    const state = JSON.parse(String((await database.prepare('SELECT data FROM app_state WHERE id = 1').first()).data));
    assert.equal(state.votings[0].votes.length, 1);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
