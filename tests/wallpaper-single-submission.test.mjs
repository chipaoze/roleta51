import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('confirmed wallpaper cannot be deleted, replaced, or resubmitted by admin', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'wallpaper-single-submission-test';
  seed.users = ['admin', 'ana', 'bia'].map((id) => ({ id, username: id, displayName: id, role: id === 'admin' ? 'admin' : 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }));
  seed.economy = { wallets: { admin: 100, ana: 100, bia: 100 } };
  seed.settings.currentRoundId = 'round-once';
  seed.settings.currentTheme = 'Tema de teste';
  seed.settings.currentParticipantIds = ['admin', 'ana', 'bia'];
  seed.submissions = [];
  seed.assignments = [];
  seed.votings = [];
  seed.draws = [];
  for (const key of ['lieAccusations', 'communityVotes', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'gateAuthorizations']) seed[key] = [];
  const stored = new Map();
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async (key) => stored.get(key) || null, put: async (key, value) => { stored.set(key, value); }, delete: async (key) => { stored.delete(key); } } }, seed);
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
    const dataUrl = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64');
    const post = (route, cookie, body) => fetch(base + route, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const concurrent = await Promise.all([post('/api/uploads', ana, { dataUrl }), post('/api/uploads', ana, { dataUrl })]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
    const state = await (await fetch(base + '/api/state', { headers: { cookie: ana } })).json();
    assert.equal(state.meHasSubmitted, true);
    assert.equal(state.meCanUpload, false);
    assert.equal(state.submissions.length, 1);
    assert.equal(state.submissions[0].canDelete, false);
    const id = state.submissions[0].id;
    assert.equal((await fetch(base + '/api/uploads/' + id, { method: 'DELETE', headers: { cookie: ana } })).status, 409);
    assert.equal((await fetch(base + '/api/uploads/' + id, { method: 'DELETE', headers: { cookie: admin } })).status, 409);
    assert.equal((await post('/api/uploads', ana, { dataUrl })).status, 409);
    assert.equal((await post('/api/admin/uploads', admin, { targetUserId: 'ana', dataUrl })).status, 409);
    assert.equal((await post('/api/admin/uploads', admin, { targetUserId: 'bia', dataUrl })).status, 201);
    const final = await (await fetch(base + '/api/state', { headers: { cookie: admin } })).json();
    assert.equal(final.submissions.length, 2);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
