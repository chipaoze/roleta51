import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
