import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `section ${start}`);
  return source.slice(from, to);
};

test('compact result updates only the selected wallet and current game history', () => {
  const elements = new Map();
  const context = {
    appState: { profile: { wallet: 100 }, casino: { wallet: 50, shopWallet: 100, jackpot: { amount: 500 }, playsToday: 0, totalPlays: 0, totalWagered: 0, recentSlots: [], recentRoulette: [] } },
    $: (selector) => { if (!elements.has(selector)) elements.set(selector, { textContent: '', setAttribute() {} }); return elements.get(selector); },
    formatCredits: (amount) => Number(amount).toFixed(2),
  };
  vm.createContext(context);
  vm.runInContext(section('function applyCompactCasinoPlay(', '\nasync function finishCasinoAuto('), context);
  const play = { requestId: 'request-1', bet: 2, resultType: 'slots' };
  context.applyCompactCasinoPlay({ casinoResult: play, casinoBalances: { promotional: 47, shop: 100, jackpot: 505, closedBoxes: 0 } }, 'slots');
  assert.equal(context.appState.casino.wallet, 47);
  assert.equal(context.appState.profile.wallet, 100);
  assert.equal(context.appState.casino.recentSlots[0].requestId, 'request-1');
  assert.equal(context.appState.casino.recentRoulette.length, 0);
  assert.equal(elements.get('#casinoWallet').textContent, '47.00');
  context.applyCompactCasinoPlay({ casinoResult: { requestId: 'request-2', bet: 3, resultType: 'multiplier' }, casinoBalances: { promotional: 47, shop: 97, jackpot: 510, closedBoxes: 0 } }, 'roulette');
  assert.equal(context.appState.profile.wallet, 97);
  assert.equal(context.appState.casino.recentRoulette[0].requestId, 'request-2');
  assert.equal(elements.get('#topWalletValue').textContent, '97.00');
});

test('automatic sequence buys only the next spin and respects stop and count limit', () => {
  const submissions = [];
  const scheduled = [];
  const finishes = [];
  const context = {
    casinoAutoRun: null,
    updateCasinoAutoControls: () => {},
    finishCasinoAuto: (run, message) => { finishes.push({ run, message }); context.casinoAutoRun = null; },
    document: { hidden: false },
    currentPortalPage: () => 'jogos',
    casinoActiveGame: 'roulette',
    setTimeout: (callback) => scheduled.push(callback),
    $: () => ({ requestSubmit: () => submissions.push('submitted') }),
  };
  vm.createContext(context);
  vm.runInContext(section('function queueNextCasinoAuto(', '\ndocument.querySelectorAll(\'[data-auto-game]\')'), context);
  const run = { game: 'roulette', count: 10, completed: 8, stopping: false };
  context.casinoAutoRun = run;
  context.queueNextCasinoAuto(run);
  assert.equal(run.completed, 9);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.equal(submissions.length, 1);
  run.triggering = false;
  context.queueNextCasinoAuto(run);
  assert.equal(run.completed, 10);
  assert.equal(finishes.length, 1);
  assert.equal(scheduled.length, 0);
  const stopped = { game: 'roulette', count: 20, completed: 3, stopping: true };
  context.casinoAutoRun = stopped;
  context.queueNextCasinoAuto(stopped);
  assert.equal(stopped.completed, 4);
  assert.equal(finishes.length, 2);
  assert.equal(submissions.length, 1);
});
