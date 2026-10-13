export const NEXT_CARD_SEASON = Object.freeze({
  id: 'ecos-setor-51-2026-10',
  name: 'Operação: Ecos do Setor 51',
  // A temporada foi antecipada pela tripulação e começa imediatamente em
  // 29/09, sem alterar o encerramento planejado do passe.
  startsAt: '2026-09-29T00:00:00-03:00',
  replacesPreviousSeason: true,
});

export const isNextCardSeasonActive = (now = new Date()) => now.getTime() >= Date.parse(NEXT_CARD_SEASON.startsAt);

export const LEGACY_CARD_COLLECTION_IDS = Object.freeze([
  'exploradores', 'aurora', 'lendas', 'abismo',
  'forja', 'cronicas', 'cassino', 'santuarios', 'noite51',
]);

export const LEGACY_CARD_PACK_IDS = Object.freeze([
  'card-pack-cosmic', 'card-pack-stellar', 'card-pack-legendary', 'card-pack-halloween',
]);

export const NEXT_CARD_COLLECTIONS = Object.freeze([
  { id: 'dossie-blackstar', name: 'Dossiê Blackstar', badge: 'Decifrador Blackstar', icon: '◈', color: 'violet', cards: [
    ['codigo-palimpsesto', 'Código Palimpsesto', '🔣'], ['selo-iris', 'Selo Íris', '🪬'], ['fotograma-fantasma', 'Fotograma Fantasma', '🎞️'], ['chave-vanta', 'Chave Vanta', '🗝️'], ['documento-blackstar', 'Documento Blackstar', '📓'],
  ]},
  { id: 'unidade-taquion', name: 'Unidade Táquion', badge: 'Marechal Táquion', icon: '⏱️', color: 'aqua', cards: [
    ['batedora-nyx', 'Batedora Nyx', '🥷'], ['navegador-kepler', 'Navegador Kepler', '🧑‍🚀'], ['xenobiologa-vela', 'Xenobióloga Vela', '🧬'], ['criptoanalista-ada', 'Criptoanalista Ada', '💻'], ['operador-apex', 'Operador Apex', '🎧'],
  ]},
  { id: 'paradoxos-quanticos', name: 'Paradoxos Quânticos', badge: 'Cartógrafo do Impossível', icon: '♾️', color: 'violet', cards: [
    ['chuva-invertida', 'Chuva Invertida', '🌧️'], ['silencio-branco', 'Silêncio Branco', '▫️'], ['horizonte-fraturado', 'Horizonte Fraturado', '🌅'], ['pulso-taquion', 'Pulso Táquion', '〽️'], ['singularidade-rubra', 'Singularidade Rubra', '🔴'],
  ]},
  { id: 'laboratorio-vanta', name: 'Laboratório Vanta', badge: 'Arquiteto Vanta', icon: '⚗️', color: 'gold', cards: [
    ['ampola-xenon', 'Ampola Xenon', '🧪'], ['condensador-flux', 'Condensador Flux', '🔋'], ['matriz-vanta', 'Matriz Vanta', '⬛'], ['camara-nula', 'Câmara Nula', '⭕'], ['motor-dobra', 'Motor de Dobra', '⚙️'],
  ]},
  { id: 'sonda-khepri', name: 'Sonda Khepri', badge: 'Desbravador Khepri', icon: '🛰️', color: 'aqua', cards: [
    ['transponder-khepri', 'Transponder Khepri', '📟'], ['amostra-basaltica', 'Amostra Basáltica', '🪨'], ['diario-bordo', 'Diário de Bordo', '📔'], ['drone-nautilo', 'Drone Náutilo', '🤖'], ['modulo-reentrada', 'Módulo de Reentrada', '☄️'],
  ]},
].map((collection) => Object.freeze({ ...collection, seasonId: NEXT_CARD_SEASON.id })));

const positiveCount = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0;
const legacyPrefix = new Set(LEGACY_CARD_COLLECTION_IDS);
const isLegacyCard = (cardId) => legacyPrefix.has(String(cardId || '').split(':')[0]);
const isRareLegacyCard = (cardId) => {
  const [collectionId, localId] = String(cardId || '').split(':');
  const collection = {
    exploradores: 'portal', aurora: 'estrela', lendas: 'reliquia', abismo: 'tridente',
    forja: 'faisca', cronicas: 'cometa', cassino: 'jackpot', santuarios: 'oraculo',
    noite51: 'abobora',
  }[collectionId];
  return collection === localId;
};

