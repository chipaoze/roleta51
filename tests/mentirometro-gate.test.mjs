import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lieVoteDecision } from '../legacy-server.mjs';

const server = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Mentirômetro exige voto após a tolerância e mantém a rota de votação liberada', () => {
  assert.match(server, /const LIE_VOTE_GRACE_MS = 10 \* 60 \* 1000/);
  assert.match(server, /function requiredLieVoteForUser\(userId, now = Date\.now\(\)\)/);
  assert.match(server, /requiredVote: user\.role === 'admin' \? null : requiredLieVoteForUser\(user\.id\)/);
  assert.match(server, /const voteRoute = req\.method === 'POST' && \/\^\\\/api\\\/lie-meter/);
  assert.match(server, /Você precisa votar na mentira pendente antes de continuar/);
  assert.match(server, /function settlePendingLieVotes\(now = new Date\(\)\.toISOString\(\)\)/);
  assert.match(server, /const quorumReached = received > voterIds\.length \/ 2/);
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
  assert.match(client, /previousVoteId[\s\S]*?delete dialog\.dataset\.submitting[\s\S]*?button\.disabled = false/);
  assert.match(client, /dialog\.dataset\.submitting === '1'/);
  assert.match(client, /approvedBy/);
  assert.match(server, /approvedBy: lieApprovalPeople\(item\)/);
});

test('votos de várias mentiras são independentes e a próxima decisão continua disponível', () => {
  const first = lieVoteDecision(['criador', 'pessoa-a', 'pessoa-b'], { criador: 'lie', 'pessoa-a': 'truth' });
  const second = lieVoteDecision(['criador', 'pessoa-a', 'pessoa-b'], { criador: 'lie' });
  assert.equal(first.outcome, null);
  assert.equal(first.remaining, 1);
  assert.equal(second.outcome, null);
  assert.equal(second.remaining, 2);
});

test('maioria dos votos recebidos encerra depois do quórum', () => {
  const beforeQuorum = lieVoteDecision(['a', 'b', 'c', 'd'], { a: 'lie', b: 'truth' });
  const majority = lieVoteDecision(['a', 'b', 'c', 'd'], { a: 'lie', b: 'lie', c: 'truth' });
  assert.equal(beforeQuorum.outcome, null);
  assert.equal(majority.outcome, 'lie');
  assert.equal(majority.remaining, 1);
});
