const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let appState = null;
let activeMode = 'theme';
let selectedFile = null;
let previewObjectUrl = null;
let selectedAdminUploadFile = null;
let adminUploadPreviewObjectUrl = null;
let selectedMemeFile = null;
let memePreviewObjectUrl = null;
let wheelRotation = 0;
let spinning = false;
let drawRequestPending = false;
let liveSource = null;
let liveWheelItems = null;
let liveSpinStartTimer = null;
let liveSpinFinishTimer = null;
const handledDraws = new Set();
let authSlideIndex = 0;
let authCarouselTimer = null;
let serverClockOffset = 0;
let musicEpoch = null;
let musicContext = null;
let musicGain = null;
let musicBuffer = null;
let musicBufferPromise = null;
let musicSource = null;
let musicStartPromise = null;
let fallbackAudio = null;
let musicWanted = localStorage.getItem('roundMusic') !== 'off';
let musicForcedBySpin = false;
let musicPrimedByGesture = false;
let toastTimer;
let focusVotingAfterWinner = false;
let watermarkObjectUrl = null;
let lastGuidedPhase = null;
let pendingGuidedNavigation = false;
let rainbowThemeForced = false;
let themePenaltyTimerInterval = null;
let feedbackMessages = [];
let feedbackPanelOpen = false;
let adminFeedbackFilter = 'pending';
let knownReleaseVersion = null;
let updatePromptOpen = false;
let navigationFrame = null;
let shopPreviewItemId = null;
let shopPreviewTimer = null;
let shopPreviewInterval = null;
let shopFilter = 'all';
let hideOwnedVisuals = localStorage.getItem('area51-hide-owned-visuals') === 'true';
let deferredInstallPrompt = null;
let votingDraft = { votingId: null, bestId: null, worstId: null };
let notificationsReadAtLocal = null;
let casinoWheelRotation = 0;
let casinoSpinInProgress = false;
let flightPollTimer = null;
let flightInProgress = false;
let flightCashoutReadyTimer = null;
let flightCashoutLocallyReady = false;
let flightPollGeneration = 0;
let flightSnapshot=null;
let flightAnimationFrame=null;
let flightCurrentId=null;
let mysteryOpeningInProgress = false;
let forcedCursorExpiryTimer = null;
let seasonCountdownTimer = null;
const casinoWheelValues = [
  0,.5,1,1.5,'box-sonda',.5,1,2,1.5,.5,0,1,3,1.5,'box-cosmic',0,1,2,1.5,1,
  0,.5,'box-sonda',1.5,0,.5,1,'box-area51',1.5,.5,0,1,3,'box-cosmic',.5,0,1,2,'box-sonda',1,
];

const palette = ['#f47721','#173b67','#f5b52c','#2f76a9','#dc5c46','#48a47a','#815ba6','#dd7a2c','#31598b','#e2a627'];
const authView = $('#authView');
const appView = $('#appView');
const canvas = $('#wheelCanvas');
const ctx = canvas.getContext('2d');

function formatDisplayName(value) {
  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  return String(value || '').trim().split(/\s+/).map((word, index) => {
    const lower = word.toLocaleLowerCase('pt-BR');
    if (index > 0 && particles.has(lower)) return lower;
    return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
  }).join(' ');
}

function renderAvatar(element, photo, fallback) {
  if (!element) return;
  element.textContent = photo ? '' : fallback;
  element.style.backgroundImage = photo ? `url("${photo}")` : '';
  element.classList.toggle('has-photo', Boolean(photo));
}

function startRainbowMouseTrail() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const precisePointer = matchMedia('(hover: hover) and (pointer: fine)');
  if (reducedMotion.matches || !precisePointer.matches) return;

  const trailCanvas = document.createElement('canvas');
  const trailContext = trailCanvas.getContext('2d');
  const unicornCursor = document.createElement('span');
  const points = [];
  const lifetime = 520;
  const maxPoints = 58;
  let pixelRatio = 1;
  let animationFrame = null;
  let hue = 0;
  let lastPoint = null;
  let lastTrailPoint = null;
  let cursorAngle = -18;
  let gallopTimer = null;
  let lastCursorEffectAt = 0;
  let lastFruitAt = 0;

  trailCanvas.setAttribute('aria-hidden', 'true');
  trailCanvas.className = 'rainbow-mouse-trail';
  unicornCursor.setAttribute('aria-hidden', 'true');
  unicornCursor.className = 'unicorn-mouse-cursor';
  unicornCursor.innerHTML = '<span><img src="/unicorn-cursor-full-v2.png" alt=""></span>';
  document.body.appendChild(trailCanvas);
  document.body.appendChild(unicornCursor);

  function keepCursorAboveDialogs() {
    const openDialogs = [...document.querySelectorAll('dialog[open]')];
    const destination = openDialogs.at(-1) || document.body;
    if (unicornCursor.parentElement !== destination) destination.appendChild(unicornCursor);
  }
  const dialogObserver = new MutationObserver(keepCursorAboveDialogs);
  dialogObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  function resizeTrailCanvas() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    trailCanvas.width = Math.round(window.innerWidth * pixelRatio);
    trailCanvas.height = Math.round(window.innerHeight * pixelRatio);
    trailContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function clearTrail() {
    points.length = 0;
    lastPoint = null;
    lastTrailPoint = null;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    trailContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawTrail(now) {
    trailContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if ((document.body.dataset.trailStyle || 'none') === 'none') { clearTrail(); return; }

    while (points.length && now - points[0].time > lifetime) points.shift();

    trailContext.lineCap = 'round';
    trailContext.lineJoin = 'round';
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const opacity = Math.max(0, 1 - ((now - point.time) / lifetime));
      trailContext.beginPath();
      trailContext.moveTo(previous.x, previous.y);
      trailContext.lineTo(point.x, point.y);
      trailContext.lineWidth = 1.25 + (opacity * 3.25);
      const trailStyle = document.body.dataset.trailStyle || 'rainbow';
      const trailPalette = { gold:[46,100,60],pink:[330,100,65],blue:[205,100,62],green:[138,96,55],purple:[274,100,67],laser:[158,100,58],alien:[112,100,55],white:[0,0,100],'gta-neon':[322,100,65],cobblemon:[96,68,52],wolverine:[46,100,58],samurai:[344,90,68],'god-war':[200,92,67] };
      const fixedColor = trailPalette[trailStyle];
      const rocketAge = Math.max(0, Math.min(1, (now - point.time) / lifetime));
      const hue = trailStyle === 'fire' ? 5 + ((point.hue / 360) * 48) : trailStyle === 'rocket' ? (rocketAge < .2 ? 198 : Math.max(5, 48 - ((rocketAge - .2) * 54))) : fixedColor ? fixedColor[0] : point.hue;
      const saturation = fixedColor ? fixedColor[1] : 100;
      const lightness = trailStyle === 'rocket' && rocketAge < .2 ? 78 : fixedColor ? fixedColor[2] : 61;
      trailContext.strokeStyle = `hsla(${hue},${saturation}%,${lightness}%,${opacity * .9})`;
      trailContext.shadowColor = `hsla(${hue},100%,68%,${opacity})`;
      trailContext.shadowBlur = 5 * opacity;
      trailContext.stroke();
    }
    trailContext.shadowBlur = 0;

    if (points.length) animationFrame = requestAnimationFrame(drawTrail);
    else { animationFrame = null; lastPoint = null; lastTrailPoint = null; }
  }

  window.addEventListener('resize', resizeTrailCanvas, { passive: true });
  window.addEventListener('pointermove', (event) => {
    if (document.hidden || (event.pointerType && event.pointerType !== 'mouse')) return;
    const now = performance.now();
    const current = { x: event.clientX, y: event.clientY };
    const unicornActive = document.documentElement.classList.contains('unicorn-cursor-active');
    const giantSlowActive = document.documentElement.classList.contains('giant-slow-cursor-active');
    const customCursorActive = unicornActive || giantSlowActive;
    const trailActive = (document.body.dataset.trailStyle || 'none') !== 'none';
    const cursorEffectActive = Boolean(document.body.dataset.cursorEffect);
    if (!customCursorActive && !trailActive && !cursorEffectActive) { unicornCursor.classList.remove('is-visible'); if (points.length) clearTrail(); return; }
    if (customCursorActive) {
      unicornCursor.style.setProperty('--cursor-x', current.x + 'px');
      unicornCursor.style.setProperty('--cursor-y', current.y + 'px');
      unicornCursor.classList.add('is-visible');
    } else unicornCursor.classList.remove('is-visible');
    if (lastPoint) {
      const deltaX = current.x - lastPoint.x;
      const deltaY = current.y - lastPoint.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 3) return;
      const movingRight = deltaX >= 0;
      const slope = Math.atan2(deltaY, Math.abs(deltaX)) * 180 / Math.PI;
      cursorAngle = Math.max(-32, Math.min(32, movingRight ? slope : -slope));
      if (unicornActive) {
        unicornCursor.style.setProperty('--cursor-angle', cursorAngle + 'deg');
        unicornCursor.style.setProperty('--cursor-facing', movingRight ? '-1' : '1');
        unicornCursor.style.setProperty('--cursor-body-shift', movingRight ? '-25px' : '25px');
        unicornCursor.classList.add('is-galloping');
        clearTimeout(gallopTimer);
        gallopTimer = setTimeout(() => unicornCursor.classList.remove('is-galloping'), 120);
      }
      const tailDistance = unicornActive ? 48 : 16;
      const tail = { x: current.x - (deltaX / distance * tailDistance), y: current.y - (deltaY / distance * tailDistance) };
      const trailStart = lastTrailPoint || lastPoint;
      if (trailActive && document.body.dataset.trailStyle !== 'fruit') {
        const steps = Math.min(4, Math.max(1, Math.ceil(distance / 14)));
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          hue = (hue + 8) % 360;
          points.push({ x: trailStart.x + ((tail.x - trailStart.x) * progress), y: trailStart.y + ((tail.y - trailStart.y) * progress), time: now, hue });
        }
      }
      if (document.body.dataset.trailStyle === 'fruit') {
        if (now - lastFruitAt > 150) {
          const fruit = document.createElement('span');
          const fruits = ['🍉','🍊','🍓','🥝','🍍','🍎'];
          fruit.className = 'fruit-trail-piece'; fruit.textContent = fruits[Math.floor(Math.random() * fruits.length)];
          const fruitDistance = 58 + Math.random() * 22;
          const fruitX = current.x - (deltaX / distance * fruitDistance) - 17;
          const fruitY = current.y - (deltaY / distance * fruitDistance) - 17 + ((Math.random() * 30) - 15);
          fruit.style.left = Math.max(8, Math.min(innerWidth - 42, fruitX)) + 'px'; fruit.style.top = Math.max(8, Math.min(innerHeight - 50, fruitY)) + 'px';
          fruit.dataset.bornAt = String(now);
          fruit.style.setProperty('--fruit-turn', ((Math.random() * 100) - 50) + 'deg'); document.body.appendChild(fruit);
          setTimeout(() => fruit.remove(), 2100); lastFruitAt = now;
        }
        $$('.fruit-trail-piece:not(.sliced)').forEach((fruit) => {
          const rect = fruit.getBoundingClientRect();
          if (now - Number(fruit.dataset.bornAt || now) > 230 && Math.hypot(current.x - (rect.left + rect.width / 2), current.y - (rect.top + rect.height / 2)) < 30) {
            const emoji = fruit.textContent;
            fruit.classList.add('sliced'); fruit.innerHTML = `<i class="fruit-half left">${emoji}</i><i class="fruit-half right">${emoji}</i><b>+1 CORTE</b>`;
          }
        });
      }
      const cursorEffect = document.body.dataset.cursorEffect || '';
      if (cursorEffect && !['petista', 'bolsonaro', 'umbanda'].includes(cursorEffect) && now - lastCursorEffectAt > 120) {
        const labels = { gay: '🌈 EU SOU FOFO, QUERO CARINHO E CONFUSÃO', 'galinha-preta': 'COCORICÓ!', volei: 'GIBA NELES!', biblia: 'AMÉM!', 'scrum-master': '✓ PLANILHA', energetico: '⚡ ENERGIA', 'pirokinha-cosmica': 'TOMA LEITADA', 'giant-slow': 'SOU GAY', petista: '🥩 TOMA PICANHA!', bolsonaro: '💥 TEY TEY TEY!', umbanda: '🕊️ A POMBA GIRA, A POMBA GIRA!', messi: 'HIJO DA PUTA', cristiano: 'SIUUUUUUUU', pele: 'NÃO, O JÔ SOARES SUA FDP', maradona: 'QUIERO PÓ', neymar: 'CAIU, FALTA NELE' };
        const papaSequence = ['EM NOME DO PAI', 'DO FILHO', 'E DO ESPÍRITO SANTO'];
        const particle = document.createElement('span');
        particle.className = 'cursor-linked-effect effect-' + cursorEffect + (['petista', 'bolsonaro', 'umbanda'].includes(cursorEffect) ? ' effect-phrase-trail' : '');
        if (cursorEffect === 'papa-bento') { const step = Number(document.body.dataset.papaStep || 0); particle.textContent = papaSequence[step % papaSequence.length]; document.body.dataset.papaStep = String(step + 1); }
        else particle.textContent = labels[cursorEffect] || '✦';
        particle.style.left = Math.max(4, current.x - 22) + 'px';
        particle.style.top = Math.max(4, current.y + 12) + 'px';
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 1450);
        lastCursorEffectAt = now;
      }
      lastTrailPoint = tail;
    } else {
      lastTrailPoint = { x: current.x - (unicornActive ? 24 : 8), y: current.y + (unicornActive ? 9 : 3) };
      if (trailActive) points.push({ ...lastTrailPoint, time: now, hue });
    }
    lastPoint = current;
    while (points.length > maxPoints) points.shift();
    if (trailActive && animationFrame === null) animationFrame = requestAnimationFrame(drawTrail);
  }, { passive: true });
  window.addEventListener('blur', clearTrail);
  window.addEventListener('pointerdown', () => {
    if (!document.documentElement.classList.contains('unicorn-cursor-active')) return;
    unicornCursor.classList.remove('is-clicking');
    requestAnimationFrame(() => unicornCursor.classList.add('is-clicking'));
  }, { passive: true });
  window.addEventListener('pointerup', () => setTimeout(() => unicornCursor.classList.remove('is-clicking'), 130), { passive: true });
  document.documentElement.addEventListener('mouseleave', () => unicornCursor.classList.remove('is-visible'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTrail(); });

  resizeTrailCanvas();
}

startRainbowMouseTrail();

function startPoliticalAndAxeCursorPhrases() {
  let lastAt = 0;
  const phrases = { petista: '🥩 TOMA PICANHA!', bolsonaro: '💥 TEY TEY TEY!', umbanda: '🕊️ A POMBA GIRA, A POMBA GIRA!' };
  document.addEventListener('pointermove', (event) => {
    if (document.hidden || (event.pointerType && event.pointerType !== 'mouse')) return;
    const effect = document.body.dataset.cursorEffect || '';
    if (!phrases[effect] || performance.now() - lastAt < 145) return;
    lastAt = performance.now();
    const particle = document.createElement('span');
    particle.className = 'cursor-linked-effect effect-' + effect + ' effect-phrase-trail';
    particle.textContent = phrases[effect];
    particle.style.left = Math.max(4, event.clientX - 18) + 'px';
    particle.style.top = Math.max(4, event.clientY + 14) + 'px';
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1450);
  }, { passive: true });
}
startPoliticalAndAxeCursorPhrases();

function startCommanderCursorEffects() {
  let lastParticleAt = 0;
  document.addEventListener('pointermove', (event) => {
    const commander = document.documentElement.classList.contains('commander-cursor-active');
    const forcedGay = document.documentElement.classList.contains('gay-power-cursor-active');
    if ((!commander && !forcedGay) || Date.now() - lastParticleAt < 85) return;
    lastParticleAt = Date.now();
    const particle = document.createElement('i');
    particle.className = forcedGay ? 'gay-cursor-particle' : 'commander-cursor-particle';
    particle.textContent = forcedGay ? (Math.random() > .45 ? '🌈' : '✦') : (Math.random() > .45 ? '51' : '✦');
    particle.style.left = event.clientX + 8 + 'px'; particle.style.top = event.clientY + 12 + 'px';
    document.body.appendChild(particle); setTimeout(() => particle.remove(), 650);
  }, { passive: true });
  document.addEventListener('pointerdown', (event) => {
    const commander = document.documentElement.classList.contains('commander-cursor-active');
    const forcedGay = document.documentElement.classList.contains('gay-power-cursor-active');
    if (!commander && !forcedGay) return;
    const pulse = document.createElement('i'); pulse.className = forcedGay ? 'gay-click-pulse' : 'commander-click-pulse';
    pulse.style.left = event.clientX + 'px'; pulse.style.top = event.clientY + 'px';
    document.body.appendChild(pulse); setTimeout(() => pulse.remove(), 520);
  }, { passive: true });
}
startCommanderCursorEffects();

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function initials(name) {
  return String(name || 'M').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function personAvatar(person, className) {
  const photo = appState?.avatars?.[person.id] || (person.id === appState?.me?.id ? appState.me.avatarDataUrl : null);
  const frame = appState?.identities?.[person.id]?.frame || '';
  return `<span class="${className}${photo ? ' has-photo' : ''}" data-identity-frame="${escapeHtml(frame)}">${photo ? `<img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(formatDisplayName(person.displayName))}">` : escapeHtml(initials(person.displayName))}</span>`;
}

function visualName(person, fallbackName = '') {
  const id = typeof person === 'object' ? person?.id : person;
  const name = typeof person === 'object' ? (person.displayName || fallbackName) : fallbackName;
  const identity = appState?.identities?.[id] || {};
  const style = identity.nameStyle ? ' name-style-' + identity.nameStyle : '';
  const badge = identity.badge ? ` data-badge="${escapeHtml(identity.badge)}"` : '';
  return `<span class="participant-identity${style}"${badge}>${escapeHtml(formatDisplayName(name))}</span>`;
}

async function api(url, options = {}, retry = true) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
  const config = { ...options, signal: options.signal || controller.signal, headers: { ...(options.headers || {}) } };
  if (config.body && typeof config.body !== 'string') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  let response, data;
  try {
    response = await fetch(url, config);
    if (response.status !== 204) data = await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (retry && (!config.method || config.method === 'GET') && !options.signal?.aborted) return api(url, options, false);
    if (error.name === 'AbortError') throw new Error('A operação demorou demais. Tente novamente.');
    throw new Error('Conexão temporariamente indisponível. Tente novamente em instantes.');
  } finally { clearTimeout(timeout); }
  if (response.status === 204) return null;
  if (retry && response.status >= 500 && (!config.method || config.method === 'GET')) return api(url, options, false);
  if (!response.ok) {
    if (response.status === 401 && !url.endsWith('/login')) showAuth();
    const error = new Error(data.error || 'Não foi possível concluir a ação.'); error.status = response.status; throw error;
  }
  return data;
}

function renderAdminFeedback(messages) {
  feedbackMessages = Array.isArray(messages) ? messages : [];
  const isAdmin = Boolean(appState && appState.me.role === 'admin');
  const badge = $('#feedbackUnread');
  const topBadge = $('#feedbackUnreadTop');
  if (!isAdmin) {
    badge.classList.add('hidden');
    return;
  }
  const list = $('#adminFeedbackList');
  const pendingCount = feedbackMessages.filter((item) => item.status === 'pending').length;
  const approvedCount = feedbackMessages.filter((item) => item.status === 'approved').length;
  const doneCount = feedbackMessages.filter((item) => item.status === 'done').length;
  const rejectedCount = feedbackMessages.filter((item) => item.status === 'rejected').length;
  const archivedCount = feedbackMessages.filter((item) => item.status === 'archived').length;
  $('#adminFeedbackAllCount').textContent = String(feedbackMessages.length);
  $('#adminFeedbackPendingCount').textContent = String(pendingCount);
  $('#adminFeedbackApprovedCount').textContent = String(approvedCount);
  $('#adminFeedbackDoneCount').textContent = String(doneCount);
  $('#adminFeedbackRejectedCount').textContent = String(rejectedCount);
  $('#adminFeedbackArchivedCount').textContent = String(archivedCount);
  $('#adminFeedbackPending').textContent = pendingCount + (pendingCount === 1 ? ' aguardando' : ' aguardando');
  badge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
  badge.classList.toggle('hidden', pendingCount === 0);
  topBadge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
  topBadge.classList.toggle('hidden', pendingCount === 0);
  $$('[data-admin-feedback-filter]').forEach((button) => {
    const active = button.dataset.adminFeedbackFilter === adminFeedbackFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const filteredMessages = feedbackMessages.filter((item) =>
    adminFeedbackFilter === 'all' || item.status === adminFeedbackFilter
  );
  if (!feedbackMessages.length) {
    list.innerHTML = '<p class="admin-feedback-empty">Nenhuma solicitação recebida.</p>';
  } else if (!filteredMessages.length) {
    list.innerHTML = '<p class="admin-feedback-empty">Nenhuma solicitação neste status.</p>';
  } else {
    list.innerHTML = filteredMessages.map((item) => {
      const bug = item.type === 'bug';
      const praise = item.type === 'praise';
      const kindLabel = bug ? 'BUG' : praise ? 'ELOGIO / DENÚNCIA' : 'MELHORIA';
      const kindClass = bug ? 'bug' : praise ? 'praise' : 'improvement';
      const status = ['approved', 'done', 'rejected', 'archived'].includes(item.status) ? item.status : 'pending';
      const statusLabel = status === 'done' ? (bug ? 'CORRIGIDO' : 'CONCLUÍDA') : status === 'approved' ? 'APROVADA' : status === 'rejected' ? 'NÃO APROVADA' : status === 'archived' ? 'ARQUIVADA' : 'EM ANÁLISE';
      let statusActions = '';
      if (status === 'pending') statusActions = '<button type="button" data-admin-feedback-status="approved">Aprovar</button><button type="button" data-admin-feedback-status="rejected">Não aprovar</button><button type="button" data-admin-feedback-status="done">Concluir direto</button>';
      else if (status === 'approved') statusActions = '<button type="button" data-admin-feedback-status="done">Concluir</button><button type="button" data-admin-feedback-status="rejected">Não aprovar</button><button type="button" data-admin-feedback-status="pending">Voltar para análise</button>';
      else if (status === 'done') statusActions = '<button type="button" data-admin-feedback-status="approved">Reabrir</button>';
      else if (status === 'rejected') statusActions = '<button type="button" data-admin-feedback-status="pending">Reavaliar</button>';
      else statusActions = '<button type="button" data-admin-feedback-status="pending">Restaurar</button>';
      return `<article id="admin-feedback-${escapeHtml(item.id)}" class="admin-feedback-item ${kindClass} status-${status}" data-feedback-id="${escapeHtml(item.id)}">
        <span class="admin-feedback-avatar" aria-hidden="true">${escapeHtml(initials(item.authorName))}</span>
        <div class="admin-feedback-content">
          <div class="admin-feedback-meta"><span class="feedback-kind">${kindLabel}</span><span class="admin-feedback-status ${status}">${statusLabel}</span><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}</time></div>
          <h4>${escapeHtml(formatDisplayName(item.authorName))}</h4>
          <p>${escapeHtml(item.message)}</p>${item.imageUrl ? `<button class="feedback-image-link" type="button" data-feedback-image-url="${escapeHtml(item.imageUrl)}">🖼️ Abrir print anexado</button>` : ''}
          <label class="admin-feedback-comment">Comentário para o solicitante<textarea maxlength="600" rows="2" placeholder="Opcional: explique a decisão ou deixe uma orientação…">${escapeHtml(item.adminComment || '')}</textarea></label>
          <div class="admin-feedback-actions"><button type="button" data-admin-feedback-save-comment>Salvar comentário</button>${statusActions}${status !== 'archived' ? '<button class="delete" type="button" data-admin-feedback-status="archived">Arquivar</button>' : ''}<button class="delete permanent" type="button" data-admin-feedback-delete>Excluir</button></div>
        </div>
      </article>`;
    }).join('');
  }
}

function renderMyFeedback(messages) {
  feedbackMessages = Array.isArray(messages) ? messages : [];
  const section = $('#myFeedbackSection');
  const list = $('#myFeedbackList');
  const isAdmin = Boolean(appState && appState.me.role === 'admin');
  section.classList.toggle('hidden', isAdmin);
  $('#feedbackUnread').classList.add('hidden');
  if (isAdmin) return;
  if (!feedbackMessages.length) {
    list.innerHTML = '<p class="my-feedback-empty">Nenhuma solicitação enviada ainda.</p>';
    return;
  }
  list.innerHTML = [...feedbackMessages].reverse().map((item) => {
    const bug = item.type === 'bug';
    const praise = item.type === 'praise';
    const kindLabel = bug ? 'BUG' : praise ? 'ELOGIO / DENÚNCIA' : 'MELHORIA';
    const status = ['approved', 'done', 'rejected'].includes(item.status) ? item.status : 'pending';
    const statusLabel = status === 'done' ? 'CONCLUÍDA' : status === 'approved' ? 'APROVADA' : status === 'rejected' ? 'NÃO APROVADA' : 'EM ANÁLISE';
    return `<article id="my-feedback-${escapeHtml(item.id)}" class="my-feedback-item status-${status}">
      <div class="my-feedback-meta"><span class="feedback-kind">${kindLabel}</span><span class="my-feedback-status ${status}">${statusLabel}</span><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}</time></div>
      <p>${escapeHtml(item.message)}</p>${item.imageUrl ? `<button class="feedback-image-link" type="button" data-feedback-image-url="${escapeHtml(item.imageUrl)}">🖼️ Abrir meu print anexado</button>` : ''}
      ${item.adminComment ? `<div class="my-feedback-comment"><strong>Retorno do administrador</strong><span>${escapeHtml(item.adminComment)}</span></div>` : ''}
    </article>`;
  }).join('');
}

async function refreshFeedback(quiet = false) {
  if (!appState) return;
  const isAdmin = appState.me.role === 'admin';
  const list = isAdmin ? $('#adminFeedbackList') : $('#myFeedbackList');
  if (!quiet && list) list.innerHTML = '<p class="admin-feedback-empty">Carregando solicitações…</p>';
  try {
    const data = await api('/api/feedback');
    if (isAdmin) renderAdminFeedback(data.messages);
    else renderMyFeedback(data.messages);
  } catch (error) {
    if (!quiet && list) list.innerHTML = `<p class="admin-feedback-empty">${escapeHtml(error.message)}</p>`;
  }
}

// Imagens de feedback são privadas. Em vez de usar <img src> (que podia falhar
// quando a sessão ainda não estava disponível), carregamos o arquivo autenticado
// e só então o exibimos no modal.
document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-feedback-image-url]');
  if (!trigger) return;
  const dialog = $('#feedbackImageDialog'); const image = $('#feedbackImageDialogContent');
  trigger.disabled = true;
  try {
    const response = await fetch(trigger.dataset.feedbackImageUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível abrir este print agora.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('O anexo não é uma imagem válida.');
    const previous = image.dataset.objectUrl;
    if (previous) URL.revokeObjectURL(previous);
    image.dataset.objectUrl = URL.createObjectURL(blob); image.src = image.dataset.objectUrl;
    dialog.showModal();
  } catch (error) { showToast(error.message, 'error'); }
  finally { trigger.disabled = false; }
});
$('#closeFeedbackImageDialog').addEventListener('click', () => $('#feedbackImageDialog').close());

function closeFeedbackPanel(restoreFocus = true) {
  feedbackPanelOpen = false;
  $('#feedbackPanel').classList.add('hidden');
  $('#feedbackLauncher').setAttribute('aria-expanded', 'false');
  $('#feedbackTopButton').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#feedbackTopButton').focus();
}

function openFeedbackPanel() {
  if (!appState) return;
  feedbackPanelOpen = true;
  $('#feedbackPanel').classList.remove('hidden');
  $('#feedbackLauncher').setAttribute('aria-expanded', 'true');
  $('#feedbackTopButton').setAttribute('aria-expanded', 'true');
  $('#feedbackSuccess').classList.add('hidden');
  $('#feedbackForm').classList.remove('hidden');
  $('#feedbackError').textContent = '';
  refreshFeedback(true);
  $('#feedbackMessage').focus();
}

const portalPages = ['sorteio','inscricoes','memes','anonimos','agua','mentirometro','misterio','impostor','perfil','album','loja','jogos','classificacao','admin'];
const portalSections = ['inicio', ...portalPages];
const featurePageMap = { jogos: 'casino', impostor: 'impostor', misterio: 'mystery', loja: 'shop', inscricoes: 'uploads' };

function setMenuOpen(open) {
  const menu = $('#siteMenu');
  const backdrop = $('#menuBackdrop');
  menu.classList.toggle('open', open);
  menu.setAttribute('aria-hidden', String(!open));
  backdrop.classList.toggle('hidden', !open);
  backdrop.setAttribute('aria-hidden', String(!open));
  $('#menuButton').setAttribute('aria-expanded', String(open));
  $('#menuButton').setAttribute('aria-label', open ? 'Fechar menu principal' : 'Abrir menu principal');
  document.body.classList.toggle('menu-open', open);
  if (open) $('#closeMenuButton').focus();
}

function currentPortalPage() {
  let requested = new URLSearchParams(location.search).get('pagina') || 'memes';
  if (requested === 'cassino') requested = 'jogos';
  return portalPages.includes(requested) ? requested : 'sorteio';
}

function showPortalPage(page, pushState = false, resetScroll = true) {
  if (!portalPages.includes(page) || (page === 'admin' && appState?.me?.role !== 'admin')) page = 'sorteio';
  const requiredFeature = featurePageMap[page];
  if (requiredFeature && appState?.settings?.featureFlags?.[requiredFeature] === false) {
    if (pushState) showToast('Esta área foi pausada temporariamente pelo administrador.', 'error');
    page = 'memes';
  }
  portalSections.forEach((id) => {
    const section = $('#' + id);
    if (section) section.classList.toggle('portal-page-hidden', page === 'sorteio' ? !['inicio','sorteio'].includes(id) : id !== page);
  });
  $$('#siteMenu nav a[data-page]').forEach((link) => {
    const active = link.dataset.page === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (pushState) history.pushState({ page }, '', '?pagina=' + encodeURIComponent(page));
  else if (currentPortalPage() !== page) history.replaceState({ page }, '', '?pagina=' + encodeURIComponent(page));
  if (resetScroll) window.scrollTo({ top: 0, behavior: pushState ? 'smooth' : 'auto' });
}

function updateActiveNavigation() {
  navigationFrame = null;
  if (!appState) return;
  showPortalPage(currentPortalPage(), false, false);
}

function scheduleActiveNavigation() {
  if (navigationFrame === null) navigationFrame = requestAnimationFrame(updateActiveNavigation);
}

function showToast(message, type = 'ok') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = 'toast show ' + (type === 'error' ? 'error' : 'success');
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3600);
}

function setBusy(form, busy) {
  const button = $('button[type="submit"]', form);
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? 'Aguarde…' : button.dataset.label;
}

function setAuthTab(name) {
  $$('.auth-tab').forEach((button) => button.classList.toggle('active', button.dataset.authTab === name));
  $('#loginForm').classList.toggle('hidden', name !== 'login');
  $('#registerForm').classList.toggle('hidden', name !== 'register');
}

function setAuthSlide(index) {
  const slides = $$('.auth-slide');
  if (!slides.length) return;
  authSlideIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, itemIndex) => {
    const active = itemIndex === authSlideIndex;
    slide.classList.toggle('active', active);
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  $$('[data-auth-dot]').forEach((dot, itemIndex) => dot.classList.toggle('active', itemIndex === authSlideIndex));
  $$('.mobile-auth-slide').forEach((slide) => {
    const active = Number(slide.dataset.mobileSlide) === authSlideIndex;
    slide.classList.toggle('active', active);
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  $$('[data-mobile-dot]').forEach((dot) => dot.classList.toggle('active', Number(dot.dataset.mobileDot) === authSlideIndex));
}

function startAuthCarousel() {
  clearInterval(authCarouselTimer);
  setAuthSlide(authSlideIndex);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    authCarouselTimer = setInterval(() => setAuthSlide(authSlideIndex + 1), 4800);
  }
}

function stopAuthCarousel() {
  clearInterval(authCarouselTimer);
  authCarouselTimer = null;
}

function ensureMusicContext() {
  if (musicContext) return musicContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  musicContext = new AudioContextClass();
  musicGain = musicContext.createGain();
  musicGain.gain.value = .58;
  musicGain.connect(musicContext.destination);
  musicContext.addEventListener('statechange', updateMusicButton);
  return musicContext;
}

function ensureFallbackAudio() {
  if (!fallbackAudio) {
    fallbackAudio = new Audio('/musica-da-rodada.mp3');
    fallbackAudio.loop = true;
    fallbackAudio.preload = 'auto';
    fallbackAudio.volume = .58;
    fallbackAudio.addEventListener('playing', updateMusicButton);
    fallbackAudio.addEventListener('pause', updateMusicButton);
    fallbackAudio.addEventListener('error', updateMusicButton);
  }
  return fallbackAudio;
}

function loadMusicBuffer() {
  if (musicBuffer) return Promise.resolve(musicBuffer);
  if (musicBufferPromise) return musicBufferPromise;
  const context = ensureMusicContext();
  if (!context) return Promise.reject(new Error('Web Audio indisponível'));
  musicBufferPromise = fetch('/musica-da-rodada.mp3', { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('Áudio indisponível');
      return response.arrayBuffer();
    })
    .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data.slice(0), resolve, reject)))
    .then((buffer) => { musicBuffer = buffer; return buffer; })
    .catch((error) => { musicBufferPromise = null; throw error; });
  return musicBufferPromise;
}

function sharedMusicOffset(duration) {
  if (!musicEpoch || !duration) return 0;
  const sharedSeconds = (Date.now() + serverClockOffset - musicEpoch) / 1000;
  return ((sharedSeconds % duration) + duration) % duration;
}

function stopMusicSource() {
  if (!musicSource) return;
  try { musicSource.stop(); } catch {}
  try { musicSource.disconnect(); } catch {}
  musicSource = null;
}

function musicIsPlaying() {
  const webAudioPlaying = Boolean(musicSource && musicContext && musicContext.state === 'running');
  const fallbackPlaying = Boolean(fallbackAudio && !fallbackAudio.paused);
  return webAudioPlaying || fallbackPlaying;
}

function isMusicLockedForDrawDay() {
  const drawAt = String(appState?.settings?.roundSchedule?.drawAt || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawAt)) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  return drawAt === today;
}

function updateMusicButton() {
  const button = $('#musicToggle');
  if (!button) return;
  const active = Boolean(musicWanted && musicIsPlaying());
  const blocked = Boolean(musicWanted && appState && !active);
  const locked = isMusicLockedForDrawDay();
  button.classList.toggle('on', active);
  button.classList.toggle('blocked', blocked);
  button.textContent = active ? '🔊' : (blocked ? '🎵' : '🔇');
  button.disabled = !appState || (active && locked);
  button.title = locked ? (active ? 'Música fixa no dia de sorteio' : 'Tocar música do dia de sorteio') : (active ? 'Desativar música da rodada' : 'Tocar música da rodada');
  button.setAttribute('aria-label', button.title);
}

async function startMusic(force = false) {
  if ((!musicWanted && !force) || !appState || !musicEpoch) { updateMusicButton(); return; }
  if (musicStartPromise) return musicStartPromise;
  musicStartPromise = (async () => {
    try {
      const context = ensureMusicContext();
      if (!context) throw new Error('Web Audio indisponível');
      const wasSuspended = context.state !== 'running';
      await context.resume();
      const buffer = await loadMusicBuffer();
      if ((!musicWanted && !force) || !appState) return;
      if (musicSource && !wasSuspended) return;
      stopMusicSource();
      if (fallbackAudio && !fallbackAudio.paused) fallbackAudio.pause();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(musicGain);
      source.start(0, sharedMusicOffset(buffer.duration));
      musicSource = source;
    } catch {
      const audio = ensureFallbackAudio();
      if (audio.paused && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = sharedMusicOffset(audio.duration);
      }
      try { await audio.play(); } catch {}
    }
  })();
  try { await musicStartPromise; } finally { musicStartPromise = null; }
  updateMusicButton();
}

function pauseMusic() {
  stopMusicSource();
  if (fallbackAudio) fallbackAudio.pause();
  if (musicContext && musicContext.state === 'running') musicContext.suspend().catch(() => {});
  updateMusicButton();
}

