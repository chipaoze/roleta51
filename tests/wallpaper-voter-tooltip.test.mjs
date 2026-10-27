import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('voter tooltip renders only revealed names and escapes display names', async () => {
  const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function voteVotersMarkup(');
  const end = source.indexOf('\nfunction renderVoting()', start);
  assert.ok(start >= 0 && end > start);
  const context = { escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const hidden = context.voteVotersMarkup({ bestVotes: 2, bestVoters: null }, 'best');
  assert.doesNotMatch(hidden, /data-vote-voters-toggle|vote-voters-tooltip/);
  const revealed = context.voteVotersMarkup({ bestVotes: 2, bestVoters: ['Ana', '<Bia>'] }, 'best');
  assert.match(revealed, /data-vote-voters-toggle/);
  assert.match(revealed, /Ana<br>&lt;Bia&gt;/);
  assert.doesNotMatch(revealed, /<Bia>/);
  const summary = context.voteVotersMarkup({ worstVotes: 1, worstVoters: ['Caio'] }, 'worst', true);
  assert.match(summary, /1 voto/);
  assert.match(summary, /Caio/);
});

test('touch toggles the voter list while mouse clicks leave hover behavior to CSS', async () => {
  const source = await readFile(new URL('../.mega51-isolated-static/app.js', import.meta.url), 'utf8');
  const start = source.indexOf("document.addEventListener('click', (event) => {\n  const trigger = event.target.closest?.('[data-vote-voters-toggle]');");
  const end = source.indexOf("\ndocument.addEventListener('keydown', (event) => {", start);
  assert.ok(start >= 0 && end > start);
  let onClick;
  let hasHover = false;
  const classes = new Set();
  const trigger = { closest: () => wrap, setAttribute: (name, value) => { trigger[name] = value; } };
  const wrap = { classList: { toggle(name) { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; }, remove(name) { classes.delete(name); } }, querySelector: () => trigger };
  const context = {
    document: { addEventListener: (_type, callback) => { onClick = callback; }, querySelectorAll: () => classes.has('is-open') ? [wrap] : [] },
    window: { matchMedia: () => ({ matches: hasHover }) },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const touch = { target: { closest: () => trigger }, detail: 1 };
  onClick(touch);
  assert.equal(classes.has('is-open'), true);
  assert.equal(trigger['aria-expanded'], 'true');
  onClick({ target: { closest: () => null }, detail: 1 });
  assert.equal(classes.has('is-open'), false);
  hasHover = true;
  onClick(touch);
  assert.equal(classes.has('is-open'), false);
});
