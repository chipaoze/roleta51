import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liquidatePreviousCardSeason } from '../lib/card-season-transition.mjs';
import { openCardPack } from '../lib/card-album.mjs';
import { awardSeasonPassXp, claimSeasonPassReward, seasonPassFor, unlockSeasonPassPremium } from '../lib/season-pass.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

function scenarioDb() {
  const seed = clone(JSON.parse(readFileSync(new URL('../seed-database.json', import.meta.url), 'utf8')));
  seed.economy ||= {};
  Object.assign(seed.economy, {
    wallets: { archive: 100, packs: 250, trade: 80, newcomer: 40, premium: 700 },
    cardAlbums: {
      archive: { cards: { 'exploradores:sinal': 3, 'exploradores:portal': 1 }, crafted: { exploradores: { count: 3 } } },
      packs: { cards: {}, crafted: {} },
      trade: { cards: { 'aurora:lua': 2 }, crafted: {} },
      newcomer: { cards: {}, crafted: {} },
      premium: { cards: {}, crafted: {} },
    },
    purchases: [
      { id: 'closed-old', userId: 'packs', itemId: 'card-pack-stellar', price: 260 },
      { id: 'opened-old', userId: 'archive', itemId: 'card-pack-cosmic', price: 120, cardPackOpenedAt: '2026-09-20T12:00:00.000Z', cardPackRewards: [] },
      { id: 'new-pack', userId: 'newcomer', itemId: 'card-pack-sector51', price: 0, source: 'season-pass' },
    ],
    cardTradePosts: [{ id: 'post', fromId: 'trade', offeredId: 'aurora:lua', status: 'open', offers: [] }],
    cardTrades: [], creditAdjustments: [], seasonPass: {}, seasonPassInventory: [],
  });
  return seed;
}

test('simulação local da virada preserva escopo e libera somente a coleção nova', () => {
  const db = scenarioDb(); let id = 0; const nextId = () => `sim-${++id}`;
  const beforeNewcomer = db.economy.wallets.newcomer;

  const archived = liquidatePreviousCardSeason(db, 'archive', nextId, new Date('2026-10-01T03:00:00.000Z'));
  const packed = liquidatePreviousCardSeason(db, 'packs', nextId, new Date('2026-10-01T03:00:00.000Z'));
  const traded = liquidatePreviousCardSeason(db, 'trade', nextId, new Date('2026-10-01T03:00:00.000Z'));

  assert.equal(archived.credits, 12); // 3 comuns + 1 rara
  assert.equal(db.economy.wallets.archive, 112);
  assert.deepEqual(db.economy.cardAlbums.archive.crafted.exploradores, { count: 3 });
  assert.equal(packed.packCredits, 260);
  assert.equal(db.economy.wallets.packs, 510);
  assert.equal(db.economy.purchases.find((item) => item.id === 'closed-old').cardPackSettledAt !== undefined, true);
  assert.equal(db.economy.cardTradePosts[0].status, 'cancelled-season-close');
  assert.equal(db.economy.wallets.newcomer, beforeNewcomer);

  const opened = openCardPack(db, 'newcomer', 'new-pack', () => .5);
  assert.equal(opened.cards.length, 3);
  assert.ok(opened.cards.every((card) => card.id.startsWith('dossie-blackstar:') || card.id.startsWith('unidade-taquion:') || card.id.startsWith('paradoxos-quanticos:') || card.id.startsWith('laboratorio-vanta:') || card.id.startsWith('sonda-khepri:')));
});

test('conta premium resgata uma vez e conta recém-chegada começa limpa', () => {
  const db = scenarioDb();
  awardSeasonPassXp(db.economy, 'premium', 'first-badge-craft', 'first');
  awardSeasonPassXp(db.economy, 'premium', 'weekly-mission', 'week-1');
  unlockSeasonPassPremium(db.economy, 'premium');
  const premiumReward = claimSeasonPassReward(db.economy, 'premium', 'premium', 1);
  assert.equal(premiumReward.changed, true);
  assert.equal(claimSeasonPassReward(db.economy, 'premium', 'premium', 1).changed, false);
  assert.equal(seasonPassFor(db.economy, 'newcomer').xp, 0);
  assert.equal(seasonPassFor(db.economy, 'newcomer').premium, false);
});