function primeMusicFromGesture() {
  musicWanted = true; localStorage.setItem('roundMusic', 'on');
  const context = ensureMusicContext();
  if (context) {
    context.resume().catch(() => {});
    loadMusicBuffer().catch(() => {});
    return;
  }
  const audio = ensureFallbackAudio();
  const preferredVolume = audio.volume; audio.volume = 0;
  audio.play().then(() => { audio.pause(); audio.volume = preferredVolume; })
    .catch(() => { audio.volume = preferredVolume; });
}

// Navegadores só liberam áudio após um gesto. Uma única interação prepara a
// trilha para que qualquer roleta iniciada depois toque para toda a pessoa.
function unlockRoundMusicFromAnyGesture() {
  if (musicPrimedByGesture) return;
  musicPrimedByGesture = true;
  primeMusicFromGesture();
  if (appState && musicEpoch) startMusic();
}
['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, unlockRoundMusicFromAnyGesture, { passive: true, once: true }));

function showAuth() {
  $('#sessionBoot')?.classList.add('hidden');
  setMenuOpen(false);
  if (liveSource) liveSource.close();
  liveSource = null;
  pauseMusic();
  startAuthCarousel();
  appState = null;
  feedbackMessages = [];
  feedbackPanelOpen = false;
  $('#feedbackPanel').classList.add('hidden');
  $('#feedbackLauncher').classList.add('hidden');
  $('#feedbackTopButton').classList.add('hidden');
  $('#feedbackLauncher').setAttribute('aria-expanded', 'false');
  $('#feedbackTopButton').setAttribute('aria-expanded', 'false');
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  restoreRememberedLogin();
  window.scrollTo(0, 0);
}

function showApp(data) {
  $('#sessionBoot')?.classList.add('hidden');
  stopAuthCarousel();
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  applyState(data);
  if (typeof optimizeLegacyAvatar === 'function') optimizeLegacyAvatar(data);
  showPortalPage(currentPortalPage());
  $('#feedbackLauncher').classList.add('hidden');
  $('#feedbackTopButton').classList.remove('hidden');
  refreshFeedback(true);
  connectLive();
  scheduleActiveNavigation();
  if (data.me.mustChangePassword && !$('#passwordDialog').open) openPasswordDialog(true);
}

function updateThemePenaltyTimer(endsAt) {
  const timer = $('#themePenaltyTimer');
  if (!timer) return;
  const render = () => {
    const remaining = Number(new Date(endsAt || 0)) - Date.now();
    if (!endsAt || remaining <= 0) { timer.classList.add('hidden'); timer.textContent = ''; clearInterval(themePenaltyTimerInterval); themePenaltyTimerInterval = null; return; }
    const days = Math.floor(remaining / 86400000); const hours = Math.floor((remaining % 86400000) / 3600000); const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
    timer.textContent = `Tema especial: ${days ? days + 'd ' : ''}${hours}h ${minutes}min`;
    timer.classList.remove('hidden');
  };
  render(); if (!themePenaltyTimerInterval && endsAt) themePenaltyTimerInterval = setInterval(render, 30000);
}

function applyVisualTheme(data) {
  const button = $('#themeToggle');
  rainbowThemeForced = data.visualTheme === 'rainbow';
  const punishmentThemeForced = data.visualTheme === 'punishment';
  const specialThemeForced = rainbowThemeForced || punishmentThemeForced;
  const debtTheme = !specialThemeForced && Boolean(data.profile?.loan?.overdue);
  document.body.classList.toggle('theme-debt', debtTheme);
  const darkPreference = localStorage.getItem('area51DarkMode:' + data.me.id) === 'on';
  const dark = !specialThemeForced && (darkPreference || debtTheme);

  document.body.classList.toggle('theme-rainbow', rainbowThemeForced);
  document.body.classList.toggle('theme-punishment', punishmentThemeForced);
  document.body.classList.toggle('theme-dark', dark);
  updateThemePenaltyTimer(specialThemeForced ? data.visualThemeEndsAt : null);
  if (!button) return;

  button.disabled = specialThemeForced || debtTheme;
  button.classList.toggle('on', dark);
  button.classList.toggle('forced', specialThemeForced);
  button.textContent = rainbowThemeForced ? '★' : punishmentThemeForced ? '▼' : dark ? '☀' : '☾';
  button.title = debtTheme ? 'Tema Bandido Estelar: quite a dívida para restaurar seus visuais' : rainbowThemeForced
    ? 'Tema colorido obrigatório: você é o Gay da Rodada'
    : punishmentThemeForced ? 'Tema Castigo obrigatório: seu wallpaper foi o pior da rodada'
    : dark ? 'Desativar modo escuro' : 'Ativar modo escuro';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', dark ? 'true' : 'false');
}

function openPasswordDialog(forced = false) {
  const dialog = $('#passwordDialog');
  dialog.dataset.forced = forced ? 'true' : 'false';
  $('#closePasswordDialog').classList.toggle('hidden', forced);
  $('#passwordDialogTitle').textContent = forced ? 'Escolha uma nova senha' : 'Alterar minha senha';
  $('#passwordDialogText').textContent = forced
    ? 'Antes de usar a conta administrativa, troque a senha inicial.'
    : 'Informe sua senha atual e escolha uma nova senha com pelo menos 8 caracteres.';
  $('#passwordError').textContent = '';
  if (!dialog.open) dialog.showModal();
}

function gayCandidates() {
  return (appState ? (appState.gayParticipants || []) : [])
    .map((item) => ({ id: item.id, label: item.displayName, detail: 'Participante' }));
}

function wheelItems() {
  if (spinning && liveWheelItems) return liveWheelItems;
  if (!appState) return [];
  if (activeMode === 'theme') {
    return (appState.themeWheel || appState.themes || []).map((item) => ({ id: item.id, label: item.name, detail: 'Tema' }));
  }
  if (activeMode === 'gay') return gayCandidates();
  const assignedIds = new Set((appState.assignments || []).map((item) => item.submissionId));
  return (appState.submissions || [])
    .filter((item) => !assignedIds.has(item.id))
    .map((item) => ({ id: item.id, label: item.title, detail: 'Autoria secreta' }));
}

function missingWallpaperParticipants() {
  if (!appState || !appState.readiness) return 0;
  return Math.max(0, appState.readiness.total - appState.readiness.ready);
}

function hasEnoughDrawOptions(count = wheelItems().length) {
  if (!appState || !appState.workflow) return false;
  if (activeMode === 'theme') return appState.workflow.phase === 'theme' && count >= 1;
  if (activeMode === 'wallpaper') return appState.workflow.phase === 'assignments' && count >= 1;
  return appState.workflow.phase === 'gay' && count >= 1;
}

function isDrawAdmin() {
  return Boolean(appState && appState.me.role === 'admin' && !appState.me.mustChangePassword);
}

function updateSpinControl() {
  const button = $('#spinButton');
  const strong = $('strong', button);
  const small = $('small', button);
  button.classList.remove('viewer-locked');
  if (spinning) {
    button.disabled = true; strong.textContent = 'VAI!'; small.textContent = 'ao vivo'; return;
  }
  if (drawRequestPending) {
    button.disabled = true; strong.textContent = 'PREPARA'; small.textContent = 'a transmissão'; return;
  }
  if (!isDrawAdmin()) {
    button.classList.add('viewer-locked');
    button.disabled = true; strong.textContent = 'AO VIVO'; small.textContent = 'com o admin'; return;
  }
  strong.textContent = 'GIRAR'; small.textContent = 'a roleta';
  button.disabled = !hasEnoughDrawOptions();
}

function captionForMode() {
  if (!appState || !appState.workflow) return 'Preparando a rodada…';
  const workflow = appState.workflow;
  const count = wheelItems().length;
  let caption = '';
  if (activeMode === 'theme') {
    const themeDraw = appState.themeDraw || { finalists: [] };
    const finalists = themeDraw.finalists || [];
    caption = workflow.phase === 'theme'
      ? finalists.length < 3 ? `${count} temas na roleta · faltam ${3 - finalists.length} finalista${3 - finalists.length === 1 ? '' : 's'}.` : `Os 3 finalistas foram definidos. Gire entre eles para escolher o tema da rodada.`
      : 'O tema desta rodada é “' + workflow.currentTheme + '”.';
  } else if (activeMode === 'wallpaper') {
    if (workflow.phase === 'theme') caption = 'Sorteie o tema antes de abrir os envios.';
    else if (workflow.phase === 'uploads') {
      const missing = Math.max(0, workflow.totalParticipants - workflow.submitted);
      caption = workflow.submitted + ' de ' + workflow.totalParticipants + ' enviados. Faltam ' + missing + (missing === 1 ? ' wallpaper.' : ' wallpapers.');
    } else if (workflow.phase === 'assignments') {
      caption = workflow.assigned + ' de ' + workflow.totalAssignments + ' distribuídos. Cada giro entrega um wallpaper em segredo.';
    } else caption = 'Todos já receberam um wallpaper nesta rodada.';
  } else if (workflow.phase === 'gay') {
    caption = count + (count === 1 ? ' participante pronto para o sorteio único.' : ' participantes prontos para o sorteio único.');
  } else if (['voting', 'results'].includes(workflow.phase)) {
    caption = 'O Gay da Rodada já foi sorteado. Agora é hora da votação.';
  } else {
    caption = 'Distribua todos os wallpapers antes deste sorteio.';
  }
  if (!isDrawAdmin() && hasEnoughDrawOptions(count)) return 'Tudo pronto. Aguardando Raul iniciar o sorteio ao vivo.';
  return caption;
}

function suggestedMode() {
  const phase = appState && appState.workflow ? appState.workflow.phase : 'theme';
  if (phase === 'theme') return 'theme';
  if (phase === 'uploads' || phase === 'assignments') return 'wallpaper';
  return 'gay';
}

function setMode(mode) {
  activeMode = mode;
  $$('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
}

function drawWheel() {
  const items = wheelItems();
  const w = canvas.width;
  const center = w / 2;
  const radius = w / 2 - 18;
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.translate(center, center);
  ctx.beginPath(); ctx.arc(0, 0, radius + 12, 0, Math.PI * 2);
  ctx.fillStyle = '#102a4d'; ctx.fill();
  if (!items.length) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#eee6da'; ctx.fill();
    ctx.fillStyle = '#7d8794'; ctx.textAlign = 'center'; ctx.font = '700 21px Segoe UI';
    const emptyLabel = activeMode === 'theme' ? 'Aguardando temas' : activeMode === 'gay' ? 'Aguardando participantes' : 'Aguardando wallpapers';
    ctx.fillText(emptyLabel, 0, -4);
    ctx.font = '15px Segoe UI'; ctx.fillText('A roleta aparecerá aqui', 0, 25);
    ctx.restore(); return;
  }
  const step = Math.PI * 2 / items.length;
  items.forEach((item, index) => {
    const start = -Math.PI / 2 + index * step;
    const end = start + step;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, end); ctx.closePath();
    ctx.fillStyle = palette[index % palette.length]; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.58)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save();
    const middleAngle = start + step / 2;
    const innerTextRadius = Math.max(155, w * .205);
    const outerTextRadius = radius - 42;
    const textRadius = (innerTextRadius + outerTextRadius) / 2;
    ctx.rotate(middleAngle);
    ctx.translate(textRadius, 0);
    const normalizedAngle = (middleAngle + Math.PI * 2) % (Math.PI * 2);
    if (normalizedAngle > Math.PI / 2 && normalizedAngle < Math.PI * 1.5) ctx.rotate(Math.PI);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    const fullLabel = String(item.label || 'Opção');
    const maxLabelWidth = Math.max(86, outerTextRadius - innerTextRadius);
    let fontSize = Math.max(12, Math.min(23, 255 / Math.max(7, items.length)));
    let lines = [fullLabel];
    ctx.font = '800 ' + fontSize + 'px Segoe UI';
    if (items.length <= 6 && ctx.measureText(fullLabel).width > maxLabelWidth && fullLabel.includes(' ')) {
      const words = fullLabel.split(/\s+/);
      let bestSplit = 1;
      let bestBalance = Infinity;
      for (let split = 1; split < words.length; split += 1) {
        const first = words.slice(0, split).join(' ');
        const second = words.slice(split).join(' ');
        const balance = Math.abs(ctx.measureText(first).width - ctx.measureText(second).width);
        if (balance < bestBalance) { bestBalance = balance; bestSplit = split; }
      }
      lines = [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
    }
    while (fontSize > 11 && lines.some((line) => ctx.measureText(line).width > maxLabelWidth)) {
      fontSize -= 1;
      ctx.font = '800 ' + fontSize + 'px Segoe UI';
    }
    lines = lines.map((line) => {
      let fitted = line;
      while (fitted.length > 4 && ctx.measureText(fitted + '…').width > maxLabelWidth) fitted = fitted.slice(0, -1);
      return fitted === line ? line : fitted.trimEnd() + '…';
    });
    ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 4;
    if (lines.length === 2) {
      ctx.fillText(lines[0], 0, -fontSize * .62);
      ctx.fillText(lines[1], 0, fontSize * .62);
    } else ctx.fillText(lines[0], 0, 0);
    ctx.restore();
  });
  for (let index = 0; index < 32; index += 1) {
    const angle = index / 32 * Math.PI * 2;
    const lightRadius = radius - 9;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * lightRadius, Math.sin(angle) * lightRadius, index % 2 ? 2.2 : 3.3, 0, Math.PI * 2);
    ctx.fillStyle = index % 2 ? 'rgba(255,255,255,.78)' : '#ffd85a';
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, 108, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,216,90,.7)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 94, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf4'; ctx.fill(); ctx.strokeStyle = '#102a4d'; ctx.lineWidth = 7; ctx.stroke();
  ctx.restore();
}

function renderGallery() {
  const gallery = $('#gallery');
  const items = appState.submissions;
  $('#galleryCount').textContent = items.length + (items.length === 1 ? ' inscrição' : ' inscrições');
  if (!items.length) {
    gallery.innerHTML = '<div class="gallery-empty"><strong>A galeria ainda está vazia.</strong><br><small>Seja a primeira pessoa a enviar um wallpaper.</small></div>';
    return;
  }
  gallery.innerHTML = items.map((item) => {
    const author = item.revealed && item.uploader ? 'Por ' + escapeHtml(formatDisplayName(item.uploader)) : 'Autoria secreta';
    const visual = item.imageUrl
      ? '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" decoding="async">'
      : '<div class="secret-wallpaper"><span>✦</span><strong>ENVIO RECEBIDO</strong><small>A imagem aparece quando todos enviarem</small></div>';
    return '<article class="gallery-card">' +
      visual +
      (item.canDelete ? '<button class="delete-upload" data-delete-upload="' + item.id + '" title="Remover wallpaper" aria-label="Remover wallpaper">×</button>' : '') +
      (item.assistedUpload ? '<span class="assisted-gallery-badge">🛰️ Envio assistido</span>' : '') +
      '<div class="gallery-overlay"><strong>' + escapeHtml(item.title) + '</strong><span>' + author + '</span></div></article>';
  }).join('');
  $$('img', gallery).forEach((image) => image.addEventListener('error', () => {
    const replacement = document.createElement('div');
    replacement.className = 'wallpaper-load-error';
    replacement.innerHTML = '<span>🛰️</span><strong>Imagem indisponível</strong><small>Atualize a página e entre novamente.</small>';
    image.replaceWith(replacement);
  }, { once: true }));
}

function renderWorkflow() {
  const phase = appState.workflow ? appState.workflow.phase : 'theme';
  const order = ['theme', 'uploads', 'assignments', 'gay', 'voting'];
  const phaseIndex = phase === 'results' ? order.length : order.indexOf(phase);
  $$('[data-workflow-step]').forEach((step, index) => {
    step.classList.toggle('active', index === phaseIndex || (phase === 'results' && index === order.length - 1));
    step.classList.toggle('complete', index < phaseIndex || phase === 'results');
  });
}

function renderNotifications() {
  const data = appState.notifications || { unreadCount: 0, items: [] };
  // O servidor é a fonte da verdade: comparar datas no navegador fazia avisos
  // continuarem não lidos quando havia diferença de relógio entre dispositivos.
  const visibleItems = data.items.map((item) => ({ ...item, unread: Boolean(item.unread) }));
  const unreadCount = Number(data.unreadCount || 0);
  const badge = $('#notificationBadge');
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  badge.classList.toggle('hidden', !unreadCount);
  $('#notificationList').innerHTML = visibleItems.length ? visibleItems.map((item) => `<button type="button" class="notification-item${item.unread ? ' unread' : ''}" data-notification-page="${escapeHtml(item.page || 'sorteio')}" data-notification-id="${escapeHtml(item.id)}"><span>${item.icon || '👽'}</span><p><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}</small><em>${escapeHtml(formatDate(item.createdAt))}</em></p></button>`).join('') : '<div class="notification-empty"><span>🛸</span><strong>Tudo tranquilo por aqui</strong><small>Seus novos avisos aparecerão neste espaço.</small></div>';
}

async function openNotificationTarget(id, page) {
  showPortalPage(portalPages.includes(page) ? page : 'sorteio', true);
  let targetId = 'profileIdentityCard';
  if (id.startsWith('mention:')) targetId = 'feed-comment-' + id.slice(8);
  else if (id.startsWith('lie-dispute:')) targetId = 'lie-dispute-' + id.slice(12);
  else if (id.startsWith('feedback:')) {
    if (appState.me.role === 'admin') {
      showPortalPage('admin', true);
      adminFeedbackFilter = 'all';
      await refreshFeedback(true);
      targetId = 'admin-feedback-' + id.split(':')[1];
    } else {
      openFeedbackPanel();
      await refreshFeedback(true);
      targetId = 'my-feedback-' + id.split(':')[1];
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } else if (id.startsWith('assignment:')) targetId = 'receivedWallpaperCard';
  else if (id.startsWith('vote:')) targetId = 'votingPanel';
  else if (id.startsWith('credit:')) targetId = 'creditLedger';
  else if (id.startsWith('gift:')) targetId = appState.notifications?.items?.find(item => item.id === id)?.targetId || 'profileIdentityCard';
  else if (id.startsWith('card-drop:')) targetId = 'cardAlbumCollections';
  else if (id.startsWith('card-trade:')) targetId = 'cardTradingCard';
  else if (id.startsWith('trade:')) targetId = 'visualTradingCard';
  else if (id.startsWith('feature-master')) targetId = 'mysteryInventoryCard';
  const target = document.getElementById(targetId);
  if (!target || target.closest('.hidden')) {
    showToast('Este conteúdo não está mais disponível. A seção correspondente foi aberta.');
    return;
  }
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  target.setAttribute('tabindex', '-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'center', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  target.classList.add('notification-target');
  setTimeout(() => target.classList.remove('notification-target'), 3500);
}

function renderOnlinePeople() {
  const people = Array.isArray(appState?.onlinePeople) ? appState.onlinePeople : [];
  $('#onlinePeopleCount').textContent = String(people.length || 1);
  $('#onlinePeopleButton').title = people.length ? 'Online agora: ' + people.map((person) => formatDisplayName(person.displayName)).join(', ') : 'Você está online';
  $('#menuOnlinePeople').innerHTML = `<i></i><strong>${people.length || 1} online</strong><span>${escapeHtml(people.length ? people.map((person) => formatDisplayName(person.displayName)).join(' · ') : 'Você')}</span>`;
}

$('#onlinePeopleButton')?.addEventListener('click',()=>{const people=Array.isArray(appState?.onlinePeople)?appState.onlinePeople:[];const host=$('#onlinePeopleDialogList');host.innerHTML=people.length?people.map(person=>'<span class="online-person-line">🟢 '+escapeHtml(formatDisplayName(person.displayName))+(person.id===appState.me.id?' · você':'')+'</span>').join(''):'<span class="online-person-line">🟢 Você</span>';$('#onlinePeopleDialog').showModal();});
$('#closeOnlinePeopleDialog')?.addEventListener('click',()=>$('#onlinePeopleDialog').close());

function renderCasino(casino = {}) {
  if (casinoSpinInProgress) { drawCasinoWheel(); return; }
  $('#casinoWallet').textContent = Number(casino.wallet || 0).toLocaleString('pt-BR');
  $('#casinoShopWallet').textContent = Number(casino.shopWallet || 0).toLocaleString('pt-BR');
  $('#casinoClosedBoxes').textContent = Number(casino.closedBoxes || 0).toLocaleString('pt-BR');
  $('#casinoPlays').textContent = String(Number(casino.playsToday || 0));
  $('#casinoTotalWagered').textContent = Number(casino.totalWagered || 0).toLocaleString('pt-BR');
  $('#casinoTotalPlays').textContent = Number(casino.totalPlays || 0).toLocaleString('pt-BR');
  const recentFlights = Array.isArray(casino.recentFlights) ? casino.recentFlights : [];
  $('#flightPublicHistory').innerHTML = recentFlights.length ? recentFlights.map((flight) => `<span class="${Number(flight.multiplier) <= 1 ? 'crashed' : Number(flight.multiplier) >= 3 ? 'high' : ''}">x${Number(flight.multiplier || 1).toFixed(2).replace('.', ',')}</span>`).join('') : '<span>Aguardando voos</span>';
  const cashoutTarget = Number(casino.cashoutThreshold || 500); const cashoutBalance = Number(casino.wallet || 0); const cashoutButton = $('#casinoCashoutButton');
  $('#casinoCashoutText').textContent = casino.cashedOut ? 'Lucro de hoje já resgatado' : `${Math.min(cashoutBalance, cashoutTarget).toLocaleString('pt-BR')} de ${cashoutTarget.toLocaleString('pt-BR')}`;
  $('#casinoCashoutProgress').style.width = `${Math.min(100, Math.round(cashoutBalance / cashoutTarget * 100))}%`;
  cashoutButton.disabled = !casino.canCashOut; cashoutButton.textContent = casino.cashedOut ? 'Resgate realizado hoje' : casino.canCashOut ? `Resgatar ${Number(casino.cashoutAmount || cashoutBalance).toLocaleString('pt-BR')} créditos` : `Faltam ${Math.max(0, cashoutTarget - cashoutBalance).toLocaleString('pt-BR')}`;
  const historyMarkup = (history, emptyText, flight = false) => history.length ? history.map((play) => { const source = play.walletSource === 'shop' ? 'Loja 51' : 'Bônus diário'; return play.resultType === 'mysteryBox' ? `<div class="casino-history-item jackpot"><span>${play.mysteryBox?.icon || '🎁'}</span><p><strong>${escapeHtml(play.mysteryBox?.name || 'Baú misterioso')}</strong><small>${source} · aposta ${play.bet} devolvida · baú enviado ao perfil</small></p></div>` : `<div class="casino-history-item ${play.net > 0 ? 'win' : play.net < 0 ? 'loss' : 'draw'}"><span>${flight ? '🦄' : play.net > 0 ? '🚀' : play.net < 0 ? '🕳️' : '🛸'}</span><p><strong>x${String(play.multiplier).replace('.', ',')}</strong><small>${source} · aposta ${play.bet} · retorno ${play.payout} · saldo ${play.net > 0 ? '+' : ''}${play.net}</small></p></div>`; }).join('') : `<p class="casino-empty">${emptyText}</p>`;
  const rouletteHistory = Array.isArray(casino.recentRoulette) ? casino.recentRoulette : [];
  const flightHistory = Array.isArray(casino.recentFlight) ? casino.recentFlight : [];
  const compactHistory = (selector, history, emptyText, flight = false) => {
    const container = $(selector);
    const opened = Boolean(container.querySelector('details[open]'));
    container.innerHTML = historyMarkup(history.slice(0, 1), emptyText, flight) + (history.length > 1 ? `<details class="casino-history-more"${opened ? ' open' : ''}><summary>Ver mais ${history.length - 1} resultados recentes</summary><div>${historyMarkup(history.slice(1), '', flight)}</div></details>` : '');
  };
  compactHistory('#casinoRouletteHistory', rouletteHistory, 'Sua primeira rodada aparecerá aqui.');
  compactHistory('#casinoFlightHistory', flightHistory, 'Seu primeiro voo aparecerá aqui.', true);
  if (casino.globalFlight && !flightPollTimer) startFlightPolling();
  drawCasinoWheel();
}

function setFlightVisual(active, multiplier = 1, message = '', options = {}) {
  const phase = options.phase || (active ? 'flying' : 'waiting'); flightInProgress = active; $('#flightSky').dataset.phase = phase; $('#flightSky').classList.toggle('flying', phase === 'flying');
  const cashoutButton = $('#flightCashoutButton'); const cashoutReady = !cashoutButton.dataset.requesting && Boolean(options.canCashOut || flightCashoutLocallyReady); cashoutButton.disabled = !cashoutReady; cashoutButton.textContent = cashoutButton.dataset.requesting ? 'Resgatando…' : cashoutReady ? 'Resgatar agora' : 'Resgate em x1,25'; $('#flightStartButton').disabled = active && (phase !== 'countdown' || options.joined);
  $('#flightStartButton').textContent = phase === 'flying' ? 'Voo em andamento' : phase === 'waiting' ? 'Iniciar nova contagem' : $('#flightStartButton').textContent;
  $('#flightMultiplier').textContent = 'x' + Number(multiplier).toFixed(2).replace('.', ','); $('#flightMessage').textContent = message || (active ? 'A nave está subindo…' : 'Aguardando lançamento');
}
function scheduleFlightCashoutReady(delayMs, joined) {
  clearTimeout(flightCashoutReadyTimer); flightCashoutReadyTimer = null;
  if (!joined || delayMs < 0) return;
  flightCashoutReadyTimer = setTimeout(() => {
    const button = $('#flightCashoutButton');
    if (flightInProgress && button && !button.dataset.requesting) { flightCashoutLocallyReady = true; button.disabled = false; button.textContent = 'Resgatar agora'; }
  }, Math.max(0, delayMs));
}
function stopFlightPolling() { cancelAnimationFrame(flightAnimationFrame); flightAnimationFrame=null; flightSnapshot=null; flightPollGeneration++; clearTimeout(flightPollTimer); clearTimeout(flightCashoutReadyTimer); flightPollTimer = null; flightCashoutReadyTimer = null; flightCashoutLocallyReady = false; flightInProgress = false; }
async function flightApi(url, options = {}, attempts = 4) {
  try { return await api(url, options); }
  catch (error) {
    if (attempts > 1 && /outra pessoa atualizou/i.test(error.message)) { await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 380)); return flightApi(url, options, attempts - 1); }
    throw error;
  }
}
function animateFlightClock() {
  cancelAnimationFrame(flightAnimationFrame);
  const tick=()=>{
    if(!flightSnapshot)return;
    const {data,received}=flightSnapshot,elapsed=performance.now()-received;
    if(elapsed>600){
      // Entre respostas, não inventamos novo multiplicador. O resgate manual,
      // porém, continua habilitado quando já foi liberado pela última leitura.
      const button=$('#flightCashoutButton');
      const manualReady=Boolean(data.canCashOut || flightCashoutLocallyReady);
      if(!button.dataset.requesting){button.disabled=!manualReady;button.textContent=manualReady?'Resgatar agora':'Resgate em x1,25';}
    } else {
      const remaining=Number(data.countdownMs||0)-elapsed;
      if(data.phase==='countdown' && remaining>0)$('#flightMultiplier').textContent=String(Math.ceil(remaining/1000));
      else {
        const step=Number(data.stepMs)||3200;
        const value=data.phase==='countdown'?1+Math.max(0,-remaining)/step:Number(data.multiplier||1)+elapsed/step;
        $('#flightMultiplier').textContent='x'+value.toFixed(2).replace('.',',');
        $('#flightSky').dataset.phase='flying';$('#flightSky').classList.add('flying');
      }
    }
    flightAnimationFrame=requestAnimationFrame(tick);
  };
  tick();
}
function startFlightPolling() {
  if(flightPollTimer)return;
  const generation=++flightPollGeneration;
  const poll=async()=>{
    try{
      const data=await api('/api/casino/flight/status',{},false);
      if(generation!==flightPollGeneration)return;
      flightCurrentId=data.id || null;
      // Depois que o saque é liberado, mantenha o botão disponível entre duas
      // leituras do servidor. Isso evita um pisca/trava visual sem estimar
      // nenhum resultado novo localmente.
      flightCashoutLocallyReady = data.phase === 'countdown' ? false : Boolean(data.canCashOut || flightCashoutLocallyReady);
      if(data.active){
        const countdown=data.phase==='countdown',step=Number(data.stepMs)||3200;
        const automatic=data.autoCashout?' · Automático em x'+Number(data.autoCashout).toFixed(2).replace('.',','):' · Saque manual em x1,25';
        setFlightVisual(true,data.multiplier||1,data.cashedOut?'Resgatado: '+data.payout+' créditos · aguardando queda':countdown?'Preparando decolagem'+automatic:data.players+' no mesmo voo'+automatic,{phase:data.phase,joined:data.joined,canCashOut:data.canCashOut});
        scheduleFlightCashoutReady(data.cashedOut?-1:countdown?data.countdownMs+.25*step:Math.max(0,(1.25-Number(data.multiplier||1))*step),data.joined);
        flightSnapshot={data,received:performance.now()};animateFlightClock();
        $('#flightStartButton').textContent=countdown?(data.joined?'Aposta confirmada':'Entrar neste voo'):'Voo em andamento';
        flightPollTimer=setTimeout(poll,750);
      }else{
        stopFlightPolling();
        setFlightVisual(false,data.crashAt||1,data.crashed?'A nave caiu em x'+Number(data.crashAt||1).toFixed(2).replace('.',',')+(data.cashedOut?' · Você resgatou '+data.payout+' créditos':''):'Aguardando lançamento',{phase:data.crashed?'crashed':'waiting'});
        try{applyState(await api('/api/state',{},false));}catch{showToast('Voo encerrado. Reconectando para atualizar o saldo.');}
      }
    }catch(error){
      if(generation!==flightPollGeneration)return;
      clearTimeout(flightCashoutReadyTimer);flightCashoutLocallyReady=false;$('#flightCashoutButton').disabled=true;
      $('#flightMessage').textContent='Conexão instável. Reconectando sem repetir sua aposta…';
      flightPollTimer=setTimeout(poll,2500);
    }
  };
  flightPollTimer=setTimeout(poll,0);
}

function drawCasinoWheel() {
  const wheel = $('#casinoWheel'); if (!wheel) return;
  const context = wheel.getContext('2d'); const size = wheel.width; const radius = size / 2; const step = Math.PI * 2 / casinoWheelValues.length;
  const colors = ['#ef476f','#ff8c32','#ffd23f','#35c58a','#2e91df','#7657d5'];
  context.clearRect(0, 0, size, size); context.save(); context.translate(radius, radius);
  casinoWheelValues.forEach((value, index) => {
    const start = -Math.PI / 2 + index * step; const end = start + step;
    const isBox = typeof value === 'string' && value.startsWith('box-');
    const boxColors = { 'box-sonda': '#3c90bb', 'box-cosmic': '#895dc4', 'box-area51': '#d39b27' };
    const boxIcons = { 'box-sonda': '📦', 'box-cosmic': '🎁', 'box-area51': '🛸' };
    context.beginPath(); context.moveTo(0, 0); context.arc(0, 0, radius - 7, start, end); context.closePath(); context.fillStyle = isBox ? boxColors[value] : colors[index % colors.length]; context.fill(); context.strokeStyle = '#fff9'; context.lineWidth = 1.5; context.stroke();
    context.save(); context.rotate(start + step / 2); context.translate(radius * .73, 0); context.rotate(Math.PI / 2); context.fillStyle = '#fff'; context.font = isBox ? '900 14px Segoe UI' : '900 10px Segoe UI'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(isBox ? boxIcons[value] : 'x' + String(value).replace('.', ','), 0, 0); context.restore();
  });
  context.beginPath(); context.arc(0, 0, radius * .25, 0, Math.PI * 2); context.fillStyle = '#101a2d'; context.fill(); context.strokeStyle = '#ffe083'; context.lineWidth = 6; context.stroke(); context.restore();
}

function animateCasinoWheel(segmentIndex, wheelValue) {
  const wheel = $('#casinoWheel'); const matches = casinoWheelValues.map((value, index) => value === wheelValue ? index : -1).filter((index) => index >= 0);
  const index = Number.isInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < casinoWheelValues.length ? segmentIndex : (matches[Math.floor(Math.random() * matches.length)] ?? 0); const step = 360 / casinoWheelValues.length;
  const desired = 360 - (index * step + step / 2); casinoWheelRotation += 360 * 7 + ((desired - casinoWheelRotation) % 360 + 360) % 360;
  wheel.style.transition = 'transform 5.2s cubic-bezier(.08,.72,.04,1)';
  wheel.style.transform = `rotate(${casinoWheelRotation}deg)`;
  return new Promise((resolve) => setTimeout(resolve, 5300));
}

async function showMysteryOpening(boxName, reward) {
  const dialog = $('#mysteryOpeningDialog'); const track = $('#mysteryCarouselTrack'); const result = $('#mysteryOpeningResult'); const decision = $('#mysteryOpeningDecision');
  const prizes = (appState?.profile?.shop || []).filter((item) => !item.mysteryBox && !item.cardPack && !item.service && !item.adminOnly);
  if (!dialog?.showModal || !prizes.length) return;
  mysteryOpeningInProgress = true; $('#mysteryOpeningTitle').textContent = boxName; result.classList.remove('revealed'); result.innerHTML = '<span>🛸</span><strong>Aguarde o carrossel parar</strong>'; setBusy(decision, false); decision.classList.add('hidden');
  const winningIndex = 31; const entries = Array.from({ length: 36 }, (_, index) => index === winningIndex ? reward : prizes[Math.floor(Math.random() * prizes.length)]);
  track.innerHTML = entries.map((item) => `<article><span>${item.icon || '🎁'}</span><strong>${escapeHtml(item.name || 'Prêmio secreto')}</strong></article>`).join('');
  track.style.transition = 'none'; track.style.transform = 'translateX(0)'; dialog.showModal(); await new Promise((resolve) => setTimeout(resolve, 80));
  const itemWidth = 124; const target = $('#mysteryCarouselViewport').clientWidth / 2 - (winningIndex * itemWidth + itemWidth / 2);
  track.style.transition = 'transform 7.2s cubic-bezier(.04,.78,.04,1)'; track.style.transform = `translateX(${target}px)`; await new Promise((resolve) => setTimeout(resolve, 7300));
  track.children[winningIndex]?.classList.add('winner');
  result.innerHTML = `<span>${reward.icon || '🎁'}</span><strong>Você recebeu ${escapeHtml(reward.name || 'um prêmio secreto')}!</strong>`; result.classList.add('revealed');
  if (!reward.purchaseId) { await new Promise((resolve) => setTimeout(resolve, 2200)); dialog.close(); mysteryOpeningInProgress = false; return null; }
  $('#sellMysteryReward').textContent = `Vender agora por ${Number(reward.sellPrice || 0).toLocaleString('pt-BR')} créditos`;
  decision.classList.remove('hidden');
  const finalState = await new Promise((resolve) => {
    $('#keepMysteryReward').onclick = async () => { setBusy(decision, true); try { resolve(await api('/api/mystery-rewards/keep', { method: 'POST', body: { purchaseId: reward.purchaseId } })); } catch (error) { showToast(error.message, 'error'); setBusy(decision, false); } };
    $('#sellMysteryReward').onclick = async () => { setBusy(decision, true); try { const data = await api('/api/mystery-rewards/sell', { method: 'POST', body: { purchaseId: reward.purchaseId } }); showToast(`${data.soldReward.name} vendido por ${Number(data.soldReward.amount).toLocaleString('pt-BR')} créditos.`); resolve(data); } catch (error) { showToast(error.message, 'error'); setBusy(decision, false); } };
  });
  dialog.close(); decision.classList.add('hidden'); mysteryOpeningInProgress = false; return finalState;
}

