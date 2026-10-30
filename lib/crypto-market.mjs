import { randomUUID } from 'node:crypto';

// O Cripto 51 é uma simulação: US$ 1 equivale a 1 Crédito 51 na cotação.
// Não existe depósito, saque, carteira ou
// conversão para dinheiro/cripto fora da Área 51.
export const CRYPTO_ASSETS = Object.freeze([
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin 51', icon: '₿', initialPrice: 1000, binance: 'BTCUSDT', coinbase: 'BTC-USD', kraken: 'XXBTZUSD' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum 51', icon: '◆', initialPrice: 620, binance: 'ETHUSDT', coinbase: 'ETH-USD', kraken: 'XETHZUSD' },
  { id: 'solana', symbol: 'SOL', name: 'Solana 51', icon: '◎', initialPrice: 280, binance: 'SOLUSDT', coinbase: 'SOL-USD', kraken: 'SOLUSD' },
  { id: 'xrp', symbol: 'XRP', name: 'XRP 51', icon: '✕', initialPrice: 140, binance: 'XRPUSDT', coinbase: 'XRP-USD', kraken: 'XXRPZUSD' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin 51', icon: 'Ð', initialPrice: 75, binance: 'DOGEUSDT', coinbase: 'DOGE-USD', kraken: 'XDGUSD' },
  { id: 'tether', symbol: 'USDT', name: 'Tether 51', icon: '₮', initialPrice: 100, binance: null, coinbase: 'USDT-USD', kraken: 'USDTZUSD' },
]);

