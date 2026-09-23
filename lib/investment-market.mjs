import { createHash, randomUUID } from 'node:crypto';

export const MARKET_ASSETS = Object.freeze([
  { id: 'nebula', name: 'Nebula Coin', icon: '🌌', initialPrice: 120, dailyDrift: 0.0015, noise: 0.022, regimeStrength: 0.008, maxWindowMove: 0.055, dailyLossLimit: 0.16, liquidity: 3600 },
  { id: 'titan', name: 'Titan Coin', icon: '🪐', initialPrice: 350, dailyDrift: 0.0005, noise: 0.014, regimeStrength: 0.005, maxWindowMove: 0.04, dailyLossLimit: 0.12, liquidity: 10500 },
  { id: 'lunar', name: 'Lunar Coin', icon: '🌙', initialPrice: 80, dailyDrift: 0.002, noise: 0.03, regimeStrength: 0.012, maxWindowMove: 0.07, dailyLossLimit: 0.18, liquidity: 2400 },
  { id: 'plasma', name: 'Plasma Coin', icon: '⚡', initialPrice: 210, dailyDrift: 0.0005, noise: 0.026, regimeStrength: 0.009, maxWindowMove: 0.06, dailyLossLimit: 0.17, liquidity: 6300 },
  { id: 'terra', name: 'Terra Coin', icon: '🌍', initialPrice: 160, dailyDrift: 0.001, noise: 0.012, regimeStrength: 0.0045, maxWindowMove: 0.035, dailyLossLimit: 0.12, liquidity: 4800 },
  { id: 'void', name: 'Void Coin', icon: '🕳️', initialPrice: 500, dailyDrift: 0.0005, noise: 0.04, regimeStrength: 0.018, maxWindowMove: 0.08, dailyLossLimit: 0.20, liquidity: 15000 },
  { id: 'solar', name: 'Solar Coin', icon: '☀️', initialPrice: 145, dailyDrift: 0.001, noise: 0.028, regimeStrength: 0.010, maxWindowMove: 0.065, dailyLossLimit: 0.17, liquidity: 4300 },
  { id: 'comet', name: 'Cometa Coin', icon: '☄️', initialPrice: 65, dailyDrift: 0.0015, noise: 0.04, regimeStrength: 0.015, maxWindowMove: 0.08, dailyLossLimit: 0.20, liquidity: 2000 },
]);
export const MARKET_TIME_ZONE = 'America/Sao_Paulo';
// A plataforma fica aberta das 08h às 17h. As 36 sincronizações ficam
// sendo disparadas apenas na primeira chamada do servidor após cada horário;
// fora dessa janela nenhuma cotação é alterada.
export const MARKET_UPDATE_TIMES = Object.freeze(Array.from({ length: 36 }, (_, index) => {
  const minutes = 8 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}));
const MARKET_UPDATE_MINUTES = Object.freeze(MARKET_UPDATE_TIMES.map((time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}));
const MARKET_PRICING_VERSION = 4;
const MARKET_MAX_DEMAND_IMPACT = 0.045;
const MARKET_MAX_USER_FLOW_SHARE = 0.4;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dateKeyFromSlot(slotKey) {
  return String(slotKey || '').split(':')[0] || '';
}

function regimeFor(asset, slotKey) {
  const signal = signedNoise(`market-regime:${dateKeyFromSlot(slotKey)}:${asset.id}`);
  if (signal > 0.34) return { id: 'up', label: 'Em alta', dailyDrift: asset.regimeStrength };
  if (signal < -0.34) return { id: 'down', label: 'Em baixa', dailyDrift: -asset.regimeStrength };
  return { id: 'flat', label: 'Oscilando', dailyDrift: 0 };
}

function orderPressureForSlot(market, asset, slotKey) {
  const byUser = new Map();
  for (const entry of market.ledger) {
    if (entry.assetId !== asset.id || entry.marketSlotKey !== slotKey) continue;
    const signedTotal = Number(entry.total || 0) * (entry.side === 'buy' ? 1 : -1);
    byUser.set(entry.userId, (byUser.get(entry.userId) || 0) + signedTotal);
  }
  const perUserLimit = asset.liquidity * MARKET_MAX_USER_FLOW_SHARE;
  const netFlow = [...byUser.values()].reduce((sum, total) => sum + clamp(total, -perUserLimit, perUserLimit), 0);
  return {
    netFlow: roundCents(netFlow),
    impact: clamp((netFlow / asset.liquidity) * MARKET_MAX_DEMAND_IMPACT, -MARKET_MAX_DEMAND_IMPACT, MARKET_MAX_DEMAND_IMPACT),
  };
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
  if (!market.dayOpenPrices || typeof market.dayOpenPrices !== 'object') market.dayOpenPrices = { ...market.prices };
  if (!market.lastDrivers || typeof market.lastDrivers !== 'object') market.lastDrivers = {};
  // Novas moedas entram pelo preço inicial, sem recalcular as posições antigas.
  for (const asset of MARKET_ASSETS) {
    if (!Number.isFinite(Number(market.prices[asset.id])) || Number(market.prices[asset.id]) <= 0) {
      market.prices[asset.id] = asset.initialPrice;
      market.previousPrices[asset.id] = asset.initialPrice;
      market.dayOpenPrices[asset.id] = asset.initialPrice;
    }
  }
  return market;
}