function renderRoundSummary() {
  const summary = appState.roundSummary || { uploads: {}, deliveries: {}, views: {}, votes: {}, my: {} };
  const names = { theme: 'Aguardando tema', uploads: 'Recebendo envios', assignments: 'Distribuindo', gay: 'Sorteio especial', voting: 'Votação aberta', results: 'Concluída' };
  $('#roundSummaryPhase').textContent = names[summary.phase] || 'Aguardando';
  $('#roundSummaryTheme').textContent = summary.theme ? 'Tema: ' + summary.theme : 'Nenhum tema definido';
  $('#roundSummarySteps').innerHTML = [['Envios', summary.uploads], ['Entregas', summary.deliveries], ['Visualizações', summary.views], ['Votos', summary.votes]].map(([label, value]) => { const done = Number(value?.done || 0); const total = Number(value?.total || 0); return `<div><p><strong>${label}</strong><span>${done} de ${total}</span></p><i><b style="width:${total ? Math.round(done / total * 100) : 0}%"></b></i></div>`; }).join('');
  const mine = summary.my || {};
  $('#roundSummaryMine').innerHTML = `<small>MINHA PARTICIPAÇÃO</small><span class="${mine.submitted ? 'done' : ''}">${mine.submitted ? '✓' : '○'} Enviado</span><span class="${mine.delivered ? 'done' : ''}">${mine.delivered ? '✓' : '○'} Recebido</span><span class="${mine.viewed ? 'done' : ''}">${mine.viewed ? '✓' : '○'} Visualizado</span><span class="${mine.voted ? 'done' : ''}">${mine.voted ? '✓' : '○'} Votado</span>${summary.gayWinner ? `<strong>🌈 Gay da Rodada: ${escapeHtml(formatDisplayName(summary.gayWinner))}</strong>` : ''}`;
}

function renderAssignments() {
  const items = appState.assignments || [];
  const workflow = appState.workflow || { assigned: 0, totalAssignments: 0 };
  $('#assignmentCount').textContent = workflow.assigned + ' de ' + workflow.totalAssignments;
  const board = $('#assignmentBoard');
  board.classList.toggle('empty-state', !items.length);
  board.innerHTML = items.length ? items.map((item) =>
    '<div class="latest-item assignment-item' + (item.isMine ? ' is-mine' : '') + '">' +
    (item.imageUrl ? '<img class="latest-thumb" src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="latest-thumb secret-thumb" aria-hidden="true">👽</span>') +
    '<p><strong>' + escapeHtml(formatDisplayName(item.assignedTo)) + ' recebeu</strong><small>' + escapeHtml(item.title) + ' · ' +
    (item.revealed ? 'Por ' + escapeHtml(formatDisplayName(item.uploader)) : 'Autoria secreta') + '</small></p></div>'
  ).join('') : 'A distribuição ainda não começou.';

  const mine = items.find((item) => item.isMine);
  const receivedCard = $('#receivedWallpaperCard');
  receivedCard.classList.toggle('hidden', !mine);
  if (!mine) {
    $('#receivedWallpaperImage').removeAttribute('src');
    $('#downloadReceivedWallpaper').removeAttribute('href');
    return;
  }
  receivedCard.classList.toggle('is-new', Boolean(mine.isNew));
  $('#receivedWallpaperStatus').textContent = mine.seen ? '✓ VISUALIZADO' : 'NOVO · SEU WALLPAPER CHEGOU';
  $('#markWallpaperSeenButton').classList.toggle('hidden', Boolean(mine.seen));
  $('#receivedWallpaperImage').src = mine.imageUrl;
  $('#receivedWallpaperTitle').textContent = mine.title;
  $('#receivedWallpaperAuthor').textContent = mine.revealed && mine.uploader
    ? 'Enviado por ' + mine.uploader + '.'
    : 'Autoria secreta até o fim da votação.';
  const themeName = appState.workflow && appState.workflow.currentTheme ? appState.workflow.currentTheme : 'rodada';
  const safeTheme = themeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rodada';
  const download = $('#downloadReceivedWallpaper');
  download.href = '/api/my-wallpaper';
  download.download = 'meu-wallpaper-' + safeTheme;
}

function liveTitleChips(titles = []) {
  return Array.isArray(titles) ? titles.map((title) => '<span class="live-title-chip live-title-' + escapeHtml(title.id) + '">' + escapeHtml(title.icon) + ' ' + escapeHtml(title.name) + '</span>').join('') : '';
}

function renderRankings() {
  const best = appState.rankings ? appState.rankings.best || [] : [];
  const worst = appState.rankings ? appState.rankings.worst || [] : [];
  const gay = appState.rankings ? appState.rankings.gay || [] : [];
  const maxGayWins = Math.max(1, ...gay.map((item) => Number(item.gayWins) || 0));
  const rankingRows = (items, type) => items.length ? items.map((item, index) => {
    const value = type === 'best' ? item.bestWins : type === 'worst' ? item.worstWins : item.gayWins;
    const meta = type === 'best'
      ? value + (value === 1 ? ' vitória como melhor' : ' vitórias como melhor')
      : type === 'worst'
        ? value + (value === 1 ? ' vez como pior' : ' vezes como pior')
        : value + (value === 1 ? ' vez sorteado' : ' vezes sorteado');
    const podiumClass = index < 3 ? ' rank-' + (index + 1) : '';
    const gayLevel = type === 'gay' ? Math.max(0, Math.min(1, value / maxGayWins)) : 0;
    const rowStyle = '--rank-hue:' + ((index * 47 + 205) % 360) + ';--gay-level:' + gayLevel.toFixed(3) + ';--gay-alpha:' + (value ? 0.11 + gayLevel * 0.35 : 0.035).toFixed(3);
    return '<button type="button" data-public-profile="' + escapeHtml(item.id) + '" class="ranking-row ' + type + '-ranking-row' + podiumClass + '" style="' + rowStyle + '"><span class="rank-position">' + (index + 1) + '</span>' +
      personAvatar(item, 'rank-avatar') +
      '<p><strong>' + visualName(item) + '</strong><span class="ranking-live-titles">' + liveTitleChips(item.liveTitles) + '</span><small>' + meta + '</small></p>' +
      '<strong class="rank-value">' + value + '</strong></button>';
  }).join('') : '<div class="ranking-empty">A classificação começa após a primeira rodada.</div>';
  $('#bestRanking').innerHTML = rankingRows(best, 'best');
  $('#worstRanking').innerHTML = rankingRows(worst, 'worst');
  $('#gayRanking').innerHTML = rankingRows(gay, 'gay');
}

let openedPublicProfileId='';
function renderPublicProfile(profile){openedPublicProfileId=profile.id;const avatar=profile.avatarDataUrl?'<img src="'+escapeHtml(profile.avatarDataUrl)+'" alt="">':'<span class="public-profile-avatar">'+escapeHtml((profile.displayName||'?').slice(0,1).toUpperCase())+'</span>';const titles=(profile.liveTitles||[]).map(t=>'<span class="live-title-chip">'+escapeHtml(t.icon+' '+t.name)+'</span>').join('');const trophies=(profile.showcase||[]).map(item=>'<span title="'+escapeHtml(item.description||'')+'">'+escapeHtml(item.icon+' '+item.name)+'</span>').join('');const trophyRoom=trophies?'<section class="public-trophy-room"><h4>🏛️ Sala de Troféus</h4><div class="public-trophy-list">'+trophies+'</div></section>':'';const comments=(profile.comments||[]).map(c=>'<article><strong>'+escapeHtml(formatDisplayName(c.authorName))+'</strong><p>'+escapeHtml(c.message)+'</p><small>'+new Date(c.createdAt).toLocaleString('pt-BR')+'</small></article>').join('')||'<p class="public-profile-empty">Ainda não há comentários. Seja o primeiro.</p>';$('#publicProfileContent').innerHTML='<header class="public-profile-head">'+avatar+'<div><h3>'+escapeHtml(formatDisplayName(profile.displayName))+'</h3><p>'+titles+'</p><small>🏆 '+Number(profile.stats.bestWins||0)+' melhores · 👎 '+Number(profile.stats.worstWins||0)+' piores · 🌈 '+Number(profile.stats.gayWins||0)+' sorteios</small></div></header>'+trophyRoom+'<section class="public-profile-comments"><h4>Comentários</h4>'+comments+'</section>';const form=$('#publicProfileCommentForm');form.classList.toggle('hidden',profile.id===appState.me.id);}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-public-profile]');if(!button)return;try{const data=await api('/api/profiles/'+encodeURIComponent(button.dataset.publicProfile));renderPublicProfile(data.profile);$('#publicProfileDialog').showModal();}catch(error){showToast(error.message,'error');}});
$('#closePublicProfileDialog')?.addEventListener('click',()=>$('#publicProfileDialog').close());
$('#publicProfileCommentForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(!openedPublicProfileId||!form.reportValidity())return;setBusy(form,true);try{const data=await api('/api/profiles/'+encodeURIComponent(openedPublicProfileId),{method:'POST',body:{message:form.elements.message.value}});form.reset();renderPublicProfile(data.profile);showToast('Comentário publicado no perfil.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});

function renderVoting() {
  const panel = $('#votingPanel');
  const voting = appState.voting;
  panel.classList.toggle('hidden', !voting);
  if (!voting) return;
  const closed = voting.status === 'closed';
  const percent = voting.totalVoters ? Math.min(100, voting.receivedVotes / voting.totalVoters * 100) : 0;
  $('#votingEyebrow').textContent = closed ? 'VOTAÇÃO ENCERRADA' : 'VOTAÇÃO ANÔNIMA ABERTA';
  $('#votingTitle').textContent = closed ? 'Autores revelados — confira o resultado' : 'Qual foi o melhor — e o pior?';
  $('#votingDescription').textContent = closed
    ? 'A votação terminou. Agora a autoria e os totais estão públicos.'
    : 'Escolha wallpapers diferentes. Os autores permanecem em segredo até o fim.';
  $('#voteProgressText').textContent = voting.receivedVotes + ' de ' + voting.totalVoters + (voting.totalVoters === 1 ? ' voto' : ' votos');
  $('#voteProgressBar').style.width = (closed ? 100 : percent) + '%';
  const bestItem = closed ? voting.entries.find((item) => item.isBestWinner) : null;
  const worstItem = closed ? voting.entries.find((item) => item.isWorstWinner) : null;
  const summary = $('#voteSummary');
  summary.classList.toggle('hidden', !closed);
  const bestTieText = voting.result && voting.result.bestTiebreak ? ' · desempate automático' : '';
  const worstTieText = voting.result && voting.result.worstTiebreak ? ' · desempate automático' : '';
  summary.innerHTML = closed && bestItem && worstItem ?
    '<div class="result-leader best"><span>★ MELHOR DA RODADA · +120 CRÉDITOS</span><strong>' + escapeHtml(bestItem.title) + '</strong><small>Por ' + escapeHtml(formatDisplayName(bestItem.uploader)) + ' — ' + bestItem.bestVotes + (bestItem.bestVotes === 1 ? ' voto' : ' votos') + bestTieText + '</small></div>' +
    '<div class="result-leader worst"><span>▼ PIOR DA RODADA · TEMA CASTIGO</span><strong>' + escapeHtml(worstItem.title) + '</strong><small>Por ' + escapeHtml(formatDisplayName(worstItem.uploader)) + ' — ' + worstItem.worstVotes + (worstItem.worstVotes === 1 ? ' voto' : ' votos') + worstTieText + '</small></div>' : '';
  const canChoose = !closed && voting.userCanVote && !voting.userHasVoted;
  if (votingDraft.votingId !== voting.id) votingDraft = { votingId: voting.id, bestId: null, worstId: null };
  $('#voteGrid').innerHTML = voting.entries.map((item) => {
    const author = closed ? '<span class="vote-author">Por ' + escapeHtml(formatDisplayName(item.uploader)) + '</span>' :
      '<span class="vote-author secret-author">🔒 Autoria secreta</span>';
    const choices = canChoose ? '<div class="vote-options">' +
      '<label class="vote-option best"><input type="radio" name="bestId" value="' + item.id + '"><span>▲ Melhor</span></label>' +
      '<label class="vote-option worst"><input type="radio" name="worstId" value="' + item.id + '"><span>▼ Pior</span></label></div>' : '';
    const results = closed ? '<div class="vote-results"><span class="vote-badge best">▲ ' + item.bestVotes + ' melhor</span>' +
      '<span class="vote-badge worst">▼ ' + item.worstVotes + ' pior</span></div>' : '';
    const highlight = closed ? (item.isBestWinner ? ' winner-best' : '') + (item.isWorstWinner ? ' winner-worst' : '') : '';
    const visual = item.imageUrl ? '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" decoding="async">' :
      '<div class="vote-secret-visual"><span>👽</span><strong>IMAGEM RESERVADA</strong></div>';
    return '<article class="vote-card' + highlight + '">' + visual +
      '<div class="vote-card-body"><strong>' + escapeHtml(item.title) + '</strong>' + author + choices + results + '</div></article>';
  }).join('');
  if (canChoose) {
    const best = votingDraft.bestId && $(`input[name="bestId"][value="${CSS.escape(votingDraft.bestId)}"]`, $('#voteGrid'));
    const worst = votingDraft.worstId && $(`input[name="worstId"][value="${CSS.escape(votingDraft.worstId)}"]`, $('#voteGrid'));
    if (best) best.checked = true;
    if (worst) worst.checked = true;
  } else votingDraft = { votingId: voting.id, bestId: null, worstId: null };
  const submit = $('#submitVoteButton');
  submit.classList.toggle('hidden', !canChoose);
  $('#closeVotingButton').classList.add('hidden');
  $('#clearFinishedRoundButton').classList.toggle('hidden', !(closed && voting.gayDrawCompleted && appState.me.role === 'admin'));
  if (closed && voting.gayDrawCompleted) $('#voteStatus').innerHTML = '<span class="voting-complete">✓ Rodada completa. Baixe a imagem marcada e depois limpe as imagens.</span>';
  else if (voting.userHasVoted) $('#voteStatus').textContent = '✓ Seu voto foi registrado. Aguardando as outras pessoas.';
  else if (!voting.userCanVote) $('#voteStatus').textContent = 'Você pode acompanhar. Somente participantes elegíveis votam.';
  else $('#voteStatus').textContent = 'Escolha uma opção como melhor e outra como pior.';
}

function renderDraws() {
  const latest = appState.draws.slice(0, 3);
  const drawLabel = (item) => item.type === 'theme' ? 'Tema da rodada' : item.type === 'gay' ? 'Gay da Rodada' : 'Wallpaper recebido: ' + (item.wallpaperTitle || item.detail || 'imagem da rodada');
  const drawType = (item) => item.type === 'theme' ? 'TEMA' : item.type === 'gay' ? 'GAY DA RODADA' : 'DISTRIBUIÇÃO';
  $('#latestDraws').classList.toggle('empty-state', !latest.length);
  $('#latestDraws').innerHTML = latest.length ? latest.map((item) =>
    '<div class="latest-item">' + (item.imageUrl ? '<img class="latest-thumb" src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="latest-thumb secret-thumb" aria-hidden="true">👽</span>') +
    '<p><strong>' + escapeHtml(item.winner) + '</strong><small>' + escapeHtml(drawLabel(item)) + '</small></p></div>'
  ).join('') : 'Ainda não houve sorteio.';

  const history = $('#historyGrid');
  history.innerHTML = appState.draws.length ? appState.draws.map((item) =>
    '<article class="history-card">' + (item.imageUrl ? '<img src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="history-secret" aria-hidden="true">👽</span>') +
    '<p><small>' + drawType(item) + '</small>' +
    '<strong>' + escapeHtml(item.type === 'wallpaper' ? (item.wallpaperTitle || item.detail || 'Wallpaper da rodada') : item.winner) + '</strong><span>' + escapeHtml(item.type === 'wallpaper' ? 'Recebido por ' + item.winner : item.detail) + ' · ' + formatDate(item.createdAt) + '</span></p></article>'
  ).join('') : '<div class="history-empty"><span aria-hidden="true">🏆</span><strong>A memória da equipe começa na primeira rodada</strong><small>Os vencedores e resultados aparecerão aqui automaticamente.</small></div>';
  $$('#latestDraws img, #historyGrid img').forEach((image) => image.addEventListener('error', () => {
    if (!image.src.endsWith('/gay-da-rodada.png')) image.src = '/gay-da-rodada.png';
  }, { once: true }));
}

function renderDailyWall(wall = {}) {
  renderCommunityFeed(wall);
  const phrases = Array.isArray(wall.phrases) ? wall.phrases : [];
  const memes = Array.isArray(wall.memes) ? wall.memes : [];
  const reactionButtons = (item, type) => `<div class="daily-reactions">${['😂','👽','🤨','💀'].map((emoji) => `<button class="${(item.reactions?.mine || []).includes(emoji) ? 'active' : ''}" type="button" data-reaction-type="${type}" data-reaction-id="${escapeHtml(item.id)}" data-reaction-emoji="${emoji}">${emoji}<b>${Number(item.reactions?.counts?.[emoji] || 0)}</b></button>`).join('')}</div>`;
  $('#dailyPhraseList').innerHTML = phrases.length ? [...phrases].reverse().map((item) =>
    `<article class="daily-phrase-item"><blockquote>${escapeHtml(item.phrase)}</blockquote>${reactionButtons(item, 'phrase')}<div><span>${item.anonymous ? '🕵️ Anônimo' : 'Por ' + visualName({ id: item.userId, displayName: item.authorName })} · ${escapeHtml(formatDate(item.createdAt))}</span>${item.canDelete ? `<button type="button" data-delete-phrase="${escapeHtml(item.id)}">Excluir</button>` : ''}</div></article>`
  ).join('') : '<p>A tripulação ainda não publicou frases hoje.</p>';
  $('#dailyPhraseCount').textContent = String($('#dailyPhraseInput').value.length);
  $('#dailyMemeCount').textContent = memes.length + (memes.length === 1 ? ' meme' : ' memes');
  const history = Array.isArray(wall.history) ? wall.history : [];
  const historyBox = $('#dailyWallHistory');
  historyBox.classList.toggle('hidden', !history.length);
  historyBox.innerHTML = history.length ? `<summary>📚 Histórico do mural <b>${history.length}</b></summary><div>${history.map((archive) => `<button type="button" data-wall-history-id="${escapeHtml(archive.id)}"><strong>${escapeHtml(formatDate(archive.closedAt))}</strong><small>${Number(archive.memeCount)} meme${Number(archive.memeCount) === 1 ? '' : 's'} · ${Number(archive.phraseCount)} frase${Number(archive.phraseCount) === 1 ? '' : 's'}</small></button>`).join('')}</div>` : '';
  $('#clearDailyMemesButton').classList.toggle('hidden', !appState || appState.me.role !== 'admin');
  const isAdmin = Boolean(appState && appState.me.role === 'admin');
  $('#dailyMemeGallery').innerHTML = memes.length ? [...memes].reverse().map((item) => {
    const author = item.anonymous ? '🕵️ Anônimo' : escapeHtml(formatDisplayName(item.authorName));
    const date = escapeHtml(formatDate(item.createdAt));
    return `<article class="daily-meme-card${Number(item.reactions?.total || 0) >= 3 ? ' popular' : ''}"><button class="daily-meme-open" type="button" data-meme-url="${escapeHtml(item.imageUrl)}" data-meme-author="${author}" data-meme-date="${date}" aria-label="Ampliar meme de ${author}"><img src="${escapeHtml(item.imageUrl)}" alt="Meme publicado por ${author}" loading="lazy" decoding="async"></button>${reactionButtons(item, 'meme')}<p><span><strong>${author}</strong><time datetime="${escapeHtml(item.createdAt)}">${date}</time></span>${isAdmin ? `<button class="daily-meme-delete" type="button" data-delete-meme="${escapeHtml(item.id)}" aria-label="Excluir meme de ${author}">Excluir</button>` : ''}</p></article>`;
  }).join('') : '<div class="daily-meme-empty"><span aria-hidden="true">🛸</span><strong>O mural está livre</strong><small>Publique o primeiro meme do dia.</small></div>';
}

function renderAnonymousWall(posts = []) {
  const items = Array.isArray(posts) ? posts : [];
  $('#anonymousPostTotal').textContent = items.length + (items.length === 1 ? ' publicação' : ' publicações');
  $('#anonymousPostList').innerHTML = items.length ? [...items].reverse().map((item, index) =>
    `<article class="anonymous-post"><div class="anonymous-post-meta"><span>ANÔNIMO #${items.length - index}</span><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}</time></div><p>${escapeHtml(item.message)}</p>${item.canDelete ? `<button type="button" data-delete-anonymous-post="${escapeHtml(item.id)}">Excluir publicação</button>` : ''}</article>`
  ).join('') : '<div class="anonymous-empty"><span aria-hidden="true">👽</span><strong>Nenhuma publicação ainda</strong><small>O primeiro recado pode ser seu — e continuará anônimo.</small></div>';
}

function customWaterStorageKey() {
  return appState && appState.me ? 'customWaterAmounts:' + appState.me.id : '';
}

function waterQuickAmounts() {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem(customWaterStorageKey()) || '[]'); } catch {}
  return [...new Set([200, 300, 500, ...custom.filter((ml) => Number.isInteger(ml) && ml >= 50 && ml <= 2000)])].slice(0, 8);
}

function renderWaterQuickActions() {
  $('.water-quick-actions').innerHTML = waterQuickAmounts().map((ml) =>
    `<span class="water-shortcut${![200, 300, 500].includes(ml) ? ' personalized' : ''}"><button type="button" data-water-ml="${ml}" title="Adicionar ${ml.toLocaleString('pt-BR')} ml">+ ${ml.toLocaleString('pt-BR')} ml${![200, 300, 500].includes(ml) ? '<small>seu atalho</small>' : ''}</button>${![200, 300, 500].includes(ml) ? `<button class="remove-water-shortcut" type="button" data-remove-water-shortcut="${ml}" title="Excluir atalho de ${ml.toLocaleString('pt-BR')} ml" aria-label="Excluir atalho de ${ml.toLocaleString('pt-BR')} ml">×</button>` : ''}</span>`
  ).join('');
}

function rememberCustomWaterAmount(ml) {
  if ([200, 300, 500].includes(ml)) return;
  const custom = waterQuickAmounts().filter((value) => ![200, 300, 500, ml].includes(value));
  localStorage.setItem(customWaterStorageKey(), JSON.stringify([ml, ...custom].slice(0, 5)));
}

function removeCustomWaterAmount(ml) {
  const custom = waterQuickAmounts().filter((value) => ![200, 300, 500, ml].includes(value));
  localStorage.setItem(customWaterStorageKey(), JSON.stringify(custom));
  renderWaterQuickActions();
}

function renderHydration(hydration = {}) {
  renderWaterQuickActions();
  const goal = Number(hydration.goalMl || 2500);
  const mine = Number(hydration.myTotalMl || 0);
  const remaining = Math.max(0, goal - mine);
  const percent = goal ? Math.min(100, Math.round(mine / goal * 100)) : 0;
  $('#myWaterTotal').textContent = mine.toLocaleString('pt-BR');
  $('#teamWaterTotal').textContent = Number(hydration.teamTotalMl || 0).toLocaleString('pt-BR');
  $('#myWaterProgress').style.width = percent + '%';
  $('#myWaterRemaining').textContent = remaining > 0
    ? 'Faltam ' + remaining.toLocaleString('pt-BR') + ' ml para sua meta de 2,5 L.'
    : '✓ Meta de 2,5 L alcançada! Continue se hidratando com equilíbrio.';
  const teamMission = hydration.teamMission || { progressMl: 0, targetMl: 18000, reward: 15 };
  const teamPercent = Math.min(100, Math.round(Number(teamMission.progressMl || 0) / Math.max(1, Number(teamMission.targetMl || 18000)) * 100));
  $('#teamMissionProgress').style.width = teamPercent + '%';
  $('#teamMissionText').textContent = teamMission.completed ? '✓ Missão concluída' : (Number(teamMission.progressMl || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' de 18 L';
  $('#teamMissionReward').textContent = teamMission.completed ? 'Recompensa entregue para todos' : '+' + Number(teamMission.reward || 15) + ' para cada pessoa';
  $('.team-mission-card').classList.toggle('completed', Boolean(teamMission.completed));
  const people = Array.isArray(hydration.people) ? hydration.people : [];
  $('#hydrationPeople').innerHTML = people.length ? people.map((person, index) => {
    const personPercent = goal ? Math.min(100, Math.round(person.totalMl / goal * 100)) : 0;
    return `<article class="hydration-person${person.isMe ? ' is-me' : ''}"><span class="hydration-position">${index + 1}</span>${personAvatar(person, 'hydration-avatar')}<div><strong>${visualName(person)}${person.isMe ? ' · você' : ''}</strong><span class="ranking-live-titles">${liveTitleChips(person.liveTitles)}</span><span><i style="width:${personPercent}%"></i></span><small>${Number(person.totalMl).toLocaleString('pt-BR')} ml · ${personPercent}% da meta</small></div></article>`;
  }).join('') : '<p class="water-empty">Nenhum participante ativo.</p>';
  const entries = Array.isArray(hydration.entries) ? hydration.entries : [];
  $('#waterEntryList').innerHTML = entries.length ? entries.map((entry) =>
    `<article class="water-entry"><span aria-hidden="true">💧</span><p><strong>${escapeHtml(formatDisplayName(entry.displayName))}</strong><small>${escapeHtml(formatDate(entry.createdAt))}</small></p><b>+ ${Number(entry.ml).toLocaleString('pt-BR')} ml</b>${entry.canDelete ? `<button type="button" data-delete-water="${escapeHtml(entry.id)}">Desfazer</button>` : ''}</article>`
  ).join('') : '<p class="water-empty">Ninguém registrou água hoje.</p>';
  maybeShowWaterReminder(hydration);
}

function renderSeason(season = {}) {
  const current = season.current || { ranking: [], monthKey: '' };
  const passTitle = $('#seasonPassTitle'), passUntil = $('#seasonPassUntil');
  if (passTitle) passTitle.textContent = current.name || 'Temporada atual';
  if (passUntil) passUntil.textContent = current.endsAt ? 'Vai até ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(current.endsAt)) + '. Pontos vêm de água, mural, vitórias e participação.' : 'Aguardando definição da temporada.';
  $('#seasonTitle').textContent = current.name || 'Tripulação em destaque';
  $('#seasonMonth').textContent = current.monthKey ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(current.monthKey + '-15T12:00:00-03:00')) : '';
  clearInterval(seasonCountdownTimer);
  const updateSeasonClock = () => {
    const remaining = Math.max(0, Date.parse(current.endsAt || '') - (Date.now() + serverClockOffset));
    const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining % 86400000 / 3600000), minutes = Math.floor(remaining % 3600000 / 60000);
    $('#seasonCountdown').textContent = remaining ? `${days}d ${hours}h ${minutes}min` : 'Nova temporada iniciando';
    $('#nextSeasonDate').textContent = current.endsAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(current.endsAt)) : '—';
  };
  updateSeasonClock(); seasonCountdownTimer = setInterval(updateSeasonClock, 60000);
  $('#seasonRanking').innerHTML = current.ranking.length ? current.ranking.map((person, index) => `<article${index === 0 && person.points > 0 ? ' class="leader"' : ''}><b>${index + 1}</b>${personAvatar(person, 'season-avatar')}<p><strong>${visualName(person)}</strong><small>${person.water.toLocaleString('pt-BR')} ml · ${person.memes} memes · ${person.phrases} frases</small></p><em>${person.points} pts</em></article>`).join('') : '<p class="season-empty">A temporada começa com a primeira atividade do mês.</p>';
  const previous = season.previous;
  $('#previousSeasonWinner').textContent = previous?.leader ? '🏅 Campeão de ' + (previous.name || previous.monthKey) + ': ' + formatDisplayName(previous.leader.displayName) : 'A temporada anterior ainda não teve pontuação.';
  const challenges = Array.isArray(season.challenges) ? season.challenges : [];
  const box = $('#seasonChallenges');
  if (!box) return;
  box.innerHTML = challenges.length ? challenges.map((challenge) => {
    const teamPercent = Math.min(100, Math.round(Number(challenge.progress || 0) / Math.max(1, Number(challenge.target || 1)) * 100));
    const personalPercent = Math.min(100, Math.round(Number(challenge.personalProgress || 0) / Math.max(1, Number(challenge.personalTarget || 1)) * 100));
    const number = (value) => Number(value || 0).toLocaleString('pt-BR');
    const teamText = number(challenge.progress) + ' de ' + number(challenge.target) + ' ' + challenge.unit;
    const personalText = number(challenge.personalProgress) + ' de ' + number(challenge.personalTarget) + ' ' + challenge.unit;
    const status = challenge.rewarded ? '✓ Recompensa recebida' : challenge.teamCompleted && challenge.eligible ? '✓ Recompensa liberada' : !challenge.teamCompleted ? 'A equipe ainda precisa avançar' : 'Faça sua parte para liberar';
    return `<article class="season-challenge${challenge.rewarded ? ' rewarded' : ''}${challenge.teamCompleted ? ' team-done' : ''}"><span class="season-challenge-icon">${challenge.icon}</span><div class="season-challenge-content"><header><p><strong>${escapeHtml(challenge.title)}</strong><small>${escapeHtml(challenge.description)}</small></p><b>+${Number(challenge.reward || 0)} créditos</b></header><div class="season-challenge-progress"><span>Equipe <em>${teamText}</em></span><i><b style="width:${teamPercent}%"></b></i></div><div class="season-challenge-progress personal"><span>Sua parte <em>${personalText}</em></span><i><b style="width:${personalPercent}%"></b></i></div><footer>${escapeHtml(status)}</footer></div></article>`;
  }).join('') : '<p class="season-empty">Os desafios mensais estarão disponíveis no próximo carregamento.</p>';
}

