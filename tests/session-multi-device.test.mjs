import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('two remembered devices survive another login and a backend restart', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const sourceUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'session-two-devices-test';
  seed.users = [{ id: 'session-user', username: 'session-user', displayName: 'Teste', role: 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }];
  seed.economy = { wallets: { 'session-user': 100 } };
  for (const key of ['submissions', 'draws', 'votings', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.scores = {}; seed.communityVotes = [];
  let server;
  try {
    const start = async (module) => {
      await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
      server = http.createServer((req, res) => void module.requestHandler(req, res));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    };
    let base = await start(await import(sourceUrl + '#first'));
    const login = async () => {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'session-user', password: 'senha-local', rememberMe: true }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const firstCookie = await login();
    const secondCookie = await login();
    assert.notEqual(firstCookie, secondCookie);
    const state = (cookie) => fetch(base + '/api/state', { headers: { cookie } });
    assert.equal((await state(firstCookie)).status, 200);
    assert.equal((await state(secondCookie)).status, 200);
    await new Promise((resolve) => server.close(resolve));

    base = await start(await import(sourceUrl + '#restarted'));
    assert.equal((await state(firstCookie)).status, 200);
    assert.equal((await state(secondCookie)).status, 200);
    assert.equal((await fetch(base + '/api/state')).status, 401);
    assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: firstCookie } })).status, 204);
    assert.equal((await state(firstCookie)).status, 401);
    assert.equal((await state(secondCookie)).status, 200);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
