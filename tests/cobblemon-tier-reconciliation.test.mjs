import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import COBBLEMON_CATALOG from '../lib/cobblemon-catalog.mjs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');

test('catálogo identifica Xerneas como lendário e a caça não mistura espécies especiais no pool comum', () => {
  const xerneas = COBBLEMON_CATALOG.find((entry) => Number(entry.i) === 716);
  assert.match(xerneas.l, /legendary/);
  assert.match(server, /function cobblemonCaptureTierForPokemon/);
  assert.match(server, /available\.filter\(\(entry\) => cobblemonCaptureTierForPokemon\(entry\) === tier\)/);
  assert.doesNotMatch(server, /: \/\.\/;\s*let pool = available\.filter/);
});

test('reconciliação corrige a Pokédex, as tentativas e os bônus pendentes uma única vez', () => {
  assert.match(server, /cobblemonTierReconciliationV2/);
  assert.match(server, /correctedDexEntries/);
  assert.match(server, /correctedAttempts/);
  assert.match(server, /Correção de bônus de primeira captura lendária/);
  assert.match(server, /Correção de bônus de primeira captura rara/);
  assert.match(server, /cobblemonLevelFitsTier/);
});