function mysteryStartCard() {
  const people = Array.isArray(appState?.powerParticipants) ? appState.powerParticipants : [];
  return `<article class="card mystery-start-card"><span>🕯️</span><div><small>CONVIDAR LEITOR</small><h3>Abra um Mistério 51</h3><p>Escolha quem será o leitor. Só ele escreve o enigma e a solução — assim você também pode investigar.</p></div><form id="mysteryStartForm"><label>Leitor responsável<select name="readerUserId" required>${people.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(formatDisplayName(person.displayName))}</option>`).join('')}</select></label><button class="button button-primary" type="submit">Convidar leitor</button></form></article>`;
}

function renderImpostor(impostor={}){const host=$('#impostorBoard');if(!host)return;const game=impostor.active;if(!game){const code=new URLSearchParams(location.search).get('sala')||'';host.innerHTML='<article class="card impostor-empty"><span>🕵️</span><h3>Nenhuma sala aberta</h3><p>Crie uma sala e compartilhe o código com a tripulação.</p><button class="button button-primary" data-impostor-action="create" type="button">Criar sala Impostor</button><form data-impostor-join><label>Tenho um código<input name="code" maxlength="5" value="'+escapeHtml(code)+'" placeholder="Ex.: A51X9" required></label><button type="submit">Entrar na sala</button></form></article>';return;}const players=game.players.map(p=>'<li>'+escapeHtml(p.name)+(p.isMe?' · você':'')+'</li>').join('');let body='';if(game.status==='lobby'){const link=location.origin+'/?pagina=impostor&sala='+encodeURIComponent(game.code);body='<p class="impostor-code">CÓDIGO DA SALA <strong>'+escapeHtml(game.code)+'</strong></p><button class="impostor-copy" type="button" data-impostor-copy="'+escapeHtml(link)+'">Copiar link da sala</button><p>Envie o link ou código para todos entrarem. '+game.players.length+'/3 jogadores mínimos.</p><ul>'+players+'</ul>'+(game.canStart?'<button class="button button-primary" data-impostor-action="start">Iniciar partida</button>':game.canJoin?'<form data-impostor-join><label>Código da sala<input name="code" value="'+escapeHtml(game.code)+'" required></label><button type="submit">Entrar nesta sala</button></form>':'<p>Aguardando o criador iniciar.</p>')+(game.canLeave?'<button class="button button-dark" data-impostor-action="leave">Sair da sala</button>':'')+(game.canCancel?'<button class="button button-dark" data-impostor-action="cancel">Cancelar sala</button>':'');}else if(game.status==='tips'){body='<div class="impostor-word">Sua palavra secreta <strong>'+escapeHtml(game.ownWord||'Aguardando entrada')+'</strong><small>Não revele diretamente.</small></div><h3>Dicas</h3><div class="impostor-tips">'+game.tips.map(t=>'<p><b>'+escapeHtml(t.authorName)+':</b> '+escapeHtml(t.text)+'</p>').join('')+'</div>'+(game.canTip?'<form data-impostor-tip><label>Sua dica<input name="text" maxlength="80" required placeholder="Uma palavra ou frase curta"></label><button class="button button-primary" type="submit">Enviar dica</button></form>':'<p class="impostor-turn">Vez de <strong>'+escapeHtml(game.currentTurn?.name||'…')+'</strong> dar a dica.</p>');}else if(game.status==='voting'){body='<div class="impostor-word">Sua palavra <strong>'+escapeHtml(game.ownWord||'')+'</strong></div><h3>Quem é o impostor?</h3>'+(game.canVote?'<form data-impostor-vote><div class="impostor-vote-list">'+game.players.filter(p=>!p.isMe).map(p=>'<label><input type="radio" name="targetId" value="'+escapeHtml(p.id)+'" required> '+escapeHtml(p.name)+'</label>').join('')+'</div><button class="button button-primary" type="submit">Confirmar voto</button></form>':'<p class="impostor-turn">Voto registrado. Aguardando os demais.</p>');}else {const r=game.result;body='<div class="impostor-result '+(r.winner==='tripulação'?'crew':'imp')+'"><h3>'+ (r.winner==='tripulação'?'Tripulação venceu!':'O impostor escapou!')+'</h3><p>Impostor: <strong>'+escapeHtml(r.impostorName)+'</strong></p><p>Palavra da tripulação: <b>'+escapeHtml(r.normalWord)+'</b> · Palavra do impostor: <b>'+escapeHtml(r.impostorWord)+'</b></p></div><div class="impostor-tips">'+r.votes.map(v=>'<p>'+escapeHtml(v.voterName)+' votou em '+escapeHtml(v.targetName)+'</p>').join('')+'</div>'+(game.hostId===appState.me.id?'<button class="button button-primary" data-impostor-action="replay">Jogar novamente</button>':'<p>Aguardando o criador abrir a próxima rodada.</p>')+(game.canEnd?'<button class="button button-dark" data-impostor-action="end">Encerrar sala</button>':'');}host.innerHTML='<article class="card impostor-game"><header><span>🕵️</span><div><small>SALA '+escapeHtml(game.code)+'</small><h3>Impostor 51</h3><p>Criada por '+escapeHtml(game.hostName)+'</p></div><b>'+game.players.length+' jogadores</b></header>'+body+'</article>';}
$('#impostorBoard')?.addEventListener('click',async e=>{const copy=e.target.closest('[data-impostor-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.impostorCopy);showToast('Link da sala copiado.');}catch{showToast('Copie o código da sala manualmente.','error');}return;}const btn=e.target.closest('[data-impostor-action]');if(!btn)return;btn.disabled=true;try{applyState(await api('/api/impostor/'+btn.dataset.impostorAction,{method:'POST'}));showToast(btn.dataset.impostorAction==='create'?'Sala criada. Compartilhe o código!':'Partida atualizada.');}catch(err){showToast(err.message,'error');}finally{btn.disabled=false;}});
$('#impostorBoard')?.addEventListener('submit',async e=>{const form=e.target;e.preventDefault();let url='',body={};if(form.matches('[data-impostor-join]')){url='/api/impostor/join';body={code:form.elements.code.value};}else if(form.matches('[data-impostor-tip]')){url='/api/impostor/tip';body={text:form.elements.text.value};}else if(form.matches('[data-impostor-vote]')){url='/api/impostor/vote';body={targetId:new FormData(form).get('targetId')};}else return;setBusy(form,true);try{applyState(await api(url,{method:'POST',body}));}catch(err){showToast(err.message,'error');}finally{setBusy(form,false);}});

function showImpostorVotingTips(impostor={}){const game=impostor.active,host=$('#impostorBoard');if(!host||game?.status!=='voting'||host.querySelector('.impostor-tips-voting'))return;const title=[...host.querySelectorAll('h3')].find(item=>item.textContent.includes('Quem é o impostor'));if(!title)return;title.insertAdjacentHTML('beforebegin','<h3>Relembre as dicas</h3><div class="impostor-tips impostor-tips-voting">'+(game.tips||[]).map(t=>'<p><b>'+escapeHtml(t.authorName)+':</b> '+escapeHtml(t.text)+'</p>').join('')+'</div>');}
function showImpostorRoundNotice(impostor={}){const game=impostor.active,host=$('#impostorBoard');if(!host||game?.status!=='tips'||host.querySelector('.impostor-round-notice'))return;const round=Math.min(2,Math.floor((game.tips||[]).length/Math.max(1,(game.players||[]).length))+1);const title=[...host.querySelectorAll('h3')].find(item=>item.textContent==='Dicas');if(title)title.insertAdjacentHTML('beforebegin','<p class="impostor-round-notice">RODADA DE DICAS '+round+' DE 2</p>');}
function showImpostorAdminEnd(impostor={}){const game=impostor.active,host=$('#impostorBoard');if(!host||!game?.canEnd||host.querySelector('[data-impostor-action="end"]'))return;host.querySelector('.impostor-game')?.insertAdjacentHTML('beforeend','<button class="button button-dark impostor-admin-end" type="button" data-impostor-action="end">Encerrar sala (admin)</button>');}

function renderMystery(mystery = {}) {
  queueMicrotask(() => { showImpostorVotingTips(appState?.impostor); showImpostorRoundNotice(appState?.impostor); showImpostorAdminEnd(appState?.impostor); });
  const board = $('#mysteryBoard');
  if (!board) return;
  const active = mystery.active;
  if (!active) {
    board.innerHTML = mystery.canStart ? mysteryStartCard() : '<article class="card mystery-empty"><span>🕯️</span><h3>Nenhum mistério aberto</h3><p>O administrador poderá escolher o leitor e abrir o próximo enigma.</p></article>';
    return;
  }
  if (active.isDraft) {
    if (mystery.canSetup) return `<article class="card mystery-start-card mystery-reader-setup"><span>🔐</span><div><small>VOCÊ É O LEITOR</small><h3>Prepare seu Mistério 51</h3><p>O enigma e a solução ficarão secretos. O administrador e a equipe só verão a história depois de você abrir a investigação.</p></div><form id="mysterySetupForm"><label>Título do mistério<input name="title" maxlength="70" placeholder="Ex.: O último café da estação" required></label><label>Enigma para a tripulação<textarea name="premise" maxlength="900" rows="4" placeholder="Conte a situação estranha sem revelar a resposta." required></textarea></label><label>Solução secreta<textarea name="solution" maxlength="1800" rows="4" placeholder="A explicação completa que apenas você verá até encerrar." required></textarea></label><button class="button button-primary" type="submit">Abrir investigação</button></form></article>`;
    return `<article class="card mystery-empty"><span>🕯️</span><h3>Leitor preparando o mistério</h3><p>${escapeHtml(formatDisplayName(active.readerName))} foi escolhido e abrirá a investigação quando o enigma estiver pronto.</p>${mystery.canDelete ? '<button id="deleteMysteryButton" class="mystery-delete-button" type="button">Cancelar convite</button>' : ''}</article>`;
  }
  const status = active.status === 'open' ? 'EM INVESTIGAÇÃO' : 'MISTÉRIO ENCERRADO';
  const solution = active.solution ? `<details class="mystery-solution"${active.status === 'closed' ? ' open' : ''}><summary>${active.status === 'closed' ? 'Ver solução revelada' : 'Gabarito do leitor'}</summary><p>${escapeHtml(active.solution)}</p></details>` : '';
  const reader = personAvatar({ id: active.readerId, displayName: active.readerName }, 'mystery-reader-avatar');
  const askForm = mystery.canAsk ? `<section class="mystery-investigator-tools"><form id="mysteryQuestionForm" class="mystery-question-form"><label for="mysteryQuestionInput">Sua pergunta para ${escapeHtml(formatDisplayName(active.readerName))}</label><div><input id="mysteryQuestionInput" name="text" maxlength="300" placeholder="Faça uma pergunta que possa ser respondida com sim, não ou irrelevante." required><button class="button button-primary" type="submit">Enviar pergunta</button></div></form><form id="mysteryGuessForm" class="mystery-guess-form"><label for="mysteryGuessInput">Acha que resolveu? Envie seu palpite</label><textarea id="mysteryGuessInput" name="text" maxlength="900" rows="2" placeholder="Explique a história como você entende. O leitor indica o quanto você se aproximou."></textarea><button type="submit">Enviar palpite</button></form></section>` : active.status === 'open' ? '<section class="mystery-reader-note"><p>Você é o leitor responsável. Responda as perguntas pendentes abaixo.</p><form id="mysteryAnsweredQuestionForm" class="mystery-manual-answer"><input name="text" maxlength="300" placeholder="Adicionar pergunta já respondida"><select name="answer"><option value="sim">SIM</option><option value="nao">NÃO</option><option value="irrelevante">IRRELEVANTE</option></select><button type="submit">Adicionar</button></form></section>' : '';
  const questions = Array.isArray(active.questions) ? active.questions : [];
  const cards = questions.length ? questions.map((question) => `<article class="mystery-question${question.answer ? ' answered answer-' + question.answer : ' pending'}"><header><span>${question.answer ? question.answerLabel : 'AGUARDANDO'}</span><small>${personAvatar(question, 'mystery-question-avatar')}${escapeHtml(formatDisplayName(question.authorName))} · ${escapeHtml(formatDate(question.createdAt))}</small></header><p>${escapeHtml(question.text)}</p>${question.answer ? `<footer>Respondida ${escapeHtml(formatDate(question.answeredAt || question.createdAt))}</footer>` : mystery.canManage && active.status === 'open' ? `<footer class="mystery-answer-actions"><button type="button" data-mystery-answer="sim" data-mystery-question="${escapeHtml(question.id)}">SIM</button><button type="button" data-mystery-answer="nao" data-mystery-question="${escapeHtml(question.id)}">NÃO</button><button type="button" data-mystery-answer="irrelevante" data-mystery-question="${escapeHtml(question.id)}">IRRELEVANTE</button></footer>` : question.authorId === appState.me.id ? `<footer><button type="button" class="mystery-cancel-question" data-mystery-cancel="${escapeHtml(question.id)}">Cancelar pergunta</button></footer>` : '<footer>O leitor está avaliando esta pergunta.</footer>'}</article>`).join('') : '<p class="mystery-no-questions">Ainda não há perguntas. Comecem a investigação.</p>';
  const guesses = (active.guesses || []).length ? `<section class="mystery-guess-list"><h3>Palpites da tripulação</h3>${active.guesses.map((guess) => `<article class="mystery-guess"><header>${personAvatar(guess, 'mystery-question-avatar')}<strong>${escapeHtml(formatDisplayName(guess.authorName))}</strong>${guess.similarity !== null ? `<b>${guess.similarity}% próximo</b>` : '<b>aguardando leitor</b>'}</header><p>${escapeHtml(guess.text)}</p>${guess.reveal ? `<footer>🔎 Pista do leitor: ${escapeHtml(guess.reveal)}</footer>` : ''}${mystery.canManage && active.status === 'open' ? `<form data-mystery-guess-review="${escapeHtml(guess.id)}"><input name="similarity" type="number" min="0" max="100" value="${guess.similarity ?? ''}" placeholder="%"><input name="reveal" maxlength="500" value="${escapeHtml(guess.reveal || '')}" placeholder="Pista opcional"><button type="submit">Avaliar</button></form>` : ''}</article>`).join('')}</section>` : '';
  board.innerHTML = `<article class="card mystery-case-card"><header><div><small>${status}</small><h3>${escapeHtml(active.title)}</h3><p>${reader} Leitor responsável: <strong>${escapeHtml(formatDisplayName(active.readerName))}</strong></p></div><b>${Number(active.questionCount || 0)} perguntas</b></header><blockquote>${escapeHtml(active.premise)}</blockquote>${solution}${mystery.canManage && active.status === 'open' ? '<button id="closeMysteryButton" class="button button-dark" type="button">Encerrar e revelar solução</button>' : ''}${mystery.canDelete ? '<button id="deleteMysteryButton" class="mystery-delete-button" type="button">Apagar este mistério</button>' : ''}</article>${askForm}<section class="mystery-question-grid" aria-label="Perguntas e respostas do mistério">${cards}</section>${guesses}${mystery.canClear ? '<button id="clearMysteryHistoryButton" class="mystery-clear-button" type="button">Limpar mistérios encerrados</button>' : ''}${mystery.canStart ? mysteryStartCard() : ''}`;
}

function lieAttribution(entry) {
  return '<span class="lie-attribution"><span>Registrada por <b>' + escapeHtml(entry.createdBy || 'Não registrado') + '</b></span><span>Aprovada por <b>' + escapeHtml(entry.validatedBy || 'Não registrado') + '</b></span></span>';
}

function renderLieMeter(lieMeter = {}) {
  const ranking = Array.isArray(lieMeter.ranking) ? lieMeter.ranking : [];
  const pending = Array.isArray(lieMeter.pending) ? lieMeter.pending : [];
  $('#lieRanking').innerHTML = ranking.length ? ranking.map((person, index) => {
    const reasons = Array.isArray(person.reasons) ? person.reasons : [];
    const history = reasons.length ? `<details class="lie-history"><summary>Ver histórico dos motivos <b>${reasons.length}</b></summary><div>${reasons.map((entry, reasonIndex) => `<article${reasonIndex === 0 ? ' class="latest"' : ''}><span>🤥</span><p><strong>${escapeHtml(entry.reason)}</strong><small>${escapeHtml(formatDate(entry.createdAt))}</small>${lieAttribution(entry)}</p></article>`).join('')}</div></details>` : '';
    return `<article class="lie-person${index === 0 && person.total > 0 ? ' lie-leader' : ''}"><span class="lie-position">${index + 1}</span>${personAvatar(person, 'lie-avatar')}<div class="lie-person-copy"><strong>${visualName(person)}${person.id === appState.me.id ? ' · você' : ''}</strong><span class="ranking-live-titles">${liveTitleChips(person.liveTitles)}</span><small>${Number(person.total)} ${Number(person.total) === 1 ? 'mentira confirmada' : 'mentiras confirmadas'}</small>${person.latestReason ? `<em class="lie-reason"><span>ÚLTIMA MENTIRA</span>“${escapeHtml(person.latestReason)}”</em>${reasons[0] ? lieAttribution(reasons[0]) : ''}` : ''}${history}</div><b>${Number(person.total)}</b><div class="lie-actions"><button type="button" data-lie-delta="-1" data-lie-target="${escapeHtml(person.id)}" aria-label="Solicitar remoção de uma mentira de ${escapeHtml(formatDisplayName(person.displayName))}"${person.id === appState.me.id || person.total <= 0 ? ' disabled' : ''}>−</button><button type="button" data-lie-delta="1" data-lie-target="${escapeHtml(person.id)}" aria-label="Marcar uma mentira para ${escapeHtml(formatDisplayName(person.displayName))}"${person.id === appState.me.id ? ' disabled' : ''}>+</button></div></article>`;
  }).join('') : '<p class="lie-empty">Nenhuma pessoa disponível.</p>';
  $('#liePendingCount').textContent = pending.length + (pending.length === 1 ? ' pendente' : ' pendentes');
  const pendingList = $('#liePendingList');
  pendingList.classList.toggle('lie-pending-scroll', pending.length > 3);
  pendingList.innerHTML = pending.length ? pending.map((item) => {
    const total = Math.max(1, Number(item.totalVoters || 0)); const received = Number(item.receivedVotes || 0);
    const voterCard = (voter) => {
      const voterPerson = { id: voter.id, displayName: voter.name };
      const voteLabel = voter.vote === 'lie' ? 'Mentiu' : voter.vote === 'truth' ? 'Não mentiu' : 'Aguardando';
      const voteIcon = voter.vote === 'lie' ? '✓' : voter.vote === 'truth' ? '✓' : '…';
      return `<span class="lie-voter ${voter.vote || 'waiting'}">${personAvatar(voterPerson, 'lie-voter-avatar')}<span><em>${escapeHtml(formatDisplayName(voter.name))}</em><i><b>${voteIcon}</b>${voteLabel}</i></span></span>`;
    };
    const voted = (item.voters || []).filter((voter) => voter.vote).map(voterCard).join('');
    const waiting = (item.voters || []).filter((voter) => !voter.vote).map(voterCard).join('');
    const voterGroups = `<div class="lie-voter-groups">${voted ? `<section><strong class="lie-voter-group-title voted">✓ Já votaram <b>${received}</b></strong><div class="lie-voters">${voted}</div></section>` : ''}${waiting ? `<section><strong class="lie-voter-group-title waiting">⌛ Aguardando <b>${Math.max(0, total - received)}</b></strong><div class="lie-voters">${waiting}</div></section>` : ''}</div>`;
    return `<article class="lie-pending"><div class="lie-pending-heading"><span>🗳️</span><div><strong>Votação coletiva: ${escapeHtml(formatDisplayName(item.targetName))} mentiu?</strong><small>Registrada por ${escapeHtml(formatDisplayName(item.creatorName))}</small></div></div><div class="lie-pending-copy"><p>${item.reason ? `<em class="lie-reason">“${escapeHtml(item.reason)}”</em>` : ''}</p><div class="lie-vote-progress"><span><b style="width:${Math.round(received / total * 100)}%"></b></span><strong>${received} de ${total} votaram</strong><em>Mentiu ${Number(item.lieVotes || 0)} · Não mentiu ${Number(item.truthVotes || 0)}</em></div>${voterGroups}</div><div class="lie-pending-actions">${item.canVote ? `<small>Sua escolha: <b>${item.myVote === 'lie' ? 'Mentiu' : item.myVote === 'truth' ? 'Não mentiu' : 'pendente'}</b></small><button class="lie-validate" type="button" data-lie-vote="lie" data-lie-vote-id="${escapeHtml(item.id)}">Mentiu</button><button class="lie-deny" type="button" data-lie-vote="truth" data-lie-vote-id="${escapeHtml(item.id)}">Não mentiu</button>` : '<small>Você não participa desta votação</small>'}${item.canCancel ? `<button class="lie-cancel" type="button" data-lie-cancel="${escapeHtml(item.id)}">Cancelar</button>` : ''}</div></article>`;
  }).join('') : '<p class="lie-empty">Nenhuma votação de mentira aguardando a equipe.</p>';
  const voteHistory = Array.isArray(lieMeter.history) ? lieMeter.history : [];
  $('#lieVoteHistory').innerHTML = voteHistory.length ? `<details><summary>Histórico das votações <b>${voteHistory.length}</b></summary><div class="lie-vote-history-list">${voteHistory.map((item) => {
    const resultLabel = item.outcome === 'lie' ? 'Resultado: mentiu' : 'Resultado: não mentiu';
    const voters = (item.voters || []).map((voter) => `<span class="lie-voter ${voter.vote}">${personAvatar({ id: voter.id, displayName: voter.name }, 'lie-voter-avatar')}<span><em>${escapeHtml(formatDisplayName(voter.name))}</em><i><b>✓</b>${voter.vote === 'lie' ? 'Mentiu' : 'Não mentiu'}</i></span></span>`).join('');
    return `<article class="lie-vote-history-item ${item.outcome}"><header><div><strong>${escapeHtml(formatDisplayName(item.targetName))}</strong><small>Registrada por ${escapeHtml(formatDisplayName(item.creatorName))} · ${escapeHtml(formatDate(item.resolvedAt))}</small></div><b>${resultLabel}</b></header>${item.reason ? `<p>“${escapeHtml(item.reason)}”</p>` : ''}<div class="lie-vote-history-score"><span>Mentiu <b>${Number(item.lieVotes || 0)}</b></span><span>Não mentiu <b>${Number(item.truthVotes || 0)}</b></span></div><div class="lie-voters">${voters}</div></article>`;
  }).join('')}</div></details>` : '';
  const disputes = Array.isArray(lieMeter.disputes) ? lieMeter.disputes : [];
  const disputeBox = $('#lieDisputes');
  disputeBox.classList.toggle('hidden', !disputes.length);
  disputeBox.innerHTML = disputes.map((dispute) => {
    const resolved = dispute.status !== 'open';
    const participantMarkup = dispute.participants.map((person) => `<span class="lie-dispute-person${person.decision ? ' decided' : ''}">${escapeHtml(formatDisplayName(person.name))}<b>${escapeHtml(person.decisionLabel || 'aguardando')}</b></span>`).join('');
    const messages = dispute.messages.map((message) => `<p class="lie-dispute-message${message.system ? ' system' : ''}"><strong>${escapeHtml(formatDisplayName(message.authorName || 'Sistema'))}</strong><span>${escapeHtml(message.text)}</span></p>`).join('');
    const decisionControls = dispute.canParticipate ? `<div class="lie-dispute-decisions"><small>Sua decisão: <b>${escapeHtml(({truth:'Verdade',lie:'Mentira',withdraw:'Desistir'})[dispute.myDecision] || 'não escolhida')}</b></small><button type="button" data-lie-dispute-decision="truth" data-lie-dispute-id="${escapeHtml(dispute.id)}">Verdade</button><button type="button" data-lie-dispute-decision="lie" data-lie-dispute-id="${escapeHtml(dispute.id)}">Mentira</button><button type="button" data-lie-dispute-decision="withdraw" data-lie-dispute-id="${escapeHtml(dispute.id)}">Desistir</button></div><form class="lie-dispute-form" data-lie-dispute-message="${escapeHtml(dispute.id)}"><input maxlength="400" required placeholder="Escreva para as três pessoas envolvidas…"><button class="button" type="submit">Enviar</button></form>` : `<small class="lie-dispute-resolved">${resolved ? 'Discussão encerrada: ' + escapeHtml(({truth:'Verdade: mentira removida do placar.',lie:'Mentira: registro mantido.',withdraw:'Desistência: placar mantido.'})[dispute.outcome] || 'sem alteração.') : 'Apenas as três pessoas responsáveis participam da decisão.'}</small>`;
    return `<section id="lie-dispute-${escapeHtml(dispute.id)}" class="lie-dispute${resolved ? ' resolved' : ''}"><header><div><small>REVISÃO POR CONSENSO</small><h3>Mentira de ${escapeHtml(formatDisplayName(dispute.targetName))}</h3><p>Denúncia: “${escapeHtml(dispute.reportReason)}”</p></div><span>${resolved ? 'Encerrada' : 'Em discussão'}</span></header><p class="lie-dispute-original">Registro contestado: “${escapeHtml(dispute.lieReason)}”</p><div class="lie-dispute-people">${participantMarkup}</div><div class="lie-dispute-chat">${messages}</div>${decisionControls}</section>`;
  }).join('');
}

function maybeShowWaterReminder(hydration) {
  if (!appState || !hydration || Number(hydration.myTotalMl || 0) >= Number(hydration.goalMl || 2500)) return;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  if (hour < 10 || hour >= 22) return;
  const ownEntries = (hydration.entries || []).filter((entry) => entry.isMine);
  const lastEntry = ownEntries[0];
  const hoursWithoutWater = lastEntry ? (Date.now() - Date.parse(lastEntry.createdAt)) / 3600000 : Infinity;
  if (hoursWithoutWater < 2) return;
  const reminderKey = hydration.dayKey + ':' + Math.floor(Date.now() / 7200000);
  const storageKey = 'waterReminder:' + appState.me.id;
  if (localStorage.getItem(storageKey) === reminderKey || $('#waterReminderDialog').open) return;
  localStorage.setItem(storageKey, reminderKey);
  $('#waterReminderText').textContent = lastEntry
    ? 'Já passaram mais de duas horas desde seu último registro. Que tal beber um copo agora?'
    : 'O dia está passando e você ainda não registrou água. Vamos começar com um copo?';
  $('#waterReminderDialog').showModal();
}

function shopVisualPreview(item) {
  if (item.consumable) return '';
  const previewName = escapeHtml(formatDisplayName(appState?.me?.displayName || 'Seu nome'));
  if (item.type === 'cursorStyle') {
    const cursorEffectPreview = (source, alt, name, effect) => `<div class="shop-visual-preview cursor-preview cursor-preview-effect"><small>PRÉVIA DO CURSOR · TESTE COM EFEITO</small><span><img src="${source}" alt="${alt}"><b>${name}</b><em>${effect}</em></span></div>`;
    if (['crystal','solar','ufo','wand','comet-tail','thunder','gta-neon','cobblemon','wolverine','samurai','god-war'].includes(item.value)) return `<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR · TESTE COM EFEITO</small><span><img src="/cursor-${item.value}.svg" alt="${escapeHtml(item.name)}"><b>${escapeHtml(item.name)}</b></span></div>`;
    if (item.value === 'unicorn') return '<div class="shop-visual-preview cursor-preview cursor-preview-unicorn"><small>PRÉVIA DO CURSOR</small><span><img src="/unicorn-cursor-full-v2.png" alt="Unicórnio completo"> <b>Galopa ao movimentar</b></span></div>';
    if (item.value === 'dipirona') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-dipirona.svg" alt="Seta Dipirona"><b>Seta Dipirona</b></span></div>';
    if (item.value === 'pirokinha-cosmica') return cursorEffectPreview('/cursor-pirokinha-cosmica.svg', 'Pirokinha Cósmica', 'Pirokinha Cósmica', 'TOMA LEITADA');
    if (item.value === 'anvisa') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-anvisa.svg" alt="Seta Anvisa Intergaláctica"><b>Seta Anvisa Intergaláctica</b></span></div>';
    if (item.value === 'gay') return cursorEffectPreview('/cursor-gay-power.svg', 'Seta Gay Arco-íris', 'Seta Gay Arco-íris', '🌈 EU SOU FOFO, QUERO CARINHO E CONFUSÃO');
    if (item.value === 'commander') return '<div class="shop-visual-preview cursor-preview cursor-preview-commander"><small>ITEM DE COMANDO · EXCLUSIVO ADMIN</small><span><img src="/cursor-commander.svg" alt="Cursor Comandante da Área 51"><b>Cursor Comandante da Área 51</b></span></div>';
    if (item.value === 'galinha-preta') return cursorEffectPreview('/cursor-galinha-preta.svg', 'Seta Galinha Preta', 'Seta Galinha Preta', 'COCORICÓ!');
    if (item.value === 'volei') return cursorEffectPreview('/cursor-volei.svg', 'Seta Bola de Vôlei', 'Seta Bola de Vôlei', 'GIBA NELES!');
    if (item.value === 'biblia') return cursorEffectPreview('/cursor-biblia.svg', 'Seta Bíblia', 'Seta Bíblia Sagrada', 'AMÉM!');
    if (item.value === 'papa-bento') return cursorEffectPreview('/cursor-papa-bento.svg', 'Cursor Papa Bento', 'Cursor Papa Bento', 'EM NOME DO PAI · DO FILHO · E DO ESPÍRITO SANTO');
    if (item.value === 'scrum-master') return cursorEffectPreview('/cursor-scrum-master.svg?v=2', 'Seta Scrum Master', 'Seta Planilha Scrum', '✓ PLANILHA');
    if (item.value === 'energetico') return cursorEffectPreview('/cursor-energetico.svg?v=2', 'Seta Energético', 'Latinha Energética', '⚡ ENERGIA');
    if (item.value === 'laser') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-laser.svg" alt="Cursor Laser Alienígena"><b>Laser Alienígena</b></span></div>';
    if (item.value === 'rocket') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-rocket.svg" alt="Cursor Foguete 51"><b>Foguete 51</b></span></div>';
    if (item.value === 'alien') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-alien.svg" alt="Cursor Agente ET"><b>Agente ET</b></span></div>';
    if (item.value === 'petista') return cursorEffectPreview('/cursor-petista.svg', 'Seta Lula', 'Seta Lula', '🥩 TOMA PICANHA!');
    if (item.value === 'bolsonaro') return cursorEffectPreview('/cursor-bolsonaro.svg', 'Seta Bolsonaro', 'Seta Bolsonaro', '💥 TEY TEY TEY!');
    if (item.value === 'umbanda') return cursorEffectPreview('/cursor-umbanda.svg', 'Seta Muito Axé', 'Seta Muito Axé', '🕊️ A POMBA GIRA, A POMBA GIRA!');
    if (['messi', 'cristiano', 'pele', 'maradona', 'neymar'].includes(item.value)) {
      const phrases = { messi: 'HIJO DA PUTA', cristiano: 'SIUUUUUUUU', pele: 'NÃO, O JÔ SOARES SUA FDP', maradona: 'QUIERO PÓ · RASTRO BRANCO', neymar: 'CAIU, FALTA NELE' };
      return `<div class="shop-visual-preview cursor-preview cursor-preview-football"><small>PRÉVIA DO CURSOR · TESTE COM EFEITO</small><span><img src="/cursor-${escapeHtml(item.value)}.svg" alt="${escapeHtml(item.name)}"><b>${escapeHtml(item.name)}</b><em>${escapeHtml(phrases[item.value])}</em></span></div>`;
    }
    return '<div class="shop-visual-preview cursor-preview cursor-preview-horn"><small>PRÉVIA DO CURSOR</small><span><img src="/unicorn-arrow-cursor.png" alt="Seta de mouse arco-íris em formato de chifre"> <b>Seta Unicórnio</b></span></div>';
  }
  if (item.type === 'trailStyle') return `<div class="shop-visual-preview trail-preview trail-preview-${escapeHtml(item.value)}"><small>PRÉVIA DO RASTRO</small><span><i></i><b>${item.value === 'fruit' ? '🍉 🍊 🍓' : '🦄'}</b></span></div>`;
  if (item.type === 'siteTheme') { const accents={ 'gta-neon':'🌴  NEON VICE  ·  ✦  ÁREA 51', cobblemon:'⛏️  MUNDO EM BLOCOS  ·  🐾', wolverine:'╲╲╲  MODO SELVAGEM  ·  ✦', samurai:'⛩️  NÉVOA DE YŌTEI  ·  🌸', 'god-war':'ᚱ  NORTE ANTIGO  ·  🪓' }; return `<div class="shop-visual-preview theme-preview theme-preview-${escapeHtml(item.value)}"><small>PRÉVIA DO TEMA PREMIUM</small><span>${accents[item.value] || '✦  ÁREA 51  ·  ✧  ·  ✦'}</span></div>`; }
  if (item.type === 'frame') return `<div class="shop-visual-preview frame-preview frame-${escapeHtml(item.value)}"><small>PRÉVIA EXATA · PERFIL, TOPO E MENU</small><span><b>${escapeHtml(initials(appState?.me?.displayName || 'SN'))}</b><em>${previewName}</em></span></div>`;
  if (item.type === 'nameStyle') return `<div class="shop-visual-preview name-preview"><small>PRÉVIA DO NOME</small><strong class="name-style-${escapeHtml(item.value)}">${previewName}</strong></div>`;
  if (item.type === 'badge') return `<div class="shop-visual-preview badge-preview"><small>PRÉVIA DO EMBLEMA · NÃO ALTERA A COR DO NOME</small><span><b>${escapeHtml(item.value)}</b><em class="badge-preview-name">${previewName}</em><i>Somente o emblema é aplicado</i></span></div>`;
  if (item.type === 'title') return `<div class="shop-visual-preview title-preview"><small>PRÉVIA DO TÍTULO</small><span><b>${escapeHtml(initials(appState?.me?.displayName || 'SN'))}</b><em>${previewName}</em><strong>${escapeHtml(item.value)}</strong></span></div>`;
  return '';
}

function setPreviewCursor(value) {
  const classes = ['unicorn-cursor-active', 'horn-cursor-active', 'medicine-cursor-active', 'pirokinha-cursor-active', 'anvisa-cursor-active', 'commander-cursor-active', 'gay-power-cursor-active', 'giant-slow-cursor-active', 'black-hen-cursor-active', 'volleyball-cursor-active', 'bible-cursor-active', 'papa-bento-cursor-active', 'scrum-cursor-active', 'energy-cursor-active', 'laser-cursor-active', 'rocket-cursor-active', 'alien-cursor-active', 'petista-cursor-active', 'bolsonaro-cursor-active', 'umbanda-cursor-active'];
  classes.forEach((name) => document.documentElement.classList.remove(name));
  const classByValue = { unicorn: 'unicorn-cursor-active', horn: 'horn-cursor-active', dipirona: 'medicine-cursor-active', 'pirokinha-cosmica': 'pirokinha-cursor-active', anvisa: 'anvisa-cursor-active', gay: 'gay-power-cursor-active', 'giant-slow': 'giant-slow-cursor-active', commander: 'commander-cursor-active', 'galinha-preta': 'black-hen-cursor-active', volei: 'volleyball-cursor-active', biblia: 'bible-cursor-active', 'papa-bento': 'papa-bento-cursor-active', 'scrum-master': 'scrum-cursor-active', energetico: 'energy-cursor-active', laser: 'laser-cursor-active', rocket: 'rocket-cursor-active', alien: 'alien-cursor-active', petista: 'petista-cursor-active', bolsonaro: 'bolsonaro-cursor-active', umbanda: 'umbanda-cursor-active' };
  if (classByValue[value]) document.documentElement.classList.add(classByValue[value]);
  document.documentElement.dataset.activeCursor = value || 'windows';
}

function applyPersonalTheme(value) {
  applyVisualTheme(appState);
  ['galaxy', 'sunset', 'ocean', 'retro', 'matrix', 'eclipse', 'aurora', 'mars', 'nebula', 'hyperdrive', 'lunar-tide', 'coral-signal', 'prism', 'gta-neon', 'cobblemon', 'wolverine', 'samurai', 'god-war'].forEach((theme) => document.body.classList.toggle('profile-theme-' + theme, theme === value));
  document.body.classList.toggle('theme-light-override', Boolean(value) && !document.body.classList.contains('theme-dark'));
  if (value) {
    const button = $('#themeToggle');
    if (button) { button.disabled = false; button.title = document.body.classList.contains('theme-dark') ? 'Desativar modo escuro' : 'Ativar modo escuro'; button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', String(document.body.classList.contains('theme-dark'))); }
  }
}

function applyShopPreviewVisual(item) {
  if (!item) return;
  if (item.type === 'cursorStyle' && appState?.profile?.forcedCursor) return;
  if (item.type === 'siteTheme') {
    document.body.classList.add('shop-theme-preview-active');
    document.body.dataset.previewTheme = item.value;
    applyPersonalTheme(item.value);
    const companions={ 'gta-neon':['gta-neon','gta-neon','gta-neon'],cobblemon:['cobblemon','cobblemon','cobblemon'],wolverine:['wolverine','wolverine','wolverine'],samurai:['samurai','samurai','samurai'],'god-war':['god-war','god-war','god-war'] }[item.value];
    if(companions){setPreviewCursor(companions[0]);document.body.dataset.trailStyle=companions[1];['profileDisplayName','userName','menuUserName'].forEach(id=>$('#'+id)?.classList.add('name-style-'+companions[2]));}
  } else if (item.type === 'cursorStyle') {
    setPreviewCursor(item.value);
    document.body.dataset.trailStyle = ['laser', 'rocket', 'alien'].includes(item.value) ? item.value : item.value === 'maradona' ? 'white' : 'none';
    document.body.dataset.cursorEffect = ['gay', 'galinha-preta', 'volei', 'biblia', 'papa-bento', 'scrum-master', 'energetico', 'pirokinha-cosmica', 'petista', 'bolsonaro', 'umbanda', 'messi', 'cristiano', 'pele', 'maradona', 'neymar'].includes(item.value) ? item.value : '';
  }
  else if (item.type === 'trailStyle') document.body.dataset.trailStyle = item.value;
  else if (item.type === 'badge') ['profileDisplayName','userName','menuUserName'].forEach((id) => { const element = $('#' + id); if (element) element.dataset.badge = item.value; });
  else if (item.type === 'frame') {
    $('#profileIdentityCard').className = 'card profile-identity-card frame-' + item.value;
    $('#topProfileButton').className = 'top-profile-button frame-' + item.value;
    $('.site-menu-user').className = 'site-menu-user frame-' + item.value;
  } else if (item.type === 'nameStyle') {
    $('#profileDisplayName').className = 'name-style-' + item.value;
    $('#userName').className = 'name-style-' + item.value;
    $('#menuUserName').className = 'name-style-' + item.value;
  } else if (item.type === 'title') {
    $('#profileEquippedTitle').textContent = item.value;
    $('#userRole').textContent = item.value;
    $('#menuUserRole').textContent = item.value;
  }
}

function stopShopPreview(showMessage = false) {
  clearTimeout(shopPreviewTimer);
  clearInterval(shopPreviewInterval);
  shopPreviewTimer = null;
  shopPreviewInterval = null;
  shopPreviewItemId = null;
  setPreviewCursor(null);
  document.body.dataset.trailStyle = 'none';
  document.body.dataset.cursorEffect = '';
  delete document.body.dataset.papaStep;
  document.body.classList.remove('shop-theme-preview-active');
  delete document.body.dataset.previewTheme;
  $('#shopPreviewBanner')?.remove();
  if (appState?.profile) renderProfileEconomy(appState.profile);
  if (showMessage) showToast('Teste encerrado. Seus visuais foram restaurados.');
}

function startShopPreview(itemId) {
  const item = (appState?.profile?.shop || []).find((candidate) => candidate.id === itemId && !candidate.consumable);
  if (!item) return;
  if (item.type === 'cursorStyle' && appState?.profile?.forcedCursor) {
    showToast('Um cursor obrigatório está ativo. Aguarde o efeito terminar para testar outro mouse.', 'error');
    return;
  }
  if (item.type === 'siteTheme' && (appState.visualTheme !== 'user-choice' || appState.profile?.loan?.overdue)) {
    showToast('O tema de punição da rodada está ativo e não pode ser substituído durante o teste.', 'error');
    return;
  }
  stopShopPreview(false);
  shopPreviewItemId = item.id;
  applyShopPreviewVisual(item);
  const banner = document.createElement('aside');
  banner.id = 'shopPreviewBanner';
  banner.className = 'shop-preview-banner';
  banner.innerHTML = '<span>👁️</span><p><small>' + (item.type === 'siteTheme' ? 'TEMA APLICADO PARA TESTE' : 'TESTE GRATUITO') + '</small><strong>' + escapeHtml(item.name) + '</strong><em>Termina em <b id="shopPreviewSeconds">20</b>s · nenhum crédito cobrado</em></p><button id="stopShopPreviewButton" type="button">Encerrar</button>';
  document.body.appendChild(banner);
  $('#stopShopPreviewButton').addEventListener('click', () => stopShopPreview(true));
  let seconds = 20;
  shopPreviewInterval = setInterval(() => { seconds -= 1; const counter = $('#shopPreviewSeconds'); if (counter) counter.textContent = Math.max(0, seconds); }, 1000);
  shopPreviewTimer = setTimeout(() => stopShopPreview(true), 20000);
  showToast('Teste iniciado por 20 segundos. Nenhum crédito foi cobrado.');
}

function renderProfileEconomy(profile = {}) {
  renderVisualTrading(appState.trading || {});
  renderCardAlbum(appState.cardAlbum);
  const albumBadge=appState.cardAlbum?.collections?.find(c=>c.id===appState.cardAlbum.equipped && c.craftedAt);
  const shop = Array.isArray(profile.shop) ? profile.shop : [];
  const equipped = profile.equipped || {};
  const findEquipped = (type) => shop.find((item) => item.id === equipped[type]);
  const titleItem = findEquipped('title');
  const nameItem = findEquipped('nameStyle');
  const frameItem = findEquipped('frame');
  const siteThemeItem = findEquipped('siteTheme');
  const trailItem = findEquipped('trailStyle');
  const cursorItem = findEquipped('cursorStyle');
  const badgeItem = findEquipped('badge');
  const forcedGayCursor = Boolean(profile.forcedCursor && profile.forcedCursor.style === 'gay');
  const forcedGiantCursor = Boolean(profile.forcedCursor && profile.forcedCursor.style === 'giant-slow');
  clearTimeout(forcedCursorExpiryTimer);
  if (forcedGiantCursor && profile.forcedCursor?.expiresAt) {
    const delay = Date.parse(profile.forcedCursor.expiresAt) - Date.now();
    if (Number.isFinite(delay) && delay > 0) forcedCursorExpiryTimer = setTimeout(() => {
      api('/api/state').then(applyState).catch(() => {});
    }, delay + 400);
  }
  const liveTitles = Array.isArray(profile.liveTitles) ? profile.liveTitles : [];
  const allowPersonalTheme = appState.visualTheme === 'user-choice' && !profile.loan?.overdue;
  document.documentElement.classList.toggle('debt-cursor', Boolean(profile.forcedCursor?.debt));
  applyPersonalTheme(allowPersonalTheme ? siteThemeItem?.value : null);
  const personalCursor = forcedGayCursor || forcedGiantCursor ? null : cursorItem;
  document.body.dataset.trailStyle = personalCursor?.value === 'maradona' ? 'white' : (trailItem ? trailItem.value : (['laser', 'rocket', 'alien'].includes(personalCursor?.value) ? personalCursor.value : 'none'));
  document.body.dataset.cursorEffect = forcedGiantCursor ? 'giant-slow' : (forcedGayCursor || personalCursor?.value === 'gay') ? 'gay' : ['galinha-preta', 'volei', 'biblia', 'papa-bento', 'scrum-master', 'energetico', 'pirokinha-cosmica', 'petista', 'bolsonaro', 'umbanda', 'messi', 'cristiano', 'pele', 'maradona', 'neymar'].includes(personalCursor?.value) ? personalCursor.value : '';
  if (forcedGayCursor || forcedGiantCursor) $$('.cursor-linked-effect').forEach((particle) => particle.remove());
  document.documentElement.classList.toggle('unicorn-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'unicorn'));
  document.documentElement.classList.toggle('horn-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'horn'));
  document.documentElement.classList.toggle('medicine-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'dipirona'));
  document.documentElement.classList.toggle('pirokinha-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'pirokinha-cosmica'));
  document.documentElement.classList.toggle('anvisa-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'anvisa'));
  document.documentElement.classList.toggle('commander-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'commander'));
  document.documentElement.classList.toggle('black-hen-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'galinha-preta'));
  document.documentElement.classList.toggle('volleyball-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'volei'));
  document.documentElement.classList.toggle('bible-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'biblia'));
  document.documentElement.classList.toggle('papa-bento-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'papa-bento'));
  document.documentElement.classList.toggle('scrum-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'scrum-master'));
  document.documentElement.classList.toggle('energy-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'energetico'));
  document.documentElement.classList.toggle('laser-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'laser'));
  document.documentElement.classList.toggle('rocket-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'rocket'));
  document.documentElement.classList.toggle('alien-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'alien'));
  document.documentElement.classList.toggle('petista-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'petista'));
  document.documentElement.classList.toggle('bolsonaro-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'bolsonaro'));
  document.documentElement.classList.toggle('umbanda-cursor-active', Boolean(!forcedGayCursor && cursorItem && cursorItem.value === 'umbanda'));
  document.documentElement.classList.toggle('gay-power-cursor-active', Boolean(forcedGayCursor || (cursorItem && cursorItem.value === 'gay')));
  document.documentElement.classList.toggle('giant-slow-cursor-active', forcedGiantCursor);
  setPreviewCursor(forcedGayCursor ? 'gay' : forcedGiantCursor ? 'giant-slow' : (cursorItem?.value || null));
  document.body.classList.toggle('forced-gay-cursor-mode', forcedGayCursor);
  const cursorVisual = $('.unicorn-mouse-cursor>span');
  const cursorSkin = forcedGiantCursor ? 'giant-slow' : (cursorItem?.value || 'windows');
  if (cursorVisual && cursorVisual.dataset.skin !== cursorSkin) {
    cursorVisual.dataset.skin = cursorSkin;
    cursorVisual.innerHTML = forcedGiantCursor ? '<b class="giant-slow-pointer">☝️</b>' : '<img src="/unicorn-cursor-full-v2.png" alt="">';
  }
  $('#profileWallet').textContent = Number(profile.wallet || 0).toLocaleString('pt-BR');
  $('#shopPageWallet').textContent = Number(profile.wallet || 0).toLocaleString('pt-BR');
  renderAvatar($('#profileAvatar'), appState.me.avatarDataUrl, initials(appState.me.displayName));
  $('#profileDisplayName').textContent = formatDisplayName(appState.me.displayName);
  // A insígnia do álbum é uma conquista, não deve substituir um emblema comprado.
  // O emblema continua no nome; a insígnia aparece junto dele na lista de visuais.
  ['profileDisplayName','userName','menuUserName'].forEach((id) => { const element = $('#' + id); if (element) element.dataset.badge = badgeItem?.value || ''; });
  $('#profileEquippedTitle').textContent = liveTitles.length ? liveTitles.map((item) => item.icon + ' ' + item.name).join(' · ') : titleItem ? titleItem.value : 'Tripulante da Área 51';
  $('#profileDisplayName').className = nameItem ? 'name-style-' + nameItem.value : '';
  $('#profileIdentityCard').className = 'card profile-identity-card' + (frameItem ? ' frame-' + frameItem.value : '');
  $('#userName').className = nameItem ? 'name-style-' + nameItem.value : '';
  $('#menuUserName').className = nameItem ? 'name-style-' + nameItem.value : '';
  $('#topProfileButton').className = 'top-profile-button' + (frameItem ? ' frame-' + frameItem.value : '');
  $('.site-menu-user').className = 'site-menu-user' + (frameItem ? ' frame-' + frameItem.value : '');
  const publicTitle = liveTitles.length ? liveTitles.map((item) => item.icon + ' ' + item.name).join(' · ') : titleItem ? titleItem.value : (appState.me.role === 'admin' ? 'Administrador' : 'Participante');
  $('#userRole').textContent = publicTitle;
  $('#menuUserRole').textContent = publicTitle;
  const activeVisuals = [
    forcedGayCursor && ['🌈', 'Poder ativo: Seta Gay Compulsória'],
    forcedGiantCursor && ['🐌', 'Poder ativo: Mouse Gigante e Lento'],
    siteThemeItem && ['🌌', 'Tema: ' + siteThemeItem.name],
    cursorItem && ['🖱️', 'Cursor: ' + cursorItem.name],
    trailItem && ['✨', 'Rastro: ' + trailItem.name],
    frameItem && ['🖼️', 'Moldura: ' + frameItem.name],
    nameItem && ['🎨', 'Nome: ' + nameItem.name],
    badgeItem && [badgeItem.value, 'Emblema: ' + badgeItem.name],
    albumBadge && [albumBadge.icon, 'Insígnia: ' + albumBadge.badge],
    titleItem && ['🏷️', 'Título: ' + titleItem.name],
    ...liveTitles.map((item) => [item.icon, 'Título vivo: ' + item.name]),
  ].filter(Boolean);
  $('#activeVisualsList').innerHTML = activeVisuals.length
    ? activeVisuals.map(([icon, label]) => `<span>${icon} ${escapeHtml(label)}</span>`).join('')
    : '<span class="visuals-empty">Nenhuma personalização equipada</span>';
  const powers = profile.activePowers || {};
  const powerRows = [];
  if (powers.forcedGay) powerRows.push(['👑', 'Controle Gay da Rodada ativo', 'Escolhido: ' + powers.forcedGay, true, 'power-choose-gay']);
  if (powers.shield) powerRows.push(['🛡️', 'Escudo da Rodada ativo', 'Você está protegido nesta rodada', true, 'power-shield-gay']);
  if (powers.forcedTheme) powerRows.push(['🎨', 'Tema reservado', powers.forcedTheme, true]);
  (powers.available || []).forEach((entry) => powerRows.push([entry.icon, entry.name, entry.detail || 'Pronto para usar.', false, null, entry.itemId]));
  $('#activePowersCard').classList.toggle('hidden', powerRows.length === 0);
  $('#activePowersList').innerHTML = powerRows.map(([icon, title, detail, active, cancelId, availableId]) => `<div class="active-power-row${active ? ' is-active' : ''}"><span>${icon}</span><p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p>${cancelId ? `<button type="button" data-cancel-power="${cancelId}">Cancelar</button>` : availableId ? `<button type="button" data-profile-power-use="${escapeHtml(availableId)}">Usar</button>` : '<b>ATIVO</b>'}</div>`).join('');
  const mysteryBoxes = Array.isArray(profile.mysteryBoxes) ? profile.mysteryBoxes : [];
  const mysteryRewards = Array.isArray(profile.mysteryRewards) ? profile.mysteryRewards : [];
  const physicalPrizes = profile.physicalPrizes || [];
  renderCardPacks(profile);
  $('#physicalPrizeInventory').innerHTML = physicalPrizes.map(prize => `<article class="mystery-reward-item"><span>📒</span><p><strong>${escapeHtml(prize.name)}</strong><small>Ganhador: ${escapeHtml(prize.winnerName)}. Prêmio físico único — combine a entrega com o administrador. Não pode ser vendido por créditos.</small></p></article>`).join('');
  $('#mysteryInventoryCard').classList.toggle('hidden', mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length === 0);
  $('#mysteryInventoryCount').textContent = (mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length) + ((mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length) === 1 ? ' item' : ' itens');
$('#mysteryInventory').innerHTML = mysteryBoxes.map((box) => { const sourceLabel = box.source === 'casino' ? 'Ganho na Roleta 51' : String(box.source || '').startsWith('feature-gift-') ? 'Brinde das novas funcionalidades' : 'Comprado na Loja 51'; return `<article class="mystery-inventory-item mystery-${escapeHtml(box.tier)}"><span>${box.icon || '🎁'}</span><p><strong>${escapeHtml(box.name)}</strong><small>${sourceLabel} · ${escapeHtml(formatDate(box.acquiredAt))}</small></p><div><button type="button" data-box-open="${escapeHtml(box.id)}" data-box-name="${escapeHtml(box.name)}">Abrir</button><button type="button" data-box-sell="${escapeHtml(box.id)}" data-box-name="${escapeHtml(box.name)}" data-box-price="${Number(box.sellPrice || 0)}">Vender por ${Number(box.sellPrice || 0).toLocaleString('pt-BR')}</button></div></article>`; }).join('');
  $('#mysteryRewardInventory').innerHTML = mysteryRewards.length ? '<h4>Decisão pendente</h4>' + mysteryRewards.map((reward) => `<article class="mystery-reward-item"><span>${reward.icon || '🎁'}</span><p><strong>${escapeHtml(reward.name)}</strong><small>Você ainda não usou este prêmio.</small></p><div><button type="button" data-reward-keep="${escapeHtml(reward.purchaseId)}">Ficar</button><button type="button" data-reward-sell="${escapeHtml(reward.purchaseId)}" data-reward-name="${escapeHtml(reward.name)}" data-reward-price="${Number(reward.sellPrice || 0)}">Vender por ${Number(reward.sellPrice || 0).toLocaleString('pt-BR')}</button></div></article>`).join('') : '';
  const mission = profile.mission || { progress: 0, target: 1, reward: 0 };
  const missionPercent = Math.min(100, Math.round(Number(mission.progress || 0) / Math.max(1, Number(mission.target || 1)) * 100));
  $('#missionIcon').textContent = mission.icon || '🛸';
  $('#missionTitle').textContent = mission.title || 'Missão semanal';
  $('#missionDescription').textContent = mission.description || '';
  $('#missionProgressBar').style.width = missionPercent + '%';
  $('#missionProgressText').textContent = mission.completed ? '✓ Missão concluída' : mission.progress + ' de ' + mission.target;
  $('#missionReward').textContent = mission.completed ? 'Recompensa recebida' : '+' + mission.reward + ' créditos';
  $('.weekly-mission-card').classList.toggle('completed', Boolean(mission.completed));
  const dailyMissions = Array.isArray(profile.dailyMissions) ? profile.dailyMissions : [];
  const completedDaily = dailyMissions.filter((item) => item.completed).length;
  const dailyUnlocked = dailyMissions.some((item) => item.unlocked !== false);
  $('#dailyMissionCount').textContent = dailyUnlocked ? completedDaily + ' de ' + dailyMissions.length : 'Começa na segunda';
  $('#dailyMissionList').innerHTML = dailyMissions.map((item) => {
    const percent = Math.min(100, Math.round(Number(item.progress || 0) / Math.max(1, Number(item.target || 1)) * 100));
    const progress = item.unit === 'ml' ? Number(item.progress || 0).toLocaleString('pt-BR') + ' / ' + Number(item.target || 0).toLocaleString('pt-BR') + ' ml' : item.progress + ' de ' + item.target;
    const status = item.unlocked === false ? 'Abre no lançamento' : item.completed ? '✓ Recebido' : '+' + item.reward;
    return `<article class="daily-mission-item${item.completed ? ' completed' : ''}${item.unlocked === false ? ' locked' : ''}"><span>${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small><i><b style="width:${percent}%"></b></i><em>${escapeHtml(progress)}</em></div><mark>${status}</mark></article>`;
  }).join('');
  const cleanName = profile.cleanNameMission || {};
  $('#cleanNameMission').className = 'clean-name-mission' + (cleanName.cleanSoFar ? ' clean' : ' failed') + (cleanName.unlocked === false ? ' locked' : '');
  $('#cleanNameMission').innerHTML = `<span>${cleanName.icon || '😇'}</span><p><small>MISSÃO DE FECHAMENTO SEMANAL</small><strong>${escapeHtml(cleanName.title || 'Nome limpo')}</strong><em>${cleanName.unlocked === false ? 'Começa na segunda-feira.' : cleanName.cleanSoFar ? 'Sem mentiras confirmadas até agora.' : 'Uma mentira foi confirmada nesta semana.'}</em></p><b>+${Number(cleanName.reward || 20)}</b>`;
  const stats = profile.stats || {};
  const statItems = [
    ['💧', stats.hydrationDays || 0, 'metas de água'], ['🏆', stats.bestWins || 0, 'melhores'],
    ['🌈', stats.gayWins || 0, 'sorteios especiais'], ['😂', stats.memes || 0, 'memes'],
    ['💬', stats.phrases || 0, 'frases'], ['🛍️', stats.purchases || 0, 'itens comprados'],
  ];
  $('#profileStats').innerHTML = statItems.map(([icon, value, label]) => `<div><span>${icon}</span><strong>${Number(value).toLocaleString('pt-BR')}</strong><small>${label}</small></div>`).join('');
  const ledger = Array.isArray(profile.creditLedger) ? profile.creditLedger : [];
  $('#creditLedger').innerHTML = ledger.length ? ledger.slice(0, 12).map((item) => `<div class="credit-ledger-row"><span>${item.icon || '🪙'}</span><p><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></p><b class="${Number(item.amount) >= 0 ? 'positive' : 'negative'}">${Number(item.amount) >= 0 ? '+' : ''}${Number(item.amount).toLocaleString('pt-BR')}</b></div>`).join('') : '<div class="credit-ledger-empty">Seu extrato começará após a primeira movimentação.</div>';
  const medals = Array.isArray(profile.medals) ? profile.medals : [];
  const unlocked = medals.filter((medal) => medal.unlocked).length;
  $('#medalCount').textContent = unlocked + ' de ' + medals.length + ' desbloqueadas';
  $('#profileMedals').innerHTML = medals.map((medal) => `<article class="profile-medal${medal.unlocked ? ' unlocked' : ' locked'}${medal.secret ? ' secret-medal' : ''}"><span>${medal.unlocked ? medal.icon : '🔒'}</span><div><strong>${medal.unlocked || !medal.secret ? escapeHtml(medal.name) : 'Sinal desconhecido'}</strong><small>${escapeHtml(medal.unlocked || !medal.secret ? medal.description : 'Conquista secreta — explore a Área 51 para revelar.')}</small></div></article>`).join('');
  renderTrophyRoom(profile);
  const gifts = profile.giftOptions || { people: [], items: [], weeklyCreditRemaining: 0 };
  const peopleOptions = (gifts.people || []).map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(formatDisplayName(person.displayName))}</option>`).join('');
  $('#giftCreditsUser').innerHTML = peopleOptions || '<option value="">Nenhuma pessoa disponível</option>';
  $('#giftItemUser').innerHTML = peopleOptions || '<option value="">Nenhuma pessoa disponível</option>';
  $('#giftShopItem').innerHTML = (gifts.items || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${Number(item.price).toLocaleString('pt-BR')} créditos</option>`).join('');
  $('#giftCreditLimit').textContent = 'Limite restante nesta semana: ' + Number(gifts.weeklyCreditRemaining || 0) + ' créditos';
  $('.gift-center-card').classList.toggle('hidden', !(gifts.people || []).length);
  const freeShopAvailable = Boolean(profile.freeShopPurchaseAvailable);
  $('#freeShopPass').classList.toggle('used', !freeShopAvailable);
  $('#freeShopPassTitle').textContent = freeShopAvailable ? 'Compra Grátis 51 disponível' : 'Compra Grátis 51 utilizada';
  $('#freeShopPassText').textContent = freeShopAvailable ? 'Escolha um visual da loja e use seu único passe sem gastar créditos.' : 'Seu passe individual já foi usado. As próximas compras utilizam Créditos 51.';
  $('#freeShopPassStatus').textContent = freeShopAvailable ? '1 USO' : 'UTILIZADO';
  const loan = profile.loan;
  let debtNotice = $('#loanOverdueNotice');
  if (loan?.overdue && !debtNotice) {
    debtNotice = document.createElement('aside'); debtNotice.id = 'loanOverdueNotice'; debtNotice.className = 'loan-overdue-notice'; debtNotice.setAttribute('role','status');
    debtNotice.innerHTML = '<strong>🕶️ Agiota Estelar: dívida vencida</strong><span>Quite ou prorrogue para restaurar os visuais e entrar em novas rodadas.</span><a href="?pagina=perfil">Ver dívida e pagar</a>';
    $('.topbar').insertAdjacentElement('afterend', debtNotice);
  } else if (!loan?.overdue) debtNotice?.remove();
  $('#stellarLoanCard').classList.toggle('has-debt', Boolean(loan));
  $('#stellarLoanTitle').textContent = loan ? `Dívida atual: ${Number(loan.remainingDue).toLocaleString('pt-BR')} créditos` : 'Créditos rápidos para a sua coleção';
  $('#stellarLoanText').textContent = loan ? `Você recebeu ${loan.principal} e deve ${loan.totalDue} com juros. ${loan.dueAt ? `Vencimento: ${formatDate(loan.dueAt)}. ${loan.overdue ? 'ATRASADO: tema de cobrança e cursor lento ativos; quite para entrar na próxima rodada.' : 'Resgates promocionais abatem primeiro a dívida.'}` : 'Contrato anterior: sem prazo ou novas penalidades.'}` : 'Receba 100, 200 ou 300 créditos. Juros fixos de 20%; prazo de 48 horas. Atrasos ativam cobrança visual e impedem entrada em novas rodadas. Resgates promocionais abatem a dívida. Apenas um empréstimo por vez.';
  $('#stellarLoanActions').innerHTML = loan ? `<input id="stellarRepayAmount" type="number" min="1" max="${Number(loan.remainingDue)}" step="1" value="${Math.min(Number(profile.wallet || 0), Number(loan.remainingDue)) || 1}" aria-label="Valor do pagamento"><button type="button" data-loan-repay>Pagar</button><button type="button" data-loan-repay-all>Quitar ${Number(loan.remainingDue).toLocaleString('pt-BR')}</button>` : [100,200,300].map((amount) => `<button type="button" data-loan-borrow="${amount}">Receber ${amount}<small>Devolver ${Math.round(amount * 1.2)}</small></button>`).join('');
  const shopPriority = (item) => item.service ? -2 : item.id === 'power-force-gay-cursor' ? -1 : 0;
  const orderedShop = [...shop].sort((a, b) => shopPriority(a) - shopPriority(b));
  $('#shopCatalog').innerHTML = orderedShop.map((item) => {
    const category = (item.mysteryBox || item.cardPack) ? 'box' : item.type === 'cursorStyle' ? 'cursor' : item.type === 'trailStyle' ? 'trail' : item.type === 'siteTheme' ? 'theme' : item.type === 'power' ? 'power' : 'profile';
    const isOwnedVisual = item.owned && !item.consumable && !item.mysteryBox && !item.service;
    const filteredOut = (shopFilter !== 'all' && shopFilter !== category) || (hideOwnedVisuals && isOwnedVisual);
    const label = item.cardPack ? 'PACOTE DE CARTAS' : item.service ? 'TROCA DE CONQUISTA' : item.mysteryBox ? 'CAIXA MISTERIOSA' : item.type === 'title' ? 'TÍTULO' : item.type === 'badge' ? 'EMBLEMA DO PERFIL' : item.type === 'frame' ? 'MOLDURA' : item.type === 'nameStyle' ? 'ESTILO DO NOME' : item.type === 'siteTheme' ? 'TEMA VISUAL' : item.type === 'cursorStyle' ? 'SKIN DO CURSOR' : item.type === 'trailStyle' ? 'RASTRO DO CURSOR' : 'PODER CONSUMÍVEL';
    const action = item.cardPack ? 'Comprar pacote' : item.service ? 'Vender 1 ponto' : item.mysteryBox ? 'Comprar fechada' : item.consumable ? (item.quantity > 0 ? 'Usar poder' : 'Comprar') : item.equipped ? (item.type === 'siteTheme' ? 'Desativar tema' : 'Remover') : item.owned ? (item.type === 'siteTheme' ? 'Aplicar tema' : 'Equipar') : 'Comprar';
    const shopAction = item.cardPack ? 'purchase' : item.service ? 'sell-best-win' : item.mysteryBox ? 'mystery-purchase' : item.consumable ? (item.quantity > 0 ? 'use' : 'purchase') : item.owned ? 'equip' : 'purchase';
    const status = item.cardPack ? item.price + ' créditos · ' + item.quantity + ' fechado(s)' : item.service ? '🏆 ' + Number(item.availablePoints || 0) + ' disponível · receba 500 créditos' : item.mysteryBox ? (Number(item.quantity || 0) ? '🎁 ' + item.quantity + ' fechado' + (Number(item.quantity) === 1 ? '' : 's') + ' no perfil · ' : '') + '<span class="coin-51" aria-hidden="true">51</span> ' + item.price + ' créditos' : item.granted ? (item.equipped ? '★ Cursor oficial em uso' : '★ Concedido ao administrador') : item.consumable && item.quantity > 0 ? '🎟️ ' + item.quantity + ' disponível' : item.equipped ? (item.type === 'siteTheme' ? '✓ Tema aplicado em todo o site' : '● Em uso') : item.owned ? '✓ Na sua coleção' : '<span class="coin-51" aria-hidden="true">51</span> ' + item.price + ' créditos';
    const themeConfirmation = item.type === 'siteTheme' && item.equipped ? '<div class="theme-applied-confirmation"><span>✓</span><strong>ESTE TEMA ESTÁ ATIVO</strong><small>Você está vendo este visual em todo o site agora.</small></div>' : '';
    const previewButton = item.service || item.consumable || item.mysteryBox ? '' : `<button class="shop-test-button" type="button" data-shop-preview="${escapeHtml(item.id)}" data-preview-type="${escapeHtml(item.type)}" data-preview-value="${escapeHtml(item.value)}">Testar 20s</button>`;
    const freeVisualTypes = ['title', 'badge', 'frame', 'nameStyle', 'siteTheme', 'cursorStyle', 'trailStyle'];
    const canUseFree = freeShopAvailable && freeVisualTypes.includes(item.type) && !item.owned;
    const freeButton = canUseFree ? `<button class="shop-free-button" type="button" data-shop-free="${escapeHtml(item.id)}">Usar grátis</button>` : '';
    const featuredPower = item.id === 'power-force-gay-cursor';
    const canBuyQuantity = Boolean(item.cardPack || item.mysteryBox || (item.type === 'power' && item.consumable));
    const quantityPicker = canBuyQuantity ? `<label class="shop-quantity-picker"><span>Quantidade</span><input type="number" min="1" max="20" step="1" value="1" inputmode="numeric" data-shop-quantity="${escapeHtml(item.id)}" aria-label="Quantidade de ${escapeHtml(item.name)}"></label>` : '';
    const buyMorePower = item.type === 'power' && item.consumable && Number(item.quantity || 0) > 0 ? `<button type="button" data-shop-action="purchase" data-shop-item="${escapeHtml(item.id)}" data-shop-type="${escapeHtml(item.type)}" data-shop-value="${escapeHtml(item.value)}" data-shop-price="${Number(item.price)}">Comprar mais</button>` : '';
    const boxInfo = item.mysteryBox ? ` data-box-info="true" data-box-name="${escapeHtml(item.name)}" data-box-icon="${escapeHtml(item.icon)}" data-box-credit="${Math.round(Number(item.creditChance || 0) * 100)}" data-box-power="${Math.round(Number(item.powerChance || 0) * 100)}" data-box-min="${Number(item.creditMin || 0)}" data-box-max="${Number(item.creditMax || 0)}" data-box-reward-min="${Number(item.minRewardPrice || 0)}" data-box-reward-max="${Number(item.maxRewardPrice || 0)}" data-box-physical-chance="${Number(item.physicalKitChance || 0)}"` : '';
    const iconMarkup = item.mysteryBox ? `<button class="shop-item-icon" type="button" aria-label="Ver chances da ${escapeHtml(item.name)}">${item.icon}</button>` : `<span class="shop-item-icon">${item.icon}</span>`;
    const oddsButton = item.mysteryBox ? '<button type="button" data-box-odds>Ver chances</button>' : '';
    return `<article data-shop-category="${category}" class="shop-item shop-type-${escapeHtml(item.type)}${item.service ? ' shop-service' : ''}${item.mysteryBox ? ' mystery-box mystery-' + escapeHtml(item.tier) : ''}${item.owned ? ' owned' : ''}${item.equipped ? ' equipped' : ''}${item.consumable ? ' consumable' : ''}${item.granted ? ' admin-exclusive' : ''}${featuredPower ? ' featured-gay-power' : ''}${filteredOut ? ' hidden' : ''}"${boxInfo}>${featuredPower ? '<span class="shop-new-power">NOVO PODER</span>' : ''}${iconMarkup}<div><small>${label}</small><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.description)}</p></div>${shopVisualPreview(item)}${themeConfirmation}<footer><strong>${status}</strong>${quantityPicker}<span class="shop-card-actions">${oddsButton}${previewButton}${freeButton}${buyMorePower}<button type="button" data-shop-action="${shopAction}" data-shop-item="${escapeHtml(item.id)}" data-shop-type="${escapeHtml(item.type)}" data-shop-value="${escapeHtml(item.value)}" data-shop-price="${Number(item.price)}" data-equipped="${item.equipped}"${item.service && Number(item.availablePoints || 0) < 1 ? ' disabled' : ''}>${action}</button></span></footer></article>`;
  }).join('');
  const collectionCatalog = $('#collectionCatalog');
  collectionCatalog.innerHTML = '';
  $$('.shop-item.owned:not(.consumable):not(.mystery-box):not(.shop-service)', $('#shopCatalog')).forEach((card) => {
    const clone = card.cloneNode(true); clone.classList.remove('hidden'); collectionCatalog.appendChild(clone);
  });
  $('#collectionEmpty').classList.toggle('hidden', collectionCatalog.children.length > 0);
  $('#hideOwnedVisuals').checked = hideOwnedVisuals;
  if (shopPreviewItemId) applyShopPreviewVisual(shop.find((item) => item.id === shopPreviewItemId));
}

function renderAdmin() {
  const isAdmin = appState.me.role === 'admin';
  $('#adminNav').classList.toggle('hidden', !isAdmin);
  $('#admin').classList.toggle('hidden', !isAdmin);
  $('#adminLiveChecklist').classList.toggle('hidden', !isAdmin);
  if (!isAdmin) return;
  $('#roundInput').value = appState.settings.roundName;
  $('#themesInput').value = (appState.settings.themes || []).join('\n');
  $('#excludeLast').checked = appState.settings.excludeLastGayWinner;
  const schedule = appState.settings.roundSchedule || {};
  $('#scheduleSubmissions').value = schedule.submissionsAt || '';
  $('#scheduleDraw').value = schedule.drawAt || '';
  $('#scheduleVote').value = schedule.voteAt || '';
  const announcement = appState.announcement;
  $('#announcementStatus').textContent = announcement ? `Publicado por ${announcement.createdBy} · ${Number(announcement.seenCount || 0)} visualizações` : 'Nenhum aviso publicado.';
  $('#clearAnnouncementButton').disabled = !announcement;
  const users = appState.adminUsers || [];
  $('#adminUserCount').textContent = users.length + ' contas';
  $('#adminUsers').innerHTML = users.map((user) =>
    '<div class="admin-user' + (user.approved === false ? ' pending-approval' : '') + '"><p><strong>' + escapeHtml(formatDisplayName(user.displayName)) + '</strong><small>@' + escapeHtml(user.username) + (user.role === 'admin' ? ' · Administrador' : '') + (user.approved === false ? ' · Aguardando aprovação' : '') + ' · <span class="coin-51" aria-hidden="true">51</span> ' + Number(user.wallet || 0).toLocaleString('pt-BR') + '</small></p>' +
    '<div class="admin-user-actions"><button class="tiny-toggle ' + (user.eligible ? 'on' : 'off') + '" data-user-action="eligible" data-user-id="' + user.id + '" data-value="' + (!user.eligible) + '">' + (user.eligible ? 'Participa' : 'Fora da roleta') + '</button>' +
    '<button class="tiny-toggle ' + (user.active ? 'on' : 'off') + '" data-user-action="active" data-user-id="' + user.id + '" data-value="' + (!user.active) + '">' + (user.active ? 'Ativo' : 'Inativo') + '</button>' +
    (user.approved === false ? '<button class="admin-user-approve" type="button" data-user-action="approved" data-user-id="' + user.id + '" data-value="true">Aprovar acesso</button>' : '') +
    '<button class="admin-user-edit" type="button" data-edit-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '" data-user-username="' + escapeHtml(user.username) + '">Editar</button>' +
    '<button class="admin-user-credits" type="button" data-credit-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '" data-user-wallet="' + Number(user.wallet || 0) + '">Créditos</button>' +
    (user.id !== appState.me.id ? '<button class="admin-user-delete" type="button" data-delete-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '">Excluir</button>' : '') + '</div></div>'
  ).join('');
  const security = appState.security || { devices: [] };
  $('#securityDeviceCount').textContent = security.devices.length + (security.devices.length === 1 ? ' dispositivo' : ' dispositivos');
  $('#authorizedDevices').innerHTML = security.devices.length ? security.devices.map((device) => `<article><span>${device.device.startsWith('Celular') ? '📱' : '💻'}</span><p><strong>${escapeHtml(device.device)} · ${escapeHtml(device.browser)}</strong><small>${escapeHtml(device.ip || 'IP local')} · autorizado em ${escapeHtml(formatDate(device.createdAt))}</small></p><button type="button" data-revoke-device="${escapeHtml(device.id)}">Revogar</button></article>`).join('') : '<p class="security-empty">Nenhum dispositivo autorizado.</p>';
  const attendanceCard = $('#roundAttendanceCard');
  const readiness = appState.readiness || { ready: 0, total: 0, missing: [] };
  const showAttendance = Boolean(appState.workflow.roundId && appState.workflow.phase === 'uploads');
  attendanceCard.classList.toggle('hidden', !showAttendance);
  if (showAttendance) {
    $('#attendanceCount').textContent = readiness.ready + ' de ' + readiness.total;
    $('#attendanceProgressBar').style.width = (readiness.total ? Math.round(readiness.ready / readiness.total * 100) : 0) + '%';
    $('#missingParticipants').innerHTML = readiness.missing.length
      ? readiness.missing.map((item) => '<span>' + escapeHtml(formatDisplayName(item.displayName)) + '</span>').join('')
      : '<span class="all-ready">✓ Todos enviaram</span>';
    $('#attendanceHelp').textContent = readiness.acceptsNewParticipants
      ? 'O envio já confirma a participação. Uma nova conta criada agora entra automaticamente nesta rodada.'
      : 'A lista desta rodada já está fechada. Novas contas entram na próxima.';
    $('#useReadyParticipantsButton').classList.toggle('hidden', !readiness.canStartWithReady);
  }
  const assistedCard = $('#adminAssistedUploadForm');
  const uploadOptions = appState.adminUploadOptions || [];
  assistedCard.classList.toggle('hidden', !showAttendance);
  if (showAttendance) {
    const select = $('#adminUploadUser');
    const selectedId = select.value;
    select.innerHTML = uploadOptions.map((person) => '<option value="' + escapeHtml(person.id) + '" data-has-submission="' + person.hasSubmission + '">' + escapeHtml(formatDisplayName(person.displayName)) + (person.hasSubmission ? ' — já enviou' : ' — aguardando') + '</option>').join('');
    if (uploadOptions.some((person) => person.id === selectedId)) select.value = selectedId;
    updateAdminUploadAction();
    const assisted = uploadOptions.filter((person) => person.assisted);
    $('#adminAssistedUploadList').innerHTML = assisted.length ? '<strong>ENVIOS FEITOS POR VOCÊ</strong>' + assisted.map((person) => '<span>✓ ' + escapeHtml(formatDisplayName(person.displayName)) + '</span>').join('') : '<small>Nenhum envio assistido nesta rodada.</small>';
  }
  const progress = appState.adminProgress || { missingUploads: [], pendingAssignments: [], missingViews: [], missingVotes: [] };
  const phases = ['theme', 'uploads', 'assignments', 'gay', 'voting', 'results'];
  const phaseIndex = phases.indexOf(appState.workflow.phase);
  const stageRow = (label, index, missing, waitingText) => {
    const complete = phaseIndex > index;
    const active = phaseIndex === index;
    const status = complete ? '✓ Concluído' : active
      ? (missing.length ? missing.map((item) => escapeHtml(formatDisplayName(item.displayName))).join(', ') : '✓ Todos prontos')
      : waitingText;
    return '<div class="admin-live-stage ' + (complete ? 'complete' : active ? 'active' : 'waiting') + '"><i>' + (complete ? '✓' : index + 1) + '</i><p><strong>' + label + '</strong><small>' + status + '</small></p></div>';
  };
  $('#adminLiveStages').innerHTML =
    stageRow('Tema', 0, [], 'Aguardando início') +
    stageRow('Envios', 1, progress.missingUploads, 'Aguardando o tema') +
    stageRow('Distribuição', 2, progress.pendingAssignments, 'Aguardando os envios') +
    stageRow('Visualização', 3, progress.missingViews, 'Aguardando a distribuição') +
    stageRow('Gay da Rodada', 3, [], 'Aguardando a distribuição') +
    stageRow('Votação', 4, progress.missingVotes, 'Aguardando o sorteio especial');
  renderEventMode();
  renderAdminHealth(appState.adminHealth || {});
}

function renderTodayHub(data) {
  const phase = data.workflow?.phase || 'theme';
  const phaseInfo = {
    theme: ['🎨', 'Tema da rodada', 'Aguardando o próximo sorteio'],
    uploads: ['🖼️', 'Envios abertos', data.meCanUpload ? 'Seu wallpaper ainda falta' : 'Seu envio está confirmado'],
    assignments: ['🎡', 'Distribuição', 'Wallpapers sendo entregues'],
    gay: ['🌈', 'Sorteio especial', 'Gay da Rodada é a próxima etapa'],
    voting: ['🗳️', 'Votação aberta', data.voting?.userHasVoted ? 'Seu voto já foi salvo' : 'Seu voto ainda falta'],
    results: ['🏆', 'Resultado disponível', 'Confira o fechamento da rodada'],
  }[phase];
  const missions = data.profile?.dailyMissions || [];
  const missionDone = missions.filter((item) => item.completed).length;
  const water = Number(data.hydration?.myTotalMl || 0);
  const boxes = Number(data.profile?.mysteryBoxes?.length || 0) + Number(data.profile?.cardPacks?.length || 0);
  const unread = Number(data.notifications?.unreadCount || 0);
  $('#todayHubStatus').textContent = unread ? unread + (unread === 1 ? ' novidade' : ' novidades') : 'Tudo em ordem';
  $('#todayHubCards').innerHTML = [
    [phaseInfo[0], phaseInfo[1], phaseInfo[2], 'Rodada'],
    ['💧', water.toLocaleString('pt-BR') + ' ml', Math.max(0, 2500 - water).toLocaleString('pt-BR') + ' ml restantes', 'Água hoje'],
    ['🚀', missionDone + ' de ' + missions.length, missionDone === missions.length && missions.length ? 'Objetivos concluídos' : 'Missões diárias', 'Progresso'],
    ['🎁', String(boxes), boxes ? 'Itens fechados esperando você' : 'Nenhum item fechado', 'Inventário'],
  ].map(([icon,title,detail,label]) => `<article class="today-hub-card"><span>${icon}</span><p><small>${escapeHtml(label)}</small><strong>${escapeHtml(title)}</strong><em>${escapeHtml(detail)}</em></p></article>`).join('');
  const primaryPage = phase === 'uploads' ? 'inscricoes' : phase === 'voting' || phase === 'results' ? 'sorteio' : 'sorteio';
  const primaryLabel = phase === 'uploads' && data.meCanUpload ? 'Enviar wallpaper' : phase === 'voting' && !data.voting?.userHasVoted ? 'Votar agora' : phase === 'results' ? 'Ver resultado' : 'Ver rodada';
  $('#todayQuickActions').innerHTML = `<a class="primary" href="?pagina=${primaryPage}" data-page="${primaryPage}">${primaryLabel}</a><a href="?pagina=agua" data-page="agua">Registrar água</a><a href="?pagina=perfil" data-page="perfil">Abrir inventário</a><a href="?pagina=classificacao" data-page="classificacao">Ver placares</a>`;
  const recap = data.roundRecap;
  $('#roundRecapCard').classList.toggle('hidden', !recap);
  if (recap) {
    $('#roundRecapTitle').textContent = recap.roundName;
    $('#roundRecapPreview').textContent = [recap.theme ? 'Tema: ' + recap.theme : '', recap.best ? 'Melhor: ' + recap.best.name : '', recap.gayWinner ? 'Gay da Rodada: ' + recap.gayWinner : ''].filter(Boolean).join(' · ');
    $('#roundRecapHighlights').innerHTML = [[ '🎨', 'Tema', recap.theme ], [ '🏆', 'Melhor', recap.best?.name ], [ '😂', 'Caótico', recap.worst?.name ], [ '🌈', 'Sorteado', recap.gayWinner ], [ '🗳️', 'Votos', recap.voteCount + '/' + recap.participantCount ]].filter(([, , value]) => value).map(([icon, label, value]) => `<span><i>${icon}</i><small>${escapeHtml(label)}</small><b>${escapeHtml(String(value))}</b></span>`).join('');
  }
}

function renderTrophyRoom(profile = {}) {
  const showcase = profile.showcase || { selected: [], selectedIds: [], options: [], max: 4 };
  const tile = (item, selectable = false) => `<label class="${selectable ? 'trophy-option' : 'trophy-item'}">${selectable ? `<input type="checkbox" value="${escapeHtml(item.id)}"${showcase.selectedIds.includes(item.id) ? ' checked' : ''}>` : ''}<span>${item.icon}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.kind || item.description || '')}</small></label>`;
  $('#trophyRoomDisplay').innerHTML = showcase.selected.length ? showcase.selected.map((item) => tile(item)).join('') : '<p class="trophy-room-empty">Sua vitrine ainda está vazia. Escolha conquistas desbloqueadas.</p>';
  $('#trophyRoomOptions').innerHTML = showcase.options.length ? showcase.options.map((item) => tile(item, true)).join('') : '<p class="trophy-room-empty">Continue participando para liberar conquistas.</p>';
  $('#saveTrophyRoomButton').disabled = !showcase.options.length;
}

function renderFeatureAvailability(flags = {}) {
  const normalized = { casino: true, impostor: true, mystery: true, shop: true, uploads: true, ...flags };
  $$('#siteMenu a[data-page]').forEach((link) => {
    const feature = featurePageMap[link.dataset.page];
    link.classList.toggle('feature-paused', Boolean(feature && normalized[feature] === false));
    link.setAttribute('aria-disabled', String(Boolean(feature && normalized[feature] === false)));
  });
  const form = $('#featureFlagsForm');
  if (form && document.activeElement?.form !== form) Object.entries(normalized).forEach(([key, enabled]) => { if (form.elements[key]) form.elements[key].checked = enabled; });
  if (!normalized.casino && flightPollTimer) stopFlightPolling();
  const current = currentPortalPage(); const required = featurePageMap[current];
  if (required && normalized[required] === false) showPortalPage('memes', false, false);
  const giftItemButton = $('#giftItemForm button[type="submit"]');
  if (giftItemButton) { giftItemButton.disabled = normalized.shop === false; giftItemButton.title = normalized.shop === false ? 'A Loja 51 está pausada.' : ''; }
}

function renderEventMode() {
  const enabled = localStorage.getItem('area51-event-focus') === 'true';
  $('#eventModeToggle').checked = enabled;
  document.body.classList.toggle('event-focus', enabled && currentPortalPage() === 'admin');
  const phase = appState.workflow?.phase || 'theme';
  const info = {
    theme: ['🎨','Definir o tema','A roleta de temas inicia a rodada.'], uploads: ['🖼️','Receber os wallpapers',`${appState.readiness?.ready || 0} de ${appState.readiness?.total || 0} envios confirmados.`],
    assignments: ['🎡','Distribuir wallpapers','Use a roleta para entregar um wallpaper a cada pessoa.'], gay: ['🌈','Sortear o Gay da Rodada','A distribuição terminou; o sorteio especial está liberado.'],
    voting: ['🗳️','Acompanhar votação',`${appState.voting?.receivedVotes || 0} de ${appState.voting?.totalVoters || 0} votos recebidos.`], results: ['🏆','Fechar a rodada','Resultados concluídos; confirme antes de apagar as imagens pesadas.'],
  }[phase];
  $('#eventModeStage').innerHTML = `<span>${info[0]}</span><p><strong>${info[1]}</strong><small>${escapeHtml(info[2])}</small></p>`;
  const actions = [`<button type="button" data-event-action="round">Abrir controle da rodada</button>`];
  if (appState.readiness?.canStartWithReady) actions.push('<button class="secondary" type="button" data-event-action="ready">Fechar com quem enviou</button>');
  if (phase === 'results' && appState.voting?.gayDrawCompleted) actions.push('<button class="secondary" type="button" data-event-action="finish">Encerrar e limpar imagens</button>');
  $('#eventModeActions').innerHTML = actions.join('');
}

function renderAdminHealth(health = {}) {
  const bytes = Number(health.databaseBytes || 0);
  const formatBytes = (value) => value >= 1048576 ? (value / 1048576).toFixed(2) + ' MB' : value >= 1024 ? Math.round(value / 1024) + ' KB' : value + ' B';
  const media = health.media || {};
  $('#healthMetrics').innerHTML = [
    ['Banco atual', formatBytes(bytes)], ['Mídias referenciadas', Number(media.referencedTotal || 0).toLocaleString('pt-BR')],
    ['Contas ativas', `${Number(health.activeUsers || 0)} de ${Number(health.totalUsers || 0)}`], ['Online agora', Number(health.onlineUsers || 0).toLocaleString('pt-BR')],
    ['Versão liberada', 'v' + Number(health.releaseVersion || 0)], ['Revisão dos dados', '#' + Number(health.revision || 0)],
  ].map(([label,value]) => `<div class="health-metric"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  const backup = health.lastBackupAt ? formatDate(health.lastBackupAt) : 'ainda não registrado';
  const cleanup = health.lastCleanupAt ? formatDate(health.lastCleanupAt) : 'ainda não registrada';
  $('#healthActivity').textContent = `Último backup: ${backup}. Última limpeza: ${cleanup}. Imagens: ${Number(media.wallpapers || 0)} wallpapers, ${Number(media.feedImages || 0)} no feed e ${Number(media.feedbackImages || 0)} em feedbacks.`;
}

