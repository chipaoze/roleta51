import path from 'node:path';
import { FLIGHT_STEP_MS, flightStepMs, flightMultiplier, settleFlight } from './lib/flight-engine.mjs';
import { albumFor, updateAlbum, awardEngagementCard, updateCardTrade, openCardPack } from './lib/card-album.mjs';
import { seasonalChallengeProgress } from './lib/season-challenges.mjs';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_TTL = 12 * 60 * 60 * 1000;
const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000;
const GATE_TTL = 30 * 24 * 60 * 60;
const GATE_CODE = String(process.env.AREA51_GATE_CODE || '51');
const GATE_DISABLED = String(process.env.AREA51_GATE_DISABLED || '').toLowerCase() === 'true';
const sessions = new Map();
const attempts = new Map();
const feedbackPostTimes = new Map();
const memePostTimes = new Map();
const anonymousPostTimes = new Map();
const imageStore = new Map();
const MAX_IMAGE_MEMORY = 200 * 1024 * 1024;
const MAX_IMAGE_CACHE = 16 * 1024 * 1024;
const WALL_EMOJIS = ['😂','👽','🤨','💀','❤️','👍','🔥','👏','😮','😢','😡','🤣'];
const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const LIVE_DRAW_DURATION = Math.max(80, Number(process.env.LIVE_DRAW_DURATION || 5900));
const MUSIC_EPOCH = Date.now();
const MUSIC_LOOP_MS = 8000;
const liveClients = new Map();
const onlineVisits = new Map();
let sharedOnlinePeople = [];
const PRESENCE_TTL = 60000;

function presencePeople(rows, users, now = Date.now()) {
  const ids = new Set(rows.filter((row) => Number(row.last_seen) > now - PRESENCE_TTL).map((row) => row.user_id));
  return users.filter((user) => user.active && ids.has(user.id)).map((user) => ({ id: user.id, displayName: user.displayName }));
}

async function heartbeatPresence(auth) {
  const now = Date.now();
  const sessionKey = createHash('sha256').update(auth.token).digest('hex');
  const results = await runtimeEnv.DB.batch([
    runtimeEnv.DB.prepare('DELETE FROM online_presence WHERE last_seen <= ?').bind(now - 86400000),
    runtimeEnv.DB.prepare('INSERT INTO online_presence(session_key,user_id,last_seen) VALUES(?,?,?) ON CONFLICT(session_key) DO UPDATE SET last_seen=excluded.last_seen WHERE online_presence.last_seen < ?').bind(sessionKey, auth.user.id, now, now - 12000),
    runtimeEnv.DB.prepare('SELECT user_id,last_seen FROM online_presence WHERE last_seen > ?').bind(now - PRESENCE_TTL),
  ]);
  sharedOnlinePeople = presencePeople(results[2].results || [], db.users, now);
  return sharedOnlinePeople;
}
let liveDraw = null;
let liveDrawCleanup = null;
let db;
let saveQueue = Promise.resolve();
let runtimeEnv = null;
let stateRevision = 0;
let databaseReady = false;

class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.status = status;
    this.retryableConcurrency = Boolean(options.retryableConcurrency);
  }
}

function makePassword(password) {
  const passwordSalt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex');
  return { passwordSalt, passwordHash };
}

function passwordMatches(password, user) {
  const candidate = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function persist() {
  const snapshot = JSON.stringify(db);
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const expectedRevision = stateRevision;
    const nextRevision = expectedRevision + 1;
    const result = await runtimeEnv.DB.prepare('UPDATE app_state SET data = ?, revision = ?, updated_at = ? WHERE id = 1 AND revision = ?')
      .bind(snapshot, nextRevision, new Date().toISOString(), expectedRevision).run();
    if (Number(result.meta?.changes || 0) !== 1) {
      const stored = await runtimeEnv.DB.prepare('SELECT data, revision FROM app_state WHERE id = 1').first();
      if (stored?.data) {
        db = JSON.parse(String(stored.data));
        stateRevision = Number(stored.revision || expectedRevision);
        liveDraw = db.settings?.liveDraw?.endsAt > Date.now() ? db.settings.liveDraw : null;
      }
      throw new HttpError(409, 'Outra pessoa atualizou o site ao mesmo tempo. Tente sua ação novamente.', { retryableConcurrency: true });
    }
    stateRevision = nextRevision;
  });
  return saveQueue.catch((error) => {
    // The database may have committed even when its response was lost.
    // Force a full reload before any subsequent request uses the in-memory state.
    stateRevision = -1;
    throw error;
  });
}

function cacheImage(filename, image) {
  imageStore.delete(filename);
  if (image.buffer.length > MAX_IMAGE_CACHE) return;
  let bytes = [...imageStore.values()].reduce((sum, entry) => sum + entry.buffer.length, 0);
  while (bytes + image.buffer.length > MAX_IMAGE_CACHE && imageStore.size) {
    const oldest = imageStore.keys().next().value;
    bytes -= imageStore.get(oldest).buffer.length;
    imageStore.delete(oldest);
  }
  imageStore.set(filename, image);
}

async function storeImage(filename, buffer, mimeType) {
  await runtimeEnv.MEDIA.put(filename, buffer, { metadata: { contentType: mimeType } });
  cacheImage(filename, { buffer, mimeType });
}

async function deleteStoredImage(filename) {
  imageStore.delete(filename);
  await runtimeEnv.MEDIA.delete(path.basename(filename));
}

async function deleteStoredImages(items) {
  await Promise.all(items.map((item) => deleteStoredImage(typeof item === 'string' ? item : item.filename)));
}

function hasBytes(image, bytes, offset = 0) {
  return image.length >= offset + bytes.length && bytes.every((byte, index) => image[offset + index] === byte);
}

function hasValidImageSignature(image, mimeType) {
  if (mimeType === 'image/png') return hasBytes(image, [137,80,78,71,13,10,26,10]);
  if (mimeType === 'image/jpeg') return hasBytes(image, [255,216,255]);
  if (mimeType === 'image/webp') return hasBytes(image, [82,73,70,70]) && hasBytes(image, [87,69,66,80], 8);
  return false;
}

function decodeWallpaperDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, 'Envie uma imagem PNG, JPG ou WEBP.');
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 8 * 1024 * 1024) throw new HttpError(413, 'A imagem deve ter no máximo 8 MB.');
  if (!hasValidImageSignature(image, match[1])) throw new HttpError(400, 'O conteúdo do arquivo não corresponde a uma imagem válida.');
  return { image, mimeType: match[1], extension: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]] };
}

async function ensureDatabase(seedDatabase) {
  if (databaseReady) return;
  await runtimeEnv.DB.prepare('CREATE TABLE IF NOT EXISTS online_presence (session_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, last_seen INTEGER NOT NULL)').run();
  await runtimeEnv.DB.prepare(`CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`).run();
  await runtimeEnv.DB.prepare('INSERT OR IGNORE INTO app_state (id, data, revision, updated_at) VALUES (1, ?, 1, ?)')
    .bind(JSON.stringify(seedDatabase), new Date().toISOString()).run();
  const stored = await runtimeEnv.DB.prepare('SELECT data, revision FROM app_state WHERE id = 1').first();
  if (!stored?.data) throw new Error('O banco online não pôde ser inicializado.');
  db = JSON.parse(String(stored.data));
  stateRevision = Number(stored.revision || 1);
  liveDraw = db.settings?.liveDraw?.endsAt > Date.now() ? db.settings.liveDraw : null;
  databaseReady = true;
  let changed = false;
  if (!Array.isArray(db.votings)) { db.votings = []; changed = true; }
  if (db.version < 2) { db.version = 2; changed = true; }
  if (db.version < 3) {
    db.version = 3;
    db.submissions = [];
    db.draws = [];
    db.votings = [];
    changed = true;
  }
  if (db.version < 4) {
    db.version = 4;
    db.users.forEach((user) => {
      if (user.role === 'admin') { user.role = 'member'; user.eligible = false; }
    });
    let raul = db.users.find((user) => user.username.toLowerCase() === 'raul.morais');
    if (!raul) {
      raul = {
        id: randomUUID(), username: 'raul.morais', displayName: 'Raul Morais',
        createdAt: new Date().toISOString(),
      };
      db.users.push(raul);
    }
    Object.assign(raul, {
      displayName: 'Raul Morais', role: 'admin', active: true, eligible: false,
      mustChangePassword: false, ...makePassword('12345678'),
    });
    changed = true;
  }
  if (db.version < 5) {
    db.version = 5;
    db.users = db.users.filter((user) => user.role === 'admin');
    db.users.forEach((user) => { user.eligible = true; });
    db.submissions = [];
    db.draws = [];
    db.votings = [];
    changed = true;
  }
  if (db.version < 6) {
    db.version = 6;
    db.assignments = [];
    db.scores = {};
    db.submissions = [];
    db.draws = [];
    db.votings = [];
    db.settings.themes = ['Futuro retrô', 'Natureza fantástica', 'Cinema dos anos 80', 'Brasil cyberpunk'];
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    changed = true;
  }
  if (!Array.isArray(db.assignments)) { db.assignments = []; changed = true; }
  db.assignments.forEach((assignment) => {
    if (!Object.hasOwn(assignment, 'seenAt')) { assignment.seenAt = null; changed = true; }
  });
  if (!db.scores || typeof db.scores !== 'object') { db.scores = {}; changed = true; }
  if (!Array.isArray(db.feedbackMessages)) { db.feedbackMessages = []; changed = true; }
  const completedFeedback = {
    '7efd7717-d8b0-41a6-92f9-b54d339860a2': 'Concluído: a última mentira ganhou destaque visual no ranking.',
    'c3cd017c-0471-490e-9438-e6c7fffcfd85': 'Concluído: cada participante agora possui histórico expansível com os motivos confirmados.',
    'cbdaa18d-a42a-407a-ada2-b79e24b87290': 'Concluído: as caixas misteriosas agora abrem com carrossel animado de prêmios.',
    '9d39125f-270c-49fb-ac44-7072d9f0888d': 'Concluído: o cassino ganhou 250 créditos promocionais diários; ao alcançar 500, todo o saldo promocional pode ser transferido para a loja.',
  };
  db.feedbackMessages.forEach((item) => {
    if (completedFeedback[item.id] && (item.status !== 'done' || item.adminComment !== completedFeedback[item.id])) { item.status = 'done'; item.adminComment = completedFeedback[item.id]; item.updatedAt = new Date().toISOString(); changed = true; }
  });
  if (!Array.isArray(db.dailyMemes)) { db.dailyMemes = []; changed = true; }
  if (!Array.isArray(db.dailyPhrases)) { db.dailyPhrases = []; changed = true; }
  if (!Array.isArray(db.dailyReactions)) { db.dailyReactions = []; changed = true; }
  if (!Array.isArray(db.anonymousPosts)) { db.anonymousPosts = []; changed = true; }
  if (!Array.isArray(db.waterEntries)) { db.waterEntries = []; changed = true; }
  if (!Array.isArray(db.rememberTokens)) { db.rememberTokens = []; changed = true; }
  if (!Array.isArray(db.lieAccusations)) { db.lieAccusations = []; changed = true; }
  if (!Array.isArray(db.gateAuthorizations)) { db.gateAuthorizations = []; changed = true; }
  if (!db.economy || typeof db.economy !== 'object') { db.economy = {}; changed = true; }
  if (!db.economy.wallets || typeof db.economy.wallets !== 'object') { db.economy.wallets = {}; changed = true; }
  if (!Array.isArray(db.economy.waterRewardDays)) { db.economy.waterRewardDays = []; changed = true; }
  if (!Array.isArray(db.economy.purchases)) { db.economy.purchases = []; changed = true; }
  if (!Array.isArray(db.economy.freeShopUses)) { db.economy.freeShopUses = []; changed = true; }
  if (!db.economy.equipped || typeof db.economy.equipped !== 'object') { db.economy.equipped = {}; changed = true; }
  if (!db.economy.missionProgress || typeof db.economy.missionProgress !== 'object') { db.economy.missionProgress = {}; changed = true; }
  if (!Array.isArray(db.economy.missionRewards)) { db.economy.missionRewards = []; changed = true; }
  if (!Array.isArray(db.economy.dailyMissionRewards)) { db.economy.dailyMissionRewards = []; changed = true; }
  if (!Array.isArray(db.economy.cleanNameRewards)) { db.economy.cleanNameRewards = []; changed = true; }
  if (!Array.isArray(db.economy.teamMissionRewards)) { db.economy.teamMissionRewards = []; changed = true; }
  if (!Array.isArray(db.economy.seasonChallengeRewards)) { db.economy.seasonChallengeRewards = []; changed = true; }
  if (!Array.isArray(db.economy.gifts)) { db.economy.gifts = []; changed = true; }
  if (!db.economy.activityTotals || typeof db.economy.activityTotals !== 'object') { db.economy.activityTotals = {}; changed = true; }
  if (!Array.isArray(db.economy.powerUses)) { db.economy.powerUses = []; changed = true; }
  if (!Array.isArray(db.economy.shields)) { db.economy.shields = []; changed = true; }
  if (!Array.isArray(db.economy.authorReveals)) { db.economy.authorReveals = []; changed = true; }
  if (!Array.isArray(db.economy.creditAdjustments)) { db.economy.creditAdjustments = []; changed = true; }
  if (!Array.isArray(db.economy.forcedCursors)) { db.economy.forcedCursors = []; changed = true; }
  if (!Array.isArray(db.economy.casinoPlays)) { db.economy.casinoPlays = []; changed = true; }
  if (!db.economy.casinoAccounts || typeof db.economy.casinoAccounts !== 'object') { db.economy.casinoAccounts = {}; changed = true; }
  if (!Array.isArray(db.economy.mysteryBoxes)) { db.economy.mysteryBoxes = []; changed = true; }
  if (!Array.isArray(db.economy.scoreTrades)) { db.economy.scoreTrades = []; changed = true; }
  if (!Array.isArray(db.economy.loans)) { db.economy.loans = []; changed = true; }
  if (!Array.isArray(db.economy.flights)) { db.economy.flights = []; changed = true; }
  if (!Array.isArray(db.economy.flightHistory)) { db.economy.flightHistory = []; changed = true; }
  if (!db.economy.casinoFairnessRefundV1) {
    const casinoTotals = new Map();
    db.economy.casinoPlays.forEach((play) => casinoTotals.set(play.userId, (casinoTotals.get(play.userId) || 0) + Number(play.net || 0)));
    db.economy.creditAdjustments = db.economy.creditAdjustments.filter((item) => item.mode !== 'casino');
    for (const [userId, casinoNet] of casinoTotals) {
      const before = Number(db.economy.wallets[userId] || 0); const amount = -casinoNet;
      db.economy.wallets[userId] = before + amount;
      db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'casino-refund', amount, before, after: before + amount, reason: 'Estorno integral das jogadas anteriores à correção da Roleta 51', createdAt: new Date().toISOString() });
    }
    db.economy.casinoPlays = [];
    db.economy.casinoFairnessRefundV1 = true;
    changed = true;
  }
  if (!db.notificationsReadAt || typeof db.notificationsReadAt !== 'object') { db.notificationsReadAt = {}; changed = true; }
  if (!Object.hasOwn(db.economy, 'forcedGay')) { db.economy.forcedGay = null; changed = true; }
  if (!Object.hasOwn(db.economy, 'forcedTheme')) { db.economy.forcedTheme = null; changed = true; }
  const historicalWaterTotals = new Map();
  db.waterEntries.forEach((entry) => {
    const key = entry.userId + ':' + entry.dayKey;
    historicalWaterTotals.set(key, (historicalWaterTotals.get(key) || 0) + Number(entry.ml || 0));
  });
  for (const [key, total] of historicalWaterTotals) {
    if (total >= 2500 && !db.economy.waterRewardDays.includes(key)) {
      db.economy.waterRewardDays.push(key);
      const userId = key.slice(0, key.lastIndexOf(':'));
      db.economy.wallets[userId] = Number(db.economy.wallets[userId] || 0) + 45;
      changed = true;
    }
  }
  const validRememberTokens = db.rememberTokens.filter((item) => item.expiresAt > Date.now());
  if (validRememberTokens.length !== db.rememberTokens.length) { db.rememberTokens = validRememberTokens; changed = true; }
  if (!Array.isArray(db.settings.themes)) { db.settings.themes = []; changed = true; }
  if (!Array.isArray(db.settings.currentParticipantIds)) { db.settings.currentParticipantIds = []; changed = true; }
  if (typeof db.settings.currentParticipantsLocked !== 'boolean') { db.settings.currentParticipantsLocked = false; changed = true; }
  if (!Object.hasOwn(db.settings, 'currentRoundRecoveredAt')) { db.settings.currentRoundRecoveredAt = null; changed = true; }
  if (typeof db.settings.dailyPhrase !== 'string') { db.settings.dailyPhrase = ''; changed = true; }
  if (!Object.hasOwn(db.settings, 'dailyPhraseUpdatedAt')) { db.settings.dailyPhraseUpdatedAt = null; changed = true; }
  if (!Object.hasOwn(db.settings, 'dailyPhraseUpdatedBy')) { db.settings.dailyPhraseUpdatedBy = null; changed = true; }
  if (!db.settings.gateSeed) { db.settings.gateSeed = randomBytes(24).toString('hex'); changed = true; }
  if (!db.settings.gateCodeHash) { db.settings.gateCodeHash = createHash('sha256').update(db.settings.gateSeed + ':' + GATE_CODE).digest('hex'); changed = true; }
  if (!db.settings.roundSchedule || typeof db.settings.roundSchedule !== 'object') { db.settings.roundSchedule = { submissionsAt: '', drawAt: '', voteAt: '' }; changed = true; }
  if (!Object.hasOwn(db.settings, 'announcement')) { db.settings.announcement = null; changed = true; }
  if (!db.settings.missionEconomyStartWeek) {
    const start = new Date(saoPauloWeekKey() + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() + 7);
    db.settings.missionEconomyStartWeek = start.toISOString().slice(0, 10); changed = true;
  }
  db.users.forEach((user) => { if (typeof user.approved !== 'boolean') { user.approved = true; changed = true; } });
  if (db.settings.dailyPhrase.trim()) {
    db.dailyPhrases.push({
      id: randomUUID(), userId: null, authorName: db.settings.dailyPhraseUpdatedBy || 'Tripulação',
      phrase: db.settings.dailyPhrase, createdAt: db.settings.dailyPhraseUpdatedAt || new Date().toISOString(),
    });
    db.settings.dailyPhrase = '';
    db.settings.dailyPhraseUpdatedAt = null;
    db.settings.dailyPhraseUpdatedBy = null;
    changed = true;
  }
  if (changed) await persist();
}

export async function initializeOnline(environment, seedDatabase) {
  runtimeEnv = environment;
  await ensureDatabase(seedDatabase);
}

export async function refreshOnlineState() {
  const stored = await runtimeEnv.DB.prepare('SELECT CASE WHEN revision > ? THEN data ELSE NULL END AS data, revision FROM app_state WHERE id = 1').bind(stateRevision).first();
  const remoteRevision = Number(stored?.revision || 0);
  if (stored?.data && remoteRevision > stateRevision) {
    db = JSON.parse(String(stored.data));
    stateRevision = remoteRevision;
    liveDraw = db.settings?.liveDraw?.endsAt > Date.now() ? db.settings.liveDraw : null;
  }
}

function changeStoredScore(userId, changes) {
  const current = db.scores[userId] || { points: 0, bestWins: 0, worstWins: 0, gayWins: 0 };
  db.scores[userId] = {
    points: current.points + (changes.points || 0),
    bestWins: Math.max(0, current.bestWins + (changes.bestWins || 0)),
    worstWins: Math.max(0, current.worstWins + (changes.worstWins || 0)),
    gayWins: Math.max(0, current.gayWins + (changes.gayWins || 0)),
  };
}

function saoPauloDayKey(date = new Date()) {
  const parts = dayFormatter.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return value.year + '-' + value.month + '-' + value.day;
}

