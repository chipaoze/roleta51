import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8791';
const phase = process.argv[3] || 'all';
const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'premium_sale_smoke', password: 'premium-sale-smoke-only' }) });
assert.equal(login.status, 200, 'login de teste');
const cookie = String(login.headers.get('set-cookie')).split(';')[0];
const open = () => fetch(base + '/api/cobblemon/box/open', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ boxId: 'master' }) });
const first = await open();
assert.equal(first.status, 200, 'abertura do Premium');
const opened = await first.json();
assert.equal(opened.reward.status, 'decision-pending');
assert.equal(opened.reward.premiumSaleEligible, true);
assert.equal(opened.reward.forceDelivery, false);
assert.ok([550, 700, 900, 1100].includes(opened.reward.sellPrice), 'preço vem da tabela do servidor');
const sell = () => fetch(base + '/api/cobblemon/reward/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ id: opened.reward.id, action: 'sell' }) });
const sales = await Promise.all([sell(), sell()]);
const statuses = sales.map((response) => response.status).sort();
assert.equal(statuses.filter((status) => status === 200).length, 1, 'apenas uma venda da mesma recompensa é concluída');
assert.equal(statuses.some((status) => status === 404 || status === 409), true, 'a repetição é recusada sem novo crédito');
const stateAfterSale = await (await fetch(base + '/api/state', { headers: { Cookie: cookie } })).json();
assert.equal(stateAfterSale.profile.cobblemon.deliveries.some((entry) => entry.id === opened.reward.id && entry.status === 'sold'), true);
assert.equal(stateAfterSale.profile.wallet, Math.round((5000 - 1499.9 + opened.reward.sellPrice) * 100) / 100);
if (phase === 'sale') {
  console.log(JSON.stringify({ ok: true, salePrice: opened.reward.sellPrice, statuses }));
  process.exit(0);
}
const second = await open();
assert.equal(second.status, 200, 'segunda abertura Premium');
const secondOpened = await second.json();
const keep = await fetch(base + '/api/cobblemon/reward/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ id: secondOpened.reward.id, action: 'keep' }) });
assert.equal(keep.status, 200, 'receber o item');
const kept = await keep.json();
assert.equal(kept.profile.cobblemon.deliveries.some((entry) => entry.id === secondOpened.reward.id && entry.status === 'awaiting-delivery'), true);
console.log(JSON.stringify({ ok: true, salePrice: opened.reward.sellPrice, statuses, keptStatus: 'awaiting-delivery' }));