function renderAnnouncement(announcement) {
  const dialog = $('#announcementDialog');
  if (!announcement || !announcement.unread || dialog.dataset.announcementId === announcement.id) return;
  dialog.dataset.announcementId = announcement.id;
  $('#announcementDialogTitle').textContent = announcement.title;
  $('#announcementDialogMessage').textContent = announcement.message;
  if (!dialog.open) dialog.showModal();
}

async function acknowledgeAnnouncement() {
  const dialog = $('#announcementDialog'); const id = dialog.dataset.announcementId;
  if (dialog.open) dialog.close();
  if (!id) return;
  try { applyState(await api('/api/announcement/seen', { method: 'POST', body: { id } })); }
  catch (error) { showToast(error.message, 'error'); }
}

function applyState(data) {
  const previousPhase = appState && appState.workflow ? appState.workflow.phase : null;
  const incomingReleaseVersion = Math.max(0, Number(data.settings?.releaseVersion || 0));
  if (knownReleaseVersion === null) knownReleaseVersion = incomingReleaseVersion;
  else if (incomingReleaseVersion > knownReleaseVersion && !updatePromptOpen) {
    knownReleaseVersion = incomingReleaseVersion;
    updatePromptOpen = true;
    setTimeout(() => {
      const canReload = !spinning && !casinoSpinInProgress && !mysteryOpeningInProgress && !selectedFile && !selectedAdminUploadFile;
      if (canReload && confirm('Uma nova versão do Área 51 está disponível. Atualizar agora?')) location.reload();
      else showToast('Nova versão disponível. Atualize a página quando terminar sua ação atual. 🚀');
      updatePromptOpen = false;
    }, 250);
  }
  appState = data;
  serverClockOffset = Number(data.serverTime || Date.now()) - Date.now();
  musicEpoch = Number(data.musicEpoch || musicEpoch || Date.now());
  renderOnlinePeople();
  if (musicPrimedByGesture) startMusic();
  document.body.classList.toggle('admin-command-mode', data.me.role === 'admin');
  applyVisualTheme(data);
  document.dispatchEvent(new CustomEvent('area51:state', { detail: data }));
  if (!spinning) setMode(suggestedMode());
  $('#userName').textContent = formatDisplayName(data.me.displayName);
  $('#userRole').textContent = data.me.role === 'admin' ? 'Administrador' : 'Participante';
  renderAvatar($('#userAvatar'), data.me.avatarDataUrl, initials(data.me.displayName));
  renderAvatar($('#menuUserAvatar'), data.me.avatarDataUrl, initials(data.me.displayName));
  $('#menuUserName').textContent = formatDisplayName(data.me.displayName);
  $('#menuUserRole').textContent = data.me.role === 'admin' ? 'Administrador' : 'Participante';
  $('#roundName').textContent = data.settings.roundName.toUpperCase();
  if ($('#releaseVersionLabel')) $('#releaseVersionLabel').textContent = 'Versão ' + incomingReleaseVersion;
  $('#sideRoundName').textContent = data.settings.roundName;
  $('#currentThemeLabel').textContent = data.workflow.currentTheme ? data.workflow.currentTheme.toUpperCase() : 'AGUARDANDO SORTEIO';
  const schedule = data.settings.roundSchedule || {};
  const scheduleItems = [['📤', 'Envios', schedule.submissionsAt], ['🎡', 'Sorteio', schedule.drawAt], ['🗳️', 'Votação', schedule.voteAt]].filter((item) => item[2]);
  $('#roundScheduleBanner').classList.toggle('hidden', !scheduleItems.length);
  $('#roundScheduleBanner').innerHTML = scheduleItems.map(([icon, label, value]) => `<span>${icon}<b>${label}</b><small>${escapeHtml(new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date(value + 'T12:00:00')))}</small></span>`).join('');
  const wallpaperCount = data.submissions.length;
  const peopleCount = data.participants.length;
  ['#heroWallpaperCount','#wallpaperCount'].forEach((id) => $(id).textContent = wallpaperCount);
  ['#heroPeopleCount','#peopleCount'].forEach((id) => $(id).textContent = peopleCount);
  const uploadWindowNote = $('#uploadWindowNote');
  const choosingWallpapers = Boolean(data.workflow.roundId && data.workflow.phase === 'uploads');
  uploadWindowNote.classList.toggle('hidden', !choosingWallpapers);
  uploadWindowNote.classList.toggle('recovered', Boolean(choosingWallpapers && data.workflow.recoveredAt));
  if (choosingWallpapers) {
    const noteTitle = $('strong', uploadWindowNote);
    const noteText = $('small', uploadWindowNote);
    if (data.workflow.recoveredAt) {
      noteTitle.textContent = 'Tema preservado após reinício';
      noteText.textContent = 'O tema continua sendo “' + data.workflow.currentTheme + '”. Como as imagens ficam apenas na memória, todos devem enviar novamente; não é necessário sortear o tema outra vez.';
    } else {
      noteTitle.textContent = 'Período de escolha aberto · tema salvo';
      noteText.textContent = 'Escolham com calma: não existe prazo automático e o tema “' + data.workflow.currentTheme + '” fica mantido até a distribuição.';
    }
  }
  renderFeatureAvailability(data.settings?.featureFlags); renderTodayHub(data); renderWorkflow(); renderNotifications(); renderCasino(data.casino); renderRoundSummary(); renderGallery(); renderAssignments(); renderDraws(); renderDailyWall(data.dailyWall); renderAnonymousWall(data.anonymousWall); renderHydration(data.hydration); renderLieMeter(data.lieMeter); renderMystery(data.mystery); renderImpostor(data.impostor); renderProfileEconomy(data.profile); renderAdmin(); renderVoting(); renderRankings(); renderSeason(data.season); renderAnnouncement(data.announcement); drawWheel();
  const canUpload = Boolean(data.meCanUpload && data.settings?.featureFlags?.uploads !== false);
  $$('input,button', $('#uploadForm')).forEach((control) => { control.disabled = !canUpload; });
  const uploadLock = $('#uploadLock');
  uploadLock.classList.toggle('hidden', canUpload);
  if (!canUpload) {
    if (data.settings?.featureFlags?.uploads === false) uploadLock.textContent = '⏸️ Os envios foram pausados temporariamente pelo administrador.';
    else if (data.workflow.phase === 'theme') uploadLock.textContent = '🔒 Os envios abrem assim que o tema for sorteado.';
    else if (!data.participants.some((item) => item.id === data.me.id)) uploadLock.textContent = '🔒 Sua conta entra na próxima rodada.';
    else if (data.meHasSubmitted) uploadLock.textContent = '✓ Seu wallpaper foi recebido. Aguarde as outras pessoas.';
    else uploadLock.textContent = '🔒 Os envios desta rodada já foram encerrados.';
  }
  $('#wheelCaption').textContent = captionForMode();
  updateSpinControl();
  updateNextStepGuide(data, previousPhase);
}

