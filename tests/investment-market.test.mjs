import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ASSETS, ensureMarketState, advanceMarket, marketForUser, transactMarket } from '../lib/investment-market.mjs';

test('mercado interno inicializa seis ativos e cotação controlada pelo servidor', () => {
  const economy = {};
  const market = ensureMarketState(economy);
  assert.equal(MARKET_ASSETS.length, 6);
  assert.deepEqual(Object.keys(market.prices), MARKET_ASSETS.map((asset) => asset.id));
  assert.equal(market.portfolios.user?.nebula || 0, 0);
});

test('cotação só avança uma vez por janela e carteira compra/vende por preço atual', () => {
  const economy = {}; ensureMarketState(economy);
  const first = advanceMarket(economy, new Date('2026-09-16T12:00:00Z'));
  const second = advanceMarket(economy, new Date('2026-09-16T13:00:00Z'));
  assert.equal(first, true); assert.equal(second, false);
  const buy = transactMarket(economy, 'user', 'nebula', 2, 'buy');
  assert.equal(buy.total, buy.price * 2);
  const sell = transactMarket(economy, 'user', 'nebula', 1, 'sell');
  assert.equal(sell.total, sell.price);
  assert.equal(marketForUser(economy, 'user').portfolio.nebula, 1);
});

test('venda não permite quantidade maior que a carteira', () => {
  const economy = {}; ensureMarketState(economy);
  assert.throws(() => transactMarket(economy, 'user', 'void', 1, 'sell'), /não possui/);
});
