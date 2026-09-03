import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {openCardPack,pickAlbumCard,albumFor,CARD_COLLECTIONS} from '../lib/card-album.mjs';
const db={users:[],economy:{purchases:[{id:'pack',userId:'a',itemId:'card-pack-cosmic',price:120}],wallets:{a:880}}};
let calls=0;
const opened=openCardPack(db,'a','pack',()=>{calls++;return .5;});
assert.equal(opened.changed,true);assert.equal(opened.cards.length,3);assert.ok(opened.cards.every(c=>c.rarity==='basic'));
const snapshot=JSON.stringify(db);
assert.equal(openCardPack(db,'a','pack',()=>{throw Error('Must not reroll');}).changed,false);
assert.equal(JSON.stringify(db),snapshot);
assert.throws(()=>openCardPack(db,'b','pack'));assert.throws(()=>openCardPack(db,'a','unknown'));
assert.equal(db.economy.wallets.a,880);
assert.equal(Object.values(db.economy.cardAlbums.a.cards).reduce((a,b)=>a+b,0),3);
assert.equal(pickAlbumCard(()=>0).rarity,'rare');
assert.equal(pickAlbumCard(()=>.1).rarity,'basic');
assert.equal(albumFor(db,'a').collections.flatMap(c=>c.cards).filter(c=>c.rarity==='rare').length,5);
for(const c of CARD_COLLECTIONS)assert.equal(c.cards.length,5);
let rare=0;for(let i=0;i<10000;i++){let first=true;const card=pickAlbumCard(()=>{if(first){first=false;return i/10000;}return .3;});if(card.rarity==='rare')rare++;}
assert.equal(rare,1000);
const source=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
const ctx=vm.createContext({db,randomInt:()=>0,randomUUID:()=>crypto.randomUUID(),SHOP_CATALOG:[],walletFor:()=>0,addCredits(){throw Error('Physical reward must not credit wallet');},Math:Object.create(Math)});
const block=source.slice(source.indexOf('function physicalKitClaim()'),source.indexOf('function addMysteryBox('));
vm.runInContext(block,ctx);
const box={id:'box-master-imperial',creditChance:1,creditMin:10,creditMax:10};
const prize=ctx.grantMysteryBoxReward({id:'a'},box);
assert.equal(prize.kind,'physical');assert.equal(db.economy.physicalKitClaim.userId,'a');
// A later winning random draw must use normal digital rewards; it cannot reassign stock.
ctx.addCredits=()=>{};db.economy.creditAdjustments=[];
const second=ctx.grantMysteryBoxReward({id:'b'},box);
assert.equal(second.kind,'credits');assert.equal(db.economy.physicalKitClaim.userId,'a');
delete db.economy.physicalKitClaim;ctx.randomInt=()=>10;
assert.equal(ctx.grantMysteryBoxReward({id:'b'},box).kind,'credits');
assert.equal(db.economy.physicalKitClaim,undefined);
ctx.randomInt=()=>0;
assert.equal(ctx.grantMysteryBoxReward({id:'b'},{...box,id:'box-master-aurora'}).kind,'credits');
assert.equal(db.economy.physicalKitClaim,undefined);
// Opening the same packet through the authenticated route is also repeat-safe.
let body={purchaseId:'pack'},writes=0,response;
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
Object.assign(ctx,{openCardPack,req:{method:'POST'},res:{},route:'/api/card-packs/open',requireAuth:()=>({user:{id:'a'}}),readJson:async()=>body,persist:async()=>writes++,broadcastRefresh(){},json:(_,status,data)=>response=data,stateFor:()=>({ok:true}),HttpError});
const handler=vm.runInContext('(async()=>{'+source.slice(source.indexOf("  if (req.method === 'POST' && route === '/api/card-packs/open')"),source.indexOf("  if (req.method === 'POST' && route === '/api/mystery-boxes/open')"))+'})',ctx);
await handler();assert.equal(writes,0);assert.equal(response.cardPackResult.length,3);
ctx.requireAuth=()=>({user:{id:'b'}});await assert.rejects(handler(),e=>e.status===400);assert.equal(writes,0);
console.log('PASS: 3 cards, rarity threshold 10%, one rare per collection, purchase ownership, repeat-safe opening, no extra debit, single physical kit, 0.1% threshold, only most expensive chest.');
