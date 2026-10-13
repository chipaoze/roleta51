import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8790';
const login = await fetch(base + '/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'resilience_smoke', password: 'smoke-test-only-51' }),
});
assert.equal(login.status, 200, 'login de teste');
const cookie = String(login.headers.get('set-cookie')).split(';')[0];
assert.match(cookie, /^sorteios_session=/);
const secondLogin = await fetch(base + '/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'resilience_smoke_2', password: 'smoke-test-only-51' }),
});
assert.equal(secondLogin.status, 200, 'login do segundo usuário');
const secondCookie = String(secondLogin.headers.get('set-cookie')).split(';')[0];
const sell = () => fetch(base + '/api/mystery-boxes/sell', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ inventoryId: 'smoke-box-compact', compact: true }),
});
const concurrent = await Promise.all([sell(), sell()]);
const statuses = concurrent.map((response) => response.status).sort();
assert.equal(statuses.filter((status) => status === 200).length, 1, 'exatamente uma venda aceita');
assert.equal(statuses.some((status) => status === 404 || status === 409), true, 'duplicada recusada antes ou depois da primeira venda');
const success = concurrent.find((response) => response.status === 200);
const compact = await success.json();
assert.equal(compact.profile.wallet, 1080);
assert.equal(compact.profile.mysteryBoxes.some((entry) => entry.id === 'smoke-box-compact'), false);
assert.equal('settings' in compact, false, 'resposta compacta não carrega o portal inteiro');

const legacy = await fetch(base + '/api/mystery-boxes/sell', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ inventoryId: 'smoke-box-legacy' }),
});
assert.equal(legacy.status, 200, 'cliente antigo continua compatível');
const full = await legacy.json();
assert.equal(full.profile.wallet, 1160);
assert.ok(full.settings && full.me, 'resposta antiga permanece completa');

const sellFor = (inventoryId, sessionCookie) => fetch(base + '/api/mystery-boxes/sell', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
  body: JSON.stringify({ inventoryId, compact: true }),
});
const differentUsers = await Promise.all([
  sellFor('smoke-box-user-a', cookie),
  sellFor('smoke-box-user-b', secondCookie),
]);
assert.deepEqual(differentUsers.map((response) => response.status), [200, 200], 'usuários diferentes vendem normalmente');

const state = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
assert.equal(state.status, 200);
const finalState = await state.json();
assert.equal(finalState.profile.wallet, 1240);
assert.equal(finalState.profile.mysteryBoxes.some((entry) => entry.userId === 'resilience-smoke-user'), false);
console.log(JSON.stringify({ ok: true, statuses, finalWallet: finalState.profile.wallet }));
