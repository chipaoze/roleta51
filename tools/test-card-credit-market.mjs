import assert from 'node:assert/strict';
import { cardTradingFor, updateCardTrade } from '../lib/card-album.mjs';

let sequence=0;
const id=()=>`id-${++sequence}`;
const card='exploradores:sinal';
const base=()=>({
  users:[{id:'seller',displayName:'Vendedor',active:true,approved:true},{id:'buyer',displayName:'Comprador',active:true,approved:true}],
  economy:{wallets:{seller:25,buyer:300},creditAdjustments:[],cardTradePosts:[],cardAlbums:{seller:{cards:{[card]:2},crafted:{}},buyer:{cards:{},crafted:{}}}},
});

const db=base();
updateCardTrade(db,'seller',{action:'publish',offeredId:card},id);
const post=db.economy.cardTradePosts[0];
updateCardTrade(db,'buyer',{action:'offer-market-credits',id:post.id,creditAmount:180},id);
assert.equal(cardTradingFor(db,'buyer').availableTradeCredits,120);
assert.throws(()=>updateCardTrade(db,'buyer',{action:'offer-market-credits',id:post.id,creditAmount:121},id));
const offer=post.offers[0];
updateCardTrade(db,'seller',{action:'accept-market',id:post.id,offerId:offer.id},id);
assert.deepEqual(db.economy.wallets,{seller:205,buyer:120});
assert.equal(db.economy.cardAlbums.seller.cards[card],1);
assert.equal(db.economy.cardAlbums.buyer.cards[card],1);
assert.equal(db.economy.creditAdjustments.length,2);

const reserved=base();
updateCardTrade(reserved,'seller',{action:'publish',offeredId:card},id);
assert.throws(()=>updateCardTrade(reserved,'seller',{action:'create',partnerId:'buyer',offeredId:card,wantedId:card},id));
assert.throws(()=>updateCardTrade(reserved,'seller',{action:'publish',offeredId:card},id));
assert.equal(cardTradingFor(reserved,'seller').reservedOfferCardIds.includes(card),true);

const cancelled=base();
updateCardTrade(cancelled,'seller',{action:'publish',offeredId:card},id);
const cancelledPost=cancelled.economy.cardTradePosts[0];
updateCardTrade(cancelled,'buyer',{action:'offer-market-credits',id:cancelledPost.id,creditAmount:90},id);
updateCardTrade(cancelled,'buyer',{action:'cancel-market-offer',id:cancelledPost.id,offerId:cancelledPost.offers[0].id},id);
assert.equal(cardTradingFor(cancelled,'buyer').availableTradeCredits,300);
assert.deepEqual(cancelled.economy.wallets,{seller:25,buyer:300});

console.log('PASS: credit offers reserve available balance, cards cannot be listed twice, and reservations release on cancellation.');
