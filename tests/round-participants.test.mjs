import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const server = fs.readFileSync(new URL('legacy-server.mjs', root), 'utf8');
const client = fs.readFileSync(new URL('public/app.js', root), 'utf8');
const html = fs.readFileSync(new URL('public/index.html', root), 'utf8');
const styles = fs.readFileSync(new URL('public/styles.css', root), 'utf8');

test('admin pode adicionar ou remover participantes antes do envio', () => {
  assert.match(server, /route === '\/api\/admin\/round\/participants'/);
  assert.match(server, /if \(body\.included\) participantIds\.add\(target\.id\); else participantIds\.delete\(target\.id\);/);
  assert.match(server, /Essa pessoa já enviou wallpaper e não pode ser removida ou alterada agora\./);
  assert.match(client, /person\.included \? 'Remover' : 'Adicionar'/);
  assert.match(client, /data-round-included/);
});

test('interface deixa claro que adicionar libera o envio e destaca a ação disponível', () => {
  assert.match(html, /Ao adicionar, a pessoa já vê o tema e pode enviar normalmente\./);
  assert.match(client, /Adicionar .* à rodada/);
  assert.match(styles, /\.round-participant-row \.tiny-toggle\.off\{background:#dcf7eb/);
  assert.match(styles, /\.round-participant-row \.tiny-toggle\.on\{background:#fff0ee/);
});
