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
  const cursorParticles = {
    crystal: { glyph: '◆', kind: 'crystal', color: '#7ee8ff' },
    solar: { glyph: '✦', kind: 'solar', color: '#ffc947' },
    ufo: { glyph: '⌁', kind: 'ufo', color: '#6ef5d4' },
    wand: { glyph: '✧', kind: 'magic', color: '#d798ff' },
    'comet-tail': { glyph: '☄', kind: 'comet', color: '#7bdcff' },
    thunder: { glyph: 'ϟ', kind: 'thunder', color: '#ffe15c' },
    thor: { glyph: 'ϟ', kind: 'thor', color: '#baf7ff', always: true },
    horn: { glyph: '♦', kind: 'rainbow', color: '#ff75c8' },
    dipirona: { glyph: '✚', kind: 'medicine', color: '#7ccfff' },
    anvisa: { glyph: '✚', kind: 'medicine', color: '#66e2b5' },
    'gta-neon': { glyph: '▬', kind: 'neon', color: '#ff58c8' },
    cobblemon: { glyph: '■', kind: 'pixel', color: '#8edf5d' },
    wolverine: { glyph: '╱', kind: 'claw', color: '#ffd22f' },
    samurai: { glyph: '🌸', kind: 'petal', color: '#ff9ab1', count: 2, always: true },
    'god-war': { glyph: '◆', kind: 'frost', color: '#bdf5ff', count: 2, always: true },
  };

  const pickTheme = name => themes.find(theme => theme.words.some(word => name.includes(word))) || themes[0];
  const spark = (x, y, count = 1) => {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i'); dot.className = 'cursor-stardust';
      dot.style.left = (x + (Math.random() * 18 - 9)) + 'px'; dot.style.top = (y + (Math.random() * 18 - 9)) + 'px';
      dot.style.setProperty('--spark-color', active.accent); body.append(dot); setTimeout(() => dot.remove(), 700);
    }
  };
  const cursorSpark = (x, y) => {
    const cursor = document.documentElement.dataset.activeCursor || '';
    const config = cursorParticles[cursor];
    const hasOwnEffect = Boolean(body.dataset.cursorEffect) || (body.dataset.trailStyle && body.dataset.trailStyle !== 'none');
    const thorBusy = document.documentElement.classList.contains('thor-cursor-thrown') || document.documentElement.classList.contains('thor-aiming');
    if (!config || (hasOwnEffect && !config.always) || thorBusy) return;
    for (let index = 0; index < (config.count || 1); index += 1) {
      const particle = document.createElement('i');
      particle.className = 'cursor-themed-particle particle-' + config.kind;
      particle.textContent = config.glyph;
      particle.style.left = (x + (Math.random() * 18 - 9)) + 'px';
      particle.style.top = (y + (Math.random() * 16 - 8)) + 'px';
      particle.style.setProperty('--cursor-particle-color', config.color);
      particle.style.setProperty('--particle-drift', (Math.random() * 24 - 12) + 'px');
      body.append(particle);
      setTimeout(() => particle.remove(), 900);
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
    if (reduced || event.pointerType === 'touch' || performance.now() - lastTrail < 105) return;
    lastTrail = performance.now(); cursorSpark(event.clientX, event.clientY);
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
