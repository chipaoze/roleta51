/* Camada visual local: não consulta o Worker e respeita movimento reduzido. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;
  const themes = [
    { key: 'space', words: ['espaço', 'espaco', 'galáx', 'galax', 'estelar', 'alien', 'nasa', 'foguete'], accent: '#6aa8ff', phrases: ['Sinal estelar captado ✦', 'Órbita estável.', 'A nave aprovou esse movimento.'] },
    { key: 'magic', words: ['magia', 'mág', 'brux', 'ritual', 'feit', 'pokemon'], accent: '#bd78ff', phrases: ['Uma faísca cósmica!', 'Isso parece encantado.', 'O oráculo observou.'] },
    { key: 'retro', words: ['anos', 'retro', 'vintage', 'indiana', 'vilão', 'vilao'], accent: '#ffb24a', phrases: ['Estilo registrado.', 'Arquivo raro encontrado.', 'Essa energia é clássica.'] },
    { key: 'nature', words: ['água', 'agua', 'floresta', 'animal', 'natureza', 'mar'], accent: '#54dfbc', phrases: ['Maré cósmica em movimento.', 'Gota registrada.', 'Sinal de vida detectado.'] },
    { key: 'party', words: ['festa', 'gay', 'arco', 'rainbow', 'cor'], accent: '#ff72bd', phrases: ['Brilho autorizado ✨', 'A tripulação sentiu o impacto.', 'Energia máxima.'] }
  ];
  let active = themes[0]; let lastTrail = 0; let phraseTimer = 0;

  const pickTheme = name => themes.find(theme => theme.words.some(word => name.includes(word))) || themes[0];
  const phrase = () => active.phrases[Math.floor(Math.random() * active.phrases.length)];
  const flashPhrase = (text, x = innerWidth / 2, y = 112) => {
    if (reduced) return;
    const note = document.createElement('span');
    note.className = 'ambient-phrase'; note.textContent = text;
    note.style.left = Math.max(12, Math.min(innerWidth - 230, x)) + 'px';
    note.style.top = Math.max(12, Math.min(innerHeight - 60, y)) + 'px';
    body.append(note); setTimeout(() => note.remove(), 1650);
  };
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
  document.addEventListener('pointerenter', (event) => {
    const target = event.target.closest('.shop-item, .album-card, .profile-medal, .ranking-row');
    if (!target || reduced || performance.now() < phraseTimer) return;
    phraseTimer = performance.now() + 2100; const rect = target.getBoundingClientRect(); flashPhrase(phrase(), rect.right - 30, rect.top - 10);
  }, true);
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
