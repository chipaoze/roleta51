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