export function advanceMarket(economy, now = new Date()) {
  const market = ensureMarketState(economy);
  const nextSlot = marketSlotKey(now);
  // A primeira execução do motor novo preserva exatamente a cotação em
  // produção. Ela apenas marca a janela atual; nenhuma compra, saldo ou
  // histórico antigo é recalculado.
  if (market.scheduleVersion !== MARKET_UPDATE_TIMES.length || market.pricingVersion !== MARKET_PRICING_VERSION) {
    market.scheduleVersion = MARKET_UPDATE_TIMES.length;
    market.pricingVersion = MARKET_PRICING_VERSION;
    market.slotKey = nextSlot;
    market.priceGuardDate = dateKeyFromSlot(nextSlot);
    market.dayOpenPrices = { ...market.prices };
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
  const previousSlot = market.slotKey;
  const nextDateKey = dateKeyFromSlot(nextSlot);
  if (market.priceGuardDate !== nextDateKey) {
    market.priceGuardDate = nextDateKey;
    market.dayOpenPrices = { ...market.prices };
  }
  market.previousPrices = { ...market.prices };
  const drivers = {};
  MARKET_ASSETS.forEach((asset) => {
    const previous = Number(market.prices[asset.id] || asset.initialPrice);
    const regime = regimeFor(asset, nextSlot);
    const pressure = orderPressureForSlot(market, asset, previousSlot);
    // O humor diário e as ordens da equipe direcionam o mercado. A variação
    // por janela agora é visível mesmo sem uma ordem, dentro dos tetos do ativo.
    const baseline = asset.dailyDrift / MARKET_UPDATE_TIMES.length + regime.dailyDrift / 12;
    const noise = signedNoise(`market-noise:${nextSlot}:${asset.id}`) * asset.noise;
    const movement = clamp(baseline + pressure.impact + noise, -asset.maxWindowMove, asset.maxWindowMove);
    const dayOpen = Number(market.dayOpenPrices[asset.id] || previous);
    const dailyFloor = dayOpen * (1 - asset.dailyLossLimit);
    market.prices[asset.id] = roundCents(Math.max(10, dailyFloor, roundCents(previous * (1 + movement))));
    drivers[asset.id] = { phase: regime.id, phaseLabel: regime.label, netFlow: pressure.netFlow, demandImpact: pressure.impact, stabilized: market.prices[asset.id] <= roundCents(dailyFloor) };
  });
  market.slotKey = nextSlot;
  market.lastDrivers = drivers;
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
    const driver = market.lastDrivers[asset.id] || { phase: regimeFor(asset, market.slotKey).id, phaseLabel: regimeFor(asset, market.slotKey).label, netFlow: 0, demandImpact: 0, stabilized: false };
    return { ...asset, price, previousPrice, change, changePercent: previousPrice ? (change / previousPrice) * 100 : 0, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', quantity, positionValue, costBasis, averagePrice: quantity > 0 ? roundCents(costBasis / quantity) : 0, unrealizedPnl, holdingChangePercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0, totalBought: accounting.bought, totalBoughtCost: accounting.boughtCost, totalSold: accounting.sold, totalSoldProceeds: accounting.soldProceeds, lastPurchaseAt: accounting.lastPurchaseAt, marketDriver: driver };
  });
  const holdingsValue = assets.reduce((sum, asset) => sum + asset.price * asset.quantity, 0);
  const investedCost = roundCents(assets.reduce((sum, asset) => sum + asset.costBasis, 0));
  const unrealizedPnl = roundCents(holdingsValue - investedCost);
  // O livro de ordens já alimenta o custo médio. Exibi-lo não altera a
  // carteira nem cria uma segunda cópia no banco.
  const transactions = userLedger.slice().reverse().map((entry) => ({
    id: entry.id,
    assetId: entry.assetId,
    assetName: MARKET_ASSETS.find((asset) => asset.id === entry.assetId)?.name || entry.assetId,
    side: entry.side,
    quantity: entry.quantity,
    price: entry.price,
    total: entry.total,
    createdAt: entry.createdAt,
  }));
  return { assets, holdingsValue: roundCents(holdingsValue), investedCost, unrealizedPnl, unrealizedPnlPercent: investedCost > 0 ? (unrealizedPnl / investedCost) * 100 : 0, portfolio: Object.fromEntries(assets.map((asset) => [asset.id, asset.quantity])), transactions, updatedAt: market.updatedAt || null, nextUpdate: null, updateSchedule: { timeZone: MARKET_TIME_ZONE, times: [...MARKET_UPDATE_TIMES] }, history: market.history.slice(-12).reverse() };
}

// Rankings and dividend checks only need the value currently invested. They
// must not rebuild each person's transaction history and cost basis, which is
// considerably more expensive as the market ledger grows.
export function marketHoldingsValueForUser(economy, userId) {
  const market = ensureMarketState(economy);
  const portfolio = market.portfolios[userId] || {};
  return roundCents(MARKET_ASSETS.reduce((sum, asset) => {
    const price = roundCents(market.prices[asset.id] || asset.initialPrice);
    return sum + price * Math.max(0, Number(portfolio[asset.id] || 0));
  }, 0));
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
  return { id: randomUUID(), assetId, side, quantity: amount, price, total, marketSlotKey: market.slotKey, createdAt: now.toISOString() };
}
