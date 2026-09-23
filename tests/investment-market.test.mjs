import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ASSETS, MARKET_UPDATE_TIMES, marketSlotKey, ensureMarketState, advanceMarket, marketForUser, marketHoldingsValueForUser, transactMarket } from '../lib/investment-market.mjs';

test('36 janelas de 15 minutos terminam às 16h45 sem avanço noturno', () => {
  assert.equal(MARKET_UPDATE_TIMES.length, 36);
  assert.equal(MARKET_UPDATE_TIMES[0], '08:00');
  assert.equal(MARKET_UPDATE_TIMES.at(-1), '16:45');
  assert.equal(marketSlotKey(new Date('2026-09-22T19:29:00Z')), '2026-09-22:u33');
  assert.equal(marketSlotKey(new Date('2026-09-22T19:30:00Z')), '2026-09-22:u34');
  assert.equal(marketSlotKey(new Date('2026-09-22T20:00:00Z')), '2026-09-22:u35');
});

test('mercado interno inicializa oito ativos e cotação controlada pelo servidor', () => {
  const economy = {};
  const market = ensureMarketState(economy);
  assert.equal(MARKET_ASSETS.length, 8);
  assert.deepEqual(Object.keys(market.prices), MARKET_ASSETS.map((asset) => asset.id));
  assert.equal(market.portfolios.user?.nebula || 0, 0);
});

test('novas moedas entram antes da janela sem alterar preços ou posições existentes', () => {
  const economy = { investmentMarket: { prices: { nebula: 151.23, void: 488.75 }, portfolios: { user: { nebula: 2 } }, ledger: [{ id: 'old' }], history: [], dividendSlots: [], previousPrices: {}, dayOpenPrices: {}, slotKey: '2026-09-22:u32', scheduleVersion: 36, pricingVersion: 4 } };
  const market = ensureMarketState(economy);
  assert.equal(market.prices.nebula, 151.23);
  assert.equal(market.prices.void, 488.75);
  assert.equal(market.prices.solar, 145);
  assert.equal(market.prices.comet, 65);
  assert.deepEqual(market.portfolios, { user: { nebula: 2 } });
  assert.deepEqual(market.ledger, [{ id: 'old' }]);
  assert.equal(advanceMarket(economy, new Date('2026-09-22T19:10:00Z')), false);
  assert.equal(advanceMarket(economy, new Date('2026-09-22T19:15:00Z')), true);
  assert.ok(market.history.at(-1).prices.solar > 0);
  assert.ok(market.history.at(-1).prices.comet > 0);
});

test('cotação só avança uma vez por janela e carteira compra/vende por preço atual', () => {
  const economy = {}; ensureMarketState(economy);
  const first = advanceMarket(economy, new Date('2026-09-16T11:00:00Z'));
  const second = advanceMarket(economy, new Date('2026-09-16T11:10:00Z'));
  assert.equal(first, true); assert.equal(second, false);
  const third = advanceMarket(economy, new Date('2026-09-16T11:15:00Z'));
  assert.equal(third, true);
  const buy = transactMarket(economy, 'user', 'nebula', 2, 'buy');
  assert.equal(buy.total, buy.price * 2);
  const sell = transactMarket(economy, 'user', 'nebula', 1, 'sell');
  assert.equal(sell.total, sell.price);
  const snapshot = marketForUser(economy, 'user');
  assert.equal(snapshot.portfolio.nebula, 1);
  assert.ok(['up', 'down', 'flat'].includes(snapshot.assets.find((asset) => asset.id === 'nebula').direction));
  assert.equal(snapshot.assets.find((asset) => asset.id === 'nebula').positionValue, snapshot.assets.find((asset) => asset.id === 'nebula').price);
  assert.equal(Number(snapshot.assets.find((asset) => asset.id === 'nebula').price.toFixed(2)), snapshot.assets.find((asset) => asset.id === 'nebula').price);
});

test('histórico pessoal mostra o preço exato de cada compra e venda sem alterar posições', () => {
  const economy = {}; const market = ensureMarketState(economy);
  market.prices.nebula = 123.45;
  const buy = transactMarket(economy, 'user', 'nebula', 2, 'buy', new Date('2026-09-22T18:00:00Z'));
  market.ledger.push({ ...buy, userId: 'user' });
  market.prices.nebula = 135.67;
  const sell = transactMarket(economy, 'user', 'nebula', 1, 'sell', new Date('2026-09-22T19:00:00Z'));
  market.ledger.push({ ...sell, userId: 'user' });
  const before = JSON.stringify(market);
  const snapshot = marketForUser(economy, 'user');
  assert.deepEqual(snapshot.transactions.map(({ side, price, total, quantity }) => ({ side, price, total, quantity })), [
    { side: 'sell', price: 135.67, total: 135.67, quantity: 1 },
    { side: 'buy', price: 123.45, total: 246.9, quantity: 2 },
  ]);
  assert.equal(snapshot.portfolio.nebula, 1);
  assert.deepEqual(marketForUser(economy, 'other').transactions, []);
  assert.equal(JSON.stringify(market), before);
});

test('valor investido para ranking usa apenas preços e posições, sem reconstruir o histórico', () => {
  const economy = {}; const market = ensureMarketState(economy);
  market.prices.nebula = 123.45;
  market.portfolios.user = { nebula: 2, void: 1 };
  market.ledger = Array.from({ length: 200 }, (_, index) => ({ id: String(index), userId: 'user', assetId: 'nebula', side: 'buy', quantity: 1, total: 1 }));
  const before = JSON.stringify(market);
  assert.equal(marketHoldingsValueForUser(economy, 'user'), 2 * 123.45 + market.prices.void);
  assert.equal(JSON.stringify(market), before);
});

