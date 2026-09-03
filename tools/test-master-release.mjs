import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
const src=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
const catalog=vm.runInNewContext(src.slice(src.indexOf('const SHOP_CATALOG ='),src.indexOf('// Cada posição'))+';SHOP_CATALOG');
const boxes=catalog.filter(x=>x.master);assert.equal(boxes.length,2);
let roll=0,wallet=0;const db={economy:{purchases:[],creditAdjustments:[]}};
const grant=vm.runInNewContext(src.slice(src.indexOf('function physicalKitClaim()'),src.indexOf('function addMysteryBox('))+';grantMysteryBoxReward',{db,SHOP_CATALOG:catalog,Math:{...Math,random:()=>roll,floor:Math.floor,min:Math.min,max:Math.max},randomInt:()=>9999,randomUUID:()=>crypto.randomUUID(),walletFor:()=>wallet,addCredits:(_,v)=>wallet+=v});
for(const box of boxes) for(let i=0;i<100;i++){
  roll=i/100;db.economy.purchases=[];wallet=0;const result=grant({id:'a'},box);
  if(result.kind==='credits'){assert.ok(result.amount<=box.creditMax);assert.ok(result.amount<box.price);assert.ok(Number.isInteger(result.amount));}
  else {const item=catalog.find(x=>x.id===result.itemId);assert.ok(item.price>=box.minRewardPrice&&item.price<=box.maxRewardPrice);assert.ok(result.sellPrice<=box.sellPrice*.8);assert.equal(db.economy.purchases[0].mysteryDecisionPending,true);}
  assert.ok(box.sellPrice<box.price);
}
const sql=await readFile(new URL('grant-master-136.sql',import.meta.url),'utf8');
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE app_state(id INTEGER,data TEXT,revision INTEGER,updated_at TEXT)');
const original={settings:{},users:[{id:'a',approved:true},{id:'b'},{id:'pending',approved:false}],economy:{wallets:{a:77},mysteryBoxes:[{id:'old',userId:'a'}],purchases:[{id:'keep'}]}};
sqlite.prepare('INSERT INTO app_state VALUES(1,?,5,NULL)').run(JSON.stringify(original));sqlite.exec(sql);
let state=JSON.parse(sqlite.prepare('SELECT data FROM app_state').get().data);
assert.equal(state.economy.mysteryBoxes.length,3);assert.deepEqual(state.economy.wallets,original.economy.wallets);assert.deepEqual(state.economy.purchases,original.economy.purchases);assert.deepEqual(state.settings.masterGift136.userIds,['a','b']);
state.economy.mysteryBoxes=state.economy.mysteryBoxes.filter(x=>x.id!=='feature-master-136:a');sqlite.prepare('UPDATE app_state SET data=?').run(JSON.stringify(state));sqlite.exec(sql);
assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM app_state').get().data).economy.mysteryBoxes.length,2);assert.equal(sqlite.prepare('SELECT revision FROM app_state').get().revision,6);
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const classes=new Set();const document={documentElement:{dataset:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}}};
const setCursor=vm.runInNewContext(app.slice(app.indexOf('function setPreviewCursor('),app.indexOf('function applyPersonalTheme('))+';setPreviewCursor',{document});
for(const cursor of ['crystal','solar','gay','giant-slow',null]){setCursor(cursor);assert.equal(document.documentElement.dataset.activeCursor,cursor||'windows');}
for(const value of ['crystal','solar']){const svg=await readFile(new URL('../public/cursor-'+value+'.svg',import.meta.url),'utf8');assert.ok(svg.includes('width="32" height="32"'));}
console.log('PASS: 200 Master outcomes, reward/resale limits, pending decisions, one gift per approved account, retry after opening, wallets preserved and cursor switching.');
