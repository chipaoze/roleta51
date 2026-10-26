// Posts reuse the existing mural records, reactions and mission rules.
let communityFeedSignature = '';
const expandedFeedPosts = new Set();
function mentionPeople() { return (appState?.powerParticipants || []).filter(person => person.id !== appState?.me?.id); }
function mentionParts(message, people) {
  const names = [...people].sort((a,b) => b.displayName.length-a.displayName.length);
  const parts = []; let from = 0;
  for (let i=0;i<message.length;i++) {
    if (message[i] !== '@' || (i && /[\p{L}\p{N}_]/u.test(message[i-1]))) continue;
    const match = names.map(person => ({ person, alias: [person.displayName, person.username].filter(Boolean).sort((a,b) => b.length-a.length).find(alias => message.slice(i+1,i+1+alias.length).toLocaleLowerCase('pt-BR') === alias.toLocaleLowerCase('pt-BR') && !/[\p{L}\p{N}_]/u.test(message[i+1+alias.length] || '')) })).find(item => item.alias);
    if (!match) continue;
    const person = match.person;
    if (from<i) parts.push({text:message.slice(from,i)});
    const end=i+1+match.alias.length;
    parts.push({text:message.slice(i,end),person}); from=end; i=end-1;
  }
  if (from<message.length) parts.push({text:message.slice(from)});
  return parts;
}
function linkifiedText(text = '') {
  const escaped = escapeHtml(String(text));
  return escaped.replace(/https?:\/\/[^\s<]+/gi, (raw) => {
    const suffix = raw.match(/[.,!?;:]+$/)?.[0] || '';
    const href = raw.slice(0, raw.length - suffix.length);
    return `<a class="feed-text-link" href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${suffix}`;
  });
}
function highlightedComment(comment) {
  const people = (comment.mentions || []).map(m => ({id:m.userId,displayName:m.displayName || (appState?.powerParticipants || []).find(p=>p.id===m.userId)?.displayName})).filter(p=>p.displayName);
  return mentionParts(comment.message,people).map(part => part.person ? `<mark class="mention-tag" title="Pessoa marcada">${escapeHtml(part.text)}</mark>` : linkifiedText(part.text)).join('');
}
function highlightedPost(post) {
  const message = post.phrase || post.caption || '';
  const people = (post.mentions || []).map(m => ({id:m.userId,displayName:m.displayName || (appState?.powerParticipants || []).find(p=>p.id===m.userId)?.displayName})).filter(p=>p.displayName);
  return mentionParts(message,people).map(part => part.person ? `<mark class="mention-tag" title="Pessoa marcada">${escapeHtml(part.text)}</mark>` : linkifiedText(part.text)).join('');
}
function mentionQuery(value, caret) {
  const before=value.slice(0,caret), match=before.match(/(?:^|[^\p{L}\p{N}_])@([^@\n]{0,50})$/u);
  if (!match) return null;
  return {start:before.lastIndexOf('@'),end:caret,query:match[1]};
}
function mentionComposer(type, postId, value='', editId='') {
  const listId='mentions-'+type+'-'+postId+'-'+(editId||'new');
  return `<form class="mention-composer" data-comment-type="${type}" data-comment-id="${escapeHtml(postId)}"${editId ? ` data-edit-comment="${escapeHtml(editId)}"` : ''}><label>${editId ? 'Editar comentário' : 'Seu comentário'}<input class="mentionable-field" name="message" value="${escapeHtml(value)}" maxlength="300" required autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${escapeHtml(listId)}" placeholder="Digite @ para marcar alguém"></label><button class="button button-dark" type="submit">${editId ? 'Salvar' : 'Comentar'}</button>${editId ? '<button type="button" data-cancel-comment>Cancelar</button>' : ''}<div class="mention-suggestions" id="${escapeHtml(listId)}" role="listbox" aria-label="Pessoas para marcar" hidden></div><div class="mention-selected" aria-live="polite"></div></form>`;
}
function closeMentionList(input) {
  const list=input.form.querySelector('.mention-suggestions'); list.hidden=true; list.innerHTML='';
  input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant');
}
function clearMentionSelection(input) {
  input?.form?.querySelector('.mention-selected')?.replaceChildren();
}
function refreshMentions(input, suggestions=true) {
  const form=input.form, people=mentionPeople();
  const selected=[...new Map(mentionParts(input.value,people).filter(p=>p.person).map(p=>[p.person.id,p.person])).values()];
  form.querySelector('.mention-selected').innerHTML=selected.length ? 'Será notificado: '+selected.slice(0,5).map(p=>`<mark class="mention-tag">@${escapeHtml(p.displayName)}</mark>`).join(' ') + (selected.length>5 ? ' · Limite: 5 pessoas por comentário.' : '') : '';
  const query=mentionQuery(input.value,input.selectionStart ?? input.value.length);
  if (!suggestions || !query || (query.query.endsWith(' ') && people.some(p=>p.displayName.toLocaleLowerCase('pt-BR')===query.query.trim().toLocaleLowerCase('pt-BR')))) {closeMentionList(input);return;}
  const normalize=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
  const found=people.filter(p=>[p.displayName,p.username].filter(Boolean).some(alias=>normalize(alias).includes(normalize(query.query)))).slice(0,8);
  const list=form.querySelector('.mention-suggestions'); list.hidden=false;
  list.innerHTML=found.length ? found.map((p,i)=>`<button type="button" role="option" aria-selected="${i===0}" id="${escapeHtml(list.id)}-${i}" data-mention-choice="${escapeHtml(p.id)}"><span aria-hidden="true">@</span>${escapeHtml(p.displayName)}</button>`).join('') : '<span>Nenhuma pessoa encontrada.</span>';
  input.setAttribute('aria-expanded','true'); input.removeAttribute('aria-activedescendant');
  if (found.length) input.setAttribute('aria-activedescendant',list.id+'-0');
}
function chooseMention(input, id) {
  const person=mentionPeople().find(p=>p.id===id), query=mentionQuery(input.value,input.selectionStart ?? input.value.length);
  if (!person || !query) return;
  const insertion='@'+person.displayName+' ', value=input.value.slice(0,query.start)+insertion+input.value.slice(query.end);
  const maxLength = input.maxLength > 0 ? input.maxLength : 300;
  if (value.length>maxLength) {showToast('O texto pode ter até '+maxLength+' caracteres.','error');return;}
  input.value=value; input.focus(); input.setSelectionRange(query.start+insertion.length,query.start+insertion.length);refreshMentions(input,false);
}

