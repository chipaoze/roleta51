import test from 'node:test';
import assert from 'node:assert/strict';
import { ROULETTE_MIN_BET, rouletteBoxChance } from '../lib/roulette-economy.mjs';

test('cent bets cannot use the roulette rounding loophole', () => {
  assert.equal(ROULETTE_MIN_BET, 0.10);
  assert.equal(rouletteBoxChance(0.01), 0);
  assert.equal(rouletteBoxChance(0.05), 0);
});

test('even a maximum-value box cannot outweigh the numeric wheel edge', () => {
  for (const bet of [0.10, 1, 10, 30, 70, 100, 500, 1000, 10000]) {
    assert.ok(rouletteBoxChance(bet) * 650 <= bet * 0.013 + 1e-9);
    assert.ok(rouletteBoxChance(bet) <= 0.02);
  }
});