const SHOP_CATALOG = [
  { id: 'card-pack-cosmic', name: 'Pacotinho Cósmico', icon: '🎴', type: 'cardPack', value: 'cosmic', consumable: true, cardPack: true, price: 120, description: 'Guarde no Perfil e rasgue para revelar 3 cartas. Cada carta: 90% básica e 10% rara. Pode haver repetidas. Cada insígnia exige 4 básicas diferentes e 1 rara da coleção. Sem revenda por créditos.' },
  { id: 'cursor-crystal', name: 'Seta Cristal Lunar', description: 'Seta facetada azul e violeta, com ponta precisa e contorno contrastante. Combine com seus rastros.', price: 360, type: 'cursorStyle', value: 'crystal', icon: '💠' },
  { id: 'cursor-solar', name: 'Seta Lâmina Solar', description: 'Seta dourada e laranja em forma de lâmina solar. Ponta clara e tamanho próprio para clicar.', price: 390, type: 'cursorStyle', value: 'solar', icon: '☀️' },
  { id: 'name-ice', name: 'Nome Gelo Lunar', description: 'Letras azul-gelo com brilho no perfil, topo e menu.', price: 270, type: 'nameStyle', value: 'ice', icon: '🧊' },
  { id: 'frame-rose', name: 'Moldura Quartzo Rosa', description: 'Acabamento rosa e violeta no perfil, topo e menu.', price: 330, type: 'frame', value: 'rose', icon: '🔮' },
  { id: 'title-master-guardian', name: 'Título Guardião Master', description: 'Exibe Guardião Master no perfil, topo e menu.', price: 300, type: 'title', value: 'Guardião Master', icon: '🏅' },
  { id: 'box-master-aurora', name: 'Baú Master Aurora', description: 'Visual ou poder de 340 a 680 créditos, ou 100 a 240 créditos. Sorte aleatória: o prêmio pode valer menos que o baú.', price: 800, sellPrice: 200, type: 'mysteryBox', value: 'master-aurora', icon: '💠', mysteryBox: true, master: true, tier: 'master-aurora', creditChance: .2, powerChance: .3, minRewardPrice: 340, maxRewardPrice: 680, creditMin: 100, creditMax: 240 },
  { id: 'box-master-imperial', name: 'Baú Master Imperial', description: 'Visual ou poder de 400 a 800 créditos, ou 150 a 320 créditos. Sem garantia de lucro; itens repetidos podem virar créditos.', price: 1100, sellPrice: 280, type: 'mysteryBox', value: 'master-imperial', icon: '👑', mysteryBox: true, master: true, tier: 'master-imperial', creditChance: .15, powerChance: .4, minRewardPrice: 400, maxRewardPrice: 800, creditMin: 150, creditMax: 320 },
  { id: 'badge-comet', name: 'Emblema Cometa', description: 'Um cometa junto ao nome no perfil, topo e menu.', price: 220, type: 'badge', value: '☄️', icon: '☄️' },
  { id: 'name-ruby', name: 'Nome Rubi Estelar', description: 'Brilho rubi no nome do perfil, topo e menu.', price: 240, type: 'nameStyle', value: 'ruby', icon: '💎' },
  { id: 'frame-orbit', name: 'Moldura Órbita Prateada', description: 'Borda metálica prateada no perfil, topo e menu.', price: 310, type: 'frame', value: 'orbit', icon: '🪩' },
  { id: 'power-cleanse-cursor', name: 'Antídoto de Maldição', description: 'Remove uma maldição de cursor comprada aplicada em você. Não remove sorteio nem dívida.', price: 260, type: 'power', value: 'cleanseCursor', icon: '🧪', consumable: true },
  { id: 'power-loan-extension', name: 'Acordo Estelar', description: 'Acrescenta 24 horas ao prazo do seu empréstimo. Uma prorrogação por contrato; não reduz a dívida.', price: 120, type: 'power', value: 'loanExtension', icon: '🤝', consumable: true },
  { id: 'service-sell-best-win', name: 'Venda de Vitória', description: 'Troque 1 ponto de primeiro lugar em wallpaper por 500 Créditos 51. A vitória sai do seu ranking.', price: 0, reward: 500, type: 'service', value: 'sellBestWin', icon: '🏆', service: true },
  { id: 'title-star', name: 'Título Estrela 51', description: 'Exibe “Estrela da Área 51” no perfil, cabeçalho e menu.', price: 120, type: 'title', value: 'Estrela da Área 51', icon: '⭐' },
  { id: 'title-hydrated', name: 'Título Hidratado', description: 'Exibe “Hidratado Intergaláctico” no perfil, cabeçalho e menu.', price: 160, type: 'title', value: 'Hidratado Intergaláctico', icon: '💧' },
  { id: 'name-neon', name: 'Nome Neon', description: 'Aplica brilho violeta ao seu nome no perfil, cabeçalho e menu.', price: 180, type: 'nameStyle', value: 'neon', icon: '💜' },
  { id: 'name-emerald', name: 'Nome Esmeralda Alienígena', description: 'Aplica verde luminoso e brilho extraterrestre ao seu nome em todo o site.', price: 230, type: 'nameStyle', value: 'emerald', icon: '💚' },
  { id: 'name-gold', name: 'Nome Ouro Solar', description: 'Aplica dourado premium com brilho quente ao seu nome em todo o site.', price: 290, type: 'nameStyle', value: 'gold', icon: '🌟' },
  { id: 'name-plasma', name: 'Nome Plasma Azul', description: 'Aplica azul elétrico e brilho de plasma ao seu nome em todo o site.', price: 260, type: 'nameStyle', value: 'plasma', icon: '⚡' },
  { id: 'name-cyan', name: 'Nome Ciano Quântico', description: 'Aplica ciano luminoso com brilho tecnológico ao nome.', price: 250, type: 'nameStyle', value: 'cyan', icon: '🩵' },
  { id: 'badge-ufo', name: 'Emblema Piloto UFO', description: 'Exibe uma nave ao lado do seu nome no topo, menu e perfil.', price: 190, type: 'badge', value: '🛸', icon: '🛸' },
  { id: 'badge-crown', name: 'Emblema Coroa Cósmica', description: 'Exibe uma coroa dourada junto ao seu nome em todo o site.', price: 260, type: 'badge', value: '👑', icon: '👑' },
  { id: 'badge-alien', name: 'Emblema Agente Alien', description: 'Exibe o selo extraterrestre junto ao seu nome em todo o site.', price: 220, type: 'badge', value: '👽', icon: '👽' },
  { id: 'frame-cosmic', name: 'Moldura Cósmica', description: 'Moldura espacial azul-violeta com brilho estelar no perfil, cabeçalho e menu.', price: 220, type: 'frame', value: 'cosmic', icon: '🪐' },
  { id: 'frame-gold', name: 'Moldura Dourada', description: 'Moldura dourada de campeão no perfil, cabeçalho e menu.', price: 260, type: 'frame', value: 'gold', icon: '👑' },
  { id: 'frame-neon', name: 'Moldura Neon', description: 'Moldura rosa e azul brilhante no perfil, cabeçalho e menu.', price: 300, type: 'frame', value: 'neon', icon: '💡' },
  { id: 'frame-ice', name: 'Moldura Glacial', description: 'Moldura azul cristalina no perfil, cabeçalho e menu.', price: 240, type: 'frame', value: 'ice', icon: '🧊' },
  { id: 'frame-emerald', name: 'Moldura Esmeralda', description: 'Laterais verdes luminosas no perfil, cabeçalho e menu.', price: 280, type: 'frame', value: 'emerald', icon: '💚' },
  { id: 'frame-fire', name: 'Moldura Fogo Solar', description: 'Laterais em vermelho, laranja e ouro com brilho de chama.', price: 320, type: 'frame', value: 'fire', icon: '🔥' },
  { id: 'frame-royal', name: 'Moldura Comando Real', description: 'Laterais azul-marinho e douradas com acabamento de comandante.', price: 390, type: 'frame', value: 'royal', icon: '🏅' },
  { id: 'frame-void', name: 'Moldura Vazio Cósmico', description: 'Contorno preto-violeta com brilho profundo em todo o perfil.', price: 350, type: 'frame', value: 'void', icon: '🕳️' },
  { id: 'name-rainbow', name: 'Nome Arco-íris', description: 'Aplica cores do arco-íris ao seu nome no perfil, cabeçalho e menu.', price: 350, type: 'nameStyle', value: 'rainbow', icon: '🌈' },
  { id: 'site-galaxy', name: 'Tema Galáxia', description: 'Transforma sua Área 51 em uma experiência espacial pessoal.', price: 300, type: 'siteTheme', value: 'galaxy', icon: '🌌' },
  { id: 'site-sunset', name: 'Tema Pôr do Sol', description: 'Aplica tons quentes de laranja, rosa e violeta em todo o site.', price: 280, type: 'siteTheme', value: 'sunset', icon: '🌅' },
  { id: 'site-ocean', name: 'Tema Oceano', description: 'Transforma o site com azuis profundos, turquesa e clima aquático.', price: 280, type: 'siteTheme', value: 'ocean', icon: '🌊' },
  { id: 'site-retro', name: 'Tema Arcade 51', description: 'Visual retrô com roxo, ciano e detalhes inspirados em fliperama.', price: 340, type: 'siteTheme', value: 'retro', icon: '🕹️' },
  { id: 'site-matrix', name: 'Tema Matrix Alienígena', description: 'Interface tecnológica em preto e verde radioativo, com grade digital em todo o site.', price: 380, type: 'siteTheme', value: 'matrix', icon: '👾' },
  { id: 'site-eclipse', name: 'Tema Eclipse Dourado', description: 'Visual premium em preto, dourado e âmbar para transformar a Área 51 em uma central de comando.', price: 420, type: 'siteTheme', value: 'eclipse', icon: '🌘' },
  { id: 'site-aurora', name: 'Tema Aurora Alienígena', description: 'Auroras verdes, ciano e violeta atravessam todas as páginas com alto contraste.', price: 390, type: 'siteTheme', value: 'aurora', icon: '🌌' },
  { id: 'site-mars', name: 'Tema Base de Marte', description: 'Visual marciano em vermelho, cobre e laranja com painéis escuros legíveis.', price: 410, type: 'siteTheme', value: 'mars', icon: '🪐' },
  { id: 'site-nebula', name: 'Tema Nebulosa Rosa', description: 'Painéis espaciais em rosa, azul e violeta com contraste reforçado.', price: 400, type: 'siteTheme', value: 'nebula', icon: '🌠' },
  { id: 'cursor-horn', name: 'Cursor Seta Unicórnio', description: 'Uma seta de mouse de verdade, com as cores do unicórnio e formato de chifre.', price: 180, type: 'cursorStyle', value: 'horn', icon: '🖱️' },
  { id: 'cursor-dipirona', name: 'Cursor Dipirona', description: 'Seta clássica inspirada na cápsula, com ponta de clique clara e precisa.', price: 260, type: 'cursorStyle', value: 'dipirona', icon: '💊' },
  { id: 'cursor-pirokinha-cosmica', name: 'Pirokinha Cósmica', description: 'Seta-cápsula cósmica com ponta rosa de morango e recado divertido ao mover.', price: 390, type: 'cursorStyle', value: 'pirokinha-cosmica', icon: '🍓' },
  { id: 'cursor-anvisa', name: 'Seta Anvisa Intergaláctica', description: 'Seta medicinal branca com cápsula colorida e ponto de clique preciso.', price: 340, type: 'cursorStyle', value: 'anvisa', icon: '🩺' },
  { id: 'cursor-gay-personal', name: 'Seta Gay Arco-íris', description: 'Versão permanente da seta colorida: compre, equipe e use no seu próprio perfil quando quiser.', price: 380, type: 'cursorStyle', value: 'gay', icon: '🌈' },
  { id: 'cursor-admin-command', name: 'Cursor Comandante da Área 51', description: 'Seta preta e dourada com cristal alienígena. Exclusiva para administradores.', price: 0, type: 'cursorStyle', value: 'commander', icon: '🛸', adminOnly: true },
  { id: 'cursor-galinha-preta', name: 'Cursor Galinha Preta', description: 'Seta clássica com penas negras e detalhes de galinha, sem perder a precisão.', price: 310, type: 'cursorStyle', value: 'galinha-preta', icon: '🐔' },
  { id: 'cursor-volei', name: 'Cursor Bola de Vôlei', description: 'Seta esportiva com as cores e curvas de uma bola de vôlei.', price: 290, type: 'cursorStyle', value: 'volei', icon: '🏐' },
  { id: 'cursor-biblia', name: 'Cursor Bíblia Sagrada', description: 'Seta clássica inspirada em uma Bíblia, com cruz dourada e clique preciso.', price: 330, type: 'cursorStyle', value: 'biblia', icon: '📖' },
  { id: 'cursor-papa-bento', name: 'Cursor Papa Bento', description: 'Seta papal dourada e precisa. Ao mover, proclama a bênção completa em três partes.', price: 370, type: 'cursorStyle', value: 'papa-bento', icon: '⛪' },
  { id: 'cursor-scrum-master', name: 'Cursor Scrum Master', description: 'Seta ágil com quadro Kanban e marcador de tarefa concluída.', price: 320, type: 'cursorStyle', value: 'scrum-master', icon: '📋' },
  { id: 'cursor-energetico', name: 'Cursor Energético', description: 'Seta neon inspirada em uma latinha de energético intergaláctico.', price: 360, type: 'cursorStyle', value: 'energetico', icon: '⚡' },
  { id: 'cursor-laser', name: 'Cursor Laser Alienígena', description: 'Seta clássica verde e ciano com mira luminosa e ponto de clique preciso.', price: 300, type: 'cursorStyle', value: 'laser', icon: '🔫' },
  { id: 'cursor-rocket', name: 'Cursor Foguete 51', description: 'Seta de mouse em formato de foguete, com ponta clara e propulsão colorida.', price: 340, type: 'cursorStyle', value: 'rocket', icon: '🚀' },
  { id: 'cursor-alien', name: 'Cursor Agente ET', description: 'Seta clássica verde com visor alienígena, fácil de enxergar e clicar.', price: 280, type: 'cursorStyle', value: 'alien', icon: '👽' },
  { id: 'cursor-unicorn', name: 'Unicórnio Galopante Premium', description: 'Libera o unicórnio completo que galopa, vira e reage ao clique.', price: 590, type: 'cursorStyle', value: 'unicorn', icon: '🏇' },
  { id: 'trail-rainbow', name: 'Rastro Arco-íris Original', description: 'Libera a cauda colorida clássica atrás do cursor.', price: 160, type: 'trailStyle', value: 'rainbow', icon: '🌈' },
  { id: 'trail-gold', name: 'Rastro Estelar Dourado', description: 'Troca seu arco-íris por uma cauda de estrelas douradas.', price: 270, type: 'trailStyle', value: 'gold', icon: '✨' },
  { id: 'trail-pink', name: 'Rastro Rosa Cósmico', description: 'Uma cauda rosa neon brilhante atrás do unicórnio.', price: 190, type: 'trailStyle', value: 'pink', icon: '🩷' },
  { id: 'trail-blue', name: 'Rastro Azul Plasma', description: 'Um rastro azul elétrico com brilho espacial.', price: 190, type: 'trailStyle', value: 'blue', icon: '💙' },
  { id: 'trail-green', name: 'Rastro Alienígena', description: 'Uma cauda verde radioativa aprovada pelos ETs.', price: 210, type: 'trailStyle', value: 'green', icon: '💚' },
  { id: 'trail-purple', name: 'Rastro Violeta', description: 'Uma trilha violeta intensa no movimento do cursor.', price: 210, type: 'trailStyle', value: 'purple', icon: '💜' },
  { id: 'trail-fire', name: 'Rastro Fogo Solar', description: 'Mistura vermelho, laranja e amarelo como uma chama.', price: 290, type: 'trailStyle', value: 'fire', icon: '🔥' },
  { id: 'trail-fruit', name: 'Rastro Corta-Frutas', description: 'Lança frutas pelo caminho do cursor para você cortar enquanto navega.', price: 300, type: 'trailStyle', value: 'fruit', icon: '🍉' },
  { id: 'trail-laser', name: 'Rastro Laser Verde', description: 'Linha verde-ciano luminosa e precisa atrás de qualquer cursor equipado.', price: 240, type: 'trailStyle', value: 'laser', icon: '💚' },
  { id: 'trail-rocket', name: 'Rastro Propulsão 51', description: 'Cauda de fogo azul, laranja e amarelo inspirada em propulsão espacial.', price: 310, type: 'trailStyle', value: 'rocket', icon: '🚀' },
  { id: 'trail-alien', name: 'Rastro Pegadas Alienígenas', description: 'Trilha verde radioativa para qualquer skin de cursor da coleção.', price: 260, type: 'trailStyle', value: 'alien', icon: '👣' },
  { id: 'power-reveal-author', name: 'Raio-X Total de Autoria', description: 'Use durante uma rodada com envios. Revela todas as autorias somente para você.', price: 420, type: 'power', value: 'revealAuthor', icon: '🔎', consumable: true },
  { id: 'power-shield-gay', name: 'Escudo da Rodada', description: 'Ative durante a rodada, antes do Gay da Rodada ser definido.', price: 320, type: 'power', value: 'shieldGay', icon: '🛡️', consumable: true },
  { id: 'power-theme', name: 'Controle de Tema', description: 'Use entre rodadas para abrir a próxima já com o tema escolhido.', price: 450, type: 'power', value: 'chooseTheme', icon: '🎨', consumable: true },
  { id: 'power-force-gay-cursor', name: 'Seta Gay Compulsória', description: 'Escolha um participante para usar a seta arco-íris cômica durante a rodada atual.', price: 520, type: 'power', value: 'forceGayCursor', icon: '🌈', consumable: true },
  { id: 'power-choose-gay', name: 'Controle Gay da Rodada', description: 'Use durante a rodada, antes do sorteio especial. Escudos ativos são respeitados.', price: 650, type: 'power', value: 'chooseGay', icon: '👑', consumable: true },
  { id: 'power-choose-wallpaper', name: 'Escolha Meu Wallpaper', description: 'Depois de todos enviarem, veja os wallpapers sem autoria e reserve um deles para você.', price: 580, type: 'power', value: 'chooseWallpaper', icon: '🖼️', consumable: true },
  { id: 'power-assign-wallpaper', name: 'Definir Wallpaper de Outro Player', description: 'Depois de todos enviarem, escolha anonimamente qual wallpaper outro participante receberá.', price: 680, type: 'power', value: 'assignWallpaper', icon: '🎯', consumable: true },
  { id: 'power-giant-slow-cursor', name: 'Maldição do Mouse Gigante', description: 'Ative a qualquer momento: um participante usa mouse gigante por 24 horas. Não depende de rodada aberta.', price: 430, type: 'power', value: 'forceGiantCursor', icon: '🐌', consumable: true },
  { id: 'box-sonda', name: 'Caixa Sonda Surpresa', description: 'Vai fechada para o perfil. Abra quando quiser ou venda por créditos.', price: 140, sellPrice: 80, type: 'mysteryBox', value: 'sonda', icon: '📦', mysteryBox: true, tier: 'sonda', creditChance: .42, powerChance: .12, minRewardPrice: 120, maxRewardPrice: 300, creditMin: 110, creditMax: 180 },
  { id: 'box-cosmic', name: 'Caixa Cósmica', description: 'Vai fechada para o perfil. Pode revelar um visual especial, créditos ou um poder.', price: 300, sellPrice: 180, type: 'mysteryBox', value: 'cosmic', icon: '🎁', mysteryBox: true, tier: 'cosmic', creditChance: .32, powerChance: .24, minRewardPrice: 240, maxRewardPrice: 520, creditMin: 240, creditMax: 380 },
  { id: 'box-area51', name: 'Cofre Secreto Área 51', description: 'O baú premium mais raro. Guarde, abra com a roleta de prêmios ou venda por créditos.', price: 520, sellPrice: 330, type: 'mysteryBox', value: 'area51', icon: '🛸', mysteryBox: true, tier: 'area51', creditChance: .22, powerChance: .36, minRewardPrice: 330, maxRewardPrice: 650, creditMin: 430, creditMax: 650 },
];

// Cada posição representa exatamente um setor visual da roleta. O servidor
// sorteia o índice e o navegador anima até esse mesmo setor.
const CASINO_WHEEL_OUTCOMES = [
  0, .5, 1, 1.5, 'box-sonda', .5, 1, 2, 1.5, .5, 0, 1, 3, 1.5, 'box-cosmic', 0, 1, 2, 1.5, 1,
  0, .5, 'box-sonda', 1.5, 0, .5, 1, 'box-area51', 1.5, .5, 0, 1, 3, 'box-cosmic', .5, 0, 1, 2, 'box-sonda', 1,
];

const WEEKLY_MISSIONS = [
  { type: 'hydration_goal', title: 'Hidratação orbital', description: 'Alcance a meta de 2,5 L em 1 dia desta semana.', target: 1, reward: 60, icon: '💧' },
  { type: 'meme', title: 'Agente do caos', description: 'Publique 1 meme no mural durante a semana.', target: 1, reward: 45, icon: '😂' },
  { type: 'phrase', title: 'Filósofo alienígena', description: 'Publique 1 frase durante a semana.', target: 1, reward: 40, icon: '💬' },
  { type: 'water_log', title: 'Protocolo H₂O', description: 'Faça 3 registros de água durante a semana.', target: 3, reward: 45, icon: '🫗' },
];

const DAILY_MISSIONS = [
  { id: 'water-logs', icon: '🫗', title: 'Dois goles registrados', description: 'Registre água 2 vezes hoje.', target: 2, reward: 8, unit: 'registros' },
  { id: 'water-1500', icon: '💧', title: 'Rota dos 1,5 litros', description: 'Chegue a 1.500 ml de água hoje.', target: 1500, reward: 14, unit: 'ml' },
  { id: 'daily-post', icon: '💬', title: 'Voz da tripulação', description: 'Publique uma frase ou recado anônimo hoje.', target: 1, reward: 8, unit: 'postagem' },
  { id: 'daily-meme', icon: '😂', title: 'Meme do expediente', description: 'Publique um meme hoje.', target: 1, reward: 10, unit: 'meme' },
];

function saoPauloWeekKey(date = new Date()) {
  const dayKey = saoPauloDayKey(date);
  const value = new Date(dayKey + 'T12:00:00Z');
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

function walletFor(userId) { return Number(db.economy.wallets[userId] || 0); }
function addCredits(userId, amount) { db.economy.wallets[userId] = walletFor(userId) + amount; }

const CASINO_DAILY_BONUS = 250;
const CASINO_CASHOUT_THRESHOLD = 500;
function casinoAccountFor(userId, create = false) {
  const dayKey = saoPauloDayKey(); const current = db.economy.casinoAccounts[userId];
  if (current?.dayKey === dayKey) return current;
  if (!create) return { dayKey, balance: CASINO_DAILY_BONUS, cashedOut: false };
  db.economy.casinoAccounts[userId] = { dayKey, balance: CASINO_DAILY_BONUS, cashedOut: false, createdAt: new Date().toISOString() };
  return db.economy.casinoAccounts[userId];
}

// A single durable claim, persisted atomically with consuming the box (D1 CAS).
function physicalKitClaim() { return db.economy.physicalKitClaim || null; }
function grantMysteryBoxReward(user, box) {
  if (box.id === 'box-master-imperial' && !physicalKitClaim() && randomInt(10000) < 10) {
    const claim = { id: randomUUID(), userId: user.id, boxId: box.id, name: 'Kit doado: caderno e caneta', icon: '📒', kind: 'physical', createdAt: new Date().toISOString(), status: 'awaiting-delivery' };
    db.economy.physicalKitClaim = claim;
    return { ...claim, name: claim.name + ' — combine a entrega com o administrador' };
  }
  const ownedIds = new Set(db.economy.purchases.filter((purchase) => purchase.userId === user.id).map((purchase) => purchase.itemId));
  const roll = Math.random();
  const creditReward = () => {
    const steps = Math.max(0, Math.floor((Number(box.creditMax) - Number(box.creditMin)) / 10));
    const amount = Number(box.creditMin) + Math.floor(Math.random() * (steps + 1)) * 10;
    const before = walletFor(user.id); addCredits(user.id, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'mystery-box', amount, before, after: before + amount, reason: 'Prêmio da ' + box.name, createdAt: new Date().toISOString() });
    return { kind: 'credits', icon: '🪙', name: amount + ' Créditos 51', amount };
  };
  if (roll < Number(box.creditChance)) return creditReward();
  const wantsPower = roll < Number(box.creditChance) + Number(box.powerChance);
  const eligible = SHOP_CATALOG.filter((item) => !item.adminOnly && !item.cardPack && !item.mysteryBox && !item.service && (wantsPower ? item.type === 'power' : item.type !== 'power') && Number(item.price) >= Number(box.minRewardPrice) && Number(item.price) <= Number(box.maxRewardPrice) && (item.consumable || !ownedIds.has(item.id)));
  const fallback = SHOP_CATALOG.filter((item) => !item.adminOnly && !item.cardPack && !item.mysteryBox && !item.service && (item.consumable || !ownedIds.has(item.id)));
  const pool = eligible.length ? eligible : box.master ? [] : fallback;
  if (!pool.length) return creditReward();
  const reward = pool[Math.floor(Math.random() * pool.length)];
  const purchaseId = randomUUID();
  db.economy.purchases.push({ id: purchaseId, userId: user.id, itemId: reward.id, price: 0, originalPrice: reward.price, sourceMysteryBoxId: box.id, mysteryDecisionPending: true, createdAt: new Date().toISOString() });
  return { kind: reward.type === 'power' ? 'power' : 'item', icon: reward.icon, name: reward.name, itemId: reward.id, purchaseId, sellPrice: Math.min(Math.max(10, Math.floor(Number(reward.price || 0) * .55 / 10) * 10), Math.max(10, Math.floor(Number(box.sellPrice || 0) * .8 / 10) * 10)) };
}

function addMysteryBox(userId, boxId, source, bet = null) {
  const box = SHOP_CATALOG.find((item) => item.id === boxId && item.mysteryBox);
  if (!box) throw new HttpError(404, 'Baú misterioso não encontrado.');
  const inventoryItem = { id: randomUUID(), userId, boxId, source, bet, acquiredAt: new Date().toISOString() };
  db.economy.mysteryBoxes.push(inventoryItem);
  return { ...inventoryItem, name: box.name, icon: box.icon, tier: box.tier, sellPrice: box.sellPrice };
}

function weeklyMissionFor(userId) {
  const weekKey = saoPauloWeekKey();
  const seed = [...(userId + weekKey)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const template = WEEKLY_MISSIONS[seed % WEEKLY_MISSIONS.length];
  const key = userId + ':' + weekKey + ':' + template.type;
  const progress = Math.min(template.target, Number(db.economy.missionProgress[key] || 0));
  const completed = db.economy.missionRewards.includes(key);
  return { ...template, weekKey, key, progress, completed };
}

function recordMissionActivity(userId, type) {
  const mission = weeklyMissionFor(userId);
  if (mission.type !== type || mission.completed) return false;
  const progress = Math.min(mission.target, mission.progress + 1);
  db.economy.missionProgress[mission.key] = progress;
  if (progress >= mission.target) {
    db.economy.missionRewards.push(mission.key);
    addCredits(userId, mission.reward);
    return true;
  }
  return false;
}

function recordActivity(userId, type) {
  const totals = db.economy.activityTotals[userId] || {};
  totals[type] = Number(totals[type] || 0) + 1;
  db.economy.activityTotals[userId] = totals;
  return recordMissionActivity(userId, type);
}

const timestampDayCache = new Map();
function dayKeyForTimestamp(timestamp) {
  const key = typeof timestamp === 'string' ? timestamp : null;
  if (key !== null && timestampDayCache.has(key)) return timestampDayCache.get(key);
  const parsed = new Date(timestamp);
  const result = Number.isNaN(parsed.getTime()) ? '' : saoPauloDayKey(parsed);
  if (key !== null) {
    if (timestampDayCache.size >= 2048) timestampDayCache.delete(timestampDayCache.keys().next().value);
    timestampDayCache.set(key, result);
  }
  return result;
}

function dailyMissionsFor(userId, dayKey = saoPauloDayKey()) {
  const waterEntries = db.waterEntries.filter((item) => item.userId === userId && item.dayKey === dayKey);
  const values = {
    'water-logs': waterEntries.length,
    'water-1500': waterEntries.reduce((sum, item) => sum + Number(item.ml || 0), 0),
    'daily-post': db.dailyPhrases.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length + db.anonymousPosts.filter((item) => item.authorId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
    'daily-meme': db.dailyMemes.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
  };
  const unlocked = dayKey >= String(db.settings.missionEconomyStartWeek || dayKey);
  return DAILY_MISSIONS.map((mission) => {
    const key = userId + ':' + dayKey + ':' + mission.id;
    const progress = Math.min(mission.target, Number(values[mission.id] || 0));
    return { ...mission, key, progress, completed: db.economy.dailyMissionRewards.includes(key), unlocked };
  });
}

function rewardDailyMissions(userId, dayKey = saoPauloDayKey()) {
  let rewarded = false;
  dailyMissionsFor(userId, dayKey).forEach((mission) => {
    if (!mission.unlocked || mission.completed || mission.progress < mission.target) return;
    const before = walletFor(userId); addCredits(userId, mission.reward);
    db.economy.dailyMissionRewards.push(mission.key);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'daily-mission', amount: mission.reward, before, after: before + mission.reward, reason: 'Missão diária: ' + mission.title, createdAt: new Date().toISOString() });
    rewarded = true;
  });
  return rewarded;
}

function previousWeekKey() {
  const value = new Date(saoPauloWeekKey() + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() - 7);
  return value.toISOString().slice(0, 10);
}

function cleanNameMissionFor(userId) {
  const weekKey = saoPauloWeekKey();
  const hasConfirmedLie = db.lieAccusations.some((item) => item.targetUserId === userId && item.status === 'confirmed' && Number(item.delta) > 0 && dayKeyForTimestamp(item.confirmedAt || item.createdAt) >= weekKey);
  const startsAt = String(db.settings.missionEconomyStartWeek || weekKey);
  return { id: 'clean-name', icon: '😇', title: 'Nome limpo', description: 'Termine a semana sem nenhuma mentira confirmada.', reward: 20, weekKey, cleanSoFar: !hasConfirmedLie, settled: db.economy.cleanNameRewards.includes(userId + ':' + weekKey), startsAt, unlocked: weekKey >= startsAt };
}

function settleCleanNameRewards() {
  const weekKey = previousWeekKey();
  if (weekKey < String(db.settings.missionEconomyStartWeek || weekKey)) return false;
  const endKey = saoPauloWeekKey(); let changed = false;
  db.users.filter((item) => item.active && item.approved !== false).forEach((user) => {
    const key = user.id + ':' + weekKey;
    if (db.economy.cleanNameRewards.includes(key)) return;
    const lied = db.lieAccusations.some((item) => item.targetUserId === user.id && item.status === 'confirmed' && Number(item.delta) > 0 && (() => { const day = dayKeyForTimestamp(item.confirmedAt || item.createdAt); return day >= weekKey && day < endKey; })());
    db.economy.cleanNameRewards.push(key); changed = true;
    if (lied) return;
    const before = walletFor(user.id); addCredits(user.id, 20);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'clean-name', amount: 20, before, after: before + 20, reason: 'Missão semanal: Nome limpo', createdAt: new Date().toISOString() });
    changed = true;
  });
  return changed;
}

function awardHydrationGoal(userId, dayKey) {
  const key = userId + ':' + dayKey;
  if (db.economy.waterRewardDays.includes(key)) return false;
  db.economy.waterRewardDays.push(key);
  addCredits(userId, 45);
  recordMissionActivity(userId, 'hydration_goal');
  return true;
}

function teamMissionFor() {
  const weekKey = saoPauloWeekKey();
  const progress = db.waterEntries.filter((item) => item.dayKey >= weekKey).reduce((sum, item) => sum + Number(item.ml || 0), 0);
  return { weekKey, targetMl: 18000, progressMl: Math.min(18000, progress), completed: db.economy.teamMissionRewards.includes(weekKey), reward: 15 };
}

function rewardTeamMissionIfComplete() {
  const mission = teamMissionFor();
  if (mission.completed || mission.progressMl < mission.targetMl) return false;
  db.economy.teamMissionRewards.push(mission.weekKey);
  db.users.filter((item) => item.active && item.approved !== false).forEach((person) => {
    const before = walletFor(person.id); addCredits(person.id, mission.reward);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: person.id, mode: 'team-mission', amount: mission.reward, before, after: before + mission.reward, reason: 'Missão cooperativa de hidratação', createdAt: new Date().toISOString() });
  });
  return true;
}

function monthKeyFor(date = new Date()) { return saoPauloDayKey(date).slice(0, 7); }
function previousMonthKey() { const now = new Date(); return monthKeyFor(new Date(now.getFullYear(), now.getMonth() - 1, 15)); }
function seasonSummary(monthKey = monthKeyFor()) {
  const people = db.users.filter((item) => item.approved !== false).map((person) => {
    const prefix = monthKey + '-';
    const water = db.waterEntries.filter((item) => item.userId === person.id && item.dayKey.startsWith(prefix)).reduce((sum, item) => sum + item.ml, 0);
    const memes = db.dailyMemes.filter((item) => item.userId === person.id && item.createdAt.startsWith(monthKey)).length;
    const phrases = db.dailyPhrases.filter((item) => item.userId === person.id && item.createdAt.startsWith(monthKey)).length;
    const lies = db.lieAccusations.filter((item) => item.targetUserId === person.id && item.status === 'confirmed' && item.createdAt.startsWith(monthKey)).reduce((sum, item) => sum + Math.max(0, item.delta), 0);
    const best = db.votings.filter((item) => item.status === 'closed' && String(item.closedAt || '').startsWith(monthKey) && db.submissions.find((submission) => submission.id === item.bestWinnerId)?.userId === person.id).length;
    const gay = db.draws.filter((item) => item.type === 'gay' && item.createdAt.startsWith(monthKey) && item.winnerId === person.id).length;
    const points = best * 25 + memes * 3 + phrases * 2 + Math.floor(water / 2500) * 4 + gay * 2 + lies;
    return { id: person.id, displayName: person.displayName, points, water, memes, phrases, best, gay, lies };
  }).sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  return { monthKey, ranking: people.slice(0, 9), leader: people[0]?.points > 0 ? people[0] : null };
}

function seasonalChallengesFor(userId, monthKey = monthKeyFor()) {
  const rewards = new Set(db.economy.seasonChallengeRewards || []);
  return seasonalChallengeProgress(db, userId, monthKey, dayKeyForTimestamp).map((challenge) => ({
    ...challenge,
    key: monthKey + ':' + challenge.id + ':' + userId,
    rewarded: rewards.has(monthKey + ':' + challenge.id + ':' + userId),
  }));
}

