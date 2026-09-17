import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Mentirômetro exige voto após a tolerância e mantém a rota de votação liberada', () => {
  assert.match(server, /const LIE_VOTE_GRACE_MS = 10 \* 60 \* 1000/);
  assert.match(server, /function requiredLieVoteForUser\(userId, now = Date\.now\(\)\)/);
  assert.match(server, /requiredVote: user\.role === 'admin' \? null : requiredLieVoteForUser\(user\.id\)/);
  assert.match(server, /const voteRoute = req\.method === 'POST' && \/\^\\\/api\\\/lie-meter/);
  assert.match(server, /Você precisa votar na mentira pendente antes de continuar/);
});

test('Mentirômetro permite várias marcações diferentes para o mesmo alvo', () => {
  assert.match(server, /A mesma pessoa pode receber várias marcações simultâneas/);
  assert.match(server, /\(item\.reason \|\| ''\) === \(delta > 0 \? reason : ''\)/);
  assert.match(server, /Date\.parse\(now\) - Date\.parse\(item\.createdAt \|\| ''\) < 30000/);
});

test('interface bloqueia o portal e oferece as duas decisões', () => {
  assert.match(html, /id="lieVoteRequiredDialog"/);
  assert.match(html, /data-required-lie-vote="lie"/);
  assert.match(html, /data-required-lie-vote="truth"/);
  assert.match(client, /function renderRequiredLieVote\(required\)/);
  assert.match(client, /api\('\/api\/lie-meter\/'.*\/vote/);
  assert.match(client, /requiredLieVoteChanged/);
});
