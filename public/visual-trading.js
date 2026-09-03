let tradingSignature='';
function renderVisualTrading(data) {
  const form=document.querySelector('#visualTradeForm');
  const signature=JSON.stringify([appState.me.id,data]);
  if(!form || signature===tradingSignature)return;
  tradingSignature=signature;
  const selected=Object.fromEntries(new FormData(form));
  const people=data.participants || [],me=people.find(p=>p.id===appState.me.id);
  const options=(entries,label)=>'<option value="">'+label+'</option>'+entries.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+'</option>').join('');
  form.elements.partnerId.innerHTML=options(people.filter(p=>p.id!==appState.me.id),'Escolha alguém');
  form.elements.offeredId.innerHTML=options(me?.items || [],'Escolha seu visual');
  form.elements.partnerId.value=selected.partnerId || '';
  form.elements.offeredId.value=selected.offeredId || '';
  updateTradeWanted(selected.wantedId);
  const labels={pending:'Aguardando confirmação',accepted:'Troca concluída',rejected:'Recusada',cancelled:'Cancelada',expired:'Expirada'};
  document.querySelector('#visualTradeList').innerHTML=(data.trades || []).map(t=>'<article><strong>'+escapeHtml(t.partnerName)+'</strong><p>Oferecido: '+escapeHtml(t.offeredName)+'<br>Em troca de: '+escapeHtml(t.wantedName)+'</p><small>'+escapeHtml(labels[t.status]||t.status)+'</small>'+(t.status==='pending'?'<div>'+(t.incoming?'<button type="button" data-trade-action="accept" data-trade-id="'+escapeHtml(t.id)+'">Aceitar troca</button><button type="button" data-trade-action="reject" data-trade-id="'+escapeHtml(t.id)+'">Recusar</button>':'<button type="button" data-trade-action="cancel" data-trade-id="'+escapeHtml(t.id)+'">Cancelar proposta</button>')+'</div>':'')+'</article>').join('') || '<p>Nenhuma proposta ainda.</p>';
}
function updateTradeWanted(selected='') {
  const form=document.querySelector('#visualTradeForm');
  const partner=(appState.trading?.participants || []).find(p=>p.id===form.elements.partnerId.value);
  form.elements.wantedId.innerHTML='<option value="">Escolha o visual da pessoa</option>'+(partner?.items || []).map(i=>'<option value="'+escapeHtml(i.id)+'">'+escapeHtml(i.name)+'</option>').join('');
  form.elements.wantedId.value=selected || '';
}
document.querySelector('#visualTradeForm').addEventListener('change',e=>{if(e.target.name==='partnerId')updateTradeWanted();});
document.querySelector('#visualTradeForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  if(!confirm('Enviar esta proposta? O visual só muda de dono quando a outra pessoa aceitar.'))return;
  setBusy(form,true);
  try{applyState(await api('/api/trades/create',{method:'POST',body:data}));showToast('Proposta enviada. Aguarde a confirmação.');}catch(err){showToast(err.message,'error');}finally{setBusy(form,false);}
});
document.querySelector('#visualTradeList').addEventListener('click',async e=>{
  const button=e.target.closest('[data-trade-action]');if(!button)return;
  if(button.dataset.tradeAction==='accept' && !confirm('Confirmar a troca definitiva dos dois visuais? Se estiverem equipados, serão removidos para os novos donos aplicarem.'))return;
  button.disabled=true;
  try{applyState(await api('/api/trades/respond',{method:'POST',body:{id:button.dataset.tradeId,action:button.dataset.tradeAction}}));showToast('Proposta atualizada.');}catch(err){showToast(err.message,'error');}finally{button.disabled=false;}
});
document.querySelector('#lieRanking').addEventListener('click',async e=>{
  const button=e.target.closest('[data-report-lie]');if(!button)return;
  const reason=prompt('Por que esta mentira deve ser revisada pelo administrador? (5 a 500 caracteres)');
  if(reason===null)return;if(reason.trim().length<5 || reason.length>500){showToast('Explique em 5 a 500 caracteres.','error');return;}
  button.disabled=true;
  try{applyState(await api('/api/lie-meter/report',{method:'POST',body:{lieId:button.dataset.reportLie,reason}}));showToast('Denúncia enviada ao administrador. Acompanhe em Minhas solicitações.');}catch(err){showToast(err.message,'error');}finally{button.disabled=false;}
});
