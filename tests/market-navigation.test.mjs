import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Mercado 51 possui rota própria e navegação direta no menu', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /href="\?pagina=mercado" data-page="mercado"/);
  assert.match(html, /<section id="mercado"/);
  assert.match(app, /const portalPages = \[[^\]]*'mercado'/);
  assert.doesNotMatch(app, /window\.location\.assign\('\?pagina=mercado'\)/);
});

test('operações do Mercado atualizam apenas o perfil, sem tratar resposta parcial como estado global', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const data = await api\('\/api\/market\/'.*appState\.profile = data\.profile; renderProfileEconomy/);
});

test('Mercado mostra total da carteira e direção da cotação', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="marketPortfolioValue"/);
  assert.match(html, /id="marketHoldingsValue"/);
  assert.match(html, /market-total-amount/);
  assert.match(html, /Créditos 51<\/small>/);
  assert.match(html, /id="marketChart"/);
  assert.match(html, /id="marketMovers"/);
  assert.match(app, /market-change up/);
  assert.match(app, /market-change down/);
  assert.match(app, /holdingsValue/);
  assert.match(app, /market-quick-qty/);
  assert.match(app, /marketMoney/);
  assert.match(app, /Total da ordem/);
  assert.match(app, /releaseNoticeLoaded/);
  assert.match(fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8'), /market-change\.up/);
  assert.match(fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8'), /const marketAdvanced = syncMarketEconomy\(\)/);
  assert.doesNotMatch(app, /confirm\('Uma nova versão do Área 51 está disponível/);
});
