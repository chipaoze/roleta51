import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Maldição TDAH só pode atingir outra pessoa e falha antes do consumo', () => {
  const guard = "if (adhd && target.id === user.id) throw new HttpError(409, 'A Maldição TDAH deve ser enviada para outra pessoa. Seu poder não foi consumido.');";
  const guardAt = server.indexOf(guard);
  const consumeAt = server.indexOf('consumePower(user.id, item.id, { roundId, targetId: target.id });');
  assert.ok(guardAt >= 0, 'a Maldição TDAH deve bloquear autoenvio');
  assert.ok(consumeAt > guardAt, 'o bloqueio deve ocorrer antes de consumir o poder');
});

test('a lista da Maldição TDAH não oferece o próprio usuário', () => {
  const list = 'const eligibleTargets = adhd ? people.filter((person) => person.id !== appState.me.id) : people;';
  const listAt = app.indexOf(list);
  const targetAt = app.indexOf('const target = eligibleTargets.find(', listAt);
  assert.ok(listAt >= 0, 'a lista de alvos deve excluir quem usa o poder');
  assert.ok(targetAt > listAt, 'a escolha deve usar somente a lista filtrada');
});
