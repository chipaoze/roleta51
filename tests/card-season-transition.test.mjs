import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CARD_COLLECTIONS, CARD_PACK_RULES, awardEngagementCard, craftedBadgeArchiveFor, openCardPack, pickAlbumCard, simulateCardPack } from '../lib/card-album.mjs';
import { NEXT_CARD_COLLECTIONS, NEXT_CARD_SEASON, isNextCardSeasonActive, liquidatePreviousCardSeason, previousSeasonLiquidationPreview } from '../lib/card-season-transition.mjs';

test('nova temporada possui cinco coleções e vinte e cinco cartas', () => {
  assert.equal(NEXT_CARD_COLLECTIONS.length, 5);
  assert.equal(NEXT_CARD_COLLECTIONS.flatMap((collection) => collection.cards).length, 25);
  assert.ok(NEXT_CARD_COLLECTIONS.every((collection) => collection.cards.length === 5));
  assert.equal(new Set(NEXT_CARD_COLLECTIONS.map((collection) => collection.badge)).size, 5);
  assert.equal(new Set(NEXT_CARD_COLLECTIONS.flatMap((collection) => collection.cards.map((card) => card[1]))).size, 25);
  const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const previousNames = new Set(CARD_COLLECTIONS.flatMap((collection) => [collection.name, collection.badge, ...collection.cards.map((card) => card[1])]).map(normalize));
  const nextNames = NEXT_CARD_COLLECTIONS.flatMap((collection) => [collection.name, collection.badge, ...collection.cards.map((card) => card[1])]);
  assert.ok(nextNames.every((name) => !previousNames.has(normalize(name))));
  assert.equal(NEXT_CARD_SEASON.replacesPreviousSeason, true);
  assert.equal(isNextCardSeasonActive(new Date('2026-09-28T23:59:59-03:00')), false);
  assert.equal(isNextCardSeasonActive(new Date('2026-09-29T00:00:00-03:00')), true);
});

test('todas as cartas e os quatro níveis de insígnia possuem arte WebP leve', () => {
  const urls = NEXT_CARD_COLLECTIONS.flatMap((collection) => [
    ...collection.cards.map((card) => new URL(`../public/card-season-2026-10/cards/${collection.id}/${card[0]}.webp`, import.meta.url)),
    ...['bronze', 'silver', 'gold', 'diamond'].map((tier) => new URL(`../public/card-season-2026-10/badges/${collection.id}/${tier}.webp`, import.meta.url)),
  ]);
  assert.equal(urls.length, 45);
  assert.ok(urls.every((url) => fs.existsSync(url)));
  const bytes = urls.reduce((sum, url) => sum + fs.statSync(url).size, 0);
  assert.ok(bytes < 1_250_000, `assets das cartas e insígnias excederam o orçamento: ${bytes} bytes`);
});

test('liquidação paga comuns e raras, preserva insígnias e não paga duas vezes', () => {
  let sequence = 0;
  const db = { economy: { wallets: { u1: 100 }, creditAdjustments: [], cardAlbums: { u1: { cards: { 'exploradores:sinal': 3, 'exploradores:portal': 2, 'noite51:abobora': 1 }, crafted: { exploradores: { count: 2 } } } }, cardTradePosts: [], cardTrades: [] } };
  assert.deepEqual(previousSeasonLiquidationPreview(db, 'u1'), { seasonId: 'legacy-card-season-1', basics: 3, rares: 3, totalCards: 6, basicValue: 2, rareValue: 6, credits: 24, unopenedPacks: 0, packCredits: 0, alreadySettled: false });
  const result = liquidatePreviousCardSeason(db, 'u1', () => `id-${++sequence}`, new Date('2026-10-01T03:00:00.000Z'));
  assert.equal(result.credits, 24);
  assert.equal(db.economy.wallets.u1, 124);
  assert.deepEqual(db.economy.cardAlbums.u1.cards, {});
  assert.deepEqual(db.economy.cardAlbums.u1.crafted, { exploradores: { count: 2 } });
  assert.equal(db.economy.creditAdjustments.length, 1);
  assert.equal(liquidatePreviousCardSeason(db, 'u1', () => `id-${++sequence}`).changed, false);
  assert.equal(db.economy.wallets.u1, 124);
  assert.equal(db.economy.creditAdjustments.length, 1);
});

test('pacote antigo fechado é convertido uma vez e não volta a gerar carta antiga', () => {
  let sequence = 0;
  const db = { economy: { wallets: { u1: 50 }, cardAlbums: { u1: { cards: {}, crafted: {} } }, creditAdjustments: [], purchases: [{ id: 'old-pack', userId: 'u1', itemId: 'card-pack-cosmic', price: 120 }] } };
  const preview = previousSeasonLiquidationPreview(db, 'u1');
  assert.equal(preview.unopenedPacks, 1);
  assert.equal(preview.packCredits, 120);
  const settlement = liquidatePreviousCardSeason(db, 'u1', () => `id-${++sequence}`);
  assert.equal(settlement.totalCredits, 120);
  assert.equal(db.economy.wallets.u1, 170);
  assert.ok(db.economy.purchases[0].cardPackSettledAt);
  assert.throws(() => openCardPack(db, 'u1', 'old-pack'), /convertido em créditos/);
  assert.equal(liquidatePreviousCardSeason(db, 'u1', () => `id-${++sequence}`).changed, false);
  assert.equal(db.economy.wallets.u1, 170);
});