function nextStepFor(data) {
  const phase = data.workflow.phase;
  if (phase === 'theme') return { target: '#sorteio', label: data.me.role === 'admin' ? 'Sortear o tema' : 'Acompanhar o tema', detail: data.me.role === 'admin' ? 'A roleta de temas está pronta.' : 'Aguarde o administrador iniciar ao vivo.' };
  if (phase === 'uploads') return { target: '#inscricoes', label: data.meCanUpload ? 'Enviar meu wallpaper' : 'Acompanhar os envios', detail: data.meCanUpload ? 'Escolha sua imagem e envie quando estiver pronto.' : 'Seu envio já chegou; veja quem ainda falta.' };
  if (phase === 'assignments') return { target: '#sorteio', label: data.me.role === 'admin' ? 'Distribuir wallpapers' : 'Acompanhar a distribuição', detail: 'A roleta entregará um wallpaper secreto para cada pessoa.' };
  if (phase === 'gay') return { target: '#sorteio', label: data.me.role === 'admin' ? 'Sortear o Gay da Rodada' : 'Acompanhar o sorteio', detail: 'Todos já receberam. Agora vem o sorteio especial.' };
  if (phase === 'voting') return { target: '#votingPanel', label: data.voting && data.voting.userHasVoted ? 'Acompanhar a votação' : 'Votar no melhor e no pior', detail: data.voting && data.voting.userHasVoted ? 'Seu voto foi salvo; acompanhe o progresso.' : 'Escolha uma opção em cada categoria.' };
  return { target: '#votingPanel', label: 'Ver o resultado da rodada', detail: 'Confira o melhor, o pior e as autorias reveladas.' };
}

function goToNextStep() {
  if (!appState) return;
  const targetSelector = nextStepFor(appState).target;
  const targetPage = targetSelector === '#inscricoes' ? 'inscricoes' : 'sorteio';
  showPortalPage(targetPage, true);
  const target = $(targetSelector);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  pendingGuidedNavigation = false;
}

function updateNextStepGuide(data, previousPhase) {
  const guide = nextStepFor(data);
  $('#nextStepTitle').textContent = guide.label;
  $('#nextStepDetail').textContent = guide.detail;
  $('#nextStepGuide').classList.remove('hidden');
  const phaseChanged = Boolean(previousPhase && previousPhase !== data.workflow.phase);
  if (phaseChanged && lastGuidedPhase !== data.workflow.phase) {
    lastGuidedPhase = data.workflow.phase;
    showToast('Próximo passo: ' + guide.label + '.');
    if ($('#winnerDialog').open || spinning) pendingGuidedNavigation = true;
    else setTimeout(goToNextStep, 450);
  } else if (!lastGuidedPhase) lastGuidedPhase = data.workflow.phase;
}

function playTone(frequency, duration, volume = .04) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    const audio = new Audio();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch {}
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function createWatermarkedWallpaper(result) {
  const status = $('#watermarkStatus');
  const download = $('#downloadWatermark');
  status.textContent = 'Preparando a marca d’água no wallpaper de ' + result.winner + '…';
  status.classList.remove('hidden');
  download.classList.add('hidden');
  if (!result.watermarkSourceUrl) {
    status.textContent = 'Não foi encontrado um wallpaper enviado por esta pessoa.';
    return;
  }
  try {
    const [source, logo] = await Promise.all([loadImage(result.watermarkSourceUrl), loadImage('/gay-da-rodada.png')]);
    const scale = Math.min(1, 3840 / Math.max(source.naturalWidth, source.naturalHeight));
    const output = document.createElement('canvas');
    output.width = Math.round(source.naturalWidth * scale);
    output.height = Math.round(source.naturalHeight * scale);
    const outputCtx = output.getContext('2d');
    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = 'high';
    outputCtx.drawImage(source, 0, 0, output.width, output.height);
    const logoWidth = Math.min(output.width * .26, 560 * scale);
    const logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
    const margin = Math.max(18, output.width * .025);
    const x = output.width - logoWidth - margin;
    const y = output.height - logoHeight - margin;
    outputCtx.save();
    outputCtx.globalAlpha = .9;
    outputCtx.shadowColor = 'rgba(0,0,0,.48)';
    outputCtx.shadowBlur = Math.max(10, output.width * .009);
    outputCtx.drawImage(logo, x, y, logoWidth, logoHeight);
    outputCtx.restore();
    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png', .94));
    if (!blob) throw new Error('Falha ao gerar a imagem.');
    if (watermarkObjectUrl) URL.revokeObjectURL(watermarkObjectUrl);
    watermarkObjectUrl = URL.createObjectURL(blob);
    $('#winnerImage').src = watermarkObjectUrl;
    download.href = watermarkObjectUrl;
    download.download = 'gay-da-rodada-' + result.winner.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') + '.png';
    download.classList.remove('hidden');
    status.textContent = '✓ Marca d’água aplicada em “' + (result.watermarkSourceTitle || 'wallpaper') + '”. Pronto para usar por uma semana.';
  } catch {
    status.textContent = 'Não foi possível gerar a versão marcada neste navegador.';
  }
}

function showWinner(result) {
  const isTheme = result.type === 'theme';
  const isThemeFinalist = isTheme && result.themeStage === 'finalist';
  const isGay = result.type === 'gay';
  $('#winnerDialog').classList.toggle('is-gay-winner', isGay);
  $('#winnerKicker').textContent = isThemeFinalist ? 'FINALISTA DEFINIDO…' : isTheme ? 'O TEMA SORTEADO É…' : isGay ? 'O ÍCONE DA VEZ É…' : 'WALLPAPER ENTREGUE';
  $('#winnerLabel').textContent = isThemeFinalist ? 'Tema finalista' : isTheme ? 'Tema da rodada' : isGay ? 'Gay da Rodada' : 'Quem recebeu';
  $('#winnerName').textContent = result.winner;
  $('#winnerDetail').textContent = isThemeFinalist ? 'Ele entrou na decisão final. Continue os sorteios até formar os 3 finalistas.' : isTheme ? 'Envios liberados: cada pessoa pode mandar uma imagem.' :
    isGay ? 'A faixa é sua. Aproveite a glória!' : 'Recebeu ' + result.wallpaperTitle + ' · 🔒 autoria secreta';
  const winnerImage = $('#winnerImage');
  const winnerVisual = winnerImage.parentElement;
  winnerVisual.classList.toggle('is-secret', !result.imageUrl);
  winnerImage.onerror = () => {
    // Um wallpaper restrito não deve aparecer como imagem quebrada para a equipe.
    winnerVisual.classList.add('is-secret');
    winnerImage.removeAttribute('src');
  };
  if (result.imageUrl) winnerImage.src = result.imageUrl;
  else winnerImage.removeAttribute('src');
  winnerImage.alt = result.winner;
  $('#watermarkStatus').classList.add('hidden');
  $('#downloadWatermark').classList.add('hidden');
  focusVotingAfterWinner = isGay;
  $('#closeWinnerButton').textContent = isThemeFinalist ? 'Continuar sorteio' : isTheme ? 'Abrir envios' : isGay ? 'Abrir votação' : 'Continuar distribuição';
  if ($('#winnerDialog').open) $('#winnerDialog').close();
  $('#winnerDialog').showModal();
  if (isGay && result.watermarkSourceUrl) createWatermarkedWallpaper(result);
  playTone(660, .25, .06); setTimeout(() => playTone(880, .4, .05), 180);
}

function selectLiveMode(mode) {
  setMode(mode);
}

function finishLiveDraw(result) {
  $('.wheel-stage').classList.remove('is-spinning');
  document.body.classList.remove('roulette-cinema');
  musicForcedBySpin = false;
  showWinner(result);
  api('/api/state').then((data) => {
    spinning = false; liveWheelItems = null; canvas.style.transition = '';
    applyState(data);
  }).catch(() => {
    spinning = false; liveWheelItems = null; canvas.style.transition = '';
    drawWheel(); updateSpinControl();
  });
}

function receiveLiveDraw(payload) {
  const result = payload && payload.result;
  if (!appState || !result || handledDraws.has(result.id)) return;
  handledDraws.add(result.id);
  if (handledDraws.size > 40) handledDraws.delete(handledDraws.values().next().value);
  clearTimeout(liveSpinStartTimer); clearTimeout(liveSpinFinishTimer);
  drawRequestPending = false;
  spinning = true;
  const lockMusicForDraw = isMusicLockedForDrawDay();
  musicForcedBySpin = lockMusicForDraw && !musicWanted;
  if (lockMusicForDraw) startMusic(true);
  else if (musicWanted) startMusic();
  document.body.classList.add('roulette-cinema');
  $('.wheel-stage').classList.add('is-spinning');
  selectLiveMode(payload.mode || result.type);
  liveWheelItems = Array.isArray(payload.items) && payload.items.length ? payload.items : wheelItems();
  wheelRotation = 0;
  canvas.style.transition = 'none';
  canvas.style.transform = 'rotate(0deg)';
  drawWheel();
  canvas.getBoundingClientRect();
  $('#wheelCaption').textContent = 'Sorteio em andamento — toda a equipe está acompanhando ao vivo.';
  updateSpinControl();
  playTone(220, .18);
  const delay = Math.max(0, Number(payload.startedAt || Date.now()) - (Date.now() + serverClockOffset));
  liveSpinStartTimer = setTimeout(() => {
    const items = liveWheelItems || [];
    const index = Math.max(0, items.findIndex((item) => item.id === result.winnerId));
    const step = 360 / Math.max(1, items.length);
    const desired = (360 - ((index + .5) * step % 360)) % 360;
    const elapsed = Math.max(0, Date.now() + serverClockOffset - Number(payload.startedAt || Date.now()));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const remaining = reduced ? 100 : Math.max(300, Number(payload.duration || 5900) - elapsed);
    canvas.style.transition = 'transform ' + remaining + 'ms cubic-bezier(.12,.7,.05,1)';
    wheelRotation = 360 * 7 + desired;
    canvas.style.transform = 'rotate(' + wheelRotation + 'deg)';
    liveSpinFinishTimer = setTimeout(() => finishLiveDraw(result), remaining + 80);
  }, delay);
}

function connectLive() {
  if (!appState || liveSource) return;
  if (appState.realtimeTransport === 'adaptive-poll') {
    $('#liveStatus').textContent = 'SINCRONIZADO';
    schedulePortalSync(0);
    return;
  }
  $('#liveStatus').textContent = 'CONECTANDO';
  liveSource = new EventSource('/api/events');
  liveSource.addEventListener('ready', (event) => {
    const data = JSON.parse(event.data);
    serverClockOffset = Number(data.serverTime || Date.now()) - Date.now();
    musicEpoch = Number(data.musicEpoch || Date.now());
    $('#liveStatus').textContent = 'AO VIVO';
    startMusic();
  });
  liveSource.addEventListener('draw', (event) => {
    try { receiveLiveDraw(JSON.parse(event.data)); } catch {}
  });
  liveSource.addEventListener('reset', () => {
    api('/api/state').then((data) => {
      applyState(data); showToast('O administrador limpou o histórico. Uma nova rodada pode começar!');
    }).catch(() => {});
  });
  liveSource.addEventListener('refresh', (event) => {
    if (spinning || casinoSpinInProgress || mysteryOpeningInProgress) return;
    let reason = '';
    try { reason = JSON.parse(event.data).reason || ''; } catch {}
    if (reason === 'feedback') {
      refreshFeedback(true);
      return;
    }
    api('/api/state').then((data) => {
      applyState(data);
      if (reason === 'voting-closed') showToast('Votação concluída: autores, melhor e pior foram revelados!');
    }).catch(() => {});
  });
  liveSource.onopen = () => { $('#liveStatus').textContent = 'AO VIVO'; };
  liveSource.onerror = () => { if (appState) $('#liveStatus').textContent = 'SINCRONIZADO'; };
}

async function spin() {
  if (spinning || drawRequestPending || !wheelItems().length) return;
  if (!isDrawAdmin()) { showToast('Somente o administrador pode iniciar o sorteio.', 'error'); return; }
  drawRequestPending = true; updateSpinControl();
  try {
    receiveLiveDraw(await api('/api/draw', { method: 'POST', body: { type: activeMode } }));
  } catch (error) {
    drawRequestPending = false; updateSpinControl();
    showToast(error.message, 'error');
  }
}

$$('.auth-tab').forEach((button) => button.addEventListener('click', () => setAuthTab(button.dataset.authTab)));
$$('[data-go-register]').forEach((button) => button.addEventListener('click', () => setAuthTab('register')));
$$('[data-auth-dot]').forEach((button) => button.addEventListener('click', () => {
  setAuthSlide(Number(button.dataset.authDot)); startAuthCarousel();
}));
$$('[data-mobile-dot]').forEach((button) => button.addEventListener('click', () => {
  setAuthSlide(Number(button.dataset.mobileDot)); startAuthCarousel();
}));

function updateRememberAccessLabel() { $('#rememberMeStatus').textContent = $('#rememberMe').checked ? 'Ativado · fechar o navegador não encerra o acesso. Sair encerra a sessão por segurança.' : 'Desativado · será necessário entrar novamente depois.'; }
function restoreRememberedLogin() {
  const remembered = localStorage.getItem('area51RememberAccess') === 'true';
  $('#rememberMe').checked = remembered;
  if (remembered) $('#loginForm [name="username"]').value = localStorage.getItem('area51RememberedUsername') || '';
  updateRememberAccessLabel();
}
$('#rememberMe').addEventListener('change', () => {
  const remembered = $('#rememberMe').checked;
  localStorage.setItem('area51RememberAccess', String(remembered));
  if (!remembered) localStorage.removeItem('area51RememberedUsername');
  updateRememberAccessLabel();
});
restoreRememberedLogin();

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); primeMusicFromGesture(); const form = event.currentTarget; $('#loginError').textContent = ''; setBusy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form));
    showApp(await api('/api/login', { method: 'POST', body: values }));
    showPortalPage('memes', false);
    localStorage.setItem('area51RememberAccess', String(Boolean(values.rememberMe)));
    if (values.rememberMe) localStorage.setItem('area51RememberedUsername', String(values.username || '')); else localStorage.removeItem('area51RememberedUsername');
    form.reset();
  } catch (error) { $('#loginError').textContent = error.message; }
  finally { setBusy(form, false); }
});

$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault(); primeMusicFromGesture(); const form = event.currentTarget; $('#registerError').textContent = ''; setBusy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form));
    const data = await api('/api/register', { method: 'POST', body: values });
    form.reset(); setAuthTab('login');
    $('#loginError').textContent = data.message || 'Conta enviada para aprovação do administrador.';
    showToast('Conta criada! Aguarde a aprovação do administrador.');
  } catch (error) { $('#registerError').textContent = error.message; }
  finally { setBusy(form, false); }
});

$('#logoutButton').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showAuth();
});
$('#passwordButton').addEventListener('click', () => openPasswordDialog(false));
$('#themeToggle').addEventListener('click', () => {
  if (rainbowThemeForced || !appState) return;
  const dark = !document.body.classList.contains('theme-dark');
  localStorage.setItem('area51DarkMode:' + appState.me.id, dark ? 'on' : 'off');
  applyVisualTheme(appState);
  if (document.body.className.includes('profile-theme-')) document.body.classList.toggle('theme-light-override', !dark);
});
$('#musicToggle').addEventListener('click', () => {
  if (musicIsPlaying() && !isMusicLockedForDrawDay()) {
    musicWanted = false; localStorage.setItem('roundMusic', 'off'); pauseMusic();
    showToast('Música da rodada desativada.');
    return;
  }
  musicPrimedByGesture = true;
  primeMusicFromGesture();
  startMusic(true).then(() => {
    if (!musicIsPlaying()) showToast('Não foi possível tocar a trilha agora. Verifique o som do navegador.', 'error');
  });
});
$('#volumeDownButton').addEventListener('click', () => {
  const dialog = $('#area51ProDialog');
  if (!dialog.open) dialog.showModal();
});
function closeArea51Pro() { $('#area51ProDialog').close(); }
$('#closeArea51Pro').addEventListener('click', closeArea51Pro);
$('#declineArea51Pro').addEventListener('click', closeArea51Pro);
$('#area51ProDialog').addEventListener('click', (event) => { if (event.target === $('#area51ProDialog')) closeArea51Pro(); });
function closeMemeLightbox() { $('#memeLightbox').close(); }
$('#closeMemeLightbox').addEventListener('click', closeMemeLightbox);
$('#memeLightbox').addEventListener('click', (event) => { if (event.target === $('#memeLightbox')) closeMemeLightbox(); });
$('#closePasswordDialog').addEventListener('click', () => {
  if ($('#passwordDialog').dataset.forced !== 'true') $('#passwordDialog').close();
});
$('#passwordDialog').addEventListener('cancel', (event) => {
  if ($('#passwordDialog').dataset.forced === 'true') event.preventDefault();
});

$$('.mode-button').forEach((button) => button.addEventListener('click', () => {
  if (spinning) return;
  setMode(button.dataset.mode);
  canvas.style.transition = 'none'; wheelRotation = 0; canvas.style.transform = 'rotate(0deg)';
  requestAnimationFrame(() => { canvas.style.transition = ''; drawWheel(); });
  $('#wheelCaption').textContent = captionForMode();
  updateSpinControl();
}));
$('#spinButton').addEventListener('click', spin);
$('#markWallpaperSeenButton').addEventListener('click', async () => {
  const button = $('#markWallpaperSeenButton');
  button.disabled = true;
  try {
    const state = await api('/api/my-round/seen', { method: 'POST' });
    applyState(state);
    toast('Wallpaper marcado como visualizado.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); });
}

async function normalizeWallpaperDataUrl(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = objectUrl; await image.decode();
    const maxSide = 4096; const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d'); context.fillStyle = '#0b1220'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.92, .84, .76, .68]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 7.5 * 1024 * 1024) return fileToDataUrl(blob);
    }
    throw new Error('A imagem é grande demais. Escolha uma versão de até 8 MB ou reduza a resolução.');
  } catch (error) {
    throw new Error(error.message || 'Não foi possível preparar esta imagem. Tente exportá-la como JPG ou PNG.');
  } finally { URL.revokeObjectURL(objectUrl); }
}

function chooseFile(file) {
  $('#uploadError').textContent = '';
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    $('#uploadError').textContent = 'Escolha um arquivo de imagem.'; return;
  }
  if (file.size > 25 * 1024 * 1024) {
    $('#uploadError').textContent = 'A imagem deve ter no máximo 25 MB antes da otimização.'; return;
  }
  selectedFile = file; $('#fileName').textContent = file.name;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  const preview = $('#imagePreview');
  const previewImage = $('img', preview);
  const qualityHint = $('#imageQualityHint');
  previewImage.onload = () => {
    const width = previewImage.naturalWidth;
    const height = previewImage.naturalHeight;
    const landscape = width > height;
    const fourK = width >= 3840 && height >= 2160;
    const sixteenNine = Math.abs((width / height) - (16 / 9)) < 0.08;
    qualityHint.classList.remove('hidden', 'good');
    if (landscape && fourK && sixteenNine) {
      qualityHint.classList.add('good');
      qualityHint.textContent = '✓ ' + width + ' × ' + height + ' px — ótima qualidade para desktop 4K em paisagem.';
    } else if (!landscape) {
      qualityHint.textContent = 'Sugestão: esta imagem está em modo retrato (' + width + ' × ' + height + ' px). Para o fundo do desktop, prefira paisagem 16:9 em 3840 × 2160 px. O envio continua permitido.';
    } else if (!fourK) {
      qualityHint.textContent = 'Sugestão: ' + width + ' × ' + height + ' px pode perder nitidez no desktop. Prefira 3840 × 2160 px em paisagem. O envio continua permitido.';
    } else {
      qualityHint.textContent = 'Sugestão: a resolução está ótima, mas a proporção é diferente de 16:9. O envio continua permitido.';
    }
  };
  previewImage.src = previewObjectUrl;
  preview.classList.remove('hidden');
}
$('#wallpaperFile').addEventListener('change', (event) => chooseFile(event.target.files[0]));
['dragenter','dragover'].forEach((name) => $('#dropZone').addEventListener(name, (event) => { event.preventDefault(); $('#dropZone').classList.add('dragover'); }));
['dragleave','drop'].forEach((name) => $('#dropZone').addEventListener(name, (event) => { event.preventDefault(); $('#dropZone').classList.remove('dragover'); }));
$('#dropZone').addEventListener('drop', (event) => chooseFile(event.dataTransfer.files[0]));
$('#clearFile').addEventListener('click', () => {
  selectedFile = null;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  $('#wallpaperFile').value = ''; $('#imagePreview').classList.add('hidden'); $('#imageQualityHint').classList.add('hidden'); $('#fileName').textContent = 'PNG, JPG ou WEBP · até 8 MB';
});

$('#uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; $('#uploadError').textContent = '';
  if (!selectedFile) { $('#uploadError').textContent = 'Escolha uma imagem primeiro.'; return; }
  setBusy(form, true);
  try {
    const dataUrl = await normalizeWallpaperDataUrl(selectedFile);
    const data = await api('/api/uploads', { method: 'POST', body: { dataUrl } });
    applyState(data); form.reset(); selectedFile = null;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    $('#imagePreview').classList.add('hidden'); $('#imageQualityHint').classList.add('hidden'); $('#fileName').textContent = 'PNG, JPG ou WEBP · até 8 MB';
    showToast('Wallpaper enviado para a rodada!');
  } catch (error) { $('#uploadError').textContent = error.message; }
  finally { setBusy(form, false); if (appState) applyState(appState); }
});

function updateAdminUploadAction() {
  const select = $('#adminUploadUser');
  const option = select.selectedOptions[0];
  const replacing = option?.dataset.hasSubmission === 'true';
  $('#adminUploadSubmit').textContent = replacing ? 'Substituir wallpaper desta pessoa' : 'Enviar em nome da pessoa';
  $('#adminUploadStatus').textContent = replacing
    ? '⚠ Esta pessoa já enviou. A imagem atual será substituída antes da distribuição.'
    : '🔒 Somente o administrador verá quem realizou o envio assistido.';
  $('#adminUploadStatus').classList.toggle('warning', replacing);
}

function clearAdminUploadSelection() {
  selectedAdminUploadFile = null;
  if (adminUploadPreviewObjectUrl) URL.revokeObjectURL(adminUploadPreviewObjectUrl);
  adminUploadPreviewObjectUrl = null;
  $('#adminUploadFile').value = '';
  $('#adminUploadPreview').classList.add('hidden');
  $('#adminUploadFileName').textContent = 'Escolher wallpaper';
}

