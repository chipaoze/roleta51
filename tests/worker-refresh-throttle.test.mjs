import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');

test('a revisão remota é consultada em uma janela curta e gravações invalidam a espera', () => {
  assert.match(server, /const STATE_REFRESH_INTERVAL_MS = 1000/);
  assert.match(server, /if \(stateRevision > 0 && now - lastStateRefreshAt < STATE_REFRESH_INTERVAL_MS\) return;/);
  assert.match(server, /stateRevision = nextRevision;\s+lastStateRefreshAt = Date\.now\(\);/);
  assert.match(server, /stateRevision = -1;\s+lastStateRefreshAt = 0;/);
});
