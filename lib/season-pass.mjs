import { NEXT_CARD_SEASON } from './card-season-transition.mjs';

export const SEASON_PASS = Object.freeze({ id: NEXT_CARD_SEASON.id, name: NEXT_CARD_SEASON.name, startsAt: NEXT_CARD_SEASON.startsAt, endsAt: '2026-11-01T00:00:00-03:00', levels: 30, xpPerLevel: 80, premiumPrice: 590, activationEnabled: true });
// A trilha é concluível com participação constante, sem depender de compras
// ou de haver votação de wallpaper aberta em um determinado dia.
export const SEASON_PASS_XP = Object.freeze({ dailyMission: 10, weeklyMission: 60, crewChallenge: 150, firstBadgeCraft: 100 });

// Recompensas visuais apontam para itens reais e equipáveis do Perfil.
export const SEASON_PASS_COSMETIC_REWARDS = Object.freeze({
  'Título: Operador Blackstar': 'title-operador-blackstar',
  'Emblema da Operação': 'badge-operacao-blackstar',
  'Moldura Blackstar': 'frame-blackstar',
  'Rastro Táquion': 'trail-taquion',
  'Cursor Khepri': 'cursor-khepri',
  'Tema Premium: Câmara Vanta': 'site-camara-vanta',
});

const freeMilestones = new Map([[1,['Créditos 51',10]],[3,['Pacote Setor 51',1]],[5,['Créditos 51',20]],[8,['Pacote Setor 51',1]],[10,['Créditos 51',30]],[12,['Pacote Órbita',1]],[15,['Créditos 51',45]],[18,['Pacote Setor 51',2]],[20,['Créditos 51',60]],[23,['Pacote Órbita',1]],[25,['Créditos 51',75]],[27,['Pacote Núcleo',1]],[30,['Título: Operador Blackstar',1]]]);
const premiumMilestones = new Map([[1,['Emblema da Operação',1]],[4,['Pacote Setor 51',1]],[6,['Créditos 51',25]],[9,['Pacote Órbita',1]],[12,['Moldura Blackstar',1]],[15,['Créditos 51',50]],[18,['Pacote Órbita',2]],[21,['Rastro Táquion',1]],[24,['Pacote Núcleo',1]],[27,['Cursor Khepri',1]],[30,['Crédito de Renovação',590]]]);
const rewardAt = (level, premium) => { const value=(premium?premiumMilestones:freeMilestones).get(level); return value?{name:value[0],quantity:value[1]}:{name:'Fragmentos Blackstar',quantity:premium?3:1}; };

export function seasonPassPreview(xp=0,premium=false){
  const safeXp=Math.max(0,Math.min(SEASON_PASS.levels*SEASON_PASS.xpPerLevel,Math.floor(Number(xp)||0)));
  const level=Math.min(SEASON_PASS.levels,Math.floor(safeXp/SEASON_PASS.xpPerLevel));
  return {...SEASON_PASS,xp:safeXp,level,currentLevelXp:level>=SEASON_PASS.levels?SEASON_PASS.xpPerLevel:safeXp%SEASON_PASS.xpPerLevel,nextLevelXp:SEASON_PASS.xpPerLevel,premium,xpSources:SEASON_PASS_XP,tracks:Array.from({length:SEASON_PASS.levels},(_,index)=>{const itemLevel=index+1;return{level:itemLevel,unlocked:level>=itemLevel,free:rewardAt(itemLevel,false),premium:rewardAt(itemLevel,true)};})};
}

const XP_SOURCE_BY_KEY = Object.freeze({
  'daily-mission': SEASON_PASS_XP.dailyMission,
  'weekly-mission': SEASON_PASS_XP.weeklyMission,
  'crew-challenge': SEASON_PASS_XP.crewChallenge,
  'first-badge-craft': SEASON_PASS_XP.firstBadgeCraft,
});

