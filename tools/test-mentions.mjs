import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const db = { users: [
  { id: 'a', displayName: 'Ana', active: true },
  { id: 'b', displayName: 'Ana Maria', active: true },
  { id: 'c', displayName: 'José Silva', active: true },
  { id: 'd', displayName: 'Inativo', active: false },
] };
const update = vm.runInNewContext(source.slice(source.indexOf('function updateCommentMentions('), source.indexOf('function notificationsFor(')) + ';updateCommentMentions', { db });
const comment = { userId: 'a', message: '@Ana Maria, @José Silva! @José Silva @Ana @Inativo email@Ana Maria @Ana Mariazinha' };
update(comment);
assert.deepEqual(Array.from(comment.mentions, m => m.userId), ['b','c']);
const time = comment.mentions[0].createdAt;
comment.message = 'Editado: @Ana Maria'; update(comment);
assert.equal(comment.mentions.length, 1); assert.equal(comment.mentions[0].createdAt, time);
comment.message = 'Sem marcação'; update(comment); assert.equal(comment.mentions.length, 0);
comment.message = '@jose\u0301 silva'; update(comment); assert.equal(comment.mentions[0].userId, 'c');
for (let i=0; i<10; i++) db.users.push({id:'extra'+i,displayName:'Pessoa'+i,active:true});
comment.message = db.users.map(u=>'@'+u.displayName).join(' '); update(comment); assert.equal(comment.mentions.length, 5);
console.log('PASS: recipients, full names, accents, deduplication, edit timestamps, removal, self/disabled exclusion and limit.');
