import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const history = JSON.parse(fs.readFileSync(new URL('../public/release-history.json', import.meta.url), 'utf8'));

test('menu oferece um histórico permanente de atualizações', () => {
  assert.match(html, /href="\?pagina=atualizacoes" data-page="atualizacoes"/);
  assert.match(html, /<section id="atualizacoes"/);
  assert.match(app, /'atualizacoes'/);
  assert.match(app, /function renderReleaseHistory\(\)/);
  assert.match(app, /release-history\.json/);
  assert.match(app, /data-release-history/);
  assert.match(styles, /\.release-history/);
});

test('histórico possui versões com data, título e notas legíveis', () => {
  assert.ok(Array.isArray(history.releases));
  assert.ok(history.releases.length >= 3);
  history.releases.forEach((release) => {
    assert.match(release.version, /^\d{8}-/);
    assert.match(release.publishedAt, /^\d{4}-\d{2}-\d{2}/);
    assert.ok(release.title.trim());
    assert.ok(Array.isArray(release.notes) && release.notes.length > 0);
  });
});
