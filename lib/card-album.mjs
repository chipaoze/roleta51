export const CARD_COLLECTIONS = [
  {id:'exploradores',name:'Exploradores do Desconhecido',badge:'Comandante da Expedição',icon:'🛸',color:'violet',cards:[
    ['sinal','Primeiro Sinal','📡'],['tripulante','Tripulante 51','👽'],['nave','Nave Mãe','🛸'],['planeta','Planeta Perdido','🪐'],['portal','Portal Estelar','🌀']
  ]},
  {id:'aurora',name:'Fragmentos da Aurora',badge:'Guardião da Aurora',icon:'💎',color:'aqua',cards:[
    ['cristal','Cristal Boreal','💎'],['cometa','Cometa Esmeralda','☄️'],['lua','Lua de Gelo','🌙'],['nebulosa','Nebulosa Viva','🌌'],['estrela','Estrela Polar','✨']
  ]},
  {id:'lendas',name:'Lendas da Área 51',badge:'Lenda Cósmica',icon:'🏆',color:'gold',cards:[
    ['unicornio','Unicórnio Cósmico','🦄'],['galinha','Galinha do Eclipse','🐔'],['oraculo','Oráculo Alienígena','🔮'],['coroa','Coroa Estelar','👑'],['reliquia','Relíquia 51','🏺']
  ]},
  {id:'abismo',name:'Segredos do Abismo',badge:'Vigia das Profundezas',icon:'🐙',color:'aqua',cards:[
    ['farol','Farol Submerso','🔦'],['polvo','Polvo Astral','🐙'],['perola','Pérola Lunar','🦪'],['ruinas','Ruínas do Oceano','🏛️'],['tridente','Tridente Abissal','🔱']
  ]},
  {id:'forja',name:'Forja das Estrelas',badge:'Artífice Solar',icon:'⚒️',color:'gold',cards:[
    ['brasa','Brasa Celeste','🔥'],['martelo','Martelo de Órion','🔨'],['metal','Metal Meteórico','☄️'],['escudo','Escudo do Sol','🛡️'],['faisca','Faísca Primordial','⚡']
  ]}
];
const count = value => Number.isSafeInteger(value) && value>0 ? value : 0;
export function albumFor(db,userId,dayKey='') {
  const saved=db.economy.cardAlbums?.[userId] || {};
  return {distributionEnabled:true,equipped:saved.equipped || null,dropsToday:saved.daily?.dayKey===dayKey?saved.daily.drops:0,attemptsToday:saved.daily?.dayKey===dayKey?Object.keys(saved.daily.attempts || {}).length:0,recentDrops:saved.drops || [],trading:cardTradingFor(db,userId),collections:CARD_COLLECTIONS.map(c=>{
    const cards=c.cards.map(([id,name,icon],i)=>({id:c.id+':'+id,name,icon,rarity:i===4?'rare':'basic',count:count(saved.cards?.[c.id+':'+id])}));
    const craftedAt=saved.crafted?.[c.id] || null;
    return {...c,cards,craftedAt,collected:cards.filter(c=>c.count>0).length,canCraft:!craftedAt && cards.every(c=>c.count>0)};
  })};
}
export function updateAlbum(db,userId,action,collectionId) {
  const collection=CARD_COLLECTIONS.find(c=>c.id===collectionId);
  const saved=db.economy.cardAlbums?.[userId];
  const fail=message=>{throw new Error(message);};
  if(action==='equip' && collectionId===null) {
    if(!saved?.equipped)return false;saved.equipped=null;return true;
  }
  if(!collection)fail('Coleção não encontrada.');
  if(action==='craft') {
    if(saved?.crafted?.[collection.id])return false;
    const keys=collection.cards.map(([id])=>collection.id+':'+id);
    if(!keys.every(key=>count(saved?.cards?.[key])>0))fail('Reúna as cinco cartas diferentes desta coleção para montar a insígnia.');
    // All checks precede the single persisted transaction; repeats never consume again.
    for(const key of keys)saved.cards[key]-=1;
    saved.crafted ||= {};saved.crafted[collection.id]=new Date().toISOString();
    return true;
  }
  if(action==='equip') {
    if(!saved?.crafted?.[collection.id])fail('Monte esta insígnia antes de usá-la.');
    if(saved.equipped===collection.id)return false;saved.equipped=collection.id;return true;
  }
  fail('Ação inválida.');
}
export function awardEngagementCard(db,userId,kind,dayKey,random=Math.random) {
  if(!['water','meme','phrase','comment','vote'].includes(kind))return null;
  db.economy.cardAlbums ||= {};
  const saved=db.economy.cardAlbums[userId] ||= {cards:{},crafted:{}};
  saved.cards ||= {};
  if(saved.daily?.dayKey!==dayKey)saved.daily={dayKey,attempts:{},drops:0};
  if(saved.daily.attempts[kind] || saved.daily.drops>=2)return null;
  saved.daily.attempts[kind]=true;
  if(random()>=.4)return null;
  const card=pickAlbumCard(random);
  saved.cards[card.id]=count(saved.cards[card.id])+1;saved.daily.drops++;
  const drop={...card,eventId:dayKey+':'+kind,kind,createdAt:new Date().toISOString()};
  saved.drops=[...(saved.drops || []),drop].slice(-20);
  return drop;
}
export function pickAlbumCard(random=Math.random) {
  const rare=random()<.1;
  const pool=CARD_COLLECTIONS.flatMap(c=>c.cards.map(([id,name,icon],i)=>({id:c.id+':'+id,name,icon,rarity:i===4?'rare':'basic'}))).filter(c=>(c.rarity==='rare')===rare);
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
}
export function openCardPack(db,userId,purchaseId,random=Math.random) {
  const purchase=db.economy.purchases.find(p=>p.id===purchaseId && p.userId===userId && p.itemId==='card-pack-cosmic');
  if(!purchase)throw new Error('Pacote não encontrado no seu perfil.');
  if(purchase.cardPackRewards)return {changed:false,cards:purchase.cardPackRewards};
  const cards=Array.from({length:3},()=>pickAlbumCard(random));
  db.economy.cardAlbums ||= {};const saved=db.economy.cardAlbums[userId] ||= {cards:{},crafted:{}};
  saved.cards ||= {};
  for(const card of cards)saved.cards[card.id]=count(saved.cards[card.id])+1;
  purchase.cardPackRewards=cards;purchase.cardPackOpenedAt=new Date().toISOString();
  return {changed:true,cards};
}
function cardCatalog() {return new Map(CARD_COLLECTIONS.flatMap(c=>c.cards.map(([id,name,icon])=>[c.id+':'+id,{name,icon}])));}
export function cardTradingFor(db,userId) {
  const catalog=cardCatalog();
  return {partners:(db.users || []).filter(u=>u.active && u.approved!==false).map(u=>({id:u.id,name:u.displayName,cards:Object.entries(db.economy.cardAlbums?.[u.id]?.cards || {}).filter(([id,n])=>catalog.has(id)&&count(n)>=2).map(([id,n])=>({id,count:n,...catalog.get(id)}))})),
    trades:(db.economy.cardTrades || []).filter(t=>t.fromId===userId || t.toId===userId).slice(-20).reverse().map(t=>({...t,incoming:t.toId===userId,partnerName:db.users.find(u=>u.id===(t.fromId===userId?t.toId:t.fromId))?.displayName || 'Conta removida',offeredName:catalog.get(t.offeredId)?.name || t.offeredId,wantedName:catalog.get(t.wantedId)?.name || t.wantedId,status:t.status==='pending'&&Date.parse(t.expiresAt)<=Date.now()?'expired':t.status}))};
}
export function updateCardTrade(db,userId,body,idFactory) {
  const fail=message=>{throw new Error(message);},now=new Date().toISOString(),catalog=cardCatalog();
  if(body.action==='create'){
    const partner=db.users.find(u=>u.id===body.partnerId && u.id!==userId && u.active && u.approved!==false);
    if(!partner || body.offeredId===body.wantedId || !catalog.has(body.offeredId) || !catalog.has(body.wantedId))fail('Selecione outro participante e duas cartas diferentes.');
    if(count(db.economy.cardAlbums?.[userId]?.cards?.[body.offeredId])<2 || count(db.economy.cardAlbums?.[partner.id]?.cards?.[body.wantedId])<2)fail('Só cartas repetidas podem ser trocadas. É preciso manter uma na coleção.');
    db.economy.cardTrades ||= [];
    const pending=db.economy.cardTrades.filter(t=>t.status==='pending'&&Date.parse(t.expiresAt)>Date.now());
    if(pending.filter(t=>t.fromId===userId).length>=3)fail('Limite de três propostas de cartas pendentes.');
    if(pending.some(t=>t.fromId===userId&&t.toId===partner.id&&t.offeredId===body.offeredId&&t.wantedId===body.wantedId))fail('Esta proposta já foi enviada.');
    db.economy.cardTrades.push({id:idFactory(),fromId:userId,toId:partner.id,offeredId:body.offeredId,wantedId:body.wantedId,status:'pending',createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+86400000).toISOString()});
    return true;
  }
  const trade=(db.economy.cardTrades || []).find(t=>t.id===body.id && (t.fromId===userId || t.toId===userId));
  if(!trade)fail('Proposta não encontrada.');
  if(!['accept','reject','cancel'].includes(body.action))fail('Ação inválida.');
  if(body.action==='cancel'?trade.fromId!==userId:trade.toId!==userId)fail('Esta ação pertence à outra pessoa.');
  if(trade.status!=='pending')return false;
  if(Date.parse(trade.expiresAt)<=Date.now())fail('A proposta expirou.');
  if(body.action==='accept'){
    if(![trade.fromId,trade.toId].every(id=>db.users.some(u=>u.id===id&&u.active&&u.approved!==false)))fail('Participante indisponível.');
    const a=db.economy.cardAlbums?.[trade.fromId]?.cards,b=db.economy.cardAlbums?.[trade.toId]?.cards;
    if(count(a?.[trade.offeredId])<2 || count(b?.[trade.wantedId])<2)fail('Uma carta deixou de ser repetida. Recuse a proposta e crie outra.');
    a[trade.offeredId]--;b[trade.wantedId]--;
    a[trade.wantedId]=count(a[trade.wantedId])+1;b[trade.offeredId]=count(b[trade.offeredId])+1;
    trade.status='accepted';
  }else trade.status=body.action==='reject'?'rejected':'cancelled';
  trade.updatedAt=now;return true;
}
