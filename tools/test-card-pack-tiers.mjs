import assert from 'node:assert/strict';
import {CARD_PACK_RULES,pickAlbumCard,openCardPack} from '../lib/card-album.mjs';

assert.deepEqual(Object.keys(CARD_PACK_RULES),['card-pack-cosmic','card-pack-stellar','card-pack-legendary']);
const sequence=(...values)=>()=>values.shift() ?? 0;
assert.equal(pickAlbumCard(sequence(.15,0),.10).rarity,'basic');
assert.equal(pickAlbumCard(sequence(.15,0),.18).rarity,'rare');
assert.equal(pickAlbumCard(sequence(.27,0),.28).rarity,'rare');

for(const itemId of Object.keys(CARD_PACK_RULES)){
  const db={economy:{purchases:[{id:'p',userId:'u',itemId}],cardAlbums:{}}};
  const first=openCardPack(db,'u','p',()=>.99);
  assert.equal(first.changed,true);assert.equal(first.cards.length,3);
  const saved=JSON.stringify(db.economy.cardAlbums);
  const replay=openCardPack(db,'u','p',()=>0);
  assert.equal(replay.changed,false);assert.equal(JSON.stringify(db.economy.cardAlbums),saved);
}
assert.throws(()=>openCardPack({economy:{purchases:[]}},'u','missing'));
console.log('PASS: três faixas, chances próprias, 3 cartas e abertura idempotente.');
