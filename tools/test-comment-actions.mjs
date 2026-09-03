import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  const wallCommentMatch ='),source.indexOf("  if (req.method === 'POST' && route === '/api/daily-wall/comments')"));
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
let user={id:'stranger',role:'member'},body={message:'changed'},saves=0;
const comment={id:'c',userId:'author',message:'original',createdAt:'2026-09-02T10:00:00Z'};
const db={dailyMemes:[{id:'p',comments:[comment]}],dailyPhrases:[]};
const ctx={req:{method:'PATCH'},route:'/api/daily-wall/comments/meme/p/c',db,HttpError,updateCommentMentions(){},requireAuth:()=>({user}),readJson:async()=>body,persist:async()=>{saves++;},broadcastRefresh(){},json(){},res:{},stateFor(){}};
const handler=vm.runInNewContext('(async function(){'+code+'})',ctx);
await assert.rejects(handler(),e=>e.status===403);assert.equal(saves,0);
user={id:'author',role:'member'};await handler();assert.equal(comment.message,'changed');assert.equal(comment.createdAt,'2026-09-02T10:00:00Z');assert.ok(comment.updatedAt);
for(const message of ['', ' ', 'a'.repeat(301)]){body={message};await assert.rejects(handler(),e=>e.status===400);}
user={id:'admin',role:'admin'};body={message:'admin edit'};await assert.rejects(handler(),e=>e.status===403);
ctx.req.method='DELETE';await handler();assert.equal(db.dailyMemes[0].comments.length,0);
await assert.rejects(handler(),e=>e.status===404);
const reactionsCode=source.slice(source.indexOf('function reactionsFor('),source.indexOf('function activeLieReasons('));
const reactions=vm.runInNewContext(reactionsCode+'; reactionsFor',{WALL_EMOJIS:['❤️'],db:{dailyReactions:[{targetType:'meme',targetId:'p',userId:'author',emoji:'❤️'}],users:[{id:'author',displayName:'Ana'}]}});
assert.equal(reactions('meme','p','author').people[0].name,'Ana');
console.log('PASS: comment permissions, limits, dates, deletion and reactor names.');
