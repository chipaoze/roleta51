import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { marketSlotKey } from '../lib/investment-market.mjs';

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
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /market-page \.market-asset-card>header>\.market-position\{[^}]*white-space:normal/);
  assert.match(styles, /market-page \.market-portfolio-breakdown>span\{display:grid!important/);
  assert.match(styles, /market-page \.market-portfolio-breakdown b\.negative\{color:#ff7185!important/);
  assert.match(fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8'), /const marketAdvanced = syncMarketEconomy\(\)/);
  assert.doesNotMatch(app, /confirm\('Uma nova versão do Área 51 está disponível/);
});

test('Mercado informa as 36 janelas de atualização no horário de Brasília', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const marketLib = fs.readFileSync(new URL('../lib/investment-market.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="marketUpdateSchedule"/);
  assert.match(app, /A primeira sincronização após cada horário consolida a nova cotação/);
  assert.match(marketLib, /MARKET_UPDATE_TIMES = Object\.freeze\(Array\.from\(\{ length: 36 \}/);
  assert.match(html, /a cada 15 minutos, das 08h às 16h45/);
  assert.match(marketLib, /updateSchedule: \{ timeZone: MARKET_TIME_ZONE, times: \[\.\.\.MARKET_UPDATE_TIMES\] \}/);
  assert.doesNotMatch(html, /00h · 03h · 06h/);
});

test('Mercado exibe o histórico pessoal de compras e vendas com preço da operação', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="marketTradeHistory"/);
  assert.match(app, /Preço na operação/);
  assert.match(app, /market\.transactions/);
  assert.match(app, /transaction\.price/);
});

test('Mercado não altera cotações fora da janela operacional', () => {
  assert.equal(marketSlotKey(new Date('2026-09-17T10:59:00.000Z')), '2026-09-16:u35'); // 07h59 BRT
  assert.equal(marketSlotKey(new Date('2026-09-17T11:00:00.000Z')), '2026-09-17:u0'); // 08h00 BRT
  assert.equal(marketSlotKey(new Date('2026-09-17T12:29:00.000Z')), '2026-09-17:u5'); // 09h29 BRT
  assert.equal(marketSlotKey(new Date('2026-09-17T12:30:00.000Z')), '2026-09-17:u6'); // 09h30 BRT
  assert.equal(marketSlotKey(new Date('2026-09-17T20:45:00.000Z')), '2026-09-17:u35'); // 17h45 BRT, última cotação vigente
});