function settleSeasonalChallenges(monthKey = monthKeyFor()) {
  let changed = false;
  db.users.filter((person) => person.active && person.approved !== false).forEach((person) => {
    seasonalChallengesFor(person.id, monthKey).forEach((challenge) => {
      if (!challenge.teamCompleted || !challenge.eligible || challenge.rewarded) return;
      db.economy.seasonChallengeRewards.push(challenge.key);
      const before = walletFor(person.id);
      addCredits(person.id, challenge.reward);
      db.economy.creditAdjustments.push({
        id: randomUUID(), userId: person.id, mode: 'season-challenge', amount: challenge.reward,
        before, after: before + challenge.reward, reason: 'Desafio mensal: ' + challenge.title,
        createdAt: new Date().toISOString(), monthKey, challengeId: challenge.id,
      });
      changed = true;
    });
  });
  if (db.economy.seasonChallengeRewards.length > 5000) db.economy.seasonChallengeRewards = db.economy.seasonChallengeRewards.slice(-5000);
  return changed;
}

function reactionsFor(targetType, targetId, userId) {
  const entries = db.dailyReactions.filter((item) => item.targetType === targetType && item.targetId === targetId);
  const counts = Object.fromEntries(WALL_EMOJIS.map((emoji) => [emoji, entries.filter((item) => item.emoji === emoji).length]));
  return { counts, mine: entries.filter((item) => item.userId === userId).map((item) => item.emoji), total: entries.length,
    people: entries.map((item) => ({ emoji: item.emoji, name: db.users.find((person) => person.id === item.userId)?.displayName || 'Participante removido' })) };
}

function activeLieReasons(targetUserId) {
  const stack = [];
  db.lieAccusations.filter((item) => item.targetUserId === targetUserId && item.status === 'confirmed')
    .sort((a, b) => String(a.confirmedAt || a.createdAt).localeCompare(String(b.confirmedAt || b.createdAt)))
    .forEach((item) => {
      if (item.delta > 0) stack.push(item);
      else if (item.delta < 0 && stack.length) stack.pop();
    });
  return stack;
}

function cosmeticsFor(userId) {
  return db.economy.equipped[userId] || { title: null, nameStyle: null, frame: null };
}

function availablePowerPurchases(userId, itemId) {
  const used = new Set(db.economy.powerUses.map((item) => item.purchaseId));
  return db.economy.purchases.filter((item) => item.userId === userId && item.itemId === itemId && !item.mysteryDecisionPending && !used.has(item.id));
}

function consumePower(userId, itemId, details = {}) {
  const purchase = availablePowerPurchases(userId, itemId)[0];
  if (!purchase) throw new HttpError(409, 'Você não possui este poder. Compre-o primeiro na loja.');
  db.economy.powerUses.push({ id: randomUUID(), purchaseId: purchase.id, userId, itemId, usedAt: new Date().toISOString(), ...details });
}

function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers,
  });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';')
    .map((part) => part.trim().split('=')).filter(([key]) => key)
    .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]));
}

function gateAuthorizationFor(req) {
  const token = String(parseCookies(req).area51_gate || '');
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return db.gateAuthorizations.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now()) || null;
}

function hasGateAccess(req) { return Boolean(gateAuthorizationFor(req)); }

