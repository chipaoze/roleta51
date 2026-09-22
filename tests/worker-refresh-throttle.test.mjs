import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');

test('a revisão remota é consultada em uma janela curta e gravações invalidam a espera', () => {
  assert.match(server, /const STATE_REFRESH_INTERVAL_MS = 1000/);
  assert.match(server, /if \(stateRevision > 0 && now - lastStateRefreshAt < STATE_REFRESH_INTERVAL_MS\) return;/);
  assert.match(server, /stateRevision = nextRevision;\s+lastStateRefreshAt = Date\.now\(\);/);
  assert.match(server, /stateRevision = -1;\s+lastStateRefreshAt = 0;/);
});

test('a resposta pesada de estado não executa liquidações que persistem o banco inteiro', () => {
  const stateRoute = server.match(/if \(req\.method === 'GET' && route === '\/api\/state'\) \{([\s\S]*?)\n  \}\n\n  enforceLieVoteGate/);
  const syncRoute = server.match(/if \(req\.method === 'GET' && route === '\/api\/sync'\) \{([\s\S]*?)\n  \}\n\n  if \(req\.method === 'GET' && route === '\/api\/feedback'/);
  assert.ok(stateRoute, 'rota /api/state encontrada');
  assert.ok(syncRoute, 'rota /api/sync encontrada');
  assert.doesNotMatch(stateRoute[1], /syncMarketEconomy\(\)|settleLotteryRounds\(\)|grantCobblemonDailyBallBonus\(user\.id\)/);
  assert.match(syncRoute[1], /settleCleanNameRewards\(\)/);
  assert.match(syncRoute[1], /settleSeasonalChallenges\(\)/);
  assert.match(syncRoute[1], /settlePokemonCapsules\(\)/);
  assert.match(syncRoute[1], /syncMarketEconomy\(\)/);
  assert.match(syncRoute[1], /settleLotteryRounds\(\)/);
  assert.match(syncRoute[1], /grantCobblemonDailyBallBonus\(user\.id\)/);
});
