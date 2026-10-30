import path from 'node:path';
import { FLIGHT_STEP_MS, flightStepMs, flightMultiplier, settleFlight } from './lib/flight-engine.mjs';
import { CARD_COLLECTIONS, CARD_PACK_RULES, albumFor, updateAlbum, awardEngagementCard, updateCardTrade, openCardPack, simulateCardPack, craftedBadgeArchiveFor } from './lib/card-album.mjs';
import { NEXT_CARD_SEASON, NEXT_CARD_COLLECTIONS, previousSeasonLiquidationPreview, liquidatePreviousCardSeason } from './lib/card-season-transition.mjs';
import { SEASON_PASS, SEASON_PASS_COSMETIC_REWARDS, awardSeasonPassXp, claimSeasonPassReward, ensureSeasonPassAccount, passIsOpen, seasonPassFor, unlockSeasonPassPremium } from './lib/season-pass.mjs';
import { seasonalChallengeProgress } from './lib/season-challenges.mjs';
import { HALLOWEEN_2026, halloween2026State, isSeasonalShopItemAvailable } from './lib/halloween-season.mjs';
import { MARKET_ASSETS, MARKET_UPDATE_TIMES, ensureMarketState, advanceMarket, marketForUser, marketHoldingsValueForUser, transactMarket } from './lib/investment-market.mjs';
import { CRYPTO_ASSETS, CRYPTO_REFRESH_MS, readCryptoSources, ensureCryptoMarketState, syncCryptoMarket, cryptoMarketForUser, cryptoHoldingsValueForUser, transactCryptoMarket } from './lib/crypto-market.mjs';
import { ROULETTE_BOX_MIN_BET, ROULETTE_MIN_BET, rouletteBoxChance } from './lib/roulette-economy.mjs';
import { casinoPlayStatePatch } from './lib/casino-state-patch.mjs';
import COBBLEMON_CATALOG from './lib/cobblemon-catalog.mjs';
import { cobblemonDeliveryMinimumLevel, cobblemonDeliverySpec, rollCobblemonDeliveryGender } from './lib/cobblemon-delivery-metadata.mjs';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

// Exclusivo de desenvolvimento local: permite avaliar o evento antes de outubro.
// O Worker não recebe esta variável, então a produção sempre usa a data real.
const HALLOWEEN_LOCAL_PREVIEW = process.env.AREA51_HALLOWEEN_PREVIEW === 'true';
// Equivalente à prévia de Halloween: permite testar a virada das cartas no
// localhost antes da data, sem abrir a temporada no Worker de produção.
const CARD_SEASON_LOCAL_PREVIEW = process.env.AREA51_CARD_SEASON_PREVIEW === 'true';
const currentHalloweenEvent = (localPreview = false) => (HALLOWEEN_LOCAL_PREVIEW || localPreview) ? { ...HALLOWEEN_2026, active: true, preview: true } : halloween2026State();
const isHalloweenShopAvailable = (item, localPreview = false) => HALLOWEEN_LOCAL_PREVIEW || localPreview || isSeasonalShopItemAvailable(item);
const isShopItemAvailable = (item, localPreview = false, now = new Date()) => isHalloweenShopAvailable(item, localPreview)
  && (!item.cursePowerV2 || Boolean(db?.settings?.cursePowersReleasedAt))
  && (!item.availableFrom || CARD_SEASON_LOCAL_PREVIEW || now.getTime() >= Date.parse(item.availableFrom))
  && (!item.availableUntil || now.getTime() < Date.parse(item.availableUntil));
const seasonalAlbumOptions = (localPreview = false) => {
  const event = currentHalloweenEvent(localPreview);
  return { activeSeasonalEvents: event ? [event.id] : [], nextCardSeasonPreview: CARD_SEASON_LOCAL_PREVIEW };
};
const engagementCardOptions = () => ({ nextCardSeasonPreview: CARD_SEASON_LOCAL_PREVIEW });
// A prévia só existe no localhost. Em produção, mesmo que alguém tente
// reproduzir a URL ou o cabeçalho, o host não passa nesta verificação e a
// data real continua mandando no evento.
function localHalloweenPreviewRequest(req) {
  const host = String(req?.headers?.host || '').toLowerCase().split(':')[0];
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

const SESSION_TTL = 12 * 60 * 60 * 1000;
const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000;
const GATE_TTL = 30 * 24 * 60 * 60;
const GATE_CODE = String(process.env.AREA51_GATE_CODE || '51');
// O antigo portão por código não faz mais parte do acesso da Área 51.
// A autenticação normal de cada conta é a única entrada ativa.
const GATE_DISABLED = true;
const sessions = new Map();
const attempts = new Map();
const feedbackPostTimes = new Map();
const memePostTimes = new Map();
const anonymousPostTimes = new Map();
const imageStore = new Map();
const wallpaperUploadsInFlight = new Set();
const MAX_IMAGE_MEMORY = 200 * 1024 * 1024;
const MAX_IMAGE_CACHE = 16 * 1024 * 1024;
const WALL_EMOJIS = ['😂','👽','🤨','💀','❤️','👍','🔥','👏','😮','😢','😡','🤣','😍','😎','🤯','🤔','🥳','🤡','🙌','🚀'];
const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const LIVE_DRAW_DURATION = Math.max(80, Number(process.env.LIVE_DRAW_DURATION || 5900));
const MUSIC_EPOCH = Date.now();
const MUSIC_LOOP_MS = 8000;
// Uma votação pode ser ignorada por alguns minutos para a pessoa terminar a
// ação atual. Depois disso, votar vira uma etapa obrigatória antes de usar o
// restante do portal; a própria rota de voto continua liberada para não criar
// um bloqueio impossível de resolver.
const LIE_VOTE_GRACE_MS = 10 * 60 * 1000;
const liveClients = new Map();
let sharedOnlinePeople = [];
// O portal reduz a sincronização para uma vez por minuto quando a pessoa está
// apenas lendo a página. Com uma janela de 60 s, uma única variação normal de
// rede fazia a sessão expirar antes do próximo pulso e o cabeçalho exibia só
// "Você". Três minutos continuam representando uma sessão recente, mas
// acomodam o polling econômico do plano gratuito e abas momentaneamente em
// segundo plano sem criar novas consultas.
const PRESENCE_TTL = 3 * 60 * 1000;

function presencePeople(rows, users, now = Date.now()) {
  const ids = new Set(rows.filter((row) => Number(row.last_seen) > now - PRESENCE_TTL).map((row) => row.user_id));
  return users.filter((user) => user.active && ids.has(user.id)).map((user) => ({ id: user.id, displayName: user.displayName }));
}

// A leitura de quem está online continua frequente. Já a gravação do mesmo
// pulso não precisa acontecer em toda sincronização: um pulso por minuto,
// dentro da janela de três minutos, preserva a lista e reduz gravações
// repetidas em dias cheios.
const PRESENCE_WRITE_INTERVAL = 60000;
const PRESENCE_REFRESH_INTERVAL = 15000;
const PRESENCE_CLEANUP_INTERVAL = 10 * 60 * 1000;
const presenceHeartbeatAt = new Map();
let presenceSnapshotAt = 0;
let presenceCleanupAt = 0;

async function heartbeatPresence(auth) {
  const now = Date.now();
  const sessionKey = createHash('sha256').update(auth.token).digest('hex');
  const shouldWrite = now - Number(presenceHeartbeatAt.get(sessionKey) || 0) >= PRESENCE_WRITE_INTERVAL;
  const shouldRefresh = !sharedOnlinePeople.length || now - presenceSnapshotAt >= PRESENCE_REFRESH_INTERVAL;
  const shouldCleanup = now - presenceCleanupAt >= PRESENCE_CLEANUP_INTERVAL;
  const statements = [];
  let presenceResultIndex = -1;
  if (shouldCleanup) {
    statements.push(runtimeEnv.DB.prepare('DELETE FROM online_presence WHERE last_seen <= ?').bind(now - 60 * 60 * 1000));
  }
  if (shouldWrite) {
    statements.push(runtimeEnv.DB.prepare('INSERT INTO online_presence(session_key,user_id,last_seen) VALUES(?,?,?) ON CONFLICT(session_key) DO UPDATE SET last_seen=excluded.last_seen').bind(sessionKey, auth.user.id, now));
  }
  if (shouldRefresh) {
    presenceResultIndex = statements.length;
    statements.push(runtimeEnv.DB.prepare('SELECT user_id,last_seen FROM online_presence WHERE last_seen > ?').bind(now - PRESENCE_TTL));
  }
  if (statements.length) {
    const results = await runtimeEnv.DB.batch(statements);
    if (shouldCleanup) presenceCleanupAt = now;
    if (shouldWrite) presenceHeartbeatAt.set(sessionKey, now);
    if (presenceResultIndex >= 0) {
      sharedOnlinePeople = presencePeople(results[presenceResultIndex].results || [], db.users, now);
      presenceSnapshotAt = now;
    }
  }
  if (presenceHeartbeatAt.size > 256) {
    for (const [key, lastSeen] of presenceHeartbeatAt) {
      if (now - lastSeen > 2 * PRESENCE_TTL) presenceHeartbeatAt.delete(key);
    }
  }
  return sharedOnlinePeople;
}
let liveDraw = null;
let liveDrawCleanup = null;
let db;
let saveQueue = Promise.resolve();
let runtimeEnv = null;
let stateRevision = 0;
let lastStateRefreshAt = 0;
let databaseReady = false;
let databaseBytes = 0;
// A montagem do payload público percorre várias coleções do estado. Como a
// revisão só muda após uma gravação, reaproveitamos respostas idênticas por
// um instante quando várias abas fazem a mesma leitura em sequência.
const stateResponseCache = new Map();
function invalidateStateResponseCache() { stateResponseCache.clear(); }
// Respostas completas são caras para montar e serializar. Reaproveitamos o
// JSON pronto enquanto a revisão não mudou, sem deixar dados de uma alteração
// anterior escaparem para o cliente.
const serializedJsonCache = new WeakMap();
const STATE_RESPONSE_CACHE_MS = 5000;
// Full per-user states can be expensive to retain in the small backend VM.
// Four hot responses still cover rapid polling while avoiding a cache full of
// large, user-specific snapshots.
const STATE_RESPONSE_CACHE_MAX = 4;
// A mesma instância recebe o boot, o polling e leituras da tela em sequência.
// Consultar a revisão no D1 a cada uma dessas requisições não traz informação
// nova e aumenta a pressão no Worker. Uma janela curta mantém a sincronização
// entre instâncias e ainda deixa as gravações protegidas pelo CAS em persist().
const STATE_REFRESH_INTERVAL_MS = 1000;
// Mantemos somente a janela da loteria no estado que cada sessão desserializa.
// O histórico anterior é preservado no D1, mas não precisa viajar em toda
// abertura do portal nem participar do cálculo da rodada corrente.
const CASINO_ARCHIVE_BATCH_SIZE = 100;
const DEFAULT_FEATURE_FLAGS = Object.freeze({ casino: true, impostor: true, mystery: true, shop: true, uploads: true });
function featureFlags() {
  return { ...DEFAULT_FEATURE_FLAGS, ...db?.settings?.featureFlags };
}

function requireFeature(feature) {
  if (featureFlags()[feature] === false) throw new HttpError(423, 'Este recurso está temporariamente pausado pelo administrador.');
}

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
  databaseBytes = Buffer.byteLength(snapshot);
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
        invalidateStateResponseCache();
      }
      throw new HttpError(409, 'Outra pessoa atualizou o site ao mesmo tempo. Tente sua ação novamente.', { retryableConcurrency: true });
    }
    stateRevision = nextRevision;
    lastStateRefreshAt = Date.now();
    invalidateStateResponseCache();
  });
  return saveQueue.catch((error) => {
    // The database may have committed even when its response was lost.
    // Force a full reload before any subsequent request uses the in-memory state.
    stateRevision = -1;
    lastStateRefreshAt = 0;
    throw error;
  });
}

function persistCasinoPlay(userId, play, adjustment, inventoryItem, jackpot) {
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const expectedRevision = stateRevision;
    const patch = casinoPlayStatePatch({
      userId, play, account: db.economy.casinoAccounts[userId],
      wallet: play.walletSource === 'shop' ? db.economy.wallets[userId] : undefined,
      adjustment, inventoryItem, jackpot, revision: expectedRevision, updatedAt: new Date().toISOString(),
    });
    const result = await runtimeEnv.DB.prepare(patch.sql).bind(...patch.values).run();
    if (Number(result.meta?.changes || 0) !== 1) {
      const stored = await runtimeEnv.DB.prepare('SELECT data, revision FROM app_state WHERE id = 1').first();
      if (stored?.data) {
        db = JSON.parse(String(stored.data));
        stateRevision = Number(stored.revision || expectedRevision);
        liveDraw = db.settings?.liveDraw?.endsAt > Date.now() ? db.settings.liveDraw : null;
        invalidateStateResponseCache();
      }
      throw new HttpError(409, 'Outra pessoa atualizou o site ao mesmo tempo. Tente sua ação novamente.', { retryableConcurrency: true });
    }
    stateRevision = expectedRevision + 1;
    lastStateRefreshAt = Date.now();
    invalidateStateResponseCache();
  });
  return saveQueue.catch((error) => {
    stateRevision = -1;
    lastStateRefreshAt = 0;
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
  await runtimeEnv.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_play_archive (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    wallet_source TEXT,
    payload TEXT NOT NULL
  )`).run();
  await runtimeEnv.DB.prepare('CREATE INDEX IF NOT EXISTS idx_casino_play_archive_user_created ON casino_play_archive(user_id, created_at)').run();
  await runtimeEnv.DB.prepare("CREATE INDEX IF NOT EXISTS idx_casino_play_archive_request ON casino_play_archive(user_id, json_extract(payload, '$.requestId'))").run();
  await runtimeEnv.DB.prepare('INSERT OR IGNORE INTO app_state (id, data, revision, updated_at) VALUES (1, ?, 1, ?)')
    .bind(JSON.stringify(seedDatabase), new Date().toISOString()).run();
  const stored = await runtimeEnv.DB.prepare('SELECT data, revision FROM app_state WHERE id = 1').first();
  if (!stored?.data) throw new Error('O banco online não pôde ser inicializado.');
  db = JSON.parse(String(stored.data));
  databaseBytes = Buffer.byteLength(String(stored.data));
  stateRevision = Number(stored.revision || 1);
  lastStateRefreshAt = Date.now();
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
  if (!Array.isArray(db.communityVotes)) { db.communityVotes = []; changed = true; }
  if (!Array.isArray(db.profileComments)) { db.profileComments = []; changed = true; }
  if (!Array.isArray(db.impostorGames)) { db.impostorGames = []; changed = true; }
  const completedFeedback = {
    '7efd7717-d8b0-41a6-92f9-b54d339860a2': 'Concluído: a última mentira ganhou destaque visual no ranking.',
    'c3cd017c-0471-490e-9438-e6c7fffcfd85': 'Concluído: cada participante agora possui histórico expansível com os motivos confirmados.',
    'cbdaa18d-a42a-407a-ada2-b79e24b87290': 'Concluído: as caixas misteriosas agora abrem com carrossel animado de prêmios.',
    '9d39125f-270c-49fb-ac44-7072d9f0888d': 'Concluído: o cassino ganhou 250 créditos promocionais diários; ao alcançar 500, todo o saldo promocional pode ser transferido para a loja.',
    'c6efcd23-6257-41ae-bc7d-420b35126dc5': 'Concluído: o Álbum agora tem mural público de trocas; publique uma repetida, receba ofertas e escolha qual aceitar.',
    '3f758671-7bb6-401c-9fe6-f44f3db70c8c': 'Concluído: três coleções novas entraram nos pacotes e a montagem exibe o tier Bronze, Prata, Ouro ou Diamante.',
    '5c7e94b3-a9d2-4ec9-b9b4-3918bd2c2265': 'Concluído: a insígnia do Álbum não substitui o emblema comprado; os dois ficam ativos juntos.',
    'bd7f3f79-3328-4a92-b1da-50a03f9ff8d0': 'Concluído: os votos do Mentirômetro agora usam os rótulos Mentiu e Não mentiu em toda a votação e no histórico.',
    'b20729dc-32ac-4ca4-b85a-4ae40d5ff6de': 'Concluído: a votação de mentira agora oferece Mentiu forte. Quando essa opção recebe a maioria absoluta, a marcação vale dois pontos; as demais confirmações continuam valendo um.',
    '1b9549d0-27db-4243-8035-3f8356628e23': 'Concluído: a temporada atual recebeu nome, período e contagem regressiva; a troca para a próxima temporada ficou automática.',
    '73beebc7-87dc-4fb8-89ba-2131f1c6998b': 'Concluído: o mural de cartas agora aceita ofertas em créditos, com reserva de saldo e transferência segura ao aceitar.',
    '0ee51576-6d43-45d5-a861-b18fd80feb59': 'Concluído: a foto do próprio usuário agora aparece corretamente em suas publicações do mural.',
    '2d20ed5b-9e09-4402-8100-a502acd04eaa': 'Concluído: o calendário da rodada agora trabalha apenas com datas, sem exigir ou exibir horário.',
    '5be10c8a-dc45-4a66-9686-253e4f03dcd7': 'Concluído: o tema Cobblemon ganhou fundo pixelado leve, sem imagem realista, e todas as áreas de conteúdo ficaram opacas para manter a leitura.',
    'adc4ea6e-63f0-4ab3-8f1d-b36f6049e269': 'Concluído: após 10 minutos, o voto da mentira pendente fica obrigatório; a rota de votação permanece liberada para não travar a resolução. Também corrigido o avanço entre várias pendências sem bloquear o próximo botão.',
    '8a4eaf96-ee68-4d7f-bb07-861553e0b28e': 'Concluído: a mesma pessoa pode receber várias marcações diferentes em andamento; somente o reenvio idêntico acidental em até 30 segundos é bloqueado.',
    'efd957ab-580a-47ad-8923-ebadc58ec793': 'Concluído: a maioria dos votos recebidos encerra a votação assim que mais da metade da equipe já participou; o estado é recalculado no voto, na sincronização e ao abrir o portal.',
    'c0efa151-2f8c-4b7b-ab65-cae004ca7fd6': 'Concluído: o histórico coletivo agora lista quem aprovou a mentira, com nome e foto quando disponíveis, em vez de mostrar “Não registrado”.',
    'e6381aa9-2539-4f96-8119-dd7b2c5910a6': 'Concluído: o Livro de cotações agora filtra uma moeda específica, e o gráfico ganhou seleção de moeda, resumo da variação e períodos maiores para leitura mais clara.',
    '8419bab5-53cf-4dd9-8d8f-d18403a2d311': 'Concluído: a nova área Votações 51 permite que qualquer participante proponha pautas, com voto único A favor/Contra, participantes visíveis e administração apenas para encerrar ou arquivar.',
  };
  db.feedbackMessages.forEach((item) => {
    if (completedFeedback[item.id] && (item.status !== 'done' || item.adminComment !== completedFeedback[item.id])) { item.status = 'done'; item.adminComment = completedFeedback[item.id]; item.updatedAt = new Date().toISOString(); changed = true; }
  });
  if (!Array.isArray(db.dailyMemes)) { db.dailyMemes = []; changed = true; }
  if (!Array.isArray(db.dailyPhrases)) { db.dailyPhrases = []; changed = true; }
  if (!Array.isArray(db.dailyReactions)) { db.dailyReactions = []; changed = true; }
  if (!Array.isArray(db.dailyWallHistory)) { db.dailyWallHistory = []; changed = true; }
  if (!db.settings.dailyWallMentionsV1) {
    db.dailyPhrases.forEach((post) => { updatePostMentions(post); (post.comments || []).forEach((comment) => updateCommentMentions(comment)); });
    db.dailyMemes.forEach((post) => { updatePostMentions(post); (post.comments || []).forEach((comment) => updateCommentMentions(comment)); });
    db.settings.dailyWallMentionsV1 = new Date().toISOString();
    changed = true;
  }
  if (!Array.isArray(db.anonymousPosts)) { db.anonymousPosts = []; changed = true; }
  if (!Array.isArray(db.waterEntries)) { db.waterEntries = []; changed = true; }
  if (!Array.isArray(db.rememberTokens)) { db.rememberTokens = []; changed = true; }
  if (!Array.isArray(db.lieAccusations)) { db.lieAccusations = []; changed = true; }
  if (sanitizePendingLieVoters()) changed = true;
  if (!Array.isArray(db.lieDisputes)) { db.lieDisputes = []; changed = true; }
  if (!Array.isArray(db.mysteries)) { db.mysteries = []; changed = true; }
  if (!Array.isArray(db.gateAuthorizations)) { db.gateAuthorizations = []; changed = true; }
  if (!db.economy || typeof db.economy !== 'object') { db.economy = {}; changed = true; }
  if (!db.economy.wallets || typeof db.economy.wallets !== 'object') { db.economy.wallets = {}; changed = true; }
  Object.entries(db.economy.wallets).forEach(([userId, value]) => {
    const normalized = roundMoney(value);
    if (db.economy.wallets[userId] !== normalized) { db.economy.wallets[userId] = normalized; changed = true; }
  });
  if (!Array.isArray(db.economy.waterRewardDays)) { db.economy.waterRewardDays = []; changed = true; }
  if (!Array.isArray(db.economy.dailyDutyPosts)) { db.economy.dailyDutyPosts = []; changed = true; }
  if (!Array.isArray(db.economy.dailyDutyPenaltyClears)) { db.economy.dailyDutyPenaltyClears = []; changed = true; }
  if (!Array.isArray(db.economy.dailyDutyBasketCollections)) { db.economy.dailyDutyBasketCollections = []; changed = true; }
  if (!db.settings.dailyDutyBasketActivatedAt) { db.settings.dailyDutyBasketActivatedAt = new Date().toISOString(); changed = true; }
  const basketRetentionCutoff = saoPauloDayKey(new Date(Date.now() - 90 * 86400000));
  const retainedBasketCollections = db.economy.dailyDutyBasketCollections.filter((entry) => String(entry.dayKey || '') >= basketRetentionCutoff);
  if (retainedBasketCollections.length !== db.economy.dailyDutyBasketCollections.length) { db.economy.dailyDutyBasketCollections = retainedBasketCollections; changed = true; }
  if (!db.settings.dailyDutyPostBackfill20261028) {
    const existingPosts = [...db.dailyPhrases, ...db.dailyMemes, ...db.dailyWallHistory.flatMap((archive) => [...(archive.phrases || []), ...(archive.memes || [])])];
    for (const post of existingPosts) {
      const dayKey = dayKeyForTimestamp(post.createdAt);
      if (dayKey !== DAILY_DUTY_FIRST_DAY || !post.userId || db.economy.dailyDutyPosts.some((entry) => entry.userId === post.userId && entry.dayKey === dayKey)) continue;
      db.economy.dailyDutyPosts.push({ userId: post.userId, dayKey });
      changed = true;
    }
    db.settings.dailyDutyPostBackfill20261028 = true;
    changed = true;
  }
  if (!Array.isArray(db.economy.purchases)) { db.economy.purchases = []; changed = true; }
  if (!Array.isArray(db.economy.freeShopUses)) { db.economy.freeShopUses = []; changed = true; }
  if (!db.economy.equipped || typeof db.economy.equipped !== 'object') { db.economy.equipped = {}; changed = true; }
  if (!db.economy.missionProgress || typeof db.economy.missionProgress !== 'object') { db.economy.missionProgress = {}; changed = true; }
  if (!Array.isArray(db.economy.missionRewards)) { db.economy.missionRewards = []; changed = true; }
  if (!Array.isArray(db.economy.dailyMissionRewards)) { db.economy.dailyMissionRewards = []; changed = true; }
  if (!db.economy.seasonPass || typeof db.economy.seasonPass !== 'object') { db.economy.seasonPass = {}; changed = true; }
  if (!Array.isArray(db.economy.seasonPassInventory)) { db.economy.seasonPassInventory = []; changed = true; }
  if (!Array.isArray(db.economy.cleanNameRewards)) { db.economy.cleanNameRewards = []; changed = true; }
  if (!Array.isArray(db.economy.teamMissionRewards)) { db.economy.teamMissionRewards = []; changed = true; }
  if (!Array.isArray(db.economy.seasonChallengeRewards)) { db.economy.seasonChallengeRewards = []; changed = true; }
  // Registro separado e persistente: impede que o campeão receba duas vezes
  // caso a primeira requisição do mês seja repetida ou a página seja recarregada.
  if (!Array.isArray(db.economy.seasonChampionRewards)) { db.economy.seasonChampionRewards = []; changed = true; }
  // O placar do mês fechado não pode variar se um dado antigo for corrigido
  // depois. Este retrato também é a fonte da conquista de campeão.
  if (!Array.isArray(db.economy.seasonChampionSnapshots)) { db.economy.seasonChampionSnapshots = []; changed = true; }
  if (!Array.isArray(db.economy.gifts)) { db.economy.gifts = []; changed = true; }
  if (!db.economy.activityTotals || typeof db.economy.activityTotals !== 'object') { db.economy.activityTotals = {}; changed = true; }
  if (!Array.isArray(db.economy.powerUses)) { db.economy.powerUses = []; changed = true; }
  if (!Array.isArray(db.economy.powerAnnouncements)) { db.economy.powerAnnouncements = []; changed = true; }
  if (!Array.isArray(db.economy.shields)) { db.economy.shields = []; changed = true; }
  if (!Array.isArray(db.economy.authorReveals)) { db.economy.authorReveals = []; changed = true; }
  if (!Array.isArray(db.economy.creditAdjustments)) { db.economy.creditAdjustments = []; changed = true; }
  if (!Array.isArray(db.economy.bulkCreditGrants)) { db.economy.bulkCreditGrants = []; changed = true; }
  if (!Array.isArray(db.economy.casinoBulkBonusGrants)) { db.economy.casinoBulkBonusGrants = []; changed = true; }
  if (!Array.isArray(db.economy.dailyIncomeClaims)) { db.economy.dailyIncomeClaims = []; changed = true; }
  if (!Array.isArray(db.economy.cryptoDailyIncomeClaims)) { db.economy.cryptoDailyIncomeClaims = []; changed = true; }
  if (!Array.isArray(db.economy.marketMissionClaims)) { db.economy.marketMissionClaims = []; changed = true; }
  if (!db.economy.investmentMarket || typeof db.economy.investmentMarket !== 'object') { ensureMarketState(db.economy); changed = true; }
  if (!db.economy.cryptoMarket || typeof db.economy.cryptoMarket !== 'object') { ensureCryptoMarketState(db.economy); changed = true; }
  ensureMarketState(db.economy);
  if (!Array.isArray(db.economy.forcedCursors)) { db.economy.forcedCursors = []; changed = true; }
  if (!Array.isArray(db.economy.wallpaperDeadlinePenalties)) { db.economy.wallpaperDeadlinePenalties = []; changed = true; }
  if (!db.economy.wallpaperMissStreaks || typeof db.economy.wallpaperMissStreaks !== 'object') { db.economy.wallpaperMissStreaks = {}; changed = true; }
  // A partir desta regra, toda maldição enviada dura 24 horas. Complete os
  // registros antigos da Seta Gay para que nenhuma sessão ativa fique presa ao
  // prazo anterior da rodada.
  if (!db.economy.forceGayCursor24HoursV1) {
    const gayExpiryByCreatedAt = new Map();
    db.economy.forcedCursors.forEach((cursor) => {
      if (cursor.style !== 'gay' || cursor.expiresAt) return;
      cursor.expiresAt = new Date(Date.parse(cursor.createdAt) + 86400000).toISOString();
      gayExpiryByCreatedAt.set(cursor.createdAt, cursor.expiresAt);
      changed = true;
    });
    db.economy.powerAnnouncements.forEach((announcement) => {
      if (announcement.itemId !== 'power-force-gay-cursor' || announcement.expiresAt) return;
      const expiresAt = gayExpiryByCreatedAt.get(announcement.createdAt);
      if (expiresAt) { announcement.expiresAt = expiresAt; announcement.secretTargetedCurse = true; changed = true; }
    });
    db.economy.forceGayCursor24HoursV1 = true;
    changed = true;
  }
  if (!Array.isArray(db.economy.casinoPlays)) { db.economy.casinoPlays = []; changed = true; }
  if (!db.economy.casinoArchiveSummary || typeof db.economy.casinoArchiveSummary !== 'object') {
    db.economy.casinoArchiveSummary = { totalPlays: 0, shopWagered: 0 };
    changed = true;
  }
  if (!db.economy.casinoAccounts || typeof db.economy.casinoAccounts !== 'object') { db.economy.casinoAccounts = {}; changed = true; }
  // Bônus único do primeiro dia do mês. Ele substitui o bônus diário normal
  // de 250 por 500 e continua sendo saldo promocional do Cassino: só sai para
  // a Loja depois de dobrar e alcançar 1.000. Ao criar a conta de quem ainda
  // não abriu o Cassino hoje, o presente alcança toda a equipe.
  if (!db.economy.casinoMonthStartBonusV1 && saoPauloDayKey() === CASINO_MONTH_START_BONUS_DAY) {
    const grantedAt = new Date().toISOString();
    const grantedUserIds = [];
    db.users.filter((user) => user.active && user.approved !== false).forEach((user) => {
      let account = db.economy.casinoAccounts[user.id];
      if (!account || account.dayKey !== CASINO_MONTH_START_BONUS_DAY) {
        account = { dayKey: CASINO_MONTH_START_BONUS_DAY, balance: CASINO_MONTH_START_BONUS, cashedOut: false, createdAt: grantedAt };
        db.economy.casinoAccounts[user.id] = account;
      } else account.balance = roundMoney(Number(account.balance || 0) + (CASINO_MONTH_START_BONUS - CASINO_DAILY_BONUS));
      // Quem já havia resgatado o bônus normal recebe esta promoção como uma
      // nova oportunidade, mas continua sujeito à meta promocional de hoje.
      account.cashedOut = false;
      account.monthStartBonusAt = grantedAt;
      account.monthStartBonusAmount = CASINO_MONTH_START_BONUS;
      grantedUserIds.push(user.id);
    });
    db.economy.casinoMonthStartBonusV1 = {
      dayKey: CASINO_MONTH_START_BONUS_DAY,
      amount: CASINO_MONTH_START_BONUS,
      cashoutThreshold: CASINO_MONTH_START_CASHOUT_THRESHOLD,
      grantedAt,
      grantedUserIds,
    };
    db.settings.announcement = {
      id: randomUUID(),
      title: '🍬 Gostosuras ou Travessuras',
      message: 'Presente do dia: pau de chocolate! O Cassino liberou 500 créditos promocionais para cada conta. Dobre até 1.000 para transferir o saldo à Loja 51. Amanhã o ciclo volta ao normal.',
      createdAt: grantedAt,
      createdBy: 'Área 51',
      seenUserIds: [],
    };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // A primeira liberação encontrou contas que já haviam aberto o bônus de
  // 250 antes da promoção. A intenção do presente é que cada participante
  // comece o dia com pelo menos 500 promocionais, inclusive quem já tinha
  // jogado ou resgatado. Este complemento único preserva qualquer saldo
  // maior que 500 e não roda novamente.
  if (!db.economy.casinoMonthStartBonusFloorV2 && saoPauloDayKey() === CASINO_MONTH_START_BONUS_DAY) {
    const correctedAt = new Date().toISOString();
    const toppedUpUserIds = [];
    db.users.filter((user) => user.active && user.approved !== false).forEach((user) => {
      let account = db.economy.casinoAccounts[user.id];
      if (!account || account.dayKey !== CASINO_MONTH_START_BONUS_DAY) {
        account = { dayKey: CASINO_MONTH_START_BONUS_DAY, balance: 0, cashedOut: false, createdAt: correctedAt };
        db.economy.casinoAccounts[user.id] = account;
      }
      if (Number(account.balance || 0) < CASINO_MONTH_START_BONUS) {
        account.balance = CASINO_MONTH_START_BONUS;
        toppedUpUserIds.push(user.id);
      }
      account.cashedOut = false;
    });
    db.economy.casinoMonthStartBonusFloorV2 = { dayKey: CASINO_MONTH_START_BONUS_DAY, minimumBalance: CASINO_MONTH_START_BONUS, correctedAt, toppedUpUserIds };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.economy.casinoMonthStartBonusCorrectionAnnouncementV3 && saoPauloDayKey() === CASINO_MONTH_START_BONUS_DAY) {
    const createdAt = new Date().toISOString();
    db.settings.announcement = {
      id: randomUUID(),
      title: '🍬 Gostosuras ou Travessuras — saldo confirmado',
      message: 'Pau de chocolate entregue: todas as contas estão com pelo menos 500 créditos promocionais no Cassino. A meta continua 1.000 para transferir à Loja 51. Amanhã o ciclo volta a 250 com meta 500.',
      createdAt,
      createdBy: 'Área 51',
      seenUserIds: [],
    };
    db.economy.casinoMonthStartBonusCorrectionAnnouncementV3 = { createdAt, dayKey: CASINO_MONTH_START_BONUS_DAY };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // Sextou: cada conta recebe 500 promocionais. Quem já tinha o bônus diário
  // intacto soma os dois saldos e precisa dobrar esse total; quem já apostou
  // ou resgatou mantém a própria trajetória e não recebe saldo duplicado.
  if (!db.economy.casinoFridayBonusV2 && saoPauloDayKey() === CASINO_FRIDAY_BONUS_DAY) {
    const grantedAt = new Date().toISOString();
    const grantedUserIds = []; const carriedDailyBonusUserIds = [];
    db.users.filter((user) => user.active && user.approved !== false).forEach((user) => {
      let account = db.economy.casinoAccounts[user.id];
      if (!account || account.dayKey !== CASINO_FRIDAY_BONUS_DAY) {
        account = { dayKey: CASINO_FRIDAY_BONUS_DAY, balance: CASINO_FRIDAY_EXTRA_BONUS, cashedOut: false, createdAt: grantedAt };
        db.economy.casinoAccounts[user.id] = account;
        account.cashoutThreshold = roundMoney(CASINO_FRIDAY_EXTRA_BONUS * 2);
        grantedUserIds.push(user.id);
        return;
      }
      const hasPromotionalPlay = db.economy.casinoPlays.some((play) => play.userId === user.id && play.dayKey === CASINO_FRIDAY_BONUS_DAY && play.walletSource !== 'shop');
      const dailyBonusIntact = !account.cashedOut && !hasPromotionalPlay && Number(account.balance || 0) === CASINO_DAILY_BONUS;
      if (!dailyBonusIntact) return;
      account.balance = roundMoney(Number(account.balance || 0) + CASINO_FRIDAY_EXTRA_BONUS);
      account.cashoutThreshold = roundMoney(Number(account.balance || 0) * 2);
      account.fridayBonusAt = grantedAt;
      account.fridayBonusAmount = CASINO_FRIDAY_EXTRA_BONUS;
      grantedUserIds.push(user.id);
      carriedDailyBonusUserIds.push(user.id);
    });
    db.economy.casinoFridayBonusV2 = { dayKey: CASINO_FRIDAY_BONUS_DAY, amount: CASINO_FRIDAY_EXTRA_BONUS, grantedAt, grantedUserIds, carriedDailyBonusUserIds };
    db.settings.announcement = {
      id: randomUUID(),
      title: '🎉 Bônus de Sextou liberado',
      message: 'Todos de pau duro e coração mole: o Cassino liberou 500 créditos promocionais. Quem ainda tinha os 250 diários intactos ficou com 750 e saca ao dobrar para 1.500; quem abriu depois recebe 500 e saca ao dobrar para 1.000. Amanhã volta ao normal: 250 diários e meta 500.',
      createdAt: grantedAt,
      createdBy: 'Área 51',
      seenUserIds: [],
    };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // Correção da liberação do Sextou: a promoção é saldo para toda a
  // tripulação. Algumas pessoas abriram o Cassino nos segundos anteriores à
  // inicialização e fizeram uma aposta antes de a V2 percorrer as contas.
  // Elas não podem perder os 500 por essa corrida de inicialização.
  if (!db.economy.casinoFridayBonusCorrectionV3 && saoPauloDayKey() === CASINO_FRIDAY_BONUS_DAY) {
    const grantedAt = new Date().toISOString();
    const originallyGranted = new Set(db.economy.casinoFridayBonusV2?.grantedUserIds || []);
    const correctedUserIds = [];
    db.users.filter((user) => user.active && user.approved !== false).forEach((user) => {
      if (originallyGranted.has(user.id)) return;
      let account = db.economy.casinoAccounts[user.id];
      if (!account || account.dayKey !== CASINO_FRIDAY_BONUS_DAY) {
        account = { dayKey: CASINO_FRIDAY_BONUS_DAY, balance: 0, cashedOut: false, createdAt: grantedAt };
        db.economy.casinoAccounts[user.id] = account;
      }
      account.balance = roundMoney(Number(account.balance || 0) + CASINO_FRIDAY_EXTRA_BONUS);
      // Para quem já havia usado o bônus diário, os 500 são uma nova banca do
      // Sextou: a meta é 1.000, sem apagar o saldo que sobrou da tentativa.
      account.cashoutThreshold = roundMoney(CASINO_FRIDAY_EXTRA_BONUS * 2);
      account.cashedOut = false;
      account.fridayBonusAt = grantedAt;
      account.fridayBonusAmount = CASINO_FRIDAY_EXTRA_BONUS;
      account.fridayBonusCorrection = true;
      correctedUserIds.push(user.id);
    });
    db.economy.casinoFridayBonusCorrectionV3 = { dayKey: CASINO_FRIDAY_BONUS_DAY, amount: CASINO_FRIDAY_EXTRA_BONUS, grantedAt, correctedUserIds };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // A meta é sempre o dobro da banca existente após a liberação. A V3 usou
  // indevidamente 1.000 fixos para quem tinha saldo remanescente do diário.
  // Reconstituímos a banca naquele instante, sem punir nem premiar jogadas
  // feitas depois do crédito.
  if (!db.economy.casinoFridayCashoutThresholdV4 && saoPauloDayKey() === CASINO_FRIDAY_BONUS_DAY) {
    const correction = db.economy.casinoFridayBonusCorrectionV3;
    const grantedAt = correction?.grantedAt;
    const correctedUserIds = Array.isArray(correction?.correctedUserIds) ? correction.correctedUserIds : [];
    const recalculatedUserIds = [];
    if (grantedAt) correctedUserIds.forEach((userId) => {
      const account = db.economy.casinoAccounts[userId];
      if (!account || account.dayKey !== CASINO_FRIDAY_BONUS_DAY) return;
      const postBonusNet = db.economy.casinoPlays
        .filter((play) => play.userId === userId && play.walletSource !== 'shop' && String(play.createdAt || '') >= grantedAt)
        .reduce((sum, play) => sum + Number(play.net || 0), 0);
      const balanceAfterBonus = roundMoney(Number(account.balance || 0) - postBonusNet);
      account.fridayCashoutBase = balanceAfterBonus;
      account.cashoutThreshold = roundMoney(balanceAfterBonus * 2);
      recalculatedUserIds.push(userId);
    });
    db.economy.casinoFridayCashoutThresholdV4 = { dayKey: CASINO_FRIDAY_BONUS_DAY, recalculatedAt: new Date().toISOString(), recalculatedUserIds };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // Corrige somente as metas dos dois envios de 19/10 quando a banca estava
  // zerada antes do primeiro envio e a meta ainda é a registrada no segundo.
  if (!db.economy.casinoBulkBonusThresholdRuleV2) {
    const dayKey = '2026-10-19';
    const grants = (db.economy.casinoBulkBonusGrants || [])
      .filter((grant) => grant?.dayKey === dayKey && Array.isArray(grant.recipients))
      .sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0));
    const correctedUserIds = [];
    const recipientIds = new Set(grants.flatMap((grant) => grant.recipients.map((recipient) => recipient.userId)));
    recipientIds.forEach((userId) => {
      const entries = grants.map((grant) => ({ grant, recipient: grant.recipients.find((item) => item.userId === userId) })).filter((entry) => entry.recipient);
      const account = db.economy.casinoAccounts[userId];
      if (!account || account.dayKey !== dayKey || account.cashedOut || entries.length !== 2) return;
      const [first, last] = entries;
      if (first.grant.amount !== 250 || last.grant.amount !== 250 || Number(first.recipient.beforeBalance) !== 0 || first.recipient.reopened || Number(account.cashoutThreshold) !== Number(last.recipient.cashoutThreshold)) return;
      account.cashoutThreshold = 1000;
      correctedUserIds.push(userId);
      changed = true;
    });
    db.economy.casinoBulkBonusThresholdRuleV2 = { dayKey, correctedAt: new Date().toISOString(), correctedUserIds };
    if (correctedUserIds.length) db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.settings.loanRankingReleaseV317) {
    const createdAt = new Date().toISOString();
    db.settings.announcement = {
      id: randomUUID(),
      title: '📋 Classificação do Agiota Estelar',
      message: 'A Classificação ganhou o quadro Maiores devedores: saldo pendente, valor do contrato, prazo e tempo de atraso. Saldo da Loja e pagamentos anteriores continuam privados.',
      createdAt,
      createdBy: 'Área 51',
      seenUserIds: [],
    };
    db.settings.loanRankingReleaseV317 = { createdAt };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.settings.seasonPassWorkshopReleaseV318) {
    const createdAt = new Date().toISOString();
    db.settings.announcement = {
      id: randomUUID(),
      title: '✦ Passe Blackstar: Oficina liberada',
      message: 'A trilha do Passe agora fica em uma página própria, junto do saldo de Fragmentos Blackstar e da Forja. Fragmentos já resgatados foram migrados para o saldo. Premium rende mais fragmentos e, ao concluir o nível 30, devolve 590 Créditos 51 para renovar o próximo Passe ou usar na Loja.',
      createdAt,
      createdBy: 'Sistema Área 51',
      seenUserIds: [],
    };
    db.settings.seasonPassWorkshopReleaseV318 = { createdAt };
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.economy.lottery || typeof db.economy.lottery !== 'object') { db.economy.lottery = { rounds: [], entries: [] }; changed = true; }
  if (!Array.isArray(db.economy.lottery.rounds)) { db.economy.lottery.rounds = []; changed = true; }
  if (!Array.isArray(db.economy.lottery.entries)) { db.economy.lottery.entries = []; changed = true; }
  if (!Array.isArray(db.economy.mysteryBoxes)) { db.economy.mysteryBoxes = []; changed = true; }
  if (!db.economy.casinoJackpot || typeof db.economy.casinoJackpot !== 'object') { db.economy.casinoJackpot = { amount: CASINO_JACKPOT.seed, updatedAt: new Date().toISOString() }; changed = true; }
  if (!Number.isFinite(Number(db.economy.casinoJackpot.amount)) || Number(db.economy.casinoJackpot.amount) < CASINO_JACKPOT.seed) { db.economy.casinoJackpot.amount = CASINO_JACKPOT.seed; db.economy.casinoJackpot.updatedAt = new Date().toISOString(); changed = true; }
  if (!db.economy.cobblemonDex || typeof db.economy.cobblemonDex !== 'object') { db.economy.cobblemonDex = {}; changed = true; }
  if (!Array.isArray(db.economy.cobblemonDeliveries)) { db.economy.cobblemonDeliveries = []; changed = true; }
  if (!Array.isArray(db.economy.cobblemonRouletteSpins)) { db.economy.cobblemonRouletteSpins = []; changed = true; }
  if (!Array.isArray(db.economy.cobblemonCaptureAttempts)) { db.economy.cobblemonCaptureAttempts = []; changed = true; }
  if (!Array.isArray(db.economy.cobblemonCaptureHighlights)) { db.economy.cobblemonCaptureHighlights = []; changed = true; }
  if (!Array.isArray(db.economy.cobblemonBallPurchases)) { db.economy.cobblemonBallPurchases = []; changed = true; }
  if (!db.economy.cobblemonBallInventory || typeof db.economy.cobblemonBallInventory !== 'object') { db.economy.cobblemonBallInventory = {}; changed = true; }
  if (!db.economy.cobblemonDailyBallBonuses || typeof db.economy.cobblemonDailyBallBonuses !== 'object') { db.economy.cobblemonDailyBallBonuses = {}; changed = true; }
  if (!Array.isArray(db.economy.cobblemonCaptureRewardClaims)) { db.economy.cobblemonCaptureRewardClaims = []; changed = true; }
  // Registros já sorteados também precisam carregar a ficha que o Davi usa
  // para gerar o Pokémon no servidor. Não toca em saldo, status, escolha ou
  // entrega — apenas preenche nível/sexo quando o CobbleDex tem esse nível.
  if (!db.economy.cobblemonDeliverySpecsV1) {
    db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon').forEach((entry) => {
      if (ensureCobblemonDeliverySpec(entry)) changed = true;
    });
    db.economy.cobblemonDeliverySpecsV1 = new Date().toISOString();
    changed = true;
  }
  if (!db.economy.cobblemonDexRecoveryV1) {
    const recovered = {};
    db.economy.cobblemonCaptureAttempts.filter((entry) => entry.captured).forEach((entry) => {
      recovered[entry.userId] ||= [];
      if (!recovered[entry.userId].some((item) => Number(item.id) === Number(entry.pokemonId))) recovered[entry.userId].push({ id: Number(entry.pokemonId), tier: Number(entry.tier || 1), level: Number(entry.level || 0), caughtAt: entry.createdAt });
    });
    Object.entries(recovered).forEach(([userId, entries]) => {
      const existing = Array.isArray(db.economy.cobblemonDex[userId]) ? db.economy.cobblemonDex[userId] : [];
      const byId = new Map(existing.map((item) => [Number(item.id), item]));
      entries.forEach((item) => { if (!byId.has(item.id)) byId.set(item.id, item); });
      db.economy.cobblemonDex[userId] = [...byId.values()];
    });
    db.economy.cobblemonDexRecoveryV1 = new Date().toISOString();
    changed = true;
  }
  if (!db.economy.cobblemonDexRecoveryV2) {
    const recovered = {};
    db.economy.cobblemonCaptureAttempts.filter((entry) => entry.captured).forEach((entry) => {
      recovered[entry.userId] ||= [];
      if (!recovered[entry.userId].some((item) => Number(item.id) === Number(entry.pokemonId))) recovered[entry.userId].push({ id: Number(entry.pokemonId), tier: Number(entry.tier || 1), level: Number(entry.level || 0), caughtAt: entry.createdAt });
    });
    Object.entries(recovered).forEach(([userId, entries]) => {
      const existing = Array.isArray(db.economy.cobblemonDex[userId]) ? db.economy.cobblemonDex[userId] : [];
      const byId = new Map(existing.map((item) => [Number(item.id), item]));
      entries.forEach((item) => { if (!byId.has(item.id)) byId.set(item.id, item); });
      db.economy.cobblemonDex[userId] = [...byId.values()];
    });
    db.economy.cobblemonDexRecoveryV2 = new Date().toISOString();
    changed = true;
  }
  if (!db.economy.cobblemonDexLevelsV1) {
    Object.values(db.economy.cobblemonDex).forEach((entries) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        const tier = Math.max(1, Math.min(4, Number(entry.tier) || 1));
        entry.tier = tier;
        if (Number(entry.level) < 1) entry.level = normalizedCobblemonLevel(entry.id, tier);
      });
    });
    db.economy.cobblemonDexLevelsV1 = new Date().toISOString();
    changed = true;
  }
  // A versão inicial da caça usava o filtro amplo do pool comum como
  // alternativa final e, por isso, algumas espécies especiais foram gravadas
  // como comuns. Reconciliamos o histórico com a classificação canônica do
  // catálogo, inclusive tentativas e destaques, antes de compensar bônus.
  if (!db.economy.cobblemonTierReconciliationV2) {
    let correctedDexEntries = 0;
    let correctedAttempts = 0;
    let correctedHighlights = 0;
    const reconcile = (entry, idField = 'id') => {
      const pokemonId = Number(entry?.[idField]);
      const pokemon = COBBLEMON_CATALOG.find((candidate) => Number(candidate.i) === pokemonId);
      if (!pokemon) return false;
      const tier = cobblemonCaptureTierForPokemon(pokemon);
      const level = cobblemonLevelFitsTier(entry.level, tier) ? Number(entry.level) : normalizedCobblemonLevel(pokemonId, tier);
      if (Number(entry.tier) === tier && Number(entry.level) === level) return false;
      entry.tier = tier;
      entry.level = level;
      return true;
    };
    Object.values(db.economy.cobblemonDex).forEach((entries) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => { if (reconcile(entry)) correctedDexEntries += 1; });
    });
    db.economy.cobblemonCaptureAttempts.forEach((entry) => { if (reconcile(entry, 'pokemonId')) correctedAttempts += 1; });
    db.economy.cobblemonCaptureHighlights.forEach((entry) => {
      const pokemon = COBBLEMON_CATALOG.find((candidate) => Number(candidate.i) === Number(entry.pokemonId));
      if (!pokemon) return;
      const tier = cobblemonCaptureTierForPokemon(pokemon);
      if (Number(entry.tier) !== tier) { entry.tier = tier; correctedHighlights += 1; }
    });
    db.users.forEach((user) => {
      const caught = Array.isArray(db.economy.cobblemonDex[user.id]) ? db.economy.cobblemonDex[user.id] : [];
      const claimed = new Set(db.economy.cobblemonCaptureRewardClaims.filter((entry) => entry.userId === user.id).map((entry) => entry.key));
      const grant = (key, amount, reason) => {
        if (claimed.has(key)) return;
        const createdAt = new Date().toISOString();
        const before = walletFor(user.id);
        addCredits(user.id, amount);
        db.economy.cobblemonCaptureRewardClaims.push({ id: randomUUID(), userId: user.id, key, amount, reason, createdAt, backfill: true, reconciliation: 'cobblemon-tier-v2' });
        db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-capture-bonus', amount, before, after: roundMoney(before + amount), reason, createdAt, backfill: true, reconciliation: 'cobblemon-tier-v2' });
        claimed.add(key);
      };
      caught.forEach((entry) => {
        const id = Number(entry.id);
        if (Number(entry.tier) === 4) grant(`legendary:${id}`, COBBLEMON_CAPTURE_BONUSES.legendary, 'Correção de bônus de primeira captura lendária');
        else if (Number(entry.tier) === 3) grant(`rare:${id}`, COBBLEMON_CAPTURE_BONUSES.rare, 'Correção de bônus de primeira captura rara');
      });
    });
    db.economy.cobblemonTierReconciliationV2 = { correctedAt: new Date().toISOString(), correctedDexEntries, correctedAttempts, correctedHighlights };
    changed = true;
  }
  // Crédito único das recompensas de captura para Pokédexes existentes. A
  // migração é marcada no banco para nunca repetir pagamentos nem aumentar o
  // custo das requisições nas próximas sessões.
  if (!db.economy.cobblemonCaptureRewardsBackfillV1) {
    db.users.forEach((user) => {
      const caught = Array.isArray(db.economy.cobblemonDex[user.id]) ? db.economy.cobblemonDex[user.id] : [];
      const claimed = new Set(db.economy.cobblemonCaptureRewardClaims.filter((entry) => entry.userId === user.id).map((entry) => entry.key));
      const grant = (key, amount, reason) => {
        if (claimed.has(key)) return;
        const createdAt = new Date().toISOString();
        const before = walletFor(user.id);
        addCredits(user.id, amount);
        db.economy.cobblemonCaptureRewardClaims.push({ id: randomUUID(), userId: user.id, key, amount, reason, createdAt, backfill: true });
        db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-capture-bonus', amount, before, after: roundMoney(before + amount), reason, createdAt, backfill: true });
        claimed.add(key);
      };
      caught.forEach((entry) => {
        const id = Number(entry.id);
        const tier = Number(entry.tier || 1);
        if (tier === 4) grant(`legendary:${id}`, COBBLEMON_CAPTURE_BONUSES.legendary, 'Bônus de primeira captura lendária');
        else if (tier === 3) grant(`rare:${id}`, COBBLEMON_CAPTURE_BONUSES.rare, 'Bônus de primeira captura rara');
        if (entry.isShiny) grant(`shiny:${id}`, COBBLEMON_CAPTURE_BONUSES.shiny, 'Bônus de primeira captura shiny');
      });
      COBBLEMON_CAPTURE_BONUSES.milestones.filter((entry) => caught.length >= entry.target).forEach((entry) => grant(`milestone:${entry.target}`, entry.reward, `Marco de ${entry.target} Pokémon capturados`));
    });
    db.economy.cobblemonCaptureRewardsBackfillV1 = new Date().toISOString();
    changed = true;
  }
  // Marcador legado mantido sem alterar inventário. Inicializar ou publicar o
  // site nunca deve apagar a Pokédex nem devolver Poké Balls já consumidas.
  if (!db.economy.cobblemonCaptureResetV2) { db.economy.cobblemonCaptureResetV2 = new Date().toISOString(); changed = true; }
  // A cápsula já foi corrigida; o fluxo atual deve permanecer intacto.
  if (!db.economy.cobblemonCapsuleResetV4) { db.economy.cobblemonCapsuleResetV4 = { disabledAt: new Date().toISOString(), action: 'none' }; changed = true; }
  // Estorno único da compra que foi registrada com o sprite da cápsula, embora
  // o sorteio real tenha sido Tangela. O marcador torna a correção idempotente.
  if (!db.economy.cobblemonCapsuleRepairV1) {
    const repaired = [];
    db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon' && entry.status === 'cycle-candidate' && entry.name === entry.boxName && !entry.rewardId && !entry.pokemonId && Array.isArray(entry.rolls) && entry.rolls.length === 0 && entry.roll?.pokemonId && /\/25\.webp(?:\?|$)/.test(String(entry.sprite || ''))).forEach((entry) => {
      const before = walletFor(entry.userId);
      const amount = roundMoney(entry.purchasePrice ?? entry.price ?? 900);
      addCredits(entry.userId, amount);
      entry.status = 'reset-refunded'; entry.refundedAt = new Date().toISOString(); entry.repairReason = 'Estorno da cápsula registrada com resultado visual incorreto';
      db.economy.creditAdjustments.push({ id: randomUUID(), userId: entry.userId, mode: 'cobblemon-capsule-refund', amount, before, after: roundMoney(before + amount), reason: 'Estorno da compra com resultado visual incorreto', createdAt: entry.refundedAt });
      repaired.push(entry.id);
    });
    db.economy.cobblemonCapsuleRepairV1 = { repaired, at: new Date().toISOString() };
    changed = true;
  }
  // Reset solicitado antes da nova regra semanal: toda cápsula Pokémon
  // comprada até aqui é encerrada e o preço da cápsula é devolvido uma única
  // vez. O marcador torna a operação segura mesmo que vários workers
  // inicializem o banco ao mesmo tempo.
  if (!db.economy.cobblemonCapsuleResetV5) {
    const refunded = [];
    const now = new Date().toISOString();
    db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon' && entry.status !== 'reset-refunded').forEach((entry) => {
      const before = walletFor(entry.userId);
      const amount = roundMoney(entry.purchasePrice ?? entry.price ?? 900);
      addCredits(entry.userId, amount);
      entry.status = 'reset-refunded';
      entry.refundedAt = now;
      entry.resetReason = 'Reinício do ciclo semanal da Cápsula Pokémon';
      db.economy.creditAdjustments.push({ id: randomUUID(), userId: entry.userId, mode: 'cobblemon-capsule-reset-refund', amount, before, after: roundMoney(before + amount), reason: 'Estorno da Cápsula Pokémon no reinício da regra semanal', createdAt: now });
      refunded.push({ id: entry.id, userId: entry.userId, amount });
    });
    db.economy.cobblemonCapsuleResetV5 = { at: now, refunded };
    changed = true;
  }
  // Confirmar uma recompensa de outra origem (Roleta ou Baú Premium) jamais
  // pode cancelar o Pokémon já escolhido para entrega. Repara as escolhas do
  // ciclo atual afetadas pela regra antiga e preserva o bloqueio semanal.
  if (!db.economy.cobblemonPokemonDeliveryProtectionV1) {
    const restored = [];
    const currentCycleId = pokemonCapsuleCycleKey();
    db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon' && entry.cycleId === currentCycleId && entry.status === 'replaced' && entry.lockReason === 'Escolha antecipada para entrega do Davi' && Number(entry.rolls?.length || entry.openCount || 0) >= 3).forEach((entry) => {
      entry.status = 'awaiting-delivery';
      entry.deliveryLocked = true;
      entry.restoredAt = new Date().toISOString();
      entry.restoreReason = 'Proteção da entrega Pokémon contra confirmação de outra recompensa';
      restored.push(entry.id);
    });
    db.economy.cobblemonPokemonDeliveryProtectionV1 = { restored, at: new Date().toISOString() };
    changed = true;
  }
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
  // Correção pontual: a interface antiga enviava a Maldição TDAH para quem
  // clicava no botão. Alex precisou gastar um Antídoto para desfazer o erro.
  // Recompõe exatamente esses dois consumíveis e remove apenas os dois avisos
  // gerados pelo incidente; os usos permanecem no registro técnico de auditoria.
  if (!db.economy.adhdSelfTargetCorrectionV1) {
    const alex = db.users.find((user) => String(user.displayName || '').trim().toLowerCase() === 'alex');
    const adhdUse = alex && [...db.economy.powerUses].reverse().find((use) => use.userId === alex.id && use.itemId === 'power-adhd-cursor' && use.targetId === alex.id);
    const antidoteUse = adhdUse && [...db.economy.powerUses].reverse().find((use) => use.userId === alex.id && use.itemId === 'power-cleanse-cursor' && Date.parse(use.usedAt) >= Date.parse(adhdUse.usedAt));
    if (alex && adhdUse && antidoteUse) {
      const correctionKey = 'adhd-self-target:' + adhdUse.id;
      const grant = (itemId) => {
        if (db.economy.purchases.some((purchase) => purchase.correctionKey === correctionKey && purchase.itemId === itemId)) return;
        db.economy.purchases.push({ id: randomUUID(), userId: alex.id, itemId, price: 0, originalPrice: 0, source: 'incident-correction', correctionKey, createdAt: new Date().toISOString() });
      };
      grant('power-adhd-cursor');
      grant('power-cleanse-cursor');
      const start = Date.parse(adhdUse.usedAt);
      const end = Date.parse(antidoteUse.usedAt) + 60 * 1000;
      db.economy.powerAnnouncements = db.economy.powerAnnouncements.filter((announcement) => !(announcement.activatedByUserId === alex.id && ['power-adhd-cursor', 'power-cleanse-cursor'].includes(announcement.itemId) && Date.parse(announcement.createdAt) >= start && Date.parse(announcement.createdAt) <= end));
      db.economy.forcedCursors = db.economy.forcedCursors.filter((cursor) => !(cursor.style === 'adhd' && cursor.targetUserId === alex.id && cursor.usedByUserId === alex.id && Date.parse(cursor.createdAt) >= start && Date.parse(cursor.createdAt) <= end));
      db.economy.adhdSelfTargetCorrectionV1 = { userId: alex.id, adhdUseId: adhdUse.id, antidoteUseId: antidoteUse.id, correctedAt: new Date().toISOString() };
      changed = true;
    }
  }
  if (!Object.hasOwn(db.economy, 'forcedGay')) { db.economy.forcedGay = null; changed = true; }
  if (!Object.hasOwn(db.economy, 'pendingGayDraw')) { db.economy.pendingGayDraw = null; changed = true; }
  // O escudo deixou de ser uma reserva antecipada. Devolva somente as
  // reservas antigas que ainda não chegaram a um sorteio Gay concluído.
  // Assim, poderes já consumidos em rodadas encerradas permanecem históricos.
  if (!db.economy.shieldFlowV2) {
    const restored = [];
    const keptShields = [];
    for (const shield of db.economy.shields || []) {
      const finalized = db.draws.some((draw) => draw.type === 'gay' && draw.roundId === shield.roundId);
      if (finalized) { keptShields.push(shield); continue; }
      const useIndex = db.economy.powerUses.findLastIndex((use) => use.userId === shield.userId && use.itemId === 'power-shield-gay' && use.roundId === shield.roundId);
      if (useIndex >= 0) db.economy.powerUses.splice(useIndex, 1);
      restored.push({ userId: shield.userId, roundId: shield.roundId });
    }
    db.economy.shields = keptShields;
    db.economy.shieldFlowV2 = { migratedAt: new Date().toISOString(), restored };
    changed = true;
  }
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
  if (!Array.isArray(db.settings.themeFinalists)) { db.settings.themeFinalists = []; changed = true; }
  if (!Object.hasOwn(db.settings, 'lastWinningTheme')) { db.settings.lastWinningTheme = null; changed = true; }
  if (!Object.hasOwn(db.settings, 'visualThemeClearedAt')) { db.settings.visualThemeClearedAt = null; changed = true; }
  if (!Array.isArray(db.settings.currentParticipantIds)) { db.settings.currentParticipantIds = []; changed = true; }
  if (typeof db.settings.currentParticipantsLocked !== 'boolean') { db.settings.currentParticipantsLocked = false; changed = true; }
  if (!Object.hasOwn(db.settings, 'currentRoundRecoveredAt')) { db.settings.currentRoundRecoveredAt = null; changed = true; }
  if (typeof db.settings.dailyPhrase !== 'string') { db.settings.dailyPhrase = ''; changed = true; }
  if (!Object.hasOwn(db.settings, 'dailyPhraseUpdatedAt')) { db.settings.dailyPhraseUpdatedAt = null; changed = true; }
  if (!Object.hasOwn(db.settings, 'dailyPhraseUpdatedBy')) { db.settings.dailyPhraseUpdatedBy = null; changed = true; }
  if (!db.settings.gateSeed) { db.settings.gateSeed = randomBytes(24).toString('hex'); changed = true; }
  if (!db.settings.gateCodeHash) { db.settings.gateCodeHash = createHash('sha256').update(db.settings.gateSeed + ':' + GATE_CODE).digest('hex'); changed = true; }
  if (!db.settings.roundSchedule || typeof db.settings.roundSchedule !== 'object') { db.settings.roundSchedule = { submissionsAt: '', drawAt: '', voteAt: '' }; changed = true; }
  for (const key of ['submissionsAt','drawAt','voteAt']) {
    const current = String(db.settings.roundSchedule[key] || '');
    const normalized = /^\d{4}-\d{2}-\d{2}/.test(current) ? current.slice(0,10) : '';
    if (db.settings.roundSchedule[key] !== normalized) { db.settings.roundSchedule[key] = normalized; changed = true; }
  }
  if (!db.settings.seasons || typeof db.settings.seasons !== 'object') { db.settings.seasons = {}; changed = true; }
  const activeSeasonKey = monthKeyFor();
  if (!db.settings.seasons[activeSeasonKey]) {
    db.settings.seasons[activeSeasonKey] = { name: activeSeasonKey === '2026-09' ? 'Expedição Estelar' : 'Temporada da Tripulação' };
    changed = true;
  }
  if (!Object.hasOwn(db.settings, 'announcement')) { db.settings.announcement = null; changed = true; }
  if (!db.settings.cobblemonServerRoster || typeof db.settings.cobblemonServerRoster !== 'object') { db.settings.cobblemonServerRoster = {}; changed = true; }
  if (!db.settings.featureFlags || typeof db.settings.featureFlags !== 'object') { db.settings.featureFlags = { ...DEFAULT_FEATURE_FLAGS }; changed = true; }
  for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    if (typeof db.settings.featureFlags[key] !== 'boolean') { db.settings.featureFlags[key] = enabled; changed = true; }
  }
  if (!Object.hasOwn(db.settings, 'lastBackupAt')) { db.settings.lastBackupAt = null; changed = true; }
  if (!Object.hasOwn(db.settings, 'lastCleanupAt')) { db.settings.lastCleanupAt = null; changed = true; }
  // Publica esta versão uma única vez para que clientes ainda no pacote
  // anterior recebam o aviso de atualização sem depender de recarga forçada.
  if (!db.settings.marketFiltersXerneasReleaseV166) {
    db.settings.marketFiltersXerneasReleaseV166 = new Date().toISOString();
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.settings.premiumWordingReleaseV167) {
    db.settings.premiumWordingReleaseV167 = new Date().toISOString();
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  if (!db.settings.cobblemonTierRepairReleaseV168) {
    db.settings.cobblemonTierRepairReleaseV168 = new Date().toISOString();
    db.settings.releaseVersion = Math.max(0, Number(db.settings.releaseVersion || 0)) + 1;
    changed = true;
  }
  // A chave é independente da janela da temporada. Ela permanece ligada para
  // que a ativação antecipada de 29/09 continue ativa após reinícios.
  if (db.settings.nextCardSeasonEnabled !== true) { db.settings.nextCardSeasonEnabled = true; changed = true; }
  if (!db.settings.missionEconomyStartWeek) {
    const start = new Date(saoPauloWeekKey() + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() + 7);
    db.settings.missionEconomyStartWeek = start.toISOString().slice(0, 10); changed = true;
  }
  // O sorteio extraordinário de 10 mil encerrou a rodada comum daquela data.
  // Reabrimos somente a janela semanal que ficou anulada, com segredo novo e
  // com o acúmulo já existente, para que a semana seguinte volte ao fluxo
  // normal de palpites e ao piso de 1.500 créditos.
  if (!db.settings.lotteryWeeklyWindowRepairV239) {
    ensureLotteryState();
    const window = lotteryWindowFor(new Date());
    const weeklyRound = db.economy.lottery.rounds.find((item) => item.id === window.id);
    if (weeklyRound?.status === 'void' && Date.parse(weeklyRound.closeAt) > Date.now()) {
      const secret = randomBytes(32).toString('hex');
      Object.assign(weeklyRound, {
        status: 'open', secret, commitHash: createHash('sha256').update(secret).digest('hex'),
        startAt: window.startAt, closeAt: window.closeAt,
        carryOver: roundMoney(weeklyRound.carryOver || weeklyRound.rolloverAmount || 0),
        realWagered: 0, houseMargin: 0, contribution: 0, basePrizePool: 0, apostometerTopUp: 0, prizePool: 0,
        winningNumbers: [], winnerIds: [], payouts: [], rolloverAmount: 0, drawnAt: null, revealedSecret: null,
        reopenedForWeeklyScheduleAt: new Date().toISOString(),
      });
      db.economy.lottery.entries = db.economy.lottery.entries.filter((entry) => entry.roundId !== weeklyRound.id);
      changed = true;
    }
    db.settings.lotteryWeeklyWindowRepairV239 = new Date().toISOString();
    changed = true;
  }
  if (!db.settings.communityVoteDeadlineV240) {
    for (const vote of db.communityVotes || []) {
      if (vote.status === 'open' && !vote.expiresAt) {
        vote.expiresAt = new Date(Date.parse(vote.createdAt) + COMMUNITY_VOTE_DURATION_MS).toISOString();
        changed = true;
      }
    }
    db.settings.communityVoteDeadlineV240 = new Date().toISOString();
    changed = true;
  }
  // Quem já resgatou o emblema no Passe antes desta correção também o recebe
  // equipado. Um emblema escolhido manualmente continua tendo prioridade.
  for (const purchase of db.economy?.purchases || []) {
    if (purchase.source !== 'season-pass' || purchase.itemId !== 'badge-operacao-blackstar') continue;
    db.economy.equipped ||= {};
    const equipped = (db.economy.equipped[purchase.userId] ||= {});
    if (!equipped.badge) { equipped.badge = purchase.itemId; changed = true; }
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
  if (await archiveCasinoPlaysBefore(new Date().toISOString())) changed = true;
  if (changed) await persist();
}

export async function initializeOnline(environment, seedDatabase) {
  runtimeEnv = environment;
  await ensureDatabase(seedDatabase);
  db.economy.curseHistory ||= [];
  db.economy.curseAuthorReveals ||= [];
  if (!db.settings.cursePowersReleasedAt) {
    db.settings.cursePowersReleasedAt = new Date().toISOString();
    await persist();
  }
}

export async function refreshOnlineState() {
  const now = Date.now();
  if (stateRevision > 0 && now - lastStateRefreshAt < STATE_REFRESH_INTERVAL_MS) return;
  const stored = await runtimeEnv.DB.prepare('SELECT CASE WHEN revision > ? THEN data ELSE NULL END AS data, revision FROM app_state WHERE id = 1').bind(stateRevision).first();
  lastStateRefreshAt = now;
  const remoteRevision = Number(stored?.revision || 0);
  if (stored?.data && remoteRevision > stateRevision) {
    db = JSON.parse(String(stored.data));
    databaseBytes = Buffer.byteLength(String(stored.data));
    stateRevision = remoteRevision;
    liveDraw = db.settings?.liveDraw?.endsAt > Date.now() ? db.settings.liveDraw : null;
    invalidateStateResponseCache();
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

// A primeira apuração é a virada de 28 para 29/10/2026 em Brasília.
const DAILY_DUTY_FIRST_DAY = '2026-10-28';
// A partir de 30/10, um dia de aviso com uma cesta individual antecede cada punição.
const DAILY_DUTY_BASKET_START_DAY = '2026-10-30';
const DAILY_DUTY_BASKET_TOTAL = 10;
const DAILY_DUTY_BASKET_WINDOW_MS = 10 * 60 * 1000;
const DAILY_DUTY_BASKET_FOODS = [
  { id: 'rice', name: 'Arroz', spriteIndex: 0 },
  { id: 'beans', name: 'Feijão', spriteIndex: 1 },
  { id: 'oil', name: 'Óleo', spriteIndex: 2 },
  { id: 'pasta', name: 'Macarrão', spriteIndex: 3 },
  { id: 'sugar', name: 'Açúcar', spriteIndex: 4 },
  { id: 'coffee', name: 'Café', spriteIndex: 5 },
  { id: 'milk', name: 'Leite', spriteIndex: 6 },
  { id: 'salt', name: 'Sal', spriteIndex: 7 },
  { id: 'flour', name: 'Farinha', spriteIndex: 8 },
  { id: 'sardines', name: 'Sardinha', spriteIndex: 9 },
];
const DAILY_DUTY_BASKET_PAGES = ['sorteio', 'inscricoes', 'memes', 'anonimos', 'agua', 'mentirometro', 'misterio', 'impostor', 'perfil', 'cobblemon', 'album', 'loja', 'loteria', 'mercado', 'crypto51', 'votacoes', 'classificacao', 'passe', 'atualizacoes'];
function previousSaoPauloDayKey(dayKey) {
  return saoPauloDayKey(new Date(Date.parse(dayKey + 'T12:00:00-03:00') - 86400000));
}
function dailyDutyPostRecorded(userId, dayKey) {
  const matches = (post) => post.userId === userId && dayKeyForTimestamp(post.createdAt) === dayKey;
  return (db.economy.dailyDutyPosts || []).some((entry) => entry.userId === userId && entry.dayKey === dayKey)
    || db.dailyPhrases.some(matches) || db.dailyMemes.some(matches)
    || db.dailyWallHistory.some((archive) => (archive.phrases || []).some(matches) || (archive.memes || []).some(matches));
}
function dailyDutySeededRandom(seedText) {
  let seed = 2166136261;
  for (const character of String(seedText)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function dailyDutyBasketScheduleFor(userId, dayKey, now = new Date()) {
  const random = dailyDutySeededRandom(userId + ':' + dayKey + ':basket-v1');
  const foods = [...DAILY_DUTY_BASKET_FOODS];
  const pages = [...DAILY_DUTY_BASKET_PAGES];
  for (let index = foods.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [foods[index], foods[other]] = [foods[other], foods[index]];
  }
  for (let index = pages.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [pages[index], pages[other]] = [pages[other], pages[index]];
  }
  const dayStart = Date.parse(dayKey + 'T08:00:00-03:00');
  const dayEnd = Date.parse(dayKey + 'T23:20:00-03:00');
  const activationAt = Date.parse(db.settings.dailyDutyBasketActivatedAt || '');
  const activationDay = Number.isFinite(activationAt) ? saoPauloDayKey(new Date(activationAt)) : '';
  const startAt = Math.max(dayStart, activationDay === dayKey ? activationAt + 60 * 1000 : dayStart);
  const span = Math.max(0, dayEnd - startAt);
  const step = span / DAILY_DUTY_BASKET_TOTAL;
  return foods.map((food, index) => {
    const availableAt = Math.round(startAt + step * (index + random() * 0.55));
    return { id: 'basket-' + food.id, ...food, page: pages[index % pages.length], availableAt, expiresAt: Math.min(availableAt + DAILY_DUTY_BASKET_WINDOW_MS, dayEnd) };
  });
}
function dailyDutyBasketTaskForDay(user, dayKey, now = new Date()) {
  if (dayKey < DAILY_DUTY_BASKET_START_DAY || !user?.active || user.approved === false) return null;
  const checkedDay = previousSaoPauloDayKey(dayKey);
  if (checkedDay < DAILY_DUTY_FIRST_DAY || saoPauloDayKey(new Date(user.createdAt || 0)) > checkedDay) return null;
  const posted = dailyDutyPostRecorded(user.id, checkedDay);
  const drankWater = db.waterEntries.some((entry) => entry.userId === user.id && entry.dayKey === checkedDay);
  if (posted && drankWater) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const schedule = dailyDutyBasketScheduleFor(user.id, dayKey, now instanceof Date ? now : new Date(nowMs));
  const collections = (db.economy.dailyDutyBasketCollections || []).filter((entry) => entry.userId === user.id && entry.dayKey === dayKey);
  const collectedById = new Map(collections.map((entry) => [entry.itemId, entry]));
  const foundItems = schedule.filter((item) => collectedById.has(item.id)).map((item) => ({ ...item, collectedAt: collectedById.get(item.id).collectedAt })).sort((a, b) => String(a.collectedAt).localeCompare(String(b.collectedAt)));
  const missedItems = schedule.filter((item) => !collectedById.has(item.id) && item.expiresAt <= nowMs);
  const activeItem = schedule.find((item) => !collectedById.has(item.id) && item.availableAt <= nowMs && item.expiresAt > nowMs) || null;
  const nextItem = schedule.find((item) => !collectedById.has(item.id) && item.availableAt > nowMs) || null;
  const completed = foundItems.length === DAILY_DUTY_BASKET_TOTAL;
  const penaltyHoursIfIncomplete = completed ? 0 : Math.max(0, Math.round((24 - foundItems.length * 2.4) * 10) / 10);
  return {
    dayKey, checkedDay, missingPost: !posted, missingWater: !drankWater, total: DAILY_DUTY_BASKET_TOTAL,
    collectedCount: foundItems.length, missedCount: missedItems.length, remainingCount: DAILY_DUTY_BASKET_TOTAL - foundItems.length - missedItems.length,
    foundItems, missedItemIds: missedItems.map((item) => item.id), activeItem: activeItem ? { ...activeItem } : null,
    nextItemAt: nextItem ? new Date(nextItem.availableAt).toISOString() : null,
    nextChangeAt: activeItem ? new Date(activeItem.expiresAt).toISOString() : nextItem ? new Date(nextItem.availableAt).toISOString() : null,
    itemWindowMinutes: 10, hoursPerItem: 2.4, penaltyHoursIfIncomplete, completed,
  };
}
function dailyDutyBasketTaskFor(user, now = new Date()) {
  const today = saoPauloDayKey(now);
  return dailyDutyBasketTaskForDay(user, today, now);
}
function dailyDutyPenaltyFor(user, now = new Date()) {
  const today = saoPauloDayKey(now);
  if (today <= DAILY_DUTY_BASKET_START_DAY || !user?.active || user.approved === false) return null;
  const checkedDay = previousSaoPauloDayKey(today);
  if ((db.economy.dailyDutyPenaltyClears || []).some((entry) => entry.userId === user.id && entry.dayKey === today)) return null;
  const warningTask = dailyDutyBasketTaskForDay(user, checkedDay, new Date(Date.parse(today + 'T00:00:00-03:00') - 1));
  if (!warningTask || warningTask.completed) return null;
  const durationHours = warningTask.penaltyHoursIfIncomplete;
  const expiresAt = new Date(Date.parse(today + 'T00:00:00-03:00') + durationHours * 3600000).toISOString();
  if (Date.parse(expiresAt) <= now.getTime()) return null;
  return { dayKey: today, checkedDay, taskDay: checkedDay, missingPost: warningTask.missingPost, missingWater: warningTask.missingWater,
    collectedCount: warningTask.collectedCount, missedCount: warningTask.missedCount, durationHours, expiresAt };
}

function wallpaperDeadlineAt() {
  const drawDate = String(db.settings?.roundSchedule?.drawAt || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) return null;
  const timestamp = Date.parse(drawDate + 'T15:30:00-03:00');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function activeWallpaperDeadlinePenalty(userId) {
  return [...(db.economy.wallpaperDeadlinePenalties || [])].reverse().find((item) => item.userId === userId && !item.clearedAt) || null;
}

function settleWallpaperDeadline(now = Date.now()) {
  const roundId = db.settings.currentRoundId;
  const deadlineAt = wallpaperDeadlineAt();
  if (!roundId || !db.settings.currentTheme || !deadlineAt || now < deadlineAt) return false;
  if (db.settings.wallpaperDeadlineSettledRoundId === roundId) return false;
  if (db.assignments.some((item) => item.roundId === roundId) || db.votings.some((item) => item.roundId === roundId)) return false;
  const participantIds = [...new Set(db.settings.currentParticipantIds || [])];
  const submittedIds = new Set(db.submissions.filter((item) => item.active && item.roundId === roundId).map((item) => item.userId));
  const readyIds = participantIds.filter((id) => submittedIds.has(id) && db.users.some((item) => item.id === id && item.active && item.approved !== false));
  const missingIds = participantIds.filter((id) => !submittedIds.has(id) && db.users.some((item) => item.id === id && item.active && item.approved !== false));
  const createdAt = new Date(now).toISOString();
  for (const userId of readyIds) db.economy.wallpaperMissStreaks[userId] = 0;
  for (const userId of missingIds) {
    if (db.economy.wallpaperDeadlinePenalties.some((item) => item.roundId === roundId && item.userId === userId)) continue;
    const user = db.users.find((item) => item.id === userId);
    const streak = Math.max(0, Number(db.economy.wallpaperMissStreaks[userId] || 0)) + 1;
    const scheduledAmount = streak === 1 ? 100 : streak === 2 ? 150 : 200;
    const before = walletFor(userId);
    const amount = roundMoney(Math.min(before, scheduledAmount));
    if (amount > 0) addCredits(userId, -amount);
    const after = walletFor(userId);
    db.economy.wallpaperMissStreaks[userId] = streak;
    db.economy.wallpaperDeadlinePenalties.push({ id: randomUUID(), roundId, userId, userName: user?.displayName || 'Participante', streak, scheduledAmount, amount, before, after, createdAt, clearedAt: null });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'wallpaper-deadline-penalty', amount: -amount, before, after, reason: `Falta de envio até 15h30 · ${streak}ª ausência consecutiva`, createdAt, roundId });
  }
  db.settings.currentParticipantIds = readyIds;
  db.settings.currentParticipantsLocked = true;
  db.settings.wallpaperDeadlineSettledRoundId = roundId;
  db.settings.wallpaperDeadlineSettledAt = createdAt;
  return true;
}

function pokemonCapsuleCycleKey(date = new Date()) {
  const day = saoPauloDayKey(date);
  const utc = new Date(day + 'T12:00:00Z');
  const daysSinceSaturday = (utc.getUTCDay() + 1) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceSaturday);
  return 'capsule-week:' + utc.toISOString().slice(0, 10);
}

function pokemonCapsuleIsFriday(date = new Date()) {
  const day = saoPauloDayKey(date);
  return new Date(day + 'T12:00:00Z').getUTCDay() === 5;
}

function ensureCobblemonDeliverySpec(entry) {
  if (!entry || typeof entry !== 'object') return false;
  let changed = false;
  const pokemonId = Number(entry.pokemonId);
  if (pokemonId > 0) {
    const level = cobblemonDeliveryMinimumLevel(pokemonId);
    if (level && Number(entry.level) !== level) { entry.level = level; changed = true; }
    if (level && !['male', 'female', 'genderless'].includes(entry.gender)) {
      entry.gender = cobblemonDeliverySpec(pokemonId).gender;
      entry.levelSource = 'cobbledex-minimum';
      changed = true;
    }
  }
  if (entry.roll && ensureCobblemonDeliverySpec(entry.roll)) changed = true;
  if (Array.isArray(entry.rolls)) entry.rolls.forEach((roll) => { if (ensureCobblemonDeliverySpec(roll)) changed = true; });
  if (Array.isArray(entry.choices)) entry.choices.forEach((choice) => { if (ensureCobblemonDeliverySpec(choice)) changed = true; });
  return changed;
}

function pokemonCapsuleChoiceForEntry(entry) {
  const history = entry.roll || {};
  return {
    id: entry.rewardId || entry.pokemonId || history.id,
    name: entry.name || history.name,
    sprite: entry.sprite || history.sprite,
    sellPrice: entry.sellPrice ?? history.sellPrice,
    pokemonId: entry.pokemonId || history.pokemonId,
    rarity: entry.rarity || history.rarity,
    isShiny: Boolean(entry.isShiny ?? history.isShiny),
    level: Number(entry.level || history.level) || null,
    gender: entry.gender || history.gender || null,
    levelSource: entry.levelSource || history.levelSource || null,
    deliveryLocked: Boolean(entry.deliveryLocked),
    entryId: entry.id,
  };
}

function cobblemonCandidateSellPrice(rarity) {
  return ({ common: 300, shiny: 400, rare: 450, legendary: 500 })[String(rarity || '').toLowerCase()] || 300;
}

// O Baú Premium tem prêmios físicos com raridades explícitas pela chance.
// O valor é decidido no servidor — a interface apenas o exibe — para que
// recarregar a página ou alterar o navegador nunca mude a revenda.
function premiumCobblemonSellPrice(weight) {
  const chance = Number(weight || 0);
  if (chance <= 1.25) return 1100; // mítico
  if (chance <= 2.08) return 900;  // relíquia
  if (chance <= 3.33) return 700;  // raro
  return 550;                      // especial
}

function sellPokemonCapsuleCandidates(entries, chosenEntry, userId, now, reason = 'Venda automática das opções não escolhidas') {
  let count = 0;
  let total = 0;
  entries.filter((entry) => entry.id !== chosenEntry.id && ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status)).forEach((entry) => {
    const amount = roundMoney(cobblemonCandidateSellPrice(entry.rarity || entry.roll?.rarity));
    const before = walletFor(userId);
    addCredits(userId, amount);
    entry.status = 'sold';
    entry.soldFromWeeklyChoice = true;
    entry.soldAutomatically = true;
    entry.decidedAt = now;
    entry.soldAt = now;
    entry.saleAmount = amount;
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'cobblemon-candidate-sale', amount, before, after: roundMoney(before + amount), reason: `${reason}: ${entry.name}`, createdAt: now });
    total = roundMoney(total + amount);
    count += 1;
  });
  return { count, total };
}

function finalizePokemonCapsuleCycle(entries, chosenEntry, reason) {
  const now = new Date().toISOString();
  entries.filter((entry) => ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status)).forEach((entry) => {
    entry.status = entry.id === chosenEntry.id ? 'awaiting-delivery' : 'cycle-discarded';
    if (entry.id === chosenEntry.id) { entry.lockedAt = now; entry.lockReason = reason; }
  });
}

// A escolha final só abre na sexta depois de todas as sete vagas do ciclo
// serem usadas. Antes disso, o jogador ainda pode comprar e abrir a cápsula
// restante; no sábado, o sistema resolve automaticamente o que sobrar.
function settlePokemonCapsules() {
  const currentCycleId = pokemonCapsuleCycleKey();
  let changed = false;
  // Cada participante possui sua própria lista de sete cápsulas dentro do
  // ciclo. Nunca misture candidatos de pessoas diferentes ao fechar a semana:
  // isso podia deixar um Pokémon escolhido como `cycle-candidate` para sempre
  // ou entregar a escolha de outra pessoa.
  const cycleKeys = new Set(db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon' && entry.cycleId && entry.userId).map((entry) => `${entry.userId}:${entry.cycleId}`));
  for (const cycleKey of cycleKeys) {
    const separator = cycleKey.indexOf(':');
    const userId = cycleKey.slice(0, separator);
    const cycleId = cycleKey.slice(separator + 1);
    const entries = db.economy.cobblemonDeliveries.filter((entry) => entry.boxId === 'pokemon' && entry.userId === userId && entry.cycleId === cycleId);
    const active = entries.filter((entry) => ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status));
    const deliveryLocked = entries.some((entry) => ['awaiting-delivery', 'delivered', 'claimed-no-delivery'].includes(entry.status));
    if (cycleId !== currentCycleId) {
      if (!deliveryLocked && active.length) {
        finalizePokemonCapsuleCycle(entries, active[Math.floor(Math.random() * active.length)], 'Escolha automática após o fim da sexta-feira');
        changed = true;
      }
      entries.filter((entry) => ['box-closed', 'box-open', 'choice-pending'].includes(entry.status)).forEach((entry) => { entry.status = 'cycle-expired'; entry.expiredAt = new Date().toISOString(); changed = true; });
      continue;
    }
    const paidCapsules = entries.filter((entry) => !['cycle-discarded', 'cycle-expired', 'replaced', 'reset-refunded'].includes(entry.status));
    // Uma decisão semanal só é final quando não resta nenhum Baú Pokémon em
    // aberto. Se uma compra paga ainda precisa de sorteios ou da escolha dos
    // três resultados, devolvemos a decisão semanal à lista de candidatos.
    // Isso preserva todos os Pokémon e impede uma seleção antecipada de
    // bloquear a conclusão do próprio ciclo.
    const hasUnfinishedBox = entries.some((entry) => ['box-closed', 'box-open', 'choice-pending'].includes(entry.status));
    if (hasUnfinishedBox) {
      entries.filter((entry) => entry.status === 'weekly-choice-pending').forEach((entry) => {
        entry.status = 'cycle-candidate';
        delete entry.choices;
        entry.weeklyChoiceDeferredAt = new Date().toISOString();
        changed = true;
      });
      continue;
    }
    if (deliveryLocked || !pokemonCapsuleIsFriday() || paidCapsules.length < 7 || entries.some((entry) => entry.status === 'weekly-choice-pending')) continue;
    if (active.length === 1) finalizePokemonCapsuleCycle(entries, active[0], 'Única opção da semana');
    else if (active.length > 1) {
      const anchor = active[0];
      anchor.status = 'weekly-choice-pending';
      anchor.choices = active.map(pokemonCapsuleChoiceForEntry);
    }
    changed = true;
  }
  return changed;
}

function retailPriceWithCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return numeric;
  return Math.round((numeric - 0.1) * 100) / 100;
}

// Bolas especiais ficam no inventário até serem usadas. A Poké Ball básica
// continua sendo o limite diário gratuito; as demais substituem o arremesso
// escolhido pelo jogador e melhoram a chance calculada no servidor.
const COBBLEMON_CAPTURE_BALLS = {
  poke: { id: 'poke', name: 'Poké Ball', shortName: 'Básica', sprite: 'https://wiki.cobblemon.com/images/6/6f/Poke_Ball.png', multiplier: 1, price: 0, daily: true },
  great: { id: 'great', name: 'Great Ball', shortName: 'Melhor chance', sprite: 'https://wiki.cobblemon.com/images/4/45/Great_Ball.png', multiplier: 1.35, price: 75 },
  ultra: { id: 'ultra', name: 'Ultra Ball', shortName: 'Alta chance', sprite: 'https://wiki.cobblemon.com/images/3/34/Ultra_Ball.png', multiplier: 1.7, price: 180 },
};

const COBBLEMON_DAILY_SPECIAL_BALL_BONUS = Object.freeze({ great: 1, ultra: 1 });

function grantCobblemonDailyBallBonus(userId, dayKey = saoPauloDayKey()) {
  db.economy.cobblemonDailyBallBonuses ||= {};
  const key = `${userId}:${dayKey}`;
  if (db.economy.cobblemonDailyBallBonuses[key]) return false;
  db.economy.cobblemonBallInventory ||= {};
  db.economy.cobblemonBallInventory[userId] ||= {};
  const quantities = {};
  Object.entries(COBBLEMON_DAILY_SPECIAL_BALL_BONUS).forEach(([ballType, quantity]) => {
    const current = Math.max(0, Number(db.economy.cobblemonBallInventory[userId][ballType] || 0));
    const next = Math.min(100, current + quantity);
    db.economy.cobblemonBallInventory[userId][ballType] = next;
    quantities[ballType] = next - current;
  });
  db.economy.cobblemonDailyBallBonuses[key] = { userId, dayKey, quantities, createdAt: new Date().toISOString() };
  const keys = Object.keys(db.economy.cobblemonDailyBallBonuses);
  if (keys.length > 10000) keys.slice(0, keys.length - 10000).forEach((oldKey) => { delete db.economy.cobblemonDailyBallBonuses[oldKey]; });
  return true;
}

function cobblemonDailyPokeLimit(userId, dayKey = saoPauloDayKey()) {
  const purchase = [...db.economy.cobblemonBallPurchases].reverse().find((entry) => entry.userId === userId && entry.dayKey === dayKey);
  const extra = purchase ? Math.max(0, Math.floor(Number(purchase.quantity || 0))) : 0;
  return 5 + extra;
}

function cobblemonDailyPokeAttempts(userId, dayKey = saoPauloDayKey()) {
  return db.economy.cobblemonCaptureAttempts.filter((entry) => entry.userId === userId && entry.dayKey === dayKey && (!entry.ballType || entry.ballType === 'poke')).length;
}

function cobblemonDailyCaptureLimit(userId, dayKey = saoPauloDayKey()) {
  const attempts = db.economy.cobblemonCaptureAttempts.filter((entry) => entry.userId === userId && entry.dayKey === dayKey);
  const extra = cobblemonDailyPokeLimit(userId, dayKey) - 5;
  const inventory = db.economy.cobblemonBallInventory?.[userId] && typeof db.economy.cobblemonBallInventory[userId] === 'object' ? db.economy.cobblemonBallInventory[userId] : {};
  const specialStock = Object.keys(COBBLEMON_DAILY_SPECIAL_BALL_BONUS).reduce((sum, ballType) => sum + Math.max(0, Math.floor(Number(inventory[ballType] || 0))), 0);
  const specialAttempts = attempts.filter((entry) => entry.ballType && entry.ballType !== 'poke').length;
  // Every special ball in stock represents one additional daily attempt. A
  // used special ball moves from stock into specialAttempts, so it remains
  // counted exactly once and cannot be used to create unlimited encounters.
  return 5 + extra + specialAttempts + specialStock;
}

// Prêmios pequenos e únicos: dão fôlego à caça sem transformar a Pokédex em
// uma fonte infinita de créditos. Todo pagamento tem uma chave imutável no
// servidor, portanto repetir uma requisição nunca premia duas vezes.
const COBBLEMON_CAPTURE_BONUSES = {
  rare: 15,
  legendary: 100,
  shiny: 60,
  milestones: [
    { target: 10, reward: 20 },
    { target: 25, reward: 45 },
    { target: 50, reward: 75 },
    { target: 100, reward: 150 },
    { target: 150, reward: 250 },
  ],
};
const COBBLEMON_SHINY_CHANCE = .01;

function cobblemonCaptureChance(tier, level, ballType = 'poke') {
  const safeTier = Math.max(1, Math.min(4, Number(tier) || 1));
  const safeLevel = Math.max(1, Math.min(100, Number(level) || safeTier * 20));
  const baseChance = safeTier === 4 ? .26 : safeTier === 3 ? .55 : safeTier === 2 ? .76 : .94;
  const multiplier = Number(COBBLEMON_CAPTURE_BALLS[ballType]?.multiplier || 1);
  return Math.round(Math.max(.10, Math.min(.97, (baseChance - safeLevel * .0022) * multiplier)) * 100);
}

const SHOP_CATALOG = [
  { id: 'card-pack-cosmic', name: 'Pacotinho Cósmico', icon: '🎴', type: 'cardPack', value: 'cosmic', consumable: true, cardPack: true, price: 120, availableUntil: NEXT_CARD_SEASON.startsAt, description: 'Guarde no Perfil e rasgue para revelar 3 cartas. Cada carta: 90% básica e 10% rara. Pode haver repetidas. Cada insígnia exige 4 básicas diferentes e 1 rara da coleção. Sem revenda por créditos.' },
  { id: 'card-pack-stellar', name: 'Pacotinho Estelar', icon: '🌠', type: 'cardPack', value: 'stellar', consumable: true, cardPack: true, price: 260, cardPackDailyLimit: 3, availableUntil: NEXT_CARD_SEASON.startsAt, description: '3 cartas: 82% básica e 18% rara por carta. Chance de ao menos uma rara: cerca de 45%. Limite de 3 por dia; sem garantia de rara e sem revenda.' },
  { id: 'card-pack-legendary', name: 'Pacotinho Lendário', icon: '💎', type: 'cardPack', value: 'legendary', consumable: true, cardPack: true, price: 520, cardPackDailyLimit: 1, availableUntil: NEXT_CARD_SEASON.startsAt, description: '3 cartas: 72% básica e 28% rara por carta. Chance de ao menos uma rara: cerca de 63%. Limite de 1 por dia; sem garantia de rara e sem revenda.' },
  { id: 'card-pack-halloween', name: 'Pacotinho Noite Assombrada', icon: '🎃', type: 'cardPack', value: 'halloween', consumable: true, cardPack: true, price: 310, cardPackDailyLimit: 2, seasonalEvent: HALLOWEEN_2026.id, availableUntil: NEXT_CARD_SEASON.startsAt, description: '3 cartas exclusivas da coleção Noite Assombrada 51. Cada carta: 76% básica e 24% rara. Limite de 2 por dia; o pacote não mistura cartas de outras coleções.' },
  { id: 'card-pack-sector51', name: 'Pacote Setor 51', icon: '📁', packArt: '/card-season-2026-10/pack-setor-51.webp', type: 'cardPack', value: 'sector51', consumable: true, cardPack: true, price: 120, availableFrom: NEXT_CARD_SEASON.startsAt, description: '3 cartas da Operação Ecos do Setor 51. Cada carta tem 10% de chance de ser rara.' },
  { id: 'card-pack-orbit', name: 'Pacote Órbita', icon: '🛰️', packArt: '/card-season-2026-10/pack-orbita.webp', type: 'cardPack', value: 'orbit', consumable: true, cardPack: true, price: 260, cardPackDailyLimit: 3, availableFrom: NEXT_CARD_SEASON.startsAt, description: '3 cartas da nova temporada. Cada carta tem 18% de chance de ser rara.' },
  { id: 'card-pack-core', name: 'Pacote Núcleo', icon: '⚛️', packArt: '/card-season-2026-10/pack-nucleo.webp', type: 'cardPack', value: 'core', consumable: true, cardPack: true, price: 520, cardPackDailyLimit: 1, availableFrom: NEXT_CARD_SEASON.startsAt, description: '3 cartas da nova temporada. Cada carta tem 28% de chance de ser rara.' },
  { id: 'title-operador-blackstar', name: 'Título Operador Blackstar', description: 'Título exclusivo concluído no nível 30 da trilha gratuita Operação: Ecos do Setor 51.', price: 300, type: 'title', value: 'Operador Blackstar', icon: '✦', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'badge-operacao-blackstar', name: 'Emblema da Operação', description: 'Emblema exclusivo do Passe Premium, exibido ao lado do seu nome.', price: 240, type: 'badge', value: '◈', icon: '◈', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'frame-blackstar', name: 'Moldura Blackstar', description: 'Moldura violeta e dourada desbloqueada pelo Passe Premium.', price: 420, type: 'frame', value: 'blackstar', icon: '✦', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'badge-relic-rift', name: 'Relíquia da Fenda', description: 'Emblema visual forjado com Fragmentos Blackstar. Pode ser equipado no Perfil.', price: 0, type: 'badge', value: 'relic-rift', icon: '✦', iconAsset: '/season-workshop/reliquia-fenda.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'trail-taquion', name: 'Rastro Táquion', description: 'Rastro de energia violeta para o cursor, exclusivo do Passe Premium.', price: 300, type: 'trailStyle', value: 'taquion', icon: '〰️', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'cursor-khepri', name: 'Cursor Khepri', description: 'Cursor exclusivo com ponta precisa e arte da Sonda Khepri.', price: 450, type: 'cursorStyle', value: 'khepri', icon: '🛰️', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'site-camara-vanta', name: 'Tema Premium Câmara Vanta', description: 'Tema preto-violeta da Operação, exclusivo do nível 30 do Passe Premium.', price: 600, type: 'siteTheme', value: 'camara-vanta', icon: '◈', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'cursor-blackstar-cyan', name: 'Lança Blackstar: Azul Elétrico', description: 'Cursor forjado com Fragmentos Blackstar. A ponta é a área precisa de clique.', price: 0, type: 'cursorStyle', value: 'blackstar-cyan', icon: '✦', iconAsset: '/season-workshop/cursor-blackstar-cyan.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'cursor-blackstar-gold', name: 'Lança Blackstar: Obsidiana e Ouro', description: 'Cursor forjado com Fragmentos Blackstar. A ponta é a área precisa de clique.', price: 0, type: 'cursorStyle', value: 'blackstar-gold', icon: '✦', iconAsset: '/season-workshop/cursor-blackstar-gold.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'cursor-blackstar-crimson', name: 'Lança Blackstar: Carmesim Lunar', description: 'Cursor forjado com Fragmentos Blackstar. A ponta é a área precisa de clique.', price: 0, type: 'cursorStyle', value: 'blackstar-crimson', icon: '✦', iconAsset: '/season-workshop/cursor-blackstar-crimson.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'site-blackstar-cyan', name: 'Câmara Blackstar: Aurora Azul', description: 'Tema forjado com Fragmentos Blackstar.', price: 0, type: 'siteTheme', value: 'blackstar-cyan', icon: '✦', iconAsset: '/season-workshop/theme-blackstar-cyan.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'site-blackstar-gold', name: 'Câmara Blackstar: Obsidiana Dourada', description: 'Tema forjado com Fragmentos Blackstar.', price: 0, type: 'siteTheme', value: 'blackstar-gold', icon: '✦', iconAsset: '/season-workshop/theme-blackstar-gold.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'site-blackstar-crimson', name: 'Câmara Blackstar: Nebulosa Rubra', description: 'Tema forjado com Fragmentos Blackstar.', price: 0, type: 'siteTheme', value: 'blackstar-crimson', icon: '✦', iconAsset: '/season-workshop/theme-blackstar-crimson.png', passExclusive: true, availableFrom: NEXT_CARD_SEASON.startsAt },
  { id: 'cursor-crystal', name: 'Seta Cristal Lunar', description: 'Seta facetada azul e violeta, com ponta precisa e contorno contrastante. Combine com seus rastros.', price: 360, type: 'cursorStyle', value: 'crystal', icon: '💠' },
  { id: 'cursor-solar', name: 'Seta Lâmina Solar', description: 'Seta dourada e laranja em forma de lâmina solar. Ponta clara e tamanho próprio para clicar.', price: 390, type: 'cursorStyle', value: 'solar', icon: '☀️' },
  { id: 'name-ice', name: 'Nome Gelo Lunar', description: 'Letras azul-gelo com brilho no perfil, topo e menu.', price: 270, type: 'nameStyle', value: 'ice', icon: '🧊' },
  { id: 'frame-rose', name: 'Moldura Quartzo Rosa', description: 'Acabamento rosa e violeta no perfil, topo e menu.', price: 330, type: 'frame', value: 'rose', icon: '🔮' },
  { id: 'title-master-guardian', name: 'Título Guardião Master', description: 'Exibe Guardião Master no perfil, topo e menu.', price: 300, type: 'title', value: 'Guardião Master', icon: '🏅' },
  { id: 'box-master-aurora', name: 'Baú Master Aurora', description: 'Visual ou poder de 340 a 680 créditos, ou 100 a 240 créditos. Sorte aleatória: o prêmio pode valer menos que o baú.', price: 800, sellPrice: 200, type: 'mysteryBox', value: 'master-aurora', icon: '💠', mysteryBox: true, master: true, tier: 'master-aurora', creditChance: .2, powerChance: .3, minRewardPrice: 340, maxRewardPrice: 680, creditMin: 100, creditMax: 240 },
  { id: 'box-master-imperial', name: 'Baú Master Imperial', description: 'Visual ou poder de 400 a 800 créditos, com exceção da Moldura Cyberpunk, ou 150 a 320 créditos. Sem garantia de lucro; itens repetidos podem virar créditos.', price: 1100, sellPrice: 280, type: 'mysteryBox', value: 'master-imperial', icon: '👑', mysteryBox: true, master: true, tier: 'master-imperial', creditChance: .15, powerChance: .4, minRewardPrice: 400, maxRewardPrice: 800, creditMin: 150, creditMax: 320 },
  { id: 'badge-comet', name: 'Emblema Cometa', description: 'Um cometa junto ao nome no perfil, topo e menu.', price: 220, type: 'badge', value: '☄️', icon: '☄️' },
  { id: 'name-ruby', name: 'Nome Rubi Estelar', description: 'Brilho rubi no nome do perfil, topo e menu.', price: 240, type: 'nameStyle', value: 'ruby', icon: '💎' },
  { id: 'frame-orbit', name: 'Moldura Órbita Prateada', description: 'Borda metálica prateada no perfil, topo e menu.', price: 310, type: 'frame', value: 'orbit', icon: '🪩' },
  { id: 'power-cleanse-cursor', name: 'Antídoto de Maldição', description: 'Remove uma maldição comprada comum aplicada em você. Não remove maldição lacrada, sorteio nem dívida.', price: 360, type: 'power', value: 'cleanseCursor', icon: '🧪', consumable: true },
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
  { id: 'badge-crown', name: 'Emblema Coroa Cósmica', description: 'Exibe uma coroa dourada ao lado do nome no perfil, topo e menu. Não altera a cor das letras.', price: 260, type: 'badge', value: '👑', icon: '👑' },
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
  { id: 'name-amethyst', name: 'Nome Ametista Real', description: 'Violeta profundo com brilho cristalino no perfil, topo e menu.', price: 280, type: 'nameStyle', value: 'amethyst', icon: '💜' },
  { id: 'name-solarfire', name: 'Nome Fogo Solar', description: 'Letras quentes em ouro e laranja com reflexo de chama.', price: 310, type: 'nameStyle', value: 'solarfire', icon: '🔥' },
  { id: 'name-moon-silver', name: 'Nome Prata Lunar', description: 'Prata azulado elegante e luminoso em todos os lugares do seu nome.', price: 290, type: 'nameStyle', value: 'moon-silver', icon: '🌙' },
  { id: 'name-aurora', name: 'Nome Aurora Viva', description: 'Degradê verde-ciano-violeta com brilho de aurora boreal.', price: 360, type: 'nameStyle', value: 'aurora', icon: '🌌' },
  { id: 'name-rose-quartz', name: 'Nome Quartzo Rosa', description: 'Rosa cristalino com luminosidade suave para perfil, topo e menu.', price: 270, type: 'nameStyle', value: 'rose-quartz', icon: '🌸' },
  { id: 'site-galaxy', name: 'Tema Galáxia', description: 'Transforma sua Área 51 em uma experiência espacial pessoal.', price: 300, type: 'siteTheme', value: 'galaxy', icon: '🌌' },
  { id: 'site-sunset', name: 'Tema Pôr do Sol', description: 'Aplica tons quentes de laranja, rosa e violeta em todo o site.', price: 280, type: 'siteTheme', value: 'sunset', icon: '🌅' },
  { id: 'site-ocean', name: 'Tema Oceano', description: 'Transforma o site com azuis profundos, turquesa e clima aquático.', price: 280, type: 'siteTheme', value: 'ocean', icon: '🌊' },
  { id: 'site-retro', name: 'Tema Arcade 51', description: 'Visual retrô com roxo, ciano e detalhes inspirados em fliperama.', price: 340, type: 'siteTheme', value: 'retro', icon: '🕹️' },
  { id: 'site-matrix', name: 'Tema Matrix Alienígena', description: 'Interface tecnológica em preto e verde radioativo, com grade digital em todo o site.', price: 380, type: 'siteTheme', value: 'matrix', icon: '👾' },
  { id: 'site-eclipse', name: 'Tema Eclipse Dourado', description: 'Visual premium em preto, dourado e âmbar para transformar a Área 51 em uma central de comando.', price: 420, type: 'siteTheme', value: 'eclipse', icon: '🌘' },
  { id: 'site-aurora', name: 'Tema Aurora Alienígena', description: 'Auroras verdes, ciano e violeta atravessam todas as páginas com alto contraste.', price: 390, type: 'siteTheme', value: 'aurora', icon: '🌌' },
  { id: 'site-mars', name: 'Tema Base de Marte', description: 'Visual marciano em vermelho, cobre e laranja com painéis escuros legíveis.', price: 410, type: 'siteTheme', value: 'mars', icon: '🪐' },
  { id: 'site-nebula', name: 'Tema Nebulosa Rosa', description: 'Painéis espaciais em rosa, azul e violeta com contraste reforçado.', price: 400, type: 'siteTheme', value: 'nebula', icon: '🌠' },
  { id: 'site-hyperdrive', name: 'Tema Hiperespaço Neon', description: 'Azul elétrico, magenta e rastros de velocidade para uma Área 51 em modo viagem.', price: 430, type: 'siteTheme', value: 'hyperdrive', icon: '💫' },
  { id: 'site-lunar-tide', name: 'Tema Maré Lunar', description: 'Azul profundo, água luminosa e reflexos prateados com leitura reforçada.', price: 410, type: 'siteTheme', value: 'lunar-tide', icon: '🌊' },
  { id: 'site-coral-signal', name: 'Tema Sinal Coral', description: 'Coral, violeta e âmbar para um visual quente de transmissão alienígena.', price: 400, type: 'siteTheme', value: 'coral-signal', icon: '📡' },
  { id: 'site-prism', name: 'Tema Prisma Cósmico', description: 'Auroras em cores vivas sobre painéis escuros, sem perder contraste.', price: 450, type: 'siteTheme', value: 'prism', icon: '🔷' },
  { id: 'site-dragon-ember', name: 'Tema Premium Dragão de Brasa', description: 'Coleção premium completa: cidadela vulcânica, Cursor Dragão de Brasa com sopro no atalho F, Rastro Brasa Viva, Nome Senhor das Brasas, Emblema Coração de Brasa e Moldura Escama de Obsidiana. Cada peça também pode ser adquirida separadamente.', price: 1540, type: 'siteTheme', value: 'dragon-ember', icon: '🐉', iconAsset: '/theme-dragon-ember.png', bundleItems: ['cursor-dragon-ember','trail-dragon-ember','name-dragon-ember','badge-dragon-ember','frame-dragon-ember'] },
  { id: 'site-lideranca', name: 'Tema Liderança: Posto da Madrugada', description: 'Coleção premium: posto iluminado, carro rebaixado e paredão. Inclui o Cursor Combo Liderança; o cursor também pode ser adquirido separadamente.', price: 1290, type: 'siteTheme', value: 'lideranca', icon: '⛽', iconAsset: '/theme-lideranca-posto.png', bundleItems: ['cursor-lideranca'] },
  { id: 'site-team-dragon-ball', name: 'Coleção Premium Team Dragon Ball', description: 'Tema com a arte da equipe, cursor Shenlong, moldura de nuvens e insígnia Esfera do Dragão. Inclui as três peças, também vendidas separadamente.', price: 1590, type: 'siteTheme', value: 'team-dragon-ball', icon: '🐉', iconAsset: '/team-themes/dragon-wallpaper.webp', bundleItems: ['cursor-team-dragon','frame-team-dragon','badge-team-dragon'], excludeMystery: true },
  { id: 'cursor-team-dragon', name: 'Cursor Shenlong', description: 'Cursor inspirado em Shenlong. Equipe no Perfil.', price: 680, type: 'cursorStyle', value: 'team-dragon', icon: '🐉', iconAsset: '/team-themes/dragon-cursor.png' },
  { id: 'frame-team-dragon', name: 'Moldura Nuvens do Dragão', description: 'Nuvens no cartão, topo e menu do Perfil.', price: 560, type: 'frame', value: 'team-dragon', icon: '☁️', iconAsset: '/team-themes/dragon-frame.png' },
  { id: 'badge-team-dragon', name: 'Insígnia Esfera do Dragão', description: 'Uma esfera do dragão junto ao seu nome.', price: 340, type: 'badge', value: 'team-dragon', icon: '🟠', iconAsset: '/team-themes/dragon-badge.png' },
  { id: 'site-cyberpunk-premium', name: 'Coleção Premium Cyberpunk', description: 'Cidade futurista, cursor neon ciano, moldura e insígnia Cyberpunk. Peças vendidas separadamente; o cursor âmbar é outra opção de compra.', price: 1590, type: 'siteTheme', value: 'cyberpunk-premium', icon: '🌆', iconAsset: '/team-themes/cyber-wallpaper.webp', bundleItems: ['cursor-cyber-cyan','frame-cyberpunk','badge-cyberpunk'], excludeMystery: true },
  { id: 'cursor-cyber-cyan', name: 'Cursor Cyberpunk Ciano e Magenta', description: 'Versão ciano e magenta, adquirida e equipada separadamente da versão âmbar.', price: 750, type: 'cursorStyle', value: 'cyber-cyan', icon: '⚡', iconAsset: '/team-themes/cyber-cyan.png' },
  { id: 'cursor-cyber-amber', name: 'Cursor Cyberpunk Âmbar e Ciano', description: 'Versão âmbar e ciano, adquirida e equipada separadamente da versão magenta.', price: 750, type: 'cursorStyle', value: 'cyber-amber', icon: '⚡', iconAsset: '/team-themes/cyber-amber.png' },
  { id: 'frame-cyberpunk', name: 'Moldura Cyberpunk Neon', description: 'Moldura futurista neon no cartão, topo e menu.', price: 900, type: 'frame', value: 'cyberpunk-premium', icon: '▣', iconAsset: '/team-themes/cyber-frame.png' },
  { id: 'badge-cyberpunk', name: 'Insígnia Cyberpunk Neon', description: 'Emblema futurista junto ao nome.', price: 500, type: 'badge', value: 'cyberpunk-premium', icon: '⚡', iconAsset: '/team-themes/cyber-badge.png' },
  { id: 'cursor-lideranca', name: 'Cursor Combo Liderança', description: 'Combo de whisky e energético. A ponta da garrafa é o ponto exato de clique; ao mover, aparece “vem comigo novinha”.', price: 630, type: 'cursorStyle', value: 'lideranca', icon: '🥃', iconAsset: '/cursor-lideranca-combo.png' },
  { id: 'cursor-dragon-ember', name: 'Cursor Dragão de Brasa', description: 'Dragão de obsidiana com fogo vivo. Pressione F para uma bola de fogo; segure F para manter o sopro.', price: 680, type: 'cursorStyle', value: 'dragon-ember', icon: '🐉', iconAsset: '/dragon-premium-icons/dragon-premium-cursor.png' },
  { id: 'trail-dragon-ember', name: 'Rastro Brasa Viva', description: 'Faíscas, cinzas e labaredas acompanham o cursor sem bloquear cliques.', price: 360, type: 'trailStyle', value: 'dragon-ember', icon: '🔥', iconAsset: '/dragon-premium-icons/dragon-premium-trail.png' },
  { id: 'badge-dragon-ember', name: 'Emblema Coração de Brasa', description: 'Selo ardente junto ao nome no Perfil, Feed e classificações.', price: 340, type: 'badge', value: 'dragon-ember', icon: '🜂', iconAsset: '/dragon-premium-icons/dragon-premium-badge.png' },
  { id: 'name-dragon-ember', name: 'Nome Senhor das Brasas', description: 'Tipografia em ouro queimado com brilho de magma e sombra de carvão.', price: 420, type: 'nameStyle', value: 'dragon-ember', icon: '✦', iconAsset: '/dragon-premium-icons/dragon-premium-name.png' },
  { id: 'frame-dragon-ember', name: 'Moldura Escama de Obsidiana', description: 'Escamas negras, veios de lava e ouro no cartão, topo e menu.', price: 560, type: 'frame', value: 'dragon-ember', icon: '⬡', iconAsset: '/dragon-premium-icons/dragon-premium-frame.png' },
  { id: 'site-gta-neon', name: 'Coleção GTA 6: Neon Vice', description: 'Tema geral premium: cidade tropical em neon, cursor, rastro, nome e emblema combinando. Você pode trocar cada parte depois.', price: 1180, type: 'siteTheme', value: 'gta-neon', icon: '🌴', iconAsset: '/theme-gta-neon-v2.webp', bundleItems: ['cursor-gta-neon','trail-gta-neon','name-gta-neon','badge-gta-neon'] },
  { id: 'site-cobblemon', name: 'Coleção Cobblemon', description: 'Tema geral premium: mundo em blocos, criaturas no fundo, cursor, rastro, nome e emblema combinando. Você pode trocar cada parte depois.', price: 1080, type: 'siteTheme', value: 'cobblemon', icon: '⛏️', iconAsset: '/theme-cobblemon-v3.webp', bundleItems: ['cursor-cobblemon','trail-cobblemon','name-cobblemon','badge-cobblemon'] },
  { id: 'site-wolverine', name: 'Coleção Wolverine', description: 'Tema geral premium: metal escuro, amarelo, garras, cursor, rastro, nome e emblema combinando. Você pode trocar cada parte depois.', price: 1140, type: 'siteTheme', value: 'wolverine', icon: '🦾', iconAsset: '/theme-wolverine-v2.webp', bundleItems: ['cursor-wolverine','trail-wolverine','name-wolverine','badge-wolverine'] },
  { id: 'cursor-gta-neon', name: 'Cursor Neon Vice', description: 'Cursor rosa e ciano inspirado em noites tropicais de cidade.', price: 360, type: 'cursorStyle', value: 'gta-neon', icon: '🌴' },
  { id: 'trail-gta-neon', name: 'Rastro Neon Vice', description: 'Rastro magenta e ciano brilhante.', price: 270, type: 'trailStyle', value: 'gta-neon', icon: '🌆' },
  { id: 'name-gta-neon', name: 'Nome Vice Neon', description: 'Degradê rosa e azul elétrico para seu nome.', price: 330, type: 'nameStyle', value: 'gta-neon', icon: '💗' },
  { id: 'badge-gta-neon', name: 'Emblema Palmeira Neon', description: 'Palmeira tropical junto ao nome.', price: 260, type: 'badge', value: '🌴', icon: '🌴' },
  { id: 'cursor-cobblemon', name: 'Cursor Bloco Selvagem', description: 'Cursor pixelado de aventura para o mundo Cobblemon.', price: 340, type: 'cursorStyle', value: 'cobblemon', icon: '⛏️' },
  { id: 'trail-cobblemon', name: 'Rastro Grama Pixel', description: 'Rastro verde em pequenos blocos.', price: 260, type: 'trailStyle', value: 'cobblemon', icon: '🟩' },
  { id: 'name-cobblemon', name: 'Nome Aventura Pixel', description: 'Nome verde-limão com relevo de jogo em blocos.', price: 320, type: 'nameStyle', value: 'cobblemon', icon: '🐾' },
  { id: 'badge-cobblemon', name: 'Emblema Criatura Elétrica', description: 'Raio de aventura junto ao nome.', price: 250, type: 'badge', value: '⚡', icon: '⚡' },
  { id: 'cursor-wolverine', name: 'Cursor Garra Adamantium', description: 'Cursor metálico com três garras amarelas.', price: 370, type: 'cursorStyle', value: 'wolverine', icon: '🦾' },
  { id: 'trail-wolverine', name: 'Rastro de Garras', description: 'Rastro dourado quente, como cortes rápidos no metal.', price: 280, type: 'trailStyle', value: 'wolverine', icon: '⚡' },
  { id: 'name-wolverine', name: 'Nome Fera Dourada', description: 'Nome amarelo metálico com sombra forte.', price: 340, type: 'nameStyle', value: 'wolverine', icon: '🟨' },
  { id: 'badge-wolverine', name: 'Emblema Fera de Garras', description: 'Marca selvagem junto ao nome.', price: 270, type: 'badge', value: '🐾', icon: '🐾' },
  { id: 'site-samurai', name: 'Coleção Samurai: Névoa de Yōtei', description: 'Tema geral premium: pôr do sol japonês, pétalas ao vento, cursor, rastro, nome e emblema combinando. Você pode trocar cada parte depois.', price: 1160, type: 'siteTheme', value: 'samurai', icon: '⛩️', iconAsset: '/theme-samurai-v2.webp', bundleItems: ['cursor-samurai','trail-samurai','name-samurai','badge-samurai'] },
  { id: 'site-god-war', name: 'Coleção God of War: Norte Antigo', description: 'Tema geral premium: gelo, runas, fogo e metal, com cursor, rastro, nome e emblema combinando. Você pode trocar cada parte depois.', price: 1160, type: 'siteTheme', value: 'god-war', icon: '🪓', iconAsset: '/theme-god-war-v2.webp', bundleItems: ['cursor-god-war','trail-god-war','name-god-war','badge-god-war'] },
  { id: 'site-halloween-bloodmoon', name: 'Tema Halloween: Lua de Sangue', description: 'Tema individual em vinho, preto e vermelho lunar. Esta compra libera somente o tema.', price: 430, type: 'siteTheme', value: 'halloween-bloodmoon', icon: '🌕', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'site-halloween-toxic-fog', name: 'Tema Halloween: Névoa Tóxica', description: 'Tema individual em verde ectoplasma, violeta e sombras profundas. Esta compra libera somente o tema.', price: 430, type: 'siteTheme', value: 'halloween-toxic-fog', icon: '🧪', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'site-halloween-haunted', name: 'Tema Premium Halloween 51: Noite Assombrada', description: 'Coleção premium no padrão da loja: libera o tema, um Cursor Vassoura Fantasma, um Rastro Gosma Ectoplásmica, um Nome Ectoplasma 51, um Emblema Abóbora Radioativa e uma Moldura Runa Assombrada. Tudo permanece seu depois do evento.', price: 1390, type: 'siteTheme', value: 'halloween-haunted', icon: '🎃', seasonalEvent: HALLOWEEN_2026.id, bundleItems: ['cursor-halloween-broom','trail-halloween-slime','name-halloween-ectoplasm','badge-halloween-pumpkin','frame-halloween-rune'] },
  { id: 'cursor-samurai', name: 'Cursor Katana do Vento', description: 'Cursor vermelho e aço inspirado em uma lâmina samurai.', price: 360, type: 'cursorStyle', value: 'samurai', icon: '⚔️' },
  { id: 'trail-samurai', name: 'Rastro Pétalas ao Vento', description: 'Rastro rosado de pétalas rápidas.', price: 270, type: 'trailStyle', value: 'samurai', icon: '🌸' },
  { id: 'name-samurai', name: 'Nome Crepúsculo Samurai', description: 'Nome branco e vermelho com elegância de tinta.', price: 330, type: 'nameStyle', value: 'samurai', icon: '🎴' },
  { id: 'badge-samurai', name: 'Emblema Portal Samurai', description: 'Portal japonês junto ao nome.', price: 260, type: 'badge', value: '⛩️', icon: '⛩️' },
  { id: 'cursor-god-war', name: 'Cursor Machado Rúnico', description: 'Cursor gelado em aço e azul rúnico.', price: 370, type: 'cursorStyle', value: 'god-war', icon: '🪓' },
  { id: 'trail-god-war', name: 'Rastro Gelo Rúnico', description: 'Rastro azul de runas geladas.', price: 280, type: 'trailStyle', value: 'god-war', icon: '❄️' },
  { id: 'name-god-war', name: 'Nome Runa de Guerra', description: 'Nome em gelo e brasa com contraste forte.', price: 340, type: 'nameStyle', value: 'god-war', icon: 'ᚱ' },
  { id: 'badge-god-war', name: 'Emblema Runa do Norte', description: 'Runa nórdica junto ao nome.', price: 270, type: 'badge', value: 'ᚱ', icon: 'ᚱ' },
  { id: 'cursor-halloween-broom', name: 'Cursor Vassoura Fantasma', description: 'Uma vassoura de bruxa da Área 51 com ponta clara e precisa para clicar.', price: 370, type: 'cursorStyle', value: 'halloween-broom', icon: '🧹', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'cursor-halloween-pumpkin', name: 'Cursor Abóbora Radioativa', description: 'Uma seta-abóbora verde e laranja com ponta de clique bem definida.', price: 350, type: 'cursorStyle', value: 'halloween-pumpkin', icon: '🎃', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'cursor-halloween-mask', name: 'Cursor Máscara do Acampamento 51', description: 'Máscara de terror alienígena original. Ao mover, deixa automaticamente um rastro irregular de sangue.', price: 390, type: 'cursorStyle', value: 'halloween-mask', icon: '🔪', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'trail-halloween-slime', name: 'Rastro Gosma Ectoplásmica', description: 'Gotas de gosma verde radioativa acompanham o cursor sem bloquear cliques.', price: 310, type: 'trailStyle', value: 'halloween-slime', icon: '🟢', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'name-halloween-ectoplasm', name: 'Nome Ectoplasma 51', description: 'Letras verde-fantasma com brilho suave para perfil, topo e menu.', price: 340, type: 'nameStyle', value: 'halloween-ectoplasm', icon: '🟢', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'badge-halloween-pumpkin', name: 'Emblema Abóbora Radioativa', description: 'Uma abóbora alienígena acompanha seu nome em todo o portal.', price: 270, type: 'badge', value: '🎃', icon: '🎃', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'frame-halloween-rune', name: 'Moldura Runa Assombrada', description: 'Moldura violeta e laranja com runas e brilho de terror extraterrestre.', price: 330, type: 'frame', value: 'halloween-rune', icon: '🕸️', seasonalEvent: HALLOWEEN_2026.id },
  { id: 'site-sovereign-command', name: 'Tema Comando Soberano 51', description: 'Tema geral administrativo: cidadela cósmica, ouro, violeta e tecnologia alienígena. Exclusivo do administrador.', price: 0, type: 'siteTheme', value: 'sovereign', icon: '👑', adminOnly: true },
  { id: 'frame-sovereign-command', name: 'Moldura Soberana 51', description: 'Ouro imperial, violeta cósmico e brilho de comando em todo lugar onde seu perfil aparece.', price: 0, type: 'frame', value: 'sovereign', icon: '👑', adminOnly: true },
  { id: 'name-sovereign-command', name: 'Nome do Comandante', description: 'Tipografia dourada com reflexo violeta exclusiva de administrador.', price: 0, type: 'nameStyle', value: 'sovereign', icon: '✦', adminOnly: true },
  { id: 'trail-sovereign-command', name: 'Rastro de Comando', description: 'Rastro dourado-violeta com partículas de energia soberana.', price: 0, type: 'trailStyle', value: 'sovereign', icon: '✨', adminOnly: true },
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
  { id: 'cursor-petista', name: 'Seta Lula', description: 'Seta vermelha com estrela amarela, bem visível e precisa para navegar.', price: 360, type: 'cursorStyle', value: 'petista', icon: '⭐' },
  { id: 'cursor-bolsonaro', name: 'Seta Bolsonaro', description: 'Seta em formato de arminha estilizada. Ao mover, solta um rastro de ação visual.', price: 360, type: 'cursorStyle', value: 'bolsonaro', icon: '👉' },
  { id: 'cursor-umbanda', name: 'Seta Muito Axé', description: 'Seta em tons dourados e violeta. Ao mover, deixa mensagens de muito axé.', price: 370, type: 'cursorStyle', value: 'umbanda', icon: '✨' },
  { id: 'cursor-unicorn', name: 'Unicórnio Galopante Premium', description: 'Libera o unicórnio completo que galopa, vira e reage ao clique.', price: 590, type: 'cursorStyle', value: 'unicorn', icon: '🏇' },
  { id: 'cursor-ufo-scout', name: 'Cursor Disco Batedor', description: 'Disco voador compacto com feixe azul e ponta de clique precisa.', price: 360, type: 'cursorStyle', value: 'ufo', icon: '🛸' },
  { id: 'cursor-stellar-wand', name: 'Cursor Varinha Estelar', description: 'Varinha violeta com estrela de brilho e ponta de clique clara.', price: 390, type: 'cursorStyle', value: 'wand', icon: '🪄' },
  { id: 'cursor-comet-tail', name: 'Cursor Cometa Veloz', description: 'Cometa azul com cauda luminosa para atravessar a Área 51.', price: 350, type: 'cursorStyle', value: 'comet-tail', icon: '☄️' },
  { id: 'cursor-thunder-core', name: 'Cursor Raio de Plasma', description: 'Raio dourado e azul com núcleo elétrico e clique de alta visibilidade.', price: 380, type: 'cursorStyle', value: 'thunder', icon: '⚡' },
  { id: 'cursor-thor', name: 'Mjölnir Retornável', description: 'O martelo de Thor vira seu cursor. Clique, arraste e solte para arremessar; pressione T ou clique para chamá-lo de volta.', price: 540, type: 'cursorStyle', value: 'thor', icon: '🔨' },
  { id: 'cursor-web-slinger', name: 'Cursor Lançador de Teia', description: 'Luva aracnídea premium: clique, arraste e solte para lançar uma teia até o ponto mirado.', price: 430, type: 'cursorStyle', value: 'web-slinger', icon: '🕸️' },
  { id: 'cursor-messi', name: 'Cursor Messi 10', description: 'Seta ilustrada com camisa azul e branca e o número 10. Ao mover, deixa o recado “hijo da puta”.', price: 420, type: 'cursorStyle', value: 'messi', icon: '⚽' },
  { id: 'cursor-cristiano', name: 'Cursor Cristiano 7', description: 'Seta ilustrada vermelha, com pose de comemoração e o número 7. Ao mover, manda um “siuuuuuuuu”.', price: 420, type: 'cursorStyle', value: 'cristiano', icon: '⚽' },
  { id: 'cursor-pele', name: 'Cursor Pelé 10', description: 'Seta amarela e verde com o número 10. Ao mover, aparece “não, o Jô Soares sua fdp”.', price: 420, type: 'cursorStyle', value: 'pele', icon: '⚽' },
  { id: 'cursor-maradona', name: 'Cursor Maradona 10', description: 'Seta azul e branca com cabelo cacheado, número 10 e rastro branco junto da frase “quiero pó”.', price: 440, type: 'cursorStyle', value: 'maradona', icon: '⚽' },
  { id: 'cursor-neymar', name: 'Cursor Neymar 10', description: 'Seta amarela e verde com faixa no cabelo e o número 10. Ao mover, solta “caiu, falta nele”.', price: 420, type: 'cursorStyle', value: 'neymar', icon: '⚽' },
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
  { id: 'power-reveal-curse-author', name: 'Rastreador de Autoria', description: 'Escolha qualquer maldição enviada após a estreia deste poder e revele a todos quem a enviou. Cada uso revela uma autoria; maldições antigas não são elegíveis.', price: 2500, fixedPrice: true, type: 'power', value: 'revealCurseAuthor', icon: '🕵️', consumable: true, cursePowerV2: true },
  { id: 'power-shield-gay', name: 'Escudo da Rodada', description: 'Fica no inventário. Se você for sorteado como Gay, poderá usar para reabrir o sorteio sem consumir o poder antes da hora.', price: 320, type: 'power', value: 'shieldGay', icon: '🛡️', consumable: true },
  { id: 'power-theme', name: 'Controle de Tema', description: 'Use entre rodadas para abrir a próxima já com o tema escolhido.', price: 450, type: 'power', value: 'chooseTheme', icon: '🎨', consumable: true },
  { id: 'power-force-gay-cursor', name: 'Seta Gay Compulsória', description: 'Envie a outro participante ativo: a seta arco-íris cômica permanece por 24 horas.', price: 520, type: 'power', value: 'forceGayCursor', icon: '🌈', consumable: true },
  { id: 'power-choose-gay', name: 'Controle Gay da Rodada', description: 'Use durante a rodada, antes do sorteio especial. Escudos ativos são respeitados.', price: 650, type: 'power', value: 'chooseGay', icon: '👑', consumable: true },
  { id: 'power-choose-wallpaper', name: 'Escolha Meu Wallpaper', description: 'Depois de todos enviarem, veja os wallpapers sem autoria e reserve um deles para você.', price: 580, type: 'power', value: 'chooseWallpaper', icon: '🖼️', consumable: true },
  { id: 'power-assign-wallpaper', name: 'Definir Wallpaper de Outro Player', description: 'Depois de todos enviarem, escolha anonimamente qual wallpaper outro participante receberá.', price: 680, type: 'power', value: 'assignWallpaper', icon: '🎯', consumable: true },
  { id: 'power-giant-slow-cursor', name: 'Maldição do Mouse Gigante', description: 'Envie a outro participante ativo: ele usa mouse gigante por 24 horas. Não depende de rodada aberta.', price: 430, type: 'power', value: 'forceGiantCursor', icon: '🐌', consumable: true },
  { id: 'power-adhd-cursor', name: 'Maldição TDAH', description: 'Envie a outro participante: aleatoriamente o cursor mostra TDAH ATIVADO e se move sozinho por cerca de 30 segundos.', price: 460, type: 'power', value: 'forceAdhdCursor', icon: '⚡', consumable: true },
  { id: 'power-dev-darkness', name: 'Maldição do Dev', description: 'Envie a outro participante: a tela fica escura e só a lâmpada-cursor ilumina o caminho por 24 horas.', price: 490, type: 'power', value: 'forceDevDarkness', icon: '💡', consumable: true },
  { id: 'power-cleaning-curse', name: 'Maldição da Limpeza', description: 'Envie a outro participante: por 24 horas, uma nova camada de poeira e terra aparece a cada hora. Ele precisa varrer cada turno para usar o portal.', price: 510, type: 'power', value: 'forceCleaningCurse', icon: '🧹', consumable: true },
  { id: 'power-hater-curse', name: 'Maldição do Hater', description: 'Envie a outro participante: provocações aparecem aleatoriamente na tela por 24 horas.', price: 490, type: 'power', value: 'forceHaterCurse', icon: '🖕', consumable: true },
  { id: 'power-givaldo-curse', name: 'Maldição Givaldo', description: 'Envie a outro participante: fotos e frases aparecem e somem ao longo de 24 horas sem impedir o uso do site. Versão normal aceita Antídoto.', price: 490, fixedPrice: true, type: 'power', value: 'forceGivaldoCurse', icon: '🎭', iconAsset: '/givaldo/givaldo-1.png', consumable: true },
  { id: 'box-sonda', name: 'Caixa Sonda Surpresa', description: 'Vai fechada para o perfil. Abra quando quiser ou venda por créditos.', price: 140, sellPrice: 80, type: 'mysteryBox', value: 'sonda', icon: '📦', mysteryBox: true, tier: 'sonda', creditChance: .42, powerChance: .12, minRewardPrice: 120, maxRewardPrice: 300, creditMin: 110, creditMax: 180 },
  { id: 'box-cosmic', name: 'Caixa Cósmica', description: 'Vai fechada para o perfil. Pode revelar um visual especial, créditos ou um poder.', price: 300, sellPrice: 180, type: 'mysteryBox', value: 'cosmic', icon: '🎁', mysteryBox: true, tier: 'cosmic', creditChance: .32, powerChance: .24, minRewardPrice: 240, maxRewardPrice: 520, creditMin: 240, creditMax: 380 },
  { id: 'box-area51', name: 'Cofre Secreto Área 51', description: 'O baú premium mais raro. Guarde, abra com a roleta de prêmios ou venda por créditos.', price: 520, sellPrice: 330, type: 'mysteryBox', value: 'area51', icon: '🛸', mysteryBox: true, tier: 'area51', creditChance: .22, powerChance: .36, minRewardPrice: 330, maxRewardPrice: 650, creditMin: 430, creditMax: 650 },
];
SHOP_CATALOG.forEach((item) => { if (item.price > 0 && !item.fixedPrice) item.price = retailPriceWithCents(item.price); });

const HALLOWEEN_ADMIN_COSMETIC_OVERRIDES = Object.freeze({
  'site-sovereign-command': { name: 'Tema Comando da Cripta 51', description: 'Durante o Halloween, a cidadela do Comando Soberano recebe lua de sangue, energia ectoplásmica e arquitetura assombrada. Depois do evento, volta automaticamente ao visual original.', value: 'sovereign-halloween', icon: '🌑' },
  'cursor-admin-command': { name: 'Cursor do Comandante Sombrio', description: 'Durante o Halloween, a seta de comando assume obsidiana, ouro antigo, cristal rubro e brilho ectoplásmico.', value: 'commander-halloween', icon: '🗡️' },
  'name-sovereign-command': { name: 'Nome Comandante do Além', description: 'Durante o Halloween, o nome dourado recebe sombras vinho e energia espectral.', value: 'sovereign-halloween', icon: '✦' },
  'frame-sovereign-command': { name: 'Moldura Trono Assombrado 51', description: 'Durante o Halloween, a moldura soberana recebe metal negro, ouro envelhecido, vinho e cristais ectoplásmicos.', value: 'sovereign-halloween', icon: '🕸️' },
  'badge-crown': { name: 'Emblema Coroa Maldita', description: 'Durante o Halloween e somente para o administrador, a Coroa Cósmica assume a forma do comandante alienígena assombrado.', value: 'admin-halloween', icon: '👑' },
});

function cosmeticCatalogItemForUser(item, user, localPreview = false) {
  if (!item || user?.role !== 'admin' || !currentHalloweenEvent(localPreview)) return item;
  const seasonal = HALLOWEEN_ADMIN_COSMETIC_OVERRIDES[item.id];
  return seasonal ? { ...item, ...seasonal } : item;
}

function equippedCosmeticsForUser(user, equipped, localPreview = false) {
  // O Halloween pode transformar a arte dos visuais soberanos já escolhidos,
  // mas não pode sobrescrever a coleção ativa do administrador. Forçar itens
  // aqui fazia o botão salvar a escolha e a resposta seguinte fingir que ela
  // não estava equipada.
  return equipped;
}

// Cada posição representa exatamente um setor visual da roleta. O servidor
// sorteia o índice e o navegador anima até esse mesmo setor.
const CASINO_WHEEL_OUTCOMES = [
  0, 1, 1, 1.5, 'box-sonda', 1, 1, 1, 1.5, .5, 0, 1, 1, 1.5, 'box-cosmic', 0, 1, 2, 1.5, 1,
  0, .5, 'box-sonda', 1.5, 0, .5, 1, 'box-area51', 1.5, .5, 0, 1, 3, 'box-cosmic', .5, 1.5, 1, 2, 'box-sonda', 1,
];
const CASINO_JACKPOT = { seed: 500, minBet: 30, chance: .001, contribution: .01 };
const PLINKO_PROFILES = {
  low: { id: 'low', multipliers: [.4, .6, .8, .95, 1.05, 1.07, 1.05, .95, .8, .6, .4], returnPercent: 99.95 },
  medium: { id: 'medium', multipliers: [.1, .25, .5, .8, 1.15, 1.1, 1.15, .8, .5, .25, .1], returnPercent: 97.89 },
  high: { id: 'high', multipliers: [10, 5, 2, 1, .6, .82, .6, 1, 2, 5, 10], returnPercent: 97.54 },
};
// Tabela explícita do Caça-Níquel 51. Os prêmios são retorno total da aposta.
// A soma ponderada é 97,5%, incluindo a combinação máxima x100. A distribuição
// prioriza retornos pequenos e empates para evitar longas sequências negativas.
const SLOT_OUTCOMES = [
  { id: 'pair-comet', chance: .1866, multiplier: 1, symbols: ['comet', 'crystal', 'comet'], label: 'Par de Cometas' },
  { id: 'pair-ufo', chance: .30575, multiplier: 1.2, symbols: ['ufo', 'alien', 'ufo'], label: 'Par de Discos' },
  { id: 'pair-alien', chance: .1, multiplier: 1.5, symbols: ['alien', 'eye', 'alien'], label: 'Par de Aliens' },
  { id: 'triple-comet', chance: .03425, multiplier: 2, symbols: ['comet', 'comet', 'comet'], label: 'Três Cometas' },
  { id: 'triple-ufo', chance: .025, multiplier: 4, symbols: ['ufo', 'ufo', 'ufo'], label: 'Três Discos' },
  { id: 'triple-alien', chance: .006, multiplier: 8, symbols: ['alien', 'alien', 'alien'], label: 'Três Aliens' },
  { id: 'triple-crystal', chance: .002, multiplier: 15, symbols: ['crystal', 'crystal', 'crystal'], label: 'Três Cristais' },
  { id: 'triple-eye', chance: .0003, multiplier: 50, symbols: ['eye', 'eye', 'eye'], label: 'Olho do Vazio' },
  { id: 'triple-51', chance: .0001, multiplier: 100, symbols: ['fiftyone', 'fiftyone', 'fiftyone'], label: 'TRIPLA 51' },
  { id: 'none', chance: .34, multiplier: 0, symbols: ['ufo', 'crystal', 'alien'], label: 'Sem combinação' },
];
const SLOT_RETURN_PERCENT = 97.5;
function slotOutcome() {
  let cursor = Math.random();
  for (const outcome of SLOT_OUTCOMES) { cursor -= outcome.chance; if (cursor < 0) return outcome; }
  return SLOT_OUTCOMES.at(-1);
}

const COBBLEMON_BOXES = {
  // Mantida apenas para leitura do histórico. Novas aberturas são bloqueadas.
  trainer: { name: 'Carga de Treinador', retired: true, price: 179.90, rewards: [{ id: 'poke-ball', name: 'Poké Ball ×64', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Poke_Ball.png', sellPrice: 55, weight: 55 }, { id: 'great-ball', name: 'Great Ball ×64', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Great_Ball.png', sellPrice: 80, weight: 25 }, { id: 'ancient-ball', name: 'Ancient Poké Ball ×32', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Ancient_Poke_Ball.png', sellPrice: 95, weight: 12 }, { id: 'quick-ball', name: 'Quick Ball ×16', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Quick_Ball.png', sellPrice: 120, weight: 8 }] },
  evolution: { name: 'Baú das Pedras', price: 479.90, rewards: [
    { id: 'fire-stone', name: 'Pedra do Fogo ×4', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Fire_Stone.png', sellPrice: 140, weight: 14 },
    { id: 'water-stone', name: 'Pedra da Água ×4', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Water_Stone.png', sellPrice: 140, weight: 14 },
    { id: 'thunder-stone', name: 'Pedra do Trovão ×4', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Thunder_Stone.png', sellPrice: 140, weight: 14 },
    { id: 'leaf-stone', name: 'Pedra da Folha ×4', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Leaf_Stone.png', sellPrice: 140, weight: 14 },
    { id: 'ice-stone', name: 'Pedra do Gelo ×3', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Ice_Stone.png', sellPrice: 160, weight: 8 },
    { id: 'sun-stone', name: 'Pedra do Sol ×3', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Sun_Stone.png', sellPrice: 160, weight: 8 },
    { id: 'moon-stone', name: 'Pedra da Lua ×3', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Moon_Stone.png', sellPrice: 160, weight: 8 },
    { id: 'dawn-stone', name: 'Pedra da Alvorada ×2', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Dawn_Stone.png', sellPrice: 180, weight: 7 },
    { id: 'dusk-stone', name: 'Pedra do Crepúsculo ×2', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Dusk_Stone.png', sellPrice: 180, weight: 7 },
    { id: 'shiny-stone', name: 'Pedra Brilhante ×1', sprite: 'https://wiki.cobblemon.com/index.php/Special:FilePath/Shiny_Stone.png', sellPrice: 220, weight: 6 },
  ] },
  // Baú Premium: uma única recompensa física, sempre identificada e entregue
  // pelo Davi. Os pesos fecham exatamente 100%, sem categorias ou escolhas.
  master: { name: 'Baú Premium', price: 1499.90, forceDelivery: true, rewards: [
    { id: 'clear-bell', name: 'Clear Bell', itemId: 'legendarymonuments:clear_bell', sprite: '/legendary-monuments/premium/clear_bell.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Relíquia da jornada de Ho-Oh.' },
    { id: 'medallion-of-renewal', name: 'Medallion of Renewal', itemId: 'legendarymonuments:medallion_of_renewal', sprite: '/legendary-monuments/premium/medallion_of_renewal.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Permite reutilizar uma ativação de pedestal uma vez.' },
    { id: 'reawakening-tablet-full', name: 'Tábua do Despertar — 100% cheia', itemId: 'legendarymonuments:tablet_of_reawakening', sprite: '/legendary-monuments/premium/tablet_of_reawakening_4.png', sellPrice: 0, weight: 2.08, forceDelivery: true, deliveryNote: 'Entregar a Tábua do Despertar no estado de 100% de carga para o Reawakening Sanctum.' },
    { id: 'origin-key', name: 'Origin Key', itemId: 'legendarymonuments:origin_key', sprite: '/legendary-monuments/premium/origin_key.png', sellPrice: 0, weight: 2.08, forceDelivery: true, deliveryNote: 'Chave da progressão do Reawakening Sanctum.' },
    { id: 'azure-flute', name: 'Azure Flute', itemId: 'legendarymonuments:azure_flute', sprite: '/legendary-monuments/premium/azure_flute.png', sellPrice: 0, weight: 1.25, forceDelivery: true, deliveryNote: 'Acessa o Hall of Origin na jornada de Arceus, após os demais requisitos.' },
    { id: 'silver-wing', name: 'Silver Wing', itemId: 'legendarymonuments:silver_wing', sprite: '/legendary-monuments/premium/silver_wing.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Relíquia da jornada de Lugia.' },
    { id: 'rock-pauldron', name: 'Espaldeira de Rocha', itemId: 'legendarymonuments:rock_pauldron', sprite: '/legendary-monuments/premium/rock_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'ice-pauldron', name: 'Espaldeira de Gelo', itemId: 'legendarymonuments:ice_pauldron', sprite: '/legendary-monuments/premium/ice_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'steel-pauldron', name: 'Espaldeira de Aço', itemId: 'legendarymonuments:steel_pauldron', sprite: '/legendary-monuments/premium/steel_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'electric-pauldron', name: 'Espaldeira Elétrica', itemId: 'legendarymonuments:electric_pauldron', sprite: '/legendary-monuments/premium/electric_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'dragon-pauldron', name: 'Espaldeira de Dragão', itemId: 'legendarymonuments:dragon_pauldron', sprite: '/legendary-monuments/premium/dragon_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'titan-pauldron', name: 'Espaldeira de Titã', itemId: 'legendarymonuments:titan_pauldron', sprite: '/legendary-monuments/premium/titan_pauldron.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: 'Componente da jornada Regi.' },
    { id: 'titan-hammer', name: 'Titan Hammer', itemId: 'legendarymonuments:titan_hammer', sprite: '/legendary-monuments/premium/titan_hammer.png', sellPrice: 0, weight: 2.08, forceDelivery: true, deliveryNote: 'Item da progressão dos Regis.' },
    { id: 'hero-sword', name: 'Hero Sword', itemId: 'legendarymonuments:herosword', sprite: '/legendary-monuments/premium/herosword.png', sellPrice: 0, weight: 2.08, forceDelivery: true, deliveryNote: 'Usada com um Totem da Imortalidade para evocar Zacian.' },
    { id: 'hero-shield', name: 'Hero Shield', itemId: 'legendarymonuments:heroshield', sprite: '/legendary-monuments/premium/heroshield.png', sellPrice: 0, weight: 2.08, forceDelivery: true, deliveryNote: 'Relíquia da jornada de Zamazenta.' },
    { id: 'iceroot-carrot', name: 'Cenoura de Raiz de Gelo', itemId: 'legendarymonuments:iceroot_carrot', sprite: '/legendary-monuments/premium/iceroot_carrot.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Usada para evocar Glastrier.' },
    { id: 'shaderoot-carrot', name: 'Cenoura de Shaderoot', itemId: 'legendarymonuments:shaderoot_carrot', sprite: '/legendary-monuments/premium/shaderoot_carrot.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Usada para evocar Spectrier.' },
    { id: 'aurora-essence-x16', name: 'Essência de Aurora ×16', itemId: 'legendarymonuments:aurora_essence', sprite: '/legendary-monuments/premium/aurora_essence.png', sellPrice: 0, weight: 3.33, forceDelivery: true, deliveryNote: '16 Essências de Aurora — quantidade necessária para formar o Frasco de Essência de Aurora na jornada de Xerneas.' },
    { id: 'galarian-urn-embers', name: 'Urna das Brasas de Galar', itemId: 'legendarymonuments:galarian_urn_of_embers', sprite: '/legendary-monuments/premium/galarian_urn_of_embers.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Componente definido da mecânica Dynamax.' },
    { id: 'galarian-urn-frost', name: 'Urna da Geada de Galar', itemId: 'legendarymonuments:galarian_urn_of_frost', sprite: '/legendary-monuments/premium/galarian_urn_of_frost.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Componente definido da mecânica Dynamax.' },
    { id: 'galarian-urn-storms', name: 'Urna das Tempestades de Galar', itemId: 'legendarymonuments:galarian_urn_of_storms', sprite: '/legendary-monuments/premium/galarian_urn_of_storms.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Componente definido da mecânica Dynamax.' },
    { id: 'netherite-pickaxe', name: 'Picareta Netherite encantada', itemId: 'minecraft:netherite_pickaxe', sprite: '/legendary-monuments/premium/netherite_pickaxe.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Eficiência V, Fortuna III, Inquebrável III e Remendo.' },
    { id: 'netherite-axe', name: 'Machado Netherite encantado', itemId: 'minecraft:netherite_axe', sprite: '/legendary-monuments/premium/netherite_axe.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Eficiência V, Fortuna III, Inquebrável III e Remendo.' },
    { id: 'netherite-shovel', name: 'Pá Netherite encantada', itemId: 'minecraft:netherite_shovel', sprite: '/legendary-monuments/premium/netherite_shovel.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Eficiência V, Fortuna III, Inquebrável III e Remendo.' },
    { id: 'netherite-sword', name: 'Espada Netherite encantada', itemId: 'minecraft:netherite_sword', sprite: '/legendary-monuments/premium/netherite_sword.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Afiação V, Saque III, Aspecto Flamejante II, Inquebrável III e Remendo.' },
    { id: 'netherite-helmet', name: 'Capacete Netherite encantado', itemId: 'minecraft:netherite_helmet', sprite: '/legendary-monuments/premium/netherite_helmet.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Proteção IV, Respiração III, Afinidade Aquática, Inquebrável III e Remendo.' },
    { id: 'netherite-chestplate', name: 'Peitoral Netherite encantado', itemId: 'minecraft:netherite_chestplate', sprite: '/legendary-monuments/premium/netherite_chestplate.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Proteção IV, Inquebrável III e Remendo.' },
    { id: 'netherite-leggings', name: 'Calças Netherite encantadas', itemId: 'minecraft:netherite_leggings', sprite: '/legendary-monuments/premium/netherite_leggings.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Proteção IV, Inquebrável III e Remendo.' },
    { id: 'netherite-boots', name: 'Botas Netherite encantadas', itemId: 'minecraft:netherite_boots', sprite: '/legendary-monuments/premium/netherite_boots.png', sellPrice: 0, weight: 4.17, forceDelivery: true, deliveryNote: 'Proteção IV, Queda Suave IV, Passos Profundos III, Agilidade das Almas III, Inquebrável III e Remendo.' },
  ] },
  pokemon: { name: 'Baú Pokémon', price: 899.90, monthlyPokemon: true },
};

const COBBLEMON_ROULETTE_LEGACY = {
  price: 259.90,
  cooldownMs: 24 * 60 * 60 * 1000,
  rewards: [
    { id: 'no-prize', name: 'Não ganhou desta vez', sprite: 'https://wiki.cobblemon.com/images/6/6f/Poke_Ball.png', sellPrice: 0, weight: 35, noPrize: true },
    { id: 'poke-ball-roulette', name: 'Poké Ball ×32', sprite: 'https://wiki.cobblemon.com/images/6/6f/Poke_Ball.png', sellPrice: 45, weight: 24 },
    { id: 'great-ball-roulette', name: 'Great Ball ×24', sprite: 'https://wiki.cobblemon.com/images/4/45/Great_Ball.png', sellPrice: 65, weight: 16 },
    { id: 'quick-ball-roulette', name: 'Quick Ball ×16', sprite: 'https://wiki.cobblemon.com/images/b/be/Quick_Ball.png', sellPrice: 85, weight: 10 },
    { id: 'stone-roulette', name: 'Pedra evolutiva sortida ×2', sprite: 'https://wiki.cobblemon.com/images/6/63/Fire_Stone.png', sellPrice: 110, weight: 6 },
    { id: 'ultra-ball-roulette', name: 'Ultra Ball ×16', sprite: 'https://wiki.cobblemon.com/images/3/34/Ultra_Ball.png', sellPrice: 145, weight: 4 },
    { id: 'rare-candy-roulette', name: 'Rare Candy ×8', sprite: 'https://wiki.cobblemon.com/images/a/a2/Rare_Candy.png', sellPrice: 190, weight: 2 },
    { id: 'exp-candy-xl-roulette', name: 'Exp. Candy XL ×4', sprite: 'https://wiki.cobblemon.com/images/c/c6/Exp._Candy_XL.png', sellPrice: 250, weight: 1.5 },
    { id: 'ability-roulette', name: 'Ability Capsule', sprite: 'https://wiki.cobblemon.com/images/9/90/Ability_Capsule.png', sellPrice: 300, weight: .8 },
    { id: 'shiny-roulette', name: 'Voucher Shiny definido', sprite: 'https://wiki.cobblemon.com/images/c/c3/Cherish_Ball.png', sellPrice: 650, weight: .5 },
    { id: 'legendary-roulette', name: 'Voucher lendário definido', sprite: 'https://wiki.cobblemon.com/images/e/ee/Master_Ball.png', sellPrice: 900, weight: .2 },
  ],
};

// Ciclo aprovado da Roleta Cobblemon. A lista antiga é mantida acima apenas
// para não reinterpretar entregas e histórico já gravados.
const COBBLEMON_ROULETTE = {
  price: 259.90, weeklyLimit: 7,
  rewards: [
    ['no-prize','Sem prêmio','',0,23,{noPrize:true}],
    ['legendary-arc-phone','Arc Phone','/legendary-monuments/arc-phone.png',210,6,{itemId:'legendarymonuments:arc_phone'}],
    ['legendary-dream-catcher','Dream Catcher','/legendary-monuments/dream-catcher.png',220,6,{itemId:'legendarymonuments:dream_catcher'}],
    ['legendary-light-shards','Light Stone Shard ×3','/legendary-monuments/light-stone-shard.png',230,6,{itemId:'legendarymonuments:lightstone_shard'}],
    ['legendary-dark-shards','Dark Stone Shard ×3','/legendary-monuments/dark-stone-shard.png',230,6,{itemId:'legendarymonuments:darkstone_shard'}],
    ['legendary-golem-scrap','Golem Scrap ×4','/legendary-monuments/golem-scrap.png',190,7.5,{itemId:'legendarymonuments:golem_scrap'}],
    ['legendary-first-song-fragments','Disc of the First Song Fragment ×2','/legendary-monuments/first-song-fragment.png',240,5,{itemId:'legendarymonuments:disc_of_the_first_song_fragment'}],
    ['legendary-renewal-fragment','Medallion of Renewal Fragment','/legendary-monuments/renewal-fragment.png',700,.5,{itemId:'legendarymonuments:medallion_of_renewal_fragment'}],
    ['legendary-cosmic-catalyst','Cosmic Catalyst','/legendary-monuments/cosmic-catalyst.png',260,5,{itemId:'legendarymonuments:cosmic_bag'}],
    ['legendary-dyna-fruit','Dyna Fruit','/legendary-monuments/dyna-fruit.png',190,6,{itemId:'legendarymonuments:dyna_fruit'}],
    ['legendary-icerend-seal','Icerend Seal','/legendary-monuments/icerend-seal.png',300,3,{itemId:'legendarymonuments:icerend_seal'}],
    ['legendary-groundblight-seal','Groundblight Seal','/legendary-monuments/groundblight-seal.png',300,3,{itemId:'legendarymonuments:groundblight_seal'}],
    ['legendary-firescourge-seal','Firescourge Seal','/legendary-monuments/firescourge-seal.png',300,3,{itemId:'legendarymonuments:firescourge_seal'}],
    ['legendary-grasswither-seal','Grasswither Seal','/legendary-monuments/grasswither-seal.png',300,3,{itemId:'legendarymonuments:grasswither_seal'}],
    ['legendary-sacred-ash','Sacred Ash','/legendary-monuments/sacred-ash.png',480,1,{itemId:'legendarymonuments:sacred_ash'}],
    ['locator-chip-roulette','Locator Chip','/legendary-monuments/locator-chip.webp',360,2,{itemId:'lumymon:locator_chip'}],
    ['lucky-egg-roulette','Lucky Egg','https://wiki.cobblemon.com/index.php/Special:FilePath/Lucky_Egg.png',450,1,{itemId:'cobblemon:lucky_egg'}],
    ['fossil-location-roulette','Coordenadas de Escavação Fóssil','https://wiki.cobblemon.com/index.php/Special:FilePath/Dome_Fossil.png',0,1,{forceDelivery:true,deliveryNote:'Davi enviará no servidor a localização preparada de uma escavação fóssil.'}],
    ['master-ball-roulette','Master Ball','https://wiki.cobblemon.com/images/e/ee/Master_Ball.png',900,.5,{itemId:'cobblemon:master_ball'}],
    ['rare-candy-roulette','Rare Candy ×8','https://wiki.cobblemon.com/images/a/a2/Rare_Candy.png',190,5,{itemId:'cobblemon:rare_candy'}],
    ['exp-candy-l-roulette','Exp. Candy L ×8','https://wiki.cobblemon.com/index.php/Special:FilePath/Exp._Candy_L.png',220,4,{itemId:'cobblemon:exp_candy_l'}],
    ['exp-candy-xl-roulette','Exp. Candy XL ×4','https://wiki.cobblemon.com/images/c/c6/Exp._Candy_XL.png',250,2.5,{itemId:'cobblemon:exp_candy_xl'}],
  ].map(([id,name,sprite,sellPrice,weight,extra]) => ({ id,name,sprite,sellPrice,weight,...extra })),
};

function weightedCobblemonReward(box) {
  let roll = Math.random() * box.rewards.reduce((sum, entry) => sum + entry.weight, 0);
  return box.rewards.find((entry) => ((roll -= entry.weight) <= 0)) || box.rewards[0];
}

function cobblemonCapsuleDeliverySpec(pokemonId, rarity) {
  const sourced = cobblemonDeliverySpec(pokemonId);
  if (sourced) return sourced;
  // Algumas espécies não têm spawn natural listado no CobbleDex atual —
  // sobretudo lendários. Mantemos a chance e a espécie sorteada intactas e
  // usamos apenas para esses casos o nível de entrega já configurado pela
  // cápsula, identificado separadamente para não fingir que veio da fonte.
  const fallbackLevel = ({ legendary: 70, shiny: 40, rare: 30, common: 5 })[rarity] || 5;
  return { level: fallbackLevel, gender: rollCobblemonDeliveryGender(pokemonId), levelSource: 'capsule-no-natural-spawn' };
}

function monthlyCobblemonPokemonReward(userId = null, cycleId = null) {
  const roll = Math.random();
  const rarity = roll < .01 ? 'legendary' : roll < .05 ? 'shiny' : roll < .20 ? 'rare' : 'common';
  const legendary = COBBLEMON_CATALOG.filter((entry) => /legendary|mythical/.test(String(entry.l)));
  const rare = COBBLEMON_CATALOG.filter((entry) => /starter|powerhouse|fossil|baby|paradox|ultra_beast/.test(String(entry.l)) && !/legendary|mythical/.test(String(entry.l)));
  const common = COBBLEMON_CATALOG.filter((entry) => !/legendary|mythical|starter|powerhouse|fossil|baby|paradox|ultra_beast/.test(String(entry.l)));
  const pool = rarity === 'legendary' ? legendary : rarity === 'rare' ? rare : rarity === 'shiny' ? COBBLEMON_CATALOG.filter((entry) => !/legendary|mythical/.test(String(entry.l))) : common;
  // Um Pokémon que o participante já possui (capturado ou recebido em uma
  // cápsula anterior) não pode voltar a ser sorteado no ciclo atual. Isso
  // mantém o catálogo semanal independente dos ciclos anteriores e evita,
  // por exemplo, oferecer novamente um Metagross já entregue.
  const ownedIds = new Set();
  if (userId && typeof db !== 'undefined') {
    const dex = Array.isArray(db.economy?.cobblemonDex?.[userId]) ? db.economy.cobblemonDex[userId] : [];
    dex.forEach((entry) => {
      const id = Number(entry?.id ?? entry?.pokemonId);
      if (Number.isInteger(id) && id > 0) ownedIds.add(id);
    });
    const deliveries = Array.isArray(db.economy?.cobblemonDeliveries) ? db.economy.cobblemonDeliveries : [];
    const activeStatuses = new Set(['awaiting-delivery', 'delivered', 'claimed-no-delivery', 'cycle-candidate', 'weekly-choice-pending']);
    deliveries.filter((entry) => entry.userId === userId && entry.boxId === 'pokemon' && activeStatuses.has(entry.status)).forEach((entry) => {
      const id = Number(entry?.pokemonId ?? entry?.roll?.pokemonId);
      if (Number.isInteger(id) && id > 0) ownedIds.add(id);
    });
  }
  const eligiblePool = pool.filter((entry) => !ownedIds.has(Number(entry.i)));
  const pokemonPool = eligiblePool.length ? eligiblePool : pool;
  const pokemon = pokemonPool[Math.floor(Math.random() * pokemonPool.length)] || pool[0] || COBBLEMON_CATALOG[0];
  const specification = cobblemonCapsuleDeliverySpec(pokemon.i, rarity);
  const suffix = rarity === 'legendary' ? ' · LENDÁRIO' : rarity === 'shiny' ? ' · SHINY' : rarity === 'rare' ? ' · RARO' : '';
  const sellPrices = { common: 180, rare: 320, shiny: 600, legendary: 500 };
  return { id: `monthly-pokemon-${pokemon.i}-${rarity}`, name: `${pokemon.n}${suffix}`, sprite: `https://cobbledex.b-cdn.net/3dmons/previews/large/${Number(pokemon.i)}.webp`, sellPrice: sellPrices[rarity], pokemonId: Number(pokemon.i), rarity, isShiny: rarity === 'shiny', ...specification };
}

function cobblemonCaptureTierForPokemon(pokemonOrId) {
  const pokemon = typeof pokemonOrId === 'object' && pokemonOrId ? pokemonOrId : COBBLEMON_CATALOG.find((entry) => Number(entry.i) === Number(pokemonOrId));
  const tags = String(pokemon?.l || '');
  if (/legendary|mythical/.test(tags)) return 4;
  if (/powerhouse|ultra_beast|paradox/.test(tags)) return 3;
  if (/starter|fossil|baby/.test(tags)) return 2;
  return 1;
}

function cobblemonLevelRange(tier = 1) {
  const safeTier = Math.max(1, Math.min(4, Number(tier) || 1));
  return { floor: [0, 5, 25, 50, 70][safeTier], ceiling: [0, 30, 50, 75, 100][safeTier] };
}

function cobblemonLevelFitsTier(level, tier = 1) {
  const { floor, ceiling } = cobblemonLevelRange(tier);
  return Number.isInteger(Number(level)) && Number(level) >= floor && Number(level) <= ceiling;
}

function normalizedCobblemonLevel(id, tier = 1) {
  const safeTier = Math.max(1, Math.min(4, Number(tier) || 1));
  const { floor, ceiling } = cobblemonLevelRange(safeTier);
  return floor + ((Math.abs(Number(id) || 1) * 17) % (ceiling - floor + 1));
}

function createCobblemonEncounter(auth, pokemon, tier, level, isShiny = false) {
  const payload = Buffer.from(JSON.stringify({ userId: auth.user.id, pokemonId: Number(pokemon.i), tier, level, isShiny: Boolean(isShiny), expiresAt: Date.now() + 60 * 1000, nonce: randomBytes(12).toString('hex') })).toString('base64url');
  const signature = createHash('sha256').update(auth.token + '.' + payload).digest('base64url');
  return payload + '.' + signature;
}

function cobblemonCaptureBonusState(userId) {
  const caught = Array.isArray(db.economy.cobblemonDex?.[userId]) ? db.economy.cobblemonDex[userId] : [];
  const claimed = new Set((db.economy.cobblemonCaptureRewardClaims || []).filter((entry) => entry.userId === userId).map((entry) => entry.key));
  return {
    totalCaught: caught.length,
    rewards: { rare: COBBLEMON_CAPTURE_BONUSES.rare, legendary: COBBLEMON_CAPTURE_BONUSES.legendary, shiny: COBBLEMON_CAPTURE_BONUSES.shiny },
    milestones: COBBLEMON_CAPTURE_BONUSES.milestones.map((entry) => ({ ...entry, claimed: claimed.has(`milestone:${entry.target}`) })),
  };
}

function grantCobblemonCaptureBonuses(user, { pokemonId, tier, isShiny }) {
  db.economy.cobblemonCaptureRewardClaims ||= [];
  const claimed = new Set(db.economy.cobblemonCaptureRewardClaims.filter((entry) => entry.userId === user.id).map((entry) => entry.key));
  const grants = [];
  const grant = (key, amount, reason) => {
    if (claimed.has(key)) return;
    const createdAt = new Date().toISOString();
    const before = walletFor(user.id);
    addCredits(user.id, amount);
    db.economy.cobblemonCaptureRewardClaims.push({ id: randomUUID(), userId: user.id, key, amount, reason, createdAt });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-capture-bonus', amount, before, after: roundMoney(before + amount), reason, createdAt });
    claimed.add(key);
    grants.push({ key, amount, reason });
  };
  if (tier === 4) grant(`legendary:${pokemonId}`, COBBLEMON_CAPTURE_BONUSES.legendary, 'Bônus de primeira captura lendária');
  else if (tier === 3) grant(`rare:${pokemonId}`, COBBLEMON_CAPTURE_BONUSES.rare, 'Bônus de primeira captura rara');
  if (isShiny) grant(`shiny:${pokemonId}`, COBBLEMON_CAPTURE_BONUSES.shiny, 'Bônus de primeira captura shiny');
  const totalCaught = (Array.isArray(db.economy.cobblemonDex?.[user.id]) ? db.economy.cobblemonDex[user.id] : []).length;
  COBBLEMON_CAPTURE_BONUSES.milestones.filter((entry) => totalCaught >= entry.target).forEach((entry) => grant(`milestone:${entry.target}`, entry.reward, `Marco de ${entry.target} Pokémon capturados`));
  if (db.economy.cobblemonCaptureRewardClaims.length > 10000) db.economy.cobblemonCaptureRewardClaims = db.economy.cobblemonCaptureRewardClaims.slice(-10000);
  if (db.economy.creditAdjustments.length > 12000) db.economy.creditAdjustments = db.economy.creditAdjustments.slice(-12000);
  return { total: roundMoney(grants.reduce((sum, entry) => sum + entry.amount, 0)), grants, totalCaught };
}

function verifyCobblemonEncounter(auth, token) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) throw new HttpError(400, 'Encontro inválido. Procure o Pokémon novamente.');
  const expected = createHash('sha256').update(auth.token + '.' + payload).digest();
  let received; try { received = Buffer.from(signature, 'base64url'); } catch { throw new HttpError(400, 'Encontro inválido.'); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new HttpError(400, 'Encontro inválido.');
  let encounter; try { encounter = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new HttpError(400, 'Encontro inválido.'); }
  if (encounter.userId !== auth.user.id || Number(encounter.expiresAt) < Date.now()) throw new HttpError(409, 'O Pokémon foi embora. Procure outro.');
  return { encounter, payload };
}

const WEEKLY_MISSIONS = [
  { type: 'hydration_goal', title: 'Hidratação orbital', description: 'Alcance a meta de 2,5 L em 1 dia desta semana.', target: 1, reward: 60, icon: '💧' },
  { type: 'meme', title: 'Agente do caos', description: 'Publique 1 meme no mural durante a semana.', target: 1, reward: 45, icon: '😂' },
  { type: 'phrase', title: 'Filósofo alienígena', description: 'Publique 1 frase durante a semana.', target: 1, reward: 40, icon: '💬' },
  { type: 'water_log', title: 'Protocolo H₂O', description: 'Faça 3 registros de água durante a semana.', target: 3, reward: 45, icon: '🫗' },
  { type: 'comment', title: 'Conexão da tripulação', description: 'Comente em 2 publicações do mural durante a semana.', target: 2, reward: 35, icon: '🗨️' },
  { type: 'vote', title: 'Voz da rodada', description: 'Participe de 1 votação de wallpapers durante a semana.', target: 1, reward: 40, icon: '🗳️' },
];

const DAILY_MISSIONS = [
  { id: 'water-logs', icon: '🫗', title: 'Dois goles registrados', description: 'Registre água 2 vezes hoje.', target: 2, reward: 8, unit: 'registros' },
  { id: 'water-1500', icon: '💧', title: 'Rota dos 1,5 litros', description: 'Chegue a 1.500 ml de água hoje.', target: 1500, reward: 14, unit: 'ml' },
  { id: 'daily-post', icon: '💬', title: 'Voz da tripulação', description: 'Publique uma frase ou recado anônimo hoje.', target: 1, reward: 8, unit: 'postagem' },
  { id: 'daily-meme', icon: '😂', title: 'Meme do expediente', description: 'Publique um meme hoje.', target: 1, reward: 10, unit: 'meme' },
  { id: 'daily-comment', icon: '🗨️', title: 'Sinal de resposta', description: 'Comente em uma publicação do mural hoje.', target: 1, reward: 6, unit: 'comentário' },
  { id: 'daily-vote', icon: '🗳️', title: 'Sinal da tripulação', description: 'Vote em um wallpaper ou reaja a uma publicação do mural hoje.', target: 1, reward: 10, unit: 'interação' },
];

// A valorização continua sendo o lucro principal do Mercado 51. Estas
// recompensas só criam liquidez controlada para que o usuário não precise
// liquidar uma posição por falta de saldo para uma nova oportunidade.
const MARKET_DAILY_INCOME = 40;
const MARKET_DIVIDEND_DAILY_RATE = 0.0016; // a nova cadência de preços não multiplica dividendos
const MARKET_DIVIDEND_RATE_PER_UPDATE = MARKET_DIVIDEND_DAILY_RATE / (MARKET_UPDATE_TIMES.length / 3);
const MARKET_DIVIDEND_DAILY_CAP = 20;
// A renda e os dividendos do Cripto 51 não compartilham limite, resgate ou
// lançamentos com o Mercado 51. Mantemos os mesmos parâmetros iniciais para a
// economia continuar previsível enquanto o novo mercado ganha histórico.
const CRYPTO_DAILY_INCOME = 40;
const CRYPTO_DIVIDEND_DAILY_RATE = 0.0016;
const CRYPTO_DIVIDEND_DAILY_CAP = 20;
const MARKET_MISSIONS = [
  { id: 'market-order', icon: '📈', title: 'Primeira ordem do dia', description: 'Compre ou venda pelo menos uma unidade hoje.', reward: 10 },
  { id: 'market-hold', icon: '🪙', title: 'Mão firme', description: 'Mantenha uma posição durante uma atualização do Mercado.', reward: 15 },
];

function saoPauloWeekKey(date = new Date()) {
  const dayKey = saoPauloDayKey(date);
  const value = new Date(dayKey + 'T12:00:00Z');
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

const MONEY_EPSILON = 0.000001;
function roundMoney(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}
function parseMoney(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numeric = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = roundMoney(numeric);
  if (Math.abs(numeric - normalized) > MONEY_EPSILON || normalized < min || normalized > max) return null;
  return normalized;
}
function moneyCents(value) { return Math.round(roundMoney(value) * 100); }
function walletFor(userId) { return roundMoney(db.economy.wallets[userId] || 0); }
function addCredits(userId, amount) { db.economy.wallets[userId] = (moneyCents(walletFor(userId)) + moneyCents(amount)) / 100; }

const CASINO_DAILY_BONUS = 250;
const CASINO_CASHOUT_THRESHOLD = 500;
const CASINO_MONTH_START_BONUS_DAY = '2026-10-01';
const CASINO_MONTH_START_BONUS = 500;
const CASINO_MONTH_START_CASHOUT_THRESHOLD = 1000;
const CASINO_FRIDAY_BONUS_DAY = '2026-10-16';
const CASINO_FRIDAY_EXTRA_BONUS = 500;
function casinoFridayBonusActive(dayKey = saoPauloDayKey()) { return dayKey === CASINO_FRIDAY_BONUS_DAY; }
function casinoDailyBonusForDay(dayKey = saoPauloDayKey()) {
  return dayKey === CASINO_MONTH_START_BONUS_DAY ? CASINO_MONTH_START_BONUS : CASINO_DAILY_BONUS;
}
function casinoInitialBonusForDay(dayKey = saoPauloDayKey()) {
  return casinoFridayBonusActive(dayKey) ? CASINO_FRIDAY_EXTRA_BONUS : casinoDailyBonusForDay(dayKey);
}
function casinoCashoutThresholdForDay(dayKey = saoPauloDayKey()) {
  if (casinoFridayBonusActive(dayKey)) return roundMoney(casinoInitialBonusForDay(dayKey) * 2);
  return dayKey === CASINO_MONTH_START_BONUS_DAY ? CASINO_MONTH_START_CASHOUT_THRESHOLD : CASINO_CASHOUT_THRESHOLD;
}
function casinoCashoutThresholdForAccount(account) {
  const individualThreshold = Number(account?.cashoutThreshold);
  return Number.isFinite(individualThreshold) && individualThreshold > 0
    ? roundMoney(individualThreshold)
    : casinoCashoutThresholdForDay(account?.dayKey || saoPauloDayKey());
}
const LOTTERY_NUMBER_MAX = 50;
const LOTTERY_DRAW_COUNT = 6;
const LOTTERY_MIN_POOL = 50000;
const LOTTERY_TICKET_PLANS = Object.freeze({ 6: 100, 7: 650, 8: 2500, 9: 7500, 10: 20000 });
const LOTTERY_PRIZE_BANDS = Object.freeze([{ hits: 6, share: .65 }, { hits: 5, share: .20 }, { hits: 4, share: .15 }]);
const LOTTERY_DRAW_HOUR = 16;
// Exceção única para a primeira transmissão do sorteio: a rodada aberta nesta
// semana fecha às 17h; todas as rodadas seguintes continuam às 16h.
const LOTTERY_ONE_OFF_ROUND_ID = 'lottery:2026-09-10T19:00:00.000Z';
// A exceção ainda é a rodada iniciada na quinta anterior; a rodada seguinte
// será criada normalmente depois que esta apuração terminar.
const LOTTERY_ONE_OFF_ACTIVE_ROUND_ID = LOTTERY_ONE_OFF_ROUND_ID;
const LOTTERY_ONE_OFF_CLOSE_AT = '2026-09-17T20:00:00.000Z';
const LOTTERY_ONE_OFF_RESET_VERSION = '2026-09-17T20:00-clear-v4';
function casinoAccountFor(userId, create = false) {
  const dayKey = saoPauloDayKey(); const current = db.economy.casinoAccounts[userId];
  if (current?.dayKey === dayKey) return current;
  const dailyBonus = casinoInitialBonusForDay(dayKey);
  const initialAccount = { dayKey, balance: dailyBonus, cashedOut: false };
  if (casinoFridayBonusActive(dayKey)) initialAccount.cashoutThreshold = roundMoney(dailyBonus * 2);
  if (!create) return initialAccount;
  db.economy.casinoAccounts[userId] = { ...initialAccount, createdAt: new Date().toISOString() };
  return db.economy.casinoAccounts[userId];
}

function lotteryBoundaryFor(date = new Date()) {
  const dayKey = saoPauloDayKey(date);
  for (let offset = 0; offset <= 7; offset += 1) {
    const value = new Date(dayKey + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() - offset);
    if (![2, 4].includes(value.getUTCDay())) continue;
    const boundary = new Date(value.toISOString().slice(0, 10) + `T${String(LOTTERY_DRAW_HOUR).padStart(2, '0')}:00:00-03:00`);
    if (boundary.getTime() <= date.getTime()) return boundary;
  }
  throw new Error('Não foi possível calcular o próximo sorteio da Mega 51.');
}

function lotteryWindowFor(date = new Date()) {
  const start = lotteryBoundaryFor(date);
  const daysUntilNextDraw = start.getUTCDay() === 2 ? 2 : 5;
  return { id: 'lottery:' + start.toISOString(), startAt: start.toISOString(), closeAt: new Date(start.getTime() + daysUntilNextDraw * 24 * 60 * 60 * 1000).toISOString() };
}

async function archiveCasinoPlaysBefore(cutoffAt) {
  const cutoff = Date.parse(cutoffAt || '');
  if (!Number.isFinite(cutoff) || !Array.isArray(db?.economy?.casinoPlays)) return false;
  // Keep the visible results for each game and the latest jackpot notices in
  // the hot state. Older plays remain durable and searchable in the archive.
  const retained = new Set();
  const recentByGame = new Map();
  let jackpotNotices = 0;
  for (let index = db.economy.casinoPlays.length - 1; index >= 0; index -= 1) {
    const play = db.economy.casinoPlays[index];
    const game = play.resultType === 'slots' ? 'slots' : play.resultType === 'plinko' ? 'plinko' : play.resultType === 'flight' ? 'flight' : 'roulette';
    const key = String(play.userId || '') + ':' + game;
    const count = recentByGame.get(key) || 0;
    if (count < 6) { retained.add(play.id); recentByGame.set(key, count + 1); }
    if (play.resultType === 'casinoJackpot' && play.notifyJackpot && jackpotNotices < 5) { retained.add(play.id); jackpotNotices += 1; }
  }
  const archived = [];
  const current = [];
  db.economy.casinoPlays.forEach((play) => {
    if (Date.parse(play?.createdAt || '') < cutoff && !retained.has(play.id)) archived.push(play);
    else current.push(play);
  });
  if (!archived.length) return false;

  // Primeiro gravamos a cópia durável. INSERT OR IGNORE torna uma nova
  // tentativa após conflito de revisão segura: só removemos do estado depois
  // que cada registro já está preservado fora dele.
  for (let start = 0; start < archived.length; start += CASINO_ARCHIVE_BATCH_SIZE) {
    const statements = archived.slice(start, start + CASINO_ARCHIVE_BATCH_SIZE).map((play) => {
      const id = String(play.id || createHash('sha256').update(JSON.stringify(play)).digest('hex'));
      return runtimeEnv.DB.prepare('INSERT OR IGNORE INTO casino_play_archive(id, user_id, created_at, wallet_source, payload) VALUES (?, ?, ?, ?, ?)')
        .bind(id, String(play.userId || ''), String(play.createdAt || ''), String(play.walletSource || ''), JSON.stringify(play));
    });
    await runtimeEnv.DB.batch(statements);
  }

  const summary = db.economy.casinoArchiveSummary || { totalPlays: 0, shopWagered: 0 };
  summary.totalPlays = Number(summary.totalPlays || 0) + archived.length;
  summary.shopWagered = roundMoney(Number(summary.shopWagered || 0) + archived.reduce((sum, play) => sum + (play.walletSource === 'shop' ? Number(play.bet || 0) : 0), 0));
  summary.playsByDayUser ||= {};
  for (const play of archived) {
    const key = String(play.dayKey || '') + ':' + String(play.userId || '');
    summary.playsByDayUser[key] = Number(summary.playsByDayUser[key] || 0) + 1;
  }
  const today = saoPauloDayKey();
  summary.playsByDayUser = Object.fromEntries(Object.entries(summary.playsByDayUser).filter(([key]) => key.startsWith(today + ':')));
  db.economy.casinoArchiveSummary = summary;
  db.economy.casinoPlays = current;
  return true;
}

async function archivedCasinoPlay(userId, requestId, resultType) {
  if (!requestId) return null;
  const row = await runtimeEnv.DB.prepare("SELECT payload FROM casino_play_archive WHERE user_id = ? AND json_extract(payload, '$.requestId') = ? LIMIT 1")
    .bind(userId, requestId).first();
  if (!row?.payload) return null;
  const play = JSON.parse(String(row.payload));
  return resultType === 'roulette' ? play.resultType !== 'flight' && play.resultType !== 'slots' && play.resultType !== 'plinko' ? play : null : play.resultType === resultType ? play : null;
}

function lotterySeedForRound(round) {
  return createHash('sha256').update(String(round.secret || '') + ':' + String(round.id || '')).digest();
}

function lotteryNumbersForRound(round) {
  const seed = lotterySeedForRound(round);
  const numbers = [];
  let cursor = 0;
  while (numbers.length < LOTTERY_DRAW_COUNT) {
    const hash = createHash('sha256').update(seed).update(String(cursor++)).digest();
    const candidate = (hash.readUInt32BE(0) % LOTTERY_NUMBER_MAX) + 1;
    if (!numbers.includes(candidate)) numbers.push(candidate);
  }
  return numbers.sort((a, b) => a - b);
}

function lotteryProjectionForRound(round) {
  const ticketSales = roundMoney((db.economy.lottery.entries || []).filter((item) => item.roundId === round.id).reduce((sum, item) => sum + Number(item.price || 0), 0));
  const carryOver = roundMoney(round.carryOver || 0);
  const minimumPrizePool = Math.max(LOTTERY_MIN_POOL, Number(round.minimumPrizePool || 0));
  const basePrizePool = roundMoney(carryOver + minimumPrizePool);
  return {
    realWagered: ticketSales, ticketSales, houseMargin: 0, contribution: ticketSales, basePrizePool, apostometerTopUp: minimumPrizePool,
    prizePool: basePrizePool,
  };
}

function lotteryPayoutsForEntries(pool, entries, winningNumbers) {
  const payouts = []; let paid = 0;
  const hitsFor = (entry) => (entry.numbers || []).filter((number) => winningNumbers.includes(Number(number))).length;
  const sixWinners = entries.filter((entry) => hitsFor(entry) === 6);
  const lowerWinners = entries.some((entry) => [4, 5].includes(hitsFor(entry)));
  for (const band of LOTTERY_PRIZE_BANDS) {
    const winners = band.hits === 6 ? sixWinners : entries.filter((entry) => hitsFor(entry) === band.hits);
    const bandPool = roundMoney(pool * (band.hits === 6 && sixWinners.length && !lowerWinners ? 1 : band.share));
    const shares = lotterySplitPrize(bandPool, winners.map((entry) => entry.id));
    for (const share of shares) { const entry = winners.find((item) => item.id === share.userId); payouts.push({ userId: entry.userId, entryId: entry.id, hits: band.hits, amount: share.amount }); paid = roundMoney(paid + share.amount); }
  }
  return { payouts, rolloverAmount: roundMoney(Math.max(0, pool - paid)) };
}

function lotterySplitPrize(pool, winnerIds) {
  if (!winnerIds.length || pool <= 0) return [];
  const cents = moneyCents(pool); const base = Math.floor(cents / winnerIds.length); const remainder = cents % winnerIds.length;
  return winnerIds.map((userId, index) => ({ userId, amount: (base + (index < remainder ? 1 : 0)) / 100 }));
}

function ensureLotteryState() {
  if (!db.economy.lottery || typeof db.economy.lottery !== 'object') db.economy.lottery = { rounds: [], entries: [] };
  if (!Array.isArray(db.economy.lottery.rounds)) db.economy.lottery.rounds = [];
  if (!Array.isArray(db.economy.lottery.entries)) db.economy.lottery.entries = [];
}

function createLotteryRound(window, carryOver = 0) {
  ensureLotteryState();
  const secret = randomBytes(32).toString('hex');
  const round = {
    id: window.id, startAt: window.startAt, closeAt: window.closeAt, status: 'open',
    secret, commitHash: createHash('sha256').update(secret).digest('hex'), carryOver: roundMoney(carryOver),
    realWagered: 0, ticketSales: 0, houseMargin: 0, contribution: 0, basePrizePool: 0, apostometerTopUp: LOTTERY_MIN_POOL, prizePool: LOTTERY_MIN_POOL, winningNumbers: [], winnerIds: [], payouts: [],
    createdAt: new Date().toISOString(), drawnAt: null,
  };
  db.economy.lottery.rounds.push(round);
  if (db.economy.lottery.rounds.length > 60) db.economy.lottery.rounds = db.economy.lottery.rounds.slice(-60);
  return round;
}

function resetOneOffLotteryForDelayedDraw(now = new Date()) {
  ensureLotteryState();
  if (!Array.isArray(db.economy.creditAdjustments)) db.economy.creditAdjustments = [];
  const active = db.economy.lottery.rounds.find((item) => item.id === LOTTERY_ONE_OFF_ACTIVE_ROUND_ID);
  if (!active || active.oneOffResetVersion === LOTTERY_ONE_OFF_RESET_VERSION) return false;
  const previous = db.economy.lottery.rounds.find((item) => item.id === LOTTERY_ONE_OFF_ROUND_ID);

  // A apuração das 16h10 foi publicada antes de o código estar concluído.
  // Estornamos somente o prêmio daquela rodada e mantemos a trilha financeira.
  if (previous?.status === 'drawn') {
    const payoutAdjustments = db.economy.creditAdjustments.filter((item) => item.mode === 'lottery-prize' && item.lotteryRoundId === previous.id);
    for (const payout of Array.isArray(previous.payouts) ? previous.payouts : []) {
      const amount = roundMoney(payout.amount);
      const adjustment = payoutAdjustments.find((item) => item.userId === payout.userId && roundMoney(item.amount) === amount);
      if (!amount || !adjustment) continue;
      const before = walletFor(payout.userId);
      addCredits(payout.userId, -amount);
      db.economy.creditAdjustments.push({
        id: randomUUID(), userId: payout.userId, mode: 'lottery-reset-reversal', amount: -amount,
        before, after: walletFor(payout.userId), reason: `Estorno da rodada de teste da Loteria 51 · rodada ${previous.id.slice(-10)}`,
        createdAt: now.toISOString(), lotteryRoundId: previous.id, reversesAdjustmentId: adjustment.id,
      });
    }
    previous.status = 'void';
    previous.voidedAt = now.toISOString();
    previous.voidedReason = 'Rodada de teste limpa para o novo sorteio excepcional das 17h';
    previous.voidedFromDrawnAt = previous.drawnAt || null;
    previous.winningNumbers = [];
    previous.winnerIds = [];
    previous.payouts = [];
    previous.prizePool = 0;
    previous.rolloverAmount = 0;
    previous.drawnAt = null;
    previous.revealedSecret = null;
  }

  // Remove palpites das duas rodadas de teste, sem tocar em rodadas anteriores.
  db.economy.lottery.entries = db.economy.lottery.entries.filter((item) => item.roundId !== LOTTERY_ONE_OFF_ROUND_ID && item.roundId !== LOTTERY_ONE_OFF_ACTIVE_ROUND_ID);

  const secret = randomBytes(32).toString('hex');
  active.secret = secret;
  active.commitHash = createHash('sha256').update(secret).digest('hex');
  active.closeAt = LOTTERY_ONE_OFF_CLOSE_AT;
  active.status = 'open';
  active.oneOffHold = true;
  active.oneOffResetVersion = LOTTERY_ONE_OFF_RESET_VERSION;
  active.winningNumbers = [];
  active.winnerIds = [];
  active.payouts = [];
  active.rolloverAmount = 0;
  active.realWagered = 0;
  active.houseMargin = 0;
  active.contribution = 0;
  active.prizePool = 0;
  active.drawnAt = null;
  active.revealedSecret = null;
  return true;
}

function reopenOneOffLotteryRoundIfNeeded(now = new Date()) {
  ensureLotteryState();
  if (!Array.isArray(db.economy.creditAdjustments)) db.economy.creditAdjustments = [];
  const round = db.economy.lottery.rounds.find((item) => item.id === LOTTERY_ONE_OFF_ROUND_ID);
  if (!round || round.status !== 'drawn' || round.oneOffResetVersion === LOTTERY_ONE_OFF_RESET_VERSION) return false;

  // A primeira publicação encerrou esta rodada antes da janela excepcional.
  // Reverte somente os créditos emitidos pela própria apuração e registra uma
  // reversão compensatória, preservando o histórico financeiro e qualquer
  // movimentação legítima posterior do participante.
  const payouts = Array.isArray(round.payouts) ? round.payouts : [];
  const payoutAdjustments = (db.economy.creditAdjustments || []).filter((item) => item.mode === 'lottery-prize' && item.lotteryRoundId === round.id);
  for (const payout of payouts) {
    const amount = roundMoney(payout.amount);
    if (!amount) continue;
    const adjustment = payoutAdjustments.find((item) => item.userId === payout.userId && roundMoney(item.amount) === amount);
    const before = walletFor(payout.userId);
    addCredits(payout.userId, -amount);
    db.economy.creditAdjustments.push({
      id: randomUUID(), userId: payout.userId, mode: 'lottery-reversal', amount: -amount,
      before, after: walletFor(payout.userId), reason: `Estorno da apuração antecipada da Loteria 51 · rodada ${round.id.slice(-10)}`,
      createdAt: now.toISOString(), lotteryRoundId: round.id, reversesAdjustmentId: adjustment?.id || null,
    });
  }

  // Um novo segredo evita que qualquer resultado exibido antes da correção
  // dê vantagem a alguém. Os palpites já registrados continuam válidos.
  const secret = randomBytes(32).toString('hex');
  round.secret = secret;
  round.commitHash = createHash('sha256').update(secret).digest('hex');
  round.closeAt = LOTTERY_ONE_OFF_CLOSE_AT;
  round.status = 'open';
  round.oneOffHold = true;
  round.oneOffResetVersion = LOTTERY_ONE_OFF_RESET_VERSION;
  round.reopenedFromDrawnAt = round.drawnAt || null;
  round.drawnAt = null;
  round.revealedSecret = null;
  round.winningNumbers = [];
  round.winnerIds = [];
  round.payouts = [];
  round.rolloverAmount = 0;
  round.realWagered = 0;
  round.houseMargin = 0;
  round.contribution = 0;
  round.prizePool = 0;
  return true;
}

function currentLotteryRound(date = new Date()) {
  ensureLotteryState();
  if (!db.settings.lotteryMega51PaidTicketsV1) {
    const window = lotteryWindowFor(date);
    const active = db.economy.lottery.rounds.find((item) => item.status === 'open' && Date.parse(item.startAt) <= date.getTime() && Date.parse(item.closeAt) > date.getTime());
    if (active) {
      const previousRoundId = active.id;
      const secret = randomBytes(32).toString('hex');
      Object.assign(active, { id: window.id, startAt: window.startAt, closeAt: window.closeAt, status: 'open', secret, commitHash: createHash('sha256').update(secret).digest('hex'), carryOver: 0, realWagered: 0, ticketSales: 0, houseMargin: 0, contribution: 0, basePrizePool: LOTTERY_MIN_POOL, apostometerTopUp: LOTTERY_MIN_POOL, prizePool: LOTTERY_MIN_POOL, winningNumbers: [], winnerIds: [], payouts: [], rolloverAmount: 0, drawnAt: null, revealedSecret: null, mega51PaidTicketsAt: new Date().toISOString() });
      db.economy.lottery.entries = db.economy.lottery.entries.filter((entry) => entry.roundId !== previousRoundId && entry.roundId !== window.id);
    }
    db.settings.lotteryMega51PaidTicketsV1 = new Date().toISOString();
  }
  resetOneOffLotteryForDelayedDraw(date);
  reopenOneOffLotteryRoundIfNeeded(date);
  const specialRound = db.economy.lottery.rounds.find((item) => item.special === true && item.status === 'open' && Date.parse(item.startAt) <= date.getTime() && Date.parse(item.closeAt) > date.getTime());
  if (specialRound) return specialRound;
  const oneOffRound = db.economy.lottery.rounds.find((item) => item.id === LOTTERY_ONE_OFF_ACTIVE_ROUND_ID && item.status === 'open' && Date.parse(item.closeAt) > date.getTime());
  if (oneOffRound) {
    if (Date.parse(oneOffRound.closeAt) !== Date.parse(LOTTERY_ONE_OFF_CLOSE_AT)) {
      oneOffRound.closeAt = LOTTERY_ONE_OFF_CLOSE_AT;
      oneOffRound.oneOffHold = true;
    }
    return oneOffRound;
  }
  const window = lotteryWindowFor(date);
  let round = db.economy.lottery.rounds.find((item) => item.id === window.id);
  if (round?.status === 'open' && Date.parse(round.closeAt) !== Date.parse(window.closeAt)) {
    // A rodada já aberta conserva todos os bilhetes; só antecipa o fechamento.
    round.closeAt = window.closeAt;
    round.scheduleHour = LOTTERY_DRAW_HOUR;
  }
  if (!round) {
    // Se o horário da rodada mudou entre versões, reaproveitamos a rodada
    // aberta que ainda contém o momento atual, antecipando apenas o fechamento.
    // Isso evita criar duas rodadas sobrepostas e preserva palpites já registrados.
    round = db.economy.lottery.rounds.find((item) => item.status === 'open' && Date.parse(item.startAt) <= date.getTime() && Date.parse(item.closeAt) > date.getTime()) || null;
    if (round) {
      round.closeAt = window.closeAt;
      round.scheduleHour = LOTTERY_DRAW_HOUR;
    } else {
      const previous = [...db.economy.lottery.rounds].filter((item) => item.status === 'drawn').at(-1);
      round = createLotteryRound(window, previous?.rolloverAmount || 0);
    }
  }
  const priorScheduledRound = db.economy.lottery.rounds.find((item) => item.status === 'drawn' && item.closeAt === window.startAt);
  if (round.status === 'open' && priorScheduledRound && Number(round.carryOver || 0) !== Number(priorScheduledRound.rolloverAmount || 0)) {
    round.carryOver = roundMoney(priorScheduledRound.rolloverAmount || 0);
    const projection = lotteryProjectionForRound(round);
    round.basePrizePool = projection.basePrizePool;
    round.prizePool = projection.prizePool;
  }
  if (round.status === 'open' && round.id === LOTTERY_ONE_OFF_ROUND_ID && Date.parse(round.closeAt) !== Date.parse(LOTTERY_ONE_OFF_CLOSE_AT)) {
    round.closeAt = LOTTERY_ONE_OFF_CLOSE_AT;
    round.oneOffHold = true;
  }
  return round;
}

function settleLotteryRounds(now = new Date()) {
  ensureLotteryState();
  const migrationBefore = Boolean(db.settings.lotteryMega51PaidTicketsV1);
  const openScheduleBefore = db.economy.lottery.rounds.filter((item) => item.status === 'open').map((item) => item.id + ':' + item.closeAt + ':' + item.carryOver + ':' + item.prizePool).join('|');
  let changed = false;
  // Fecha a janela vencida antes de abrir a próxima. Abrir a próxima primeiro
  // faria a nova rodada nascer sem o rollover que acabou de ser apurado.
  for (const round of db.economy.lottery.rounds.filter((item) => item.status === 'open' && Date.parse(item.closeAt) <= now.getTime())) {
    const projection = lotteryProjectionForRound(round);
    const entries = db.economy.lottery.entries.filter((item) => item.roundId === round.id);
    const winningNumbers = lotteryNumbersForRound(round);
    const settlement = lotteryPayoutsForEntries(projection.prizePool, entries, winningNumbers);
    const payouts = settlement.payouts;
    const winnerIds = [...new Set(payouts.map((item) => item.userId))].sort((a, b) => String(a).localeCompare(String(b)));
    round.status = 'drawn'; round.realWagered = projection.realWagered; round.houseMargin = projection.houseMargin;
    round.contribution = projection.contribution; round.basePrizePool = projection.basePrizePool; round.apostometerTopUp = projection.apostometerTopUp;
    round.ticketSales = projection.ticketSales; round.prizePool = projection.prizePool; round.winningNumbers = winningNumbers;
    round.winnerIds = winnerIds; round.payouts = payouts; round.rolloverAmount = round.resetRolloverAfterDraw ? 0 : settlement.rolloverAmount;
    round.drawnAt = now.toISOString(); round.revealedSecret = round.secret;
    for (const payout of payouts) {
      const before = walletFor(payout.userId); addCredits(payout.userId, payout.amount);
      db.economy.creditAdjustments.push({ id: randomUUID(), userId: payout.userId, mode: 'lottery-prize', amount: payout.amount, before, after: walletFor(payout.userId), reason: `Prêmio da Mega 51 · ${payout.hits} acertos · rodada ${round.id.slice(-10)}`, createdAt: round.drawnAt, lotteryRoundId: round.id });
    }
    changed = true;
  }
  const beforeRoundCount = db.economy.lottery.rounds.length;
  currentLotteryRound(now);
  if (!migrationBefore && db.settings.lotteryMega51PaidTicketsV1) changed = true;
  if (db.economy.lottery.rounds.length !== beforeRoundCount) changed = true;
  const openScheduleAfter = db.economy.lottery.rounds.filter((item) => item.status === 'open').map((item) => item.id + ':' + item.closeAt + ':' + item.carryOver + ':' + item.prizePool).join('|');
  if (openScheduleAfter !== openScheduleBefore) changed = true;
  return changed;
}

function lotteryForUser(user) {
  ensureLotteryState();
  const round = currentLotteryRound(new Date());
  const projection = round.status === 'open' ? lotteryProjectionForRound(round) : { realWagered: round.realWagered, houseMargin: round.houseMargin, contribution: round.contribution, basePrizePool: round.basePrizePool ?? round.prizePool, apostometerTopUp: round.apostometerTopUp || 0, prizePool: round.prizePool };
  const entries = db.economy.lottery.entries.filter((item) => item.roundId === round.id);
  const myEntries = entries.filter((item) => item.userId === user.id);
  const names = new Map(db.users.map((item) => [item.id, item.displayName]));
  const lastDrawnRound = [...db.economy.lottery.rounds].filter((item) => item.status === 'drawn').sort((left, right) => Date.parse(right.drawnAt || right.closeAt) - Date.parse(left.drawnAt || left.closeAt))[0] || null;
  const lastDraw = lastDrawnRound ? {
    id: lastDrawnRound.id, closeAt: lastDrawnRound.closeAt, drawnAt: lastDrawnRound.drawnAt,
    winningNumbers: lastDrawnRound.winningNumbers || [],
    myEntries: db.economy.lottery.entries.filter((entry) => entry.roundId === lastDrawnRound.id && entry.userId === user.id).map((entry) => ({
      id: entry.id, numbers: entry.numbers || [],
    })),
  } : null;
  const previous = [...db.economy.lottery.rounds].filter((item) => item.id !== round.id && item.status === 'drawn').slice(-6).reverse().map((item) => ({
    id: item.id, closeAt: item.closeAt, drawnAt: item.drawnAt, prizePool: Number(item.prizePool || 0), winningNumbers: item.winningNumbers || [],
    winners: (item.payouts || []).map((payout) => ({ displayName: names.get(payout.userId) || 'Conta removida', amount: Number(payout.amount || 0) })),
  }));
  return {
    id: round.id, status: round.status, startAt: round.startAt, closeAt: round.closeAt, commitHash: round.commitHash,
    numbers: Array.from({ length: LOTTERY_NUMBER_MAX }, (_, index) => index + 1), drawCount: LOTTERY_DRAW_COUNT,
    minPool: LOTTERY_MIN_POOL, prizePool: projection.prizePool, realWagered: projection.realWagered, ticketSales: projection.ticketSales,
    contribution: projection.contribution, basePrizePool: projection.basePrizePool, apostometerTopUp: projection.apostometerTopUp, entryCount: entries.length, plans: LOTTERY_TICKET_PLANS, prizeBands: LOTTERY_PRIZE_BANDS, myEntries: myEntries.map((entry) => ({ id: entry.id, numbers: entry.numbers || [], price: Number(entry.price || 0), createdAt: entry.createdAt })), myEntry: null, lastDraw,
    winningNumbers: round.status === 'drawn' ? round.winningNumbers : [], revealedSecret: round.status === 'drawn' ? round.revealedSecret : null,
    winners: round.status === 'drawn' ? (round.payouts || []).map((payout) => ({ displayName: names.get(payout.userId) || 'Conta removida', amount: Number(payout.amount || 0) })) : [], previous,
  };
}

function lotteryReminderForUser(user, date = new Date()) {
  const round = currentLotteryRound(date);
  const remaining = Date.parse(round.closeAt) - date.getTime();
  if (round.status !== 'open' || remaining <= 0 || remaining > 10 * 60 * 1000) return null;
  const hasEntry = (db.economy.lottery.entries || []).some((item) => item.roundId === round.id && item.userId === user.id);
  return hasEntry ? null : { roundId: round.id, closeAt: round.closeAt };
}

function lotteryTimeLabelForNotification(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value)).replace(':', 'h');
}

function curseExpiryLabelForNotification(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value)).replace(',', ' às').replace(':', 'h');
}

// A single durable claim, persisted atomically with consuming the box (D1 CAS).
function physicalKitClaim() { return db.economy.physicalKitClaim || null; }
function grantMysteryBoxReward(user, box, localHalloweenPreview = false) {
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
  const eligible = SHOP_CATALOG.filter((item) => !item.excludeMystery && isHalloweenShopAvailable(item, localHalloweenPreview) && !item.adminOnly && !item.cardPack && !item.mysteryBox && !item.service && (wantsPower ? item.type === 'power' : item.type !== 'power') && Number(item.price) >= Number(box.minRewardPrice) && (Number(item.price) <= Number(box.maxRewardPrice) || (box.id === 'box-master-imperial' && item.id === 'frame-cyberpunk')) && (item.consumable || !ownedIds.has(item.id)));
  const fallback = SHOP_CATALOG.filter((item) => !item.excludeMystery && isHalloweenShopAvailable(item, localHalloweenPreview) && !item.adminOnly && !item.cardPack && !item.mysteryBox && !item.service && (item.consumable || !ownedIds.has(item.id)));
  const pool = eligible.length ? eligible : box.master ? [] : fallback;
  if (!pool.length) return creditReward();
  const reward = pool[Math.floor(Math.random() * pool.length)];
  const purchaseId = randomUUID();
  db.economy.purchases.push({ id: purchaseId, userId: user.id, itemId: reward.id, price: 0, originalPrice: roundMoney(reward.price), sourceMysteryBoxId: box.id, mysteryDecisionPending: true, createdAt: new Date().toISOString() });
  return { kind: reward.type === 'power' ? 'power' : 'item', icon: reward.icon, name: reward.name, itemId: reward.id, purchaseId, sellPrice: Math.min(Math.max(0.01, roundMoney(Number(reward.price || 0) * .55)), Math.max(0.01, roundMoney(Number(box.sellPrice || 0) * .8))) };
}

function addMysteryBox(userId, boxId, source, bet = null) {
  const box = SHOP_CATALOG.find((item) => item.id === boxId && item.mysteryBox);
  if (!box) throw new HttpError(404, 'Baú misterioso não encontrado.');
  const inventoryItem = { id: randomUUID(), userId, boxId, source, bet, acquiredAt: new Date().toISOString() };
  db.economy.mysteryBoxes.push(inventoryItem);
  return { ...inventoryItem, name: box.name, icon: box.icon, tier: box.tier, sellPrice: box.sellPrice };
}

export function weeklyMissionTemplatesFor(userId, weekKey) {
  const seed = [...(userId + weekKey)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  // Três objetivos distintos por semana aumentam a variedade sem permitir que
  // atualizar a página ou repetir a mesma ação duplique recompensas.
  return Array.from({ length: 3 }, (_, index) => WEEKLY_MISSIONS[(seed + index * 2) % WEEKLY_MISSIONS.length]);
}

function weeklyMissionsFor(userId) {
  const weekKey = saoPauloWeekKey();
  const templates = weeklyMissionTemplatesFor(userId, weekKey);
  return templates.map((template) => {
    const key = userId + ':' + weekKey + ':' + template.type;
    const progress = Math.min(template.target, Number(db.economy.missionProgress[key] || 0));
    const completed = db.economy.missionRewards.includes(key);
    return { ...template, weekKey, key, progress, completed };
  });
}

function weeklyMissionFor(userId) { return weeklyMissionsFor(userId)[0]; }

const BLACKSTAR_WORKSHOP_RECIPES = Object.freeze([
  { id: 'pack-sector51', name: 'Pacote Setor 51', cost: 4, itemId: 'card-pack-sector51', type: 'pack' },
  { id: 'pack-orbit', name: 'Pacote Órbita', cost: 8, itemId: 'card-pack-orbit', type: 'pack' },
  { id: 'relic-rift', name: 'Relíquia da Fenda', cost: 14, itemId: 'badge-relic-rift', type: 'visual' },
  { id: 'cursor-blackstar', name: 'Lança Blackstar', cost: 22, variants: { cyan: 'cursor-blackstar-cyan', gold: 'cursor-blackstar-gold', crimson: 'cursor-blackstar-crimson' }, type: 'visual' },
  { id: 'theme-blackstar', name: 'Câmara Blackstar', cost: 26, variants: { cyan: 'site-blackstar-cyan', gold: 'site-blackstar-gold', crimson: 'site-blackstar-crimson' }, type: 'visual' },
  { id: 'core-blackstar', name: 'Núcleo Blackstar', cost: 32, itemId: 'card-pack-core', type: 'pack' },
]);

function seasonPassIsEnabled(now = new Date()) {
  return (CARD_SEASON_LOCAL_PREVIEW || db.settings?.nextCardSeasonEnabled === true) && (CARD_SEASON_LOCAL_PREVIEW || passIsOpen(now));
}

function cardSeasonTransitionIsEnabled(now = new Date()) {
  return CARD_SEASON_LOCAL_PREVIEW || (db.settings?.nextCardSeasonEnabled === true && now.getTime() >= Date.parse(NEXT_CARD_SEASON.startsAt));
}

async function settleCardSeasonTransitionFor(user, now = new Date()) {
  if (!cardSeasonTransitionIsEnabled(now)) return false;
  const result = liquidatePreviousCardSeason(db, user.id, randomUUID, now);
  if (!result.changed) return false;
  await persist();
  broadcastRefresh('card-season');
  return true;
}

function awardPassXpIfActive(userId, source, eventId, now = new Date()) {
  if (!seasonPassIsEnabled(now)) return false;
  return awardSeasonPassXp(db.economy, userId, source, eventId, now).changed;
}

function recordMissionActivity(userId, type) {
  let rewarded = false;
  weeklyMissionsFor(userId).filter((mission) => mission.type === type && !mission.completed).forEach((mission) => {
    const progress = Math.min(mission.target, mission.progress + 1);
    db.economy.missionProgress[mission.key] = progress;
    if (progress < mission.target || db.economy.missionRewards.includes(mission.key)) return;
    db.economy.missionRewards.push(mission.key);
    addCredits(userId, mission.reward);
    awardPassXpIfActive(userId, 'weekly-mission', mission.key);
    rewarded = true;
  });
  return rewarded;
}

function recordActivity(userId, type) {
  const totals = db.economy.activityTotals[userId] || {};
  totals[type] = Number(totals[type] || 0) + 1;
  db.economy.activityTotals[userId] = totals;
  return recordMissionActivity(userId, type);
}

function hasDailyEconomyActivity(userId, dayKey = saoPauloDayKey()) {
  return db.waterEntries.some((entry) => entry.userId === userId && entry.dayKey === dayKey)
    || db.dailyPhrases.some((entry) => entry.userId === userId && dayKeyForTimestamp(entry.createdAt) === dayKey)
    || db.dailyMemes.some((entry) => entry.userId === userId && dayKeyForTimestamp(entry.createdAt) === dayKey)
    || db.anonymousPosts.some((entry) => entry.authorId === userId && dayKeyForTimestamp(entry.createdAt) === dayKey)
    || ensureMarketState(db.economy).ledger.some((entry) => entry.userId === userId && dayKeyForTimestamp(entry.createdAt) === dayKey);
}

function marketMissionStateFor(userId, dayKey = saoPauloDayKey()) {
  const market = ensureMarketState(db.economy);
  const claims = db.economy.marketMissionClaims || [];
  const orderedToday = market.ledger.some((entry) => entry.userId === userId && dayKeyForTimestamp(entry.createdAt) === dayKey);
  const heldThroughUpdate = db.economy.creditAdjustments.some((entry) => entry.userId === userId && entry.mode === 'market-dividend' && dayKeyForTimestamp(entry.createdAt) === dayKey);
  const progressById = { 'market-order': orderedToday ? 1 : 0, 'market-hold': heldThroughUpdate ? 1 : 0 };
  return MARKET_MISSIONS.map((mission) => {
    const key = userId + ':' + dayKey + ':' + mission.id;
    const progress = progressById[mission.id] || 0;
    return { ...mission, key, dayKey, progress, target: 1, completed: claims.includes(key) };
  });
}

function settleMarketMissionsForUser(userId, dayKey = saoPauloDayKey()) {
  let changed = false;
  marketMissionStateFor(userId, dayKey).forEach((mission) => {
    if (mission.completed || mission.progress < mission.target) return;
    const key = mission.key;
    if (db.economy.marketMissionClaims.includes(key)) return;
    const before = walletFor(userId);
    addCredits(userId, mission.reward);
    db.economy.marketMissionClaims.push(key);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'market-mission', amount: mission.reward, before, after: walletFor(userId), reason: 'Missão do Mercado: ' + mission.title, createdAt: new Date().toISOString() });
    changed = true;
  });
  if (db.economy.marketMissionClaims.length > 10000) db.economy.marketMissionClaims = db.economy.marketMissionClaims.slice(-10000);
  return changed;
}

function marketDailyIncomeFor(userId, dayKey = saoPauloDayKey()) {
  const key = userId + ':' + dayKey;
  const claimed = (db.economy.dailyIncomeClaims || []).some((entry) => entry.key === key);
  const eligible = hasDailyEconomyActivity(userId, dayKey);
  return { amount: MARKET_DAILY_INCOME, dayKey, claimed, eligible, available: !claimed && eligible };
}

function marketIncomeFor(userId, marketSnapshot = null) {
  const dayKey = saoPauloDayKey();
  const market = marketSnapshot || marketForUser(db.economy, userId);
  const wallet = walletFor(userId);
  const total = roundMoney(wallet + market.holdingsValue);
  const investedShare = total > 0 ? roundMoney((market.holdingsValue / total) * 100) : 0;
  const paidToday = roundMoney(db.economy.creditAdjustments.filter((entry) => entry.userId === userId && entry.mode === 'market-dividend' && dayKeyForTimestamp(entry.createdAt) === dayKey).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  return {
    dailyIncome: marketDailyIncomeFor(userId, dayKey),
    missions: marketMissionStateFor(userId, dayKey),
    dividend: { ratePerUpdate: MARKET_DIVIDEND_RATE_PER_UPDATE, dailyCap: MARKET_DIVIDEND_DAILY_CAP, paidToday, remainingToday: Math.max(0, roundMoney(MARKET_DIVIDEND_DAILY_CAP - paidToday)) },
    liquidity: { investedShare, warning: investedShare >= 80 },
  };
}

function settleMarketDividends(now = new Date()) {
  const market = ensureMarketState(db.economy);
  // Preços mudam a cada 15 min; dividendos continuam a cada 45 min.
  const slotIndex = Number(String(market.slotKey || '').match(/:u(\d+)$/)?.[1]);
  if (!Number.isInteger(slotIndex) || slotIndex % 3 !== 0) return false;
  if (!market.updatedAt || !market.slotKey || market.dividendSlots.includes(market.slotKey)) return false;
  const dayKey = saoPauloDayKey(now);
  const usersWithPositions = new Set(Object.keys(market.portfolios || {}));
  db.users.filter((user) => user.active && user.approved !== false).forEach((user) => usersWithPositions.add(user.id));
  usersWithPositions.forEach((userId) => {
    const holdingsValue = marketHoldingsValueForUser(db.economy, userId);
    if (holdingsValue <= 0) return;
    const paidToday = db.economy.creditAdjustments.filter((entry) => entry.userId === userId && entry.mode === 'market-dividend' && dayKeyForTimestamp(entry.createdAt) === dayKey).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const amount = roundMoney(Math.min(Math.max(0, MARKET_DIVIDEND_DAILY_CAP - paidToday), holdingsValue * MARKET_DIVIDEND_RATE_PER_UPDATE));
    if (amount < 0.01) return;
    const before = walletFor(userId);
    addCredits(userId, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'market-dividend', amount, before, after: walletFor(userId), reason: 'Dividendo simulado do Mercado 51', createdAt: now.toISOString(), slotKey: market.slotKey });
    settleMarketMissionsForUser(userId, dayKey);
  });
  market.dividendSlots.push(market.slotKey);
  if (market.dividendSlots.length > 240) market.dividendSlots = market.dividendSlots.slice(-240);
  return true;
}

function cryptoDailyIncomeFor(userId, dayKey = saoPauloDayKey()) {
  const key = userId + ':' + dayKey;
  const claimed = (db.economy.cryptoDailyIncomeClaims || []).some((entry) => entry.key === key);
  const eligible = hasDailyEconomyActivity(userId, dayKey);
  return { amount: CRYPTO_DAILY_INCOME, dayKey, claimed, eligible, available: !claimed && eligible };
}

function cryptoIncomeFor(userId, snapshot = null) {
  const dayKey = saoPauloDayKey(); const market = snapshot || cryptoMarketForUser(db.economy, userId);
  const paidToday = roundMoney(db.economy.creditAdjustments.filter((entry) => entry.userId === userId && entry.mode === 'crypto51-dividend' && dayKeyForTimestamp(entry.createdAt) === dayKey).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  return { dailyIncome: cryptoDailyIncomeFor(userId, dayKey), dividend: { dailyRate: CRYPTO_DIVIDEND_DAILY_RATE, dailyCap: CRYPTO_DIVIDEND_DAILY_CAP, paidToday, remainingToday: Math.max(0, roundMoney(CRYPTO_DIVIDEND_DAILY_CAP - paidToday)) }, holdingsValue: market.holdingsValue };
}

function settleCryptoDividends(now = new Date()) {
  const market = ensureCryptoMarketState(db.economy); const slot = String(market.updatedAt || '');
  if (!slot || market.status === 'stale' || market.dividendSlots.includes(slot)) return false;
  const dayKey = saoPauloDayKey(now); const users = new Set(Object.keys(market.portfolios || {}));
  market.dividendAccrual ||= {};
  users.forEach((userId) => {
    const value = cryptoHoldingsValueForUser(db.economy, userId); if (value <= 0) return;
    const paidToday = db.economy.creditAdjustments.filter((entry) => entry.userId === userId && entry.mode === 'crypto51-dividend' && dayKeyForTimestamp(entry.createdAt) === dayKey).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    // Cada snapshot de cinco minutos recebe 1/288 da taxa diária. Assim não
    // há multiplicação indevida se a página atualizar várias vezes.
    const remaining = Math.max(0, CRYPTO_DIVIDEND_DAILY_CAP - paidToday);
    const accrued = Math.min(remaining, Number(market.dividendAccrual[userId] || 0) + value * (CRYPTO_DIVIDEND_DAILY_RATE / 288));
    const amount = Math.floor(accrued * 100 + 1e-8) / 100;
    market.dividendAccrual[userId] = Math.max(0, accrued - amount);
    if (amount < 0.01) return;
    const before = walletFor(userId); addCredits(userId, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'crypto51-dividend', amount, before, after: walletFor(userId), reason: 'Dividendo simulado do Cripto 51', createdAt: now.toISOString(), slotKey: slot });
  });
  market.dividendSlots.push(slot); if (market.dividendSlots.length > 600) market.dividendSlots = market.dividendSlots.slice(-600);
  return true;
}

function cancelMarketAutoOrdersWithoutPosition(userId, now = new Date()) {
  const market = ensureMarketState(db.economy);
  const portfolio = market.portfolios[userId] || {};
  let changed = false;
  for (const order of market.autoSellOrders || []) {
    if (order.userId !== userId || order.status !== 'active') continue;
    if (Number(portfolio[order.assetId] || 0) >= Number(order.quantity || 0)) continue;
    order.status = 'cancelled';
    order.cancelledAt = now.toISOString();
    order.cancelReason = 'A posição foi alterada antes de a cotação alcançar o alvo.';
    changed = true;
  }
  return changed;
}

function settleMarketAutoSales(now = new Date()) {
  const market = ensureMarketState(db.economy);
  const activeOrders = (market.autoSellOrders || []).filter((order) => order.status === 'active');
  if (!activeOrders.length) return false;
  let changed = false;
  for (const order of activeOrders) {
    const asset = MARKET_ASSETS.find((item) => item.id === order.assetId);
    const held = Number(market.portfolios?.[order.userId]?.[order.assetId] || 0);
    if (!asset || held < Number(order.quantity || 0)) {
      order.status = 'cancelled';
      order.cancelledAt = now.toISOString();
      order.cancelReason = 'A posição não estava mais disponível quando a cotação atualizou.';
      changed = true;
      continue;
    }
    const currentPrice = roundMoney(market.prices[order.assetId] || asset.initialPrice);
    if (currentPrice < Number(order.targetPrice || 0)) continue;
    const operation = transactMarket(db.economy, order.userId, order.assetId, Number(order.quantity), 'sell', now);
    const before = walletFor(order.userId);
    addCredits(order.userId, operation.total);
    operation.userId = order.userId;
    operation.before = before;
    operation.after = walletFor(order.userId);
    operation.source = 'auto-sell';
    operation.targetPrice = Number(order.targetPrice);
    market.ledger.push({ ...operation });
    if (market.ledger.length > 5000) market.ledger = market.ledger.slice(-5000);
    db.economy.creditAdjustments.push({ id: operation.id, userId: order.userId, mode: 'investment-market-auto-sell', amount: operation.total, before, after: walletFor(order.userId), reason: `Venda automática de ${asset.name} ao atingir ${roundMoney(order.targetPrice)} Créditos 51`, createdAt: operation.createdAt, slotKey: market.slotKey, orderId: order.id });
    settleMarketMissionsForUser(order.userId);
    order.status = 'fulfilled';
    order.fulfilledAt = now.toISOString();
    order.operationId = operation.id;
    order.executionPrice = operation.price;
    changed = true;
  }
  if (market.autoSellOrders.length > 1200) market.autoSellOrders = market.autoSellOrders.slice(-1200);
  return changed;
}

function syncMarketEconomy(now = new Date()) {
  const advanced = advanceMarket(db.economy, now);
  // Só liquidamos depois de uma cotação efetivamente calculada, nunca na
  // migração de versão do motor ou em um simples carregamento da página.
  const autoSold = advanced && ensureMarketState(db.economy).updatedAt === now.toISOString() ? settleMarketAutoSales(now) : false;
  const rewarded = settleMarketDividends(now);
  return advanced || autoSold || rewarded;
}

// A atualização é centralizada no servidor: uma única leitura das corretoras
// alimenta toda a tripulação. Nenhum navegador recebe chave, nem consulta as
// fontes diretamente.
let cryptoFetchPending = false;
let cryptoFetchStartedAt = 0;
let cryptoFetchedPayload = null;
async function syncCryptoEconomy(now = new Date()) {
  // A leitura externa nunca espera dentro da fila que atende operações de
  // saldo. O resultado é aplicado na próxima sincronização serializada.
  let advanced = false;
  if (cryptoFetchedPayload) {
    const payload = cryptoFetchedPayload;
    cryptoFetchedPayload = null;
    advanced = await syncCryptoMarket(db.economy, now, payload);
  }
  const rewarded = advanced && ensureCryptoMarketState(db.economy).updatedAt === now.toISOString() ? settleCryptoDividends(now) : false;
  const lastAttempt = Date.parse(ensureCryptoMarketState(db.economy).lastAttemptAt || '') || 0;
  if (!cryptoFetchPending && !cryptoFetchedPayload && now.getTime() - Math.max(lastAttempt, cryptoFetchStartedAt) >= CRYPTO_REFRESH_MS) {
    cryptoFetchPending = true;
    cryptoFetchStartedAt = now.getTime();
    void readCryptoSources().then((payload) => { cryptoFetchedPayload = payload; }).catch(() => { cryptoFetchedPayload = { quotes: {}, sources: {} }; }).finally(() => { cryptoFetchPending = false; });
  }
  return advanced || rewarded;
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
  const wallComments = [...db.dailyPhrases, ...db.dailyMemes].flatMap((item) => item.comments || []);
  const values = {
    'water-logs': waterEntries.length,
    'water-1500': waterEntries.reduce((sum, item) => sum + Number(item.ml || 0), 0),
    'daily-post': db.dailyPhrases.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length + db.anonymousPosts.filter((item) => item.authorId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
    'daily-meme': db.dailyMemes.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
    'daily-comment': wallComments.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
    // A votação é semanal; uma reação verdadeira no mural substitui o voto
    // nos outros dias para que a trilha não fique refém do calendário.
    'daily-vote': db.votings.flatMap((item) => item.votes || []).filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length
      + db.dailyReactions.filter((item) => item.userId === userId && dayKeyForTimestamp(item.createdAt) === dayKey).length,
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
    awardPassXpIfActive(userId, 'daily-mission', mission.key);
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
function seasonMeta(monthKey) {
  const [year,month]=monthKey.split('-').map(Number),nextMonth=month===12?1:month+1,nextYear=month===12?year+1:year;
  const nextKey=String(nextYear).padStart(4,'0')+'-'+String(nextMonth).padStart(2,'0');
  const configured=db.settings.seasons?.[monthKey] || {};
  const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(monthKey+'-15T12:00:00-03:00'));
  return {name:configured.name || 'Temporada '+label,startsAt:monthKey+'-01T00:00:00-03:00',endsAt:nextKey+'-01T00:00:00-03:00',nextSeasonKey:nextKey};
}
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
  const highestPoints = Number(people[0]?.points || 0);
  const champions = highestPoints > 0 ? people.filter((person) => person.points === highestPoints) : [];
  return { monthKey, ...seasonMeta(monthKey), ranking: people.slice(0, 9), leader: champions[0] || null, champions };
}

function seasonSummaryWithLockedChampions(monthKey = monthKeyFor()) {
  const summary = seasonSummary(monthKey);
  const snapshot = (db.economy.seasonChampionSnapshots || []).find((entry) => entry.monthKey === monthKey);
  if (!snapshot) return summary;
  const champions = (snapshot.champions || []).map((entry) => ({ ...entry }));
  return { ...summary, leader: champions[0] || null, champions };
}

const SEASON_CHAMPION_REWARD = 500;
const SEASON_CHAMPION_REWARD_START_MONTH = '2026-09';

function settleSeasonChampionRewards() {
  const completedMonth = previousMonthKey();
  // A premiação começa com a temporada que já está em andamento. Assim, não
  // altera saldos de campeonatos históricos anteriores à regra.
  if (completedMonth < SEASON_CHAMPION_REWARD_START_MONTH) return false;
  const liveSummary = seasonSummary(completedMonth);
  let snapshot = (db.economy.seasonChampionSnapshots || []).find((entry) => entry.monthKey === completedMonth);
  let snapshotCreated = false;
  if (!snapshot && liveSummary.champions?.length) {
    snapshot = { id: randomUUID(), monthKey: completedMonth, champions: liveSummary.champions.map(({ id, displayName, points }) => ({ id, displayName, points })), lockedAt: new Date().toISOString() };
    db.economy.seasonChampionSnapshots.push(snapshot); snapshotCreated = true;
  }
  const summary = seasonSummaryWithLockedChampions(completedMonth);
  const champions = summary.champions || [];
  if (!champions.length) return false;
  const paid = new Set((db.economy.seasonChampionRewards || [])
    .filter((entry) => entry.monthKey === completedMonth)
    .map((entry) => entry.userId));
  const recipients = champions.filter((person) => !paid.has(person.id));
  if (!recipients.length) return snapshotCreated;
  // Empate divide a mesma bolsa de 500 para que a ordem alfabética do placar
  // não escolha arbitrariamente quem recebe mais.
  const shares = lotterySplitPrize(SEASON_CHAMPION_REWARD, champions.map((person) => person.id));
  const createdAt = new Date().toISOString();
  recipients.forEach((person) => {
    const amount = shares.find((share) => share.userId === person.id)?.amount || 0;
    const before = walletFor(person.id);
    addCredits(person.id, amount);
    db.economy.seasonChampionRewards.push({
      id: randomUUID(), monthKey: completedMonth, userId: person.id, amount, createdAt,
      seasonName: summary.name, points: person.points,
    });
    db.economy.creditAdjustments.push({
      id: randomUUID(), userId: person.id, mode: 'season-champion-reward', amount,
      before, after: roundMoney(before + amount), reason: 'Campeão da temporada: ' + summary.name,
      createdAt, monthKey: completedMonth,
    });
  });
  if (db.economy.seasonChampionRewards.length > 1000) db.economy.seasonChampionRewards = db.economy.seasonChampionRewards.slice(-1000);
  return true;
}

const MYSTERY_ANSWERS = new Set(['sim', 'nao', 'irrelevante']);
const MYSTERY_ANSWER_LABELS = { sim: 'SIM', nao: 'NÃO', irrelevante: 'IRRELEVANTE' };

function activeMystery() {
  return [...db.mysteries].reverse().find((item) => item.status === 'open' || item.status === 'draft') || null;
}

const IMPOSTOR_PAIRS=[['Praia','Piscina'],['Pizza','Hambúrguer'],['Café','Chá'],['Cinema','Teatro'],['Avião','Navio'],['Gato','Cachorro'],['Brasil','Argentina'],['Chuva','Neve'],['Hospital','Escola'],['Futebol','Vôlei'],['Livro','Filme'],['Lua','Sol'],['Sorvete','Bolo'],['Praça','Parque'],['Ônibus','Metrô']];
function activeImpostorGame(){return [...(db.impostorGames||[])].reverse().find(game=>['lobby','tips','voting'].includes(game.status))||null;}
function impostorForClient(user){const latest=db.impostorGames?.at(-1);const game=activeImpostorGame()||(latest?.status==='result'?latest:null);if(!game)return {active:null};const isPlayer=game.players.some(person=>person.id===user.id),showResult=game.status==='result';return {active:{id:game.id,code:game.code,hostId:game.hostId,hostName:game.hostName,status:game.status,players:game.players.map(person=>({id:person.id,name:person.name,isMe:person.id===user.id})),tips:game.tips||[],currentTurn:game.status==='tips'?game.players[game.turnIndex]:null,ownWord:isPlayer?game.words?.[user.id]||null:null,canStart:game.status==='lobby'&&game.hostId===user.id,canLeave:game.status==='lobby'&&isPlayer&&game.hostId!==user.id,canCancel:game.status==='lobby'&&game.hostId===user.id,canJoin:game.status==='lobby'&&!isPlayer,canTip:game.status==='tips'&&game.players[game.turnIndex]?.id===user.id,canVote:game.status==='voting'&&isPlayer&&!game.votes?.[user.id],hasVoted:Boolean(game.votes?.[user.id]),canEnd:user.role==='admin'&&['lobby','tips','voting','result'].includes(game.status),result:showResult?{impostorId:game.impostorId,impostorName:game.players.find(person=>person.id===game.impostorId)?.name||'Impostor',normalWord:game.normalWord,impostorWord:game.impostorWord,winner:game.winner,votes:Object.entries(game.votes||{}).map(([voterId,targetId])=>({voterName:game.players.find(person=>person.id===voterId)?.name||'Jogador',targetName:game.players.find(person=>person.id===targetId)?.name||'Jogador'}))}:null}};}

function mysteryForClient(user) {
  const mystery = activeMystery() || db.mysteries.at(-1) || null;
  if (!mystery) return { active: null, canStart: user.role === 'admin', canDelete: user.role === 'admin' };
  const canManage = mystery.readerId === user.id;
  const isDraft = mystery.status === 'draft';
  const revealed = mystery.status === 'closed';
  return {
    active: {
      id: mystery.id, title: mystery.title, premise: mystery.premise, readerName: mystery.readerName,
      readerId: mystery.readerId, status: mystery.status, createdAt: mystery.createdAt, closedAt: mystery.closedAt || null,
      solution: revealed || canManage ? mystery.solution : null,
      isDraft,
      questionCount: (mystery.questions || []).length,
      questions: (mystery.questions || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((question) => ({
        id: question.id, text: question.text, authorName: question.authorName, authorId: question.authorId,
        createdAt: question.createdAt, answer: question.answer || null, cancelledAt: question.cancelledAt || null,
        answerLabel: question.answer ? MYSTERY_ANSWER_LABELS[question.answer] : null,
        answeredAt: question.answeredAt || null,
      })).filter((question) => !question.cancelledAt || question.authorId === user.id || canManage || user.role === 'admin'),
      guesses: (mystery.guesses || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((guess) => ({
        id: guess.id, text: guess.text, authorId: guess.authorId, authorName: guess.authorName, createdAt: guess.createdAt,
        similarity: Number.isInteger(guess.similarity) ? guess.similarity : null, reveal: guess.reveal || null, reviewedAt: guess.reviewedAt || null,
      })),
    },
    canStart: !activeMystery() && user.role === 'admin',
    canAsk: mystery.status === 'open' && mystery.readerId !== user.id,
    canManage,
    canSetup: isDraft && canManage,
    canClear: user.role === 'admin',
    canDelete: user.role === 'admin',
  };
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
      awardPassXpIfActive(person.id, 'crew-challenge', monthKey + ':' + challenge.id);
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

function requiredLieVoteForUser(userId, now = Date.now()) {
  const pending = db.lieAccusations
    .filter((item) => item.status === 'pending' && Array.isArray(item.requiredVoterIds) && item.requiredVoterIds.includes(userId) && !item.votes?.[userId])
    .map((item) => ({ item, createdAt: Date.parse(item.createdAt || '') }))
    .filter(({ createdAt }) => Number.isFinite(createdAt) && now - createdAt >= LIE_VOTE_GRACE_MS)
    .sort((a, b) => a.createdAt - b.createdAt)[0]?.item;
  if (!pending) return null;
  const target = db.users.find((person) => person.id === pending.targetUserId);
  const creator = db.users.find((person) => person.id === pending.createdByUserId);
  return {
    id: pending.id,
    targetUserId: pending.targetUserId,
    targetName: target?.displayName || 'Usuário removido',
    creatorName: creator?.displayName || 'Usuário removido',
    reason: pending.reason || '',
    createdAt: pending.createdAt,
    eligibleAt: new Date(Date.parse(pending.createdAt) + LIE_VOTE_GRACE_MS).toISOString(),
  };
}

function enforceLieVoteGate(req, route) {
  const auth = sessionFor(req);
  if (!auth || auth.user.role === 'admin') return;
  const stateRoute = req.method === 'GET' && (route === '/api/state' || route === '/api/sync');
  const logoutRoute = req.method === 'POST' && route === '/api/logout';
  const announcementRoute = req.method === 'POST' && route === '/api/announcement/seen';
  const voteRoute = req.method === 'POST' && (/^\/api\/lie-meter\/[^/]+\/vote$/.test(route) || /^\/api\/community-votes\/[^/]+\/vote$/.test(route));
  if (stateRoute || logoutRoute || announcementRoute || voteRoute) return;
  const required = requiredLieVoteForUser(auth.user.id);
  if (required) throw new HttpError(423, 'Você precisa votar na mentira pendente antes de continuar.');
}

function enforceCommunityVoteGate(req, route) {
  const auth = sessionFor(req);
  if (!auth || auth.user.role === 'admin') return;
  const stateRoute = req.method === 'GET' && (route === '/api/state' || route === '/api/sync');
  const logoutRoute = req.method === 'POST' && route === '/api/logout';
  const announcementRoute = req.method === 'POST' && route === '/api/announcement/seen';
  const voteRoute = req.method === 'POST' && (/^\/api\/community-votes\/[^/]+\/vote$/.test(route) || /^\/api\/lie-meter\/[^/]+\/vote$/.test(route));
  const imageRoute = req.method === 'GET' && /^\/api\/community-votes\/[^/]+\/image$/.test(route);
  if (stateRoute || logoutRoute || announcementRoute || voteRoute || imageRoute) return;
  const required = requiredCommunityVoteForUser(auth.user.id);
  if (required) throw new HttpError(423, 'Você precisa votar na pauta pendente antes do prazo terminar.');
}

export function lieVoteDecision(requiredVoterIds = [], votes = {}) {
  const voterIds = [...new Set(requiredVoterIds)];
  const lieVotes = voterIds.filter((id) => votes[id] === 'lie').length;
  const strongLieVotes = voterIds.filter((id) => votes[id] === 'strong-lie').length;
  const truthVotes = voterIds.filter((id) => votes[id] === 'truth').length;
  // “Não ouvi” registra que a pessoa participou, mas é uma abstenção: não
  // pesa nem para confirmar nem para negar a acusação.
  const notHeardVotes = voterIds.filter((id) => votes[id] === 'not-heard').length;
  const remaining = Math.max(0, voterIds.length - lieVotes - strongLieVotes - truthVotes - notHeardVotes);
  const everyoneAnswered = remaining === 0;
  // Mentira e verdade só são definidas pela maioria absoluta da tripulação
  // elegível. Assim, com 11 pessoas, três votos não podem encerrar o caso:
  // são necessários seis votos para qualquer um dos lados.
  const majorityThreshold = Math.floor(voterIds.length / 2) + 1;
  // “Mentiu forte” também confirma que houve mentira. Para valer dois pontos,
  // porém, a própria opção precisa atingir a maioria absoluta; uma mistura de
  // votos Mentiu + Mentiu forte confirma a mentira normal, de um ponto.
  const outcome = strongLieVotes >= majorityThreshold
    ? 'strong-lie'
    : lieVotes + strongLieVotes >= majorityThreshold
      ? 'lie'
    : truthVotes >= majorityThreshold
      ? 'truth'
      // Todos participaram, mas ninguém alcançou a maioria: não altera o
      // placar e não fica travando a rodada.
      : everyoneAnswered ? 'not-heard' : null;
  return { outcome, lieVotes, strongLieVotes, truthVotes, notHeardVotes, remaining, majorityThreshold };
}

function resolveLieVoteIfDecided(item, now = new Date().toISOString()) {
  if (!item || item.status !== 'pending' || !Array.isArray(item.requiredVoterIds)) return false;
  item.votes ||= {};
  const { outcome, lieVotes, strongLieVotes, truthVotes, notHeardVotes, remaining } = lieVoteDecision(item.requiredVoterIds, item.votes);
  if (!outcome) return false;

  if (outcome === 'lie' || outcome === 'strong-lie') {
    item.status = 'confirmed';
    item.confirmedAt = now;
    item.validatedByUserId = null;
    item.voteOutcome = outcome;
    item.delta = outcome === 'strong-lie' ? 2 : 1;
    const target = db.users.find((person) => person.id === item.targetUserId);
    const confirmedVotes = lieVotes + strongLieVotes;
    const resultText = remaining > 0 ? `maioria definida em ${confirmedVotes} a ${truthVotes}` : `votação ${confirmedVotes} a ${truthVotes}`;
    const strongText = outcome === 'strong-lie' ? '🤥💥 Mentira forte confirmada (+2 pontos) para ' : '🤥 Mentira confirmada para ';
    db.anonymousPosts.push({ id: randomUUID(), authorId: null, system: true, authorName: 'Mentirômetro', message: strongText + (target?.displayName || 'participante') + ': “' + (item.reason || 'Sem motivo registrado') + '” · ' + resultText + '.', createdAt: now });
    if (db.anonymousPosts.length > 500) db.anonymousPosts = db.anonymousPosts.slice(-500);
  } else {
    item.status = 'rejected';
    item.rejectedAt = now;
    item.voteOutcome = outcome;
  }
  item.decisionVotes = { lie: lieVotes, strongLie: strongLieVotes, truth: truthVotes, notHeard: notHeardVotes, remaining };
  return true;
}

function settlePendingLieVotes(now = new Date().toISOString()) {
  let changed = false;
  db.lieAccusations.filter((item) => item.status === 'pending').forEach((item) => {
    if (resolveLieVoteIfDecided(item, now)) changed = true;
  });
  return changed;
}

function lieApprovalPeople(item) {
  const voterIds = Array.isArray(item.requiredVoterIds)
    ? item.requiredVoterIds.filter((id) => ['lie', 'strong-lie'].includes(item.votes?.[id]))
    : [];
  if (voterIds.length) return voterIds.map((id) => {
    const person = db.users.find((entry) => entry.id === id);
    return { id, displayName: person?.displayName || 'Conta removida' };
  });
  if (item.validatedByUserId) {
    const person = db.users.find((entry) => entry.id === item.validatedByUserId);
    return [{ id: item.validatedByUserId, displayName: person?.displayName || 'Conta removida' }];
  }
  return [];
}

// Remove deleted/deactivated accounts from open decisions before serializing
// the Mentirometro state. Existing votes from active participants are kept and
// the decision is recalculated with the remaining electorate.
function sanitizePendingLieVoters(now = new Date().toISOString()) {
  const activeVoterIds = new Set(db.users.filter((user) => user.active && user.approved !== false).map((user) => user.id));
  let changed = false;
  db.lieAccusations.filter((item) => item.status === 'pending').forEach((item) => {
    const originalRequired = Array.isArray(item.requiredVoterIds) ? [...new Set(item.requiredVoterIds)] : [];
    const required = originalRequired.length ? originalRequired : [...activeVoterIds];
    const nextRequired = required.filter((id) => activeVoterIds.has(id));
    if (originalRequired.length !== nextRequired.length || originalRequired.some((id, index) => id !== nextRequired[index])) changed = true;
    item.requiredVoterIds = nextRequired;
    if (!item.votes || typeof item.votes !== 'object' || Array.isArray(item.votes)) { item.votes = {}; changed = true; }
    Object.keys(item.votes).forEach((voterId) => {
      if (!nextRequired.includes(voterId)) { delete item.votes[voterId]; changed = true; }
    });
    if (!nextRequired.length) {
      item.status = 'cancelled';
      item.cancelledAt = now;
      item.cancelReason = 'Não há participantes ativos para validar';
      changed = true;
    } else if (resolveLieVoteIfDecided(item, now)) {
      changed = true;
    }
  });
  return changed;
}

function cosmeticsFor(userId) {
  return db.economy.equipped[userId] || { title: null, nameStyle: null, frame: null };
}

function publicIdentityFor(userId, localHalloweenPreview = false) {
  const owner = db.users.find((item) => item.id === userId);
  const equipped = equippedCosmeticsForUser(owner, cosmeticsFor(userId), localHalloweenPreview);
  const byId = new Map(SHOP_CATALOG.map((item) => [item.id, item]));
  const itemFor = (type) => cosmeticCatalogItemForUser(byId.get(equipped[type]), owner, localHalloweenPreview);
  return {
    nameStyle: itemFor('nameStyle')?.value || null,
    frame: itemFor('frame')?.value || null,
    badge: itemFor('badge')?.value || null,
  };
}

function availablePowerPurchases(userId, itemId) {
  const used = new Set(db.economy.powerUses.map((item) => item.purchaseId));
  return db.economy.purchases.filter((item) => item.userId === userId && item.itemId === itemId && !item.mysteryDecisionPending && !used.has(item.id));
}

function consumePower(userId, itemId, details = {}) {
  const purchases = availablePowerPurchases(userId, itemId);
  const purchase = Object.hasOwn(details, 'sealed') ? purchases.find((entry) => Boolean(entry.sealed) === Boolean(details.sealed)) : purchases[0];
  if (!purchase) throw new HttpError(409, 'Você não possui este poder. Compre-o primeiro na loja.');
  db.economy.powerUses.push({ id: randomUUID(), purchaseId: purchase.id, userId, itemId, usedAt: new Date().toISOString(), ...details });
}

function json(res, status, data, headers = {}) {
  let serialized = data && typeof data === 'object' ? serializedJsonCache.get(data) : null;
  if (!serialized) {
    const body = JSON.stringify(data);
    serialized = { body, bytes: Buffer.byteLength(body) };
    if (data && typeof data === 'object') serializedJsonCache.set(data, serialized);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': serialized.bytes, 'Cache-Control': 'no-store', ...headers,
  });
  res.end(serialized.body);
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

// Davi também administra as entregas do servidor. A permissão fica no servidor
// para que o painel não possa ser exposto por uma alteração no navegador.
function canManageCobblemonServer(user) {
  return user?.role === 'admin' || /^davi\b/i.test(String(user?.displayName || ''));
}

function publicDraw(result) {
  const { winnerUserId, ...safeResult } = result;
  return safeResult;
}

function sendLiveEvent(res, event, data) {
  res.write('event: ' + event + '\n');
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcastLive(event, data, excludedUserId = null) {
  for (const [client, userId] of [...liveClients]) {
    if (excludedUserId && userId === excludedUserId) continue;
    try { sendLiveEvent(client, event, event === 'draw' ? drawForUser(data, userId) : data); }
    catch { liveClients.delete(client); }
  }
}

function broadcastRefresh(reason) {
  broadcastLive('refresh', { reason, serverTime: Date.now() });
}

// Automatic casino plays have their own result response. Coalesce their
// economy broadcasts so six players do not cause six full state reads per spin.
let casinoAutoRefreshTimer = null;
function broadcastCasinoPlayRefresh(autoSessionId) {
  if (!autoSessionId) { broadcastRefresh('economy'); return; }
  if (casinoAutoRefreshTimer) return;
  casinoAutoRefreshTimer = setTimeout(() => {
    casinoAutoRefreshTimer = null;
    broadcastRefresh('economy');
  }, 6000);
}

const casinoAutoOwners = new Map();
function authorizeCasinoAuto(userId, sessionId, game, bet, walletSource) {
  const current = casinoAutoOwners.get(userId);
  if (!sessionId) {
    if (current && current.expiresAt > Date.now()) throw new HttpError(409, 'Há um giro automático ativo nesta conta. Pare a sequência antes de apostar manualmente.');
    return;
  }
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) throw new HttpError(400, 'Identificação do giro automático inválida.');
  if (current && current.expiresAt > Date.now() && current.sessionId !== sessionId)
    throw new HttpError(409, 'Já existe um giro automático nesta conta. Pare o outro antes de começar.');
  if (current?.sessionId === sessionId && (current.game !== game || current.bet !== bet || current.walletSource !== walletSource))
    throw new HttpError(409, 'Não altere o jogo, valor ou saldo durante o giro automático.');
  if (current?.sessionId === sessionId && current.count >= 30)
    throw new HttpError(409, 'O limite de 30 giros desta sequência foi atingido.');
  casinoAutoOwners.set(userId, { sessionId, game, bet, walletSource, count: (current?.sessionId === sessionId ? current.count : 0) + 1, expiresAt: Date.now() + 45000 });
}

function compactCasinoPlayResponse(user, play) {
  return { casinoResult: play, casinoBalances: {
    promotional: Number(casinoAccountFor(user.id, true).balance),
    shop: walletFor(user.id),
    jackpot: Number(db.economy.casinoJackpot?.amount || CASINO_JACKPOT.seed),
    closedBoxes: db.economy.mysteryBoxes.filter((item) => item.userId === user.id).length,
  } };
}

function startLiveDraw(result, candidates, notify = true) {
  // A resposta HTTP do administrador e os eventos dos demais precisam chegar
  // antes do início. O término é absoluto e igual para toda a tripulação.
  const startedAt = Date.now() + 1400;
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
  if (notify) broadcastLive('draw', liveDraw);
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

// A resposta de quem iniciou o giro é a sua fonte imediata de animação. Só
// depois dela avisamos os demais clientes, para o iniciador não ficar travado
// enquanto o resultado já aparece ao vivo para a equipe.
function respondLiveDraw(res, user, draw) {
  json(res, 200, drawForUser(draw, user.id));
  broadcastLive('draw', draw, user.id);
}

function gayDrawContext(roundId) {
  const participants = eligibleUsers();
  const assignments = db.assignments.filter((item) => item.roundId === roundId && item.revealed);
  if (!participants.length || assignments.length !== participants.length) {
    throw new HttpError(409, 'Distribua um wallpaper para cada participante antes deste sorteio.');
  }
  if (db.draws.some((item) => item.type === 'gay' && item.roundId === roundId) || db.economy.pendingGayDraw?.roundId === roundId) {
    throw new HttpError(409, 'O Gay da Rodada desta rodada já foi sorteado ou aguarda uma decisão.');
  }
  const submissions = db.submissions.filter((item) => item.active && item.roundId === roundId);
  if (submissions.length < 2) throw new HttpError(409, 'São necessários ao menos 2 wallpapers para abrir a votação.');
  let candidates = [...participants];
  const forcedGay = db.economy.forcedGay && db.economy.forcedGay.roundId === roundId ? db.economy.forcedGay : null;
  if (!forcedGay && db.settings.excludeLastGayWinner && candidates.length > 1) {
    const last = [...db.draws].reverse().find((item) => item.type === 'gay' && item.roundId !== roundId);
    if (last) candidates = candidates.filter((item) => item.id !== last.winnerId);
  }
  return { participants, assignments, submissions, candidates, forcedGay };
}

function chooseGayCandidate(candidates, forcedTargetId = null) {
  if (forcedTargetId) return candidates.find((candidate) => candidate.id === forcedTargetId) || null;
  return candidates.length ? candidates[randomInt(candidates.length)] : null;
}

function makeGayDrawResult({ roundId, participants, assignments, submissions, winner, drawnBy }) {
  const winnerAssignment = assignments.find((item) => item.userId === winner.id);
  const sourceSubmission = winnerAssignment && db.submissions.find((item) => item.id === winnerAssignment.submissionId);
  if (!sourceSubmission) throw new HttpError(409, 'Não foi possível localizar o wallpaper do sorteado.');
  const votingId = randomUUID();
  const result = {
    id: randomUUID(), type: 'gay', winnerId: winner.id, winnerUserId: winner.id,
    winner: winner.displayName, detail: 'Gay da Rodada', imageUrl: '/gay-da-rodada.png',
    roundId, votingId, watermarkSourceUrl: '/uploads/' + sourceSubmission.filename,
    watermarkSourceTitle: sourceSubmission.title, roundName: db.settings.roundName,
    drawnBy, createdAt: new Date().toISOString(),
  };
  db.votings.push({
    id: votingId, roundId, roundName: db.settings.roundName, theme: db.settings.currentTheme,
    submissionIds: submissions.map((item) => item.id), requiredVoterIds: participants.map((item) => item.id),
    votes: [], status: 'open', scoresApplied: false, openedAt: new Date().toISOString(), closedAt: null,
  });
  addScore(winner.id, { gayWins: 1 });
  db.economy.forcedGay = null;
  db.economy.pendingGayDraw = null;
  db.draws.push(result);
  return result;
}

function makePendingGayResult(pending, winner) {
  return {
    id: randomUUID(), type: 'gay', pendingShield: true, pendingId: pending.id,
    winnerId: winner.id, winnerUserId: winner.id, winner: winner.displayName,
    shieldTargetId: winner.id, shieldTargetName: winner.displayName,
    detail: 'Possui Escudo da Rodada — aguardando decisão', imageUrl: '/gay-da-rodada.png',
    roundId: pending.roundId, roundName: db.settings.roundName, drawnBy: pending.drawnBy,
    createdAt: new Date().toISOString(),
  };
}

function shieldAvailableFor(userId) {
  return availablePowerPurchases(userId, 'power-shield-gay').length > 0;
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
    imageUrl: item.imageFilename ? '/api/feedback/' + encodeURIComponent(item.id) + '/image' : null,
  }));
}

const COMMUNITY_VOTE_DURATION_MS = 48 * 60 * 60 * 1000;
function communityVotePeople() { return db.users.filter((person) => person.active && person.approved !== false); }
function communityVoteExpiresAt(item) {
  const createdAt = Date.parse(item?.createdAt || '');
  const stored = Date.parse(item?.expiresAt || '');
  return Number.isFinite(stored) ? stored : Number.isFinite(createdAt) ? createdAt + COMMUNITY_VOTE_DURATION_MS : Date.now() + COMMUNITY_VOTE_DURATION_MS;
}
function settleCommunityVoteByMajority(item, now = new Date().toISOString()) {
  if (!item || item.status !== 'open') return false;
  const eligibleIds = Array.isArray(item.eligibleVoterIds) && item.eligibleVoterIds.length ? item.eligibleVoterIds : communityVotePeople().map((person) => person.id);
  item.eligibleVoterIds = [...new Set(eligibleIds)];
  const threshold = Math.floor(item.eligibleVoterIds.length / 2) + 1;
  const favor = (item.votes || []).filter((entry) => entry.vote === 'favor').length;
  const against = (item.votes || []).filter((entry) => entry.vote === 'against').length;
  const nowAt = Date.parse(now) || Date.now();
  item.expiresAt ||= new Date(communityVoteExpiresAt(item)).toISOString();
  if (nowAt >= communityVoteExpiresAt(item) && favor < threshold && against < threshold) {
    item.status = 'closed'; item.outcome = 'rejected'; item.implementationStatus = null;
    item.closedAt = new Date(nowAt).toISOString(); item.closedBy = 'automatic-deadline'; item.majorityThreshold = threshold;
    return true;
  }
  if (favor < threshold && against < threshold) return false;
  item.status = 'closed';
  item.outcome = favor >= threshold ? 'approved' : 'rejected';
  item.implementationStatus = item.outcome === 'approved' ? 'pending' : null;
  item.closedAt = now;
  item.closedBy = 'automatic-majority';
  item.majorityThreshold = threshold;
  return true;
}
function requiredCommunityVoteForUser(userId, now = Date.now()) {
  const item = (db.communityVotes || []).filter((entry) => entry.status === 'open' && Array.isArray(entry.eligibleVoterIds) && entry.eligibleVoterIds.includes(userId) && !(entry.votes || []).some((vote) => vote.userId === userId))
    .filter((entry) => now < communityVoteExpiresAt(entry))
    .sort((left, right) => communityVoteExpiresAt(left) - communityVoteExpiresAt(right) || String(left.createdAt).localeCompare(String(right.createdAt)))[0];
  if (!item) return null;
  return { id: item.id, subject: item.subject, expiresAt: new Date(communityVoteExpiresAt(item)).toISOString() };
}
function communityVotesForClient(user) {
  const people = new Map(communityVotePeople().map((person) => [person.id, person]));
  const votes = (db.communityVotes || []).slice(-80).reverse().map((item) => {
    settleCommunityVoteByMajority(item);
    item.eligibleVoterIds ||= communityVotePeople().map((person) => person.id);
    const ballot = (item.votes || []).find((entry) => entry.userId === user.id) || null;
    const voters = (item.votes || []).map((entry) => {
      const person = people.get(entry.userId);
      return { id: entry.userId, name: person?.displayName || entry.userName || 'Conta removida', avatarDataUrl: person?.avatarDataUrl || null, vote: entry.vote, createdAt: entry.createdAt };
    });
    const comments = (item.comments || []).slice(-50).map((entry) => {
      const person = people.get(entry.userId);
      return { id: entry.id, userId: entry.userId, name: person?.displayName || entry.userName || 'Conta removida', avatarDataUrl: person?.avatarDataUrl || null, message: entry.message, createdAt: entry.createdAt, canDelete: entry.userId === user.id };
    });
    const eligibleTotal = item.eligibleVoterIds.length;
    const favor = voters.filter((entry) => entry.vote === 'favor').length;
    const against = voters.filter((entry) => entry.vote === 'against').length;
    const outcome = item.outcome || (item.status === 'closed' ? (favor > against ? 'approved' : 'rejected') : null);
    return {
      id: item.id, subject: item.subject, imageUrl: item.imageFilename ? '/api/community-votes/' + encodeURIComponent(item.id) + '/image' : null, status: item.status === 'open' ? 'open' : item.status === 'archived' ? 'archived' : 'closed',
      createdAt: item.createdAt, closedAt: item.closedAt || null, closedBy: item.closedBy || null, archivedAt: item.archivedAt || null,
      authorId: item.authorId, authorName: people.get(item.authorId)?.displayName || item.authorName || 'Conta removida', authorAvatarDataUrl: people.get(item.authorId)?.avatarDataUrl || null,
      voters, comments, favor, against, eligibleTotal, majorityThreshold: item.majorityThreshold || Math.floor(eligibleTotal / 2) + 1,
      outcome, implementationStatus: item.implementationStatus || (outcome === 'approved' ? 'pending' : null), implementationReason: item.implementationReason || null, implementedAt: item.implementedAt || null,
      myVote: ballot?.vote || null, canVote: item.status === 'open' && item.eligibleVoterIds.includes(user.id) && !ballot,
      expiresAt: new Date(communityVoteExpiresAt(item)).toISOString(),
      mandatoryAt: item.createdAt,
    };
  });
  return { votes, requiredVote: user.role === 'admin' ? null : requiredCommunityVoteForUser(user.id) };
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

const STELLAR_LOAN_LIMITS = [900, 1200, 1500, 1800, 2100, 2400];
const STELLAR_LOAN_STEP = 300;

function stellarLoanTrustFor(userId) {
  // Apenas contratos emitidos após a criação desta regra contam para a
  // confiança. Contratos antigos seguem íntegros, sem ganhar ou perder nível
  // retroativamente por dados que não registravam essa condição.
  const settled = db.economy.loans
    .filter((loan) => loan.userId === userId && ['on-time', 'late'].includes(loan.trustOutcome))
    .sort((a, b) => String(a.paidAt || '').localeCompare(String(b.paidAt || '')));
  let level = 0; let onTime = 0; let late = 0;
  settled.forEach((loan) => {
    if (loan.trustOutcome === 'on-time') { level = Math.min(STELLAR_LOAN_LIMITS.length - 1, level + 1); onTime++; }
    else { level = Math.max(0, level - 1); late++; }
  });
  const maxPrincipal = STELLAR_LOAN_LIMITS[level];
  return {
    level, maxLevel: STELLAR_LOAN_LIMITS.length - 1, maxPrincipal,
    nextMaxPrincipal: STELLAR_LOAN_LIMITS[Math.min(level + 1, STELLAR_LOAN_LIMITS.length - 1)],
    qualifyingPrincipal: maxPrincipal, onTime, late,
    offers: Array.from({ length: Math.floor(maxPrincipal / STELLAR_LOAN_STEP) }, (_, index) => (index + 1) * STELLAR_LOAN_STEP),
  };
}

function settleStellarLoanTrust(loan, paidAt = new Date().toISOString()) {
  if (!loan || loan.trustOutcome || loan.status !== 'paid') return;
  const dueAt = Date.parse(loan.dueAt || '');
  const paidOnTime = Number.isFinite(dueAt) && Date.parse(paidAt) <= dueAt;
  // Para aumentar de faixa, a pessoa precisa ter usado e quitado o limite
  // disponível naquela contratação. Pagamentos menores continuam válidos, mas
  // não permitem subir repetindo empréstimos pequenos.
  const qualifiesForAdvance = Number(loan.principal) >= Number(loan.trustQualifyingPrincipal || Infinity);
  loan.trustOutcome = paidOnTime ? (qualifiesForAdvance ? 'on-time' : 'neutral') : 'late';
  loan.trustSettledAt = paidAt;
}

function applyLoanPayment(userId, requested, reason) {
  const loan = activeLoanFor(userId);
  if (!loan) return 0;
  const amount = roundMoney(Math.min(Number(requested), Number(loan.remainingDue), walletFor(userId)));
  if (amount < 0.01) return 0;
  const before = walletFor(userId), createdAt = new Date().toISOString();
  addCredits(userId, -amount);
  loan.remainingDue = roundMoney(Number(loan.remainingDue) - amount);
  loan.payments.push({ amount, createdAt });
  if (loan.remainingDue <= 0) { loan.remainingDue = 0; loan.status = 'paid'; loan.paidAt = createdAt; settleStellarLoanTrust(loan, createdAt); }
  db.economy.creditAdjustments.push({ id: randomUUID(), userId, mode: 'stellar-loan-payment', amount: -amount, before, after: roundMoney(before - amount), reason, createdAt });
  return amount;
}

function stellarItemValue(purchase, item) {
  const base = Number(purchase.originalPrice ?? purchase.price ?? item.price ?? 0);
  return roundMoney(Math.max(25, base * .6));
}

function stellarItemOffers(userId) {
  const owned = db.economy.purchases.filter((purchase) => purchase.userId === userId && !purchase.mysteryDecisionPending);
  return owned.map((purchase) => {
    const item = SHOP_CATALOG.find((entry) => entry.id === purchase.itemId);
    if (!item || item.consumable || item.mysteryBox || item.service || item.adminOnly) return null;
    const value = stellarItemValue(purchase, item);
    return { purchaseId: purchase.id, itemId: item.id, type: item.type || '', styleValue: item.value || '', name: item.name, icon: item.icon || '🎁', iconAsset: item.iconAsset || '', value };
  }).filter(Boolean).sort((a, b) => b.value - a.value).slice(0, 12);
}

function stellarBlackMarketOffers(userId) {
  const equipped = cosmeticsFor(userId);
  const reserved = new Set((db.economy.trades || [])
    .filter((trade) => trade.status === 'pending' && Date.parse(trade.expiresAt) > Date.now())
    .flatMap((trade) => [trade.offeredId, trade.wantedId]));
  return db.economy.purchases.filter((purchase) => purchase.userId === userId).map((purchase) => {
    const item = SHOP_CATALOG.find((entry) => entry.id === purchase.itemId);
    // Prêmios de baú não debitam créditos na hora da revelação, por isso
    // `price` é zero. Eles ainda são itens reais do usuário e guardam o
    // `originalPrice`; excluí-los fazia inventários como o do Luan aparecerem
    // vazios no Mercado Negro.
    const basePrice = Number(purchase.originalPrice ?? purchase.price ?? item?.price ?? 0);
    if (!isTradableVisual(item) || purchase.mysteryDecisionPending || basePrice <= 0 || reserved.has(purchase.id)) return null;
    if (item.type && equipped[item.type] === item.id) return null;
    const value = stellarItemValue(purchase, item);
    return { purchaseId: purchase.id, itemId: item.id, type: item.type || '', styleValue: item.value || '', name: item.name, icon: item.icon || '🕶️', iconAsset: item.iconAsset || '', paid: basePrice, value };
  }).filter(Boolean).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
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
    // Em empate para melhor, o voto negativo pesa: entre os mesmos votos de
    // melhor, vence quem recebeu menos votos de pior.
    const fewestWorstAmongBest = Math.min(...bestLeaders.map((item) => item.worst));
    const bestAfterOppositeVote = bestLeaders.filter((item) => item.worst === fewestWorstAmongBest);
    const bestWinner = bestAfterOppositeVote[randomInt(bestAfterOppositeVote.length)];
    const worstPool = totals.filter((item) => item.id !== bestWinner.id);
    const maxWorst = Math.max(...worstPool.map((item) => item.worst));
    const worstLeaders = worstPool.filter((item) => item.worst === maxWorst);
    // Em empate para pior, a lógica se inverte: menos votos de melhor vence.
    const fewestBestAmongWorst = Math.min(...worstLeaders.map((item) => item.best));
    const worstAfterOppositeVote = worstLeaders.filter((item) => item.best === fewestBestAmongWorst);
    const worstWinner = worstAfterOppositeVote[randomInt(worstAfterOppositeVote.length)];
    voting.bestWinnerId = bestWinner.id;
    voting.worstWinnerId = worstWinner.id;
    voting.bestWinnerVotes = bestWinner.best;
    voting.worstWinnerVotes = worstWinner.worst;
    voting.bestTiebreak = bestLeaders.length > 1;
    voting.worstTiebreak = worstLeaders.length > 1;
    voting.bestTiebreakByOppositeVote = bestLeaders.length > bestAfterOppositeVote.length;
    voting.worstTiebreakByOppositeVote = worstLeaders.length > worstAfterOppositeVote.length;
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
  const votersRevealed = closed && votes.length >= voting.requiredVoterIds.length;
  const voterNames = votersRevealed ? new Map(db.users.map((person) => [person.id, person.displayName])) : null;
  const voterName = (vote) => voterNames.get(vote.userId) || 'Conta removida';
  const canViewEntries = closed || voting.requiredVoterIds.includes(user.id);
  const entries = voting.submissionIds.map((id) => {
    const item = db.submissions.find((submission) => submission.id === id);
    if (!item) return null;
    const bestVotes = votes.filter((vote) => vote.bestId === id).length;
    const worstVotes = votes.filter((vote) => vote.worstId === id).length;
    return {
      id: item.id, title: item.title, imageUrl: canViewEntries ? '/uploads/' + item.filename : null,
      isMine: item.userId === user.id,
      revealed: closed, uploader: closed ? item.uploader : null,
      bestVotes: closed ? bestVotes : null, worstVotes: closed ? worstVotes : null,
      bestVoters: votersRevealed ? votes.filter((vote) => vote.bestId === id).map(voterName) : null,
      worstVoters: votersRevealed ? votes.filter((vote) => vote.worstId === id).map(voterName) : null,
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
      bestTiebreakByOppositeVote: Boolean(voting.bestTiebreakByOppositeVote),
      worstTiebreakByOppositeVote: Boolean(voting.worstTiebreakByOppositeVote),
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
  for (const penalty of (db.economy.wallpaperDeadlinePenalties || []).filter((item) => !item.clearedAt)) give(penalty.userId, { id: 'live-wallpaper-deadline', icon: '🫏', name: 'Cusão da rodada', reason: 'Abduzido por falta de comprometimento' });

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

function isVisualPunishmentCleared(createdAt, clearedAt) {
  const punishmentStartedAt = Date.parse(createdAt || '');
  const punishmentClearedAt = Date.parse(clearedAt || '');
  return Number.isFinite(punishmentStartedAt) && Number.isFinite(punishmentClearedAt) && punishmentStartedAt <= punishmentClearedAt;
}

function isForcedCursorActive(item, roundId, now = Date.now()) {
  if (item.expiresAt) return now < Date.parse(item.expiresAt);
  if (item.style === 'giant-slow' || item.style === 'adhd') return now < Date.parse(item.createdAt) + 86400000;
  return Boolean(roundId && item.roundId === roundId);
}

function recordFlightPayout(flight,bet,multiplier,createdAt) {
  if(bet.result)return bet.result;
  const payout=roundMoney(bet.bet*multiplier),account=casinoAccountFor(bet.userId,true);
  if(bet.walletSource==='shop')addCredits(bet.userId,payout);else account.balance=roundMoney(Number(account.balance)+payout);
  bet.status='cashed-out';bet.multiplier=multiplier;bet.payout=payout;bet.endedAt=createdAt;
  const play={id:randomUUID(),flightId:flight.id,userId:bet.userId,dayKey:saoPauloDayKey(),walletSource:bet.walletSource,bet:bet.bet,resultType:'flight',multiplier,payout,net:roundMoney(payout-bet.bet),balanceAfter:bet.walletSource==='shop'?walletFor(bet.userId):account.balance,createdAt};
  bet.result=play;db.economy.casinoPlays.push(play);return play;
}
function settleGlobalFlight(now=Date.now()) {
  const flight=db.economy.globalFlight;
  const wasCrashed=flight?.status==='crashed';
  const changed=settleFlight(flight,now,(bet,multiplier,date)=>recordFlightPayout(flight,bet,multiplier,date),(bet,date)=>{
    bet.status='crashed';
    db.economy.casinoPlays.push({id:randomUUID(),flightId:flight.id,userId:bet.userId,dayKey:saoPauloDayKey(),walletSource:bet.walletSource,bet:bet.bet,resultType:'flight',multiplier:0,payout:0,net:roundMoney(-bet.bet),balanceAfter:bet.walletSource==='shop'?walletFor(bet.userId):casinoAccountFor(bet.userId).balance,createdAt:date});
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
  if (!['/api/lie-meter/report','/api/trades/create','/api/trades/respond'].includes(route) || req.method!=='POST') return false;
  const {user}=requireAuth(req); const body=await readJson(req); const now=new Date().toISOString();
  if (route==='/api/lie-meter/report') {
    const lie=db.lieAccusations.find(l=>l.id===body.lieId && l.status==='confirmed' && l.delta>0);
    if (!lie || !activeLieReasons(lie.targetUserId).some(l=>l.id===lie.id)) throw new HttpError(404,'Mentira confirmada não encontrada.');
    const reason=String(body.reason || '').trim();
    if(reason.length<5 || reason.length>500) throw new HttpError(400,'Explique a denúncia em 5 a 500 caracteres.');
    if((db.lieDisputes || []).some((item) => item.lieId === lie.id && item.status === 'open')) throw new HttpError(409,'Essa mentira já está em discussão. As pessoas responsáveis receberam uma notificação.');
    const participantIds=[...new Set([lie.targetUserId,lie.createdByUserId,lie.validatedByUserId].filter(Boolean))];
    if(participantIds.length!==3) throw new HttpError(409,'Esta mentira não possui as três pessoas necessárias para uma revisão em consenso.');
    db.lieDisputes ||= [];
    db.lieDisputes.push({id:randomUUID(),lieId:lie.id,reporterId:user.id,reason,participantIds,decisions:{},messages:[{id:randomUUID(),authorId:user.id,authorName:user.displayName,text:'Denúncia aberta: '+reason,system:true,createdAt:now}],status:'open',outcome:null,createdAt:now,updatedAt:now});
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



function publicProfileFor(target) {
  const score=scoreFor(target.id),titles=liveTitleAssignments().get(target.id)||[],profile=profileFor(target),album=albumFor(db,target.id,saoPauloDayKey(),seasonalAlbumOptions());
  const favorite=[...album.collections].sort((a,b)=>b.collected-a.collected || b.crafts-a.crafts)[0],itemFor=id=>cosmeticCatalogItemForUser(SHOP_CATALOG.find(item=>item.id===id),target);
  const theme=itemFor(profile.equipped.siteTheme),cursor=itemFor(profile.equipped.cursorStyle),badge=itemFor(profile.equipped.badge),insignia=album.collections.find(item=>item.id===album.equipped);
  return {id:target.id,displayName:target.displayName,avatarDataUrl:target.avatarDataUrl||null,liveTitles:titles,showcase:profile.showcase.selected,
    social:{favoriteCollection:favorite&&favorite.collected?{name:favorite.name,icon:favorite.icon,collected:favorite.collected}:null,theme:theme?{name:theme.name,icon:theme.icon}:null,cursor:cursor?{name:cursor.name,icon:cursor.icon}:null,badge:badge?{name:badge.name,icon:badge.icon}:null,insignia:insignia?.craftedAt?{name:insignia.badge,icon:insignia.medal?.icon||insignia.icon,tier:insignia.medal?.label||'Bronze'}:null},
    stats:{bestWins:score.bestWins||0,worstWins:score.worstWins||0,gayWins:score.gayWins||0,memes:profile.stats.memes||0,phrases:profile.stats.phrases||0,hydrationDays:profile.stats.hydrationDays||0},comments:(db.profileComments||[]).filter(item=>item.targetUserId===target.id).slice(-30).reverse().map(item=>({id:item.id,authorId:item.authorId,authorName:item.authorName,message:item.message,createdAt:item.createdAt}))};
}

function profileFor(user, computed = {}) {
  const localHalloweenPreview = Boolean(computed.localHalloweenPreview);
  const score = scoreFor(user.id);
  const purchases = db.economy.purchases.filter((item) => item.userId === user.id);
  const ownedIds = new Set(purchases.map((item) => item.itemId));
  const equipped = cosmeticsFor(user.id);
  const displayedEquipped = equippedCosmeticsForUser(user, equipped, localHalloweenPreview);
  const hydrationDays = db.economy.waterRewardDays.filter((key) => key.startsWith(user.id + ':')).length;
  const activityTotals = db.economy.activityTotals[user.id] || {};
  const memes = Number(activityTotals.meme || db.dailyMemes.filter((item) => item.userId === user.id).length);
  const phrases = Number(activityTotals.phrase || db.dailyPhrases.filter((item) => item.userId === user.id).length);
  const forcedCursor = [...db.economy.forcedCursors].reverse().find((item) => item.targetUserId === user.id && isForcedCursorActive(item, db.settings.currentRoundId));
  const curseHistory = (db.economy.curseHistory || []).filter((entry) => Date.parse(entry.createdAt) >= Date.parse(db.settings.cursePowersReleasedAt || '9999-12-31'));
  const revealedCurseIds = new Set((db.economy.curseAuthorReveals || []).map((entry) => entry.curseId));
  const latestGayWinnerDraw = [...db.draws].reverse().find((item) => item.type === 'gay');
  const gayWinnerDraw = latestGayWinnerDraw?.winnerId === user.id && !isVisualPunishmentCleared(latestGayWinnerDraw.createdAt, db.settings.visualThemeClearedAt) ? latestGayWinnerDraw : null;
  const deadlinePenalty = activeWallpaperDeadlinePenalty(user.id);
  const previousSeason = computed.previousSeason || seasonSummary(previousMonthKey());
  const medals = [
    { id: 'first-step', icon: '🚀', name: 'Primeiro contato', description: 'Entrou para a tripulação.', unlocked: true },
    { id: 'hydrated', icon: '💧', name: 'Hidratado', description: 'Alcançou a meta diária de água.', unlocked: hydrationDays >= 1 },
    { id: 'water-streak', icon: '🌊', name: 'Oceano particular', description: 'Alcançou a meta em 5 dias.', unlocked: hydrationDays >= 5 },
    { id: 'meme-agent', icon: '😂', name: 'Agente do caos', description: 'Publicou pelo menos 3 memes.', unlocked: memes >= 3 },
    { id: 'philosopher', icon: '💬', name: 'Filósofo alienígena', description: 'Publicou pelo menos 5 frases.', unlocked: phrases >= 5 },
    { id: 'champion', icon: '🏆', name: 'Campeão da Área 51', description: 'Venceu como melhor wallpaper.', unlocked: score.bestWins >= 1 },
    { id: 'collector', icon: '🛍️', name: 'Colecionador cósmico', description: 'Comprou pelo menos 3 itens.', unlocked: purchases.length >= 3 },
    { id: 'season-champion', icon: '🌟', name: 'Campeão da temporada', description: 'Terminou um mês na liderança geral.', unlocked: (previousSeason.champions || [previousSeason.leader]).some((person) => person?.id === user.id) },
    { id: 'signal-lost', icon: '📡', name: 'Sinal perdido', description: 'Publicou 5 memes e 5 frases para a tripulação.', unlocked: memes >= 5 && phrases >= 5, secret: true },
    { id: 'double-orbit', icon: '🪐', name: 'Órbita dupla', description: 'Foi melhor e pior wallpaper ao menos uma vez.', unlocked: score.bestWins >= 1 && score.worstWins >= 1, secret: true },
    { id: 'cosmic-hoarder', icon: '🎴', name: 'Arquivo cósmico', description: 'Abriu 3 pacotinhos de cartas.', unlocked: purchases.filter((item) => item.cardPackOpenedAt).length >= 3, secret: true },
  ];
  const album = computed.cardAlbum || albumFor(db, user.id, saoPauloDayKey(), seasonalAlbumOptions(localHalloweenPreview));
  const showcaseOptions = [
    ...medals.filter((item) => item.unlocked).map((item) => ({ id: 'medal:' + item.id, icon: item.icon, name: item.name, description: item.description, kind: 'Medalha' })),
    ...craftedBadgeArchiveFor(db,user.id).map((item) => ({ id: 'album:' + item.id, icon: item.medal?.icon || item.icon, name: item.badge, description: item.name + ' · ' + (item.medal?.label || 'Insígnia'), kind: 'Insígnia' })),
  ];
  const savedShowcase = Array.isArray(user.profileShowcase) ? user.profileShowcase.slice(0, 4) : [];
  const showcaseSelected = savedShowcase.map((id) => showcaseOptions.find((item) => item.id === id)).filter(Boolean);
  const investmentMarket = marketForUser(db.economy, user.id);
  investmentMarket.income = marketIncomeFor(user.id, investmentMarket);
  const cryptoMarket = cryptoMarketForUser(db.economy, user.id);
  cryptoMarket.income = cryptoIncomeFor(user.id, cryptoMarket);
  return {
    wallet: walletFor(user.id), equipped: displayedEquipped,
    wallpaperDeadlinePenalty: deadlinePenalty ? { title: 'Abduzido por falta de comprometimento', badge: 'Cusão da rodada', streak: deadlinePenalty.streak, amount: deadlinePenalty.amount, createdAt: deadlinePenalty.createdAt } : null,
    investmentMarket,
    cryptoMarket,
    cobblemon: {
      caught: Array.isArray(db.economy.cobblemonDex[user.id]) ? db.economy.cobblemonDex[user.id] : [],
      total: COBBLEMON_CATALOG.length,
      captureBonus: cobblemonCaptureBonusState(user.id),
      collections: db.users.filter((person) => person.active && person.approved !== false).map((person) => ({
        id: person.id,
        displayName: person.displayName,
        // A Pokédex pública precisa manter o estado shiny: além do brilho do
        // card, os filtros e os avisos direcionados dependem dessa informação.
        caught: (Array.isArray(db.economy.cobblemonDex[person.id]) ? db.economy.cobblemonDex[person.id] : []).map((entry) => ({ id: Number(entry.id), tier: Number(entry.tier || 1), level: Number(entry.level) > 0 ? Number(entry.level) : normalizedCobblemonLevel(entry.id, entry.tier), isShiny: Boolean(entry.isShiny) })),
      })),
      monthlyPokemonBox: (() => {
        const cycleId = pokemonCapsuleCycleKey();
        // Registros vendidos continuam contando como compras da semana; apenas
        // deixam de aparecer como candidatos no resultado.
        const cycleEntries = cycleId ? db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.boxId === 'pokemon' && entry.cycleId === cycleId && !['cycle-discarded', 'cycle-expired', 'replaced', 'reset-refunded'].includes(entry.status)) : [];
        const latest = [...cycleEntries].reverse()[0] || null;
        // Finish an in-progress capsule before moving to the next unopened one.
        // This keeps every purchase addressable when several capsules are bought
        // in the same week and prevents an older open capsule from becoming stale.
        const pendingBoxes = [...cycleEntries].reverse().filter((entry) => ['box-open', 'box-closed'].includes(entry.status));
        const openEntry = pendingBoxes[0] || null;
        const dailyChoice = [...cycleEntries].reverse().find((entry) => entry.status === 'choice-pending');
        const weeklyChoice = [...cycleEntries].reverse().find((entry) => entry.status === 'weekly-choice-pending');
        const choice = weeklyChoice || dailyChoice;
        const weeklyCandidates = cycleEntries.filter((entry) => ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status));
        const selectedEntries = cycleEntries.filter((entry) => ['cycle-candidate', 'weekly-choice-pending', 'awaiting-delivery', 'delivered', 'claimed-no-delivery'].includes(entry.status));
        const deliveryLocked = cycleEntries.some((entry) => ['awaiting-delivery', 'delivered', 'claimed-no-delivery'].includes(entry.status));
        const weeklyPurchaseCount = cycleEntries.length;
        const weeklyOpeningsUsed = cycleEntries.reduce((sum, entry) => sum + Number(entry.rolls?.length || entry.openCount || 0), 0);
        const openRollCount = openEntry ? Number(openEntry.rolls?.length || openEntry.openCount || 0) : 0;
        const unfinished = Boolean(openEntry || choice);
        const canOpen = Boolean(openEntry && !deliveryLocked && openRollCount < 3);
        const cycleStart = cycleId ? cycleId.slice('capsule-week:'.length) : null;
        const nextOpenAt = cycleStart ? new Date(Date.parse(cycleStart + 'T03:00:00Z') + 7 * 86400000).toISOString() : null;
        // A venda da escolha final encerra somente aquela escolha. Ela segue
        // contando como compra paga, mas não pode consumir uma vaga que ainda
        // existe no teto semanal de sete cápsulas.
        const canPurchase = !deliveryLocked && !weeklyChoice && weeklyPurchaseCount < 7;
        const toChoice = (entry) => entry ? { id: entry.id, name: entry.name, sprite: entry.sprite, choices: entry.choices || [], choiceStage: weeklyChoice ? 'weekly' : 'daily' } : null;
        // The weekly list must reflect the Pokémon selected from the three
        // rolls, not the last raw roll stored on the capsule.  `entry.roll`
        // is kept as history; the current entry fields are the authoritative
        // value after the player makes the daily choice.
        const candidateCard = pokemonCapsuleChoiceForEntry;
        return { price: COBBLEMON_BOXES.pokemon.price, canPurchase, canOpen, choicePending: Boolean(choice), choiceStage: weeklyChoice ? 'weekly' : dailyChoice ? 'daily' : null, choice: toChoice(choice), weeklyChoicePending: Boolean(weeklyChoice), weeklyCandidates: weeklyCandidates.map(candidateCard), pendingBoxes: pendingBoxes.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, openedAt: entry.openedAt || null, openRollCount: Number(entry.rolls?.length || entry.openCount || 0) })), weeklyPurchaseCount, weeklyPurchasesRemaining: Math.max(0, 7 - weeklyPurchaseCount), weeklyOpeningsUsed, selectedCount: selectedEntries.length, openCount: weeklyCandidates.length, openRollCount, rollsRemaining: Math.max(0, 7 - weeklyCandidates.length), dailyRollsRemaining: Math.max(0, 3 - openRollCount), boxId: openEntry?.id || choice?.id || latest?.id || null, purchasedAt: latest?.createdAt || null, openedAt: openEntry?.openedAt || null, nextOpenAt, cycleId, deliveryDay: 'sexta-feira', resetDay: 'sábado' };
      })(),
      // Entregas pendentes e o histórico do próprio usuário não podem ser
      // truncados: o limite anterior de 30 ocultava itens legítimos (como
      // pedras, balls e cápsulas) do painel do Davi/administradores.
      deliveries: db.economy.cobblemonDeliveries
        .filter((entry) => entry.userId === user.id || user.role === 'admin' || /^davi\b/i.test(String(user.displayName || '')))
        .reverse()
        // O identificador interno continua igual para não reescrever o
        // histórico financeiro; a apresentação, inclusive compras antigas,
        // usa a nomenclatura atual dos baús.
        .map((entry) => ({ ...entry, boxName: cobblemonDisplayLabel(entry.boxName), name: cobblemonDisplayLabel(entry.name) })),
      balls: (() => {
        const dayKey = saoPauloDayKey();
        // A Poké Ball básica tem seu próprio limite diário. Arremessos com
        // Great/Ultra consomem apenas o estoque especial e não podem reduzir
        // o contador das básicas exibido na caça.
        const used = cobblemonDailyPokeAttempts(user.id, dayKey);
        const purchase = [...db.economy.cobblemonBallPurchases].reverse().find((entry) => entry.userId === user.id && entry.dayKey === dayKey);
        const extra = purchase ? Math.max(0, Math.floor(Number(purchase.quantity || 0))) : 0;
        const total = 5 + extra;
        const unitPrice = roundMoney(retailPriceWithCents(90) / 10);
        const inventory = db.economy.cobblemonBallInventory[user.id] && typeof db.economy.cobblemonBallInventory[user.id] === 'object' ? db.economy.cobblemonBallInventory[user.id] : {};
        const special = Object.fromEntries(Object.entries(COBBLEMON_CAPTURE_BALLS).filter(([id, ball]) => !ball.daily).map(([id, ball]) => [id, { id, name: ball.name, shortName: ball.shortName, sprite: ball.sprite, multiplier: ball.multiplier, unitPrice: ball.price, quantity: Math.max(0, Number(inventory[id] || 0)) }]));
        return { remaining: Math.max(0, total - used), total, used, daily: 5, extra, maxPurchase: 20, canBuy: true, unitPrice, selected: COBBLEMON_CAPTURE_BALLS.poke.id, special };
      })(),
      roulette: (() => {
        const cycleId = pokemonCapsuleCycleKey(), cycleStart = cycleId.slice('capsule-week:'.length);
        const spins = db.economy.cobblemonRouletteSpins.filter((entry) => entry.userId === user.id && (entry.cycleId === cycleId || (!entry.cycleId && (entry.dayKey || saoPauloDayKey(new Date(entry.createdAt))) >= cycleStart)));
        const paidSpins = spins.filter((entry) => !entry.freeSpin);
        const spinsRemaining = Math.max(0, COBBLEMON_ROULETTE.weeklyLimit - paidSpins.length);
        const nextCycleAt = new Date(Date.parse(cycleStart + 'T03:00:00Z') + 7 * 86400000).toISOString();
        return { price: COBBLEMON_ROULETTE.price, weeklyLimit: 7, spinsUsed: paidSpins.length, spinsRemaining, nextCycleAt, canSpin: spinsRemaining > 0, cycleId, resetDay: 'sábado', last: spins.at(-1) || null };
      })(),
    },
    cardPacks: db.economy.purchases.filter(p=>p.userId===user.id && CARD_PACK_RULES[p.itemId] && !p.cardPackOpenedAt && !p.cardPackSettledAt).map(p=>{const item=SHOP_CATALOG.find(entry=>entry.id===p.itemId);return {id:p.id,itemId:p.itemId,name:item?.name || 'Pacotinho',icon:item?.icon || '🎴',packArt:item?.packArt || null,rareChance:Math.round(CARD_PACK_RULES[p.itemId].rareChance*100),value:item?.value || 'cosmic'};}),
    openedCardPacks: db.economy.purchases.filter(p=>p.userId===user.id && p.cardPackOpenedAt).slice(-3).reverse().map(p=>({id:p.id,cards:p.cardPackRewards,openedAt:p.cardPackOpenedAt})),
    physicalPrizes: physicalKitClaim() && (physicalKitClaim().userId === user.id || user.role === 'admin') ? [{ ...physicalKitClaim(), winnerName: db.users.find(entry => entry.id === physicalKitClaim().userId)?.displayName || 'Participante' }] : [],
    loan: (() => {
      const active = [...db.economy.loans].reverse().find((item) => item.userId === user.id && item.status === 'active');
      return active ? { id: active.id, principal: active.principal, totalDue: active.totalDue, remainingDue: active.remainingDue, createdAt: active.createdAt, dueAt: active.dueAt || null, overdue: Boolean(overdueLoanFor(user.id)), extended: Boolean(active.extendedAt) } : null;
    })(),
    stellarLender: (() => {
      try { const loan = activeLoanFor(user.id); const overdue = Boolean(overdueLoanFor(user.id)); return loan ? { visible: true, reason: overdue ? 'overdue' : 'active-loan', offers: stellarItemOffers(user.id) } : { visible: false, offers: [] }; }
      catch { return { visible: false, offers: [] }; }
    })(),
    stellarBlackMarket: { rate: 60, offers: stellarBlackMarketOffers(user.id) },
    stellarLoanTrust: stellarLoanTrustFor(user.id),
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
      const marketResale = Math.max(10, Math.floor(Number(entry.originalPrice ?? entry.price ?? catalog?.price ?? 0) * .55 / 10) * 10);
      const boxResaleCap = sourceBox ? Math.max(10, Math.floor(Number(sourceBox.sellPrice || 0) * .8 / 10) * 10) : marketResale;
      const sellPrice = Math.min(marketResale, boxResaleCap);
      return { purchaseId: entry.id, itemId: entry.itemId, name: catalog?.name || 'Prêmio do baú', icon: catalog?.icon || '🎁', type: catalog?.type || '', sellPrice, equipped: equipped[catalog?.type] === entry.itemId, acquiredAt: entry.createdAt };
    }).sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt)),
    freeShopPurchaseAvailable: !db.economy.freeShopUses.includes(user.id),
    curseRevealCandidates: curseHistory.filter((entry) => !revealedCurseIds.has(entry.id)).map((entry) => ({ id: entry.id, targetName: entry.targetName, style: entry.style, createdAt: entry.createdAt, active: Boolean(db.economy.forcedCursors.some((curse) => curse.id === entry.id && isForcedCursorActive(curse, db.settings.currentRoundId))) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    revealedCurseAuthors: curseHistory.filter((entry) => revealedCurseIds.has(entry.id)).map((entry) => ({ id: entry.id, targetName: entry.targetName, style: entry.style, createdAt: entry.createdAt, senderName: entry.senderName })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    haterCurse: forcedCursor?.style === 'hater' ? {
      id: forcedCursor.id, style: 'hater', createdAt: forcedCursor.createdAt, expiresAt: forcedCursor.expiresAt || null, sealed: Boolean(forcedCursor.sealed),
      // Apenas as seis frases daquele envio chegam ao alvo; quem comprou o
      // poder nunca é exposto nesta resposta.
      phrases: Array.isArray(forcedCursor.phrases) ? forcedCursor.phrases : null,
    } : null,
    givaldoCurse: forcedCursor?.style === 'givaldo' ? {
      id: forcedCursor.id, style: 'givaldo', createdAt: forcedCursor.createdAt, expiresAt: forcedCursor.expiresAt || null, sealed: Boolean(forcedCursor.sealed),
    } : null,
    forcedCursor: gayWinnerDraw ? { style: 'gay', appliedBy: 'Sorteio Gay da Rodada', createdAt: gayWinnerDraw.createdAt, automatic: true }
      : overdueLoanFor(user.id) ? { style: 'giant-slow', appliedBy: 'Agiota Estelar — quite a dívida', createdAt: overdueLoanFor(user.id).dueAt, debt: true }
      // A pessoa alvo precisa saber que foi afetada, mas a autoria de uma
      // maldição comprada é propositalmente sigilosa. Nunca exponha o nome
      // salvo para auditoria no estado entregue ao navegador dela.
      : forcedCursor && !['hater', 'givaldo'].includes(forcedCursor.style) ? { id: forcedCursor.id, style: forcedCursor.style || 'gay', appliedBy: 'Origem sigilosa', createdAt: forcedCursor.createdAt, expiresAt: forcedCursor.expiresAt || null, sealed: Boolean(forcedCursor.sealed) } : null,
    liveTitles: (computed.liveTitleMap || liveTitleAssignments()).get(user.id) || [],
    stats: { hydrationDays, memes, phrases, purchases: purchases.length, ...score },
    medals, showcase: { selected: showcaseSelected, selectedIds: showcaseSelected.map((item) => item.id), options: showcaseOptions, max: 4 },
    mission: weeklyMissionFor(user.id), missions: weeklyMissionsFor(user.id), dailyMissions: dailyMissionsFor(user.id), cleanNameMission: cleanNameMissionFor(user.id), seasonPass: seasonPassFor(db.economy, user.id), creditLedger: computed.creditLedger || creditLedgerFor(user.id),
    activePowers: {
      shield: Boolean(db.settings.currentRoundId && db.economy.shields.some((item) => item.roundId === db.settings.currentRoundId && item.userId === user.id)),
      pendingGayShield: db.economy.pendingGayDraw && db.economy.pendingGayDraw.roundId === db.settings.currentRoundId && db.economy.pendingGayDraw.currentCandidateId === user.id
        ? { id: db.economy.pendingGayDraw.id, roundId: db.economy.pendingGayDraw.roundId, candidateName: user.displayName, createdAt: db.economy.pendingGayDraw.createdAt }
        : null,
      forcedTheme: db.economy.forcedTheme && db.economy.forcedTheme.userId === user.id ? db.economy.forcedTheme.theme : null,
      forcedGay: db.economy.forcedGay && db.economy.forcedGay.userId === user.id ? db.economy.forcedGay.targetName : null,
      recentUses: db.economy.powerUses.filter((entry) => entry.userId === user.id).slice(-6).reverse().map((entry) => {
        const catalogItem = SHOP_CATALOG.find((item) => item.id === entry.itemId);
        const submission = entry.submissionId ? db.submissions.find((item) => item.id === entry.submissionId) : null;
        return { id: entry.id, name: catalogItem?.name || 'Poder da Loja 51', icon: catalogItem?.icon || '🎟️', usedAt: entry.usedAt, detail: entry.targetId ? 'Escolha: ' + (db.users.find((person) => person.id === entry.targetId)?.displayName || 'participante') : entry.theme ? 'Tema: ' + entry.theme : entry.revealCount ? entry.revealCount + ' autorias reveladas' : submission ? 'Wallpaper: ' + submission.title : entry.itemId === 'power-shield-gay' ? 'Proteção da rodada' : '' };
      }),
      available: db.economy.purchases.filter((entry) => {
        const catalogItem = SHOP_CATALOG.find((item) => item.id === entry.itemId);
        return entry.userId === user.id && !entry.mysteryDecisionPending && catalogItem?.type === 'power' && !db.economy.powerUses.some((use) => use.purchaseId === entry.id);
      }).map((entry) => {
        const catalogItem = SHOP_CATALOG.find((item) => item.id === entry.itemId);
        return { purchaseId: entry.id, itemId: entry.itemId, name: catalogItem?.name || 'Poder da Loja 51', icon: catalogItem?.icon || '🎟️', detail: entry.sealed ? 'Versão sem Antídoto, já paga: 5.000 Créditos 51.' : catalogItem?.description || 'Pronto para usar.', sealed: Boolean(entry.sealed) };
      }),
    },
    shop: SHOP_CATALOG.filter((item) => (!item.adminOnly || user.role === 'admin') && (!item.passExclusive || ownedIds.has(item.id)) && (isShopItemAvailable(item, localHalloweenPreview) || (!item.cardPack && ownedIds.has(item.id)))).map((item) => {
      const displayItem = cosmeticCatalogItemForUser(item, user, localHalloweenPreview);
      const granted = Boolean(item.adminOnly && user.role === 'admin');
      const quantity = item.cardPack ? db.economy.purchases.filter(p=>p.userId===user.id && p.itemId===item.id && !p.cardPackOpenedAt).length : item.mysteryBox ? db.economy.mysteryBoxes.filter((entry) => entry.userId === user.id && entry.boxId === item.id).length : item.consumable ? availablePowerPurchases(user.id, item.id).length : (ownedIds.has(item.id) || granted ? 1 : 0);
      return { ...displayItem, ...(item.id === 'box-master-imperial' ? { description: item.description + (physicalKitClaim() ? ' Kit físico de caderno e caneta: esgotado (única unidade já sorteada).' : ' Extra raríssimo: 0,1% por abertura de ganhar o único kit físico de caderno e caneta, em vez do prêmio digital. Entrega combinada com o administrador; sem revenda por créditos.'), physicalKitChance: physicalKitClaim() ? 0 : .1 } : {}), quantity, availablePoints: item.service ? score.bestWins : 0, owned: item.mysteryBox ? quantity > 0 : item.service ? false : item.consumable ? quantity > 0 : granted || ownedIds.has(item.id), granted, equipped: !item.consumable && !item.mysteryBox && !item.service && displayedEquipped[item.type] === item.id };
    }),
    giftOptions: {
      people: db.users.filter((item) => item.active && item.approved !== false && item.id !== user.id).map((item) => ({ id: item.id, displayName: item.displayName })),
      items: SHOP_CATALOG.filter((item) => isShopItemAvailable(item, localHalloweenPreview) && Number(item.price) > 0 && !item.adminOnly && !item.passExclusive && !item.mysteryBox && !item.service).map(({ id, name, price, type, consumable }) => ({ id, name, price, type, consumable: Boolean(consumable) })),
      creditGiftUnlimited: true,
    },
  };
}

function cobblemonDisplayLabel(value) {
  return String(value || '').replaceAll('Cápsula Pokémon', 'Baú Pokémon').replaceAll('Caixa das Pedras', 'Baú das Pedras');
}

function creditLedgerFor(userId) {
  const purchases = db.economy.purchases.filter((item) => (item.ledgerUserId || item.userId) === userId).map((item) => {
    const catalog = SHOP_CATALOG.find((candidate) => candidate.id === item.itemId);
    const freeLabel = item.source === 'season-pass' ? 'Recompensa do Passe: ' : item.freePurchase ? 'Compra grátis: ' : item.sourceMysteryBoxId ? 'Prêmio recebido: ' : 'Compra: ';
    return { id: 'purchase:' + item.id, icon: item.source === 'season-pass' || item.freePurchase || item.sourceMysteryBoxId ? '🎁' : '🛍️', label: freeLabel + (catalog?.name || 'Item da Loja 51'), amount: -Number(item.price || 0), createdAt: item.createdAt };
  });
  const adjustments = db.economy.creditAdjustments.filter((item) => item.userId === userId).map((item) => ({ id: 'adjustment:' + item.id, icon: Number(item.after) >= Number(item.before) ? '🪙' : '↘️', label: cobblemonDisplayLabel(item.reason || 'Ajuste de saldo'), amount: roundMoney(Number(item.after) - Number(item.before)), createdAt: item.createdAt }));
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

function updateMentions(target) {
  const people = db.users.filter((person) => person.active && person.approved !== false && person.id !== target.userId)
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const seen = new Set(); const mentions = [];
  const previous = Array.isArray(target.mentions) ? target.mentions : [];
  const text = String(target.message ?? target.phrase ?? target.caption ?? '').normalize('NFC').toLocaleLowerCase('pt-BR');
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '@' || (index > 0 && /[\p{L}\p{N}_]/u.test(text[index - 1]))) continue;
    const match = people.map((candidate) => ({
      person: candidate,
      alias: [candidate.displayName, candidate.username].filter(Boolean).sort((a, b) => b.length - a.length).find((value) => {
        const alias = value.normalize('NFC').toLocaleLowerCase('pt-BR');
        return text.startsWith(alias, index + 1) && !/[\p{L}\p{N}_]/u.test(text[index + alias.length + 1] || '');
      }),
    })).find((entry) => entry.alias);
    if (!match) continue;
    const person = match.person;
    index += match.alias.normalize('NFC').length;
    if (seen.has(person.id) || mentions.length >= 5) continue;
    seen.add(person.id);
    mentions.push({ ...(previous.find((item) => item.userId === person.id) || { userId: person.id, createdAt: new Date().toISOString() }), displayName: person.displayName });
  }
  target.mentions = mentions;
}

function updateCommentMentions(comment) {
  updateMentions(comment);
}

function updatePostMentions(post) {
  updateMentions(post);
}

function notificationsFor(user, creditLedger = creditLedgerFor(user.id)) {
  const roundId = db.settings.currentRoundId; const items = [];
  const basketTask = dailyDutyBasketTaskFor(user);
  if (basketTask) {
    const missing = [basketTask.missingPost && 'uma postagem no Feed', basketTask.missingWater && 'um registro de água'].filter(Boolean).join(' e ');
    items.push({ id: 'daily-duty-basket:' + basketTask.dayKey + ':' + user.id, icon: '🧺', title: 'Seu dia de aviso começou', detail: 'Ontem faltou ' + missing + '. Encontre os 10 itens da sua cesta durante o dia; cada item reduz em 2h24 a punição de amanhã. A cesta é individual.', page: 'atualizacoes', targetId: 'dailyDutyBasketCard', createdAt: new Date(Date.parse(basketTask.dayKey + 'T00:00:00-03:00')).toISOString() });
  }
  const dailyPenalty = dailyDutyPenaltyFor(user);
  if (dailyPenalty) {
    items.push({ id: 'daily-duty:' + dailyPenalty.dayKey + ':' + user.id, icon: '⚠️', title: 'Punição diária ativa', detail: 'Sua cesta do dia ' + dailyPenalty.taskDay + ' terminou com ' + dailyPenalty.collectedCount + '/10 itens. O Site Desconfigurado e o bloqueio de Jogos terminam na contagem regressiva. Esta punição não aceita Antídoto.', page: 'memes', createdAt: new Date(Date.parse(dailyPenalty.dayKey + 'T00:00:00-03:00')).toISOString() });
  }
  for (const play of (db.economy.casinoPlays || []).filter((entry) => entry.resultType === 'casinoJackpot' && entry.notifyJackpot).slice(-5)) {
    const winner = db.users.find((person) => person.id === play.userId);
    items.push({ id: 'casino-jackpot:' + play.id, icon: '🏆', title: 'Jackpot da Tripulação saiu!', detail: (winner?.displayName || 'Um participante') + ' ganhou ' + roundMoney(play.jackpotWon).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' créditos no jackpot.', page: 'jogos', targetId: 'casinoRoulettePanel', createdAt: play.createdAt });
  }
  for (const grant of (db.economy.casinoBulkBonusGrants || []).filter((entry) => entry.notifyRecipients && (entry.recipients || []).some((recipient) => recipient.userId === user.id)).slice(-5)) {
    items.push({ id: 'casino-bulk-bonus:' + grant.id, icon: '🎰', title: 'Você recebeu bônus no Cassino!', detail: roundMoney(grant.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' créditos promocionais para jogar. O bônus expira na virada do dia.', page: 'jogos', targetId: 'casinoRoulettePanel', createdAt: grant.createdAt });
  }
  // As marcações existem somente nas pautas e comentários criados após esta
  // melhoria, evitando transformar todo o histórico em aviso novo.
  for (const vote of (db.communityVotes || []).filter((item) => item.status === 'open' && item.notifyAll).slice(-4)) {
    items.push({
      id: 'community-vote-open:' + vote.id,
      icon: '🗳️',
      title: 'Nova pauta aberta para votação',
      detail: (vote.authorName || 'Um participante') + ' propôs: ' + vote.subject,
      page: 'votacoes', targetId: 'communityVotes', createdAt: vote.createdAt,
    });
  }
  for (const vote of (db.communityVotes || []).filter((item) => item.status === 'open' && item.notifyAll)) {
    for (const comment of (vote.comments || []).filter((entry) => entry.notifyAll && entry.userId !== user.id).slice(-4)) {
      items.push({
        id: 'community-vote-comment:' + comment.id,
        icon: '💬',
        title: 'Novo comentário em uma pauta',
        detail: (comment.userName || 'Um participante') + ': ' + comment.message,
        page: 'votacoes', targetId: 'communityVotes', createdAt: comment.createdAt,
      });
    }
  }
  for (const dispute of (db.lieDisputes || []).filter((item) => item.status === 'open' && item.participantIds.includes(user.id)).slice(-4)) {
    const lie = db.lieAccusations.find((item) => item.id === dispute.lieId);
    const pending = dispute.participantIds.filter((id) => !dispute.decisions?.[id]).length;
    items.push({ id: 'lie-dispute:' + dispute.id, icon: '⚖️', title: 'Discussão sobre uma mentira', detail: lie?.reason || (pending + ' decisão(ões) aguardando'), page: 'mentirometro', targetId: 'lie-dispute-' + dispute.id, createdAt: dispute.updatedAt || dispute.createdAt });
  }
  // Uma nova acusação depende do voto coletivo. O mesmo aviso é mostrado para
  // toda a tripulação elegível, inclusive para quem abriu a votação, que também
  // participa da decisão e pode acompanhar as respostas pelo atalho.
  for (const accusation of db.lieAccusations.filter((item) => item.status === 'pending' && Number(item.delta) > 0).slice(-4)) {
    const target = db.users.find((person) => person.id === accusation.targetUserId);
    const creator = db.users.find((person) => person.id === accusation.createdByUserId);
    items.push({
      id: 'lie-vote:' + accusation.id,
      icon: '🤥',
      title: 'Nova mentira aguardando voto',
      detail: (creator?.displayName || 'Alguém') + ' marcou ' + (target?.displayName || 'um participante') + ': “' + (accusation.reason || 'Sem motivo registrado') + '”',
      page: 'mentirometro',
      targetId: 'lie-pending-' + accusation.id,
      createdAt: accusation.createdAt
    });
  }
  for (const trade of (db.economy.trades || []).filter(t => (t.toId===user.id || t.fromId===user.id) && (t.status!=='pending' || Date.parse(t.expiresAt)>Date.now())).slice(-4)) {
    items.push({id:'trade:'+trade.id,icon:'🔄',title:trade.status==='pending'?'Proposta de troca de visuais':'Proposta de troca atualizada',detail:trade.offeredName+' ↔ '+trade.wantedName,page:'perfil',targetId:'visual-trade-'+trade.id,createdAt:trade.updatedAt});
  }
  for (const announcement of (db.economy.powerAnnouncements || []).filter((item) => item.secretTargetedCurse || item.activatedByUserId !== user.id).slice(-8)) {
    const scope = announcement.roundId ? 'na rodada' : 'agora';
    const curseTarget = announcement.secretTargetedCurse ? String(announcement.targetName || 'um participante') : null;
    const curseDuration = announcement.expiresAt ? ' Termina em ' + curseExpiryLabelForNotification(announcement.expiresAt) + '.' : ' Duração de 24 horas.';
    const revealed = (db.economy.curseAuthorReveals || []).some((entry) => entry.curseId === announcement.curseId);
    items.push({ id: 'power-activation:' + announcement.id, icon: announcement.secretTargetedCurse ? '⚠️' : '⚡', title: announcement.secretTargetedCurse ? 'Maldição ativada na tripulação' : announcement.itemName + ' ativado ' + scope, detail: announcement.secretTargetedCurse ? curseTarget + ' foi prejudicado por ' + announcement.itemName + '.' + curseDuration + (revealed ? ' A autoria foi revelada; confira na Loja 51.' : ' A autoria permanece sigilosa.') : 'Um poder da Loja 51 foi ativado. Confira os poderes e a rodada.', page: 'perfil', targetId: 'activePowersCard', createdAt: announcement.createdAt });
  }
  for (const reveal of (db.economy.curseAuthorReveals || []).slice(-8)) {
    const curse = (db.economy.curseHistory || []).find((entry) => entry.id === reveal.curseId);
    if (!curse) continue;
    items.push({ id: 'curse-author-reveal:' + curse.id, icon: '🕵️', title: 'Autoria de maldição revelada', detail: curse.senderName + ' enviou a maldição para ' + curse.targetName + '. Confira na Loja 51.', page: 'loja', targetId: 'curseRevealBoard', createdAt: reveal.revealedAt });
  }
  const lotteryReminder = lotteryReminderForUser(user);
  if (lotteryReminder) items.push({ id: 'lottery-reminder:' + lotteryReminder.roundId + ':' + user.id, icon: '⏰', title: 'Faltam 10 minutos para a Mega 51', detail: 'Você ainda não comprou um bilhete. Escolha seus números antes das ' + lotteryTimeLabelForNotification(lotteryReminder.closeAt) + '.', page: 'loteria', targetId: 'loteria', createdAt: new Date(Date.parse(lotteryReminder.closeAt) - 10 * 60 * 1000).toISOString() });
  for (const round of (db.economy.lottery?.rounds || []).filter((item) => item.status === 'drawn').slice(-6)) {
    const entries = (db.economy.lottery?.entries || []).filter((item) => item.roundId === round.id && item.userId === user.id);
    if (!entries.length) continue;
    const payouts = (round.payouts || []).filter((item) => item.userId === user.id);
    const payout = payouts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const numbers = (round.winningNumbers || []).join(', ');
    items.push({
      id: 'lottery-result:' + round.id + ':' + user.id,
      icon: payout ? '🏆' : '🎟️',
      title: payout ? 'Você ganhou na Mega 51!' : 'Resultado da Mega 51',
      detail: payout ? `Sorteados: ${numbers} · prêmio de ${roundMoney(payout)} Créditos 51.` : `Sorteados: ${numbers} · seus ${entries.length} bilhete(s) foram conferidos.`,
      page: 'loteria', targetId: 'loteria', createdAt: round.drawnAt,
    });
  }
  for (const drop of (db.economy.cardAlbums?.[user.id]?.drops || []).slice(-2)) {
    const collection = CARD_COLLECTIONS.find((item) => drop.id?.startsWith(item.id + ':'));
    const copies = Number(db.economy.cardAlbums?.[user.id]?.cards?.[drop.id] || 0);
    items.push({
      id: 'card-drop:' + drop.eventId,
      // O ícone da carta pode ser 🪙 (Ficha 51), mas na central isso parece
      // saldo. Use o verso de carta para deixar claro que é uma recompensa.
      icon: '🎴',
      title: 'Você encontrou uma carta!',
      detail: drop.name + (copies ? ' · ' + copies + (copies === 1 ? ' cópia no Álbum.' : ' cópias no Álbum.') : ''),
      page: 'album',
      targetId: collection ? 'album-collection-' + collection.id : 'cardAlbumCollections',
      createdAt: drop.createdAt
    });
  }
  // Destaques de captura pertencem à tripulação inteira: a pessoa que fez a
  // captura também recebe o aviso, para poder abrir sua Pokédex pelo sino.
  for (const capture of (db.economy.cobblemonCaptureHighlights || []).slice(-8)) {
    const tier = Math.max(1, Math.min(4, Number(capture.tier || 1)));
    const label = capture.isShiny ? 'Shiny' : tier === 4 ? 'Lendário' : 'Raro';
    items.push({
      id: 'cobblemon-capture:' + capture.id,
      icon: capture.isShiny ? '✨' : tier === 4 ? '👑' : '⭐',
      title: (capture.userName || 'Um participante') + ' capturou ' + (capture.pokemonName || 'um Pokémon') + '!',
      detail: label + (capture.pokemonType ? ' · ' + capture.pokemonType : '') + (capture.duplicate ? ' · captura repetida' : ''),
      page: 'cobblemon',
      targetId: 'cobblemonDexCard',
      pokemonId: Number(capture.pokemonId),
      isShiny: Boolean(capture.isShiny),
      captureUserId: capture.userId,
      createdAt: capture.createdAt,
    });
  }
  db.economy.purchases.filter((item) => item.userId === user.id && item.cardPackOpenedAt).slice(-2).forEach((item) => items.push({id:'card-pack:'+item.id,icon:'🎴',title:'Cartas recebidas no pacotinho',detail:(item.cardPackRewards || []).map((card) => card.name).join(' · ') || 'Abra o Álbum para conferir.',page:'album',targetId:'cardAlbumCollections',createdAt:item.cardPackOpenedAt}));
  for(const trade of (db.economy.cardTrades || []).filter(t=>t.toId===user.id || t.fromId===user.id).slice(-2))items.push({id:'card-trade:'+trade.id,icon:'🎴',title:trade.status==='pending'?'Proposta de troca de cartas':'Troca de cartas atualizada',detail:'Confira no Álbum de cartas.',page:'album',targetId:'card-trade-'+trade.id,createdAt:trade.updatedAt});
  const rejectedCardOffers=(db.economy.cardTradePosts || []).flatMap(post=>(post.offers || []).filter(offer=>offer.fromId===user.id&&offer.status==='rejected').map(offer=>({post,offer}))).sort((a,b)=>(b.offer.updatedAt || '').localeCompare(a.offer.updatedAt || '')).slice(0,4);
  for(const {post,offer} of rejectedCardOffers){const card=CARD_COLLECTIONS.flatMap(collection=>collection.cards.map(([id,name])=>[collection.id+':'+id,name])).find(([id])=>id===offer.cardId);items.push({id:'card-market-rejected:'+offer.id,icon:'↩️',title:'Sua oferta foi recusada',detail:offer.creditAmount?offer.creditAmount+' créditos foram liberados para novas ofertas.':(card?.[1] || 'Sua carta')+' foi liberada para outra troca.',page:'album',targetId:'card-market-post-'+post.id,createdAt:offer.updatedAt});}
  const incomingCardMarketOffers=(db.economy.cardTradePosts || []).filter(post=>post.fromId===user.id&&post.status==='open').flatMap(post=>(post.offers || []).filter(offer=>offer.status!=='rejected').map(offer=>({post,offer}))).sort((a,b)=>String(b.offer.createdAt || '').localeCompare(String(a.offer.createdAt || ''))).slice(0,4);
  for(const {post,offer} of incomingCardMarketOffers)items.push({id:'card-market-offer:'+offer.id,icon:offer.creditAmount?'🪙':'🃏',title:'Nova oferta pela sua carta',detail:offer.creditAmount?offer.creditAmount+' créditos oferecidos.':'Uma carta foi oferecida para troca.',page:'album',targetId:'card-market-post-'+post.id,createdAt:offer.createdAt});
  const masterGift = db.settings.masterGift136;
  if (masterGift?.userIds?.includes(user.id)) items.push({id:'feature-master-136',icon:'💠',title:'Você ganhou um Baú Master Aurora!',detail:'Brinde das novidades: abra ou venda pelo perfil.',page:'perfil',targetId:'mysteryInventoryCard',createdAt:masterGift.grantedAt});
  for (const post of [...db.dailyMemes, ...db.dailyPhrases]) {
    const postMention = post.mentions?.find((item) => item.userId === user.id);
    if (postMention) {
      const anonymous = Boolean(post.anonymous);
      items.push({
        id: 'mention-post:' + post.id,
        icon: '📣',
        title: anonymous ? 'Alguém marcou você em uma publicação anônima' : post.authorName + ' marcou você em uma publicação',
        detail: (post.phrase || post.caption || '').slice(0, 240),
        page: 'memes',
        targetId: 'feed-post-' + post.id,
        createdAt: postMention.createdAt,
      });
    }
    for (const comment of post.comments || []) {
      const mention = comment.mentions?.find((item) => item.userId === user.id);
      if (mention) items.push({ id: 'mention:' + comment.id, icon: '💬', title: comment.authorName + ' marcou você', detail: comment.message, page: 'memes', targetId: 'feed-comment-' + comment.id, createdAt: mention.createdAt });
    }
  }
  for (const comment of (db.profileComments || []).filter((item) => item.targetUserId === user.id && item.authorId !== user.id).slice(-4)) items.push({id:'profile-comment:'+comment.id,icon:'💭',title:'Novo comentário no seu perfil',detail:comment.authorName+': '+comment.message,page:'memes',profileId:user.id,targetId:'profile-comment-'+comment.id,createdAt:comment.createdAt});
  // Aprovações são uma pendência administrativa: cada conta aguardando ganha um
  // atalho próprio, para o sino abrir exatamente a linha daquela pessoa.
  if (user.role === 'admin') {
    db.users.filter((person) => person.approved === false).slice(-5).forEach((person) => items.push({
      id: 'approval:' + person.id,
      icon: '🛂',
      title: 'Nova conta aguardando aprovação',
      detail: person.displayName + ' (@' + person.username + ') quer entrar na Área 51.',
      page: 'admin',
      targetId: 'admin-user-' + person.id,
      createdAt: person.createdAt,
    }));
  }
  const pendingGayShield = db.economy.pendingGayDraw && db.economy.pendingGayDraw.roundId === roundId && db.economy.pendingGayDraw.currentCandidateId === user.id ? db.economy.pendingGayDraw : null;
  if (pendingGayShield) items.push({
    id: 'gay-shield-offer:' + pendingGayShield.id,
    icon: '🛡️',
    title: 'Você foi sorteado como Gay da Rodada',
    detail: 'Você possui um Escudo da Rodada. Escolha agora entre usar o escudo e reabrir o sorteio ou manter o resultado.',
    page: 'sorteio',
    targetId: 'sorteio',
    createdAt: pendingGayShield.createdAt,
  });
  const forcedCursor = [...db.economy.forcedCursors].reverse().find((item) => item.targetUserId === user.id && isForcedCursorActive(item, roundId));
  if (forcedCursor) {
    const endsAt = forcedCursor.expiresAt || new Date(Date.parse(forcedCursor.createdAt) + 86400000).toISOString();
    const effects = { hater: ['Maldição do Hater ativa: provocações aparecerão na tela.', '🖕'], givaldo: ['Maldição Givaldo ativa: fotos e frases aparecerão na tela sem bloquear o site.', '🎭'], 'giant-slow': ['Mouse Gigante e Lento ativo.', '🐌'], adhd: ['Maldição TDAH ativa: o cursor pode assumir o controle por cerca de 30 segundos.', '⚡'], 'dev-dark': ['Maldição do Dev ativa.', '💡'], cleaning: ['Maldição da Limpeza ativa: uma nova sujeira aparece a cada hora.', '🧹'], gay: ['Seta Gay Compulsória ativa.', '🌈'] };
    const [effect, icon] = effects[forcedCursor.style] || ['Maldição ativa.', '⚠️'];
    items.push({ id: 'forced-cursor:' + forcedCursor.id, icon, title: 'Você foi alvo de uma maldição', detail: effect + ' Termina em ' + curseExpiryLabelForNotification(endsAt) + '. A autoria permanece sigilosa.', page: 'perfil', targetId: 'activePowersCard', createdAt: forcedCursor.createdAt });
  }
  const assignment = db.assignments.find((item) => item.roundId === roundId && item.userId === user.id && item.revealed);
  if (assignment) items.push({ id: 'assignment:' + assignment.id, icon: '🖼️', title: 'Seu wallpaper chegou', detail: assignment.seenAt ? 'Wallpaper visualizado.' : 'Abra o Sorteio para visualizar.', page: 'sorteio', targetId: 'receivedWallpaperCard', createdAt: assignment.revealedAt || assignment.createdAt });
  const voting = openVoting();
  if (voting && voting.requiredVoterIds.includes(user.id) && !voting.votes.some((vote) => vote.userId === user.id)) items.push({ id: 'vote:' + voting.id, icon: '🗳️', title: 'Sua votação está disponível', detail: 'Escolha o melhor e o pior wallpaper.', page: 'sorteio', targetId: 'votingPanel', createdAt: voting.openedAt });
  db.feedbackMessages.filter((item) => item.authorId === user.id && (item.status !== 'pending' || item.adminComment)).slice(-4).forEach((item) => items.push({
    id: 'feedback:' + item.id + ':' + item.updatedAt,
    icon: '💬',
    title: 'Sua solicitação foi atualizada',
    detail: item.status === 'approved' ? 'Aprovada' : item.status === 'done' ? 'Concluída' : item.status === 'rejected' ? 'Não aprovada' : item.status === 'archived' ? 'Arquivada' : 'Novo retorno do administrador',
    page: 'sorteio',
    targetId: 'my-feedback-' + item.id,
    createdAt: item.updatedAt || item.createdAt,
  }));
  const invalidatedLotteryRounds = new Set((db.economy.lottery?.rounds || []).filter((item) => item.status === 'void').map((item) => item.id));
  const invalidatedLotteryPrizeIds = new Set((db.economy.lottery?.rounds || []).flatMap((item) => item.voidedPayoutAdjustmentIds || []));
  const quietGameAdjustments = new Set(db.economy.creditAdjustments.filter((item) => item.userId === user.id && item.mode === 'casino-shop' && ['Resultado da Roleta 51 usando saldo da loja', 'Resultado do Caça-Níquel 51 usando saldo da loja'].includes(item.reason)).map((item) => 'adjustment:' + item.id));
  creditLedger.filter((item) => item.amount > 0 && !quietGameAdjustments.has(item.id) && !item.id.startsWith('gift:') && !invalidatedLotteryPrizeIds.has(item.id) && !(item.lotteryRoundId && invalidatedLotteryRounds.has(item.lotteryRoundId))).slice(0, 5).forEach((item) => items.push({ id: 'credit:' + item.id, icon: item.icon, title: 'Você recebeu ' + roundMoney(item.amount) + ' Créditos 51', detail: item.label, page: 'perfil', targetId: 'creditLedger', createdAt: item.createdAt }));
  db.economy.gifts.filter((item) => item.toUserId === user.id).slice(-5).forEach((item) => items.push({ id: 'gift:' + item.id, icon: '🎁', title: 'Você recebeu um presente secreto', targetId: item.type === 'credits' ? 'creditLedger' : 'collectionCatalog', detail: item.type === 'credits' ? roundMoney(item.amount) + ' Créditos 51' : (SHOP_CATALOG.find((catalog) => catalog.id === item.itemId)?.name || 'Item da Loja 51'), page: 'perfil', createdAt: item.createdAt }));
  const readAt = db.notificationsReadAt[user.id] || null;
  const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15).map((item) => ({ ...item, unread: !readAt || item.createdAt > readAt }));
  return { unreadCount: sorted.filter((item) => item.unread).length, items: sorted, readAt };
}

function roundRecapFor(voting) {
  if (!voting || voting.status !== 'closed') return null;
  const best = db.submissions.find((item) => item.id === voting.bestWinnerId);
  const worst = db.submissions.find((item) => item.id === voting.worstWinnerId);
  const gay = [...db.draws].reverse().find((item) => item.type === 'gay' && item.roundId === voting.roundId);
  const themeDraw = db.draws.find((item) => item.type === 'theme' && item.roundId === voting.roundId);
  const theme = themeDraw?.winner || themeDraw?.detail || null;
  const participantCount = Number(voting.requiredVoterIds?.length || 0);
  const voteCount = Number(voting.votes?.length || 0);
  const lines = [
    '🛸 RESUMO DA ' + String(voting.roundName || 'RODADA 51').toUpperCase(),
    theme ? '🎨 Tema: ' + theme : null,
    best ? '🏆 Melhor wallpaper: ' + best.uploader + ' — ' + best.title : null,
    worst ? '😂 Wallpaper mais caótico: ' + worst.uploader + ' — ' + worst.title : null,
    gay?.winner ? '🌈 Gay da Rodada: ' + gay.winner : null,
    '🗳️ ' + voteCount + ' de ' + participantCount + ' votos registrados.',
  ].filter(Boolean);
  return {
    roundId: voting.roundId, roundName: voting.roundName || 'Rodada 51', theme,
    best: best ? { name: best.uploader, title: best.title } : null,
    worst: worst ? { name: worst.uploader, title: worst.title } : null,
    gayWinner: gay?.winner || null, participantCount, voteCount, text: lines.join('\n'),
  };
}

function buildStateFor(user, options = {}) {
  const localHalloweenPreview = Boolean(options.localHalloweenPreview);
  const roundId = db.settings.currentRoundId;
  const activeItems = db.submissions.filter((item) => item.active && item.roundId === roundId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const roundUsers = eligibleUsers();
  const activeSubmitterIds = new Set(activeItems.map((item) => item.userId));
  const voting = currentVoting();
  // O cartão da página inicial resume somente a rodada atual. Rodadas antigas
  // continuam no histórico, mas não podem parecer o resultado vigente.
  const recapVoting = voting?.status === 'closed' && voting.roundId === roundId ? voting : null;
  const revealedIds = new Set(voting && voting.status === 'closed' ? voting.submissionIds : []);
  const roundAssignments = db.assignments.filter((item) => item.roundId === roundId);
  const revealedAssignments = roundAssignments.filter((item) => item.revealed);
  const assignedSubmissionIds = new Set(revealedAssignments.map((item) => item.submissionId));
  const authorRevealedForUser = db.economy.authorReveals.some((reveal) => reveal.roundId === roundId && reveal.userId === user.id);
  const readyCount = roundUsers.filter((item) => activeSubmitterIds.has(item.id)).length;
  const uploadsReady = roundUsers.length > 0 && readyCount === roundUsers.length && activeItems.length === roundUsers.length;
  const missingParticipants = roundUsers.filter((item) => !activeSubmitterIds.has(item.id));
  const gayDraw = roundId ? db.draws.find((item) => item.type === 'gay' && item.roundId === roundId) : null;
  const latestGayDraw = [...db.draws].reverse().find((item) => item.type === 'gay') || null;
  const latestClosedVoting = [...db.votings].reverse().find((item) => item.status === 'closed' && item.worstWinnerId) || null;
  const latestWorstSubmission = latestClosedVoting ? db.submissions.find((item) => item.id === latestClosedVoting.worstWinnerId) : null;
  const penaltyClearedAt = Number(new Date(db.settings.visualThemeClearedAt || 0));
  const visualPenalty = (sourceAt, kind) => {
    const startedAt = Number(new Date(sourceAt || 0));
    const endsAt = startedAt + 7 * 24 * 60 * 60 * 1000;
    return startedAt > penaltyClearedAt && endsAt > Date.now() ? { kind, endsAt: new Date(endsAt).toISOString() } : null;
  };
  const gayPenalty = latestGayDraw?.winnerId === user.id ? visualPenalty(latestGayDraw.createdAt, 'rainbow') : null;
  const punishmentPenalty = latestWorstSubmission?.userId === user.id ? visualPenalty(latestClosedVoting?.closedAt || latestClosedVoting?.openedAt, 'punishment') : null;
  const deadlinePenalty = activeWallpaperDeadlinePenalty(user.id);
  const deadlineVisualPenalty = deadlinePenalty ? { kind: 'deadline-shame', endsAt: null } : null;
  const activeVisualPenalty = deadlineVisualPenalty || gayPenalty || punishmentPenalty;
  const votedIds = new Set(voting ? (voting.votes || []).map((item) => item.userId) : []);
  let phase = 'theme';
  if (roundId) {
    // A rodada só avança para envios depois que existe um tema válido.
    // Isso também permite reiniciar o sorteio antes de qualquer envio.
    if (!db.settings.currentTheme) phase = 'theme';
    else if (!uploadsReady) phase = 'uploads';
    else if (revealedAssignments.length < roundUsers.length) phase = 'assignments';
    else if (!gayDraw) phase = 'gay';
    else if (voting && voting.status === 'open') phase = 'voting';
    else phase = 'results';
  }
  // Os três nomes sorteados para a final de tema são etapas internas, não
  // resultados de rodada. O mural público mostra apenas o tema decidido.
  const draws = db.draws
    .filter((draw) => draw.type !== 'theme' || (draw.themeStage !== 'finalist' && db.settings.themes.includes(draw.winner)))
    .slice(-30).reverse().map((draw) => {
    const { winnerUserId, watermarkedFilename, ...safeDraw } = draw;
    if (draw.type === 'gay') {
      const canManageWatermark = user.role === 'admin' || winnerUserId === user.id;
      return { ...safeDraw, watermarkedUrl: watermarkedFilename && canManageWatermark ? '/api/draw/gay-watermark/' + encodeURIComponent(draw.id) : null, watermarkedExtension: watermarkedFilename?.endsWith('.jpg') ? 'jpg' : 'png', canGenerateWatermark: !watermarkedFilename && canManageWatermark };
    }
    if (draw.type !== 'wallpaper') return safeDraw;
    const item = db.submissions.find((submission) => submission.id === draw.submissionId);
    const relatedVoting = [...db.votings].reverse().find((vote) => vote.roundId === draw.roundId);
    const revealed = relatedVoting && relatedVoting.status === 'closed';
    return {
      ...safeDraw,
      // Antes do encerramento, a imagem só é visível para quem a recebeu.
      // Depois da votação, o histórico público deve mostrar o wallpaper
      // correspondente a cada distribuição.
      imageUrl: (draw.winnerUserId === user.id || revealed) ? safeDraw.imageUrl : null,
      detail: item ? draw.wallpaperTitle + (revealed ? ' · por ' + item.uploader : ' · autoria secreta') : safeDraw.detail,
    };
  });
  const liveTitleMap = liveTitleAssignments();
  const previousSeason = seasonSummaryWithLockedChampions(previousMonthKey());
  const creditLedger = creditLedgerFor(user.id);
  const cardAlbum = albumFor(db, user.id, saoPauloDayKey(), seasonalAlbumOptions(localHalloweenPreview));
  const rankingUsers = db.users.filter((item) => item.active).map((item) => ({
    id: item.id, displayName: item.displayName, liveTitles: liveTitleMap.get(item.id) || [], ...scoreFor(item.id),
  }));
  const bestRanking = [...rankingUsers].sort((a, b) => b.bestWins - a.bestWins || a.displayName.localeCompare(b.displayName));
  const worstRanking = [...rankingUsers].sort((a, b) => b.worstWins - a.worstWins || a.displayName.localeCompare(b.displayName));
  const gayRanking = [...rankingUsers].sort((a, b) => b.gayWins - a.gayWins || a.displayName.localeCompare(b.displayName));
  // Forbes 51 é somente de leitura: ordena pelo valor atual investido
  // e nunca publica o saldo em caixa.
  const financeRanking = db.users.filter((item) => item.active).map((item) => {
    const invested = roundMoney(marketHoldingsValueForUser(db.economy, item.id));
    return {
      id: item.id,
      displayName: item.displayName,
      liveTitles: liveTitleMap.get(item.id) || [],
      invested,
    };
  }).sort((a, b) => b.invested - a.invested || a.displayName.localeCompare(b.displayName));
  // Transparência do Agiota: este placar expõe apenas a dívida contratada e
  // ainda pendente. Saldo da Loja, pagamentos anteriores e empréstimos já
  // quitados continuam privados.
  const loanRanking = db.economy.loans.filter((loan) => loan.status === 'active' && Number(loan.remainingDue) > 0).map((loan) => {
    const borrower = db.users.find((item) => item.id === loan.userId);
    if (!borrower?.active) return null;
    const dueAt = loan.dueAt ? Date.parse(loan.dueAt) : NaN;
    const overdueMs = Number.isFinite(dueAt) ? Math.max(0, Date.now() - dueAt) : 0;
    return {
      id: borrower.id,
      displayName: borrower.displayName,
      liveTitles: liveTitleMap.get(borrower.id) || [],
      remainingDue: roundMoney(Number(loan.remainingDue)),
      totalDue: roundMoney(Number(loan.totalDue)),
      principal: roundMoney(Number(loan.principal)),
      createdAt: loan.createdAt || null,
      dueAt: loan.dueAt || null,
      overdue: overdueMs > 0,
      overdueHours: Math.floor(overdueMs / 3600000),
    };
  }).filter(Boolean).sort((a, b) => b.remainingDue - a.remainingDue || Number(b.overdue) - Number(a.overdue) || a.displayName.localeCompare(b.displayName));
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
    serverTime: Date.now(), musicEpoch: MUSIC_EPOCH, musicLoopMs: MUSIC_LOOP_MS,
    realtimeTransport: runtimeEnv ? 'adaptive-poll' : 'sse',
    me: { ...safeUser(user), cosmetics: cosmeticsFor(user.id) }, settings: { ...db.settings, featureFlags: featureFlags(), announcement: undefined },
    dailyDutyPenalty: dailyDutyPenaltyFor(user),
    dailyDutyBasketTask: dailyDutyBasketTaskFor(user),
    // A foto do próprio usuário já está em `me`; não a duplique no payload.
    avatars: Object.fromEntries(db.users.filter((item) => item.active && item.id !== user.id).map((item) => [item.id, item.avatarDataUrl || null])),
    identities: Object.fromEntries(db.users.filter((item) => item.active).map((item) => [item.id, publicIdentityFor(item.id, localHalloweenPreview)])),
    announcement: db.settings.announcement ? (() => {
      const item = db.settings.announcement;
      // Avisos criados em versões anteriores usavam nomes distintos. A leitura
      // precisa ser compatível para que uma notificação antiga nunca impeça o
      // carregamento da sessão inteira.
      const seenUserIds = Array.isArray(item.seenUserIds) ? item.seenUserIds : (Array.isArray(item.seenBy) ? item.seenBy : []);
      // Aviso coletivo é uma mídia própria (DB/settings.announcement + arquivo
      // announcement-*). Ele reutiliza somente o transporte autenticado já
      // existente para imagens, nunca a permissão ou os dados dos wallpapers.
      return { id: item.id || `release-${item.version || 'current'}`, title: item.title || '', message: item.message || '', imageUrl: item.imageFilename ? '/uploads/' + encodeURIComponent(item.imageFilename) : null, createdAt: item.createdAt || item.publishedAt || null, unread: !seenUserIds.includes(user.id), seenCount: user.role === 'admin' ? seenUserIds.length : undefined };
    })() : null,
    liveDraw: liveDraw && liveDraw.endsAt > Date.now() ? drawForUser(liveDraw, user.id) : null,
    profile: profileFor(user, { liveTitleMap, previousSeason, creditLedger, cardAlbum, localHalloweenPreview }), notifications: notificationsFor(user, creditLedger), roundRecap: roundRecapFor(recapVoting),
    onlinePeople: sharedOnlinePeople.length ? sharedOnlinePeople : [{ id: user.id, displayName: user.displayName }],
    casino: (() => {
      const dayKey = saoPauloDayKey(); const account = casinoAccountFor(user.id);
      // O Apostômetro mede apenas o valor que saiu do saldo principal da Loja 51.
      // Apostas promocionais continuam no histórico, mas não inflacionam o valor real.
      const liveTotalPlays = db.economy.casinoPlays.length;
      const archiveSummary = db.economy.casinoArchiveSummary || { totalPlays: 0, shopWagered: 0 };
      let playsToday = 0; let totalWagered = Number(archiveSummary.shopWagered || 0);
      const recentRoulette = []; const recentPlinko = []; const recentSlots = [];
      // Uma única passagem preserva totais e os históricos independentes dos jogos.
      for (let index = liveTotalPlays - 1; index >= 0; index -= 1) {
        const play = db.economy.casinoPlays[index];
        if (play.walletSource === 'shop') totalWagered += Number(play.bet || 0);
        if (play.userId !== user.id) continue;
        if (play.dayKey === dayKey) playsToday += 1;
        if (play.resultType === 'plinko') { if (recentPlinko.length < 6) recentPlinko.push(play); }
        else if (play.resultType === 'slots') { if (recentSlots.length < 6) recentSlots.push(play); }
        else if (play.resultType !== 'flight' && recentRoulette.length < 6) recentRoulette.push(play);
      }
      playsToday += Number(archiveSummary.playsByDayUser?.[dayKey + ':' + user.id] || 0);
      const totalPlays = Number(archiveSummary.totalPlays || 0) + liveTotalPlays;
      const cashoutThreshold = casinoCashoutThresholdForAccount(account);
      const jackpot = db.economy.casinoJackpot || { amount: CASINO_JACKPOT.seed };
      return { wallet: Number(account.balance), shopWallet: walletFor(user.id), dailyBonus: casinoInitialBonusForDay(dayKey), monthStartBonus: dayKey === CASINO_MONTH_START_BONUS_DAY ? CASINO_MONTH_START_BONUS : 0, cashoutThreshold, cashoutAmount: Number(account.balance), canCashOut: !account.cashedOut && Number(account.balance) >= cashoutThreshold, cashedOut: Boolean(account.cashedOut), playsToday, totalWagered: roundMoney(totalWagered), totalPlays, closedBoxes: db.economy.mysteryBoxes.filter((entry) => entry.userId === user.id).length, recentRoulette, recentPlinko, recentSlots, jackpot: { amount: roundMoney(Math.max(CASINO_JACKPOT.seed, Number(jackpot.amount || CASINO_JACKPOT.seed))), chance: CASINO_JACKPOT.chance, minBet: CASINO_JACKPOT.minBet }, plinkoProfiles: PLINKO_PROFILES, slotOutcomes: SLOT_OUTCOMES.map(({ id, chance, multiplier, symbols, label }) => ({ id, chance, multiplier, symbols, label })), slotReturnPercent: SLOT_RETURN_PERCENT, lottery: lotteryForUser(user) };
    })(),
    visualTheme: activeVisualPenalty?.kind || 'user-choice', visualThemeEndsAt: activeVisualPenalty?.endsAt || null,
    themes: db.settings.themes.map((name) => ({ id: name, name })),
    themeWheel: (() => { const finalists = db.settings.themeFinalists || []; return (finalists.length >= 3 ? finalists : db.settings.themes.filter((name) => !finalists.includes(name))).map((name) => ({ id: name, name })); })(),
    themeDraw: { finalists: [...(db.settings.themeFinalists || [])], remaining: Math.max(0, 3 - (db.settings.themeFinalists || []).length) },
    workflow: {
      phase, roundId, currentTheme: db.settings.currentTheme,
      submitted: readyCount, totalParticipants: roundUsers.length,
      assigned: revealedAssignments.length, totalAssignments: roundUsers.length,
      themeDrawnAt: roundId ? (db.draws.find((item) => item.type === 'theme' && item.roundId === roundId) || {}).createdAt || null : null,
      recoveredAt: db.settings.currentRoundRecoveredAt || null,
      wallpaperDeadlineAt: wallpaperDeadlineAt() ? new Date(wallpaperDeadlineAt()).toISOString() : null,
      wallpaperDeadlineSettled: db.settings.wallpaperDeadlineSettledRoundId === roundId,
    },
    roundSummary: {
      phase, active: Boolean(roundId), theme: db.settings.currentTheme,
      uploads: { done: readyCount, total: roundUsers.length }, deliveries: { done: revealedAssignments.length, total: roundUsers.length },
      views: { done: revealedAssignments.filter((item) => item.seenAt).length, total: revealedAssignments.length }, votes: { done: votedIds.size, total: voting ? voting.requiredVoterIds.length : 0 },
      my: { submitted: activeSubmitterIds.has(user.id), delivered: revealedAssignments.some((item) => item.userId === user.id), viewed: Boolean(revealedAssignments.find((item) => item.userId === user.id)?.seenAt), voted: votedIds.has(user.id) }, gayWinner: gayDraw?.winner || null,
    },
    participants: roundUsers.map(({ id, displayName }) => ({ id, displayName })),
    powerParticipants: db.users.filter((person) => person.active && person.approved !== false).map(({ id, displayName, username }) => ({ id, displayName, username })),
    readiness: {
      ready: readyCount, total: roundUsers.length,
      missing: missingParticipants.map(({ id, displayName }) => ({ id, displayName })),
      participants: user.role === 'admin' ? db.users.filter((person) => person.active && person.approved !== false).map((person) => ({ id: person.id, displayName: person.displayName, included: roundUsers.some((entry) => entry.id === person.id), hasSubmission: activeSubmitterIds.has(person.id) })) : undefined,
      acceptsNewParticipants: roundAcceptsNewParticipants(),
      canStartWithReady: phase === 'uploads' && readyCount >= 2 && readyCount < roundUsers.length && roundAssignments.length === 0,
      canManageParticipants: user.role === 'admin' && Boolean(roundId && db.settings.currentTheme && !db.settings.currentParticipantsLocked && !db.assignments.some((item) => item.roundId === roundId) && !db.votings.some((item) => item.roundId === roundId)),
    },
    gayParticipants: phase === 'gay' ? roundUsers.map(({ id, displayName }) => ({ id, displayName })) : [],
    submissions: activeItems.map((item) => ({
      id: item.id, title: item.title,
      imageUrl: roundUsers.some((person) => person.id === user.id) || user.role === 'admin' ? '/uploads/' + item.filename : null,
      size: item.size, createdAt: item.createdAt, isMine: item.userId === user.id,
      canDelete: false,
      assigned: assignedSubmissionIds.has(item.id),
      revealed: revealedIds.has(item.id) || authorRevealedForUser,
      uploader: revealedIds.has(item.id) || authorRevealedForUser ? item.uploader : null,
      assistedUpload: user.role === 'admin' && item.uploadedByAdminId ? { by: item.uploadedByAdminName || 'Administrador', for: item.uploader } : null,
    })),
    assignments: revealedAssignments.map((assignment) => {
      const recipient = db.users.find((item) => item.id === assignment.userId);
      const submission = db.submissions.find((item) => item.id === assignment.submissionId);
      return submission && recipient ? {
        id: assignment.id, assignedTo: recipient.displayName, submissionId: submission.id,
        title: submission.title, imageUrl: assignment.userId === user.id ? '/uploads/' + submission.filename : null,
        uploader: revealedIds.has(submission.id) || authorRevealedForUser ? submission.uploader : null,
        revealed: revealedIds.has(submission.id) || authorRevealedForUser, isMine: assignment.userId === user.id,
        deliveredAt: assignment.revealedAt || assignment.createdAt,
        seenAt: assignment.seenAt || null, seen: Boolean(assignment.seenAt),
        isNew: assignment.userId === user.id && !assignment.seenAt,
      } : null;
    }).filter(Boolean),
    draws, voting: votingForClient(voting, user), rankings: { best: bestRanking, worst: worstRanking, gay: gayRanking }, financeRanking, loanRanking, mystery: mysteryForClient(user), impostor: impostorForClient(user),
    season: { current: seasonSummary(), previous: previousSeason, challenges: seasonalChallengesFor(user.id) },
    seasonalEvent: currentHalloweenEvent(localHalloweenPreview),
    dailyWall: {
      emojis: WALL_EMOJIS,
      history: db.dailyWallHistory.slice(-30).reverse().map((archive) => ({ id: archive.id, closedAt: archive.closedAt, closedByName: archive.closedByName, memeCount: archive.memes?.length || 0, phraseCount: archive.phrases?.length || 0 })),
      phrases: db.dailyPhrases.map((item) => ({
        id: item.id, userId: item.userId, canEdit: item.userId === user.id, phrase: item.phrase, authorName: item.authorName, anonymous: Boolean(item.anonymous), mentions: item.mentions || [], createdAt: item.createdAt, comments: item.comments || [],
        canDelete: item.userId === user.id || user.role === 'admin', reactions: reactionsFor('phrase', item.id, user.id),
      })),
      memes: db.dailyMemes.map((item) => ({
        id: item.id, userId: item.userId, canEdit: item.userId === user.id, canDelete: item.userId === user.id || user.role === 'admin', imageUrl: '/memes/' + item.filename, authorName: item.authorName, anonymous: Boolean(item.anonymous), mentions: item.mentions || [], caption: item.caption || '', comments: item.comments || [],
        createdAt: item.createdAt, isMine: item.userId === user.id, reactions: reactionsFor('meme', item.id, user.id),
      })),
    },
    anonymousWall: db.anonymousPosts.slice(-200).map((item) => ({
      id: item.id, message: item.message, createdAt: item.createdAt,
      canDelete: user.role === 'admin',
    })),
    trading: tradingFor(user),
    cardAlbum,
    lieMeter: {
      requiredVote: user.role === 'admin' ? null : requiredLieVoteForUser(user.id),
      ranking: db.users.filter((person) => person.active).map((person) => ({
        id: person.id,
        displayName: person.displayName,
        liveTitles: liveTitleMap.get(person.id) || [],
        total: Math.max(0, db.lieAccusations.filter((item) => item.targetUserId === person.id && item.status === 'confirmed').reduce((sum, item) => sum + item.delta, 0)),
        // Verdades não alteram o placar de mentiras. Elas são o contador
        // separado de acusações rejeitadas por maioria, inclusive as antigas.
        truths: db.lieAccusations.filter((item) => item.targetUserId === person.id && item.status === 'rejected' && item.voteOutcome === 'truth').length,
        latestReason: activeLieReasons(person.id).at(-1)?.reason || null,
        reasons: activeLieReasons(person.id).slice(-30).reverse().map((item) => ({ id: item.id, reason: item.reason, createdAt: item.confirmedAt || item.createdAt, createdBy: db.users.find((person) => person.id === item.createdByUserId)?.displayName || (item.createdByUserId ? 'Conta removida' : 'Não registrado'), validatedBy: db.users.find((person) => person.id === item.validatedByUserId)?.displayName || (item.validatedByUserId ? 'Conta removida' : 'Não registrado'), approvedBy: lieApprovalPeople(item) })),
      })).sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName)),
      pending: db.lieAccusations.filter((item) => item.status === 'pending').slice(-100).reverse().map((item) => {
        const target = db.users.find((person) => person.id === item.targetUserId);
        const creator = db.users.find((person) => person.id === item.createdByUserId);
        return {
          id: item.id, delta: item.delta, reason: item.reason || null, createdAt: item.createdAt,
          targetName: target?.displayName || 'Usuário removido', creatorName: creator?.displayName || 'Usuário removido',
          totalVoters: (item.requiredVoterIds || []).length,
          receivedVotes: Object.keys(item.votes || {}).length,
          myVote: item.votes?.[user.id] || null,
          voters: (item.requiredVoterIds || []).map((voterId) => ({
            id: voterId,
            name: db.users.find((person) => person.id === voterId)?.displayName || 'Conta removida',
            vote: item.votes?.[voterId] || null,
          })),
          lieVotes: (item.requiredVoterIds || []).filter((voterId) => item.votes?.[voterId] === 'lie').length,
          strongLieVotes: (item.requiredVoterIds || []).filter((voterId) => item.votes?.[voterId] === 'strong-lie').length,
          truthVotes: (item.requiredVoterIds || []).filter((voterId) => item.votes?.[voterId] === 'truth').length,
          notHeardVotes: (item.requiredVoterIds || []).filter((voterId) => item.votes?.[voterId] === 'not-heard').length,
          canVote: (item.requiredVoterIds || []).includes(user.id),
          canCancel: user.id === item.createdByUserId || user.role === 'admin',
        };
      }),
      history: db.lieAccusations.filter((item) => ['confirmed', 'rejected'].includes(item.status) && Object.values(item.votes || {}).some((vote) => ['lie', 'strong-lie', 'truth', 'not-heard'].includes(vote))).slice(-12).reverse().map((item) => {
        const voterIds = [...new Set(item.requiredVoterIds || Object.keys(item.votes || {}))];
        const votes = voterIds.filter((voterId) => ['lie', 'strong-lie', 'truth', 'not-heard'].includes(item.votes?.[voterId])).map((voterId) => ({
          id: voterId,
          name: db.users.find((person) => person.id === voterId)?.displayName || 'Conta removida',
          vote: item.votes[voterId],
        }));
        return {
          id: item.id,
          reason: item.reason || null,
          outcome: item.voteOutcome || (item.status === 'confirmed' ? 'lie' : 'truth'),
          resolvedAt: item.confirmedAt || item.rejectedAt || item.createdAt,
          targetName: db.users.find((person) => person.id === item.targetUserId)?.displayName || 'Usuário removido',
          creatorName: db.users.find((person) => person.id === item.createdByUserId)?.displayName || 'Usuário removido',
          lieVotes: votes.filter((entry) => entry.vote === 'lie').length,
          strongLieVotes: votes.filter((entry) => entry.vote === 'strong-lie').length,
          truthVotes: votes.filter((entry) => entry.vote === 'truth').length,
          notHeardVotes: votes.filter((entry) => entry.vote === 'not-heard').length,
          voters: votes,
        };
      }),
      disputes: (db.lieDisputes || []).filter((item) => item.participantIds.includes(user.id)).slice(-20).reverse().map((item) => {
        const lie = db.lieAccusations.find((entry) => entry.id === item.lieId);
        const person = (id) => db.users.find((entry) => entry.id === id)?.displayName || 'Conta removida';
        const choices = { truth: 'Verdade', lie: 'Mentira', withdraw: 'Desistir' };
        return {
          id: item.id, status: item.status, outcome: item.outcome || null, lieReason: lie?.reason || 'Registro de mentira',
          targetName: person(lie?.targetUserId), reporterName: person(item.reporterId), reportReason: item.reason,
          participants: item.participantIds.map((id) => ({ id, name: person(id), decision: item.decisions?.[id] || null, decisionLabel: choices[item.decisions?.[id]] || null })),
          myDecision: item.decisions?.[user.id] || null,
          messages: (item.messages || []).slice(-80).map((message) => ({ id: message.id, authorId: message.authorId, authorName: message.authorName || person(message.authorId), text: message.text, system: Boolean(message.system), createdAt: message.createdAt })),
          canParticipate: item.status === 'open' && item.participantIds.includes(user.id), createdAt: item.createdAt, updatedAt: item.updatedAt || item.createdAt,
        };
      }),
    },
    communityVotes: communityVotesForClient(user),
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
          canDelete: false,
        };
      }),
      teamMission: teamMissionFor(),
    },
    meHasSubmitted: db.submissions.some((item) => item.roundId === roundId && item.userId === user.id),
    meCanUpload: phase === 'uploads' && roundUsers.some((item) => item.id === user.id) && !db.submissions.some((item) => item.roundId === roundId && item.userId === user.id),
    adminUploadOptions: user.role === 'admin' && phase === 'uploads' ? roundUsers.map((person) => {
      const submission = db.submissions.find((item) => item.roundId === roundId && item.userId === person.id);
      return { id: person.id, displayName: person.displayName, hasSubmission: Boolean(submission), assisted: Boolean(submission?.uploadedByAdminId), submittedAt: submission?.createdAt || null };
    }) : undefined,
    adminUsers: user.role === 'admin' ? db.users.map((person) => {
      const { avatarDataUrl, ...summary } = safeUser(person);
      return { ...summary, wallet: walletFor(person.id) };
    }) : undefined,
    cobblemonServerManagement: canManageCobblemonServer(user) ? db.users.filter((person) => person.active).map((person) => {
      const roster = db.settings.cobblemonServerRoster[person.id] || {};
      const paymentStatus = ['paid', 'unpaid', 'exempt'].includes(roster.paymentStatus) ? roster.paymentStatus : 'unpaid';
      return { id: person.id, displayName: person.displayName, username: person.username, avatarDataUrl: person.avatarDataUrl || null,
        plays: Boolean(roster.plays), playerName: String(roster.playerName || ''), paymentStatus, updatedAt: roster.updatedAt || null };
    }).sort((a, b) => Number(b.plays) - Number(a.plays) || a.displayName.localeCompare(b.displayName, 'pt-BR')) : undefined,
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
    adminHealth: user.role === 'admin' ? {
      databaseBytes,
      totalUsers: db.users.length,
      activeUsers: db.users.filter((item) => item.active && item.approved !== false).length,
      onlineUsers: sharedOnlinePeople.length || 1,
      media: {
        wallpapers: db.submissions.filter((item) => item.active).length,
        feedImages: db.dailyMemes.length,
        feedbackImages: db.feedbackMessages.filter((item) => item.imageFilename).length,
        referencedTotal: db.submissions.filter((item) => item.active).length + db.dailyMemes.length + db.feedbackMessages.filter((item) => item.imageFilename).length,
      },
      releaseVersion: Math.max(0, Number(db.settings.releaseVersion || 0)),
      revision: stateRevision,
      lastBackupAt: db.settings.lastBackupAt || null,
      lastCleanupAt: db.settings.lastCleanupAt || null,
      checkedAt: new Date().toISOString(),
    } : undefined,
  };
}

function stateFor(user, options = {}) {
  const localHalloweenPreview = Boolean(options.localHalloweenPreview);
  const key = stateRevision + ':' + user.id + ':' + saoPauloDayKey() + (localHalloweenPreview ? ':halloween-preview' : '');
  const cached = stateResponseCache.get(key);
  const now = Date.now();
  if (cached && now - cached.createdAt < STATE_RESPONSE_CACHE_MS) return cached.value;
  if (cached) stateResponseCache.delete(key);
  const value = buildStateFor(user, { localHalloweenPreview });
  const body = JSON.stringify(value);
  serializedJsonCache.set(value, { body, bytes: Buffer.byteLength(body) });
  stateResponseCache.set(key, { createdAt: now, value });
  if (stateResponseCache.size > STATE_RESPONSE_CACHE_MAX) {
    const oldestKey = stateResponseCache.keys().next().value;
    if (oldestKey) stateResponseCache.delete(oldestKey);
  }
  return value;
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
  // A new login must not revoke the same account's other devices. Those
  // sessions are still valid until their own expiry, logout or account reset.
  db.rememberTokens = db.rememberTokens.filter((item) => item.expiresAt > Date.now());
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
    const body = await readJson(req, 1600000);
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
    // Presença é apenas um indicador visual. Uma oscilação no D1 não pode
    // impedir uma sessão válida de abrir o portal.
    try { await heartbeatPresence(auth); } catch {}
    // A única gravação possível nesta rota é a virada de temporada: acontece
    // uma vez por pessoa, liquida as cartas antigas e impede que o primeiro
    // carregamento de outubro mostre o álbum anterior por alguns segundos.
    try { await settleCardSeasonTransitionFor(user); } catch { try { await refreshOnlineState(); } catch {} }
    // Esta rota entrega o maior payload do portal. As rotinas que podem
    // gravar o estado inteiro ficam em /api/sync, que é chamado logo após a
    // abertura e no polling normal. Misturar persistência com a serialização
    // desta resposta fez um GET /api/state passar do limite de CPU do plano
    // gratuito durante uma virada do mercado.
    json(res, 200, stateFor(user, { localHalloweenPreview: localHalloweenPreviewRequest(req) })); return;
  }

  if (req.method === 'GET' && route === '/api/daily-duty/basket/status') {
    const { user } = requireAuth(req);
    json(res, 200, { dailyDutyBasketTask: dailyDutyBasketTaskFor(user), serverTime: Date.now() }); return;
  }

  if (req.method === 'POST' && route === '/api/daily-duty/basket/collect') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const itemId = String(body.itemId || '').slice(0, 40);
    const today = saoPauloDayKey();
    const task = dailyDutyBasketTaskFor(user);
    if (!task) throw new HttpError(403, 'Você não tem uma cesta de aviso ativa hoje.');
    const existing = db.economy.dailyDutyBasketCollections.find((entry) => entry.userId === user.id && entry.dayKey === today && entry.itemId === itemId);
    if (existing) {
      json(res, 200, { collected: true, duplicate: true, dailyDutyBasketTask: task, serverTime: Date.now() }); return;
    }
    if (!task.activeItem || task.activeItem.id !== itemId) throw new HttpError(409, 'Este item não está disponível agora. Os itens ficam no portal por 10 minutos.');
    db.economy.dailyDutyBasketCollections.push({ userId: user.id, dayKey: today, itemId, collectedAt: new Date().toISOString() });
    await persist();
    broadcastRefresh('daily-duty-basket');
    json(res, 200, { collected: true, duplicate: false, dailyDutyBasketTask: dailyDutyBasketTaskFor(user), serverTime: Date.now() }); return;
  }

  if (req.method === 'POST' && route === '/api/admin/daily-duty/penalties/clear') {
    const { user } = requireAdmin(req);
    const today = saoPauloDayKey();
    const penalties = db.users.filter((target) => dailyDutyPenaltyFor(target));
    const existing = Array.isArray(db.economy.dailyDutyPenaltyClears) ? db.economy.dailyDutyPenaltyClears : [];
    const retained = existing.filter((entry) => entry.dayKey === today);
    const clearedIds = new Set(retained.map((entry) => entry.userId));
    const now = new Date().toISOString();
    let changed = existing.length !== retained.length;
    db.economy.dailyDutyPenaltyClears = retained;
    let clearedCount = 0;
    for (const target of penalties) {
      if (clearedIds.has(target.id)) continue;
      db.economy.dailyDutyPenaltyClears.push({ userId: target.id, dayKey: today, clearedAt: now, clearedByUserId: user.id });
      clearedIds.add(target.id);
      clearedCount++;
      changed = true;
    }
    if (changed) {
      await persist();
      broadcastRefresh('daily-duty-penalties-cleared');
    }
    json(res, 200, { ...stateFor(user), dailyDutyClearedCount: clearedCount }); return;
  }

  if (req.method === 'GET' && route === '/api/admin/runtime-health') {
    requireAdmin(req);
    const runtime = typeof runtimeEnv.RUNTIME_HEALTH === 'function' ? runtimeEnv.RUNTIME_HEALTH() : { ok: false };
    json(res, 200, { runtime }); return;
  }

  enforceLieVoteGate(req, route);
  enforceCommunityVoteGate(req, route);

  if (req.method !== 'GET') {
    if (route.startsWith('/api/impostor/')) { requireAuth(req); requireFeature('impostor'); }
    if (route === '/api/mystery' || route.startsWith('/api/mystery/')) { requireAuth(req); requireFeature('mystery'); }
    if (route === '/api/casino/play' || route === '/api/casino/plinko/play' || route === '/api/casino/slots/play' || route === '/api/casino/flight/start' || route === '/api/lottery/entry') { requireAuth(req); requireFeature('casino'); }
    if (route === '/api/shop/purchase' || route === '/api/shop/free-purchase' || route === '/api/gifts/item' || route === '/api/loans/borrow' || route === '/api/loans/offer-item' || route === '/api/black-market/sell') { requireAuth(req); requireFeature('shop'); }
    if (route === '/api/uploads' || route === '/api/admin/uploads') { requireAuth(req); requireFeature('uploads'); }
  }

  if (route === '/api/casino/flight/start' || route === '/api/casino/flight/status' || route === '/api/casino/flight/cashout') {
    requireAuth(req);
    throw new HttpError(410, 'O Aviãozinho foi encerrado. A Roleta 51 continua disponível nos Jogos 51.');
  }

  // Duas voltas de dicas: a segunda começa somente depois de todos concluírem a primeira.
  if(req.method==='POST'&&route==='/api/impostor/tip'){
    const {user}=requireAuth(req);const body=await readJson(req),game=activeImpostorGame(),text=String(body.text||'').trim();
    if(!game||game.status!=='tips'||game.players[game.turnIndex]?.id!==user.id)throw new HttpError(409,'Ainda não é sua vez de dar a dica.');
    if(text.length<2||text.length>80)throw new HttpError(400,'A dica precisa ter entre 2 e 80 caracteres.');
    game.tipRound=Number(game.tipRound||1);game.tips.push({id:randomUUID(),userId:user.id,authorName:user.displayName,text,round:game.tipRound,createdAt:new Date().toISOString()});game.turnIndex++;
    if(game.turnIndex>=game.players.length){if(game.tipRound<2){game.tipRound++;game.turnIndex=0;}else game.status='voting';}
    await persist();broadcastRefresh('impostor');json(res,201,stateFor(user));return;
  }

  if(req.method==='POST'&&route==='/api/impostor/create'){
    const {user}=requireAuth(req);if(activeImpostorGame())throw new HttpError(409,'Já existe uma sala Impostor em andamento.');
    const code=Math.random().toString(36).slice(2,7).toUpperCase();db.impostorGames.push({id:randomUUID(),code,hostId:user.id,hostName:user.displayName,status:'lobby',players:[{id:user.id,name:user.displayName,joinedAt:new Date().toISOString()}],tips:[],votes:{},createdAt:new Date().toISOString()});
    db.impostorGames=db.impostorGames.slice(-30);await persist();broadcastRefresh('impostor');json(res,201,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/join'){
    const {user}=requireAuth(req);const body=await readJson(req);const game=activeImpostorGame();if(!game||game.status!=='lobby'||String(body.code||'').trim().toUpperCase()!==game.code)throw new HttpError(404,'Sala não encontrada ou já iniciada.');
    if(!game.players.some(person=>person.id===user.id))game.players.push({id:user.id,name:user.displayName,joinedAt:new Date().toISOString()});await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/leave'){
    const {user}=requireAuth(req);const game=activeImpostorGame();if(!game||game.status!=='lobby'||game.hostId===user.id)throw new HttpError(409,'Você só pode sair de uma sala antes do início.');
    game.players=game.players.filter(person=>person.id!==user.id);await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/cancel'){
    const {user}=requireAuth(req);const game=activeImpostorGame();if(!game||game.status!=='lobby'||game.hostId!==user.id)throw new HttpError(403,'Somente o criador pode cancelar esta sala.');
    game.status='cancelled';game.cancelledAt=new Date().toISOString();await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/start'){
    const {user}=requireAuth(req);const game=activeImpostorGame();if(!game||game.status!=='lobby'||game.hostId!==user.id)throw new HttpError(403,'Somente o criador pode iniciar a sala.');if(game.players.length<3)throw new HttpError(400,'São necessários pelo menos 3 jogadores.');
    const previousNormalWord=game.normalWord,previousImpostorWord=game.impostorWord,availablePairs=IMPOSTOR_PAIRS.filter(([normal])=>normal!==previousNormalWord),pair=(availablePairs.length?availablePairs:IMPOSTOR_PAIRS)[Math.floor(Math.random()*(availablePairs.length||IMPOSTOR_PAIRS.length))],normalWord=pair[0],unrelatedWords=IMPOSTOR_PAIRS.filter(([normal,related])=>normal!==normalWord&&related!==normalWord).flat().filter(word=>word!==previousImpostorWord),impostorWord=(unrelatedWords.length?unrelatedWords:IMPOSTOR_PAIRS.flat().filter(word=>word!==normalWord))[Math.floor(Math.random()*(unrelatedWords.length||IMPOSTOR_PAIRS.flat().filter(word=>word!==normalWord).length))],impostor=game.players[Math.floor(Math.random()*game.players.length)];game.normalWord=normalWord;game.impostorWord=impostorWord;game.impostorId=impostor.id;game.words=Object.fromEntries(game.players.map(person=>[person.id,person.id===impostor.id?impostorWord:normalWord]));game.status='tips';game.turnIndex=0;game.tips=[];game.votes={};game.startedAt=new Date().toISOString();await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/tip'){
    const {user}=requireAuth(req);const body=await readJson(req),game=activeImpostorGame(),text=String(body.text||'').trim();if(!game||game.status!=='tips'||game.players[game.turnIndex]?.id!==user.id)throw new HttpError(409,'Ainda não é sua vez de dar a dica.');if(text.length<2||text.length>80)throw new HttpError(400,'A dica precisa ter entre 2 e 80 caracteres.');game.tips.push({id:randomUUID(),userId:user.id,authorName:user.displayName,text,createdAt:new Date().toISOString()});game.turnIndex++;if(game.turnIndex>=game.players.length)game.status='voting';await persist();broadcastRefresh('impostor');json(res,201,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/vote'){
    const {user}=requireAuth(req);const body=await readJson(req),game=activeImpostorGame();if(!game||game.status!=='voting'||!game.players.some(person=>person.id===user.id))throw new HttpError(409,'A votação não está aberta para você.');if(game.votes[user.id])throw new HttpError(409,'Você já votou nesta rodada.');if(!game.players.some(person=>person.id===body.targetId)||body.targetId===user.id)throw new HttpError(400,'Escolha outro participante.');game.votes[user.id]=body.targetId;if(Object.keys(game.votes).length===game.players.length){const totals={};Object.values(game.votes).forEach(id=>totals[id]=(totals[id]||0)+1);const max=Math.max(...Object.values(totals));const winners=Object.keys(totals).filter(id=>totals[id]===max);game.status='result';game.winner=winners.length===1&&winners[0]===game.impostorId?'tripulação':'impostor';game.finishedAt=new Date().toISOString();}await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/replay'){
    const {user}=requireAuth(req);const game=(db.impostorGames||[]).at(-1);if(!game||game.status!=='result'||game.hostId!==user.id)throw new HttpError(403,'Somente o criador pode abrir uma nova rodada.');game.status='lobby';game.tips=[];game.votes={};game.turnIndex=0;game.words={};game.replayAt=new Date().toISOString();await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }
  if(req.method==='POST'&&route==='/api/impostor/end'){
    const {user}=requireAuth(req);const game=(db.impostorGames||[]).at(-1);if(!game||!['lobby','tips','voting','result'].includes(game.status)||user.role!=='admin')throw new HttpError(403,'Ação exclusiva do administrador.');game.status='closed';game.closedAt=new Date().toISOString();await persist();broadcastRefresh('impostor');json(res,200,stateFor(user));return;
  }

  if (req.method === 'POST' && route === '/api/mystery') {
    const { user } = requireAdmin(req); const body = await readJson(req);
    if (activeMystery()) throw new HttpError(409, 'Já existe um mistério em investigação. Encerre-o antes de abrir outro.');
    const reader = db.users.find((person) => person.id === body.readerUserId && person.active && person.approved !== false);
    if (!reader) throw new HttpError(400, 'Escolha um leitor ativo da tripulação.');
    db.mysteries.push({ id: randomUUID(), title: '', premise: '', solution: '', readerId: reader.id, readerName: reader.displayName, status: 'draft', questions: [], createdAt: new Date().toISOString(), closedAt: null, createdBy: user.id });
    if (db.mysteries.length > 30) db.mysteries = db.mysteries.slice(-30);
    await persist(); broadcastRefresh('mystery'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/mystery/setup') {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery();
    if (!mystery || mystery.status !== 'draft') throw new HttpError(409, 'Não há um mistério aguardando preparação.');
    if (mystery.readerId !== user.id) throw new HttpError(403, 'Somente o leitor escolhido pode preparar este mistério.');
    const title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    const premise = String(body.premise || '').trim().slice(0, 900);
    const solution = String(body.solution || '').trim().slice(0, 1800);
    if (title.length < 2 || premise.length < 3 || solution.length < 3) throw new HttpError(400, 'Use ao menos 3 caracteres no enigma e na solução.');
    mystery.title = title; mystery.premise = premise; mystery.solution = solution; mystery.status = 'open'; mystery.preparedAt = new Date().toISOString();
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/mystery/questions') {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery();
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId === user.id) throw new HttpError(403, 'O leitor responde; envie perguntas apenas como investigador.');
    const text = String(body.text || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (text.length < 2) throw new HttpError(400, 'Digite pelo menos 2 caracteres na pergunta.');
    mystery.questions.push({ id: randomUUID(), text, authorId: user.id, authorName: user.displayName, createdAt: new Date().toISOString(), answer: null, answeredAt: null });
    if (mystery.questions.length > 300) mystery.questions = mystery.questions.slice(-300);
    await persist(); broadcastRefresh('mystery'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && /^\/api\/mystery\/questions\/[\w-]+$/.test(route)) {
    const { user } = requireAuth(req); const mystery = activeMystery(); const questionId = route.split('/').at(-1);
    const question = mystery?.questions?.find((item) => item.id === questionId);
    if (!mystery || !question) throw new HttpError(404, 'Pergunta não encontrada.');
    if (question.authorId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você só pode cancelar sua própria pergunta.');
    if (question.answer) throw new HttpError(409, 'Uma pergunta já respondida não pode ser cancelada.');
    question.cancelledAt = new Date().toISOString();
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/mystery/questions/answered') {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery();
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId !== user.id) throw new HttpError(403, 'Somente o leitor responsável pode registrar uma pergunta respondida.');
    const text = String(body.text || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const answer = String(body.answer || '').toLowerCase();
    if (text.length < 2 || !MYSTERY_ANSWERS.has(answer)) throw new HttpError(400, 'Informe uma pergunta e uma resposta válida.');
    mystery.questions.push({ id: randomUUID(), text, authorId: user.id, authorName: user.displayName, createdAt: new Date().toISOString(), answer, answeredAt: new Date().toISOString(), answeredBy: user.id, manual: true });
    await persist(); broadcastRefresh('mystery'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/mystery/guesses') {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery();
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId === user.id) throw new HttpError(403, 'O leitor avalia os palpites; envie perguntas apenas como investigador.');
    const text = String(body.text || '').trim().replace(/\s+/g, ' ').slice(0, 900);
    if (text.length < 8) throw new HttpError(400, 'Conte um pouco mais do seu palpite.');
    mystery.guesses ||= []; mystery.guesses.push({ id: randomUUID(), text, authorId: user.id, authorName: user.displayName, createdAt: new Date().toISOString(), similarity: null, reveal: null, reviewedAt: null });
    await persist(); broadcastRefresh('mystery'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'PATCH' && /^\/api\/mystery\/guesses\/[\w-]+$/.test(route)) {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery(); const guessId = route.split('/').at(-1);
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId !== user.id) throw new HttpError(403, 'Somente o leitor responsável pode avaliar palpites.');
    const guess = (mystery.guesses || []).find((item) => item.id === guessId);
    const similarity = Number(body.similarity); const reveal = String(body.reveal || '').trim().slice(0, 500);
    if (!guess) throw new HttpError(404, 'Palpite não encontrado.');
    if (!Number.isInteger(similarity) || similarity < 0 || similarity > 100) throw new HttpError(400, 'Use uma proximidade entre 0 e 100%.');
    guess.similarity = similarity; guess.reveal = reveal || null; guess.reviewedAt = new Date().toISOString(); guess.reviewedBy = user.id;
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'PATCH' && /^\/api\/mystery\/questions\/[\w-]+$/.test(route)) {
    const { user } = requireAuth(req); const body = await readJson(req); const mystery = activeMystery();
    const questionId = route.split('/').at(-1);
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId !== user.id) throw new HttpError(403, 'Somente o leitor responsável pode responder perguntas.');
    const question = mystery.questions.find((item) => item.id === questionId);
    const answer = String(body.answer || '').toLowerCase();
    if (!question) throw new HttpError(404, 'Pergunta não encontrada.');
    if (question.answer) throw new HttpError(409, 'Essa pergunta já recebeu uma resposta oficial.');
    if (!MYSTERY_ANSWERS.has(answer)) throw new HttpError(400, 'Use apenas Sim, Não ou Irrelevante.');
    question.answer = answer; question.answeredAt = new Date().toISOString(); question.answeredBy = user.id;
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/mystery/close') {
    const { user } = requireAuth(req); const mystery = activeMystery();
    if (!mystery) throw new HttpError(409, 'Não há um mistério aberto agora.');
    if (mystery.readerId !== user.id && user.role !== 'admin') throw new HttpError(403, 'Somente o leitor ou o administrador pode encerrar este mistério.');
    mystery.status = 'closed'; mystery.closedAt = new Date().toISOString();
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && route === '/api/admin/mystery/history') {
    const { user } = requireAdmin(req); const before = db.mysteries.length;
    db.mysteries = db.mysteries.filter((item) => item.status === 'open');
    if (db.mysteries.length === before) throw new HttpError(409, 'Não há mistérios encerrados para limpar.');
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && route === '/api/admin/mystery/current') {
    const { user } = requireAdmin(req); const mystery = activeMystery() || db.mysteries.at(-1);
    if (!mystery) throw new HttpError(409, 'Não há mistério para apagar.');
    db.mysteries = db.mysteries.filter((item) => item.id !== mystery.id);
    await persist(); broadcastRefresh('mystery'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/sync') {
    const auth = requireAuth(req); const { user } = auth;
    // As cotações avançam no servidor, o polling normal também precisa
    // perceber a virada da janela sem exigir que o usuário recarregue a tela.
    // As demais liquidações também ficam aqui: a tela inicial só precisa
    // montar a resposta e não deve combinar uma persistência completa com o
    // seu payload. A função só altera o estado quando há uma virada real.
    let lotteryReminder = null;
    try {
      const cleanNameSettled = settleCleanNameRewards();
      const seasonalChallengesSettled = settleSeasonalChallenges();
      const seasonChampionSettled = settleSeasonChampionRewards();
      const pokemonCapsulesSettled = settlePokemonCapsules();
      const marketAdvanced = syncMarketEconomy();
      const cryptoAdvanced = await syncCryptoEconomy();
      const lotterySettled = settleLotteryRounds();
      const lieVotesSettled = settlePendingLieVotes();
  const communityVotesSettled = (db.communityVotes || []).reduce(
    (changed, item) => settleCommunityVoteByMajority(item) || changed,
    false,
  );
      const wallpaperDeadlineSettled = settleWallpaperDeadline();
      const dailyCobblemonBonus = grantCobblemonDailyBallBonus(user.id);
      await settleCardSeasonTransitionFor(user);
      const casinoArchived = db.economy.casinoPlays.length > 3000 && await archiveCasinoPlaysBefore(new Date().toISOString());
      lotteryReminder = lotteryReminderForUser(user);
      if (cleanNameSettled || seasonalChallengesSettled || seasonChampionSettled || pokemonCapsulesSettled || marketAdvanced || cryptoAdvanced || lotterySettled || lieVotesSettled || communityVotesSettled || wallpaperDeadlineSettled || dailyCobblemonBonus || casinoArchived) {
        await persist();
        if (lotterySettled) broadcastRefresh('lottery');
        if (wallpaperDeadlineSettled) broadcastRefresh('wallpaper-deadline');
        if (communityVotesSettled) broadcastRefresh('community-vote');
      }
    } catch {
      // Se outra instância do Worker ganhar a mesma virada, recarregamos o
      // estado vencedor e mantemos o polling de presença funcionando.
      try { await refreshOnlineState(); } catch {}
    }
    // A atualização de presença não pode impedir a sincronização do sorteio.
    let onlinePeople = sharedOnlinePeople.length ? sharedOnlinePeople : [{ id: user.id, displayName: user.displayName }];
    try { onlinePeople = await heartbeatPresence(auth); } catch {}
    json(res, 200, {
      onlinePeople,
      revision: stateRevision,
      lotteryReminder,
      requiredLieVote: user.role === 'admin' ? null : requiredLieVoteForUser(user.id),
      dailyDutyPenalty: dailyDutyPenaltyFor(user),
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

  if (req.method === 'POST' && route === '/api/profile/showcase') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const requested = Array.isArray(body.ids) ? [...new Set(body.ids.map((item) => String(item)))] : [];
    if (requested.length > 4) throw new HttpError(400, 'Escolha no máximo quatro conquistas para sua Sala de Troféus.');
    const available = new Set(profileFor(user).showcase.options.map((item) => item.id));
    if (requested.some((id) => !available.has(id))) throw new HttpError(400, 'Uma das conquistas escolhidas ainda não foi desbloqueada.');
    user.profileShowcase = requested;
    await persist(); broadcastRefresh('profile'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/casino/flight/start') {
    const { user } = requireAuth(req); const body = await readJson(req); const bet = parseMoney(body.bet, { min: 0.01 }); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional';
    if (bet === null) throw new HttpError(400, 'A aposta deve ter no máximo duas casas decimais e ser de pelo menos 0,01 crédito.');
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
    if (walletSource === 'shop') addCredits(user.id, -bet); else account.balance = roundMoney(before - bet);
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
    const hadCraftedSeasonBadge = Boolean(db.economy.cardAlbums?.[user.id]?.crafted?.[String(body.collectionId || '')]);
    let changed;
    try {changed=updateAlbum(db,user.id,body.action,body.collectionId);}
    catch(error){throw new HttpError(400,error.message);}
    if (changed && body.action === 'craft' && !hadCraftedSeasonBadge && NEXT_CARD_COLLECTIONS.some((collection) => collection.id === body.collectionId)) {
      awardPassXpIfActive(user.id, 'first-badge-craft', 'first-season-badge');
    }
    if(changed){await persist();broadcastRefresh('card-album');}
    json(res,200,stateFor(user));return;
  }

  if (req.method === 'GET' && route === '/api/card-season/transition-preview') {
    const { user } = requireAuth(req);
    json(res, 200, {
      season: NEXT_CARD_SEASON,
      collections: NEXT_CARD_COLLECTIONS,
      legacyBadges: craftedBadgeArchiveFor(db, user.id).filter((item) => !NEXT_CARD_COLLECTIONS.some((collection) => collection.id === item.id)),
      liquidation: previousSeasonLiquidationPreview(db, user.id),
      activationEnabled: cardSeasonTransitionIsEnabled(),
      active: cardSeasonTransitionIsEnabled(),
    });
    return;
  }

  if (req.method === 'GET' && route === '/api/card-season/pass-preview') {
    const { user } = requireAuth(req);
    json(res, 200, { ...seasonPassFor(db.economy, user.id), recipes: BLACKSTAR_WORKSHOP_RECIPES, activationEnabled: db.settings?.nextCardSeasonEnabled === true, active: seasonPassIsEnabled() });
    return;
  }

  if (req.method === 'POST' && route === '/api/card-season/pass-premium') {
    const { user } = requireAuth(req);
    if (!seasonPassIsEnabled()) throw new HttpError(409, 'O Passe da Temporada ainda não está ativo.');
    const account = ensureSeasonPassAccount(db.economy, user.id);
    if (account.premium) throw new HttpError(409, 'Você já possui o Passe Premium desta temporada.');
    const price = SEASON_PASS.premiumPrice;
    const before = walletFor(user.id);
    if (before < price) throw new HttpError(409, 'Créditos 51 insuficientes para o Passe Premium.');
    addCredits(user.id, -price);
    unlockSeasonPassPremium(db.economy, user.id);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'season-pass-premium', amount: -price, before, after: walletFor(user.id), reason: 'Passe Premium: ' + SEASON_PASS.name, createdAt: new Date().toISOString(), seasonId: SEASON_PASS.id });
    await persist(); broadcastRefresh('season-pass'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/card-season/pass-claim') {
    const { user } = requireAuth(req); const body = await readJson(req);
    if (!seasonPassIsEnabled()) throw new HttpError(409, 'O Passe da Temporada ainda não está ativo.');
    let claim;
    try { claim = claimSeasonPassReward(db.economy, user.id, String(body.track || ''), body.level); }
    catch (error) { throw new HttpError(400, error.message); }
    if (!claim.changed) { json(res, 200, stateFor(user)); return; }
    const createdAt = new Date().toISOString(); const reward = claim.reward;
    const packId = ({ 'Pacote Setor 51': 'card-pack-sector51', 'Pacote Órbita': 'card-pack-orbit', 'Pacote Núcleo': 'card-pack-core' })[reward.name];
    const cosmeticId = SEASON_PASS_COSMETIC_REWARDS[reward.name];
    if (reward.name === 'Fragmentos Blackstar') {
      const account = ensureSeasonPassAccount(db.economy, user.id);
      account.fragments = Math.max(0, Math.floor(Number(account.fragments) || 0)) + Math.max(1, Math.floor(Number(reward.quantity) || 1));
    } else if (reward.name === 'Créditos 51' || reward.name === 'Crédito de Renovação') {
      const amount = Number(reward.quantity || 0); const before = walletFor(user.id); addCredits(user.id, amount);
      db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: reward.name === 'Crédito de Renovação' ? 'season-pass-renewal' : 'season-pass-reward', amount, before, after: walletFor(user.id), reason: reward.name + ' · Passe · nível ' + claim.level, createdAt, seasonId: SEASON_PASS.id });
    } else if (packId) {
      const quantity = Math.max(1, Math.floor(Number(reward.quantity) || 1));
      for (let index = 0; index < quantity; index += 1) {
        db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: packId, price: 0, source: 'season-pass', seasonId: SEASON_PASS.id, rewardQuantity: quantity, rewardIndex: index + 1, createdAt });
      }
    } else if (cosmeticId) {
      if (!db.economy.purchases.some((item) => item.userId === user.id && item.itemId === cosmeticId)) {
        db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: cosmeticId, price: 0, originalPrice: 0, source: 'season-pass', seasonId: SEASON_PASS.id, createdAt });
      }
      const cosmetic = SHOP_CATALOG.find((item) => item.id === cosmeticId);
      // O emblema do Passe fica visível ao ser resgatado, sem remover uma
      // escolha pessoal que a pessoa já esteja usando.
      if (cosmetic?.type === 'badge') {
        db.economy.equipped[user.id] ||= {};
        if (!db.economy.equipped[user.id].badge) db.economy.equipped[user.id].badge = cosmeticId;
      }
    } else {
      db.economy.seasonPassInventory.push({ id: randomUUID(), userId: user.id, seasonId: SEASON_PASS.id, track: claim.track, level: claim.level, name: reward.name, quantity: reward.quantity, createdAt });
    }
    await persist(); broadcastRefresh('season-pass'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/card-season/forge') {
    const { user } = requireAuth(req); const body = await readJson(req);
    if (!seasonPassIsEnabled()) throw new HttpError(409, 'O Passe da Temporada ainda não está ativo.');
    const recipe = BLACKSTAR_WORKSHOP_RECIPES.find((entry) => entry.id === String(body.recipeId || ''));
    if (!recipe) throw new HttpError(400, 'Receita da Oficina inválida.');
    const variant = recipe.variants ? String(body.variant || '') : null;
    const itemId = recipe.variants ? recipe.variants[variant] : recipe.itemId;
    if (!itemId) throw new HttpError(400, 'Escolha uma cor válida para esta receita.');
    const account = ensureSeasonPassAccount(db.economy, user.id);
    account.fragments = Math.max(0, Math.floor(Number(account.fragments) || 0)); account.forged ||= [];
    if (account.fragments < recipe.cost) throw new HttpError(409, 'Fragmentos Blackstar insuficientes.');
    const forgeKey = recipe.id + (variant ? ':' + variant : '');
    if (account.forged.includes(forgeKey)) throw new HttpError(409, 'Esta versão já foi forjada nesta temporada.');
    account.fragments -= recipe.cost; account.forged.push(forgeKey);
    const createdAt = new Date().toISOString();
    if (recipe.type === 'pack') db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId, price: 0, source: 'season-forge', seasonId: SEASON_PASS.id, createdAt });
    else if (!db.economy.purchases.some((item) => item.userId === user.id && item.itemId === itemId)) db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId, price: 0, originalPrice: 0, source: 'season-forge', seasonId: SEASON_PASS.id, createdAt });
    await persist(); broadcastRefresh('season-pass'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/card-season/pack-simulate') {
    requireAuth(req); const body=await readJson(req);
    try { json(res,200,{cards:simulateCardPack(String(body.itemId||''))}); }
    catch(error){ throw new HttpError(400,error.message); }
    return;
  }

  if (req.method === 'POST' && route === '/api/card-season/liquidate') {
    const { user } = requireAuth(req);
    if (!CARD_SEASON_LOCAL_PREVIEW && Date.now() < Date.parse(NEXT_CARD_SEASON.startsAt)) throw new HttpError(409, 'O encerramento da coleção ainda não está disponível.');
    if (!CARD_SEASON_LOCAL_PREVIEW && db.settings?.nextCardSeasonEnabled !== true) throw new HttpError(409, 'A nova temporada ainda está em validação.');
    const result = liquidatePreviousCardSeason(db, user.id, randomUUID);
    if (result.changed) { await persist(); broadcastRefresh('card-season'); }
    json(res, 200, { ...stateFor(user), cardSeasonLiquidation: result });
    return;
  }
  if(req.method==='POST' && route==='/api/card-trades'){
    const {user}=requireAuth(req);const body=await readJson(req);let changed;
    try{changed=updateCardTrade(db,user.id,body,randomUUID);}catch(error){throw new HttpError(400,error.message);}
    if(changed){await persist();broadcastRefresh('card-trades');}
    json(res,200,stateFor(user));return;
  }
  const publicProfileMatch=route.match(/^\/api\/profiles\/([0-9a-f-]{20,})$/i);
  if(publicProfileMatch){
    const {user}=requireAuth(req);const target=db.users.find(person=>person.id===publicProfileMatch[1]&&person.active&&person.approved!==false);
    if(!target)throw new HttpError(404,'Perfil não encontrado.');
    if(req.method==='GET'){json(res,200,{profile:publicProfileFor(target)});return;}
    if(req.method==='POST'){
      const body=await readJson(req);const message=String(body.message||'').trim().replace(/\s+/g,' ');
      if(target.id===user.id)throw new HttpError(400,'Use o mural para conversar consigo mesmo.');
      if(message.length<2||message.length>300)throw new HttpError(400,'O comentário precisa ter entre 2 e 300 caracteres.');
      db.profileComments ||= [];db.profileComments.push({id:randomUUID(),targetUserId:target.id,authorId:user.id,authorName:user.displayName,message,createdAt:new Date().toISOString()});
      if(db.profileComments.length>1000)db.profileComments=db.profileComments.slice(-1000);
      await persist();broadcastRefresh('profile-comment');json(res,201,{profile:publicProfileFor(target)});return;
    }
  }
  if (await handleCommunityExtras(req, res, route)) return;

  if (req.method === 'POST' && route === '/api/casino/auto/stop') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    const current = casinoAutoOwners.get(user.id);
    if (current?.sessionId === String(body.autoSessionId || '')) casinoAutoOwners.delete(user.id);
    json(res, 200, { stopped: true }); return;
  }
  if (req.method === 'POST' && route === '/api/casino/play') {
    const { user } = requireAuth(req);
    const body = await readJson(req); const bet = parseMoney(body.bet, { min: ROULETTE_MIN_BET }); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional'; const autoSessionId = body.autoSessionId == null ? null : String(body.autoSessionId);
    if (bet === null) throw new HttpError(400, 'A aposta na Roleta 51 deve ter pelo menos 0,10 crédito e no máximo duas casas decimais.');
    const requestId = body.requestId == null ? null : String(body.requestId);
    if (requestId && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificação da aposta inválida.');
    const previous = requestId && (db.economy.casinoPlays.find(play => play.userId === user.id && play.requestId === requestId && play.resultType !== 'flight') || await archivedCasinoPlay(user.id, requestId, 'roulette'));
    if (previous) { if (previous.bet !== bet || previous.walletSource !== walletSource) throw new HttpError(400, 'Esta identificação já pertence a outra aposta.'); json(res, 200, body.compact ? compactCasinoPlayResponse(user, previous) : { ...stateFor(user), casinoResult: previous }); return; }
    if (dailyDutyPenaltyFor(user)) throw new HttpError(423, 'Jogos bloqueados pela punição diária até o fim da contagem regressiva.');
    authorizeCasinoAuto(user.id, autoSessionId, 'roulette', bet, walletSource);
    const dayKey = saoPauloDayKey(); const casinoAccount = casinoAccountFor(user.id, true); const sourceBalance = walletSource === 'shop' ? walletFor(user.id) : Number(casinoAccount.balance);
    if (sourceBalance < bet) throw new HttpError(409, walletSource === 'shop' ? 'Saldo da Loja 51 insuficiente para esta aposta.' : 'Saldo promocional do cassino insuficiente para esta aposta.');
    const jackpot = db.economy.casinoJackpot ||= { amount: CASINO_JACKPOT.seed, updatedAt: new Date().toISOString() };
    const jackpotEligible = bet >= CASINO_JACKPOT.minBet;
    if (jackpotEligible) { jackpot.amount = roundMoney(Math.max(CASINO_JACKPOT.seed, Number(jackpot.amount || CASINO_JACKPOT.seed)) + bet * CASINO_JACKPOT.contribution); jackpot.updatedAt = new Date().toISOString(); }
    const segments = CASINO_WHEEL_OUTCOMES.map((value, index) => ({ value, index })); const numericSegments = segments.filter(({ value }) => typeof value === 'number');
    const boxChance = rouletteBoxChance(bet); let eligibleSegments = numericSegments;
    if (Math.random() < boxChance) { const desiredBox = bet >= ROULETTE_BOX_MIN_BET ? (Math.random() < .38 ? 'box-area51' : Math.random() < .62 ? 'box-cosmic' : 'box-sonda') : 'box-sonda'; eligibleSegments = segments.filter(({ value }) => value === desiredBox); }
    const segmentIndex = eligibleSegments[Math.floor(Math.random() * eligibleSegments.length)].index; const outcome = CASINO_WHEEL_OUTCOMES[segmentIndex]; const before = sourceBalance; const createdAt = new Date().toISOString();
    let multiplier = null; let payout = 0; let net = -bet; let mysteryBox = null; let resultType = 'multiplier'; let jackpotWon = 0;
    if (jackpotEligible && Math.random() < CASINO_JACKPOT.chance) { resultType = 'casinoJackpot'; jackpotWon = roundMoney(Math.max(CASINO_JACKPOT.seed, Number(jackpot.amount || CASINO_JACKPOT.seed))); payout = jackpotWon; net = roundMoney(payout - bet); multiplier = roundMoney(payout / bet); jackpot.amount = CASINO_JACKPOT.seed; jackpot.updatedAt = createdAt; }
    else if (typeof outcome === 'string' && outcome.startsWith('box-')) { resultType = 'mysteryBox'; net = 0; payout = bet; mysteryBox = addMysteryBox(user.id, outcome, 'casino', bet); }
    else { multiplier = Number(outcome); if (multiplier === 3) { const bonus = Math.random(); if (bonus < .005) multiplier = 10; else if (bonus < .055) multiplier = 5; } payout = roundMoney(bet * multiplier); net = roundMoney(payout - bet); }
    let adjustment = null;
    if (walletSource === 'shop') { addCredits(user.id, net); if (net !== 0) { adjustment = { id: randomUUID(), userId: user.id, mode: 'casino-shop', amount: net, before, after: roundMoney(before + net), reason: resultType === 'casinoJackpot' ? 'Jackpot da Tripulação na Roleta 51' : 'Resultado da Roleta 51 usando saldo da loja', createdAt }; db.economy.creditAdjustments.push(adjustment); } }
    else casinoAccount.balance = roundMoney(before + net);
    const balanceAfter = walletSource === 'shop' ? walletFor(user.id) : roundMoney(casinoAccount.balance);
    const play = { id: randomUUID(), requestId, userId: user.id, dayKey, walletSource, bet, resultType, segmentIndex, wheelValue: outcome, multiplier, payout, net, mysteryBox, jackpotWon, jackpotContribution: jackpotEligible ? roundMoney(bet * CASINO_JACKPOT.contribution) : 0, balanceAfter, createdAt, ...(resultType === 'casinoJackpot' ? { notifyJackpot: true } : {}) };
    db.economy.casinoPlays.push(play); await persistCasinoPlay(user.id, play, adjustment, resultType === 'mysteryBox' ? db.economy.mysteryBoxes.at(-1) : null, jackpot); broadcastCasinoPlayRefresh(autoSessionId); json(res, 200, body.compact ? compactCasinoPlayResponse(user, play) : { ...stateFor(user), casinoResult: play }); return;
  }

  if (req.method === 'POST' && route === '/api/casino/plinko/play') {
    const { user } = requireAuth(req); const body = await readJson(req); const bet = parseMoney(body.bet, { min: 0.01 }); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional'; const risk = String(body.risk || 'medium'); const profile = PLINKO_PROFILES[risk]; const requestId = body.requestId == null ? null : String(body.requestId);
    if (!profile) throw new HttpError(400, 'Escolha um risco válido para o Plinko.');
    if (requestId && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificação da esfera inválida.');
    const previous = requestId && (db.economy.casinoPlays.find(play => play.userId === user.id && play.requestId === requestId && play.resultType === 'plinko') || await archivedCasinoPlay(user.id, requestId, 'plinko'));
    if (previous) { if (previous.bet !== bet || previous.walletSource !== walletSource || previous.plinko?.risk !== risk) throw new HttpError(400, 'Esta identificação já pertence a outra jogada.'); json(res, 200, body.compact ? { casinoResult: previous } : { ...stateFor(user), casinoResult: previous }); return; }
    if (dailyDutyPenaltyFor(user)) throw new HttpError(423, 'Jogos bloqueados pela punição diária até o fim da contagem regressiva.');
    if (bet === null) throw new HttpError(400, 'A aposta deve ter no máximo duas casas decimais e ser de pelo menos 0,01 crédito.');
    const dayKey = saoPauloDayKey(); const casinoAccount = casinoAccountFor(user.id, true); const sourceBalance = walletSource === 'shop' ? walletFor(user.id) : Number(casinoAccount.balance);
    if (sourceBalance < bet) throw new HttpError(409, walletSource === 'shop' ? 'Saldo da Loja 51 insuficiente para esta esfera.' : 'Saldo promocional do cassino insuficiente para esta esfera.');
    const path = Array.from({ length: 10 }, () => Math.random() < .5 ? 1 : 0); const slot = path.reduce((sum, step) => sum + step, 0); const multiplier = Number(profile.multipliers[slot]); const payout = roundMoney(bet * multiplier); const net = roundMoney(payout - bet); const createdAt = new Date().toISOString(); let adjustment = null;
    if (walletSource === 'shop') { addCredits(user.id, net); if (net !== 0) { adjustment = { id: randomUUID(), userId: user.id, mode: 'casino-shop', amount: net, before: sourceBalance, after: roundMoney(sourceBalance + net), reason: 'Resultado do Plinko 51 usando saldo da loja', createdAt }; db.economy.creditAdjustments.push(adjustment); } }
    else casinoAccount.balance = roundMoney(sourceBalance + net);
    const balanceAfter = walletSource === 'shop' ? walletFor(user.id) : roundMoney(casinoAccount.balance); const play = { id: randomUUID(), requestId, userId: user.id, dayKey, walletSource, bet, resultType: 'plinko', multiplier, payout, net, plinko: { risk, slot, path }, balanceAfter, createdAt };
    db.economy.casinoPlays.push(play); await persistCasinoPlay(user.id, play, adjustment, null); broadcastRefresh('economy'); json(res, 200, body.compact ? { casinoResult: play } : { ...stateFor(user), casinoResult: play }); return;
  }

  if (req.method === 'POST' && route === '/api/casino/slots/play') {
    const { user } = requireAuth(req); const body = await readJson(req); const bet = parseMoney(body.bet, { min: 0.01 }); const walletSource = body.walletSource === 'shop' ? 'shop' : 'promotional'; const requestId = body.requestId == null ? null : String(body.requestId); const autoSessionId = body.autoSessionId == null ? null : String(body.autoSessionId);
    if (requestId && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificação da rodada inválida.');
    const previous = requestId && (db.economy.casinoPlays.find((play) => play.userId === user.id && play.requestId === requestId && play.resultType === 'slots') || await archivedCasinoPlay(user.id, requestId, 'slots'));
    if (previous) { if (previous.bet !== bet || previous.walletSource !== walletSource) throw new HttpError(400, 'Esta identificação já pertence a outra rodada.'); json(res, 200, body.compact ? compactCasinoPlayResponse(user, previous) : { ...stateFor(user), casinoResult: previous }); return; }
    if (dailyDutyPenaltyFor(user)) throw new HttpError(423, 'Jogos bloqueados pela punição diária até o fim da contagem regressiva.');
    authorizeCasinoAuto(user.id, autoSessionId, 'slots', bet, walletSource);
    if (bet === null) throw new HttpError(400, 'A aposta deve ter no máximo duas casas decimais e ser de pelo menos 0,01 crédito.');
    const dayKey = saoPauloDayKey(); const casinoAccount = casinoAccountFor(user.id, true); const sourceBalance = walletSource === 'shop' ? walletFor(user.id) : Number(casinoAccount.balance);
    if (sourceBalance < bet) throw new HttpError(409, walletSource === 'shop' ? 'Saldo da Loja 51 insuficiente para esta rodada.' : 'Saldo promocional do cassino insuficiente para esta rodada.');
    const outcome = slotOutcome(); const multiplier = Number(outcome.multiplier); const payout = roundMoney(bet * multiplier); const net = roundMoney(payout - bet); const createdAt = new Date().toISOString(); let adjustment = null;
    if (walletSource === 'shop') { addCredits(user.id, net); if (net !== 0) { adjustment = { id: randomUUID(), userId: user.id, mode: 'casino-shop', amount: net, before: sourceBalance, after: roundMoney(sourceBalance + net), reason: 'Resultado do Caça-Níquel 51 usando saldo da loja', createdAt }; db.economy.creditAdjustments.push(adjustment); } }
    else casinoAccount.balance = roundMoney(sourceBalance + net);
    const balanceAfter = walletSource === 'shop' ? walletFor(user.id) : roundMoney(casinoAccount.balance); const play = { id: randomUUID(), requestId, userId: user.id, dayKey, walletSource, bet, resultType: 'slots', multiplier, payout, net, slots: { id: outcome.id, label: outcome.label, symbols: outcome.symbols }, balanceAfter, createdAt };
    db.economy.casinoPlays.push(play); await persistCasinoPlay(user.id, play, adjustment, null); broadcastCasinoPlayRefresh(autoSessionId); json(res, 200, body.compact ? compactCasinoPlayResponse(user, play) : { ...stateFor(user), casinoResult: play }); return;
  }

  if (req.method === 'POST' && route === '/api/lottery/entry') {
    const { user } = requireAuth(req); const body = await readJson(req); const numbers = [...new Set((Array.isArray(body.numbers) ? body.numbers : []).map(Number))].sort((a, b) => a - b); const requestId = String(body.requestId || '');
    const settled = settleLotteryRounds(); const round = currentLotteryRound();
    if (settled) await persist();
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificação do bilhete inválida.');
    const price = LOTTERY_TICKET_PLANS[numbers.length];
    if (!price || numbers.some((number) => !Number.isInteger(number) || number < 1 || number > LOTTERY_NUMBER_MAX)) throw new HttpError(400, 'Escolha de 6 a 10 números diferentes entre 1 e 50.');
    const previous = db.economy.lottery.entries.find((item) => item.requestId === requestId && item.userId === user.id);
    if (previous) {
      if (JSON.stringify(previous.numbers) !== JSON.stringify(numbers)) throw new HttpError(409, 'Esta identificação já pertence a outro bilhete.');
      json(res, 200, { ...stateFor(user), lotteryEntry: previous, duplicate: true }); return;
    }
    if (round.status !== 'open' || Date.parse(round.closeAt) <= Date.now()) throw new HttpError(409, 'Esta rodada já foi encerrada. Aguarde o próximo sorteio.');
    const before = walletFor(user.id);
    if (before < price) throw new HttpError(409, 'Saldo da Loja 51 insuficiente para comprar este bilhete.');
    addCredits(user.id, -price);
    const entry = { id: randomUUID(), requestId, roundId: round.id, userId: user.id, numbers, price, createdAt: new Date().toISOString() };
    db.economy.lottery.entries.push(entry);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'lottery-ticket', amount: -price, before, after: walletFor(user.id), reason: `Bilhete da Mega 51 · ${numbers.length} números · rodada ${round.id.slice(-10)}`, createdAt: entry.createdAt, lotteryRoundId: round.id, lotteryEntryId: entry.id });
    await persist(); broadcastRefresh('lottery'); json(res, 201, { ...stateFor(user), lotteryEntry: entry }); return;
  }

  if (req.method === 'POST' && route === '/api/casino/cashout') {
    const { user } = requireAuth(req); const account = casinoAccountFor(user.id, true);
    if (account.cashedOut) throw new HttpError(409, 'O lucro promocional de hoje já foi resgatado.');
    const cashoutThreshold = casinoCashoutThresholdForAccount(account);
    if (Number(account.balance) < cashoutThreshold) throw new HttpError(409, `Chegue a ${cashoutThreshold} créditos promocionais para liberar o lucro na loja.`);
    const amount = roundMoney(account.balance); const before = walletFor(user.id); const createdAt = new Date().toISOString();
    addCredits(user.id, amount); account.balance = 0; account.cashedOut = true; account.cashedOutAt = createdAt; account.cashedOutAmount = amount;
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'casino-cashout', amount, before, after: roundMoney(before + amount), reason: 'Saldo promocional liberado pelo Cassino 51 após atingir a meta', createdAt });
    const debtPayment = overdueLoanFor(user.id) ? applyLoanPayment(user.id, amount, 'Abatimento automático de dívida vencida no resgate promocional') : 0;
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), casinoCashout: amount - debtPayment, debtPayment }); return;
  }

  if (req.method === 'POST' && route === '/api/notifications/read') {
    const { user } = requireAuth(req);
    // Marca tudo o que está visível como lido. Usar também a data do aviso mais
    // recente evita que uma diferença de relógio entre celular e servidor deixe
    // o sino preso com avisos "não lidos".
    const latestNotification = notificationsFor(user).items.reduce((latest, item) => {
      const timestamp = Date.parse(item.createdAt || '') || 0;
      return Math.max(latest, timestamp);
    }, 0);
    db.notificationsReadAt[user.id] = new Date(Math.max(Date.now(), latestNotification + 1)).toISOString();
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'GET' && route === '/api/feedback') {
    const { user } = requireAuth(req);
    json(res, 200, { messages: feedbackForClient(user) }); return;
  }

  const feedbackImageMatch = route.match(/^\/api\/feedback\/([^/]+)\/image$/);
  if (req.method === 'GET' && feedbackImageMatch) {
    const { user } = requireAuth(req);
    const feedback = db.feedbackMessages.find((item) => item.id === feedbackImageMatch[1]);
    if (!feedback || !feedback.imageFilename) throw new HttpError(404, 'Este print não está mais disponível.');
    if (user.role !== 'admin' && feedback.authorId !== user.id) throw new HttpError(403, 'Este anexo é privado.');
    await serveMemoryImage(res, feedback.imageFilename); return;
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
    let imageFilename = null;
    if (body.imageDataUrl) {
      const imageData = String(body.imageDataUrl);
      const match = imageData.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new HttpError(400, 'Anexe uma imagem PNG, JPG ou WEBP válida.');
      const image = Buffer.from(match[2], 'base64');
      if (!image.length || image.length > 900000 || !hasValidImageSignature(image, match[1])) throw new HttpError(400, 'A imagem do feedback deve ser válida e ter no máximo 900 KB.');
      imageFilename = 'feedback-' + randomUUID() + '.' + ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]]);
      await storeImage(imageFilename, image, match[1]);
    }
    const now = Date.now();
    const lastPost = feedbackPostTimes.get(user.id) || 0;
    if (now - lastPost < 2500) throw new HttpError(429, 'Aguarde alguns segundos antes de enviar outra mensagem.');
    feedbackPostTimes.set(user.id, now);
    const createdAt = new Date(now).toISOString();
    const feedback = {
      id: randomUUID(), type, message,
      authorId: user.id, authorName: user.displayName,
      createdAt, updatedAt: createdAt, status: 'pending', adminComment: '',
      approvedAt: null, completedAt: null, archivedAt: null, imageFilename,
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
    const [deletedFeedback] = db.feedbackMessages.splice(feedbackIndex, 1);
    if (deletedFeedback.imageFilename) await deleteStoredImage(deletedFeedback.imageFilename);
    await persist();
    broadcastRefresh('feedback');
    json(res, 200, { messages: feedbackForClient(user) }); return;
  }

  if (req.method === 'GET' && route === '/api/community-votes') {
    const { user } = requireAuth(req); json(res, 200, communityVotesForClient(user)); return;
  }
  const communityVoteImageMatch = route.match(/^\/api\/community-votes\/([^/]+)\/image$/);
  if (req.method === 'GET' && communityVoteImageMatch) {
    requireAuth(req);
    const item = db.communityVotes.find((entry) => entry.id === communityVoteImageMatch[1]);
    if (!item?.imageFilename) throw new HttpError(404, 'Esta imagem não está disponível.');
    await serveMemoryImage(res, item.imageFilename); return;
  }
  if (req.method === 'POST' && route === '/api/community-votes') {
    const { user } = requireAuth(req); const body = await readJson(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de propor uma votação.');
    const subject = String(body.subject || '').trim().replace(/\s+/g, ' ');
    if (subject.length < 8 || subject.length > 280) throw new HttpError(400, 'A pauta deve ter entre 8 e 280 caracteres.');
    if (db.communityVotes.some((item) => item.status === 'open' && item.subject.toLocaleLowerCase('pt-BR') === subject.toLocaleLowerCase('pt-BR'))) throw new HttpError(409, 'Esta pauta já está aberta para votação.');
    const ownOpen = db.communityVotes.filter((item) => item.status === 'open' && item.authorId === user.id).length;
    if (ownOpen >= 3) throw new HttpError(409, 'Encerre ou aguarde uma de suas três pautas abertas antes de propor outra.');
    let imageFilename = null;
    if (body.imageDataUrl) {
      const match = String(body.imageDataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new HttpError(400, 'Anexe uma imagem PNG, JPG ou WEBP válida.');
      const image = Buffer.from(match[2], 'base64');
      if (!image.length || image.length > 2000000 || !hasValidImageSignature(image, match[1])) throw new HttpError(400, 'A imagem deve ser válida e ter no máximo 2 MB.');
      imageFilename = 'community-vote-' + randomUUID() + '.' + ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]]);
      await storeImage(imageFilename, image, match[1]);
    }
    const now = new Date().toISOString();
    db.communityVotes.push({ id: randomUUID(), subject, imageFilename, authorId: user.id, authorName: user.displayName, createdAt: now, expiresAt: new Date(Date.parse(now) + COMMUNITY_VOTE_DURATION_MS).toISOString(), status: 'open', eligibleVoterIds: communityVotePeople().map((person) => person.id), votes: [], comments: [], notifyAll: true });
    await persist(); broadcastRefresh('community-vote'); json(res, 201, stateFor(user)); return;
  }
  const communityVoteMatch = route.match(/^\/api\/community-votes\/([^/]+)\/vote$/);
  if (req.method === 'POST' && communityVoteMatch) {
    const { user } = requireAuth(req); const body = await readJson(req); const item = db.communityVotes.find((entry) => entry.id === communityVoteMatch[1]);
    if (!item) throw new HttpError(404, 'Votação não encontrada.');
    if (item.status !== 'open') throw new HttpError(409, 'Esta votação já foi encerrada.');
    item.eligibleVoterIds ||= communityVotePeople().map((person) => person.id);
    if (!item.eligibleVoterIds.includes(user.id)) throw new HttpError(403, 'Sua conta não está habilitada para votar.');
    if (!['favor', 'against'].includes(body.vote)) throw new HttpError(400, 'Escolha A favor ou Contra.');
    if ((item.votes || []).some((entry) => entry.userId === user.id)) throw new HttpError(409, 'Você já registrou seu voto nesta pauta.');
    item.votes.push({ userId: user.id, userName: user.displayName, vote: body.vote, createdAt: new Date().toISOString() });
    settleCommunityVoteByMajority(item);
    await persist(); broadcastRefresh('community-vote'); json(res, 200, stateFor(user)); return;
  }
  const communityVoteCommentMatch = route.match(/^\/api\/community-votes\/([^/]+)\/comments$/);
  if (req.method === 'POST' && communityVoteCommentMatch) {
    const { user } = requireAuth(req); const body = await readJson(req); const item = db.communityVotes.find((entry) => entry.id === communityVoteCommentMatch[1]);
    if (!item) throw new HttpError(404, 'Votação não encontrada.');
    if (item.status !== 'open') throw new HttpError(409, 'Os comentários desta pauta foram encerrados.');
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de comentar.');
    const message = String(body.message || '').trim();
    if (!message || message.length > 500) throw new HttpError(400, 'Escreva um comentário entre 1 e 500 caracteres.');
    item.comments ||= [];
    if (item.comments.length >= 50) throw new HttpError(409, 'Esta pauta atingiu o limite de 50 comentários.');
    const lastComment = item.comments.filter((entry) => entry.userId === user.id).at(-1);
    if (lastComment && Date.now() - Date.parse(lastComment.createdAt) < 2500) throw new HttpError(429, 'Aguarde alguns segundos antes de comentar novamente.');
    const normalizedMessage = message.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (item.comments.some((entry) => entry.userId === user.id && String(entry.message || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === normalizedMessage)) throw new HttpError(409, 'Este comentário já foi publicado nesta pauta.');
    item.comments.push({ id: randomUUID(), userId: user.id, userName: user.displayName, message, createdAt: new Date().toISOString(), notifyAll: true });
    await persist(); broadcastRefresh('community-vote'); json(res, 201, stateFor(user)); return;
  }
  const communityVoteCommentDeleteMatch = route.match(/^\/api\/community-votes\/([^/]+)\/comments\/([^/]+)$/);
  if (req.method === 'DELETE' && communityVoteCommentDeleteMatch) {
    const { user } = requireAuth(req); const [, voteId, commentId] = communityVoteCommentDeleteMatch;
    const item = db.communityVotes.find((entry) => entry.id === voteId);
    if (!item) throw new HttpError(404, 'Votação não encontrada.');
    const comment = (item.comments || []).find((entry) => entry.id === commentId);
    if (!comment) throw new HttpError(404, 'Comentário não encontrado.');
    if (comment.userId !== user.id) throw new HttpError(403, 'Você só pode excluir seu próprio comentário.');
    item.comments = item.comments.filter((entry) => entry.id !== commentId);
    await persist(); broadcastRefresh('community-vote'); json(res, 200, stateFor(user)); return;
  }
    const communityVoteAdminMatch = route.match(/^\/api\/admin\/community-votes\/([^/]+)$/);
  if (req.method === 'PATCH' && communityVoteAdminMatch) {
    const { user } = requireAuth(req); const body = await readJson(req); const item = db.communityVotes.find((entry) => entry.id === communityVoteAdminMatch[1]);
    if (!item) throw new HttpError(404, 'Votação não encontrada.');
    if (!['close', 'archive', 'implemented'].includes(body.action)) throw new HttpError(400, 'Ação inválida.');
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    if (user.role !== 'admin') throw new HttpError(403, 'Ação exclusiva da administração da pauta.');
    const now = new Date().toISOString();
    if (body.action === 'close') {
      if (item.status !== 'open') throw new HttpError(409, 'Esta pauta já não está aberta.');
      const favor = (item.votes || []).filter((entry) => entry.vote === 'favor').length;
      const against = (item.votes || []).filter((entry) => entry.vote === 'against').length;
      item.status = 'closed'; item.outcome = favor > against ? 'approved' : 'rejected'; item.implementationStatus = item.outcome === 'approved' ? 'pending' : null; item.closedAt = now; item.closedBy = user.id;
    } else if (body.action === 'implemented') {
      if (item.status !== 'closed' || item.outcome !== 'approved') throw new HttpError(409, 'Apenas uma pauta aprovada pode ser marcada como implementada.');
      item.implementationStatus = 'done'; item.implementedAt = now; item.implementedBy = user.id;
    } else { item.status = 'archived'; item.archivedAt = now; item.archivedBy = user.id; }
    await persist(); broadcastRefresh('community-vote'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/daily-wall/phrases') {
    const { user } = requireAuth(req);
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial antes de publicar.');
    const body = await readJson(req);
    const phrase = String(body.phrase || '').trim().replace(/\r\n?/g, '\n');
    if (!phrase) throw new HttpError(400, 'Digite a frase do dia.');
    if (phrase.length > 2000) throw new HttpError(400, 'A publicação deve ter no máximo 2.000 caracteres.');
    const post = {
      id: randomUUID(), userId: user.id, authorName: user.displayName, anonymous: Boolean(body.anonymous),
      phrase, createdAt: new Date().toISOString(),
    };
    updatePostMentions(post);
    db.dailyPhrases.push(post);
    db.economy.dailyDutyPosts ||= [];
    if (!db.economy.dailyDutyPosts.some((entry) => entry.userId === user.id && entry.dayKey === saoPauloDayKey())) db.economy.dailyDutyPosts.push({ userId: user.id, dayKey: saoPauloDayKey() });
    awardEngagementCard(db,user.id,'phrase',saoPauloDayKey(),Math.random,engagementCardOptions());
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
      if (text.length > 2000 || (type === 'phrase' && !text)) throw new HttpError(400, 'A publicação deve ter até 2.000 caracteres e uma frase não pode ficar vazia.');
      post[type === 'meme' ? 'caption' : 'phrase'] = text;
      updatePostMentions(post);
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
    if(post.userId!==user.id && message.length>=10)awardEngagementCard(db,user.id,'comment',saoPauloDayKey(),Math.random,engagementCardOptions());
    recordActivity(user.id, 'comment');
    rewardDailyMissions(user.id);
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
    const { dataUrl = '', caption = '', anonymous = false } = await readJson(req);
    if (typeof caption !== 'string' || caption.length > 2000) throw new HttpError(400, 'A legenda deve ter até 2.000 caracteres.');
    const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, 'Envie uma imagem PNG, JPG ou WEBP.');
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 750 * 1024) throw new HttpError(413, 'O meme deve ter no máximo 750 KB após a otimização.');
    if (!hasValidImageSignature(image, match[1])) throw new HttpError(400, 'O conteúdo do arquivo não corresponde a uma imagem válida.');
    const usedMemory = [...imageStore.values()].reduce((total, entry) => total + entry.buffer.length, 0);
    if (usedMemory + image.length > MAX_IMAGE_MEMORY) throw new HttpError(507, 'O limite de imagens foi atingido. Peça ao administrador para limpar o mural.');
    if (db.dailyMemes.length >= 60) throw new HttpError(409, 'O mural atingiu 60 memes. Peça ao administrador para limpar o dia.');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]];
    const filename = randomUUID() + '.' + extension;
    await storeImage(filename, image, match[1]);
    const post = {
      id: randomUUID(), userId: user.id, authorName: user.displayName, anonymous: Boolean(anonymous), filename,
      mimeType: match[1], size: image.length, caption: caption.trim(), createdAt: new Date(now).toISOString(),
    };
    updatePostMentions(post);
    db.dailyMemes.push(post);
    db.economy.dailyDutyPosts ||= [];
    if (!db.economy.dailyDutyPosts.some((entry) => entry.userId === user.id && entry.dayKey === saoPauloDayKey())) db.economy.dailyDutyPosts.push({ userId: user.id, dayKey: saoPauloDayKey() });
    awardEngagementCard(db,user.id,'meme',saoPauloDayKey(),Math.random,engagementCardOptions());
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

  const lieDisputeMessageMatch = route.match(/^\/api\/lie-disputes\/([^/]+)\/messages$/);
  if (req.method === 'POST' && lieDisputeMessageMatch) {
    const { user } = requireAuth(req); const body = await readJson(req);
    const dispute = (db.lieDisputes || []).find((item) => item.id === lieDisputeMessageMatch[1] && item.status === 'open');
    if (!dispute) throw new HttpError(404, 'Discussão não encontrada ou já encerrada.');
    if (!dispute.participantIds.includes(user.id)) throw new HttpError(403, 'Somente as três pessoas envolvidas participam desta conversa.');
    const text = String(body.text || '').trim().replace(/\s+/g, ' ');
    if (text.length < 1 || text.length > 400) throw new HttpError(400, 'Escreva uma mensagem de 1 a 400 caracteres.');
    const now = new Date().toISOString(); dispute.messages ||= [];
    dispute.messages.push({ id: randomUUID(), authorId: user.id, authorName: user.displayName, text, system: false, createdAt: now });
    dispute.messages = dispute.messages.slice(-100); dispute.updatedAt = now;
    await persist(); broadcastRefresh('lie-dispute'); json(res, 200, stateFor(user)); return;
  }

  const lieDisputeDecisionMatch = route.match(/^\/api\/lie-disputes\/([^/]+)\/decision$/);
  if (req.method === 'POST' && lieDisputeDecisionMatch) {
    const { user } = requireAuth(req); const body = await readJson(req);
    const dispute = (db.lieDisputes || []).find((item) => item.id === lieDisputeDecisionMatch[1] && item.status === 'open');
    if (!dispute) throw new HttpError(404, 'Discussão não encontrada ou já encerrada.');
    if (!dispute.participantIds.includes(user.id)) throw new HttpError(403, 'Somente as três pessoas envolvidas podem decidir.');
    const decision = String(body.decision || '');
    if (!['truth', 'lie', 'withdraw'].includes(decision)) throw new HttpError(400, 'Escolha Verdade, Mentira ou Desistir.');
    const labels = { truth: 'Verdade', lie: 'Mentira', withdraw: 'Desistir' };
    const now = new Date().toISOString(); dispute.decisions ||= {}; dispute.messages ||= [];
    dispute.decisions[user.id] = decision;
    dispute.messages.push({ id: randomUUID(), authorId: user.id, authorName: user.displayName, text: 'Escolheu: ' + labels[decision] + '.', system: true, createdAt: now });
    const decisions = dispute.participantIds.map((id) => dispute.decisions[id]).filter(Boolean);
    if (decisions.length === dispute.participantIds.length && new Set(decisions).size === 1) {
      const lie = db.lieAccusations.find((item) => item.id === dispute.lieId);
      dispute.status = 'resolved'; dispute.outcome = decisions[0]; dispute.resolvedAt = now;
      if (lie && decisions[0] === 'truth') { lie.status = 'overturned'; lie.overturnedAt = now; lie.disputeId = dispute.id; }
      dispute.messages.push({ id: randomUUID(), authorId: null, authorName: 'Sistema', text: decisions[0] === 'truth' ? 'Consenso: Verdade. A mentira foi removida do placar.' : decisions[0] === 'lie' ? 'Consenso: Mentira. O registro permanece no placar.' : 'Consenso: Desistir. Nenhuma alteração foi feita no placar.', system: true, createdAt: now });
    }
    dispute.messages = dispute.messages.slice(-100); dispute.updatedAt = now;
    await persist(); broadcastRefresh('lie-dispute'); json(res, 200, stateFor(user)); return;
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
    // A mesma pessoa pode receber várias marcações simultâneas. Só evitamos o
    // duplo envio acidental do mesmo motivo nos primeiros segundos.
    const now = new Date().toISOString();
    const duplicate = db.lieAccusations.some((item) => item.status === 'pending' && item.targetUserId === target.id && item.createdByUserId === user.id && item.delta === delta && (item.reason || '') === (delta > 0 ? reason : '') && Date.parse(now) - Date.parse(item.createdAt || '') < 30000);
    if (duplicate) throw new HttpError(409, 'Você já possui uma marcação igual aguardando validação.');
    const requiredVoterIds = db.users.filter((person) => person.active && person.approved !== false).map((person) => person.id);
    const votes = delta > 0 ? { [user.id]: 'lie' } : { [user.id]: 'truth' };
    db.lieAccusations.push({ id: randomUUID(), targetUserId: target.id, createdByUserId: user.id, delta, reason: delta > 0 ? reason : '', status: 'pending', createdAt: now, validatedByUserId: null, confirmedAt: null, requiredVoterIds, votes });
    if (db.lieAccusations.length > 3000) db.lieAccusations = db.lieAccusations.slice(-3000);
    await persist(); broadcastRefresh('lie-meter'); json(res, 201, stateFor(user)); return;
  }

  const lieVoteMatch = route.match(/^\/api\/lie-meter\/([^/]+)\/vote$/);
  if (req.method === 'POST' && lieVoteMatch) {
    const { user } = requireAuth(req); const body = await readJson(req);
    const item = db.lieAccusations.find((entry) => entry.id === lieVoteMatch[1] && entry.status === 'pending');
    if (!item) throw new HttpError(404, 'Votação de mentira não encontrada.');
    if (!item.requiredVoterIds?.includes(user.id)) throw new HttpError(403, 'Você não participa desta votação.');
    const vote = String(body.vote || '');
    if (!['truth', 'lie', 'strong-lie', 'not-heard'].includes(vote)) throw new HttpError(400, 'Escolha Mentiu, Mentiu forte, Não mentiu ou Não ouvi.');
    item.votes ||= {}; item.votes[user.id] = vote;
    resolveLieVoteIfDecided(item);
    await persist(); broadcastRefresh('lie-meter'); json(res, 200, stateFor(user)); return;
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
    if(beforeTotal+ml>=500)awardEngagementCard(db,user.id,'water',dayKey,Math.random,engagementCardOptions());
    recordActivity(user.id, 'water_log');
    if (beforeTotal < 2500 && beforeTotal + ml >= 2500) awardHydrationGoal(user.id, dayKey);
    rewardDailyMissions(user.id, dayKey);
    rewardTeamMissionIfComplete();
    settleSeasonalChallenges();
    if (db.waterEntries.length > 10000) db.waterEntries = db.waterEntries.slice(-10000);
    await persist(); broadcastRefresh('hydration'); json(res, 201, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/market/auto-sell') {
    const { user } = requireAuth(req); const body = await readJson(req);
    syncMarketEconomy();
    const assetId = String(body.assetId || ''); const quantity = Number(body.quantity); const targetPrice = roundMoney(Number(body.targetPrice));
    const asset = MARKET_ASSETS.find((item) => item.id === assetId); if (!asset) throw new HttpError(400, 'Ativo não encontrado.');
    const market = ensureMarketState(db.economy); const held = Number(market.portfolios?.[user.id]?.[assetId] || 0); const currentPrice = roundMoney(market.prices[assetId] || asset.initialPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > held) throw new HttpError(409, 'Escolha uma quantidade que esteja na sua carteira.');
    if (!Number.isFinite(targetPrice) || targetPrice <= currentPrice || targetPrice > 1000000) throw new HttpError(400, `Defina um alvo acima da cotação atual (${currentPrice.toFixed(2)}).`);
    if (market.autoSellOrders.some((order) => order.userId === user.id && order.assetId === assetId && order.status === 'active')) throw new HttpError(409, 'Você já possui uma venda automática ativa para esta moeda. Cancele-a ou aguarde a execução.');
    const order = { id: randomUUID(), userId: user.id, assetId, quantity, targetPrice, status: 'active', createdAt: new Date().toISOString(), createdSlot: market.slotKey };
    market.autoSellOrders.push(order);
    await persist(); broadcastRefresh('economy'); json(res, 201, { profile: profileFor(user), order: { id: order.id, assetId, quantity, targetPrice } }); return;
  }

  if (req.method === 'POST' && route === '/api/market/auto-sell/cancel') {
    const { user } = requireAuth(req); const body = await readJson(req); const market = ensureMarketState(db.economy);
    const order = market.autoSellOrders.find((item) => item.id === String(body.orderId || '') && item.userId === user.id && item.status === 'active');
    if (!order) throw new HttpError(404, 'A ordem automática não está mais ativa.');
    order.status = 'cancelled'; order.cancelledAt = new Date().toISOString(); order.cancelReason = 'Cancelada pelo participante.';
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user) }); return;
  }

  if (req.method === 'POST' && (route === '/api/market/buy' || route === '/api/market/sell')) {
    const { user } = requireAuth(req); const body = await readJson(req); const side = route.endsWith('/buy') ? 'buy' : 'sell';
    syncMarketEconomy(); const assetId = String(body.assetId || ''); const quantity = Number(body.quantity);
    const asset = MARKET_ASSETS.find((item) => item.id === assetId); if (!asset) throw new HttpError(400, 'Ativo não encontrado.');
    const market = ensureMarketState(db.economy); const price = roundMoney(market.prices[asset.id] || asset.initialPrice); const total = roundMoney(price * quantity);
    if (side === 'buy' && (!Number.isInteger(quantity) || quantity < 1 || walletFor(user.id) < total)) throw new HttpError(409, 'Quantidade inválida ou Créditos 51 insuficientes.');
    let operation; try { operation = transactMarket(db.economy, user.id, assetId, quantity, side); } catch (error) { throw new HttpError(400, error.message); }
    const before = walletFor(user.id);
    const signedTotal = side === 'buy' ? -operation.total : operation.total;
    const after = Math.round((before + signedTotal) * 100) / 100;
    db.economy.wallets[user.id] = after;
    operation.userId = user.id; operation.before = before; operation.after = after;
    market.ledger.push({ ...operation }); if (market.ledger.length > 5000) market.ledger = market.ledger.slice(-5000);
    db.economy.creditAdjustments.push({ id: operation.id, userId: user.id, mode: 'investment-market-' + side, amount: side === 'buy' ? -operation.total : operation.total, before, after, reason: `${side === 'buy' ? 'Compra' : 'Venda'} de ${asset.name}`, createdAt: operation.createdAt });
    if (side === 'sell') cancelMarketAutoOrdersWithoutPosition(user.id);
    settleMarketMissionsForUser(user.id);
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), operation }); return;
  }
  if (req.method === 'POST' && route === '/api/market/daily-income') {
    const { user } = requireAuth(req);
    const dayKey = saoPauloDayKey(); const status = marketDailyIncomeFor(user.id, dayKey);
    if (status.claimed) throw new HttpError(409, 'A renda diária de hoje já foi resgatada.');
    if (!status.eligible) throw new HttpError(409, 'Faça uma atividade válida hoje para liberar a Renda 51.');
    const before = walletFor(user.id); addCredits(user.id, MARKET_DAILY_INCOME);
    const createdAt = new Date().toISOString(); const key = user.id + ':' + dayKey;
    db.economy.dailyIncomeClaims.push({ id: randomUUID(), key, userId: user.id, dayKey, amount: MARKET_DAILY_INCOME, createdAt });
    if (db.economy.dailyIncomeClaims.length > 10000) db.economy.dailyIncomeClaims = db.economy.dailyIncomeClaims.slice(-10000);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'market-daily-income', amount: MARKET_DAILY_INCOME, before, after: walletFor(user.id), reason: 'Renda diária 51', createdAt });
    settleMarketMissionsForUser(user.id, dayKey);
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), amount: MARKET_DAILY_INCOME }); return;
  }

  if (req.method === 'POST' && route === '/api/crypto/daily-income') {
    const { user } = requireAuth(req); const dayKey = saoPauloDayKey(); const status = cryptoDailyIncomeFor(user.id, dayKey);
    if (status.claimed) throw new HttpError(409, 'A Renda Cripto 51 de hoje já foi resgatada.');
    if (!status.eligible) throw new HttpError(409, 'Faça uma atividade válida hoje para liberar a Renda Cripto 51.');
    const before = walletFor(user.id); addCredits(user.id, CRYPTO_DAILY_INCOME);
    db.economy.cryptoDailyIncomeClaims ||= []; db.economy.cryptoDailyIncomeClaims.push({ id: randomUUID(), key: user.id + ':' + dayKey, userId: user.id, dayKey, amount: CRYPTO_DAILY_INCOME, createdAt: new Date().toISOString() });
    if (db.economy.cryptoDailyIncomeClaims.length > 10000) db.economy.cryptoDailyIncomeClaims = db.economy.cryptoDailyIncomeClaims.slice(-10000);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'crypto51-daily-income', amount: CRYPTO_DAILY_INCOME, before, after: walletFor(user.id), reason: 'Renda diária do Cripto 51', createdAt: new Date().toISOString() });
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), amount: CRYPTO_DAILY_INCOME }); return;
  }

  if (req.method === 'POST' && (route === '/api/crypto/buy' || route === '/api/crypto/sell')) {
    const { user } = requireAuth(req); const body = await readJson(req); const side = route.endsWith('/buy') ? 'buy' : 'sell';
    const assetId = String(body.assetId || ''); const quantity = Number(body.quantity);
    const asset = CRYPTO_ASSETS.find((item) => item.id === assetId); if (!asset) throw new HttpError(400, 'Ativo do Cripto 51 não encontrado.');
    const market = ensureCryptoMarketState(db.economy);
    const assetUpdatedAt = Date.parse(market.assetUpdatedAt?.[asset.id] || '');
    // Uma tentativa global pode falhar mesmo quando este ativo ainda possui
    // consenso recente. Compra e venda usam a janela individual de 15 min.
    if (!Number.isFinite(assetUpdatedAt) || Date.now() - assetUpdatedAt > 15 * 60 * 1000) throw new HttpError(503, 'A cotação deste ativo está temporariamente indisponível. Aguarde a próxima sincronização.');
    const price = Number(market.prices[asset.id] || 0); const total = Math.ceil(price * quantity * 100 - 1e-9) / 100;
    if (!Number.isFinite(Number(body.expectedPrice)) || Number(body.expectedPrice) !== price) throw new HttpError(409, 'A cotação mudou. Atualize os valores e confirme a ordem novamente.');
    if (side === 'buy' && (!Number.isFinite(quantity) || quantity <= 0 || walletFor(user.id) < total)) throw new HttpError(409, 'Quantidade inválida ou Créditos 51 insuficientes.');
    let operation; try { operation = transactCryptoMarket(db.economy, user.id, assetId, quantity, side); } catch (error) { throw new HttpError(400, error.message); }
    const before = walletFor(user.id); const signedTotal = side === 'buy' ? -operation.total : operation.total; const after = roundMoney(before + signedTotal);
    db.economy.wallets[user.id] = after; operation.userId = user.id; operation.before = before; operation.after = after;
    market.ledger.push({ ...operation });
    db.economy.creditAdjustments.push({ id: operation.id, userId: user.id, mode: 'crypto51-' + side, amount: signedTotal, before, after, reason: `${side === 'buy' ? 'Compra' : 'Venda'} de ${asset.name}`, createdAt: operation.createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), operation }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/box/purchase') {
    const { user } = requireAuth(req); const body = await readJson(req); const box = COBBLEMON_BOXES[body.boxId];
    if (!box?.monthlyPokemon) throw new HttpError(404, 'Baú Pokémon não encontrado.');
    const cycleId = pokemonCapsuleCycleKey();
    const cycleEntries = db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.boxId === body.boxId && entry.cycleId === cycleId && !['cycle-discarded', 'cycle-expired', 'replaced', 'reset-refunded'].includes(entry.status));
    if (cycleEntries.some((entry) => ['weekly-choice-pending', 'awaiting-delivery', 'delivered', 'claimed-no-delivery'].includes(entry.status))) throw new HttpError(409, 'A escolha da semana já foi encerrada. A próxima compra libera no sábado.');
    if (cycleEntries.length >= 7) throw new HttpError(409, 'Você já atingiu os sete Pokémon desta semana. Escolha um deles para a entrega de sexta.');
    const price = roundMoney(box.price);
    if (walletFor(user.id) < price) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const before = walletFor(user.id), createdAt = new Date().toISOString(); addCredits(user.id, -price);
    db.economy.cobblemonDeliveries.push({ id: randomUUID(), userId: user.id, userName: user.displayName, boxId: body.boxId, boxName: box.name, name: box.name, sprite: 'https://cobbledex.b-cdn.net/3dmons/previews/large/25.webp', status: 'box-closed', openCount: 0, cycleId, cycleDay: cycleEntries.length + 1, rolls: [], purchasePrice: price, createdAt });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-box-purchase', amount: -price, before, after: roundMoney(before - price), reason: box.name, createdAt });
    await persist(); broadcastRefresh('economy');
    // A compra da cápsula não compartilha os campos da compra de Poké Balls.
    // Responder apenas com dados definidos evita gravar a compra e devolver 500
    // em seguida, o que fazia o botão parecer não ter funcionado.
    json(res, 200, { profile: profileFor(user) }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/box/open') {
    const { user } = requireAuth(req); const body = await readJson(req); const box = COBBLEMON_BOXES[body.boxId];
    if (!box) throw new HttpError(404, 'Baú Cobblemon não encontrado.');
    if (box.retired) throw new HttpError(409, 'A Caixa de Treinador foi aposentada. As Poké Balls continuam disponíveis pelo painel de captura.');
    if (box.monthlyPokemon) {
      const closedBox = db.economy.cobblemonDeliveries.find((entry) => entry.id === body.inventoryId && entry.userId === user.id && entry.boxId === body.boxId && ['box-closed', 'box-open'].includes(entry.status));
      if (!closedBox) throw new HttpError(404, 'Seu Baú Pokémon fechado não foi encontrado. Compre o baú antes de abrir.');
      const cycleEntries = db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.cycleId === closedBox.cycleId && entry.boxId === 'pokemon');
      // A escolha semanal pendente pertence a outra abertura e não pode
      // impedir os sorteios de um Baú Pokémon que já foi comprado. Ela segue
      // preservada para decisão posterior; somente uma entrega já fechada
      // encerra de fato o ciclo.
      if (cycleEntries.some((entry) => ['awaiting-delivery', 'delivered', 'claimed-no-delivery'].includes(entry.status))) throw new HttpError(409, 'A entrega da semana já foi encerrada. Aguarde o próximo sábado.');
      const selectedCount = cycleEntries.filter((entry) => ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status)).length;
      if (selectedCount >= 7) throw new HttpError(409, 'Os sete Pokémon desta semana já foram escolhidos.');
      const dailyRollCount = Number(closedBox.rolls?.length || closedBox.openCount || 0);
      if (dailyRollCount >= 3) throw new HttpError(409, 'Os três sorteios deste Baú Pokémon já foram feitos. Escolha um Pokémon.');
      const roll = monthlyCobblemonPokemonReward(user.id, closedBox.cycleId);
      closedBox.rolls = Array.isArray(closedBox.rolls) ? closedBox.rolls : (closedBox.roll ? [closedBox.roll] : []);
      closedBox.rolls.push(roll); closedBox.roll = roll; closedBox.openedAt = new Date().toISOString(); closedBox.openCount = closedBox.rolls.length;
      const finalDailyRound = closedBox.rolls.length >= 3;
      closedBox.status = finalDailyRound ? 'choice-pending' : 'box-open';
      if (finalDailyRound) closedBox.choices = closedBox.rolls.map((item, index) => ({ ...item, entryId: `${closedBox.id}:${index}` }));
      const responseReward = { id: closedBox.id, boxId: 'pokemon', name: roll.name, sprite: roll.sprite, pokemonId: roll.pokemonId, rarity: roll.rarity, isShiny: Boolean(roll.isShiny), sellPrice: roll.sellPrice, level: roll.level, gender: roll.gender, levelSource: roll.levelSource, profile: profileFor(user), rollNumber: closedBox.rolls.length, rollsRemaining: 3 - closedBox.rolls.length, rollOnly: !finalDailyRound, canChooseNow: false, choiceStage: finalDailyRound ? 'daily' : null, choices: finalDailyRound ? closedBox.choices : undefined };
      await persist(); broadcastRefresh('economy'); json(res, 200, { reward: responseReward, profile: responseReward.profile }); return;
    }
    const price = roundMoney(box.price);
    if (walletFor(user.id) < price) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const before = walletFor(user.id), reward = weightedCobblemonReward(box), createdAt = new Date().toISOString(); addCredits(user.id, -price);
    // O prêmio é persistido antes da animação. Para o Premium, a decisão fica
    // pendente até o participante escolher receber ou vender; após F5/queda,
    // o mesmo registro continua no painel, sem novo sorteio nem duplicidade.
    const premiumSaleEligible = body.boxId === 'master';
    const delivery = { id: randomUUID(), userId: user.id, userName: user.displayName, boxId: body.boxId, boxName: box.name, rewardId: reward.id, name: reward.name, sprite: reward.sprite, sellPrice: premiumSaleEligible ? premiumCobblemonSellPrice(reward.weight) : reward.sellPrice, status: premiumSaleEligible ? 'decision-pending' : (reward.forceDelivery || box.forceDelivery ? 'awaiting-delivery' : 'decision-pending'), forceDelivery: premiumSaleEligible ? false : Boolean(reward.forceDelivery || box.forceDelivery), premiumSaleEligible, deliveryByDavi: Boolean(reward.forceDelivery || box.forceDelivery), deliveryNote: reward.deliveryNote || null, pokemonId: reward.pokemonId || null, rarity: reward.rarity || null, isShiny: Boolean(reward.isShiny), purchasePrice: price, createdAt };
    db.economy.cobblemonDeliveries.push(delivery); db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-box', amount: -price, before, after: roundMoney(before - price), reason: box.name, createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { reward: delivery, profile: profileFor(user) }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/roulette/spin') {
    const { user } = requireAuth(req); const now = Date.now();
    const dayKey = saoPauloDayKey(), cycleId = pokemonCapsuleCycleKey(), cycleStart = cycleId.slice('capsule-week:'.length);
    const cycleSpins = db.economy.cobblemonRouletteSpins.filter((entry) => entry.userId === user.id && (entry.cycleId === cycleId || (!entry.cycleId && (entry.dayKey || saoPauloDayKey(new Date(entry.createdAt))) >= cycleStart)));
    if (cycleSpins.filter((entry) => !entry.freeSpin).length >= COBBLEMON_ROULETTE.weeklyLimit) throw new HttpError(409, 'Você já usou os sete giros deste ciclo. Um novo ciclo começa no sábado.');
    if (walletFor(user.id) < COBBLEMON_ROULETTE.price) throw new HttpError(409, 'Créditos 51 insuficientes para girar.');
    const price = roundMoney(COBBLEMON_ROULETTE.price); const before = walletFor(user.id), reward = weightedCobblemonReward(COBBLEMON_ROULETTE), createdAt = new Date(now).toISOString(); addCredits(user.id, -price);
    const delivery = { id: randomUUID(), userId: user.id, userName: user.displayName, boxId: 'roulette', boxName: 'Roleta Cobblemon', rewardId: reward.id, itemId: reward.itemId || null, name: reward.name, sprite: reward.sprite, sellPrice: reward.sellPrice, status: reward.noPrize ? 'no-prize' : reward.forceDelivery ? 'awaiting-delivery' : 'decision-pending', noPrize: Boolean(reward.noPrize), forceDelivery: Boolean(reward.forceDelivery), deliveryNote: reward.deliveryNote || null, createdAt };
    if (!reward.noPrize) db.economy.cobblemonDeliveries.push(delivery);
    db.economy.cobblemonRouletteSpins.push({ id: randomUUID(), userId: user.id, rewardId: reward.id, rewardName: reward.name, spinNumber: cycleSpins.length + 1, cycleId, dayKey, createdAt });
    if (db.economy.cobblemonRouletteSpins.length > 1000) db.economy.cobblemonRouletteSpins = db.economy.cobblemonRouletteSpins.slice(-1000);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-roulette', amount: -price, before, after: roundMoney(before - price), reason: 'Roleta Cobblemon', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { reward: delivery, profile: profileFor(user) }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/reward/decision') {
    const { user } = requireAuth(req); const body = await readJson(req); const wantsWeeklyImmediate = body.action === 'choose-weekly-now'; const wantsCandidateSale = body.action === 'sell-candidate';
    const belongsToRequest = (entry) => entry.userId === user.id && (entry.id === body.id || (wantsCandidateSale && entry.rewardId === body.id));
    const existingReward = db.economy.cobblemonDeliveries.find(belongsToRequest);
    const reward = db.economy.cobblemonDeliveries.find((entry) => belongsToRequest(entry) && (['decision-pending', 'box-open', 'choice-pending', 'weekly-choice-pending'].includes(entry.status) || ((wantsWeeklyImmediate || wantsCandidateSale) && entry.status === 'cycle-candidate')));
    if (!reward) {
      // A rede ou um toque repetido pode reenviar a mesma decisão depois que ela
      // já foi persistida. Responder com o estado atual torna a operação
      // idempotente: nunca repete venda, crédito ou fila de entrega.
      const actionAlreadyApplied = existingReward && (
        (body.action === 'sell' && existingReward.status === 'sold') ||
        (wantsCandidateSale && existingReward.status === 'sold') ||
        (wantsWeeklyImmediate && existingReward.status === 'awaiting-delivery' && existingReward.deliveryLocked) ||
        ((body.action === 'choose' || body.action === 'choose-now') && ['cycle-candidate', 'weekly-choice-pending', 'awaiting-delivery'].includes(existingReward.status)) ||
        ((body.action === 'keep' || !body.action) && ['awaiting-delivery', 'claimed-no-delivery'].includes(existingReward.status))
      );
      if (actionAlreadyApplied) { json(res, 200, { profile: profileFor(user), alreadyDecided: true }); return; }
      throw new HttpError(existingReward ? 409 : 404, existingReward ? 'Este prêmio já foi concluído com outra decisão.' : 'Prêmio não encontrado.');
    }
    let automaticWeeklySales = null;
    if (wantsCandidateSale) {
      if (!['cycle-candidate', 'weekly-choice-pending'].includes(reward.status) || reward.deliveryLocked) throw new HttpError(409, 'Este Pokémon já foi escolhido para entrega e não pode ser vendido.');
      const amount = cobblemonCandidateSellPrice(reward.rarity || reward.roll?.rarity); const before = walletFor(user.id); const now = new Date().toISOString(); addCredits(user.id, amount); reward.soldFromWeeklyChoice = reward.status === 'weekly-choice-pending'; reward.status = 'sold'; reward.decidedAt = now; reward.soldAt = now;
      db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-candidate-sale', amount: roundMoney(amount), before, after: roundMoney(before + amount), reason: 'Venda de Pokémon não escolhido: ' + reward.name, createdAt: now });
    } else if (wantsWeeklyImmediate) {
      if (!['cycle-candidate', 'weekly-choice-pending'].includes(reward.status)) throw new HttpError(409, 'Este Pokémon já não está disponível para a entrega semanal.');
      const now = new Date().toISOString();
      automaticWeeklySales = sellPokemonCapsuleCandidates(db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.cycleId === reward.cycleId), reward, user.id, now);
      Object.assign(reward, { status: 'awaiting-delivery', decidedAt: now, chosenAt: now, deliveryLocked: true, lockReason: 'Escolha antecipada para entrega do Davi' });
      reward.autoSoldCandidates = automaticWeeklySales;
    } else if (body.action === 'choose' || body.action === 'choose-now') {
      if (body.action === 'choose-now' || reward.status === 'box-open') throw new HttpError(409, 'Faça os três sorteios antes de escolher um Pokémon para a lista semanal.');
      if (!['choice-pending', 'weekly-choice-pending'].includes(reward.status)) throw new HttpError(409, 'Este Baú Pokémon não está aguardando uma escolha.');
      const weeklyChoice = reward.status === 'weekly-choice-pending';
      const choice = (reward.choices || []).find((item) => item.entryId === body.choiceId || item.id === body.choiceId);
      if (!choice) throw new HttpError(400, 'Escolha um Pokémon válido.');
      const now = new Date().toISOString();
      if (weeklyChoice) {
        const chosenEntry = db.economy.cobblemonDeliveries.find((entry) => entry.id === choice.entryId && entry.userId === user.id && entry.cycleId === reward.cycleId && ['cycle-candidate', 'weekly-choice-pending'].includes(entry.status));
        if (!chosenEntry) throw new HttpError(400, 'Essa opção semanal não está mais disponível.');
        automaticWeeklySales = sellPokemonCapsuleCandidates(db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.cycleId === reward.cycleId), chosenEntry, user.id, now);
        Object.assign(chosenEntry, { rewardId: choice.id, name: choice.name, sprite: choice.sprite, sellPrice: choice.sellPrice, pokemonId: choice.pokemonId, rarity: choice.rarity, isShiny: Boolean(choice.isShiny), level: choice.level, gender: choice.gender, levelSource: choice.levelSource, status: 'awaiting-delivery', decidedAt: now, chosenAt: now, deliveryLocked: true, lockReason: 'Escolha semanal para entrega do Davi' });
        chosenEntry.autoSoldCandidates = automaticWeeklySales;
      } else {
        Object.assign(reward, { rewardId: choice.id, name: choice.name, sprite: choice.sprite, sellPrice: choice.sellPrice, pokemonId: choice.pokemonId, rarity: choice.rarity, isShiny: Boolean(choice.isShiny), level: choice.level, gender: choice.gender, levelSource: choice.levelSource, status: 'cycle-candidate', decidedAt: now, chosenAt: now, dailyChoiceAt: now });
        const candidates = db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.cycleId === reward.cycleId && entry.status === 'cycle-candidate');
        // Sexta-feira não transforma uma escolha diária em decisão final se
        // ainda houver vagas de cápsula. Isso mantém a sétima compra aberta.
        if (candidates.length >= 7) {
          reward.status = 'weekly-choice-pending';
          reward.choices = candidates.map(pokemonCapsuleChoiceForEntry);
        }
      }
    } else if (body.action === 'sell') { if (reward.status !== 'decision-pending') throw new HttpError(409, reward.boxId === 'master' ? 'Este prêmio Premium já teve a decisão concluída.' : 'O Baú Pokémon só pode ser escolhido após as três aberturas.'); const before = walletFor(user.id); const amount = roundMoney(reward.sellPrice); addCredits(user.id, amount); reward.status = 'sold'; reward.decidedAt = new Date().toISOString(); reward.soldAt = reward.decidedAt; reward.saleAmount = amount; db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: reward.boxId === 'master' ? 'cobblemon-premium-sale' : 'cobblemon-sale', amount, before, after: roundMoney(before + amount), reason: 'Venda de ' + reward.name, createdAt: reward.decidedAt }); }
    else {
      if (reward.status === 'box-open') throw new HttpError(409, 'Escolha um Pokémon agora ou continue os sorteios deste Baú Pokémon.');
      if (reward.deliveryLocked) { reward.status = 'claimed-no-delivery'; reward.decidedAt = new Date().toISOString(); }
      else {
        // Só uma nova confirmação de Baú Pokémon pode substituir outro
        // Pokémon pendente. Prêmios da Roleta e dos outros baús são entregas
        // independentes e não devem mexer na escolha semanal.
        if (reward.boxId === 'pokemon') {
          db.economy.cobblemonDeliveries.filter((entry) => entry.userId === user.id && entry.boxId === 'pokemon' && entry.status === 'awaiting-delivery' && entry.id !== reward.id).forEach((entry) => { entry.status = 'replaced'; entry.replacedAt = new Date().toISOString(); });
        }
        reward.status = 'awaiting-delivery'; reward.decidedAt = new Date().toISOString(); reward.deliveryLocked = true;
        if (reward.boxId === 'master') { reward.lockReason = 'Prêmio Premium confirmado para entrega; revenda encerrada'; reward.receivedAt = reward.decidedAt; }
      }
    }
    // Depois da escolha diária, recalcule já a decisão semanal. Assim o
    // próximo passo aparece na mesma resposta, sem depender de recarregar a
    // página nem de uma requisição de outro participante.
    settlePokemonCapsules();
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), autoSold: automaticWeeklySales || reward.autoSoldCandidates || null, nextChoice: reward.status === 'weekly-choice-pending' ? { id: reward.id, name: reward.name, sprite: reward.sprite, choices: reward.choices, choiceStage: 'weekly' } : null }); return;
  }
  if (req.method === 'POST' && route === '/api/admin/cobblemon/delivered') {
    const { user } = requireAuth(req); if (user.role !== 'admin' && !/^davi\b/i.test(String(user.displayName || ''))) throw new HttpError(403, 'Apenas Davi ou administradores.'); const body = await readJson(req); const reward = db.economy.cobblemonDeliveries.find((entry) => entry.id === body.id && entry.status === 'awaiting-delivery');
    if (!reward) throw new HttpError(404, 'Entrega pendente não encontrada.'); reward.status = 'delivered'; reward.deliveredAt = new Date().toISOString(); reward.deliveredBy = user.displayName; await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }
  const cobblemonMemberMatch = route.match(/^\/api\/cobblemon\/server-members\/([a-f0-9-]+)$/);
  if (req.method === 'PATCH' && cobblemonMemberMatch) {
    const { user } = requireAuth(req);
    if (!canManageCobblemonServer(user)) throw new HttpError(403, 'Apenas Davi ou administradores podem gerenciar o servidor Cobblemon.');
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const target = db.users.find((person) => person.id === cobblemonMemberMatch[1] && person.active);
    if (!target) throw new HttpError(404, 'Participante não encontrado.');
    const body = await readJson(req);
    const plays = body.plays === true;
    const playerName = String(body.playerName || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (plays && playerName.length < 3) throw new HttpError(400, 'Informe o nome deste jogador no servidor.');
    const paymentStatus = ['paid', 'unpaid', 'exempt'].includes(body.paymentStatus) ? body.paymentStatus : 'unpaid';
    db.settings.cobblemonServerRoster[target.id] = { plays, playerName: plays ? playerName : '', paymentStatus: plays ? paymentStatus : 'unpaid', updatedAt: new Date().toISOString(), updatedByUserId: user.id };
    await persist(); broadcastRefresh('cobblemon-server-management'); json(res, 200, stateFor(user)); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/encounter') {
    const auth = requireAuth(req); const { user } = auth;
    const dayKey = saoPauloDayKey();
    const attempts = db.economy.cobblemonCaptureAttempts.filter((entry) => entry.userId === user.id && entry.dayKey === dayKey).length;
    const dailyCobblemonBonus = grantCobblemonDailyBallBonus(user.id, dayKey);
    if (dailyCobblemonBonus) await persist();
    if (attempts >= cobblemonDailyCaptureLimit(user.id, dayKey)) throw new HttpError(409, 'Você não possui nenhuma Poké Ball disponível para a caça.');
    const available = COBBLEMON_CATALOG;
    if (!available.length) throw new HttpError(409, 'Nenhum Pokémon disponível para encontrar.');
    const roll = Math.random();
    let tier = roll < .001 ? 4 : roll < .012 ? 3 : roll < .14 ? 2 : 1;
    let pool = available.filter((entry) => cobblemonCaptureTierForPokemon(entry) === tier);
    if (!pool.length) { tier = 1; pool = available.filter((entry) => cobblemonCaptureTierForPokemon(entry) === tier); }
    const pokemon = pool[Math.floor(Math.random() * pool.length)];
    const { floor: levelFloor, ceiling: levelCeiling } = cobblemonLevelRange(tier);
    const level = levelFloor + Math.floor(Math.random() * (levelCeiling - levelFloor + 1));
    const isShiny = Math.random() < COBBLEMON_SHINY_CHANCE;
    const ownedEntry = (Array.isArray(db.economy.cobblemonDex[user.id]) ? db.economy.cobblemonDex[user.id] : []).find((entry) => Number(entry.id) === Number(pokemon.i));
    const ownedLevel = ownedEntry ? (Number(ownedEntry.level) > 0 ? Number(ownedEntry.level) : normalizedCobblemonLevel(ownedEntry.id, ownedEntry.tier)) : null;
    const captureChances = Object.fromEntries(Object.keys(COBBLEMON_CAPTURE_BALLS).map((ballType) => [ballType, cobblemonCaptureChance(tier, level, ballType)]));
    const currentProfile = profileFor(user);
    json(res, 200, { encounterToken: createCobblemonEncounter(auth, pokemon, tier, level, isShiny), pokemon: { id: Number(pokemon.i), name: pokemon.n, type: pokemon.t, tier, level, isShiny }, captureChances, alreadyOwned: Boolean(ownedEntry), ownedLevel, expiresIn: 60, profile: currentProfile }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/capture') {
    const auth = requireAuth(req); const { user } = auth; const body = await readJson(req); const verified = verifyCobblemonEncounter(auth, body.encounterToken);
    const pokemon = COBBLEMON_CATALOG.find((entry) => Number(entry.i) === Number(verified.encounter.pokemonId));
    if (!pokemon) throw new HttpError(404, 'Este Pokémon não está disponível.');
    db.economy.cobblemonDex[user.id] ||= [];
    const ownedEntry = db.economy.cobblemonDex[user.id].find((entry) => Number(entry.id) === Number(pokemon.i));
    const alreadyOwned = Boolean(ownedEntry);
    const ownedLevel = ownedEntry ? (Number(ownedEntry.level) > 0 ? Number(ownedEntry.level) : normalizedCobblemonLevel(ownedEntry.id, ownedEntry.tier)) : null;
    const dayKey = saoPauloDayKey();
    const encounterKey = createHash('sha256').update(verified.payload).digest('hex').slice(0, 24);
    if (db.economy.cobblemonCaptureAttempts.some((entry) => entry.encounterKey === encounterKey)) throw new HttpError(409, 'Esta Poké Ball já foi arremessada. Procure outro Pokémon.');
    const attempts = db.economy.cobblemonCaptureAttempts.filter((entry) => entry.userId === user.id && entry.dayKey === dayKey).length;
    const dailyCobblemonBonus = grantCobblemonDailyBallBonus(user.id, dayKey);
    if (dailyCobblemonBonus) await persist();
    if (attempts >= cobblemonDailyCaptureLimit(user.id, dayKey)) throw new HttpError(409, 'Você não possui nenhuma Poké Ball disponível para a caça.');
    const ballType = String(body.ballType || 'poke').toLowerCase();
    const ball = COBBLEMON_CAPTURE_BALLS[ballType];
    if (!ball) throw new HttpError(400, 'Escolha uma Poké Ball válida.');
    db.economy.cobblemonBallInventory[user.id] ||= {};
    if (ball.daily) {
      if (cobblemonDailyPokeAttempts(user.id, dayKey) >= cobblemonDailyPokeLimit(user.id, dayKey)) throw new HttpError(409, 'Você não possui Poké Ball básica disponível para esta caça.');
    } else {
      const available = Math.max(0, Number(db.economy.cobblemonBallInventory[user.id][ballType] || 0));
      if (available < 1) throw new HttpError(409, `Você não possui ${ball.name}. Compre uma antes do arremesso.`);
      db.economy.cobblemonBallInventory[user.id][ballType] = available - 1;
    }
    const tier = Math.max(1, Math.min(4, Number(verified.encounter.tier) || 1));
    const level = Math.max(1, Math.min(100, Number(verified.encounter.level) || tier * 20));
    const isShiny = Boolean(verified.encounter.isShiny);
    const chance = cobblemonCaptureChance(tier, level, ballType) / 100;
    const deterministicRoll = parseInt(createHash('sha256').update('capture:' + auth.token + ':' + verified.payload + ':' + ballType).digest('hex').slice(0, 8), 16) / 0xffffffff;
    const hit = body.hit !== false;
    const captured = hit && deterministicRoll < chance;
    const createdAt = new Date().toISOString();
    db.economy.cobblemonCaptureAttempts.push({ id: randomUUID(), userId: user.id, dayKey, encounterKey, pokemonId: Number(pokemon.i), tier, level, isShiny, hit, captured, ballType, ballName: ball.name, createdAt });
    if (db.economy.cobblemonCaptureAttempts.length > 3000) db.economy.cobblemonCaptureAttempts = db.economy.cobblemonCaptureAttempts.slice(-3000);
    let replaced = false;
    let keptExisting = false;
    let shinyUpgraded = false;
    if (captured && !alreadyOwned) db.economy.cobblemonDex[user.id].push({ id: Number(pokemon.i), tier, level, isShiny, caughtAt: new Date().toISOString() });
    else if (captured && alreadyOwned && (level > ownedLevel || (isShiny && !ownedEntry.isShiny))) {
      shinyUpgraded = isShiny && !ownedEntry.isShiny;
      Object.assign(ownedEntry, { tier: level > ownedLevel ? tier : ownedEntry.tier, level: level > ownedLevel ? level : ownedEntry.level, isShiny: Boolean(ownedEntry.isShiny || isShiny), caughtAt: new Date().toISOString(), upgradedAt: new Date().toISOString() });
      replaced = level > ownedLevel;
    } else if (captured && alreadyOwned) keptExisting = true;
    const captureBonus = captured ? grantCobblemonCaptureBonuses(user, { pokemonId: Number(pokemon.i), tier, isShiny }) : { total: 0, grants: [], totalCaught: db.economy.cobblemonDex[user.id].length };
    let captureHighlight = null;
    if (captured && (tier >= 3 || isShiny)) {
      captureHighlight = {
        id: randomUUID(),
        userId: user.id,
        userName: user.displayName,
        pokemonId: Number(pokemon.i),
        pokemonName: pokemon.n,
        pokemonType: pokemon.t,
        tier,
        isShiny,
        duplicate: alreadyOwned,
        createdAt,
      };
      db.economy.cobblemonCaptureHighlights.push(captureHighlight);
      if (db.economy.cobblemonCaptureHighlights.length > 120) db.economy.cobblemonCaptureHighlights = db.economy.cobblemonCaptureHighlights.slice(-120);
    }
    await persist(); broadcastRefresh('economy');
    json(res, 200, { captured, duplicate: captured && alreadyOwned, alreadyOwned, ownedLevel, replaced, keptExisting, shinyUpgraded, missed: !hit, chance: Math.round(chance * 100), ballType, ballName: ball.name, ballSprite: ball.sprite, captureBonus, captureHighlight, pokemon: { id: Number(pokemon.i), name: pokemon.n, type: pokemon.t, tier, level, isShiny }, profile: profileFor(user) }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/balls/buy-special') {
    const { user } = requireAuth(req); const body = await readJson(req); const ballType = String(body.ballType || '').toLowerCase(); const ball = COBBLEMON_CAPTURE_BALLS[ballType];
    const quantity = Number(body.quantity);
    if (!ball || ball.daily) throw new HttpError(400, 'Escolha uma bola especial válida.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpError(400, 'Escolha entre 1 e 20 bolas.');
    const price = roundMoney(ball.price * quantity); const before = walletFor(user.id);
    if (before < price) throw new HttpError(409, 'Créditos 51 insuficientes para comprar estas bolas.');
    db.economy.cobblemonBallInventory[user.id] ||= {};
    const current = Math.max(0, Number(db.economy.cobblemonBallInventory[user.id][ballType] || 0));
    if (current + quantity > 100) throw new HttpError(409, 'O estoque desta bola já está cheio (limite de 100).');
    addCredits(user.id, -price); db.economy.cobblemonBallInventory[user.id][ballType] = current + quantity;
    const createdAt = new Date().toISOString();
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-special-ball', amount: -price, before, after: roundMoney(before - price), reason: `Compra de ${quantity} ${ball.name}`, createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), ballType, quantity, price }); return;
  }
  if (req.method === 'POST' && route === '/api/cobblemon/balls/buy') {
    const { user } = requireAuth(req); const body = await readJson(req); const dayKey = saoPauloDayKey();
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpError(400, 'Escolha entre 1 e 20 Poké Balls.');
    const existing = [...db.economy.cobblemonBallPurchases].reverse().find((entry) => entry.userId === user.id && entry.dayKey === dayKey);
    const already = Math.max(0, Math.floor(Number(existing?.quantity || 0)));
    const price = roundMoney(retailPriceWithCents(90) * quantity / 10), before = walletFor(user.id);
    if (before < price) throw new HttpError(409, 'Créditos 51 insuficientes para comprar as Poké Balls.');
    addCredits(user.id, -price); const createdAt = new Date().toISOString();
    if (existing) { existing.quantity = already + quantity; existing.price = Number(existing.price || 0) + price; existing.updatedAt = createdAt; }
    else db.economy.cobblemonBallPurchases.push({ id: randomUUID(), userId: user.id, dayKey, quantity, price, createdAt });
    if (db.economy.cobblemonBallPurchases.length > 1500) db.economy.cobblemonBallPurchases = db.economy.cobblemonBallPurchases.slice(-1500);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'cobblemon-balls', amount: -price, before, after: roundMoney(before - price), reason: 'Complemento diário de ' + quantity + ' Poké Balls', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { profile: profileFor(user), quantity, price }); return;
  }

  if (req.method === 'POST' && route === '/api/loans/offer-item') {
    const { user } = requireAuth(req); const body = await readJson(req); const purchase = db.economy.purchases.find((entry) => entry.id === body.purchaseId && entry.userId === user.id && !entry.mysteryDecisionPending);
    const allowed = stellarItemOffers(user.id).find((entry) => entry.purchaseId === body.purchaseId);
    if (!purchase || !allowed) throw new HttpError(404, 'Esse item não está disponível para a oferta do Agiota.');
    const loan = activeLoanFor(user.id); if (!loan) throw new HttpError(409, 'Você não possui dívida ativa para quitar com um item.');
    const before = walletFor(user.id); const now = new Date().toISOString();
    db.economy.purchases = db.economy.purchases.filter((entry) => entry.id !== purchase.id);
    db.economy.equipped ||= {};
    db.economy.equipped[user.id] ||= {};
    if (allowed.type && db.economy.equipped[user.id][allowed.type] === allowed.itemId) db.economy.equipped[user.id][allowed.type] = null;
    const paid = roundMoney(Math.min(Number(allowed.value), Number(loan.remainingDue))); loan.remainingDue = roundMoney(Number(loan.remainingDue) - paid); loan.payments ||= []; loan.payments.push({ amount: paid, method: 'item', itemId: purchase.itemId, createdAt: now }); if (loan.remainingDue <= 0) { loan.remainingDue = 0; loan.status = 'paid'; loan.paidAt = now; settleStellarLoanTrust(loan, now); } db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-loan-item-payment', amount: 0, before, after: before, reason: `Item entregue ao Agiota: ${allowed.name} (${paid} créditos abatidos)`, createdAt: now });
    await persist(); broadcastRefresh(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/black-market/sell') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const offer = stellarBlackMarketOffers(user.id).find((entry) => entry.purchaseId === body.purchaseId);
    const purchase = db.economy.purchases.find((entry) => entry.id === body.purchaseId && entry.userId === user.id);
    if (!purchase || !offer) throw new HttpError(404, 'Esse item não está disponível no Mercado Negro.');
    const before = walletFor(user.id); const createdAt = new Date().toISOString();
    db.economy.purchases = db.economy.purchases.filter((entry) => entry.id !== purchase.id);
    addCredits(user.id, offer.value);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-black-market-sale', amount: offer.value, before, after: roundMoney(before + offer.value), reason: `Venda no Mercado Negro: ${offer.name} por ${offer.value} Créditos 51`, createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), blackMarketSale: { name: offer.name, amount: offer.value } }); return;
  }

  if (req.method === 'POST' && route === '/api/loans/borrow') {
    const { user } = requireAuth(req); const { amount } = await readJson(req); const principal = Number(amount);
    const trust = stellarLoanTrustFor(user.id);
    if (!Number.isInteger(principal) || principal < 300) throw new HttpError(400, 'O Agiota ajeita os óculos: ele só abre a maleta a partir de 300 Créditos 51 inteiros.');
    if (principal > trust.maxPrincipal) throw new HttpError(409, `O Agiota fecha a maleta e ri: sua confiança libera até ${trust.maxPrincipal} Créditos 51 por enquanto.`);
    if (db.economy.loans.some((item) => item.userId === user.id && item.status === 'active')) throw new HttpError(409, 'Quite seu empréstimo atual antes de pedir outro.');
    const before = walletFor(user.id); const totalDue = Math.round(principal * 1.2); const createdAt = new Date().toISOString();
    addCredits(user.id, principal);
    db.economy.loans.push({ id: randomUUID(), userId: user.id, principal, interestRate: .2, totalDue, remainingDue: totalDue, status: 'active', payments: [], createdAt, dueAt: new Date(Date.now() + 48 * 3600000).toISOString(), paidAt: null, trustTierAtBorrow: trust.level, trustQualifyingPrincipal: trust.qualifyingPrincipal });
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-loan', amount: principal, before, after: roundMoney(before + principal), reason: 'Empréstimo do Agiota Estelar', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/loans/repay') {
    const { user } = requireAuth(req); const { amount } = await readJson(req); const requested = parseMoney(amount, { min: 0.01 });
    const loan = [...db.economy.loans].reverse().find((item) => item.userId === user.id && item.status === 'active');
    if (!loan) throw new HttpError(404, 'Você não possui empréstimo ativo.');
    if (requested === null) throw new HttpError(400, 'Informe um valor com no máximo duas casas decimais para pagar.');
    const payment = roundMoney(Math.min(requested, Number(loan.remainingDue))); const before = walletFor(user.id);
    if (before < payment) throw new HttpError(409, 'Seu saldo da Loja 51 não cobre esse pagamento.');
    addCredits(user.id, -payment); loan.remainingDue = roundMoney(Number(loan.remainingDue) - payment);
    const createdAt = new Date().toISOString(); loan.payments.push({ amount: payment, createdAt });
    if (loan.remainingDue <= 0) { loan.remainingDue = 0; loan.status = 'paid'; loan.paidAt = createdAt; settleStellarLoanTrust(loan, createdAt); }
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'stellar-loan-payment', amount: -payment, before, after: roundMoney(before - payment), reason: 'Pagamento ao Agiota Estelar', createdAt });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/shop/purchase') {
    const { user } = requireAuth(req);
    const localHalloweenPreview = localHalloweenPreviewRequest(req);
    const body = await readJson(req);
    const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId);
    if (!item) throw new HttpError(404, 'Item da loja não encontrado.');
    if (!isShopItemAvailable(item, localHalloweenPreview)) throw new HttpError(409, 'Este item não está disponível nesta temporada.');
    if (item.service) throw new HttpError(400, 'Use a ação específica deste serviço.');
    const sealedPurchase = body.sealed === true;
    const purchasableCurse = ['forceGayCursor', 'forceGiantCursor', 'forceAdhdCursor', 'forceDevDarkness', 'forceCleaningCurse', 'forceHaterCurse', 'forceGivaldoCurse'].includes(item.value);
    if (sealedPurchase && !purchasableCurse) throw new HttpError(400, 'A opção sem Antídoto só existe para maldições.');
    if (item.value === 'cleanseCursor' && db.economy.forcedCursors.some((entry) => entry.targetUserId === user.id && entry.sealed && isForcedCursorActive(entry, db.settings.currentRoundId))) throw new HttpError(409, 'Você está sob uma maldição lacrada. O Antídoto não pode ser comprado enquanto ela estiver ativa.');
    if (item.adminOnly) throw new HttpError(403, 'Este item é concedido exclusivamente a administradores.');
    const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
    const acceptsQuantity = Boolean(item.mysteryBox || item.cardPack || (item.type === 'power' && item.consumable));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpError(400, 'Escolha uma quantidade inteira entre 1 e 20.');
    if (!acceptsQuantity && quantity !== 1) throw new HttpError(400, 'Este item só pode ser comprado uma vez por pedido.');
    if (item.cardPackDailyLimit) {
      const today=saoPauloDayKey();
      const boughtToday=db.economy.purchases.filter(p=>p.userId===user.id&&p.itemId===item.id&&p.createdAt&&saoPauloDayKey(new Date(p.createdAt))===today).length;
      const remaining=Math.max(0,item.cardPackDailyLimit-boughtToday);
      if(quantity>remaining)throw new HttpError(409,remaining?'Você pode comprar mais '+remaining+' deste pacote hoje.':'Limite diário deste pacote atingido.');
    }
    if (!item.consumable && !item.mysteryBox && db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id)) throw new HttpError(409, 'Você já possui este item.');
    const unitPrice = sealedPurchase ? 5000 : Number(item.price);
    const totalPrice = roundMoney(unitPrice * quantity);
    if (walletFor(user.id) < totalPrice) throw new HttpError(409, 'Créditos 51 insuficientes para comprar esta quantidade.');
    addCredits(user.id, -totalPrice);
    const createdAt = new Date().toISOString();
    const mysteryBoxes = [];
    for (let index = 0; index < quantity; index += 1) {
      db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: item.id, price: roundMoney(unitPrice), sealed: sealedPurchase, closedBox: Boolean(item.mysteryBox), createdAt });
      if (item.mysteryBox) mysteryBoxes.push(addMysteryBox(user.id, item.id, 'shop'));
    }
    if (!item.consumable && !item.mysteryBox) {
      const equipped = { ...cosmeticsFor(user.id), [item.type]: item.id };
      for (const includedId of item.bundleItems || []) {
        const included = SHOP_CATALOG.find((candidate) => candidate.id === includedId);
        if (!included || included.consumable || included.mysteryBox) continue;
        if (!db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === included.id)) db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: included.id, price: 0, bundledWith: item.id, createdAt });
        equipped[included.type] = included.id;
      }
      db.economy.equipped[user.id] = equipped;
    }
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user, { localHalloweenPreview }), mysteryBox: mysteryBoxes[0] || null, mysteryBoxes, purchasedQuantity: quantity, totalPrice }); return;
  }

  if (req.method === 'POST' && route === '/api/card-packs/open') {
    const { user } = requireAuth(req); const localHalloweenPreview = localHalloweenPreviewRequest(req); const body = await readJson(req);
    let result;try { result = openCardPack(db,user.id,body.purchaseId); } catch(error) { throw new HttpError(400,error.message); }
    if(result.changed) { await persist(); broadcastRefresh('economy'); }
    json(res,200,{...stateFor(user,{localHalloweenPreview}),cardPackResult:result.cards});return;
  }

  if (req.method === 'POST' && route === '/api/mystery-boxes/open') {
    const localHalloweenPreview = localHalloweenPreviewRequest(req);
    const { user } = requireAuth(req); const body = await readJson(req);
    const index = db.economy.mysteryBoxes.findIndex((entry) => entry.id === body.inventoryId && entry.userId === user.id);
    if (index < 0) throw new HttpError(404, 'Este baú não está mais no seu inventário.');
    const inventoryItem = db.economy.mysteryBoxes[index];
    const box = SHOP_CATALOG.find((item) => item.id === inventoryItem.boxId && item.mysteryBox);
    if (!box) throw new HttpError(404, 'Tipo de baú não encontrado.');
    db.economy.mysteryBoxes.splice(index, 1);
    const mysteryReward = grantMysteryBoxReward(user, box, localHalloweenPreview);
    await persist(); broadcastRefresh('economy');
    const openedBox = { id: inventoryItem.id, name: box.name, icon: box.icon };
    json(res, 200, body.compact
      ? { profile: profileFor(user, { localHalloweenPreview }), mysteryReward, openedBox }
      : { ...stateFor(user, { localHalloweenPreview }), mysteryReward, openedBox }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-boxes/open-all') {
    const localHalloweenPreview = localHalloweenPreviewRequest(req);
    const { user } = requireAuth(req); const body = await readJson(req);
    const requestId = String(body.requestId || '').slice(0, 80);
    const inventoryIds = Array.isArray(body.inventoryIds) ? body.inventoryIds.map((id) => String(id).slice(0, 100)) : [];
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) throw new HttpError(400, 'Identificador da abertura em massa inválido.');
    if (!inventoryIds.length || inventoryIds.length > 100 || new Set(inventoryIds).size !== inventoryIds.length) throw new HttpError(400, 'Selecione entre 1 e 100 baús diferentes.');
    db.economy.mysteryBoxOpenBatches ||= [];
    const previousBatch = db.economy.mysteryBoxOpenBatches.find((batch) => batch.id === requestId && batch.userId === user.id);
    if (previousBatch) {
      json(res, 200, { ...stateFor(user, { localHalloweenPreview }), batchId: requestId, results: previousBatch.results, replayed: true }); return;
    }
    const selected = inventoryIds.map((id) => {
      const inventoryItem = db.economy.mysteryBoxes.find((entry) => entry.id === id && entry.userId === user.id);
      if (!inventoryItem) throw new HttpError(404, 'Um dos baús selecionados não está mais no seu inventário. Atualize o perfil e tente novamente.');
      const box = SHOP_CATALOG.find((item) => item.id === inventoryItem.boxId && item.mysteryBox);
      if (!box) throw new HttpError(404, 'Um dos tipos de baú selecionados não existe mais.');
      return { inventoryItem, box };
    });
    const results = selected.map(({ inventoryItem, box }) => {
      db.economy.mysteryBoxes.splice(db.economy.mysteryBoxes.indexOf(inventoryItem), 1);
      return { openedBox: { id: inventoryItem.id, name: box.name, icon: box.icon }, mysteryReward: grantMysteryBoxReward(user, box, localHalloweenPreview) };
    });
    db.economy.mysteryBoxOpenBatches.push({ id: requestId, userId: user.id, createdAt: new Date().toISOString(), results });
    db.economy.mysteryBoxOpenBatches = db.economy.mysteryBoxOpenBatches.slice(-25);
    await persist(); broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user, { localHalloweenPreview }), batchId: requestId, results, replayed: false }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-boxes/sell') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const index = db.economy.mysteryBoxes.findIndex((entry) => entry.id === body.inventoryId && entry.userId === user.id);
    if (index < 0) throw new HttpError(404, 'Este baú não está mais no seu inventário.');
    const inventoryItem = db.economy.mysteryBoxes[index];
    const box = SHOP_CATALOG.find((item) => item.id === inventoryItem.boxId && item.mysteryBox);
    if (!box) throw new HttpError(404, 'Tipo de baú não encontrado.');
    const amount = roundMoney(box.sellPrice || 0); const before = walletFor(user.id); const createdAt = new Date().toISOString();
    db.economy.mysteryBoxes.splice(index, 1); addCredits(user.id, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'mystery-box-sale', amount, before, after: roundMoney(before + amount), reason: 'Venda de ' + box.name, createdAt });
    await persist(); broadcastRefresh('economy');
    const soldBox = { name: box.name, amount };
    json(res, 200, body.compact ? { profile: profileFor(user), soldBox } : { ...stateFor(user), soldBox }); return;
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
    const marketResale = Math.max(0.01, roundMoney(Number(purchase.originalPrice ?? purchase.price ?? item.price ?? 0) * .55));
    const boxResaleCap = sourceBox ? Math.max(0.01, roundMoney(Number(sourceBox.sellPrice || 0) * .8)) : marketResale;
    const amount = Math.min(marketResale, boxResaleCap);
    const before = walletFor(user.id); const createdAt = new Date().toISOString();
    db.economy.purchases.splice(index, 1);
    if (db.economy.equipped[user.id]?.[item.type] === item.id) delete db.economy.equipped[user.id][item.type];
    addCredits(user.id, amount);
    db.economy.creditAdjustments.push({ id: randomUUID(), userId: user.id, mode: 'mystery-reward-sale', amount, before, after: roundMoney(before + amount), reason: 'Revenda de prêmio: ' + item.name, createdAt });
    await persist(); broadcastRefresh('economy');
    const soldReward = { name: item.name, amount };
    json(res, 200, body.compact ? { profile: profileFor(user), soldReward } : { ...stateFor(user), soldReward }); return;
  }

  if (req.method === 'POST' && route === '/api/mystery-rewards/keep') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const purchase = db.economy.purchases.find((entry) => entry.id === body.purchaseId && entry.userId === user.id && entry.sourceMysteryBoxId && entry.mysteryDecisionPending);
    if (!purchase) throw new HttpError(404, 'Este prêmio já teve sua decisão concluída.');
    purchase.mysteryDecisionPending = false; purchase.mysteryDecisionAt = new Date().toISOString();
    await persist(); broadcastRefresh('economy');
    json(res, 200, body.compact ? { profile: profileFor(user), keptReward: true } : { ...stateFor(user), keptReward: true }); return;
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
    const localHalloweenPreview = localHalloweenPreviewRequest(req);
    const body = await readJson(req);
    const item = SHOP_CATALOG.find((candidate) => candidate.id === body.itemId);
    if (!item) throw new HttpError(404, 'Item da loja não encontrado.');
    if (!isShopItemAvailable(item, localHalloweenPreview)) throw new HttpError(409, 'Este item não está disponível nesta temporada.');
    if (item.adminOnly) throw new HttpError(403, 'Este item é concedido exclusivamente a administradores.');
    if (!['title', 'badge', 'frame', 'nameStyle', 'siteTheme', 'cursorStyle', 'trailStyle'].includes(item.type)) throw new HttpError(403, 'A Compra Grátis 51 é válida somente para itens visuais.');
    if (db.economy.freeShopUses.includes(user.id)) throw new HttpError(409, 'Sua Compra Grátis 51 já foi utilizada.');
    if (!item.consumable && !item.mysteryBox && db.economy.purchases.some((purchase) => purchase.userId === user.id && purchase.itemId === item.id)) throw new HttpError(409, 'Você já possui este item.');
    db.economy.freeShopUses.push(user.id);
    db.economy.purchases.push({ id: randomUUID(), userId: user.id, itemId: item.id, price: 0, originalPrice: item.price, freePurchase: true, createdAt: new Date().toISOString() });
    db.economy.equipped[user.id] = { ...cosmeticsFor(user.id), [item.type]: item.id };
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user, { localHalloweenPreview }), freePurchaseItem: { id: item.id, name: item.name, icon: item.icon } }); return;
  }

  if (req.method === 'POST' && route === '/api/gifts/credits') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const target = db.users.find((item) => item.id === body.targetId && item.active && item.approved !== false);
    const amount = parseMoney(body.amount, { min: 0.01 });
    if (!target || target.id === user.id) throw new HttpError(404, 'Participante escolhido não encontrado.');
    if (amount === null) throw new HttpError(400, 'Envie um valor a partir de 0,01 crédito, com no máximo duas casas decimais.');
    if (walletFor(user.id) < amount) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const now = new Date().toISOString(); addCredits(user.id, -amount); addCredits(target.id, amount);
    db.economy.gifts.push({ id: randomUUID(), type: 'credits', fromUserId: user.id, toUserId: target.id, amount, createdAt: now });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/gifts/item') {
    const { user } = requireAuth(req); const localHalloweenPreview = localHalloweenPreviewRequest(req); const body = await readJson(req);
    const target = db.users.find((entry) => entry.id === body.targetId && entry.active && entry.approved !== false);
    const item = SHOP_CATALOG.find((entry) => entry.id === body.itemId && Number(entry.price) > 0 && !entry.adminOnly && !entry.passExclusive && !entry.mysteryBox && !entry.service && isShopItemAvailable(entry, localHalloweenPreview));
    if (!target || target.id === user.id) throw new HttpError(404, 'Participante escolhido não encontrado.');
    if (!item) throw new HttpError(404, 'Item não disponível para presente.');
    if (!item.consumable && db.economy.purchases.some((purchase) => purchase.userId === target.id && purchase.itemId === item.id)) throw new HttpError(409, 'Essa pessoa já possui este item.');
    if (walletFor(user.id) < item.price) throw new HttpError(409, 'Créditos 51 insuficientes.');
    const now = new Date().toISOString(); addCredits(user.id, -item.price);
    db.economy.purchases.push({ id: randomUUID(), userId: target.id, itemId: item.id, price: 0, giftedPrice: item.price, createdAt: now });
    if (['site-team-dragon-ball', 'site-cyberpunk-premium'].includes(item.id)) for (const bundledId of item.bundleItems || []) {
      if (!db.economy.purchases.some((purchase) => purchase.userId === target.id && purchase.itemId === bundledId)) db.economy.purchases.push({ id: randomUUID(), userId: target.id, itemId: bundledId, price: 0, bundledFrom: item.id, createdAt: now });
    }
    db.economy.gifts.push({ id: randomUUID(), type: 'item', fromUserId: user.id, toUserId: target.id, itemId: item.id, amount: item.price, createdAt: now });
    await persist(); broadcastRefresh('economy'); json(res, 200, stateFor(user, { localHalloweenPreview })); return;
  }

  if (req.method === 'POST' && route === '/api/profile/equip') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    if (!['title', 'badge', 'nameStyle', 'frame', 'siteTheme', 'trailStyle', 'cursorStyle'].includes(body.type)) throw new HttpError(400, 'Tipo de personalização inválido.');
    if (activeWallpaperDeadlinePenalty(user.id) && ['siteTheme', 'trailStyle', 'cursorStyle'].includes(body.type)) throw new HttpError(409, 'O tema e o cursor de Cusão da rodada são obrigatórios até o administrador limpar a rodada. Seu item continua guardado.');
    const currentGayWinner = [...db.draws].reverse().find((item) => item.type === 'gay' && !isVisualPunishmentCleared(item.createdAt, db.settings.visualThemeClearedAt));
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
    let targetedCurseTarget = null;
    let targetedCurseExpiresAt = null;
    let targetedCurseId = null;
    let curseAuthorReveal = null;
    if (item.value === 'cleanseCursor') {
      const curse = db.economy.forcedCursors.find((entry) => entry.targetUserId === user.id && isForcedCursorActive(entry, roundId));
      if (curse?.sealed) throw new HttpError(409, 'Esta maldição foi lacrada até o fim das 24 horas. Seu Antídoto não foi consumido.');
      if (!['hater', 'givaldo'].includes(curse?.style) && activeWallpaperDeadlinePenalty(user.id)) throw new HttpError(409, 'A punição por não enviar wallpaper não pode ser removida por item ou acessório. Seu poder não foi consumido.');
      if (!['hater', 'givaldo'].includes(curse?.style) && [...db.draws].reverse().find((draw) => draw.type === 'gay' && !isVisualPunishmentCleared(draw.createdAt, db.settings.visualThemeClearedAt))?.winnerId === user.id) throw new HttpError(409, 'O cursor do sorteado é obrigatório. Seu poder não foi consumido.');
      if (!['hater', 'givaldo'].includes(curse?.style) && overdueLoanFor(user.id)) throw new HttpError(409, 'Quite a dívida para remover a cobrança do Agiota. Seu poder não foi consumido.');
      if (!curse) throw new HttpError(409, 'Você não tem uma maldição comprada ativa. O cursor do sorteado não pode ser removido.');
      consumePower(user.id, item.id, { roundId });
      db.economy.forcedCursors = db.economy.forcedCursors.filter((entry) => entry !== curse);
    } else if (item.value === 'revealCurseAuthor') {
      const curseId = String(body.curseId || '');
      const curse = (db.economy.curseHistory || []).find((entry) => entry.id === curseId && Date.parse(entry.createdAt) >= Date.parse(db.settings.cursePowersReleasedAt || '9999-12-31'));
      if (!curse) throw new HttpError(409, 'Escolha uma maldição enviada após a estreia do rastreador. Seu poder não foi consumido.');
      if ((db.economy.curseAuthorReveals || []).some((entry) => entry.curseId === curse.id)) throw new HttpError(409, 'A autoria desta maldição já foi revelada a todos. Seu poder não foi consumido.');
      consumePower(user.id, item.id, { curseId: curse.id });
      db.economy.curseAuthorReveals.push({ userId: user.id, curseId: curse.id, revealedAt: new Date().toISOString() });
      curseAuthorReveal = { id: curse.id, targetName: curse.targetName, senderName: curse.senderName, style: curse.style, createdAt: curse.createdAt };
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
      throw new HttpError(409, 'O Escudo da Rodada só pode ser usado depois que você for sorteado como Gay. Aguarde o aviso do sorteio.');
    } else if (item.value === 'revealAuthor') {
      if (!roundId) throw new HttpError(409, 'Não há uma rodada ativa.');
      const alreadyRevealed = db.economy.authorReveals.some((reveal) => reveal.roundId === roundId && reveal.userId === user.id);
      const submissions = db.submissions.filter((entry) => entry.roundId === roundId && entry.active && entry.userId !== user.id);
      if (alreadyRevealed) throw new HttpError(409, 'Você já tem a autoria completa desta rodada visível.');
      if (!submissions.length) throw new HttpError(409, 'Todas as autorias desta rodada já estão visíveis para você.');
      consumePower(user.id, item.id, { roundId, revealCount: submissions.length });
      const createdAt = new Date().toISOString();
      db.economy.authorReveals.push({ roundId, userId: user.id, createdAt, fullRound: true });
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
    } else if (item.value === 'forceGayCursor' || item.value === 'forceGiantCursor' || item.value === 'forceAdhdCursor' || item.value === 'forceDevDarkness' || item.value === 'forceCleaningCurse' || item.value === 'forceHaterCurse' || item.value === 'forceGivaldoCurse') {
      const giant = item.value === 'forceGiantCursor';
      const adhd = item.value === 'forceAdhdCursor';
      const gayCursor = item.value === 'forceGayCursor';
      const devDarkness = item.value === 'forceDevDarkness';
      const cleaningCurse = item.value === 'forceCleaningCurse';
      const haterCurse = item.value === 'forceHaterCurse';
      const givaldoCurse = item.value === 'forceGivaldoCurse';
      let haterPhrases = null;
      if (haterCurse) {
        if (!Array.isArray(body.haterPhrases) || body.haterPhrases.length !== 6) throw new HttpError(400, 'Escreva exatamente seis frases para a Maldição do Hater.');
        haterPhrases = body.haterPhrases.map((phrase) => String(phrase || '').trim().replace(/\s+/g, ' '));
        if (haterPhrases.some((phrase) => !phrase || Array.from(phrase).length > 110)) throw new HttpError(400, 'Cada frase deve ter entre 1 e 110 caracteres. Emojis são aceitos.');
        const uniquePhrases = new Set(haterPhrases.map((phrase) => phrase.toLocaleLowerCase('pt-BR')));
        if (uniquePhrases.size !== 6) throw new HttpError(400, 'As seis frases precisam ser diferentes.');
      }
      // As três maldições de cursor duram 24 horas. Só os poderes que afetam
      // o sorteio dependem de rodada; a Seta Gay não escolhe o Gay da Rodada.
      const targetPool = giant || adhd || gayCursor || devDarkness || cleaningCurse || haterCurse || givaldoCurse ? db.users.filter((person) => person.active && person.approved !== false) : eligibleUsers();
      const target = targetPool.find((person) => person.id === body.targetId);
      if (!target) throw new HttpError(404, 'Participante ativo não encontrado.');
      // Toda maldição de cursor é enviada a outra pessoa. A validação é feita
      // no servidor também para que ninguém consiga se selecionar pela requisição.
      if (target.id === user.id) throw new HttpError(409, 'Esta maldição deve ser enviada para outra pessoa. Seu poder não foi consumido.');
      if (giant && [...db.draws].reverse().find((draw) => draw.type === 'gay' && !isVisualPunishmentCleared(draw.createdAt, db.settings.visualThemeClearedAt))?.winnerId === target.id) throw new HttpError(409, 'O sorteado está com cursor obrigatório. Escolha outro participante; seu poder não foi consumido.');
      if (db.economy.forcedCursors.some((entry) => entry.targetUserId === target.id && isForcedCursorActive(entry, roundId))) {
        throw new HttpError(409, 'Essa pessoa já está sob uma maldição ativa. Nenhuma nova maldição foi enviada e seu poder não foi consumido.');
      }
      const sealed = body.sealed === true;
      if (!availablePowerPurchases(user.id, item.id).some((purchase) => Boolean(purchase.sealed) === sealed)) throw new HttpError(409, sealed ? 'Compre esta maldição na versão sem Antídoto por 5.000 Créditos 51 antes de enviá-la. Seu poder não foi consumido.' : 'Compre a versão normal desta maldição antes de enviá-la. Seu poder não foi consumido.');
      targetedCurseTarget = target;
      targetedCurseExpiresAt = new Date(Date.now() + 86400000).toISOString();
      consumePower(user.id, item.id, { roundId, targetId: target.id, sealed });
      const curseRecord = {
        id: randomUUID(), roundId: null, expiresAt: targetedCurseExpiresAt, targetUserId: target.id, targetName: target.displayName,
        style: giant ? 'giant-slow' : adhd ? 'adhd' : devDarkness ? 'dev-dark' : cleaningCurse ? 'cleaning' : haterCurse ? 'hater' : givaldoCurse ? 'givaldo' : 'gay',
        ...(haterPhrases ? { phrases: haterPhrases } : {}),
        usedByUserId: user.id, usedByName: user.displayName, createdAt: new Date().toISOString(), sealed,
      };
      db.economy.forcedCursors.push(curseRecord);
      targetedCurseId = curseRecord.id;
      if (Date.parse(curseRecord.createdAt) >= Date.parse(db.settings.cursePowersReleasedAt || '9999-12-31')) db.economy.curseHistory.push({ id: curseRecord.id, targetUserId: target.id, targetName: target.displayName, senderUserId: user.id, senderName: user.displayName, style: curseRecord.style, createdAt: curseRecord.createdAt, expiresAt: curseRecord.expiresAt, sealed });
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
    const announcementRoundId = db.settings.currentRoundId || roundId;
    const secretTargetedCurse = ['forceGayCursor', 'forceGiantCursor', 'forceAdhdCursor', 'forceDevDarkness', 'forceCleaningCurse', 'forceHaterCurse', 'forceGivaldoCurse'].includes(item.value);
    if (secretTargetedCurse) {
      db.economy.powerAnnouncements.push({ id: randomUUID(), roundId: announcementRoundId, itemId: item.id, itemName: item.name, activatedByUserId: user.id, secretTargetedCurse, curseId: targetedCurseId, targetUserId: secretTargetedCurse ? targetedCurseTarget?.id || null : null, targetName: secretTargetedCurse ? targetedCurseTarget?.displayName || null : null, expiresAt: secretTargetedCurse ? targetedCurseExpiresAt : null, createdAt: new Date().toISOString() });
      db.economy.powerAnnouncements = db.economy.powerAnnouncements.slice(-100);
    }
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(user), ...(curseAuthorReveal ? { curseAuthorReveal } : {}) }); return;
  }

  if (req.method === 'POST' && route === '/api/powers/cancel') {
    const { user } = requireAuth(req); const body = await readJson(req); const roundId = db.settings.currentRoundId;
    if (!roundId || db.draws.some((draw) => draw.type === 'gay' && draw.roundId === roundId)) throw new HttpError(409, 'Este poder já não pode ser cancelado nesta rodada.');
    const allowed = ['power-choose-gay'];
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
    requireAuth(req);
    throw new HttpError(409, 'O registro de água é definitivo e não pode ser removido.');
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
    const closedAt = new Date().toISOString();
    if (db.dailyMemes.length || db.dailyPhrases.length) {
      const archivedIds = new Set([...db.dailyMemes, ...db.dailyPhrases].map((item) => item.id));
      db.dailyWallHistory.push({
        id: randomUUID(), closedAt, closedByName: user.displayName,
        memes: db.dailyMemes, phrases: db.dailyPhrases,
        reactions: db.dailyReactions.filter((item) => archivedIds.has(item.targetId)),
      });
      db.dailyReactions = db.dailyReactions.filter((item) => !archivedIds.has(item.targetId));
    }
    db.dailyMemes = [];
    db.dailyPhrases = [];
    db.settings.dailyPhrase = '';
    db.settings.dailyPhraseUpdatedAt = null;
    db.settings.dailyPhraseUpdatedBy = null;
    db.settings.lastCleanupAt = closedAt;
    await persist(); broadcastRefresh('daily-wall'); json(res, 200, stateFor(user)); return;
  }

  const dailyWallHistoryMatch = route.match(/^\/api\/daily-wall\/history\/([^/]+)$/);
  if (req.method === 'GET' && dailyWallHistoryMatch) {
    requireAuth(req);
    const archive = db.dailyWallHistory.find((item) => item.id === dailyWallHistoryMatch[1]);
    if (!archive) throw new HttpError(404, 'Esta edição não foi encontrada no histórico.');
    const reactionSummary = (type, id) => {
      const entries = (archive.reactions || []).filter((item) => item.targetType === type && item.targetId === id);
      return Object.fromEntries(WALL_EMOJIS.map((emoji) => [emoji, entries.filter((item) => item.emoji === emoji).length]));
    };
    json(res, 200, {
      id: archive.id, closedAt: archive.closedAt, closedByName: archive.closedByName,
      phrases: (archive.phrases || []).map((item) => ({ id: item.id, userId: item.userId, phrase: item.phrase, authorName: item.authorName, anonymous: Boolean(item.anonymous), createdAt: item.createdAt, reactions: reactionSummary('phrase', item.id) })),
      memes: (archive.memes || []).map((item) => ({ id: item.id, userId: item.userId, imageUrl: '/memes/' + item.filename, caption: item.caption || '', authorName: item.authorName, anonymous: Boolean(item.anonymous), createdAt: item.createdAt, reactions: reactionSummary('meme', item.id) })),
    }); return;
  }

  if (req.method === 'GET' && route === '/api/my-wallpaper') {
    const { user } = requireAuth(req);
    const roundId = db.settings.currentRoundId;
    const gayDraw = [...db.draws].reverse().find((item) => item.type === 'gay' && item.roundId === roundId && !item.pendingShield);
    if (!gayDraw) throw new HttpError(409, 'O download do wallpaper será liberado depois do sorteio do Gay da Rodada.');
    if (gayDraw?.winnerUserId === user.id) {
      if (!gayDraw.watermarkedFilename) throw new HttpError(409, 'Seu wallpaper com a logo ainda não foi gerado. Use “Gerar wallpaper com logo” no resultado do sorteio.');
      await serveMemoryImage(res, gayDraw.watermarkedFilename, 'gay-da-rodada-' + String(gayDraw.winner || 'wallpaper') + (gayDraw.watermarkedFilename.endsWith('.jpg') ? '.jpg' : '.png')); return;
    }
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
    // O adaptador do Cloudflare não mantém este stream Node aberto. Responder
    // 204 faz clientes antigos interromperem a reconexão automática a cada 2s.
    if (runtimeEnv) {
      res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
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
    if (settleWallpaperDeadline()) { await persist(); broadcastRefresh('wallpaper-deadline'); }
    if (user.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Aguarde o administrador sortear o tema antes de enviar.');
    if (!eligibleUsers().some((item) => item.id === user.id)) throw new HttpError(403, 'Sua conta entrará somente na próxima rodada.');
    if (db.assignments.some((item) => item.roundId === roundId)) throw new HttpError(409, 'Os envios foram encerrados porque a distribuição já começou.');
    if (db.submissions.some((item) => item.roundId === roundId && item.userId === user.id))
      throw new HttpError(409, 'Seu wallpaper desta rodada já foi confirmado e não pode ser removido ou trocado.');
    const uploadKey = roundId + ':' + user.id;
    if (wallpaperUploadsInFlight.has(uploadKey)) throw new HttpError(409, 'O envio deste wallpaper já está em andamento. Aguarde a confirmação.');
    wallpaperUploadsInFlight.add(uploadKey);
    try {
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
    } finally { wallpaperUploadsInFlight.delete(uploadKey); }
  }

  if (req.method === 'POST' && route === '/api/admin/uploads') {
    const { user: admin } = requireAdmin(req);
    if (settleWallpaperDeadline()) { await persist(); broadcastRefresh('wallpaper-deadline'); }
    if (admin.mustChangePassword) throw new HttpError(403, 'Troque a senha inicial primeiro.');
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Sorteie o tema antes de enviar por outra pessoa.');
    if (db.assignments.some((item) => item.roundId === roundId)) throw new HttpError(409, 'Os envios foram encerrados porque a distribuição já começou.');
    const { targetUserId = '', dataUrl = '' } = await readJson(req);
    const target = eligibleUsers().find((item) => item.id === String(targetUserId));
    if (!target) throw new HttpError(404, 'Esta pessoa não participa da rodada atual.');
    if (db.submissions.some((item) => item.roundId === roundId && item.userId === target.id))
      throw new HttpError(409, 'O wallpaper desta pessoa já foi confirmado e não pode ser removido ou trocado.');
    const uploadKey = roundId + ':' + target.id;
    if (wallpaperUploadsInFlight.has(uploadKey)) throw new HttpError(409, 'O envio do wallpaper desta pessoa já está em andamento.');
    wallpaperUploadsInFlight.add(uploadKey);
    try {
    const { image, mimeType, extension } = decodeWallpaperDataUrl(dataUrl);
    const usedMemory = [...imageStore.values()].reduce((total, entry) => total + entry.buffer.length, 0);
    if (usedMemory + image.length > MAX_IMAGE_MEMORY) throw new HttpError(507, 'O limite de 200 MB de imagens desta rodada foi atingido.');
    const filename = randomUUID() + '.' + extension;
    await storeImage(filename, image, mimeType);
    const anonymousCode = randomBytes(2).toString('hex').toUpperCase();
    db.submissions.push({ id: randomUUID(), roundId, userId: target.id, uploader: target.displayName,
      title: 'Wallpaper ' + anonymousCode, filename, mimeType, size: image.length, active: true,
      uploadedByAdminId: admin.id, uploadedByAdminName: admin.displayName, createdAt: new Date().toISOString() });
    await persist(); broadcastRefresh('submissions'); json(res, 201, stateFor(admin)); return;
    } finally { wallpaperUploadsInFlight.delete(uploadKey); }
  }

  const deleteMatch = route.match(/^\/api\/uploads\/([a-f0-9-]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    requireAuth(req);
    throw new HttpError(409, 'O wallpaper confirmado não pode ser removido ou trocado nesta rodada.');
  }

  if (req.method === 'POST' && route === '/api/draw/gay-shield') {
    const { user } = requireAuth(req);
    const body = await readJson(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Aguarde o sorteio ao vivo terminar antes de decidir sobre o Escudo.');
    const pending = db.economy.pendingGayDraw;
    if (!pending || pending.roundId !== db.settings.currentRoundId) throw new HttpError(409, 'Não há uma decisão de Escudo pendente.');
    if (body.pendingId && body.pendingId !== pending.id) throw new HttpError(409, 'Esta decisão de Escudo já foi atualizada.');
    if (pending.currentCandidateId !== user.id) throw new HttpError(403, 'Somente a pessoa sorteada pode decidir sobre o Escudo.');
    const action = String(body.action || '').toLowerCase();
    if (!['use', 'decline'].includes(action)) throw new HttpError(400, 'Informe se deseja usar ou manter o resultado.');
    const participants = eligibleUsers();
    const assignments = db.assignments.filter((item) => item.roundId === pending.roundId && item.revealed);
    const submissions = db.submissions.filter((item) => item.active && item.roundId === pending.roundId);
    if (!participants.length || assignments.length !== participants.length || submissions.length < 2) throw new HttpError(409, 'A rodada mudou e o sorteio precisa ser refeito.');
    const participantById = new Map(participants.map((item) => [item.id, item]));
    let winner = participantById.get(pending.currentCandidateId);
    if (!winner) throw new HttpError(409, 'A pessoa sorteada não participa mais da rodada.');
    if (action === 'use') {
      if (!shieldAvailableFor(user.id)) throw new HttpError(409, 'Seu Escudo da Rodada não está mais disponível no inventário.');
      consumePower(user.id, 'power-shield-gay', { roundId: pending.roundId, pendingGayId: pending.id, rerolled: true });
      db.economy.powerAnnouncements.push({ id: randomUUID(), roundId: pending.roundId, itemId: 'power-shield-gay', itemName: 'Escudo da Rodada usado', activatedByUserId: user.id, createdAt: new Date().toISOString() });
      db.economy.powerAnnouncements = db.economy.powerAnnouncements.slice(-100);
      if (db.economy.forcedGay?.roundId === pending.roundId) db.economy.forcedGay = null;
      pending.protectedIds = [...new Set([...(pending.protectedIds || []), user.id])];
      pending.remainingCandidateIds = (pending.remainingCandidateIds || []).filter((id) => id !== user.id);
      pending.forcedTargetId = null;
      const nextCandidates = pending.remainingCandidateIds.map((id) => participantById.get(id)).filter(Boolean);
      winner = chooseGayCandidate(nextCandidates);
      // Se todos tinham escudo, todos foram consumidos e o último protegido
      // vira o desempate inevitável, sem deixar a rodada travada.
      if (!winner) {
        const fallback = (pending.protectedIds || []).map((id) => participantById.get(id)).filter(Boolean);
        winner = chooseGayCandidate(fallback);
      }
      if (!winner) throw new HttpError(409, 'Não foi possível encontrar outro participante para o sorteio.');
    }
    if (action === 'use' && shieldAvailableFor(winner.id)) {
      pending.currentCandidateId = winner.id;
      pending.currentCandidateName = winner.displayName;
      pending.updatedAt = new Date().toISOString();
      const result = makePendingGayResult(pending, winner);
      const startedDraw = startLiveDraw(result, participants, false);
      await persist();
      broadcastRefresh('gay-shield-used:' + user.displayName);
      respondLiveDraw(res, user, startedDraw); return;
    }
    const result = makeGayDrawResult({ roundId: pending.roundId, participants, assignments, submissions, winner, drawnBy: pending.drawnBy });
    const startedDraw = startLiveDraw(result, participants, false);
    await persist();
    if (action === 'use') broadcastRefresh('gay-shield-used:' + user.displayName);
    respondLiveDraw(res, user, startedDraw); return;
  }

  const gayWatermarkMatch = route.match(/^\/api\/draw\/gay-watermark\/([a-f0-9-]+)$/);
  if (req.method === 'GET' && gayWatermarkMatch) {
    const { user } = requireAuth(req);
    const draw = db.draws.find((item) => item.id === gayWatermarkMatch[1] && item.type === 'gay');
    if (!draw?.watermarkedFilename) throw new HttpError(404, 'O cartão marcado ainda não foi gerado.');
    if (user.role !== 'admin' && draw.winnerUserId !== user.id) throw new HttpError(403, 'Este download pertence ao sorteado.');
    await serveMemoryImage(res, draw.watermarkedFilename, 'gay-da-rodada-' + String(draw.winner || 'wallpaper') + (draw.watermarkedFilename.endsWith('.jpg') ? '.jpg' : '.png')); return;
  }

  if (req.method === 'POST' && route === '/api/draw/gay-watermark') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const draw = db.draws.find((item) => item.id === String(body.drawId || '') && item.type === 'gay');
    if (!draw) throw new HttpError(404, 'Sorteio do Gay da Rodada não encontrado.');
    if (user.role !== 'admin' && draw.winnerUserId !== user.id) throw new HttpError(403, 'Somente o sorteado pode gerar este download.');
    const { image, mimeType } = decodeWallpaperDataUrl(body.dataUrl);
    const filename = 'gay-card-' + draw.id + (mimeType === 'image/jpeg' ? '.jpg' : '.png');
    await storeImage(filename, image, mimeType);
    draw.watermarkedFilename = filename;
    draw.watermarkedAt = new Date().toISOString();
    await persist();
    json(res, 200, { watermarkedUrl: '/api/draw/gay-watermark/' + encodeURIComponent(draw.id), extension: mimeType === 'image/jpeg' ? 'jpg' : 'png' }); return;
  }

  if (req.method === 'POST' && route === '/api/draw') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Já existe um sorteio ao vivo em andamento.');
    const { type } = await readJson(req);
    let candidates;
    let result;
    if (type === 'theme') {
      if (db.settings.currentRoundId) throw new HttpError(409, 'Encerre a rodada atual antes de sortear outro tema.');
      const allThemes = db.settings.themes.map((item) => String(item).trim()).filter(Boolean);
      const finalists = db.settings.themeFinalists || [];
      if (allThemes.length < 3) throw new HttpError(400, 'Cadastre ao menos 3 temas para formar os finalistas.');
      candidates = finalists.length >= 3 ? finalists : allThemes.filter((item) => !finalists.includes(item) && item !== db.settings.lastWinningTheme);
      if (finalists.length < 3 && candidates.length < 3) throw new HttpError(400, 'Cadastre pelo menos 4 temas para não repetir o tema vencedor da semana anterior.');
      const winner = candidates[randomInt(candidates.length)];
      if (finalists.length < 3) {
        db.settings.themeFinalists = [...finalists, winner];
        result = { id: randomUUID(), type: 'theme', winnerId: winner, winner,
          detail: 'Finalista ' + (finalists.length + 1) + ' de 3', imageUrl: '/gay-da-rodada.png', roundId: null,
          roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString(), themeStage: 'finalist' };
      } else {
        const roundParticipants = eligibleUsers();
        if (!roundParticipants.length) throw new HttpError(400, 'Não há participantes ativos para iniciar a rodada.');
        const roundId = randomUUID();
        db.settings.currentRoundId = roundId;
        db.settings.currentTheme = winner;
        db.settings.currentParticipantIds = roundParticipants.map((item) => item.id);
        db.settings.currentParticipantsLocked = false;
        db.settings.currentRoundRecoveredAt = null;
        db.settings.lastWinningTheme = winner;
        db.settings.themeFinalists = [];
        result = { id: randomUUID(), type: 'theme', winnerId: winner, winner,
          detail: 'Tema vencedor da rodada', imageUrl: '/gay-da-rodada.png', roundId,
          roundName: db.settings.roundName, drawnBy: user.displayName, createdAt: new Date().toISOString(), themeStage: 'winner' };
      }
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
      const context = gayDrawContext(roundId);
      const { participants, assignments, submissions } = context;
      candidates = context.candidates;
      const winner = chooseGayCandidate(candidates, context.forcedGay?.targetId);
      if (!winner) throw new HttpError(409, 'Não foi possível encontrar um participante para o sorteio.');
      if (shieldAvailableFor(winner.id)) {
        const pending = {
          id: randomUUID(), roundId, currentCandidateId: winner.id, currentCandidateName: winner.displayName,
          remainingCandidateIds: candidates.map((candidate) => candidate.id).filter((id) => id !== winner.id),
          protectedIds: [], forcedTargetId: context.forcedGay?.targetId || null,
          drawnBy: user.displayName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        db.economy.pendingGayDraw = pending;
        result = makePendingGayResult(pending, winner);
        const startedDraw = startLiveDraw(result, participants, false);
        await persist();
        respondLiveDraw(res, user, startedDraw); return;
      }
      result = makeGayDrawResult({ roundId, participants, assignments, submissions, winner, drawnBy: user.displayName });
    } else throw new HttpError(400, 'Tipo de sorteio inválido.');
    db.draws.push(result);
    // No Worker os participantes podem cair em instâncias diferentes. Grave o
    // sorteio antes de avisar a interface para o polling enxergar a mesma roda.
    const startedDraw = startLiveDraw(result, candidates, false);
    await persist();
    respondLiveDraw(res, user, startedDraw); return;
  }

  if (req.method === 'POST' && route === '/api/vote') {
    const { user } = requireAuth(req);
    const { bestId, worstId } = await readJson(req);
    const voting = openVoting();
    if (!voting) {
      const confirmed = [...db.votings].reverse().some((item) => item.submissionIds?.includes(bestId) && item.submissionIds?.includes(worstId) && item.votes?.some((vote) => vote.userId === user.id && vote.bestId === bestId && vote.worstId === worstId));
      if (confirmed) { json(res, 200, stateFor(user)); return; }
      throw new HttpError(409, 'Não há votação aberta neste momento.');
    }
    if (!voting.requiredVoterIds.includes(user.id)) throw new HttpError(403, 'Sua conta não está elegível para esta votação.');
    const previousVote = voting.votes.find((vote) => vote.userId === user.id);
    if (previousVote) {
      if (previousVote.bestId === bestId && previousVote.worstId === worstId) { json(res, 200, stateFor(user)); return; }
      throw new HttpError(409, 'Seu voto já foi registrado.');
    }
    if (bestId === worstId) throw new HttpError(400, 'Escolha wallpapers diferentes para melhor e pior.');
    if (!voting.submissionIds.includes(bestId) || !voting.submissionIds.includes(worstId)) {
      throw new HttpError(400, 'Escolha duas opções válidas desta votação.');
    }
    const ownSubmissionIds = new Set(db.submissions.filter((submission) => submission.roundId === voting.roundId && submission.userId === user.id).map((submission) => submission.id));
    if (ownSubmissionIds.has(bestId) || ownSubmissionIds.has(worstId)) throw new HttpError(400, 'Você não pode votar no próprio wallpaper.');
    voting.votes.push({ userId: user.id, bestId, worstId, createdAt: new Date().toISOString() });
    awardEngagementCard(db,user.id,'vote',saoPauloDayKey(),Math.random,engagementCardOptions());
    recordActivity(user.id, 'vote');
    rewardDailyMissions(user.id);
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

  if (req.method === 'PATCH' && route === '/api/admin/round/participants') {
    const { user } = requireAdmin(req);
    const body = await readJson(req);
    const roundId = db.settings.currentRoundId;
    if (!roundId || !db.settings.currentTheme) throw new HttpError(409, 'Sorteie o tema antes de ajustar os participantes.');
    if (db.settings.currentParticipantsLocked || db.assignments.some((item) => item.roundId === roundId) || db.votings.some((item) => item.roundId === roundId)) throw new HttpError(409, 'A lista já foi fechada porque a distribuição ou votação começou.');
    const target = db.users.find((item) => item.id === body.userId && item.active && item.approved !== false);
    if (!target) throw new HttpError(404, 'Participante ativo não encontrado.');
    const submitted = db.submissions.some((item) => item.active && item.roundId === roundId && item.userId === target.id);
    if (submitted) throw new HttpError(409, 'Essa pessoa já enviou wallpaper e não pode ser removida ou alterada agora.');
    if (typeof body.included !== 'boolean') throw new HttpError(400, 'Informe included como true ou false.');
    const participantIds = new Set(db.settings.currentParticipantIds || []);
    if (body.included) participantIds.add(target.id); else participantIds.delete(target.id);
    if (!participantIds.size) throw new HttpError(409, 'Mantenha pelo menos uma pessoa na rodada.');
    db.settings.currentParticipantIds = [...participantIds];
    await persist(); broadcastRefresh('participants-updated'); json(res, 200, stateFor(user)); return;
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
      db.settings.themeFinalists = [];
      db.settings.lastWinningTheme = null;
    }
    if (body.roundSchedule && typeof body.roundSchedule === 'object') {
      const cleanDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
      db.settings.roundSchedule = { submissionsAt: cleanDate(body.roundSchedule.submissionsAt), drawAt: cleanDate(body.roundSchedule.drawAt), voteAt: cleanDate(body.roundSchedule.voteAt) };
    }
    await persist(); broadcastRefresh('settings'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/visual-theme/clear') {
    const { user } = requireAdmin(req);
    db.settings.visualThemeClearedAt = new Date().toISOString();
    await persist(); broadcastRefresh('visual-theme-cleared'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'PATCH' && route === '/api/admin/features') {
    const { user } = requireAdmin(req); const body = await readJson(req); const incoming = body.flags || {};
    const next = featureFlags();
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
    db.settings.featureFlags = next;
    await persist(); broadcastRefresh('features'); json(res, 200, stateFor(user)); return;
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
    db.settings.lastBackupAt = new Date().toISOString();
    await persist();
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
    db.feedbackMessages ||= []; db.dailyMemes ||= []; db.dailyPhrases ||= []; db.dailyReactions ||= []; db.dailyWallHistory ||= [];
    db.anonymousPosts ||= []; db.waterEntries ||= []; db.rememberTokens ||= []; db.lieAccusations ||= []; db.mysteries ||= [];
    db.notificationsReadAt ||= {}; db.economy.wallets ||= {}; db.economy.purchases ||= [];
    db.economy.equipped ||= {}; db.economy.missionProgress ||= {}; db.economy.missionRewards ||= [];
    db.economy.dailyMissionRewards ||= []; db.economy.cleanNameRewards ||= [];
    db.economy.teamMissionRewards ||= []; db.economy.seasonChallengeRewards ||= []; db.economy.seasonChampionRewards ||= []; db.economy.seasonChampionSnapshots ||= []; db.economy.gifts ||= []; db.economy.activityTotals ||= {};
    db.economy.powerUses ||= []; db.economy.shields ||= []; db.economy.authorReveals ||= [];
    db.economy.creditAdjustments ||= []; db.economy.bulkCreditGrants ||= []; db.economy.casinoBulkBonusGrants ||= []; db.economy.forcedCursors ||= [];
    db.economy.mysteryBoxes ||= []; db.economy.casinoPlays ||= []; db.economy.casinoAccounts ||= {}; db.economy.lottery ||= { rounds: [], entries: [] }; db.economy.lottery.rounds ||= []; db.economy.lottery.entries ||= [];
    db.settings.roundSchedule ||= { submissionsAt: '', drawAt: '', voteAt: '' };
    db.settings.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...db.settings.featureFlags };
    db.settings.lastBackupAt ||= null; db.settings.lastCleanupAt ||= null;
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

  if (req.method === 'POST' && route === '/api/admin/credits/bulk') {
    const { user: admin } = requireAdmin(req); const body = await readJson(req);
    const amount = parseMoney(body.amount, { min: 0.01, max: 100000 });
    if (amount === null) throw new HttpError(400, 'Informe um bônus entre 0,01 e 100.000 créditos, com no máximo duas casas decimais.');
    const grantId = String(body.grantId || '').trim();
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(grantId)) throw new HttpError(400, 'Identificador do bônus inválido. Tente novamente.');
    const previous = (db.economy.bulkCreditGrants || []).find((entry) => entry.id === grantId);
    if (previous) { json(res, 200, { ...stateFor(admin), bulkGrant: previous, duplicate: true }); return; }
    const targets = db.users.filter((person) => person.active && person.approved !== false);
    if (!targets.length) throw new HttpError(409, 'Não há contas ativas para receber o bônus.');
    const reason = String(body.reason || '').trim().slice(0, 120) || 'Bônus coletivo para investimento no Mercado 51';
    const createdAt = new Date().toISOString();
    targets.forEach((target) => {
      const before = walletFor(target.id); addCredits(target.id, amount);
      db.economy.creditAdjustments.push({ id: randomUUID(), adminId: admin.id, adminName: admin.displayName, userId: target.id, mode: 'bulk-add', amount, before, after: walletFor(target.id), reason, batchId: grantId, createdAt });
    });
    if (db.economy.creditAdjustments.length > 1000) db.economy.creditAdjustments = db.economy.creditAdjustments.slice(-1000);
    const bulkGrant = { id: grantId, amount, reason, recipientCount: targets.length, total: roundMoney(amount * targets.length), adminId: admin.id, adminName: admin.displayName, createdAt };
    db.economy.bulkCreditGrants.push(bulkGrant);
    if (db.economy.bulkCreditGrants.length > 1000) db.economy.bulkCreditGrants = db.economy.bulkCreditGrants.slice(-1000);
    await persist(); broadcastRefresh('economy'); json(res, 200, { ...stateFor(admin), bulkGrant, duplicate: false }); return;
  }

  if (req.method === 'POST' && route === '/api/admin/casino/bonus/bulk') {
    const { user: admin } = requireAdmin(req); const body = await readJson(req);
    const amount = parseMoney(body.amount, { min: 0.01, max: 100000 });
    if (amount === null) throw new HttpError(400, 'Informe um bônus entre 0,01 e 100.000 créditos, com no máximo duas casas decimais.');
    const grantId = String(body.grantId || '').trim();
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(grantId)) throw new HttpError(400, 'Identificador do bônus inválido. Tente novamente.');
    const previous = (db.economy.casinoBulkBonusGrants || []).find((entry) => entry.id === grantId);
    if (previous) { json(res, 200, { ...stateFor(admin), casinoBulkBonusGrant: previous, duplicate: true }); return; }
    const targets = db.users.filter((person) => person.active && person.approved !== false);
    if (!targets.length) throw new HttpError(409, 'Não há contas ativas para receber o bônus.');
    const createdAt = new Date().toISOString(); const dayKey = saoPauloDayKey(); const recipients = [];
    targets.forEach((target) => {
      const account = casinoAccountFor(target.id, true);
      const beforeBalance = roundMoney(account.balance);
      const beforeThreshold = casinoCashoutThresholdForAccount(account);
      const wasCashedOut = Boolean(account.cashedOut);
      const startsCollectiveBank = wasCashedOut || beforeBalance <= 0;
      account.balance = roundMoney(beforeBalance + amount);
      // Banca zerada ou sacada começa uma meta nova; saldo restante mantém a
      // meta anterior e acrescenta o dobro do bônus recebido.
      account.cashoutThreshold = startsCollectiveBank ? roundMoney(amount * 2) : roundMoney(beforeThreshold + amount * 2);
      account.cashedOut = false;
      delete account.cashedOutAt; delete account.cashedOutAmount;
      account.lastCollectiveBonusAt = createdAt;
      recipients.push({ userId: target.id, beforeBalance, afterBalance: account.balance, beforeThreshold, cashoutThreshold: account.cashoutThreshold, reopened: wasCashedOut, freshCollectiveBank: startsCollectiveBank });
    });
    const casinoBulkBonusGrant = { id: grantId, amount, recipientCount: targets.length, total: roundMoney(amount * targets.length), dayKey, adminId: admin.id, adminName: admin.displayName, createdAt, recipients, notifyRecipients: true };
    db.economy.casinoBulkBonusGrants.push(casinoBulkBonusGrant);
    if (db.economy.casinoBulkBonusGrants.length > 1000) db.economy.casinoBulkBonusGrants = db.economy.casinoBulkBonusGrants.slice(-1000);
    await persist(); broadcastRefresh('casino-bonus'); json(res, 200, { ...stateFor(admin), casinoBulkBonusGrant, duplicate: false }); return;
  }

  const creditMatch = route.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/credits$/);
  if (req.method === 'POST' && creditMatch) {
    const { user: admin } = requireAdmin(req);
    const target = db.users.find((item) => item.id === creditMatch[1]);
    if (!target) throw new HttpError(404, 'Usuário não encontrado.');
    const body = await readJson(req);
    const amount = parseMoney(body.amount, { min: 0, max: 100000 });
    if (amount === null) throw new HttpError(400, 'Informe um valor entre 0 e 100.000 créditos, com no máximo duas casas decimais.');
    const mode = ['add', 'remove', 'set'].includes(body.mode) ? body.mode : 'add';
    const before = walletFor(target.id);
    const after = mode === 'set' ? amount : mode === 'remove' ? roundMoney(Math.max(0, before - amount)) : roundMoney(before + amount);
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
    sanitizePendingLieVoters();
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
    await runtimeEnv.DB.prepare('DELETE FROM casino_play_archive WHERE user_id = ?').bind(target.id).run();
    delete db.economy.casinoAccounts[target.id];
    db.economy.lottery.entries = (db.economy.lottery.entries || []).filter((item) => item.userId !== target.id);
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
    const { user } = requireAdmin(req); const body = await readJson(req, 11 * 1024 * 1024);
    const title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    const message = String(body.message || '').trim().replace(/\r\n/g, '\n').slice(0, 700);
    let imageFilename = null;
    if (body.imageDataUrl) {
      const { image, mimeType, extension } = decodeWallpaperDataUrl(body.imageDataUrl);
      imageFilename = 'announcement-' + randomUUID() + '.' + extension;
      await storeImage(imageFilename, image, mimeType);
    }
    if (!imageFilename && (title.length < 3 || message.length < 3)) throw new HttpError(400, 'Escreva título e mensagem ou envie uma imagem para publicar o aviso.');
    const previous = db.settings.announcement;
    db.settings.announcement = { id: randomUUID(), title, message, imageFilename, createdAt: new Date().toISOString(), createdBy: user.displayName, seenUserIds: [] };
    if (previous?.imageFilename) await deleteStoredImage(previous.imageFilename);
    await persist(); broadcastRefresh('announcement'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'DELETE' && route === '/api/admin/announcement') {
    const { user } = requireAdmin(req); const previous = db.settings.announcement; db.settings.announcement = null;
    if (previous?.imageFilename) await deleteStoredImage(previous.imageFilename);
    await persist(); broadcastRefresh('announcement'); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/announcement/seen') {
    const { user } = requireAuth(req); const body = await readJson(req);
    const announcement = db.settings.announcement;
    if (announcement && announcement.id === body.id && !announcement.seenUserIds.includes(user.id)) announcement.seenUserIds.push(user.id);
    await persist(); json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/theme-draw/reset') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Aguarde o sorteio ao vivo terminar.');
    const roundId = db.settings.currentRoundId;
    const theme = db.settings.currentTheme;
    if (!roundId || !theme) throw new HttpError(409, 'Não existe um tema sorteado para limpar.');
    const hasSubmissions = db.submissions.some((item) => item.active && item.roundId === roundId);
    const hasAssignments = db.assignments.some((item) => item.roundId === roundId);
    const hasVoting = db.votings.some((item) => item.roundId === roundId);
    const hasPenalty = (db.economy.wallpaperDeadlinePenalties || []).some((item) => item.roundId === roundId && !item.clearedAt);
    if (hasSubmissions || hasAssignments || hasVoting || hasPenalty) {
      throw new HttpError(409, 'O tema só pode ser limpo antes do primeiro envio e antes de qualquer punição da rodada.');
    }
    db.draws = db.draws.filter((item) => !(item.type === 'theme' && item.roundId === roundId));
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    db.settings.themeFinalists = [];
    await persist();
    broadcastRefresh('theme-draw-reset:' + user.displayName);
    json(res, 200, stateFor(user)); return;
  }

  if (req.method === 'POST' && route === '/api/admin/clear-history') {
    const { user } = requireAdmin(req);
    if (liveDraw && liveDraw.endsAt > Date.now()) throw new HttpError(409, 'Aguarde o sorteio ao vivo terminar antes de limpar o histórico.');
    const historyImages = [...db.submissions];
    db.submissions = [];
    db.assignments = [];
    db.draws = [];
    db.votings = [];
    db.economy.pendingGayDraw = null;
    db.scores = {};
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    db.settings.themeFinalists = [];
    db.settings.visualThemeClearedAt = new Date().toISOString();
    db.settings.lastCleanupAt = new Date().toISOString();
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

  if (req.method === 'POST' && route === '/api/admin/reset-my-casino-tests') {
    const { user } = requireAdmin(req);
    const manualCredit = [...db.economy.creditAdjustments].reverse().find((entry) => entry.userId === user.id && entry.adminId === user.id && Number(entry.amount) === 99999 && ['add', 'set'].includes(entry.mode));
    if (!manualCredit) throw new HttpError(404, 'Não encontrei a entrada manual de 99.999 créditos para remover.');
    const testStartedAt = String(manualCredit.createdAt || '');
    const testPlays = db.economy.casinoPlays.filter((entry) => entry.userId === user.id && String(entry.createdAt || '') >= testStartedAt);
    const shopNet = testPlays.filter((entry) => entry.walletSource === 'shop').reduce((sum, entry) => sum + Number(entry.net || 0), 0);
    const before = walletFor(user.id);
    const after = Math.max(0, before - 99999 - shopNet);
    db.economy.wallets[user.id] = after;
    db.economy.creditAdjustments = db.economy.creditAdjustments.filter((entry) => entry.id !== manualCredit.id && !(entry.userId === user.id && String(entry.createdAt || '') >= testStartedAt && ['casino-shop', 'casino-cashout'].includes(entry.mode)));
    db.economy.casinoPlays = db.economy.casinoPlays.filter((entry) => !(entry.userId === user.id && String(entry.createdAt || '') >= testStartedAt));
    if (db.economy.globalFlight?.bets) db.economy.globalFlight.bets = db.economy.globalFlight.bets.filter((entry) => entry.userId !== user.id || String(entry.joinedAt || '') < testStartedAt);
    delete db.economy.casinoAccounts[user.id];
    await persist(); broadcastRefresh('economy');
    json(res, 200, { ...stateFor(user), removedCredits: 99999, removedPlays: testPlays.length, restoredShopNet: -shopNet }); return;
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
    db.economy.pendingGayDraw = null;
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
    const gayDraw = [...db.draws].reverse().find((item) => item.type === 'gay' && item.roundId === roundId);
    if (!gayDraw?.watermarkedFilename) throw new HttpError(409, 'Gere e salve o wallpaper com a logo do Gay da Rodada antes de limpar as imagens. A origem ainda é necessária.');
    const roundImages = db.submissions.filter((item) => item.roundId === roundId);
    roundImages.forEach((item) => { item.active = false; });
    await deleteStoredImages(roundImages);
    db.settings.currentRoundId = null;
    db.settings.currentTheme = null;
    db.settings.currentParticipantIds = [];
    db.settings.currentParticipantsLocked = false;
    db.settings.currentRoundRecoveredAt = null;
    db.settings.lastCleanupAt = new Date().toISOString();
    db.economy.pendingGayDraw = null;
    for (const penalty of (db.economy.wallpaperDeadlinePenalties || [])) if (!penalty.clearedAt) { penalty.clearedAt = db.settings.lastCleanupAt; penalty.clearedByUserId = user.id; }
    db.economy.forcedCursors = db.economy.forcedCursors.filter((item) => item.roundId !== roundId || item.expiresAt);
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.instagram.com https://www.tiktok.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
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
      const isCurrentAnnouncement = db.settings?.announcement?.imageFilename === filename;
      if ((!submission || !canViewSubmission(user, submission)) && !isCurrentAnnouncement) throw new HttpError(403, 'Esta imagem não está disponível para sua conta.');
      await serveMemoryImage(res, filename); return;
    }
    if (url.pathname.startsWith('/memes/')) {
      requireAuth(req);
      const filename = path.basename(decodeURIComponent(url.pathname.slice(7)));
      const meme = db.dailyMemes.find((item) => item.filename === filename) || db.dailyWallHistory.some((archive) => archive.memes?.some((item) => item.filename === filename));
      if (!meme) throw new HttpError(404, 'Este meme não está mais no mural.');
      await serveMemoryImage(res, filename); return;
    }
    if (url.pathname.startsWith('/feedback-images/')) {
      const { user } = requireAuth(req);
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/feedback-images/'.length)));
      const feedback = db.feedbackMessages.find((item) => item.imageFilename === filename);
      if (!feedback || (user.role !== 'admin' && feedback.authorId !== user.id)) throw new HttpError(403, 'Este anexo é privado.');
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
