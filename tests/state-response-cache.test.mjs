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

test('finalistas de tema não entram no histórico público da rodada', () => {
  assert.match(server, /\.filter\(\(draw\) => draw\.type !== 'theme' \|\| \(draw\.themeStage !== 'finalist' && db\.settings\.themes\.includes\(draw\.winner\)\)\)/);
});

test('quem inicia o sorteio recebe sua animação antes da transmissão aos demais', () => {
  const responseAt = server.indexOf('json(res, 200, drawForUser(draw, user.id));');
  const broadcastAt = server.indexOf("broadcastLive('draw', draw, user.id);");
  assert.ok(responseAt >= 0 && broadcastAt > responseAt);
});
