/* Camada visual local: não consulta o Worker e respeita movimento reduzido. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const themes = [
    { key: 'space', words: ['espaço', 'espaco', 'galáx', 'galax', 'estelar', 'alien', 'nasa', 'foguete'], accent: '#6aa8ff' },
    { key: 'magic', words: ['magia', 'mág', 'brux', 'ritual', 'feit', 'pokemon'], accent: '#bd78ff' },
    { key: 'retro', words: ['anos', 'retro', 'vintage', 'indiana', 'vilão', 'vilao'], accent: '#ffb24a' },
    { key: 'nature', words: ['água', 'agua', 'floresta', 'animal', 'natureza', 'mar'], accent: '#54dfbc' },
    { key: 'party', words: ['festa', 'gay', 'arco', 'rainbow', 'cor'], accent: '#ff72bd' }
  ];
  let active = themes[0]; let lastTrail = 0;

  const pickTheme = name => themes.find(theme => theme.words.some(word => name.includes(word))) || themes[0];
  const spark = (x, y, count = 1) => {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i'); dot.className = 'cursor-stardust';
      dot.style.left = (x + (Math.random() * 18 - 9)) + 'px'; dot.style.top = (y + (Math.random() * 18 - 9)) + 'px';
      dot.style.setProperty('--spark-color', active.accent); body.append(dot); setTimeout(() => dot.remove(), 700);
    }
  };
  const updateSignature = (state) => {
    const signature = document.querySelector('#profileVisualSignature'); if (!signature) return;
    const equipped = state.profile?.equipped || {}; const pieces = [];
    if (state.workflow?.currentTheme) pieces.push('🎨 ' + state.workflow.currentTheme);
    if (equipped.nameStyle) pieces.push('✒️ Tipografia equipada');
    if (equipped.frame) pieces.push('🖼️ Moldura ativa');
    if (equipped.cursorStyle) pieces.push('🖱️ Cursor ativo');
    signature.textContent = pieces.length ? pieces.slice(0, 3).join(' · ') : '✦ Personalize nome, moldura e cursor na Loja 51.';
  };
  document.addEventListener('area51:state', (event) => {
    const state = event.detail || {}; const title = String(state.workflow?.currentTheme || '').toLocaleLowerCase('pt-BR');
    active = pickTheme(title); body.dataset.roundAtmosphere = state.workflow?.currentTheme ? active.key : 'idle';
    body.style.setProperty('--round-accent', active.accent); updateSignature(state);
  });

  document.addEventListener('pointermove', (event) => {
    if (reduced || event.pointerType === 'touch' || performance.now() - lastTrail < 175) return;
    lastTrail = performance.now(); spark(event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener('pointermove', (event) => {
    const card = event.target.closest('.album-card, .shop-item, .profile-medal'); if (!card || reduced) return;
    const rect = card.getBoundingClientRect(); card.style.setProperty('--tilt-x', ((event.clientY - rect.top) / rect.height * -7 + 3.5).toFixed(2) + 'deg'); card.style.setProperty('--tilt-y', ((event.clientX - rect.left) / rect.width * 7 - 3.5).toFixed(2) + 'deg');
  }, { passive: true });
  document.addEventListener('pointerout', (event) => {
    const card = event.target.closest('.album-card, .shop-item, .profile-medal'); if (card) { card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y'); }
  }, true);
  document.addEventListener('click', (event) => {
    const reaction = event.target.closest('.daily-reactions button'); if (!reaction) return;
    const rect = reaction.getBoundingClientRect(); spark(rect.left + rect.width / 2, rect.top + 5, 7); reaction.classList.remove('reaction-burst'); requestAnimationFrame(() => reaction.classList.add('reaction-burst'));
  });
  // Os antigos atalhos globais foram removidos: a identidade visual permanece sem interferir em navegação ou teclas.
})();
