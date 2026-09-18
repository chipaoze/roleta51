import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cobblemonDeliveryMinimumLevel, cobblemonDeliverySpec, rollCobblemonDeliveryGender } from '../lib/cobblemon-delivery-metadata.mjs';

test('Cápsula salva o nível mínimo do CobbleDex e um sexo válido para a entrega', () => {
  // Os exemplos também protegem contra troca acidental para o nível de
  // evolução: Charizard nasce no mínimo 36; Metagross, 45 e sem gênero.
  assert.equal(cobblemonDeliveryMinimumLevel(6), 36);
  assert.equal(cobblemonDeliveryMinimumLevel(376), 45);
  assert.equal(cobblemonDeliveryMinimumLevel(248), 55);
  assert.equal(rollCobblemonDeliveryGender(376), 'genderless');
  const charizard = cobblemonDeliverySpec(6);
  assert.equal(charizard.level, 36);
  assert.ok(['male', 'female'].includes(charizard.gender));
});

test('fluxo da Cápsula preserva nível e sexo entre sorteio, escolha e entrega', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(server, /function cobblemonCapsuleDeliverySpec\(pokemonId, rarity\)/);
  assert.match(server, /capsule-no-natural-spawn/);
  assert.match(server, /function ensureCobblemonDeliverySpec\(entry\)/);
  assert.match(server, /cobblemonDeliverySpecsV1/);
  assert.match(server, /level: roll\.level, gender: roll\.gender/);
  assert.match(server, /level: choice\.level, gender: choice\.gender/);
  assert.match(server, /level: Number\(entry\.level \|\| history\.level\)/);
  assert.match(app, /function cobblemonDeliverySpecLabel\(entry = \{\}\)/);
  assert.match(app, /Entrega Cobblemon: nível/);
  assert.match(app, /mínimo do CobbleDex/);
});

test('sorteio mantém a tabela de raridade e gera ficha de entrega também para Pokémon sem spawn natural', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function cobblemonCapsuleDeliverySpec(');
  const end = server.indexOf('function normalizedCobblemonLevel(', start);
  const rolls = [0, 0, 0.9, 0];
  const context = {
    COBBLEMON_CATALOG: [{ n: 'Charizard', i: 6, l: '' }, { n: 'Mewtwo', i: 150, l: 'legendary' }],
    cobblemonDeliverySpec: (id) => Number(id) === 6 ? { level: 36, gender: 'female', levelSource: 'cobbledex-minimum' } : null,
    rollCobblemonDeliveryGender: () => 'genderless',
    Math: { random: () => rolls.shift(), floor: Math.floor },
  };
  const monthlyReward = vm.runInNewContext(server.slice(start, end) + ';monthlyCobblemonPokemonReward', context);
  const legendary = monthlyReward();
  const common = monthlyReward();
  assert.deepEqual({ id: legendary.pokemonId, level: legendary.level, gender: legendary.gender, rarity: legendary.rarity }, { id: 150, level: 70, gender: 'genderless', rarity: 'legendary' });
  assert.deepEqual({ id: common.pokemonId, level: common.level, gender: common.gender, rarity: common.rarity }, { id: 6, level: 36, gender: 'female', rarity: 'common' });
});

test('migração preenche uma entrega já existente sem mudar seu status ou a escolha', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function ensureCobblemonDeliverySpec(');
  const end = server.indexOf('function pokemonCapsuleChoiceForEntry(', start);
  const ensure = vm.runInNewContext(server.slice(start, end) + ';ensureCobblemonDeliverySpec', {
    cobblemonDeliveryMinimumLevel,
    cobblemonDeliverySpec: (id) => Number(id) === 376
      ? { level: 45, gender: 'genderless', levelSource: 'cobbledex-minimum' }
      : { level: 36, gender: 'male', levelSource: 'cobbledex-minimum' },
  });
  const active = { id: 'metagross-pending', pokemonId: 376, status: 'awaiting-delivery', deliveryLocked: true };
  assert.equal(ensure(active), true);
  assert.deepEqual(active, { id: 'metagross-pending', pokemonId: 376, status: 'awaiting-delivery', deliveryLocked: true, level: 45, gender: 'genderless', levelSource: 'cobbledex-minimum' });
});

test('painel de entregas não trunca itens antigos não-Pokémon', () => {
  const source = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /deliveries:\s*db\.economy\.cobblemonDeliveries\.filter\(/);
  assert.doesNotMatch(source, /deliveries:\s*db\.economy\.cobblemonDeliveries\.filter\([^\n]+\)\.slice\(-30\)/);
});

test('Pokédex permite comprar e escolher bolas especiais com chance calculada no servidor', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(server, /COBBLEMON_CAPTURE_BALLS/);
  assert.match(server, /route === '\/api\/cobblemon\/balls\/buy-special'/);
  assert.match(server, /body\.ballType/);
  assert.match(server, /captureChances/);
  assert.match(server, /cobblemonBallInventory/);
  assert.match(app, /data-cobblemon-ball-select/);
  assert.match(app, /data-cobblemon-ball-buy/);
  assert.match(app, /shop-quantity-picker/);
  assert.match(app, /const unitPrice = ball\.id === 'poke' \? Number\(balls\.unitPrice \|\| 8\.99\)/);
  assert.match(app, /dailyBall \? '\/api\/cobblemon\/balls\/buy'/);
  assert.match(app, /ballType: cobblemonSelectedBall/);
  assert.match(app, /Chance de captura/);
  assert.match(html, /id="cobblemonBallOptions"/);
});

test('Cobblemon mantém rolagem leve e preço de cápsula padronizado', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /function scheduleCobblemonScrollMode\(\)/);
  assert.doesNotMatch(app, /cobblemon-scrolling/);
  assert.match(app, /shopCreditMarkup\(box\.price, 'por cápsula'\)/);
  assert.match(styles, /\.cobblemon-scene-mon\{[^}]*animation:none/);
  assert.match(styles, /\.cobblemon-page \.cobblemon-dex-mon\{contain:layout style\}/);
  assert.doesNotMatch(styles, /cobblemon-scene-float/);
});

test('Poké Ball só pode ser escolhida depois do encontro e exibe chance percentual', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(app, /const encounterReady = Boolean\(encounter\?\.encounterToken && encounter\?\.captureChances\)/);
  assert.match(app, /const selectorAttributes = encounterReady \?/);
  assert.match(app, /Chance de captura: <b>\$\{chance\}%<\/b>/);
  assert.doesNotMatch(app, /appState\.profile = data\.profile; cobblemonSelectedBall = ballType;/);
  assert.match(app, /Escolha a bola somente depois de encontrar um Pokémon/);
  assert.match(html, /cada opção mostrará a chance percentual desta captura/);
});

test('capturas shiny e bônus da Pokédex são sorteados e pagos somente no servidor', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(server, /const COBBLEMON_SHINY_CHANCE = \.01/);
  assert.match(server, /isShiny: Boolean\(isShiny\)/);
  assert.match(server, /function grantCobblemonCaptureBonuses/);
  assert.match(server, /cobblemonCaptureRewardClaims/);
  assert.match(server, /mode: 'cobblemon-capture-bonus'/);
  assert.match(server, /captureBonus: cobblemonCaptureBonusState\(user\.id\)/);
  assert.match(app, /function cobblemonShinyWikiSprite/);
  assert.match(app, /function applyCobblemonSprite/);
  assert.match(app, /id = 'cobblemonCaptureBonuses'/);
  assert.match(styles, /\.cobblemon-encounter-target\.shiny/);
  assert.match(styles, /\.cobblemon-capture-bonuses/);
});