test('troca de cadência migra a sessão sem voltar para uma janela antiga', () => {
  const economy = { investmentMarket: { prices: Object.fromEntries(MARKET_ASSETS.map((asset) => [asset.id, asset.initialPrice])), portfolios: {}, ledger: [], history: [], dividendSlots: [], previousPrices: {}, slotKey: '2026-09-18:u7' } };
  const changed = advanceMarket(economy, new Date('2026-09-18T11:30:00Z')); // 08h30 BRT, primeira janela nova
  assert.equal(changed, true);
  assert.equal(economy.investmentMarket.scheduleVersion, 36);
  assert.equal(economy.investmentMarket.slotKey, '2026-09-18:u2');
  assert.equal(economy.investmentMarket.history.length, 0);
});

test('venda não permite quantidade maior que a carteira', () => {
  const economy = {}; ensureMarketState(economy);
  assert.throws(() => transactMarket(economy, 'user', 'void', 1, 'sell'), /não possui/);
});

test('motor de mercado novo preserva preço, compras e carteira existentes ao ser ativado', () => {
  const prices = Object.fromEntries(MARKET_ASSETS.map((asset) => [asset.id, asset.initialPrice * 1.37]));
  const ledger = [{ id: 'old-buy', userId: 'user', assetId: 'void', side: 'buy', quantity: 2, price: 685, total: 1370, createdAt: '2026-09-21T18:00:00.000Z' }];
  const economy = { investmentMarket: { prices: { ...prices }, portfolios: { user: { void: 2 } }, ledger: [...ledger], history: [], dividendSlots: ['2026-09-21:u11'], previousPrices: {}, slotKey: '2026-09-21:u11', scheduleVersion: 12, pricingVersion: 3, updatedAt: '2026-09-21T19:15:00.000Z' } };
  advanceMarket(economy, new Date('2026-09-22T11:00:00.000Z'));
  const market = economy.investmentMarket;
  assert.deepEqual(market.prices, prices);
  assert.deepEqual(market.portfolios, { user: { void: 2 } });
  assert.deepEqual(market.ledger, ledger);
  assert.equal(market.pricingVersion, 4);
  assert.equal(market.history.length, 0);
  assert.deepEqual(market.dividendSlots, ['2026-09-21:u11', '2026-09-22:u0']);
});

test('compras e vendas da equipe influenciam a janela seguinte com limite de pressão', () => {
  const buyEconomy = {}; const sellEconomy = {};
  ensureMarketState(buyEconomy); ensureMarketState(sellEconomy);
  const start = new Date('2026-09-22T11:00:00.000Z');
  advanceMarket(buyEconomy, start); advanceMarket(sellEconomy, start);
  buyEconomy.investmentMarket.ledger.push(transactMarket(buyEconomy, 'buyer', 'void', 10, 'buy', new Date('2026-09-22T11:10:00.000Z')));
  sellEconomy.investmentMarket.portfolios.seller = { void: 10 };
  sellEconomy.investmentMarket.ledger.push(transactMarket(sellEconomy, 'seller', 'void', 10, 'sell', new Date('2026-09-22T11:10:00.000Z')));
  advanceMarket(buyEconomy, new Date('2026-09-22T11:15:00.000Z'));
  advanceMarket(sellEconomy, new Date('2026-09-22T11:15:00.000Z'));
  assert.ok(buyEconomy.investmentMarket.prices.void > sellEconomy.investmentMarket.prices.void);
  assert.ok(buyEconomy.investmentMarket.lastDrivers.void.netFlow > 0);
  assert.ok(sellEconomy.investmentMarket.lastDrivers.void.netFlow < 0);
  assert.ok(Math.abs(buyEconomy.investmentMarket.lastDrivers.void.demandImpact) <= 0.045);
});

test('Void oscila mais, mas não perde mais de 20% no mesmo dia', () => {
  const economy = {}; ensureMarketState(economy);
  const dayStart = new Date('2026-09-22T11:00:00.000Z');
  advanceMarket(economy, dayStart);
  const opening = economy.investmentMarket.prices.void;
  for (let index = 1; index < 36; index += 1) {
    advanceMarket(economy, new Date(dayStart.getTime() + index * 15 * 60 * 1000));
  }
  assert.ok(economy.investmentMarket.prices.void >= Math.round(opening * 0.80 * 100) / 100);
});

test('novas janelas têm oscilação perceptível sem superar o teto por atualização', () => {
  const economy = {}; ensureMarketState(economy);
  const start = new Date('2026-09-23T11:00:00Z');
  advanceMarket(economy, start);
  const voidMoves = [];
  for (let index = 1; index < 36; index += 1) {
    const previous = { ...economy.investmentMarket.prices };
    advanceMarket(economy, new Date(start.getTime() + index * 15 * 60 * 1000));
    for (const asset of MARKET_ASSETS) {
      const move = economy.investmentMarket.prices[asset.id] / previous[asset.id] - 1;
      assert.ok(Math.abs(move) <= asset.maxWindowMove + 0.0002, `${asset.id} excedeu o teto da janela`);
      if (asset.id === 'void') voidMoves.push(move);
    }
  }
  assert.ok(voidMoves.some((move) => move >= 0.02));
  assert.ok(voidMoves.some((move) => move <= -0.015));
});
