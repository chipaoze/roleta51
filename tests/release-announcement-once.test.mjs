import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('release announcement with a normal UUID does not duplicate release notes', async () => {
  const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function renderAnnouncement(announcement) {');
  const end = source.indexOf('\nlet renderingActivePortalPage', start);
  assert.ok(start >= 0 && end > start);
  const dialog = { dataset: {}, open: false, close() { this.open = false; }, showModal() { this.open = true; }, classList: { toggle() {} } };
  const fields = new Map();
  const $ = (selector) => selector === '#announcementDialog' ? dialog : (fields.get(selector) || fields.set(selector, { textContent: '', src: '', classList: { toggle() {} } }).get(selector));
  const context = { $, appState: { settings: { releasePublishedAt: '2026-10-27T14:27:39.167Z' } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.renderAnnouncement({ id: 'random-release-uuid', unread: true, createdAt: context.appState.settings.releasePublishedAt, title: 'Notas repetidas' });
  assert.equal(dialog.open, false);
  context.renderAnnouncement({ id: 'independent-message', unread: true, createdAt: '2026-10-27T14:29:00.000Z', title: 'Aviso independente' });
  assert.equal(dialog.open, true);
  assert.equal(fields.get('#announcementDialogTitle').textContent, 'Aviso independente');
});