export function passIsOpen(now = new Date()) {
  const time = now.getTime();
  return time >= Date.parse(SEASON_PASS.startsAt) && time < Date.parse(SEASON_PASS.endsAt);
}

export function ensureSeasonPassAccount(economy, userId) {
  economy.seasonPass ||= {};
  const account = economy.seasonPass[userId] ||= { seasons: {} };
  account.seasons ||= {};
  const season = account.seasons[SEASON_PASS.id] ||= {
    xp: 0, premium: false, fragments: 0, forged: [], xpEvents: {}, claimed: { free: [], premium: [] }, createdAt: new Date().toISOString(),
  };
  // Quem já resgatou níveis de fragmentos antes da Oficina recebe o saldo
  // correspondente uma única vez. Não estimamos por XP: só vale o que foi
  // efetivamente resgatado em cada trilha.
  if (!season.fragmentMigrationV1) {
    season.claimed ||= { free: [], premium: [] };
    const free = Array.isArray(season.claimed.free) ? season.claimed.free : [];
    const premium = Array.isArray(season.claimed.premium) ? season.claimed.premium : [];
    const historicalFragments = free.filter((level) => !freeMilestones.has(Number(level))).length + premium.filter((level) => !premiumMilestones.has(Number(level))).length * 3;
    season.fragments = Math.max(0, Math.floor(Number(season.fragments) || 0)) + historicalFragments;
    season.fragmentMigrationV1 = true;
  }
  return season;
}

export function awardSeasonPassXp(economy, userId, source, eventId, now = new Date()) {
  const amount = XP_SOURCE_BY_KEY[source];
  if (!amount) throw new Error('Fonte de XP inválida.');
  if (!eventId) throw new Error('Evento de XP inválido.');
  const account = ensureSeasonPassAccount(economy, userId);
  const key = `${source}:${eventId}`;
  if (account.xpEvents[key]) return { changed: false, xp: account.xp, amount: 0, key };
  const before = Math.max(0, Math.floor(Number(account.xp) || 0));
  account.xp = Math.min(SEASON_PASS.levels * SEASON_PASS.xpPerLevel, before + amount);
  account.xpEvents[key] = { source, amount, at: now.toISOString() };
  return { changed: true, xp: account.xp, before, amount, key };
}

export function seasonPassFor(economy, userId) {
  const account = ensureSeasonPassAccount(economy, userId);
  const view = seasonPassPreview(account.xp, account.premium);
  account.fragments = Math.max(0, Math.floor(Number(account.fragments) || 0));
  account.forged ||= [];
  return { ...view, fragments: account.fragments, forged: account.forged, claimed: account.claimed, xpEvents: Object.keys(account.xpEvents).length };
}

export function unlockSeasonPassPremium(economy, userId) {
  const account = ensureSeasonPassAccount(economy, userId);
  if (account.premium) return false;
  account.premium = true;
  return true;
}

export function claimSeasonPassReward(economy, userId, track, level) {
  if (!['free', 'premium'].includes(track)) throw new Error('Trilha inválida.');
  const account = ensureSeasonPassAccount(economy, userId);
  const safeLevel = Math.max(1, Math.min(SEASON_PASS.levels, Math.floor(Number(level) || 0)));
  const unlockedLevel = Math.floor(Math.max(0, Number(account.xp) || 0) / SEASON_PASS.xpPerLevel);
  if (safeLevel > unlockedLevel) throw new Error('Alcance esse nível antes de resgatar a recompensa.');
  if (track === 'premium' && !account.premium) throw new Error('O Passe Premium é necessário para esta recompensa.');
  account.claimed ||= { free: [], premium: [] };
  account.claimed[track] ||= [];
  if (account.claimed[track].includes(safeLevel)) return { changed: false, reward: rewardAt(safeLevel, track === 'premium') };
  account.claimed[track].push(safeLevel);
  return { changed: true, reward: rewardAt(safeLevel, track === 'premium'), level: safeLevel, track };
}
