import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
let formats=0;
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const ctx=vm.createContext({saoPauloDayKey(date){formats++;return formatter.format(date);}});
vm.runInContext(source.slice(source.indexOf('const timestampDayCache'),source.indexOf('function dailyMissionsFor')),ctx);
for(const time of ['2026-09-02T02:59:59Z','2026-09-02T03:00:00Z','bad']) {
  ctx.time=time;
  const initial=vm.runInContext('dayKeyForTimestamp(time)',ctx);
  for(let i=0;i<100;i++)assert.equal(vm.runInContext('dayKeyForTimestamp(time)',ctx),initial);
}
assert.equal(formats,2);
for(let i=0;i<2200;i++){ctx.time=new Date(i*86400000).toISOString();vm.runInContext('dayKeyForTimestamp(time)',ctx);}
assert.equal(vm.runInContext('timestampDayCache.size',ctx),2048);
assert.ok(source.includes('profileFor(user, { liveTitleMap, previousSeason, creditLedger })'));
assert.ok(source.includes('notificationsFor(user, creditLedger)'));
console.log('PASS: immutable date cache, midnight boundaries, invalid dates, 2048-entry limit and shared response computations.');
