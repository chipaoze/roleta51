import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(root, 'public', 'card-album.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('troca direta seleciona cartas clicadas e evita clique após arraste', () => {
  assert.match(js, /pointerdown/);
  assert.match(js, /input\.checked=true/);
  assert.match(js, /input\.dispatchEvent\(new Event\('change'/);
  assert.match(js, /if\(moved\)\{event\.preventDefault\(\)/);
});

test('painéis ocultam combos redundantes e informam como navegar', () => {
  assert.match(css, /select\[name="offeredId"\].*display:none/);
  assert.match(css, /direct-trade-card-strip.*scrollbar-width:none/);
  assert.match(js, /clique e arraste para os lados/);
});

test('análise calcula utilidade por coleção e versão dos assets é atualizada', () => {
  assert.match(js, /utilityScore/);
  assert.match(js, /ANÁLISE PRIVADA DA TROCA/);
  assert.match(html, /card-album\.js\?v=20260916-233/);
  assert.match(html, /styles\.css\?v=20260916-255/);
});
