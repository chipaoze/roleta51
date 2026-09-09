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
    ['brasa','Brasa Celeste','🔥'],['martelo','Martelo de Órion','🔨'],['metal','Metal Meteórico','🔩'],['escudo','Escudo do Sol','🛡️'],['faisca','Faísca Primordial','⚡']
  ]},
  {id:'cronicas',name:'Crônicas da Tripulação',badge:'Arquivista da Área 51',icon:'📜',color:'violet',cards:[
    ['mural','Mural Perdido','🖼️'],['roleta','Roleta Dourada','🎡'],['copo','Copo Infinito','💧'],['segredo','Segredo de Hangar','🔐'],['cometa','Cometa da Memória','🌠']
  ]},
  {id:'cassino',name:'Fortuna Intergaláctica',badge:'Mestre da Fortuna',icon:'🎰',color:'gold',cards:[
    ['ficha','Ficha 51','🪙'],['bau','Baú de Órion','🎁'],['nave','Nave do Voo','🚀'],['unicornio','Unicórnio da Sorte','🎠'],['jackpot','Jackpot Alienígena','👾']
  ]},
  {id:'santuarios',name:'Santuários Cósmicos',badge:'Guardião dos Santuários',icon:'🕯️',color:'aqua',cards:[
    ['portal','Portal Sagrado','🧿'],['vela','Vela Estelar','🕯️'],['lua','Lua Ritual','🌗'],['flor','Flor do Axé','🌺'],['oraculo','Oráculo Ancestral','📿']
  ]}
];
const count = value => Number.isSafeInteger(value) && value>0 ? value : 0;
const craftedCount = (value, legacyLevel=0) => {
  if (Number.isSafeInteger(value)) return Math.max(0, Math.min(4, value));
  if (value && Number.isSafeInteger(value.count)) return Math.max(0, Math.min(4, value.count));
  // Insígnias antigas eram gravadas como data; o nível seguia a ordem de montagem.
  return value ? Math.max(1, Math.min(4, legacyLevel || 1)) : 0;
};
const craftedAt = value => typeof value === 'string' ? value : value?.updatedAt || value?.createdAt || null;
const medalForCraftCount = crafts => crafts===1?{tier:'bronze',label:'Bronze',icon:'🥉'}:crafts===2?{tier:'silver',label:'Prata',icon:'🥈'}:crafts===3?{tier:'gold',label:'Ouro',icon:'🥇'}:crafts>=4?{tier:'diamond',label:'Diamante',icon:'💎'}:null;
export function albumFor(db,userId,dayKey='') {
  const saved=db.economy.cardAlbums?.[userId] || {};
  const legacyLevels=new Map(Object.entries(saved.crafted || {}).filter(([,value])=>typeof value==='string').sort(([,a],[,b])=>String(a).localeCompare(String(b))).map(([id],index)=>[id,Math.min(4,index+1)]));
  return {distributionEnabled:true,equipped:saved.equipped || null,dropsToday:saved.daily?.dayKey===dayKey?saved.daily.drops:0,attemptsToday:saved.daily?.dayKey===dayKey?Object.keys(saved.daily.attempts || {}).length:0,recentDrops:saved.drops || [],trading:cardTradingFor(db,userId),collections:CARD_COLLECTIONS.map(c=>{
    const cards=c.cards.map(([id,name,icon],i)=>({id:c.id+':'+id,name,icon,rarity:i===4?'rare':'basic',count:count(saved.cards?.[c.id+':'+id])}));
    const crafted=saved.crafted?.[c.id],crafts=craftedCount(crafted,legacyLevels.get(c.id));
    return {...c,cards,craftedAt:craftedAt(crafted),crafts,medal:medalForCraftCount(crafts),collected:cards.filter(c=>c.count>0).length,canCraft:crafts<4 && cards.every(c=>c.count>0)};
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
    const legacyLevels=new Map(Object.entries(saved?.crafted || {}).filter(([,value])=>typeof value==='string').sort(([,a],[,b])=>String(a).localeCompare(String(b))).map(([id],index)=>[id,Math.min(4,index+1)]));
    const previousCrafts=craftedCount(saved?.crafted?.[collection.id],legacyLevels.get(collection.id));
    if(previousCrafts>=4)return false;
    const keys=collection.cards.map(([id])=>collection.id+':'+id);
    if(!keys.every(key=>count(saved?.cards?.[key])>0))fail('Reúna as cinco cartas diferentes desta coleção para montar a insígnia.');
    for(const key of keys)saved.cards[key]-=1;
    saved.crafted ||= {};saved.crafted[collection.id]={count:previousCrafts+1,updatedAt:new Date().toISOString()};
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
export const CARD_PACK_RULES = Object.freeze({
  'card-pack-cosmic': {cards:3,rareChance:.10},
  'card-pack-stellar': {cards:3,rareChance:.18},
  'card-pack-legendary': {cards:3,rareChance:.28},
});
export function pickAlbumCard(random=Math.random,rareChance=.1) {
  const rare=random()<Math.max(0,Math.min(1,Number(rareChance)||0));
  const pool=CARD_COLLECTIONS.flatMap(c=>c.cards.map(([id,name,icon],i)=>({id:c.id+':'+id,name,icon,rarity:i===4?'rare':'basic'}))).filter(c=>(c.rarity==='rare')===rare);
  return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
}
export function openCardPack(db,userId,purchaseId,random=Math.random) {
  const purchase=db.economy.purchases.find(p=>p.id===purchaseId && p.userId===userId && CARD_PACK_RULES[p.itemId]);
  if(!purchase)throw new Error('Pacote não encontrado no seu perfil.');
  if(purchase.cardPackRewards)return {changed:false,cards:purchase.cardPackRewards};
  const rule=CARD_PACK_RULES[purchase.itemId];
  const cards=Array.from({length:rule.cards},()=>pickAlbumCard(random,rule.rareChance));
  db.economy.cardAlbums ||= {};const saved=db.economy.cardAlbums[userId] ||= {cards:{},crafted:{}};
  saved.cards ||= {};
  for(const card of cards)saved.cards[card.id]=count(saved.cards[card.id])+1;
  purchase.cardPackRewards=cards;purchase.cardPackOpenedAt=new Date().toISOString();
  return {changed:true,cards};
}
function cardCatalog() {return new Map(CARD_COLLECTIONS.flatMap(c=>c.cards.map(([id,name,icon])=>[c.id+':'+id,{name,icon}])));}
function reservedTradeCredits(db,userId,ignoredOfferId='') {
  return (db.economy.cardTradePosts || []).filter(post=>post.status==='open').flatMap(post=>post.offers || [])
    .filter(offer=>offer.id!==ignoredOfferId&&offer.fromId===userId&&offer.status!=='rejected'&&Number.isInteger(offer.creditAmount)&&offer.creditAmount>0)
    .reduce((sum,offer)=>sum+offer.creditAmount,0);
}
function reservedCardCopies(db,userId,cardId,ignored={}) {
  const posts=(db.economy.cardTradePosts || []).filter(post=>post.status==='open'&&post.fromId===userId&&post.offeredId===cardId&&post.id!==ignored.postId).length;
  const offers=(db.economy.cardTradePosts || []).flatMap(post=>(post.offers || []).map(offer=>({post,offer}))).filter(({post,offer})=>post.status==='open'&&offer.status!=='rejected'&&offer.fromId===userId&&offer.cardId===cardId&&offer.id!==ignored.offerId).length;
  const direct=(db.economy.cardTrades || []).filter(trade=>trade.status==='pending'&&Date.parse(trade.expiresAt)>Date.now()&&trade.id!==ignored.tradeId&&((trade.fromId===userId&&trade.offeredId===cardId)||(trade.toId===userId&&trade.wantedId===cardId))).length;
  return posts+offers+direct;
}
function hasFreeDuplicate(db,userId,cardId,ignored={}) { return count(db.economy.cardAlbums?.[userId]?.cards?.[cardId])-reservedCardCopies(db,userId,cardId,ignored)>=2; }
export function cardTradingFor(db,userId) {
  const catalog=cardCatalog();
  const personName=id=>db.users.find(u=>u.id===id)?.displayName || 'Conta removida';
  const openPosts=(db.economy.cardTradePosts || []).filter(post=>post.status==='open');
  const reservedOfferCardIds=[...new Set([...openPosts.filter(post=>post.fromId===userId).map(post=>post.offeredId),...openPosts.flatMap(post=>(post.offers || []).filter(offer=>offer.fromId===userId&&offer.status!=='rejected').map(offer=>offer.cardId)),...(db.economy.cardTrades || []).filter(trade=>trade.status==='pending'&&Date.parse(trade.expiresAt)>Date.now()&&trade.fromId===userId).map(trade=>trade.offeredId)])];
  const market=openPosts.slice(-30).reverse().map(post=>({
    ...post,fromName:personName(post.fromId),mine:post.fromId===userId,viewerHasOfferedCard:count(db.economy.cardAlbums?.[userId]?.cards?.[post.offeredId])>0,offeredName:catalog.get(post.offeredId)?.name || post.offeredId,offeredIcon:catalog.get(post.offeredId)?.icon || '🎴',
    offers:(post.offers || []).filter(offer=>offer.status!=='rejected').map(offer=>({...offer,fromName:personName(offer.fromId),cardName:catalog.get(offer.cardId)?.name || offer.cardId,cardIcon:catalog.get(offer.cardId)?.icon || '🎴',viewerHasCard:count(db.economy.cardAlbums?.[userId]?.cards?.[offer.cardId])>0,sameCard:offer.cardId===post.offeredId}))
  }));
  for(const post of market)for(const offer of post.offers)if(offer.creditAmount)Object.assign(offer,{offerKind:'credits',cardName:offer.creditAmount+' créditos',cardIcon:'\u{1FA99}',viewerHasCard:false,sameCard:false});
  const wallet=Math.max(0,Number(db.economy.wallets?.[userId] || 0)),reservedOfferCredits=reservedTradeCredits(db,userId);
  return {partners:(db.users || []).filter(u=>u.active && u.approved!==false).map(u=>({id:u.id,name:u.displayName,cards:Object.entries(db.economy.cardAlbums?.[u.id]?.cards || {}).filter(([id])=>catalog.has(id)&&hasFreeDuplicate(db,u.id,id)).map(([id,n])=>({id,count:n,viewerCount:count(db.economy.cardAlbums?.[userId]?.cards?.[id]),...catalog.get(id)}))})),market,reservedOfferCardIds,reservedOfferCredits,availableTradeCredits:Math.max(0,wallet-reservedOfferCredits),
    trades:(db.economy.cardTrades || []).filter(t=>t.fromId===userId || t.toId===userId).slice(-20).reverse().map(t=>({...t,incoming:t.toId===userId,partnerName:db.users.find(u=>u.id===(t.fromId===userId?t.toId:t.fromId))?.displayName || 'Conta removida',offeredName:catalog.get(t.offeredId)?.name || t.offeredId,wantedName:catalog.get(t.wantedId)?.name || t.wantedId,status:t.status==='pending'&&Date.parse(t.expiresAt)<=Date.now()?'expired':t.status}))};
}
export function updateCardTrade(db,userId,body,idFactory) {
  const fail=message=>{throw new Error(message);},now=new Date().toISOString(),catalog=cardCatalog();
  db.economy.cardTradePosts ||= [];
  const myCards=db.economy.cardAlbums?.[userId]?.cards || {};
  if(body.action==='publish'){
    if(!catalog.has(body.offeredId)||!hasFreeDuplicate(db,userId,body.offeredId))fail('Essa carta já está reservada em outra negociação ou não possui cópia livre para publicar.');
    if(db.economy.cardTradePosts.some(post=>post.fromId===userId&&post.offeredId===body.offeredId&&post.status==='open'))fail('Esta carta já está publicada no seu mural de trocas. Retire o anúncio atual antes de publicar novamente.');
    if(db.economy.cardTradePosts.filter(post=>post.fromId===userId&&post.status==='open').length>=3)fail('Você já tem três ofertas públicas abertas.');
    db.economy.cardTradePosts.push({id:idFactory(),fromId:userId,offeredId:body.offeredId,status:'open',offers:[],createdAt:now,updatedAt:now});return true;
  }
  if(body.action==='offer-market'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.status==='open');
    if(!post||post.fromId===userId||!catalog.has(body.cardId)||!hasFreeDuplicate(db,userId,body.cardId))fail('Oferta indisponível ou a carta já está reservada em outra negociação.');
    if(db.economy.cardTradePosts.some(item=>item.status==='open'&&(item.offers || []).some(offer=>offer.status!=='rejected'&&offer.fromId===userId&&offer.cardId===body.cardId)))fail('Esta carta já está reservada em outra oferta. Cancele ou aguarde o encerramento antes de oferecê-la novamente.');
    post.offers ||= [];if(post.offers.some(offer=>offer.status!=='rejected'&&offer.fromId===userId))fail('Você já enviou uma oferta para esta carta.');
    post.offers.push({id:idFactory(),fromId:userId,cardId:body.cardId,createdAt:now});post.updatedAt=now;return true;
  }
  if(body.action==='offer-market-credits'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.status==='open');
    const amount=Number(body.creditAmount);
    if(!post||post.fromId===userId)fail('Esta carta não está disponível para compra.');
    if(!Number.isInteger(amount)||amount<1||amount>5000)fail('Ofereça um valor inteiro entre 1 e 5.000 créditos.');
    const wallet=Math.max(0,Number(db.economy.wallets?.[userId] || 0));
    if(amount>wallet-reservedTradeCredits(db,userId))fail('Seu saldo disponível para ofertas é insuficiente. Retire outra oferta ou diminua o valor.');
    post.offers ||= [];if(post.offers.some(offer=>offer.status!=='rejected'&&offer.fromId===userId))fail('Você já enviou uma oferta para esta carta.');
    post.offers.push({id:idFactory(),fromId:userId,creditAmount:amount,createdAt:now});post.updatedAt=now;return true;
  }
  if(body.action==='accept-market'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.fromId===userId&&item.status==='open');const offer=post?.offers?.find(item=>item.id===body.offerId&&item.status!=='rejected');
    if(!post||!offer)fail('Oferta pública não encontrada.');db.economy.cardAlbums ||= {};const buyerAlbum=db.economy.cardAlbums[offer.fromId] ||= {cards:{},crafted:{}},theirs=buyerAlbum.cards ||= {};
    if(!hasFreeDuplicate(db,userId,post.offeredId,{postId:post.id}))fail('A carta anunciada não está mais livre para esta negociação.');
    if(offer.creditAmount){
      const amount=Number(offer.creditAmount),buyerBalance=Math.max(0,Number(db.economy.wallets?.[offer.fromId] || 0));
      if(!Number.isInteger(amount)||amount<1||buyerBalance<amount)fail('O saldo desta oferta não está mais disponível.');
      const sellerBalance=Math.max(0,Number(db.economy.wallets?.[userId] || 0));
      db.economy.wallets[offer.fromId]=buyerBalance-amount;db.economy.wallets[userId]=sellerBalance+amount;
      myCards[post.offeredId]--;theirs[post.offeredId]=count(theirs[post.offeredId])+1;
      db.economy.creditAdjustments ||= [];
      db.economy.creditAdjustments.push({id:idFactory(),userId:offer.fromId,mode:'card-market-purchase',amount:-amount,before:buyerBalance,after:buyerBalance-amount,reason:'Compra de carta no mural de trocas',createdAt:now});
      db.economy.creditAdjustments.push({id:idFactory(),userId,mode:'card-market-sale',amount,before:sellerBalance,after:sellerBalance+amount,reason:'Venda de carta no mural de trocas',createdAt:now});
    }else{
      if(!hasFreeDuplicate(db,offer.fromId,offer.cardId,{offerId:offer.id}))fail('A carta oferecida não está mais livre para esta negociação.');
      myCards[post.offeredId]--;theirs[offer.cardId]--;myCards[offer.cardId]=count(myCards[offer.cardId])+1;theirs[post.offeredId]=count(theirs[post.offeredId])+1;
    }
    post.status='accepted';post.acceptedOfferId=offer.id;post.updatedAt=now;return true;
  }
  if(body.action==='cancel-market'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.fromId===userId&&item.status==='open');if(!post)fail('Oferta pública não encontrada.');post.status='cancelled';post.updatedAt=now;return true;
  }
  if(body.action==='reject-market-offer'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.fromId===userId&&item.status==='open');
    const offer=post?.offers?.find(item=>item.id===body.offerId&&item.status!=='rejected');
    if(!post||!offer)fail('Esta oferta não foi encontrada ou já foi encerrada.');
    offer.status='rejected';offer.updatedAt=now;post.updatedAt=now;return true;
  }
  if(body.action==='cancel-market-offer'){
    const post=db.economy.cardTradePosts.find(item=>item.id===body.id&&item.status==='open');
    const offerIndex=post?.offers?.findIndex(offer=>offer.id===body.offerId&&offer.fromId===userId) ?? -1;
    if(!post||offerIndex<0)fail('Sua oferta não foi encontrada ou já foi encerrada.');
    post.offers.splice(offerIndex,1);post.updatedAt=now;return true;
  }
  if(body.action==='create'){
    const partner=db.users.find(u=>u.id===body.partnerId && u.id!==userId && u.active && u.approved!==false);
    if(!partner || body.offeredId===body.wantedId || !catalog.has(body.offeredId) || !catalog.has(body.wantedId))fail('Selecione outro participante e duas cartas diferentes.');
    if(!hasFreeDuplicate(db,userId,body.offeredId) || !hasFreeDuplicate(db,partner.id,body.wantedId))fail('Uma das cartas já está reservada ou não possui cópia livre para a troca.');
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
    if(!hasFreeDuplicate(db,trade.fromId,trade.offeredId,{tradeId:trade.id}) || !hasFreeDuplicate(db,trade.toId,trade.wantedId,{tradeId:trade.id}))fail('Uma carta ficou reservada ou deixou de ser repetida. Recuse a proposta e crie outra.');
    a[trade.offeredId]--;b[trade.wantedId]--;
    a[trade.wantedId]=count(a[trade.wantedId])+1;b[trade.offeredId]=count(b[trade.offeredId])+1;
    trade.status='accepted';
  }else trade.status=body.action==='reject'?'rejected':'cancelled';
  trade.updatedAt=now;return true;
}
