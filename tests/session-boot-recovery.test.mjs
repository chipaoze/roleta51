import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('boot de sessão cancela a leitura anterior antes de tentar novamente', () => {
  assert.match(app, /let sessionBootController = null/);
  assert.match(app, /sessionBootController\?\.abort\(\)/);
  assert.match(app, /const controller = new AbortController\(\)/);
  assert.match(app, /signal: controller\.signal/);
  assert.match(app, /timeoutMs: 30000, signal: controller\.signal/);
  assert.match(app, /if \(runId !== sessionBootRunId\) return/);
});

test('timeout da API respeita o cancelamento solicitado pelo boot', () => {
  assert.match(app, /signal: externalSignal/);
  assert.match(app, /externalSignal\.addEventListener\('abort', abortFromExternal/);
  assert.match(app, /signal: controller\.signal/);
});
