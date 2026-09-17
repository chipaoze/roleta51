import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Escudo só é oferecido após o sorteio Gay e reabre o sorteio sem reservar antes', () => {
  assert.match(server, /route === '\/api\/draw\/gay-shield'/);
  assert.match(server, /pendingGayDraw/);
  assert.match(server, /consumePower\(user\.id, 'power-shield-gay', \{ roundId: pending\.roundId, pendingGayId: pending\.id, rerolled: true \}\)/);
  assert.match(server, /O Escudo da Rodada só pode ser usado depois que você for sorteado como Gay/);
  assert.doesNotMatch(server, /db\.economy\.shields\.push\(\{ roundId, userId: user\.id/);
});

test('interface mostra a decisão ao sorteado e mantém o escudo aguardando no inventário', () => {
  assert.match(client, /showShieldOffer\(result\)/);
  assert.match(client, /api\('\/api\/draw\/gay-shield'/);
  assert.match(client, /shieldWaiting/);
  assert.match(html, /id="useShieldButton"/);
  assert.match(html, /id="keepGayButton"/);
});
