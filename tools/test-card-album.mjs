import assert from 'node:assert/strict';
import {CARD_COLLECTIONS,albumFor,updateAlbum} from '../lib/card-album.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const db={economy:{wallets:{u:123},purchases:[{id:'original'}]}},before=JSON.stringify(db);
assert.equal(CARD_COLLECTIONS.length,5);assert.equal(new Set(CARD_COLLECTIONS.flatMap(c=>c.cards.map(([id])=>c.id+':'+id))).size,25);
const empty=albumFor(db,'u');assert.equal(empty.collections.length,5);assert.ok(empty.collections.every(c=>c.cards.length===5&&!c.canCraft));assert.equal(JSON.stringify(db),before);
assert.throws(()=>updateAlbum(db,'u','craft','aurora'));assert.throws(()=>updateAlbum(db,'u','equip','aurora'));assert.equal(JSON.stringify(db),before);
db.economy.cardAlbums={u:{cards:{},crafted:{}}};
for(const collection of CARD_COLLECTIONS){
  const keys=collection.cards.map(([id])=>collection.id+':'+id);
  keys.forEach(k=>db.economy.cardAlbums.u.cards[k]=2);
  db.economy.cardAlbums.u.cards[keys[4]]=0;
  const missing=JSON.stringify(db);assert.throws(()=>updateAlbum(db,'u','craft',collection.id));assert.equal(JSON.stringify(db),missing);
  db.economy.cardAlbums.u.cards[keys[4]]=2;
  assert.equal(updateAlbum(db,'u','craft',collection.id),true);assert.ok(keys.every(k=>db.economy.cardAlbums.u.cards[k]===1));
  const crafted=JSON.stringify(db);assert.equal(updateAlbum(db,'u','craft',collection.id),false);assert.equal(JSON.stringify(db),crafted);
  assert.equal(updateAlbum(db,'u','equip',collection.id),true);assert.equal(albumFor(db,'u').equipped,collection.id);
}
assert.equal(updateAlbum(db,'u','equip',null),true);assert.equal(albumFor(db,'u').equipped,null);
assert.throws(()=>updateAlbum(db,'other','craft','aurora'));assert.throws(()=>updateAlbum(db,'u','craft','unknown'));
assert.equal(db.economy.wallets.u,123);assert.deepEqual(db.economy.purchases,[{id:'original'}]);
db.economy.cardAlbums.other={cards:{'aurora:cristal':1.5}};
assert.equal(albumFor(db,'other').collections[1].cards[0].count,0);
const src=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
let writes=0,body={action:'craft',collectionId:'aurora'},response;
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const ctx=vm.createContext({req:{method:'POST'},res:{},route:'/api/card-album',requireAuth:()=>({user:{id:'other'}}),readJson:async()=>body,db,updateAlbum,HttpError,persist:async()=>writes++,broadcastRefresh(){},json:(_,s,data)=>response=data,stateFor:()=>({ok:true}),updateCardTrade:()=>{throw Error('unexpected route');}});
const handler=vm.runInContext('(async()=>{'+src.slice(src.indexOf("  if (req.method === 'POST' && route === '/api/card-album')"),src.indexOf('  if (await handleCommunityExtras'))+'})',ctx);
await assert.rejects(handler(),e=>e.status===400);assert.equal(writes,0);
ctx.requireAuth=()=>({user:{id:'u'}});await handler();assert.equal(writes,0);assert.equal(response.ok,true);
console.log('PASS: 5x5 catalog, read-only empty album, all-or-nothing craft, duplicates retained, replay safe, ownership, equip/remove, HTTP checks, no wallet/purchase changes.');
