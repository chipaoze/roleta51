import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('daily post and water duties, game lock and permanent water record', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000));
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`)
    .replace("const DAILY_DUTY_FIRST_DAY = '2026-10-28';", `const DAILY_DUTY_FIRST_DAY = '${yesterday}';`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'daily-duty-local-test';
  seed.users = ['complete', 'no-water', 'no-post', 'neither'].map((id) => ({ id, username: id, displayName: id, role: 'member', active: true, approved: true, eligible: true, createdAt: '2026-10-01T12:00:00.000Z', passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }));
  seed.economy = { wallets: Object.fromEntries(seed.users.map(({ id }) => [id, 1000])), forcedCursors: [{ id: 'other-curse', targetUserId: 'no-water', style: 'hater', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), sealed: false, phrases: ['Teste', 'Teste 2', 'Teste 3', 'Teste 4', 'Teste 5', 'Teste 6'] }] };
  seed.economy.purchases = [{ id: 'antidote-one', userId: 'no-water', itemId: 'power-cleanse-cursor', price: 360, createdAt: new Date().toISOString() }];
  seed.dailyPhrases = ['complete', 'no-water'].map((id) => ({ id: 'post-' + id, userId: id, authorName: id, phrase: 'Teste', createdAt: yesterday + 'T15:00:00-03:00' }));
  seed.dailyMemes = [];
  seed.dailyWallHistory = [{ id: 'archived', closedAt: today + 'T00:00:00-03:00', phrases: [{ id: 'archived-no-post', userId: 'archived', createdAt: yesterday + 'T13:00:00-03:00' }], memes: [] }];
  seed.waterEntries = ['complete', 'no-post'].map((id) => ({ id: 'water-' + id, userId: id, ml: 100, dayKey: yesterday, createdAt: yesterday + 'T16:00:00-03:00' }));
  for (const key of ['communityVotes', 'lieAccusations', 'dailyReactions', 'feedbackMessages', 'anonymousPosts', 'rememberTokens', 'gateAuthorizations']) seed[key] = [];
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {}, delete: async () => {} } }, seed);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (username) => {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'senha-local' }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const cookies = Object.fromEntries(await Promise.all(seed.users.map(async ({ id }) => [id, await login(id)])));
    const state = async (id) => (await (await fetch(base + '/api/state', { headers: { cookie: cookies[id] } })).json());
    assert.equal((await state('complete')).dailyDutyPenalty, null);
    assert.deepEqual([(await state('no-water')).dailyDutyPenalty.missingPost, (await state('no-water')).dailyDutyPenalty.missingWater], [false, true]);
    assert.deepEqual([(await state('no-post')).dailyDutyPenalty.missingPost, (await state('no-post')).dailyDutyPenalty.missingWater], [true, false]);
    assert.deepEqual([(await state('neither')).dailyDutyPenalty.missingPost, (await state('neither')).dailyDutyPenalty.missingWater], [true, true]);
    assert.equal((await state('no-water')).profile.haterCurse.id, 'other-curse');
    assert.equal((await fetch(base + '/api/powers/use', { method: 'POST', headers: { cookie: cookies['no-water'], 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'power-cleanse-cursor' }) })).status, 200);
    assert.equal((await state('no-water')).profile.haterCurse, null);
    assert.equal((await state('no-water')).dailyDutyPenalty.dayKey, today);
    assert.equal((await fetch(base + '/api/casino/play', { method: 'POST', headers: { cookie: cookies['no-water'], 'content-type': 'application/json' }, body: JSON.stringify({ bet: 1 }) })).status, 423);
    assert.equal((await fetch(base + '/api/casino/slots/play', { method: 'POST', headers: { cookie: cookies['no-water'], 'content-type': 'application/json' }, body: JSON.stringify({ bet: 1 }) })).status, 423);
    assert.equal((await fetch(base + '/api/casino/plinko/play', { method: 'POST', headers: { cookie: cookies['no-water'], 'content-type': 'application/json' }, body: JSON.stringify({ bet: 1 }) })).status, 423);
    assert.equal((await fetch(base + '/api/water/water-complete', { method: 'DELETE', headers: { cookie: cookies.complete } })).status, 409);
    assert.equal((await fetch(base + '/api/water', { method: 'POST', headers: { cookie: cookies['no-water'], 'content-type': 'application/json' }, body: JSON.stringify({ ml: 100 }) })).status, 201);
    assert.equal((await state('no-water')).dailyDutyPenalty.dayKey, today);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
