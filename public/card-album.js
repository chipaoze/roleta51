let albumSignature='';
let cardPackOpening=false;
let selectedCardPackId='';
let cardPackTearGesture=null;
// A atualização ao vivo não pode substituir uma carta que a pessoa ainda está escolhendo.
let cardMarketPublishSelection='';
const cardMarketOfferSelections=new Map();
let albumFilter='all';
let albumSearch='';
let nextCardSeasonLoaded=false;
let nextCardSeasonShopLoaded=false;

async function renderNextCardSeasonShopPreview(){
  const host=document.querySelector('#nextCardSeasonShopPreview');
  if(!host||nextCardSeasonShopLoaded)return;
  nextCardSeasonShopLoaded=true;
  // Os pacotes são produtos reais da Loja. Não existe mais uma segunda vitrine
  // de simulação: após comprar, a pessoa abre o pacote fechado no Perfil.
  host.replaceChildren();
}

async function renderNextCardSeasonPreview(){
  const host=document.querySelector('#nextCardSeasonPreview');
  if(!host||nextCardSeasonLoaded)return;
  // Com a temporada em curso, o álbum abaixo é a fonte única de verdade. A
  // antiga explicação era uma prévia e não pode duplicar coleções ou botões.
  if(Date.now()>=Date.parse('2026-09-29T00:00:00-03:00')){nextCardSeasonLoaded=true;host.replaceChildren();return;}
  const localSeasonPreview=location.hostname==='localhost'&&new URLSearchParams(location.search).get('preview')==='next-season';
  if(localSeasonPreview){
    document.querySelector('#cardAlbumCollections')?.setAttribute('hidden','');
    document.querySelector('#cardAlbumControls')?.setAttribute('hidden','');
    document.querySelector('#cardAlbumInfo')?.setAttribute('hidden','');
    document.querySelector('#cardTradingCard')?.setAttribute('hidden','');
    const copy=document.querySelector('#album .album-intro p');if(copy)copy.textContent='Prévia da nova temporada: cinco coleções, vinte e cinco cartas e cinco insígnias.';
  }
  nextCardSeasonLoaded=true;
  host.innerHTML='<div class="card-season-loading">Preparando a próxima operação…</div>';
  try{
    const data=await api('/api/card-season/transition-preview');
    const season=data.season||{},liquidation=data.liquidation||{},collections=data.collections||[],legacyBadges=data.legacyBadges||[];
    const start=new Date(season.startsAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    if(data.active){host.replaceChildren();return;}
    host.innerHTML='<div class="card-season-hero"><div><span class="eyebrow">ENTRA EM VIGOR EM 01/10</span><h3>'+escapeHtml(season.name||'Operação: Ecos do Setor 51')+'</h3><p>A partir de '+escapeHtml(start)+', o álbum ativo terá somente 5 coleções, 25 cartas inéditas e 5 novas insígnias. Nenhuma atividade ou pacote novo entrega carta da coleção anterior.</p><span class="card-season-lock">🔒 Prévia local · ativação programada para 01/10</span></div></div>'+
      '<section class="card-season-rules" aria-label="Como funciona a virada de temporada"><h4>O que acontece na virada</h4><ul><li><b>Cartas antigas soltas:</b> viram Créditos 51 — 2 por básica e 6 por rara.</li><li><b>Pacotes antigos fechados:</b> devolvem o valor pago; não abrem cartas antigas.</li><li><b>Insígnias montadas:</b> ficam no Perfil como troféus, com o nível Bronze, Prata, Ouro ou Diamante conquistado.</li><li><b>Trocas e publicações antigas:</b> são canceladas e liberam as reservas.</li><li><b>Cartas novas:</b> atividades, pacotes e trocas passam a usar apenas Ecos do Setor 51.</li></ul></section>'+
      '<div class="card-season-settlement"><div><small>SEU ACERTO DA COLEÇÃO ANTERIOR</small><strong>'+Number(liquidation.totalCards||0)+' cartas soltas → '+Number(liquidation.credits||0).toLocaleString('pt-BR')+' Créditos 51</strong><p>'+Number(liquidation.basics||0)+' básicas × 2 + '+Number(liquidation.rares||0)+' raras × 6. O crédito é lançado uma única vez.</p></div><button type="button" disabled>Disponível em 01/10</button></div>'+
      '<div class="card-season-collections"><header><div><small>NOVO ÁLBUM ATIVO</small><h4>5 coleções · 25 cartas · 5 insígnias</h4></div><span>1 rara por coleção</span></header><p class="season-badge-legend">◌ Inativa até você reunir as 5 cartas e montar sua primeira insígnia.</p><div>'+collections.map(collection=>'<article class="season-collection season-'+escapeHtml(collection.color||'aqua')+'"><div class="season-collection-heading"><span>'+escapeHtml(collection.icon||'👽')+'</span><div><strong>'+escapeHtml(collection.name)+'</strong><small>Insígnia: '+escapeHtml(collection.badge)+' · ainda não montada</small></div></div><div class="season-card-art-grid">'+collection.cards.map((card,index)=>'<figure class="'+(index===4?'rare':'')+'"><img src="/card-season-2026-10/cards/'+escapeHtml(collection.id)+'/'+escapeHtml(card[0])+'.webp" alt="" loading="lazy"><figcaption>'+escapeHtml(card[1])+'</figcaption></figure>').join('')+'</div><div class="season-badge-tiers inactive" aria-label="Níveis inativos da insígnia '+escapeHtml(collection.badge)+'">'+['bronze','silver','gold','diamond'].map(tier=>'<figure><img src="/card-season-2026-10/badges/'+escapeHtml(collection.id)+'/'+tier+'.webp" alt=""><figcaption>'+({bronze:'Bronze',silver:'Prata',gold:'Ouro',diamond:'Diamante'}[tier])+'</figcaption></figure>').join('')+'</div></article>').join('')+'</div></div>'+
      (legacyBadges.length?'<section class="legacy-badge-trophies"><header><small>TROFÉUS DA COLEÇÃO ANTERIOR</small><h4>Insígnias que você já montou</h4><p>Elas permanecem no Perfil; não são mais necessárias para o álbum ativo.</p></header><div>'+legacyBadges.map(item=>'<article class="legacy-badge-trophy tier-'+escapeHtml(item.medal?.tier||'bronze')+'"><span>'+escapeHtml(item.medal?.icon||item.icon||'🏆')+'</span><div><strong>'+escapeHtml(item.badge)+'</strong><small>'+escapeHtml(item.name)+' · '+escapeHtml(item.medal?.label||'Bronze')+'</small></div><b>✓ MONTADA</b></article>').join('')+'</div></section>':'');
  }catch(err){
    nextCardSeasonLoaded=false;
    host.innerHTML='<div class="card-season-loading">Não foi possível carregar a prévia: '+escapeHtml(err.message)+'</div>';
  }
}
let directTradeFilter='all';

function applyAlbumFilters(){
  const host=document.querySelector('#cardAlbumCollections');if(!host)return;
  let visible=0;
  host.querySelectorAll('.album-collection').forEach(collection=>{
    let collectionVisible=0;
    collection.querySelectorAll('.album-card').forEach(card=>{
      const name=card.querySelector('strong')?.textContent?.toLocaleLowerCase('pt-BR')||'';
      const matchesSearch=!albumSearch||name.includes(albumSearch);
      const matchesFilter=albumFilter==='all'||(albumFilter==='owned'&&card.classList.contains('owned'))||(albumFilter==='missing'&&card.classList.contains('missing'))||(albumFilter==='duplicate'&&card.classList.contains('duplicate'))||(albumFilter==='rare'&&card.classList.contains('album-rare'));
      const show=matchesSearch&&matchesFilter;card.hidden=!show;if(show){visible++;collectionVisible++;}
    });
    collection.hidden=!collectionVisible;
  });
  const count=document.querySelector('#cardAlbumFilterCount');if(count)count.textContent=visible+(visible===1?' carta encontrada':' cartas encontradas');
}
function ensureAlbumControls(host){
  let controls=document.querySelector('#cardAlbumControls');
  if(!controls){
    controls=document.createElement('div');controls.id='cardAlbumControls';controls.className='album-controls';
    controls.innerHTML='<label class="album-search"><span>🔎</span><input type="search" placeholder="Buscar carta" aria-label="Buscar carta no álbum"></label><div class="album-filter-buttons" role="group" aria-label="Filtrar cartas"><button type="button" data-album-filter="all">Todas</button><button type="button" data-album-filter="owned">Tenho</button><button type="button" data-album-filter="missing">Faltam</button><button type="button" data-album-filter="duplicate">Repetidas</button><button type="button" data-album-filter="rare">Raras</button></div><small id="cardAlbumFilterCount" aria-live="polite"></small>';
    host.insertAdjacentElement('beforebegin',controls);
    controls.addEventListener('input',event=>{if(event.target.matches('input[type="search"]')){albumSearch=event.target.value.trim().toLocaleLowerCase('pt-BR');applyAlbumFilters();}});
    controls.addEventListener('click',event=>{const button=event.target.closest('[data-album-filter]');if(!button)return;albumFilter=button.dataset.albumFilter;controls.querySelectorAll('[data-album-filter]').forEach(item=>item.classList.toggle('active',item===button));applyAlbumFilters();});
  }
  controls.querySelector('input[type="search"]').value=albumSearch;
  controls.querySelectorAll('[data-album-filter]').forEach(button=>button.classList.toggle('active',button.dataset.albumFilter===albumFilter));
}
function renderCardPacks(profile) {
  if(cardPackOpening || !profile)return;
  const closed=profile.cardPacks || [],history=profile.openedCardPacks || [];
  document.querySelector('#cardPackInventory').innerHTML=closed.length?'<p>'+closed.length+' pacote(s) fechado(s)</p><div class="closed-pack-grid">'+closed.map(p=>'<button class="closed-pack pack-'+escapeHtml(p.value||'cosmic')+'" type="button" data-open-card-pack="'+escapeHtml(p.id)+'" data-pack-name="'+escapeHtml(p.name||'Pacotinho')+'" data-pack-icon="'+escapeHtml(p.icon||'🎴')+'" data-pack-art="'+escapeHtml(p.packArt||'')+'" data-pack-tier="'+escapeHtml(p.value||'cosmic')+'">'+(p.packArt?'<span class="closed-pack-art"><img src="'+escapeHtml(p.packArt)+'" alt=""></span>':'<span class="closed-pack-icon">'+escapeHtml(p.icon||'🎴')+'</span>')+'<div><strong>'+escapeHtml(p.name||'Pacotinho')+'</strong><small>3 cartas · '+Number(p.rareChance||10)+'% de rara por carta</small><b>Arraste o lacre para abrir</b></div></button>').join('')+'</div>':'<p>Nenhum pacote fechado. Encontre os pacotinhos na Loja.</p>';
  document.querySelector('#cardPackHistory').innerHTML=history.length?'<details><summary>Últimos pacotes abertos</summary>'+history.map(p=>'<p>'+p.cards.map(c=>escapeHtml(c.icon+' '+c.name)+(c.rarity==='rare'?' ★ RARA':'')).join(' · ')+'</p>').join('')+'</details>':'';
}
document.querySelector('#cardPackInventory').addEventListener('click',async event=>{
  const button=event.target.closest('[data-open-card-pack]');if(!button || cardPackOpening)return;
  const dialog=document.querySelector('#cardPackDialog'),result=document.querySelector('#cardPackResult'),packet=document.querySelector('#cardPackEnvelope'),close=document.querySelector('#closeCardPack');
  selectedCardPackId=button.dataset.openCardPack;
  document.querySelector('#cardPackTitle').textContent=button.dataset.packName || 'Pacotinho';
  packet.dataset.tier=button.dataset.packTier || 'cosmic';packet.querySelector('.pack-alien').textContent=button.dataset.packIcon || '👽';
  const artwork=packet.querySelector('.pack-artwork'),packArt=button.dataset.packArt || '';
  artwork.src=packArt;artwork.alt=button.dataset.packName ? 'Pacote fechado: '+button.dataset.packName : '';
  packet.classList.toggle('has-art',Boolean(packArt));
  result.innerHTML='<p class="card-pack-opening-copy">Clique e arraste o lacre para cima para rasgar o pacote.</p>';
  packet.classList.remove('opening','torn','revealed','pulling');packet.style.removeProperty('--tear-progress');packet.disabled=false;close.disabled=false;dialog.showModal();packet.focus();
});
async function openSelectedCardPack(){
  if(!selectedCardPackId || cardPackOpening)return;
  const dialog=document.querySelector('#cardPackDialog'),result=document.querySelector('#cardPackResult'),packet=document.querySelector('#cardPackEnvelope'),close=document.querySelector('#closeCardPack');
  cardPackOpening=true;mysteryOpeningInProgress=true;packet.disabled=true;close.disabled=true;
  try {
    // The same owned purchase ID is the idempotency key; a retry never grants twice.
    const data=await api('/api/card-packs/open',{method:'POST',body:{purchaseId:selectedCardPackId}});
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    result.innerHTML='<p class="card-pack-opening-copy">Puxando o lacre cósmico…</p>';packet.classList.add('opening');
    await new Promise(resolve=>setTimeout(resolve,reduced?100:650));
    result.innerHTML='<p class="card-pack-opening-copy">Rasgando o pacote…</p>';packet.classList.add('torn');
    await new Promise(resolve=>setTimeout(resolve,reduced?120:1000));
    result.innerHTML='<p class="card-pack-opening-copy">Revelando as cartas…</p>';packet.classList.add('revealed');
    await new Promise(resolve=>setTimeout(resolve,reduced?120:600));
    result.innerHTML='<div class="pack-reveal">'+data.cardPackResult.map((c,index)=>'<article class="album-card owned pack-card-reveal '+(c.rarity==='rare'?'album-rare':'')+'" style="--reveal-delay:'+(index*150)+'ms"><small>'+(c.rarity==='rare'?'★ RARA':'NOVA CARTA')+'</small>'+(c.art?'<img class="pack-reveal-art" src="'+escapeHtml(c.art)+'" alt="'+escapeHtml(c.name)+'">':'<span>'+escapeHtml(c.icon)+'</span>')+'<strong>'+escapeHtml(c.name)+'</strong><b>'+ (c.rarity==='rare'?'RARA':'BÁSICA') +'</b></article>').join('')+'</div><p class="card-pack-added">✓ As três cartas foram adicionadas ao Álbum.</p>';
    selectedCardPackId='';applyState(data);
  } catch(error) { result.textContent=error.message+' Se a conexão caiu, tente novamente: o mesmo pacote não será consumido duas vezes.'; }
  finally { cardPackOpening=false;mysteryOpeningInProgress=false;close.disabled=false;packet.disabled=!selectedCardPackId;renderCardPacks(appState?.profile); }
}
const cardPackEnvelope=document.querySelector('#cardPackEnvelope');
cardPackEnvelope.addEventListener('pointerdown',event=>{
  if(!selectedCardPackId||cardPackOpening||cardPackEnvelope.disabled||event.button>0)return;
  event.preventDefault();
  cardPackTearGesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,progress:0};
  cardPackEnvelope.setPointerCapture?.(event.pointerId);
  cardPackEnvelope.classList.add('pulling');
  document.querySelector('#cardPackResult').innerHTML='<p class="card-pack-opening-copy">Puxe o lacre para cima…</p>';
});
cardPackEnvelope.addEventListener('pointermove',event=>{
  const gesture=cardPackTearGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
  const distance=Math.max(0,gesture.startY-event.clientY)+Math.abs(event.clientX-gesture.startX)*.35;
  gesture.progress=Math.min(1,distance/82);
  cardPackEnvelope.style.setProperty('--tear-progress',gesture.progress.toFixed(3));
  const percent=Math.round(gesture.progress*100);
  document.querySelector('#cardPackResult').innerHTML='<p class="card-pack-opening-copy">Rasgando o lacre… '+percent+'%</p>';
});
const finishCardPackTear=event=>{
  const gesture=cardPackTearGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
  cardPackTearGesture=null;cardPackEnvelope.releasePointerCapture?.(event.pointerId);
  const complete=gesture.progress>=.72;
  cardPackEnvelope.classList.remove('pulling');cardPackEnvelope.style.removeProperty('--tear-progress');
  if(complete){openSelectedCardPack();return;}
  document.querySelector('#cardPackResult').innerHTML='<p class="card-pack-opening-copy">Puxe mais forte: arraste o lacre até o topo para abrir.</p>';
};
cardPackEnvelope.addEventListener('pointerup',finishCardPackTear);
cardPackEnvelope.addEventListener('pointercancel',finishCardPackTear);
document.querySelector('#cardPackDialog').addEventListener('cancel',event=>{if(cardPackOpening)event.preventDefault();});
document.querySelector('#closeCardPack').addEventListener('click',()=>{selectedCardPackId='';document.querySelector('#cardPackDialog').close();});

