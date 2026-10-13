import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASON_PASS, SEASON_PASS_COSMETIC_REWARDS, SEASON_PASS_XP, awardSeasonPassXp, claimSeasonPassReward, passIsOpen, seasonPassFor, seasonPassPreview, unlockSeasonPassPremium } from '../lib/season-pass.mjs';

test('passe de outubro possui trinta níveis e aguarda a janela de ativação', () => {
  const pass=seasonPassPreview();
  assert.equal(pass.tracks.length,30);
  assert.equal(pass.levels,30);
  assert.equal(pass.xpPerLevel,80);
  assert.equal(pass.activationEnabled,true);
  assert.equal(SEASON_PASS.startsAt,'2026-09-29T00:00:00-03:00');
  assert.equal(SEASON_PASS.endsAt,'2026-11-01T00:00:00-03:00');
});

test('nível e progresso são limitados sem conceder recompensas', () => {
  const middle=seasonPassPreview(745,true);
  assert.equal(middle.level,9);
  assert.equal(middle.currentLevelXp,25);
  assert.equal(middle.premium,true);
  assert.equal(middle.tracks.filter((item)=>item.unlocked).length,9);
  const maximum=seasonPassPreview(99999);
  assert.equal(maximum.xp,2400);
  assert.equal(maximum.level,30);
});

test('fontes de XP preservam missões gratuitas', () => {
  assert.deepEqual(SEASON_PASS_XP,{dailyMission:10,weeklyMission:60,crewChallenge:150,firstBadgeCraft:100});
  const octoberPlan = 31 * 6 * SEASON_PASS_XP.dailyMission + 4 * 3 * SEASON_PASS_XP.weeklyMission + 3 * SEASON_PASS_XP.crewChallenge + SEASON_PASS_XP.firstBadgeCraft;
  assert.ok(octoberPlan >= SEASON_PASS.levels * SEASON_PASS.xpPerLevel + 500);
});

test('XP do passe é idempotente por evento e respeita a janela da temporada', () => {
  const economy = {};
  const first = awardSeasonPassXp(economy, 'u1', 'daily-mission', 'u1:2026-10-01:water');
  const repeated = awardSeasonPassXp(economy, 'u1', 'daily-mission', 'u1:2026-10-01:water');
  assert.equal(first.changed, true);
  assert.equal(first.amount, 10);
  assert.equal(repeated.changed, false);
  assert.equal(seasonPassFor(economy, 'u1').xp, 10);
  assert.equal(passIsOpen(new Date('2026-10-01T00:00:00-03:00')), true);
  assert.equal(passIsOpen(new Date('2026-11-01T00:00:00-03:00')), false);
});

test('resgates não duplicam e a trilha premium exige compra', () => {
  const economy = {};
  awardSeasonPassXp(economy, 'u1', 'first-badge-craft', 'first');
  assert.throws(() => claimSeasonPassReward(economy, 'u1', 'premium', 1), /Premium/);
  assert.equal(unlockSeasonPassPremium(economy, 'u1'), true);
  const first = claimSeasonPassReward(economy, 'u1', 'premium', 1);
  const again = claimSeasonPassReward(economy, 'u1', 'premium', 1);
  assert.equal(first.changed, true);
  assert.equal(again.changed, false);
  assert.equal(first.reward.name, 'Emblema da Operação');
});

test('recompensas visuais possuem identificadores equipáveis do Perfil', () => {
  assert.deepEqual(SEASON_PASS_COSMETIC_REWARDS, {
    'Título: Operador Blackstar': 'title-operador-blackstar',
    'Emblema da Operação': 'badge-operacao-blackstar',
    'Moldura Blackstar': 'frame-blackstar',
    'Rastro Táquion': 'trail-taquion',
    'Cursor Khepri': 'cursor-khepri',
    'Tema Premium: Câmara Vanta': 'site-camara-vanta',
  });
});
