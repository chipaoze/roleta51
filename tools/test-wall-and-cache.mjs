import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const imageStore = new Map();
const cache = vm.runInNewContext(source.slice(source.indexOf('function cacheImage('),source.indexOf('async function storeImage('))+';cacheImage', {imageStore,MAX_IMAGE_CACHE:16});
for(let i=0;i<100;i++)cache(String(i),{buffer:{length:5}});
assert.equal(imageStore.size,3);
cache('oversize',{buffer:{length:20}}); assert.equal(imageStore.has('oversize'),false);
assert.ok([...imageStore.values()].reduce((s,v)=>s+v.buffer.length,0)<=16);
const route=source.slice(source.indexOf('  const wallPostMatch ='),source.indexOf("  if (req.method === 'POST' && route === '/api/daily-wall/comments')"));
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const db={dailyMemes:[{id:'photo',userId:'owner',caption:'before',filename:'photo.png'}],dailyPhrases:[{id:'text',userId:'owner',phrase:'before'}],dailyReactions:[]};
let user={id:'other',role:'member'}, body={text:'after'}, persisted=0;
const ctx={db,HttpError,req:{method:'PATCH'},route:'/api/daily-wall/posts/meme/photo',requireAuth:()=>({user}),readJson:async()=>body,persist:async()=>{persisted++;},broadcastRefresh(){},json(){},res:{},stateFor:()=>({}),deleteStoredImage:async()=>{}};
const handler=vm.runInNewContext('(async function(){'+route+'})',ctx);
await assert.rejects(handler(),e=>e.status===403); assert.equal(persisted,0);
user={id:'owner',role:'member'}; await handler(); assert.equal(db.dailyMemes[0].caption,'after');
body={text:'x'.repeat(501)}; await assert.rejects(handler(),e=>e.status===400);
ctx.req.method='DELETE'; user={id:'other',role:'member'}; await assert.rejects(handler(),e=>e.status===403);
user={id:'admin',role:'admin'}; await handler(); assert.equal(db.dailyMemes.length,0);
const emojis=vm.runInNewContext(source.match(/const WALL_EMOJIS = (.*);/)[1]); assert.equal(emojis.length,12);
console.log('PASS: bounded image cache, author edit, denied stranger edit/delete, admin delete, text limit, 12 reactions.');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const effectCode = app.slice(app.indexOf('  const personalCursor ='),app.indexOf("  document.documentElement.classList.toggle('unicorn-cursor-active', Boolean"));
for(const forced of [false,true]) {
  const document={body:{dataset:{}}};
  vm.runInNewContext(effectCode,{document,forcedGayCursor:false,forcedGiantCursor:forced,cursorItem:{value:'galinha-preta'},trailItem:null,$$:()=>[]});
  assert.equal(document.body.dataset.cursorEffect,forced?'':'galinha-preta');
}
console.log('PASS: giant suspends hen text; ordinary cursor restores its effect.');
