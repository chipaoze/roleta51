let albumSignature='';
let cardPackOpening=false;
function renderCardPacks(profile) {
  if(cardPackOpening || !profile)return;
  const closed=profile.cardPacks || [],history=profile.openedCardPacks || [];
  document.querySelector('#cardPackInventory').innerHTML=closed.length?'<p>'+closed.length+' pacote(s) fechado(s)</p>'+closed.map(p=>'<button type="button" data-open-card-pack="'+escapeHtml(p.id)+'">🎴 Rasgar pacotinho</button>').join(''):'<p>Nenhum pacote fechado. Encontre o Pacotinho Cósmico na Loja.</p>';
  document.querySelector('#cardPackHistory').innerHTML=history.length?'<details><summary>Últimos pacotes abertos</summary>'+history.map(p=>'<p>'+p.cards.map(c=>escapeHtml(c.icon+' '+c.name)+(c.rarity==='rare'?' ★ RARA':'')).join(' · ')+'</p>').join('')+'</details>':'';
}
document.querySelector('#cardPackInventory').addEventListener('click',async event=>{
  const button=event.target.closest('[data-open-card-pack]');if(!button || cardPackOpening)return;
  cardPackOpening=true;mysteryOpeningInProgress=true;button.disabled=true;
  const dialog=document.querySelector('#cardPackDialog'),result=document.querySelector('#cardPackResult'),packet=document.querySelector('#cardPackEnvelope'),close=document.querySelector('#closeCardPack');
  result.innerHTML='<p class="card-pack-opening-copy">Confirmando o pacote…</p>';packet.classList.remove('opening','torn','revealed');close.disabled=true;dialog.showModal();
  try {
    // The same owned purchase ID is the idempotency key; a retry never grants twice.
    const data=await api('/api/card-packs/open',{method:'POST',body:{purchaseId:button.dataset.openCardPack}});
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    result.innerHTML='<p class="card-pack-opening-copy">Puxando o lacre cósmico…</p>';packet.classList.add('opening');
    await new Promise(resolve=>setTimeout(resolve,reduced?100:650));
    result.innerHTML='<p class="card-pack-opening-copy">Rasgando o pacote…</p>';packet.classList.add('torn');
    await new Promise(resolve=>setTimeout(resolve,reduced?120:1000));
    result.innerHTML='<p class="card-pack-opening-copy">Revelando as cartas…</p>';packet.classList.add('revealed');
    await new Promise(resolve=>setTimeout(resolve,reduced?120:600));
    result.innerHTML='<div class="pack-reveal">'+data.cardPackResult.map((c,index)=>'<article class="album-card owned pack-card-reveal '+(c.rarity==='rare'?'album-rare':'')+'" style="--reveal-delay:'+(index*150)+'ms"><small>'+(c.rarity==='rare'?'★ RARA':'NOVA CARTA')+'</small><span>'+escapeHtml(c.icon)+'</span><strong>'+escapeHtml(c.name)+'</strong><b>'+ (c.rarity==='rare'?'RARA':'BÁSICA') +'</b></article>').join('')+'</div><p class="card-pack-added">✓ As três cartas foram adicionadas ao Álbum.</p>';
    applyState(data);
  } catch(error) { result.textContent=error.message+' Se a conexão caiu, tente novamente: o mesmo pacote não será consumido duas vezes.'; }
  finally { cardPackOpening=false;mysteryOpeningInProgress=false;close.disabled=false;button.disabled=false;renderCardPacks(appState?.profile); }
});
document.querySelector('#cardPackDialog').addEventListener('cancel',event=>{if(cardPackOpening)event.preventDefault();});
document.querySelector('#closeCardPack').addEventListener('click',()=>document.querySelector('#cardPackDialog').close());

