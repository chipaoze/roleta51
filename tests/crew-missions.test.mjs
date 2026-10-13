import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { weeklyMissionTemplatesFor } from '../legacy-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cada participante recebe três missões semanais distintas e estáveis', () => {
  const first = weeklyMissionTemplatesFor('tripulante-51', '2026-09-28');
  const second = weeklyMissionTemplatesFor('tripulante-51', '2026-09-28');
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((mission) => mission.type)).size, 3);
  assert.deepEqual(first, second);
});

test('missões ampliadas incluem comentário e votação com chaves de recompensa únicas', () => {
  const server = fs.readFileSync(path.join(root, 'legacy-server.mjs'), 'utf8');
  assert.match(server, /id: 'daily-comment'/);
  assert.match(server, /id: 'daily-vote'/);
  assert.match(server, /userId \+ ':' \+ weekKey \+ ':' \+ template\.type/);
  assert.match(server, /db\.economy\.missionRewards\.includes\(mission\.key\)/);
});

test('cursor administrativo preserva a seta original em tamanho reduzido na aplicação e na prévia', () => {
  const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const cursor = fs.readFileSync(path.join(root, 'public', 'cursor-commander-halloween-v3.png'));
  assert.equal(cursor.readUInt32BE(16), 36);
  assert.equal(cursor.readUInt32BE(20), 48);
  assert.match(styles, /cursor:url\('\/cursor-commander-halloween-v3\.png'\) 3 2,auto/);
  assert.match(app, /src="\/cursor-commander-halloween-v3\.png"/);
});
