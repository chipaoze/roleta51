import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('six concurrent accounts can each complete 30 independent compact casino plays', { timeout: 120000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'casino-auto-test';
  const users = Array.from({ length: 6 }, (_, index) => ({ id: `auto-user-${index}`, username: `auto-user-${index}`, displayName: `Jogador ${index}`, role: 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }));
  seed.users = users;
  const paddingMegabytes = Math.max(0, Math.min(8, Number(process.env.AREA51_AUTO_LOAD_MEGABYTES || 0)));
  if (paddingMegabytes) seed.loadTestPadding = 'x'.repeat(paddingMegabytes * 1024 * 1024);
  seed.economy = { wallets: Object.fromEntries(users.map((user) => [user.id, 1000000])), casinoAccounts: Object.fromEntries(users.map((user) => [user.id, { balance: 1000000, cashedOut: false }])), casinoPlays: [], casinoFairnessRefundV1: true };
  for (const key of ['submissions', 'draws', 'votings', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.scores = {}; seed.communityVotes = [];
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const cookies = await Promise.all(users.map(async (user) => {
      const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user.username, password: 'senha-local' }) });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    }));
    let writeRequests = 0;
    let stateRequests = 0;
    const latencies = [];
    const request = async (index, route, body) => {
      writeRequests += 1;
      const start = performance.now();
      const response = await fetch(base + route, { method: 'POST', headers: { cookie: cookies[index], 'content-type': 'application/json' }, body: JSON.stringify(body) });
      latencies.push(performance.now() - start);
      return response;
    };
    const started = performance.now();
    await Promise.all(users.map(async (user, index) => {
      const autoSessionId = randomUUID();
      const route = index % 2 ? '/api/casino/slots/play' : '/api/casino/play';
      const walletSource = index % 3 ? 'promotional' : 'shop';
      let lastRequestId;
      let firstBalance;
      let lastBalance;
      for (let spin = 0; spin < 30; spin += 1) {
        const requestId = randomUUID();
        const response = await request(index, route, { requestId, autoSessionId, bet: 1, walletSource, compact: true });
        const raw = await response.text();
        assert.equal(response.status, 200, `${user.username} spin ${spin + 1}: ${raw.slice(0, 300)}`);
        assert.ok(raw.length < 3000, 'automatic response should not contain full portal state');
        const data = JSON.parse(raw);
        assert.equal(data.casinoResult.requestId, requestId);
        assert.ok(Number.isFinite(data.casinoBalances[walletSource]));
        if (index === 0 && spin === 0) {
          const competing = await request(index, route, { requestId: randomUUID(), autoSessionId: randomUUID(), bet: 1, walletSource, compact: true });
          assert.equal(competing.status, 409, 'second automatic sequence must be blocked');
          const manual = await request(index, route, { requestId: randomUUID(), bet: 1, walletSource });
          assert.equal(manual.status, 409, 'manual play must not race an active automatic sequence');
        }
        if (spin === 0) firstBalance = data.casinoBalances[walletSource];
        lastBalance = data.casinoBalances[walletSource];
        lastRequestId = requestId;
      }
      assert.ok(Number.isFinite(firstBalance) && Number.isFinite(lastBalance));
      const limit = await request(index, route, { requestId: randomUUID(), autoSessionId, bet: 1, walletSource, compact: true });
      assert.equal(limit.status, 409);
      const replay = await request(index, route, { requestId: lastRequestId, autoSessionId, bet: 1, walletSource, compact: true });
      assert.equal(replay.status, 200, 'same request may be recovered after reaching the limit');
      const stop = await request(index, '/api/casino/auto/stop', { autoSessionId });
      assert.equal(stop.status, 200);
      stateRequests += 1;
      const state = await (await fetch(base + '/api/state', { headers: { cookie: cookies[index] } })).json();
      assert.ok(state.casino.totalPlays >= 30);
      assert.ok(state.casino.playsToday >= 30);
    }));
    const elapsed = Math.round(performance.now() - started);
    latencies.sort((a, b) => a - b);
    console.log(JSON.stringify({ users: 6, plays: 180, writeRequests, stateRequests, elapsedMs: elapsed, p95WriteMs: Math.round(latencies[Math.floor(latencies.length * .95)]) }));
    const stored = JSON.parse(String((await database.prepare('SELECT data FROM app_state WHERE id = 1').first()).data));
    assert.equal(stored.economy.casinoPlays.length, 180);
    for (const user of users) assert.equal(stored.economy.casinoPlays.filter((play) => play.userId === user.id).length, 30);
    assert.equal(writeRequests, 200);
    assert.equal(stateRequests, 6);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
