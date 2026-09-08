let albumSignature='';
let cardPackOpening=false;
let selectedCardPackId='';
function renderCardPacks(profile) {
  if(cardPackOpening || !profile)return;
  const closed=profile.cardPacks || [],history=profile.openedCardPacks || [];
  document.querySelector('#cardPackInventory').innerHTML=closed.length?'<p>'+closed.length+' pacote(s) fechado(s)</p><div class="closed-pack-grid">'+closed.map(p=>'<button class="closed-pack pack-'+escapeHtml(p.value||'cosmic')+'" type="button" data-open-card-pack="'+escapeHtml(p.id)+'" data-pack-name="'+escapeHtml(p.name||'Pacotinho')+'" data-pack-icon="'+escapeHtml(p.icon||'🎴')+'" data-pack-tier="'+escapeHtml(p.value||'cosmic')+'"><span>'+escapeHtml(p.icon||'🎴')+'</span><strong>'+escapeHtml(p.name||'Pacotinho')+'</strong><small>'+Number(p.rareChance||10)+'% de rara por carta</small></button>').join('')+'</div>':'<p>Nenhum pacote fechado. Encontre os pacotinhos na Loja.</p>';
  document.querySelector('#cardPackHistory').innerHTML=history.length?'<details><summary>Últimos pacotes abertos</summary>'+history.map(p=>'<p>'+p.cards.map(c=>escapeHtml(c.icon+' '+c.name)+(c.rarity==='rare'?' ★ RARA':'')).join(' · ')+'</p>').join('')+'</details>':'';
}
document.querySelector('#cardPackInventory').addEventListener('click',async event=>{
  const button=event.target.closest('[data-open-card-pack]');if(!button || cardPackOpening)return;
  const dialog=document.querySelector('#cardPackDialog'),result=document.querySelector('#cardPackResult'),packet=document.querySelector('#cardPackEnvelope'),close=document.querySelector('#closeCardPack');
  selectedCardPackId=button.dataset.openCardPack;
  document.querySelector('#cardPackTitle').textContent=button.dataset.packName || 'Pacotinho';
  packet.dataset.tier=button.dataset.packTier || 'cosmic';packet.querySelector('.pack-alien').textContent=button.dataset.packIcon || '👽';
  result.innerHTML='<p class="card-pack-opening-copy">O pacote ainda está fechado. Clique no lacre para rasgar e revelar as cartas.</p>';
  packet.classList.remove('opening','torn','revealed');packet.disabled=false;close.disabled=false;dialog.showModal();packet.focus();
});
document.querySelector('#cardPackEnvelope').addEventListener('click',async()=>{
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
    result.innerHTML='<div class="pack-reveal">'+data.cardPackResult.map((c,index)=>'<article class="album-card owned pack-card-reveal '+(c.rarity==='rare'?'album-rare':'')+'" style="--reveal-delay:'+(index*150)+'ms"><small>'+(c.rarity==='rare'?'★ RARA':'NOVA CARTA')+'</small><span>'+escapeHtml(c.icon)+'</span><strong>'+escapeHtml(c.name)+'</strong><b>'+ (c.rarity==='rare'?'RARA':'BÁSICA') +'</b></article>').join('')+'</div><p class="card-pack-added">✓ As três cartas foram adicionadas ao Álbum.</p>';
    selectedCardPackId='';applyState(data);
  } catch(error) { result.textContent=error.message+' Se a conexão caiu, tente novamente: o mesmo pacote não será consumido duas vezes.'; }
  finally { cardPackOpening=false;mysteryOpeningInProgress=false;close.disabled=false;packet.disabled=!selectedCardPackId;renderCardPacks(appState?.profile); }
});
document.querySelector('#cardPackDialog').addEventListener('cancel',event=>{if(cardPackOpening)event.preventDefault();});
document.querySelector('#closeCardPack').addEventListener('click',()=>{selectedCardPackId='';document.querySelector('#cardPackDialog').close();});

