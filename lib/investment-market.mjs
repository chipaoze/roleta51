import { createHash, randomUUID } from 'node:crypto';

export const MARKET_ASSETS = Object.freeze([
  { id: 'nebula', name: 'Nebula Coin', icon: '🌌', initialPrice: 120, volatility: 0.08, trend: 0.01 },
  { id: 'titan', name: 'Titan Coin', icon: '🪐', initialPrice: 350, volatility: 0.05, trend: -0.005 },
  { id: 'lunar', name: 'Lunar Coin', icon: '🌙', initialPrice: 80, volatility: 0.12, trend: 0.015 },
  { id: 'plasma', name: 'Plasma Coin', icon: '⚡', initialPrice: 210, volatility: 0.1, trend: 0.0 },
  { id: 'terra', name: 'Terra Coin', icon: '🌍', initialPrice: 160, volatility: 0.045, trend: 0.008 },
  { id: 'void', name: 'Void Coin', icon: '🕳️', initialPrice: 500, volatility: 0.16, trend: -0.01 },
]);

function slotKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  // Oito janelas fixas no fuso de São Paulo (a cada 3 horas: 00h, 03h,
  // 06h, 09h, 12h, 15h, 18h e 21h). A sincronização continua idempotente:
  // somente a primeira chamada de cada janela persiste uma nova cotação no D1.
  return `${get('year')}-${get('month')}-${get('day')}:s${Math.floor(Number(get('hour')) / 3)}`;
}

function signedNoise(key) {
  const byte = createHash('sha256').update(key).digest()[0];
  return (byte / 255) * 2 - 1;
}

function roundCents(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function ensureMarketState(economy) {
  if (!economy.investmentMarket || typeof economy.investmentMarket !== 'object') economy.investmentMarket = {};
  const market = economy.investmentMarket;
  if (!market.prices || typeof market.prices !== 'object') market.prices = Object.fromEntries(MARKET_ASSETS.map((asset) => [asset.id, asset.initialPrice]));
  if (!market.portfolios || typeof market.portfolios !== 'object') market.portfolios = {};
  if (!Array.isArray(market.ledger)) market.ledger = [];
  if (!Array.isArray(market.history)) market.history = [];
  if (!Array.isArray(market.dividendSlots)) market.dividendSlots = [];
  if (!market.previousPrices || typeof market.previousPrices !== 'object') market.previousPrices = {};
  if (!market.slotKey) market.slotKey = slotKey();
  return market;
}

export function advanceMarket(economy, now = new Date()) {
  const market = ensureMarketState(economy);
  const nextSlot = slotKey(now);
  if (market.slotKey === nextSlot) return false;
  market.previousPrices = { ...market.prices };
  MARKET_ASSETS.forEach((asset) => {
    const previous = Number(market.prices[asset.id] || asset.initialPrice);
    const movement = asset.trend + signedNoise(`${nextSlot}:${asset.id}`) * asset.volatility;
    market.prices[asset.id] = Math.max(10, roundCents(previous * (1 + movement)));
  });
  market.slotKey = nextSlot;
  market.updatedAt = now.toISOString();
  market.history.push({ id: randomUUID(), slotKey: nextSlot, prices: { ...market.prices }, createdAt: market.updatedAt });
  if (market.history.length > 240) market.history = market.history.slice(-240);
  return true;
}

export function marketForUser(economy, userId) {
  const market = ensureMarketState(economy);
  const portfolio = market.portfolios[userId] || {};
  const userLedger = market.ledger.filter((entry) => entry.userId === userId).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const costBasisByAsset = Object.fromEntries(MARKET_ASSETS.map((asset) => [asset.id, { quantity: 0, cost: 0, bought: 0, boughtCost: 0, sold: 0, soldProceeds: 0, lastPurchaseAt: null }]));
  for (const entry of userLedger) {
    const state = costBasisByAsset[entry.assetId];
    if (!state) continue;
    const quantity = Math.max(0, Number(entry.quantity || 0));
    const total = roundCents(entry.total || Number(entry.price || 0) * quantity);
    if (entry.side === 'buy') {
      state.quantity += quantity;
      state.cost = roundCents(state.cost + total);
      state.bought += quantity;
      state.boughtCost = roundCents(state.boughtCost + total);
      state.lastPurchaseAt = entry.createdAt || state.lastPurchaseAt;
    } else if (entry.side === 'sell') {
      const averageCost = state.quantity > 0 ? state.cost / state.quantity : 0;
      state.quantity = Math.max(0, state.quantity - quantity);
      state.cost = roundCents(Math.max(0, state.cost - averageCost * quantity));
      state.sold += quantity;
      state.soldProceeds = roundCents(state.soldProceeds + total);
    }
  }
  const assets = MARKET_ASSETS.map((asset) => {
    const price = roundCents(market.prices[asset.id] || asset.initialPrice);
    const previousPrice = roundCents(market.previousPrices[asset.id] || price);
    const change = roundCents(price - previousPrice);
    const quantity = Math.max(0, Number(portfolio[asset.id] || 0));
    const accounting = costBasisByAsset[asset.id];
    const costBasis = quantity > 0 ? roundCents(accounting.cost) : 0;
    const positionValue = roundCents(price * quantity);
    const unrealizedPnl = roundCents(positionValue - costBasis);
    return { ...asset, price, previousPrice, change, changePercent: previousPrice ? (change / previousPrice) * 100 : 0, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', quantity, positionValue, costBasis, averagePrice: quantity > 0 ? roundCents(costBasis / quantity) : 0, unrealizedPnl, holdingChangePercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0, totalBought: accounting.bought, totalBoughtCost: accounting.boughtCost, totalSold: accounting.sold, totalSoldProceeds: accounting.soldProceeds, lastPurchaseAt: accounting.lastPurchaseAt };
  });
  const holdingsValue = assets.reduce((sum, asset) => sum + asset.price * asset.quantity, 0);
  const investedCost = roundCents(assets.reduce((sum, asset) => sum + asset.costBasis, 0));
  const unrealizedPnl = roundCents(holdingsValue - investedCost);
  return { assets, holdingsValue: roundCents(holdingsValue), investedCost, unrealizedPnl, unrealizedPnlPercent: investedCost > 0 ? (unrealizedPnl / investedCost) * 100 : 0, portfolio: Object.fromEntries(assets.map((asset) => [asset.id, asset.quantity])), updatedAt: market.updatedAt || null, nextUpdate: null, history: market.history.slice(-12).reverse() };
}

export function transactMarket(economy, userId, assetId, quantity, side, now = new Date()) {
  const market = ensureMarketState(economy);
  const asset = MARKET_ASSETS.find((item) => item.id === assetId);
  if (!asset) throw new Error('Ativo não encontrado.');
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) throw new Error('A quantidade precisa ser um inteiro entre 1 e 100.000.');
  const price = roundCents(market.prices[asset.id] || asset.initialPrice);
  const total = roundCents(price * amount);
  const portfolio = market.portfolios[userId] ||= {};
  if (side === 'sell' && Number(portfolio[asset.id] || 0) < amount) throw new Error('Você não possui essa quantidade para vender.');
  portfolio[asset.id] = Math.max(0, Number(portfolio[asset.id] || 0) + (side === 'buy' ? amount : -amount));
  return { id: randomUUID(), assetId, side, quantity: amount, price, total, createdAt: now.toISOString() };
}