export function previousSeasonLiquidationPreview(db, userId) {
  const cards = db.economy?.cardAlbums?.[userId]?.cards || {};
  let basics = 0;
  let rares = 0;
  for (const [cardId, rawCount] of Object.entries(cards)) {
    if (!isLegacyCard(cardId)) continue;
    const quantity = positiveCount(rawCount);
    if (isRareLegacyCard(cardId)) rares += quantity;
    else basics += quantity;
  }
  return {
    seasonId: 'legacy-card-season-1',
    basics,
    rares,
    totalCards: basics + rares,
    basicValue: 2,
    rareValue: 6,
    credits: basics * 2 + rares * 6,
    unopenedPacks: (db.economy?.purchases || []).filter((purchase) => purchase.userId === userId && LEGACY_CARD_PACK_IDS.includes(purchase.itemId) && !purchase.cardPackOpenedAt && !purchase.cardPackSettledAt).length,
    packCredits: (db.economy?.purchases || []).filter((purchase) => purchase.userId === userId && LEGACY_CARD_PACK_IDS.includes(purchase.itemId) && !purchase.cardPackOpenedAt && !purchase.cardPackSettledAt).reduce((sum, purchase) => sum + Math.max(0, Number(purchase.price || 0)), 0),
    alreadySettled: Boolean(db.economy?.cardAlbums?.[userId]?.seasonSettlements?.['legacy-card-season-1']),
  };
}

function cancelLegacyTradesForSeason(db, now) {
  for (const post of db.economy?.cardTradePosts || []) {
    if (post.status !== 'open') continue;
    if (isLegacyCard(post.offeredId)) {
      post.status = 'cancelled-season-close';
      post.updatedAt = now;
      for (const offer of post.offers || []) {
        if (offer.status !== 'rejected') {
          offer.status = 'rejected';
          offer.updatedAt = now;
        }
      }
      continue;
    }
    for (const offer of post.offers || []) {
      if (offer.status !== 'rejected' && (!offer.cardId || isLegacyCard(offer.cardId))) {
        offer.status = 'rejected';
        offer.updatedAt = now;
      }
    }
  }
  for (const trade of db.economy?.cardTrades || []) {
    if (trade.status === 'pending' && (isLegacyCard(trade.offeredId) || isLegacyCard(trade.wantedId))) {
      trade.status = 'cancelled-season-close';
      trade.updatedAt = now;
    }
  }
}

export function liquidatePreviousCardSeason(db, userId, idFactory, now = new Date()) {
  db.economy ||= {};
  db.economy.purchases ||= [];
  db.economy.cardAlbums ||= {};
  const album = db.economy.cardAlbums[userId] ||= { cards: {}, crafted: {} };
  album.cards ||= {};
  album.seasonSettlements ||= {};
  const seasonId = 'legacy-card-season-1';
  if (album.seasonSettlements[seasonId]) return { changed: false, ...album.seasonSettlements[seasonId] };
  const preview = previousSeasonLiquidationPreview(db, userId);
  const createdAt = now.toISOString();
  // O mercado é único para toda a tripulação: nenhuma publicação ou oferta
  // de carta antiga pode sobreviver à abertura do novo álbum.
  cancelLegacyTradesForSeason(db, createdAt);
  for (const cardId of Object.keys(album.cards)) if (isLegacyCard(cardId)) delete album.cards[cardId];
  const before = Math.max(0, Number(db.economy.wallets?.[userId] || 0));
  const totalCredits = preview.credits + preview.packCredits;
  const after = before + totalCredits;
  db.economy.wallets ||= {};
  db.economy.wallets[userId] = after;
  for (const purchase of db.economy.purchases || []) {
    if (purchase.userId !== userId || !LEGACY_CARD_PACK_IDS.includes(purchase.itemId) || purchase.cardPackOpenedAt || purchase.cardPackSettledAt) continue;
    purchase.cardPackSettledAt = createdAt;
    purchase.cardPackSettlement = { seasonId, credits: Math.max(0, Number(purchase.price || 0)), reason: 'Encerramento da coleção anterior' };
  }
  const settlement = { id: idFactory(), seasonId, basics: preview.basics, rares: preview.rares, totalCards: preview.totalCards, credits: preview.credits, unopenedPacks: preview.unopenedPacks, packCredits: preview.packCredits, totalCredits, createdAt };
  album.seasonSettlements[seasonId] = settlement;
  db.economy.creditAdjustments ||= [];
  if (totalCredits > 0) db.economy.creditAdjustments.push({ id: idFactory(), userId, mode: 'card-season-liquidation', amount: totalCredits, before, after, reason: 'Encerramento da coleção de cartas e pacotes anteriores', createdAt });
  return { changed: true, ...settlement };
}