test('encerramento de uma conta não toca saldos, cartas ou pacotes de outra conta', () => {
  const db = { economy: { wallets: { u1: 0, u2: 77 }, cardAlbums: {
    u1: { cards: { 'exploradores:sinal': 1 }, crafted: {} },
    u2: { cards: { 'aurora:lua': 2 }, crafted: { aurora: { count: 1 } } },
  }, creditAdjustments: [], purchases: [
    { id: 'u1-old', userId: 'u1', itemId: 'card-pack-cosmic', price: 120 },
    { id: 'u2-open', userId: 'u2', itemId: 'card-pack-cosmic', price: 120, cardPackOpenedAt: '2026-09-20T12:00:00.000Z', cardPackRewards: [] },
  ], cardTradePosts: [], cardTrades: [] } };
  liquidatePreviousCardSeason(db, 'u1', () => 'x');
  assert.equal(db.economy.wallets.u2, 77);
  assert.equal(db.economy.cardAlbums.u2.cards['aurora:lua'], 2);
  assert.deepEqual(db.economy.cardAlbums.u2.crafted.aurora, { count: 1 });
  assert.equal(db.economy.purchases[1].cardPackSettledAt, undefined);
});

test('pacotes novos usam somente as cartas novas e a simulação não grava dados', () => {
  for (const itemId of ['card-pack-sector51','card-pack-orbit','card-pack-core']) {
    assert.equal(CARD_PACK_RULES[itemId].collectionIds.length, 5);
    const cards=simulateCardPack(itemId,()=>.5);
    assert.equal(cards.length,3);
    assert.ok(cards.every(card=>NEXT_CARD_COLLECTIONS.some(collection=>card.id.startsWith(collection.id+':'))));
    assert.ok(cards.every(card=>card.art?.startsWith('/card-season-2026-10/cards/')));
  }
});


test('descobertas por atividade passam a usar exclusivamente o álbum novo na virada', () => {
  const db={economy:{cardAlbums:{}}};
  const previewCard=pickAlbumCard(()=>0,.1,null,{nextCardSeasonPreview:true});
  assert.ok(NEXT_CARD_COLLECTIONS.some(collection=>previewCard.id.startsWith(collection.id+':')));
  const drop=awardEngagementCard(db,'u1','comment','2026-10-01',()=>0,{nextCardSeasonPreview:true});
  assert.ok(NEXT_CARD_COLLECTIONS.some(collection=>drop.id.startsWith(collection.id+':')));
  assert.ok(!CARD_COLLECTIONS.some(collection=>drop.id.startsWith(collection.id+':')));
});

test('insígnias montadas antigas permanecem disponíveis como troféus', () => {
  const db={economy:{cardAlbums:{u1:{cards:{},crafted:{exploradores:{count:3},'dossie-blackstar':{count:1}}}}}};
  const archive=craftedBadgeArchiveFor(db,'u1');
  assert.deepEqual(archive.map(item=>[item.id,item.medal.tier]),[['exploradores','gold'],['dossie-blackstar','bronze']]);
});

test('liquidação cancela reservas antigas antes de remover cartas', () => {
  const db = { economy: { wallets: { u1: 0 }, cardAlbums: { u1: { cards: { 'aurora:lua': 1 }, crafted: {} } }, cardTradePosts: [{ id: 'p1', fromId: 'u1', offeredId: 'aurora:lua', status: 'open', offers: [] }], cardTrades: [{ id: 't1', fromId: 'u1', toId: 'u2', offeredId: 'aurora:lua', wantedId: 'lendas:coroa', status: 'pending' }] } };
  liquidatePreviousCardSeason(db, 'u1', () => 'id');
  assert.equal(db.economy.cardTradePosts[0].status, 'cancelled-season-close');
  assert.equal(db.economy.cardTrades[0].status, 'cancelled-season-close');
});

test('virada encerra globalmente posts, propostas e trocas pendentes de cartas antigas', () => {
  const db = { economy: { wallets: { u1: 0, u2: 0 }, cardAlbums: { u1: { cards: { 'aurora:lua': 1 }, crafted: {} }, u2: { cards: { 'lendas:coroa': 1 }, crafted: {} } }, cardTradePosts: [
    { id: 'p-old', fromId: 'u2', offeredId: 'aurora:lua', status: 'open', offers: [{id:'o-old',fromId:'u1',cardId:'lendas:coroa',status:'pending'}] },
    { id: 'p-new', fromId: 'u2', offeredId: 'dossie-blackstar:sentinela', status: 'open', offers: [] },
  ], cardTrades: [
    { id: 't-old', fromId: 'u2', toId: 'u1', offeredId: 'aurora:lua', wantedId: 'lendas:coroa', status: 'pending' },
    { id: 't-new', fromId: 'u2', toId: 'u1', offeredId: 'dossie-blackstar:sentinela', wantedId: 'unidade-taquion:dobrador', status: 'pending' },
  ] } };
  liquidatePreviousCardSeason(db, 'u1', () => 'id');
  assert.equal(db.economy.cardTradePosts[0].status, 'cancelled-season-close');
  assert.equal(db.economy.cardTradePosts[0].offers[0].status, 'rejected');
  assert.equal(db.economy.cardTradePosts[1].status, 'open');
  assert.equal(db.economy.cardTrades[0].status, 'cancelled-season-close');
  assert.equal(db.economy.cardTrades[1].status, 'pending');
});
