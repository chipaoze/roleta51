import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('casino archive keeps recent results and an archived request cannot charge again', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'ops/legacy-server.production-session-api-wheel-20261026.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
  const salt = 'casino-archive-test';
  seed.users = [{ id: 'casino-user', username: 'casino-user', displayName: 'Teste', role: 'participant', active: true, approved: true, eligible: true, passwordSalt: salt, passwordHash: scryptSync('senha-local', salt, 64).toString('hex') }];
  seed.economy = { wallets: { 'casino-user': 100 }, casinoPlays: [], casinoFairnessRefundV1: true };
  for (const key of ['submissions', 'draws', 'votings', 'assignments', 'feedbackMessages', 'dailyMemes', 'dailyPhrases', 'anonymousPosts', 'waterEntries', 'rememberTokens', 'lieAccusations', 'gateAuthorizations']) seed[key] = [];
  seed.scores = {}; seed.communityVotes = [];
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  for (let index = 0; index < 30000; index += 1) {
    seed.economy.casinoPlays.push({ id: `play-${index}`, requestId: `request-${String(index).padStart(16, '0')}`, userId: 'casino-user', dayKey, walletSource: 'promotional', bet: 1, resultType: 'slots', multiplier: 0, payout: 0, net: -1, slots: { id: 'none', label: 'Sem combinação', symbols: ['alien'] }, balanceAfter: 100, createdAt });
  }
  let server;
  try {
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {} } }, seed);
    const stored = JSON.parse(String((await database.prepare('SELECT data FROM app_state WHERE id = 1').first()).data));
    assert.equal(stored.economy.casinoPlays.length, 6);
    assert.equal(stored.economy.casinoArchiveSummary.totalPlays, 29994);
    assert.equal(Number((await database.prepare('SELECT count(*) AS n FROM casino_play_archive').first()).n), 29994);
    server = http.createServer((req, res) => void module.requestHandler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'casino-user', password: 'senha-local' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const state = await (await fetch(base + '/api/state', { headers: { cookie } })).json();
    assert.equal(state.casino.playsToday, 30000);
    assert.equal(state.casino.totalPlays, 30000);
    assert.equal(state.casino.recentSlots.length, 6);
    const replay = await fetch(base + '/api/casino/slots/play', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: seed.economy.casinoPlays[0].requestId, bet: 1, walletSource: 'promotional', compact: true }) });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).casinoResult.id, 'play-0');
    assert.equal(Number((await database.prepare('SELECT count(*) AS n FROM casino_play_archive').first()).n), 29994);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
