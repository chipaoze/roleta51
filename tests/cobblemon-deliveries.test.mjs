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

test('compra da Cápsula responde sem reutilizar campos da compra de Poké Balls', async () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const purchaseRoute = server.indexOf("route === '/api/cobblemon/box/purchase'");
  const start = server.lastIndexOf('  if (req.method', purchaseRoute);
  const nextRoute = server.indexOf("route === '/api/cobblemon/box/open'", start);
  const end = server.lastIndexOf('  if (req.method', nextRoute);
  const purchaseHandler = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'handler de compra da cápsula localizado');
  assert.match(purchaseHandler, /json\(res, 200, \{ profile: profileFor\(user\) \}\);/);
  assert.doesNotMatch(purchaseHandler, /quantity, price, remaining/);
  assert.doesNotMatch(purchaseHandler, /\balready\b|\bdayKey\b/);
  assert.doesNotMatch(purchaseHandler, /'reset-refunded', 'sold'/);

  const db = { economy: { cobblemonDeliveries: [], creditAdjustments: [] } };
  let wallet = 1000;
  let persisted = false;
  const purchase = vm.runInNewContext(`async (req, res, route) => { ${purchaseHandler} }`, {
    db,
    requireAuth: () => ({ user: { id: 'user-1', displayName: 'Tripulante' } }),
    readJson: async () => ({ boxId: 'pokemon' }),
    COBBLEMON_BOXES: { pokemon: { monthlyPokemon: true, price: 899.90, name: 'Cápsula Pokémon' } },
    pokemonCapsuleCycleKey: () => 'capsule-week:2026-09-12',
    walletFor: () => wallet,
    roundMoney: (value) => Math.round(value * 100) / 100,
    addCredits: (_userId, amount) => { wallet = Math.round((wallet + amount) * 100) / 100; },
    randomUUID: () => 'capsule-id',
    persist: async () => { persisted = true; },
    broadcastRefresh: () => {},
    profileFor: () => ({ wallet }),
    json: (res, status, payload) => { res.status = status; res.payload = payload; },
  });
  const response = {};
  await purchase({ method: 'POST' }, response, '/api/cobblemon/box/purchase');
  assert.equal(persisted, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.profile.wallet, 100.1);
  assert.equal(db.economy.cobblemonDeliveries[0].status, 'box-closed');
  assert.equal(db.economy.creditAdjustments[0].amount, -899.9);
});

test('Cápsula prioriza a escolha pendente no rótulo e no clique', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const actionLabel = choiceMode \? \(monthlyBox\.choiceStage === 'weekly'/);
  assert.match(app, /const priceLabel = choiceMode \? `<b>\$\{monthlyBox\.choice\?\.choices/);
  assert.match(app, /data-cobblemon-box-mode="\$\{choiceMode \? 'choice' : readyToOpen \? 'open'/);
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
