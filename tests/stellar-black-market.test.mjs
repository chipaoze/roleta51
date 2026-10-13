import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const server = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('Mercado Negro compra cosméticos próprios não equipados, inclusive prêmios de baú, sem interferir no empréstimo', () => {
  assert.match(server, /function stellarBlackMarketOffers\(userId\)/);
  assert.match(server, /purchases\.filter\(\(purchase\) => purchase\.userId === userId\)\.map/);
  assert.match(server, /function stellarItemValue\(purchase, item\)/);
  assert.match(server, /base \* \.6/);
  assert.match(server, /const basePrice = Number\(purchase\.originalPrice \?\? purchase\.price \?\? item\?\.price \?\? 0\)/);
  assert.match(server, /purchase\.mysteryDecisionPending \|\| basePrice <= 0 \|\| reserved\.has\(purchase\.id\)/);
  assert.match(server, /route === '\/api\/black-market\/sell'/);
  assert.match(server, /mode: 'stellar-black-market-sale'/);
  assert.match(server, /purchases = db\.economy\.purchases\.filter\(\(entry\) => entry\.id !== purchase\.id\)/);
  assert.doesNotMatch(server.slice(server.indexOf("route === '/api/black-market/sell'"), server.indexOf("route === '/api/loans/borrow'")), /remainingDue/);
  assert.match(app, /blackMarket\.id = 'stellarBlackMarket'/);
  assert.match(app, /data-black-market-sale/);
});