function serveGatePage(res) {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0e13"><title>404 — Página não encontrada</title><style>
  *{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;place-items:center;overflow:hidden;background:#0b0e13;color:#e8ebef;font-family:Arial,Helvetica,sans-serif}.noise{position:fixed;inset:0;opacity:.025;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}.error{width:min(620px,calc(100% - 38px));text-align:center}.code{margin:0;color:#f4f5f7;font-size:clamp(92px,21vw,190px);line-height:.78;letter-spacing:-9px;font-weight:900;text-shadow:0 12px 44px #000}.error h1{margin:35px 0 10px;font-size:clamp(20px,4vw,31px)}.error p{margin:0;color:#838b97;font-size:14px;line-height:1.6}.secret{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;width:190px;margin:46px auto 0;transition:.2s}.secret input{min-width:0;width:100%;padding:11px 5px;border:0;border-bottom:1px solid #252b34;outline:0;background:transparent;color:#aeb6c1;font-size:15px;letter-spacing:10px;text-align:center;-webkit-text-security:disc;transition:.2s}.secret:focus-within input{border-color:#46505f}.secret input::placeholder{color:#303640;letter-spacing:3px}.secret button{min-width:62px;min-height:40px;padding:0 10px;border:1px solid #303844;border-radius:9px;background:#171c24;color:#9099a6;font-size:9px;font-weight:800;letter-spacing:.7px;cursor:pointer}.secret button:active{transform:scale(.97);background:#222a35}.hint{grid-column:1/-1;display:block;margin-top:2px;color:#343b45;font-size:9px;letter-spacing:1.3px}.error.denied{animation:deny .3s}.error.denied .code{color:#d8dbe0}@keyframes deny{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}@media(max-width:520px){.error{width:min(100% - 28px,420px)}.error p{padding:0 12px;font-size:13px}.secret{width:210px}.secret button{min-width:72px;min-height:44px;color:#bdc5d0}}
  </style></head><body><div class="noise"></div><main class="error" id="error"><div class="code">404</div><h1>Página não encontrada</h1><p>O endereço solicitado não existe ou não está mais disponível.</p><form class="secret" id="gateForm" autocomplete="off"><input id="gateCode" name="code" type="password" inputmode="numeric" enterkeyhint="go" maxlength="24" aria-label="Código do incidente" placeholder="···"><button type="submit" aria-label="Entrar com o código">ENTRAR</button><small class="hint">CÓDIGO DO INCIDENTE</small></form></main><script>
  const form=document.getElementById('gateForm'),input=document.getElementById('gateCode'),box=document.getElementById('error');document.addEventListener('keydown',e=>{if(e.key>='0'&&e.key<='9'&&document.activeElement!==input){input.focus();input.value+=e.key;e.preventDefault()}if(e.key==='Enter'&&document.activeElement!==input){form.requestSubmit();e.preventDefault()}});form.addEventListener('submit',async e=>{e.preventDefault();if(!input.value)return;try{const response=await fetch('/api/gate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:input.value})});if(response.ok){location.reload();return}}catch{}input.value='';box.classList.remove('denied');void box.offsetWidth;box.classList.add('denied');input.focus()});
  </script></body></html>`;
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'");
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function sessionFor(req) {
  const token = parseCookies(req).sorteios_session;
  let session = token ? sessions.get(token) : null;
  if (!session && token) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const remembered = db.rememberTokens.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now());
    if (remembered) {
      session = { userId: remembered.userId, expiresAt: remembered.expiresAt };
      sessions.set(token, session);
    }
  }
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const user = db.users.find((item) => item.id === session.userId && item.active);
  return user ? { token, user } : null;
}

function requireAuth(req) {
  const auth = sessionFor(req);
  if (!auth) throw new HttpError(401, 'Faça login para continuar.');
  return auth;
}

function requireAdmin(req) {
  const auth = requireAuth(req);
  if (auth.user.role !== 'admin') throw new HttpError(403, 'Ação exclusiva do administrador.');
  if (auth.user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
  return auth;
}

function publicDraw(result) {
  const { winnerUserId, ...safeResult } = result;
  return safeResult;
}

function sendLiveEvent(res, event, data) {
  res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcastLive(event, data) {
  for (const [client, userId] of [...liveClients]) {
    try { sendLiveEvent(client, event, event === 'draw' ? drawForUser(data, userId) : data); }
    catch { liveClients.delete(client); }
  }
}

function broadcastRefresh(reason) {
  broadcastLive('refresh', { reason, serverTime: Date.now() });
}

function startLiveDraw(result, candidates) {
  const startedAt = Date.now() + 450;
  const safeResult = publicDraw(result);
  const items = candidates.map((item) => result.type === 'theme'
    ? { id: item, label: item, detail: 'Tema' }
    : result.type === 'wallpaper'
      ? { id: item.id, label: item.title, detail: null }
      : { id: item.id, label: item.displayName, detail: 'Participante' });
  liveDraw = {
    id: result.id, mode: result.type, result: safeResult, items,
    recipientUserId: result.winnerUserId || null,
    startedAt, duration: LIVE_DRAW_DURATION, endsAt: startedAt + LIVE_DRAW_DURATION,
  };
  db.settings.liveDraw = liveDraw;
  broadcastLive('draw', liveDraw);
  clearTimeout(liveDrawCleanup);
  liveDrawCleanup = setTimeout(() => {
    if (liveDraw && liveDraw.id === result.id) liveDraw = null;
  }, LIVE_DRAW_DURATION + 2000);
  return liveDraw;
}

function drawForUser(draw, userId) {
  const personalized = { ...draw, result: { ...draw.result } };
  delete personalized.recipientUserId;
  if (draw.mode === 'wallpaper' && draw.recipientUserId !== userId) personalized.result.imageUrl = null;
  if (draw.mode === 'gay' && draw.recipientUserId !== userId) {
    personalized.result.watermarkSourceUrl = null;
    personalized.result.watermarkSourceTitle = null;
  }
  return personalized;
}

async function readJson(req, maxBytes = 12 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Solicitação muito grande.');
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; }
  catch { throw new HttpError(400, 'Dados enviados em formato inválido.'); }
}

function safeUser(user) {
  const { id, username, displayName, role, active, eligible, approved, mustChangePassword, createdAt } = user;
  return { id, username, displayName, role, active, eligible, approved: approved !== false, mustChangePassword: Boolean(mustChangePassword), createdAt, avatarDataUrl: user.avatarDataUrl || null };
}

function feedbackForClient(user) {
  const visibleMessages = user.role === 'admin'
    ? db.feedbackMessages
    : db.feedbackMessages.filter((item) => item.authorId === user.id && item.status !== 'archived');
  return visibleMessages.slice(-200).map((item) => ({
    id: item.id,
    type: item.type,
    message: item.message,
    authorId: item.authorId,
    authorName: item.authorName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || item.createdAt,
    status: ['approved', 'done', 'rejected', 'archived'].includes(item.status) ? item.status : 'pending',
    adminComment: item.adminComment || '',
    approvedAt: item.approvedAt || null,
    completedAt: item.completedAt || null,
    archivedAt: item.archivedAt || null,
  }));
}

function openVoting() {
  return [...db.votings].reverse().find((item) => item.status === 'open') || null;
}

function activeLoanFor(userId) {
  return [...db.economy.loans].reverse().find((loan) => loan.userId === userId && loan.status === 'active') || null;
}

function overdueLoanFor(userId, now = Date.now()) {
  const loan = activeLoanFor(userId);
  return loan?.dueAt && Date.parse(loan.dueAt) <= now && Number(loan.remainingDue) > 0 ? loan : null;
}

function applyLoanPayment(userId, requested, reason) {
  const loan = activeLoanFor(userId);
  if (!loan) return 0;
  const amount = Math.min(requested, Number(loan.remainingDue), walletFor(userId));
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  const before = walletFor(userId), createdAt = new Date().toISOString();
  addCredits(userId, -amount);
  loan.remainingDue -= amount;
  loan.payments.push({ amount, createdAt });
  if (loan.remainingDue === 0) { loan.status = 'paid'; loan.paidAt = createdAt; }
  db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'stellar-loan-payment', amount: -amount, before, after: before - amount, reason, createdAt });
  return amount;
}

function eligibleUsers() {
  const snapshot = db.settings.currentRoundId ? new Set(db.settings.currentParticipantIds || []) : null;
  return db.users.filter((item) => item.active && (snapshot ? snapshot.has(item.id) : item.eligible && !overdueLoanFor(item.id)));
}

function roundAcceptsNewParticipants() {
  const roundId = db.settings.currentRoundId;
  if (!roundId || !db.settings.currentTheme || db.settings.currentParticipantsLocked) return false;
  if (db.assignments.some((item) => item.roundId === roundId) || db.votings.some((item) => item.roundId === roundId)) return false;
  const participantIds = db.settings.currentParticipantIds || [];
  const submitterIds = new Set(db.submissions.filter((item) => item.active && item.roundId === roundId).map((item) => item.userId));
  const everyoneReady = participantIds.length > 0 && participantIds.every((id) => submitterIds.has(id));
  return participantIds.length < 2 || !everyoneReady;
}

function joinOpenRound(user) {
  if (!roundAcceptsNewParticipants() || overdueLoanFor(user.id)) return false;
  if (!db.settings.currentParticipantIds.includes(user.id)) db.settings.currentParticipantIds.push(user.id);
  return true;
}

function currentVoting() {
  const roundId = db.settings.currentRoundId;
  return roundId ? [...db.votings].reverse().find((item) => item.roundId === roundId) || null : null;
}

function scoreFor(userId) {
  return db.scores[userId] || { points: 0, bestWins: 0, worstWins: 0, gayWins: 0 };
}

function addScore(userId, changes) {
  const current = scoreFor(userId);
  db.scores[userId] = {
    points: current.points + (changes.points || 0),
    bestWins: current.bestWins + (changes.bestWins || 0),
    worstWins: current.worstWins + (changes.worstWins || 0),
    gayWins: current.gayWins + (changes.gayWins || 0),
  };
}

function finishVoting(voting) {
  if (voting.status !== 'closed') {
    voting.status = 'closed';
    voting.closedAt = new Date().toISOString();
  }
  const votes = voting.votes || [];
  const totals = voting.submissionIds.map((id) => ({
    id,
    best: votes.filter((vote) => vote.bestId === id).length,
    worst: votes.filter((vote) => vote.worstId === id).length,
  }));
  if (votes.length && (!voting.bestWinnerId || !voting.worstWinnerId)) {
    const maxBest = Math.max(...totals.map((item) => item.best));
    const bestLeaders = totals.filter((item) => item.best === maxBest);
    const bestWinner = bestLeaders[randomInt(bestLeaders.length)];
    const worstPool = totals.filter((item) => item.id !== bestWinner.id);
    const maxWorst = Math.max(...worstPool.map((item) => item.worst));
    const worstLeaders = worstPool.filter((item) => item.worst === maxWorst);
    const worstWinner = worstLeaders[randomInt(worstLeaders.length)];
    voting.bestWinnerId = bestWinner.id;
    voting.worstWinnerId = worstWinner.id;
    voting.bestWinnerVotes = bestWinner.best;
    voting.worstWinnerVotes = worstWinner.worst;
    voting.bestTiebreak = bestLeaders.length > 1;
    voting.worstTiebreak = worstLeaders.length > 1;
  }
  if (voting.scoresApplied) return;
  const bestSubmission = db.submissions.find((item) => item.id === voting.bestWinnerId);
  const worstSubmission = db.submissions.find((item) => item.id === voting.worstWinnerId);
  if (bestSubmission) {
    addScore(bestSubmission.userId, { bestWins: 1 });
    addCredits(bestSubmission.userId, 120);
    const winner = db.users.find((item) => item.id === bestSubmission.userId);
    db.economy.creditAdjustments.push({ id: randomUUID(), adminId: null, adminName: 'Resultado da rodada', userId: bestSubmission.userId, mode: 'best-wallpaper-reward', amount: 120, before: walletFor(bestSubmission.userId) - 120, after: walletFor(bestSubmission.userId), reason: 'Bônus de Melhor Wallpaper', createdAt: new Date().toISOString(), roundId: voting.roundId, userName: winner?.displayName || bestSubmission.uploader });
  }
  if (worstSubmission) addScore(worstSubmission.userId, { worstWins: 1 });
  voting.scoresApplied = true;
}

function votingForClient(voting, user) {
  if (!voting) return null;
  const votes = voting.votes || [];
  const closed = voting.status === 'closed';
  const canViewEntries = closed || voting.requiredVoterIds.includes(user.id);
  const entries = voting.submissionIds.map((id) => {
    const item = db.submissions.find((submission) => submission.id === id);
    if (!item) return null;
    const bestVotes = votes.filter((vote) => vote.bestId === id).length;
    const worstVotes = votes.filter((vote) => vote.worstId === id).length;
    return {
      id: item.id, title: item.title, imageUrl: canViewEntries ? '/uploads/' + item.filename : null,
      revealed: closed, uploader: closed ? item.uploader : null,
      bestVotes: closed ? bestVotes : null, worstVotes: closed ? worstVotes : null,
      isBestWinner: closed && voting.bestWinnerId === item.id,
      isWorstWinner: closed && voting.worstWinnerId === item.id,
    };
  }).filter(Boolean);
  return {
    id: voting.id, status: voting.status, roundName: voting.roundName,
    totalVoters: voting.requiredVoterIds.length, receivedVotes: votes.length,
    userCanVote: voting.status === 'open' && voting.requiredVoterIds.includes(user.id),
    userHasVoted: votes.some((vote) => vote.userId === user.id),
    gayDrawCompleted: db.draws.some((item) => item.type === 'gay' && item.roundId === voting.roundId),
    result: closed ? {
      bestWinnerId: voting.bestWinnerId, worstWinnerId: voting.worstWinnerId,
      bestTiebreak: Boolean(voting.bestTiebreak), worstTiebreak: Boolean(voting.worstTiebreak),
    } : null,
    openedAt: voting.openedAt, closedAt: voting.closedAt || null, entries,
  };
}

function liveTitleAssignments() {
  const titles = new Map();
  const give = (userId, title) => {
    if (!userId) return;
    const current = titles.get(userId) || [];
    if (!current.some((item) => item.id === title.id)) current.push(title);
    titles.set(userId, current);
  };
  const latestGay = [...db.draws].reverse().find((item) => item.type === 'gay');
  if (latestGay?.winnerId) give(latestGay.winnerId, { id: 'live-gay', icon: '🌈', name: 'Gay da Rodada', reason: 'Sorteado na rodada mais recente' });

  const activeUsers = db.users.filter((item) => item.active);
  const lieLeaders = activeUsers.map((person) => {
    const events = db.lieAccusations.filter((item) => item.targetUserId === person.id && item.status === 'confirmed').sort((a, b) => String(a.confirmedAt || a.createdAt).localeCompare(String(b.confirmedAt || b.createdAt)));
    const total = Math.max(0, events.reduce((sum, item) => sum + item.delta, 0));
    let running = 0; let reachedAt = null;
    events.forEach((item) => { running += item.delta; if (!reachedAt && running === total) reachedAt = item.confirmedAt || item.createdAt; });
    return { id: person.id, total, reachedAt: reachedAt || '9999' };
  }).sort((a, b) => b.total - a.total || a.reachedAt.localeCompare(b.reachedAt));
  if (lieLeaders[0]?.total > 0) give(lieLeaders[0].id, { id: 'live-liar', icon: '🤥', name: 'Mentiroso Cósmico', reason: 'Lidera o Mentirômetro' });

  const dayKey = saoPauloDayKey();
  const waterLeaders = activeUsers.map((person) => {
    const entries = db.waterEntries.filter((item) => item.userId === person.id && item.dayKey === dayKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const total = entries.reduce((sum, item) => sum + item.ml, 0);
    return { id: person.id, total, reachedAt: entries.at(-1)?.createdAt || '9999' };
  }).sort((a, b) => b.total - a.total || a.reachedAt.localeCompare(b.reachedAt));
  if (waterLeaders[0]?.total > 0) give(waterLeaders[0].id, { id: 'live-water', icon: '💧', name: 'Bebedor de Água', reason: 'Maior consumo de água hoje' });
  return titles;
}

function isForcedCursorActive(item, roundId, now = Date.now()) {
  if (item.style === 'giant-slow') return now < (item.expiresAt ? Date.parse(item.expiresAt) : Date.parse(item.createdAt) + 86400000);
  return Boolean(roundId && item.roundId === roundId);
}

function recordFlightPayout(flight,bet,multiplier,createdAt) {
  if(bet.result)return bet.result;
  const payout=Math.round(bet.bet*multiplier),account=casinoAccountFor(bet.userId,true);
  if(bet.walletSource==='shop')addCredits(bet.userId,payout);else account.balance=Number(account.balance)+payout;
  bet.status='cashed-out';bet.multiplier=multiplier;bet.payout=payout;bet.endedAt=createdAt;
  const play={id:randomUUID(),flightId:flight.id,userId:bet.userId,dayKey:saoPauloDayKey(),walletSource:bet.walletSource,bet:bet.bet,resultType:'flight',multiplier,payout,net:payout-bet.bet,balanceAfter:bet.walletSource==='shop'?walletFor(bet.userId):account.balance,createdAt};
  bet.result=play;db.economy.casinoPlays.push(play);return play;
}
function settleGlobalFlight(now=Date.now()) {
  const flight=db.economy.globalFlight;
  const wasCrashed=flight?.status==='crashed';
  const changed=settleFlight(flight,now,(bet,multiplier,date)=>recordFlightPayout(flight,bet,multiplier,date),(bet,date)=>{
    bet.status='crashed';
    db.economy.casinoPlays.push({id:randomUUID(),flightId:flight.id,userId:bet.userId,dayKey:saoPauloDayKey(),walletSource:bet.walletSource,bet:bet.bet,resultType:'flight',multiplier:0,payout:0,net:-bet.bet,balanceAfter:bet.walletSource==='shop'?walletFor(bet.userId):casinoAccountFor(bet.userId).balance,createdAt:date});
  });
  if(changed && !wasCrashed && flight.status==='crashed'){
    db.economy.flightHistory.push({id:flight.id,multiplier:flight.crashAt,players:flight.bets.length,createdAt:flight.endedAt});
    db.economy.flightHistory=db.economy.flightHistory.slice(-100);
  }
  return changed;
}
function flightStatusFor(user) {
  const f=db.economy.globalFlight,now=Date.now();
  if(!f)return {active:false,phase:'waiting',serverTime:now};
  const bet=f.bets.find(b=>b.userId===user.id);
  const base={id:f.id,serverTime:now,launchAt:f.launchAt,stepMs:flightStepMs(f),players:f.bets.length,joined:Boolean(bet),cashedOut:bet?.status==='cashed-out',autoCashout:bet?.autoCashout || null,payout:bet?.payout || 0};
  if(f.status==='crashed')return {...base,active:false,phase:'crashed',crashed:true,crashAt:f.crashAt};
  const multiplier=flightMultiplier(f,now);
  return {...base,active:true,phase:now<f.launchAt?'countdown':'flying',countdownMs:Math.max(0,f.launchAt-now),multiplier:Number(multiplier.toFixed(2)),canCashOut:now>=f.launchAt && bet?.status==='active' && multiplier>=1.25};
}
function isTradableVisual(item) {
  return Boolean(item && !item.adminOnly && !item.consumable && !item.service && !item.mysteryBox && ['cursorStyle','trailStyle','siteTheme','frame','nameStyle','title','badge'].includes(item.type));
}
function tradablePurchase(id, ownerId) {
  const purchase = db.economy.purchases.find(p => p.id === id && p.userId === ownerId && !p.mysteryDecisionPending);
  const item = purchase && SHOP_CATALOG.find(i => i.id === purchase.itemId);
  return isTradableVisual(item) ? {purchase,item} : null;
}
function tradingFor(user) {
  const catalog=new Map(SHOP_CATALOG.map(item=>[item.id,item]));
  const participants = db.users.filter(p => p.active).map(person => ({id:person.id,name:person.displayName,items:db.economy.purchases.filter(p=>p.userId===person.id && !p.mysteryDecisionPending && isTradableVisual(catalog.get(p.itemId))).map(p=>({id:p.id,itemId:p.itemId,name:catalog.get(p.itemId).name}))}));
  const trades = (db.economy.trades || []).filter(t=>t.fromId===user.id || t.toId===user.id).slice(-20).reverse().map(t=>({...t,status:t.status==='pending' && Date.parse(t.expiresAt)<=Date.now()?'expired':t.status,partnerName:db.users.find(p=>p.id===(t.fromId===user.id?t.toId:t.fromId))?.displayName || 'Conta removida',incoming:t.toId===user.id}));
  return {participants,trades};
}
async function handleCommunityExtras(req,res,route) {
  if (!['/api/trades/create','/api/trades/respond','/api/lie-meter/report'].includes(route) || req.method!=='POST') return false;
  const {user}=requireAuth(req); const body=await readJson(req); const now=new Date().toISOString();
  if (route==='/api/lie-meter/report') {
    const lie=db.lieAccusations.find(l=>l.id===body.lieId && l.status==='confirmed' && l.delta>0);
    if (!lie || !activeLieReasons(lie.targetUserId).some(l=>l.id===lie.id)) throw new HttpError(404,'Mentira confirmada não encontrada.');
    const reason=String(body.reason || '').trim();
    if(reason.length<5 || reason.length>500) throw new HttpError(400,'Explique a denúncia em 5 a 500 caracteres.');
    if(db.feedbackMessages.some(f=>f.lieId===lie.id && f.authorId===user.id)) throw new HttpError(409,'Você já denunciou este registro. Acompanhe em Minhas solicitações.');
    const name=id=>db.users.find(p=>p.id===id)?.displayName || 'Não registrado';
    db.feedbackMessages.push({id:randomUUID(),type:'bug',lieId:lie.id,message:'Denúncia de mentira de '+name(lie.targetUserId)+': “'+(lie.reason||'Sem motivo registrado')+'”. Registrada por '+name(lie.createdByUserId)+'; aprovada por '+name(lie.validatedByUserId)+'. Motivo da denúncia: '+reason,authorId:user.id,authorName:user.displayName,createdAt:now,updatedAt:now,status:'pending',adminComment:'',approvedAt:null,completedAt:null,archivedAt:null});
  } else if(route==='/api/trades/create') {
    const partner=db.users.find(p=>p.id===body.partnerId && p.active && p.id!==user.id);
    const offered=tradablePurchase(body.offeredId,user.id),wanted=partner && tradablePurchase(body.wantedId,partner.id);
    if(!partner || !offered || !wanted) throw new HttpError(400,'Escolha dois visuais disponíveis e outro participante.');
    if(offered.item.id===wanted.item.id || db.economy.purchases.some(p=>(p.userId===partner.id && p.itemId===offered.item.id)||(p.userId===user.id && p.itemId===wanted.item.id))) throw new HttpError(409,'Uma das pessoas já possui o visual que receberia.');
    db.economy.trades ||= [];
    const pending=db.economy.trades.filter(t=>t.status==='pending' && Date.parse(t.expiresAt)>Date.now());
    if(pending.filter(t=>t.fromId===user.id).length>=3) throw new HttpError(409,'Você pode ter até 3 propostas pendentes.');
    if(pending.some(t=>t.fromId===user.id && t.offeredId===body.offeredId && t.wantedId===body.wantedId)) throw new HttpError(409,'Esta proposta já foi enviada.');
    db.economy.trades.push({id:randomUUID(),fromId:user.id,toId:partner.id,offeredId:offered.purchase.id,wantedId:wanted.purchase.id,offeredName:offered.item.name,wantedName:wanted.item.name,status:'pending',createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+86400000).toISOString()});
  } else {
    const trade=(db.economy.trades || []).find(t=>t.id===body.id && (t.fromId===user.id || t.toId===user.id));
    if(!trade) throw new HttpError(404,'Proposta não encontrada.');
    if(!['accept','reject','cancel'].includes(body.action)) throw new HttpError(400,'Ação inválida.');
    if((body.action==='cancel' && trade.fromId!==user.id)||(body.action!=='cancel' && trade.toId!==user.id)) throw new HttpError(403,'Você não pode realizar esta ação.');
    if(trade.status!=='pending') {json(res,200,stateFor(user));return true;}
    if(Date.parse(trade.expiresAt)<=Date.now()) throw new HttpError(409,'Esta proposta expirou.');
    if(body.action==='accept') {
      const a=tradablePurchase(trade.offeredId,trade.fromId),b=tradablePurchase(trade.wantedId,trade.toId);
      if(!a || !b || !db.users.some(p=>p.id===trade.fromId && p.active) || db.economy.purchases.some(p=>(p.userId===trade.fromId && p.itemId===b.item.id)||(p.userId===trade.toId && p.itemId===a.item.id))) throw new HttpError(409,'Os itens mudaram ou já estão na coleção. Recuse esta proposta e crie outra.');
      for(const [entry,owner,next] of [[a,trade.fromId,trade.toId],[b,trade.toId,trade.fromId]]) {
        if(db.economy.equipped[owner]?.[entry.item.type]===entry.item.id) db.economy.equipped[owner][entry.item.type]=null;
        entry.purchase.ledgerUserId ||= owner;
        entry.purchase.userId=next;
      }
      trade.status='accepted';
      for(const other of db.economy.trades) if(other.id!==trade.id && other.status==='pending' && [other.offeredId,other.wantedId].some(id=>id===trade.offeredId || id===trade.wantedId)){other.status='cancelled';other.updatedAt=now;}
    } else trade.status=body.action==='reject'?'rejected':'cancelled';
    trade.updatedAt=now;
  }
  await persist();broadcastRefresh('community');json(res,200,stateFor(user));return true;
}



function profileFor(user, computed = {}) {
  const score = scoreFor(user.id);
  const purchases = db.economy.purchases.filter((item) => item.userId === user.id);
  const ownedIds = new Set(purchases.map((item) => item.itemId));
  const equipped = cosmeticsFor(user.id);
  const hydrationDays = db.economy.waterRewardDays.filter((key) => key.startsWith(user.id + ':')).length;
  const activityTotals = db.economy.activityTotals[user.id] || {};
  const memes = Number(activityTotals.meme || db.dailyMemes.filter((item) => item.userId === user.id).length);
  const phrases = Number(activityTotals.phrase || db.dailyPhrases.filter((item) => item.userId === user.id).length);
  const forcedCursor = [...db.economy.forcedCursors].reverse().find((item) => item.targetUserId === user.id && isForcedCursorActive(item, db.settings.currentRoundId));
  const latestGayWinnerDraw = [...db.draws].reverse().find((item) => item.type === 'gay');
  const gayWinnerDraw = latestGayWinnerDraw?.winnerId === user.id ? latestGayWinnerDraw : null;
  const previousSeason = computed.previousSeason || seasonSummary(previousMonthKey());
  const medals = [
    { id: 'first-step', icon: '🚀', name: 'Primeiro contato', description: 'Entrou para a tripulação.', unlocked: true },
    { id: 'hydrated', icon: '💧', name: 'Hidratado', description: 'Alcançou a meta diária de água.', unlocked: hydrationDays >= 1 },
    { id: 'water-streak', icon: '🌊', name: 'Oceano particular', description: 'Alcançou a meta em 5 dias.', unlocked: hydrationDays >= 5 },
    { id: 'meme-agent', icon: '😂', name: 'Agente do caos', description: 'Publicou pelo menos 3 memes.', unlocked: memes >= 3 },
    { id: 'philosopher', icon: '💬', name: 'Filósofo alienígena', description: 'Publicou pelo menos 5 frases.', unlocked: phrases >= 5 },
    { id: 'champion', icon: '🏆', name: 'Campeão da Área 51', description: 'Venceu como melhor wallpaper.', unlocked: score.bestWins >= 1 },
    { id: 'collector', icon: '🛍️', name: 'Colecionador cósmico', description: 'Comprou pelo menos 3 itens.', unlocked: purchases.length >= 3 },
    { id: 'season-champion', icon: '🌟', name: 'Campeão da temporada', description: 'Terminou um mês na liderança geral.', unlocked: previousSeason.leader?.id === user.id },
  ];
  return {
    wallet: walletFor(user.id), equipped,
    cardPacks: db.economy.purchases.filter(p=>p.userId===user.id && p.itemId==='card-pack-cosmic' && !p.cardPackOpenedAt).map(p=>({id:p.id})),
    openedCardPacks: db.economy.purchases.filter(p=>p.userId===user.id && p.cardPackOpenedAt).slice(-3).reverse().map(p=>({id:p.id,cards:p.cardPackRewards,openedAt:p.cardPackOpenedAt})),
    physicalPrizes: physicalKitClaim() && (physicalKitClaim().userId === user.id || user.role === 'admin') ? [{ ...physicalKitClaim(), winnerName: db.users.find(entry => entry.id === physicalKitClaim().userId)?.displayName || 'Participante' }] : [],
    loan: (() => {
      const active = [...db.economy.loans].reverse().find((item) => item.userId === user.id && item.status === 'active');
      return active ? { id: active.id, principal: active.principal, totalDue: active.totalDue, remainingDue: active.remainingDue, createdAt: active.createdAt, dueAt: active.dueAt || null, overdue: Boolean(overdueLoanFor(user.id)), extended: Boolean(active.extendedAt) } : null;
    })(),
    mysteryBoxes: db.economy.mysteryBoxes.filter((entry) => entry.userId === user.id).map((entry) => {
      const box = SHOP_CATALOG.find((item) => item.id === entry.boxId && item.mysteryBox);
      return { ...entry, name: box?.name || 'Baú misterioso', icon: box?.icon || '🎁', tier: box?.tier || 'sonda', sellPrice: Number(box?.sellPrice || 0) };
    }).sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt)),
    mysteryRewards: db.economy.purchases.filter((entry) => entry.userId === user.id && entry.sourceMysteryBoxId && entry.mysteryDecisionPending).filter((entry) => {
      const catalog = SHOP_CATALOG.find((item) => item.id === entry.itemId);
      return catalog && (!catalog.consumable || !db.economy.powerUses.some((use) => use.purchaseId === entry.id));
    }).map((entry) => {
      const catalog = SHOP_CATALOG.find((item) => item.id === entry.itemId);
      const sourceBox = SHOP_CATALOG.find((item) => item.id === entry.sourceMysteryBoxId && item.mysteryBox);
      const marketResale = Math.max(10, Math.floor(Number(catalog?.price || entry.originalPrice || 0) * .55 / 10) * 10);
      const boxResaleCap = sourceBox ? Math.max(10, Math.floor(Number(sourceBox.sellPrice || 0) * .8 / 10) * 10) : marketResale;
      const sellPrice = Math.min(marketResale, boxResaleCap);
      return { purchaseId: entry.id, itemId: entry.itemId, name: catalog?.name || 'Prêmio do baú', icon: catalog?.icon || '🎁', type: catalog?.type || '', sellPrice, equipped: equipped[catalog?.type] === entry.itemId, acquiredAt: entry.createdAt };
    }).sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt)),
    freeShopPurchaseAvailable: !db.economy.freeShopUses.includes(user.id),
    forcedCursor: gayWinnerDraw ? { style: 'gay', appliedBy: 'Sorteio Gay da Rodada', createdAt: gayWinnerDraw.createdAt, automatic: true }
      : overdueLoanFor(user.id) ? { style: 'giant-slow', appliedBy: 'Agiota Estelar — quite a dívida', createdAt: overdueLoanFor(user.id).dueAt, debt: true }
      : forcedCursor ? { style: forcedCursor.style || 'gay', appliedBy: forcedCursor.usedByName, createdAt: forcedCursor.createdAt, expiresAt: forcedCursor.expiresAt || null } : null,
    liveTitles: (computed.liveTitleMap || liveTitleAssignments()).get(user.id) || [],
    stats: { hydrationDays, memes, phrases, purchases: purchases.length, ...score },
    medals,
    mission: weeklyMissionFor(user.id), dailyMissions: dailyMissionsFor(user.id), cleanNameMission: cleanNameMissionFor(user.id), creditLedger: computed.creditLedger || creditLedgerFor(user.id),
    activePowers: {
      shield: Boolean(db.settings.currentRoundId && db.economy.shields.some((item) => item.roundId === db.settings.currentRoundId && item.userId === user.id)),
      forcedTheme: db.economy.forcedTheme && db.economy.forcedTheme.userId === user.id ? db.economy.forcedTheme.theme : null,
      forcedGay: db.economy.forcedGay && db.economy.forcedGay.userId === user.id ? db.economy.forcedGay.targetName : null,
      recentUses: db.economy.powerUses.filter((entry) => entry.userId === user.id).slice(-6).reverse().map((entry) => {
        const catalogItem = SHOP_CATALOG.find((item) => item.id === entry.itemId);
        const submission = entry.submissionId ? db.submissions.find((item) => item.id === entry.submissionId) : null;
        return { id: entry.id, name: catalogItem?.name || 'Poder da Loja 51', icon: catalogItem?.icon || '🎟️', usedAt: entry.usedAt, detail: entry.targetId ? 'Escolha: ' + (db.users.find((person) => person.id === entry.targetId)?.displayName || 'participante') : entry.theme ? 'Tema: ' + entry.theme : entry.revealCount ? entry.revealCount + ' autorias reveladas' : submission ? 'Wallpaper: ' + submission.title : entry.itemId === 'power-shield-gay' ? 'Proteção da rodada' : '' };
      }),
    },
    shop: SHOP_CATALOG.filter((item) => !item.adminOnly || user.role === 'admin').map((item) => {
      const granted = Boolean(item.adminOnly && user.role === 'admin');
      const quantity = item.cardPack ? db.economy.purchases.filter(p=>p.userId===user.id && p.itemId===item.id && !p.cardPackOpenedAt).length : item.mysteryBox ? db.economy.mysteryBoxes.filter((entry) => entry.userId === user.id && entry.boxId === item.id).length : item.consumable ? availablePowerPurchases(user.id, item.id).length : (ownedIds.has(item.id) || granted ? 1 : 0);
      return { ...item, ...(item.id === 'box-master-imperial' ? { description: item.description + (physicalKitClaim() ? ' Kit físico de caderno e caneta: esgotado (única unidade já sorteada).' : ' Extra raríssimo: 0,1% por abertura de ganhar o único kit físico de caderno e caneta, em vez do prêmio digital. Entrega combinada com o administrador; sem revenda por créditos.') } : {}), quantity, availablePoints: item.service ? score.bestWins : 0, owned: item.mysteryBox ? quantity > 0 : item.service ? false : granted || quantity > 0 || ownedIds.has(item.id), granted, equipped: !item.consumable && !item.mysteryBox && !item.service && equipped[item.type] === item.id };
    }),
    giftOptions: {
      people: db.users.filter((item) => item.active && item.approved !== false && item.id !== user.id).map((item) => ({ id: item.id, displayName: item.displayName })),
      items: SHOP_CATALOG.filter((item) => !item.adminOnly && !item.mysteryBox && !item.service).map(({ id, name, price, type, consumable }) => ({ id, name, price, type, consumable: Boolean(consumable) })),
      weeklyCreditRemaining: Math.max(0, 100 - db.economy.gifts.filter((item) => item.type === 'credits' && item.fromUserId === user.id && item.createdAt.slice(0, 10) >= saoPauloWeekKey()).reduce((sum, item) => sum + item.amount, 0)),
    },
  };
}

function creditLedgerFor(userId) {
  const purchases = db.economy.purchases.filter((item) => (item.ledgerUserId || item.userId) === userId).map((item) => {
    const catalog = SHOP_CATALOG.find((candidate) => candidate.id === item.itemId);
    const freeLabel = item.freePurchase ? 'Compra grátis: ' : item.sourceMysteryBoxId ? 'Prêmio recebido: ' : 'Compra: ';
    return { id: 'purchase:' + item.id, icon: item.freePurchase || item.sourceMysteryBoxId ? '🎁' : '🛍️', label: freeLabel + (catalog?.name || 'Item da Loja 51'), amount: -Number(item.price || 0), createdAt: item.createdAt };
  });
  const adjustments = db.economy.creditAdjustments.filter((item) => item.userId === userId).map((item) => ({ id: 'adjustment:' + item.id, icon: Number(item.after) >= Number(item.before) ? '🪙' : '↘️', label: item.reason || 'Ajuste de saldo', amount: Number(item.after) - Number(item.before), createdAt: item.createdAt }));
  const hydration = db.economy.waterRewardDays.filter((key) => key.startsWith(userId + ':')).map((key) => ({ id: 'water:' + key, icon: '💧', label: 'Meta diária de hidratação', amount: 45, createdAt: key.slice(userId.length + 1) + 'T12:00:00.000Z' }));
  const missions = db.economy.missionRewards.filter((key) => key.startsWith(userId + ':')).map((key) => {
    const parts = key.split(':'); const mission = WEEKLY_MISSIONS.find((item) => item.type === parts.at(-1));
    return { id: 'mission:' + key, icon: mission?.icon || '🚀', label: 'Missão: ' + (mission?.title || 'Missão semanal'), amount: Number(mission?.reward || 0), createdAt: parts[1] + 'T12:00:00.000Z' };
  });
  const gifts = db.economy.gifts.filter((item) => item.fromUserId === userId || item.toUserId === userId).map((item) => {
    const received = item.toUserId === userId;
    const catalog = item.itemId ? SHOP_CATALOG.find((candidate) => candidate.id === item.itemId) : null;
    return {
      id: 'gift:' + item.id,
      icon: '🎁',
      label: received ? 'Presente secreto recebido' : 'Presente secreto enviado' + (catalog ? ': ' + catalog.name : ''),
      amount: item.type === 'credits' ? (received ? Number(item.amount || 0) : -Number(item.amount || 0)) : (received ? 0 : -Number(item.amount || 0)),
      createdAt: item.createdAt,
    };
  });
  return [...purchases, ...adjustments, ...hydration, ...missions, ...gifts].filter((item) => item.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
}

function updateCommentMentions(comment) {
  const people = db.users.filter((person) => person.active && person.approved !== false && person.id !== comment.userId)
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const seen = new Set(); const mentions = [];
  const text = comment.message.normalize('NFC').toLocaleLowerCase('pt-BR');
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '@' || (index > 0 && /[\p{L}\p{N}_]/u.test(text[index - 1]))) continue;
    const person = people.find((candidate) => {
      const name = candidate.displayName.normalize('NFC').toLocaleLowerCase('pt-BR');
      return text.startsWith(name, index + 1) && !/[\p{L}\p{N}_]/u.test(text[index + name.length + 1] || '');
    });
    if (!person) continue;
    index += person.displayName.normalize('NFC').length;
    if (seen.has(person.id) || mentions.length >= 5) continue;
    seen.add(person.id);
    mentions.push({ ...((comment.mentions || []).find((item) => item.userId === person.id) || { userId: person.id, createdAt: new Date().toISOString() }), displayName: person.displayName });
  }
  comment.mentions = mentions;
}

function notificationsFor(user, creditLedger = creditLedgerFor(user.id)) {
  const roundId = db.settings.currentRoundId; const items = [];
  for (const trade of (db.economy.trades || []).filter(t => (t.toId===user.id || t.fromId===user.id) && (t.status!=='pending' || Date.parse(t.expiresAt)>Date.now())).slice(-4)) {
    items.push({id:'trade:'+trade.id,icon:'🔄',title:trade.status==='pending'?'Proposta de troca de visuais':'Proposta de troca atualizada',detail:trade.offeredName+' ↔ '+trade.wantedName,page:'perfil',createdAt:trade.updatedAt});
  }
  for(const drop of (db.economy.cardAlbums?.[user.id]?.drops || []).slice(-2))items.push({id:'card-drop:'+drop.eventId,icon:drop.icon,title:'Você encontrou uma carta!',detail:drop.name,page:'album',createdAt:drop.createdAt});
  for(const trade of (db.economy.cardTrades || []).filter(t=>t.toId===user.id || t.fromId===user.id).slice(-2))items.push({id:'card-trade:'+trade.id,icon:'🎴',title:trade.status==='pending'?'Proposta de troca de cartas':'Troca de cartas atualizada',detail:'Confira no Álbum de cartas.',page:'album',createdAt:trade.updatedAt});
  const masterGift = db.settings.masterGift136;
  if (masterGift?.userIds?.includes(user.id)) items.push({id:'feature-master-136',icon:'💠',title:'Você ganhou um Baú Master Aurora!',detail:'Brinde das novidades: abra ou venda pelo perfil.',page:'perfil',createdAt:masterGift.grantedAt});
  for (const post of [...db.dailyMemes, ...db.dailyPhrases]) {
    for (const comment of post.comments || []) {
      const mention = comment.mentions?.find((item) => item.userId === user.id);
      if (mention) items.push({ id: 'mention:' + comment.id, icon: '💬', title: comment.authorName + ' marcou você', detail: comment.message, page: 'memes', createdAt: mention.createdAt });
    }
  }
  const forcedCursor = [...db.economy.forcedCursors].reverse().find((item) => item.targetUserId === user.id && isForcedCursorActive(item, roundId));
  if (forcedCursor) items.push({ id: 'forced-cursor:' + forcedCursor.id, icon: forcedCursor.style === 'giant-slow' ? '🐌' : '🌈', title: forcedCursor.style === 'giant-slow' ? 'Maldição do Mouse Gigante ativada' : 'Seta Gay Compulsória ativada', detail: forcedCursor.style === 'giant-slow' ? 'Duração de 24 horas a partir da ativação.' : 'Seu cursor especial ficará ativo durante esta rodada.', page: 'perfil', createdAt: forcedCursor.createdAt });
  const assignment = db.assignments.find((item) => item.roundId === roundId && item.userId === user.id && item.revealed);
  if (assignment) items.push({ id: 'assignment:' + assignment.id, icon: '🖼️', title: 'Seu wallpaper chegou', detail: assignment.seenAt ? 'Wallpaper visualizado.' : 'Abra o Sorteio para visualizar.', page: 'sorteio', createdAt: assignment.revealedAt || assignment.createdAt });
  const voting = openVoting();
  if (voting && voting.requiredVoterIds.includes(user.id) && !voting.votes.some((vote) => vote.userId === user.id)) items.push({ id: 'vote:' + voting.id, icon: '🗳️', title: 'Sua votação está disponível', detail: 'Escolha o melhor e o pior wallpaper.', page: 'sorteio', createdAt: voting.openedAt });
  db.feedbackMessages.filter((item) => item.authorId === user.id && item.status !== 'pending').slice(-4).forEach((item) => items.push({ id: 'feedback:' + item.id + ':' + item.updatedAt, icon: '💬', title: 'Sua solicitação foi atualizada', detail: item.status === 'approved' ? 'Aprovada' : item.status === 'done' ? 'Concluída' : item.status === 'rejected' ? 'Não aprovada' : 'Arquivada', page: 'sorteio', createdAt: item.updatedAt || item.createdAt }));
  creditLedger.filter((item) => item.amount > 0 && !item.id.startsWith('gift:')).slice(0, 5).forEach((item) => items.push({ id: 'credit:' + item.id, icon: item.icon, title: 'Você recebeu ' + item.amount + ' Créditos 51', detail: item.label, page: 'perfil', createdAt: item.createdAt }));
  db.economy.gifts.filter((item) => item.toUserId === user.id).slice(-5).forEach((item) => items.push({ id: 'gift:' + item.id, icon: '🎁', title: 'Você recebeu um presente secreto', targetId: item.type === 'credits' ? 'creditLedger' : 'collectionCatalog', detail: item.type === 'credits' ? item.amount + ' Créditos 51' : (SHOP_CATALOG.find((catalog) => catalog.id === item.itemId)?.name || 'Item da Loja 51'), page: 'perfil', createdAt: item.createdAt }));
  const readAt = db.notificationsReadAt[user.id] || null;
  const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15).map((item) => ({ ...item, unread: !readAt || item.createdAt > readAt }));
  return { unreadCount: sorted.filter((item) => item.unread).length, items: sorted, readAt };
}

function stateFor(user) {
  const roundId = db.settings.currentRoundId;
  const activeItems = db.submissions.filter((item) => item.active && item.roundId === roundId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const roundUsers = eligibleUsers();
  const activeSubmitterIds = new Set(activeItems.map((item) => item.userId));
  const voting = currentVoting();
  const revealedIds = new Set(voting && voting.status === 'closed' ? voting.submissionIds : []);
  const roundAssignments = db.assignments.filter((item) => item.roundId === roundId);
  const revealedAssignments = roundAssignments.filter((item) => item.revealed);
  const assignedSubmissionIds = new Set(revealedAssignments.map((item) => item.submissionId));
  const readyCount = roundUsers.filter((item) => activeSubmitterIds.has(item.id)).length;
  const uploadsReady = roundUsers.length > 0 && readyCount === roundUsers.length && activeItems.length === roundUsers.length;
  const missingParticipants = roundUsers.filter((item) => !activeSubmitterIds.has(item.id));
  const gayDraw = roundId ? db.draws.find((item) => item.type === 'gay' && item.roundId === roundId) : null;
  const latestGayDraw = [...db.draws].reverse().find((item) => item.type === 'gay') || null;
  const latestClosedVoting = [...db.votings].reverse().find((item) => item.status === 'closed' && item.worstWinnerId) || null;
  const latestWorstSubmission = latestClosedVoting ? db.submissions.find((item) => item.id === latestClosedVoting.worstWinnerId) : null;
  const votedIds = new Set(voting ? (voting.votes || []).map((item) => item.userId) : []);
  let phase = 'theme';
  if (roundId) {
    if (!uploadsReady) phase = 'uploads';
    else if (revealedAssignments.length < roundUsers.length) phase = 'assignments';
    else if (!gayDraw) phase = 'gay';
    else if (voting && voting.status === 'open') phase = 'voting';
    else phase = 'results';
  }
  const draws = db.draws.slice(-30).reverse().map((draw) => {
    const { winnerUserId, ...safeDraw } = draw;
    if (draw.type !== 'wallpaper') return safeDraw;
    const item = db.submissions.find((submission) => submission.id === draw.submissionId);
    const relatedVoting = [...db.votings].reverse().find((vote) => vote.roundId === draw.roundId);
    const revealed = relatedVoting && relatedVoting.status === 'closed';
    return {
      ...safeDraw,
      imageUrl: draw.winnerUserId === user.id ? safeDraw.imageUrl : null,
      detail: item ? draw.wallpaperTitle + (revealed ? ' · por ' + item.uploader : ' · autoria secreta') : safeDraw.detail,
    };
  });
  const liveTitleMap = liveTitleAssignments();
  const previousSeason = seasonSummary(previousMonthKey());
  const creditLedger = creditLedgerFor(user.id);
  const rankingUsers = db.users.filter((item) => item.active).map((item) => ({
    id: item.id, displayName: item.displayName, liveTitles: liveTitleMap.get(item.id) || [], ...scoreFor(item.id),
  }));
  const bestRanking = [...rankingUsers].sort((a, b) => b.bestWins - a.bestWins || a.displayName.localeCompare(b.displayName));
  const worstRanking = [...rankingUsers].sort((a, b) => b.worstWins - a.worstWins || a.displayName.localeCompare(b.displayName));
  const gayRanking = [...rankingUsers].sort((a, b) => b.gayWins - a.gayWins || a.displayName.localeCompare(b.displayName));
  const hydrationDay = saoPauloDayKey();
  const todayWaterEntries = db.waterEntries.filter((item) => item.dayKey === hydrationDay);
  const hydrationPeople = db.users.filter((item) => item.active).map((person) => ({
    id: person.id, displayName: person.displayName,
    totalMl: todayWaterEntries.filter((entry) => entry.userId === person.id).reduce((sum, entry) => sum + entry.ml, 0),
    liveTitles: liveTitleMap.get(person.id) || [],
    isMe: person.id === user.id,
  })).sort((a, b) => b.totalMl - a.totalMl || a.displayName.localeCompare(b.displayName));
  return {
    serverRevision: stateRevision,
    me: { ...safeUser(user), cosmetics: cosmeticsFor(user.id) }, settings: { ...db.settings, announcement: undefined },
    avatars: Object.fromEntries(db.users.filter((item) => item.active).map((item) => [item.id, item.avatarDataUrl || null])),
    announcement: db.settings.announcement ? { id: db.settings.announcement.id, title: db.settings.announcement.title, message: db.settings.announcement.message, createdAt: db.settings.announcement.createdAt, createdBy: db.settings.announcement.createdBy, unread: !db.settings.announcement.seenUserIds.includes(user.id), seenCount: user.role === 'admin' ? db.settings.announcement.seenUserIds.length : undefined } : null,
    liveDraw: liveDraw && liveDraw.endsAt > Date.now() ? drawForUser(liveDraw, user.id) : null,
    profile: profileFor(user, { liveTitleMap, previousSeason, creditLedger }), notifications: notificationsFor(user, creditLedger),
    onlinePeople: sharedOnlinePeople.length ? sharedOnlinePeople : [{ id: user.id, displayName: user.displayName }],
    casino: (() => {
      const dayKey = saoPauloDayKey(); const plays = db.economy.casinoPlays.filter((item) => item.userId === user.id && item.dayKey === dayKey); const account = casinoAccountFor(user.id);
      const totalWagered = db.economy.casinoPlays.reduce((sum, item) => sum + Number(item.bet || 0), 0);
      const totalPlays = db.economy.casinoPlays.length;
      const round = db.economy.globalFlight; const myFlightBet = round?.bets?.find((item) => item.userId === user.id);
      const recentFlights = db.economy.flightHistory.slice(-12).reverse().map((item) => ({ multiplier: Number(item.multiplier || 0), createdAt: item.createdAt }));
      const myPlays = db.economy.casinoPlays.filter((item) => item.userId === user.id);
      return { wallet: Number(account.balance), shopWallet: walletFor(user.id), dailyBonus: CASINO_DAILY_BONUS, cashoutThreshold: CASINO_CASHOUT_THRESHOLD, cashoutAmount: Number(account.balance), canCashOut: !account.cashedOut && Number(account.balance) >= CASINO_CASHOUT_THRESHOLD, cashedOut: Boolean(account.cashedOut), playsToday: plays.length, totalWagered, totalPlays, recentFlights, globalFlight: round && round.status !== 'crashed' ? { id: round.id, status: round.status, launchAt: round.launchAt, joined: Boolean(myFlightBet), betStatus: myFlightBet?.status || null, players: round.bets.length } : null, closedBoxes: db.economy.mysteryBoxes.filter((entry) => entry.userId === user.id).length, recentRoulette: myPlays.filter((item) => item.resultType !== 'flight').slice(-6).reverse(), recentFlight: myPlays.filter((item) => item.resultType === 'flight').slice(-6).reverse() };
    })(),
    visualTheme: latestGayDraw && latestGayDraw.winnerId === user.id ? 'rainbow' : latestWorstSubmission && latestWorstSubmission.userId === user.id ? 'punishment' : 'user-choice',
    themes: db.settings.themes.map((name) => ({ id: name, name })),
    workflow: {
      phase, roundId, currentTheme: db.settings.currentTheme,
      submitted: readyCount, totalParticipants: roundUsers.length,
      assigned: revealedAssignments.length, totalAssignments: roundUsers.length,
      themeDrawnAt: roundId ? (db.draws.find((item) => item.type === 'theme' && item.roundId === roundId) || {}).createdAt || null : null,
      recoveredAt: db.settings.currentRoundRecoveredAt || null,
    },
    roundSummary: {
      phase, active: Boolean(roundId), theme: db.settings.currentTheme,
      uploads: { done: readyCount, total: roundUsers.length }, deliveries: { done: revealedAssignments.length, total: roundUsers.length },
      views: { done: revealedAssignments.filter((item) => item.seenAt).length, total: revealedAssignments.length }, votes: { done: votedIds.size, total: voting ? voting.requiredVoterIds.length : 0 },
      my: { submitted: activeSubmitterIds.has(user.id), delivered: revealedAssignments.some((item) => item.userId === user.id), viewed: Boolean(revealedAssignments.find((item) => item.userId === user.id)?.seenAt), voted: votedIds.has(user.id) }, gayWinner: gayDraw?.winner || null,
    },
    participants: roundUsers.map(({ id, displayName }) => ({ id, displayName })),
    powerParticipants: db.users.filter((person) => person.active && person.approved !== false).map(({ id, displayName }) => ({ id, displayName })),
    readiness: {
      ready: readyCount, total: roundUsers.length,
      missing: missingParticipants.map(({ id, displayName }) => ({ id, displayName })),
      acceptsNewParticipants: roundAcceptsNewParticipants(),
      canStartWithReady: phase === 'uploads' && readyCount >= 2 && readyCount < roundUsers.length && roundAssignments.length === 0,
    },
    gayParticipants: phase === 'gay' ? roundUsers.map(({ id, displayName }) => ({ id, displayName })) : [],
    submissions: activeItems.map((item) => ({
      id: item.id, title: item.title,
      imageUrl: roundUsers.some((person) => person.id === user.id) || user.role === 'admin' ? '/uploads/' + item.filename : null,
      size: item.size, createdAt: item.createdAt, isMine: item.userId === user.id,
      canDelete: roundAssignments.length === 0 && (item.userId === user.id || user.role === 'admin'),
      assigned: assignedSubmissionIds.has(item.id),
      revealed: revealedIds.has(item.id) || db.economy.authorReveals.some((reveal) => reveal.roundId === roundId && reveal.userId === user.id && reveal.submissionId === item.id),
      uploader: revealedIds.has(item.id) || db.economy.authorReveals.some((reveal) => reveal.roundId === roundId && reveal.userId === user.id && reveal.submissionId === item.id) ? item.uploader : null,
      assistedUpload: user.role === 'admin' && item.uploadedByAdminId ? { by: item.uploadedByAdminName || 'Administrador', for: item.uploader } : null,
    })),
    assignments: revealedAssignments.map((assignment) => {
      const recipient = db.users.find((item) => item.id === assignment.userId);
      const submission = db.submissions.find((item) => item.id === assignment.submissionId);
      return submission && recipient ? {
        id: assignment.id, assignedTo: recipient.displayName, submissionId: submission.id,
        title: submission.title, imageUrl: assignment.userId === user.id ? '/uploads/' + submission.filename : null,
        uploader: revealedIds.has(submission.id) ? submission.uploader : null,
        revealed: revealedIds.has(submission.id), isMine: assignment.userId === user.id,
        deliveredAt: assignment.revealedAt || assignment.createdAt,
        seenAt: assignment.seenAt || null, seen: Boolean(assignment.seenAt),
        isNew: assignment.userId === user.id && !assignment.seenAt,
      } : null;
    }).filter(Boolean),
    draws, voting: votingForClient(voting, user), rankings: { best: bestRanking, worst: worstRanking, gay: gayRanking },
    season: { current: seasonSummary(), previous: previousSeason, challenges: seasonalChallengesFor(user.id) },
    dailyWall: {
      emojis: WALL_EMOJIS,
      phrases: db.dailyPhrases.map((item) => ({
        id: item.id, userId: item.userId, canEdit: item.userId === user.id, phrase: item.phrase, authorName: item.authorName, createdAt: item.createdAt, comments: item.comments || [],
        canDelete: item.userId === user.id || user.role === 'admin', reactions: reactionsFor('phrase', item.id, user.id),
      })),
      memes: db.dailyMemes.map((item) => ({
        id: item.id, userId: item.userId, canEdit: item.userId === user.id, canDelete: item.userId === user.id || user.role === 'admin', imageUrl: '/memes/' + item.filename, authorName: item.authorName, caption: item.caption || '', comments: item.comments || [],
        createdAt: item.createdAt, isMine: item.userId === user.id, reactions: reactionsFor('meme', item.id, user.id),
      })),
    },
    anonymousWall: db.anonymousPosts.slice(-200).map((item) => ({
      id: item.id, message: item.message, createdAt: item.createdAt,
      canDelete: user.role === 'admin',
    })),
    trading: tradingFor(user),
    cardAlbum: albumFor(db, user.id, saoPauloDayKey()),
    lieMeter: {
      ranking: db.users.filter((person) => person.active).map((person) => ({
        id: person.id,
        displayName: person.displayName,
        liveTitles: liveTitleMap.get(person.id) || [],
        total: Math.max(0, db.lieAccusations.filter((item) => item.targetUserId === person.id && item.status === 'confirmed').reduce((sum, item) => sum + item.delta, 0)),
        latestReason: activeLieReasons(person.id).at(-1)?.reason || null,
        reasons: activeLieReasons(person.id).slice(-30).reverse().map((item) => ({ id: item.id, reason: item.reason, createdAt: item.confirmedAt || item.createdAt, createdBy: db.users.find((person) => person.id === item.createdByUserId)?.displayName || (item.createdByUserId ? 'Conta removida' : 'Não registrado'), validatedBy: db.users.find((person) => person.id === item.validatedByUserId)?.displayName || (item.validatedByUserId ? 'Conta removida' : 'Não registrado') })),
      })).sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName)),
      pending: db.lieAccusations.filter((item) => item.status === 'pending').slice(-100).reverse().map((item) => {
        const target = db.users.find((person) => person.id === item.targetUserId);
        const creator = db.users.find((person) => person.id === item.createdByUserId);
        return {
          id: item.id, delta: item.delta, reason: item.reason || null, createdAt: item.createdAt,
          targetName: target?.displayName || 'Usuário removido', creatorName: creator?.displayName || 'Usuário removido',
          canValidate: user.id !== item.createdByUserId && user.id !== item.targetUserId,
          canCancel: user.id === item.createdByUserId || user.role === 'admin',
        };
      }),
    },
    hydration: {
      dayKey: hydrationDay, goalMl: 2500,
      teamTotalMl: todayWaterEntries.reduce((sum, entry) => sum + entry.ml, 0),
      myTotalMl: todayWaterEntries.filter((entry) => entry.userId === user.id).reduce((sum, entry) => sum + entry.ml, 0),
      people: hydrationPeople,
      entries: todayWaterEntries.slice(-100).reverse().map((entry) => {
        const person = db.users.find((item) => item.id === entry.userId);
        return {
          id: entry.id, ml: entry.ml, createdAt: entry.createdAt,
          displayName: person ? person.displayName : 'Participante',
          isMine: entry.userId === user.id,
          canDelete: entry.userId === user.id || user.role === 'admin',
        };
      }),
      teamMission: teamMissionFor(),
    },
    meHasSubmitted: activeSubmitterIds.has(user.id),
    meCanUpload: phase === 'uploads' && roundUsers.some((item) => item.id === user.id) && !activeSubmitterIds.has(user.id),
    adminUploadOptions: user.role === 'admin' && phase === 'uploads' ? roundUsers.map((person) => {
      const submission = activeItems.find((item) => item.userId === person.id);
      return { id: person.id, displayName: person.displayName, hasSubmission: Boolean(submission), assisted: Boolean(submission?.uploadedByAdminId), submittedAt: submission?.createdAt || null };
    }) : undefined,
    adminUsers: user.role === 'admin' ? db.users.map((person) => ({ ...safeUser(person), wallet: walletFor(person.id) })) : undefined,
    security: user.role === 'admin' ? {
      devices: db.gateAuthorizations.filter((item) => item.expiresAt > Date.now()).map((item) => ({ id: item.id, createdAt: item.createdAt, expiresAt: item.expiresAt, ip: item.ip, device: /Mobile|Android|iPhone/i.test(item.userAgent) ? 'Celular ou tablet' : 'Computador', browser: item.userAgent.includes('Edg/') ? 'Edge' : item.userAgent.includes('Chrome/') ? 'Chrome' : item.userAgent.includes('Firefox/') ? 'Firefox' : 'Navegador' })),
      pendingUsers: db.users.filter((item) => item.approved === false).length,
    } : undefined,
    adminProgress: user.role === 'admin' ? {
      missingUploads: missingParticipants.map(({ id, displayName }) => ({ id, displayName })),
      pendingAssignments: roundUsers.filter((participant) => !revealedAssignments.some((assignment) => assignment.userId === participant.id))
        .map(({ id, displayName }) => ({ id, displayName })),
      missingViews: roundUsers.filter((participant) => {
        const assignment = revealedAssignments.find((item) => item.userId === participant.id);
        return assignment && !assignment.seenAt;
      }).map(({ id, displayName }) => ({ id, displayName })),
      missingVotes: voting ? voting.requiredVoterIds.filter((id) => !votedIds.has(id)).map((id) => {
        const participant = db.users.find((item) => item.id === id);
        return participant ? { id: participant.id, displayName: participant.displayName } : null;
      }).filter(Boolean) : [],
    } : undefined,
  };
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function buildAssignmentMap(users, submissions, reservations = []) {
  const submissionById = new Map(submissions.map((item) => [item.id, item]));
  const byUser = new Map(); const usedSubmissionIds = new Set();
  for (const reservation of reservations) {
    const targetUser = users.find((item) => item.id === reservation.targetId);
    const submission = submissionById.get(reservation.submissionId);
    if (!targetUser || !submission || (!reservation.allowSelf && submission.userId === targetUser.id) || byUser.has(targetUser.id) || usedSubmissionIds.has(submission.id)) return null;
    byUser.set(targetUser.id, submission); usedSubmissionIds.add(submission.id);
  }
  const remainingUsers = users.filter((item) => !byUser.has(item.id));
  const search = (index) => {
    if (index >= remainingUsers.length) return true;
    let best = index; let bestOptions = Infinity;
    for (let cursor = index; cursor < remainingUsers.length; cursor += 1) {
      const count = submissions.filter((entry) => !usedSubmissionIds.has(entry.id) && entry.userId !== remainingUsers[cursor].id).length;
      if (count < bestOptions) { best = cursor; bestOptions = count; }
    }
    [remainingUsers[index], remainingUsers[best]] = [remainingUsers[best], remainingUsers[index]];
    const participant = remainingUsers[index];
    const options = shuffled(submissions.filter((entry) => !usedSubmissionIds.has(entry.id) && entry.userId !== participant.id));
    for (const submission of options) {
      byUser.set(participant.id, submission); usedSubmissionIds.add(submission.id);
      if (search(index + 1)) return true;
      byUser.delete(participant.id); usedSubmissionIds.delete(submission.id);
    }
    [remainingUsers[index], remainingUsers[best]] = [remainingUsers[best], remainingUsers[index]];
    return false;
  };
  return search(0) ? byUser : null;
}

function wallpaperReservations(roundId) {
  return db.economy.powerUses.filter((entry) => entry.roundId === roundId && ['power-choose-wallpaper', 'power-assign-wallpaper'].includes(entry.itemId))
    .map((entry) => ({ targetId: entry.targetId || entry.userId, submissionId: entry.submissionId, allowSelf: entry.itemId === 'power-choose-wallpaper' }));
}

function ensureAssignmentPlan(roundId, users, submissions) {
  const existing = db.assignments.filter((item) => item.roundId === roundId);
  if (existing.length) return existing;
  const byUser = buildAssignmentMap(users, submissions, wallpaperReservations(roundId));
  if (!byUser) throw new HttpError(409, 'As escolhas de wallpaper não permitem uma distribuição válida. Revise as reservas antes do sorteio.');
  const recipientOrder = shuffled(users);
  const plan = recipientOrder.map((participant, order) => ({
    id: randomUUID(), roundId, userId: participant.id,
    submissionId: byUser.get(participant.id).id, order, revealed: false, seenAt: null, createdAt: new Date().toISOString(),
  }));
  db.assignments.push(...plan);
  return plan;
}

function setSession(user, remember = false) {
  const token = randomBytes(32).toString('hex');
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  const expiresAt = Date.now() + ttl;
  sessions.set(token, { userId: user.id, expiresAt });
  db.rememberTokens = db.rememberTokens.filter((item) => item.userId !== user.id && item.expiresAt > Date.now());
  db.rememberTokens.push({ userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt, remember: Boolean(remember) });
  return { 'Set-Cookie': 'sorteios_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(ttl / 1000) };
}

function validateNewUser(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Usuário inválido. Use 3 a 30 letras, números, ponto, hífen ou sublinhado.');
  if (!displayName || displayName.length > 50) throw new HttpError(400, 'Informe seu nome.');
  if (password.length < 8) throw new HttpError(400, 'A senha deve ter ao menos 8 caracteres.');
  if (db.users.some((item) => item.username.toLowerCase() === username)) throw new HttpError(409, 'Esse usuário já existe.');
  return { username, displayName, password };
}

function rateLimit(req) {
  const key = String(req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const item = attempts.get(key) || { count: 0, started: now };
  if (now - item.started > 10 * 60 * 1000) { item.count = 0; item.started = now; }
  if (item.count >= 10) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  item.count += 1; attempts.set(key, item);
  return key;
}

async function handleApi(req, res, route) {
  if (req.method === 'POST' && route === '/api/register') {
    const body = await readJson(req);
    const { username, displayName, password } = validateNewUser(body);
    const user = { id: randomUUID(), username, displayName, role: 'member', active: false, approved: false,
      eligible: true, mustChangePassword: false, createdAt: new Date().toISOString(), ...makePassword(password) };
    db.users.push(user); await persist(); broadcastRefresh('participants');
    json(res, 202, { pendingApproval: true, message: 'Conta criada e enviada para aprovação do administrador.' }); return;
  }

  if (req.method === 'POST' && route === '/api/login') {
    const key = rateLimit(req);
    const { username = '', password = '', rememberMe = false } = await readJson(req);
    const user = db.users.find((item) => item.username.toLowerCase() === String(username).trim().toLowerCase());
    if (user && user.approved === false && passwordMatches(String(password), user)) throw new HttpError(403, 'Sua conta ainda está aguardando aprovação do administrador.');
    if (!user || !user.active || !passwordMatches(String(password), user)) throw new HttpError(401, 'Usuário ou senha inválidos.');
    attempts.delete(key);
    const headers = setSession(user, rememberMe === true || rememberMe === 'on');
    await persist();
    json(res, 200, stateFor(user), headers); return;
  }

  if (req.method === 'POST' && route === '/api/logout') {
    const auth = sessionFor(req); if (auth) sessions.delete(auth.token);
    if (auth) {
      const tokenHash = createHash('sha256').update(auth.token).digest('hex');
      await runtimeEnv.DB.prepare('DELETE FROM online_presence WHERE session_key = ?').bind(tokenHash).run();
      const before = db.rememberTokens.length;
      db.rememberTokens = db.rememberTokens.filter((item) => item.tokenHash !== tokenHash);
      if (db.rememberTokens.length !== before) await persist();
    }
    res.writeHead(204, { 'Set-Cookie': 'sorteios_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); res.end(); return;
  }

  if (req.method === 'GET' && route === '/api/state') {
    const auth = requireAuth(req); const { user } = auth;
    await heartbeatPresence(auth);
    const settledCleanName = settleCleanNameRewards();
    const settledSeasonChallenges = settleSeasonalChallenges();
    if (settledCleanName || settledSeasonChallenges) await persist();
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/sync') {
    const auth = requireAuth(req); const { user } = auth;
    const onlinePeople = await heartbeatPresence(auth);
    json(res, 200, {
      onlinePeople,
      revision: stateRevision,
      loanOverdue: Boolean(overdueLoanFor(user.id)),
      serverTime: Date.now(),
      releaseVersion: Math.max(0, Number(db.settings.releaseVersion || 0)),
      liveDraw: liveDraw && liveDraw.endsAt > Date.now() ? drawForUser(liveDraw, user.id) : null,
    }); return;
  }

  if (req.method === 'POST' && route === '/api/profile/avatar') {
    const { user } = requireAuth(req);
    const body = await readJson(req, 550000);
    if (body.remove === true) user.avatarDataUrl = null;
    else {
      const dataUrl = String(body.dataUrl || '');
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new HttpError(400, 'Use uma imagem PNG, JPG ou WebP.');
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 350000) throw new HttpError(413, 'A foto deve ter no máximo 350 KB.');
      user.avatarDataUrl = 'data:' + match[1] + ';base64,' + buffer.toString('base64');
    }
    await persist(); broadcastRefresh('profile'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/casino/flight/start') {
    const { user } = requireAuth(req); const body = await readJson(req); const bet = Number(body.bet); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional';
    if (!Number.isInteger(bet) || bet < 1 || bet > 100) throw new HttpError(400, 'A aposta deve ser um valor inteiro de 1 a 100 créditos.');
    const now = Date.now();
    if(settleGlobalFlight(now))await persist();
    const autoCashout=body.autoCashout ? Number(body.autoCashout) : null;
    if(autoCashout!==null && (!Number.isFinite(autoCashout) || autoCashout<1.25 || autoCashout>12 || Math.abs(Math.round(autoCashout*100)-autoCashout*100)>0.000001))throw new HttpError(400,'Resgate automático: use de x1,25 a x12,00.');
    const account = casinoAccountFor(user.id, true); const before = walletSource === 'shop' ? walletFor(user.id) : Number(account.balance);
    if (before < bet) throw new HttpError(409, 'Saldo insuficiente para iniciar o voo.');
    let flight = db.economy.globalFlight;
    if (!flight || flight.status === 'crashed') {
      const roll = Math.random(); const crashAt = roll < .15 ? 1 : roll < .65 ? 1.01 + Math.random() * .59 : roll < .9 ? 1.6 + Math.random() * 1.4 : roll < .98 ? 3 + Math.random() * 3 : 6 + Math.random() * 6;
      flight = db.economy.globalFlight = { id: randomUUID(), status: 'betting', createdAt: new Date(now).toISOString(), launchAt: now + 10000, stepMs: FLIGHT_STEP_MS, crashAt: Number(crashAt.toFixed(2)), bets: [] };
    }
    if (flight.status !== 'betting' || now >= flight.launchAt) throw new HttpError(409, 'A nave já decolou. Aguarde a próxima contagem.');
    if (flight.bets.some((item) => item.userId === user.id)) throw new HttpError(409, 'Sua aposta já está confirmada neste voo.');
    if (walletSource === 'shop') addCredits(user.id, -bet); else account.balance = before - bet;
    flight.bets.push({ id: randomUUID(), userId: user.id, userName: user.displayName, bet, walletSource, status: 'active', autoCashout, joinedAt: new Date(now).toISOString() });
    await persist(); broadcastRefresh('global-flight'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/casino/flight/status') {
    const {user}=requireAuth(req);
    if(settleGlobalFlight()){await persist();broadcastRefresh('economy');}
    json(res,200,flightStatusFor(user));return;
  }
  if (req.method === 'POST' && route === '/api/casino/flight/cashout') {
    const {user}=requireAuth(req);const body=await readJson(req);
    const flight=db.economy.globalFlight;
    if(!flight || (body.flightId && body.flightId!==flight.id))throw new HttpError(409,'Este voo já terminou. Atualize a rodada.');
    if(settleGlobalFlight()){await persist();broadcastRefresh('economy');}
    const bet=flight.bets.find(b=>b.userId===user.id);
    if(bet?.result){json(res,200,body.compact?{flightResult:bet.result}:{...stateFor(user),flightResult:bet.result});return;}
    if(!bet || bet.status!=='active' || flight.status==='crashed')throw new HttpError(409,'A nave já caiu. Sua tela será atualizada.');
    if(Date.now()<flight.launchAt)throw new HttpError(409,'A nave ainda está na contagem regressiva.');
    const multiplier=flightMultiplier(flight,Date.now());
    if(multiplier<1.25)throw new HttpError(409,'O resgate é liberado em x1,25.');
    if(multiplier>=flight.crashAt)throw new HttpError(409,'A nave já caiu. Sua tela será atualizada.');
    const result=recordFlightPayout(flight,bet,Number(multiplier.toFixed(2)),new Date().toISOString());
    await persist();broadcastRefresh('economy');
    json(res,200,body.compact?{flightResult:result}:{...stateFor(user),flightResult:result});return;
  }

  if (req.method === 'POST' && route === '/api/card-album') {
    const {user}=requireAuth(req);const body=await readJson(req);
    let changed;
    try {changed=updateAlbum(db,user.id,body.action,body.collectionId);}
    catch(error){throw new HttpError(400,error.message);}
    if(changed){await persist();broadcastRefresh('card-album');}
    json(res,200,stateFor(user));return;
  }
  if(req.method==='POST' && route==='/api/card-trades'){
    const {user}=requireAuth(req);const body=await readJson(req);let changed;
    try{changed=updateCardTrade(db,user.id,body,randomUUID);}catch(error){throw new HttpError(400,error.message);}
    if(changed){await persist();broadcastRefresh('card-trades');}
    json(res,200,stateFor(user));return;
  }
  if (await handleCommunityExtras(req, res, route)) return;

  if (req.method === 'POST' && route === '/api/casino/play') {
    const { user } = requireAuth(req);
    const body = await readJson(req); const bet = Number(body.bet); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional';
    const requestId = body.requestId == null ? null : String(body.requestId);
    if (requestId && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificação da aposta inválida.');
    const previous = requestId && db.economy.casinoPlays.find(play => play.userId === user.id && play.requestId === requestId && play.resultType !== 'flight');
    if (previous) {
      if (previous.bet !== bet || previous.walletSource !== walletSource) throw new HttpError(400, 'Esta identificação já pertence a outra aposta.');
      json(res, 200, body.compact ? { casinoResult: previous } : { ...stateFor(user), casinoResult: previous }); return;
    }
    if (!Number.isInteger(bet) || bet < 1 || bet > 100) throw new HttpError(400, 'A aposta deve ser um valor inteiro de 1 a 100 créditos.');
    const dayKey = saoPauloDayKey();
    const casinoAccount = casinoAccountFor(user.id, true);
    const sourceBalance = walletSource === 'shop' ? walletFor(user.id) : Number(casinoAccount.balance);
    if (sourceBalance < bet) throw new HttpError(409, walletSource === 'shop' ? 'Saldo da Loja 51 insuficiente para esta aposta.' : 'Saldo promocional do cassino insuficiente para esta aposta.');
    const segments = CASINO_WHEEL_OUTCOMES.map((value, index) => ({ value, index }));
    const numericSegments = segments.filter(({ value }) => typeof value === 'number');
    const boxChance = .01 + bet / 2500;
    let eligibleSegments = numericSegments;
    if (Math.random() < boxChance) {
      const desiredBox = bet >= 70 ? (Math.random() < .38 ? 'box-area51' : Math.random() < .62 ? 'box-cosmic' : 'box-sonda') : bet >= 30 ? (Math.random() < .48 ? 'box-cosmic' : 'box-sonda') : 'box-sonda';
      eligibleSegments = segments.filter(({ value }) => value === desiredBox);
    }
    const segmentIndex = eligibleSegments[Math.floor(Math.random() * eligibleSegments.length)].index;
    const outcome = CASINO_WHEEL_OUTCOMES[segmentIndex]; const before = sourceBalance; const createdAt = new Date().toISOString();
    let multiplier = null; let payout = 0; let net = -bet; let mysteryBox = null; let resultType = 'multiplier';
    if (typeof outcome === 'string' && outcome.startsWith('box-')) {
      resultType = 'mysteryBox'; net = 0; payout = bet;
      mysteryBox = addMysteryBox(user.id, outcome, 'casino', bet);
    } else {
      multiplier = Number(outcome); payout = Math.round(bet * multiplier); net = payout - bet;
    }
    if (walletSource === 'shop') {
      addCredits(user.id, net);
      if (net !== 0) db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'casino-shop', amount: net, before, after: before + net, reason: 'Resultado da Roleta 51 usando saldo da loja', createdAt });
    } else casinoAccount.balance = before + net;
    const balanceAfter = walletSource === 'shop' ? walletFor(user.id) : Number(casinoAccount.balance);
    const play = { id: randomUUID(), requestId, userId: user.id, dayKey, walletSource, bet, resultType, segmentIndex, wheelValue: outcome, multiplier, payout, net, mysteryBox, balanceAfter, createdAt };
    db.economy.casinoPlays.push(play);
    await persist(); broadcastRefresh('economy'); json(res, 200, body.compact ? { casinoResult: play } : { ...stateFor(user), casinoResult: play }); return;
  }

  if (req.method === 'POST' && route === '/api/casino/cashout') {
    const { user } = requireAuth(req); const account = casinoAccountFor(user.id, true);
    if (account.cashedOut) throw new HttpError(409, 'O lucro promocional de hoje já foi resgatado.');
    if (Number(account.balance) < CASINO_CASHOUT_THRESHOLD) throw new HttpError(409, 'Chegue a 500 créditos promocionais para liberar o lucro na loja.');
    const amount = Number(account.balance); const before = walletFor(user.id); const createdAt = new Date().toISOString();
    addCredits(user.id, amount); account.balance = 0; account.cashedOut = true; account.cashedOutAt = createdAt; account.cashedOutAmount = amount;
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'casino-cashout', amount, before, after: before + amount, reason: 'Saldo promocional liberado pelo Cassino 51 após atingir a meta', createdAt });
    const debtPayment = activeLoanFor(user.id)?.dueAt ? applyLoanPayment(user.id, amount, 'Abatimento automático do resgate promocional') : 0;
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), casinoCashout: amount - debtPayment, debtPayment }); return;
  }

  if (req.method === 'POST' && route === '/api/notifications/read') {
    const { user } = requireAuth(req);
    db.notificationsReadAt[user.id] = new Date().toISOString();
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/feedback') {
    const { user } = requireAuth(req);
    json(res, 200, { messages: feedbackForClient(user) }); return;
  }

  if (req.method === 'POST' && route === '/api/feedback') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de enviar uma mensagem.');
    const body = await readJson(req);
    const type = ['bug', 'improvement', 'praise'].includes(body.type) ? body.type : null;
    const message = String(body.message || '').trim().replace(/\r\n/g, '\n');
    if (!type) throw new HttpError(400, 'Escolha entre bug, melhoria ou elogio/denúncia.');
    if (message.length < 3) throw new HttpError(400, 'Conte um pouco mais sobre a ideia ou o problema.');
    if (message.length > 800) throw new HttpError(400, 'A mensagem deve ter no máximo 800 caracteres.');
    const now = Date.now();
    const lastPost = feedbackPostTimes.get(user.id) || 0;
    if (now - lastPost < 2500) throw new HttpError(429, 'Aguarde alguns segundos antes de enviar outra mensagem.');
    feedbackPostTimes.set(user.id, now);
    const createdAt = new Date(now).toISOString();
    const feedback = {
      id: randomUUID(), type, message,
      authorId: user.id, authorName: user.displayName,
      createdAt, updatedAt: createdAt, status: 'pending', adminComment: '',
      approvedAt: null, completedAt: null, archivedAt: null,
    };
    db.feedbackMessages.push(feedback);
    if (db.feedbackMessages.length > 500) db.feedbackMessages = db.feedbackMessages.slice(-500);
    await persist();
    broadcastRefresh('feedback');
    json(res, 201, { message: feedback, messages: feedbackForClient(user) }); return;
  }

  const feedbackAdminMatch = route.match(/^\/api\/admin\/feedback\/([^/]+)$/);
  if (req.method === 'PATCH' && feedbackAdminMatch) {
    const { user } = requireAdmin(req);
    const feedback = db.feedbackMessages.find((item) => item.id === feedbackAdminMatch[1]);
    if (!feedback) throw new HttpError(404, 'Mensagem não encontrada.');
    const body = await readJson(req);
    const hasStatus = Object.hasOwn(body, 'status');
    const hasComment = Object.hasOwn(body, 'adminComment');
    if (!hasStatus && !hasComment) throw new HttpError(400, 'Informe o status ou o comentário.');
    if (hasStatus && !['pending', 'approved', 'done', 'rejected', 'archived'].includes(body.status)) throw new HttpError(400, 'Status inválido.');
    if (hasComment && typeof body.adminComment !== 'string') throw new HttpError(400, 'Comentário inválido.');
    const adminComment = hasComment ? body.adminComment.trim() : feedback.adminComment || '';
    if (adminComment.length > 600) throw new HttpError(400, 'O comentário deve ter no máximo 600 caracteres.');
    const now = new Date().toISOString();
    const status = hasStatus ? body.status : feedback.status;
    feedback.status = status;
    feedback.adminComment = adminComment;
    feedback.updatedAt = now;
    feedback.approvedAt = status === 'approved' ? now : feedback.approvedAt || null;
    feedback.completedAt = status === 'done' ? now : null;
    feedback.archivedAt = status === 'archived' ? now : null;
    await persist();
    broadcastRefresh('feedback');
    json(res, 200, { message: feedback, messages: feedbackForClient(user) }); return;
  }

  if (req.method === 'DELETE' && feedbackAdminMatch) {
    const { user } = requireAdmin(req);
    const feedbackIndex = db.feedbackMessages.findIndex((item) => item.id === feedbackAdminMatch[1]);
    if (feedbackIndex < 0) throw new HttpError(404, 'Solicitação não encontrada.');
    db.feedbackMessages.splice(feedbackIndex, 1);
    await persist();
    broadcastRefresh('feedback');
    json(res, 200, { messages: feedbackForClient(user) }); return;
  }

  if (req.method === 'POST' && route === '/api/daily-wall/phrases') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de publicar.');
    const body = await readJson(req);
    const phrase = String(body.phrase || '').trim().replace(/\s+/g, ' ');
    if (!phrase) throw new HttpError(400, 'Digite a frase do dia.');
    if (phrase.length > 180) throw new HttpError(400, 'A frase deve ter no máximo 180 caracteres.');
    db.dailyPhrases.push({
      id: randomUUID(), userId: user.id, authorName: user.displayName,
      phrase, createdAt: new Date().toISOString(),
    });
    awardEngagementCard(db,user.id,'phrase',saoPauloDayKey());
    recordActivity(user.id, 'phrase');
    rewardDailyMissions(user.id);
    settleSeasonalChallenges();
    if (db.dailyPhrases.length > 100) db.dailyPhrases = db.dailyPhrases.slice(-100);
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  const deletePhraseMatch = route.match(/^\/api\/daily-wall\/phrases\/([^/]+)$/);
  if (req.method === 'DELETE' && deletePhraseMatch) {
    const { user } = requireAuth(req);
    const phraseIndex = db.dailyPhrases.findIndex((item) => item.id === deletePhraseMatch[1]);
    if (phraseIndex < 0) throw new HttpError(404, 'Frase não encontrada.');
    const phraseItem = db.dailyPhrases[phraseIndex];
    if (phraseItem.userId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você só pode excluir as suas próprias frases.');
    db.dailyPhrases.splice(phraseIndex, 1);
    db.dailyReactions = db.dailyReactions.filter((item) => !(item.targetType === 'phrase' && item.targetId === phraseItem.id));
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  const wallPostMatch = route.match(/^\/api\/daily-wall\/posts\/(phrase|meme)\/([^/]+)$/);
  if (wallPostMatch && ['PATCH', 'DELETE'].includes(req.method)) {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const [, type, id] = wallPostMatch;
    const key = type === 'meme' ? 'dailyMemes' : 'dailyPhrases';
    const post = db[key].find((item) => item.id === id);
    if (!post) throw new HttpError(404, 'Publicação não encontrada.');
    if (post.userId !== user.id && !(req.method === 'DELETE' && user.role === 'admin')) throw new HttpError(403, 'Você só pode editar ou excluir suas próprias publicações.');
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      if (typeof body.text !== 'string') throw new HttpError(400, 'Texto inválido.');
      const text = body.text.trim();
      if (text.length > (type === 'meme' ? 500 : 180) || (type === 'phrase' && !text)) throw new HttpError(400, type === 'meme' ? 'A legenda deve ter até 500 caracteres.' : 'A frase deve ter de 1 a 180 caracteres.');
      post[type === 'meme' ? 'caption' : 'phrase'] = text;
      post.updatedAt = new Date().toISOString();
    } else {
      db[key] = db[key].filter((item) => item.id !== id);
      db.dailyReactions = db.dailyReactions.filter((item) => !(item.targetType === type && item.targetId === id));
    }
    await persist();
    if (req.method === 'DELETE' && post.filename) await deleteStoredImage(post.filename);
    broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  const wallCommentMatch = route.match(/^\/api\/daily-wall\/comments\/(phrase|meme)\/([^/]+)\/([^/]+)$/);
  if (wallCommentMatch && ['PATCH', 'DELETE'].includes(req.method)) {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const [, type, postId, commentId] = wallCommentMatch;
    const post = (type === 'meme' ? db.dailyMemes : db.dailyPhrases).find((item) => item.id === postId);
    const comment = post?.comments?.find((item) => item.id === commentId);
    if (!comment) throw new HttpError(404, 'Comentário não encontrado.');
    if (comment.userId !== user.id && !(req.method === 'DELETE' && user.role === 'admin')) throw new HttpError(403, 'Você só pode editar ou excluir seus próprios comentários.');
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 300) throw new HttpError(400, 'Escreva de 1 a 300 caracteres.');
      comment.message = body.message.trim(); comment.updatedAt = new Date().toISOString();
      updateCommentMentions(comment);
    } else post.comments = post.comments.filter((item) => item.id !== commentId);
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/daily-wall/comments') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de comentar.');
    const body = await readJson(req);
    const list = body.targetType === 'meme' ? db.dailyMemes : body.targetType === 'phrase' ? db.dailyPhrases : [];
    const post = list.find((item) => item.id === body.targetId);
    if (!post) throw new HttpError(404, 'Publicação não encontrada.');
    const message = String(body.message || '').trim();
    if (!message || message.length > 300) throw new HttpError(400, 'Escreva de 1 a 300 caracteres.');
    post.comments ||= [];
    if (post.comments.length >= 50) throw new HttpError(409, 'Esta publicação atingiu o limite de 50 comentários.');
    const previous = post.comments.filter((comment) => comment.userId === user.id).at(-1);
    if (previous && Date.now() - Date.parse(previous.createdAt) < 3000) throw new HttpError(429, 'Aguarde alguns segundos para comentar novamente.');
    const comment = { id: randomUUID(), userId: user.id, authorName: user.displayName, message, createdAt: new Date().toISOString() };
    updateCommentMentions(comment);
    post.comments.push(comment);
    if(post.userId!==user.id && message.length>=10)awardEngagementCard(db,user.id,'comment',saoPauloDayKey());
    await persist(); broadcastRefresh('daily-wall'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/daily-wall/reactions') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const targetType = ['phrase', 'meme'].includes(body.targetType) ? body.targetType : null;
    const emoji = WALL_EMOJIS.includes(body.emoji) ? body.emoji : null;
    const targetId = String(body.targetId || '');
    const exists = targetType === 'phrase' ? db.dailyPhrases.some((item) => item.id === targetId) : targetType === 'meme' ? db.dailyMemes.some((item) => item.id === targetId) : false;
    if (!targetType || !emoji || !exists) throw new HttpError(400, 'Reação ou publicação inválida.');
    const index = db.dailyReactions.findIndex((item) => item.targetType === targetType && item.targetId === targetId && item.userId === user.id && item.emoji === emoji);
    if (index >= 0) db.dailyReactions.splice(index, 1);
    else db.dailyReactions.push({ id: randomUUID(), targetType, targetId, userId: user.id, emoji, createdAt: new Date().toISOString() });
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/memes') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de publicar.');
    const now = Date.now();
    const lastPost = memePostTimes.get(user.id) || 0;
    if (now - lastPost < 2500) throw new HttpError(429, 'Aguarde alguns segundos antes de enviar outro meme.');
    const { dataUrl = '', caption = '' } = await readJson(req);
    if (typeof caption !== 'string' || caption.length > 500) throw new HttpError(400, 'A legenda deve ter até 500 caracteres.');
    const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, 'Envie uma imagem PNG, JPG ou WEBP.');
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 5 * 1024 * 1024) throw new HttpError(413, 'O meme deve ter no máximo 5 MB.');
    if (!hasValidImageSignature(image, match[1])) throw new HttpError(400, 'O conteúdo do arquivo não corresponde a uma imagem válida.');
    const usedMemory = [...imageStore.values()].reduce((total, entry) => total + entry.buffer.length, 0);
    if (usedMemory + image.length > MAX_IMAGE_MEMORY) throw new HttpError(507, 'O limite de imagens foi atingido. Peça ao administrador para limpar o mural.');
    if (db.dailyMemes.length >= 60) throw new HttpError(409, 'O mural atingiu 60 memes. Peça ao administrador para limpar o dia.');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]];
    const filename = randomUUID() + '.' + extension;
    await storeImage(filename, image, match[1]);
    db.dailyMemes.push({
      id: randomUUID(), userId: user.id, authorName: user.displayName, filename,
      mimeType: match[1], size: image.length, caption: caption.trim(), createdAt: new Date(now).toISOString(),
    });
    awardEngagementCard(db,user.id,'meme',saoPauloDayKey());
    recordActivity(user.id, 'meme');
    rewardDailyMissions(user.id);
    settleSeasonalChallenges();
    memePostTimes.set(user.id, now);
    await persist(); broadcastRefresh('daily-wall'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/anonymous-posts') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de publicar.');
    const body = await readJson(req);
    const message = String(body.message || '').trim().replace(/\r\n/g, '\n');
    if (message.length < 3) throw new HttpError(400, 'Escreva um pouco mais antes de publicar.');
    if (message.length > 1000) throw new HttpError(400, 'O texto deve ter no máximo 1000 caracteres.');
    const now = Date.now();
    const lastPost = anonymousPostTimes.get(user.id) || 0;
    if (now - lastPost < 3000) throw new HttpError(429, 'Aguarde alguns segundos antes de publicar novamente.');
    anonymousPostTimes.set(user.id, now);
    db.anonymousPosts.push({ id: randomUUID(), authorId: user.id, message, createdAt: new Date(now).toISOString() });
    rewardDailyMissions(user.id);
    settleSeasonalChallenges();
    if (db.anonymousPosts.length > 500) db.anonymousPosts = db.anonymousPosts.slice(-500);
    await persist(); broadcastRefresh('anonymous-wall'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/lie-meter') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const target = db.users.find((person) => person.id === body.targetUserId && person.active);
    const delta = Number(body.delta);
    const reason = String(body.reason || '').trim().replace(/\s+/g, ' ');
    if (!target || ![1, -1].includes(delta)) throw new HttpError(400, 'Marcação inválida.');
    if (target.id === user.id) throw new HttpError(403, 'Você não pode marcar o próprio nome.');
    if (delta > 0 && (reason.length < 3 || reason.length > 180)) throw new HttpError(400, 'Conte a mentira em 3 a 180 caracteres.');
    if (delta < 0) {
      const total = db.lieAccusations.filter((item) => item.targetUserId === target.id && item.status === 'confirmed').reduce((sum, item) => sum + item.delta, 0);
      if (total <= 0) throw new HttpError(409, 'Essa pessoa ainda não possui mentiras confirmadas para remover.');
    }
    const duplicate = db.lieAccusations.some((item) => item.status === 'pending' && item.targetUserId === target.id && item.createdByUserId === user.id && item.delta === delta);
    if (duplicate) throw new HttpError(409, 'Você já possui uma marcação igual aguardando validação.');
    db.lieAccusations.push({ id: randomUUID(), targetUserId: target.id, createdByUserId: user.id, delta, reason: delta > 0 ? reason : '', status: 'pending', createdAt: new Date().toISOString(), validatedByUserId: null, confirmedAt: null });
    if (db.lieAccusations.length > 3000) db.lieAccusations = db.lieAccusations.slice(-3000);
    await persist(); broadcastRefresh('lie-meter'); json(res, 201, stateFor(user)); return;
  }

  const lieRejectMatch = route.match(/^\/api\/lie-meter\/([^/]+)\/reject$/);
  if (req.method === 'PATCH' && lieRejectMatch) {
    const { user } = requireAuth(req);
    const item = db.lieAccusations.find((entry) => entry.id === lieRejectMatch[1] && entry.status === 'pending');
    if (!item) throw new HttpError(404, 'Marcação pendente não encontrada.');
    if (item.createdByUserId === user.id || item.targetUserId === user.id) throw new HttpError(403, 'A decisão precisa ser feita por uma terceira pessoa.');
    item.status = 'rejected'; item.rejectedByUserId = user.id; item.rejectedAt = new Date().toISOString();
    await persist(); broadcastRefresh('lie-meter'); json(res, 200, stateFor(user)); return;
  }

  const lieMeterMatch = route.match(/^\/api\/lie-meter\/([^/]+)$/);
  if (req.method === 'PATCH' && lieMeterMatch) {
    const { user } = requireAuth(req);
    const item = db.lieAccusations.find((entry) => entry.id === lieMeterMatch[1] && entry.status === 'pending');
    if (!item) throw new HttpError(404, 'Marcação pendente não encontrada.');
    if (item.createdByUserId === user.id || item.targetUserId === user.id) throw new HttpError(403, 'A validação precisa ser feita por uma terceira pessoa.');
    if (item.delta < 0) {
      const total = db.lieAccusations.filter((entry) => entry.targetUserId === item.targetUserId && entry.status === 'confirmed').reduce((sum, entry) => sum + entry.delta, 0);
      if (total <= 0) throw new HttpError(409, 'Não há mentira confirmada para remover.');
    }
    item.status = 'confirmed'; item.validatedByUserId = user.id; item.confirmedAt = new Date().toISOString();
    await persist(); broadcastRefresh('lie-meter'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && lieMeterMatch) {
    const { user } = requireAuth(req);
    const index = db.lieAccusations.findIndex((entry) => entry.id === lieMeterMatch[1] && entry.status === 'pending');
    if (index < 0) throw new HttpError(404, 'Marcação pendente não encontrada.');
    if (db.lieAccusations[index].createdByUserId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Somente quem criou a marcação pode cancelá-la.');
    db.lieAccusations.splice(index, 1);
    await persist(); broadcastRefresh('lie-meter'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/water') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de registrar água.');
    const body = await readJson(req);
    const ml = Number(body.ml);
    if (!Number.isInteger(ml) || ml < 50 || ml > 2000) throw new HttpError(400, 'Informe uma quantidade entre 50 e 2000 ml.');
    const createdAt = new Date().toISOString();
    const dayKey = saoPauloDayKey();
    const beforeTotal = db.waterEntries.filter((item) => item.userId === user.id && item.dayKey === dayKey).reduce((sum, item) => sum + item.ml, 0);
    db.waterEntries.push({ id: randomUUID(), userId: user.id, ml, dayKey, createdAt });
    if(beforeTotal+ml>=500)awardEngagementCard(db,user.id,'water',dayKey);
    recordActivity(user.id, 'water_log');
    if (beforeTotal < 2500 && beforeTotal + ml >= 2500) awardHydrationGoal(user.id, dayKey);
    rewardDailyMissions(user.id, dayKey);
    rewardTeamMissionIfComplete();
    settleSeasonalChallenges();
    if (db.waterEntries.length > 10000) db.waterEntries = db.waterEntries.slice(-10000);
    await persist(); broadcastRefresh('hydration'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/loans/borrow') {
    const { user } = requireAuth(req); const { amount } = await readJson(req); const principal = Number(amount);
    if (![100, 200, 300].includes(principal)) throw new HttpError(400, 'Escolha um empréstimo de 100, 200 ou 300 créditos.');
    if (db.economy.loans.some((item) => item.userId === user.id && item.status === 'active')) throw new HttpError(409, 'Quite seu empréstimo atual antes de pedir outro.');
    const before = walletFor(user.id); const totalDue = Math.round(principal * 1.2); const createdAt = new Date().toISOString();
    addCredits(user.id, principal);
    db.economy.loans.push({ id: randomUUID(), userId: user.id, principal, interestRate: .2, totalDue, remainingDue: totalDue, status: 'active', payments: [], createdAt, dueAt: new Date(Date.now() + 48 * 3600000).toISOString(), paidAt: null });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-loan', amount: principal, before, after: before + principal, reason: 'Empréstimo do Agiota Estelar', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/loans/repay') {
    const { user } = requireAuth(req); const { amount } = await readJson(req); const requested = Number(amount);
    const loan = [...db.economy.loans].reverse().find((item) => item.userId === user.id && item.status === 'active');
    if (!loan) throw new HttpError(404, 'Você não possui empréstimo ativo.');
    if (!Number.isInteger(requested) || requested < 1) throw new HttpError(400, 'Informe um valor inteiro para pagar.');
    const payment = Math.min(requested, Number(loan.remainingDue)); const before = walletFor(user.id);
    if (before < payment) throw new HttpError(409, 'Seu saldo da Loja 51 não cobre esse pagamento.');
    addCredits(user.id, -payment); loan.remainingDue = Number(loan.remainingDue) - payment;
    const createdAt = new Date().toISOString(); loan.payments.push({ amount: payment, createdAt });
    if (loan.remainingDue <= 0) { loan.remainingDue = 0; loan.status = 'paid'; loan.paidAt = createdAt; }
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-loan-payment', amount: -payment, before, after: before - payment, reason: 'Pagamento ao Agiota Estelar', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/shop/purchase') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId);
    if (!item) throw new HttpError(404, 'Item da loja não encontrado.');
    if (item.service) throw new HttpError(400, 'Use a ação específica deste serviço.');
    if (item.adminOnly) throw new HttpError(403, 'Este item é concedido exclusivamente a administradores.');
    if (!item.consumable && !item.mysteryBox && db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id)) throw new HttpError(409, 'Você já possui este item.');
    if (walletFor(user.id) < item.price) throw new HttpError(409, 'Créditos 51 insuficientes para esta compra.');
    addCredits(user.id, -item.price);
    db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: item.id, price: item.price, closedBox: Boolean(item.mysteryBox), createdAt: new Date().toISOString() });
    const mysteryBox = item.mysteryBox ? addMysteryBox(user.id, item.id, 'shop') : null;
    if (!item.consumable && !item.mysteryBox) db.economy.equipped[user.id] = { ...cosmeticsFor(user.id), [item.type]: item.id };
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), mysteryBox }); return;
  }

  if (req.method === 'POST' && route === '/api/card-packs/open') {
    const { user } = requireAuth(req); const body = await readJson(req);
    let result;try { result = openCardPack(db,user.id,body.purchaseId); } catch(error) { throw new HttpError(400,error.message); }
    if(result.changed) { await persist(); broadcastRefresh('economy'); }
    json(res,200,{...stateFor(user),cardPackResult:result.cards});return;
  }

  if (req.method === 'POST' && route === '/api/mystery-boxes/open') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const index = db.economy.mysteryBoxes.findIndex((entry) => entry.id === body.inventoryId && entry.userId === user.id);
    if (index < 0) throw new HttpError(404, 'Este baú não está mais no seu inventário.');
    const inventoryItem = db.economy.mysteryBoxes[index];
    const box = SHOP_CATALOG.find((item) => item.id === inventoryItem.boxId && item.mysteryBox);
    if (!box) throw new HttpError(404, 'Tipo de baú não encontrado.');
    db.economy.mysteryBoxes.splice(index, 1);
    const mysteryReward = grantMysteryBoxReward(user, box);
    await persist(); broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user), mysteryReward, openedBox: { id: inventoryItem.id, name: box.name, icon: box.icon } }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-boxes/sell') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const index = db.economy.mysteryBoxes.findIndex((entry) => entry.id === body.inventoryId && entry.userId === user.id);
    if (index < 0) throw new HttpError(404, 'Este baú não está mais no seu inventário.');
    const inventoryItem = db.economy.mysteryBoxes[index];
    const box = SHOP_CATALOG.find((item) => item.id === inventoryItem.boxId && item.mysteryBox);
    if (!box) throw new HttpError(404, 'Tipo de baú não encontrado.');
    const amount = Number(box.sellPrice || 0); const before = walletFor(user.id); const createdAt = new Date().toISOString();
    db.economy.mysteryBoxes.splice(index, 1); addCredits(user.id, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'mystery-box-sale', amount, before, after: before + amount, reason: 'Venda de ' + box.name, createdAt });
    await persist(); broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user), soldBox: { name: box.name, amount } }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-rewards/sell') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const index = db.economy.purchases.findIndex((entry) => entry.id === body.purchaseId && entry.userId === user.id && entry.sourceMysteryBoxId && entry.mysteryDecisionPending);
    if (index < 0) throw new HttpError(404, 'Este prêmio não está mais disponível para venda.');
    const purchase = db.economy.purchases[index];
    const item = SHOP_CATALOG.find((entry) => entry.id === purchase.itemId && !entry.mysteryBox && !entry.service);
    if (!item) throw new HttpError(404, 'Item premiado não encontrado na loja.');
    if (item.consumable && db.economy.powerUses.some((use) => use.purchaseId === purchase.id)) throw new HttpError(409, 'Este poder já foi utilizado e não pode ser vendido.');
    const sourceBox = SHOP_CATALOG.find((entry) => entry.id === purchase.sourceMysteryBoxId && entry.mysteryBox);
    const marketResale = Math.max(10, Math.floor(Number(item.price || purchase.originalPrice || 0) * .55 / 10) * 10);
    const boxResaleCap = sourceBox ? Math.max(10, Math.floor(Number(sourceBox.sellPrice || 0) * .8 / 10) * 10) : marketResale;
    const amount = Math.min(marketResale, boxResaleCap);
    const before = walletFor(user.id); const createdAt = new Date().toISOString();
    db.economy.purchases.splice(index, 1);
    if (db.economy.equipped[user.id]?.[item.type] === item.id) delete db.economy.equipped[user.id][item.type];
    addCredits(user.id, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'mystery-reward-sale', amount, before, after: before + amount, reason: 'Revenda de prêmio: ' + item.name, createdAt });
    await persist(); broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user), soldReward: { name: item.name, amount } }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-rewards/keep') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const purchase = db.economy.purchases.find((entry) => entry.id === body.purchaseId && entry.userId === user.id && entry.sourceMysteryBoxId && entry.mysteryDecisionPending);
    if (!purchase) throw new HttpError(404, 'Este prêmio já teve sua decisão concluída.');
    purchase.mysteryDecisionPending = false; purchase.mysteryDecisionAt = new Date().toISOString();
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), keptReward: true }); return;
  }

  if (req.method === 'POST' && route === '/api/shop/sell-best-win') {
    const { user } = requireAuth(req); const score = scoreFor(user.id);
    if (score.bestWins < 1) throw new HttpError(409, 'Você não possui ponto de primeiro lugar disponível para vender.');
    const before = walletFor(user.id); const createdAt = new Date().toISOString();
    addScore(user.id, { bestWins: -1 }); addCredits(user.id, 500);
    db.economy.scoreTrades.push({ id: randomUUID(), userId: user.id, scoreType: 'bestWins', amount: -1, credits: 500, createdAt });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'score-trade', amount: 500, before, after: before + 500, reason: 'Venda de 1 ponto de primeiro lugar', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/shop/free-purchase') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId);
    if (!item) throw new HttpError(404, 'Item da loja não encontrado.');
    if (item.adminOnly) throw new HttpError(403, 'Este item é concedido exclusivamente a administradores.');
    if (!['title', 'badge', 'frame', 'nameStyle', 'siteTheme', 'cursorStyle', 'trailStyle'].includes(item.type)) throw new HttpError(403, 'A Compra Grátis 51 é válida somente para itens visuais.');
    if (db.economy.freeShopUses.includes(user.id)) throw new HttpError(409, 'Sua Compra Grátis 51 já foi utilizada.');
    if (!item.consumable && !item.mysteryBox && db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id)) throw new HttpError(409, 'Você já possui este item.');
    db.economy.freeShopUses.push(user.id);
    db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: item.id, price: 0, originalPrice: item.price, freePurchase: true, createdAt: new Date().toISOString() });
    db.economy.equipped[user.id] = { ...cosmeticsFor(user.id), [item.type]: item.id };
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), freePurchaseItem: { id: item.id, name: item.name, icon: item.icon } }); return;
  }

  if (req.method === 'POST' && route === '/api/gifts/credits') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const target = db.users.find((item) => item.id === body.targetId && item.active && item.approved !== false);
    const amount = Number(body.amount); const weekKey = saoPauloWeekKey();
    if (!target || target.id === user.id) throw new HttpError(404, 'Participante escolhido não encontrado.');
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) throw new HttpError(400, 'Envie um valor inteiro entre 1 e 100 créditos.');
    const sent = db.economy.gifts.filter((item) => item.type === 'credits' && item.fromUserId === user.id && item.createdAt.slice(0, 10) >= weekKey).reduce((sum, item) => sum + item.amount, 0);
    if (sent + amount > 100) throw new HttpError(409, 'Seu limite semanal restante é de ' + Math.max(0, 100 - sent) + ' créditos.');
    if (walletFor(user.id) < amount) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const now = new Date().toISOString(); addCredits(user.id, -amount); addCredits(target.id, amount);
    db.economy.gifts.push({ id: randomUUID(), type: 'credits', fromUserId: user.id, toUserId: target.id, amount, createdAt: now });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/gifts/item') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const target = db.users.find((entry) => entry.id === body.targetId && entry.active && entry.approved !== false);
    const item = SHOP_CATALOG.find((entry) => entry.id === body.itemId && !entry.adminOnly);
    if (!target || target.id === user.id) throw new HttpError(404, 'Participante escolhido não encontrado.');
    if (!item) throw new HttpError(404, 'Item não disponível para presente.');
    if (!item.consumable && db.economy.purchases.some((purchase) => purchase.userId === target.id && purchase.itemId === item.id)) throw new HttpError(409, 'Essa pessoa já possui este item.');
    if (walletFor(user.id) < item.price) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const now = new Date().toISOString(); addCredits(user.id, -item.price);
    db.economy.purchases.push({ id: randomUUID(), userId: target.id, itemId: item.id, price: 0, giftedPrice: item.price, createdAt: now });
    db.economy.gifts.push({ id: randomUUID(), type: 'item', fromUserId: user.id, toUserId: target.id, itemId: item.id, amount: item.price, createdAt: now });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/profile/equip') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    if (!['title', 'badge', 'nameStyle', 'frame', 'siteTheme', 'trailStyle', 'cursorStyle'].includes(body.type)) throw new HttpError(400, 'Tipo de personalização inválido.');
    const currentGayWinner = [...db.draws].reverse().find((item) => item.type === 'gay');
    if (body.type === 'cursorStyle' && currentGayWinner?.winnerId === user.id) throw new HttpError(409, 'Enquanto você for o Gay da Rodada, a seta especial fica obrigatória. Seu cursor comprado continua guardado para usar depois.');
    if (body.itemId === null || body.itemId === '') {
      db.economy.equipped[user.id] = { ...cosmeticsFor(user.id), [body.type]: null };
    } else {
      const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId && candidate.type === body.type);
      const owned = item && ((item.adminOnly && user.role === 'admin') || db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id));
      if (!owned) throw new HttpError(403, 'Compre este item antes de equipá-lo.');
      if (db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id && purchase.mysteryDecisionPending)) throw new HttpError(409, 'Escolha ficar com o prêmio antes de equipá-lo.');
      db.economy.equipped[user.id] = { ...cosmeticsFor(user.id), [body.type]: item.id };
    }
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/powers/use') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId && candidate.type === 'power' && candidate.consumable);
    if (!item) throw new HttpError(404, 'Poder não encontrado.');
    const roundId = db.settings.currentRoundId;
    if (item.value === 'cleanseCursor') {
      if ([...db.draws].reverse().find((draw) => draw.type === 'gay')?.winnerId === user.id) throw new HttpError(409, 'O cursor do sorteado é obrigatório. Seu poder não foi consumido.');
      if (overdueLoanFor(user.id)) throw new HttpError(409, 'Quite a dívida para remover a cobrança do Agiota. Seu poder não foi consumido.');
      const curse = db.economy.forcedCursors.find((entry) => entry.targetUserId === user.id && isForcedCursorActive(entry, roundId));
      if (!curse) throw new HttpError(409, 'Você não tem uma maldição comprada ativa. O cursor do sorteado não pode ser removido.');
      consumePower(user.id, item.id, { roundId });
      db.economy.forcedCursors = db.economy.forcedCursors.filter((entry) => entry !== curse);
    } else if (item.value === 'loanExtension') {
      const loan = activeLoanFor(user.id);
      if (!loan?.dueAt || loan.extendedAt) throw new HttpError(409, 'É necessário um empréstimo com prazo que ainda não tenha sido prorrogado. Seu poder não foi consumido.');
      consumePower(user.id, item.id, { loanId: loan.id });
      loan.dueAt = new Date(Math.max(Date.now(), Date.parse(loan.dueAt)) + 24 * 3600000).toISOString();
      loan.extendedAt = new Date().toISOString();
    } else if (item.value === 'chooseTheme') {
      if (roundId) throw new HttpError(409, 'Aguarde a rodada atual terminar para escolher o próximo tema.');
      const theme = String(body.theme || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (theme.length < 3) throw new HttpError(400, 'Informe um tema com pelo menos 3 caracteres.');
      const roundParticipants = eligibleUsers();
      if (!roundParticipants.length) throw new HttpError(409, 'Não há participantes ativos para abrir a rodada.');
      const selectedRoundId = randomUUID();
      consumePower(user.id, item.id, { theme, roundId: selectedRoundId });
      db.settings.currentRoundId = selectedRoundId;
      db.settings.currentTheme = theme;
      db.settings.currentParticipantIds = roundParticipants.map((person) => person.id);
      db.settings.currentParticipantsLocked = false;
      db.settings.currentRoundRecoveredAt = null;
      db.draws.push({ id: randomUUID(), type: 'theme', winnerId: theme, winner: theme, detail: 'Tema escolhido com poder da Loja 51', imageUrl: '/gay-da-rodada.png', roundId: selectedRoundId, roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString() });
      db.economy.forcedTheme = null;
    } else if (item.value === 'shieldGay') {
      if (!roundId) throw new HttpError(409, 'Use o escudo durante uma rodada ativa.');
      if (!eligibleUsers().some((person) => person.id === user.id)) throw new HttpError(403, 'Você não participa desta rodada.');
      if (db.draws.some((draw) => draw.type === 'gay' && draw.roundId === roundId)) throw new HttpError(409, 'O sorteio especial desta rodada já aconteceu.');
      if (db.economy.forcedGay && db.economy.forcedGay.roundId === roundId && db.economy.forcedGay.targetId === user.id) throw new HttpError(409, 'Você já foi escolhido por um poder nesta rodada; o escudo precisa ser ativado antes da escolha.');
      if (db.economy.shields.some((shield) => shield.roundId === roundId && shield.userId === user.id)) throw new HttpError(409, 'Seu escudo já está ativo nesta rodada.');
      consumePower(user.id, item.id, { roundId });
      db.economy.shields.push({ roundId, userId: user.id, createdAt: new Date().toISOString() });
    } else if (item.value === 'revealAuthor') {
      if (!roundId) throw new HttpError(409, 'Não há uma rodada ativa.');
      const alreadyRevealed = new Set(db.economy.authorReveals.filter((reveal) => reveal.roundId === roundId && reveal.userId === user.id).map((reveal) => reveal.submissionId));
      const submissions = db.submissions.filter((entry) => entry.roundId === roundId && entry.active && entry.userId !== user.id && !alreadyRevealed.has(entry.id));
      if (!submissions.length) throw new HttpError(409, 'Todas as autorias desta rodada já estão visíveis para você.');
      consumePower(user.id, item.id, { roundId, revealCount: submissions.length });
      const createdAt = new Date().toISOString();
      submissions.forEach((submission) => db.economy.authorReveals.push({ roundId, userId: user.id, submissionId: submission.id, createdAt }));
    } else if (item.value === 'chooseWallpaper' || item.value === 'assignWallpaper') {
      if (!roundId) throw new HttpError(409, 'Não há uma rodada ativa.');
      const participants = eligibleUsers();
      const submissions = db.submissions.filter((entry) => entry.roundId === roundId && entry.active);
      if (submissions.length !== participants.length) throw new HttpError(409, 'Este poder só pode ser usado depois que todos os participantes enviarem seus wallpapers.');
      if (db.assignments.some((entry) => entry.roundId === roundId)) throw new HttpError(409, 'A distribuição dos wallpapers já começou.');
      const targetId = item.value === 'chooseWallpaper' ? user.id : String(body.targetId || '');
      const target = participants.find((person) => person.id === targetId);
      const submission = submissions.find((entry) => entry.id === body.submissionId);
      if (!target) throw new HttpError(404, 'Participante escolhido não encontrado nesta rodada.');
      if (!submission) throw new HttpError(404, 'Wallpaper escolhido não encontrado nesta rodada.');
      if (item.value !== 'chooseWallpaper' && submission.userId === target.id) throw new HttpError(409, 'Não é possível impor a alguém o wallpaper que essa própria pessoa enviou.');
      const reservations = wallpaperReservations(roundId);
      if (reservations.some((entry) => entry.targetId === target.id)) throw new HttpError(409, 'Essa pessoa já possui um wallpaper reservado nesta rodada.');
      if (reservations.some((entry) => entry.submissionId === submission.id)) throw new HttpError(409, 'Esse wallpaper já foi reservado para outra pessoa.');
      const prospective = [...reservations, { targetId: target.id, submissionId: submission.id, allowSelf: item.value === 'chooseWallpaper' }];
      if (!buildAssignmentMap(participants, submissions, prospective)) throw new HttpError(409, 'Esta escolha impediria uma distribuição válida para o restante da equipe. Escolha outro wallpaper.');
      consumePower(user.id, item.id, { roundId, targetId: target.id, submissionId: submission.id });
    } else if (item.value === 'forceGayCursor' || item.value === 'forceGiantCursor') {
      const giant = item.value === 'forceGiantCursor';
      if (!giant && !roundId) throw new HttpError(409, 'Use este poder durante uma rodada ativa.');
      const target = (giant ? db.users.filter((person) => person.active && person.approved !== false) : eligibleUsers()).find((person) => person.id === body.targetId);
      if (!target) throw new HttpError(404, 'Participante escolhido não encontrado nesta rodada.');
      if (giant && [...db.draws].reverse().find((draw) => draw.type === 'gay')?.winnerId === target.id) throw new HttpError(409, 'O sorteado está com cursor obrigatório. Escolha outro participante; seu poder não foi consumido.');
      if (db.economy.forcedCursors.some((entry) => entry.targetUserId === target.id && isForcedCursorActive(entry, roundId))) {
        throw new HttpError(409, 'Essa pessoa já tem um cursor obrigatório ativo. Seu poder não foi consumido.');
      }
      consumePower(user.id, item.id, { roundId, targetId: target.id });
      db.economy.forcedCursors.push({
        id: randomUUID(), roundId: giant ? null : roundId, expiresAt: giant ? new Date(Date.now() + 86400000).toISOString() : null, targetUserId: target.id, targetName: target.displayName,
        style: item.value === 'forceGiantCursor' ? 'giant-slow' : 'gay', usedByUserId: user.id, usedByName: user.displayName, createdAt: new Date().toISOString(),
      });
    } else if (item.value === 'chooseGay') {
      if (!roundId) throw new HttpError(409, 'Não há uma rodada ativa.');
      if (db.draws.some((draw) => draw.type === 'gay' && draw.roundId === roundId)) throw new HttpError(409, 'O Gay da Rodada já foi definido.');
      if (db.economy.forcedGay && db.economy.forcedGay.roundId === roundId) throw new HttpError(409, 'Outra pessoa já reservou o Gay da Rodada. Seu poder não foi consumido.');
      const target = eligibleUsers().find((person) => person.id === body.targetId);
      if (!target) throw new HttpError(404, 'Participante escolhido não encontrado nesta rodada.');
      if (db.economy.shields.some((shield) => shield.roundId === roundId && shield.userId === target.id)) throw new HttpError(409, 'Essa pessoa está protegida por um Escudo da Rodada.');
      consumePower(user.id, item.id, { roundId, targetId: target.id });
      db.economy.forcedGay = { roundId, userId: user.id, userName: user.displayName, targetId: target.id, targetName: target.displayName, createdAt: new Date().toISOString() };
    }
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/powers/cancel') {
    const { user } = requireAuth(req); const body = await readJson(req); const roundId = db.settings.currentRoundId;
    if (!roundId || db.draws.some((draw) => draw.type === 'gay' && draw.roundId === roundId)) throw new HttpError(409, 'Este poder já não pode ser cancelado nesta rodada.');
    const allowed = ['power-shield-gay', 'power-choose-gay'];
    if (!allowed.includes(body.itemId)) throw new HttpError(400, 'Este poder não pode ser cancelado.');
    const useIndex = db.economy.powerUses.findLastIndex((item) => item.userId === user.id && item.itemId === body.itemId && item.roundId === roundId);
    if (useIndex < 0) throw new HttpError(404, 'Reserva ativa não encontrada.');
    if (body.itemId === 'power-shield-gay') db.economy.shields = db.economy.shields.filter((item) => !(item.roundId === roundId && item.userId === user.id));
    if (body.itemId === 'power-choose-gay') {
      if (!db.economy.forcedGay || db.economy.forcedGay.userId !== user.id || db.economy.forcedGay.roundId !== roundId) throw new HttpError(409, 'Esta escolha já não está reservada por você.');
      db.economy.forcedGay = null;
    }
    db.economy.powerUses.splice(useIndex, 1);
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  const deleteWaterMatch = route.match(/^\/api\/water\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteWaterMatch) {
    const { user } = requireAuth(req);
    const entryIndex = db.waterEntries.findIndex((item) => item.id === deleteWaterMatch[1]);
    if (entryIndex < 0) throw new HttpError(404, 'Registro de água não encontrado.');
    const entry = db.waterEntries[entryIndex];
    if (entry.userId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você só pode excluir os seus próprios registros.');
    db.waterEntries.splice(entryIndex, 1);
    await persist(); broadcastRefresh('hydration'); json(res, 200, stateFor(user)); return;
  }

  const deleteAnonymousMatch = route.match(/^\/api\/admin\/anonymous-posts\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteAnonymousMatch) {
    const { user } = requireAdmin(req);
    const postIndex = db.anonymousPosts.findIndex((item) => item.id === deleteAnonymousMatch[1]);
    if (postIndex < 0) throw new HttpError(404, 'Publicação não encontrada.');
    db.anonymousPosts.splice(postIndex, 1);
    await persist(); broadcastRefresh('anonymous-wall'); json(res, 200, stateFor(user)); return;
  }

  const deleteMemeMatch = route.match(/^\/api\/admin\/memes\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMemeMatch) {
    const { user } = requireAdmin(req);
    const memeIndex = db.dailyMemes.findIndex((item) => item.id === deleteMemeMatch[1]);
    if (memeIndex < 0) throw new HttpError(404, 'Meme não encontrado no mural.');
    const [meme] = db.dailyMemes.splice(memeIndex, 1);
    db.dailyReactions = db.dailyReactions.filter((item) => !(item.targetType === 'meme' && item.targetId === meme.id));
    await deleteStoredImage(meme.filename);
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/daily-wall/clear') {
    const { user } = requireAdmin(req);
    await deleteStoredImages(db.dailyMemes);
    db.dailyMemes = [];
    db.dailyPhrases = [];
    db.dailyReactions = [];
    db.settings.dailyPhrase = '';
    db.settings.dailyPhraseUpdatedAt = null;
    db.settings.dailyPhraseUpdatedBy = null;
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/my-wallpaper') {
    const { user } = requireAuth(req);
    const roundId = db.settings.currentRoundId;
    const assignment = db.assignments.find((item) => item.roundId === roundId && item.userId === user.id && item.revealed);
    if (!assignment) throw new HttpError(404, 'Seu wallpaper ainda não foi sorteado nesta rodada.');
    const submission = db.submissions.find((item) => item.id === assignment.submissionId && item.active);
    if (!submission) throw new HttpError(404, 'Seu wallpaper não está mais disponível na memória.');
    const extension = path.extname(submission.filename).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png';
    await serveMemoryImage(res, submission.filename, 'meu-wallpaper-area-51' + extension); return;
  }

  if (req.method === 'POST' && route === '/api/my-round/seen') {
    const { user } = requireAuth(req);
    const roundId = db.settings.currentRoundId;
    const assignment = db.assignments.find((item) => item.roundId === roundId && item.userId === user.id && item.revealed);
    if (!assignment) throw new HttpError(404, 'Você ainda não recebeu um wallpaper nesta rodada.');
    if (!assignment.seenAt) {
      assignment.seenAt = new Date().toISOString();
      await persist();
      broadcastRefresh('assignment-seen');
    }
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/events') {
    const { user } = requireAuth(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    // The Worker adapter returns a finite response, not an open Node stream.
    // Retaining it would leak closed clients and broadcast into old buffers on
    // every reconnect, generating redundant state refreshes for everyone.
    if (runtimeEnv) {
      onlineVisits.set(user.id, Date.now());
      for (const [id, seen] of onlineVisits) if (Date.now() - seen >= 45000) onlineVisits.delete(id);
      sendLiveEvent(res, 'ready', {
        connected: true, serverTime: Date.now(), musicEpoch: MUSIC_EPOCH, musicLoopMs: MUSIC_LOOP_MS,
      });
      if (liveDraw && liveDraw.endsAt > Date.now()) sendLiveEvent(res, 'draw', drawForUser(liveDraw, user.id));
      res.end();
      return;
    }
    liveClients.set(res, user.id);
    broadcastRefresh('presence');
    sendLiveEvent(res, 'ready', {
      connected: true, serverTime: Date.now(), musicEpoch: MUSIC_EPOCH, musicLoopMs: MUSIC_LOOP_MS,
    });
    if (liveDraw && liveDraw.endsAt > Date.now()) sendLiveEvent(res, 'draw', drawForUser(liveDraw, user.id));
    req.on('close', () => { liveClients.delete(res); broadcastRefresh('presence'); });
    return;
  }

  if (req.method === 'POST' && route === '/api/change-password') {
    const { user } = requireAuth(req);
    const { currentPassword = '', newPassword = '' } = await readJson(req);
    if (!passwordMatches(String(currentPassword), user)) throw new HttpError(400, 'A senha atual está incorreta.');
    if (String(newPassword).length < 8) throw new HttpError(400, 'A nova senha deve ter ao menos 8 caracteres.');
    Object.assign(user, makePassword(String(newPassword)), { mustChangePassword: false });
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/uploads') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Aguarde o administrador sortear o tema antes de enviar.');
    if (!eligibleUsers().some((item) => item.id === user.id)) throw new HttpError(403, 'Sua conta entrará somente na próxima rodada.');
    if (db.assignments.some((item) => item.roundId === roundId)) throw new HttpError(409, 'Os envios foram encerrados porque a distribuição já começou.');
    if (db.submissions.some((item) => item.roundId === roundId && item.userId === user.id && item.active))
      throw new HttpError(400, 'Cada pessoa pode enviar somente 1 wallpaper por rodada.');
    const { dataUrl = '' } = await readJson(req);
    const { image, mimeType, extension } = decodeWallpaperDataUrl(dataUrl);
    const usedMemory = [...imageStore.values()].reduce((total, entry) => total + entry.buffer.length, 0);
    if (usedMemory + image.length > MAX_IMAGE_MEMORY) {
      throw new HttpError(507, 'O limite de 200 MB de imagens desta rodada foi atingido. Limpe a rodada antes de continuar.');
    }
    const filename = randomUUID() + '.' + extension;
    await storeImage(filename, image, mimeType);
    const anonymousCode = randomBytes(2).toString('hex').toUpperCase();
    db.submissions.push({ id: randomUUID(), roundId, userId: user.id, uploader: user.displayName,
      title: 'Wallpaper ' + anonymousCode,
      filename, mimeType, size: image.length, active: true, createdAt: new Date().toISOString() });
    await persist(); broadcastRefresh('submissions'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/uploads') {
    const { user: admin } = requireAdmin(req);
    if (admin.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Sorteie o tema antes de enviar por outra pessoa.');
    if (db.assignments.some((item) => item.roundId === roundId)) throw new HttpError(409, 'Os envios foram encerrados porque a distribuição já começou.');
    const { targetUserId = '', dataUrl = '' } = await readJson(req);
    const target = eligibleUsers().find((item) => item.id === String(targetUserId));
    if (!target) throw new HttpError(404, 'Esta pessoa não participa da rodada atual.');
    const existing = db.submissions.find((item) => item.roundId === roundId && item.userId === target.id && item.active);
    const { image, mimeType, extension } = decodeWallpaperDataUrl(dataUrl);
    const usedMemory = [...imageStore.values()].reduce((total, entry) => total + entry.buffer.length, 0);
    if (usedMemory - Number(existing?.size || 0) + image.length > MAX_IMAGE_MEMORY) throw new HttpError(507, 'O limite de 200 MB de imagens desta rodada foi atingido.');
    const filename = randomUUID() + '.' + extension;
    await storeImage(filename, image, mimeType);
    if (existing) existing.active = false;
    const anonymousCode = randomBytes(2).toString('hex').toUpperCase();
    db.submissions.push({ id: randomUUID(), roundId, userId: target.id, uploader: target.displayName,
      title: 'Wallpaper ' + anonymousCode, filename, mimeType, size: image.length, active: true,
      uploadedByAdminId: admin.id, uploadedByAdminName: admin.displayName, createdAt: new Date().toISOString() });
    if (existing && !db.draws.some((draw) => draw.imageUrl === '/uploads/' + existing.filename)) await deleteStoredImage(existing.filename);
    await persist(); broadcastRefresh('submissions'); json(res, 201, stateFor(admin)); return;
  }

  const deleteMatch = route.match(/^\/api\/uploads\/([a-f0-9-]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const { user } = requireAuth(req);
    const roundId = db.settings.currentRoundId;
    if (db.assignments.some((entry) => entry.roundId === roundId)) throw new HttpError(409, 'Não é possível remover imagens depois que a distribuição começou.');
    const item = db.submissions.find((entry) => entry.id === deleteMatch[1] && entry.active && entry.roundId === roundId);
    if (!item) throw new HttpError(404, 'Wallpaper não encontrado.');
    if (item.userId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você não pode excluir esta inscrição.');
    item.active = false; await persist(); broadcastRefresh('submissions');
    const usedInHistory = db.draws.some((draw) => draw.imageUrl === '/uploads/' + item.filename);
    if (!usedInHistory) await deleteStoredImage(item.filename);
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/draw') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Já existe um sorteio ao vivo em andamento.');
    const { type } = await readJson(req);
    let candidates;
    let result;
    if (type === 'theme') {
      if (db.settings.currentRoundId) throw new HttpError(409, 'Encerre a rodada atual antes de sortear outro tema.');
      candidates = db.settings.themes.map((item) => String(item).trim()).filter(Boolean);
      if (!candidates.length) throw new HttpError(400, 'Cadastre ao menos um tema no painel administrativo.');
      const roundParticipants = eligibleUsers();
      if (!roundParticipants.length) throw new HttpError(400, 'Não há participantes ativos para iniciar a rodada.');
      const winner = candidates[randomInt(candidates.length)];
      const roundId = randomUUID();
      db.settings.currentRoundId = roundId;
      db.settings.currentTheme = winner;
      db.settings.currentParticipantIds = roundParticipants.map((item) => item.id);
      db.settings.currentParticipantsLocked = false;
      db.settings.currentRoundRecoveredAt = null;
      result = {
        id: randomUUID(), type: 'theme', winnerId: winner, winner,
        detail: 'Tema da rodada', imageUrl: '/gay-da-rodada.png', roundId,
        roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString(),
      };
    } else if (type === 'wallpaper') {
      const roundId = db.settings.currentRoundId;
      if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Sorteie o tema antes de distribuir os wallpapers.');
      const participants = eligibleUsers();
      const submissions = db.submissions.filter((item) => item.active && item.roundId === roundId);
      const submitterIds = new Set(submissions.map((item) => item.userId));
      if (!participants.length || submissions.length !== participants.length || participants.some((item) => !submitterIds.has(item.id))) {
        throw new HttpError(409, 'Aguarde cada participante enviar exatamente um wallpaper. O administrador pode fechar os envios e seguir com quem já enviou.');
      }
      db.settings.currentParticipantsLocked = true;
      const plan = ensureAssignmentPlan(roundId, participants, submissions);
      const remaining = plan.filter((item) => !item.revealed).sort((a, b) => a.order - b.order);
      const assignment = remaining[0];
      if (!assignment) throw new HttpError(409, 'Todos os participantes já receberam um wallpaper.');
      candidates = remaining.map((item) => db.submissions.find((submission) => submission.id === item.submissionId)).filter(Boolean);
      const recipient = db.users.find((item) => item.id === assignment.userId);
      const wallpaper = db.submissions.find((item) => item.id === assignment.submissionId);
      assignment.revealed = true;
      assignment.revealedAt = new Date().toISOString();
      result = {
        id: randomUUID(), type: 'wallpaper', winnerId: wallpaper.id, submissionId: wallpaper.id,
        assignmentId: assignment.id, winnerUserId: recipient.id, winner: recipient.displayName,
        assignedTo: recipient.displayName, wallpaperTitle: wallpaper.title,
        detail: wallpaper.title + ' · autoria secreta', imageUrl: '/uploads/' + wallpaper.filename, roundId,
        roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString(),
      };
    } else if (type === 'gay') {
      const roundId = db.settings.currentRoundId;
      if (!roundId) throw new HttpError(409, 'Não há uma rodada ativa.');
      const participants = eligibleUsers();
      const assignments = db.assignments.filter((item) => item.roundId === roundId && item.revealed);
      if (!participants.length || assignments.length !== participants.length) {
        throw new HttpError(409, 'Distribua um wallpaper para cada participante antes deste sorteio.');
      }
      if (db.draws.some((item) => item.type === 'gay' && item.roundId === roundId)) {
        throw new HttpError(409, 'O Gay da Rodada desta rodada já foi sorteado.');
      }
      const submissions = db.submissions.filter((item) => item.active && item.roundId === roundId);
      if (submissions.length < 2) throw new HttpError(409, 'São necessários ao menos 2 wallpapers para abrir a votação.');
      candidates = [...participants];
      const forcedGay = db.economy.forcedGay && db.economy.forcedGay.roundId === roundId ? db.economy.forcedGay : null;
      const shieldedIds = new Set(db.economy.shields.filter((shield) => shield.roundId === roundId).map((shield) => shield.userId));
      if (candidates.some((candidate) => !shieldedIds.has(candidate.id))) candidates = candidates.filter((candidate) => !shieldedIds.has(candidate.id));
      if (!forcedGay && db.settings.excludeLastGayWinner && candidates.length > 1) {
        const last = [...db.draws].reverse().find((item) => item.type === 'gay' && item.roundId !== roundId);
        if (last) candidates = candidates.filter((item) => item.id !== last.winnerId);
      }
      const forcedCandidate = forcedGay ? candidates.find((candidate) => candidate.id === forcedGay.targetId) : null;
      const winner = forcedCandidate || candidates[randomInt(candidates.length)];
      db.economy.forcedGay = null;
      const winnerAssignment = assignments.find((item) => item.userId === winner.id);
      const sourceSubmission = db.submissions.find((item) => item.id === winnerAssignment.submissionId);
      const votingId = randomUUID();
      result = {
        id: randomUUID(), type: 'gay', winnerId: winner.id, winnerUserId: winner.id,
        winner: winner.displayName, detail: 'Gay da Rodada', imageUrl: '/gay-da-rodada.png',
        roundId, votingId, watermarkSourceUrl: '/uploads/' + sourceSubmission.filename,
        watermarkSourceTitle: sourceSubmission.title,
        roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString(),
      };
      db.votings.push({
        id: votingId, roundId, roundName: db.settings.roundName, theme: db.settings.currentTheme,
        submissionIds: submissions.map((item) => item.id), requiredVoterIds: participants.map((item) => item.id),
        votes: [], status: 'open', scoresApplied: false, openedAt: new Date().toISOString(), closedAt: null,
      });
      addScore(winner.id, { gayWins: 1 });
    } else throw new HttpError(400, 'Tipo de sorteio inválido.');
    db.draws.push(result);
    await persist();
    json(res, 200, drawForUser(startLiveDraw(result, candidates), user.id)); return;
  }

  if (req.method === 'POST' && route === '/api/vote') {
    const { user } = requireAuth(req);
    const voting = openVoting();
    if (!voting) throw new HttpError(409, 'Não há votação aberta neste momento.');
    if (!voting.requiredVoterIds.includes(user.id)) throw new HttpError(403, 'Sua conta não está elegível para esta votação.');
    if (voting.votes.some((vote) => vote.userId === user.id)) throw new HttpError(409, 'Seu voto já foi registrado.');
    const { bestId, worstId } = await readJson(req);
    if (bestId === worstId) throw new HttpError(400, 'Escolha wallpapers diferentes para melhor e pior.');
    if (!voting.submissionIds.includes(bestId) || !voting.submissionIds.includes(worstId)) {
      throw new HttpError(400, 'Escolha duas opções válidas desta votação.');
    }
    voting.votes.push({ userId: user.id, bestId, worstId, createdAt: new Date().toISOString() });
    awardEngagementCard(db,user.id,'vote',saoPauloDayKey());
    settleSeasonalChallenges();
    if (voting.votes.length >= voting.requiredVoterIds.length) finishVoting(voting);
    await persist(); broadcastRefresh(voting.status === 'closed' ? 'voting-closed' : 'vote'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/voting/close') {
    const { user } = requireAdmin(req);
    const voting = openVoting();
    if (!voting) throw new HttpError(409, 'Não há votação aberta.');
    if (voting.votes.length < voting.requiredVoterIds.length) {
      throw new HttpError(409, 'A autoria só será revelada depois que todos os participantes votarem.');
    }
    finishVoting(voting); await persist(); broadcastRefresh('voting-closed'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/round/use-ready') {
    const { user } = requireAdmin(req);
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Não há período de envios aberto.');
    if (db.assignments.some((item) => item.roundId === roundId)) throw new HttpError(409, 'A distribuição já começou.');
    const submittedIds = new Set(db.submissions.filter((item) => item.active && item.roundId === roundId).map((item) => item.userId));
    const currentIds = db.settings.currentParticipantIds || [];
    const readyIds = currentIds.filter((id) => submittedIds.has(id) && db.users.some((item) => item.id === id && item.active));
    if (readyIds.length < 2) throw new HttpError(409, 'São necessários pelo menos 2 wallpapers enviados para continuar.');
    if (readyIds.length === currentIds.length) throw new HttpError(409, 'Todos já enviaram. Você pode iniciar a distribuição normalmente.');
    db.settings.currentParticipantIds = readyIds;
    db.settings.currentParticipantsLocked = true;
    await persist(); broadcastRefresh('participants-finalized'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'PATCH' && route === '/api/admin/settings') {
    const { user } = requireAdmin(req); const body = await readJson(req);
    if (typeof body.roundName === 'string') db.settings.roundName = body.roundName.trim().slice(0, 60) || 'Rodada semanal';
    if (typeof body.excludeLastGayWinner === 'boolean') db.settings.excludeLastGayWinner = body.excludeLastGayWinner;
    if (Array.isArray(body.themes)) {
      const seen = new Set();
      db.settings.themes = body.themes.map((item) => String(item).trim().slice(0, 60)).filter((item) => {
        const key = item.toLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 30);
    }
    if (body.roundSchedule && typeof body.roundSchedule === 'object') {
      const cleanDate = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || '')) ? String(value) : '';
      db.settings.roundSchedule = { submissionsAt: cleanDate(body.roundSchedule.submissionsAt), drawAt: cleanDate(body.roundSchedule.drawAt), voteAt: cleanDate(body.roundSchedule.voteAt) };
    }
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/security/code') {
    const { user } = requireAdmin(req); const body = await readJson(req);
    if (!passwordMatches(String(body.currentPassword || ''), user)) throw new HttpError(401, 'Sua senha administrativa está incorreta.');
    const code = String(body.code || '').trim();
    if (code.length < 2 || code.length > 32) throw new HttpError(400, 'Use um código entre 2 e 32 caracteres.');
    db.settings.gateSeed = randomBytes(24).toString('hex');
    db.settings.gateCodeHash = createHash('sha256').update(db.settings.gateSeed + ':' + code).digest('hex');
    await persist(); json(res, 200, stateFor(user)); return;
  }

  const gateDeviceMatch = route.match(/^\/api\/admin\/security\/devices\/([a-f0-9-]+)$/);
  if (req.method === 'DELETE' && gateDeviceMatch) {
    const { user } = requireAdmin(req);
    db.gateAuthorizations = db.gateAuthorizations.filter((item) => item.id !== gateDeviceMatch[1]);
    await persist(); json(res, 200, stateFor(user)); return;
  }
  if (req.method === 'POST' && route === '/api/admin/security/revoke-all') {
    const { user } = requireAdmin(req); db.gateAuthorizations = [];
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/admin/backup') {
    requireAdmin(req);
    const payload = { version: 1, createdAt: new Date().toISOString(), database: db, images: [...imageStore.entries()].map(([filename, image]) => ({ filename, mimeType: image.mimeType, data: image.buffer.toString('base64') })) };
    const body = JSON.stringify(payload);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Content-Disposition': 'attachment; filename="area51-backup-' + saoPauloDayKey() + '.json"', 'Cache-Control': 'no-store' }); res.end(body); return;
  }

  if (req.method === 'POST' && route === '/api/admin/backup/restore') {
    const { user } = requireAdmin(req); const payload = await readJson(req, 240 * 1024 * 1024);
    const restored = payload && payload.database;
    if (!restored || !Array.isArray(restored.users) || !restored.economy || !restored.settings) throw new HttpError(400, 'Este arquivo não é um backup válido da Área 51.');
    if (!restored.users.some((item) => item.id === user.id && item.role === 'admin')) throw new HttpError(409, 'O backup não contém sua conta administrativa atual.');
    const images = Array.isArray(payload.images) ? payload.images : [];
    const decoded = images.map((item) => ({ filename: path.basename(String(item.filename || '')), mimeType: String(item.mimeType || ''), buffer: Buffer.from(String(item.data || ''), 'base64') }));
    const total = decoded.reduce((sum, item) => sum + item.buffer.length, 0);
    if (total > MAX_IMAGE_MEMORY || decoded.some((item) => !item.filename || !/^image\/(png|jpeg|webp)$/.test(item.mimeType))) throw new HttpError(413, 'As imagens do backup são inválidas ou excedem o limite.');
    const currentSecurity = db.gateAuthorizations; const currentGate = { gateSeed: db.settings.gateSeed, gateCodeHash: db.settings.gateCodeHash };
    db = restored;
    db.feedbackMessages ||= []; db.dailyMemes ||= []; db.dailyPhrases ||= []; db.dailyReactions ||= [];
    db.anonymousPosts ||= []; db.waterEntries ||= []; db.rememberTokens ||= []; db.lieAccusations ||= [];
    db.notificationsReadAt ||= {}; db.economy.wallets ||= {}; db.economy.purchases ||= [];
    db.economy.equipped ||= {}; db.economy.missionProgress ||= {}; db.economy.missionRewards ||= [];
    db.economy.dailyMissionRewards ||= []; db.economy.cleanNameRewards ||= [];
    db.economy.teamMissionRewards ||= []; db.economy.seasonChallengeRewards ||= []; db.economy.gifts ||= []; db.economy.activityTotals ||= {};
    db.economy.powerUses ||= []; db.economy.shields ||= []; db.economy.authorReveals ||= [];
    db.economy.creditAdjustments ||= []; db.economy.forcedCursors ||= [];
    db.economy.mysteryBoxes ||= []; db.economy.casinoPlays ||= []; db.economy.casinoAccounts ||= {};
    db.settings.roundSchedule ||= { submissionsAt: '', drawAt: '', voteAt: '' };
    db.settings.missionEconomyStartWeek ||= saoPauloWeekKey();
    db.users.forEach((item) => { if (typeof item.approved !== 'boolean') item.approved = true; });
    db.gateAuthorizations = currentSecurity; Object.assign(db.settings, currentGate);
    imageStore.clear(); for (const image of decoded) await storeImage(image.filename, image.buffer, image.mimeType);
    await persist(); broadcastRefresh('backup-restored'); json(res, 200, stateFor(db.users.find((item) => item.id === user.id))); return;
  }

  if (req.method === 'POST' && route === '/api/admin/users') {
    const { user: admin } = requireAdmin(req); const body = await readJson(req);
    const { username, displayName, password } = validateNewUser(body);
    const createdUser = { id: randomUUID(), username, displayName, role: body.role === 'admin' ? 'admin' : 'member',
      active: true, approved: true, eligible: body.eligible !== false, mustChangePassword: true,
      createdAt: new Date().toISOString(), ...makePassword(password) };
    db.users.push(createdUser); joinOpenRound(createdUser);
    await persist(); json(res, 201, stateFor(admin)); return;
  }

  const creditMatch = route.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/credits$/);
  if (req.method === 'POST' && creditMatch) {
    const { user: admin } = requireAdmin(req);
    const target = db.users.find((item) => item.id === creditMatch[1]);
    if (!target) throw new HttpError(404, 'Usuário não encontrado.');
    const body = await readJson(req);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 0 || amount > 100000) throw new HttpError(400, 'Informe um valor inteiro entre 0 e 100.000.');
    const mode = ['add', 'remove', 'set'].includes(body.mode) ? body.mode : 'add';
    const before = walletFor(target.id);
    const after = mode === 'set' ? amount : mode === 'remove' ? Math.max(0, before - amount) : before + amount;
    db.economy.wallets[target.id] = after;
    db.economy.creditAdjustments.push({ id: randomUUID(), adminId: admin.id, adminName: admin.displayName, userId: target.id, mode, amount, before, after, reason: String(body.reason || '').trim().slice(0, 120), createdAt: new Date().toISOString() });
    if (db.economy.creditAdjustments.length > 1000) db.economy.creditAdjustments = db.economy.creditAdjustments.slice(-1000);
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(admin)); return;
  }

  const userMatch = route.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);
  if (req.method === 'PATCH' && userMatch) {
    const { user: admin } = requireAdmin(req); const target = db.users.find((item) => item.id === userMatch[1]);
    if (!target) throw new HttpError(404, 'Usuário não encontrado.');
    const body = await readJson(req);
    if (db.settings.currentRoundId && (typeof body.active === 'boolean' || typeof body.eligible === 'boolean') &&
      db.settings.currentParticipantIds.includes(target.id)) {
      throw new HttpError(409, 'Não altere os participantes enquanto a rodada estiver em andamento.');
    }
    if (target.id === admin.id && body.active === false) throw new HttpError(400, 'Você não pode desativar o próprio acesso.');
    if (typeof body.approved === 'boolean') {
      target.approved = body.approved; target.active = body.approved;
      if (body.approved) joinOpenRound(target);
    }
    if (typeof body.active === 'boolean') target.active = body.active;
    if (typeof body.eligible === 'boolean') target.eligible = body.eligible;
    if (Object.hasOwn(body, 'displayName')) {
      const displayName = String(body.displayName || '').trim();
      if (!displayName || displayName.length > 50) throw new HttpError(400, 'Informe um nome com até 50 caracteres.');
      const previousName = target.displayName;
      target.displayName = displayName;
      db.submissions.filter((item) => item.userId === target.id).forEach((item) => { item.uploader = displayName; });
      db.feedbackMessages.filter((item) => item.authorId === target.id).forEach((item) => { item.authorName = displayName; });
      db.dailyPhrases.filter((item) => item.userId === target.id).forEach((item) => { item.authorName = displayName; });
      db.dailyMemes.filter((item) => item.userId === target.id).forEach((item) => { item.authorName = displayName; });
      db.draws.forEach((item) => {
        if (item.winnerId === target.id || item.winnerUserId === target.id) item.winner = displayName;
        if (item.assignedTo === previousName) item.assignedTo = displayName;
        if (item.drawnBy === previousName) item.drawnBy = displayName;
      });
      if (db.economy.forcedGay?.userId === target.id) db.economy.forcedGay.userName = displayName;
      if (db.economy.forcedGay?.targetId === target.id) db.economy.forcedGay.targetName = displayName;
    }
    if (Object.hasOwn(body, 'username')) {
      const username = String(body.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Usuário inválido. Use 3 a 30 letras, números, ponto, hífen ou sublinhado.');
      if (db.users.some((item) => item.id !== target.id && item.username.toLowerCase() === username)) throw new HttpError(409, 'Esse usuário já existe.');
      target.username = username;
    }
    if (typeof body.newPassword === 'string' && body.newPassword) {
      if (body.newPassword.length < 8) throw new HttpError(400, 'A senha deve ter ao menos 8 caracteres.');
      Object.assign(target, makePassword(body.newPassword), { mustChangePassword: true });
    }
    await persist(); broadcastRefresh('participants'); json(res, 200, stateFor(admin)); return;
  }

  if (req.method === 'DELETE' && userMatch) {
    const { user: admin } = requireAdmin(req);
    const targetIndex = db.users.findIndex((item) => item.id === userMatch[1]);
    if (targetIndex < 0) throw new HttpError(404, 'Usuário não encontrado.');
    const target = db.users[targetIndex];
    if (target.id === admin.id) throw new HttpError(400, 'Você não pode excluir a própria conta administrativa.');
    if (db.settings.currentRoundId && db.settings.currentParticipantIds.includes(target.id)) {
      throw new HttpError(409, 'Este usuário está na rodada atual. Encerre ou limpe a rodada antes de excluir a conta.');
    }
    const submissionIds = new Set(db.submissions.filter((item) => item.userId === target.id).map((item) => item.id));
    await deleteStoredImages(db.submissions.filter((item) => item.userId === target.id));
    await deleteStoredImages(db.dailyMemes.filter((item) => item.userId === target.id));
    db.users.splice(targetIndex, 1);
    db.submissions = db.submissions.filter((item) => item.userId !== target.id);
    db.assignments = db.assignments.filter((item) => item.userId !== target.id && !submissionIds.has(item.submissionId));
    db.votings.forEach((voting) => {
      voting.requiredVoterIds = (voting.requiredVoterIds || []).filter((id) => id !== target.id);
      voting.votes = (voting.votes || []).filter((vote) => vote.userId !== target.id);
      voting.submissionIds = (voting.submissionIds || []).filter((id) => !submissionIds.has(id));
    });
    db.feedbackMessages = db.feedbackMessages.filter((item) => item.authorId !== target.id);
    db.dailyPhrases = db.dailyPhrases.filter((item) => item.userId !== target.id);
    db.dailyMemes = db.dailyMemes.filter((item) => item.userId !== target.id);
    db.waterEntries = db.waterEntries.filter((item) => item.userId !== target.id);
    db.rememberTokens = db.rememberTokens.filter((item) => item.userId !== target.id);
    delete db.economy.wallets[target.id];
    delete db.economy.equipped[target.id];
    delete db.economy.activityTotals[target.id];
    db.economy.waterRewardDays = db.economy.waterRewardDays.filter((key) => !key.startsWith(target.id + ':'));
    db.economy.purchases = db.economy.purchases.filter((item) => item.userId !== target.id);
    db.economy.powerUses = db.economy.powerUses.filter((item) => item.userId !== target.id);
    db.economy.shields = db.economy.shields.filter((item) => item.userId !== target.id);
    db.economy.authorReveals = db.economy.authorReveals.filter((item) => item.userId !== target.id);
    db.economy.creditAdjustments = db.economy.creditAdjustments.filter((item) => item.userId !== target.id);
    db.economy.mysteryBoxes = db.economy.mysteryBoxes.filter((item) => item.userId !== target.id);
    db.economy.casinoPlays = db.economy.casinoPlays.filter((item) => item.userId !== target.id);
    delete db.economy.casinoAccounts[target.id];
    db.economy.forcedCursors = db.economy.forcedCursors.filter((item) => item.targetUserId !== target.id && item.usedByUserId !== target.id);
    if (db.economy.forcedGay && (db.economy.forcedGay.userId === target.id || db.economy.forcedGay.targetId === target.id)) db.economy.forcedGay = null;
    if (db.economy.forcedTheme?.userId === target.id) db.economy.forcedTheme = null;
    Object.keys(db.economy.missionProgress).filter((key) => key.startsWith(target.id + ':')).forEach((key) => delete db.economy.missionProgress[key]);
    db.economy.missionRewards = db.economy.missionRewards.filter((key) => !key.startsWith(target.id + ':'));
    db.economy.dailyMissionRewards = db.economy.dailyMissionRewards.filter((key) => !key.startsWith(target.id + ':'));
    db.economy.cleanNameRewards = db.economy.cleanNameRewards.filter((key) => !key.startsWith(target.id + ':'));
    db.lieAccusations = db.lieAccusations.filter((item) => item.targetUserId !== target.id && item.createdByUserId !== target.id && item.validatedByUserId !== target.id);
    db.settings.currentParticipantIds = db.settings.currentParticipantIds.filter((id) => id !== target.id);
    delete db.scores[target.id];
    for (const [token, session] of sessions) if (session.userId === target.id) sessions.delete(token);
    await persist(); broadcastRefresh('participants'); json(res, 200, stateFor(admin)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/clear-submissions') {
    const { user } = requireAdmin(req);
    const roundId = db.settings.currentRoundId;
    if (!roundId || db.assignments.some((item) => item.roundId === roundId)) {
      throw new HttpError(409, 'As inscrições só podem ser limpas antes de começar a distribuição.');
    }
    const roundImages = db.submissions.filter((item) => item.roundId === roundId);
    roundImages.forEach((item) => { item.active = false; });
    await deleteStoredImages(roundImages); await persist(); broadcastRefresh('submissions');
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/release-update') {
    const { user } = requireAdmin(req);
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    db.settings.releasePublishedAt = new Date().toISOString();
    db.settings.releasePublishedBy = user.displayName;
    await persist();
    broadcastRefresh('site-update');
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/announcement') {
    const { user } = requireAdmin(req); const body = await readJson(req);
    const title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    const message = String(body.message || '').trim().replace(/\r\n/g, '\n').slice(0, 700);
    if (title.length < 3 || message.length < 3) throw new HttpError(400, 'Informe um título e uma mensagem para publicar o aviso.');
    db.settings.announcement = { id: randomUUID(), title, message, createdAt: new Date().toISOString(), createdBy: user.displayName, seenUserIds: [] };
    await persist(); broadcastRefresh('announcement'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && route === '/api/admin/announcement') {
    const { user } = requireAdmin(req); db.settings.announcement = null;
    await persist(); broadcastRefresh('announcement'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/announcement/seen') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const announcement = db.settings.announcement;
    if (announcement && announcement.id === body.id && !announcement.seenUserIds.includes(user.id)) announcement.seenUserIds.push(user.id);
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/clear-history') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Aguarde o sorteio ao vivo terminar antes de limpar o histórico.');
    const historyImages = [...db.submissions];
    db.submissions = [];
    db.assignments = [];
    db.draws = [];
    db.votings = [];
    db.scores = {};
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    await deleteStoredImages(historyImages);
    await persist();
    broadcastLive('reset', { serverTime: Date.now() });
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/clear-lies') {
    const { user } = requireAdmin(req);
    db.lieAccusations = [];
    await persist();
    broadcastRefresh('lie-meter');
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/reset-my-purchases') {
    const { user } = requireAdmin(req);
    const ownPurchases = db.economy.purchases.filter((item) => item.userId === user.id);
    const refundedCredits = ownPurchases.reduce((total, item) => total + Math.max(0, Number(item.price || 0)), 0);
    const purchaseIds = new Set(ownPurchases.map((item) => item.id));
    const before = walletFor(user.id);
    db.economy.purchases = db.economy.purchases.filter((item) => item.userId !== user.id);
    db.economy.freeShopUses = db.economy.freeShopUses.filter((userId) => userId !== user.id);
    db.economy.powerUses = db.economy.powerUses.filter((item) => item.userId !== user.id && !purchaseIds.has(item.purchaseId));
    db.economy.shields = db.economy.shields.filter((item) => item.userId !== user.id);
    db.economy.authorReveals = db.economy.authorReveals.filter((item) => item.userId !== user.id);
    db.economy.mysteryBoxes = db.economy.mysteryBoxes.filter((item) => item.userId !== user.id || item.source === 'casino');
    if (db.economy.forcedGay?.userId === user.id) db.economy.forcedGay = null;
    if (db.economy.forcedTheme?.userId === user.id) db.economy.forcedTheme = null;
    delete db.economy.equipped[user.id];
    db.economy.wallets[user.id] = before + refundedCredits;
    db.economy.creditAdjustments.push({ id: randomUUID(), adminId: user.id, adminName: user.displayName, userId: user.id, mode: 'test-purchase-refund', amount: refundedCredits, before, after: before + refundedCredits, reason: 'Reset das compras de teste', createdAt: new Date().toISOString() });
    await persist();
    broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user), refundedCredits, removedPurchases: ownPurchases.length }); return;
  }

  if (req.method === 'POST' && route === '/api/admin/reset-tests') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Aguarde o sorteio ao vivo terminar antes de limpar os testes.');
    const testImages = [...db.submissions, ...db.dailyMemes];
    db.users = db.users.filter((item) => item.id === user.id);
    Object.assign(user, { role: 'admin', active: true, eligible: true, mustChangePassword: false });
    db.submissions = [];
    db.assignments = [];
    db.draws = [];
    db.votings = [];
    db.scores = {};
    db.feedbackMessages = [];
    db.dailyMemes = [];
    db.dailyPhrases = [];
    db.anonymousPosts = [];
    db.lieAccusations = [];
    db.waterEntries = [];
    db.rememberTokens = db.rememberTokens.filter((item) => item.userId === user.id);
    db.economy.wallets = { [user.id]: walletFor(user.id) };
    db.economy.equipped = { [user.id]: cosmeticsFor(user.id) };
    db.economy.waterRewardDays = db.economy.waterRewardDays.filter((key) => key.startsWith(user.id + ':'));
    db.economy.purchases = db.economy.purchases.filter((item) => item.userId === user.id);
    db.economy.freeShopUses = db.economy.freeShopUses.filter((userId) => userId === user.id);
    db.economy.powerUses = db.economy.powerUses.filter((item) => item.userId === user.id);
    db.economy.shields = db.economy.shields.filter((item) => item.userId === user.id);
    db.economy.authorReveals = db.economy.authorReveals.filter((item) => item.userId === user.id);
    db.economy.mysteryBoxes = db.economy.mysteryBoxes.filter((item) => item.userId === user.id);
    db.economy.casinoPlays = db.economy.casinoPlays.filter((item) => item.userId === user.id);
    db.economy.casinoAccounts = Object.fromEntries(Object.entries(db.economy.casinoAccounts).filter(([userId]) => userId === user.id));
    db.economy.creditAdjustments = db.economy.creditAdjustments.filter((item) => item.userId === user.id);
    db.economy.forcedCursors = [];
    db.economy.activityTotals = { [user.id]: db.economy.activityTotals[user.id] || {} };
    db.economy.missionProgress = Object.fromEntries(Object.entries(db.economy.missionProgress).filter(([key]) => key.startsWith(user.id + ':')));
    db.economy.missionRewards = db.economy.missionRewards.filter((key) => key.startsWith(user.id + ':'));
    db.economy.dailyMissionRewards = db.economy.dailyMissionRewards.filter((key) => key.startsWith(user.id + ':'));
    db.economy.cleanNameRewards = db.economy.cleanNameRewards.filter((key) => key.startsWith(user.id + ':'));
    db.economy.forcedGay = db.economy.forcedGay?.userId === user.id ? db.economy.forcedGay : null;
    db.economy.forcedTheme = db.economy.forcedTheme?.userId === user.id ? db.economy.forcedTheme : null;
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    await deleteStoredImages(testImages);
    for (const [token, session] of sessions) if (session.userId !== user.id) sessions.delete(token);
    await persist();
    broadcastLive('reset', { serverTime: Date.now() });
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/round/clear') {
    const { user } = requireAdmin(req);
    const roundId = db.settings.currentRoundId;
    const voting = currentVoting();
    if (!voting || voting.status !== 'closed') throw new HttpError(409, 'Conclua a votação antes de limpar a rodada.');
    if (!db.draws.some((item) => item.type === 'gay' && item.roundId === roundId)) {
      throw new HttpError(409, 'Baixe a imagem do Gay da Rodada antes de encerrar.');
    }
    const roundImages = db.submissions.filter((item) => item.roundId === roundId);
    roundImages.forEach((item) => { item.active = false; });
    await deleteStoredImages(roundImages);
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    db.economy.forcedCursors = db.economy.forcedCursors.filter((item) => item.roundId !== roundId);
    await persist(); broadcastRefresh('round-cleared');
    json(res, 200, { ...stateFor(user), storageCleanup: { deletedWallpapers: roundImages.length } }); return;
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml; charset=utf-8', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

async function serveFile(req, res, filename, cache = false) {
  const body = await fs.readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  const isAudio = extension === '.mp3';
  const headers = {
    'Content-Type': mime[extension] || 'application/octet-stream',
    'Cache-Control': isAudio ? 'public, max-age=3600' : cache ? 'private, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  if (isAudio) headers['Accept-Ranges'] = 'bytes';
  const range = isAudio ? String(req.headers.range || '') : '';
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    let start = match[1] ? Number(match[1]) : null;
    let end = match[2] ? Number(match[2]) : null;
    if (start === null && end !== null) { start = Math.max(0, body.length - end); end = body.length - 1; }
    else { start = start ?? 0; end = Math.min(end ?? body.length - 1, body.length - 1); }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= body.length) {
      res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + body.length }); res.end(); return;
    }
    const chunk = body.subarray(start, end + 1);
    res.writeHead(206, { ...headers, 'Content-Length': chunk.length, 'Content-Range': 'bytes ' + start + '-' + end + '/' + body.length });
    res.end(chunk); return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(body);
}

async function serveMemoryImage(res, filename, downloadName = null) {
  let image = imageStore.get(filename);
  if (!image) {
    const object = await runtimeEnv.MEDIA.getWithMetadata(filename, 'arrayBuffer');
    if (!object?.value) throw new HttpError(404, 'Esta imagem já foi removida para economizar espaço.');
    image = {
      buffer: Buffer.from(object.value),
      mimeType: object.metadata?.contentType || 'application/octet-stream',
    };
    cacheImage(filename, image);
  }
  const headers = {
    'Content-Type': image.mimeType, 'Content-Length': image.buffer.length,
    'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
  };
  if (downloadName) headers['Content-Disposition'] = 'attachment; filename="' + downloadName.replace(/[^a-zA-Z0-9._-]/g, '-') + '"';
  res.writeHead(200, headers);
  res.end(image.buffer);
}

function canViewSubmission(user, submission) {
  if (!submission || !user) return false;
  if (submission.userId === user.id) return true;
  if (submission.roundId === db.settings.currentRoundId && (user.role === 'admin' || eligibleUsers().some((person) => person.id === user.id))) return true;
  if (db.assignments.some((item) => item.roundId === submission.roundId && item.submissionId === submission.id && item.userId === user.id && item.revealed)) return true;
  const voting = [...db.votings].reverse().find((item) => item.roundId === submission.roundId && item.submissionIds.includes(submission.id));
  if (!voting) return false;
  return voting.status === 'closed' || (voting.status === 'open' && voting.requiredVoterIds.includes(user.id));
}

export async function requestHandler(req, res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (!GATE_DISABLED && req.method === 'POST' && url.pathname === '/api/gate') {
      const key = rateLimit(req);
      const body = await readJson(req);
      const received = Buffer.from(createHash('sha256').update(db.settings.gateSeed + ':' + String(body.code || '')).digest('hex'), 'utf8');
      const expected = Buffer.from(db.settings.gateCodeHash, 'utf8');
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new HttpError(404, 'Arquivo não encontrado.');
      attempts.delete(key);
      const token = randomBytes(32).toString('hex');
      const now = Date.now();
      db.gateAuthorizations = db.gateAuthorizations.filter((item) => item.expiresAt > now);
      db.gateAuthorizations.push({ id: randomUUID(), tokenHash: createHash('sha256').update(token).digest('hex'), createdAt: new Date(now).toISOString(), expiresAt: now + GATE_TTL * 1000, userAgent: String(req.headers['user-agent'] || 'Navegador desconhecido').slice(0, 180), ip: String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') });
      await persist();
      json(res, 200, { ok: true }, { 'Set-Cookie': 'area51_gate=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + GATE_TTL }); return;
    }
    if (!GATE_DISABLED && !hasGateAccess(req)) {
      if ((req.method === 'GET' || req.method === 'HEAD') && !url.pathname.startsWith('/api/')) serveGatePage(res);
      else json(res, 404, { error: 'Arquivo não encontrado.' });
      return;
    }
    if (url.pathname.startsWith('/api/')) { await handleApi(req, res, url.pathname); return; }
    if (url.pathname.startsWith('/uploads/')) {
      const { user } = requireAuth(req);
      const filename = path.basename(decodeURIComponent(url.pathname.slice(9)));
      const submission = db.submissions.find((item) => item.filename === filename && item.active);
      if (!submission || !canViewSubmission(user, submission)) throw new HttpError(403, 'Este wallpaper pertence a outra pessoa.');
      await serveMemoryImage(res, filename); return;
    }
    if (url.pathname.startsWith('/memes/')) {
      requireAuth(req);
      const filename = path.basename(decodeURIComponent(url.pathname.slice(7)));
      const meme = db.dailyMemes.find((item) => item.filename === filename);
      if (!meme) throw new HttpError(404, 'Este meme não está mais no mural.');
      await serveMemoryImage(res, filename); return;
    }
    const destination = '/index.html' + (url.search || '');
    res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
    res.end();
  } catch (error) {
    if (error.retryableConcurrency) throw error;
    if (error.code === 'ENOENT') { json(res, 404, { error: 'Arquivo não encontrado.' }); return; }
    const status = error.status || 500; if (status >= 500) console.error(error);
    json(res, status, { error: status >= 500 ? 'O servidor encontrou um problema.' : error.message });
  }
}