function renderCardAlbum(album) {
  const host=document.querySelector('#cardAlbumCollections');if(!host || !album)return;
  renderNextCardSeasonPreview();
  const localSeasonPreview=location.hostname==='localhost'&&new URLSearchParams(location.search).get('preview')==='next-season';
  if(localSeasonPreview){
    host.hidden=true;
    const tradingCard=document.querySelector('#cardTradingCard');if(tradingCard)tradingCard.hidden=true;
    document.querySelector('#cardAlbumControls')?.setAttribute('hidden','');
    return;
  }
  // Depois da virada, o álbum abaixo é a única área para acompanhar e montar
  // as coleções. A prévia explicativa não deve duplicar as mesmas 25 cartas.
  if(Date.now()>=Date.parse('2026-09-29T00:00:00-03:00')){
    const preview=document.querySelector('#nextCardSeasonPreview');
    if(preview) preview.replaceChildren();
  }
  host.hidden=false;
  const tradingCard=document.querySelector('#cardTradingCard');if(tradingCard)tradingCard.hidden=false;
  document.querySelector('#cardAlbumControls')?.removeAttribute('hidden');
  const signature=JSON.stringify([appState.me.id,album]);if(signature===albumSignature)return;albumSignature=signature;
  document.querySelector('#cardDropProgress').textContent='Hoje: '+Number(album.dropsToday||0)+' de 2 cartas encontradas · '+Number(album.attemptsToday||0)+' de 5 atividades verificadas';
  renderCardTrades(album.trading || {});
  host.innerHTML=album.collections.map(c=>{const nextTier=['Bronze','Prata','Ouro','Diamante'][c.crafts||0];const craftButton=c.crafts>=4?'':('<button type="button" data-album-action="craft" data-album-id="'+escapeHtml(c.id)+'"'+(c.canCraft?'':' disabled')+'>'+((c.crafts||0)?'Evoluir para '+nextTier:'Montar insígnia')+'</button>');const equipButton=c.craftedAt?'<button type="button" data-album-action="equip" data-album-id="'+escapeHtml(c.id)+'" data-album-remove="'+(album.equipped===c.id)+'">'+(album.equipped===c.id?'Remover insígnia':'Usar insígnia')+'</button>':'';return '<article id="album-collection-'+escapeHtml(c.id)+'" class="album-collection album-'+escapeHtml(c.color)+'"><header><span class="album-medal" aria-hidden="true">'+escapeHtml(c.icon)+'</span><div><h4>'+escapeHtml(c.name)+'</h4><p>Insígnia: '+escapeHtml(c.badge)+'</p></div><strong class="album-progress">'+c.collected+' / 5</strong></header><div class="album-cards">'+c.cards.map((card,i)=>'<div class="album-card '+(card.count?'owned':'missing')+(card.count>1?' duplicate':'')+(card.rarity==='rare'?' album-rare':'')+'">'+(card.count?'<b class="album-owned-mark">✓ NA COLEÇÃO</b>':'<b class="album-missing-mark">FALTA</b>')+'<small>CARTA '+(i+1)+' / 5 · '+(card.rarity==='rare'?'RARA':'BÁSICA')+'</small>'+(card.art?'<img class="album-card-art" src="'+escapeHtml(card.art)+'" alt="">':'<span aria-hidden="true">'+escapeHtml(card.icon)+'</span>')+'<strong>'+escapeHtml(card.name)+'</strong><small class="album-card-count">'+(card.count?(card.count>1?card.count+' cópias · repetida':'1 cópia sua'):'Ainda não obtida')+'</small></div>').join('')+'</div><footer><p>'+(c.craftedAt?'✓ Insígnia '+escapeHtml(c.medal?.label || '')+' · '+c.crafts+'/4 níveis':c.collected+' de 5 cartas diferentes')+'</p><span class="album-actions">'+craftButton+equipButton+'</span></footer></article>';}).join('');
  host.querySelectorAll('.album-collection').forEach((element,index)=>{const collection=album.collections[index],medal=collection?.medal,emblem=element.querySelector('.album-medal');if(collection?.seasonId&&emblem){const tier=medal?.tier || 'bronze';emblem.innerHTML='<img src="/card-season-2026-10/badges/'+escapeHtml(collection.id)+'/'+escapeHtml(tier)+'.webp" alt="">';}if(!medal)return;const target=element.querySelector('header div p');if(target)target.insertAdjacentHTML('beforeend',' <span class="album-tier tier-'+escapeHtml(medal.tier)+'">'+escapeHtml(medal.icon)+' '+escapeHtml(medal.label)+'</span>');});
  ensureAlbumControls(host);applyAlbumFilters();
}
function showInsigniaCraftAnimation(collection){const medal=collection?.medal || {icon:'🥉',label:'Bronze',tier:'bronze'};const flash=document.createElement('div');flash.className='insignia-craft-animation tier-'+medal.tier;flash.innerHTML='<div class="insignia-craft-rays" aria-hidden="true">'+Array.from({length:12},(_,index)=>'<i style="--ray:'+index+'"></i>').join('')+'</div><span>'+escapeHtml(medal.icon)+'</span><strong>INSÍGNIA MONTADA!</strong><b>'+escapeHtml(medal.label)+'</b><small>A coleção avançou um nível</small>';document.body.appendChild(flash);setTimeout(()=>flash.remove(),3200);}
document.querySelector('#cardAlbumCollections').addEventListener('click',async e=>{
  const button=e.target.closest('[data-album-action]');if(!button || button.disabled)return;
  const action=button.dataset.albumAction;
  if(action==='craft' && !confirm('Montar esta insígnia? Será consumida uma unidade de cada uma das cinco cartas da coleção.'))return;
  button.disabled=true;
  try{const data=await api('/api/card-album',{method:'POST',body:{action,collectionId:button.dataset.albumRemove==='true'?null:button.dataset.albumId}});applyState(data);if(action==='craft'){const collection=data.cardAlbum?.collections?.find(item=>item.id===button.dataset.albumId);showInsigniaCraftAnimation(collection);showToast('Insígnia montada: '+(collection?.medal?.label || 'Bronze')+'!');}else showToast('Insígnia atualizada.');}catch(err){showToast(err.message,'error');}finally{button.disabled=false;}
});
function renderCardTrades(trading){
  const form=document.querySelector('#cardTradeForm');if(!form)return;
  const selected=Object.fromEntries(new FormData(form));
  const availableCards=items=>(items || []).filter(card=>card.available!==false);
  const options=(items,label)=>'<option value="">'+label+'</option>'+items.map(i=>'<option value="'+escapeHtml(i.id)+'">'+escapeHtml(i.name)+'</option>').join('');
  const cardThumb=(card,className='card-trade-art')=>card?.art?'<img class="'+className+'" src="'+escapeHtml(card.art)+'" alt="">':'<span class="'+className+' card-trade-icon" aria-hidden="true">'+escapeHtml(card?.icon || '🎴')+'</span>';
  const visualChoices=(items,name,emptyText,selectedId='')=>{const chosen=items.some(card=>card.id===selectedId)?selectedId:items[0]?.id,selected=items.find(card=>card.id===chosen);return items.length?'<div class="card-choice-combo"><span class="card-choice-combo-icon" aria-hidden="true">'+cardThumb(selected,'card-choice-art')+'</span><label><small>Escolha sua carta repetida</small><select name="'+name+'">'+items.map(card=>'<option value="'+escapeHtml(card.id)+'" data-art="'+escapeHtml(card.art || '')+'" data-icon="'+escapeHtml(card.icon)+'" data-count="'+Number(card.count||0)+'"'+(card.id===chosen?' selected':'')+'>'+escapeHtml(card.name)+' · '+Number(card.count||0)+' cópias</option>').join('')+'</select></label><b>'+Number(selected?.count||0)+' cópias</b></div>':'<p class="card-choice-empty">'+emptyText+'</p>';};
  form.elements.partnerId.innerHTML=options((trading.partners || []).filter(p=>p.id!==appState.me.id),'Escolha alguém');
  const myAvailableCards=availableCards(trading.partners?.find(p=>p.id===appState.me.id)?.cards);
  form.elements.offeredId.innerHTML=options(myAvailableCards,'Minha carta repetida');
  form.elements.partnerId.value=selected.partnerId || '';form.elements.offeredId.value=selected.offeredId || myAvailableCards[0]?.id || '';
  updateCardTradeWanted(selected.wantedId);
  renderDirectTradeChoices();
  const labels={pending:'Aguardando confirmação',accepted:'Troca concluída',rejected:'Recusada',cancelled:'Cancelada',expired:'Expirada'};
  const collections=(appState.cardAlbum?.collections || []),albumCards=collections.flatMap(collection=>collection.cards),mineCounts=Object.fromEntries(albumCards.map(card=>[card.id,Number(card.count||0)])),catalog=new Map(albumCards.map(card=>[card.id,card])),collectionByCard=new Map(collections.flatMap(collection=>collection.cards.map(card=>[card.id,collection])));
  const tradeCard=(id,name,role,art=null)=>{const card={...(catalog.get(id)||{}),art:art || catalog.get(id)?.art},copies=Number(mineCounts[id]||0),receiving=role==='receive';const note=receiving?(copies?'Você já tem '+copies+' cópia'+(copies===1?'':'s'):'Nova para sua coleção'):(copies>1?'Você tem '+copies+' cópias · 1 reservada':'Sua cópia está reservada');return '<section class="trade-summary-item '+(receiving&&copies?'already-owned':'')+'"><b>'+ (receiving?'VOCÊ RECEBE':'VOCÊ ENVIA') +'</b>'+cardThumb(card,'trade-summary-art')+'<p><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(note)+'</small></p></section>';};
  const tradeAssessment=(received)=>{const copies=Number(mineCounts[received.id]||0),card=catalog.get(received.id)||{},collection=collectionByCard.get(received.id)||{},rare=card.rarity==='rare',remaining=Math.max(0,5-(Number(collection.collected||0)+(copies?0:1))),rarity=rare?' É rara.':'';if(!copies)return '<p class="trade-assessment new"><b>Boa troca para você:</b> carta nova'+rarity+(remaining?' · faltam '+remaining+' cartas para a insígnia de '+escapeHtml(collection.name||'sua coleção')+'.':' · ela completa esta coleção.')+'</p>';if(copies===1)return '<p class="trade-assessment useful"><b>Troca útil com ressalva:</b> você já tem 1 cópia, mas esta extra'+(rare?' rara':'')+' pode ajudar em uma próxima insígnia.</p>';return '<p class="trade-assessment duplicate"><b>Pouco impacto agora:</b> você já tem '+copies+' cópias'+(rare?' desta carta rara':'')+'. Aceite apenas se quiser acumular mais uma.</p>';};
  const tradeList=document.querySelector('#cardTradeList');
  let tradeFilter=tradeList.previousElementSibling;
  if(!tradeFilter || !tradeFilter.matches('.direct-trade-filter')){tradeFilter=document.createElement('div');tradeFilter.className='direct-trade-filter';tradeList.before(tradeFilter);}
  tradeFilter.innerHTML='<label>Mostrar trocas<select aria-label="Filtrar trocas diretas"><option value="all">Todas</option><option value="pending">Ativas / aguardando</option><option value="accepted">Concluídas</option><option value="rejected">Recusadas</option><option value="cancelled">Canceladas</option><option value="expired">Expiradas</option></select></label>';
  tradeFilter.querySelector('select').value=directTradeFilter;
  tradeFilter.querySelector('select').onchange=e=>{directTradeFilter=e.target.value;renderCardTrades(trading);};
  const visibleTrades=(trading.trades || []).filter(t=>directTradeFilter==='all'||t.status===directTradeFilter);
  tradeList.innerHTML=visibleTrades.map(t=>{const sent=t.incoming?{id:t.wantedId,name:t.wantedName,art:t.wantedArt}:{id:t.offeredId,name:t.offeredName,art:t.offeredArt};const received=t.incoming?{id:t.offeredId,name:t.offeredName,art:t.offeredArt}:{id:t.wantedId,name:t.wantedName,art:t.wantedArt};return '<article id="card-trade-'+escapeHtml(t.id)+'" class="trade-summary-card"><header><strong>'+escapeHtml(t.partnerName)+'</strong><small>'+escapeHtml(labels[t.status] || t.status)+'</small></header><div class="trade-summary-pair">'+tradeCard(sent.id,sent.name,'send',sent.art)+'<i aria-hidden="true">⇄</i>'+tradeCard(received.id,received.name,'receive',received.art)+'</div>'+tradeAssessment(received)+(t.status==='pending'?'<footer>'+(t.incoming?'<button data-card-trade="accept" data-id="'+escapeHtml(t.id)+'">Aceitar</button><button data-card-trade="reject" data-id="'+escapeHtml(t.id)+'">Recusar</button>':'<button data-card-trade="cancel" data-id="'+escapeHtml(t.id)+'">Cancelar proposta</button>')+'</footer>':'')+'</article>';}).join('') || '<p>Nenhuma troca neste filtro.</p>';
  const marketForm=document.querySelector('#cardMarketForm'),mine=trading.partners?.find(p=>p.id===appState.me.id)?.cards || [];
  const publishedIds=new Set((trading.market || []).filter(post=>post.mine).map(post=>post.offeredId));
  const availableToPublish=mine.filter(card=>card.available!==false&&!publishedIds.has(card.id));
  const currentPublish=marketForm?.querySelector('[name="offeredId"]')?.value || cardMarketPublishSelection;
  if(currentPublish)cardMarketPublishSelection=currentPublish;
  if(marketForm){marketForm.querySelector('label').innerHTML='<span>Minha carta repetida</span>'+visualChoices(availableToPublish,'offeredId','Todas as repetidas disponíveis já estão publicadas.',cardMarketPublishSelection);marketForm.querySelector('button[type="submit"]').disabled=!availableToPublish.length;}
  document.querySelectorAll('#cardTradeMarket [data-card-market-offer]').forEach(existing=>{const value=new FormData(existing).get('cardId');if(value)cardMarketOfferSelections.set(existing.dataset.cardMarketOffer,value);});
  const reservedOfferIds=new Set(trading.reservedOfferCardIds || []);
  document.querySelector('#cardTradeMarket').innerHTML=(trading.market || []).map(post=>{
    const eligibleMine=mine.filter(card=>card.available!==false&&!reservedOfferIds.has(card.id));
    const offerOptions=visualChoices(eligibleMine,'cardId','Nenhuma carta diferente está disponível para esta oferta.',cardMarketOfferSelections.get(post.id)||'');
    const offers=post.offers || [];
    const myOffer=offers.find(offer=>offer.fromId===appState.me.id);
    const ownerOffers='<div class="card-market-offers">'+(offers.length?offers.map(offer=>'<article class="card-market-offer">'+cardThumb({art:offer.cardArt,icon:offer.cardIcon},'card-market-art')+'<div><strong>'+escapeHtml(offer.cardName)+'</strong><small>Oferta de '+escapeHtml(offer.fromName)+'</small><b class="card-offer-status '+(offer.offerKind==='credits'?'credits':offer.viewerHasCard?'owned':'new')+'">'+(offer.offerKind==='credits'?'Pagamento em moedas':offer.viewerHasCard?'Você já possui':'Nova para sua coleção')+'</b></div><span class="card-market-offer-actions"><button data-card-market="accept-market" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(offer.id)+'">Aceitar</button><button class="reject" data-card-market="reject-market-offer" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(offer.id)+'">Recusar</button></span></article>').join(''):'<small>Aguardando ofertas da equipe.</small>')+'</div>';
    const cardOffer='<form class="visual-card-offer-form" data-card-market-offer="'+escapeHtml(post.id)+'"><fieldset><legend>Trocar por uma carta repetida</legend>'+offerOptions+'</fieldset><button type="submit"'+(eligibleMine.length?'':' disabled')+'>Oferecer carta</button></form>';
    const availableCredits=Math.max(0,Number(trading.availableTradeCredits || 0));
    const creditOffer='<form class="credit-card-offer-form" data-card-market-credit-offer="'+escapeHtml(post.id)+'"><label>Ou comprar com moedas <span>Disponível: '+availableCredits.toLocaleString('pt-BR')+'</span><input name="creditAmount" type="number" inputmode="numeric" min="1" max="'+Math.min(5000,availableCredits)+'" step="1" placeholder="Valor da oferta" required></label><button type="submit"'+(availableCredits?'':' disabled')+'>Oferecer créditos</button></form>';
    const myOfferCard='<div class="my-market-offer">'+cardThumb({art:myOffer?.cardArt,icon:myOffer?.cardIcon},'card-market-art')+'<p><strong>Sua oferta: '+escapeHtml(myOffer?.cardName || '')+'</strong><small>'+(myOffer?.offerKind==='credits'?'Este saldo fica reservado até a oferta ser retirada ou encerrada.':'Esta carta está reservada até a oferta ser retirada ou encerrada.')+'</small></p><button data-card-market="cancel-market-offer" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(myOffer?.id || '')+'">Retirar minha oferta</button></div>';
    const offerArea=post.mine?ownerOffers:myOffer?myOfferCard:'<div class="card-market-offer-methods">'+cardOffer+creditOffer+'</div>';
    const ownership=post.mine?'<b class="market-card-ownership mine">Sua publicação</b>':'<b class="market-card-ownership '+(post.viewerHasOfferedCard?'owned':'missing')+'">'+(post.viewerHasOfferedCard?'✓ Você já possui esta carta':'✦ Você ainda não possui')+'</b>';
    return '<article id="card-market-post-'+escapeHtml(post.id)+'" class="card-market-post"><header>'+cardThumb({art:post.offeredArt,icon:post.offeredIcon},'card-market-art')+'<div><strong>'+escapeHtml(post.offeredName)+'</strong><small>Oferecida por '+escapeHtml(post.fromName)+'</small>'+ownership+'</div>'+(post.mine?'<button data-card-market="cancel-market" data-id="'+escapeHtml(post.id)+'">Retirar</button>':'')+'</header>'+offerArea+'</article>';
  }).join('') || '<p class="card-market-empty">Nenhuma carta pública agora. Publique a sua primeira oferta.</p>';
}
function updateCardTradeWanted(selected=''){
  const form=document.querySelector('#cardTradeForm'),partner=appState.cardAlbum?.trading?.partners?.find(p=>p.id===form.elements.partnerId.value);
  const available=(partner?.cards || []).filter(card=>card.available!==false);
  form.elements.wantedId.innerHTML='<option value="">Carta repetida da pessoa</option>'+available.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+(c.viewerCount?' · você já tem '+c.viewerCount:' · você não tem')+'</option>').join('');
  form.elements.wantedId.value=selected || available[0]?.id || '';
}
function renderDirectTradeChoices(){
  const form=document.querySelector('#cardTradeForm');if(!form)return;
  let host=form.querySelector('#directTradeVisualChoices');
  if(!host){host=document.createElement('div');host.id='directTradeVisualChoices';host.className='direct-trade-visual-choices';form.querySelector('button[type="submit"]').before(host);form.elements.offeredId.closest('label').classList.add('direct-trade-native-field');form.elements.wantedId.closest('label').classList.add('direct-trade-native-field');}
  const trading=appState.cardAlbum?.trading || {},mine=trading.partners?.find(person=>person.id===appState.me.id),partner=trading.partners?.find(person=>person.id===form.elements.partnerId.value);
  const collectionInfo=new Map((appState.cardAlbum?.collections||[]).flatMap(collection=>collection.cards.map(card=>[card.id,{...card,collection}])));
  const collectionUtility=(card,ownedCounts={})=>{const info=collectionInfo.get(card.id)||{},collection=info.collection||{},cards=collection.cards||[],count=Number(ownedCounts[card.id]??info.count??0),owned=cards.filter(item=>Number(ownedCounts[item.id]??item.count??0)>0).length,missingAfter=Math.max(0,cards.length-(owned+(count?0:1)));let score=count===0?70:count===1?45:20;const reasons=[count===0?'carta nova (+70)':'cópia extra ('+(count===1?'+45':'+20')+')'];if(info.rarity==='rare'){score+=15;reasons.push('rara (+15)');}if(count===0&&missingAfter===0){score+=15;reasons.push('fecha a coleção (+15)');}else if(count===0&&missingAfter===1){score+=10;reasons.push('deixa a coleção a uma carta (+10)');}return {score:Math.min(99,score),count,missingAfter,reasons};};
  const valueForCollection=(card,count)=>{const info=collectionInfo.get(card.id)||{},rare=info.rarity==='rare',analysis=collectionUtility(card,mineCounts||{[card.id]:count}),impact='impacto na coleção '+analysis.score+'/100 ('+analysis.reasons.join(' · ')+')';if(!count)return (rare?'★ Rara · ':'✦ Nova · ')+(analysis.missingAfter?'faltam '+analysis.missingAfter+' para a insígnia':'completa esta coleção')+' · '+impact;if(count===1)return (rare?'★ Rara · ':'')+'você já tem 1 · cópia extra · '+impact;return (rare?'★ Rara · ':'')+'você já tem '+count+' · pouco impacto agora · '+impact;};
  const cards=(items,role,selectedId,emptyText)=>items?.length?'<div class="direct-trade-card-strip" role="radiogroup">'+items.map(card=>{const owned=role==='want'&&Number(card.viewerCount)>0,reserved=card.available===false,count=Number(card.viewerCount||0),isSelected=card.id===selectedId;const detail=reserved?'🔒 Reservada em outra negociação':role==='offer'?'✓ Tenho '+Number(card.count||0)+' cópias':valueForCollection(card,count);const visual=card.art?'<img class="direct-trade-art" src="'+escapeHtml(card.art)+'" alt="">':'<span>'+escapeHtml(card.icon)+'</span>';return '<label class="direct-trade-card'+(owned?' already-owned':'')+(reserved?' reserved':'')+(isSelected?' selected':'')+'"><input type="radio" name="direct-'+role+'" value="'+escapeHtml(card.id)+'" data-direct-trade="'+role+'"'+(isSelected?' checked':'')+(reserved?' disabled':'')+'>'+visual+'<strong>'+escapeHtml(card.name)+'</strong><small>'+detail+'</small></label>';}).join('')+'</div>':'<p class="card-choice-empty">'+emptyText+'</p>';
  if(!partner){host.innerHTML='<p class="direct-trade-guidance">Escolha um participante para comparar as cartas disponíveis para troca.</p>';return;}
  const catalog=(appState.cardAlbum?.collections||[]).flatMap(collection=>collection.cards.map(card=>({...card,collectionName:collection.name})));
  const theirs=partner.ownedCardCounts||{},mineCounts=Object.fromEntries(catalog.map(card=>[card.id,Number(card.count||0)]));
  const cardsIn=(items,empty)=>items.length?items.map(card=>'<span title="'+escapeHtml(card.collectionName)+'">'+(card.art?'<img class="trade-opportunity-art" src="'+escapeHtml(card.art)+'" alt="">':'<b>'+escapeHtml(card.icon)+'</b>')+'<strong>'+escapeHtml(card.name)+'</strong><small>'+escapeHtml(card.detail)+'</small></span>').join(''):'<em>'+empty+'</em>';
  const useful=catalog.filter(card=>Number(theirs[card.id]||0)>=2&&mineCounts[card.id]===0).map(card=>{const analysis=collectionUtility(card,mineCounts);return {...card,detail:'ele tem '+theirs[card.id]+' cópias · impacto '+analysis.score+'/100 para você ('+analysis.reasons.join(' · ')+')'};});
  const already=catalog.filter(card=>Number(theirs[card.id]||0)>0&&mineCounts[card.id]>0).map(card=>({...card,detail:'você tem '+mineCounts[card.id]+' · ele '+theirs[card.id]}));
  const shared=catalog.filter(card=>Number(theirs[card.id]||0)>=2&&mineCounts[card.id]>=2).map(card=>({...card,detail:'repetida para os dois'}));
  const helpfulForPartner=catalog.filter(card=>mineCounts[card.id]>=2&&Number(theirs[card.id]||0)===0).map(card=>{const analysis=collectionUtility(card,theirs);return {...card,detail:'você tem '+mineCounts[card.id]+' cópias · impacto '+analysis.score+'/100 para '+escapeHtml(partner.name)+' ('+analysis.reasons.join(' · ')+')'};});
  const comparison='<section class="card-trade-comparison" aria-label="Resumo de troca"><header><div><small>ANÁLISE PRIVADA DA TROCA</small><strong>O que vale a pena para cada coleção</strong><em>Impacto não é preço, chance nem garantia de justiça: carta nova vale 70 pontos, rara soma 15, e fechar ou deixar a coleção a uma carta pode somar 15 ou 10. Cada cartão mostra a conta.</em></div></header><div class="trade-summary-stats"><span><b>'+useful.length+'</b> boas para você receber</span><span><b>'+helpfulForPartner.length+'</b> boas para '+escapeHtml(partner.name)+'</span><span><b>'+shared.length+'</b> repetidas para os dois</span></div><div class="trade-opportunity-grid"><article class="trade-opportunities"><header><b>✦ Para você receber</b><small>'+escapeHtml(partner.name)+' tem repetidas que você ainda não possui.</small></header><div>'+cardsIn(useful,'Nenhuma carta nova para você agora.')+'</div></article><article class="trade-opportunities for-partner"><header><b>↔ Para '+escapeHtml(partner.name)+' receber</b><small>Suas repetidas podem ajudar a coleção dele.</small></header><div>'+cardsIn(helpfulForPartner,'Você não tem repetidas úteis para ele agora.')+'</div></article></div><details class="trade-comparison-details"><summary>Ver cartas que vocês já têm em comum ('+already.length+')</summary><div>'+cardsIn(already,'Nenhuma carta em comum ainda.')+'</div></details></section>';
  const wantedCards=[...(partner.cards||[])].sort((a,b)=>Number(a.viewerCount||0)-Number(b.viewerCount||0));
  host.innerHTML='<section class="direct-trade-pool mine"><header><small>MINHAS CARTAS</small><strong>Tenho para oferecer</strong><em>clique e arraste para os lados</em></header>'+cards(mine?.cards,'offer',form.elements.offeredId.value,'Você ainda não tem cartas repetidas livres.')+'</section><section class="direct-trade-pool wanted"><header><small>CARTAS DE '+escapeHtml(partner.name).toUpperCase()+'</small><strong>Melhores cartas para você receber</strong><em>clique e arraste para os lados · cartas novas primeiro</em></header>'+cards(wantedCards,'want',form.elements.wantedId.value,escapeHtml(partner.name)+' não tem cartas repetidas disponíveis agora.')+'</section>'+comparison;
  host.querySelectorAll('.direct-trade-card-strip').forEach(strip=>{if(strip.dataset.dragReady)return;strip.dataset.dragReady='true';let startX=0,startScroll=0,moved=false;strip.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;startX=event.clientX;startScroll=strip.scrollLeft;moved=false;strip.classList.add('dragging');strip.setPointerCapture?.(event.pointerId)});strip.addEventListener('pointermove',event=>{if(!strip.classList.contains('dragging'))return;const delta=event.clientX-startX;if(Math.abs(delta)>5)moved=true;strip.scrollLeft=startScroll-delta});strip.addEventListener('pointerup',event=>{strip.classList.remove('dragging');strip.releasePointerCapture?.(event.pointerId)});strip.addEventListener('pointercancel',()=>strip.classList.remove('dragging'));strip.addEventListener('click',event=>{const card=event.target.closest('.direct-trade-card');if(moved){event.preventDefault();event.stopPropagation();moved=false;return}if(!card)return;const input=card.querySelector('input[type="radio"]');if(!input||input.disabled)return;input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}))},true)});
}
document.addEventListener('click',event=>{const card=event.target.closest('#directTradeVisualChoices .direct-trade-card');if(!card)return;const input=card.querySelector('input[type="radio"]');if(!input||input.disabled)return;document.querySelectorAll('#directTradeVisualChoices .direct-trade-card').forEach(item=>item.classList.remove('selected'));card.classList.add('selected');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));});
document.addEventListener('pointerdown',event=>{const card=event.target.closest('#directTradeVisualChoices .direct-trade-card');if(!card||event.button>0)return;const input=card.querySelector('input[type="radio"]');if(!input||input.disabled)return;document.querySelectorAll('#directTradeVisualChoices .direct-trade-card').forEach(item=>item.classList.remove('selected'));card.classList.add('selected');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));});
document.querySelector('#cardTradeForm select[name="partnerId"]')?.addEventListener('change',event=>{const form=event.currentTarget.form;if(!form)return;form.elements.offeredId.value='';form.elements.wantedId.value='';updateCardTradeWanted();renderDirectTradeChoices();});
document.querySelector('#cardTradeForm').addEventListener('change',e=>{const form=e.currentTarget;if(e.target.name==='partnerId'){updateCardTradeWanted();renderDirectTradeChoices();}if(e.target.dataset.directTrade==='offer')form.elements.offeredId.value=e.target.value;if(e.target.dataset.directTrade==='want')form.elements.wantedId.value=e.target.value;});
document.querySelector('#cardTradeForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const body={...Object.fromEntries(new FormData(form)),action:'create'};setBusy(form,true);
  try{applyState(await api('/api/card-trades',{method:'POST',body}));showToast('Proposta de cartas enviada.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}
});
document.querySelector('#cardTradeList').addEventListener('click',async e=>{
  const button=e.target.closest('[data-card-trade]');if(!button)return;
  if(button.dataset.cardTrade==='accept'&&!confirm('Confirmar a troca de uma unidade de cada carta?'))return;
  button.disabled=true;
  try{applyState(await api('/api/card-trades',{method:'POST',body:{action:button.dataset.cardTrade,id:button.dataset.id}}));showToast('Proposta atualizada.');}catch(error){showToast(error.message,'error');}finally{button.disabled=false;}
});
document.querySelector('#cardMarketForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;setBusy(form,true);try{applyState(await api('/api/card-trades',{method:'POST',body:{action:'publish',offeredId:form.elements.offeredId.value}}));showToast('Carta publicada no mural de trocas.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});
function refreshCardChoiceCombo(select){const combo=select.closest('.card-choice-combo'),option=select.selectedOptions?.[0];if(!combo||!option)return;const icon=combo.querySelector('.card-choice-combo-icon'),count=combo.querySelector('b'),art=option.dataset.art||'';if(icon)icon.innerHTML=art?'<img class="card-choice-art" src="'+escapeHtml(art)+'" alt="">':'<span class="card-choice-art card-trade-icon" aria-hidden="true">'+escapeHtml(option.dataset.icon||'🎴')+'</span>';if(count)count.textContent=(option.dataset.count||'0')+' cópias';}
document.querySelector('#cardMarketForm').addEventListener('change',e=>{if(e.target.name==='offeredId'){cardMarketPublishSelection=e.target.value;refreshCardChoiceCombo(e.target);}});
document.querySelector('#cardTradeMarket').addEventListener('change',e=>{if(e.target.name==='cardId'){const form=e.target.closest('[data-card-market-offer]');if(form)cardMarketOfferSelections.set(form.dataset.cardMarketOffer,e.target.value);refreshCardChoiceCombo(e.target);}});
document.querySelector('#cardTradeMarket').addEventListener('submit',async e=>{const form=e.target.closest('[data-card-market-offer]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;setBusy(form,true);try{applyState(await api('/api/card-trades',{method:'POST',body:{action:'offer-market',id:form.dataset.cardMarketOffer,cardId:form.elements.cardId.value}}));showToast('Oferta enviada para a pessoa escolher.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});
document.querySelector('#cardTradeMarket').addEventListener('submit',async e=>{const form=e.target.closest('[data-card-market-credit-offer]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;setBusy(form,true);try{applyState(await api('/api/card-trades',{method:'POST',body:{action:'offer-market-credits',id:form.dataset.cardMarketCreditOffer,creditAmount:Number(form.elements.creditAmount.value)}}));showToast('Oferta em créditos enviada. O valor ficou reservado.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});
document.querySelector('#cardTradeMarket').addEventListener('click',async e=>{const button=e.target.closest('[data-card-market]');if(!button)return;if(button.dataset.cardMarket==='accept-market'&&!confirm('Aceitar esta oferta e transferir a carta agora?'))return;if(button.dataset.cardMarket==='reject-market-offer'&&!confirm('Recusar esta oferta? A pessoa será avisada e o item oferecido ficará livre novamente.'))return;button.disabled=true;try{applyState(await api('/api/card-trades',{method:'POST',body:{action:button.dataset.cardMarket,id:button.dataset.id,offerId:button.dataset.offerId}}));showToast(button.dataset.cardMarket==='accept-market'?'Negócio concluído.':button.dataset.cardMarket==='reject-market-offer'?'Oferta recusada e participante avisado.':button.dataset.cardMarket==='cancel-market-offer'?'Sua oferta foi liberada.':'Oferta retirada.');}catch(error){showToast(error.message,'error');}finally{button.disabled=false;}});