$('#adminUploadUser').addEventListener('change', updateAdminUploadAction);
$('#adminUploadFile').addEventListener('change', (event) => {
  const file = event.target.files[0]; $('#adminUploadError').textContent = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { $('#adminUploadError').textContent = 'Escolha uma imagem PNG, JPG ou WEBP.'; clearAdminUploadSelection(); return; }
  if (file.size > 8 * 1024 * 1024) { $('#adminUploadError').textContent = 'A imagem deve ter no máximo 8 MB.'; clearAdminUploadSelection(); return; }
  selectedAdminUploadFile = file; $('#adminUploadFileName').textContent = file.name;
  if (adminUploadPreviewObjectUrl) URL.revokeObjectURL(adminUploadPreviewObjectUrl);
  adminUploadPreviewObjectUrl = URL.createObjectURL(file);
  $('#adminUploadPreview img').src = adminUploadPreviewObjectUrl;
  $('#adminUploadPreview').classList.remove('hidden');
});
$('#clearAdminUploadFile').addEventListener('click', clearAdminUploadSelection);
$('#adminAssistedUploadForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const option = $('#adminUploadUser').selectedOptions[0];
  $('#adminUploadError').textContent = '';
  if (!selectedAdminUploadFile) { $('#adminUploadError').textContent = 'Escolha um wallpaper primeiro.'; return; }
  if (option?.dataset.hasSubmission === 'true' && !confirm('Esta pessoa já enviou um wallpaper. Deseja substituir a imagem atual?')) return;
  setBusy(form, true);
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(selectedAdminUploadFile); });
    applyState(await api('/api/admin/uploads', { method: 'POST', body: { targetUserId: $('#adminUploadUser').value, dataUrl } }));
    clearAdminUploadSelection(); showToast('Wallpaper enviado em nome do participante! 🛰️');
  } catch (error) { $('#adminUploadError').textContent = error.message; }
  finally { setBusy(form, false); }
});

$('#closeAnnouncement').addEventListener('click', acknowledgeAnnouncement);
$('#acknowledgeAnnouncement').addEventListener('click', acknowledgeAnnouncement);
$('#announcementDialog').addEventListener('cancel', (event) => { event.preventDefault(); acknowledgeAnnouncement(); });

$('#gallery').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-upload]');
  if (!button || !confirm('Remover este wallpaper da rodada?')) return;
  try { applyState(await api('/api/uploads/' + button.dataset.deleteUpload, { method: 'DELETE' })); showToast('Wallpaper removido.'); }
  catch (error) { showToast(error.message, 'error'); }
});

function clearMemeSelection() {
  selectedMemeFile = null;
  if (memePreviewObjectUrl) URL.revokeObjectURL(memePreviewObjectUrl);
  memePreviewObjectUrl = null;
  $('#memeFile').value = '';
  $('#memePreview').classList.add('hidden');
  $('#memeFileName').textContent = 'Escolher meme';
}

function chooseMemeFile(file) {
  $('#memeUploadError').textContent = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    $('#memeUploadError').textContent = 'Escolha um arquivo PNG, JPG ou WEBP.'; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    $('#memeUploadError').textContent = 'O meme deve ter no máximo 5 MB.'; return;
  }
  selectedMemeFile = file;
  $('#memeFileName').textContent = file.name;
  if (memePreviewObjectUrl) URL.revokeObjectURL(memePreviewObjectUrl);
  memePreviewObjectUrl = URL.createObjectURL(file);
  $('#memePreview img').src = memePreviewObjectUrl;
  $('#memePreview').classList.remove('hidden');
}

$('#dailyPhraseInput').addEventListener('input', (event) => {
  $('#dailyPhraseCount').textContent = String(event.currentTarget.value.length);
});
$('#dailyPhraseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const phrase = $('#dailyPhraseInput').value.trim();
  if (!phrase) { showToast('Digite a frase do dia.', 'error'); return; }
  setBusy(form, true);
  try {
    applyState(await api('/api/daily-wall/phrases', { method: 'POST', body: { phrase } }));
    form.reset();
    $('#dailyPhraseCount').textContent = '0';
    showToast('Frase do dia publicada!');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
async function handleDailyReaction(event) {
  const button = event.target.closest('[data-reaction-id]');
  if (!button) return false;
  try { applyState(await api('/api/daily-wall/reactions', { method: 'POST', body: { targetType: button.dataset.reactionType, targetId: button.dataset.reactionId, emoji: button.dataset.reactionEmoji } })); }
  catch (error) { showToast(error.message, 'error'); }
  return true;
}
$('#memeFile').addEventListener('change', (event) => chooseMemeFile(event.target.files[0]));
$('#clearMemeFile').addEventListener('click', clearMemeSelection);
$('#memeUploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#memeUploadError').textContent = '';
  const caption = $('#memeCaption').value.trim();
  const anonymous = Boolean($('#feedPostAnonymous').checked);
  if (!selectedMemeFile && !caption) { $('#memeUploadError').textContent = 'Escreva uma legenda, adicione uma imagem ou use os dois.'; return; }
  setBusy(form, true);
  try {
    if (!selectedMemeFile) {
      applyState(await api('/api/daily-wall/phrases', { method: 'POST', body: { phrase: caption, anonymous } }));
      form.reset(); clearMemeSelection(); showToast(anonymous ? 'Frase anônima publicada no feed!' : 'Frase publicada no feed!'); return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(selectedMemeFile);
    });
    applyState(await api('/api/memes', { method: 'POST', body: { dataUrl, caption, anonymous } }));
    form.reset(); clearMemeSelection(); showToast(anonymous ? 'Publicação anônima enviada ao feed!' : 'Publicação enviada ao feed!');
  } catch (error) { $('#memeUploadError').textContent = error.message; }
  finally { setBusy(form, false); }
});
$('#clearDailyMemesButton').addEventListener('click', async () => {
  if (!confirm('Encerrar e limpar o mural atual? As publicações, comentários e reações ficarão guardados no Histórico do mural.')) return;
  try {
    applyState(await api('/api/admin/daily-wall/clear', { method: 'POST' }));
    showToast('Mural encerrado e arquivado. Podem postar novamente!');
  } catch (error) { showToast(error.message, 'error'); }
});
$('#dailyWallHistory').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-wall-history-id]');
  if (!button) return;
  try {
    const archive = await api('/api/daily-wall/history/' + encodeURIComponent(button.dataset.wallHistoryId));
    const dialog = document.createElement('dialog');
    dialog.className = 'daily-wall-history-dialog';
    const archiveAuthor = escapeHtml(formatDisplayName(archive.closedByName || 'Administrador'));
    const archiveDate = escapeHtml(formatDate(archive.closedAt));
    const phrases = (archive.phrases || []).map((item) => `<article><blockquote>${escapeHtml(item.phrase)}</blockquote><small>${item.anonymous ? '🕵️ Anônimo' : 'Por ' + escapeHtml(formatDisplayName(item.authorName))} · ${escapeHtml(formatDate(item.createdAt))}</small></article>`).join('') || '<p>Nenhuma frase nesta edição.</p>';
    const memes = (archive.memes || []).map((item) => `<figure><img src="${escapeHtml(item.imageUrl)}" alt="Meme arquivado"><figcaption>${item.anonymous ? '🕵️ Anônimo' : escapeHtml(formatDisplayName(item.authorName))}${item.caption ? ' · ' + escapeHtml(item.caption) : ''}</figcaption></figure>`).join('') || '<p>Nenhum meme nesta edição.</p>';
    dialog.innerHTML = `<button class="daily-history-close" type="button" aria-label="Fechar histórico">×</button><small>MURAL ARQUIVADO</small><h2>${archiveDate}</h2><p>Encerrado por ${archiveAuthor}. Publicações preservadas para consulta.</p><section><h3>Frases</h3>${phrases}</section><section><h3>Memes</h3><div class="daily-history-memes">${memes}</div></section>`;
    dialog.addEventListener('click', (click) => { if (click.target === dialog || click.target.closest('.daily-history-close')) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog); dialog.showModal();
  } catch (error) { showToast(error.message, 'error'); }
});
$('#dailyPhraseList').addEventListener('click', async (event) => {
  if (await handleDailyReaction(event)) return;
  const button = event.target.closest('[data-delete-phrase]');
  if (!button || !confirm('Excluir esta frase do mural?')) return;
  try {
    applyState(await api('/api/daily-wall/phrases/' + encodeURIComponent(button.dataset.deletePhrase), { method: 'DELETE' }));
    showToast('Frase excluída.');
  } catch (error) { showToast(error.message, 'error'); }
});
$('#dailyMemeGallery').addEventListener('click', async (event) => {
  if (await handleDailyReaction(event)) return;
  const deleteButton = event.target.closest('[data-delete-meme]');
  if (deleteButton) {
    if (!appState || appState.me.role !== 'admin') return;
    if (!confirm('Excluir somente este meme do mural?')) return;
    try {
      applyState(await api('/api/admin/memes/' + encodeURIComponent(deleteButton.dataset.deleteMeme), { method: 'DELETE' }));
      showToast('Meme excluído do mural.');
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }
  const openButton = event.target.closest('[data-meme-url]');
  if (!openButton) return;
  $('#memeLightboxImage').src = openButton.dataset.memeUrl;
  $('#memeLightboxAuthor').textContent = openButton.dataset.memeAuthor;
  $('#memeLightboxDate').textContent = openButton.dataset.memeDate;
  if (!$('#memeLightbox').open) $('#memeLightbox').showModal();
});

$('#anonymousPostMessage').addEventListener('input', (event) => {
  $('#anonymousPostCount').textContent = String(event.currentTarget.value.length);
});
$('#anonymousPostForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#anonymousPostMessage').value.trim();
  if (message.length < 3) { showToast('Escreva um pouco mais antes de publicar.', 'error'); return; }
  setBusy(form, true);
  try {
    applyState(await api('/api/anonymous-posts', { method: 'POST', body: { message } }));
    form.reset(); $('#anonymousPostCount').textContent = '0';
    showToast('Publicação enviada anonimamente.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#anonymousPostList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-anonymous-post]');
  if (!button || !appState || appState.me.role !== 'admin') return;
  if (!confirm('Excluir esta publicação anônima?')) return;
  try {
    applyState(await api('/api/admin/anonymous-posts/' + encodeURIComponent(button.dataset.deleteAnonymousPost), { method: 'DELETE' }));
    showToast('Publicação anônima excluída.');
  } catch (error) { showToast(error.message, 'error'); }
});

async function addWater(ml, control) {
  if (control) control.disabled = true;
  try {
    const previousWallet = Number(appState.profile && appState.profile.wallet || 0);
    const data = await api('/api/water', { method: 'POST', body: { ml } });
    const earned = Number(data.profile && data.profile.wallet || 0) - previousWallet;
    applyState(data);
    showToast(ml.toLocaleString('pt-BR') + ' ml registrados.' + (earned > 0 ? ' Você ganhou ' + earned + ' Créditos 51! 🪙' : ' Saúde! 💧'));
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (control) control.disabled = false; }
}
$('.water-quick-actions').addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-water-shortcut]');
  if (removeButton) {
    removeCustomWaterAmount(Number(removeButton.dataset.removeWaterShortcut));
    showToast('Atalho personalizado removido.');
    return;
  }
  const button = event.target.closest('[data-water-ml]');
  if (button) addWater(Number(button.dataset.waterMl), button);
});
$('#customWaterForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const ml = Number($('#customWaterMl').value);
  if (!Number.isInteger(ml) || ml < 50 || ml > 2000) { showToast('Informe uma quantidade entre 50 e 2000 ml.', 'error'); return; }
  setBusy(form, true);
  try {
    const previousWallet = Number(appState.profile && appState.profile.wallet || 0);
    const data = await api('/api/water', { method: 'POST', body: { ml } });
    const earned = Number(data.profile && data.profile.wallet || 0) - previousWallet;
    applyState(data);
    rememberCustomWaterAmount(ml);
    renderWaterQuickActions();
    form.reset(); showToast(ml.toLocaleString('pt-BR') + ' ml registrados.' + (earned > 0 ? ' Você ganhou ' + earned + ' Créditos 51! 🪙' : ' Saúde! 💧'));
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#waterEntryList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-water]');
  if (!button || !confirm('Desfazer este registro de água?')) return;
  try {
    applyState(await api('/api/water/' + encodeURIComponent(button.dataset.deleteWater), { method: 'DELETE' }));
    showToast('Registro de água removido.');
  } catch (error) { showToast(error.message, 'error'); }
});
function closeWaterReminder() { $('#waterReminderDialog').close(); }
$('#closeWaterReminder').addEventListener('click', closeWaterReminder);
$('#waterReminderLater').addEventListener('click', closeWaterReminder);
$('#waterReminderGo').addEventListener('click', () => {
  closeWaterReminder();
  showPortalPage('agua', true);
  setTimeout(() => $('#customWaterMl').focus(), 450);
});
$('#waterReminderDialog').addEventListener('click', (event) => { if (event.target === $('#waterReminderDialog')) closeWaterReminder(); });

let lenderLossStreak = 0;
function offerStellarLoan(result) {
  lenderLossStreak = result.net < 0 ? lenderLossStreak + 1 : 0;
  if (lenderLossStreak < 2 || appState?.profile?.loan) return;
  const key = 'area51LoanOffer:' + appState.me.id;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'stellar-offer';
  dialog.innerHTML = '<img class="stellar-lender-character" src="/stellar-lender.svg" alt="ET agiota de corpo inteiro, de terno, óculos escuros e maleta de créditos"><h2>Agiota Estelar</h2><p>Quer conhecer os empréstimos de créditos fictícios?</p><p>Juros fixos de 20%, prazo de 48 horas. O empréstimo não melhora suas chances de ganhar. Atrasos têm penalidades.</p><button type="button" data-loan-details>Ver condições no perfil</button><button type="button" data-loan-dismiss>Agora não</button>';
  document.body.append(dialog);
  dialog.querySelector('[data-loan-dismiss]').onclick = () => dialog.close();
  dialog.querySelector('[data-loan-details]').onclick = () => { dialog.close(); showPortalPage('perfil', true); $('#stellarLoanCard').scrollIntoView({block:'center'}); };
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  dialog.showModal();
}

async function submitRouletteBet(bet, walletSource) {
  const key = 'area51PendingRoulette:' + appState.me.id;
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(key) || 'null');
    if (!pending) {
      pending = { requestId: crypto.randomUUID(), bet, walletSource, compact:true };
      localStorage.setItem(key, JSON.stringify(pending));
    }
  } catch { throw new Error('Não foi possível proteger a aposta neste navegador. Nenhum pedido foi enviado.'); }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await api('/api/casino/play', { method:'POST', body:pending });
      try { localStorage.removeItem(key); } catch { /* Same ID remains safe on the next attempt. */ }
      return data;
    } catch (error) {
      const rejected = [400,401,403].includes(error.status) || (error.status === 409 && /insuficiente/i.test(error.message));
      if (rejected) { try { localStorage.removeItem(key); } catch {} throw error; }
      if (attempt === 1) throw new Error('Ainda não foi possível confirmar a aposta. Clique novamente para recuperar esta mesma jogada, sem criar outra.');
      $('#casinoResult').textContent = 'Conferindo a mesma aposta… não feche esta tela.';
    }
  }
}

$('#casinoForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (casinoSpinInProgress) return;
  const form = event.currentTarget; const bet = Number($('#casinoBet').value); const walletSource = $('#casinoWalletSource').value;
  if (!Number.isInteger(bet) || bet < 1) { showToast('Aposte um valor inteiro de pelo menos 1 crédito.', 'error'); return; }
  casinoSpinInProgress = true; setBusy(form, true); $('#casinoResult').textContent = 'Confirmando sua aposta…';
  try {
    const data = await submitRouletteBet(bet, walletSource);
    const result = data.casinoResult;
    $('#casinoResult').textContent = 'A roleta está girando… o resultado será revelado quando ela parar.';
    await animateCasinoWheel(result.segmentIndex, result.wheelValue ?? result.multiplier);
    if (result.resultType === 'mysteryBox') {
      const message = `${result.mysteryBox?.icon || '🎁'} ${result.mysteryBox?.name || 'Baú misterioso'} ganho! Sua aposta voltou e o baú está fechado no perfil.`;
      $('#casinoResult').textContent = message; showToast(message);
    } else {
      const message = result.net > 0 ? `Você ganhou ${result.net} créditos de lucro! 🚀` : result.net < 0 ? `Você perdeu ${Math.abs(result.net)} créditos. 👽` : 'Empate: seus créditos voltaram. 🛸';
      $('#casinoResult').textContent = `x${String(result.multiplier).replace('.', ',')} · retorno total ${result.payout} · ${message}`; showToast(message);
    }
    offerStellarLoan(result);
    try { const fresh = await api('/api/state', {}, false); casinoSpinInProgress = false; applyState(fresh); }
    catch { showToast('Resultado confirmado. O saldo será atualizado quando a conexão voltar.'); }
  } catch (error) { $('#casinoResult').textContent = error.message; showToast(error.message, 'error'); }
  finally { casinoSpinInProgress = false; setBusy(form, false); renderCasino(appState?.casino); }
});

$('#flightForm').addEventListener('submit', async (event) => {
  event.preventDefault(); if ($('#flightSky').dataset.phase === 'flying') return; const form = event.currentTarget; const bet = Number($('#flightBet').value); const walletSource = $('#flightWalletSource').value;
  if (!Number.isInteger(bet) || bet < 1) { showToast('Aposte um valor inteiro de pelo menos 1 crédito.', 'error'); return; }
  setBusy(form, true);
  try { const data = await flightApi('/api/casino/flight/start', { method: 'POST', body: { bet, walletSource, autoCashout:Number($('#flightAutoCashout').value)||null } }); applyState(data); startFlightPolling(); showToast('Aposta confirmada. Todos decolam juntos ao fim da contagem!'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#flightCashoutButton').addEventListener('click', async () => {
  if (!flightInProgress) return; const button = $('#flightCashoutButton'); flightCashoutLocallyReady = false; button.disabled = true; button.dataset.requesting = 'true'; button.textContent = 'Resgatando…'; $('#flightMessage').textContent = 'Pedido de resgate enviado…';
  flightPollGeneration++; clearTimeout(flightPollTimer); clearTimeout(flightCashoutReadyTimer); flightPollTimer = null;
  try { const data = await flightApi('/api/casino/flight/cashout', { method: 'POST', body:{flightId:flightCurrentId,compact:true} }); setFlightVisual(true, data.flightResult.multiplier, `Você resgatou ${data.flightResult.payout} créditos · aguardando a queda global`, { phase: 'flying', joined: true, canCashOut: false }); startFlightPolling(); showToast(`Voo resgatado em x${Number(data.flightResult.multiplier || 1).toFixed(2).replace('.', ',')}! 🚀`); }
  catch (error) { stopFlightPolling(); $('#flightMessage').textContent=error.message; showToast(error.message, 'error'); startFlightPolling(); }
  finally { delete button.dataset.requesting; }
});

$('#stellarLoanCard').addEventListener('click', async (event) => {
  const borrow = event.target.closest('[data-loan-borrow]'); const repay = event.target.closest('[data-loan-repay],[data-loan-repay-all]');
  if (!borrow && !repay) return;
  const button = borrow || repay; button.disabled = true;
  try {
    if (borrow) {
      const amount = Number(borrow.dataset.loanBorrow);
      if (!confirm(`Receber ${amount} créditos e devolver ${Math.round(amount * 1.2)} em 48 horas?\n\nAtraso ativa tema de cobrança e cursor com acompanhamento lento, e impede entrar na próxima rodada. Resgates promocionais pagam a dívida primeiro. Nenhum dinheiro real.`)) return;
      applyState(await api('/api/loans/borrow', { method: 'POST', body: { amount } })); showToast('O Agiota Estelar depositou seus créditos. 🛸');
    } else {
      const loan = appState?.profile?.loan; const amount = repay.hasAttribute('data-loan-repay-all') ? Number(loan?.remainingDue || 0) : Number($('#stellarRepayAmount').value);
      applyState(await api('/api/loans/repay', { method: 'POST', body: { amount } })); showToast(amount >= Number(loan?.remainingDue || Infinity) ? 'Empréstimo quitado! Você está livre do Agiota. ✨' : 'Pagamento registrado.');
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#casinoCashoutButton').addEventListener('click', async () => {
  const button = $('#casinoCashoutButton'); button.disabled = true;
  try { const data = await api('/api/casino/cashout', { method: 'POST' }); applyState(data); showToast(`${Number(data.casinoCashout || 0).toLocaleString('pt-BR')} créditos liberados para a Loja 51!${data.debtPayment ? ` ${data.debtPayment} usados para pagar sua dívida.` : ''} 🪙`); }
  catch (error) { showToast(error.message, 'error'); }
  finally { renderCasino(appState?.casino); }
});

$('#mysteryOpeningDialog').addEventListener('cancel', (event) => event.preventDefault());

$('#mysteryInventory').addEventListener('click', async (event) => {
  const openButton = event.target.closest('[data-box-open]');
  const sellButton = event.target.closest('[data-box-sell]');
  const button = openButton || sellButton;
  if (!button) return;
  const boxName = button.dataset.boxName || 'Baú misterioso';
  if (sellButton && !confirm(`Vender “${boxName}” fechado por ${Number(button.dataset.boxPrice || 0).toLocaleString('pt-BR')} Créditos 51?`)) return;
  if (openButton && !confirm(`Abrir “${boxName}” agora? O prêmio será definido pela roleta e o baú será consumido.`)) return;
  button.disabled = true;
  try {
    if (openButton) {
      const data = await api('/api/mystery-boxes/open', { method: 'POST', body: { inventoryId: button.dataset.boxOpen } });
      const decidedState = await showMysteryOpening(boxName, data.mysteryReward); applyState(decidedState || data);
      showToast('O baú revelou: ' + data.mysteryReward.icon + ' ' + data.mysteryReward.name + '!');
    } else {
      const data = await api('/api/mystery-boxes/sell', { method: 'POST', body: { inventoryId: button.dataset.boxSell } });
      applyState(data); showToast(`${data.soldBox.name} vendido por ${Number(data.soldBox.amount).toLocaleString('pt-BR')} Créditos 51. 🪙`);
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#mysteryRewardInventory').addEventListener('click', async (event) => {
  const keepButton = event.target.closest('[data-reward-keep]');
  const sellButton = event.target.closest('[data-reward-sell]');
  const button = keepButton || sellButton;
  if (!button) return;
  const name = sellButton?.dataset.rewardName || 'este prêmio';
  if (sellButton && !confirm(`Vender “${name}” agora por ${Number(sellButton.dataset.rewardPrice || 0).toLocaleString('pt-BR')} Créditos 51? Depois não será possível recuperar o item.`)) return;
  button.disabled = true;
  try {
    if (keepButton) {
      applyState(await api('/api/mystery-rewards/keep', { method: 'POST', body: { purchaseId: keepButton.dataset.rewardKeep } }));
      showToast('Prêmio guardado na sua coleção. Agora você já pode usá-lo.');
    } else {
      const data = await api('/api/mystery-rewards/sell', { method: 'POST', body: { purchaseId: sellButton.dataset.rewardSell } });
      applyState(data); showToast(`${data.soldReward.name} vendido por ${Number(data.soldReward.amount).toLocaleString('pt-BR')} créditos.`);
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#shopFilters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-shop-filter]');
  if (!button) return;
  shopFilter = button.dataset.shopFilter;
  $$('[data-shop-filter]', $('#shopFilters')).forEach((item) => item.classList.toggle('active', item === button));
  renderProfileEconomy(appState.profile);
});
$('#hideOwnedVisuals').addEventListener('change', (event) => {
  hideOwnedVisuals = event.currentTarget.checked;
  localStorage.setItem('area51-hide-owned-visuals', String(hideOwnedVisuals));
  renderProfileEconomy(appState.profile);
});
document.addEventListener('click', (event) => {
  const oddsTrigger = event.target.closest('[data-box-odds]');
  if (!oddsTrigger && event.target.closest('[data-shop-action], [data-shop-preview], [data-shop-free], .shop-card-actions')) return;
  const box = oddsTrigger?.closest('.shop-item[data-box-info]') || event.target.closest('.shop-item[data-box-info]');
  if (!box) return;
  const credits = Number(box.dataset.boxCredit || 0); const powers = Number(box.dataset.boxPower || 0); const visual = Math.max(0, 100 - credits - powers);
  const minPrice = Number(box.dataset.boxRewardMin || 0); const maxPrice = Number(box.dataset.boxRewardMax || 0);
  const catalog = Array.isArray(appState?.profile?.shop) ? appState.profile.shop : [];
  const rewardsFor = (type) => { const base = catalog.filter((item) => !item.cardPack && !item.mysteryBox && !item.service && (type === 'power' ? item.type === 'power' : item.type !== 'power') && (item.consumable || !item.owned)); const inRange = base.filter((item) => Number(item.price || 0) >= minPrice && Number(item.price || 0) <= maxPrice); return inRange.length ? inRange : base; };
  const powerItems = rewardsFor('power'); const visualItems = rewardsFor('visual'); const physicalChance = Number(box.dataset.boxPhysicalChance || 0);
  const cardFor = (item, totalChance, kind, count) => `<article class="mystery-odds-card"><span>${escapeHtml(item.icon || (kind === 'PODER' ? '🎟️' : '✨'))}</span><div><small>${kind}</small><strong>${escapeHtml(item.name)}</strong><em>${(totalChance / Math.max(1, count)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de chance</em></div></article>`;
  const cards = [`<article class="mystery-odds-card mystery-odds-credit"><span>🪙</span><div><small>CRÉDITOS</small><strong>${Number(box.dataset.boxMin || 0)} a ${Number(box.dataset.boxMax || 0)} créditos</strong><em>${credits}% de chance</em></div></article>`, ...(physicalChance > 0 ? [`<article class="mystery-odds-card mystery-odds-physical"><span>📒</span><div><small>PRÊMIO FÍSICO ÚNICO</small><strong>Caderno e caneta doados</strong><em>${physicalChance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de chance</em></div></article>`] : []), ...powerItems.map((item) => cardFor(item, powers, 'PODER', powerItems.length)), ...visualItems.map((item) => cardFor(item, visual, 'VISUAL', visualItems.length))];
  $('#mysteryBoxOddsContent').innerHTML = `<header><span>${escapeHtml(box.dataset.boxIcon || '🎁')}</span><div><small>CHANCES DA CAIXA</small><h3>${escapeHtml(box.dataset.boxName || 'Caixa misteriosa')}</h3></div></header><p>O prêmio é definido apenas ao abrir. Navegue pelos itens que podem sair agora:</p><div class="mystery-box-summary"><span>🪙 Créditos <b>${credits}%</b></span><span>🎟️ Poder <b>${powers}%</b></span><span>✨ Visual <b>${visual}%</b></span>${physicalChance > 0 ? `<span>📒 Kit físico <b>${physicalChance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></span>` : ''}</div><section class="mystery-odds-carousel" aria-label="Prêmios possíveis"><button type="button" class="mystery-odds-nav" data-box-carousel="prev" aria-label="Prêmio anterior">‹</button><div class="mystery-odds-viewport"><div class="mystery-odds-track">${cards.join('')}</div></div><button type="button" class="mystery-odds-nav" data-box-carousel="next" aria-label="Próximo prêmio">›</button></section><footer>Cada item da mesma categoria tem a mesma chance. Itens já recebidos ou indisponíveis podem virar créditos.</footer>`;
  $('#mysteryBoxOddsDialog').showModal();
});
document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-box-carousel]'); if (!control) return;
  const viewport = control.closest('.mystery-odds-carousel')?.querySelector('.mystery-odds-viewport');
  if (viewport) viewport.scrollBy({ left: (control.dataset.boxCarousel === 'next' ? 1 : -1) * Math.max(220, viewport.clientWidth * .8), behavior: 'smooth' });
});
$('#closeMysteryBoxOddsDialog').addEventListener('click', () => $('#mysteryBoxOddsDialog').close());
$('#collectionCatalog').addEventListener('click', (event) => {
  const preview = event.target.closest('[data-shop-preview]');
  const free = event.target.closest('[data-shop-free]');
  const action = event.target.closest('[data-shop-action]');
  const source = preview || free || action;
  if (!source) return;
  const attribute = preview ? 'data-shop-preview' : free ? 'data-shop-free' : 'data-shop-item';
  const value = source.getAttribute(attribute);
  const original = $('#shopCatalog').querySelector(`[${attribute}="${CSS.escape(value)}"]`);
  if (original) original.click();
});
$('#giftCreditsForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try { applyState(await api('/api/gifts/credits', { method: 'POST', body: { targetId: $('#giftCreditsUser').value, amount: Number($('#giftCreditsAmount').value) } })); form.reset(); showToast('Presente secreto enviado! 🎁'); }
  catch (error) { showToast(error.message, 'error'); } finally { setBusy(form, false); }
});
$('#giftItemForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget;
  const selected = $('#giftShopItem').selectedOptions[0]; if (!selected || !confirm('Comprar “' + selected.textContent + '” como presente secreto?')) return;
  setBusy(form, true);
  try { applyState(await api('/api/gifts/item', { method: 'POST', body: { targetId: $('#giftItemUser').value, itemId: $('#giftShopItem').value } })); showToast('Item enviado como presente secreto! 🎁'); }
  catch (error) { showToast(error.message, 'error'); } finally { setBusy(form, false); }
});
$('#activePowersList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cancel-power]'); if (!button) return;
  if (!confirm('Cancelar esta reserva e devolver o poder ao seu inventário?')) return;
  button.disabled = true;
  try { applyState(await api('/api/powers/cancel', { method: 'POST', body: { itemId: button.dataset.cancelPower } })); showToast('Poder cancelado e devolvido ao inventário.'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#shopCatalog').addEventListener('click', (event) => {
  const previewButton = event.target.closest('[data-shop-preview]');
  if (previewButton) startShopPreview(previewButton.dataset.shopPreview);
});

$('#activePowersList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-profile-power-use]');
  if (!button) return;
  const shopButton = $(`#shopCatalog [data-shop-action]:not([data-shop-action="purchase"])[data-shop-item="${CSS.escape(button.dataset.profilePowerUse)}"]`);
  if (!shopButton) { showToast('Esse poder não está disponível agora.', 'error'); return; }
  shopButton.click();
});

$('#shopCatalog').addEventListener('click', async (event) => {
  const freeButton = event.target.closest('[data-shop-free]');
  const actionButton = event.target.closest('[data-shop-action]');
  const button = freeButton || actionButton;
  if (!button) return;
  button.disabled = true;
  try {
    if (freeButton) {
      const itemName = button.closest('.shop-item')?.querySelector('h4')?.textContent || 'este item';
      if (!confirm('Usar sua única Compra Grátis 51 em “' + itemName + '”?\n\nNenhum crédito será descontado e o passe será consumido.')) return;
      const data = await api('/api/shop/free-purchase', { method: 'POST', body: { itemId: button.dataset.shopFree } });
      applyState(data);
      showToast(data.mysteryReward ? 'Caixa aberta grátis! Você recebeu ' + data.mysteryReward.icon + ' ' + data.mysteryReward.name + '.' : 'Compra Grátis 51 utilizada: ' + itemName + ' é seu! 🎁');
    } else if (button.dataset.shopAction === 'sell-best-win') {
      if (!confirm('Vender 1 ponto de primeiro lugar por 500 Créditos 51?\n\nA vitória será removida do seu ranking e esta troca não poderá ser desfeita.')) return;
      applyState(await api('/api/shop/sell-best-win', { method: 'POST' }));
      showToast('Ponto vendido! 500 Créditos 51 foram adicionados ao seu saldo. 🏆');
    } else if (button.dataset.shopAction === 'purchase') {
      const quantityInput = button.closest('.shop-item')?.querySelector('[data-shop-quantity]');
      const quantity = quantityInput ? Number(quantityInput.value) : 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Escolha uma quantidade inteira entre 1 e 20.');
      const total = Number(button.dataset.shopPrice || 0) * quantity;
      if (!confirm(`Comprar ${quantity} unidade${quantity === 1 ? '' : 's'} por ${total.toLocaleString('pt-BR')} Créditos 51?`)) return;
      const data = await api('/api/shop/purchase', { method: 'POST', body: { itemId: button.dataset.shopItem, quantity } });
      applyState(data);
      if (button.dataset.shopType === 'cardPack') {
        showToast(`${quantity} pacotinho${quantity === 1 ? '' : 's'} guardado${quantity === 1 ? '' : 's'} no seu perfil.`);
        if (confirm('Compra concluída! Quer ir ao Perfil para abrir agora?')) showPortalPage('perfil', true);
      } else showToast(button.dataset.shopType === 'power' ? `${quantity} poder${quantity === 1 ? '' : 'es'} comprado${quantity === 1 ? '' : 's'}! 🎟️` : 'Item comprado e equipado! 🛍️');
    } else if (button.dataset.shopAction === 'mystery-purchase') {
      const itemName = button.closest('.shop-item')?.querySelector('h4')?.textContent || 'Caixa misteriosa';
      const quantityInput = button.closest('.shop-item')?.querySelector('[data-shop-quantity]');
      const quantity = quantityInput ? Number(quantityInput.value) : 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Escolha uma quantidade inteira entre 1 e 20.');
      const total = Number(button.dataset.shopPrice || 0) * quantity;
      if (!confirm(`Comprar ${quantity}x “${itemName}” por ${total.toLocaleString('pt-BR')} créditos?\n\nAs caixas irão fechadas para Meus baús no perfil.`)) return;
      const data = await api('/api/shop/purchase', { method: 'POST', body: { itemId: button.dataset.shopItem, quantity } });
      applyState(data); showToast(`${quantity} caixa${quantity === 1 ? '' : 's'} adicionada${quantity === 1 ? '' : 's'} ao seu perfil! 🎁`);
    } else if (button.dataset.shopAction === 'equip') {
      const itemId = button.dataset.equipped === 'true' ? null : button.dataset.shopItem;
      applyState(await api('/api/profile/equip', { method: 'POST', body: { type: button.dataset.shopType, itemId } }));
      const isTheme = button.dataset.shopType === 'siteTheme';
      showToast(itemId ? (isTheme ? 'Tema aplicado em todo o site. ✓' : 'Personalização equipada. ✓') : (isTheme ? 'Tema desativado. Visual padrão restaurado.' : 'Personalização removida.'));
    } else {
      const body = { itemId: button.dataset.shopItem };
      if (['cleanseCursor','loanExtension'].includes(button.dataset.shopValue)) {
        if (!confirm(button.dataset.shopValue === 'cleanseCursor' ? 'Usar Antídoto para remover uma maldição comprada? Sorteio e dívida não são removidos.' : 'Usar Acordo Estelar? O prazo recebe 24 horas adicionais, uma única vez por contrato. A dívida não diminui.')) return;
      } else if (button.dataset.shopValue === 'chooseTheme') {
        const theme = prompt('Qual será o tema da próxima rodada?');
        if (!theme) return;
        body.theme = theme;
        if (!confirm('Confirmar o uso deste poder?\n\nTema escolhido: “' + theme + '”.\nO poder será consumido e a próxima rodada será aberta imediatamente.')) return;
      } else if (button.dataset.shopValue === 'chooseGay') {
        const people = appState.participants || [];
        if (!people.length) throw new Error('Não há participantes disponíveis nesta rodada.');
        const answer = prompt('Quem será o Gay da Rodada?\n\n' + people.map((person) => '• ' + person.displayName).join('\n'));
        if (!answer) return;
        const target = people.find((person) => person.displayName.toLowerCase() === answer.trim().toLowerCase());
        if (!target) throw new Error('Digite exatamente um dos nomes exibidos.');
        body.targetId = target.id;
        if (!confirm('Confirmar o uso deste poder?\n\n' + target.displayName + ' ficará reservado como Gay da Rodada. O poder será consumido agora.')) return;
      } else if (button.dataset.shopValue === 'forceGayCursor' || button.dataset.shopValue === 'forceGiantCursor') {
        const giant = button.dataset.shopValue === 'forceGiantCursor';
        const duration = giant ? 'por 24 horas' : 'até esta rodada terminar';
        const people = (giant ? appState.powerParticipants : appState.participants) || [];
        if (!people.length) throw new Error('Não há participantes disponíveis nesta rodada.');
        const powerName = button.dataset.shopValue === 'forceGiantCursor' ? 'Maldição do Mouse Gigante' : 'Seta Gay Compulsória';
        const answer = prompt('Quem deverá usar ' + powerName + ' ' + duration + '?\n\n' + people.map((person) => '• ' + person.displayName).join('\n'));
        if (!answer) return;
        const target = people.find((person) => person.displayName.toLowerCase() === answer.trim().toLowerCase());
        if (!target) throw new Error('Digite exatamente um dos nomes exibidos.');
        body.targetId = target.id;
        if (!confirm('Confirmar o uso deste poder?\n\n' + target.displayName + ' usará o cursor especial ' + duration + '.')) return;
      } else if (button.dataset.shopValue === 'chooseWallpaper' || button.dataset.shopValue === 'assignWallpaper') {
        const wallpapers = appState.submissions || [];
        if (!wallpapers.length) throw new Error('Não há wallpapers disponíveis.');
        let target = appState.me;
        if (button.dataset.shopValue === 'assignWallpaper') {
          const people = appState.participants || [];
          const targetAnswer = prompt('Para quem você quer definir o wallpaper?\n\n' + people.map((person, index) => `${index + 1}. ${person.displayName}`).join('\n'));
          const targetIndex = Number(targetAnswer) - 1;
          if (!Number.isInteger(targetIndex) || !people[targetIndex]) return;
          target = people[targetIndex]; body.targetId = target.id;
        }
        const eligible = appState.submissions || [];
        const answer = prompt(`Escolha anonimamente o wallpaper que ${button.dataset.shopValue === 'chooseWallpaper' ? 'você receberá' : target.displayName + ' receberá'}:\n\n` + eligible.map((item, index) => `${index + 1}. ${item.title || 'Wallpaper ' + (index + 1)}`).join('\n') + '\n\nDigite o número:');
        const selected = eligible[Number(answer) - 1];
        if (!selected) return;
        body.submissionId = selected.id;
        if (!confirm(`Confirmar “${selected.title || 'Wallpaper escolhido'}” para ${button.dataset.shopValue === 'chooseWallpaper' ? 'você' : target.displayName}?\n\nA autoria continuará secreta e o poder será consumido.`)) return;
      } else if (button.dataset.shopValue === 'revealAuthor') {
        const wallpapers = (appState.submissions || []).filter((item) => !item.revealed && !item.isMine);
        if (!wallpapers.length) throw new Error('Não há wallpapers secretos disponíveis para revelar.');
        if (!confirm('Usar o Raio-X Total para revelar quem enviou todos os ' + wallpapers.length + ' wallpapers secretos desta rodada? Somente você verá os nomes.')) return;
      } else if (!confirm('Ativar o Escudo da Rodada agora?')) return;
      applyState(await api('/api/powers/use', { method: 'POST', body }));
      if (['cleanseCursor','loanExtension'].includes(button.dataset.shopValue)) { showToast('Poder aplicado com sucesso!'); return; }
      showToast(button.dataset.shopValue === 'chooseTheme' ? 'Tema escolhido e rodada aberta sem sorteio! 🎨' : button.dataset.shopValue === 'chooseGay' ? 'Escolha reservada para o sorteio especial. 👑' : button.dataset.shopValue === 'forceGayCursor' ? 'Seta compulsória aplicada durante esta rodada! 🌈' : button.dataset.shopValue === 'forceGiantCursor' ? 'Mouse gigante aplicado por 24 horas! 🐌' : button.dataset.shopValue === 'chooseWallpaper' ? 'Seu wallpaper foi reservado anonimamente! 🖼️' : button.dataset.shopValue === 'assignWallpaper' ? 'Wallpaper do participante reservado anonimamente! 🎯' : button.dataset.shopValue === 'revealAuthor' ? 'Todos os autores foram revelados somente para você. 🔎' : 'Escudo ativado nesta rodada! 🛡️');
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#votingForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  $('#voteError').textContent = '';
  if (!values.bestId || !values.worstId) { $('#voteError').textContent = 'Escolha o melhor e o pior wallpaper.'; return; }
  if (values.bestId === values.worstId) { $('#voteError').textContent = 'O melhor e o pior precisam ser imagens diferentes.'; return; }
  setBusy(form, true);
  try {
    applyState(await api('/api/vote', { method: 'POST', body: values }));
    votingDraft = { votingId: null, bestId: null, worstId: null };
    showToast('Voto registrado em segredo.');
  } catch (error) { $('#voteError').textContent = error.message; }
  finally { setBusy(form, false); }
});

$('#voteGrid').addEventListener('change', (event) => {
  const input = event.target.closest('input[type="radio"]');
  if (!input || !appState?.voting) return;
  votingDraft.votingId = appState.voting.id;
  if (input.name === 'bestId') votingDraft.bestId = input.value;
  if (input.name === 'worstId') votingDraft.worstId = input.value;
});

$('#closeVotingButton').addEventListener('click', async () => {
  if (!confirm('Encerrar a votação agora e revelar os autores?')) return;
  try {
    applyState(await api('/api/admin/voting/close', { method: 'POST' }));
    showToast('Votação encerrada. Autores revelados!');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#clearFinishedRoundButton').addEventListener('click', async () => {
  if (!confirm('Os arquivos pesados desta rodada serão apagados do armazenamento, mas o resultado e o histórico continuarão salvos. Já baixaram o wallpaper com a marca d’água?')) return;
  try {
    applyState(await api('/api/round/clear', { method: 'POST' }));
    showToast('Rodada encerrada. Arquivos apagados e histórico preservado.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { showToast(error.message, 'error'); }
});

$('#copyRoundRecapButton')?.addEventListener('click', async () => {
  const text = appState?.roundRecap?.text;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Resumo da rodada copiado para enviar no grupo.');
  } catch {
    showToast('O navegador bloqueou a cópia. Tente novamente após tocar na página.', 'error');
  }
});

$('#shareProfileCardButton')?.addEventListener('click', async () => {
  const profile = appState?.profile; if (!profile) return;
  const button = $('#shareProfileCardButton'); button.disabled = true;
  try {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 620;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 1080, 620); gradient.addColorStop(0, '#0b1b32'); gradient.addColorStop(.55, '#20143e'); gradient.addColorStop(1, '#063b51'); context.fillStyle = gradient; context.fillRect(0, 0, 1080, 620);
    context.strokeStyle = '#f4c74d'; context.lineWidth = 5; context.strokeRect(24, 24, 1032, 572);
    context.fillStyle = '#f6a34b'; context.font = 'bold 25px system-ui'; context.fillText('ÁREA 51 · CARTÃO DA TRIPULAÇÃO', 72, 100);
    context.fillStyle = '#fff7e7'; context.font = 'bold 70px Georgia'; context.fillText(formatDisplayName(appState.me.displayName), 72, 185);
    context.fillStyle = '#d5e4f6'; context.font = '28px system-ui'; context.fillText($('#profileEquippedTitle').textContent || 'Tripulante da Área 51', 75, 230);
    context.fillStyle = '#ffd968'; context.font = 'bold 46px system-ui'; context.fillText(Number(profile.wallet || 0).toLocaleString('pt-BR') + ' Créditos 51', 75, 330);
    const unlocked = (profile.medals || []).filter((medal) => medal.unlocked).slice(0, 4);
    context.fillStyle = '#bcd5f2'; context.font = 'bold 23px system-ui'; context.fillText('CONQUISTAS DESBLOQUEADAS', 75, 410);
    unlocked.forEach((medal, index) => { const x = 75 + index * 238; context.fillStyle = '#172a49'; context.fillRect(x, 438, 210, 100); context.fillStyle = '#fff'; context.font = '36px system-ui'; context.fillText(medal.icon, x + 15, 480); context.fillStyle = '#f6edff'; context.font = 'bold 17px system-ui'; context.fillText(medal.name.slice(0, 19), x + 62, 478); });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('Não foi possível montar o cartão.');
    const file = new File([blob], 'cartao-area-51.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'Meu cartão da Área 51', text: 'Meu perfil na Área 51', files: [file] });
    else { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('Cartão baixado para você enviar onde quiser.'); }
  } catch (error) { if (error.name !== 'AbortError') showToast(error.message || 'Não foi possível compartilhar agora.', 'error'); }
  finally { button.disabled = false; }
});

$('#trophyRoomOptions')?.addEventListener('change', (event) => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const selected = $$('#trophyRoomOptions input:checked');
  if (selected.length > 4) { event.target.checked = false; showToast('Escolha no máximo quatro conquistas.', 'error'); }
});

$('#saveTrophyRoomButton')?.addEventListener('click', async () => {
  const button = $('#saveTrophyRoomButton'); const ids = $$('#trophyRoomOptions input:checked').map((input) => input.value);
  button.disabled = true;
  try { applyState(await api('/api/profile/showcase', { method: 'POST', body: { ids } })); showToast('Sua Sala de Troféus foi atualizada. 🏛️'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

$('#eventModeToggle')?.addEventListener('change', (event) => {
  localStorage.setItem('area51-event-focus', String(event.target.checked));
  renderEventMode();
});

$('#eventModeActions')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-event-action]'); if (!button) return;
  if (button.dataset.eventAction === 'round') showPortalPage('sorteio', true);
  else if (button.dataset.eventAction === 'ready') $('#useReadyParticipantsButton')?.click();
  else if (button.dataset.eventAction === 'finish') $('#clearFinishedRoundButton')?.click();
});

$('#featureFlagsForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  const flags = Object.fromEntries(['casino','impostor','mystery','shop','uploads'].map((key) => [key, Boolean(form.elements[key].checked)]));
  try { applyState(await api('/api/admin/features', { method: 'PATCH', body: { flags } })); showToast('Recursos do site atualizados.'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});

$('#releaseUpdateButton').addEventListener('click', async () => {
  if (!confirm('Avisar todos os usuários conectados de que existe uma nova versão?')) return;
  try {
    applyState(await api('/api/admin/release-update', { method: 'POST' }));
    showToast('Atualização liberada para toda a equipe! 🚀');
  } catch (error) { showToast(error.message, 'error'); }
});
$('#announcementForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    applyState(await api('/api/admin/announcement', { method: 'POST', body: { title: $('#announcementTitle').value, message: $('#announcementMessage').value } }));
    form.reset(); showToast('Novo aviso publicado para toda a equipe! 📢');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#clearAnnouncementButton').addEventListener('click', async () => {
  if (!confirm('Remover o aviso atual? Quem ainda não visualizou deixará de recebê-lo.')) return;
  try { applyState(await api('/api/admin/announcement', { method: 'DELETE' })); showToast('Aviso removido.'); }
  catch (error) { showToast(error.message, 'error'); }
});

$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    const themes = $('#themesInput').value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!themes.length) throw new Error('Cadastre ao menos um tema para a roleta.');
    const data = await api('/api/admin/settings', { method: 'PATCH', body: { roundName: $('#roundInput').value, themes, excludeLastGayWinner: $('#excludeLast').checked } });
    applyState(data); showToast('Configurações salvas.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#clearVisualThemesButton')?.addEventListener('click', async () => {
  if (!confirm('Encerrar agora os temas especiais de quem perdeu ou foi sorteado? O histórico continua salvo.')) return;
  try { applyState(await api('/api/admin/visual-theme/clear', { method: 'POST' })); showToast('Temas especiais encerrados. Cada pessoa voltou ao seu tema normal.'); }
  catch (error) { showToast(error.message, 'error'); }
});
$('#scheduleForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try { applyState(await api('/api/admin/settings', { method: 'PATCH', body: { roundSchedule: { submissionsAt: $('#scheduleSubmissions').value, drawAt: $('#scheduleDraw').value, voteAt: $('#scheduleVote').value } } })); showToast('Calendário atualizado para toda a equipe.'); }
  catch (error) { showToast(error.message, 'error'); } finally { setBusy(form, false); }
});
$('#gateCodeForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try { applyState(await api('/api/admin/security/code', { method: 'POST', body: { code: $('#newGateCode').value, currentPassword: $('#gateAdminPassword').value } })); form.reset(); showToast('Código secreto alterado. Os dispositivos atuais continuam autorizados.'); }
  catch (error) { showToast(error.message, 'error'); } finally { setBusy(form, false); }
});
$('#authorizedDevices').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-revoke-device]'); if (!button || !confirm('Revogar este dispositivo?')) return;
  try { applyState(await api('/api/admin/security/devices/' + button.dataset.revokeDevice, { method: 'DELETE' })); showToast('Dispositivo revogado.'); } catch (error) { showToast(error.message, 'error'); }
});
$('#revokeAllDevices').addEventListener('click', async () => {
  if (!confirm('Todos os navegadores voltarão a ver a página 404, inclusive este. Continuar?')) return;
  try { await api('/api/admin/security/revoke-all', { method: 'POST' }); showToast('Todos os dispositivos foram revogados.'); setTimeout(() => location.reload(), 900); } catch (error) { showToast(error.message, 'error'); }
});
$('#downloadBackupButton').addEventListener('click', async () => {
  try { const response = await fetch('/api/admin/backup'); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Não foi possível criar o backup.'); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'area51-backup-' + new Date().toISOString().slice(0, 10) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1500); showToast('Backup completo baixado.'); } catch (error) { showToast(error.message, 'error'); }
});
$('#restoreBackupButton').addEventListener('click', async () => {
  const file = $('#restoreBackupFile').files[0]; if (!file) { showToast('Escolha um arquivo de backup.', 'error'); return; }
  if (!confirm('A restauração substituirá os dados atuais do site. Deseja continuar?')) return;
  try { const response = await fetch('/api/admin/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Falha ao restaurar backup.'); applyState(data); $('#restoreBackupFile').value = ''; showToast('Backup restaurado com sucesso.'); }
  catch (error) { showToast(error.message, 'error'); }
});

$('#adminUsers').addEventListener('click', async (event) => {
  const creditButton = event.target.closest('[data-credit-user]');
  if (creditButton) {
    $('#creditAdminUserId').value = creditButton.dataset.creditUser;
    $('#creditAdminUser').textContent = creditButton.dataset.userName + ' · saldo atual: ' + Number(creditButton.dataset.userWallet || 0).toLocaleString('pt-BR') + ' créditos';
    $('#creditAdminAmount').value = '';
    $('#creditAdminReason').value = '';
    $('#creditAdminError').textContent = '';
    $('#creditAdminDialog').showModal();
    return;
  }
  const editButton = event.target.closest('[data-edit-user]');
  if (editButton) {
    $('#editUserId').value = editButton.dataset.editUser;
    $('#editUserDisplayName').value = editButton.dataset.userName;
    $('#editUsername').value = editButton.dataset.userUsername;
    $('#userEditError').textContent = '';
    $('#userEditDialog').showModal();
    return;
  }
  const deleteButton = event.target.closest('[data-delete-user]');
  if (deleteButton) {
    if (!confirm('Excluir a conta de ' + deleteButton.dataset.userName + '? Os dados pessoais dessa conta também serão removidos.')) return;
    try {
      applyState(await api('/api/admin/users/' + deleteButton.dataset.deleteUser, { method: 'DELETE' }));
      showToast('Usuário excluído.');
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }
  const button = event.target.closest('[data-user-action]');
  if (!button) return;
  try {
    const body = {}; body[button.dataset.userAction] = button.dataset.value === 'true';
    applyState(await api('/api/admin/users/' + button.dataset.userId, { method: 'PATCH', body }));
  } catch (error) { showToast(error.message, 'error'); }
});

function closeCreditAdminDialog() { $('#creditAdminDialog').close(); }
$('#closeCreditAdminDialog').addEventListener('click', closeCreditAdminDialog);
$('#creditAdminDialog').addEventListener('click', (event) => { if (event.target === $('#creditAdminDialog')) closeCreditAdminDialog(); });
$('#creditAdminForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#creditAdminError').textContent = '';
  setBusy(form, true);
  try {
    applyState(await api('/api/admin/users/' + $('#creditAdminUserId').value + '/credits', { method: 'POST', body: {
      mode: $('#creditAdminMode').value, amount: Number($('#creditAdminAmount').value), reason: $('#creditAdminReason').value,
    } }));
    closeCreditAdminDialog(); showToast('Saldo de Créditos 51 atualizado.');
  } catch (error) { $('#creditAdminError').textContent = error.message; }
  finally { setBusy(form, false); }
});

