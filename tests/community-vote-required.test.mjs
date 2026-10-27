import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('open pautas require one vote at a time from their opening, without extra polling', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'community-vote-required-test';
  seed.users = ['admin', 'ana', 'bia', 'caio'].map((id) => ({ id, username: id, displayName: id, role: id === 'admin' ? 'admin' : 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }));
  seed.economy = { wallets: { admin: 100, ana: 100, bia: 100, caio: 100 } };
  for (const key of ['draws', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.settings.currentRoundId = null;
  const now = Date.now();
  seed.communityVotes = [
    { id: 'later', subject: 'Pauta posterior', status: 'open', createdAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 120000).toISOString(), eligibleVoterIds: ['admin', 'ana', 'bia', 'caio'], votes: [], comments: [] },
    { id: 'first', subject: 'Pauta que vence antes', status: 'open', createdAt: new Date(now - 2000).toISOString(), expiresAt: new Date(now + 60000).toISOString(), eligibleVoterIds: ['admin', 'ana', 'bia', 'caio'], votes: [], comments: [] },
  ];
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (username) => {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'senha-local' }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const ana = await login('ana');
    const admin = await login('admin');
    const state = await (await fetch(base + '/api/state', { headers: { cookie: ana } })).json();
    assert.equal(state.communityVotes.requiredVote.id, 'first');
    assert.equal((await fetch(base + '/api/daily-wall/phrases', { method: 'POST', headers: { cookie: ana, 'content-type': 'application/json' }, body: JSON.stringify({ phrase: 'Teste' }) })).status, 423);
    assert.equal((await fetch(base + '/api/announcement/seen', { method: 'POST', headers: { cookie: ana, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'announcement-test' }) })).status, 200);
    assert.equal((await fetch(base + '/api/community-votes/first/image', { headers: { cookie: ana } })).status, 404);
    const vote = (id, cookie) => fetch(base + `/api/community-votes/${id}/vote`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ vote: 'favor' }) });
    assert.equal((await vote('first', ana)).status, 200);
    const afterFirst = await (await fetch(base + '/api/state', { headers: { cookie: ana } })).json();
    assert.equal(afterFirst.communityVotes.requiredVote.id, 'later');
    assert.equal((await vote('later', ana)).status, 200);
    const afterBoth = await (await fetch(base + '/api/state', { headers: { cookie: ana } })).json();
    assert.equal(afterBoth.communityVotes.requiredVote, null);
    assert.equal((await fetch(base + '/api/daily-wall/phrases', { method: 'POST', headers: { cookie: ana, 'content-type': 'application/json' }, body: JSON.stringify({ phrase: 'Depois dos votos' }) })).status, 200);
    const adminState = await (await fetch(base + '/api/state', { headers: { cookie: admin } })).json();
    assert.equal(adminState.communityVotes.requiredVote, null);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
