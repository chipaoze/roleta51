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

test('cápsula não oferece novamente um Pokémon já pertencente ao participante', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function cobblemonCapsuleDeliverySpec(');
  const end = server.indexOf('function normalizedCobblemonLevel(', start);
  const context = {
    COBBLEMON_CATALOG: [
      { n: 'Metagross', i: 376, l: '' },
      { n: 'Pikachu', i: 25, l: '' },
      { n: 'Eevee', i: 133, l: '' },
    ],
    db: {
      economy: {
        cobblemonDex: { davi: [{ id: 376 }] },
        cobblemonDeliveries: [{ userId: 'davi', boxId: 'pokemon', cycleId: 'capsule-week:2026-09-12', status: 'cycle-candidate', pokemonId: 25 }],
      },
    },
    cobblemonDeliverySpec: (id) => ({ level: Number(id) === 376 ? 45 : 5, gender: 'genderless', levelSource: 'cobbledex-minimum' }),
    rollCobblemonDeliveryGender: () => 'genderless',
    Math: { random: (() => { const values = [0.9, 0]; return () => values.shift() ?? 0; })(), floor: Math.floor },
  };
  const monthlyReward = vm.runInNewContext(server.slice(start, end) + ';monthlyCobblemonPokemonReward', context);
  const reward = monthlyReward('davi', 'capsule-week:2026-09-19');
  assert.equal(reward.pokemonId, 133);
  assert.notEqual(reward.pokemonId, 376);
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

test('histórico de entregas usa os registros existentes sem truncar a produção', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /deliveries:\s*db\.economy\.cobblemonDeliveries\.filter\(/);
  assert.match(server, /route === '\/api\/admin\/cobblemon\/delivered'/);
  assert.match(server, /reward\.status = 'delivered'/);
  assert.doesNotMatch(server, /cobblemonDeliveryHistoryV1/);
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
  assert.match(server, /function cobblemonDailyCaptureLimit\(userId, dayKey/);
  assert.match(server, /specialAttempts/);
  assert.match(server, /grantCobblemonDailyBallBonus\(user\.id/);
  assert.match(server, /COBBLEMON_DAILY_SPECIAL_BALL_BONUS/);
  assert.match(server, /cobblemonDailyCaptureLimit\(user\.id, dayKey\)/);
  assert.match(app, /data-cobblemon-ball-select/);
  assert.match(app, /data-cobblemon-ball-buy/);
  assert.match(app, /shop-quantity-picker/);
  assert.match(app, /const unitPrice = ball\.id === 'poke' \? Number\(balls\.unitPrice \|\| 8\.99\)/);
  assert.match(app, /dailyBall \? '\/api\/cobblemon\/balls\/buy'/);
  assert.match(app, /confirmCobblemonAction\(/);
  assert.match(app, /dataset\.confirming === 'true'/);
  assert.match(app, /cobblemonBallPurchaseQuantities/);
  assert.match(app, /data-cobblemon-ball-quantity/);
  assert.match(app, /value="\$\{savedQuantity\}"/);
  assert.match(app, /type="text" inputmode="numeric" pattern="\[0-9\]\*" maxlength="2"/);
  assert.match(app, /function normalizeCobblemonBallQuantityInput\(input, commit = false\)/);
  assert.match(app, /document\.addEventListener\('focusin', \(event\) =>/);
  assert.match(app, /if \(document\.activeElement === input\) input\.select\(\)/);
  assert.match(app, /\$\('#cobblemonBallOptions'\)\?\.addEventListener\('pointerdown'/);
  assert.match(app, /NATIVE_POINTER_SELECTOR = 'input,textarea,select,button,a,summary,label,/);
  assert.match(app, /cobblemonQuantityInputFromEvent/);
  assert.match(app, /focusCobblemonQuantityFromEvent/);
  assert.match(app, /window\.addEventListener\('pointerdown', \(event\) => focusCobblemonQuantityFromEvent\(event\), true\)/);
  assert.match(app, /window\.addEventListener\('click', \(event\) => focusCobblemonQuantityFromEvent\(event\), true\)/);
  assert.match(app, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /api\('\/api\/admin\/settings', \{ method: 'PATCH', timeoutMs: 60000/);
  assert.match(app, /api\('\/api\/admin\/visual-theme\/clear', \{ method: 'POST', timeoutMs: 60000/);
  assert.match(app, /setButtonBusy\(button, true\)/);
  assert.match(app, /showApp\(await api\('\/api\/state', \{ timeoutMs: 15000 \}, false\)\)/);
  assert.doesNotMatch(app, /cobblemonBallOptions'\)\?\.addEventListener\('pointerdown',[\s\S]{0,300}event\.stopPropagation\(\)/);
  assert.match(app, /if \(isNativeInteractiveTarget\(event\.target\)\) \{\s*suppressClick = false;\s*return;\s*\}/);
  assert.match(app, /replace\(\/\\D\/g, ''\)/);
  assert.match(app, /mountCobblemonHuntBallPanel\(/);
  assert.match(app, /restoreCobblemonBallPanel\(/);
  assert.match(app, /const actionLabel = !encounterReady \? \(quantity > 0 \? 'Disponível na caça' : 'Sem estoque'\)/);
  assert.match(app, /ballType: cobblemonSelectedBall/);
  assert.match(app, /Chance de captura/);
  assert.match(app, /function cobblemonHasAvailableBall\(balls = \{\}\)/);
  assert.match(app, /Object\.values\(balls\.special \|\| \{\}\)\.some/);
  assert.match(app, /!cobblemonHasAvailableBall\(balls\)/);
  assert.match(html, /id="cobblemonBallOptions"/);
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.cobblemon-ball-option\.empty\{opacity:1\}/);
  assert.match(styles, /\.cobblemon-ball-purchase\{[^}]*opacity:1/);
  assert.match(styles, /\.cobblemon-hunt-ball-panel \.cobblemon-ball-price\{display:none\}/);
  assert.match(styles, /\.cobblemon-hunt-ball-panel \.cobblemon-ball-select>b\{display:none\}/);
  assert.match(app, /arraste a Poké Ball que aparece até o Pokémon/);
});

test('bônus diário libera uma Great e uma Ultra e a caçada usa o estoque especial', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('const COBBLEMON_CAPTURE_BALLS =');
  const end = server.indexOf('function cobblemonCaptureChance(', start);
  const context = {
    db: { economy: {
      cobblemonBallInventory: { 'user-1': { great: 0, ultra: 0 } },
      cobblemonDailyBallBonuses: {},
      cobblemonCaptureAttempts: Array.from({ length: 5 }, (_, index) => ({ userId: 'user-1', dayKey: '2026-09-21', ballType: 'poke', id: String(index) })),
      cobblemonBallPurchases: [],
    } },
    saoPauloDayKey: () => '2026-09-21',
    randomUUID: () => 'daily-bonus-id',
  };
  const helpers = vm.runInNewContext(server.slice(start, end) + ';({ grantCobblemonDailyBallBonus, cobblemonDailyCaptureLimit })', context);
  assert.equal(helpers.grantCobblemonDailyBallBonus('user-1', '2026-09-21'), true);
  assert.equal(helpers.grantCobblemonDailyBallBonus('user-1', '2026-09-21'), false);
  assert.deepEqual(context.db.economy.cobblemonBallInventory['user-1'], { great: 1, ultra: 1 });
  assert.equal(helpers.cobblemonDailyCaptureLimit('user-1', '2026-09-21'), 7);
  context.db.economy.cobblemonBallInventory['user-1'].great = 0;
  context.db.economy.cobblemonCaptureAttempts.push({ userId: 'user-1', dayKey: '2026-09-21', ballType: 'great' });
  assert.equal(helpers.cobblemonDailyCaptureLimit('user-1', '2026-09-21'), 7);
});

test('caçada não aceita Poké Ball básica quando o estoque só tem bolas especiais', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function cobblemonDailyPokeLimit(');
  const end = server.indexOf('function cobblemonCaptureChance(', start);
  const context = {
    db: { economy: {
      cobblemonBallPurchases: [],
      cobblemonCaptureAttempts: Array.from({ length: 5 }, (_, index) => ({ userId: 'user-1', dayKey: '2026-09-21', ballType: 'poke', id: String(index) })),
    } },
  };
  const helpers = vm.runInNewContext(`${server.slice(start, end)};({ cobblemonDailyPokeLimit, cobblemonDailyPokeAttempts })`, context);
  assert.equal(helpers.cobblemonDailyPokeLimit('user-1', '2026-09-21'), 5);
  assert.equal(helpers.cobblemonDailyPokeAttempts('user-1', '2026-09-21'), 5);
});

test('a bola que aparece para arremesso sempre tem estoque real', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function syncCobblemonSelectedBall(');
  const end = app.indexOf('function cobblemonHasAvailableBall(', start);
  const element = { querySelector: () => ({ }), classList: { toggle() {} }, setAttribute() {} };
  const context = {
    COBBLEMON_CAPTURE_BALLS: {
      poke: { id: 'poke', name: 'Poké Ball', sprite: 'poke.png' },
      great: { id: 'great', name: 'Great Ball', sprite: 'great.png' },
      ultra: { id: 'ultra', name: 'Ultra Ball', sprite: 'ultra.png' },
    },
    cobblemonPageEncounter: null,
    cobblemonPageCaptureBusy: false,
    $: () => element,
  };
  const helpers = vm.runInNewContext(`let cobblemonSelectedBall = 'poke'; ${app.slice(start, end)}; ({ syncCobblemonSelectedBall, selected: () => cobblemonSelectedBall })`, context);
  helpers.syncCobblemonSelectedBall({ remaining: 0, special: { great: { quantity: 1 }, ultra: { quantity: 1 } } });
  assert.equal(helpers.selected(), 'great');
  helpers.syncCobblemonSelectedBall({ remaining: 0, special: { great: { quantity: 0 }, ultra: { quantity: 1 } } });
  assert.equal(helpers.selected(), 'ultra');
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

test('venda da escolha final conserva a compra no teto semanal, sem bloquear uma vaga restante', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /venda da escolha final encerra somente aquela escolha/);
  assert.match(server, /const canPurchase = !deliveryLocked && !weeklyChoice && weeklyPurchaseCount < 7;/);
  assert.doesNotMatch(server, /!weeklyChoiceClosed && weeklyPurchaseCount/);
});

test('sexta não antecipa a escolha final quando ainda há cápsulas semanais disponíveis', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(server, /paidCapsules\.length < 7/);
  assert.match(server, /if \(candidates\.length >= 7\)/);
  assert.doesNotMatch(server, /candidates\.length >= 7 \|\| \(pokemonCapsuleIsFriday\(\) && candidates\.length > 0\)/);
  assert.match(app, /escolha final abre na sexta ao preencher as 7 vagas/);
  assert.match(app, /As vagas restantes seguem abertas/);
  assert.match(app, /Você pode vender as outras antes de escolher a entrega/);
  assert.doesNotMatch(app, /const weekly = await showCobblemonOpening\('Escolha o Pokémon da semana'/);
});

test('ciclo local de cápsulas mantém a sétima vaga aberta e só fecha a lista completa na sexta', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function finalizePokemonCapsuleCycle(');
  const end = server.indexOf('function retailPriceWithCents(', start);
  assert.ok(start >= 0 && end > start, 'motor de fechamento semanal localizado');
  const cycleId = 'capsule-week:2026-09-12';
  const entry = (index) => ({
    id: `capsule-${index}`, userId: 'tester', boxId: 'pokemon', cycleId,
    status: 'cycle-candidate', name: `Pokémon ${index}`, pokemonId: index,
    sprite: `/pokemon-${index}.webp`, rarity: 'common', createdAt: `2026-09-1${index}T12:00:00.000Z`,
  });
  const db = { economy: { cobblemonDeliveries: Array.from({ length: 6 }, (_, index) => entry(index + 1)) } };
  const settle = vm.runInNewContext(`${server.slice(start, end)}; settlePokemonCapsules`, {
    db,
    pokemonCapsuleCycleKey: () => cycleId,
    pokemonCapsuleIsFriday: () => true,
    pokemonCapsuleChoiceForEntry: (item) => ({ entryId: item.id, id: item.pokemonId, name: item.name, sprite: item.sprite, rarity: item.rarity }),
    Math,
    Date,
  });
  assert.equal(settle(), false, 'seis cápsulas não podem abrir a escolha semanal automaticamente');
  assert.ok(db.economy.cobblemonDeliveries.every((item) => item.status === 'cycle-candidate'));
  db.economy.cobblemonDeliveries.push(entry(7));
  assert.equal(settle(), true, 'a sétima cápsula pode abrir a escolha semanal');
  const weekly = db.economy.cobblemonDeliveries.find((item) => item.status === 'weekly-choice-pending');
  assert.ok(weekly);
  assert.equal(weekly.choices.length, 7);
});

test('ao escolher a entrega semanal, as demais opções são vendidas e creditadas', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function cobblemonCandidateSellPrice(');
  const end = server.indexOf('function finalizePokemonCapsuleCycle(', start);
  const db = { economy: { creditAdjustments: [] } };
  let wallet = 100;
  const sellCandidates = vm.runInNewContext(`${server.slice(start, end)}; sellPokemonCapsuleCandidates`, {
    db,
    roundMoney: (value) => Math.round(Number(value) * 100) / 100,
    walletFor: () => wallet,
    addCredits: (_userId, amount) => { wallet = Math.round((wallet + amount) * 100) / 100; },
    randomUUID: (() => { let sequence = 0; return () => `sale-${++sequence}`; })(),
  });
  const entries = [
    { id: 'chosen', status: 'weekly-choice-pending', name: 'Escolhido', rarity: 'common' },
    { id: 'other-common', status: 'cycle-candidate', name: 'Comum', rarity: 'common' },
    { id: 'other-rare', status: 'cycle-candidate', name: 'Raro', rarity: 'rare' },
    { id: 'already-sold', status: 'sold', name: 'Já vendido', rarity: 'common' },
  ];
  const result = sellCandidates(entries, entries[0], 'user-1', '2026-09-21T12:00:00.000Z');
  assert.equal(result.count, 2);
  assert.equal(result.total, 750);
  assert.equal(wallet, 850);
  assert.equal(entries[0].status, 'weekly-choice-pending');
  assert.equal(entries[1].status, 'sold');
  assert.equal(entries[2].status, 'sold');
  assert.equal(entries[3].status, 'sold');
  assert.ok(entries[1].soldAutomatically);
  assert.equal(db.economy.creditAdjustments.length, 2);
  assert.equal(db.economy.creditAdjustments[1].amount, 450);
  const legendaryEntries = [
    { id: 'kept', status: 'weekly-choice-pending', name: 'Escolhido', rarity: 'common' },
    { id: 'legendary', status: 'cycle-candidate', name: 'Lendário', rarity: 'legendary' },
  ];
  assert.equal(sellCandidates(legendaryEntries, legendaryEntries[0], 'user-1', '2026-09-21T12:00:00.000Z').total, 500);
  assert.equal(wallet, 1350);
});

test('escolha semanal aceita o estado pendente e persiste a opção como entrega', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /!\['cycle-candidate', 'weekly-choice-pending'\]\.includes\(reward\.status\)/);
  assert.match(server, /status: 'awaiting-delivery', decidedAt: now, chosenAt: now/);
  assert.match(server, /sellPokemonCapsuleCandidates\(db\.economy\.cobblemonDeliveries\.filter/);
});

test('fechamento semanal não mistura candidatos de usuários diferentes', () => {
  const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  const start = server.indexOf('function settlePokemonCapsules()');
  const end = server.indexOf('function retailPriceWithCents(', start);
  const entry = (userId, id) => ({
    id: `${userId}-${id}`, userId, boxId: 'pokemon', cycleId: 'capsule-week:2026-09-12',
    status: 'cycle-candidate', name: `${userId} Pokémon`, pokemonId: id,
  });
  const db = { economy: { cobblemonDeliveries: [entry('alan', 409), entry('pastel', 355)] } };
  const settle = vm.runInNewContext(`${server.slice(start, end)}; settlePokemonCapsules`, {
    db,
    pokemonCapsuleCycleKey: () => 'capsule-week:2026-09-19',
    pokemonCapsuleIsFriday: () => false,
    finalizePokemonCapsuleCycle: (entries, chosenEntry) => entries.forEach((item) => {
      item.status = item.id === chosenEntry.id ? 'awaiting-delivery' : 'cycle-discarded';
    }),
    Math,
    Date,
  });
  assert.equal(settle(), true);
  assert.equal(db.economy.cobblemonDeliveries.find((item) => item.userId === 'alan').status, 'awaiting-delivery');
  assert.equal(db.economy.cobblemonDeliveries.find((item) => item.userId === 'pastel').status, 'awaiting-delivery');
});

test('Cápsula prioriza a escolha pendente no rótulo e no clique', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /const actionLabel = choiceMode \? \(monthlyBox\.choiceStage === 'weekly'/);
  assert.match(app, /const priceLabel = choiceMode \? `<b>\$\{monthlyBox\.choice\?\.choices/);
  assert.match(app, /data-cobblemon-box-mode="\$\{choiceMode \? 'choice' : readyToOpen \? 'open'/);
  assert.match(app, /#cobblemonBoxShop'\)\?\.addEventListener\('click'/);
  assert.match(app, /data-cobblemon-box-odds/);
  assert.match(styles, /\.cobblemon-box-actions\{position:relative;z-index:6;pointer-events:auto\}/);
});

test('Poké Ball só pode ser escolhida depois do encontro e exibe chance percentual', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(app, /const encounterReady = Boolean\(encounter\?\.encounterToken && encounter\?\.captureChances &&/);
  assert.match(app, /const selectorAttributes = encounterReady \?/);
  assert.match(app, /Chance de captura: <b>\$\{chance\}%<\/b>/);
  assert.match(app, /const fallback = quantityFor\('poke'\) > 0/);
  assert.match(app, /if \(data\.profile\) appState\.profile = data\.profile/);
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
