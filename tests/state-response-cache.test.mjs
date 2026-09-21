import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');

test('estado pronto é serializado uma vez por revisão e usuário', () => {
  assert.match(server, /const serializedJsonCache = new WeakMap\(\)/);
  assert.match(server, /const STATE_RESPONSE_CACHE_MS = 5000/);
  assert.match(server, /const STATE_RESPONSE_CACHE_MAX = 16/);
  assert.match(server, /if \(cached && now - cached\.createdAt < STATE_RESPONSE_CACHE_MS\) return cached\.value/);
  assert.match(server, /serializedJsonCache\.set\(value, \{ body, bytes: Buffer\.byteLength\(body\) \}\)/);
  assert.match(server, /'Content-Length': serialized\.bytes/);
});
