// Posts reuse the existing mural records, reactions and mission rules.
let communityFeedSignature = '';
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
      ${(post.comments || []).map((comment) => `<div class="feed-comment"><strong>${escapeHtml(formatDisplayName(comment.authorName))}</strong><time>${comment.createdAt ? escapeHtml(formatDate(comment.createdAt)) : 'Data não registrada'}${comment.updatedAt ? ' · editado' : ''}</time><p class="feed-comment-text">${escapeHtml(comment.message)}</p><div class="feed-post-actions">${comment.userId === appState?.me?.id ? `<button type="button" data-comment-action="edit" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Editar comentário</button>` : ''}${comment.userId === appState?.me?.id || appState?.me?.role === 'admin' ? `<button type="button" data-comment-action="delete" data-comment-target="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(post.id)}" data-post-type="${post.type}">Excluir comentário</button>` : ''}</div></div>`).join('')}
      <form data-comment-type="${post.type}" data-comment-id="${escapeHtml(post.id)}"><label>Seu comentário<input name="message" maxlength="300" required autocomplete="off"></label><button class="button button-dark" type="submit">Comentar</button></form>
    </details>
  </article>`).join('') || '<p>A primeira publicação pode ser sua!</p>';
}
document.querySelector('#communityFeed').addEventListener('click', async (event) => {
  const commentButton = event.target.closest('[data-comment-action]');
  if (commentButton) {
    const editing = commentButton.dataset.commentAction === 'edit';
    const current = commentButton.closest('.feed-comment').querySelector('.feed-comment-text').textContent;
    const message = editing ? prompt('Editar comentário (até 300 caracteres):', current) : null;
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
document.querySelector('#communityFeed').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-comment-id]'); if (!form) return;
  event.preventDefault(); const input = form.elements.message; const message = input.value.trim();
  if (!message) return;
  setBusy(form, true);
  try {
    const data = await api('/api/daily-wall/comments', { method: 'POST', body: { targetType: form.dataset.commentType, targetId: form.dataset.commentId, message } });
    input.value = ''; document.activeElement?.blur(); communityFeedSignature = ''; applyState(data); showToast('Comentário publicado!');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
