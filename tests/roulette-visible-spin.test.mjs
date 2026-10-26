import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('roulette finishes on time when another portal page is opened', async () => {
  const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function animateCasinoWheel(');
  const end = source.indexOf('\n// O próprio clique', start);
  assert.ok(start >= 0 && end > start);
  const frames = [];
  const wheel = { style: {} };
  let page = 'jogos';
  const context = {
    $: () => wheel,
    document: { hidden: false },
    currentPortalPage: () => page,
    casinoActiveGame: 'roulette',
    casinoWheelDisplaySlices: [0, 1, 2, 3, 4, 5].map((value) => ({ value })),
    casinoWheelValues: [0, 1, 2, 3, 4, 5],
    casinoWheelRotation: 0,
    casinoWheelVisualRotation: 0,
    casinoWheelLabelFrame: null,
    casinoWheelEase: (progress) => progress,
    performance: { now: () => 0 },
    cancelAnimationFrame: () => {},
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    drawCasinoWheelLabels: () => {},
    playCasinoOscillator: () => {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  let finished = false;
  context.animateCasinoWheel(2, 2).then(() => { finished = true; });
  const frame = async (now) => { const callback = frames.shift(); assert.ok(callback); callback(now); await Promise.resolve(); };
  await frame(0);
  await frame(1000);
  assert.equal(finished, false);
  page = 'perfil';
  for (let now = 2000; now <= 6000 && !finished; now += 1000) await frame(now);
  assert.equal(finished, true);
  assert.equal(context.casinoWheelVisualRotation, context.casinoWheelRotation);
  page = 'jogos';
  assert.match(wheel.style.transform, /rotate\(/);
});