function renderCardAlbum(album) {
  const host=document.querySelector('#cardAlbumCollections');if(!host || !album)return;
  const signature=JSON.stringify([appState.me.id,album]);if(signature===albumSignature)return;albumSignature=signature;
  document.querySelector('#cardDropProgress').textContent='Hoje: '+Number(album.dropsToday||0)+' de 2 cartas encontradas · '+Number(album.attemptsToday||0)+' de 5 atividades verificadas';
  renderCardTrades(album.trading || {});
  host.innerHTML=album.collections.map(c=>'<article class="album-collection album-'+escapeHtml(c.color)+'"><header><span class="album-medal" aria-hidden="true">'+escapeHtml(c.icon)+'</span><div><h4>'+escapeHtml(c.name)+'</h4><p>Insígnia: '+escapeHtml(c.badge)+'</p></div><strong class="album-progress">'+c.collected+' / 5</strong></header><div class="album-cards">'+c.cards.map((card,i)=>'<div class="album-card '+(card.count?'owned':'missing')+(card.count>1?' duplicate':'')+(card.rarity==='rare'?' album-rare':'')+'">'+(card.count?'<b class="album-owned-mark">✓ NA COLEÇÃO</b>':'<b class="album-missing-mark">FALTA</b>')+'<small>CARTA '+(i+1)+' / 5 · '+(card.rarity==='rare'?'RARA':'BÁSICA')+'</small><span aria-hidden="true">'+escapeHtml(card.icon)+'</span><strong>'+escapeHtml(card.name)+'</strong><small class="album-card-count">'+(card.count?(card.count>1?card.count+' cópias · repetida':'1 cópia sua'):'Ainda não obtida')+'</small></div>').join('')+'</div><footer><p>'+(c.craftedAt?'✓ Insígnia montada':c.collected+' de 5 cartas diferentes')+'</p>'+(c.craftedAt?'<button type="button" data-album-action="equip" data-album-id="'+escapeHtml(c.id)+'" data-album-remove="'+(album.equipped===c.id)+'">'+(album.equipped===c.id?'Remover insígnia':'Usar insígnia')+'</button>':'<button type="button" data-album-action="craft" data-album-id="'+escapeHtml(c.id)+'"'+(c.canCraft?'':' disabled')+'>Montar insígnia</button>')+'</footer></article>').join('');
}
document.querySelector('#cardAlbumCollections').addEventListener('click',async e=>{
  const button=e.target.closest('[data-album-action]');if(!button || button.disabled)return;
  const action=button.dataset.albumAction;
  if(action==='craft' && !confirm('Montar esta insígnia? Será consumida uma unidade de cada uma das cinco cartas da coleção.'))return;
  button.disabled=true;
  try{applyState(await api('/api/card-album',{method:'POST',body:{action,collectionId:button.dataset.albumRemove==='true'?null:button.dataset.albumId}}));showToast(action==='craft'?'Insígnia montada!':'Insígnia atualizada.');}catch(err){showToast(err.message,'error');}finally{button.disabled=false;}
});
function renderCardTrades(trading){
  const form=document.querySelector('#cardTradeForm');if(!form)return;
  const selected=Object.fromEntries(new FormData(form));
  const options=(items,label)=>'<option value="">'+label+'</option>'+items.map(i=>'<option value="'+escapeHtml(i.id)+'">'+escapeHtml(i.name)+'</option>').join('');
  form.elements.partnerId.innerHTML=options((trading.partners || []).filter(p=>p.id!==appState.me.id),'Escolha alguém');
  form.elements.offeredId.innerHTML=options(trading.partners?.find(p=>p.id===appState.me.id)?.cards || [],'Minha carta repetida');
  form.elements.partnerId.value=selected.partnerId || '';form.elements.offeredId.value=selected.offeredId || '';
  updateCardTradeWanted(selected.wantedId);
  const labels={pending:'Aguardando confirmação',accepted:'Troca concluída',rejected:'Recusada',cancelled:'Cancelada',expired:'Expirada'};
  document.querySelector('#cardTradeList').innerHTML=(trading.trades || []).map(t=>'<article><strong>'+escapeHtml(t.partnerName)+'</strong><p>'+escapeHtml(t.offeredName)+' ↔ '+escapeHtml(t.wantedName)+'</p><small>'+escapeHtml(labels[t.status] || t.status)+'</small>'+(t.status==='pending'?'<div>'+(t.incoming?'<button data-card-trade="accept" data-id="'+escapeHtml(t.id)+'">Aceitar</button><button data-card-trade="reject" data-id="'+escapeHtml(t.id)+'">Recusar</button>':'<button data-card-trade="cancel" data-id="'+escapeHtml(t.id)+'">Cancelar</button>')+'</div>':'')+'</article>').join('') || '<p>Nenhuma proposta. Encontre cartas repetidas para começar a trocar.</p>';
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