export const CRYPTO_REFRESH_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 12 * 24 * 31;
const DAILY_HISTORY_LIMIT = 365;
const round = (value) => Math.round(Number(value || 0) * 100) / 100;
const validPrice = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const median = (values) => {
  const ordered = values.filter(validPrice).map(Number).sort((a, b) => a - b);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const dayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export function ensureCryptoMarketState(economy) {
  if (!economy.cryptoMarket || typeof economy.cryptoMarket !== 'object') economy.cryptoMarket = {};
  const market = economy.cryptoMarket;
  if (!market.prices || typeof market.prices !== 'object') market.prices = {};
  if (!market.referencePrices || typeof market.referencePrices !== 'object') market.referencePrices = {};
  if (!market.externalPrices || typeof market.externalPrices !== 'object') market.externalPrices = {};
  if (!market.previousPrices || typeof market.previousPrices !== 'object') market.previousPrices = {};
  if (!market.portfolios || typeof market.portfolios !== 'object') market.portfolios = {};
  if (!Array.isArray(market.ledger)) market.ledger = [];
  if (!Array.isArray(market.history)) market.history = [];
  if (!Array.isArray(market.dailyHistory)) market.dailyHistory = [];
  if (!Array.isArray(market.dividendSlots)) market.dividendSlots = [];
  for (const asset of CRYPTO_ASSETS) {
    if (!validPrice(market.prices[asset.id])) market.prices[asset.id] = 0;
    if (!validPrice(market.previousPrices[asset.id])) market.previousPrices[asset.id] = market.prices[asset.id];
  }
  return market;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Area51-Crypto51/1.0' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Fonte indisponível (${response.status})`);
  return response.json();
}

export async function readCryptoSources() {
  const krakenPairs = CRYPTO_ASSETS.map((asset) => asset.kraken).join(',');
  const settled = await Promise.allSettled([
    Promise.allSettled(CRYPTO_ASSETS.map((asset) => fetchJson(`https://api.exchange.coinbase.com/products/${asset.coinbase}/ticker`))),
    fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(krakenPairs)}`),
  ]);
  const [coinbase, kraken] = settled;
  const quotes = Object.fromEntries(CRYPTO_ASSETS.map((asset, index) => {
    const values = [];
    if (coinbase.status === 'fulfilled' && coinbase.value[index]?.status === 'fulfilled') values.push(coinbase.value[index].value?.price);
    if (kraken.status === 'fulfilled') values.push(kraken.value?.result?.[asset.kraken]?.c?.[0]);
    return [asset.id, values.filter(validPrice).map(Number)];
  }));
  return { quotes, sources: { coinbase: coinbase.status === 'fulfilled', kraken: kraken.status === 'fulfilled' } };
}

export async function syncCryptoMarket(economy, now = new Date(), prefetched = null) {
  const market = ensureCryptoMarketState(economy);
  if (market.lastAttemptAt && now.getTime() - Date.parse(market.lastAttemptAt) < CRYPTO_REFRESH_MS) return false;
  market.lastAttemptAt = now.toISOString();
  let payload;
  try { payload = prefetched || await readCryptoSources(); }
  catch (error) { market.status = 'stale'; market.lastError = String(error.message || 'Fontes indisponíveis.').slice(0, 160); return true; }
  // Sem consenso entre pelo menos duas fontes, a cotação individual congela.
  // Evita executar ordens com valores isolados ou desatualizados.
  const usable = CRYPTO_ASSETS.filter((asset) => {
    const quotes = payload.quotes[asset.id];
    if (quotes?.length < 2 || Math.max(...quotes) / Math.min(...quotes) > 1.05) return false;
    return true;
  });
  if (!usable.length) {
    market.status = 'stale';
    market.lastError = 'Nenhuma fonte respondeu com cotação válida.';
    // Uma falha transitória não deve deixar o Cripto 51 parado por toda a
    // janela regular. Mantemos a última cotação segura, mas tentamos de novo
    // em um minuto quando houver alguém consultando o portal.
    market.lastAttemptAt = new Date(now.getTime() - CRYPTO_REFRESH_MS + 60_000).toISOString();
    return true;
  }
  market.previousPrices = { ...market.prices };
  // Mantém o último consenso por ativo enquanto ele ainda é recente. Uma
  // falha pontual em outro ativo não invalida posições que seguem cotadas.
  const sourceCounts = { ...(market.sourceCounts || {}) }; market.assetUpdatedAt ||= {};
  for (const asset of usable) {
    const external = median(payload.quotes[asset.id]);
    market.externalPrices[asset.id] = external;
    market.assetUpdatedAt[asset.id] = now.toISOString();
    sourceCounts[asset.id] = payload.quotes[asset.id].length;
    market.prices[asset.id] = Math.round(external * 100000000) / 100000000;
    if (!validPrice(market.previousPrices[asset.id])) market.previousPrices[asset.id] = market.prices[asset.id];
  }
  market.updatedAt = now.toISOString();
  market.status = usable.length === CRYPTO_ASSETS.length ? 'live' : 'partial';
  market.lastError = null;
  market.sources = payload.sources;
  market.sourceCounts = sourceCounts;
  const snapshot = { id: randomUUID(), createdAt: market.updatedAt, prices: { ...market.prices }, externalPrices: { ...market.externalPrices }, validAssets: usable.map((asset) => asset.id) };
  market.history.push(snapshot);
  if (market.history.length > HISTORY_LIMIT) market.history = market.history.slice(-HISTORY_LIMIT);
  const dateKey = dayKey(now);
  const dailyIndex = market.dailyHistory.findIndex((item) => item.dateKey === dateKey);
  const dailySnapshot = { ...snapshot, dateKey };
  if (dailyIndex >= 0) market.dailyHistory[dailyIndex] = dailySnapshot; else market.dailyHistory.push(dailySnapshot);
  if (market.dailyHistory.length > DAILY_HISTORY_LIMIT) market.dailyHistory = market.dailyHistory.slice(-DAILY_HISTORY_LIMIT);
  return true;
}

function accountFor(market, userId) {
  const ledger = market.ledger.filter((item) => item.userId === userId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const assets = Object.fromEntries(CRYPTO_ASSETS.map((asset) => [asset.id, { quantity: 0, cost: 0 }]));
  for (const entry of ledger) {
    const account = assets[entry.assetId]; if (!account) continue;
    if (entry.side === 'buy') { account.quantity += entry.quantity; account.cost = round(account.cost + entry.total); }
    if (entry.side === 'sell' && account.quantity > 0) { const average = account.cost / account.quantity; account.quantity = Math.max(0, account.quantity - entry.quantity); account.cost = round(Math.max(0, account.cost - average * entry.quantity)); }
  }
  return { ledger, assets };
}

export function cryptoMarketForUser(economy, userId) {
  const market = ensureCryptoMarketState(economy); const portfolio = market.portfolios[userId] || {}; const accounting = accountFor(market, userId);
  const assets = CRYPTO_ASSETS.map((asset) => {
    const price = Number(market.prices[asset.id] || 0); const previousPrice = Number(market.previousPrices[asset.id] || price); const quantity = Number(portfolio[asset.id] || 0); const costBasis = quantity ? round(accounting.assets[asset.id].cost) : 0; const value = round(quantity * price); const change = price - previousPrice;
    return { ...asset, price, previousPrice, change, changePercent: previousPrice ? change / previousPrice * 100 : 0, quantity, positionValue: value, costBasis, averagePrice: quantity ? round(costBasis / quantity) : 0, unrealizedPnl: round(value - costBasis), externalPrice: Number(market.externalPrices[asset.id] || 0), sourceCount: Number(market.sourceCounts?.[asset.id] || 0), updatedAt: market.assetUpdatedAt?.[asset.id] || null };
  });
  const holdingsValue = round(assets.reduce((sum, asset) => sum + asset.positionValue, 0)); const investedCost = round(assets.reduce((sum, asset) => sum + asset.costBasis, 0));
  // Enviamos pontos detalhados do último dia e fechamentos diários mais
  // antigos. O histórico completo continua salvo, sem viajar em todo polling.
  const chartRow = ({ id, createdAt, prices, validAssets }) => ({ id, createdAt, prices, validAssets });
  return { assets, holdingsValue, investedCost, unrealizedPnl: round(holdingsValue - investedCost), unrealizedPnlPercent: investedCost ? (holdingsValue - investedCost) / investedCost * 100 : 0, transactions: accounting.ledger.slice().reverse(), updatedAt: market.updatedAt || null, status: market.status || 'waiting', sources: market.sources || {}, history: market.history.slice(-288).reverse().map(chartRow), dailyHistory: market.dailyHistory.slice(-DAILY_HISTORY_LIMIT).reverse().map(chartRow), refreshMinutes: 5 };
}

export function cryptoHoldingsValueForUser(economy, userId) {
  const market = ensureCryptoMarketState(economy);
  const portfolio = market.portfolios[userId] || {};
  return round(CRYPTO_ASSETS.reduce((total, asset) => total + round(Number(portfolio[asset.id] || 0) * Number(market.prices[asset.id] || 0)), 0));
}

export function transactCryptoMarket(economy, userId, assetId, quantity, side, now = new Date()) {
  const market = ensureCryptoMarketState(economy); const asset = CRYPTO_ASSETS.find((item) => item.id === assetId); const amount = Number(quantity);
  if (!asset) throw new Error('Ativo cripto não encontrado.');
  if (side !== 'buy' && side !== 'sell') throw new Error('Operação cripto inválida.');
  const units = Math.round(amount * 100000000);
  if (!Number.isFinite(amount) || amount < 0.00000001 || amount > 100000 || Math.abs(amount * 100000000 - units) > 0.000001) throw new Error('Informe uma quantidade válida com até 8 casas decimais.');
  const portfolio = market.portfolios[userId] ||= {}; const heldUnits = Math.round(Number(portfolio[assetId] || 0) * 100000000); if (side === 'sell' && heldUnits < units) throw new Error('Você não possui essa quantidade para vender.');
  // Arredondamento sempre conservador impede lucro por dividir uma ordem
  // em várias partes menores que um centavo.
  const price = Number(market.prices[assetId] || 0);
  const cents = price * amount * 100;
  const total = (side === 'buy' ? Math.ceil(cents - 1e-9) : Math.floor(cents + 1e-9)) / 100;
  if (!Number.isSafeInteger(Math.round(total * 100)) || total <= 0) throw new Error('Valor da operação fora do limite permitido.');
  portfolio[assetId] = (heldUnits + (side === 'buy' ? units : -units)) / 100000000;
  return { id: randomUUID(), assetId, side, quantity: amount, price, total, createdAt: now.toISOString(), source: 'crypto51' };
}