function renderCardAlbum(album) {
  const host=document.querySelector('#cardAlbumCollections');if(!host || !album)return;
  const signature=JSON.stringify([appState.me.id,album]);if(signature===albumSignature)return;albumSignature=signature;
  document.querySelector('#cardDropProgress').textContent='Hoje: '+Number(album.dropsToday||0)+' de 2 cartas encontradas · '+Number(album.attemptsToday||0)+' de 5 atividades verificadas';
  renderCardTrades(album.trading || {});
  host.innerHTML=album.collections.map(c=>'<article class="album-collection album-'+escapeHtml(c.color)+'"><header><span class="album-medal" aria-hidden="true">'+escapeHtml(c.icon)+'</span><div><h4>'+escapeHtml(c.name)+'</h4><p>Insígnia: '+escapeHtml(c.badge)+'</p></div><strong class="album-progress">'+c.collected+' / 5</strong></header><div class="album-cards">'+c.cards.map((card,i)=>'<div class="album-card '+(card.count?'owned':'missing')+(card.count>1?' duplicate':'')+(card.rarity==='rare'?' album-rare':'')+'">'+(card.count?'<b class="album-owned-mark">✓ NA COLEÇÃO</b>':'<b class="album-missing-mark">FALTA</b>')+'<small>CARTA '+(i+1)+' / 5 · '+(card.rarity==='rare'?'RARA':'BÁSICA')+'</small><span aria-hidden="true">'+escapeHtml(card.icon)+'</span><strong>'+escapeHtml(card.name)+'</strong><small class="album-card-count">'+(card.count?(card.count>1?card.count+' cópias · repetida':'1 cópia sua'):'Ainda não obtida')+'</small></div>').join('')+'</div><footer><p>'+(c.craftedAt?'✓ Insígnia montada':c.collected+' de 5 cartas diferentes')+'</p>'+(c.craftedAt?'<button type="button" data-album-action="equip" data-album-id="'+escapeHtml(c.id)+'" data-album-remove="'+(album.equipped===c.id)+'">'+(album.equipped===c.id?'Remover insígnia':'Usar insígnia')+'</button>':'<button type="button" data-album-action="craft" data-album-id="'+escapeHtml(c.id)+'"'+(c.canCraft?'':' disabled')+'>Montar insígnia</button>')+'</footer></article>').join('');
  host.querySelectorAll('.album-collection').forEach((element,index)=>{const medal=album.collections[index]?.medal;if(!medal)return;const target=element.querySelector('header div p');if(target)target.insertAdjacentHTML('beforeend',' <span class="album-tier tier-'+escapeHtml(medal.tier)+'">'+escapeHtml(medal.icon)+' '+escapeHtml(medal.label)+'</span>');});
}
function showInsigniaCraftAnimation(collection){const medal=collection?.medal || {icon:'🥉',label:'Bronze',tier:'bronze'};const flash=document.createElement('div');flash.className='insignia-craft-animation tier-'+medal.tier;flash.innerHTML='<span>'+escapeHtml(medal.icon)+'</span><strong>INSÍGNIA MONTADA!</strong><b>'+escapeHtml(medal.label)+'</b>';document.body.appendChild(flash);setTimeout(()=>flash.remove(),2600);}
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
  const options=(items,label)=>'<option value="">'+label+'</option>'+items.map(i=>'<option value="'+escapeHtml(i.id)+'">'+escapeHtml(i.name)+'</option>').join('');
  const visualChoices=(items,name,emptyText)=>items.length?'<div class="card-choice-strip" role="radiogroup" aria-label="Escolha uma carta">'+items.map((card,index)=>'<label class="card-choice"><input type="radio" name="'+name+'" value="'+escapeHtml(card.id)+'"'+(index===0?' checked':'')+'><span>'+escapeHtml(card.icon)+'</span><strong>'+escapeHtml(card.name)+'</strong><small>'+Number(card.count||0)+' cópias</small></label>').join('')+'</div>':'<p class="card-choice-empty">'+emptyText+'</p>';
  form.elements.partnerId.innerHTML=options((trading.partners || []).filter(p=>p.id!==appState.me.id),'Escolha alguém');
  form.elements.offeredId.innerHTML=options(trading.partners?.find(p=>p.id===appState.me.id)?.cards || [],'Minha carta repetida');
  form.elements.partnerId.value=selected.partnerId || '';form.elements.offeredId.value=selected.offeredId || '';
  updateCardTradeWanted(selected.wantedId);
  const labels={pending:'Aguardando confirmação',accepted:'Troca concluída',rejected:'Recusada',cancelled:'Cancelada',expired:'Expirada'};
  document.querySelector('#cardTradeList').innerHTML=(trading.trades || []).map(t=>'<article><strong>'+escapeHtml(t.partnerName)+'</strong><p>'+escapeHtml(t.offeredName)+' ↔ '+escapeHtml(t.wantedName)+'</p><small>'+escapeHtml(labels[t.status] || t.status)+'</small>'+(t.status==='pending'?'<div>'+(t.incoming?'<button data-card-trade="accept" data-id="'+escapeHtml(t.id)+'">Aceitar</button><button data-card-trade="reject" data-id="'+escapeHtml(t.id)+'">Recusar</button>':'<button data-card-trade="cancel" data-id="'+escapeHtml(t.id)+'">Cancelar</button>')+'</div>':'')+'</article>').join('') || '<p>Nenhuma proposta. Encontre cartas repetidas para começar a trocar.</p>';
  const marketForm=document.querySelector('#cardMarketForm'),mine=trading.partners?.find(p=>p.id===appState.me.id)?.cards || [];
  const publishedIds=new Set((trading.market || []).filter(post=>post.mine).map(post=>post.offeredId));
  const availableToPublish=mine.filter(card=>!publishedIds.has(card.id));
  if(marketForm){marketForm.querySelector('label').innerHTML='<span>Minha carta repetida</span>'+visualChoices(availableToPublish,'offeredId','Todas as repetidas disponíveis já estão publicadas.');marketForm.querySelector('button[type="submit"]').disabled=!availableToPublish.length;}
  const reservedOfferIds=new Set(trading.reservedOfferCardIds || []);
  document.querySelector('#cardTradeMarket').innerHTML=(trading.market || []).map(post=>{
    const eligibleMine=mine.filter(card=>!reservedOfferIds.has(card.id));
    const offerOptions=visualChoices(eligibleMine,'cardId','Nenhuma carta diferente está disponível para esta oferta.');
    const offers=post.offers || [];
    const myOffer=offers.find(offer=>offer.fromId===appState.me.id);
    const ownerOffers='<div class="card-market-offers">'+(offers.length?offers.map(offer=>'<article class="card-market-offer"><span class="card-market-offer-icon">'+escapeHtml(offer.cardIcon)+'</span><div><strong>'+escapeHtml(offer.cardName)+'</strong><small>Oferta de '+escapeHtml(offer.fromName)+'</small><b class="card-offer-status '+(offer.offerKind==='credits'?'credits':offer.viewerHasCard?'owned':'new')+'">'+(offer.offerKind==='credits'?'Pagamento em moedas':offer.viewerHasCard?'Você já possui':'Nova para sua coleção')+'</b></div><span class="card-market-offer-actions"><button data-card-market="accept-market" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(offer.id)+'">Aceitar</button><button class="reject" data-card-market="reject-market-offer" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(offer.id)+'">Recusar</button></span></article>').join(''):'<small>Aguardando ofertas da equipe.</small>')+'</div>';
    const cardOffer='<form class="visual-card-offer-form" data-card-market-offer="'+escapeHtml(post.id)+'"><fieldset><legend>Trocar por uma carta repetida</legend>'+offerOptions+'</fieldset><button type="submit"'+(eligibleMine.length?'':' disabled')+'>Oferecer carta</button></form>';
    const availableCredits=Math.max(0,Number(trading.availableTradeCredits || 0));
    const creditOffer='<form class="credit-card-offer-form" data-card-market-credit-offer="'+escapeHtml(post.id)+'"><label>Ou comprar com moedas <span>Disponível: '+availableCredits.toLocaleString('pt-BR')+'</span><input name="creditAmount" type="number" inputmode="numeric" min="1" max="'+Math.min(5000,availableCredits)+'" step="1" placeholder="Valor da oferta" required></label><button type="submit"'+(availableCredits?'':' disabled')+'>Oferecer créditos</button></form>';
    const myOfferCard='<div class="my-market-offer"><span>'+escapeHtml(myOffer?.cardIcon || '')+'</span><p><strong>Sua oferta: '+escapeHtml(myOffer?.cardName || '')+'</strong><small>'+(myOffer?.offerKind==='credits'?'Este saldo fica reservado até a oferta ser retirada ou encerrada.':'Esta carta está reservada até a oferta ser retirada ou encerrada.')+'</small></p><button data-card-market="cancel-market-offer" data-id="'+escapeHtml(post.id)+'" data-offer-id="'+escapeHtml(myOffer?.id || '')+'">Retirar minha oferta</button></div>';
    const offerArea=post.mine?ownerOffers:myOffer?myOfferCard:'<div class="card-market-offer-methods">'+cardOffer+creditOffer+'</div>';
    const ownership=post.mine?'<b class="market-card-ownership mine">Sua publicação</b>':'<b class="market-card-ownership '+(post.viewerHasOfferedCard?'owned':'missing')+'">'+(post.viewerHasOfferedCard?'✓ Você já possui esta carta':'✦ Você ainda não possui')+'</b>';
    return '<article class="card-market-post"><header><span>'+escapeHtml(post.offeredIcon)+'</span><div><strong>'+escapeHtml(post.offeredName)+'</strong><small>Oferecida por '+escapeHtml(post.fromName)+'</small>'+ownership+'</div>'+(post.mine?'<button data-card-market="cancel-market" data-id="'+escapeHtml(post.id)+'">Retirar</button>':'')+'</header>'+offerArea+'</article>';
  }).join('') || '<p class="card-market-empty">Nenhuma carta pública agora. Publique a sua primeira oferta.</p>';
}
function updateCardTradeWanted(selected=''){
  const form=document.querySelector('#cardTradeForm'),partner=appState.cardAlbum?.trading?.partners?.find(p=>p.id===form.elements.partnerId.value);
  form.elements.wantedId.innerHTML='<option value="">Carta repetida da pessoa</option>'+(partner?.cards || []).map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
  form.elements.wantedId.value=selected || '';
}
document.querySelector('#cardTradeForm').addEventListener('change',e=>{if(e.target.name==='partnerId')updateCardTradeWanted();});
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
document.querySelector('#cardTradeMarket').addEventListener('submit',async e=>{const form=e.target.closest('[data-card-market-offer]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;setBusy(form,true);try{applyState(await api('/api/card-trades',{method:'POST',body:{action:'offer-market',id:form.dataset.cardMarketOffer,cardId:form.elements.cardId.value}}));showToast('Oferta enviada para a pessoa escolher.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});
document.querySelector('#cardTradeMarket').addEventListener('submit',async e=>{const form=e.target.closest('[data-card-market-credit-offer]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;setBusy(form,true);try{applyState(await api('/api/card-trades',{method:'POST',body:{action:'offer-market-credits',id:form.dataset.cardMarketCreditOffer,creditAmount:Number(form.elements.creditAmount.value)}}));showToast('Oferta em créditos enviada. O valor ficou reservado.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});
document.querySelector('#cardTradeMarket').addEventListener('click',async e=>{const button=e.target.closest('[data-card-market]');if(!button)return;if(button.dataset.cardMarket==='accept-market'&&!confirm('Aceitar esta oferta e transferir a carta agora?'))return;if(button.dataset.cardMarket==='reject-market-offer'&&!confirm('Recusar esta oferta? A pessoa será avisada e o item oferecido ficará livre novamente.'))return;button.disabled=true;try{applyState(await api('/api/card-trades',{method:'POST',body:{action:button.dataset.cardMarket,id:button.dataset.id,offerId:button.dataset.offerId}}));showToast(button.dataset.cardMarket==='accept-market'?'Negócio concluído.':button.dataset.cardMarket==='reject-market-offer'?'Oferta recusada e participante avisado.':button.dataset.cardMarket==='cancel-market-offer'?'Sua oferta foi liberada.':'Oferta retirada.');}catch(error){showToast(error.message,'error');}finally{button.disabled=false;}});
