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
  return `${get('year')}-${get('month')}-${get('day')}:${Number(get('hour')) < 12 ? 'am' : 'pm'}`;
}

function signedNoise(key) {
  const byte = createHash('sha256').update(key).digest()[0];
  return (byte / 255) * 2 - 1;
}

export function ensureMarketState(economy) {
  if (!economy.investmentMarket || typeof economy.investmentMarket !== 'object') economy.investmentMarket = {};
  const market = economy.investmentMarket;
  if (!market.prices || typeof market.prices !== 'object') market.prices = Object.fromEntries(MARKET_ASSETS.map((asset) => [asset.id, asset.initialPrice]));
  if (!market.portfolios || typeof market.portfolios !== 'object') market.portfolios = {};
  if (!Array.isArray(market.ledger)) market.ledger = [];
  if (!Array.isArray(market.history)) market.history = [];
  if (!market.slotKey) market.slotKey = slotKey();
  return market;
}

export function advanceMarket(economy, now = new Date()) {
  const market = ensureMarketState(economy);
  const nextSlot = slotKey(now);
  if (market.slotKey === nextSlot) return false;
  MARKET_ASSETS.forEach((asset) => {
    const previous = Number(market.prices[asset.id] || asset.initialPrice);
    const movement = asset.trend + signedNoise(`${nextSlot}:${asset.id}`) * asset.volatility;
    market.prices[asset.id] = Math.max(10, Math.round(previous * (1 + movement)));
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
  const assets = MARKET_ASSETS.map((asset) => ({ ...asset, price: Number(market.prices[asset.id] || asset.initialPrice), quantity: Math.max(0, Number(portfolio[asset.id] || 0)) }));
  const holdingsValue = assets.reduce((sum, asset) => sum + asset.price * asset.quantity, 0);
  return { assets, holdingsValue, portfolio: Object.fromEntries(assets.map((asset) => [asset.id, asset.quantity])), updatedAt: market.updatedAt || null, nextUpdate: null, history: market.history.slice(-12).reverse() };
}

export function transactMarket(economy, userId, assetId, quantity, side, now = new Date()) {
  const market = ensureMarketState(economy);
  const asset = MARKET_ASSETS.find((item) => item.id === assetId);
  if (!asset) throw new Error('Ativo não encontrado.');
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) throw new Error('A quantidade precisa ser um inteiro entre 1 e 100.000.');
  const price = Number(market.prices[asset.id] || asset.initialPrice);
  const total = price * amount;
  const portfolio = market.portfolios[userId] ||= {};
  if (side === 'sell' && Number(portfolio[asset.id] || 0) < amount) throw new Error('Você não possui essa quantidade para vender.');
  portfolio[asset.id] = Math.max(0, Number(portfolio[asset.id] || 0) + (side === 'buy' ? amount : -amount));
  return { id: randomUUID(), assetId, side, quantity: amount, price, total, createdAt: now.toISOString() };
}