function closeUserEditDialog() { $('#userEditDialog').close(); }
$('#closeUserEditDialog').addEventListener('click', closeUserEditDialog);
$('#userEditDialog').addEventListener('click', (event) => { if (event.target === $('#userEditDialog')) closeUserEditDialog(); });
$('#userEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $('#userEditError').textContent = '';
  setBusy(form, true);
  try {
    applyState(await api('/api/admin/users/' + $('#editUserId').value, { method: 'PATCH', body: {
      displayName: $('#editUserDisplayName').value,
      username: $('#editUsername').value,
    } }));
    closeUserEditDialog();
    showToast('Usuário atualizado.');
  } catch (error) { $('#userEditError').textContent = error.message; }
  finally { setBusy(form, false); }
});

$('#useReadyParticipantsButton').addEventListener('click', async () => {
  const readiness = appState && appState.readiness;
  if (!readiness || !readiness.canStartWithReady) return;
  const missingNames = readiness.missing.map((item) => item.displayName).join(', ');
  if (!confirm('Continuar somente com quem enviou? Ficarão fora desta rodada: ' + missingNames + '.')) return;
  try {
    applyState(await api('/api/admin/round/use-ready', { method: 'POST' }));
    showToast('Lista fechada. A distribuição já pode começar!');
    document.querySelector('#sorteio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { showToast(error.message, 'error'); }
});

$('#clearRoundButton').addEventListener('click', async () => {
  if (!confirm('Isso removerá todas as imagens inscritas nesta rodada. Deseja continuar?')) return;
  try { applyState(await api('/api/admin/clear-submissions', { method: 'POST' })); showToast('Inscrições limpas. A nova rodada pode começar!'); }
  catch (error) { showToast(error.message, 'error'); }
});

$('#clearHistoryButton').addEventListener('click', async () => {
  if (!confirm('Isso apagará definitivamente sorteios, votações, imagens e pontuações. Usuários e senhas serão preservados. Deseja continuar?')) return;
  try {
    applyState(await api('/api/admin/clear-history', { method: 'POST' }));
    showToast('Histórico apagado. O sistema está pronto para uma nova rodada!');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#clearLiesButton').addEventListener('click', async () => {
  if (!confirm('Zerar todas as mentiras confirmadas e apagar também as solicitações pendentes e recusadas? Esta ação não pode ser desfeita.')) return;
  try {
    applyState(await api('/api/admin/clear-lies', { method: 'POST' }));
    showToast('Contador de mentiras limpo com sucesso.');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#resetTestsButton').addEventListener('click', async () => {
  if (!confirm('Isso removerá todos os usuários, exceto Raul, além de imagens, sorteios, votações, vencedores e placares. Deseja continuar?')) return;
  try {
    applyState(await api('/api/admin/reset-tests', { method: 'POST' }));
    showToast('Ambiente limpo. Somente seu administrador foi mantido.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { showToast(error.message, 'error'); }
});

$('#resetMyPurchasesButton').addEventListener('click', async () => {
  if (!confirm('Zerar todas as suas compras, visuais e poderes de teste? Os créditos gastos serão devolvidos ao seu saldo.')) return;
  try {
    const data = await api('/api/admin/reset-my-purchases', { method: 'POST' });
    applyState(data);
    showToast('Compras zeradas. ' + Number(data.refundedCredits || 0).toLocaleString('pt-BR') + ' créditos foram devolvidos.');
  } catch (error) { showToast(error.message, 'error'); }
});


$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; $('#passwordError').textContent = ''; setBusy(form, true);
  try {
    applyState(await api('/api/change-password', { method: 'POST', body: Object.fromEntries(new FormData(form)) }));
    $('#passwordDialog').close(); form.reset(); showToast('Senha atualizada com sucesso.');
  } catch (error) { $('#passwordError').textContent = error.message; }
  finally { setBusy(form, false); }
});

function closeWinner() {
  $('#winnerDialog').close();
  if (focusVotingAfterWinner) {
    focusVotingAfterWinner = false;
    setTimeout(() => $('#votingPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } else if (pendingGuidedNavigation) {
    setTimeout(goToNextStep, 80);
  }
}
$('.dialog-close').addEventListener('click', closeWinner);
$('#closeWinnerButton').addEventListener('click', closeWinner);
$('#winnerDialog').addEventListener('click', (event) => { if (event.target === $('#winnerDialog')) closeWinner(); });
$('#nextStepButton').addEventListener('click', goToNextStep);

$('#feedbackLauncher').addEventListener('click', () => {
  if (feedbackPanelOpen) closeFeedbackPanel(false);
  else openFeedbackPanel();
});
$('#feedbackTopButton').addEventListener('click', () => {
  if (feedbackPanelOpen) closeFeedbackPanel(false);
  else openFeedbackPanel();
});
$('#feedbackClose').addEventListener('click', () => closeFeedbackPanel());
$$('[data-admin-feedback-filter]').forEach((button) => button.addEventListener('click', () => {
  adminFeedbackFilter = button.dataset.adminFeedbackFilter;
  renderAdminFeedback(feedbackMessages);
}));
$('#adminFeedbackList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-admin-feedback-status],[data-admin-feedback-save-comment],[data-admin-feedback-delete]');
  const item = event.target.closest('[data-feedback-id]');
  if (!button || !item || !appState || appState.me.role !== 'admin') return;
  const deleting = button.hasAttribute('data-admin-feedback-delete');
  const status = button.dataset.adminFeedbackStatus;
  if (deleting && !confirm('Excluir esta solicitação definitivamente? Ela deixará de aparecer também no histórico do administrador.')) return;
  if (status === 'archived' && !confirm('Arquivar esta solicitação? Ela deixará de aparecer para o autor, mas poderá ser restaurada no painel Admin.')) return;
  button.disabled = true;
  const previousLabel = button.textContent;
  button.textContent = 'Salvando…';
  try {
    const url = '/api/admin/feedback/' + encodeURIComponent(item.dataset.feedbackId);
    let data;
    if (deleting) data = await api(url, { method: 'DELETE' });
    else {
      const adminComment = $('textarea', item).value;
      const body = { adminComment };
      if (status) body.status = status;
      data = await api(url, { method: 'PATCH', body });
    }
    renderAdminFeedback(data.messages);
    showToast(deleting ? 'Solicitação excluída definitivamente.' : !status ? 'Comentário salvo.' : status === 'approved' ? 'Solicitação aprovada.' : status === 'done' ? 'Solicitação concluída!' : status === 'rejected' ? 'Solicitação não aprovada.' : status === 'archived' ? 'Solicitação arquivada.' : 'Solicitação voltou para análise.');
  } catch (error) {
    button.disabled = false;
    button.textContent = previousLabel;
    showToast(error.message, 'error');
  }
});
$('#feedbackMessage').addEventListener('input', (event) => {
  $('#feedbackCount').textContent = String(event.currentTarget.value.length);
});
$('#feedbackImage').addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  $('#feedbackImageName').textContent = file ? file.name : 'PNG, JPG ou WEBP · até 900 KB';
});
$('#feedbackMessage').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    $('#feedbackForm').requestSubmit();
  }
});
$('#feedbackForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#feedbackMessage').value.trim();
  $('#feedbackError').textContent = '';
  if (message.length < 3) {
    $('#feedbackError').textContent = 'Conte um pouco mais sobre a ideia ou o problema.';
    return;
  }
  setBusy(form, true);
  try {
    const type = $('input[name="type"]:checked', form).value;
    const file = $('#feedbackImage').files?.[0];
    let imageDataUrl = null;
    if (file) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 900000) throw new Error('Use um print PNG, JPG ou WEBP de até 900 KB.');
      imageDataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); });
    }
    const data = await api('/api/feedback', { method: 'POST', body: { type, message, imageDataUrl } });
    if (appState.me.role === 'admin') renderAdminFeedback(data.messages);
    else renderMyFeedback(data.messages);
    $('#feedbackMessage').value = '';
    $('#feedbackImage').value = ''; $('#feedbackImageName').textContent = 'PNG, JPG ou WEBP · até 900 KB';
    $('#feedbackCount').textContent = '0';
    form.classList.add('hidden');
    $('#feedbackSuccess').classList.remove('hidden');
  } catch (error) {
    $('#feedbackError').textContent = error.message;
  } finally {
    setBusy(form, false);
  }
});
$('#feedbackAgain').addEventListener('click', () => {
  $('#feedbackSuccess').classList.add('hidden');
  $('#feedbackForm').classList.remove('hidden');
  $('#feedbackMessage').focus();
});
$('#refreshMyFeedback').addEventListener('click', () => refreshFeedback());
$('#mentirometro').addEventListener('click', async (event) => {
  const disputeDecision = event.target.closest('[data-lie-dispute-decision]');
  const lieVote = event.target.closest('[data-lie-vote]');
  const changeButton = event.target.closest('[data-lie-target]');
  const validateButton = event.target.closest('[data-lie-validate]');
  const denyButton = event.target.closest('[data-lie-deny]');
  const cancelButton = event.target.closest('[data-lie-cancel]');
  if (!disputeDecision && !lieVote && !changeButton && !validateButton && !denyButton && !cancelButton) return;
  const button = disputeDecision || lieVote || changeButton || validateButton || denyButton || cancelButton;
  button.disabled = true;
  try {
    if (disputeDecision) {
      applyState(await api('/api/lie-disputes/' + disputeDecision.dataset.lieDisputeId + '/decision', { method: 'POST', body: { decision: disputeDecision.dataset.lieDisputeDecision } }));
      showToast('Sua decisão foi registrada. O placar só muda com consenso dos três.');
    } else if (lieVote) {
      applyState(await api('/api/lie-meter/' + lieVote.dataset.lieVoteId + '/vote', { method: 'POST', body: { vote: lieVote.dataset.lieVote } }));
      showToast('Voto registrado. A decisão sai quando toda a equipe votar.');
    } else if (changeButton) {
      const delta = Number(changeButton.dataset.lieDelta);
      const reason = delta > 0 ? prompt('Qual foi a mentira?\n\nExplique rapidamente para a outra pessoa conseguir validar.') : '';
      if (delta > 0 && reason === null) return;
      applyState(await api('/api/lie-meter', { method: 'POST', body: { targetUserId: changeButton.dataset.lieTarget, delta, reason } }));
      showToast(delta > 0 ? 'Mentira enviada para validação.' : 'Correção enviada para validação.');
    } else if (validateButton) {
      applyState(await api('/api/lie-meter/' + validateButton.dataset.lieValidate, { method: 'PATCH' }));
      showToast('Marcação validada e placar atualizado!');
    } else if (denyButton) {
      applyState(await api('/api/lie-meter/' + denyButton.dataset.lieDeny + '/reject', { method: 'PATCH' }));
      showToast('Solicitação negada. O ranking não foi alterado.');
    } else {
      applyState(await api('/api/lie-meter/' + cancelButton.dataset.lieCancel, { method: 'DELETE' }));
      showToast('Marcação cancelada.');
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected) button.disabled = false; }
});
$('#mentirometro').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-lie-dispute-message]');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input');
  const text = String(input?.value || '').trim();
  if (!text) return;
  setBusy(form, true);
  try {
    applyState(await api('/api/lie-disputes/' + form.dataset.lieDisputeMessage + '/messages', { method: 'POST', body: { text } }));
    showToast('Mensagem enviada para a discussão.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#misterio').addEventListener('submit', async (event) => {
  const form = event.target;
  const reviewId = form.dataset.mysteryGuessReview;
  if (form.id !== 'mysteryStartForm' && form.id !== 'mysterySetupForm' && form.id !== 'mysteryQuestionForm' && form.id !== 'mysteryGuessForm' && form.id !== 'mysteryAnsweredQuestionForm' && !reviewId) return;
  event.preventDefault(); setBusy(form, true);
  try {
    const payload = Object.fromEntries(new FormData(form));
    const request = form.id === 'mysteryStartForm' ? ['/api/mystery', 'POST'] : form.id === 'mysterySetupForm' ? ['/api/mystery/setup', 'POST'] : form.id === 'mysteryQuestionForm' ? ['/api/mystery/questions', 'POST'] : form.id === 'mysteryGuessForm' ? ['/api/mystery/guesses', 'POST'] : form.id === 'mysteryAnsweredQuestionForm' ? ['/api/mystery/questions/answered', 'POST'] : ['/api/mystery/guesses/' + encodeURIComponent(reviewId), 'PATCH'];
    const data = await api(request[0], { method: request[1], body: payload });
    applyState(data); showToast(form.id === 'mysteryStartForm' ? 'Leitor convidado. Ele prepara o enigma em segredo.' : form.id === 'mysterySetupForm' ? 'Mistério aberto para a tripulação!' : form.id === 'mysteryGuessForm' ? 'Palpite enviado ao leitor.' : form.id === 'mysteryAnsweredQuestionForm' ? 'Pergunta respondida adicionada.' : reviewId ? 'Palpite avaliado.' : 'Pergunta enviada ao leitor.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (form.isConnected) setBusy(form, false); }
});
$('#misterio').addEventListener('click', async (event) => {
  const answerButton = event.target.closest('[data-mystery-answer]'); const cancelButton = event.target.closest('[data-mystery-cancel]'); const closeButton = event.target.closest('#closeMysteryButton'); const clearButton = event.target.closest('#clearMysteryHistoryButton'); const deleteButton = event.target.closest('#deleteMysteryButton');
  if (!answerButton && !cancelButton && !closeButton && !clearButton && !deleteButton) return;
  const button = answerButton || cancelButton || closeButton || clearButton || deleteButton;
  if (closeButton && !confirm('Encerrar este mistério e revelar a solução para toda a tripulação?')) return;
  if (clearButton && !confirm('Limpar apenas os mistérios já encerrados? Um mistério aberto será preservado.')) return;
  if (deleteButton && !confirm('Apagar este mistério inteiro, incluindo todas as perguntas e respostas? Esta ação não pode ser desfeita.')) return;
  if (cancelButton && !confirm('Cancelar esta pergunta antes da resposta do leitor?')) return;
  button.disabled = true;
  try {
    const data = answerButton ? await api('/api/mystery/questions/' + encodeURIComponent(answerButton.dataset.mysteryQuestion), { method: 'PATCH', body: { answer: answerButton.dataset.mysteryAnswer } }) : cancelButton ? await api('/api/mystery/questions/' + encodeURIComponent(cancelButton.dataset.mysteryCancel), { method: 'DELETE' }) : closeButton ? await api('/api/mystery/close', { method: 'POST' }) : deleteButton ? await api('/api/admin/mystery/current', { method: 'DELETE' }) : await api('/api/admin/mystery/history', { method: 'DELETE' });
    applyState(data); showToast(answerButton ? 'Resposta oficial registrada.' : cancelButton ? 'Pergunta cancelada.' : closeButton ? 'Mistério encerrado e solução revelada.' : deleteButton ? 'Mistério apagado por completo.' : 'Histórico de mistérios encerrados limpo.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected) button.disabled = false; }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('#siteMenu').classList.contains('open')) setMenuOpen(false);
  else if (event.key === 'Escape' && feedbackPanelOpen) closeFeedbackPanel();
});
window.addEventListener('scroll', scheduleActiveNavigation, { passive: true });
window.addEventListener('resize', scheduleActiveNavigation, { passive: true });
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-page]');
  if (!link || !appState) return;
  event.preventDefault();
  showPortalPage(link.dataset.page, true);
  setMenuOpen(false);
});
$('#menuButton').addEventListener('click', () => setMenuOpen(!$('#siteMenu').classList.contains('open')));
$('#closeMenuButton').addEventListener('click', () => setMenuOpen(false));
$('#menuBackdrop').addEventListener('click', () => setMenuOpen(false));
$('#topProfileButton').addEventListener('click', () => showPortalPage('perfil', true));
$('#profileAvatarInput').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await openAvatarCrop(file);
  } catch (error) { showToast(error.message, 'error'); }
  finally { input.value = ''; }
});

function setNotificationPanel(open) {
  $('#notificationPanel').classList.toggle('hidden', !open);
  $('#notificationButton').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('notification-panel-open', open);
}
async function markNotificationsRead() {
  if (!appState?.notifications?.unreadCount) return;
  const previousNotifications = appState.notifications;
  // Some o contador no mesmo clique, sem esperar a rede. Se a requisição falhar,
  // restauramos o estado e avisamos a pessoa.
  appState.notifications = {
    ...previousNotifications,
    unreadCount: 0,
    items: (previousNotifications.items || []).map((item) => ({ ...item, unread: false }))
  };
  renderNotifications();
  try { applyState(await api('/api/notifications/read', { method: 'POST' })); }
  catch (error) { appState.notifications = previousNotifications; renderNotifications(); showToast(error.message, 'error'); }
}
$('#notificationButton').addEventListener('click', async () => {
  const opening = $('#notificationPanel').classList.contains('hidden');
  setNotificationPanel(opening);
  if (opening) await markNotificationsRead();
});
$('#closeNotificationPanel').addEventListener('click', () => setNotificationPanel(false));
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#notificationPanel, #notificationButton')) setNotificationPanel(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setNotificationPanel(false);
});
$('#notificationList').addEventListener('click', (event) => {
  const item = event.target.closest('[data-notification-page]');
  if (!item) return;
  setNotificationPanel(false); markNotificationsRead(); openNotificationTarget(item.dataset.notificationId, item.dataset.notificationPage);
});
window.addEventListener('popstate', () => { if (appState) showPortalPage(currentPortalPage()); });

$('#currentYear').textContent = new Date().getFullYear();
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('#installAppButton').classList.remove('hidden'); });
$('#installAppButton').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#installAppButton').classList.add('hidden'); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('#installAppButton').classList.add('hidden'); showToast('Área 51 instalada como aplicativo! 📲'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicWanted && appState) startMusic();
});

let sessionBootAttempts = 0;
let sessionBootRetryTimer = null;
async function initialize() {
  drawWheel();
  clearTimeout(sessionBootRetryTimer);
  try { showApp(await api('/api/state')); sessionBootAttempts = 0; }
  catch(error) {
    if(error.status===401) { showAuth(); return; }
    sessionBootAttempts += 1;
    if (sessionBootAttempts < 3) {
      $('#sessionBootText').textContent = 'Reconectando sua sessão…';
      $('#sessionBootRetry').classList.add('hidden');
      sessionBootRetryTimer = setTimeout(initialize, sessionBootAttempts * 1200);
      return;
    }
    $('#sessionBootText').textContent='Não foi possível verificar sua sessão agora. Seu acesso foi preservado; tente novamente em instantes.';
    $('#sessionBootRetry').classList.remove('hidden');
  }
}
$('#sessionBootRetry').addEventListener('click',()=>{sessionBootAttempts=0;initialize();});
initialize();
let portalSyncInProgress = false;
let portalSyncTimer = null;
let lastPortalActivityAt = Date.now();
function portalSyncDelay() {
  if (document.hidden) return 90000;
  const page = currentPortalPage();
  const impostorActive = page === 'impostor' && ['lobby', 'tips', 'voting'].includes(appState?.impostor?.active?.status);
  const mysteryActive = page === 'misterio' && appState?.mystery?.active?.status === 'open';
  const drawActive = page === 'sorteio';
  const recentlyActive = Date.now() - lastPortalActivityAt < 5 * 60 * 1000;
  if (!recentlyActive) return 60000;
  if (drawActive) return 1800;
  return impostorActive || mysteryActive ? 2500 : 15000;
}
function schedulePortalSync(delay = portalSyncDelay()) {
  clearTimeout(portalSyncTimer);
  portalSyncTimer = setTimeout(runPortalSync, Math.max(0, delay));
}
async function runPortalSync() {
  if (!appState) return;
  if (document.hidden || portalSyncInProgress || !navigator.onLine) { schedulePortalSync(); return; }
  const editingMystery = currentPortalPage() === 'misterio' && $('#misterio')?.contains(document.activeElement) && document.activeElement?.matches('input,textarea,select');
  portalSyncInProgress = true;
  try {
    const sync = await api('/api/sync', {}, false);
    if (!appState) return;
    if (Array.isArray(sync.onlinePeople)) { appState.onlinePeople = sync.onlinePeople; renderOnlinePeople(); }
    serverClockOffset = Number(sync.serverTime || Date.now()) - Date.now();
    if (sync.liveDraw) receiveLiveDraw(sync.liveDraw);
    const changed = Number(sync.revision) !== Number(appState.serverRevision) || Boolean(sync.loanOverdue) !== Boolean(appState.profile?.loan?.overdue);
    if (changed && !editingMystery && !spinning && !casinoSpinInProgress && !mysteryOpeningInProgress) applyState(await api('/api/state', {}, false));
  } catch {} finally { portalSyncInProgress = false; schedulePortalSync(); }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && appState?.realtimeTransport === 'adaptive-poll') { lastPortalActivityAt = Date.now(); schedulePortalSync(0); }
});
function notePortalActivity() {
  const wasIdle = Date.now() - lastPortalActivityAt >= 5 * 60 * 1000;
  lastPortalActivityAt = Date.now();
  if (wasIdle && appState?.realtimeTransport === 'adaptive-poll' && !document.hidden) schedulePortalSync(0);
}
document.addEventListener('pointermove', notePortalActivity, { passive: true });
document.addEventListener('pointerdown', notePortalActivity, { passive: true });
document.addEventListener('keydown', notePortalActivity, { passive: true });
window.addEventListener('online', () => { if (appState?.realtimeTransport === 'adaptive-poll') schedulePortalSync(0); });
