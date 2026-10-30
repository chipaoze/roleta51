import test from 'node:test';
import assert from 'node:assert/strict';
import { ROULETTE_DAILY_LIMIT, ROULETTE_WINDOW_LIMIT, roulettePaceAllowed, rouletteTrafficDecision } from '../lib/roulette-traffic.mjs';

test('direct API spins must wait for the visible wheel to finish', () => {
  assert.equal(roulettePaceAllowed(1000, 5999), false);
  assert.equal(roulettePaceAllowed(1000, 6000), true);
});

test('normal groups of 30 spins fit within the traffic window', () => {
  let state = { dayCount: 0 };
  for (let index = 0; index < ROULETTE_WINDOW_LIMIT; index += 1) {
    const decision = rouletteTrafficDecision(state, 1000 + index * 1000);
    assert.equal(decision.allowed, true);
    state = { ...decision, dayCount: index + 1 };
  }
  assert.deepEqual(rouletteTrafficDecision(state, 122000), { allowed: false, reason: 'window' });
  assert.equal(rouletteTrafficDecision(state, 601000).allowed, true);
});

test('daily limit stops long-running automation even after the short window resets', () => {
  assert.deepEqual(rouletteTrafficDecision({ dayCount: ROULETTE_DAILY_LIMIT }, 1), { allowed: false, reason: 'daily' });
});