function youtubeEmbedId(value = '') {
  const match = String(value).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?[^\s#]*\bv=|embed\/|shorts\/))([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/i);
  return match?.[1] || '';
}

function youtubeEmbedMarkup(text = '') {
  const videoId = youtubeEmbedId(text);
  if (!videoId) return '';
  return `<div class="feed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" title="Vídeo do YouTube compartilhado no feed" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
}

function socialEmbedMarkup(text = '') {
  const instagram = String(text).match(/https?:\/\/(?:www\.)?instagram\.com\/(reel|p)\/([A-Za-z0-9_-]+)/i);
  if (instagram) return `<div class="feed-youtube feed-social"><iframe src="https://www.instagram.com/${instagram[1]}/${instagram[2]}/embed/captioned/" title="Publicação do Instagram compartilhada no feed" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  const tiktok = String(text).match(/https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/i);
  if (tiktok) return `<div class="feed-youtube feed-social"><iframe src="https://www.tiktok.com/embed/v2/${tiktok[1]}" title="Vídeo do TikTok compartilhado no feed" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen"></iframe></div>`;
  return '';
}

function renderCommunityFeed(wall) {
  const container = document.querySelector('#communityFeed');
  if (!container) return;
  const posts = [...(wall.phrases || []).map((post) => ({ ...post, type: 'phrase' })), ...(wall.memes || []).map((post) => ({ ...post, type: 'meme' }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emojis = wall.emojis || ['😂','👽','🤨','💀'];
  const avatars = appState?.avatars || {};
  const signature = JSON.stringify([posts, emojis, avatars, appState?.identities || {}, appState?.me?.avatarDataUrl || null]);
  // Background sync must not erase a comment being typed.
  if (signature === communityFeedSignature || container.contains(document.activeElement)) return;
  communityFeedSignature = signature;
  container.innerHTML = posts.map((post) => {
    const anonymous = Boolean(post.anonymous);
    const authorName = anonymous ? 'Anônimo' : formatDisplayName(post.authorName);
    const avatarUrl = post.userId === appState?.me?.id ? appState.me.avatarDataUrl : avatars[post.userId];
    const longText = (post.phrase || post.caption || '').length > 320 || (post.phrase || post.caption || '').split('\n').length > 5;
    const expanded = expandedFeedPosts.has(post.type + ':' + post.id);
    const avatar = anonymous ? '<span class="feed-avatar feed-avatar-fallback anonymous" aria-hidden="true">🕵️</span>' : (avatarUrl ? `<img class="feed-avatar" src="${escapeHtml(avatarUrl)}" alt="Foto de ${escapeHtml(post.authorName)}">` : `<span class="feed-avatar feed-avatar-fallback" aria-hidden="true">${escapeHtml((post.authorName || '?').slice(0,1).toUpperCase())}</span>`);
    return `<article id="feed-post-${escapeHtml(post.id)}" class="feed-post">
    <header><div class="feed-author">${avatar}<div><strong>${anonymous ? '🕵️ Anônimo' : visualName({ id: post.userId, displayName: post.authorName })}</strong><time>${escapeHtml(formatDate(post.createdAt))}</time></div></div>
    <div class="feed-post-actions">${post.canEdit ? `<button type="button" data-feed-edit="${escapeHtml(post.id)}" data-feed-type="${post.type}">Editar</button>` : ''}${post.canDelete ? `<button type="button" data-feed-delete="${escapeHtml(post.id)}" data-feed-type="${post.type}">Excluir</button>` : ''}</div></header>
    <p class="feed-post-text${longText && !expanded ? ' feed-text-collapsed' : ''}">${highlightedPost(post)}</p>${longText ? `<button type="button" class="feed-expand" data-feed-expand="${escapeHtml(post.id)}" data-feed-type="${post.type}" aria-expanded="${expanded}">${expanded ? 'Ver menos' : 'Ver mais'}</button>` : ''}
    ${youtubeEmbedMarkup(post.phrase || post.caption || '')}
    ${socialEmbedMarkup(post.phrase || post.caption || '')}
    ${post.imageUrl ? `<a href="${escapeHtml(post.imageUrl)}" target="_blank" rel="noopener"><img loading="lazy" decoding="async" src="${escapeHtml(post.imageUrl)}" alt="Publicação de ${escapeHtml(authorName)}"></a>` : ''}
    <div class="daily-reactions">${emojis.map((emoji) => `<button type="button" aria-label="Reagir com ${emoji}" aria-pressed="${post.reactions?.mine?.includes(emoji) ? 'true' : 'false'}" class="${post.reactions?.mine?.includes(emoji) ? 'active' : ''}" data-reaction-type="${post.type}" data-reaction-id="${escapeHtml(post.id)}" data-reaction-emoji="${emoji}">${emoji} ${Number(post.reactions?.counts?.[emoji] || 0)}</button>`).join('')}</div>
    <details class="feed-reaction-people"><summary>Quem reagiu (${post.reactions?.total || 0})</summary><ul>${(post.reactions?.people || []).map((person) => `<li>${escapeHtml(person.emoji)} ${escapeHtml(formatDisplayName(person.name))}</li>`).join('') || '<li>Nenhuma reação ainda.</li>'}</ul></details>
    <details><summary>Comentários (${(post.comments || []).length})</summary>
${(post.comments || []).map((comment) => `<div class="feed-comment" id="feed-comment-${escapeHtml(comment.id)}"><strong>${visualName({ id: comment.userId, displayName: comment.authorName })}</strong><time>${comment.createdAt ? escapeHtml(formatDate(comment.createdAt)) : 'Data não registrada'}${comment.updatedAt ? ' · editado' : ''}</time><p class="feed-comment-text">${highlightedComment(comment)}</p><div class="feed-post-actions">${comment.userId === appState?.me?.id ? `<button type="button" data-comment-action="edit" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Editar comentário</button>` : ''}${comment.userId === appState?.me?.id || appState?.me?.role === 'admin' ? `<button type="button" data-comment-action="delete" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Excluir comentário</button>` : ''}</div></div>`).join('')}
      ${mentionComposer(post.type,post.id)}
    </details>
  </article>`; }).join('') || '<p>A primeira publicação pode ser sua!</p>';
}
document.querySelector('#communityFeed').addEventListener('click', async (event) => {
  const expand = event.target.closest('[data-feed-expand]');
  if (expand) {
    const key = expand.dataset.feedType + ':' + expand.dataset.feedExpand;
    const expanded = !expandedFeedPosts.has(key);
    if (expanded) expandedFeedPosts.add(key); else expandedFeedPosts.delete(key);
    expand.closest('.feed-post').querySelector('.feed-post-text').classList.toggle('feed-text-collapsed', !expanded);
    expand.setAttribute('aria-expanded', String(expanded)); expand.textContent = expanded ? 'Ver menos' : 'Ver mais'; return;
  }
  const cancelEdit = event.target.closest('[data-feed-edit-cancel]');
  if (cancelEdit) { cancelEdit.closest('form').remove(); return; }
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
    const post = edit.closest('.feed-post');
    if (post.querySelector('[data-feed-edit-form]')) return;
    const form = document.createElement('form'); form.dataset.feedEditForm = edit.dataset.feedEdit; form.dataset.feedType = edit.dataset.feedType; form.className = 'feed-edit-form';
    form.innerHTML = '<label>Editar publicação <textarea name="text" maxlength="2000" rows="6"></textarea></label><small>Até 2.000 caracteres</small><div><button type="submit">Salvar</button> <button type="button" data-feed-edit-cancel>Cancelar</button></div>';
    const input = form.elements.text; input.value = post.querySelector('.feed-post-text').textContent; input.required = edit.dataset.feedType === 'phrase';
    post.querySelector('.feed-post-text').insertAdjacentElement('afterend', form); input.focus();
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
  const editForm = event.target.closest('[data-feed-edit-form]');
  if (editForm) {
    event.preventDefault(); const text = editForm.elements.text.value.trim();
    if (text.length > 2000 || (editForm.dataset.feedType === 'phrase' && !text)) { showToast('Confira o texto: máximo de 2.000 caracteres.', 'error'); return; }
    setBusy(editForm, true);
    try { const data = await api('/api/daily-wall/posts/' + editForm.dataset.feedType + '/' + encodeURIComponent(editForm.dataset.feedEditForm), { method: 'PATCH', body: { text } }); document.activeElement?.blur(); communityFeedSignature = ''; applyState(data); showToast('Publicação atualizada!'); }
    catch (error) { showToast(error.message, 'error'); setBusy(editForm, false); }
    return;
  }
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
mentionFeed.addEventListener('input',event=>{if(event.target.matches('.mentionable-field'))refreshMentions(event.target);});
mentionFeed.addEventListener('click',event=>{if(event.target.matches('.mentionable-field'))refreshMentions(event.target);});
mentionFeed.addEventListener('keydown',event=>{
  const input=event.target;if(!input.matches('.mentionable-field') || event.isComposing)return;
  const list=input.form.querySelector('.mention-suggestions');if(list.hidden)return;
  const options=[...list.querySelectorAll('[data-mention-choice]')];
  let index=options.findIndex(p=>p.getAttribute('aria-selected')==='true');
  if(event.key==='Escape'){event.preventDefault();closeMentionList(input);return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((p,i)=>p.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}
  if(event.key==='Enter'&&options.length){event.preventDefault();chooseMention(input,options[Math.max(0,index)].dataset.mentionChoice);}
});
mentionFeed.addEventListener('focusout',event=>{
  const input=event.target;if(!input.matches('.mentionable-field'))return;
  if(event.relatedTarget?.closest('.mention-suggestions'))return;
  closeMentionList(input);
});
// O compositor da publicação fica fora do mural; os mesmos atalhos de @
// também precisam funcionar nele, inclusive quando a publicação é anônima.
document.addEventListener('pointerdown',event=>{
  if(event.target.closest('#communityFeed') || !event.target.closest('[data-mention-choice]'))return;
  event.preventDefault();
});
document.addEventListener('click',event=>{
  if(event.target.closest('#communityFeed'))return;
  const choice=event.target.closest('[data-mention-choice]');
  if(choice){chooseMention(choice.closest('form').querySelector('.mentionable-field'),choice.dataset.mentionChoice);return;}
  if(event.target.matches('.mentionable-field'))refreshMentions(event.target);
});
document.addEventListener('input',event=>{
  if(!event.target.closest('#communityFeed') && event.target.matches('.mentionable-field'))refreshMentions(event.target);
});
document.addEventListener('keydown',event=>{
  const input=event.target;
  if(input.closest('#communityFeed') || !input.matches('.mentionable-field') || event.isComposing)return;
  const list=input.form.querySelector('.mention-suggestions');if(list.hidden)return;
  const options=[...list.querySelectorAll('[data-mention-choice]')];
  let index=options.findIndex(p=>p.getAttribute('aria-selected')==='true');
  if(event.key==='Escape'){event.preventDefault();closeMentionList(input);return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((p,i)=>p.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}
  if(event.key==='Enter'&&options.length){event.preventDefault();chooseMention(input,options[Math.max(0,index)].dataset.mentionChoice);}
});
document.addEventListener('focusout',event=>{
  const input=event.target;
  if(input.closest('#communityFeed') || !input.matches('.mentionable-field'))return;
  if(event.relatedTarget?.closest('.mention-suggestions'))return;
  closeMentionList(input);
});
