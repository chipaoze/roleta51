import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('pauta notifications use the voting icon regardless of proposal text', async () => {
  const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function notificationIconMarkup(item) {');
  const end = source.indexOf('\nfunction renderNotifications()', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const subjects = ['Tempo restante de maldição', 'Classificação dos maiores saldos', 'Nova opção no mercado'];
  const icons = subjects.map((subject, index) => context.notificationIconMarkup({ id: `community-vote-open:${index}`, title: 'Nova pauta aberta para votação', detail: subject }));
  assert.equal(new Set(icons).size, 1);
  assert.match(icons[0], /menu-votacoes-v2\.png/);
  assert.equal(context.notificationIconMarkup({ id: 'community-vote-comment:1', detail: 'Créditos' }), icons[0]);
});
