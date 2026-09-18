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
  assert.match(app, /shopCreditMarkup\(ball\.price/);
  assert.match(app, /shopCreditMarkup\(balls\.buyPrice \|\| 89\.90, 'pacote'\)/);
  assert.match(app, /ballType: cobblemonSelectedBall/);
  assert.match(app, /Chance nesta aparição/);
  assert.match(html, /id="cobblemonBallOptions"/);
});

test('Cobblemon mantém rolagem leve e preço de cápsula padronizado', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(app, /function scheduleCobblemonScrollMode\(\)/);
  assert.match(app, /shopCreditMarkup\(box\.price, 'por cápsula'\)/);
  assert.match(styles, /cobblemon-page\.is-scrolling \.cobblemon-scene-mon/);
});
