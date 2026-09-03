import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {FLIGHT_STEP_MS,flightStepMs,flightMultiplier,settleFlight} from '../lib/flight-engine.mjs';
const source=await readFile(new URL('../legacy-server.mjs',import.meta.url),'utf8');
let clock=100000,user={id:'u0',displayName:'Player'},body={},writes=0,response;
class Clock extends Date {static now(){return clock;}}
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const db={economy:{globalFlight:null,casinoPlays:[],flightHistory:[]}},wallets={},accounts={};
for(let i=0;i<10;i++)wallets['u'+i]=100;
const context=vm.createContext({db,Date:Clock,Math:Object.assign(Object.create(Math),{random:()=>.99}),FLIGHT_STEP_MS,flightStepMs,flightMultiplier,settleFlight,randomUUID:()=>crypto.randomUUID(),saoPauloDayKey:()=> '2026-09-03',walletFor:id=>wallets[id]||0,addCredits:(id,n)=>wallets[id]=(wallets[id]||0)+n,casinoAccountFor:id=>accounts[id] ||= {balance:200},requireAuth:()=>({user}),readJson:async()=>body,req:{method:'POST'},res:{},route:'/api/casino/flight/start',persist:async()=>writes++,broadcastRefresh(){},stateFor:()=>({ok:true}),json:(_,status,data)=>response=data,HttpError});
vm.runInContext(source.slice(source.indexOf('function recordFlightPayout'),source.indexOf('function isTradableVisual')),context);
const handler=vm.runInContext('(async()=>{'+source.slice(source.indexOf("  if (req.method === 'POST' && route === '/api/casino/flight/start')"),source.indexOf("  if (req.method === 'POST' && route === '/api/card-album')"))+'})',context);
for(const auto of [1,1.234,13,'oops']){body={bet:10,walletSource:'shop',autoCashout:auto};await assert.rejects(handler(),e=>e.status===400);}
assert.equal(writes,0);assert.equal(db.economy.globalFlight,null);assert.equal(wallets.u0,100);
for(let i=0;i<10;i++){user={id:'u'+i};body={bet:10,walletSource:'shop',autoCashout:i===0?null:1.5};await handler();}
assert.equal(db.economy.globalFlight.bets.length,10);assert.equal(db.economy.globalFlight.stepMs,8000);
const id=db.economy.globalFlight.id;
user={id:'u0'};await assert.rejects(handler(),e=>e.status===409);assert.equal(wallets.u0,90);
context.route='/api/casino/flight/cashout';body={flightId:id,compact:true};
await assert.rejects(handler(),e=>e.status===409);
clock=db.economy.globalFlight.launchAt+4000;
await handler();assert.equal(response.flightResult.multiplier,1.5);assert.equal(wallets.u0,105);assert.equal(response.ok,undefined);
assert.ok(Object.values(wallets).every(w=>w===105));
const once=writes;await handler();assert.equal(writes,once);assert.equal(wallets.u0,105);
body={flightId:'wrong',compact:true};await assert.rejects(handler(),e=>e.status===409);assert.equal(wallets.u0,105);
context.route='/api/casino/flight/status';context.req.method='GET';await handler();
assert.equal(response.active,true);assert.equal(response.cashedOut,true);assert.equal(response.crashAt,undefined);assert.equal(response.state,undefined);
clock+=100000;await handler();assert.equal(response.crashed,true);assert.equal(db.economy.casinoPlays.length,10);
console.log('PASS: authenticated flight routes, ten shared bets, integer wallets, invalid target rejection, early/foreign cashout rejection, automatic settlement, compact response and cashout replay.');
