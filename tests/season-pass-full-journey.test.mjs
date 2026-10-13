import test from 'node:test';
import assert from 'node:assert/strict';
import { openCardPack } from '../lib/card-album.mjs';
import { liquidatePreviousCardSeason } from '../lib/card-season-transition.mjs';
import { SEASON_PASS, SEASON_PASS_COSMETIC_REWARDS, awardSeasonPassXp, claimSeasonPassReward, seasonPassFor, unlockSeasonPassPremium } from '../lib/season-pass.mjs';

const PACK_IDS = Object.freeze({ 'Pacote Setor 51': 'card-pack-sector51', 'Pacote Órbita': 'card-pack-orbit', 'Pacote Núcleo': 'card-pack-core' });

function createDb() {
  return { economy: { wallets: { free: 100, premium: 900, legacy: 40 }, purchases: [], creditAdjustments: [], cardAlbums: {
    free: { cards: {}, crafted: {} }, premium: { cards: {}, crafted: {} }, legacy: { cards: { 'exploradores:sinal': 2, 'aurora:lua': 1 }, crafted: { exploradores: { count: 1 } } },
  }, cardTradePosts: [], cardTrades: [], seasonPass: {} } };
}

function fillPassXp(economy, userId) {
  for (let day = 1; day <= 31; day += 1) for (let mission = 1; mission <= 6; mission += 1) awardSeasonPassXp(economy, userId, 'daily-mission', `${userId}:daily:${day}:${mission}`);
  for (let week = 1; week <= 4; week += 1) for (let mission = 1; mission <= 3; mission += 1) awardSeasonPassXp(economy, userId, 'weekly-mission', `${userId}:weekly:${week}:${mission}`);
  for (let team = 1; team <= 3; team += 1) awardSeasonPassXp(economy, userId, 'crew-challenge', `${userId}:crew:${team}`);
  awardSeasonPassXp(economy, userId, 'first-badge-craft', `${userId}:first-badge`);
}

function deliverClaim(db, userId, claim, sequence) {
  const reward = claim.reward;
  if (reward.name === 'Créditos 51') {
    db.economy.wallets[userId] += reward.quantity;
    db.economy.creditAdjustments.push({ id: `credit-${sequence}`, userId, amount: reward.quantity, seasonId: SEASON_PASS.id });
  } else if (PACK_IDS[reward.name]) {
    for (let index = 0; index < reward.quantity; index += 1) db.economy.purchases.push({ id: `pack-${sequence}-${index}`, userId, itemId: PACK_IDS[reward.name], price: 0, source: 'season-pass', seasonId: SEASON_PASS.id });
  } else if (SEASON_PASS_COSMETIC_REWARDS[reward.name]) {
    const itemId = SEASON_PASS_COSMETIC_REWARDS[reward.name];
    if (!db.economy.purchases.some((purchase) => purchase.userId === userId && purchase.itemId === itemId)) db.economy.purchases.push({ id: `cosmetic-${sequence}`, userId, itemId, price: 0, source: 'season-pass', seasonId: SEASON_PASS.id });
  }
}

test('jornada completa: conta gratuita, premium, pacotes, cosméticos e virada são isolados', () => {
  const db = createDb(); let sequence = 0;
  fillPassXp(db.economy, 'free'); fillPassXp(db.economy, 'premium');
  assert.equal(seasonPassFor(db.economy, 'free').level, 30);
  assert.equal(seasonPassFor(db.economy, 'premium').xp, 2400);

  for (const level of Array.from({ length: 30 }, (_, index) => index + 1)) {
    const claim = claimSeasonPassReward(db.economy, 'free', 'free', level); deliverClaim(db, 'free', claim, ++sequence);
  }
  assert.throws(() => claimSeasonPassReward(db.economy, 'free', 'premium', 1), /Premium/);

  assert.ok(db.economy.wallets.premium >= SEASON_PASS.premiumPrice);
  db.economy.wallets.premium -= SEASON_PASS.premiumPrice;
  assert.equal(unlockSeasonPassPremium(db.economy, 'premium'), true);
  for (const track of ['free', 'premium']) for (const level of Array.from({ length: 30 }, (_, index) => index + 1)) {
    const claim = claimSeasonPassReward(db.economy, 'premium', track, level); deliverClaim(db, 'premium', claim, ++sequence);
  }

  const freePacks = db.economy.purchases.filter((item) => item.userId === 'free' && item.source === 'season-pass' && item.itemId.startsWith('card-pack-'));
  const premiumPacks = db.economy.purchases.filter((item) => item.userId === 'premium' && item.source === 'season-pass' && item.itemId.startsWith('card-pack-'));
  assert.equal(freePacks.length, 7);
  assert.equal(premiumPacks.length, 12);
  assert.equal(db.economy.wallets.free, 340);
  assert.equal(db.economy.wallets.premium, 625);

  const premiumCosmetics = db.economy.purchases.filter((item) => item.userId === 'premium' && item.source === 'season-pass' && !item.itemId.startsWith('card-pack-')).map((item) => item.itemId).sort();
  assert.deepEqual(premiumCosmetics, ['badge-operacao-blackstar', 'cursor-khepri', 'frame-blackstar', 'site-camara-vanta', 'title-operador-blackstar', 'trail-taquion']);
  assert.equal(db.economy.purchases.filter((item) => item.userId === 'free' && item.itemId === 'title-operador-blackstar').length, 1);

  const beforeOpen = { ...db.economy.cardAlbums.premium.cards };
  for (const pack of premiumPacks) openCardPack(db, 'premium', pack.id, () => .5);
  const openedCards = Object.values(db.economy.cardAlbums.premium.cards).reduce((sum, amount) => sum + amount, 0);
  assert.equal(openedCards, premiumPacks.length * 3);
  assert.notDeepEqual(db.economy.cardAlbums.premium.cards, beforeOpen);

  const legacy = liquidatePreviousCardSeason(db, 'legacy', () => `legacy-${++sequence}`);
  assert.equal(legacy.credits, 6);
  assert.equal(db.economy.wallets.legacy, 46);
  assert.deepEqual(db.economy.cardAlbums.legacy.crafted, { exploradores: { count: 1 } });
  assert.equal(db.economy.wallets.free, 340);
  assert.equal(db.economy.wallets.premium, 625);

  const repeated = claimSeasonPassReward(db.economy, 'premium', 'premium', 30);
  assert.equal(repeated.changed, false);
  assert.equal(db.economy.purchases.filter((item) => item.userId === 'premium' && item.itemId === 'site-camara-vanta').length, 1);
});
