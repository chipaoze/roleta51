import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { marketForUser } from '../lib/investment-market.mjs';

const databasePath = process.argv.slice(2).find((argument) => !argument.startsWith('--')) || '/var/lib/area51/data/area51.sqlite';
const apply = process.argv.includes('--apply');
const database = new DatabaseSync(databasePath);
const roundCents = (value) => Math.round(Number(value) * 100) / 100;
try {
  if (apply) database.exec('BEGIN IMMEDIATE');
  const row = database.prepare('SELECT data, revision FROM app_state WHERE id = 1').get();
  if (!row) throw new Error('Estado principal não encontrado');
  const state = JSON.parse(row.data);
  const economy = state.economy;
  const market = economy?.investmentMarket;
  if (!market || !Array.isArray(market.ledger) || !market.portfolios) throw new Error('Mercado 51 incompleto');
  if (state.settings.marketPrincipalRefund20261028) throw new Error('Estorno do Mercado 51 já executado');
  const preservedMarket = Object.fromEntries(Object.entries(market).filter(([key]) => !['portfolios', 'ledger', 'autoSellOrders'].includes(key)));
  const marketSnapshot = JSON.stringify(preservedMarket);
  const cryptoSnapshot = JSON.stringify(economy.cryptoMarket);
  const positions = [];
  for (const [userId, portfolio] of Object.entries(market.portfolios)) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) throw new Error('Carteira de usuário inexistente: ' + userId);
    const account = marketForUser(economy, userId);
    for (const [assetId, rawQuantity] of Object.entries(portfolio)) {
      const quantity = Number(rawQuantity);
      if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Quantidade inválida: ' + userId + '/' + assetId);
      if (!quantity) continue;
      const asset = account.assets.find((item) => item.id === assetId);
      if (!asset || asset.quantity !== quantity || !Number.isSafeInteger(Math.round(asset.costBasis * 100)) || asset.costBasis <= 0) throw new Error('Custo de aquisição ausente: ' + userId + '/' + assetId);
      const netQuantity = market.ledger.filter((entry) => entry.userId === userId && entry.assetId === assetId).reduce((sum, entry) => sum + (entry.side === 'buy' ? Number(entry.quantity) : entry.side === 'sell' ? -Number(entry.quantity) : 0), 0);
      if (netQuantity !== quantity) throw new Error('Livro e carteira divergem: ' + userId + '/' + assetId + ' (' + netQuantity + ' vs ' + quantity + ')');
      positions.push({ userId, userName: user.displayName, assetId, assetName: asset.name, quantity, refund: roundCents(asset.costBasis) });
    }
  }
  const byUser = new Map();
  for (const position of positions) byUser.set(position.userId, roundCents((byUser.get(position.userId) || 0) + position.refund));
  const totalRefund = roundCents([...byUser.values()].reduce((sum, amount) => sum + amount, 0));
  const activeOrders = (market.autoSellOrders || []).filter((order) => order.status === 'active');
  const summary = { revision: row.revision, affectedUsers: byUser.size, positions: positions.length, activeOrders: activeOrders.length, totalRefund,
    users: [...byUser.entries()].map(([userId, refund]) => ({ userId, name: state.users.find((user) => user.id === userId)?.displayName, refund, positions: positions.filter((position) => position.userId === userId).map(({ assetId, quantity, refund: amount }) => ({ assetId, quantity, refund: amount })) })) };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (!positions.length || !totalRefund) throw new Error('Nenhuma posição para estornar');
    const now = new Date().toISOString();
    for (const position of positions) {
      market.portfolios[position.userId][position.assetId] = 0;
      market.ledger.push({ id: randomUUID(), userId: position.userId, assetId: position.assetId, side: 'sell', source: 'principal-refund', quantity: position.quantity,
        price: roundCents(position.refund / position.quantity), total: position.refund, createdAt: now });
    }
    for (const order of activeOrders) { order.status = 'cancelled'; order.cancelledAt = now; order.cancelReason = 'principal-refund'; }
    for (const [userId, refund] of byUser) {
      const before = roundCents(economy.wallets[userId] || 0);
      const after = roundCents(before + refund);
      economy.wallets[userId] = after;
      economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'investment-market-principal-refund', amount: refund, before, after,
        reason: 'Devolução do valor investido nas moedas do Mercado 51', createdAt: now });
    }
    if (JSON.stringify(Object.fromEntries(Object.entries(market).filter(([key]) => !['portfolios', 'ledger', 'autoSellOrders'].includes(key)))) !== marketSnapshot) throw new Error('As cotações ou tendências seriam alteradas');
    if (JSON.stringify(economy.cryptoMarket) !== cryptoSnapshot) throw new Error('A Cripto 51 seria alterada');
    for (const userId of byUser.keys()) {
      const account = marketForUser(economy, userId);
      if (account.assets.some((asset) => asset.quantity !== 0 || asset.costBasis !== 0)) throw new Error('Carteira não zerou corretamente: ' + userId);
    }
    state.settings.marketPrincipalRefund20261028 = { at: now, users: byUser.size, positions: positions.length, totalRefund };
    state.settings.releaseVersion = Math.max(0, Number(state.settings.releaseVersion || 0)) + 1;
    state.settings.releasePublishedAt = now;
    state.settings.releasePublishedBy = 'Administração';
    state.settings.announcement = {
      id: randomUUID(), title: 'Mercado 51: investimentos devolvidos',
      message: 'O valor pago pelas ações que cada participante ainda possuía no Mercado 51 voltou ao saldo da conta. Todas as posições antigas foram zeradas e as ordens automáticas canceladas. Você já pode comprar ações novamente com o saldo devolvido. O histórico mostra cada Devolução. As cotações, tendências e variações do Mercado 51 continuam iguais. A Cripto 51 não mudou. Veja os detalhes em Atualizações.',
      imageFilename: null, createdAt: now, createdBy: 'Administração', seenUserIds: [],
    };
    const result = database.prepare('UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
      .run(JSON.stringify(state), now, row.revision);
    if (result.changes !== 1) throw new Error('Conflito de revisão; nada estornado');
    database.exec('COMMIT');
    console.log(JSON.stringify({ ...summary, committedRevision: Number(row.revision) + 1, appliedAt: now }, null, 2));
  }
} catch (error) {
  if (apply) database.exec('ROLLBACK');
  throw error;
} finally {
  database.close();
}
