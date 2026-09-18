import { createHash, randomUUID } from 'node:crypto';

export const MARKET_ASSETS = Object.freeze([
  { id: 'nebula', name: 'Nebula Coin', icon: '🌌', initialPrice: 120, volatility: 0.08, trend: 0.01 },
  { id: 'titan', name: 'Titan Coin', icon: '🪐', initialPrice: 350, volatility: 0.05, trend: -0.005 },
  { id: 'lunar', name: 'Lunar Coin', icon: '🌙', initialPrice: 80, volatility: 0.12, trend: 0.015 },
  { id: 'plasma', name: 'Plasma Coin', icon: '⚡', initialPrice: 210, volatility: 0.1, trend: 0.0 },
  { id: 'terra', name: 'Terra Coin', icon: '🌍', initialPrice: 160, volatility: 0.045, trend: 0.008 },
  { id: 'void', name: 'Void Coin', icon: '🕳️', initialPrice: 500, volatility: 0.16, trend: -0.01 },
]);
export const MARKET_TIME_ZONE = 'America/Sao_Paulo';
// A plataforma fica aberta das 08h às 17h. As doze sincronizações ficam
// sendo disparadas apenas na primeira chamada do servidor após cada horário;
// fora dessa janela nenhuma cotação é alterada.
export const MARKET_UPDATE_TIMES = Object.freeze([
  '08:00', '08:45', '09:30', '10:15',
  '11:00', '11:45', '12:30', '13:15',
  '14:00', '14:45', '15:30', '16:15',
]);
const MARKET_UPDATE_MINUTES = Object.freeze(MARKET_UPDATE_TIMES.map((time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}));

function localMarketParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MARKET_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minuteOfDay: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function marketSlotKey(date = new Date()) {
  const local = localMarketParts(date);
  let slotIndex = -1;
  MARKET_UPDATE_MINUTES.forEach((minute, index) => {
    if (local.minuteOfDay >= minute) slotIndex = index;
  });
  // Antes da abertura, a cotação vigente ainda é a última da sessão anterior.
  // Isso evita uma atualização noturna ou de madrugada.
  if (slotIndex < 0) {
    const previous = localMarketParts(new Date(date.getTime() - 24 * 60 * 60 * 1000));
    return `${previous.dateKey}:u${MARKET_UPDATE_TIMES.length - 1}`;
  }
  return `${local.dateKey}:u${slotIndex}`;
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
  if (!market.slotKey) market.slotKey = marketSlotKey();
  return market;
}

export function advanceMarket(economy, now = new Date()) {
  const market = ensureMarketState(economy);
  const nextSlot = marketSlotKey(now);
  // A cadência anterior também usava chaves u0…u7. Ao trocar a quantidade de
  // janelas, reposicionamos a sessão uma única vez para nunca voltar de u7
  // para uma janela menor no mesmo dia nem criar uma cotação artificial.
  if (market.scheduleVersion !== MARKET_UPDATE_TIMES.length) {
    market.scheduleVersion = MARKET_UPDATE_TIMES.length;
    market.slotKey = nextSlot;
    // Essa chamada apenas migra a chave persistida; não houve nova cotação,
    // então ela também não deve criar um dividendo extra.
    if (market.updatedAt && !market.dividendSlots.includes(nextSlot)) market.dividendSlots.push(nextSlot);
    return true;
  }
  // Migra a chave da cadência antiga (00h–21h) sem criar uma cotação
  // artificial durante a publicação da nova janela operacional.
  if (/:s\d+$/.test(String(market.slotKey))) {
    market.slotKey = nextSlot;
    return true;
  }
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
  return { assets, holdingsValue: roundCents(holdingsValue), investedCost, unrealizedPnl, unrealizedPnlPercent: investedCost > 0 ? (unrealizedPnl / investedCost) * 100 : 0, portfolio: Object.fromEntries(assets.map((asset) => [asset.id, asset.quantity])), updatedAt: market.updatedAt || null, nextUpdate: null, updateSchedule: { timeZone: MARKET_TIME_ZONE, times: [...MARKET_UPDATE_TIMES] }, history: market.history.slice(-12).reverse() };
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
