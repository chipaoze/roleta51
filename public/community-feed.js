// Posts reuse the existing mural records, reactions and mission rules.
let communityFeedSignature = '';
function mentionPeople() { return (appState?.powerParticipants || []).filter(person => person.id !== appState?.me?.id); }
function mentionParts(message, people) {
  const names = [...people].sort((a,b) => b.displayName.length-a.displayName.length);
  const parts = []; let from = 0;
  for (let i=0;i<message.length;i++) {
    if (message[i] !== '@' || (i && /[\p{L}\p{N}_]/u.test(message[i-1]))) continue;
    const person = names.find(p => message.slice(i+1,i+1+p.displayName.length).toLocaleLowerCase('pt-BR') === p.displayName.toLocaleLowerCase('pt-BR') && !/[\p{L}\p{N}_]/u.test(message[i+1+p.displayName.length] || ''));
    if (!person) continue;
    if (from<i) parts.push({text:message.slice(from,i)});
    const end=i+1+person.displayName.length;
    parts.push({text:message.slice(i,end),person}); from=end; i=end-1;
  }
  if (from<message.length) parts.push({text:message.slice(from)});
  return parts;
}
function highlightedComment(comment) {
  const people = (comment.mentions || []).map(m => ({id:m.userId,displayName:m.displayName || (appState?.powerParticipants || []).find(p=>p.id===m.userId)?.displayName})).filter(p=>p.displayName);
  return mentionParts(comment.message,people).map(part => part.person ? `<mark class="mention-tag" title="Pessoa marcada">${escapeHtml(part.text)}</mark>` : escapeHtml(part.text)).join('');
}
function mentionQuery(value, caret) {
  const before=value.slice(0,caret), match=before.match(/(?:^|[^\p{L}\p{N}_])@([^@\n]{0,50})$/u);
  if (!match) return null;
  return {start:before.lastIndexOf('@'),end:caret,query:match[1]};
}
function mentionComposer(type, postId, value='', editId='') {
  const listId='mentions-'+type+'-'+postId+'-'+(editId||'new');
  return `<form class="mention-composer" data-comment-type="${type}" data-comment-id="${escapeHtml(postId)}"${editId ? ` data-edit-comment="${escapeHtml(editId)}"` : ''}><label>${editId ? 'Editar comentário' : 'Seu comentário'}<input name="message" value="${escapeHtml(value)}" maxlength="300" required autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${escapeHtml(listId)}" placeholder="Digite @ para marcar alguém"></label><button class="button button-dark" type="submit">${editId ? 'Salvar' : 'Comentar'}</button>${editId ? '<button type="button" data-cancel-comment>Cancelar</button>' : ''}<div class="mention-suggestions" id="${escapeHtml(listId)}" role="listbox" aria-label="Pessoas para marcar" hidden></div><div class="mention-selected" aria-live="polite"></div></form>`;
}
function closeMentionList(input) {
  const list=input.form.querySelector('.mention-suggestions'); list.hidden=true; list.innerHTML='';
  input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant');
}
function refreshMentions(input, suggestions=true) {
  const form=input.form, people=mentionPeople();
  const selected=[...new Map(mentionParts(input.value,people).filter(p=>p.person).map(p=>[p.person.id,p.person])).values()];
  form.querySelector('.mention-selected').innerHTML=selected.length ? 'Será notificado: '+selected.slice(0,5).map(p=>`<mark class="mention-tag">@${escapeHtml(p.displayName)}</mark>`).join(' ') + (selected.length>5 ? ' · Limite: 5 pessoas por comentário.' : '') : '';
  const query=mentionQuery(input.value,input.selectionStart ?? input.value.length);
  if (!suggestions || !query || (query.query.endsWith(' ') && people.some(p=>p.displayName.toLocaleLowerCase('pt-BR')===query.query.trim().toLocaleLowerCase('pt-BR')))) {closeMentionList(input);return;}
  const normalize=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
  const found=people.filter(p=>normalize(p.displayName).includes(normalize(query.query))).slice(0,8);
  const list=form.querySelector('.mention-suggestions'); list.hidden=false;
  list.innerHTML=found.length ? found.map((p,i)=>`<button type="button" role="option" aria-selected="${i===0}" id="${escapeHtml(list.id)}-${i}" data-mention-choice="${escapeHtml(p.id)}"><span aria-hidden="true">@</span>${escapeHtml(p.displayName)}</button>`).join('') : '<span>Nenhuma pessoa encontrada.</span>';
  input.setAttribute('aria-expanded','true'); input.removeAttribute('aria-activedescendant');
  if (found.length) input.setAttribute('aria-activedescendant',list.id+'-0');
}
function chooseMention(input, id) {
  const person=mentionPeople().find(p=>p.id===id), query=mentionQuery(input.value,input.selectionStart ?? input.value.length);
  if (!person || !query) return;
  const insertion='@'+person.displayName+' ', value=input.value.slice(0,query.start)+insertion+input.value.slice(query.end);
  if (value.length>300) {showToast('O comentário pode ter até 300 caracteres.','error');return;}
  input.value=value; input.focus(); input.setSelectionRange(query.start+insertion.length,query.start+insertion.length);refreshMentions(input,false);
}
function renderCommunityFeed(wall) {
  const container = document.querySelector('#communityFeed');
  if (!container) return;
  const posts = [...(wall.phrases || []).map((post) => ({ ...post, type: 'phrase' })), ...(wall.memes || []).map((post) => ({ ...post, type: 'meme' }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emojis = wall.emojis || ['😂','👽','🤨','💀'];
  const avatars = appState?.avatars || {};
  const signature = JSON.stringify([posts, emojis, avatars]);
  // Background sync must not erase a comment being typed.
  if (signature === communityFeedSignature || container.contains(document.activeElement)) return;
  communityFeedSignature = signature;
  container.innerHTML = posts.map((post) => `<article class="feed-post">
    <header><div class="feed-author">${avatars[post.userId] ? `<img class="feed-avatar" src="${escapeHtml(avatars[post.userId])}" alt="Foto de ${escapeHtml(post.authorName)}">` : `<span class="feed-avatar feed-avatar-fallback" aria-hidden="true">${escapeHtml((post.authorName || '?').slice(0,1).toUpperCase())}</span>`}<div><strong>${escapeHtml(formatDisplayName(post.authorName))}</strong><time>${escapeHtml(formatDate(post.createdAt))}</time></div></div>
    <div class="feed-post-actions">${post.canEdit ? `<button type="button" data-feed-edit="${escapeHtml(post.id)}" data-feed-type="${post.type}">Editar</button>` : ''}${post.canDelete ? `<button type="button" data-feed-delete="${escapeHtml(post.id)}" data-feed-type="${post.type}">Excluir</button>` : ''}</div></header>
    <p class="feed-post-text">${escapeHtml(post.phrase || post.caption || '')}</p>
    ${post.imageUrl ? `<a href="${escapeHtml(post.imageUrl)}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeHtml(post.imageUrl)}" alt="Publicação de ${escapeHtml(post.authorName)}"></a>` : ''}
    <div class="daily-reactions">${emojis.map((emoji) => `<button type="button" aria-label="Reagir com ${emoji}" aria-pressed="${post.reactions?.mine?.includes(emoji) ? 'true' : 'false'}" class="${post.reactions?.mine?.includes(emoji) ? 'active' : ''}" data-reaction-type="${post.type}" data-reaction-id="${escapeHtml(post.id)}" data-reaction-emoji="${emoji}">${emoji} ${Number(post.reactions?.counts?.[emoji] || 0)}</button>`).join('')}</div>
    <details class="feed-reaction-people"><summary>Quem reagiu (${post.reactions?.total || 0})</summary><ul>${(post.reactions?.people || []).map((person) => `<li>${escapeHtml(person.emoji)} ${escapeHtml(formatDisplayName(person.name))}</li>`).join('') || '<li>Nenhuma reação ainda.</li>'}</ul></details>
    <details><summary>Comentários (${(post.comments || []).length})</summary>
${(post.comments || []).map((comment) => `<div class="feed-comment" id="feed-comment-${escapeHtml(comment.id)}"><strong>${escapeHtml(formatDisplayName(comment.authorName))}</strong><time>${comment.createdAt ? escapeHtml(formatDate(comment.createdAt)) : 'Data não registrada'}${comment.updatedAt ? ' · editado' : ''}</time><p class="feed-comment-text">${highlightedComment(comment)}</p><div class="feed-post-actions">${comment.userId === appState?.me?.id ? `<button type="button" data-comment-action="edit" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Editar comentário</button>` : ''}${comment.userId === appState?.me?.id || appState?.me?.role === 'admin' ? `<button type="button" data-comment-action="delete" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Excluir comentário</button>` : ''}</div></div>`).join('')}
      ${mentionComposer(post.type,post.id)}
    </details>
  </article>`).join('') || '<p>A primeira publicação pode ser sua!</p>';
}
document.querySelector('#communityFeed').addEventListener('click', async (event) => {
  const choice=event.target.closest('[data-mention-choice]');
  if (choice) {chooseMention(choice.closest('form').elements.message,choice.dataset.mentionChoice);return;}
  if (event.target.closest('[data-cancel-comment]')) {event.target.closest('form').remove();return;}
  const commentButton = event.target.closest('[data-comment-action]');
  if (commentButton) {
    const editing = commentButton.dataset.commentAction === 'edit';
    const current = commentButton.closest('.feed-comment').querySelector('.feed-comment-text').textContent;
    if (editing) {
      const parent=commentButton.closest('.feed-comment');
      parent.querySelector('.mention-composer')?.remove();
      parent.insertAdjacentHTML('beforeend',mentionComposer(commentButton.dataset.postType,commentButton.dataset.postId,current,commentButton.dataset.commentTarget));
      const input=parent.querySelector('.mention-composer input');input.focus();refreshMentions(input,false);return;
    }
    const message = null;
    if (editing && (message === null || message === current)) return;
    if (!editing && !confirm('Excluir este comentário?')) return;
    commentButton.disabled = true;
    try {
      const path = '/api/daily-wall/comments/' + commentButton.dataset.postType + '/' + encodeURIComponent(commentButton.dataset.postId) + '/' + encodeURIComponent(commentButton.dataset.commentTarget);
      const data = await api(path, { method: editing ? 'PATCH' : 'DELETE', ...(editing ? { body: { message } } : {}) });
      commentButton.blur(); communityFeedSignature = ''; applyState(data); showToast(editing ? 'Comentário atualizado!' : 'Comentário excluído.');
    } catch (error) { showToast(error.message, 'error'); commentButton.disabled = false; }
    return;
  }
  if (event.target.closest('[data-reaction-id]')) {
    await handleDailyReaction(event); communityFeedSignature = ''; event.target.blur(); renderCommunityFeed(appState?.dailyWall || {}); return;
  }
  const edit = event.target.closest('[data-feed-edit]');
  if (edit) {
    const current = edit.closest('.feed-post').querySelector('.feed-post-text').textContent;
    const text = prompt(edit.dataset.feedType === 'meme' ? 'Editar legenda (até 500 caracteres):' : 'Editar frase (até 180 caracteres):', current);
    if (text === null || text === current) return;
    edit.disabled = true;
    try {
      const data = await api('/api/daily-wall/posts/' + edit.dataset.feedType + '/' + encodeURIComponent(edit.dataset.feedEdit), { method: 'PATCH', body: { text } });
      edit.blur(); communityFeedSignature = ''; applyState(data); showToast('Publicação atualizada!');
    } catch (error) { showToast(error.message, 'error'); edit.disabled = false; }
    return;
  }
  const button = event.target.closest('[data-feed-delete]');
  if (!button || !confirm('Excluir esta publicação e seus comentários?')) return;
  const path = '/api/daily-wall/posts/' + button.dataset.feedType + '/';
  button.disabled = true;
  try { const data = await api(path + encodeURIComponent(button.dataset.feedDelete), { method: 'DELETE' }); button.blur(); communityFeedSignature = ''; applyState(data); }
  catch (error) { showToast(error.message, 'error'); button.disabled = false; }
});
document.querySelector('#communityFeed').addEventListener('change', (event) => {
  if (!event.target.matches('[data-mention-person]') || !event.target.value) return;
  const input = event.target.form.elements.message;
  const text = `${input.value}${input.value && !input.value.endsWith(' ') ? ' ' : ''}@${event.target.value} `;
  if (text.length > 300) showToast('Não há espaço no comentário para essa marcação.', 'error');
  else { input.value = text; input.focus(); }
  event.target.value = '';
});

document.querySelector('#communityFeed').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-comment-id]'); if (!form) return;
  event.preventDefault(); const input = form.elements.message; const message = input.value.trim();
  if (!message) return;
  setBusy(form, true);
  try {
    const editing=form.dataset.editComment;
    const path=editing ? '/api/daily-wall/comments/'+form.dataset.commentType+'/'+encodeURIComponent(form.dataset.commentId)+'/'+encodeURIComponent(editing) : '/api/daily-wall/comments';
    const data = await api(path, { method: editing ? 'PATCH' : 'POST', body: { targetType: form.dataset.commentType, targetId: form.dataset.commentId, message } });
    input.value = ''; document.activeElement?.blur(); communityFeedSignature = ''; applyState(data); showToast(editing ? 'Comentário atualizado!' : 'Comentário publicado!');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
const mentionFeed=document.querySelector('#communityFeed');
mentionFeed.addEventListener('pointerdown',event=>{if(event.target.closest('[data-mention-choice]'))event.preventDefault();});
mentionFeed.addEventListener('input',event=>{if(event.target.matches('.mention-composer input'))refreshMentions(event.target);});
mentionFeed.addEventListener('click',event=>{if(event.target.matches('.mention-composer input'))refreshMentions(event.target);});
mentionFeed.addEventListener('keydown',event=>{
  const input=event.target;if(!input.matches('.mention-composer input') || event.isComposing)return;
  const list=input.form.querySelector('.mention-suggestions');if(list.hidden)return;
  const options=[...list.querySelectorAll('[data-mention-choice]')];
  let index=options.findIndex(p=>p.getAttribute('aria-selected')==='true');
  if(event.key==='Escape'){event.preventDefault();closeMentionList(input);return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((p,i)=>p.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}
  if(event.key==='Enter'&&options.length){event.preventDefault();chooseMention(input,options[Math.max(0,index)].dataset.mentionChoice);}
});
mentionFeed.addEventListener('focusout',event=>{
  const input=event.target;if(!input.matches('.mention-composer input'))return;
  if(event.relatedTarget?.closest('.mention-suggestions'))return;
  closeMentionList(input);
});
