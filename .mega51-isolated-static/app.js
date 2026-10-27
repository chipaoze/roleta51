const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// O HTML inicial também usa o arquivo local antes de a área Cobblemon ser montada.
// Isso evita qualquer piscada da Poké Ball antiga vinda da Wiki.
document.querySelectorAll('img[src*="wiki.cobblemon.com"][src*="Poke_Ball"]').forEach((image) => {
  image.src = '/capture-ball-cobblemon.png';
});
const NATIVE_POINTER_SELECTOR = 'input,textarea,select,button,a,summary,label,[role="button"],[contenteditable="true"]';
const isNativeInteractiveTarget = (target) => Boolean(target?.closest?.(NATIVE_POINTER_SELECTOR));
// O campo de quantidade precisa vencer qualquer efeito global de cursor.
// O foco é reaplicado depois da sequência nativa do clique para continuar
// editável ao soltar o mouse, mesmo se algum efeito tiver tentado restaurar o
// foco na página.
const cobblemonQuantityInputFromEvent = (event) => {
  const target = event.target;
  if (target?.matches?.('[data-cobblemon-ball-quantity]')) return target;
  return target?.closest?.('label.shop-quantity-picker')?.querySelector?.('[data-cobblemon-ball-quantity]') || null;
};
const focusCobblemonQuantityFromEvent = (event, select = true) => {
  const input = cobblemonQuantityInputFromEvent(event);
  if (!input || input.readOnly || input.disabled) return;
  const focus = () => {
    const current = input.isConnected ? input : document.querySelector(`[data-cobblemon-ball-quantity="${input.dataset.cobblemonBallQuantity}"]`);
    if (!current || current.readOnly || current.disabled) return;
    current.focus({ preventScroll: true });
    if (select && document.activeElement === current) current.select();
  };
  focus();
  requestAnimationFrame(focus);
  setTimeout(focus, 0);
};
window.addEventListener('pointerdown', (event) => focusCobblemonQuantityFromEvent(event), true);
window.addEventListener('click', (event) => focusCobblemonQuantityFromEvent(event), true);
function formatCredits(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Altere esta versão e o texto a cada publicação; cada navegador verá o aviso uma vez.
const RELEASE_NOTICE = {
    version: '20261021-correcao-feed',
    title: 'Correção nas publicações do feed',
    notes: 'Corrigimos uma mensagem de erro exibida após publicar uma foto ou texto no feed.'
  };
const APP_RELEASE_VERSION = RELEASE_NOTICE.version;
let appState = null;
let communityVoteDraft = '';
let communityVoteImageDraft = null;
let communityVoteFilter = 'open';
const communityCommentDrafts = new Map();
const communityCommentSubmitting = new Set();
let activeMode = 'theme';
let selectedFile = null;
let previewObjectUrl = null;
let selectedAdminUploadFile = null;
let adminUploadPreviewObjectUrl = null;
let selectedMemeFile = null;
let memePreviewObjectUrl = null;
let selectedAnnouncementImageFile = null;
let announcementImagePreviewObjectUrl = null;
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
let musicPreferenceBeforeDraw = null;
let musicForcedBySpin = false;
let musicPrimedByGesture = false;
let toastTimer;
let focusVotingAfterWinner = false;
let activeGayWatermarkResult = null;
const watermarkGenerationIds = new Set();
let lastGuidedPhase = null;
let pendingGuidedNavigation = false;
let rainbowThemeForced = false;
let themePenaltyTimerInterval = null;
let feedbackMessages = [];
let feedbackPanelOpen = false;
let adminFeedbackFilter = 'pending';
let knownReleaseVersion = null;
let releaseNoticeChecked = false;
let releaseNoticeLoaded = false;
let releaseCheckPromise = null;
let releaseNoticeRequiresUpdate = false;
let releaseHistory = null;
let releaseHistoryPromise = null;
let navigationFrame = null;
let visiblePortalPage = null;
let portalRenderRequest = 0;
let shopPreviewItemId = null;
let shopPreviewTimer = null;
let shopPreviewInterval = null;
let shopFilter = 'all';
let hideOwnedVisuals = localStorage.getItem('area51-hide-owned-visuals') === 'true';
let shopCatalogRenderSignature = '';
let deferredInstallPrompt = null;
let votingDraft = { votingId: null, bestId: null, worstId: null };
let notificationsReadAtLocal = null;
let casinoWheelRotation = 0;
let casinoWheelVisualRotation = 0;
let casinoSpinInProgress = false;
let casinoWheelTickFrame = null;
let casinoWheelLabelFrame = null;
let casinoWheelAudioContext = null;
let lotteryNumbersDraft = [];
let lotteryPlanDraft = 6;
let lotteryReminderTimer = null;
let lotteryDrawTimer = null;
let lotteryDrawInProgress = false;
let mysteryOpeningInProgress = false;
let forcedCursorExpiryTimer = null;
let announcedForcedCursorId = null;
const FORCED_CURSE_NOTICE_KEY = 'area51:seen-forced-curse-id';
let pendingShieldDialogIdShown = null;
let seasonCountdownTimer = null;
let nextSeasonPassLoaded = false;

function musicPreferenceKey(userId) {
  return userId ? `roundMusic:${userId}` : 'roundMusic';
}

function hydrateMusicPreference(userId) {
  const stored = userId ? localStorage.getItem(musicPreferenceKey(userId)) : null;
  if (stored === 'on' || stored === 'off') musicWanted = stored === 'on';
  else {
    musicWanted = localStorage.getItem('roundMusic') !== 'off';
    if (userId) localStorage.setItem(musicPreferenceKey(userId), musicWanted ? 'on' : 'off');
  }
}

function persistMusicPreference(value) {
  musicWanted = Boolean(value);
  localStorage.setItem('roundMusic', musicWanted ? 'on' : 'off');
  if (appState?.me?.id) localStorage.setItem(musicPreferenceKey(appState.me.id), musicWanted ? 'on' : 'off');
}
const casinoWheelValues = [
  0,1,1,1.5,'box-sonda',1,1,1,1.5,.5,0,1,1,1.5,'box-cosmic',0,1,2,1.5,1,
  0,.5,'box-sonda',1.5,0,.5,1,'box-area51',1.5,.5,0,1,3,'box-cosmic',.5,1.5,1,2,'box-sonda',1,
];
// A arte mostra dezesseis setores de leitura. As unidades continuam somando as
// mesmas quarenta casas reais; o servidor segue sendo a única fonte do resultado.
const casinoWheelDisplaySlices = [
  { value: 'box-area51', units: 1 }, { value: 3, units: 1 }, { value: 2, units: 2 }, { value: 1.5, units: 2 },
  { value: 1, units: 3 }, { value: .5, units: 2 }, { value: 0, units: 3 }, { value: 'box-cosmic', units: 2 },
  { value: 1, units: 3 }, { value: 1.5, units: 2 }, { value: .5, units: 3 }, { value: 0, units: 3 },
  { value: 'box-sonda', units: 3 }, { value: 1, units: 3 }, { value: 1.5, units: 3 }, { value: 1, units: 4 },
];
// Um único sprite evita novas requisições por rodada. Ele só ilustra as casas de baú;
// sorteio, índice e probabilidades continuam inteiramente no servidor.
const casinoBoxSprite = typeof Image === 'undefined' ? null : new Image();
if (casinoBoxSprite) {
  casinoBoxSprite.src = '/roulette51/box-icons-v2.png';
  casinoBoxSprite.addEventListener('load', () => drawCasinoWheel(), { once: true });
}
let casinoActiveGame = 'roulette';
let plinkoInFlight = 0;
let lastAppliedServerRevision = 0;
let plinkoPendingRecoveryStarted = false;
const plinkoLabels = { low: 'Baixo', medium: 'Médio', high: 'Alto' };
let slotSpinInProgress = false;
let slotMusicTimer = null;
let slotLeverSoundPull = 0;
let slotPreSpinStartedAt = 0;
const slotSymbolIds = ['alien', 'ufo', 'crystal', 'eye', 'comet', 'fiftyone'];
const slotSymbolNames = { alien: 'Alien', ufo: 'Disco', crystal: 'Cristal', eye: 'Olho', comet: 'Cometa', fiftyone: '51' };

function slotSymbolMarkup(id) { return `<i class="slot-symbol symbol-${escapeHtml(id)}" aria-label="${escapeHtml(slotSymbolNames[id] || id)}"></i>`; }
function randomSlotSymbol() { return slotSymbolIds[Math.floor(Math.random() * slotSymbolIds.length)]; }
function slotVisibleReelMarkup(centerSymbol) {
  return `<span class="slot-strip slot-strip-static"><span class="slot-strip-item">${slotSymbolMarkup(randomSlotSymbol())}</span><span class="slot-strip-item slot-result-row">${slotSymbolMarkup(centerSymbol || 'alien')}</span><span class="slot-strip-item">${slotSymbolMarkup(randomSlotSymbol())}</span></span>`;
}
function setSlotLeverVisual(value) {
  const lever = $('#slotLever'); if (!lever) return;
  const pull = Math.max(0, Math.min(1, Number(value) || 0));
  if (pull > slotLeverSoundPull + .16) playSlotLeverMoveSound(pull);
  slotLeverSoundPull = pull;
  lever.style.setProperty('--lever-pull', String(pull));
  lever.classList.toggle('is-pulled', pull > .12);
}
function installSlotMachine() {
  const tab = $('[data-casino-game="plinko"]'); const panel = $('#casinoPlinkoPanel');
  if (!tab || !panel) return;
  tab.dataset.casinoGame = 'slots'; tab.innerHTML = '<span>🎰</span>Caça-Níquel 51 <small>Novo</small>';
  panel.innerHTML = `<small>CAÇA-NÍQUEL 51 · RESULTADO NO SERVIDOR</small><h3>Gire os rolos e encontre combinações</h3><p class="slot-intro">Puxe a alavanca para baixo. Os rolos só param uma vez, no resultado definitivo confirmado pelo servidor.</p><section class="slot-machine" aria-label="Caça-níquel Área 51"><header><span>ÁREA <b>51</b></span><strong>PRÊMIO MÁXIMO · x100</strong></header><div id="slotReels" class="slot-reels">${['alien','ufo','crystal'].map((symbol, index) => `<div class="slot-reel" data-slot-reel="${index}">${slotVisibleReelMarkup(symbol)}</div>`).join('')}</div><button id="slotLever" class="slot-lever" type="button" aria-label="Puxar alavanca do caça-níquel" title="Arraste a alavanca para baixo"><img src="/slot51/lever-v2.webp" alt="" draggable="false"></button><footer><span>RETORNO MÉDIO <b id="slotReturn">97,5%</b></span><span>PRÊMIO MÁXIMO <b>x100</b></span></footer></section><section class="slot-payout-card"><h4>Tabela de combinações</h4><div id="slotPayoutTable" class="slot-payouts"></div></section><form id="slotForm"><label>Usar saldo de<select id="slotWalletSource"><option value="promotional">Bônus diário</option><option value="shop">Loja 51</option></select></label><label>Valor da aposta<input id="slotBet" type="number" min="0.01" step="0.01" inputmode="decimal" value="10.00" required></label><button class="button button-primary" type="submit">Girar pelo botão</button></form><div id="slotResult" class="casino-result">Escolha um valor e puxe a alavanca. A tabela mostra cada prêmio antes de girar.</div><section class="casino-game-history"><h3>Histórico do Caça-Níquel</h3><div id="casinoSlotsHistory" class="casino-history"></div></section>`;
  bindSlotLever();
}
function bindSlotLever() {
  const lever = $('#slotLever'); if (!lever) return; let startY = null; let pull = 0; let dragTriggeredSpin = false; let leverGestureFinished = false;
  const setPull = (value) => { pull = Math.max(0, Math.min(1, value)); setSlotLeverVisual(pull); };
  const release = () => { if (startY === null) return; const shouldSpin = pull >= .55 && !slotSpinInProgress; startY = null; leverGestureFinished = true; if (shouldSpin) { dragTriggeredSpin = true; setPull(1); $('#slotForm')?.requestSubmit(); } else setPull(0); };
  lever.addEventListener('pointerdown', (event) => { if (slotSpinInProgress) return; leverGestureFinished = false; startY = event.clientY; lever.setPointerCapture?.(event.pointerId); setPull(0); event.preventDefault(); });
  lever.addEventListener('pointermove', (event) => { if (startY === null) return; setPull((event.clientY - startY) / Math.max(70, lever.getBoundingClientRect().height * .54)); });
  lever.addEventListener('pointerup', release); lever.addEventListener('pointercancel', release);
  lever.addEventListener('click', (event) => { if (leverGestureFinished || dragTriggeredSpin) { event.preventDefault(); leverGestureFinished = false; dragTriggeredSpin = false; return; } });
  lever.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && !slotSpinInProgress) { event.preventDefault(); $('#slotForm')?.requestSubmit(); } });
}
installSlotMachine();

const palette = ['#f47721','#173b67','#f5b52c','#2f76a9','#dc5c46','#48a47a','#815ba6','#dd7a2c','#31598b','#e2a627'];
const authView = $('#authView');
const appView = $('#appView');
const canvas = $('#wheelCanvas');
const ctx = canvas?.getContext('2d');

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
      const trailStyle = document.body.dataset.trailStyle || 'rainbow';
      const isSlime = trailStyle === 'halloween-slime';
      const isBlood = trailStyle === 'halloween-blood';
      trailContext.lineWidth = (isSlime ? 4.5 : isBlood ? 2.5 : 1.25) + (opacity * (isSlime ? 7 : isBlood ? 5 : 3.25));
      const trailPalette = { gold:[46,100,60],pink:[330,100,65],blue:[205,100,62],green:[138,96,55],purple:[274,100,67],laser:[158,100,58],alien:[112,100,55],white:[0,0,100],'gta-neon':[322,100,65],cobblemon:[96,68,52],wolverine:[46,100,58],samurai:[344,90,68],'god-war':[200,92,67],'halloween-slime':[112,92,45],'halloween-blood':[352,92,31],sovereign:[47,100,68],taquion:[272,94,68],'dragon-ember':[18,100,58] };
      const fixedColor = trailPalette[trailStyle];
      const rocketAge = Math.max(0, Math.min(1, (now - point.time) / lifetime));
      const hue = trailStyle === 'fire' ? 5 + ((point.hue / 360) * 48) : trailStyle === 'rocket' ? (rocketAge < .2 ? 198 : Math.max(5, 48 - ((rocketAge - .2) * 54))) : fixedColor ? fixedColor[0] : point.hue;
      const saturation = fixedColor ? fixedColor[1] : 100;
      const lightness = trailStyle === 'rocket' && rocketAge < .2 ? 78 : fixedColor ? fixedColor[2] : 61;
      trailContext.strokeStyle = `hsla(${hue},${saturation}%,${lightness}%,${opacity * .9})`;
      trailContext.shadowColor = `hsla(${hue},100%,68%,${opacity})`;
      trailContext.shadowBlur = (isSlime ? 11 : isBlood ? 2 : 5) * opacity;
      trailContext.stroke();
      if ((isSlime || isBlood) && index % (isSlime ? 3 : 4) === 0) {
        const dropRadius = (isSlime ? 2.2 : 1.5) + opacity * (isSlime ? 3.4 : 2.5);
        const dropOffset = (index % 2 ? 1 : -1) * (isSlime ? 7 : 5);
        trailContext.beginPath();
        trailContext.arc(point.x + dropOffset, point.y + dropOffset * .55, dropRadius, 0, Math.PI * 2);
        trailContext.fillStyle = `hsla(${hue},${saturation}%,${lightness}%,${opacity * .88})`;
        trailContext.fill();
      }
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
    const adhdActive = document.documentElement.classList.contains('adhd-cursor-active');
    const liderancaActive = document.documentElement.classList.contains('lideranca-cursor-active');
    const customCursorActive = unicornActive || giantSlowActive || adhdActive || liderancaActive;
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
      const isBlackstarCursor = /^blackstar-(cyan|gold|crimson)$/.test(cursorEffect);
      const effectDelay = cursorEffect === 'lideranca' ? 500 : isBlackstarCursor ? 82 : 120;
      if (isBlackstarCursor && now - lastCursorEffectAt > effectDelay) {
        // O efeito nasce atrás da ponta de movimento, não em cima do clique.
        // Só duas faíscas leves por pulso mantêm o cursor responsivo.
        const palette = {
          'blackstar-cyan': ['#72e8ff', '#8a79ff'],
          'blackstar-gold': ['#ffe185', '#ff9e38'],
          'blackstar-crimson': ['#ff9baf', '#d84d6f'],
        }[cursorEffect];
        const backX = -deltaX / distance;
        const backY = -deltaY / distance;
        const sideX = -backY;
        const sideY = backX;
        for (let index = 0; index < 2; index += 1) {
          const spread = (Math.random() - .5) * 10;
          const particle = document.createElement('span');
          particle.className = 'blackstar-cursor-spark';
          particle.style.left = (current.x + backX * 17 + sideX * spread) + 'px';
          particle.style.top = (current.y + backY * 17 + sideY * spread) + 'px';
          particle.style.setProperty('--spark-x', (backX * (14 + Math.random() * 14) + sideX * spread * .65) + 'px');
          particle.style.setProperty('--spark-y', (backY * (14 + Math.random() * 14) + sideY * spread * .65) + 'px');
          particle.style.setProperty('--spark-color', palette[index]);
          document.body.appendChild(particle);
          particle.addEventListener('animationend', () => particle.remove(), { once: true });
        }
        lastCursorEffectAt = now;
      } else if (cursorEffect && !['petista', 'bolsonaro', 'umbanda'].includes(cursorEffect) && now - lastCursorEffectAt > effectDelay) {
        const labels = { gay: '🌈 EU SOU FOFO, QUERO CARINHO E CONFUSÃO', lideranca: 'VEM COMIGO NOVINHA', 'galinha-preta': 'COCORICÓ!', volei: 'GIBA NELES!', biblia: 'AMÉM!', 'scrum-master': '✓ PLANILHA', energetico: '⚡ ENERGIA', 'pirokinha-cosmica': 'TOMA LEITADA', 'giant-slow': 'SOU GAY', petista: '🥩 TOMA PICANHA!', bolsonaro: '💥 TEY TEY TEY!', umbanda: '🕊️ A POMBA GIRA, A POMBA GIRA!', messi: 'HIJO DA PUTA', cristiano: 'SIUUUUUUUU', pele: 'NÃO, O JÔ SOARES SUA FDP', maradona: 'QUIERO PÓ', neymar: 'CAIU, FALTA NELE' };
        const papaSequence = ['EM NOME DO PAI', 'DO FILHO', 'E DO ESPÍRITO SANTO'];
        const particle = document.createElement('span');
        particle.className = 'cursor-linked-effect effect-' + cursorEffect + (['petista', 'bolsonaro', 'umbanda'].includes(cursorEffect) ? ' effect-phrase-trail' : '');
        if (cursorEffect === 'papa-bento') { const step = Number(document.body.dataset.papaStep || 0); particle.textContent = papaSequence[step % papaSequence.length]; document.body.dataset.papaStep = String(step + 1); }
        else particle.textContent = labels[cursorEffect] || '✦';
        particle.style.left = Math.max(4, current.x - 22) + 'px';
        particle.style.top = Math.max(4, current.y + 12) + 'px';
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), cursorEffect === 'lideranca' ? 720 : 1450);
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

let adhdCurseTimer = null;
function syncAdhdCurse(active) {
  clearTimeout(adhdCurseTimer); document.querySelector('#adhdCurseLabel')?.remove(); document.querySelector('#adhdCurseBlocker')?.remove(); document.documentElement.classList.remove('adhd-interference');
  if (!active) return;
  const trigger = () => { if (!document.documentElement.classList.contains('adhd-cursor-active')) return; const label = document.createElement('div'); label.id = 'adhdCurseLabel'; label.textContent = 'TDAH ATIVADO'; document.body.append(label); const end = Date.now() + 30000; const move = () => { if (Date.now() >= end || !document.documentElement.classList.contains('adhd-cursor-active')) { label.remove(); adhdCurseTimer = setTimeout(trigger, 45000 + Math.random() * 45000); return; } const x = 20 + Math.random() * Math.max(20, innerWidth - 60), y = 20 + Math.random() * Math.max(20, innerHeight - 60); label.style.left = x + 'px'; label.style.top = y + 'px'; const cursor = document.querySelector('.unicorn-mouse-cursor'); if (cursor) { cursor.style.setProperty('--cursor-x', x + 'px'); cursor.style.setProperty('--cursor-y', y + 'px'); cursor.classList.add('is-visible'); } setTimeout(move, 650); }; move(); }; adhdCurseTimer = setTimeout(trigger, 45000 + Math.random() * 45000);
}

let cleaningCurseKey = null;
let haterCurseId = null, haterCurseTimer = null, haterCurseExpiry = 0, haterLastPhrase = -1;
function syncHaterCurse(curse) {
  const expiry = Date.parse(curse?.expiresAt || '');
  if (curse?.style !== 'hater' || !Number.isFinite(expiry) || expiry <= Date.now()) {
    clearTimeout(haterCurseTimer); haterCurseTimer = null; haterCurseId = null; haterCurseExpiry = 0;
    document.querySelector('#haterCurseMessage')?.remove(); return;
  }
  haterCurseExpiry = expiry;
  if (haterCurseId === curse.id) return;
  clearTimeout(haterCurseTimer); document.querySelector('#haterCurseMessage')?.remove(); haterCurseId = curse.id;
  const defaultPhrases = ['Ô azarado, achou que eu tinha ido embora?', 'Até a roleta tem pena de você!', 'Vai trabalhar, desgraça!', 'Oh, vai tomar no seu cu!', 'Viadinho, e esse cu cheirando a leite aí?', 'Oh, mama-pica, tira da boca e vai trabalhar!'];
  const phrases = Array.isArray(curse.phrases) && curse.phrases.length === 6 ? curse.phrases : defaultPhrases;
  const show = () => {
    if (!haterCurseId || Date.now() >= haterCurseExpiry) { syncHaterCurse(null); return; }
    if (!document.hidden) {
      let index; do { index = Math.floor(Math.random() * phrases.length); } while (index === haterLastPhrase); haterLastPhrase = index;
      const el = document.createElement('div'); el.id = 'haterCurseMessage'; el.textContent = phrases[index];
      if (index === 2 || Math.random() < .35) { const hand = document.createElement('span'); hand.textContent = '🖕'; el.append(hand); }
      document.body.append(el); const width = el.offsetWidth, height = el.offsetHeight;
      el.style.left = Math.max(8, 8 + Math.random() * Math.max(0, innerWidth - width - 16)) + 'px';
      el.style.top = Math.max(8, 8 + Math.random() * Math.max(0, innerHeight - height - 16)) + 'px';
      setTimeout(() => el.remove(), 3000);
    }
    haterCurseTimer = setTimeout(show, Math.min(7000 + Math.random() * 4000, Math.max(1, haterCurseExpiry - Date.now())));
  };
  show();
}

const GIVALDO_EFFECTS = [
  { image: '/givaldo/givaldo-1.png', quote: 'Uma mão no volante e outra no carinho' },
  { image: '/givaldo/givaldo-2.png', quote: 'Sou a única vítima de um convite maravilhoso, do qual vivi todos os prazeres possíveis' },
  { image: '/givaldo/givaldo-3.png', quote: 'Ela me disse: eu quero namorar com você' },
];
let givaldoCurseId = null, givaldoCurseTimer = null, givaldoCurseExpiry = 0, givaldoLastEffect = -1, givaldoAppearance = 0;
function syncGivaldoCurse(curse) {
  const expiry = Date.parse(curse?.expiresAt || '');
  if (curse?.style !== 'givaldo' || !Number.isFinite(expiry) || expiry <= Date.now()) {
    clearTimeout(givaldoCurseTimer); givaldoCurseTimer = null; givaldoCurseId = null; givaldoCurseExpiry = 0;
    document.querySelector('#givaldoCurseEffect')?.remove(); return;
  }
  givaldoCurseExpiry = expiry;
  if (givaldoCurseId === curse.id) return;
  clearTimeout(givaldoCurseTimer); document.querySelector('#givaldoCurseEffect')?.remove(); givaldoCurseId = curse.id;
  const show = () => {
    if (!givaldoCurseId || Date.now() >= givaldoCurseExpiry) { syncGivaldoCurse(null); return; }
    if (!document.hidden) {
      let index = (givaldoLastEffect + 1 + Math.floor(Math.random() * (GIVALDO_EFFECTS.length - 1))) % GIVALDO_EFFECTS.length;
      givaldoLastEffect = index;
      const effect = GIVALDO_EFFECTS[index];
      const card = document.createElement('div');
      card.id = 'givaldoCurseEffect';
      card.className = 'givaldo-curse-effect givaldo-curse-' + ['left', 'right', 'center'][givaldoAppearance++ % 3];
      const image = document.createElement('img'); image.src = effect.image; image.alt = '';
      const quote = document.createElement('span'); quote.textContent = '“' + effect.quote + '”';
      card.append(image, quote); document.querySelector('#givaldoCurseEffect')?.remove(); document.body.append(card);
      setTimeout(() => { if (card.isConnected) card.remove(); }, 4500);
    }
    givaldoCurseTimer = setTimeout(show, Math.min(90000 + Math.random() * 60000, Math.max(1, givaldoCurseExpiry - Date.now())));
  };
  givaldoCurseTimer = setTimeout(show, 2500);
}
function syncNewCurses(forcedCursor) {
  const dev = forcedCursor?.style === 'dev-dark';
  const cleaning = forcedCursor?.style === 'cleaning';
  document.documentElement.classList.toggle('dev-dark-curse', dev);
  if (!cleaning) document.documentElement.classList.remove('cleaning-curse');
  let lamp = document.querySelector('#devCurseLamp');
  if (dev && !lamp) { lamp = document.createElement('img'); lamp.id = 'devCurseLamp'; lamp.src = '/cursor-dev-lamp.png'; lamp.alt = ''; document.body.append(lamp); }
  if (!dev) lamp?.remove();
  if (dev && lamp && !lamp.dataset.bound) { lamp.dataset.bound = '1'; document.addEventListener('pointermove', (event) => { lamp.style.left = event.clientX + 'px'; lamp.style.top = event.clientY + 'px'; document.documentElement.style.setProperty('--dev-light-x', event.clientX + 'px'); document.documentElement.style.setProperty('--dev-light-y', event.clientY + 'px'); }, { passive: true }); }
  let layer = document.querySelector('#cleaningCurseLayer');
  let existingBroom = document.querySelector('#cleaningCurseBroom');
  if (!cleaning) { layer?.remove(); existingBroom?.remove(); cleaningCurseKey = null; return; }
  // A mesma camada permanece até a pessoa varrê-la completamente; nenhum
  // prazo encerra a tarefa nem reaplica poeira no meio da limpeza.
  const key = 'area51-cleaning-curse:' + forcedCursor.id;
  if (cleaningCurseKey === key && layer && existingBroom) return;
  cleaningCurseKey = key;
  let pieces; try { pieces = JSON.parse(localStorage.getItem(key) || 'null'); } catch { pieces = null; }
  if (Array.isArray(pieces) && pieces.length === 0) { layer?.remove(); document.documentElement.classList.remove('cleaning-curse'); return; }
  document.documentElement.classList.add('cleaning-curse');
  existingBroom?.remove();
  layer?.remove(); layer = document.createElement('canvas'); layer.id = 'cleaningCurseLayer';
  const broom = document.createElement('img'); broom.id = 'cleaningCurseBroom'; broom.src = '/cursor-halloween-broom.png'; broom.alt = ''; document.body.append(broom);
  document.addEventListener('pointermove', (event) => { if (document.documentElement.classList.contains('cleaning-curse')) { broom.style.left = event.clientX + 'px'; broom.style.top = event.clientY + 'px'; } }, { passive: true });
  // Uma única camada de sujeira, apagada pela vassoura como a borracha do
  // Paint. Não há quadrados nem áreas que precisem ser clicadas uma a uma.
  document.body.append(layer);
  const ctx = layer.getContext('2d');
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const resize = () => { layer.width = Math.round(innerWidth * ratio); layer.height = Math.round(innerHeight * ratio); layer.style.width = innerWidth + 'px'; layer.style.height = innerHeight + 'px'; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); const dirt = ctx.createLinearGradient(0, 0, innerWidth, innerHeight); dirt.addColorStop(0, '#79502c'); dirt.addColorStop(.48, '#4a2b16'); dirt.addColorStop(1, '#251307'); ctx.fillStyle = dirt; ctx.fillRect(0, 0, innerWidth, innerHeight); ctx.globalAlpha = .38; for (let index = 0; index < Math.max(1300, Math.floor(innerWidth * innerHeight / 420)); index += 1) { ctx.fillStyle = Math.random() > .5 ? '#d9b174' : '#170a04'; ctx.beginPath(); ctx.arc(Math.random() * innerWidth, Math.random() * innerHeight, 1 + Math.random() * 3.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(22,9,3,.32)'; ctx.fillRect(0, 0, innerWidth, innerHeight); };
  resize();
  let sweeping = false; let lastPoint = null;
  const cellSize = 16, columns = Math.ceil(innerWidth / cellSize), rows = Math.ceil(innerHeight / cellSize);
  const cleanMask = new Uint8Array(columns * rows); let cleanedCells = 0;
  const markCoverage = (x, y) => { const radius = 72, minColumn = Math.max(0, Math.floor((x - radius) / cellSize)), maxColumn = Math.min(columns - 1, Math.ceil((x + radius) / cellSize)), minRow = Math.max(0, Math.floor((y - radius) / cellSize)), maxRow = Math.min(rows - 1, Math.ceil((y + radius) / cellSize)); for (let row = minRow; row <= maxRow; row += 1) for (let column = minColumn; column <= maxColumn; column += 1) { const centerX = (column + .5) * cellSize, centerY = (row + .5) * cellSize, index = row * columns + column; if (!cleanMask[index] && Math.hypot(centerX - x, centerY - y) <= radius) { cleanMask[index] = 1; cleanedCells += 1; } } };
  const erase = (x, y) => { ctx.globalCompositeOperation = 'destination-out'; const brush = ctx.createRadialGradient(x, y, 6, x, y, 72); brush.addColorStop(0, 'rgba(0,0,0,1)'); brush.addColorStop(.67, 'rgba(0,0,0,.95)'); brush.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = brush; ctx.beginPath(); ctx.arc(x, y, 72, 0, Math.PI * 2); ctx.fill(); if (lastPoint) { const distance = Math.hypot(x - lastPoint.x, y - lastPoint.y), steps = Math.max(1, Math.ceil(distance / 18)); ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.lineWidth = 108; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(lastPoint.x, lastPoint.y); ctx.lineTo(x, y); ctx.stroke(); for (let step = 1; step <= steps; step += 1) markCoverage(lastPoint.x + ((x - lastPoint.x) * step / steps), lastPoint.y + ((y - lastPoint.y) * step / steps)); } else markCoverage(x, y); lastPoint = { x, y }; ctx.globalCompositeOperation = 'source-over'; };
  // A máscara conta pontos únicos já revelados. Repetir o mesmo caminho não
  // libera a página: a poeira só some ao revelar a tela toda.
  const isClean = () => { if (cleanedCells >= cleanMask.length) { localStorage.setItem(key, '[]'); layer.remove(); broom.remove(); document.documentElement.classList.remove('cleaning-curse'); } };
  layer.addEventListener('pointerdown', (event) => { sweeping = true; lastPoint = null; layer.setPointerCapture(event.pointerId); erase(event.clientX, event.clientY); });
  layer.addEventListener('pointermove', (event) => { if (!sweeping) return; erase(event.clientX, event.clientY); isClean(); });
  ['pointerup', 'pointercancel'].forEach((name) => layer.addEventListener(name, () => { sweeping = false; lastPoint = null; isClean(); }));
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
    const commander = document.documentElement.classList.contains('commander-cursor-active') || document.documentElement.classList.contains('commander-halloween-cursor-active');
    const forcedGay = document.documentElement.classList.contains('gay-power-cursor-active');
    if ((!commander && !forcedGay) || Date.now() - lastParticleAt < 85) return;
    lastParticleAt = Date.now();
    const particle = document.createElement('i');
    particle.className = forcedGay ? 'gay-cursor-particle' : 'commander-cursor-particle';
    particle.textContent = forcedGay ? (Math.random() > .45 ? '🌈' : '✦') : (Math.random() > .62 ? '👑' : Math.random() > .38 ? '◆' : '51');
    particle.style.left = event.clientX + 8 + 'px'; particle.style.top = event.clientY + 12 + 'px';
    document.body.appendChild(particle); setTimeout(() => particle.remove(), 650);
  }, { passive: true });
  document.addEventListener('pointerdown', (event) => {
    const commander = document.documentElement.classList.contains('commander-cursor-active') || document.documentElement.classList.contains('commander-halloween-cursor-active');
    const forcedGay = document.documentElement.classList.contains('gay-power-cursor-active');
    if (!commander && !forcedGay) return;
    const pulse = document.createElement('i'); pulse.className = forcedGay ? 'gay-click-pulse' : 'commander-click-pulse';
    pulse.style.left = event.clientX + 'px'; pulse.style.top = event.clientY + 'px';
    document.body.appendChild(pulse); setTimeout(() => pulse.remove(), 520);
  }, { passive: true });
}
startCommanderCursorEffects();

function startThorCursorThrow() {
  const hammer = document.createElement('span');
  const hand = document.createElement('span');
  const impact = document.createElement('span');
  const crack = document.createElement('span');
  const hint = document.createElement('aside');
  hammer.className = 'thor-flying-hammer';
  hammer.setAttribute('aria-hidden', 'true');
  hammer.innerHTML = '<img src="/cursor-thor.svg" alt="">';
  hand.className = 'thor-cursor-hand';
  hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = '<img src="/cursor-thor-hand.svg" alt="">';
  impact.className = 'thor-impact';
  impact.setAttribute('aria-hidden', 'true');
  crack.className = 'thor-crack';
  crack.setAttribute('aria-hidden', 'true');
  crack.innerHTML = '<svg viewBox="0 0 150 150"><path d="M75 75 58 48 61 25 47 8M75 75 91 51 88 31 105 15M75 75 112 72 132 58 146 65M75 75 104 96 128 98 139 119M75 75 76 111 65 129 72 148M75 75 49 101 26 105 12 122M75 75 38 70 19 55 3 59M75 75 63 61 45 62M75 75 89 84 105 81"/></svg>';
  hint.className = 'thor-cursor-hint';
  hint.innerHTML = '<b>🔨</b><span>Arraste e solte para arremessar</span>';
  document.body.append(crack, hammer, hand, impact, hint);

  let pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  let direction = { x: 1, y: 0 };
  let restingPoint = null;
  let phase = 'held';
  let animation = null;
  let dragStart = null;
  let dragging = false;
  let suppressNextClick = false;
  let sparkGeneration = 0;
  let blockNativeUntil = 0;

  const isActive = () => document.documentElement.dataset.activeCursor === 'thor';
  const transformAt = (point, rotation = 0, scale = 1) => `translate3d(${point.x - 24}px,${point.y - 24}px,0) rotate(${rotation}deg) scale(${scale})`;

  function updateHandPosition() {
    hand.style.transform = `translate3d(${pointer.x - 12}px,${pointer.y - 9}px,0)`;
  }

  function flightPoint(from, to, progress, curveSide = 1) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / distance, y: dx / distance };
    const curve = Math.min(38, Math.max(18, distance * .055)) * curveSide;
    const arc = Math.sin(Math.PI * progress) * curve;
    return {
      x: from.x + dx * progress + normal.x * arc,
      y: from.y + dy * progress + normal.y * arc,
    };
  }

  function throwFrames(from, to, startRotation, endRotation, curveSide = 1) {
    return [0, .12, .25, .4, .58, .76, .9, 1].map((progress) => {
      const point = flightPoint(from, to, progress, curveSide);
      const rotation = startRotation + (endRotation - startRotation) * progress;
      const scale = 1.02 + Math.sin(Math.PI * progress) * .38;
      return { transform: transformAt(point, rotation, scale), offset: progress };
    });
  }

  function startFlightSparks(from, to, duration, curveSide) {
    const generation = ++sparkGeneration;
    const startedAt = performance.now();
    let lastSparkAt = 0;
    function tick(now) {
      if (generation !== sparkGeneration || !isActive()) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      if (now - lastSparkAt > 45 && progress > .03 && progress < .98) {
        lastSparkAt = now;
        const point = flightPoint(from, to, progress, curveSide);
        const spark = document.createElement('i');
        spark.className = 'thor-flight-spark';
        spark.style.left = point.x + 'px';
        spark.style.top = point.y + 'px';
        spark.style.setProperty('--spark-turn', (Math.random() * 130 - 65) + 'deg');
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 360);
      }
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function cancelAnimation() {
    hammer.getAnimations().forEach((current) => current.cancel());
    animation = null;
  }

  function resetThor() {
    cancelAnimation();
    phase = 'held';
    restingPoint = null;
    hammer.classList.remove('visible', 'stuck', 'aiming', 'in-flight');
    hand.classList.remove('visible', 'pulling');
    impact.classList.remove('visible');
    crack.classList.remove('visible', 'departing');
    sparkGeneration += 1;
    $$('.thor-flight-spark').forEach((spark) => spark.remove());
    document.documentElement.classList.remove('thor-cursor-thrown');
    document.documentElement.classList.remove('thor-aiming');
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    dragStart = null;
    dragging = false;
    hint.innerHTML = '<b>🔨</b><span>Arraste e solte para arremessar</span>';
  }

  function wallTarget(origin = pointer) {
    const margin = 30;
    let dx = direction.x;
    let dy = direction.y;
    if (Math.hypot(dx, dy) < .2) { dx = 1; dy = 0; }
    const length = Math.hypot(dx, dy);
    dx /= length; dy /= length;
    const times = [];
    if (dx > .001) times.push((innerWidth - margin - origin.x) / dx);
    if (dx < -.001) times.push((margin - origin.x) / dx);
    if (dy > .001) times.push((innerHeight - margin - origin.y) / dy);
    if (dy < -.001) times.push((margin - origin.y) / dy);
    const travel = Math.max(70, Math.min(...times.filter((value) => value > 0)));
    return {
      x: Math.max(margin, Math.min(innerWidth - margin, origin.x + dx * travel)),
      y: Math.max(margin, Math.min(innerHeight - margin, origin.y + dy * travel)),
    };
  }

  function showImpact(point) {
    impact.style.left = point.x + 'px';
    impact.style.top = point.y + 'px';
    impact.classList.remove('visible');
    requestAnimationFrame(() => impact.classList.add('visible'));
    setTimeout(() => impact.classList.remove('visible'), 620);
    crack.style.left = point.x + 'px';
    crack.style.top = point.y + 'px';
    crack.style.setProperty('--crack-turn', (Math.atan2(direction.y, direction.x) * 180 / Math.PI) + 'deg');
    crack.classList.remove('departing');
    requestAnimationFrame(() => crack.classList.add('visible'));
    const app = $('.app');
    app?.classList.remove('thor-site-shake');
    requestAnimationFrame(() => app?.classList.add('thor-site-shake'));
    setTimeout(() => app?.classList.remove('thor-site-shake'), 430);
  }

  function throwHammer(origin = pointer) {
    if (!isActive() || phase !== 'held') return;
    phase = 'throwing';
    const start = { ...origin };
    restingPoint = wallTarget(start);
    document.documentElement.classList.add('thor-cursor-thrown');
    updateHandPosition();
    hand.classList.add('visible');
    hand.classList.remove('pulling');
    hammer.classList.add('visible');
    hammer.classList.remove('stuck', 'aiming');
    const distance = Math.hypot(restingPoint.x - start.x, restingPoint.y - start.y);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : Math.max(680, Math.min(1250, distance * 1.7));
    hammer.classList.add('in-flight');
    startFlightSparks(start, restingPoint, duration, 1);
    const flight = hammer.animate(throwFrames(start, restingPoint, 0, 1080, 1), { duration, easing: 'cubic-bezier(.24,.48,.22,1)', fill: 'forwards' });
    animation = flight;
    flight.onfinish = () => {
      animation = null;
      phase = 'stuck';
      hammer.style.transform = transformAt(restingPoint, 1080, 1);
      flight.cancel();
      hammer.classList.remove('in-flight');
      hammer.classList.add('stuck');
      hint.innerHTML = '<kbd>T</kbd><span>Chamar Mjölnir de volta</span>';
      showImpact(restingPoint);
    };
  }

  function recallHammer() {
    if (!isActive() || phase !== 'stuck' || !restingPoint) return;
    phase = 'returning';
    hammer.classList.remove('stuck');
    hand.classList.add('pulling');
    crack.classList.add('departing');
    setTimeout(() => crack.classList.remove('visible', 'departing'), 420);
    const destination = { ...pointer };
    const distance = Math.hypot(destination.x - restingPoint.x, destination.y - restingPoint.y);
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : Math.max(620, Math.min(1050, distance * 1.45));
    hammer.classList.add('in-flight');
    startFlightSparks(restingPoint, destination, duration, -1);
    const returning = hammer.animate(throwFrames(restingPoint, destination, 1080, 0, -1), { duration, easing: 'cubic-bezier(.3,.05,.2,1)', fill: 'forwards' });
    animation = returning;
    returning.onfinish = () => {
      animation = null;
      phase = 'held';
      restingPoint = null;
      returning.cancel();
      hammer.classList.remove('visible', 'in-flight');
      hand.classList.remove('visible', 'pulling');
      document.documentElement.classList.remove('thor-cursor-thrown');
      hint.innerHTML = '<b>🔨</b><span>Arraste e solte para arremessar</span>';
    };
  }

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (dragStart && phase === 'held') event.preventDefault();
    const next = { x: event.clientX, y: event.clientY };
    const dx = next.x - pointer.x;
    const dy = next.y - pointer.y;
    if (Math.hypot(dx, dy) > 3 && phase === 'held') direction = { x: dx, y: dy };
    pointer = next;
    if (phase === 'throwing' || phase === 'stuck') updateHandPosition();
    if (dragStart && phase === 'held') {
      const dragX = next.x - dragStart.x;
      const dragY = next.y - dragStart.y;
      const distance = Math.hypot(dragX, dragY);
      if (distance >= 18) {
        dragging = true;
        document.documentElement.classList.add('thor-aiming');
        hammer.style.transform = transformAt(dragStart, 0, .9);
        hammer.classList.add('visible', 'aiming');
        hint.innerHTML = '<b>⚡</b><span>Solte para arremessar</span>';
      }
    }
  }, { capture: true, passive: false });

  document.addEventListener('keydown', (event) => {
    if (!isActive() || event.repeat || event.key.toLowerCase() !== 't') return;
    if (isNativeInteractiveTarget(event.target)) return;
    if (phase !== 'stuck') return;
    event.preventDefault();
    recallHammer();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isActive() || event.button !== 0) return;
    if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return;
    // Native controls must remain usable even while Mjölnir is stuck on the
    // page. In particular, quantity fields need to receive focus and typing.
    if (isNativeInteractiveTarget(event.target)) {
      // A arremessada anterior pode ter deixado um clique de retorno pendente;
      // nunca consuma o próximo clique de um controle nativo.
      suppressNextClick = false;
      return;
    }
    if (phase === 'stuck') {
      suppressNextClick = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      recallHammer();
      return;
    }
    if (phase !== 'held') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add('premium-pointer-gesture-active');
    dragStart = { x: event.clientX, y: event.clientY };
    dragging = false;
  }, true);

  document.addEventListener('pointerup', (event) => {
    if (!isActive() || !dragStart || phase !== 'held') return;
    const dragX = event.clientX - dragStart.x;
    const dragY = event.clientY - dragStart.y;
    const distance = Math.hypot(dragX, dragY);
    document.documentElement.classList.remove('thor-aiming');
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    const origin = { ...dragStart };
    dragStart = null;
    if (!dragging || distance < 28) {
      dragging = false;
      hammer.classList.remove('visible', 'aiming');
      hint.innerHTML = '<b>🔨</b><span>Arraste e solte para arremessar</span>';
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    pointer = { x: event.clientX, y: event.clientY };
    direction = { x: dragX, y: dragY };
    dragging = false;
    suppressNextClick = true;
    blockNativeUntil = performance.now() + 500;
    throwHammer(origin);
  }, true);

  document.addEventListener('pointercancel', () => {
    dragStart = null;
    dragging = false;
    hammer.classList.remove('visible', 'aiming');
    document.documentElement.classList.remove('thor-aiming');
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    hint.innerHTML = '<b>🔨</b><span>Arraste e solte para arremessar</span>';
  }, true);

  document.addEventListener('selectstart', (event) => { if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return; if (isActive() && (dragStart || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('dragstart', (event) => { if (isActive() && (dragStart || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('contextmenu', (event) => { if (isActive() && (dragStart || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);

  document.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    if (isNativeInteractiveTarget(event.target)) {
      suppressNextClick = false;
      return;
    }
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', () => {
    if (!restingPoint) return;
    restingPoint.x = Math.max(30, Math.min(innerWidth - 30, restingPoint.x));
    restingPoint.y = Math.max(30, Math.min(innerHeight - 30, restingPoint.y));
    if (phase === 'stuck') hammer.style.transform = transformAt(restingPoint, 1080, 1);
  }, { passive: true });

  new MutationObserver(() => { if (!isActive()) resetThor(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-cursor'] });
}
startThorCursorThrow();

function startWolverineCursorSlash() {
  const hint = document.createElement('aside');
  hint.className = 'premium-cursor-hint wolverine-cursor-hint';
  hint.innerHTML = '<b>✦</b><span>Arraste para cortar</span>';
  document.body.appendChild(hint);
  let start = null;
  let mark = null;
  let dragging = false;
  let suppressClick = false;
  let slicing = false;
  let blockNativeUntil = 0;
  const isActive = () => document.documentElement.dataset.activeCursor === 'wolverine';

  function buildMark() {
    const element = document.createElement('span');
    element.className = 'wolverine-cut-mark';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = '<i></i><i></i><i></i>';
    document.body.appendChild(element);
    return element;
  }

  function positionMark(element, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    element.style.left = from.x + 'px';
    element.style.top = from.y + 'px';
    element.style.width = distance + 'px';
    element.style.setProperty('--cut-turn', Math.atan2(dy, dx) + 'rad');
  }

  function reset() {
    start = null;
    dragging = false;
    mark?.remove();
    mark = null;
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    $('.app')?.classList.remove('wolverine-site-sliced');
  }

  function splitScreen(from, to) {
    if (slicing) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const rift = document.createElement('span');
    rift.className = 'wolverine-reality-rift';
    rift.setAttribute('aria-hidden', 'true');
    rift.innerHTML = '<b></b><b></b><i></i>';
    rift.style.left = from.x + 'px';
    rift.style.top = from.y + 'px';
    rift.style.width = distance + 'px';
    rift.style.setProperty('--cut-turn', Math.atan2(to.y - from.y, to.x - from.x) + 'rad');
    document.body.appendChild(rift);
    slicing = true;
    setTimeout(() => {
      rift.remove();
      slicing = false;
    }, 1620);
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isActive() || event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return;
    if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return;
    if (isNativeInteractiveTarget(event.target)) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add('premium-pointer-gesture-active');
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!isActive() || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    event.preventDefault();
    const current = { x: event.clientX, y: event.clientY };
    if (Math.hypot(current.x - start.x, current.y - start.y) < 14) return;
    dragging = true;
    if (!mark) mark = buildMark();
    positionMark(mark, start, current);
    mark.classList.add('drawing');
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', (event) => {
    if (!isActive() || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    const from = start;
    const to = { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    start = null;
    if (!dragging || !mark || distance < 30) { reset(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = true;
    blockNativeUntil = performance.now() + 500;
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    positionMark(mark, from, to);
    mark.classList.remove('drawing');
    mark.classList.add('released');
    const releasedMark = mark;
    mark = null;
    dragging = false;
    splitScreen(from, to);
    setTimeout(() => releasedMark.remove(), 1740);
  }, true);

  document.addEventListener('pointercancel', reset, true);
  document.addEventListener('selectstart', (event) => { if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return; if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('dragstart', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('contextmenu', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('click', (event) => {
    if (!suppressClick) return;
    if (isNativeInteractiveTarget(event.target)) {
      suppressClick = false;
      return;
    }
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  new MutationObserver(() => { if (!isActive()) reset(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-cursor'] });
}
startWolverineCursorSlash();

function startCobblemonCaptureThrow() {
  const ball = document.createElement('span');
  const hint = document.createElement('aside');
  ball.className = 'cobblemon-thrown-ball';
  ball.setAttribute('aria-hidden', 'true');
  ball.innerHTML = '<img src="/capture-ball-cobblemon.png" alt="">';
  hint.className = 'premium-cursor-hint cobblemon-cursor-hint';
  hint.innerHTML = '<b>◉</b><span>Arraste e solte para capturar</span>';
  document.body.append(ball, hint);
  let start = null;
  let dragging = false;
  let busy = false;
  let suppressClick = false;
  let blockNativeUntil = 0;
  let generation = 0;
  let wildTarget = null;
  // Todas as criaturas da captura usam versões com margem transparente para nunca recortar no efeito.
  const creatures = [
    'https://cobbledex.b-cdn.net/3dmons/previews/large/25.webp',
    'https://cobbledex.b-cdn.net/3dmons/previews/large/4.webp',
    'https://cobbledex.b-cdn.net/3dmons/previews/large/7.webp',
    'https://cobbledex.b-cdn.net/3dmons/previews/large/133.webp',
    'https://cobbledex.b-cdn.net/3dmons/previews/large/403.webp',
  ];
  const isActive = () => document.documentElement.dataset.activeCursor === 'cobblemon';
  const place = (point, scale = 1) => `translate3d(${point.x - 32}px,${point.y - 32}px,0) scale(${scale})`;
  const effectHost = () => document.querySelector('dialog[open]') || document.body;

  function keepEffectsAboveDialog() {
    const destination = effectHost();
    [ball, hint].forEach((element) => {
      if (element.parentElement !== destination) destination.appendChild(element);
    });
  }

  function removeWildTarget() {
    wildTarget?.element?.remove();
    wildTarget = null;
  }

  function spawnWildTarget(origin) {
    removeWildTarget();
    const dialog = document.querySelector('dialog[open]');
    const frame = dialog?.getBoundingClientRect();
    const inset = 72;
    const minX = frame ? Math.min(frame.left + inset, frame.right - inset) : 75;
    const maxX = frame ? Math.max(frame.left + inset, frame.right - inset) : Math.max(75, innerWidth - 150);
    const minY = frame ? Math.min(frame.top + inset, frame.bottom - inset) : 130;
    const maxY = frame ? Math.max(frame.top + inset, frame.bottom - inset) : Math.max(130, innerHeight - 210);
    let point = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = { x: minX + Math.random() * Math.max(1, maxX - minX), y: minY + Math.random() * Math.max(1, maxY - minY) };
      point = candidate;
      if (Math.hypot(candidate.x - origin.x, candidate.y - origin.y) > 210) break;
    }
    const element = document.createElement('span');
    element.className = 'cobblemon-wild-target';
    element.setAttribute('aria-hidden', 'true');
    element.style.left = point.x + 'px';
    element.style.top = point.y + 'px';
    element.innerHTML = `<img src="${creatures[Math.floor(Math.random() * creatures.length)]}" alt="">`;
    effectHost().appendChild(element);
    wildTarget = { element, ...point };
    hint.innerHTML = '<b>◉</b><span>Mire na criatura e solte</span>';
  }

  function showCaptureConfirmation(point) {
    const element = document.createElement('b');
    element.className = 'cobblemon-capture-confirmation';
    element.setAttribute('aria-hidden', 'true');
    element.textContent = '✓ CAPTURADO!';
    element.style.left = point.x + 'px';
    element.style.top = point.y + 'px';
    effectHost().appendChild(element);
    setTimeout(() => element.remove(), 920);
  }

  function burst(point, purple = false) {
    for (let index = 0; index < 16; index += 1) {
      const angle = (Math.PI * 2 * index / 16) + Math.random() * .25;
      const distance = 42 + Math.random() * 42;
      const particle = document.createElement('i');
      particle.className = `cobblemon-capture-particle${purple ? ' purple' : ''}`;
      particle.textContent = purple ? (index % 2 ? '✦' : '·') : index % 3 === 0 ? '✦' : index % 2 ? '■' : '●';
      particle.style.left = point.x + 'px';
      particle.style.top = point.y + 'px';
      particle.style.setProperty('--capture-x', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--capture-y', Math.sin(angle) * distance + 'px');
      effectHost().appendChild(particle);
      setTimeout(() => particle.remove(), 720);
    }
  }

  function reset() {
    generation += 1;
    start = null;
    dragging = false;
    busy = false;
    ball.getAnimations().forEach((animation) => animation.cancel());
    ball.classList.remove('visible', 'aiming', 'catching', 'exploding', 'captured');
    removeWildTarget();
    document.documentElement.classList.remove('cobblemon-ball-thrown');
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    hint.innerHTML = '<b>◉</b><span>Arraste e solte para capturar</span>';
  }

  function launch(from, to, hit) {
    busy = true;
    const currentGeneration = ++generation;
    const middle = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - Math.min(150, 65 + Math.hypot(to.x - from.x, to.y - from.y) * .22) };
    document.documentElement.classList.add('cobblemon-ball-thrown');
    ball.classList.add('visible');
    ball.classList.remove('aiming');
    const flight = ball.animate([
      { transform: place(from, .86), offset: 0 },
      { transform: place(middle, 1.08), offset: .52 },
      { transform: place(to, 1), offset: 1 },
    ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 760, easing: 'cubic-bezier(.22,.62,.28,1)', fill: 'forwards' });
    flight.onfinish = () => {
      if (currentGeneration !== generation || !isActive()) return reset();
      ball.style.transform = place(to, 1);
      flight.cancel();
      ball.classList.add('catching');
      const ring = document.createElement('i');
      ring.className = 'cobblemon-capture-ring';
      ring.style.left = to.x + 'px';
      ring.style.top = to.y + 'px';
      effectHost().appendChild(ring);
      setTimeout(() => {
        if (currentGeneration !== generation || !isActive()) { ring.remove(); return; }
        ball.classList.remove('catching');
        // A captura depende somente da mira: acertou o Pokémon, capturou.
        const captured = hit;
        if (captured) {
          ball.classList.add('captured');
          ring.classList.add('captured');
          wildTarget?.element?.classList.add('captured');
          showCaptureConfirmation(to);
          burst(to, true);
        } else {
          ball.classList.add('exploding');
          wildTarget?.element?.classList.add('escaped');
          burst(to);
          ring.classList.add('failed');
        }
        setTimeout(() => ring.remove(), captured ? 760 : 520);
        setTimeout(() => {
          if (currentGeneration !== generation) return;
          ball.classList.remove('visible', 'exploding', 'captured');
          removeWildTarget();
          document.documentElement.classList.remove('cobblemon-ball-thrown');
          busy = false;
          hint.innerHTML = '<b>◉</b><span>Arraste e solte para capturar</span>';
        }, captured ? 720 : 680);
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 1500);
    };
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isActive() || busy || event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return;
    if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return;
    if (isNativeInteractiveTarget(event.target)) return;
    keepEffectsAboveDialog();
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add('premium-pointer-gesture-active');
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
    spawnWildTarget(start);
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (!isActive() || busy || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    event.preventDefault();
    const current = { x: event.clientX, y: event.clientY };
    if (Math.hypot(current.x - start.x, current.y - start.y) < 14) return;
    dragging = true;
    ball.style.transform = place(start, .82);
    ball.classList.add('visible', 'aiming');
    hint.innerHTML = '<b>◉</b><span>Solte para lançar</span>';
  }, { capture: true, passive: false });
  document.addEventListener('pointerup', (event) => {
    if (!isActive() || busy || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    const from = start;
    const rawTarget = { x: event.clientX, y: event.clientY };
    const target = { x: Math.max(42, Math.min(innerWidth - 42, rawTarget.x)), y: Math.max(42, Math.min(innerHeight - 42, rawTarget.y)) };
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    start = null;
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    if (!dragging || distance < 30) { ball.classList.remove('visible', 'aiming'); dragging = false; removeWildTarget(); return; }
    dragging = false;
    suppressClick = true;
    blockNativeUntil = performance.now() + 500;
    event.preventDefault();
    event.stopImmediatePropagation();
    const hit = Boolean(wildTarget && Math.hypot(rawTarget.x - wildTarget.x, rawTarget.y - wildTarget.y) <= 125);
    const destination = hit ? { x: wildTarget.x, y: wildTarget.y } : target;
    launch(from, destination, hit);
  }, true);
  document.addEventListener('pointercancel', () => { start = null; dragging = false; document.documentElement.classList.remove('premium-pointer-gesture-active'); if (!busy) { ball.classList.remove('visible', 'aiming'); removeWildTarget(); } }, true);
  document.addEventListener('selectstart', (event) => { if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return; if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('dragstart', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('contextmenu', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('click', (event) => {
    if (!suppressClick) return;
    if (isNativeInteractiveTarget(event.target)) {
      suppressClick = false;
      return;
    }
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  new MutationObserver(() => { if (!isActive()) reset(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-cursor'] });
}
startCobblemonCaptureThrow();

function startWebSlingerCursor() {
  const hint = document.createElement('aside');
  hint.className = 'premium-cursor-hint web-slinger-cursor-hint';
  hint.innerHTML = '<b>🕸</b><span>Arraste e solte para lançar</span>';
  document.body.appendChild(hint);
  let start = null;
  let dragging = false;
  let suppressClick = false;
  let blockNativeUntil = 0;
  const isActive = () => document.documentElement.dataset.activeCursor === 'web-slinger';

  function fireWeb(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const strand = document.createElement('i');
    const projectile = document.createElement('i');
    const splat = document.createElement('span');
    strand.className = 'web-slinger-strand';
    projectile.className = 'web-slinger-projectile';
    splat.className = 'web-slinger-splat';
    strand.style.left = from.x + 'px';
    strand.style.top = from.y + 'px';
    strand.style.width = distance + 'px';
    strand.style.setProperty('--web-turn', Math.atan2(dy, dx) + 'rad');
    projectile.style.left = from.x + 'px';
    projectile.style.top = from.y + 'px';
    splat.style.left = to.x + 'px';
    splat.style.top = to.y + 'px';
    splat.innerHTML = '<b></b>' + Array.from({ length: 8 }, (_, index) => `<i style="--ray:${index * 45}deg"></i>`).join('');
    document.body.append(strand, projectile, splat);
    projectile.animate([
      { transform: 'translate3d(0,0,0) scale(.6)' },
      { transform: `translate3d(${dx}px,${dy}px,0) scale(1)` },
    ], { duration: 520, easing: 'cubic-bezier(.18,.7,.25,1)', fill: 'forwards' });
    setTimeout(() => splat.classList.add('arrived'), 470);
    setTimeout(() => projectile.remove(), 560);
    setTimeout(() => strand.remove(), 1120);
    setTimeout(() => splat.remove(), 1580);
  }

  function reset() {
    start = null;
    dragging = false;
    document.documentElement.classList.remove('premium-pointer-gesture-active');
    hint.innerHTML = '<b>🕸</b><span>Arraste e solte para lançar</span>';
  }

  document.addEventListener('pointerdown', (event) => {
    if (!isActive() || event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return;
    if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return;
    if (isNativeInteractiveTarget(event.target)) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add('premium-pointer-gesture-active');
    start = { x: event.clientX, y: event.clientY };
    dragging = false;
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!isActive() || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 14) return;
    dragging = true;
    hint.innerHTML = '<b>🕸</b><span>Solte para disparar</span>';
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', (event) => {
    if (!isActive() || !start || (event.pointerType && event.pointerType !== 'mouse')) return;
    const from = start;
    const to = { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const didDrag = dragging;
    reset();
    if (!didDrag || distance < 30) return;
    suppressClick = true;
    blockNativeUntil = performance.now() + 500;
    event.preventDefault();
    event.stopImmediatePropagation();
    fireWeb(from, to);
  }, true);

  document.addEventListener('pointercancel', reset, true);
  document.addEventListener('selectstart', (event) => { if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return; if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('dragstart', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('contextmenu', (event) => { if (isActive() && (start || performance.now() < blockNativeUntil)) event.preventDefault(); }, true);
  document.addEventListener('click', (event) => {
    if (!suppressClick) return;
    if (isNativeInteractiveTarget(event.target)) {
      suppressClick = false;
      return;
    }
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  new MutationObserver(() => { if (!isActive()) reset(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-cursor'] });
}
startWebSlingerCursor();

// Proteção única para todos os cursores premium: durante um arrasto, o gesto
// pertence ao efeito e nunca deve iniciar a seleção nativa de texto da página.
function preventTextSelectionOnPremiumCursorDrag() {
  let start = null;
  let blockNativeUntil = 0;
  const isEffectCursor = () => {
    const cursor = document.documentElement.dataset.activeCursor;
    return Boolean(cursor && cursor !== 'windows');
  };
  const clear = () => { start = null; document.documentElement.classList.remove('premium-cursor-dragging'); };

  document.addEventListener('pointerdown', (event) => {
    if (!isEffectCursor() || (event.pointerType && event.pointerType !== 'mouse')) return;
    if (isNativeInteractiveTarget(event.target)) return;
    start = { x: event.clientX, y: event.clientY };
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!start || !isEffectCursor()) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    document.documentElement.classList.add('premium-cursor-dragging');
    event.preventDefault();
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', (event) => {
    if (!start) return;
    if (document.documentElement.classList.contains('premium-cursor-dragging')) {
      blockNativeUntil = performance.now() + 700;
      event.preventDefault();
    }
    clear();
  }, true);
  document.addEventListener('pointercancel', clear, true);
  ['selectstart', 'dragstart', 'contextmenu'].forEach((type) => document.addEventListener(type, (event) => {
    if (event.target?.closest?.('.feed-post-text,.feed-comment-text')) return;
    if (isEffectCursor() && (start || performance.now() < blockNativeUntil)) event.preventDefault();
  }, true));
}
preventTextSelectionOnPremiumCursorDrag();

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

// Cada baú misterioso tem uma fonte visual única. O servidor continua
// enviando nome/tier/ícone de compatibilidade, mas a interface sempre resolve
// o tipo visual oficial para loja, inventário, abertura, venda e histórico.
const rouletteBoxVisuals = Object.freeze({
  sonda: { label: 'Caixa Sonda' },
  cosmic: { label: 'Caixa Cósmica' },
  area51: { label: 'Cofre Área 51' },
  'master-aurora': { label: 'Baú Master Aurora' },
  'master-imperial': { label: 'Baú Master Imperial' },
});

function rouletteBoxVisualKind(source) {
  const value = typeof source === 'string'
    ? source
    : [source?.tier, source?.value, source?.boxId, source?.id, source?.name].filter(Boolean).join(' ');
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('master-imperial') || normalized.includes('master imperial')) return 'master-imperial';
  if (normalized.includes('master-aurora') || normalized.includes('master aurora')) return 'master-aurora';
  if (normalized.includes('area51') || normalized.includes('área 51') || normalized.includes('area 51')) return 'area51';
  if (normalized.includes('cosmic') || normalized.includes('cósmic')) return 'cosmic';
  if (normalized.includes('sonda')) return 'sonda';
  return '';
}

function rouletteBoxIconMarkup(source, className = '') {
  const kind = rouletteBoxVisualKind(source);
  if (!kind) return '';
  const suffix = className ? ` ${escapeHtml(className)}` : '';
  return `<i class="mystery-box-icon mystery-box-icon-${kind}${suffix}" role="img" aria-label="${rouletteBoxVisuals[kind].label}"></i>`;
}

// Arte oficial dos poderes: a mesma peça é reutilizada na loja, inventário e chances do baú.
const powerIconAssets = Object.freeze({
  'power-cleanse-cursor': 'antidoto-maldicao',
  'power-loan-extension': 'acordo-estelar',
  'power-reveal-author': 'raio-x-autoria',
  'power-shield-gay': 'escudo-rodada',
  'power-theme': 'controle-tema',
  'power-force-gay-cursor': 'seta-gay-compulsoria',
  'power-choose-gay': 'controle-gay-rodada',
  'power-choose-wallpaper': 'escolha-wallpaper',
  'power-assign-wallpaper': 'definir-wallpaper',
  'power-giant-slow-cursor': 'maldicao-mouse-gigante',
  'power-adhd-cursor': 'maldicao-tdah',
});

const badgeIconAssets = Object.freeze({
  'badge-operacao-blackstar': 'operacao-blackstar',
  'badge-comet': 'cometa',
  'badge-ufo': 'piloto-ufo',
  'badge-crown': 'coroa-cosmica',
  'badge-alien': 'agente-alien',
  'badge-gta-neon': 'palmeira-neon',
  'badge-cobblemon': 'criatura-eletrica',
  'badge-wolverine': 'fera-garras',
  'badge-samurai': 'portal-samurai',
  'badge-god-war': 'runa-norte',
  'badge-halloween-pumpkin': 'abobora-radioativa',
});

const titleIconAssets = Object.freeze({
  'title-operador-blackstar': 'operador-blackstar',
  'title-master-guardian': 'guardiao-master',
  'title-star': 'estrela-51',
  'title-hydrated': 'hidratado-intergalactico',
});

const frameIconAssets = Object.freeze({
  'frame-blackstar': 'blackstar',
  'frame-rose': 'rose',
  'frame-orbit': 'orbit',
  'frame-cosmic': 'cosmic',
  'frame-gold': 'gold',
  'frame-neon': 'neon',
  'frame-ice': 'ice',
  'frame-emerald': 'emerald',
  'frame-fire': 'fire',
  'frame-royal': 'royal',
  'frame-void': 'void',
  'frame-halloween-rune': 'halloween-rune',
  'frame-sovereign-command': 'sovereign',
});

const achievementIconAssets = Object.freeze({
  'Primeiro contato': 'primeiro-contato',
  'Hidratado': 'hidratado',
  'Agente do caos': 'agente-caos',
  'Campeão da Área 51': 'campeao-area-51',
  'Colecionador cósmico': 'colecionador-cosmico',
  'Sinal perdido': 'sinal-perdido',
  'Arquivo cósmico': 'arquivo-cosmico',
  'Comandante da Expedição': 'comandante-expedicao',
  'Filósofo alienígena': 'filosofo-alienigena',
});

function achievementIconMarkup(item, className = '') {
  const asset = achievementIconAssets[String(item?.name || '')];
  if (!asset) return '';
  const extension = asset === 'filosofo-alienigena' ? 'svg' : 'png';
  return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="/roulette51/shop-icons/achievements/${asset}.${extension}" alt="${escapeHtml(item.name)}">`;
}

function creditIconMarkup(className = '') {
  return `<img class="catalog-art-icon credit-51-art${className ? ' ' + escapeHtml(className) : ''}" src="/roulette51/shop-icons/creditos-51.png" alt="Créditos 51">`;
}

function marketAssetIconMarkup(asset, className = '') {
  const name = String(asset?.name || '').toLowerCase();
  const token = name.includes('nebula') ? 'nebula' : name.includes('titan') ? 'titan' : name.includes('lunar') ? 'lunar' : name.includes('plasma') ? 'plasma' : name.includes('terra') ? 'terra' : name.includes('void') ? 'void' : name.includes('solar') ? 'solar' : name.includes('cometa') ? 'comet' : 'nebula';
  return `<span class="market-token market-token-${token}${className ? ' ' + escapeHtml(className) : ''}" role="img" aria-label="${escapeHtml(asset?.name || 'Moeda do Mercado')}"></span>`;
}

function openingRewardIconMarkup(item) {
  const catalog = catalogIconMarkup(item);
  if (catalog) return catalog;
  if (Number(item?.amount || item?.credits || 0) > 0 || /créditos?/i.test(String(item?.name || ''))) return creditIconMarkup();
  return escapeHtml(item?.icon || '');
}

function weeklyMissionIconMarkup(item) {
  const title = String(item?.title || '').toLowerCase();
  const source = title.includes('mercado') || title.includes('mão firme') ? '/roulette51/shop-icons/creditos-51.png'
    : title.includes('caos') ? '/roulette51/shop-icons/achievements/agente-caos.png'
    : title.includes('voz') || title.includes('wallpaper') ? '/roulette51/menu-icons/inscricoes.png'
    : title.includes('água') || title.includes('hidrata') ? '/roulette51/menu-icons/agua.png'
    : title.includes('cole') || title.includes('arquivo') ? '/roulette51/shop-icons/achievements/arquivo-cosmico.png'
    : '/roulette51/menu-icons/atualizacoes.png';
  return `<img class="catalog-art-icon weekly-mission-art" src="${source}" alt="">`;
}

const cursorIconSources = Object.freeze({
  khepri: '/card-season-2026-10/cursor-khepri.png', crystal: '/cursor-crystal.svg', solar: '/cursor-solar.svg', 'gta-neon': '/cursor-gta-neon-v2.png', cobblemon: '/cursor-cobblemon-v2.png', wolverine: '/cursor-wolverine-v2.png', samurai: '/cursor-samurai.svg', 'god-war': '/cursor-god-war-v2.png', 'halloween-broom': '/cursor-halloween-broom.png', 'halloween-pumpkin': '/cursor-halloween-pumpkin.png', 'halloween-mask': '/cursor-halloween-mask.png', horn: '/unicorn-arrow-cursor.png', dipirona: '/cursor-dipirona.svg', 'pirokinha-cosmica': '/cursor-pirokinha-cosmica.svg', anvisa: '/cursor-anvisa.svg', gay: '/cursor-gay-power.svg', commander: '/cursor-commander.svg', 'galinha-preta': '/cursor-galinha-preta.svg', volei: '/cursor-volei.svg', biblia: '/cursor-biblia.svg', 'papa-bento': '/cursor-papa-bento.svg', 'scrum-master': '/cursor-scrum-master.svg', energetico: '/cursor-energetico.svg', laser: '/cursor-laser.svg', rocket: '/cursor-rocket.svg', alien: '/cursor-alien.svg', petista: '/cursor-petista.svg', bolsonaro: '/cursor-bolsonaro.svg', umbanda: '/cursor-umbanda.svg', unicorn: '/unicorn-cursor-full-v2.png', ufo: '/cursor-ufo.svg', wand: '/cursor-wand.svg', 'comet-tail': '/cursor-comet-tail.svg', thunder: '/cursor-thunder.svg', thor: '/cursor-thor.svg', 'web-slinger': '/cursor-web-slinger-v2.png', messi: '/cursor-messi.svg', cristiano: '/cursor-cristiano.svg', pele: '/cursor-pele.svg', maradona: '/cursor-maradona.svg', neymar: '/cursor-neymar.svg',
});

function catalogIconMarkup(item, className = '') {
  const id = typeof item === 'string' ? item : (item?.itemId || item?.id || '');
  const iconAsset = typeof item === 'object' ? item?.iconAsset : '';
  const powerAsset = powerIconAssets[id];
  const badgeAsset = badgeIconAssets[id];
  const titleAsset = titleIconAssets[id];
  const frameAsset = frameIconAssets[id];
  const name = typeof item === 'object' ? item.name : '';
  const normalizedName = String(name || '').toLowerCase();
  const cursorSource = typeof item === 'object' && item?.type === 'cursorStyle' ? cursorIconSources[item.value] : '';
  if (iconAsset) return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="${escapeHtml(iconAsset)}" alt="${escapeHtml(name || 'Ícone do item')}">`;
  if (normalizedName.includes('maldição do dev')) return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="/cursor-dev-lamp.png" alt="Maldição do Dev">`;
  if (normalizedName.includes('maldição da limpeza')) return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="/cursor-halloween-broom.png" alt="Maldição da Limpeza">`;
  if (cursorSource) return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="${cursorSource}" alt="${escapeHtml(name || 'Cursor')}">`;
  if (!powerAsset && !badgeAsset && !titleAsset && !frameAsset) return '';
  const folder = powerAsset ? 'powers' : badgeAsset ? 'badges' : titleAsset ? 'titles' : 'frames';
  const asset = powerAsset || badgeAsset || titleAsset || frameAsset;
  return `<img class="catalog-art-icon${className ? ' ' + escapeHtml(className) : ''}" src="/roulette51/shop-icons/${folder}/${asset}.png" alt="${escapeHtml(name || 'Ícone do item')}">`;
}

function merchantItemIconMarkup(item, className = '') {
  const visualItem = { ...item, value: item?.styleValue || item?.value || '' };
  const catalog = catalogIconMarkup(visualItem, className);
  if (catalog) return catalog;
  const suffix = className ? ' ' + escapeHtml(className) : '';
  if (visualItem.type === 'siteTheme') return `<span class="catalog-theme-icon catalog-theme-${escapeHtml(visualItem.value)}${suffix}"><i aria-hidden="true">${escapeHtml(visualItem.icon || '◈')}</i></span>`;
  if (visualItem.type === 'trailStyle') return `<span class="catalog-trail-icon catalog-trail-${escapeHtml(visualItem.value)}${suffix}"><b aria-hidden="true">${escapeHtml(visualItem.icon || '✨')}</b><i></i></span>`;
  if (visualItem.type === 'nameStyle') return `<span class="catalog-name-icon name-style-${escapeHtml(visualItem.value)}${suffix}">Aa</span>`;
  return '';
}

function shopCreditMarkup(value, suffix = '') {
  const detail = suffix ? `<em>${String(suffix)}</em>` : '';
  return `<span class="shop-credit-value"><span class="coin-51 shop-credit-icon" aria-hidden="true">51</span><b>${formatCredits(value)}</b><small>Créditos 51</small>${detail}</span>`;
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

const inFlightGetRequests = new Map();
const inFlightMysteryMutations = new Set();

function api(url, options = {}, retry = true) {
  const method = String(options.method || 'GET').toUpperCase();
  const canShare = method === 'GET' && !options.signal;
  if (!canShare) return requestApi(url, options, retry);
  const key = String(url);
  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;
  const request = requestApi(url, options, retry);
  inFlightGetRequests.set(key, request);
  request.then(() => {
    if (inFlightGetRequests.get(key) === request) inFlightGetRequests.delete(key);
  }, () => {
    if (inFlightGetRequests.get(key) === request) inFlightGetRequests.delete(key);
  });
  return request;
}

async function mysteryMutation(url, body) {
  const operationId = body.inventoryId || body.purchaseId || '';
  const key = url + ':' + operationId;
  if (inFlightMysteryMutations.has(key)) throw new Error('Esta operação já está sendo processada.');
  inFlightMysteryMutations.add(key);
  try {
    return await api(url, { method: 'POST', body: { ...body, compact: true } });
  } finally {
    inFlightMysteryMutations.delete(key);
  }
}

async function requestApi(url, options = {}, retry = true) {
  const { timeoutMs = 25000, signal: externalSignal, ...requestOptions } = options;
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 25000));
  const config = { ...requestOptions, credentials: 'same-origin', signal: controller.signal, headers: { ...(options.headers || {}) } };
  const isHalloweenPreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('preview') === 'halloween';
  if (isHalloweenPreview && /^\/api\/(state|sync)$/.test(url)) config.headers['X-Area51-Halloween-Preview'] = 'true';
  if ((!config.method || String(config.method).toUpperCase() === 'GET') && !config.cache) config.cache = 'no-store';
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
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
  }
  if (response.status === 204) return null;
  if (retry && response.status >= 500 && (!config.method || config.method === 'GET')) return api(url, options, false);
  if (!response.ok) {
    if (response.status === 401 && !url.endsWith('/login')) {
      const hadActiveSession = Boolean(appState);
      showAuth();
      if (hadActiveSession) showToast('Sua sessão expirou. Entre novamente para continuar.', 'error');
    }
    if (response.status === 423 && url !== '/api/state' && appState?.me) {
      try { applyState(await requestApi('/api/state', {}, false)); } catch {}
    }
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

// A ampliação permite comparar detalhes antes do voto, mas não inclui qualquer
// identificação de quem enviou o wallpaper enquanto a votação estiver aberta.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-wallpaper-preview-url]');
  if (!trigger) return;
  const dialog = $('#wallpaperPreviewDialog');
  const image = $('#wallpaperPreviewImage');
  const title = trigger.dataset.wallpaperPreviewTitle || 'Wallpaper da rodada';
  image.src = trigger.dataset.wallpaperPreviewUrl;
  image.alt = title;
  $('#wallpaperPreviewLabel').textContent = 'Autoria secreta · visualização para análise';
  if (!dialog.open) dialog.showModal();
});
$('#closeWallpaperPreviewDialog')?.addEventListener('click', () => $('#wallpaperPreviewDialog').close());
$('#wallpaperPreviewDialog')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

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

const portalPages = ['sorteio','inscricoes','memes','anonimos','agua','mentirometro','misterio','impostor','perfil','cobblemon','album','loja','jogos','loteria','mercado','crypto51','votacoes','classificacao','passe','atualizacoes','admin'];
const portalSections = ['inicio', ...portalPages];
const featurePageMap = { jogos: 'casino', loteria: 'casino', impostor: 'impostor', misterio: 'mystery', loja: 'shop', inscricoes: 'uploads' };

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
  if (appState?.communityVotes?.requiredVote && page !== 'votacoes') { page = 'votacoes'; if (pushState) showToast('Há uma votação obrigatória aguardando sua escolha.', 'error'); }
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
  // Preserve parâmetros auxiliares da URL — inclusive o preview local de
  // Halloween — quando a navegação vem de um sino, menu ou atalho.
  const portalQuery = new URLSearchParams(location.search);
  portalQuery.set('pagina', page);
  const portalUrl = '?' + portalQuery.toString();
  if (pushState) history.pushState({ page }, '', portalUrl);
  else if (currentPortalPage() !== page) history.replaceState({ page }, '', portalUrl);
  visiblePortalPage = page;
  document.body.dataset.portalPage = page;
  if (page === 'sorteio') {
    if (musicPreferenceBeforeDraw === null) musicPreferenceBeforeDraw = musicWanted;
    musicWanted = true;
    startMusic();
  } else if (musicPreferenceBeforeDraw !== null) {
    musicWanted = musicPreferenceBeforeDraw;
    musicPreferenceBeforeDraw = null;
    if (!musicWanted) pauseMusic();
  }
  updateMusicButton();
  // Trocas de aba devem ser imediatas; animação suave aqui prendia a navegação
  // no scroll da página anterior por vários segundos.
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'auto' });
  updateCobblemonHuntSector(page);
  if (appState?.realtimeTransport === 'adaptive-poll' && ['sorteio','inscricoes'].includes(page)) schedulePortalSync(0);
  if (appState && !renderingActivePortalPage && renderedPortalPage !== page) {
    const requestId = ++portalRenderRequest;
    const renderPage = () => {
      if (requestId !== portalRenderRequest || currentPortalPage() !== page || renderedPortalPage === page) return;
      renderActivePortalPage(appState);
    };
    // Páginas com listas grandes precisam pintar o cabeçalho e o layout antes
    // de montar todos os cards. Isso tira a espera perceptível da navegação;
    // o conteúdo continua sendo renderizado logo depois, sem nova requisição.
    const needsFirstPaint = cobblemonPageEncounter || page === 'perfil' || page === 'loja';
    if (needsFirstPaint) requestAnimationFrame(() => requestAnimationFrame(renderPage));
    else setTimeout(renderPage, 0);
  }
}

function updateActiveNavigation() {
  navigationFrame = null;
  if (!appState) return;
  const page = currentPortalPage();
  if (visiblePortalPage === page) return;
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

function setButtonBusy(button, busy, label = 'Aguarde…') {
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? label : button.dataset.label;
}

function setAuthTab(name) {
  $$('.auth-tab').forEach((button) => {
    const active = button.dataset.authTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
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

function isMusicFixedForDrawPage() {
  return currentPortalPage() === 'sorteio';
}

function updateMusicButton() {}

async function startMusic() {}

function pauseMusic() {
  stopMusicSource();
  if (fallbackAudio) fallbackAudio.pause();
  if (musicContext && musicContext.state === 'running') musicContext.suspend().catch(() => {});
  updateMusicButton();
}

function primeMusicFromGesture() {}

// Navegadores só liberam áudio após um gesto. Uma única interação prepara a
// trilha para que qualquer roleta iniciada depois toque para toda a pessoa.
function unlockRoundMusicFromAnyGesture() {
  if (!musicPrimedByGesture) {
    musicPrimedByGesture = true;
    primeMusicFromGesture(false);
  }
  // O primeiro gesto pode ocorrer antes de a sessão terminar de carregar;
  // tente novamente em cada gesto até o áudio realmente iniciar.
  if (appState && musicEpoch && !musicIsPlaying()) startMusic();
}
['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, unlockRoundMusicFromAnyGesture, { passive: true }));
document.addEventListener('click', () => {
  if (appState && musicWanted && !musicIsPlaying()) unlockRoundMusicFromAnyGesture();
}, { passive: true });

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
  hydrateMusicPreference(data.me?.id);
  applyState(data);
  if (typeof optimizeLegacyAvatar === 'function') optimizeLegacyAvatar(data);
  showPortalPage(currentPortalPage());
  $('#feedbackLauncher').classList.add('hidden');
  $('#feedbackTopButton').classList.remove('hidden');
  refreshFeedback(true);
  connectLive();
  checkPublishedRelease();
  // Frequência baixa para não consumir requisições do plano gratuito do Cloudflare.
  if (!window.area51ReleasePoll) window.area51ReleasePoll = setInterval(checkPublishedRelease, 300000);
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
  const deadlineShameForced = data.visualTheme === 'deadline-shame';
  const specialThemeForced = rainbowThemeForced || punishmentThemeForced || deadlineShameForced;
  const debtTheme = !specialThemeForced && Boolean(data.profile?.loan?.overdue);
  document.body.classList.toggle('theme-debt', debtTheme);
  // A pauta aprovada retirou o modo claro. Temas pessoais continuam existindo,
  // mas são sempre apresentados sobre a base escura do portal.
  localStorage.removeItem('area51DarkMode:' + data.me.id);
  const dark = !specialThemeForced;

  document.body.classList.toggle('theme-rainbow', rainbowThemeForced);
  document.body.classList.toggle('theme-punishment', punishmentThemeForced);
  document.body.classList.toggle('theme-deadline-shame', deadlineShameForced);
  document.body.classList.toggle('theme-dark', dark);
  updateThemePenaltyTimer(specialThemeForced ? data.visualThemeEndsAt : null);
  if (!button) return;

  button.hidden = true;
  button.disabled = true;
  button.classList.toggle('on', dark);
  button.classList.toggle('forced', specialThemeForced);
  button.textContent = rainbowThemeForced ? '★' : punishmentThemeForced ? '▼' : deadlineShameForced ? '🫏' : dark ? '☀' : '☾';
  button.title = debtTheme ? 'Tema Bandido Estelar: quite a dívida para restaurar seus visuais' : rainbowThemeForced
    ? 'Tema colorido obrigatório: você é o Gay da Rodada'
    : punishmentThemeForced ? 'Tema Castigo obrigatório: seu wallpaper foi o pior da rodada'
    : deadlineShameForced ? 'Abduzido por falta de comprometimento · Cusão da rodada'
    : dark ? 'Desativar modo escuro' : 'Ativar modo escuro';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', dark ? 'true' : 'false');
}

function applySeasonalEvent(event) {
  const halloweenActive = event?.id === 'halloween-2026' && event.active === true;
  document.body.dataset.seasonalEvent = halloweenActive ? event.id : '';
  document.documentElement.dataset.seasonalEvent = halloweenActive ? event.id : '';
  // A temporada altera somente o catálogo da Loja. O restante do portal
  // continua exatamente como o usuário configurou; a ambientação só aparece
  // se ele equipar voluntariamente o tema premium comprado.
  $('#seasonalAtmosphere')?.remove();
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
  $$('.mode-button').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function drawWheel() {
  // The wheel is cosmetic. A browser that temporarily cannot initialize a
  // canvas must still be able to authenticate and open the portal.
  if (!canvas || !ctx) return;
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
      ? '<button class="gallery-image-open" type="button" data-wallpaper-preview-url="' + escapeHtml(item.imageUrl) + '" data-wallpaper-preview-title="' + escapeHtml(item.title) + '" aria-label="Ampliar wallpaper ' + escapeHtml(item.title) + '"><img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" decoding="async"></button>'
      : '<div class="secret-wallpaper"><span>✦</span><strong>ENVIO RECEBIDO</strong><small>A imagem aparece quando todos enviarem</small></div>';
    return '<article class="gallery-card">' +
      visual +
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

function notificationIconMarkup(item) {
  // Os destaques da Pokédex já carregam o ID do Pokémon. Usamos a própria
  // arte dele no sino, em vez do ícone genérico da área Cobblemon.
  if (String(item?.id || '').startsWith('cobblemon-capture:') && Number(item?.pokemonId) > 0) {
    // Destaques antigos já trazem a raridade no texto; os novos podem trazer
    // a flag. Assim a notificação sempre usa a forma que foi capturada.
    const isShiny = Boolean(item.isShiny) || /^\s*shiny\b/i.test(String(item.detail || ''));
    return cobblemonSpriteMarkup({ id: Number(item.pokemonId), isShiny }, 'small', 'class="catalog-art-icon notification-art-icon notification-pokemon-art" loading="lazy" decoding="async" alt=""');
  }
  const text = `${item?.title || ''} ${item?.detail || ''} ${item?.icon || ''}`.toLowerCase();
  const source = /créditos?|dividendo|saldo|🪙/.test(text) ? '/roulette51/shop-icons/creditos-51.png'
    : /carta|álbum|pacotinho|troca/.test(text) ? '/roulette51/menu-icons/album.png'
    : /maldição|praga|⚠/.test(text) ? (text.includes('tdah') ? '/roulette51/shop-icons/powers/maldicao-tdah.png' : text.includes('mouse gigante') ? '/roulette51/shop-icons/powers/maldicao-mouse-gigante.png' : text.includes('maldição do dev') ? '/cursor-dev-lamp.png' : text.includes('maldição da limpeza') ? '/cursor-halloween-broom.png' : /seta gay|compulsória/.test(text) ? '/roulette51/shop-icons/powers/seta-gay-compulsoria.png' : text.includes('antídoto') ? '/roulette51/shop-icons/powers/antidoto-maldicao.png' : '/roulette51/shop-icons/powers/maldicao-mouse-gigante.png')
    : /água|hidrata|💧/.test(text) ? '/roulette51/menu-icons/agua.png'
    : /pokémon|pokemon|captura|cobblemon/.test(text) ? '/roulette51/menu-icons/cobblemon.png'
    : /presente|baú|caixa|🎁/.test(text) ? '/roulette51/shop-icons/presente-secreto.png'
    : /mercado|investimento/.test(text) ? '/roulette51/menu-icons/mercado.png'
    : /votaç|voto/.test(text) ? '/roulette51/menu-icons/votacoes.png'
    : /wallpaper|inscriç|envio/.test(text) ? '/roulette51/menu-icons/inscricoes.png'
    : /loteria/.test(text) ? '/roulette51/menu-icons/loteria.png'
    : /roleta|sorteio|rodada/.test(text) ? '/roulette51/menu-icons/sorteio.png'
    : /atualiza/.test(text) ? '/roulette51/menu-icons/atualizacoes.png'
    : '/roulette51/menu-icons/misterio.png';
  return `<img class="catalog-art-icon notification-art-icon" src="${source}" alt="">`;
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
  $('#notificationList').innerHTML = visibleItems.length ? visibleItems.map((item) => `<button type="button" class="notification-item${item.unread ? ' unread' : ''}" data-notification-page="${escapeHtml(item.page || 'sorteio')}" data-notification-id="${escapeHtml(item.id)}" data-notification-target="${escapeHtml(item.targetId || '')}" data-notification-profile="${escapeHtml(item.profileId || '')}" data-notification-pokemon="${escapeHtml(String(item.pokemonId || ''))}" data-notification-capture-user="${escapeHtml(item.captureUserId || '')}"><span>${notificationIconMarkup(item)}</span><p><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || '')}</small><em>${escapeHtml(formatDate(item.createdAt))}</em></p></button>`).join('') : '<div class="notification-empty"><span><img class="catalog-art-icon" src="/roulette51/menu-icons/atualizacoes.png" alt=""></span><strong>Tudo tranquilo por aqui</strong><small>Seus novos avisos aparecerão neste espaço.</small></div>';
}

function notificationTargetReady(targetId) {
  if (!targetId) return null;
  const target = document.getElementById(targetId);
  if (!target) return null;
  if (target.closest('.hidden, .portal-page-hidden')) return null;
  return target;
}

function waitForNotificationTarget(targetId, timeout = 1800) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const check = () => {
      const target = notificationTargetReady(targetId);
      if (target || performance.now() - startedAt >= timeout) { resolve(target); return; }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function focusNotificationTarget(targetId, page) {
  // A page render is scheduled after showPortalPage(). Waiting for the actual
  // node avoids silently landing at the top when a notification points to a
  // list generated by a secondary script (album, trades, feedback, etc.).
  const target = await waitForNotificationTarget(targetId);
  if (!target) {
    const section = document.getElementById(page) || document.querySelector('.portal-page:not(.portal-page-hidden)');
    if (section) section.scrollIntoView({ block: 'start', behavior: 'smooth' });
    showToast('A seção foi aberta, mas o item não está mais disponível.');
    return;
  }
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  const hadTabindex = target.hasAttribute('tabindex');
  if (!hadTabindex) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  target.classList.add('notification-target');
  window.setTimeout(() => {
    target.classList.remove('notification-target');
    if (!hadTabindex) target.removeAttribute('tabindex');
  }, 3500);
}

async function openNotificationTarget(id, page, requestedTargetId = '', profileId = '', requestedPokemonId = '', requestedCaptureUserId = '') {
  const notification = appState.notifications?.items?.find((item) => item.id === id);
  const safePage = portalPages.includes(page) ? page : 'sorteio';
  showPortalPage(safePage, true);
  let targetId = requestedTargetId || notification?.targetId || 'profileIdentityCard';
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
  } else if (id.startsWith('assignment:')) targetId = 'receivedWallpaperCard';
  else if (id.startsWith('vote:')) targetId = 'votingPanel';
  else if (id.startsWith('credit:')) targetId = 'creditLedger';
  else if (id.startsWith('gift:')) targetId = notification?.targetId || 'profileIdentityCard';
  else if (id.startsWith('card-drop:')) targetId = notification?.targetId || 'cardAlbumCollections';
  else if (id.startsWith('card-trade:')) targetId = notification?.targetId || 'cardTradingCard';
  else if (id.startsWith('trade:')) targetId = notification?.targetId || 'visualTradingCard';
  else if (id.startsWith('feature-master')) targetId = 'mysteryInventoryCard';
  else if (id.startsWith('card-pack:')) targetId = notification?.targetId || 'cardAlbumCollections';
  else if (id.startsWith('cobblemon-capture:')) {
    const pokemonId = Number(requestedPokemonId || notification?.pokemonId || 0);
    const captureUserId = requestedCaptureUserId || notification?.captureUserId || '';
    setCobblemonTab('catalog');
    const owner = (appState.profile?.cobblemon?.collections || []).find((entry) => entry.id === captureUserId);
    if (pokemonId > 0 && owner) {
      cobblemonDexOwnerId = captureUserId;
      cobblemonDexFilter = 'caught';
      cobblemonDexPage = 0;
      const dexSearch = $('#cobblemonDexSearch');
      if (dexSearch) dexSearch.value = String(pokemonId);
      renderCobblemonDex(appState.profile);
      targetId = 'cobblemonDexPokemon-' + pokemonId;
    } else showToast('A captura foi registrada, mas essa coleção não está disponível agora.', 'error');
  }
  else if (id.startsWith('profile-comment:') && profileId) {
    try {
      const data = await api('/api/profiles/' + encodeURIComponent(profileId));
      renderPublicProfile(data.profile);
      $('#publicProfileDialog').showModal();
      targetId = 'profile-comment-' + id.slice('profile-comment:'.length);
    } catch (error) { showToast(error.message, 'error'); return; }
  }
  await focusNotificationTarget(targetId, safePage);
}

function renderOnlinePeople() {
  const received = Array.isArray(appState?.onlinePeople) ? appState.onlinePeople : [];
  const me = appState?.me;
  // Presença pode chegar antes da própria sessão na primeira sincronização.
  // Incluímos a conta local uma única vez e a rotulamos sempre como “Você”,
  // sem alternar com o nome entre o carregamento e os polls seguintes.
  const people = me && !received.some((person) => person.id === me.id)
    ? [{ id: me.id, displayName: me.displayName }, ...received] : received;
  const labelFor = (person) => person.id === me?.id ? 'Você' : formatDisplayName(person.displayName);
  $('#onlinePeopleCount').textContent = String(people.length || 1);
  $('#onlinePeopleButton').title = people.length ? 'Online agora: ' + people.map(labelFor).join(', ') : 'Você está online';
  $('#menuOnlinePeople').innerHTML = `<i></i><strong>${people.length || 1} online</strong><span>${escapeHtml(people.length ? people.map(labelFor).join(' · ') : 'Você')}</span>`;
}

$('#onlinePeopleButton')?.addEventListener('click',()=>{const received=Array.isArray(appState?.onlinePeople)?appState.onlinePeople:[];const people=appState?.me&&!received.some(person=>person.id===appState.me.id)?[{id:appState.me.id,displayName:appState.me.displayName},...received]:received;const host=$('#onlinePeopleDialogList');host.innerHTML=people.length?people.map(person=>'<span class="online-person-line">🟢 '+escapeHtml(person.id===appState.me.id?'Você':formatDisplayName(person.displayName))+'</span>').join(''):'<span class="online-person-line">🟢 Você</span>';$('#onlinePeopleDialog').showModal();});
$('#closeOnlinePeopleDialog')?.addEventListener('click',()=>$('#onlinePeopleDialog').close());

function renderCasinoRewardLegend() {
  const legend = $('#casinoRoulettePanel .casino-bet-legend');
  if (!legend || legend.dataset.rewardIconsReady === 'true') return;
  const rewards = [
    ['sonda', 'Caixa Sonda', 'qualquer aposta'],
    ['cosmica', 'Caixa Cósmica', 'a partir de 30'],
    ['area51', 'Cofre Área 51', 'a partir de 70'],
  ];
  legend.innerHTML = rewards.map(([rarity, name, requirement]) => `<span class="casino-reward casino-reward-${rarity}"><i class="casino-reward-icon" aria-hidden="true"></i><em><small>${name}</small><b>${requirement}</b></em></span>`).join('');
  legend.dataset.rewardIconsReady = 'true';
}

function renderCasino(casino = {}) {
  renderCasinoRewardLegend();
  if (casinoSpinInProgress || slotSpinInProgress) { drawCasinoWheel(); return; }
  $('#casinoWallet').textContent = formatCredits(casino.wallet);
  $('#casinoShopWallet').textContent = formatCredits(casino.shopWallet);
  $('#casinoClosedBoxes').textContent = Number(casino.closedBoxes || 0).toLocaleString('pt-BR');
  $('#casinoPlays').textContent = String(Number(casino.playsToday || 0));
  $('#casinoTotalWagered').textContent = formatCredits(casino.totalWagered);
  $('#casinoTotalPlays').textContent = Number(casino.totalPlays || 0).toLocaleString('pt-BR');
  const jackpot = casino.jackpot || {};
  $('#casinoJackpotValue').textContent = formatCredits(jackpot.amount || 500);
  const cashoutTarget = Number(casino.cashoutThreshold || 500); const cashoutBalance = Number(casino.wallet || 0); const cashoutButton = $('#casinoCashoutButton');
  $('#casinoCashoutText').textContent = casino.cashedOut ? 'Lucro de hoje já resgatado' : `${formatCredits(Math.min(cashoutBalance, cashoutTarget))} de ${formatCredits(cashoutTarget)}`;
  $('#casinoCashoutProgress').style.width = `${Math.min(100, Math.round(cashoutBalance / cashoutTarget * 100))}%`;
  cashoutButton.disabled = !casino.canCashOut; cashoutButton.textContent = casino.cashedOut ? 'Resgate realizado hoje' : casino.canCashOut ? `Resgatar ${formatCredits(casino.cashoutAmount || cashoutBalance)} créditos` : `Faltam ${formatCredits(Math.max(0, cashoutTarget - cashoutBalance))}`;
  const historyMarkup = (history, emptyText, flight = false) => history.length ? history.map((play) => { const source = play.walletSource === 'shop' ? 'Loja 51' : 'Bônus diário'; if (play.resultType === 'mysteryBox') return `<div class="casino-history-item jackpot"><span class="casino-history-box">${rouletteBoxIconMarkup(play.mysteryBox) || '🎁'}</span><p><strong>${escapeHtml(play.mysteryBox?.name || 'Baú misterioso')}</strong><small>${source} · aposta ${formatCredits(play.bet)} devolvida · baú enviado ao perfil</small></p></div>`; if (play.resultType === 'casinoJackpot') return `<div class="casino-history-item jackpot"><span>✦</span><p><strong>Jackpot da Tripulação</strong><small>${source} · retorno ${formatCredits(play.payout)} · saldo +${formatCredits(play.net)}</small></p></div>`; const icon = play.resultType === 'slots' ? '🎰' : play.resultType === 'plinko' ? '🔮' : (flight ? '🦄' : play.net > 0 ? '🚀' : play.net < 0 ? '🕳️' : '🛸'); const detail = play.resultType === 'slots' ? ` · ${escapeHtml(play.slots?.label || 'Caça-Níquel 51')}` : play.resultType === 'plinko' ? ` · risco ${escapeHtml(plinkoLabels[play.plinko?.risk] || '')}` : ''; return `<div class="casino-history-item ${play.net > 0 ? 'win' : play.net < 0 ? 'loss' : 'draw'}"><span>${icon}</span><p><strong>x${String(play.multiplier).replace('.', ',')}</strong><small>${source}${detail} · aposta ${formatCredits(play.bet)} · retorno ${formatCredits(play.payout)} · saldo ${play.net > 0 ? '+' : ''}${formatCredits(play.net)}</small></p></div>`; }).join('') : `<p class="casino-empty">${emptyText}</p>`;
  const rouletteHistory = Array.isArray(casino.recentRoulette) ? casino.recentRoulette : [];
  const compactHistory = (selector, history, emptyText, flight = false) => {
    const container = $(selector);
    const opened = Boolean(container.querySelector('details[open]'));
    container.innerHTML = historyMarkup(history.slice(0, 1), emptyText, flight) + (history.length > 1 ? `<details class="casino-history-more"${opened ? ' open' : ''}><summary>Ver mais ${history.length - 1} resultados recentes</summary><div>${historyMarkup(history.slice(1), '', flight)}</div></details>` : '');
  };
  compactHistory('#casinoRouletteHistory', rouletteHistory, 'Sua primeira rodada aparecerá aqui.');
  compactHistory('#casinoSlotsHistory', Array.isArray(casino.recentSlots) ? casino.recentSlots : [], 'Sua primeira rodada aparecerá aqui.');
  renderSlotMachine(casino);
  setCasinoGame(casinoActiveGame, false);
  drawCasinoWheel();
}

function setCasinoGame(game, focus = true) {
  casinoActiveGame = game === 'slots' ? 'slots' : 'roulette';
  const roulette = $('#casinoRoulettePanel'); const plinko = $('#casinoPlinkoPanel');
  roulette?.classList.toggle('hidden', casinoActiveGame !== 'roulette');
  plinko?.classList.toggle('hidden', casinoActiveGame !== 'slots');
  $$('[data-casino-game]').forEach((button) => { const active = button.dataset.casinoGame === casinoActiveGame; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (focus) (casinoActiveGame === 'slots' ? $('#slotBet') : $('#casinoBet'))?.focus({ preventScroll: true });
}

function renderSlotMachine(casino = {}) {
  const table = $('#slotPayoutTable'); if (!table) return;
  const outcomes = Array.isArray(casino.slotOutcomes) ? casino.slotOutcomes.filter((outcome) => outcome.multiplier > 0) : [];
  table.innerHTML = outcomes.map((outcome) => `<div class="slot-payout"><span>${(outcome.symbols || []).map(slotSymbolMarkup).join('')}</span><b>x${String(outcome.multiplier).replace('.', ',')}</b><small>${(Number(outcome.chance || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</small></div>`).join('');
  const returnLabel = $('#slotReturn'); if (returnLabel) returnLabel.textContent = `${Number(casino.slotReturnPercent || 97.5).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function activePlinkoProfile(profiles = appState?.casino?.plinkoProfiles || {}) {
  const risk = $('#plinkoRisk')?.value || 'medium';
  return profiles[risk] || profiles.medium || { multipliers: [0, .25, .5, .8, 1.15, 1.1, 1.15, .8, .5, .25, 0], returnPercent: 98 };
}

function renderPlinkoBoard(profiles = {}) {
  const board = $('#plinkoBoard'); if (!board) return;
  const profile = activePlinkoProfile(profiles); const multipliers = Array.isArray(profile.multipliers) ? profile.multipliers : [];
  const context = board.getContext('2d'); const width = board.width; const height = board.height; const rows = 10; const top = 62; const bottom = height - 62; const spacingY = (bottom - top) / rows; const slotWidth = (width - 52) / multipliers.length;
  context.clearRect(0, 0, width, height); const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#142f4b'); gradient.addColorStop(1, '#0a1122'); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  for (let row = 0; row < rows; row += 1) { const count = row + 1; const offset = width / 2 - (count - 1) * slotWidth / 2; for (let column = 0; column < count; column += 1) { const x = offset + column * slotWidth; const y = top + row * spacingY; context.beginPath(); context.arc(x, y, 5.5, 0, Math.PI * 2); context.fillStyle = '#9bd9ff'; context.shadowColor = '#4dd6ff'; context.shadowBlur = 12; context.fill(); context.shadowBlur = 0; } }
  multipliers.forEach((value, index) => { const x = 26 + index * slotWidth; const good = Number(value) >= 1; context.fillStyle = Number(value) >= 5 ? '#6e46b5' : good ? '#1c806b' : '#713a52'; context.fillRect(x + 2, bottom + 13, slotWidth - 5, 30); context.fillStyle = '#fff'; context.font = '900 13px Segoe UI'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(`x${String(value).replace('.', ',')}`, x + slotWidth / 2, bottom + 28); });
  const riskLabel = plinkoLabels[$('#plinkoRisk')?.value || 'medium']; const returnPercent = Number(profile.returnPercent || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); const maxMultiplier = Math.max(...multipliers.map(Number).filter(Number.isFinite), 0);
  const odds = $('#plinkoOdds'); if (odds) odds.textContent = `${riskLabel} risco · retorno médio teórico ${returnPercent}% · os multiplicadores abaixo são definidos antes da queda.`;
  if ($('#plinkoProfileName')) $('#plinkoProfileName').textContent = riskLabel;
  if ($('#plinkoMaxMultiplier')) $('#plinkoMaxMultiplier').textContent = `x${String(maxMultiplier).replace('.', ',')}`;
  if ($('#plinkoReturn')) $('#plinkoReturn').textContent = `${returnPercent}%`;
}

async function animatePlinko(result) {
  const board = $('#plinkoBoard'); const stage = board?.closest('.plinko-stage'); if (!board || !stage) return;
  const ball = document.createElement('i'); ball.className = 'plinko-ball'; ball.setAttribute('aria-hidden', 'true'); stage.append(ball);
  const path = Array.isArray(result?.plinko?.path) ? result.plinko.path : []; const slots = activePlinkoProfile().multipliers?.length || 11; const rect = board.getBoundingClientRect(); const scaleX = rect.width / board.width; const scaleY = rect.height / board.height; const slotWidth = (board.width - 52) / slots; let rights = 0;
  ball.style.left = `${board.width / 2 * scaleX}px`; ball.style.top = `${54 * scaleY}px`;
  const keyframes = [{ transform: 'translate(0, 0) scale(.86)', offset: 0 }];
  const rows = Math.max(10, path.length);
  for (let row = 0; row < rows; row += 1) {
    const direction = path[row] ? 1 : -1; if (path[row]) rights += 1;
    const count = row + 1; const offset = board.width / 2 - (count - 1) * slotWidth / 2;
    const x = offset + rights * slotWidth + direction * Math.min(8, slotWidth * .12); const y = 62 + row * ((board.height - 124) / 10);
    keyframes.push({ transform: `translate(${(x - board.width / 2) * scaleX}px, ${(y - 54) * scaleY}px) scale(${row % 2 ? 1.07 : .94}) rotate(${direction * (row % 2 ? 8 : -6)}deg)`, offset: Math.sqrt((row + 1) / (rows + 1)) });
  }
  const index = Number(result?.plinko?.slot ?? rights); const targetX = 26 + index * slotWidth + slotWidth / 2;
  keyframes.push({ transform: `translate(${(targetX - board.width / 2) * scaleX}px, ${(board.height - 28 - 54) * scaleY}px) scale(.9)`, offset: 1 });
  const animation = ball.animate(keyframes, { duration: 1450, easing: 'cubic-bezier(.18,.68,.28,1)', fill: 'forwards' });
  for (let row = 0; row < rows; row += 1) setTimeout(() => playCasinoOscillator(630 - row * 27, .03, .018, 'triangle'), 90 + Math.round(1180 * Math.sqrt((row + 1) / (rows + 1))));
  try { await animation.finished; } finally { ball.remove(); }
}

function lotteryDateLabel(value) {
  if (!value) return 'Aguardando a rodada';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

function lotteryTimeLabel(value) {
  if (!value) return '16h';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value)).replace(':', 'h');
}

function scheduleLotteryDraw(lottery = {}) {
  clearTimeout(lotteryDrawTimer);
  lotteryDrawTimer = null;
  if (lottery.status !== 'open' || !lottery.closeAt) return;
  const remaining = Date.parse(lottery.closeAt) - (Date.now() + serverClockOffset);
  lotteryDrawTimer = setTimeout(() => runLotteryLiveDraw(String(lottery.id || '')), Math.max(0, remaining + 120));
}

async function runLotteryLiveDraw(roundId) {
  if (lotteryDrawInProgress || !roundId || !appState) return;
  lotteryDrawInProgress = true;
  const live = $('#lotteryLiveDraw');
  try {
    const data = await api('/api/state', {}, false);
    const lottery = data?.casino?.lottery;
    const drawnRound = lottery && String(lottery.id || '') === roundId && lottery.status === 'drawn'
      ? lottery
      : lottery?.previous?.find((round) => String(round.id || '') === roundId);
    if (!lottery || !drawnRound || !Array.isArray(drawnRound.winningNumbers) || !drawnRound.winningNumbers.length) {
      applyState(data);
      return;
    }
    if (currentPortalPage() !== 'loteria' || !live) {
      applyState(data);
      return;
    }
    live.classList.remove('hidden');
    live.innerHTML = drawnRound.winningNumbers.map((number, index) => `<span class="lottery-live-ball" data-lottery-live-ball="${index}">?</span>`).join('');
    const balls = $$('.lottery-live-ball', live);
    $('#lotteryResult').textContent = 'Sorteio ao vivo: os números estão sendo revelados pelo servidor…';
    for (let index = 0; index < balls.length; index += 1) {
      const ball = balls[index];
      ball.classList.add('rolling');
      for (let tick = 0; tick < 10; tick += 1) {
        ball.textContent = String(1 + Math.floor(Math.random() * 50)).padStart(2, '0');
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      ball.textContent = String(drawnRound.winningNumbers[index]).padStart(2, '0');
      ball.classList.remove('rolling');
      ball.classList.add('revealed');
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    applyState(data);
    showToast(`Resultado da Loteria 51: ${drawnRound.winningNumbers.join(', ')}.`);
  } catch {
    try { applyState(await api('/api/state', {}, false)); } catch {}
  } finally {
    lotteryDrawInProgress = false;
    if (live) { live.classList.add('hidden'); live.innerHTML = ''; }
  }
}

function scheduleLotteryReminder(lottery = {}) {
  clearTimeout(lotteryReminderTimer);
  lotteryReminderTimer = null;
  if (lottery.status !== 'open' || (lottery.myEntries || []).length || !lottery.closeAt) return;
  const remaining = Date.parse(lottery.closeAt) - (Date.now() + serverClockOffset);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 10 * 60 * 1000) return;
  const key = 'area51-lottery-reminder-toast:' + String(lottery.id || lottery.closeAt);
  const show = () => {
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    showToast(`Faltam 10 minutos para a Mega 51. Compre seu bilhete antes das ${lotteryTimeLabel(lottery.closeAt)}.`, 'error');
  };
  const delay = remaining - 10 * 60 * 1000;
  if (delay <= 0) show();
  else lotteryReminderTimer = setTimeout(show, delay);
}

function lotteryNoteMarkup(entry, lottery) {
  const numbers = Array.isArray(entry.numbers) ? entry.numbers.filter((value) => Number.isInteger(value) && value >= 1 && value <= 50) : [];
  const code = String(entry.id || '');
  const buyer = formatDisplayName(appState?.me?.displayName || 'Participante');
  const purchasedAt = entry.createdAt && !Number.isNaN(Date.parse(entry.createdAt)) ? new Date(entry.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não disponível';
  const drawAt = lottery.closeAt && !Number.isNaN(Date.parse(lottery.closeAt)) ? new Date(lottery.closeAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Próxima quinta-feira, 16h';
  const amount = `${formatCredits(entry.price || 0)} 51 Coins`;
  return `<article class="lottery-note">
    <header class="lottery-note-brand"><span class="lottery-note-alien">👽</span><div><h2>ÁREA <em>51</em></h2><small>LOTERIA INTERGALÁCTICA</small><p>NÚMEROS TERRENOS, PRÊMIOS DE OUTRO MUNDO!</p></div><div class="lottery-note-stamp">NOTA DA SORTE<span>COMPRA CONFIRMADA ◉</span></div></header>
    <section class="lottery-note-identification"><div><strong>ÁREA 51 · ENTRETENIMENTO DIGITAL</strong><span>Mega 51 — jogo virtual da tripulação</span><span>Bilhete pessoal e intransferível</span></div><div><span>COMPRA: ${escapeHtml(code.slice(0, 12).toUpperCase())}</span><span>EMISSÃO: ${escapeHtml(purchasedAt)}</span><span>UNIDADE: 51 Coins</span></div></section>
    <div class="lottery-note-rule"></div><div class="lottery-note-title"><h3>COMPROVANTE DA SORTE</h3><span>MEGA 51 · PARTICIPAÇÃO CONFIRMADA</span></div>
    <section class="lottery-note-customer"><div><b>PARTICIPANTE:</b> ${escapeHtml(buyer)}<br><b>SORTEIO:</b> ${escapeHtml(drawAt)}<br><b>STATUS:</b> <strong>CONFIRMADO ✓</strong></div><div class="lottery-note-thanks">👽 <span>OBRIGADO POR<br>ACREDITAR NO<br>EXTRAORDINÁRIO!</span></div></section>
    <section class="lottery-note-table"><div class="lottery-note-table-head"><span>QTD</span><span>DESCRIÇÃO DO JOGO</span><span>VALOR (51 Coins)</span></div><div class="lottery-note-item"><span>01</span><div><strong>Bilhete Mega 51 — ${numbers.length} números</strong><small>Sorteio de 6 dezenas entre 50</small><p>Números escolhidos: <b>${numbers.map((number) => String(number).padStart(2, '0')).join(' · ')}</b></p></div><strong>${escapeHtml(formatCredits(entry.price || 0))}</strong></div></section>
    <div class="lottery-note-checkout"><div class="lottery-note-cosmic">✦ INVESTIMENTO<br>EM UM FUTURO<br>MAIS CÓSMICO! ✦</div><div class="lottery-note-sums"><p><span>SUBTOTAL ................................</span><b>${escapeHtml(amount)}</b></p><p><span>DESCONTO .................................</span><b>0,00 51 Coins</b></p><p><span>TAXAS ....................................</span><b>0,00 51 Coins</b></p><div class="lottery-note-total"><span>TOTAL PAGO</span><strong>${escapeHtml(amount)}</strong></div></div></div>
    <section class="lottery-note-payment"><div><span>FORMA DE PAGAMENTO: <b>Créditos 51</b></span><span>ID DA TRANSAÇÃO: <b>${escapeHtml(code)}</b></span><span>DATA E HORA: <b>${escapeHtml(purchasedAt)}</b></span><span>SORTEIO: <b>${escapeHtml(drawAt)}</b></span><span>STATUS: <b class="lottery-note-confirmed">CONFIRMADO ✓</b></span></div><div class="lottery-note-id"><span>CÓDIGO DO BILHETE</span><code>${escapeHtml(code)}</code><small>Consulte seu bilhete em Meus bilhetes</small></div></section>
    <footer><b>INFORMAÇÕES IMPORTANTES:</b><ul><li>Este bilhete é pessoal e intransferível.</li><li>Cada compra vale como um jogo independente.</li><li>Bilhetes vendidos não aumentam o prêmio.</li><li>Após o sorteio, as dezenas ficam disponíveis para conferência até a apuração seguinte.</li></ul><small>Jogo recreativo com créditos virtuais. Não é nota fiscal nem documento tributário.</small></footer>
    <div class="lottery-note-bottom"><div><i aria-hidden="true"></i><code>${escapeHtml(code.slice(0, 24).toUpperCase())}</code></div><strong>BOA SORTE,<br>TERRÁQUEO! <span>👽</span></strong></div>
  </article>`;
}

function renderLottery(lottery = {}) {
  const numbers = Array.isArray(lottery.numbers) ? lottery.numbers : [];
  const plans = lottery.plans || { 6: 100, 7: 650, 8: 2500, 9: 7500, 10: 20000 };
  const myEntries = lottery.status === 'open' && Array.isArray(lottery.myEntries) ? lottery.myEntries : [];
  const open = lottery.status === 'open';
  if (!plans[lotteryPlanDraft]) lotteryPlanDraft = 6;
  const selected = lotteryNumbersDraft;
  const closeAt = $('#lotteryCloseAt'); const countdown = $('#lotteryCountdown'); const prize = $('#lotteryPrizePool');
  if (closeAt) closeAt.textContent = lotteryDateLabel(lottery.closeAt);
  if (countdown) countdown.textContent = open ? `Toda quinta, às ${lotteryTimeLabel(lottery.closeAt)} · 6 números serão sorteados · semente ${String(lottery.commitHash || '').slice(0, 10)}` : 'Rodada encerrada · resultado publicado';
  if (prize) prize.textContent = formatCredits(lottery.prizePool || 0);
  const topUp = $('#lotteryApostometerTopUp');
  if (topUp) topUp.textContent = 'Prêmio inicial de 50.000 + eventual acúmulo; vendas não alteram o prêmio.';
  if ($('#lotteryEntryCount')) $('#lotteryEntryCount').textContent = Number(lottery.entryCount || 0).toLocaleString('pt-BR');
  if ($('#lotteryRealWagered')) $('#lotteryRealWagered').textContent = formatCredits(lottery.realWagered || 0);
  const plansEl = $('#lotteryPlans');
  if (plansEl) plansEl.innerHTML = Object.entries(plans).map(([count, cost]) => `<button type="button" class="lottery-plan${Number(count) === lotteryPlanDraft ? ' active' : ''}" data-lottery-plan="${count}"><b>${count} números</b><small>${count === '6' ? '1 combinação' : `${({7:7,8:28,9:84,10:210})[count]} combinações`}</small><strong>${formatCredits(cost)}</strong></button>`).join('');
  const grid = $('#lotteryNumbers');
  if (grid) grid.innerHTML = numbers.map((number) => `<button type="button" class="lottery-number${selected.includes(number) ? ' selected' : ''}${(lottery.winningNumbers || []).includes(number) ? ' winning' : ''}" data-lottery-number="${number}" ${!open ? 'disabled' : ''} aria-pressed="${selected.includes(number)}">${number}</button>`).join('');
  if ($('#lotteryPickTitle')) $('#lotteryPickTitle').textContent = `${lotteryPlanDraft} números · monte seu bilhete`;
  if ($('#lotteryPickCounter')) $('#lotteryPickCounter').textContent = `${selected.length} de ${lotteryPlanDraft} escolhidos`;
  const submit = $('#lotterySubmitButton'); if (submit) { submit.disabled = !open || selected.length !== lotteryPlanDraft; submit.textContent = !open ? 'Rodada encerrada' : selected.length === lotteryPlanDraft ? `Comprar bilhete · ${formatCredits(plans[lotteryPlanDraft])} Créditos 51` : `Selecione ${lotteryPlanDraft - selected.length} número${lotteryPlanDraft - selected.length === 1 ? '' : 's'}`; }
  const result = $('#lotteryResult');
  if (result) result.textContent = myEntries.length ? `Você tem ${myEntries.length} bilhete${myEntries.length === 1 ? '' : 's'} ativo${myEntries.length === 1 ? '' : 's'} nesta rodada.` : open ? 'Você só participa após comprar pelo menos um bilhete.' : lottery.winningNumbers?.length ? `Números sorteados: ${lottery.winningNumbers.join(', ')}.` : 'A rodada ainda não foi aberta.';
  const commit = $('#lotteryCommitStatus'); if (commit) commit.textContent = open ? `Semente pública: ${String(lottery.commitHash || '').slice(0, 12)}…` : 'Resultado verificável no servidor';
  const history = $('#lotteryHistory');
  const previous = (Array.isArray(lottery.previous) ? lottery.previous : []).slice().sort((left, right) => {
    const leftTime = Date.parse(left?.drawnAt || left?.closeAt || left?.createdAt || '') || 0;
    const rightTime = Date.parse(right?.drawnAt || right?.closeAt || right?.createdAt || '') || 0;
    return rightTime - leftTime;
  });
  if (history) history.innerHTML = previous.length ? previous.map((round) => `<article class="lottery-history-row"><header><strong>${lotteryDateLabel(round.drawnAt)}</strong><span><span class="coin-51" aria-hidden="true">51</span>${formatCredits(round.prizePool || 0)}</span></header><div class="lottery-history-numbers">${(round.winningNumbers || []).map((number) => `<b>${number}</b>`).join('')}</div><p>${round.winners?.length ? round.winners.map((winner) => `${escapeHtml(winner.displayName)} · ${formatCredits(winner.amount)} créditos`).join(' · ') : 'Ninguém acertou; o prêmio acumulou.'}</p></article>`).join('') : '<p class="lottery-empty">A primeira rodada ainda está aberta.</p>';
  const mine = $('#lotteryMyTickets');
  if (mine) mine.innerHTML = `<div class="lottery-ticket-head"><div><small>MEUS BILHETES</small><strong>${myEntries.length ? `${myEntries.length} ativo${myEntries.length === 1 ? '' : 's'}` : 'Nenhum bilhete comprado'}</strong></div></div>${myEntries.length ? `<div class="lottery-owned-list">${myEntries.map((entry, index) => `<article class="mega-ticket-card" aria-label="Bilhete ${index + 1}: ${(entry.numbers || []).join(', ')}"><div class="mega-ticket-art"><img src="/mega51-ticket-art-v2.png" alt="" loading="lazy"></div><div class="mega-ticket-details"><div class="mega-ticket-meta"><strong>Bilhete M51-${String(index + 1).padStart(4, '0')}</strong><span>${(entry.numbers || []).length} números</span></div><div class="mega-ticket-numbers" aria-label="Números escolhidos">${(entry.numbers || []).map((number) => `<i>${number}</i>`).join('')}</div><small>${formatCredits(entry.price || 0)} Créditos 51</small><button class="lottery-note-open" type="button" data-lottery-note="${escapeHtml(entry.id)}">Ver comprovante</button></div></article>`).join('')}</div>` : '<p class="lottery-empty">Escolha seus números e compre seu primeiro jogo para participar.</p>'}`;
  const lastDraw = lottery.lastDraw;
  const lastEntries = Array.isArray(lastDraw?.myEntries) ? lastDraw.myEntries : [];
  const drawnNumbers = Array.isArray(lastDraw?.winningNumbers) ? lastDraw.winningNumbers : [];
  const lastDrawHost = $('#lotteryLastDraw');
  if (lastDrawHost) lastDrawHost.innerHTML = lastEntries.length ? `<div class="lottery-ticket-head"><div><small>CONFERÊNCIA</small><strong>Meus números da última rodada</strong></div></div><p class="lottery-drawn-summary">Sorteados em ${escapeHtml(lotteryDateLabel(lastDraw.drawnAt || lastDraw.closeAt))}: <b>${drawnNumbers.join(' · ')}</b></p><div class="lottery-owned-list">${lastEntries.map((entry, index) => `<article class="mega-ticket-card lottery-drawn-ticket"><div class="mega-ticket-details"><div class="mega-ticket-meta"><strong>Bilhete ${index + 1}</strong><span>${(entry.numbers || []).length} números</span></div><div class="mega-ticket-numbers" aria-label="Números apostados; acertos destacados">${(entry.numbers || []).map((number) => `<i class="${drawnNumbers.includes(number) ? 'matched' : ''}">${number}</i>`).join('')}</div></div></article>`).join('')}</div>` : '';
  const noteDialog = $('#lotteryNoteDialog');
  if (noteDialog?.open && !myEntries.some((entry) => entry.id === noteDialog.dataset.entryId)) noteDialog.close();
}

function drawCasinoWheel() {
  const wheel = $('#casinoWheel'); if (!wheel) return;
  if (wheel.width !== 620 || wheel.height !== 620) { wheel.width = 620; wheel.height = 620; }
  const context = wheel.getContext('2d'); const size = wheel.width;
  context.clearRect(0, 0, size, size);
  drawCasinoWheelLabels(casinoWheelVisualRotation);
}

function casinoWheelLabelsCanvas() {
  const wheel = $('#casinoWheel'); const stage = wheel?.closest('.casino-wheel-stage'); if (!wheel || !stage) return null;
  let labels = $('#casinoWheelLabels');
  if (!labels) { labels = document.createElement('canvas'); labels.id = 'casinoWheelLabels'; labels.width = 620; labels.height = 620; labels.setAttribute('aria-hidden', 'true'); stage.append(labels); }
  if (labels.width !== 620 || labels.height !== 620) { labels.width = 620; labels.height = 620; }
  return labels;
}

function drawCasinoWheelLabels(rotation = casinoWheelVisualRotation) {
  const labels = casinoWheelLabelsCanvas(); if (!labels) return;
  const context = labels.getContext('2d'); const size = labels.width; const radius = size / 2; const edge = radius * .802;
  const boxIconIndex = { 'box-sonda': 0, 'box-cosmic': 1, 'box-area51': 2 };
  context.clearRect(0, 0, size, size);
  // A roda gira abaixo. Esta camada acompanha cada setor, mas não gira em si:
  // valores e baús permanecem sempre retos, inclusive durante a animação.
  const visualStep = Math.PI * 2 / casinoWheelDisplaySlices.length; const rotationRadians = (Number(rotation || 0) % 360) * Math.PI / 180;
  casinoWheelDisplaySlices.forEach((slice, index) => {
    const angle = -Math.PI / 2 + visualStep / 2 + index * visualStep + rotationRadians;
    const isBox = typeof slice.value === 'string'; const labelRadius = edge * .76;
    const x = radius + Math.cos(angle) * labelRadius; const y = radius + Math.sin(angle) * labelRadius;
    context.save(); context.translate(x, y); context.textAlign = 'center'; context.textBaseline = 'middle';
    if (isBox && casinoBoxSprite?.complete && casinoBoxSprite.naturalWidth) {
      const sourceWidth = casinoBoxSprite.naturalWidth / 3; const sourceHeight = casinoBoxSprite.naturalHeight; const iconSize = 48;
      context.shadowColor = '#030713'; context.shadowBlur = 9;
      context.drawImage(casinoBoxSprite, sourceWidth * boxIconIndex[slice.value], 0, sourceWidth, sourceHeight, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
    }
    else if (isBox) { context.font = '900 34px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; context.shadowColor = '#1a0c2d'; context.shadowBlur = 9; context.fillText('✦', 0, 1); }
    else { const label = 'x' + String(slice.value).replace('.', ','); context.font = '1000 23px "Segoe UI",sans-serif'; context.lineWidth = 4; context.strokeStyle = '#07101c'; context.strokeText(label, 0, 1); context.fillStyle = '#fff5cf'; context.fillText(label, 0, 1); }
    context.restore();
  });
}

function animateCasinoWheel(segmentIndex, wheelValue) {
  const wheel = $('#casinoWheel'); const normalizedValue = Number(wheelValue) === 5 || Number(wheelValue) === 10 ? 3 : wheelValue; const matching = casinoWheelDisplaySlices.map((slice, index) => slice.value === normalizedValue ? index : -1).filter((index) => index >= 0); const totalOccurrences = casinoWheelValues.filter((value) => value === normalizedValue).length || 1; const seenOccurrences = Number.isInteger(segmentIndex) ? casinoWheelValues.slice(0, segmentIndex + 1).filter((value) => value === normalizedValue).length : 1; const sliceIndex = matching.length ? matching[Math.min(matching.length - 1, Math.floor((Math.max(1, seenOccurrences) - 1) / totalOccurrences * matching.length))] : 0; const sectorDegrees = 360 / casinoWheelDisplaySlices.length; const desired = 360 - ((sliceIndex + .5) * sectorDegrees); const rotationStart = casinoWheelRotation; casinoWheelRotation += 360 * 7 + ((desired - casinoWheelRotation) % 360 + 360) % 360;
  if (casinoWheelLabelFrame) cancelAnimationFrame(casinoWheelLabelFrame);
  const rotationEnd = casinoWheelRotation;
  const totalTicks = Math.max(1, Math.floor(Math.abs(rotationEnd - rotationStart) / sectorDegrees));
  let playedTicks = 0;
  const startedAt = performance.now();
  wheel.style.transition = 'none';
  return new Promise((resolve) => {
    const moveWheel = (now) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 5200));
      casinoWheelVisualRotation = rotationStart + (rotationEnd - rotationStart) * casinoWheelEase(progress);
      wheel.style.transform = `rotate(${casinoWheelVisualRotation}deg)`;
      drawCasinoWheelLabels(casinoWheelVisualRotation);
      const visibleTicks = Math.min(totalTicks, Math.floor(casinoWheelEase(progress) * totalTicks));
      const audible = !document.hidden && currentPortalPage() === 'jogos' && casinoActiveGame === 'roulette';
      if (audible && progress < 1) while (playedTicks < visibleTicks) { playCasinoOscillator(860 - progress * 215, .038, .027); playedTicks += 1; }
      else playedTicks = visibleTicks;
      if (progress >= 1) { casinoWheelLabelFrame = null; resolve(); return; }
      casinoWheelLabelFrame = requestAnimationFrame(moveWheel);
    };
    casinoWheelLabelFrame = requestAnimationFrame(moveWheel);
  });
}

// O próprio clique de aposta libera o áudio. O efeito é gerado no navegador,
// sem baixar arquivos: cada setor que passa no ponteiro recebe um "tic" e os
// intervalos se alongam enquanto a roleta desacelera.
function casinoAudioContext() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  casinoWheelAudioContext ||= new Audio();
  if (casinoWheelAudioContext.state === 'suspended') casinoWheelAudioContext.resume().catch(() => {});
  return casinoWheelAudioContext;
}

function playCasinoOscillator(frequency, duration, volume = .04, type = 'triangle') {
  try {
    const audio = casinoAudioContext(); if (!audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(); const gain = audio.createGain(); const now = audio.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration);
  } catch {}
}

// Sons curtos de abertura: ficam inteiramente no navegador e só começam a
// partir de uma ação do usuário. Não participam de sorteio, saldo ou API.
let openingSoundCarouselTimer = null;
let openingSoundPadlock = null;
let openingSoundPadlockStopTimer = null;
function playOpeningNoise(duration = .08, volume = .025) {
  try {
    const audio = casinoAudioContext(); if (!audio || audio.state !== 'running') return;
    const size = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, size, audio.sampleRate); const data = buffer.getChannelData(0);
    for (let index = 0; index < size; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / size);
    const source = audio.createBufferSource(); const gain = audio.createGain(); const now = audio.currentTime;
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.buffer = buffer; source.connect(gain); gain.connect(audio.destination); source.start(now); source.stop(now + duration);
  } catch {}
}
function stopOpeningCarouselSound() {
  if (openingSoundCarouselTimer) clearTimeout(openingSoundCarouselTimer);
  openingSoundCarouselTimer = null;
}
function startOpeningCarouselSound(duration = 5200) {
  stopOpeningCarouselSound();
  const startedAt = performance.now();
  const tick = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / duration);
    playCasinoOscillator(720 - progress * 220, .035, .018, 'triangle');
    if (progress >= 1) return;
    openingSoundCarouselTimer = setTimeout(tick, 46 + progress * 210);
  };
  tick();
}
function playOpeningPadlock() {
  try {
    openingSoundPadlock ||= new window.Audio('/padlock-opening.mp3');
    openingSoundPadlock.pause(); openingSoundPadlock.currentTime = .02; openingSoundPadlock.volume = .42;
    openingSoundPadlock.play().catch(() => {});
    if (openingSoundPadlockStopTimer) clearTimeout(openingSoundPadlockStopTimer);
    openingSoundPadlockStopTimer = setTimeout(() => openingSoundPadlock?.pause(), 1450);
  } catch {}
}
function playOpeningChestReward() {
  [0, 105, 220].forEach((delay, index) => setTimeout(() => playCasinoOscillator(520 + index * 150, .12, .04, 'sine'), delay));
}
// Visual local da abertura; não decide prêmio, nem altera o inventário.
async function showChestOpeningSequence(dialog, kind) {
  const art = {
    sonda: ['sprite', '0%', 'sonda'],
    cosmic: ['sprite', '50%', 'cosmica'],
    area51: ['sprite', '100%', 'area51'],
    'master-aurora': ['/roulette51/box-master-aurora-v1.png', 'center', 'aurora'],
    'master-imperial': ['/roulette51/box-master-imperial-v1.png', 'center', 'imperial'],
    pokemon: ['/chest-opening-art/pokemon-closed.png', 'center', 'pokemon-open'],
  }[kind] || ['/chest-opening-art/pokemon-closed.png', 'center', 'pokemon-open'];
  const stage = document.createElement('div');
  stage.className = 'chest-opening-stage';
  const closed = document.createElement('div'), open = document.createElement('div');
  closed.className = 'chest-opening-closed'; open.className = 'chest-opening-open';
  if (art[0] === 'sprite') {
    closed.style.backgroundImage = 'url(/roulette51/box-icons-v2.png)';
    closed.style.backgroundSize = '300% 100%'; closed.style.backgroundPosition = art[1] + ' center';
  } else closed.style.backgroundImage = `url("${art[0]}")`;
  open.style.backgroundImage = `url("/chest-opening-art/${art[2]}.png")`;
  stage.append(closed, open); dialog.append(stage);
  const preload = new Image(); preload.src = `/chest-opening-art/${art[2]}.png`;
  if (preload.decode) await Promise.race([preload.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1800))]);
  try {
    openingSoundPadlock ||= new window.Audio('/padlock-opening.mp3');
    if (openingSoundPadlockStopTimer) clearTimeout(openingSoundPadlockStopTimer);
    openingSoundPadlock.pause(); openingSoundPadlock.currentTime = 0; openingSoundPadlock.volume = 1;
    openingSoundPadlock.play().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2400));
    stage.classList.add('is-open');
    await new Promise(resolve => setTimeout(resolve, 1820));
  } finally {
    openingSoundPadlock?.pause(); stage.remove();
  }
}
function playOpeningPokemonStart() {
  playCasinoOscillator(330, .08, .026, 'sine');
  setTimeout(() => playCasinoOscillator(520, .11, .032, 'triangle'), 85);
}
function playOpeningCardTear() {
  playOpeningNoise(.16, .042); playCasinoOscillator(190, .1, .018, 'sawtooth');
}
function playOpeningCardReveal(special = false) {
  playCasinoOscillator(special ? 780 : 490, .1, special ? .052 : .025, special ? 'sine' : 'triangle');
  if (special) setTimeout(() => playCasinoOscillator(1050, .16, .045, 'sine'), 92);
}
function playOpeningPokemonReward(reward = {}) {
  const text = String(reward.rarity || '').toLowerCase();
  const special = Boolean(reward.isShiny || reward.shiny || /raro|rare|lend[aá]rio|legendary|mítico|mythical|shiny/.test(text));
  playOpeningCardReveal(special);
}
window.AREA51_OPENING_SOUNDS = {
  packTear: playOpeningCardTear,
  packReveal: playOpeningCardReveal,
};
// A criação do contexto precisa acontecer no clique físico para que os sons
// também funcionem depois da resposta da API de abertura.
window.addEventListener('pointerdown', () => { casinoAudioContext(); }, { capture: true, passive: true });

function stopCasinoWheelSound() {
  if (casinoWheelTickFrame) cancelAnimationFrame(casinoWheelTickFrame);
  casinoWheelTickFrame = null;
}

function casinoWheelEase(progress) {
  // Inverte a curva de tempo do CSS para que os cliques coincidam com a
  // posição renderizada da roda, inclusive na desaceleração final.
  let t = Math.max(0, Math.min(1, progress));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const inverse = 1 - t;
    const x = 3 * inverse * inverse * t * .08 + 3 * inverse * t * t * .04 + t * t * t;
    const slope = 3 * inverse * inverse * .08 + 6 * inverse * t * (.04 - .08) + 3 * t * t * (1 - .04);
    if (Math.abs(slope) < .0001) break;
    t = Math.max(0, Math.min(1, t - (x - progress) / slope));
  }
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * .72 + 3 * inverse * t * t + t * t * t;
}

function startCasinoWheelSound(duration = 5200, degrees = 0) {
  stopCasinoWheelSound();
  const startedAt = performance.now();
  const totalTicks = Math.max(1, Math.floor(Math.abs(degrees) / (360 / casinoWheelDisplaySlices.length)));
  let playedTicks = 0;
  const tick = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / duration);
    const visibleTicks = Math.min(totalTicks, Math.floor(casinoWheelEase(progress) * totalTicks));
    while (playedTicks < visibleTicks) { playCasinoOscillator(860 - progress * 215, .038, .027); playedTicks += 1; }
    if (progress >= 1) return;
    casinoWheelTickFrame = requestAnimationFrame(tick);
  };
  tick();
}

function playCasinoRewardSound(won) {
  const neutral = won === 'neutral'; const positive = won === true;
  const notes = positive ? [660, 880, 1100] : neutral ? [520, 650] : [370, 290, 210];
  notes.forEach((note, index) => setTimeout(() => playCasinoOscillator(note, neutral ? .11 : .13, neutral ? .032 : .055, positive || neutral ? 'sine' : 'sawtooth'), index * 105));
}

function playSlotLeverMoveSound(pull) {
  playCasinoOscillator(128 - pull * 38, .075, .026, 'sawtooth');
  if (pull > .72) setTimeout(() => playCasinoOscillator(82, .11, .035, 'square'), 25);
}

function stopSlotGameMusic() {
  if (slotMusicTimer) clearTimeout(slotMusicTimer);
  slotMusicTimer = null;
}

function startSlotGameMusic() {
  if (slotMusicTimer) return; let step = 0;
  const pattern = [220, 262, 294, 262, 247, 294, 330, 294];
  const beat = () => {
    const note = pattern[step % pattern.length];
    playCasinoOscillator(note, .13, .013, 'triangle');
    if (step % 2 === 0) playCasinoOscillator(note / 2, .07, .008, 'sine');
    step += 1; slotMusicTimer = setTimeout(beat, 165);
  };
  beat();
}

function playSlotCoinSound() {
  [0, 58, 122, 190, 265, 345, 430].forEach((delay, index) => setTimeout(() => {
    playCasinoOscillator(1120 + (index % 3) * 190, .065, .04, 'square');
    if (index % 2) playCasinoOscillator(1740 + (index % 2) * 130, .045, .018, 'sine');
  }, delay));
}

async function showMysteryOpening(box, reward) {
  const dialog = $('#mysteryOpeningDialog'); const track = $('#mysteryCarouselTrack'); const result = $('#mysteryOpeningResult'); const decision = $('#mysteryOpeningDecision');
  const prizes = (appState?.profile?.shop || []).filter((item) => !item.mysteryBox && !item.cardPack && !item.service && !item.adminOnly);
  if (!dialog?.showModal || !prizes.length) return;
  const boxName = typeof box === 'string' ? box : box?.name || 'Baú misterioso';
  mysteryOpeningInProgress = true; $('#mysteryOpeningTitle').textContent = boxName; $('#mysteryOpeningIcon').innerHTML = rouletteBoxIconMarkup(box) || '<img src="/roulette51/shop-icons/presente-secreto.png" alt="">'; result.classList.remove('revealed'); result.innerHTML = '<span><img src="/roulette51/menu-icons/misterio.png" alt=""></span><strong>Aguarde o carrossel parar</strong>'; setBusy(decision, false); decision.classList.add('hidden');
  const winningIndex = 31; const entries = Array.from({ length: 36 }, (_, index) => index === winningIndex ? reward : prizes[Math.floor(Math.random() * prizes.length)]);
  track.innerHTML = entries.map((item) => `<article><span>${openingRewardIconMarkup(item)}</span><strong>${escapeHtml(item.name || 'Prêmio secreto')}</strong></article>`).join('');
  track.style.transition = 'none'; track.style.transform = 'translateX(0)'; dialog.showModal(); await showChestOpeningSequence(dialog, rouletteBoxVisualKind(box));
  const itemWidth = 124; const target = $('#mysteryCarouselViewport').clientWidth / 2 - (winningIndex * itemWidth + itemWidth / 2);
  track.style.transform = `translateX(${target + 16 * itemWidth}px)`; void track.offsetWidth;
  track.style.transition = 'transform 9s cubic-bezier(.12,.72,.24,1)'; void track.offsetWidth; track.style.transform = `translateX(${target}px)`; startOpeningCarouselSound(9000); await new Promise((resolve) => setTimeout(resolve, 9100)); stopOpeningCarouselSound();
  track.children[winningIndex]?.classList.add('winner');
  result.innerHTML = `<span>${openingRewardIconMarkup(reward)}</span><strong>Você recebeu ${escapeHtml(reward.name || 'um prêmio secreto')}!</strong>`; result.classList.add('revealed'); playOpeningChestReward();
  if (!reward.purchaseId) { await new Promise((resolve) => setTimeout(resolve, 2200)); dialog.close(); mysteryOpeningInProgress = false; return null; }
  $('#sellMysteryReward').textContent = `Vender agora por ${formatCredits(reward.sellPrice)} créditos`;
  decision.classList.remove('hidden');
  const finalState = await new Promise((resolve) => {
    $('#keepMysteryReward').onclick = async () => { setBusy(decision, true); try { resolve(await mysteryMutation('/api/mystery-rewards/keep', { purchaseId: reward.purchaseId })); } catch (error) { showToast(error.message, 'error'); setBusy(decision, false); } };
    $('#sellMysteryReward').onclick = async () => { setBusy(decision, true); try { const data = await mysteryMutation('/api/mystery-rewards/sell', { purchaseId: reward.purchaseId }); showToast(`${data.soldReward.name} vendido por ${formatCredits(data.soldReward.amount)} créditos.`); resolve(data); } catch (error) { showToast(error.message, 'error'); setBusy(decision, false); } };
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
  const gayDraw = (appState.draws || []).find((item) => item.type === 'gay' && item.roundId === appState.workflow?.roundId && !item.pendingShield);
  const isGayWinner = gayDraw?.winnerId === appState.me?.id;
  if (!gayDraw || (isGayWinner && !gayDraw.watermarkedUrl)) {
    download.removeAttribute('href');
    download.removeAttribute('download');
    download.textContent = !gayDraw ? 'Download após o sorteio do Gay da Rodada' : 'Aguarde o wallpaper com logo';
  } else {
    download.href = isGayWinner ? gayDraw.watermarkedUrl : '/api/my-wallpaper';
    download.download = isGayWinner ? 'gay-da-rodada-' + safeTheme + '.' + (gayDraw.watermarkedExtension === 'jpg' ? 'jpg' : 'png') : 'meu-wallpaper-' + safeTheme;
    download.innerHTML = (isGayWinner ? 'Baixar wallpaper com logo' : 'Baixar meu wallpaper') + ' <b>↓</b>';
  }
}

function liveTitleChips(titles = []) {
  return Array.isArray(titles) ? titles.map((title) => '<span class="live-title-chip live-title-' + escapeHtml(title.id) + '">' + (catalogIconMarkup(title) || escapeHtml(title.icon)) + ' ' + escapeHtml(title.name) + '</span>').join('') : '';
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
  const finance = Array.isArray(appState.financeRanking) ? appState.financeRanking : [];
  $('#financeRanking').innerHTML = finance.length ? finance.map((person, index) => {
    const podiumClass = index < 3 ? ' rank-' + (index + 1) : '';
    return '<article class="finance-row' + podiumClass + '"><span class="finance-position">' + (index + 1) + '</span>' +
      personAvatar(person, 'finance-avatar') +
      '<div class="finance-person"><strong>' + visualName(person) + '</strong><span class="ranking-live-titles">' + liveTitleChips(person.liveTitles) + '</span><small>Investido em ativos: ' + formatCredits(person.invested) + ' Créditos 51</small></div>' +
      '<b class="finance-fortune"><span class="coin-51" aria-hidden="true">51</span> ' + formatCredits(person.invested) + '</b></article>';
  }).join('') : '<div class="ranking-empty">O placar financeiro será preenchido conforme a equipe movimentar a economia.</div>';
  const debtors = Array.isArray(appState.loanRanking) ? appState.loanRanking : [];
  const debtDelayLabel = (debtor) => {
    if (!debtor.overdue) return debtor.dueAt ? 'Prazo em ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(debtor.dueAt)) : 'Prazo não informado';
    const hours = Math.max(0, Number(debtor.overdueHours) || 0);
    if (hours < 24) return 'Vencido há ' + Math.max(1, hours) + 'h';
    const days = Math.floor(hours / 24), remainder = hours % 24;
    return 'Vencido há ' + days + 'd' + (remainder ? ' e ' + remainder + 'h' : '');
  };
  $('#loanRanking').innerHTML = debtors.length ? debtors.map((debtor, index) => {
    const podiumClass = index < 3 ? ' rank-' + (index + 1) : '';
    const statusClass = debtor.overdue ? ' overdue' : ' current';
    return '<article class="loan-row' + podiumClass + statusClass + '"><span class="loan-position">' + (index + 1) + '</span>' +
      personAvatar(debtor, 'loan-avatar') +
      '<div class="loan-person"><strong>' + visualName(debtor) + '</strong><span class="ranking-live-titles">' + liveTitleChips(debtor.liveTitles) + '</span><small>Contrato de ' + formatCredits(debtor.totalDue) + ' · ' + debtDelayLabel(debtor) + '</small></div>' +
      '<div class="loan-amount"><small>DEVENDO</small><b><span class="coin-51" aria-hidden="true">51</span> ' + formatCredits(debtor.remainingDue) + '</b></div></article>';
  }).join('') : '<div class="loan-ranking-empty">Nenhum empréstimo ativo no Agiota Estelar.</div>';
}

let openedPublicProfileId='';
function renderPublicProfile(profile){openedPublicProfileId=profile.id;const avatar=profile.avatarDataUrl?'<img src="'+escapeHtml(profile.avatarDataUrl)+'" alt="">':'<span class="public-profile-avatar">'+escapeHtml((profile.displayName||'?').slice(0,1).toUpperCase())+'</span>';const titles=(profile.liveTitles||[]).map(t=>'<span class="live-title-chip">'+escapeHtml(t.icon+' '+t.name)+'</span>').join('');const trophies=(profile.showcase||[]).map(item=>'<span title="'+escapeHtml(item.description||'')+'">'+escapeHtml(item.icon+' '+item.name)+'</span>').join('');const trophyRoom=trophies?'<section class="public-trophy-room"><h4>🏛️ Sala de Troféus</h4><div class="public-trophy-list">'+trophies+'</div></section>':'';const social=profile.social||{},visuals=[social.theme,social.cursor,social.badge,social.insignia].filter(Boolean).map(item=>'<span>'+escapeHtml((item.icon||'✦')+' '+item.name)+(item.tier?' · '+escapeHtml(item.tier):'')+'</span>').join('');const favorite=social.favoriteCollection?'<span>'+escapeHtml(social.favoriteCollection.icon+' '+social.favoriteCollection.name+' · '+social.favoriteCollection.collected+'/5')+'</span>':'<span>🎴 Coleção ainda em formação</span>';const socialPanel='<section class="public-profile-social"><h4>Identidade pública</h4><div><strong>⭐ Coleção favorita</strong>'+favorite+'</div><div><strong>🎨 Visuais ativos</strong>'+(visuals||'<span>Nenhum visual equipado</span>')+'</div><div><strong>📊 Jornada</strong><span>💧 '+Number(profile.stats.hydrationDays||0)+' dias · 😂 '+Number(profile.stats.memes||0)+' memes · 💬 '+Number(profile.stats.phrases||0)+' frases</span></div></section>';const comments=(profile.comments||[]).map(c=>'<article id="profile-comment-'+escapeHtml(c.id)+'"><strong>'+escapeHtml(formatDisplayName(c.authorName))+'</strong><p>'+escapeHtml(c.message)+'</p><small>'+new Date(c.createdAt).toLocaleString('pt-BR')+'</small></article>').join('')||'<p class="public-profile-empty">Ainda não há comentários. Seja o primeiro.</p>';$('#publicProfileContent').innerHTML='<header class="public-profile-head">'+avatar+'<div><h3>'+escapeHtml(formatDisplayName(profile.displayName))+'</h3><p>'+titles+'</p><small>🏆 '+Number(profile.stats.bestWins||0)+' melhores · 👎 '+Number(profile.stats.worstWins||0)+' piores · 🌈 '+Number(profile.stats.gayWins||0)+' sorteios</small></div></header>'+socialPanel+trophyRoom+'<section class="public-profile-comments"><h4>Comentários</h4>'+comments+'</section>';const form=$('#publicProfileCommentForm');form.classList.toggle('hidden',profile.id===appState.me.id);}
async function openPublicProfile(profileId){const data=await api('/api/profiles/'+encodeURIComponent(profileId));renderPublicProfile(data.profile);$('#publicProfileDialog').showModal();}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-public-profile]');if(!button)return;try{await openPublicProfile(button.dataset.publicProfile);}catch(error){showToast(error.message,'error');}});
$('#closePublicProfileDialog')?.addEventListener('click',()=>$('#publicProfileDialog').close());
$('#publicProfileCommentForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;if(!openedPublicProfileId||!form.reportValidity())return;setBusy(form,true);try{const data=await api('/api/profiles/'+encodeURIComponent(openedPublicProfileId),{method:'POST',body:{message:form.elements.message.value}});form.reset();renderPublicProfile(data.profile);showToast('Comentário publicado no perfil.');}catch(error){showToast(error.message,'error');}finally{setBusy(form,false);}});

function voteVotersMarkup(item, kind, summary = false) {
  const best = kind === 'best';
  const count = Number(best ? item.bestVotes : item.worstVotes) || 0;
  const names = best ? item.bestVoters : item.worstVoters;
  const label = summary ? `${count} ${count === 1 ? 'voto' : 'votos'}` : `${best ? '▲' : '▼'} ${count} ${best ? 'melhor' : 'pior'}`;
  if (!Array.isArray(names)) return summary ? escapeHtml(label) : `<span class="vote-badge ${kind}">${escapeHtml(label)}</span>`;
  return `<span class="vote-voters-wrap${summary ? ' summary' : ''}"><button class="${summary ? 'vote-voters-summary' : `vote-badge ${kind}`} vote-voters-trigger" type="button" data-vote-voters-toggle aria-expanded="false" aria-label="${escapeHtml(label)}. Passe o mouse ou toque para ver quem votou.">${escapeHtml(label)}</button><span class="vote-voters-tooltip" role="tooltip"><strong>Votaram como ${best ? 'melhor' : 'pior'}</strong><span>${names.length ? names.map((name) => escapeHtml(name)).join('<br>') : 'Nenhum voto'}</span></span></span>`;
}

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
  const bestTieText = voting.result?.bestTiebreakByOppositeVote ? ' · desempate por votos de pior' : voting.result?.bestTiebreak ? ' · desempate automático' : '';
  const worstTieText = voting.result?.worstTiebreakByOppositeVote ? ' · desempate por votos de melhor' : voting.result?.worstTiebreak ? ' · desempate automático' : '';
  const resultLeader = (item, kind, tieText) => {
    const best = kind === 'best';
    const image = item.imageUrl ? '<button class="result-leader-image" type="button" data-wallpaper-preview-url="' + escapeHtml(item.imageUrl) + '" data-wallpaper-preview-title="' + escapeHtml(item.title) + '" aria-label="Ampliar wallpaper ' + escapeHtml(item.title) + '"><img src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async"></button>' : '';
    return '<article class="result-leader ' + kind + '">' + image + '<div class="result-leader-details"><span class="result-leader-label">' + (best ? '★ MELHOR WALLPAPER' : '▼ PIOR WALLPAPER') + '</span><small class="result-leader-author-label">ENVIADO POR</small><strong class="result-leader-author">' + escapeHtml(formatDisplayName(item.uploader)) + '</strong><span class="result-leader-title">' + escapeHtml(item.title) + '</span><small class="result-leader-meta">' + voteVotersMarkup(item, kind, true) + tieText + ' · ' + (best ? '+120 créditos' : 'tema castigo') + '</small></div></article>';
  };
  summary.innerHTML = closed && bestItem && worstItem ? resultLeader(bestItem, 'best', bestTieText) + resultLeader(worstItem, 'worst', worstTieText) : '';
  const canChoose = !closed && voting.userCanVote && !voting.userHasVoted;
  if (votingDraft.votingId !== voting.id) votingDraft = { votingId: voting.id, bestId: null, worstId: null };
  $('#voteGrid').innerHTML = voting.entries.map((item) => {
    if (item.isMine && canChoose) return '<article class="vote-card vote-card-own"><div class="vote-card-image">🛸</div><strong>Seu wallpaper</strong><small>Você não pode votar na própria imagem.</small></article>';
    const author = closed ? '<span class="vote-author">Por ' + escapeHtml(formatDisplayName(item.uploader)) + '</span>' :
      '<span class="vote-author secret-author">🔒 Autoria secreta</span>';
    const choices = canChoose ? '<div class="vote-options">' +
      '<label class="vote-option best"><input type="radio" name="bestId" value="' + item.id + '"><span>▲ Melhor</span></label>' +
      '<label class="vote-option worst"><input type="radio" name="worstId" value="' + item.id + '"><span>▼ Pior</span></label></div>' : '';
    const results = closed ? '<div class="vote-results">' + voteVotersMarkup(item, 'best') + voteVotersMarkup(item, 'worst') + '</div>' : '';
    const highlight = closed ? (item.isBestWinner ? ' winner-best' : '') + (item.isWorstWinner ? ' winner-worst' : '') : '';
    const visual = item.imageUrl ? '<button class="vote-image-open" type="button" data-wallpaper-preview-url="' + escapeHtml(item.imageUrl) + '" data-wallpaper-preview-title="' + escapeHtml(item.title) + '" aria-label="Ampliar wallpaper ' + escapeHtml(item.title) + '"><img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" decoding="async"></button>' :
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
  const currentGayCard = (appState.draws || []).find((item) => item.type === 'gay' && item.roundId === appState.workflow?.roundId);
  const cardSaved = Boolean(currentGayCard?.watermarkedUrl);
  $('#clearFinishedRoundButton').classList.toggle('hidden', !(closed && voting.gayDrawCompleted && appState.me.role === 'admin'));
  $('#clearFinishedRoundButton').disabled = !cardSaved;
  if (closed && voting.gayDrawCompleted) $('#voteStatus').innerHTML = cardSaved ? '<span class="voting-complete">✓ Wallpaper com logo salvo. Baixe-o antes de limpar as imagens.</span>' : '<span class="voting-complete">Gere e salve o wallpaper com a logo do Gay da Rodada antes de limpar as imagens.</span>';
  else if (voting.userHasVoted) $('#voteStatus').textContent = '✓ Seu voto foi registrado. Aguardando as outras pessoas.';
  else if (!voting.userCanVote) $('#voteStatus').textContent = 'Você pode acompanhar. Somente participantes elegíveis votam.';
  else $('#voteStatus').textContent = 'Escolha uma opção como melhor e outra como pior.';
}

function renderDraws() {
  // O resumo lateral destaca apenas resultados da rodada. Entregas individuais
  // de wallpaper continuam preservadas no histórico completo abaixo.
  const latest = appState.draws.filter((item) => item.type !== 'wallpaper').slice(0, 3);
  const drawLabel = (item) => item.type === 'theme' ? 'Tema da rodada' : 'Gay da Rodada';
  const drawType = (item) => item.type === 'theme' ? 'TEMA' : item.type === 'gay' ? 'GAY DA RODADA' : 'DISTRIBUIÇÃO';
  const markedGayDownload = (item) => item.type === 'gay' && item.watermarkedUrl
    ? `<a class="history-watermarked-download" href="${escapeHtml(item.watermarkedUrl)}" download="gay-da-rodada-${escapeHtml(String(item.winner || 'wallpaper').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.${item.watermarkedExtension === 'jpg' ? 'jpg' : 'png'}">Baixar wallpaper com logo</a>`
    : item.type === 'gay' && item.canGenerateWatermark
      ? `<button class="history-watermarked-download" type="button" data-generate-gay-card="${escapeHtml(item.id)}">Gerar wallpaper com logo</button>` : '';
  $('#latestDraws').classList.toggle('empty-state', !latest.length);
  $('#latestDraws').innerHTML = latest.length ? latest.map((item) =>
    '<div class="latest-item">' + (item.imageUrl ? '<img class="latest-thumb" src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="latest-thumb secret-thumb" aria-hidden="true">👽</span>') +
    '<p><strong>' + escapeHtml(item.winner) + '</strong><small>' + escapeHtml(drawLabel(item)) + '</small>' + markedGayDownload(item) + '</p></div>'
  ).join('') : 'Ainda não houve sorteio.';

  const history = $('#historyGrid');
  history.innerHTML = appState.draws.length ? appState.draws.map((item) =>
    '<article class="history-card">' + (item.imageUrl ? '<img src="' + escapeHtml(item.imageUrl) + '" alt="" loading="lazy" decoding="async">' : '<span class="history-secret" aria-hidden="true">👽</span>') +
    '<p><small>' + drawType(item) + '</small>' +
    '<strong>' + escapeHtml(item.type === 'wallpaper' ? (item.wallpaperTitle || item.detail || 'Wallpaper da rodada') : item.winner) + '</strong><span>' + escapeHtml(item.type === 'wallpaper' ? 'Recebido por ' + item.winner : item.detail) + ' · ' + formatDate(item.createdAt) + '</span>' + markedGayDownload(item) + '</p></article>'
  ).join('') : '<div class="history-empty"><span aria-hidden="true">🏆</span><strong>A memória da equipe começa na primeira rodada</strong><small>Os vencedores e resultados aparecerão aqui automaticamente.</small></div>';
  $$('#latestDraws img, #historyGrid img').forEach((image) => image.addEventListener('error', () => {
    if (!image.src.endsWith('/gay-da-rodada.png')) image.src = '/gay-da-rodada.png';
  }, { once: true }));
}

function openGayCardFromHistory(event) {
  const button = event.target.closest('[data-generate-gay-card]');
  if (!button) return;
  const draw = appState?.draws?.find((item) => item.id === button.dataset.generateGayCard && item.type === 'gay');
  if (!draw) return;
  showWinner(draw);
}
$('#historyGrid').addEventListener('click', openGayCardFromHistory);
$('#latestDraws').addEventListener('click', openGayCardFromHistory);

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
}

function renderSeason(season = {}) {
  renderNextSeasonPassPreview();
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
  $('#seasonChampionPrize').textContent = '🏆 1º lugar recebe 500 Créditos 51 e a medalha de Campeão da Temporada.';
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

async function renderNextSeasonPassPreview() {
  const host = $('#nextSeasonPassPreview');
  if (!host || nextSeasonPassLoaded) return;
  nextSeasonPassLoaded = true;
  host.innerHTML = '<div class="season-pass-preview-loading">Preparando o Passe da Operação…</div>';
  try {
    const pass = await api('/api/card-season/pass-preview');
    const source = pass.xpSources || {};
    const percent = Math.min(100, Math.round((Number(pass.currentLevelXp || 0) / Number(pass.nextLevelXp || 100)) * 100));
    const active = Boolean(pass.active);
    const claimed = pass.claimed || { free: [], premium: [] };
    const rewardCell = (item, track) => {
      const isClaimed = (claimed[track] || []).includes(item.level);
      const canClaim = active && item.unlocked && !isClaimed && (track === 'free' || pass.premium);
      return '<div><b>'+escapeHtml(item[track].name)+'</b><small>x'+Number(item[track].quantity||1)+'</small>'+(isClaimed ? '<em>Resgatado</em>' : canClaim ? '<button type="button" data-season-pass-claim="'+track+'" data-season-pass-level="'+Number(item.level)+'">Resgatar</button>' : '')+'</div>';
    };
    host.innerHTML = '<header class="season-pass-preview-hero"><div><small>'+(active ? 'TEMPORADA ATIVA' : 'PRÉVIA DA TEMPORADA')+'</small><h2>'+escapeHtml(pass.name)+'</h2><p>30 níveis durante outubro. Toda a equipe avança gratuitamente; o premium libera uma segunda trilha sem vender níveis.</p></div><div class="season-pass-level"><span>NÍVEL</span><strong>'+Number(pass.level||0)+'</strong><small>'+Number(pass.currentLevelXp||0)+' / '+Number(pass.nextLevelXp||100)+' XP</small></div></header>'+
      '<section class="season-pass-explainer"><strong>Como avançar:</strong><span>missão diária, missão semanal, desafio coletivo e a primeira insígnia nova montada dão XP. Cada objetivo conta uma vez; XP não compra nível.</span></section>'+
      '<div class="season-pass-progress"><i style="width:'+percent+'%"></i></div>'+
      '<div class="season-pass-xp-sources"><span><b>+'+Number(source.dailyMission||0)+' XP</b> missão diária</span><span><b>+'+Number(source.weeklyMission||0)+' XP</b> missão semanal</span><span><b>+'+Number(source.crewChallenge||0)+' XP</b> desafio coletivo</span><span><b>+'+Number(source.firstBadgeCraft||0)+' XP</b> primeira insígnia</span></div>'+
      '<div class="season-pass-track"><div class="season-pass-track-labels"><span>GRÁTIS</span><span>NÍVEL</span><span>PREMIUM · '+Number(pass.premiumPrice||0)+' CRÉDITOS</span></div>'+pass.tracks.map(item=>'<article class="'+(item.unlocked?'unlocked':'locked')+'">'+rewardCell(item,'free')+'<strong>'+Number(item.level)+'</strong>'+rewardCell(item,'premium')+'</article>').join('')+'</div>'+
      '<footer class="season-pass-preview-footer">'+(active ? '<p><strong>Temporada ativa.</strong> Missões concluídas somam XP uma única vez.</p>' : '<p><strong>Ativação protegida.</strong> XP, compras e recompensas ainda não alteram saldo ou inventário nesta prévia.</p>')+(active && !pass.premium ? '<button type="button" data-season-pass-premium>Ativar Premium · '+Number(pass.premiumPrice||0)+' créditos</button>' : active ? '<button type="button" disabled>Premium '+(pass.premium?'ativo':'indisponível')+'</button>' : '<button type="button" disabled>Indisponível</button>')+'</footer>'+
      '<section class="season-workshop-live"><header><div><small>OFICINA BLACKSTAR</small><h3>Forje com o que conquistou no Passe</h3><p>Uma moeda só: o Premium libera mais Fragmentos Blackstar na mesma trilha. Tema e cursor têm cores independentes: misture como quiser.</p></div><strong class="blackstar-fragment-balance"><img src="/season-workshop/fragment-blackstar-v1.png" alt=""><b>'+Number(pass.fragments||0)+'</b><small>fragmentos</small></strong></header><div class="season-workshop-live-grid">'+(pass.recipes||[]).map(recipe=>{const variants=recipe.variants?'<select data-forge-variant><option value="cyan">Azul elétrico</option><option value="gold">Obsidiana e ouro</option><option value="crimson">Carmesim lunar</option></select>':'';const isForged=!recipe.variants&&(pass.forged||[]).includes(recipe.id);const art=recipe.id==='pack-sector51'?'/card-season-2026-10/pack-setor-51.webp':recipe.id==='pack-orbit'?'/card-season-2026-10/pack-orbita.webp':recipe.id==='relic-rift'?'/season-workshop/reliquia-fenda.png':recipe.id==='core-blackstar'?'/season-workshop/nucleo-blackstar.png':recipe.id==='cursor-blackstar'?'/season-workshop/cursor-blackstar-cyan.png':'/season-workshop/theme-blackstar-cyan.png';const detail={ 'pack-sector51':'Pacote de 3 cartas. Vai para Meus pacotinhos no Perfil e abre no Álbum.','pack-orbit':'Pacote de 3 cartas com chance maior de rara. Vai para Meus pacotinhos no Perfil.','relic-rift':'Moldura exclusiva. Equipe em Perfil → Itens adquiridos; aparece no cartão, topo e menu.','cursor-blackstar':'Cursor visual. Equipe em Perfil → Itens adquiridos; só uma cor fica ativa por vez.','theme-blackstar':'Tema completo do portal. Equipe em Perfil → Itens adquiridos; só um tema fica ativo.','core-blackstar':'Pacote de 3 cartas mais raro. Vai fechado para Meus pacotinhos no Perfil.'}[recipe.id]||'';const test=recipe.variants?'<button type="button" class="workshop-test" data-workshop-test="'+recipe.id+'">Testar 20s</button>':'';return '<article><img class="workshop-art" src="'+art+'" alt=""><div><b>'+escapeHtml(recipe.name)+'</b><small>'+Number(recipe.cost)+' Fragmentos Blackstar</small><em class="workshop-detail">'+escapeHtml(detail)+'</em>'+variants+'</div><div class="workshop-actions">'+test+'<button type="button" data-season-forge="'+escapeHtml(recipe.id)+'" data-forge-name="'+escapeHtml(recipe.name)+'" data-forge-cost="'+Number(recipe.cost)+'" '+(!active||isForged||Number(pass.fragments||0)<Number(recipe.cost)?'disabled':'')+'>'+ (isForged?'Forjado':'Forjar')+'</button></div></article>';}).join('')+'</div></section>';
    // A miniatura precisa ser a mesma peça usada pelo cursor real, não a arte
    // antiga do dragão. O seletor de cor abaixo atualiza esta imagem em seguida.
    host.querySelectorAll('[data-season-forge="cursor-blackstar"]').forEach((button) => {
      const art = button.closest('article')?.querySelector('.workshop-art');
      if (art) art.src = '/season-workshop/cursor-blackstar-cyan-v2.png';
    });
  } catch (error) {
    nextSeasonPassLoaded = false;
    host.innerHTML = '<div class="season-pass-preview-loading">Não foi possível carregar o passe: '+escapeHtml(error.message)+'</div>';
  }
}

let workshopPreviewSession = null;
function finishWorkshopPreview() {
  const session = workshopPreviewSession;
  if (!session) return;
  clearInterval(session.interval);
  clearTimeout(session.timeout);
  const root = document.documentElement;
  root.classList.remove('workshop-visual-preview');
  delete root.dataset.workshopCursorPreview;
  delete root.dataset.workshopThemePreview;
  root.style.removeProperty('--workshop-preview-art');
  if (session.cursorEffectValue && document.body.dataset.cursorEffect === session.cursorEffectValue) {
    if (session.previousCursorEffect) document.body.dataset.cursorEffect = session.previousCursorEffect;
    else delete document.body.dataset.cursorEffect;
  }
  if (session.button?.isConnected) {
    session.button.textContent = 'Testar 20s';
    session.button.disabled = false;
  }
  workshopPreviewSession = null;
}

$('#nextSeasonPassPreview')?.addEventListener('click', async (event) => {
  const preview = event.target.closest('[data-workshop-test]');
  if (preview) {
    const card = preview.closest('article'); const variant = card.querySelector('[data-forge-variant]')?.value || 'cyan';
    finishWorkshopPreview();
    const type = preview.dataset.workshopTest;
    const root = document.documentElement;
    root.classList.add('workshop-visual-preview');
    // Não alteramos o visual equipado. A prévia é uma camada isolada e, por isso,
    // continua visível mesmo se o Perfil for sincronizado durante os 20 segundos.
    if (type === 'cursor-blackstar') root.dataset.workshopCursorPreview = variant;
    else {
      root.dataset.workshopThemePreview = variant;
      root.style.setProperty('--workshop-preview-art', "url('/season-workshop/theme-blackstar-" + variant + ".png')");
    }
    let remaining = 20; preview.textContent = 'Testando '+remaining+'s'; preview.disabled = true;
    const session = { button: preview, interval: null, timeout: null };
    if (type === 'cursor-blackstar') {
      session.previousCursorEffect = document.body.dataset.cursorEffect || '';
      session.cursorEffectValue = 'blackstar-' + variant;
      document.body.dataset.cursorEffect = session.cursorEffectValue;
    }
    workshopPreviewSession = session;
    session.interval = setInterval(() => { remaining -= 1; if (remaining > 0 && workshopPreviewSession === session) preview.textContent = 'Testando '+remaining+'s'; }, 1000);
    session.timeout = setTimeout(finishWorkshopPreview, 20000);
    return;
  }
  const premium = event.target.closest('[data-season-pass-premium]');
  const claim = event.target.closest('[data-season-pass-claim]');
  const forge = event.target.closest('[data-season-forge]');
  if (!premium && !claim && !forge) return;
  const button = premium || claim || forge; button.disabled = true;
  try {
    const recipeCard = forge?.closest('article'); const variant = recipeCard?.querySelector('[data-forge-variant]')?.value;
    if (forge && !window.confirm('Confirmar forja?\n\n'+forge.dataset.forgeName+(variant ? ' — '+recipeCard.querySelector('[data-forge-variant] option:checked').textContent : '')+'\nCusto: '+forge.dataset.forgeCost+' Fragmentos Blackstar.')) { button.disabled = false; return; }
    const data = await api(premium ? '/api/card-season/pass-premium' : claim ? '/api/card-season/pass-claim' : '/api/card-season/forge', { method: 'POST', body: premium ? {} : claim ? { track: claim.dataset.seasonPassClaim, level: Number(claim.dataset.seasonPassLevel) } : { recipeId: forge.dataset.seasonForge, variant } });
    if (claim) {
      // O retorno completo ainda é necessário para manter o saldo e os visuais
      // globais corretos, mas redesenhar a trilha inteira deixava o conteúdo em
      // branco por alguns instantes. Atualizamos somente a recompensa resgatada.
      appState.profile = data.profile;
      renderProfileEconomy(data.profile, true);
      const cell = claim.parentElement;
      const row = claim.closest('article');
      const rewardName = cell?.querySelector('b')?.textContent || 'Recompensa';
      const quantity = Number((cell?.querySelector('small')?.textContent || '').replace(/[^0-9]/g, '')) || 0;
      claim.replaceWith(Object.assign(document.createElement('em'), { textContent: 'Resgatado' }));
      row?.classList.add('claimed');
      if (rewardName === 'Fragmentos Blackstar' && quantity) {
        const fragments = $('#nextSeasonPassPreview .season-workshop-live>header>strong>b');
        if (fragments) {
          const available = Number(fragments.textContent || 0) + quantity;
          fragments.textContent = String(available);
          $$('#nextSeasonPassPreview [data-season-forge]').forEach((forgeButton) => {
            if (forgeButton.textContent.trim() === 'Forjar') forgeButton.disabled = Number(forgeButton.dataset.forgeCost || 0) > available;
          });
        }
      }
      showToast('Recompensa resgatada.');
    } else if (forge) {
      appState.profile = data.profile;
      renderProfileEconomy(data.profile, true);
      const fragments = $('#nextSeasonPassPreview .season-workshop-live>header>strong>b');
      const available = Math.max(0, Number(fragments?.textContent || 0) - Number(forge.dataset.forgeCost || 0));
      if (fragments) fragments.textContent = String(available);
      const recipeCard = forge.closest('article');
      if (!recipeCard?.querySelector('[data-forge-variant]')) {
        forge.textContent = 'Forjado';
        forge.disabled = true;
        forge.dataset.keepDisabled = 'true';
      }
      $$('#nextSeasonPassPreview [data-season-forge]').forEach((forgeButton) => {
        if (forgeButton.textContent.trim() === 'Forjar') forgeButton.disabled = Number(forgeButton.dataset.forgeCost || 0) > available;
      });
      showToast('Item forjado e enviado para sua coleção.');
    } else {
      // Ativar Premium só libera os botões já visíveis da trilha; não há motivo
      // para desmontar e recriar a página inteira.
      appState.profile = data.profile;
      renderProfileEconomy(data.profile, true);
      $$('#nextSeasonPassPreview .season-pass-track article.unlocked').forEach((row) => {
        const level = Number(row.querySelector('strong')?.textContent || 0);
        const premiumCell = row.querySelector('div:last-child');
        if (!level || !premiumCell || premiumCell.querySelector('em,button')) return;
        const claimButton = document.createElement('button');
        claimButton.type = 'button';
        claimButton.dataset.seasonPassClaim = 'premium';
        claimButton.dataset.seasonPassLevel = String(level);
        claimButton.textContent = 'Resgatar';
        premiumCell.append(claimButton);
      });
      premium.textContent = 'Premium ativo';
      premium.disabled = true;
      premium.dataset.keepDisabled = 'true';
      showToast('Passe Premium ativado.');
    }
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected && !button.dataset.keepDisabled) button.disabled = false; }
});

$('#nextSeasonPassPreview')?.addEventListener('change', (event) => {
  const select = event.target.closest('[data-forge-variant]');
  if (!select) return;
  const card = select.closest('article'); const recipeId = card?.querySelector('[data-season-forge]')?.dataset.seasonForge;
  if (!recipeId) return;
  const asset = recipeId === 'cursor-blackstar'
    ? '/season-workshop/cursor-blackstar-' + select.value + '-v2.png'
    : '/season-workshop/theme-blackstar-' + select.value + '.png';
  const art = card.querySelector('.workshop-art');
  if (art) art.src = asset;
});

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
  const approvers = Array.isArray(entry.approvedBy) ? entry.approvedBy.filter((person) => person?.id) : [];
  const approvalMarkup = approvers.length
    ? '<span class="lie-approved-people">' + approvers.map((person) => personAvatar(person, 'lie-approved-avatar') + '<b>' + escapeHtml(formatDisplayName(person.displayName)) + '</b>').join('') + '</span>'
    : '<b>' + escapeHtml(entry.validatedBy || 'Não registrado') + '</b>';
  return '<span class="lie-attribution"><span>Registrada por <b>' + escapeHtml(entry.createdBy || 'Não registrado') + '</b></span><span>Aprovada por ' + approvalMarkup + '</span></span>';
}

function renderRequiredLieVote(required) {
  const dialog = $('#lieVoteRequiredDialog');
  if (!dialog) return;
  if (!required || appState?.me?.role === 'admin') {
    if (dialog.open) dialog.close();
    delete dialog.dataset.voteId;
    delete dialog.dataset.submitting;
    return;
  }
  const previousVoteId = dialog.dataset.voteId || null;
  const title = $('#lieVoteRequiredTitle');
  const text = $('#lieVoteRequiredText');
  if (title) title.textContent = `${formatDisplayName(required.targetName)} mentiu?`;
  if (text) text.textContent = required.reason
    ? `${formatDisplayName(required.creatorName)} registrou esta marcação: “${required.reason}”. Escolha uma opção para continuar.`
    : `${formatDisplayName(required.creatorName)} solicitou uma correção para ${formatDisplayName(required.targetName)}. Escolha uma opção para continuar.`;
  dialog.dataset.voteId = required.id;
  // O mesmo diálogo é reutilizado para a próxima pendência. Reative os
  // botões somente quando a votação mudou, preservando o bloqueio durante um
  // envio ainda em andamento.
  if (previousVoteId !== required.id) {
    delete dialog.dataset.submitting;
    $$('[data-required-lie-vote]', dialog).forEach((button) => { button.disabled = false; });
  }
  if (!dialog.open) dialog.showModal();
}

function renderLieMeter(lieMeter = {}) {
  const ranking = Array.isArray(lieMeter.ranking) ? lieMeter.ranking : [];
  const pending = Array.isArray(lieMeter.pending) ? lieMeter.pending : [];
  $('#lieRanking').innerHTML = ranking.length ? ranking.map((person, index) => {
    const reasons = Array.isArray(person.reasons) ? person.reasons : [];
    const history = reasons.length ? `<details class="lie-history"><summary>Ver histórico dos motivos <b>${reasons.length}</b></summary><div>${reasons.map((entry, reasonIndex) => `<article${reasonIndex === 0 ? ' class="latest"' : ''}><span>🤥</span><p><strong>${escapeHtml(entry.reason)}</strong><small>${escapeHtml(formatDate(entry.createdAt))}</small>${lieAttribution(entry)}</p></article>`).join('')}</div></details>` : '';
    const truths = Number(person.truths || 0);
    return `<article class="lie-person${index === 0 && person.total > 0 ? ' lie-leader' : ''}"><span class="lie-position">${index + 1}</span>${personAvatar(person, 'lie-avatar')}<div class="lie-person-copy"><strong>${visualName(person)}${person.id === appState.me.id ? ' · você' : ''}</strong><span class="ranking-live-titles">${liveTitleChips(person.liveTitles)}</span><small>${Number(person.total)} ${Number(person.total) === 1 ? 'mentira confirmada' : 'mentiras confirmadas'} · ${truths} ${truths === 1 ? 'verdade' : 'verdades'}</small>${person.latestReason ? `<em class="lie-reason"><span>ÚLTIMA MENTIRA</span>“${escapeHtml(person.latestReason)}”</em>${reasons[0] ? lieAttribution(reasons[0]) : ''}` : ''}${history}</div><b>${Number(person.total)}</b><div class="lie-actions"><button type="button" data-lie-delta="-1" data-lie-target="${escapeHtml(person.id)}" aria-label="Solicitar remoção de uma mentira de ${escapeHtml(formatDisplayName(person.displayName))}"${person.id === appState.me.id || person.total <= 0 ? ' disabled' : ''}>−</button><button type="button" data-lie-delta="1" data-lie-target="${escapeHtml(person.id)}" aria-label="Marcar uma mentira para ${escapeHtml(formatDisplayName(person.displayName))}"${person.id === appState.me.id ? ' disabled' : ''}>+</button></div></article>`;
  }).join('') : '<p class="lie-empty">Nenhuma pessoa disponível.</p>';
  $('#liePendingCount').textContent = pending.length + (pending.length === 1 ? ' pendente' : ' pendentes');
  const pendingList = $('#liePendingList');
  pendingList.classList.toggle('lie-pending-scroll', pending.length > 3);
  pendingList.innerHTML = pending.length ? pending.map((item) => {
    const total = Math.max(1, Number(item.totalVoters || 0)); const received = Number(item.receivedVotes || 0);
    const voterCard = (voter) => {
      const voterPerson = { id: voter.id, displayName: voter.name };
      const voteLabel = voter.vote === 'strong-lie' ? 'Mentiu forte (+2)' : voter.vote === 'lie' ? 'Mentiu' : voter.vote === 'truth' ? 'Não mentiu' : voter.vote === 'not-heard' ? 'Não ouvi' : 'Aguardando';
      const voteIcon = voter.vote === 'lie' || voter.vote === 'strong-lie' || voter.vote === 'truth' ? '✓' : voter.vote === 'not-heard' ? '—' : '…';
      return `<span class="lie-voter ${voter.vote || 'waiting'}">${personAvatar(voterPerson, 'lie-voter-avatar')}<span><em>${escapeHtml(formatDisplayName(voter.name))}</em><i><b>${voteIcon}</b>${voteLabel}</i></span></span>`;
    };
    const voted = (item.voters || []).filter((voter) => voter.vote).map(voterCard).join('');
    const waiting = (item.voters || []).filter((voter) => !voter.vote).map(voterCard).join('');
    const voterGroups = `<div class="lie-voter-groups">${voted ? `<section><strong class="lie-voter-group-title voted">✓ Já votaram <b>${received}</b></strong><div class="lie-voters">${voted}</div></section>` : ''}${waiting ? `<section><strong class="lie-voter-group-title waiting">⌛ Aguardando <b>${Math.max(0, total - received)}</b></strong><div class="lie-voters">${waiting}</div></section>` : ''}</div>`;
    return `<article id="lie-pending-${escapeHtml(item.id)}" class="lie-pending"><div class="lie-pending-heading"><span>🗳️</span><div><strong>Votação coletiva: ${escapeHtml(formatDisplayName(item.targetName))} mentiu?</strong><small>Registrada por ${escapeHtml(formatDisplayName(item.creatorName))}</small></div></div><div class="lie-pending-copy"><p>${item.reason ? `<em class="lie-reason">“${escapeHtml(item.reason)}”</em>` : ''}</p><div class="lie-vote-progress"><span><b style="width:${Math.round(received / total * 100)}%"></b></span><strong>${received} de ${total} votaram</strong><em>Mentiu ${Number(item.lieVotes || 0)} · Mentiu forte ${Number(item.strongLieVotes || 0)} · Não mentiu ${Number(item.truthVotes || 0)} · Não ouvi ${Number(item.notHeardVotes || 0)}</em></div>${voterGroups}</div><div class="lie-pending-actions">${item.canVote ? `<small>Sua escolha: <b>${item.myVote === 'strong-lie' ? 'Mentiu forte (+2)' : item.myVote === 'lie' ? 'Mentiu' : item.myVote === 'truth' ? 'Não mentiu' : item.myVote === 'not-heard' ? 'Não ouvi' : 'pendente'}</b></small><button class="lie-validate" type="button" data-lie-vote="strong-lie" data-lie-vote-id="${escapeHtml(item.id)}">Mentiu forte (+2)</button><button class="lie-validate" type="button" data-lie-vote="lie" data-lie-vote-id="${escapeHtml(item.id)}">Mentiu</button><button class="lie-neutral" type="button" data-lie-vote="not-heard" data-lie-vote-id="${escapeHtml(item.id)}">Não ouvi</button><button class="lie-deny" type="button" data-lie-vote="truth" data-lie-vote-id="${escapeHtml(item.id)}">Não mentiu</button>` : '<small>Você não participa desta votação</small>'}${item.canCancel ? `<button class="lie-cancel" type="button" data-lie-cancel="${escapeHtml(item.id)}">Cancelar</button>` : ''}</div></article>`;
  }).join('') : '<p class="lie-empty">Nenhuma votação de mentira aguardando a equipe.</p>';
  const voteHistory = Array.isArray(lieMeter.history) ? lieMeter.history : [];
  $('#lieVoteHistory').innerHTML = voteHistory.length ? `<details><summary>Histórico das votações <b>${voteHistory.length}</b></summary><div class="lie-vote-history-list">${voteHistory.map((item) => {
    const resultLabel = item.outcome === 'strong-lie' ? 'Resultado: mentiu forte (+2)' : item.outcome === 'lie' ? 'Resultado: mentiu' : item.outcome === 'not-heard' ? 'Resultado: sem decisão' : 'Resultado: não mentiu';
    const voters = (item.voters || []).map((voter) => `<span class="lie-voter ${voter.vote}">${personAvatar({ id: voter.id, displayName: voter.name }, 'lie-voter-avatar')}<span><em>${escapeHtml(formatDisplayName(voter.name))}</em><i><b>${voter.vote === 'not-heard' ? '—' : '✓'}</b>${voter.vote === 'strong-lie' ? 'Mentiu forte (+2)' : voter.vote === 'lie' ? 'Mentiu' : voter.vote === 'truth' ? 'Não mentiu' : 'Não ouvi'}</i></span></span>`).join('');
    return `<article class="lie-vote-history-item ${item.outcome}"><header><div><strong>${escapeHtml(formatDisplayName(item.targetName))}</strong><small>Registrada por ${escapeHtml(formatDisplayName(item.creatorName))} · ${escapeHtml(formatDate(item.resolvedAt))}</small></div><b>${resultLabel}</b></header>${item.reason ? `<p>“${escapeHtml(item.reason)}”</p>` : ''}<div class="lie-vote-history-score"><span>Mentiu <b>${Number(item.lieVotes || 0)}</b></span><span>Mentiu forte <b>${Number(item.strongLieVotes || 0)}</b></span><span>Não mentiu <b>${Number(item.truthVotes || 0)}</b></span><span>Não ouvi <b>${Number(item.notHeardVotes || 0)}</b></div><div class="lie-voters">${voters}</div></article>`;
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

$('#lieVoteRequiredDialog')?.addEventListener('cancel', (event) => event.preventDefault());
$('#lieVoteRequiredDialog')?.addEventListener('click', async (event) => {
  if (event.target === event.currentTarget) { event.preventDefault(); return; }
  const button = event.target.closest('[data-required-lie-vote]');
  const required = appState?.lieMeter?.requiredVote;
  const dialog = event.currentTarget;
  if (!button || !required || dialog.dataset.submitting === '1' || dialog.dataset.voteId !== required.id) return;
  const controls = $$('[data-required-lie-vote]', dialog);
  dialog.dataset.submitting = '1';
  controls.forEach((control) => { control.disabled = true; });
  try {
    applyState(await api('/api/lie-meter/' + encodeURIComponent(required.id) + '/vote', { method: 'POST', body: { vote: button.dataset.requiredLieVote } }));
    showToast('Voto registrado. Obrigado por participar da validação.');
  } catch (error) {
    showToast(error.message, 'error');
    if (dialog.dataset.voteId === required.id) {
      delete dialog.dataset.submitting;
      controls.forEach((control) => { control.disabled = false; });
    }
  }
});

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
    if (['team-dragon', 'cyber-cyan', 'cyber-amber'].includes(item.value)) return `<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="${escapeHtml(item.iconAsset)}" alt=""><b>${escapeHtml(item.name)}</b></span></div>`;
    const cursorEffectPreview = (source, alt, name, effect) => `<div class="shop-visual-preview cursor-preview cursor-preview-effect"><small>PRÉVIA DO CURSOR · TESTE COM EFEITO</small><span><img src="${source}" alt="${alt}"><b>${name}</b><em>${effect}</em></span></div>`;
    const premiumCursorSources = { 'gta-neon': '/cursor-gta-neon-v2.png', cobblemon: '/cursor-cobblemon-v2.png', wolverine: '/cursor-wolverine-v2.png', 'god-war': '/cursor-god-war-v2.png', samurai: '/cursor-samurai.svg?v=2', 'dragon-ember': '/dragon-premium-icons/dragon-premium-cursor.png?v=2', lideranca: '/cursor-lideranca-combo.png' };
    if (item.value === 'thor') return cursorEffectPreview('/cursor-thor.svg', 'Mjölnir', 'Mjölnir Retornável', 'CLIQUE + ARRASTE + SOLTE · T OU CLIQUE PARA CHAMAR');
    if (item.value === 'web-slinger') return cursorEffectPreview('/cursor-web-slinger-v2.png', 'Luva lançadora de teia', 'Cursor Lançador de Teia', 'CLIQUE + ARRASTE + SOLTE PARA DISPARAR');
    if (item.value === 'halloween-broom') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-halloween-broom.png?v=2" alt="Cursor Vassoura Fantasma"><b>Cursor Vassoura Fantasma</b></span></div>';
    if (item.value === 'halloween-pumpkin') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-halloween-pumpkin.png?v=2" alt="Cursor Abóbora Radioativa"><b>Cursor Abóbora Radioativa</b></span></div>';
    if (item.value === 'halloween-mask') return cursorEffectPreview('/cursor-halloween-mask.png?v=2', 'Máscara do Acampamento 51', 'Máscara do Acampamento 51', 'MOVE O CURSOR · RASTRO DE SANGUE');
    if (['crystal','solar','ufo','wand','comet-tail','thunder','gta-neon','cobblemon','wolverine','samurai','god-war','dragon-ember','lideranca'].includes(item.value)) return `<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR · TESTE COM EFEITO</small><span><img src="${premiumCursorSources[item.value] || `/cursor-${item.value}.svg`}" alt="${escapeHtml(item.name)}"><b>${escapeHtml(item.name)}</b></span></div>`;
    if (item.value === 'unicorn') return '<div class="shop-visual-preview cursor-preview cursor-preview-unicorn"><small>PRÉVIA DO CURSOR</small><span><img src="/unicorn-cursor-full-v2.png" alt="Unicórnio completo"> <b>Galopa ao movimentar</b></span></div>';
    if (item.value === 'dipirona') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-dipirona.svg" alt="Seta Dipirona"><b>Seta Dipirona</b></span></div>';
    if (item.value === 'pirokinha-cosmica') return cursorEffectPreview('/cursor-pirokinha-cosmica.svg', 'Pirokinha Cósmica', 'Pirokinha Cósmica', 'TOMA LEITADA');
    if (item.value === 'anvisa') return '<div class="shop-visual-preview cursor-preview"><small>PRÉVIA DO CURSOR</small><span><img src="/cursor-anvisa.svg" alt="Seta Anvisa Intergaláctica"><b>Seta Anvisa Intergaláctica</b></span></div>';
    if (item.value === 'gay') return cursorEffectPreview('/cursor-gay-power.svg', 'Seta Gay Arco-íris', 'Seta Gay Arco-íris', '🌈 EU SOU FOFO, QUERO CARINHO E CONFUSÃO');
    if (item.value === 'commander') return '<div class="shop-visual-preview cursor-preview cursor-preview-commander"><small>ITEM DE COMANDO · EXCLUSIVO ADMIN</small><span><img src="/cursor-commander.svg" alt="Cursor Comandante da Área 51"><b>Cursor Comandante da Área 51</b></span></div>';
    if (item.value === 'commander-halloween') return '<div class="shop-visual-preview cursor-preview cursor-preview-commander"><small>COMANDO DA CRIPTA · HALLOWEEN</small><span><img src="/cursor-commander-halloween-v3.png" alt="Cursor do Comandante Sombrio"><b>Cursor do Comandante Sombrio</b></span></div>';
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
  if (item.type === 'trailStyle') return `<div class="shop-visual-preview trail-preview trail-preview-${escapeHtml(item.value)}"><small>PRÉVIA DO RASTRO · TESTE TAMBÉM FUNCIONA AO MOVER O MOUSE</small><span><i></i><b>${item.iconAsset ? `<img src="${escapeHtml(item.iconAsset)}" alt="">` : item.value === 'halloween-slime' ? '●  •  ·' : item.value === 'fruit' ? '🍉 🍊 🍓' : '🦄'}</b></span></div>`;
  if (item.type === 'siteTheme') { const accents={ galaxy:'✦  GALÁXIA VIVA  ·  HORIZONTE INFINITO', sunset:'☀  PÔR DO SOL  ·  CÉU EM CHAMAS', ocean:'◈  OCEANO PROFUNDO  ·  MARÉ AZUL', retro:'▦  RETRO WAVE  ·  ARCADE NOTURNO', matrix:'▣  MATRIX  ·  SINAL VERDE', eclipse:'◐  ECLIPSE  ·  OURO SOMBRIO', aurora:'✧  AURORA  ·  LUZ POLAR', mars:'◉  MARTE  ·  AREIA ESTELAR', nebula:'✦  NEBULOSA  ·  VIOLETA CÓSMICO', hyperdrive:'➤  HIPERVELOCIDADE  ·  SALTO ESTELAR', 'lunar-tide':'☾  MARÉ LUNAR  ·  AZUL PRATEADO', 'coral-signal':'◈  SINAL CORAL  ·  ABISSAL', prism:'◇  PRISMA  ·  ESPECTRO VIVO', 'gta-neon':'🌴  NEON VICE  ·  ✦  ÁREA 51', cobblemon:'⛏️  MUNDO EM BLOCOS  ·  🐾', wolverine:'╲╲╲  MODO SELVAGEM  ·  ✦', samurai:'⛩️  NÉVOA DE YŌTEI  ·  🌸', 'god-war':'ᚱ  NORTE ANTIGO  ·  🪓', 'halloween-bloodmoon':'🌕  LUA DE SANGUE  ·  NOITE RUBRA', 'halloween-toxic-fog':'🧪  NÉVOA TÓXICA  ·  SINAL ECTOPLASMA', 'halloween-haunted':'🎃  HALLOWEEN 51  ·  NOITE ASSOMBRADA', sovereign:'👑  COMANDO SOBERANO 51  ·  ✦', 'sovereign-halloween':'🌑  COMANDO DA CRIPTA 51  ·  👑' }; const standardThemes=['galaxy','sunset','ocean','retro','matrix','eclipse','aurora','mars','nebula','hyperdrive','lunar-tide','coral-signal','prism','halloween-bloodmoon','halloween-toxic-fog']; return `<div class="shop-visual-preview theme-preview theme-preview-${escapeHtml(item.value)}"><small>PRÉVIA DO TEMA ${standardThemes.includes(item.value) ? 'INDIVIDUAL' : 'PREMIUM'}</small><span>${accents[item.value] || '✦  ÁREA 51  ·  ✧  ·  ✦'}</span></div>`; }
  if (item.type === 'frame') return `<div class="shop-visual-preview frame-preview frame-${escapeHtml(item.value)}"><small>PRÉVIA EXATA · A MOLDURA FICA NO CARTÃO, TOPO E MENU</small><span><div class="frame-preview-profile"><b>${escapeHtml(initials(appState?.me?.displayName || 'SN'))}</b><em>${previewName}</em></div></span></div>`;
  if (item.type === 'nameStyle') return `<div class="shop-visual-preview name-preview"><small>PRÉVIA DO NOME</small><strong class="name-style-${escapeHtml(item.value)}">${previewName}</strong></div>`;
  if (item.type === 'badge') return `<div class="shop-visual-preview badge-preview${item.value === 'admin-halloween' ? ' badge-preview-admin-halloween' : ''}"><small>PRÉVIA DO EMBLEMA · NÃO ALTERA A COR DO NOME</small><span><b>${catalogIconMarkup(item) || escapeHtml(item.value)}</b><em class="badge-preview-name">${previewName}</em><i>Somente o emblema é aplicado</i></span></div>`;
  if (item.type === 'title') return `<div class="shop-visual-preview title-preview"><small>PRÉVIA DO TÍTULO</small><span><b>${escapeHtml(initials(appState?.me?.displayName || 'SN'))}</b><em>${previewName}</em><strong>${escapeHtml(item.value)}</strong></span></div>`;
  return '';
}

function setPreviewCursor(value) {
  const classes = ['unicorn-cursor-active', 'lideranca-cursor-active', 'horn-cursor-active', 'medicine-cursor-active', 'pirokinha-cursor-active', 'anvisa-cursor-active', 'commander-cursor-active', 'commander-halloween-cursor-active', 'khepri-cursor-active', 'blackstar-cyan-cursor-active', 'blackstar-gold-cursor-active', 'blackstar-crimson-cursor-active', 'gay-power-cursor-active', 'giant-slow-cursor-active', 'black-hen-cursor-active', 'volleyball-cursor-active', 'bible-cursor-active', 'papa-bento-cursor-active', 'scrum-cursor-active', 'energy-cursor-active', 'laser-cursor-active', 'rocket-cursor-active', 'alien-cursor-active', 'petista-cursor-active', 'bolsonaro-cursor-active', 'umbanda-cursor-active'];
  classes.forEach((name) => document.documentElement.classList.remove(name));
  const classByValue = { unicorn: 'unicorn-cursor-active', lideranca: 'lideranca-cursor-active', horn: 'horn-cursor-active', dipirona: 'medicine-cursor-active', 'pirokinha-cosmica': 'pirokinha-cursor-active', anvisa: 'anvisa-cursor-active', gay: 'gay-power-cursor-active', 'giant-slow': 'giant-slow-cursor-active', commander: 'commander-cursor-active', 'commander-halloween': 'commander-halloween-cursor-active', khepri: 'khepri-cursor-active', 'blackstar-cyan': 'blackstar-cyan-cursor-active', 'blackstar-gold': 'blackstar-gold-cursor-active', 'blackstar-crimson': 'blackstar-crimson-cursor-active', 'galinha-preta': 'black-hen-cursor-active', volei: 'volleyball-cursor-active', biblia: 'bible-cursor-active', 'papa-bento': 'papa-bento-cursor-active', 'scrum-master': 'scrum-cursor-active', energetico: 'energy-cursor-active', laser: 'laser-cursor-active', rocket: 'rocket-cursor-active', alien: 'alien-cursor-active', petista: 'petista-cursor-active', bolsonaro: 'bolsonaro-cursor-active', umbanda: 'umbanda-cursor-active' };
  if (classByValue[value]) document.documentElement.classList.add(classByValue[value]);
  document.documentElement.dataset.activeCursor = value || 'windows';
  // A prévia da Loja deve usar a mesma arte e o mesmo hotspot do cursor
  // equipado, sem precisar esperar uma nova sincronização do Perfil.
  const cursorVisual = document.querySelector('.unicorn-mouse-cursor>span');
  if (cursorVisual && value === 'lideranca') {
    cursorVisual.dataset.skin = 'lideranca';
    cursorVisual.innerHTML = '<img src="/cursor-lideranca-combo.png" alt="">';
  }
}

function applyPersonalTheme(value) {
  applyVisualTheme(appState);
  ['team-dragon-ball', 'cyberpunk-premium'].forEach((theme) => document.body.classList.toggle('profile-theme-' + theme, theme === value));
  ['galaxy', 'sunset', 'ocean', 'retro', 'matrix', 'eclipse', 'aurora', 'mars', 'nebula', 'hyperdrive', 'lunar-tide', 'coral-signal', 'prism', 'gta-neon', 'cobblemon', 'wolverine', 'samurai', 'god-war', 'dragon-ember', 'lideranca', 'halloween-bloodmoon', 'halloween-toxic-fog', 'halloween-haunted', 'sovereign', 'sovereign-halloween', 'camara-vanta', 'blackstar-cyan', 'blackstar-gold', 'blackstar-crimson'].forEach((theme) => document.body.classList.toggle('profile-theme-' + theme, theme === value));
  document.body.classList.remove('theme-light-override');
}

function applyShopPreviewVisual(item) {
  if (!item) return;
  if (item.type === 'cursorStyle' && appState?.profile?.forcedCursor && !['team-dragon', 'cyber-cyan', 'cyber-amber'].includes(item.value)) return;
  if (item.type === 'siteTheme') {
    const previewPalettes = {
      'team-dragon-ball': ['linear-gradient(90deg,#07162ca8,#08162a32),url(/team-themes/dragon-wallpaper.webp) center/cover', '#ffb943'],
      'cyberpunk-premium': ['linear-gradient(90deg,#080a1da8,#080a1d32),url(/team-themes/cyber-wallpaper.webp) center/cover', '#39e9ff'],
      galaxy: ['radial-gradient(circle at 18% 12%,#5b3aa7 0,transparent 30%),radial-gradient(circle at 84% 24%,#1b78cb 0,transparent 32%),linear-gradient(145deg,#050915,#121a38 54%,#07172c)', '#9f8cff'],
      sunset: ['radial-gradient(circle at 84% 10%,#ffd16b 0,transparent 21%),linear-gradient(145deg,#3b1439,#a93362 52%,#f17d57)', '#ffbc72'],
      ocean: ['radial-gradient(circle at 14% 8%,#63f0de 0,transparent 25%),linear-gradient(145deg,#03182d,#075e88 52%,#087e89)', '#54e4dd'],
      retro: ['repeating-linear-gradient(0deg,#16092d 0 2px,#130829 2px 6px),linear-gradient(145deg,#130629,#5a2178 52%,#006c79)', '#fa56d0'],
      matrix: ['repeating-linear-gradient(90deg,#0a2514 0 1px,transparent 1px 34px),linear-gradient(145deg,#010906,#062b17 55%,#08140d)', '#4fff93'],
      eclipse: ['radial-gradient(circle at 83% 10%,#eab74b 0,transparent 23%),linear-gradient(145deg,#050608,#251906 58%,#080807)', '#efc24a'],
      aurora: ['radial-gradient(circle at 16% 10%,#38e8b5 0,transparent 28%),radial-gradient(circle at 84% 12%,#9d70ff 0,transparent 29%),linear-gradient(145deg,#061722,#102b42)', '#62e8c3'],
      mars: ['radial-gradient(circle at 83% 10%,#ff7f42 0,transparent 25%),linear-gradient(145deg,#1b0807,#5c1d16 55%,#19090a)', '#ff8959'],
      nebula: ['radial-gradient(circle at 15% 11%,#e05ad8 0,transparent 27%),radial-gradient(circle at 85% 13%,#5689ff 0,transparent 28%),linear-gradient(145deg,#180a2e,#3e1a60)', '#d688ff'],
      hyperdrive: ['radial-gradient(circle at 16% 12%,#ff4ac6 0,transparent 25%),radial-gradient(circle at 84% 8%,#43dfff 0,transparent 27%),linear-gradient(145deg,#09051c,#261254 54%,#04334d)', '#ff75df'],
      'lunar-tide': ['radial-gradient(circle at 82% 10%,#c4f1ff 0,transparent 21%),linear-gradient(145deg,#061a3c,#094e7a 54%,#1486a2)', '#a4e8ff'],
      'coral-signal': ['radial-gradient(circle at 15% 10%,#ffbc75 0,transparent 25%),linear-gradient(145deg,#351135,#a03f5e 53%,#ef8063)', '#ffaf77'],
      prism: ['radial-gradient(circle at 14% 12%,#54eacb 0,transparent 26%),radial-gradient(circle at 85% 12%,#f179ff 0,transparent 26%),linear-gradient(145deg,#181140,#40377c 53%,#531a70)', '#d78dff'],
      'gta-neon': ['radial-gradient(circle at 82% 9%,#ff61b7 0,transparent 22%),radial-gradient(circle at 14% 17%,#48e8ff 0,transparent 24%),linear-gradient(145deg,#0b0720,#4b1d50 55%,#ff6f83)', '#ff7fc1'],
      cobblemon: ['linear-gradient(90deg,#071d3ae8,#08366399),url(/theme-cobblemon-ocean-v1.png) center/cover', '#8be8ff'],
      wolverine: ['linear-gradient(90deg,#231a05e9,#7d590b77),url(/theme-wolverine-comic-v1.png) center/cover', '#ffd23d'],
      samurai: ['linear-gradient(90deg,#161222e9,#37243a99),url(/theme-yotei-landscape-v1.png) center/cover', '#ffc0cb'],
      'god-war': ['linear-gradient(90deg,#071523e9,#1736538c),url(/theme-olympus-v1.png) center/cover', '#f4d59b'],
      'halloween-haunted': ['radial-gradient(circle at 82% 12%,#ff8f1f 0,transparent 16%),radial-gradient(circle at 15% 10%,#7b4db8 0,transparent 25%),linear-gradient(145deg,#10071c,#28113b 54%,#0b2431)', '#ff9d28'],
      'halloween-bloodmoon': ['radial-gradient(circle at 82% 10%,#d83845 0,transparent 18%),linear-gradient(145deg,#13080d,#35111c 56%,#170b18)', '#e24c58'],
      'halloween-toxic-fog': ['radial-gradient(circle at 16% 12%,#70f05a55 0,transparent 26%),radial-gradient(circle at 86% 18%,#894bc755 0,transparent 28%),linear-gradient(145deg,#07160f,#182c22 54%,#1d102d)', '#77ef68'],
      sovereign: ['linear-gradient(90deg,#09071be0,#2e184f86),url(/theme-sovereign-command-v1.png) center/cover', '#f7d46c'],
      'sovereign-halloween': ['linear-gradient(90deg,#08070de8,#35101f72),url(/theme-sovereign-command-halloween-v1.png) center/cover', '#d7aa43'],
      'camara-vanta': ['linear-gradient(90deg,#060817e8,#26134775),url(/card-season-2026-10/theme-camara-vanta.webp) center/cover', '#a77cff'],
      'dragon-ember': ['linear-gradient(90deg,#090806e8,#3c180a70),url(/theme-dragon-ember.png) center/cover', '#ff9b3d'],
      lideranca: ['linear-gradient(90deg,#080908ec,#27120a78),url(/theme-lideranca-posto.png) center/cover', '#ffb23f'],
    };
    const palette = previewPalettes[item.value];
    document.body.classList.add('shop-theme-preview-active');
    document.body.dataset.previewTheme = item.value;
    if (palette) {
      document.body.style.setProperty('--shop-preview-background', palette[0]);
      document.body.style.setProperty('--shop-preview-accent', palette[1]);
    }
    applyPersonalTheme(item.value);
    const companions = { 'team-dragon-ball': { badge: 'team-dragon', cursor: 'team-dragon', frame: 'team-dragon' }, 'cyberpunk-premium': { badge: 'cyberpunk-premium', cursor: 'cyber-cyan', frame: 'cyberpunk-premium' }, 'gta-neon': { badge: '🌴' }, cobblemon: { badge: '⚡' }, wolverine: { badge: '🐾' }, samurai: { badge: '⛩️' }, 'god-war': { badge: 'ᚱ' }, 'dragon-ember': { badge: 'dragon-ember', cursor: 'dragon-ember', trail: 'dragon-ember', nameStyle: 'dragon-ember', frame: 'dragon-ember' }, lideranca: { cursor: 'lideranca', nameStyle: 'lideranca' }, 'halloween-haunted': { badge: '🎃', cursor: 'halloween-broom', trail: 'halloween-slime', nameStyle: 'halloween-ectoplasm', frame: 'halloween-rune' }, sovereign: { badge: '👑' }, 'sovereign-halloween': { badge: 'admin-halloween', cursor: 'commander-halloween', nameStyle: 'sovereign-halloween', frame: 'sovereign-halloween' }, 'camara-vanta': { badge: '◈', cursor: 'khepri', trail: 'taquion', frame: 'blackstar' } }[item.value];
    if (companions) {
      // A prévia é uma demonstração completa por 20s. No encerramento,
      // renderProfileEconomy restaura o cursor obrigatório do perfil.
      setPreviewCursor(companions.cursor || item.value);
      document.body.dataset.trailStyle = companions.trail || item.value;
      document.body.dataset.cursorEffect = ['lideranca', 'cyber-cyan', 'cyber-amber'].includes(companions.cursor) ? companions.cursor : '';
      ['profileDisplayName', 'userName', 'menuUserName'].forEach((id) => {
        const element = $('#' + id);
        if (!element) return;
        element.className = 'name-style-' + (companions.nameStyle || item.value);
        element.dataset.badge = companions.badge;
      });
      if (companions.frame) {
        $('#profileIdentityCard').className = 'card profile-identity-card frame-' + companions.frame;
        $('#topProfileButton').className = 'top-profile-button frame-' + companions.frame;
        $('.site-menu-user').className = 'site-menu-user frame-' + companions.frame;
      }
    }
  } else if (item.type === 'cursorStyle') {
    setPreviewCursor(item.value);
    document.body.dataset.trailStyle = ['laser', 'rocket', 'alien'].includes(item.value) ? item.value : item.value === 'maradona' ? 'white' : item.value === 'halloween-mask' ? 'halloween-blood' : 'none';
    document.body.dataset.cursorEffect = ['cyber-cyan', 'cyber-amber', 'blackstar-cyan', 'blackstar-gold', 'blackstar-crimson', 'gay', 'galinha-preta', 'volei', 'biblia', 'papa-bento', 'scrum-master', 'energetico', 'pirokinha-cosmica', 'petista', 'bolsonaro', 'umbanda', 'messi', 'cristiano', 'pele', 'maradona', 'neymar'].includes(item.value) ? item.value : '';
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
  document.documentElement.classList.remove('team-shop-cursor-preview');
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
  document.body.style.removeProperty('--shop-preview-background');
  document.body.style.removeProperty('--shop-preview-accent');
  $('#shopPreviewBanner')?.remove();
  if (appState?.profile) renderProfileEconomy(appState.profile);
  if (showMessage) showToast('Teste encerrado. Seus visuais foram restaurados.');
}

function startShopPreview(itemId) {
  const item = (appState?.profile?.shop || []).find((candidate) => candidate.id === itemId && !candidate.consumable);
  if (!item) return;
  if (item.type === 'cursorStyle' && appState?.profile?.forcedCursor && !['team-dragon', 'cyber-cyan', 'cyber-amber'].includes(item.value)) {
    showToast('Um cursor obrigatório está ativo. Aguarde o efeito terminar para testar outro mouse.', 'error');
    return;
  }
  if (item.type === 'siteTheme' && (appState.visualTheme !== 'user-choice' || appState.profile?.loan?.overdue)) {
    showToast('O tema de punição da rodada está ativo e não pode ser substituído durante o teste.', 'error');
    return;
  }
  stopShopPreview(false);
  if (item.type === 'cursorStyle' && ['team-dragon', 'cyber-cyan', 'cyber-amber'].includes(item.value)) document.documentElement.classList.add('team-shop-cursor-preview');
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

let cobblemonDexPage = 0;
let cobblemonDexFilter = 'all';
let cobblemonDexOwnerId = '';
let cobblemonServerRosterTab = 'playing';
let cobblemonDexGridKey = '';
const cobblemonBallPurchaseQuantities = { poke: 1, great: 1, ultra: 1 };
let cobblemonOpeningLocked = false;
let cobblemonFlowLocked = false;
let cobblemonDeferredState = false;
let cobblemonDeferredReleaseNotice = false;

function resumeAfterCobblemonFlow() {
  cobblemonFlowLocked = false;
  const needsRefresh = cobblemonDeferredState;
  cobblemonDeferredState = false;
  if (needsRefresh && appState) api('/api/state', {}, false).then(applyState).catch(() => schedulePortalSync(0));
  if (cobblemonDeferredReleaseNotice) {
    cobblemonDeferredReleaseNotice = false;
    setTimeout(showReleaseNotice, 0);
  }
}
const COBBLEMON_ITEM_SPRITES = {
  poke: '/capture-ball-cobblemon.png', great: '/cobblemon-items/great-ball.png', ancient: '/cobblemon-items/ancient-poke-ball.png', quick: '/cobblemon-items/quick-ball.png', ultra: '/cobblemon-items/ultra-ball.png', candy: '/cobblemon-items/rare-candy.png', expCandy: '/cobblemon-items/exp-candy-xl.png', capsule: '/cobblemon-items/ability-capsule.png', stone: '/cobblemon-items/fire-stone.png', cherish: '/cobblemon-items/cherish-ball.png', master: '/cobblemon-items/master-ball.png'
};
const COBBLEMON_CAPTURE_BALLS = {
  poke: { id: 'poke', name: 'Poké Ball', shortName: 'Básica', sprite: COBBLEMON_ITEM_SPRITES.poke, multiplier: 1, price: 0 },
  great: { id: 'great', name: 'Great Ball', shortName: 'Melhor chance', sprite: COBBLEMON_ITEM_SPRITES.great, multiplier: 1.35, price: 75 },
  ultra: { id: 'ultra', name: 'Ultra Ball', shortName: 'Alta chance', sprite: COBBLEMON_ITEM_SPRITES.ultra, multiplier: 1.7, price: 180 },
};

function cobblemonPreviewSprite(pokemonId, size = 'large') {
  return `https://cobbledex.b-cdn.net/3dmons/previews/${size}/${Number(pokemonId)}.webp`;
}

function cobblemonFallbackSprite(pokemonId, isShiny = false) {
  const id = Math.max(1, Math.floor(Number(pokemonId) || 25));
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${isShiny ? 'shiny/' : ''}${id}.png`;
}

function cobblemonShinyWikiSprite(pokemon = {}) {
  const name = String(pokemon.name || pokemon.n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `https://wiki.cobblemon.com/index.php/Special:FilePath/${encodeURIComponent(name + '_Shiny_(Model).png')}`;
}

function cobblemonSpriteSources(pokemon = {}, size = 'large') {
  const id = pokemon.id || pokemon.i;
  const preview = cobblemonPreviewSprite(id, size);
  const fallback = cobblemonFallbackSprite(id, Boolean(pokemon.isShiny));
  return pokemon.isShiny ? [cobblemonShinyWikiSprite(pokemon), fallback, preview] : [preview, fallback];
}

function applyCobblemonSprite(image, pokemon = {}, size = 'large') {
  if (!image) return;
  const sources = cobblemonSpriteSources(pokemon, size);
  const loadNext = () => {
    const next = sources.shift();
    if (!next) { image.onerror = null; return; }
    image.src = next;
  };
  image.onerror = loadNext;
  loadNext();
}

function cobblemonSpriteMarkup(pokemon = {}, size = 'large', attributes = '') {
  const [source, ...fallbacks] = cobblemonSpriteSources(pokemon, size);
  const recovery = ` data-cobblemon-sprite-fallbacks="${escapeHtml(fallbacks.join('|'))}" onerror="const [next,...rest]=this.dataset.cobblemonSpriteFallbacks.split('|').filter(Boolean);if(next){this.dataset.cobblemonSpriteFallbacks=rest.join('|');this.src=next}else{this.onerror=null}"`;
  return `<img src="${escapeHtml(source)}"${recovery} ${attributes}>`;
}

function cobblemonDeliverySpriteMarkup(entry = {}) {
  const pokemonId = Number(entry.pokemonId);
  if (Number.isInteger(pokemonId) && pokemonId > 0) {
    return cobblemonSpriteMarkup({ id: pokemonId, isShiny: Boolean(entry.isShiny) }, 'small', 'loading="lazy" decoding="async" alt=""');
  }
  return entry.sprite ? `<img src="${escapeHtml(entry.sprite)}" loading="lazy" decoding="async" alt="">` : '';
}
let cobblemonSelectedBall = 'poke';
const COBBLEMON_BOX_CATALOG = {
  evolution: { name: 'Baú das Pedras', price: 479.90, accent: 'rare', cover: COBBLEMON_ITEM_SPRITES.stone, rewards: [['Pedra do Fogo ×4','/cobblemon-items/fire-stone.png',14],['Pedra da Água ×4','/cobblemon-items/water-stone.png',14],['Pedra do Trovão ×4','/cobblemon-items/thunder-stone.png',14],['Pedra da Folha ×4','/cobblemon-items/leaf-stone.png',14],['Pedra do Gelo ×3','/cobblemon-items/ice-stone.png',8],['Pedra do Sol ×3','/cobblemon-items/sun-stone.png',8],['Pedra da Lua ×3','/cobblemon-items/moon-stone.png',8],['Pedra da Alvorada ×2','/cobblemon-items/dawn-stone.png',7],['Pedra do Crepúsculo ×2','/cobblemon-items/dusk-stone.png',7],['Pedra Brilhante ×1','/cobblemon-items/shiny-stone.png',6]] },
  master: { name: 'Baú Premium', price: 1499.90, accent: 'legendary', cover: '/legendary-monuments/premium/azure_flute.png', forceDelivery: true, rewards: [['Clear Bell','/legendary-monuments/premium/clear_bell.png',4.17],['Medallion of Renewal','/legendary-monuments/premium/medallion_of_renewal.png',3.33],['Tábua do Despertar — 100% cheia','/legendary-monuments/premium/tablet_of_reawakening_4.png',2.08],['Origin Key','/legendary-monuments/premium/origin_key.png',2.08],['Azure Flute','/legendary-monuments/premium/azure_flute.png',1.25],['Silver Wing','/legendary-monuments/premium/silver_wing.png',3.33],['Espaldeira de Rocha','/legendary-monuments/premium/rock_pauldron.png',3.33],['Espaldeira de Gelo','/legendary-monuments/premium/ice_pauldron.png',3.33],['Espaldeira de Aço','/legendary-monuments/premium/steel_pauldron.png',3.33],['Espaldeira Elétrica','/legendary-monuments/premium/electric_pauldron.png',3.33],['Espaldeira de Dragão','/legendary-monuments/premium/dragon_pauldron.png',3.33],['Espaldeira de Titã','/legendary-monuments/premium/titan_pauldron.png',3.33],['Titan Hammer','/legendary-monuments/premium/titan_hammer.png',2.08],['Hero Sword','/legendary-monuments/premium/herosword.png',2.08],['Hero Shield','/legendary-monuments/premium/heroshield.png',2.08],['Cenoura de Raiz de Gelo','/legendary-monuments/premium/iceroot_carrot.png',4.17],['Cenoura de Shaderoot','/legendary-monuments/premium/shaderoot_carrot.png',4.17],['Essência de Aurora ×16','/legendary-monuments/premium/aurora_essence.png',3.33],['Urna das Brasas de Galar','/legendary-monuments/premium/galarian_urn_of_embers.png',4.17],['Urna da Geada de Galar','/legendary-monuments/premium/galarian_urn_of_frost.png',4.17],['Urna das Tempestades de Galar','/legendary-monuments/premium/galarian_urn_of_storms.png',4.17],['Picareta Netherite encantada','/legendary-monuments/premium/netherite_pickaxe.png',4.17],['Machado Netherite encantado','/legendary-monuments/premium/netherite_axe.png',4.17],['Pá Netherite encantada','/legendary-monuments/premium/netherite_shovel.png',4.17],['Espada Netherite encantada','/legendary-monuments/premium/netherite_sword.png',4.17],['Capacete Netherite encantado','/legendary-monuments/premium/netherite_helmet.png',4.17],['Peitoral Netherite encantado','/legendary-monuments/premium/netherite_chestplate.png',4.17],['Calças Netherite encantadas','/legendary-monuments/premium/netherite_leggings.png',4.17],['Botas Netherite encantadas','/legendary-monuments/premium/netherite_boots.png',4.17]] },
  pokemon: { name: 'Baú Pokémon', price: 899.90, accent: 'legendary', cover: 'https://cobbledex.b-cdn.net/3dmons/previews/large/25.webp', monthly: true, rewards: [['Pokémon comum','https://cobbledex.b-cdn.net/3dmons/previews/large/25.webp',80],['Pokémon raro','https://cobbledex.b-cdn.net/3dmons/previews/large/6.webp',15],['Pokémon Shiny','https://cobbledex.b-cdn.net/3dmons/previews/large/133.webp',4],['Pokémon lendário','https://cobbledex.b-cdn.net/3dmons/previews/large/150.webp',1]] },
};
const COBBLEMON_BOX_REWARD_DETAILS = {
  'Clear Bell': 'Relíquia da jornada de Ho-Oh.',
  'Medallion of Renewal': 'Permite reutilizar uma ativação de pedestal uma vez.',
  'Tábua do Despertar — 100% cheia': 'Chega completa, pronta para a etapa do Reawakening Sanctum.',
  'Origin Key': 'Chave da progressão do Reawakening Sanctum.',
  'Azure Flute': 'Acessa o Hall of Origin na jornada de Arceus, após os demais requisitos.',
  'Silver Wing': 'Relíquia da jornada de Lugia.',
  'Espaldeira de Rocha': 'Componente da jornada Regi.',
  'Espaldeira de Gelo': 'Componente da jornada Regi.',
  'Espaldeira de Aço': 'Componente da jornada Regi.',
  'Espaldeira Elétrica': 'Componente da jornada Regi.',
  'Espaldeira de Dragão': 'Componente da jornada Regi.',
  'Espaldeira de Titã': 'Componente da jornada Regi.',
  'Titan Hammer': 'Item da progressão dos Regis.',
  'Hero Sword': 'Usada com um Totem da Imortalidade para evocar Zacian.',
  'Hero Shield': 'Relíquia da jornada de Zamazenta.',
  'Cenoura de Raiz de Gelo': 'Usada para evocar Glastrier.',
  'Cenoura de Shaderoot': 'Usada para evocar Spectrier.',
  'Essência de Aurora ×16': '16 Essências de Aurora — quantidade necessária para formar o Frasco de Essência de Aurora na jornada de Xerneas.',
  'Urna das Brasas de Galar': 'Componente definido da mecânica Dynamax.',
  'Urna da Geada de Galar': 'Componente definido da mecânica Dynamax.',
  'Urna das Tempestades de Galar': 'Componente definido da mecânica Dynamax.',
  'Picareta Netherite encantada': 'Eficiência V, Fortuna III, Inquebrável III e Remendo.',
  'Machado Netherite encantado': 'Eficiência V, Fortuna III, Inquebrável III e Remendo.',
  'Pá Netherite encantada': 'Eficiência V, Fortuna III, Inquebrável III e Remendo.',
  'Espada Netherite encantada': 'Afiação V, Saque III, Aspecto Flamejante II, Inquebrável III e Remendo.',
  'Capacete Netherite encantado': 'Proteção IV, Respiração III, Afinidade Aquática, Inquebrável III e Remendo.',
  'Peitoral Netherite encantado': 'Proteção IV, Inquebrável III e Remendo.',
  'Calças Netherite encantadas': 'Proteção IV, Inquebrável III e Remendo.',
  'Botas Netherite encantadas': 'Proteção IV, Queda Suave IV, Passos Profundos III, Agilidade das Almas III, Inquebrável III e Remendo.'
};
const COBBLEMON_ROULETTE_REWARDS = [
 ['Sem prêmio','',23,'no-prize'],['Arc Phone','/legendary-monuments/arc-phone.png',6,'legendary-arc-phone'],['Dream Catcher','/legendary-monuments/dream-catcher.png',6,'legendary-dream-catcher'],['Light Stone Shard ×3','/legendary-monuments/light-stone-shard.png',6,'legendary-light-shards'],['Dark Stone Shard ×3','/legendary-monuments/dark-stone-shard.png',6,'legendary-dark-shards'],['Golem Scrap ×4','/legendary-monuments/golem-scrap.png',7.5,'legendary-golem-scrap'],['Disc of the First Song Fragment ×2','/legendary-monuments/first-song-fragment.png',5,'legendary-first-song-fragments'],['Medallion of Renewal Fragment','/legendary-monuments/renewal-fragment.png',.5,'legendary-renewal-fragment'],['Cosmic Catalyst','/legendary-monuments/cosmic-catalyst.png',5,'legendary-cosmic-catalyst'],['Dyna Fruit','/legendary-monuments/dyna-fruit.png',6,'legendary-dyna-fruit'],['Icerend Seal','/legendary-monuments/icerend-seal.png',3,'legendary-icerend-seal'],['Groundblight Seal','/legendary-monuments/groundblight-seal.png',3,'legendary-groundblight-seal'],['Firescourge Seal','/legendary-monuments/firescourge-seal.png',3,'legendary-firescourge-seal'],['Grasswither Seal','/legendary-monuments/grasswither-seal.png',3,'legendary-grasswither-seal'],['Sacred Ash','/legendary-monuments/sacred-ash.png',1,'legendary-sacred-ash'],['Locator Chip','/legendary-monuments/locator-chip.webp',2,'locator-chip-roulette'],['Lucky Egg','https://wiki.cobblemon.com/index.php/Special:FilePath/Lucky_Egg.png',1,'lucky-egg-roulette'],['Coordenadas de Escavação Fóssil','https://wiki.cobblemon.com/index.php/Special:FilePath/Dome_Fossil.png',1,'fossil-location-roulette'],['Master Ball',COBBLEMON_ITEM_SPRITES.master,.5,'master-ball-roulette'],['Rare Candy ×8',COBBLEMON_ITEM_SPRITES.candy,5,'rare-candy-roulette'],['Exp. Candy L ×8','https://wiki.cobblemon.com/index.php/Special:FilePath/Exp._Candy_L.png',4,'exp-candy-l-roulette'],['Exp. Candy XL ×4',COBBLEMON_ITEM_SPRITES.expCandy,2.5,'exp-candy-xl-roulette']
];
const COBBLEMON_ROULETTE_DETAILS = {
  'no-prize':'O giro é consumido e nenhum item é entregue.',
  'legendary-arc-phone':'Rastreia estruturas lendárias quando você possui o item-chave exigido pelo monumento.',
  'legendary-dream-catcher':'Permite avançar nas jornadas de Cresselia e Darkrai sem entregar a invocação pronta.',
  'legendary-light-shards':'Três dos nove fragmentos necessários para formar a Light Stone de Reshiram.',
  'legendary-dark-shards':'Três dos nove fragmentos necessários para formar a Dark Stone de Zekrom.',
  'legendary-golem-scrap':'Material usado para fabricar lingotes e chaves dos desafios dos Regis.',
  'legendary-first-song-fragments':'Dois dos nove fragmentos necessários para restaurar o disco relacionado à Meloetta.',
  'legendary-renewal-fragment':'Um dos quatro fragmentos do medalhão que permite reutilizar um pedestal.',
  'legendary-cosmic-catalyst':'Coleta Cosmic Dust para avançar na jornada de Cosmog.',
  'legendary-dyna-fruit':'Fruta especial utilizada na fabricação das Galarian Urns.',
  'legendary-icerend-seal':'Localiza o santuário de Chien-Pao.',
  'legendary-groundblight-seal':'Localiza o santuário de Ting-Lu.',
  'legendary-firescourge-seal':'Localiza o santuário de Chi-Yu.',
  'legendary-grasswither-seal':'Localiza o santuário de Wo-Chien.',
  'legendary-sacred-ash':'Restaura o HP e o PP de toda a equipe fora de batalha.',
  'locator-chip-roulette':'Com 4 ferros e 4 redstones, fabrica o Poké Radar para rastrear estruturas lendárias.',
  'fossil-location-roulette':'Davi entrega uma localização preparada para escavação fóssil.',
  'master-ball-roulette':'Ball raríssima que garante a captura.',
  'lucky-egg-roulette':'Aumenta a experiência recebida pelo Pokémon.',
  'rare-candy-roulette':'Cada unidade aumenta o Pokémon em um nível.',
  'exp-candy-l-roulette':'Concede uma grande quantidade de experiência.',
  'exp-candy-xl-roulette':'Concede uma quantidade muito grande de experiência.'
};
function renderCobblemonRouletteWheel(wheel) {
  if (!wheel || wheel.dataset.rewardsReady) return;
  const colors=['#194f70','#563c82','#23766d','#935020','#285ca0','#74478b','#a73d59','#a97d18'];
  const sweep=360/COBBLEMON_ROULETTE_REWARDS.length;
  wheel.style.background=`radial-gradient(circle,#08172b 0 18%,transparent 18.5%),conic-gradient(${COBBLEMON_ROULETTE_REWARDS.map((_,i)=>`${colors[i%colors.length]} ${i*sweep}deg ${(i+1)*sweep}deg`).join(',')})`;
  wheel.innerHTML=COBBLEMON_ROULETTE_REWARDS.map(([name,sprite,chance,id],index)=>{const angle=index*sweep+sweep/2, detail=COBBLEMON_ROULETTE_DETAILS[id]||'Item especial da Roleta Cobblemon.';return `<span class="cobblemon-roulette-slot" style="--slot-angle:${angle}deg;--slot-radius:198px" tabindex="0" aria-label="${escapeHtml(name)} · ${chance}%">${index===0?'<b class="roulette-loss">×</b>':`<img src="${sprite}" alt="${escapeHtml(name)}">`}<div class="cobblemon-roulette-tooltip"><strong>${escapeHtml(name)}</strong><em>${String(chance).replace('.',',')}% de chance</em><small>${escapeHtml(detail)}</small></div></span>`;}).join('');
  wheel.addEventListener('click',(event)=>{const slot=event.target.closest('.cobblemon-roulette-slot');if(!slot)return;wheel.querySelectorAll('.is-expanded').forEach(item=>item.classList.remove('is-expanded'));slot.classList.add('is-expanded');event.stopPropagation();});
  document.addEventListener('click',()=>wheel.querySelectorAll('.is-expanded').forEach(item=>item.classList.remove('is-expanded')));
  wheel.dataset.rewardsReady='true';
}

function cobblemonDeliverySpecLabel(entry = {}) {
  const level = Math.floor(Number(entry.level || 0));
  if (level < 1) return '';
  const gender = ({ male: 'Macho', female: 'Fêmea', genderless: 'Sem gênero' })[entry.gender] || 'Sexo definido na entrega';
  return `Entrega Cobblemon: nível ${level} · ${gender}`;
}

function premiumCobblemonSellPriceFromChance(chance) {
  const value = Number(chance || 0);
  return value <= 1.25 ? 1100 : value <= 2.08 ? 900 : value <= 3.33 ? 700 : 550;
}

function cobblemonOddsCards(rewards, premium = false) {
  return rewards.map(([name,sprite,chance]) => { const detail = COBBLEMON_BOX_REWARD_DETAILS[name]; const sale = premium ? `<small class="cobblemon-odds-sale">Revenda: ${formatCredits(premiumCobblemonSellPriceFromChance(chance))} créditos</small>` : ''; return `<article class="mystery-odds-card cobblemon-odds-card"><span><img src="${sprite}" alt=""></span><div><small>ITEM COBBLEMON</small><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}${sale}<em>${Number(chance).toLocaleString('pt-BR',{maximumFractionDigits:1})}% de chance</em></div></article>`; }).join('');
}

function showCobblemonOdds(title, rewards, note) {
  const premium = title === 'Baú Premium';
  $('#cobblemonOddsContent').innerHTML = `<header><img src="${rewards[0][1]}" alt=""><div><small>CHANCES CONTROLADAS NO SERVIDOR</small><h3>${escapeHtml(title)}</h3></div></header><p>${escapeHtml(note)}</p><section class="mystery-odds-carousel" aria-label="Prêmios possíveis"><button type="button" class="mystery-odds-nav" data-box-carousel="prev" aria-label="Prêmio anterior">‹</button><div class="mystery-odds-viewport"><div class="mystery-odds-track">${cobblemonOddsCards(rewards, premium)}</div></div><button type="button" class="mystery-odds-nav" data-box-carousel="next" aria-label="Próximo prêmio">›</button></section><footer>${premium ? 'A venda é opcional. O valor acompanha a raridade/chance do item e a decisão fica guardada se você sair da página.' : 'Os sprites dos itens vêm da Wiki Cobblemon. O resultado é definido no servidor e não pode ser alterado pelo navegador.'}</footer>`;
  $('#cobblemonOddsDialog').showModal();
}

function spinCobblemonRouletteWheel(wheel, rewardIndex) {
  // Voltar à posição inicial com a transição ativa faria a roleta "girar de
  // novo" até o X quando o resultado fosse fechado. O reset é instantâneo;
  // somente o giro que revela o novo prêmio recebe animação.
  wheel.classList.add('roulette-resetting');
  wheel.style.transition = 'none';
  wheel.classList.remove('spinning');
  wheel.style.removeProperty('--roulette-final-angle');
  void wheel.offsetWidth;
  wheel.classList.remove('roulette-resetting');
  const sweep = 360 / COBBLEMON_ROULETTE_REWARDS.length;
  // A animação CSS já compensa a posição do ponteiro; usamos o centro da casa
  // sorteada, nunca o começo do setor.
  const center = rewardIndex * sweep + sweep / 2;
  wheel.style.setProperty('--roulette-stop-angle', `${center}deg`);
  wheel.style.setProperty('--roulette-final-angle', `calc(1800deg - ${center}deg)`);
  wheel.style.setProperty('--roulette-counter-angle', `calc(${center}deg - 1800deg)`);
  void wheel.offsetWidth;
  wheel.style.removeProperty('transition');
  void wheel.offsetWidth;
  wheel.classList.add('spinning');
}

async function spinCobblemonRoulette(button = $('#cobblemonRouletteSpin')) {
  if (!button || button.disabled) return;
  const price = Number(appState?.profile?.cobblemon?.roulette?.price || 259.90);
  const remaining = Number(appState?.profile?.cobblemon?.roulette?.spinsRemaining || 0);
  if (!confirmCobblemonAction(`Girar a Roleta Cobblemon por ${formatCredits(price)} Créditos 51? Depois deste giro, você terá ${Math.max(0, remaining - 1)} tentativa(s) neste ciclo semanal.`, button)) return;
  casinoAudioContext();
  button.disabled = true;
  try {
    const data = await api('/api/cobblemon/roulette/spin', { method: 'POST' });
    const wheel = $('#cobblemonRouletteWheel');
    const rewardIndex = Math.max(0, COBBLEMON_ROULETTE_REWARDS.findIndex(([name,,,id]) => id === data.reward.rewardId || name === data.reward.name));
    spinCobblemonRouletteWheel(wheel, rewardIndex);
    startCasinoWheelSound(3100, 1800);
    await new Promise((resolve) => setTimeout(resolve, 3200));
    stopCasinoWheelSound();
    playCasinoRewardSound(!(data.reward.noPrize || data.reward.rewardId === 'no-prize'));
    const decided = await showCobblemonOpening('Resultado da Roleta Cobblemon', { ...data.reward, profile: data.profile }, { skipCarousel: true });
    appState.profile = decided.profile;
    renderProfileEconomy(appState.profile);
  } catch (error) {
    stopCasinoWheelSound();
    showToast(error.message, 'error');
    renderCobblemonDex(appState.profile);
  }
}

async function showCobblemonOpening(title, reward, options = {}) {
  const dialog = $('#cobblemonOpeningDialog'), viewport = $('#cobblemonCarouselViewport'), track = $('#cobblemonCarouselTrack'), result = $('#cobblemonOpeningResult'), decision = $('#cobblemonOpeningDecision'), choicesBox = $('#cobblemonPokemonChoices'), continueButton = $('#continueCobblemonRoll');
  const skipCarousel = Boolean(options.skipCarousel);
  cobblemonOpeningLocked = true;
  const pokemonOnly = Boolean(reward.pokemonId) || reward.boxId === 'pokemon';
  const pokemonCatalog = Array.isArray(window.AREA51_COBBLEMON_CATALOG) ? window.AREA51_COBBLEMON_CATALOG : [];
  const pokemonPool = pokemonCatalog.map((pokemon) => [pokemon.n || pokemon.name, `https://cobbledex.b-cdn.net/3dmons/previews/large/${Number(pokemon.i || pokemon.id)}.webp`, 0]);
  const itemPool = Object.entries(COBBLEMON_BOX_CATALOG).filter(([id]) => id !== 'pokemon').flatMap(([,box]) => box.rewards);
  const pool = pokemonOnly && pokemonPool.length ? pokemonPool : itemPool;
  const selected = [reward.name, reward.noPrize ? '' : (reward.sprite || COBBLEMON_ITEM_SPRITES.poke), 0]; const winningIndex = 27;
  const entries = Array.from({length:32},(_,index) => index === winningIndex ? selected : pool[Math.floor(Math.random()*pool.length)]);
  viewport.classList.toggle('hidden', skipCarousel);
  $('#cobblemonOpeningTitle').textContent = title; $('#cobblemonOpeningIcon').src = skipCarousel ? (reward.sprite || COBBLEMON_ITEM_SPRITES.poke) : '/capture-ball-cobblemon.png'; $('#keepCobblemonReward').disabled = false; delete $('#keepCobblemonReward').dataset.cobblemonChoiceId; $('#sellCobblemonReward').disabled = false;
  result.classList.remove('revealed'); result.innerHTML = '<span>◉</span><strong>Aguarde a roleta parar</strong>'; decision.classList.add('hidden'); choicesBox?.classList.add('hidden'); continueButton?.classList.add('hidden'); if (choicesBox) choicesBox.innerHTML = '';
  track.innerHTML = entries.map(([name,sprite]) => `<article><span>${sprite ? `<img src="${sprite}" alt="">` : '<b class="roulette-loss">×</b>'}</span><strong>${escapeHtml(name)}</strong></article>`).join('');
  track.style.transition = 'none'; track.style.transform = 'translateX(0)'; dialog.showModal();
  if (!skipCarousel) {
    const chestKind = reward.boxId === 'master' || title === 'Baú Premium' ? 'master-imperial' : reward.boxId === 'evolution' || title === 'Baú das Pedras' ? 'sonda' : 'pokemon';
    await showChestOpeningSequence(dialog, chestKind);
    const itemWidth = 124, target = viewport.clientWidth/2-(winningIndex*itemWidth+itemWidth/2);
    track.style.transform = `translateX(${target + 16 * itemWidth}px)`; void track.offsetWidth;
    track.style.transition = 'transform 9s cubic-bezier(.12,.72,.24,1)'; void track.offsetWidth; track.style.transform = `translateX(${target}px)`; startOpeningCarouselSound(9000); await new Promise((resolve)=>setTimeout(resolve,9100)); stopOpeningCarouselSound();
    $('#cobblemonOpeningIcon').src = reward.sprite || COBBLEMON_ITEM_SPRITES.poke;
    track.children[winningIndex]?.classList.add('winner');
  }
  const hasChoices = Array.isArray(reward.choices) && reward.choices.length > 0;
  const rewardSpec = cobblemonDeliverySpecLabel(reward);
  result.innerHTML = `<span>${reward.noPrize ? '<b class="roulette-loss">×</b>' : `<img src="${reward.sprite || COBBLEMON_ITEM_SPRITES.poke}" alt="">`}</span><strong>${reward.noPrize ? 'Não foi desta vez!' : hasChoices ? 'Escolha uma opção' : 'Você recebeu ' + escapeHtml(reward.name) + '!'}</strong>${reward.deliveryNote ? `<small class="cobblemon-delivery-spec">${escapeHtml(reward.deliveryNote)}</small>` : ''}${rewardSpec ? `<small class="cobblemon-delivery-spec">${escapeHtml(rewardSpec)}</small>` : ''}`; result.classList.add('revealed'); if (!skipCarousel && !reward.noPrize) playOpeningPokemonReward(reward);
  const keepButton = $('#keepCobblemonReward'), sellButton = $('#sellCobblemonReward');
  const rollOnly = Boolean(reward.rollOnly);
  const finalChoices = Array.isArray(reward.choices) && reward.choices.length > 0;
  const weeklyChoice = reward.choiceStage === 'weekly';
  const premiumSale = Boolean(reward.premiumSaleEligible || reward.boxId === 'master');
  keepButton.textContent = reward.noPrize ? 'Fechar' : reward.forceDelivery ? 'Entendi · aguardar entrega' : premiumSale ? 'Receber no servidor' : 'Ficar com o prêmio';
  // During the first two rolls there is no decision yet: the player must see
  // all three results before choosing one for that capsule.
  keepButton.classList.toggle('hidden', Boolean(rollOnly && !finalChoices));
  sellButton.classList.toggle('hidden', Boolean(reward.noPrize || reward.forceDelivery || rollOnly || finalChoices));
  // Os três resultados da cápsula são encadeados automaticamente. O botão
  // antigo continua no HTML como fallback visual, mas não interrompe mais o
  // fluxo entre o primeiro, segundo e terceiro sorteio.
  if (rollOnly) continueButton?.classList.add('hidden');
  decision.querySelector('p').textContent = reward.noPrize ? 'A casa de perda foi sorteada. O giro foi consumido e nenhum item entrou na fila de entrega.' : reward.forceDelivery ? `Este prêmio já entrou na fila de entrega do Davi e não pode ser vendido por créditos.${reward.deliveryNote ? ` ${reward.deliveryNote}` : ''}` : premiumSale ? `Decida agora: receber envia o item ao Davi e bloqueia a venda definitivamente; vender credita ${formatCredits(reward.sellPrice || 0)} Créditos 51. Se fechar ou atualizar, esta decisão ficará guardada no painel.` : finalChoices ? (weeklyChoice ? 'Escolha um dos Pokémon selecionados nesta semana para o Davi entregar na sexta.' : 'Você fez os três sorteios. Escolha um Pokémon para guardar como sua opção do dia.') : rollOnly ? `Sorteio ${reward.rollNumber} de 3 concluído. Continue para ver os próximos resultados; a escolha acontece somente depois dos três.` : 'Escolha agora: manter envia para a fila de entrega; vender devolve parte dos Créditos 51.';
  if (finalChoices && choicesBox) { choicesBox.innerHTML = reward.choices.map((choice) => { const choiceSpec = cobblemonDeliverySpecLabel(choice); return `<button type="button" data-cobblemon-choice="${escapeHtml(choice.entryId || choice.choiceKey || choice.id)}" aria-pressed="false"><img src="${escapeHtml(choice.sprite || COBBLEMON_ITEM_SPRITES.poke)}" alt=""><strong>${escapeHtml(choice.name)}</strong><small>${escapeHtml(choice.rarity || 'Pokémon')}${choiceSpec ? ` · ${escapeHtml(choiceSpec.replace('Entrega Cobblemon: ', ''))}` : ''}</small><b class="cobblemon-choice-selected">Selecionado</b></button>`; }).join(''); choicesBox.classList.remove('hidden'); keepButton.classList.remove('hidden'); keepButton.textContent = weeklyChoice ? 'Enviar escolhido ao Davi' : 'Escolher Pokémon do dia'; keepButton.disabled = true; }
  sellButton.textContent = `Vender agora por ${formatCredits(reward.sellPrice || 0)} créditos`; decision.classList.remove('hidden');
  return await new Promise((resolve) => {
    const decide = async (action, button, choiceId) => { button.disabled = true; try { const data = await api('/api/cobblemon/reward/decision',{method:'POST',body:{id:reward.id,action, ...(choiceId ? { choiceId } : {})}}); if(action==='sell') showToast(`${reward.name} vendido por ${formatCredits(reward.sellPrice || 0)} créditos.`); else {
      // A escolha diária existe apenas no Baú Pokémon. Um item da Roleta não
      // pode receber a mensagem de Pokémon do dia: ele já foi confirmado para
      // a entrega no servidor.
      const confirmation = premiumSale ? 'Prêmio enviado para a fila de entrega do Davi.'
        : data.nextChoice ? 'Opções semanais prontas. Você pode vender as outras antes de escolher a entrega.'
          : weeklyChoice ? `Pokémon enviado para a fila de entrega do Davi.${data.autoSold?.count ? ` ${data.autoSold.count} outra(s) opção(ões) vendida(s) por ${formatCredits(data.autoSold.total)} créditos.` : ''}`
            : finalChoices ? 'Pokémon do dia salvo para a escolha de sexta.'
              : reward.boxId === 'roulette' ? `${reward.name} enviado para a fila de entrega do Davi.`
                : 'Prêmio confirmado para a fila de entrega do Davi.';
      showToast(confirmation);
    } cobblemonOpeningLocked = false; dialog.close(); decision.classList.add('hidden'); resolve(data); if (data.profile) { appState.profile = data.profile; renderProfileEconomy(appState.profile); } } catch(error){showToast(error.message,'error');button.disabled=false;} };
    if (reward.forceDelivery || reward.noPrize) { keepButton.onclick = () => { cobblemonOpeningLocked = false; dialog.close(); decision.classList.add('hidden'); resolve({ profile: reward.profile }); }; return; }
    if (rollOnly) {
      const nextRoll = Number(reward.rollNumber || 0) < 3;
      window.setTimeout(() => {
        cobblemonOpeningLocked = false;
        dialog.close();
        decision.classList.add('hidden');
        resolve({ profile: reward.profile, autoNextRoll: nextRoll, capsuleId: reward.id });
      }, 900);
      return;
    }
    let selectedChoiceId = null;
    // Guarda a escolha também no próprio botão. Assim o clique de confirmação
    // não perde a opção já marcada caso outro efeito global de cursor rode.
    $('#keepCobblemonReward').onclick = (event) => {
      const choiceId = event.currentTarget.dataset.cobblemonChoiceId || selectedChoiceId;
      if (finalChoices && !choiceId) { showToast('Escolha um Pokémon antes de confirmar.', 'error'); return; }
      return finalChoices ? decide('choose', event.currentTarget, choiceId) : decide('keep',event.currentTarget);
    };
    $('#sellCobblemonReward').onclick = (event) => decide('sell',event.currentTarget);
    choicesBox?.querySelectorAll('[data-cobblemon-choice]').forEach((button) => { button.onclick = () => { selectedChoiceId = button.dataset.cobblemonChoice; keepButton.dataset.cobblemonChoiceId = selectedChoiceId; choicesBox.querySelectorAll('[data-cobblemon-choice]').forEach((item) => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); }); keepButton.disabled = false; keepButton.removeAttribute('aria-disabled'); }; });
  });
}

function cobblemonTierLabel(tier) {
  return ({ 1: 'comum', 2: 'incomum', 3: 'raro', 4: 'lendário' })[Number(tier)] || 'selvagem';
}

function cobblemonDexTier(mon = {}, entry = {}) {
  const tags = String(mon.l || '');
  if (/legendary|mythical/.test(tags)) return 4;
  if (/powerhouse|ultra_beast|paradox/.test(tags)) return 3;
  if (/starter|fossil|baby/.test(tags)) return 2;
  const savedTier = Number(entry?.tier || 0);
  if (savedTier >= 1 && savedTier <= 4) return savedTier;
  return 1;
}

function syncCobblemonSelectedBall(balls = {}) {
  const inventory = balls.special || {};
  const quantityFor = (ballType) => ballType === 'poke' ? Number(balls.remaining || 0) : Number(inventory[ballType]?.quantity || 0);
  if (quantityFor(cobblemonSelectedBall) < 1) {
    const fallback = quantityFor('poke') > 0
      ? 'poke'
      : Object.keys(COBBLEMON_CAPTURE_BALLS).find((ballType) => quantityFor(ballType) > 0) || 'poke';
    cobblemonSelectedBall = fallback;
  }
  const ball = COBBLEMON_CAPTURE_BALLS[cobblemonSelectedBall] || COBBLEMON_CAPTURE_BALLS.poke;
  const element = $('#cobblemonPageBall');
  if (element) {
    const image = element.querySelector('img');
    if (image) { image.src = ball.sprite; image.alt = ball.name; }
    element.classList.toggle('selected', Boolean(cobblemonPageEncounter && !cobblemonPageCaptureBusy));
    element.setAttribute('aria-label', `Segure, mire e solte a ${ball.name}`);
  }
  return ball;
}

function cobblemonHasAvailableBall(balls = {}) {
  if (Number(balls.remaining || 0) > 0) return true;
  return Object.values(balls.special || {}).some((entry) => Number(entry?.quantity || 0) > 0);
}

// Alguns navegadores embutidos (incluindo o ambiente local de validação) não
// expõem window.confirm. As ações Cobblemon não podem ficar mudas nesse caso:
// usamos uma confirmação em dois cliques no próprio botão, preservando a
// confirmação nativa nos navegadores que a oferecem.
function confirmCobblemonAction(message, button) {
  if (typeof window.confirm === 'function') return window.confirm(message);
  if (button?.dataset.confirming === 'true') {
    delete button.dataset.confirming;
    button.innerHTML = button.dataset.confirmOriginalHtml || 'Comprar';
    delete button.dataset.confirmOriginalHtml;
    return true;
  }
  if (button) {
    button.dataset.confirmOriginalHtml = button.innerHTML;
    button.dataset.confirming = 'true';
    button.textContent = 'Confirmar compra';
    window.setTimeout(() => {
      if (!button.isConnected || button.dataset.confirming !== 'true') return;
      delete button.dataset.confirming;
      button.innerHTML = button.dataset.confirmOriginalHtml || 'Comprar';
      delete button.dataset.confirmOriginalHtml;
    }, 6000);
  }
  showToast('Clique novamente em “Confirmar compra” para concluir.', 'info');
  return false;
}

function renderCobblemonBallOptions(balls = {}, encounter = cobblemonPageEncounter) {
  const container = $('#cobblemonBallOptions'); if (!container) return;
  const inventory = balls.special || {};
  // A caçada só libera a escolha quando o Pokémon está na página atual. O
  // encontro já existe no servidor antes disso, mas a bola não deve ser
  // escolhida antecipadamente (o jogador decide ao encontrar o alvo).
  const encounterTarget = $('#cobblemonEncounterTarget');
  const encounterVisible = Boolean(encounterTarget && !encounterTarget.classList.contains('sector-hidden') && !encounterTarget.classList.contains('hidden'));
  const encounterReady = Boolean(encounter?.encounterToken && encounter?.captureChances && encounterVisible);
  syncCobblemonSelectedBall(balls);
  container.innerHTML = Object.values(COBBLEMON_CAPTURE_BALLS).map((ball) => {
    const quantity = ball.id === 'poke' ? Number(balls.remaining || 0) : Number(inventory[ball.id]?.quantity || 0);
    const selected = encounterReady && cobblemonSelectedBall === ball.id;
    const stockLabel = ball.id === 'poke' ? `${quantity} disponíveis hoje` : `${quantity} no inventário`;
    // Fora de uma caçada, este bloco é apenas inventário/compra. A escolha
    // acontece somente no painel flutuante que acompanha o Pokémon encontrado;
    // assim ninguém precisa voltar à Pokédex para selecionar a bola.
    const actionLabel = !encounterReady ? (quantity > 0 ? 'Disponível na caça' : 'Sem estoque') : selected ? 'Selecionada' : quantity > 0 ? 'Usar esta bola' : 'Comprar para usar';
    const chance = Number(encounter?.captureChances?.[ball.id]);
    const chanceLabel = Number.isFinite(chance) ? `<small class="cobblemon-ball-chance">Chance de captura: <b>${chance}%</b></small>` : '<small class="cobblemon-ball-note">Encontre um Pokémon para ver a chance.</small>';
    const emptyNote = quantity < 1 ? '<small class="cobblemon-ball-note">Sem estoque. Escolha a quantidade abaixo para comprar.</small>' : ball.id === 'poke' ? '<small class="cobblemon-ball-note">5 gratuitas por dia. As extras valem somente para a caça de hoje.</small>' : '';
    const unitPrice = ball.id === 'poke' ? Number(balls.unitPrice || 8.99) : Number(ball.price);
    const savedQuantity = Math.max(1, Math.min(20, Math.floor(Number(cobblemonBallPurchaseQuantities[ball.id]) || 1)));
    cobblemonBallPurchaseQuantities[ball.id] = savedQuantity;
    const purchase = `<div class="cobblemon-ball-purchase"><div class="cobblemon-ball-price">${shopCreditMarkup(unitPrice, 'por unidade')}</div><div class="cobblemon-ball-buy"><label class="shop-quantity-picker"><span>Quantidade</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="${savedQuantity}" data-cobblemon-ball-quantity="${ball.id}" aria-label="Quantidade de ${escapeHtml(ball.name)}" title="Digite uma quantidade de 1 a 20"></label><button type="button" class="button button-primary" data-cobblemon-ball-buy="${ball.id}">Comprar</button></div></div>`;
    const selectorAttributes = encounterReady ? `data-cobblemon-ball-select="${ball.id}" aria-pressed="${selected}" aria-disabled="${quantity < 1}"` : 'aria-disabled="true"';
    return `<article class="cobblemon-ball-option${selected ? ' selected' : ''}${quantity < 1 ? ' empty' : ''}"><button type="button" class="cobblemon-ball-select" ${selectorAttributes}><img src="${ball.sprite}" alt=""><span><strong>${escapeHtml(ball.name)}</strong><small>${escapeHtml(ball.shortName)} · ${escapeHtml(stockLabel)}</small>${chanceLabel}</span><b>${actionLabel}</b></button>${emptyNote}${purchase}</article>`;
  }).join('');
}

function setCobblemonTab(tab = 'hunt') {
  const page = $('#cobblemon');
  const dexCard = $('#cobblemonDexCard');
  if (!page || !dexCard) return;
  const nextTab = tab === 'catalog' ? 'catalog' : 'hunt';
  if (nextTab === 'hunt' && appState?.me?.id) cobblemonDexOwnerId = appState.me.id;
  page.dataset.cobblemonTab = nextTab;
  dexCard.classList.toggle('catalog-view', nextTab === 'catalog');
  $$('#cobblemonTabs [data-cobblemon-tab]').forEach((button) => {
    const active = button.dataset.cobblemonTab === nextTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (nextTab === 'hunt' && appState?.profile) renderCobblemonDex(appState.profile);
}

function renderCobblemonServerManagement() {
  const panel = $('#cobblemonServerManagement'); const list = $('#cobblemonServerMembers');
  if (!panel || !list) return;
  const members = Array.isArray(appState?.cobblemonServerManagement) ? appState.cobblemonServerManagement : null;
  panel.hidden = !members;
  // Só preserva a tela enquanto alguém estiver editando um campo. Botões das
  // abas precisam poder redesenhar a lista ao receberem foco pelo clique.
  const editingMemberField = document.activeElement?.matches?.('#cobblemonServerMembers input, #cobblemonServerMembers select, #cobblemonServerMembers textarea');
  if (!members || editingMemberField) return;
  const playing = members.filter((member) => member.plays).length;
  const notPlaying = members.length - playing;
  $('#cobblemonServerManagementCount').textContent = `${playing} ${playing === 1 ? 'jogador' : 'jogadores'}`;
  $('#cobblemonServerPlayingCount').textContent = String(playing);
  $('#cobblemonServerNotPlayingCount').textContent = String(notPlaying);
  $$('#cobblemonServerRosterTabs [data-cobblemon-server-tab]').forEach((button) => {
    const selected = button.dataset.cobblemonServerTab === cobblemonServerRosterTab;
    button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected));
  });
  const visibleMembers = members.filter((member) => cobblemonServerRosterTab === 'playing' ? member.plays : !member.plays);
  list.innerHTML = visibleMembers.map((member) => {
    const payment = member.paymentStatus || 'unpaid';
    return `<article class="cobblemon-server-member" data-cobblemon-server-member="${escapeHtml(member.id)}"><div class="cobblemon-server-member-person"><b>${escapeHtml(formatDisplayName(member.displayName))}</b><small>@${escapeHtml(member.username || 'conta')}</small></div><label class="cobblemon-server-player">Nome no servidor<input name="playerName" maxlength="32" value="${escapeHtml(member.playerName || '')}" placeholder="Ex.: Player51"${member.plays ? '' : ' disabled'}></label><label class="cobblemon-server-playing"><input name="plays" type="checkbox"${member.plays ? ' checked' : ''}><span>Joga no servidor</span></label><label class="cobblemon-server-payment">Situação<select name="paymentStatus"${member.plays ? '' : ' disabled'}><option value="paid"${payment === 'paid' ? ' selected' : ''}>Pago</option><option value="unpaid"${payment === 'unpaid' ? ' selected' : ''}>Falta pagar</option><option value="exempt"${payment === 'exempt' ? ' selected' : ''}>Abonado</option></select></label><button class="button button-dark" type="button" data-cobblemon-server-save>Salvar</button></article>`;
  }).join('') || `<p class="cobblemon-server-members-empty">${cobblemonServerRosterTab === 'playing' ? 'Nenhum participante está marcado como jogador.' : 'Todos os participantes estão marcados como jogadores.'}</p>`;
}

// Atualização enxuta do controle privado: este endpoint só altera a lista de
// participantes Cobblemon, então não há motivo para reconstruir a página toda
// (nem perder rolagem/aba enquanto Davi ou a administração cadastram vários).
function applyCobblemonServerManagementState(data) {
  if (!appState || !Array.isArray(data?.cobblemonServerManagement)) {
    applyState(data);
    return;
  }
  const incomingRevision = Math.max(0, Number(data.serverRevision || 0));
  if (incomingRevision && incomingRevision < lastAppliedServerRevision) return;
  if (incomingRevision) lastAppliedServerRevision = incomingRevision;
  appState = { ...appState, cobblemonServerManagement: data.cobblemonServerManagement };
  renderCobblemonServerManagement();
  document.dispatchEvent(new CustomEvent('area51:state', { detail: appState }));
}

const COBBLEMON_COMMAND_MASTER_ITEMS = Object.freeze({
  'clear-bell': 'clear_bell', 'medallion-of-renewal': 'medallion_of_renewal', 'origin-key': 'origin_key', 'azure-flute': 'azure_flute', 'silver-wing': 'silver_wing',
  'rock-pauldron': 'rock_pauldron', 'ice-pauldron': 'ice_pauldron', 'steel-pauldron': 'steel_pauldron', 'electric-pauldron': 'electric_pauldron', 'dragon-pauldron': 'dragon_pauldron', 'titan-pauldron': 'titan_pauldron',
  'titan-hammer': 'titan_hammer', 'hero-sword': 'herosword', 'hero-shield': 'heroshield', 'iceroot-carrot': 'iceroot_carrot', 'shaderoot-carrot': 'shaderoot_carrot', 'aurora-essence-x16': 'aurora_essence',
  'galarian-urn-embers': 'galarian_urn_of_embers', 'galarian-urn-frost': 'galarian_urn_of_frost', 'galarian-urn-storms': 'galarian_urn_of_storms',
});
async function copyCobblemonDeliveryCommand(button) {
  try {
    const entry = (appState.profile?.cobblemon?.deliveries || []).find((item) => item.id === button.dataset.cobblemonCopyCommand);
    const member = (appState.cobblemonServerManagement || []).find((item) => item.id === entry?.userId);
    const species = (window.AREA51_COBBLEMON_CATALOG || []).find((item) => Number(item.i || item.id) === Number(entry?.pokemonId));
    const name = String(species?.n || species?.name || '').toLowerCase();
    const rewards = Object.fromEntries(Object.entries(COBBLEMON_COMMAND_MASTER_ITEMS).map(([id, itemId]) => [`master:${id}`, { itemId: `legendarymonuments:${itemId}`, quantity: id === 'aurora-essence-x16' ? 16 : 1 }]));
    // Legendary Monuments 8.2 stores the tablet's four charges as damage=4.
    rewards['master:reawakening-tablet-full'] = { itemId: 'legendarymonuments:tablet_of_reawakening', quantity: 1, damage: 4 };
    const durability = { unbreaking: 3, mending: 1 };
    const equipment = {
      pickaxe: { efficiency: 5, fortune: 3, ...durability }, axe: { efficiency: 5, fortune: 3, ...durability }, shovel: { efficiency: 5, fortune: 3, ...durability },
      sword: { sharpness: 5, looting: 3, fire_aspect: 2, ...durability },
      helmet: { protection: 4, respiration: 3, aqua_affinity: 1, ...durability },
      chestplate: { protection: 4, ...durability }, leggings: { protection: 4, ...durability },
      boots: { protection: 4, feather_falling: 4, depth_strider: 3, soul_speed: 3, ...durability },
    };
    for (const [item, enchantments] of Object.entries(equipment)) rewards[`master:netherite-${item}`] = { itemId: `minecraft:netherite_${item}`, quantity: 1, enchantments };
    const roulette = {
      'legendary-arc-phone': ['legendarymonuments:arc_phone', 1], 'legendary-dream-catcher': ['legendarymonuments:dream_catcher', 1],
      'legendary-light-shards': ['legendarymonuments:lightstone_shard', 3], 'legendary-dark-shards': ['legendarymonuments:darkstone_shard', 3],
      'legendary-golem-scrap': ['legendarymonuments:golem_scrap', 4], 'legendary-first-song-fragments': ['legendarymonuments:disc_of_the_first_song_fragment', 2],
      'legendary-renewal-fragment': ['legendarymonuments:medallion_of_renewal_fragment', 1], 'legendary-cosmic-catalyst': ['legendarymonuments:cosmic_bag', 1],
      'legendary-dyna-fruit': ['legendarymonuments:dyna_fruit', 1], 'legendary-icerend-seal': ['legendarymonuments:icerend_seal', 1],
      'legendary-groundblight-seal': ['legendarymonuments:groundblight_seal', 1], 'legendary-firescourge-seal': ['legendarymonuments:firescourge_seal', 1],
      'legendary-grasswither-seal': ['legendarymonuments:grasswither_seal', 1], 'legendary-sacred-ash': ['legendarymonuments:sacred_ash', 1],
      'locator-chip-roulette': ['lumymon:locator_chip', 1], 'lucky-egg-roulette': ['cobblemon:lucky_egg', 1], 'master-ball-roulette': ['cobblemon:master_ball', 1],
      'rare-candy-roulette': ['cobblemon:rare_candy', 8], 'exp-candy-l-roulette': ['cobblemon:exp_candy_l', 8], 'exp-candy-xl-roulette': ['cobblemon:exp_candy_xl', 4],
    };
    for (const [id, [itemId, quantity]] of Object.entries(roulette)) rewards[`roulette:${id}`] = { itemId, quantity };
    const stoneItemIds = Object.fromEntries(['fire', 'water', 'thunder', 'leaf', 'ice', 'sun', 'moon', 'dawn', 'dusk', 'shiny'].map((stone) => [`${stone}-stone`, `cobblemon:${stone}_stone`]));
    const catalog = { rewards, stoneItemIds, pokemonById: { [entry?.pokemonId]: { commandId: name } } };
    const { buildCobblemonDeliveryCommand } = await import('/cobblemon-delivery-command.mjs?v=20261021-cobblemon-mercado');
    const result = buildCobblemonDeliveryCommand(entry, member?.playerName, catalog);
    if (!result.command) throw new Error(result.error);
    await navigator.clipboard.writeText(result.command);
    showToast('Comando copiado. A entrega continua pendente até ser confirmada.');
  } catch (error) { showToast(error.message || 'Não foi possível copiar o comando.', 'error'); }
}
function renderCobblemonDex(profile = {}) {
  const card = $('#cobblemonDexCard'); if (!card) return;
  renderCobblemonServerManagement();
  if (!$('#cobblemon')?.dataset.cobblemonTab) setCobblemonTab('hunt');
  $('#cobblemonPageBall img').src = '/capture-ball-cobblemon.png';
  const catalog = Array.isArray(window.AREA51_COBBLEMON_CATALOG) ? window.AREA51_COBBLEMON_CATALOG : [];
  const ownEntries = Array.isArray(profile.cobblemon?.caught) ? profile.cobblemon.caught : [];
  const collections = Array.isArray(profile.cobblemon?.collections) ? profile.cobblemon.collections : [];
  const ownerSelect = $('#cobblemonDexOwner');
  const allowedOwnerIds = new Set([appState.me.id, ...collections.map((entry) => entry.id)]);
  if (!cobblemonDexOwnerId || !allowedOwnerIds.has(cobblemonDexOwnerId)) cobblemonDexOwnerId = appState.me.id;
  const selectedOwner = collections.find((entry) => entry.id === cobblemonDexOwnerId);
  const viewingMine = cobblemonDexOwnerId === appState.me.id;
  const entries = viewingMine ? ownEntries : (selectedOwner?.caught || []).map((entry) => typeof entry === 'object' ? entry : ({ id: entry }));
  const caught = new Map(entries.map((entry) => [Number(entry.id), entry]));
  ownerSelect.innerHTML = [{ id: appState.me.id, displayName: 'Minha Pokédex' }, ...collections.filter((entry) => entry.id !== appState.me.id)].map((entry) => `<option value="${escapeHtml(entry.id)}"${entry.id === cobblemonDexOwnerId ? ' selected' : ''}>${escapeHtml(entry.displayName)}</option>`).join('');
  $('#cobblemonDexTitle').textContent = viewingMine ? 'Minha Pokédex' : `Pokédex de ${selectedOwner?.displayName || 'participante'}`;
  const captureButton = $('#cobblemonCaptureButton');
  if (captureButton) {
    captureButton.classList.toggle('hidden', !viewingMine);
    const hasAvailableBall = cobblemonHasAvailableBall(profile.cobblemon?.balls);
    captureButton.title = !viewingMine
      ? 'Troque para Minha Pokédex para iniciar uma caçada.'
      : !hasAvailableBall
        ? 'Nenhuma Poké Ball disponível para a caça.'
        : 'Iniciar uma nova caçada';
    captureButton.setAttribute('aria-label', captureButton.title);
  }
  const deliveries = Array.isArray(profile.cobblemon?.deliveries) ? profile.cobblemon.deliveries : [];
  const canDeliverCobblemon = appState.me.role === 'admin' || /^davi\b/i.test(String(appState.me.displayName || ''));
  const monthlyBox = profile.cobblemon?.monthlyPokemonBox || { canPurchase: true, canOpen: false, openCount: 0, openRollCount: 0, rollsRemaining: 7, dailyRollsRemaining: 3, weeklyPurchaseCount: 0, weeklyPurchasesRemaining: 7, price: 899.90 };
  $('#cobblemonBoxShop').innerHTML = Object.entries(COBBLEMON_BOX_CATALOG).map(([id,box]) => {
    // Cada cápsula fechada traz seu próprio identificador. Nunca reutilize o
    // resumo da última compra: compras feitas em sequência precisam continuar
    // abrindo a cápsula certa, mesmo após vender ou escolher a anterior.
    const pendingCapsule = box.monthly ? (monthlyBox.pendingBoxes || []).find((entry) => Number(entry.openRollCount || 0) < 3) : null;
    const readyToOpen = box.monthly && Boolean(pendingCapsule && monthlyBox.canOpen);
    const choicePending = box.monthly && monthlyBox.choicePending;
    const locked = box.monthly && !monthlyBox.canPurchase && !readyToOpen && !choicePending;
    // Um Baú Pokémon já pago não pode ficar escondido por uma escolha semanal
    // pendente de outra abertura. Primeiro o participante conclui seus três
    // sorteios; a escolha guardada continua disponível em seguida.
    const choiceMode = choicePending && monthlyBox.choice && !readyToOpen;
    // Uma escolha de cápsula anterior precisa ser concluída antes de abrir a
    // próxima. A prioridade visual deve coincidir com o modo enviado no clique.
    const actionLabel = readyToOpen ? `Sorteio ${Number(pendingCapsule.openRollCount || 0) + 1}/3` : choiceMode ? (monthlyBox.choiceStage === 'weekly' ? 'Escolher entrega da semana' : 'Escolher 1 dos 3') : locked ? `Novo ciclo no sábado` : box.monthly ? 'Comprar Baú Pokémon' : 'Abrir agora';
    const priceLabel = choiceMode ? `<b>${monthlyBox.choice?.choices?.length || (monthlyBox.choiceStage === 'weekly' ? monthlyBox.weeklyCandidates?.length || 7 : 3)} opções</b> para escolher` : readyToOpen ? `<b>${Math.max(0, 3 - Number(pendingCapsule.openRollCount || 0))} sorteio(s)</b> restantes neste baú` : box.monthly ? shopCreditMarkup(box.price, 'por baú') : shopCreditMarkup(box.price, 'por baú');
    const deliveryNote = box.monthly ? `<small class="cobblemon-delivery-lock"><b>${Number(monthlyBox.weeklyPurchasesRemaining ?? 7)} de 7</b> baús disponíveis nesta semana · 3 sorteios por baú · o próximo baú fechado sempre aparece como “Sorteio 1/3” · ciclo reinicia no sábado.</small>` : box.forceDelivery ? '<small class="cobblemon-delivery-lock"><b>1 recompensa definida</b> por abertura · resultado e chance visíveis antes da compra · entrega pelo Davi no servidor.</small>' : '';
    const purchaseMore = box.monthly && monthlyBox.canPurchase && (readyToOpen || choiceMode) ? `<button type="button" data-cobblemon-box="${id}" data-cobblemon-box-mode="purchase">Comprar outro Baú Pokémon · ${shopCreditMarkup(box.price)}</button>` : '';
    const coverFallback = escapeHtml('/capture-ball-cobblemon.png');
    return `<article class="cobblemon-box-card ${box.accent}${box.monthly ? ' monthly-pokemon-box' : ''}${readyToOpen ? ' ready-to-open' : ''}${choiceMode ? ' choice-ready' : ''}"><span><img src="${escapeHtml(box.cover)}" alt="" onerror="this.onerror=null;this.src='${coverFallback}'"></span><div class="cobblemon-box-copy"><small>${box.monthly ? 'CICLO SEMANAL · SÁBADO A SEXTA · SOMENTE POKÉMON' : box.accent === 'legendary' ? 'EXCEPCIONAL' : box.accent === 'rare' ? 'AVANÇADO' : 'BÁSICO'}</small><strong>${escapeHtml(box.name)}</strong><div class="cobblemon-box-price">${priceLabel}</div>${deliveryNote}</div><div class="cobblemon-box-actions"><button type="button" data-cobblemon-box-odds="${id}">Ver chances</button><button type="button" data-cobblemon-box="${id}" data-cobblemon-box-mode="${readyToOpen ? 'open' : choiceMode ? 'choice' : box.monthly ? 'purchase' : 'open'}"${readyToOpen ? ` data-cobblemon-box-inventory="${escapeHtml(pendingCapsule.id)}"` : choiceMode ? ` data-cobblemon-box-inventory="${escapeHtml(monthlyBox.choice.id)}"` : ''}${locked ? ' disabled' : ''}>${escapeHtml(actionLabel)}</button>${purchaseMore}</div></article>`;
  }).join('');
  const weeklyCandidates = Array.isArray(monthlyBox.weeklyCandidates) ? monthlyBox.weeklyCandidates : [];
  const resultCards = weeklyCandidates.map((entry) => { const rarity = String(entry.rarity || 'common').toLowerCase(); const sellAmount = rarity === 'legendary' ? 500 : rarity === 'shiny' ? 400 : rarity === 'rare' ? 450 : 300; const sellButton = entry.deliveryLocked ? '' : `<button type="button" class="button button-dark cobblemon-candidate-sell" data-cobblemon-candidate-sell="${escapeHtml(entry.entryId || entry.id)}" data-cobblemon-candidate-price="${sellAmount}">Vender por: ${sellAmount} coins</button>`; const deliverySpec = cobblemonDeliverySpecLabel(entry); return `<article class="cobblemon-capsule-result"><img src="${escapeHtml(entry.sprite || COBBLEMON_ITEM_SPRITES.poke)}" alt=""><div><strong>${escapeHtml(entry.name || 'Pokémon')}</strong><small>${escapeHtml(entry.rarity || 'Pokémon')} · aguardando escolha da semana${deliverySpec ? ` · ${escapeHtml(deliverySpec.replace('Entrega Cobblemon: ', ''))}` : ''}</small><button type="button" class="button button-dark cobblemon-weekly-choice" data-cobblemon-weekly-choice="${escapeHtml(entry.entryId || entry.id)}">Escolher para entrega</button>${sellButton}</div></article>`; }).join('');
  const resultAction = monthlyBox.weeklyChoicePending && monthlyBox.choice ? `<button class="button button-primary" data-cobblemon-box="pokemon" data-cobblemon-box-mode="choice" data-cobblemon-box-inventory="${escapeHtml(monthlyBox.choice.id)}">Escolher Pokémon para o Davi</button>` : '';
  $('#cobblemonCapsuleResults').innerHTML = resultCards ? `<div class="cobblemon-capsule-result-grid">${resultCards}</div><p class="cobblemon-capsule-result-note">${monthlyBox.weeklyChoicePending ? 'As sete vagas foram preenchidas: escolha um deles para a entrega de sexta. Ao confirmar, as outras opções serão vendidas e creditadas automaticamente.' : 'Suas opções ficam guardadas até você preencher as sete vagas ou até o fechamento automático de sábado. Ao escolher uma, as demais serão vendidas e creditadas automaticamente.'}</p>${resultAction}` : '<p class="cobblemon-delivery-empty">Nenhum Pokémon escolhido neste ciclo. Abra um Baú Pokémon para começar.</p>';
  $('#cobblemonCapsuleResultCount').textContent = `${weeklyCandidates.length} selecionado${weeklyCandidates.length === 1 ? '' : 's'}`;
  $('#cobblemonCapsuleResultHelp').textContent = monthlyBox.weeklyChoicePending ? 'Escolha um Pokémon desta lista para ficar aguardando o envio do Davi na sexta.' : 'A cada Baú Pokémon, faça os 3 sorteios e escolha 1 Pokémon. As vagas restantes seguem abertas; o que sobrar é fechado automaticamente no sábado.';
  const visibleDeliveries = deliveries.filter((entry) => !['sold', 'box-closed', 'box-open', 'choice-pending', 'cycle-candidate', 'weekly-choice-pending', 'cycle-discarded', 'cycle-expired', 'reset-refunded', 'delivered'].includes(entry.status));
  const deliveryGroups = new Map();
  visibleDeliveries.forEach((entry) => {
    const playerName = entry.userName || appState.me.displayName;
    const playerKey = entry.userId || playerName;
    if (!deliveryGroups.has(playerKey)) deliveryGroups.set(playerKey, { playerName, entries: [] });
    deliveryGroups.get(playerKey).entries.push(entry);
  });
  if (cobblemonOpenDeliveryGroups === null) cobblemonOpenDeliveryGroups = new Set([...deliveryGroups.keys()].slice(0, 1));
  else cobblemonOpenDeliveryGroups = new Set([...cobblemonOpenDeliveryGroups].filter((key) => deliveryGroups.has(key)));
  $('#cobblemonRewards').innerHTML = [...deliveryGroups.entries()].map(([groupKey, group]) => {
    const pending = group.entries.filter((entry) => entry.status === 'awaiting-delivery').length;
    const rows = group.entries.map((entry) => { const deliverySpec = cobblemonDeliverySpecLabel(entry); const source = entry.levelSource === 'cobbledex-minimum' ? 'mínimo do CobbleDex' : 'nível de entrega'; const pendingText = entry.premiumSaleEligible ? 'Decisão pendente · retome após sair ou atualizar a página' : 'Escolha: vender ou receber no servidor'; return `<article class="cobblemon-reward-row">${cobblemonDeliverySpriteMarkup(entry)}<p><strong>${escapeHtml(entry.name)}</strong><small>${entry.status === 'decision-pending' ? pendingText : entry.status === 'awaiting-delivery' ? 'Aguardando entrega do Davi' : entry.status === 'claimed-no-delivery' ? 'Escolhido · sem nova entrega (Pokémon já entregue)' : entry.status === 'replaced' ? 'Substituído por uma nova escolha' : 'Entregue'}</small>${deliverySpec ? `<small class="cobblemon-delivery-spec">${escapeHtml(deliverySpec)} · ${source}</small>` : ''}</p>${entry.status === 'decision-pending' ? `<button data-cobblemon-decision="keep" data-id="${escapeHtml(entry.id)}">Receber no servidor</button><button data-cobblemon-decision="sell" data-id="${escapeHtml(entry.id)}" data-cobblemon-decision-price="${Number(entry.sellPrice || 0)}">Vender por ${formatCredits(entry.sellPrice || 0)}</button>` : canDeliverCobblemon && entry.status === 'awaiting-delivery' ? `<button data-cobblemon-delivered="${escapeHtml(entry.id)}">Marcar entregue</button>` : ''}</article>`; }).join('');
    const expanded = cobblemonOpenDeliveryGroups.has(groupKey);
    return `<details class="cobblemon-delivery-group" data-cobblemon-delivery-group="${escapeHtml(groupKey)}"${expanded ? ' open' : ''}><summary aria-expanded="${expanded}"><span>👤</span><strong>${escapeHtml(group.playerName)}</strong><small>${group.entries.length} ${group.entries.length === 1 ? 'item' : 'itens'}${pending ? ` · ${pending} ${pending === 1 ? 'pendente' : 'pendentes'}` : ''}</small></summary><div>${rows}</div></details>`;
  }).join('');
  if (canDeliverCobblemon) $('#cobblemonRewards').querySelectorAll('[data-cobblemon-delivered]').forEach((deliveredButton) => {
    const copy = document.createElement('button');
    copy.type = 'button'; copy.textContent = 'Copiar comando';
    copy.dataset.cobblemonCopyCommand = deliveredButton.dataset.cobblemonDelivered;
    deliveredButton.before(copy);
  });
  const deliveredHistory = deliveries.filter((entry) => entry.status === 'delivered').sort((a, b) => Date.parse(b.deliveredAt || b.createdAt || 0) - Date.parse(a.deliveredAt || a.createdAt || 0));
  const history = $('#cobblemonDeliveryHistory');
  if (history) {
    const historyOpen = Boolean(history.querySelector('details')?.open);
    const historyRows = deliveredHistory.map((entry) => {
      const deliveredDate = entry.deliveredAt ? new Date(entry.deliveredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'data não registrada';
      const recipient = canDeliverCobblemon ? ` · ${escapeHtml(entry.userName || 'participante')}` : '';
      const by = entry.deliveredBy ? ` por ${escapeHtml(entry.deliveredBy)}` : '';
      const spec = cobblemonDeliverySpecLabel(entry);
      return `<article class="cobblemon-delivery-history-row">${cobblemonDeliverySpriteMarkup(entry)}<p><strong>${escapeHtml(entry.name || 'Recompensa Cobblemon')}</strong><small>Entregue em ${escapeHtml(deliveredDate)}${by}${recipient}</small>${spec ? `<small class="cobblemon-delivery-spec">${escapeHtml(spec)}</small>` : ''}</p><b>✓ Entregue</b></article>`;
    }).join('');
    history.innerHTML = `<details class="cobblemon-delivery-group cobblemon-delivery-history-group"${historyOpen ? ' open' : ''}><summary aria-expanded="${historyOpen}"><span>📦</span><strong>Histórico de entregas</strong><small>${deliveredHistory.length} concluída${deliveredHistory.length === 1 ? '' : 's'}</small></summary><div>${historyRows || '<p class="cobblemon-delivery-history-empty">Nenhuma entrega concluída ainda.</p>'}</div></details>`;
  }
  const pendingDeliveries = deliveries.filter((entry) => entry.status === 'awaiting-delivery');
  $('#cobblemonDeliveryKicker').textContent = canDeliverCobblemon ? 'PAINEL DE ENTREGA · TODA A EQUIPE' : 'MEUS PEDIDOS';
  $('#cobblemonDeliveryHelp').textContent = canDeliverCobblemon ? 'Davi e administradores podem confirmar aqui a entrega dos itens mantidos por qualquer participante.' : 'Acompanhe aqui os itens que você decidiu manter e aguarde a confirmação do Davi.';
  $('#cobblemonDeliveryCount').textContent = `${pendingDeliveries.length} ${pendingDeliveries.length === 1 ? 'pendente' : 'pendentes'} · ${deliveredHistory.length} entregues`;
  if (!visibleDeliveries.length) $('#cobblemonRewards').innerHTML = '<p class="cobblemon-delivery-empty">Nenhuma recompensa aguardando decisão ou entrega.</p>';
  const roulette = profile.cobblemon?.roulette || {}; const rouletteButton = $('#cobblemonRouletteSpin');
  $('#cobblemonRouletteCard .cobblemon-roulette-copy>small').textContent = 'CICLO SEMANAL · 7 GIROS · SÁBADO A SEXTA';
  const rouletteWheel = $('#cobblemonRouletteWheel');
  renderCobblemonRouletteWheel(rouletteWheel);
  const roulettePrice = Number(roulette.price || 259.90);
  const roulettePriceMarkup = shopCreditMarkup(roulettePrice, 'por giro');
  const roulettePriceElement = $('#cobblemonRoulettePrice');
  if (roulettePriceElement) roulettePriceElement.innerHTML = roulettePriceMarkup;
  rouletteButton.disabled = !roulette.canSpin; rouletteButton.classList.toggle('cycle-closed', !roulette.canSpin); rouletteButton.innerHTML = roulette.canSpin ? `Comprar e girar · ${roulettePriceMarkup}` : '<span aria-hidden="true">◷</span> Ciclo encerrado';
  const rouletteStatus = roulette.canSpin ? `✓ ${Number(roulette.spinsRemaining || 0)} de 7 giros disponíveis neste ciclo` : `Novo ciclo: ${new Date(roulette.nextCycleAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}`;
  rouletteButton.title = roulette.canSpin ? `Girar a Roleta Cobblemon por ${formatCredits(roulettePrice)} Créditos 51` : rouletteStatus;
  rouletteButton.setAttribute('aria-label', rouletteButton.title);
  const rouletteStatusElement = $('#cobblemonRouletteStatus');
  rouletteStatusElement.classList.toggle('is-closed', !roulette.canSpin);
  rouletteStatusElement.textContent = rouletteStatus;
  const search = ($('#cobblemonDexSearch')?.value || '').trim().toLowerCase();
  const filterCounts = { all: 0, caught: 0, rare: 0, legendary: 0, shiny: 0, locked: 0 };
  const visible = catalog.filter((mon) => {
    if (search && !mon.n.toLowerCase().includes(search) && String(mon.i) !== search && !mon.t.toLowerCase().includes(search)) return false;
    const ownedEntry = caught.get(Number(mon.i));
    const owned = Boolean(ownedEntry);
    const tier = cobblemonDexTier(mon, ownedEntry);
    filterCounts.all += 1;
    filterCounts[owned ? 'caught' : 'locked'] += 1;
    if (owned && tier === 3) filterCounts.rare += 1;
    if (owned && tier === 4) filterCounts.legendary += 1;
    if (owned && ownedEntry?.isShiny) filterCounts.shiny += 1;
    const matchesFilter = cobblemonDexFilter === 'caught' ? owned
      : cobblemonDexFilter === 'locked' ? !owned
        : cobblemonDexFilter === 'rare' ? owned && tier === 3
          : cobblemonDexFilter === 'legendary' ? owned && tier === 4
            : cobblemonDexFilter === 'shiny' ? owned && Boolean(ownedEntry?.isShiny)
              : true;
    return matchesFilter;
  });
  const pageSize = 24, pages = Math.max(1, Math.ceil(visible.length / pageSize)); cobblemonDexPage = Math.min(cobblemonDexPage, pages - 1);
  $('#cobblemonDexProgress').textContent = caught.size + ' / ' + (profile.cobblemon?.total || catalog.length);
  const balls = profile.cobblemon?.balls || { remaining: 5, total: 5, canBuy: true, unitPrice: 8.99, maxPurchase: 20, special: {} };
  $('#cobblemonBallCount').textContent = `${Number(balls.remaining)} / ${Number(balls.total)} Poké Balls`;
  const ballWalletNote = $('#cobblemonBallCount')?.parentElement?.querySelector('small');
  if (ballWalletNote) ballWalletNote.textContent = 'Restauração diária: 5 Poké Balls + 1 Great Ball + 1 Ultra Ball';
  renderCobblemonBallOptions(balls, cobblemonPageEncounter);
  const captureBonus = profile.cobblemon?.captureBonus || { totalCaught: caught.size, rewards: { rare: 15, legendary: 100, shiny: 60 }, milestones: [] };
  let bonusPanel = $('#cobblemonCaptureBonuses');
  if (!bonusPanel) {
    bonusPanel = document.createElement('section');
    bonusPanel.id = 'cobblemonCaptureBonuses';
    bonusPanel.className = 'cobblemon-capture-bonuses';
  }
  // As bolas são movidas para um painel flutuante durante a caçada. Nunca
  // use esse elemento móvel como âncora: o bônus deve permanecer no card da
  // Pokédex, antes da ajuda fixa, mesmo após visitar a tela Cobblemon.
  const bonusAnchor = card.querySelector('.cobblemon-ball-help');
  if (bonusAnchor) bonusAnchor.before(bonusPanel);
  const milestoneMarkup = (captureBonus.milestones || []).map((entry) => `<li class="${entry.claimed ? 'claimed' : ''}"><b>${entry.claimed ? '✓' : `${Math.min(Number(captureBonus.totalCaught || 0), Number(entry.target))}/${Number(entry.target)}`}</b><span>${Number(entry.target)} Pokémon</span><em>+${formatCredits(entry.reward)}</em></li>`).join('');
  bonusPanel.innerHTML = `<header><span>RECOMPENSAS DE CAPTURA</span><strong>${Number(captureBonus.totalCaught || 0)} Pokémon na Pokédex</strong></header><p>Créditos são liberados uma única vez pelo servidor ao registrar uma descoberta.</p><div class="cobblemon-capture-bonus-rules"><span>Raro novo <b>+${formatCredits(captureBonus.rewards?.rare || 15)}</b></span><span>Lendário novo <b>+${formatCredits(captureBonus.rewards?.legendary || 100)}</b></span><span>Shiny novo <b>+${formatCredits(captureBonus.rewards?.shiny || 60)}</b></span></div>${milestoneMarkup ? `<ol class="cobblemon-capture-milestones">${milestoneMarkup}</ol>` : ''}`;
  const buyBallsButton = $('#cobblemonBuyBalls');
  if (buyBallsButton) { buyBallsButton.disabled = true; buyBallsButton.textContent = 'Compra disponível no card da Poké Ball'; }
  if (!cobblemonPageEncounter) $('#cobblemonCaptureButton').disabled = !viewingMine || !cobblemonHasAvailableBall(balls);
  $('#cobblemonDexPage').textContent = 'Página ' + (cobblemonDexPage + 1) + ' de ' + pages;
  $('#cobblemonDexPrev').disabled = cobblemonDexPage === 0; $('#cobblemonDexNext').disabled = cobblemonDexPage >= pages - 1;
  const filterLabels = { all: 'Todos', caught: 'Capturados', rare: 'Raros', legendary: 'Lendários', shiny: 'Shiny', locked: 'Bloqueados' };
  $$('#cobblemonDexFilters [data-cobblemon-filter]').forEach((button) => {
    const filter = button.dataset.cobblemonFilter;
    button.classList.toggle('active', filter === cobblemonDexFilter);
    button.textContent = `${filterLabels[filter]} (${filterCounts[filter]})`;
  });
  const dexGridKey = [cobblemonDexOwnerId, cobblemonDexFilter, search, cobblemonDexPage, visible.map((mon) => { const owned = caught.get(Number(mon.i)); return `${mon.i}:${owned?.level || 0}:${owned?.isShiny ? 1 : 0}:${cobblemonDexTier(mon, owned)}`; }).join(',')].join('|');
  if (dexGridKey !== cobblemonDexGridKey) {
    cobblemonDexGridKey = dexGridKey;
    $('#cobblemonDexGrid').innerHTML = visible.length ? visible.slice(cobblemonDexPage * pageSize, (cobblemonDexPage + 1) * pageSize).map((mon) => { const owned = caught.get(Number(mon.i)); const level = Number(owned?.level || 0); const tier = cobblemonDexTier(mon, owned); const pokemon = { id: mon.i, name: mon.n, isShiny: Boolean(owned?.isShiny) }; return `<article id="cobblemonDexPokemon-${Number(mon.i)}" class="cobblemon-dex-mon tier-${tier}${owned ? '' : ' locked'}${pokemon.isShiny ? ' shiny' : ''}">${owned ? cobblemonSpriteMarkup(pokemon, 'small', `loading="lazy" decoding="async" fetchpriority="low" width="52" height="52" alt="${escapeHtml(mon.n)}"`) : `<img loading="lazy" decoding="async" fetchpriority="low" width="52" height="52" src="${cobblemonPreviewSprite(mon.i, 'small')}" alt="Silhueta">`}<p><b>${String(mon.i).padStart(4,'0')} · ${owned ? escapeHtml(mon.n) : '???'}</b><small>${owned ? `${escapeHtml(mon.t)} · ${cobblemonTierLabel(tier)}` : 'Ainda não encontrado'}</small></p><em>${owned ? (pokemon.isShiny ? '✨ shiny' : level ? 'nível ' + level : 'capturado') : '?'}</em></article>`; }).join('') : '<p class="cobblemon-dex-empty">Nenhum Pokémon corresponde a este filtro.</p>';
  }
}

function mountCobblemonHuntBallPanel() {
  const options = $('#cobblemonBallOptions');
  if (!options) return;
  // O painel flutuante da caçada contém exclusivamente as bolas. As
  // recompensas da Pokédex pertencem ao catálogo e nunca devem acompanhar o
  // jogador para outra página enquanto ele procura o Pokémon.
  $('#cobblemonCaptureBonuses')?.remove();
  let panel = $('#cobblemonHuntBallPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'cobblemonHuntBallPanel';
    panel.className = 'cobblemon-hunt-ball-panel';
    panel.setAttribute('aria-label', 'Escolha a Poké Ball da captura');
    panel.innerHTML = '<strong>Encontre o Pokémon para escolher a bola</strong><small>As chances aparecem quando você abrir a página onde ele está escondido.</small>';
    document.body.append(panel);
  }
  if (options.parentElement !== panel) panel.append(options);
  panel.classList.add('is-visible');
  syncCobblemonHuntBallPosition();
}

function syncCobblemonHuntBallPosition() {
  const panel = $('#cobblemonHuntBallPanel');
  if (!panel) return;
  document.documentElement.style.setProperty('--cobblemon-hunt-panel-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`);
}

function restoreCobblemonBallPanel() {
  const options = $('#cobblemonBallOptions');
  const dexCard = $('#cobblemonDexCard');
  const help = dexCard?.querySelector('.cobblemon-ball-help');
  if (options && help && options.parentElement !== dexCard) help.before(options);
  $('#cobblemonHuntBallPanel')?.remove();
}

function setCobblemonDexFilter(filter = 'all') {
  const nextFilter = ['all', 'caught', 'rare', 'legendary', 'shiny', 'locked'].includes(filter) ? filter : 'all';
  cobblemonDexFilter = nextFilter;
  cobblemonDexPage = 0;
  $$('#cobblemonDexFilters [data-cobblemon-filter]').forEach((button) => {
    const active = button.dataset.cobblemonFilter === nextFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (appState?.profile) renderCobblemonDex(appState.profile);
}

// Os controles da Pokédex ficam no próprio card. Isso evita que temas,
// cursores ou outros listeners globais impeçam a troca de página/filtro.
$('#cobblemonDexCard')?.addEventListener('click', (event) => {
  const pager = event.target?.closest?.('#cobblemonDexPrev, #cobblemonDexNext');
  if (pager) {
    event.preventDefault();
    if (pager.disabled) return;
    cobblemonDexPage += pager.id.endsWith('Next') ? 1 : -1;
    renderCobblemonDex(appState.profile);
    return;
  }
  const filter = event.target?.closest?.('#cobblemonDexFilters [data-cobblemon-filter]');
  if (filter) {
    event.preventDefault();
    setCobblemonDexFilter(filter.dataset.cobblemonFilter);
  }
});

function renderProfileEconomy(profile = {}, globalOnly = false) {
  if(typeof renderNextCardSeasonShopPreview==='function')renderNextCardSeasonShopPreview();
  const profilePage = currentPortalPage();
  // applyState() chama esta função em modo global para atualizar apenas o
  // cabeçalho. A página ativa é renderizada uma vez por
  // renderActivePortalPage(), evitando reconstruir Perfil/Loja duas vezes.
  if (!globalOnly) {
    if (profilePage === 'cobblemon') renderCobblemonDex(profile);
    if (profilePage === 'perfil') renderVisualTrading(appState.trading || {});
    if (profilePage === 'album') renderCardAlbum(appState.cardAlbum);
  }
  syncCobblemonHuntLauncher();
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
  const forcedDevDarkness = Boolean(profile.forcedCursor && profile.forcedCursor.style === 'dev-dark');
  const forcedCleaningCurse = Boolean(profile.forcedCursor && profile.forcedCursor.style === 'cleaning');
  // Uma maldição sempre toma o controle integral do cursor. Não deixamos a
  // skin equipada competir visualmente com o cursor da punição.
  const forcedCursorActive = Boolean(profile.forcedCursor && profile.forcedCursor.style !== 'hater');
  const deadlineShameForced = Boolean(profile.wallpaperDeadlinePenalty);
  if (new URLSearchParams(location.search).get('tdah') === '1') sessionStorage.setItem('tdahPreview','1');
  const forcedAdhdCursor = Boolean(profile.forcedCursor && profile.forcedCursor.style === 'adhd') || sessionStorage.getItem('tdahPreview') === '1';
  syncNewCurses(profile.forcedCursor);
  syncHaterCurse(profile.haterCurse);
  syncGivaldoCurse(profile.givaldoCurse);
  clearTimeout(forcedCursorExpiryTimer);
  if (profile.forcedCursor && profile.forcedCursor?.expiresAt) {
    const delay = Date.parse(profile.forcedCursor.expiresAt) - Date.now();
    if (Number.isFinite(delay) && delay > 0) forcedCursorExpiryTimer = setTimeout(() => {
      api('/api/state').then(applyState).catch(() => {});
    }, delay + 400);
  }
  const liveTitles = Array.isArray(profile.liveTitles) ? profile.liveTitles : [];
  const allowPersonalTheme = appState.visualTheme === 'user-choice' && !profile.loan?.overdue && !deadlineShameForced;
  document.documentElement.classList.toggle('debt-cursor', Boolean(profile.forcedCursor?.debt));
  applyPersonalTheme(allowPersonalTheme ? siteThemeItem?.value : null);
  const personalCursor = forcedCursorActive || deadlineShameForced ? null : cursorItem;
  document.body.dataset.trailStyle = personalCursor?.value === 'maradona' ? 'white' : personalCursor?.value === 'halloween-mask' ? 'halloween-blood' : (trailItem ? trailItem.value : (['laser', 'rocket', 'alien'].includes(personalCursor?.value) ? personalCursor.value : 'none'));
  document.body.dataset.cursorEffect = deadlineShameForced ? 'deadline-shame' : forcedGiantCursor ? 'giant-slow' : forcedDevDarkness ? 'dev-dark' : forcedCleaningCurse ? 'cleaning' : forcedAdhdCursor ? 'adhd' : (forcedGayCursor || personalCursor?.value === 'gay') ? 'gay' : ['cyber-cyan', 'cyber-amber', 'blackstar-cyan', 'blackstar-gold', 'blackstar-crimson', 'lideranca', 'galinha-preta', 'volei', 'biblia', 'papa-bento', 'scrum-master', 'energetico', 'pirokinha-cosmica', 'petista', 'bolsonaro', 'umbanda', 'messi', 'cristiano', 'pele', 'maradona', 'neymar'].includes(personalCursor?.value) ? personalCursor.value : '';
  if (forcedCursorActive) $$('.cursor-linked-effect').forEach((particle) => particle.remove());
  document.documentElement.classList.toggle('unicorn-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'unicorn'));
  document.documentElement.classList.toggle('lideranca-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'lideranca'));
  document.documentElement.classList.toggle('horn-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'horn'));
  document.documentElement.classList.toggle('medicine-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'dipirona'));
  document.documentElement.classList.toggle('pirokinha-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'pirokinha-cosmica'));
  document.documentElement.classList.toggle('anvisa-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'anvisa'));
  document.documentElement.classList.toggle('commander-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'commander'));
  document.documentElement.classList.toggle('commander-halloween-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'commander-halloween'));
  document.documentElement.classList.toggle('black-hen-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'galinha-preta'));
  document.documentElement.classList.toggle('volleyball-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'volei'));
  document.documentElement.classList.toggle('bible-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'biblia'));
  document.documentElement.classList.toggle('papa-bento-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'papa-bento'));
  document.documentElement.classList.toggle('scrum-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'scrum-master'));
  document.documentElement.classList.toggle('energy-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'energetico'));
  document.documentElement.classList.toggle('laser-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'laser'));
  document.documentElement.classList.toggle('rocket-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'rocket'));
  document.documentElement.classList.toggle('alien-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'alien'));
  document.documentElement.classList.toggle('petista-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'petista'));
  document.documentElement.classList.toggle('bolsonaro-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'bolsonaro'));
  document.documentElement.classList.toggle('umbanda-cursor-active', Boolean(!forcedCursorActive && cursorItem && cursorItem.value === 'umbanda'));
  document.documentElement.classList.toggle('gay-power-cursor-active', Boolean(forcedGayCursor || (!forcedCursorActive && cursorItem && cursorItem.value === 'gay')));
  document.documentElement.classList.toggle('giant-slow-cursor-active', forcedGiantCursor);
  document.documentElement.classList.toggle('adhd-cursor-active', forcedAdhdCursor);
  document.documentElement.classList.toggle('deadline-shame-cursor-active', deadlineShameForced);
  syncAdhdCurse(forcedAdhdCursor);
  setPreviewCursor(deadlineShameForced ? null : forcedGayCursor ? 'gay' : forcedGiantCursor ? 'giant-slow' : forcedAdhdCursor ? 'adhd' : forcedCursorActive ? null : (cursorItem?.value || null));
  document.body.classList.toggle('forced-gay-cursor-mode', forcedGayCursor);
  const cursorVisual = $('.unicorn-mouse-cursor>span');
  $('.unicorn-mouse-cursor')?.classList.toggle('adhd-mode', forcedAdhdCursor);
  const cursorSkin = forcedGiantCursor ? 'giant-slow' : forcedAdhdCursor ? 'adhd' : (cursorItem?.value || 'windows');
  if (cursorVisual && cursorVisual.dataset.skin !== cursorSkin) {
    cursorVisual.dataset.skin = cursorSkin;
    cursorVisual.innerHTML = forcedGiantCursor ? '<b class="giant-slow-pointer">☝️</b>' : forcedAdhdCursor ? '<img src="/cursor-adhd.svg" alt="Cursor Venvanse">' : cursorSkin === 'lideranca' ? '<img src="/cursor-lideranca-combo.png" alt="">' : '<img src="/unicorn-cursor-full-v2.png" alt="">';
  }
  // Tema, cursor, moldura e nome são globais e precisam ser reaplicados em
  // qualquer página. O modo global evita montar Perfil/Loja fora de tela.
  ['userName','menuUserName'].forEach((id) => {
    const element = $('#' + id);
    if (element) {
      element.className = nameItem ? 'name-style-' + nameItem.value : '';
      element.dataset.badge = badgeItem?.value || '';
    }
  });
  $('#topProfileButton').className = 'top-profile-button' + (frameItem ? ' frame-' + frameItem.value : '');
  $('.site-menu-user').className = 'site-menu-user' + (frameItem ? ' frame-' + frameItem.value : '');
  const topWalletValue = formatCredits(profile.wallet);
  const topWallet = $('#topWallet');
  if (topWallet) {
    $('#topWalletValue').textContent = topWalletValue;
    topWallet.setAttribute('aria-label', 'Saldo: ' + topWalletValue + ' Créditos 51');
  }
  // Álbum e Cobblemon já tiveram sua área específica atualizada acima. Não
  // reconstruímos Perfil e Loja enquanto essas páginas permanecem ocultas.
  if (globalOnly || profilePage === 'album' || profilePage === 'cobblemon') return;
  $('#profileWallet').textContent = formatCredits(profile.wallet);
  $('#shopPageWallet').textContent = formatCredits(profile.wallet);
  renderAvatar($('#profileAvatar'), appState.me.avatarDataUrl, initials(appState.me.displayName));
  $('#profileDisplayName').textContent = formatDisplayName(appState.me.displayName);
  // A insígnia do álbum é uma conquista, não deve substituir um emblema comprado.
  // O emblema continua no nome; a insígnia aparece junto dele na lista de visuais.
  $('#profileDisplayName').dataset.badge = badgeItem?.value || '';
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
    siteThemeItem && ['<img class="catalog-art-icon" src="/roulette51/menu-icons/inscricoes.png" alt="">', 'Tema: ' + siteThemeItem.name],
    cursorItem && [catalogIconMarkup(cursorItem), 'Cursor: ' + cursorItem.name],
    trailItem && ['<span class="catalog-trail-icon"><i></i></span>', 'Rastro: ' + trailItem.name],
    frameItem && [catalogIconMarkup(frameItem), 'Moldura: ' + frameItem.name],
    nameItem && ['<span class="catalog-name-icon">Aa</span>', 'Estilo do nome: ' + nameItem.name],
    badgeItem && [catalogIconMarkup(badgeItem) || badgeItem.value, 'Emblema: ' + badgeItem.name],
    albumBadge && [insigniaVisualMarkup({ id: 'album:' + albumBadge.id, name: albumBadge.badge, medal: albumBadge.medal }, 'active-insignia-art'), 'Insígnia: ' + albumBadge.badge],
    titleItem && [catalogIconMarkup(titleItem), 'Título: ' + titleItem.name],
    ...liveTitles.map((item) => [catalogIconMarkup(item) || item.icon, 'Título vivo: ' + item.name]),
  ].filter(Boolean);
  $('#activeVisualsList').innerHTML = activeVisuals.length
    ? activeVisuals.map(([icon, label]) => `<span>${icon === 'admin-halloween' ? '<img class="active-visual-badge" src="/roulette51/shop-icons/badges/coroa-cosmica.png" alt="">' : String(icon).includes('<') ? icon : escapeHtml(icon)} ${escapeHtml(label)}</span>`).join('')
    : '<span class="visuals-empty">Nenhuma personalização equipada</span>';
  const powers = profile.activePowers || {};
  const powerRows = [];
  const activeCurse = profile.haterCurse || profile.givaldoCurse || (profile.forcedCursor && !profile.forcedCursor.automatic && !profile.forcedCursor.debt ? profile.forcedCursor : null);
  if (activeCurse) {
    const curseLabel = activeCurse.style === 'hater' ? 'Maldição do Hater' : activeCurse.style === 'givaldo' ? 'Maldição Givaldo' : activeCurse.style === 'giant-slow' ? 'Maldição do Mouse Gigante' : activeCurse.style === 'adhd' ? 'Maldição TDAH' : activeCurse.style === 'dev-dark' ? 'Maldição do Dev' : activeCurse.style === 'cleaning' ? 'Maldição da Limpeza' : 'Seta Gay Compulsória';
    const curseDetail = activeCurse.style === 'hater' ? 'Você foi alvo: provocações aleatórias na tela por 24 horas. Origem sigilosa.' : activeCurse.style === 'givaldo' ? 'Você foi alvo: fotos e frases aparecem e somem ao longo de 24 horas, sem bloquear o site. Origem sigilosa.' : activeCurse.style === 'giant-slow' ? 'Você foi alvo: mouse gigante e lento por 24 horas. Origem sigilosa.' : activeCurse.style === 'adhd' ? 'Você foi alvo: o cursor pode se mover sozinho por cerca de 30 segundos, durante 24 horas. Origem sigilosa.' : activeCurse.style === 'dev-dark' ? 'Você foi alvo: tela escura contínua por 24 horas; só o cursor-lâmpada ilumina o caminho. Origem sigilosa.' : activeCurse.style === 'cleaning' ? 'Você foi alvo: uma nova rodada de poeira aparece a cada hora por 24 horas e precisa ser varrida. Origem sigilosa.' : 'Você foi alvo: cursor obrigatório por 24 horas. Origem sigilosa.';
    powerRows.push([activeCurse.style === 'hater' ? '🖕' : activeCurse.style === 'givaldo' ? '🎭' : activeCurse.style === 'dev-dark' ? catalogIconMarkup({ name: 'Maldição do Dev' }) : activeCurse.style === 'cleaning' ? catalogIconMarkup({ name: 'Maldição da Limpeza' }) : activeCurse.style === 'giant-slow' ? catalogIconMarkup('power-giant-slow-cursor') : activeCurse.style === 'adhd' ? catalogIconMarkup('power-adhd-cursor') : catalogIconMarkup('power-force-gay-cursor'), curseLabel + ' ativa', curseDetail + (activeCurse.sealed ? ' Antídoto bloqueado.' : ''), true]);
  }
  if (powers.forcedGay) powerRows.push([catalogIconMarkup('power-choose-gay') || '👑', 'Controle Gay da Rodada ativo', 'Escolhido: ' + powers.forcedGay, true, 'power-choose-gay']);
  if (powers.shield) powerRows.push([catalogIconMarkup('power-shield-gay') || '🛡️', 'Escudo da Rodada ativo', 'Você está protegido nesta rodada', true, 'power-shield-gay']);
  if (powers.forcedTheme) powerRows.push([catalogIconMarkup('power-theme') || '🎨', 'Tema reservado', powers.forcedTheme, true]);
  (powers.available || []).forEach((entry) => powerRows.push([catalogIconMarkup(entry) || entry.icon, entry.name, entry.detail || 'Pronto para usar.', false, null, entry.itemId]));
  $('#activePowersCard').classList.toggle('hidden', powerRows.length === 0);
  $('#activePowersList').innerHTML = powerRows.map(([icon, title, detail, active, cancelId, availableId]) => `<div class="active-power-row${active ? ' is-active' : ''}"><span>${icon}</span><p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p>${cancelId ? `<button type="button" data-cancel-power="${cancelId}">Cancelar</button>` : availableId === 'power-shield-gay' ? '<b>AGUARDE O SORTEIO</b>' : availableId ? `<button type="button" data-profile-power-use="${escapeHtml(availableId)}">Usar</button>` : '<b>ATIVO</b>'}</div>`).join('');
  const mysteryBoxes = Array.isArray(profile.mysteryBoxes) ? profile.mysteryBoxes : [];
  const mysteryRewards = Array.isArray(profile.mysteryRewards) ? profile.mysteryRewards : [];
  const physicalPrizes = profile.physicalPrizes || [];
  renderCardPacks(profile);
  $('#physicalPrizeInventory').innerHTML = physicalPrizes.map(prize => `<article class="mystery-reward-item"><span>📒</span><p><strong>${escapeHtml(prize.name)}</strong><small>Ganhador: ${escapeHtml(prize.winnerName)}. Prêmio físico único — combine a entrega com o administrador. Não pode ser vendido por créditos.</small></p></article>`).join('');
  $('#mysteryInventoryCard').classList.toggle('hidden', mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length === 0);
  $('#mysteryInventoryCount').textContent = (mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length) + ((mysteryBoxes.length + mysteryRewards.length + physicalPrizes.length) === 1 ? ' item' : ' itens');
$('#mysteryInventory').innerHTML = mysteryBoxes.map((box) => { const sourceLabel = box.source === 'casino' ? 'Ganho na Roleta 51' : String(box.source || '').startsWith('feature-gift-') ? 'Brinde das novas funcionalidades' : 'Comprado na Loja 51'; const visual = rouletteBoxIconMarkup(box) || escapeHtml(box.icon || '🎁'); return `<article class="mystery-inventory-item mystery-${escapeHtml(box.tier)}"><span class="mystery-inventory-box-icon">${visual}</span><p><strong>${escapeHtml(box.name)}</strong><small>${sourceLabel} · ${escapeHtml(formatDate(box.acquiredAt))}</small></p><div><button type="button" data-box-open="${escapeHtml(box.id)}" data-box-name="${escapeHtml(box.name)}" data-box-tier="${escapeHtml(box.tier || '')}">Abrir</button><button type="button" data-box-sell="${escapeHtml(box.id)}" data-box-name="${escapeHtml(box.name)}" data-box-price="${Number(box.sellPrice || 0)}">Vender por ${Number(box.sellPrice || 0).toLocaleString('pt-BR')}</button></div></article>`; }).join('');
  $('#mysteryRewardInventory').innerHTML = mysteryRewards.length ? '<h4>Decisão pendente</h4>' + mysteryRewards.map((reward) => `<article class="mystery-reward-item"><span>${catalogIconMarkup(reward) || escapeHtml(reward.icon || '🎁')}</span><p><strong>${escapeHtml(reward.name)}</strong><small>Você ainda não usou este prêmio.</small></p><div><button type="button" data-reward-keep="${escapeHtml(reward.purchaseId)}">Ficar</button><button type="button" data-reward-sell="${escapeHtml(reward.purchaseId)}" data-reward-name="${escapeHtml(reward.name)}" data-reward-price="${Number(reward.sellPrice || 0)}">Vender por ${Number(reward.sellPrice || 0).toLocaleString('pt-BR')}</button></div></article>`).join('') : '';
  const weeklyMissions = Array.isArray(profile.missions) && profile.missions.length ? profile.missions : [profile.mission || { progress: 0, target: 1, reward: 0 }];
  const completedWeekly = weeklyMissions.filter((item) => item.completed).length;
  $('#weeklyMissionCount').textContent = completedWeekly + ' de ' + weeklyMissions.length;
  $('#weeklyMissionList').innerHTML = weeklyMissions.map((item) => {
    const percent = Math.min(100, Math.round(Number(item.progress || 0) / Math.max(1, Number(item.target || 1)) * 100));
    const progress = item.completed ? '✓ Recompensa recebida' : item.progress + ' de ' + item.target;
    return `<article class="weekly-mission-item${item.completed ? ' completed' : ''}"><span>${weeklyMissionIconMarkup(item)}</span><div><strong>${escapeHtml(item.title || 'Missão semanal')}</strong><small>${escapeHtml(item.description || '')}</small><i><b style="width:${percent}%"></b></i><em>${escapeHtml(progress)}</em></div><mark>${item.completed ? '✓' : '+' + Number(item.reward || 0)}</mark></article>`;
  }).join('');
  $('.weekly-mission-card').classList.toggle('completed', completedWeekly === weeklyMissions.length);
  const dailyMissions = Array.isArray(profile.dailyMissions) ? profile.dailyMissions : [];
  const completedDaily = dailyMissions.filter((item) => item.completed).length;
  const dailyUnlocked = dailyMissions.some((item) => item.unlocked !== false);
  $('#dailyMissionCount').textContent = dailyUnlocked ? completedDaily + ' de ' + dailyMissions.length : 'Começa na segunda';
  $('#dailyMissionList').innerHTML = dailyMissions.map((item) => {
    const percent = Math.min(100, Math.round(Number(item.progress || 0) / Math.max(1, Number(item.target || 1)) * 100));
    const progress = item.unit === 'ml' ? Number(item.progress || 0).toLocaleString('pt-BR') + ' / ' + Number(item.target || 0).toLocaleString('pt-BR') + ' ml' : item.progress + ' de ' + item.target;
    const status = item.unlocked === false ? 'Abre no lançamento' : item.completed ? '✓ Recebido' : '+' + item.reward;
    return `<article class="daily-mission-item${item.completed ? ' completed' : ''}${item.unlocked === false ? ' locked' : ''}"><span>${weeklyMissionIconMarkup(item)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small><i><b style="width:${percent}%"></b></i><em>${escapeHtml(progress)}</em></div><mark>${status}</mark></article>`;
  }).join('');
  const cleanName = profile.cleanNameMission || {};
  $('#cleanNameMission').className = 'clean-name-mission' + (cleanName.cleanSoFar ? ' clean' : ' failed') + (cleanName.unlocked === false ? ' locked' : '');
  $('#cleanNameMission').innerHTML = `<span><img class="catalog-art-icon" src="/roulette51/shop-icons/achievements/agente-caos.png" alt=""></span><p><small>MISSÃO DE FECHAMENTO SEMANAL</small><strong>${escapeHtml(cleanName.title || 'Nome limpo')}</strong><em>${cleanName.unlocked === false ? 'Começa na segunda-feira.' : cleanName.cleanSoFar ? 'Sem mentiras confirmadas até agora.' : 'Uma mentira foi confirmada nesta semana.'}</em></p><b>+${Number(cleanName.reward || 20)}</b>`;
  const stats = profile.stats || {};
  const statItems = [
    ['<img class="catalog-art-icon" src="/roulette51/menu-icons/agua.png" alt="">', stats.hydrationDays || 0, 'metas de água'], ['<img class="catalog-art-icon" src="/roulette51/shop-icons/achievements/campeao-area-51.png" alt="">', stats.bestWins || 0, 'melhores'],
    ['<img class="catalog-art-icon" src="/roulette51/menu-icons/sorteio.png" alt="">', stats.gayWins || 0, 'sorteios especiais'], ['<img class="catalog-art-icon" src="/roulette51/menu-icons/memes.png" alt="">', stats.memes || 0, 'memes'],
    ['<img class="catalog-art-icon" src="/roulette51/menu-icons/misterio.png" alt="">', stats.phrases || 0, 'frases'], ['<img class="catalog-art-icon" src="/roulette51/menu-icons/loja.png" alt="">', stats.purchases || 0, 'itens comprados'],
  ];
  $('#profileStats').innerHTML = statItems.map(([icon, value, label]) => `<div><span>${icon}</span><strong>${Number(value).toLocaleString('pt-BR')}</strong><small>${label}</small></div>`).join('');
  const ledger = Array.isArray(profile.creditLedger) ? profile.creditLedger : [];
    $('#creditLedger').innerHTML = ledger.length ? ledger.slice(0, 12).map((item) => `<div class="credit-ledger-row"><span>${creditIconMarkup()}</span><p><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></p><b class="${Number(item.amount) >= 0 ? 'positive' : 'negative'}">${Number(item.amount) >= 0 ? '+' : ''}${formatCredits(item.amount)}</b></div>`).join('') : '<div class="credit-ledger-empty">Seu extrato começará após a primeira movimentação.</div>';
  const medals = Array.isArray(profile.medals) ? profile.medals : [];
  const unlocked = medals.filter((medal) => medal.unlocked).length;
  $('#medalCount').textContent = unlocked + ' de ' + medals.length + ' desbloqueadas';
  $('#profileMedals').innerHTML = medals.map((medal) => `<article class="profile-medal${medal.unlocked ? ' unlocked' : ' locked'}${medal.secret ? ' secret-medal' : ''}"><span>${medal.unlocked ? (achievementIconMarkup(medal) || escapeHtml(medal.icon)) : '🔒'}</span><div><strong>${medal.unlocked || !medal.secret ? escapeHtml(medal.name) : 'Sinal desconhecido'}</strong><small>${escapeHtml(medal.unlocked || !medal.secret ? medal.description : 'Conquista secreta — explore a Área 51 para revelar.')}</small></div></article>`).join('');
  renderTrophyRoom(profile);
  const gifts = profile.giftOptions || { people: [], items: [], creditGiftUnlimited: true };
  const peopleOptions = (gifts.people || []).map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(formatDisplayName(person.displayName))}</option>`).join('');
  $('#giftCreditsUser').innerHTML = peopleOptions || '<option value="">Nenhuma pessoa disponível</option>';
  $('#giftItemUser').innerHTML = peopleOptions || '<option value="">Nenhuma pessoa disponível</option>';
    const giftableItems = (gifts.items || []).filter((item) => Number(item.price) > 0);
    $('#giftShopItem').innerHTML = giftableItems.length ? giftableItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${formatCredits(item.price)} créditos</option>`).join('') : '<option value="">Nenhum item disponível</option>';
  // A pauta aprovada retirou o teto semanal. O único limite efetivo é o
  // saldo da Loja 51 disponível para quem está enviando o presente.
  $('#giftCreditsAmount').max = String(Math.max(0.01, Number(profile.wallet || 0)));
  $('#giftCreditLimit').textContent = 'Sem limite de doação · limitado pelo seu saldo disponível: ' + formatCredits(profile.wallet || 0) + ' créditos';
  $('.gift-center-card').classList.toggle('hidden', !(gifts.people || []).length);
  const freeShopAvailable = Boolean(profile.freeShopPurchaseAvailable);
  // Depois de consumido, o passe não oferece mais nenhuma ação. O registro
  // continua no servidor para impedir uma segunda compra grátis, mas o card
  // deixa de ocupar espaço na loja.
  $('#freeShopPass').classList.toggle('hidden', !freeShopAvailable);
  $('#freeShopPass').classList.toggle('used', !freeShopAvailable);
  $('#freeShopPassTitle').textContent = freeShopAvailable ? 'Compra Grátis 51 disponível' : 'Compra Grátis 51 utilizada';
  $('#freeShopPassText').textContent = freeShopAvailable ? 'Escolha um visual da loja e use seu único passe sem gastar créditos.' : 'Seu passe individual já foi usado. As próximas compras utilizam Créditos 51.';
  $('#freeShopPassStatus').textContent = freeShopAvailable ? '1 USO' : 'UTILIZADO';
  const loan = profile.loan;
  const loanTrust = profile.stellarLoanTrust || { level: 0, maxLevel: 5, maxPrincipal: 900, nextMaxPrincipal: 1200, qualifyingPrincipal: 900, offers: [300, 600, 900] };
  let debtNotice = $('#loanOverdueNotice');
  if (loan?.overdue && !debtNotice) {
    debtNotice = document.createElement('aside'); debtNotice.id = 'loanOverdueNotice'; debtNotice.className = 'loan-overdue-notice'; debtNotice.setAttribute('role','status');
    debtNotice.innerHTML = '<strong>🕶️ Agiota Estelar: dívida vencida</strong><span>Quite ou prorrogue para restaurar os visuais e entrar em novas rodadas.</span><a href="?pagina=perfil">Ver dívida e pagar</a>';
    $('.topbar').insertAdjacentElement('afterend', debtNotice);
  } else if (!loan?.overdue) debtNotice?.remove();
  $('#stellarLoanCard').classList.toggle('has-debt', Boolean(loan));
  $('#stellarLoanTitle').textContent = loan ? `Dívida atual: ${formatCredits(loan.remainingDue)} créditos` : `Agiota Estelar · limite ${formatCredits(loanTrust.maxPrincipal)}`;
  $('#stellarLoanText').textContent = loan ? `Você recebeu ${loan.principal} e deve ${loan.totalDue} com juros. ${loan.dueAt ? `Vencimento: ${formatDate(loan.dueAt)}. ${loan.overdue ? 'ATRASADO: tema de cobrança e cursor lento ativos; quite para entrar em novas rodadas.' : 'Resgates promocionais abatem primeiro a dívida.'}` : 'Contrato anterior: sem prazo ou novas penalidades.'}` : `Confiança ${loanTrust.level}/${loanTrust.maxLevel} · limite atual de ${formatCredits(loanTrust.maxPrincipal)}. Digite de 300 até seu limite. Juros fixos de 20%, prazo de 48 horas e um empréstimo por vez. Quite ${formatCredits(loanTrust.qualifyingPrincipal)} no prazo para liberar ${formatCredits(loanTrust.nextMaxPrincipal)}. Atrasos reduzem uma faixa de confiança.`;
  $('#stellarLoanActions').innerHTML = loan ? `<input id="stellarRepayAmount" type="number" min="0.01" max="${Number(loan.remainingDue).toFixed(2)}" step="0.01" inputmode="decimal" value="${Math.min(Number(profile.wallet || 0), Number(loan.remainingDue)).toFixed(2)}" aria-label="Valor do pagamento"><button type="button" data-loan-repay>Pagar</button><button type="button" data-loan-repay-all>Quitar ${formatCredits(loan.remainingDue)}</button>` : `<input id="stellarBorrowAmount" type="number" min="300" max="${Number(loanTrust.maxPrincipal)}" step="1" inputmode="numeric" value="${Number(loanTrust.maxPrincipal)}" aria-label="Valor solicitado ao Agiota"><button type="button" data-loan-borrow>Solicitar créditos<small>Devolver +20% em 48h</small></button>`;
  let lenderOffers = $('#stellarLenderOffers');
  if (!lenderOffers) { lenderOffers = document.createElement('section'); lenderOffers.id = 'stellarLenderOffers'; lenderOffers.className = 'stellar-lender-offers'; $('#stellarLoanCard').append(lenderOffers); }
  const lender = profile.stellarLender;
  lenderOffers.classList.toggle('hidden', !lender?.visible || !(lender.offers || []).length);
  lenderOffers.innerHTML = lender?.visible ? `<strong><img class="stellar-lender-inline-art" src="/roulette51/shop-icons/agiota-estelar-v2.png" alt="">Entregue um item ao Agiota</strong><small>${lender.reason === 'overdue' ? 'Sua dívida está vencida: o valor será abatido dela.' : 'Você tem uma dívida ativa: o valor será abatido dela.'}</small><div class="stellar-item-offer-list">${(lender.offers || []).map((item) => `<button type="button" data-loan-item="${escapeHtml(item.purchaseId)}"><span>${merchantItemIconMarkup(item, 'stellar-offer-art') || escapeHtml(item.icon)}</span><b>${escapeHtml(item.name)}</b><em>${formatCredits(item.value)} para abater</em></button>`).join('')}</div>` : '';
  let blackMarket = $('#stellarBlackMarket');
  if (!blackMarket) { blackMarket = document.createElement('section'); blackMarket.id = 'stellarBlackMarket'; blackMarket.className = 'stellar-black-market'; $('#stellarLoanCard').append(blackMarket); }
  const blackMarketState = profile.stellarBlackMarket || { rate: 40, offers: [] };
  const blackMarketOffers = Array.isArray(blackMarketState.offers) ? blackMarketState.offers : [];
  blackMarket.innerHTML = `<strong><img class="stellar-lender-inline-art" src="/roulette51/shop-icons/agiota-estelar-v2.png" alt="">Mercado Negro</strong><small>O Agiota compra cosméticos pagos que você não está usando pelo mesmo valor aceito para quitar empréstimos: ${Number(blackMarketState.rate || 60)}% do valor-base. O crédito vai para a Loja 51 e não altera sua dívida.</small>${blackMarketOffers.length ? `<div class="stellar-item-offer-list">${blackMarketOffers.map((item) => `<button type="button" data-black-market-sale="${escapeHtml(item.purchaseId)}"><span>${merchantItemIconMarkup(item, 'stellar-offer-art') || escapeHtml(item.icon)}</span><b>${escapeHtml(item.name)}</b><em>Vender por ${formatCredits(item.value)}</em></button>`).join('')}</div>` : '<em class="stellar-black-market-empty">Nenhum cosmético pago e não equipado disponível agora.</em>'}`;
  const shopPriority = (item) => item.service ? -2 : item.id === 'power-force-gay-cursor' ? -1 : 0;
  const orderedShop = [...shop].sort((a, b) => shopPriority(a) - shopPriority(b));
  let curseRevealBoard = $('#curseRevealBoard');
  if (!curseRevealBoard) { curseRevealBoard = document.createElement('section'); curseRevealBoard.id = 'curseRevealBoard'; curseRevealBoard.className = 'shop-item'; $('#shopCatalog').insertAdjacentElement('beforebegin', curseRevealBoard); }
  const revealedCurses = profile.revealedCurseAuthors || [];
  curseRevealBoard.classList.toggle('hidden', revealedCurses.length === 0);
  curseRevealBoard.innerHTML = `<div><small>AUTORIAS REVELADAS</small><h4>Maldições investigadas</h4><p>${revealedCurses.map((entry) => `${escapeHtml(entry.targetName || 'Participante')} recebeu uma maldição em ${escapeHtml(formatDate(entry.createdAt))} — enviada por <strong>${escapeHtml(entry.senderName)}</strong>`).join('<br>')}</p></div>`;
  const nextShopCatalogSignature = JSON.stringify([shop, profile.cardPacks || [], mysteryBoxes, freeShopAvailable, profile.cobblemon?.balls || {}, shopFilter, hideOwnedVisuals]);
  if (shopCatalogRenderSignature !== nextShopCatalogSignature) {
  $('#shopCatalog').innerHTML = orderedShop.map((item) => {
    const isCobblemonBalls = item.id === 'service-cobblemon-balls';
    const balls = profile.cobblemon?.balls || {};
    const category = (item.mysteryBox || item.cardPack || isCobblemonBalls) ? 'box' : item.type === 'cursorStyle' ? 'cursor' : item.type === 'trailStyle' ? 'trail' : item.type === 'siteTheme' ? 'theme' : item.type === 'power' ? 'power' : 'profile';
    const isOwnedVisual = item.owned && !item.consumable && !item.mysteryBox && !item.service;
    const matchesFilter = shopFilter === 'all'
      || (shopFilter === 'halloween' ? item.seasonalEvent === 'halloween-2026' : shopFilter === category);
    const filteredOut = !matchesFilter || (hideOwnedVisuals && isOwnedVisual);
    const label = item.seasonalEvent === 'halloween-2026' ? 'HALLOWEEN 51 · EDIÇÃO LIMITADA' : isCobblemonBalls ? 'POKÉDEX 51 · CAPTURA' : item.cardPack ? 'PACOTE DE CARTAS' : item.service ? 'TROCA DE CONQUISTA' : item.mysteryBox ? 'CAIXA MISTERIOSA' : item.type === 'title' ? 'TÍTULO' : item.type === 'badge' ? 'EMBLEMA DO PERFIL' : item.type === 'frame' ? 'MOLDURA' : item.type === 'nameStyle' ? 'ESTILO DO NOME' : item.type === 'siteTheme' ? 'TEMA VISUAL' : item.type === 'cursorStyle' ? 'SKIN DO CURSOR' : item.type === 'trailStyle' ? 'RASTRO DO CURSOR' : 'PODER CONSUMÍVEL';
    const shieldWaiting = item.value === 'shieldGay' && Number(item.quantity || 0) > 0;
    const isCurse = ['forceGayCursor','forceGiantCursor','forceAdhdCursor','forceDevDarkness','forceCleaningCurse','forceHaterCurse','forceGivaldoCurse'].includes(item.value);
    const curseInventory = isCurse ? (profile.activePowers?.available || []).filter((entry) => entry.itemId === item.id) : [];
    const normalCount = curseInventory.filter((entry) => !entry.sealed).length;
    const sealedCount = curseInventory.filter((entry) => entry.sealed).length;
    const action = isCobblemonBalls ? 'Comprar Poké Balls' : item.cardPack ? 'Comprar pacote' : item.service ? 'Vender 1 ponto' : item.mysteryBox ? 'Comprar fechada' : shieldWaiting ? 'Aguardar sorteio' : item.consumable ? (item.quantity > 0 ? 'Usar poder' : 'Comprar preço normal') : item.equipped ? (item.type === 'siteTheme' ? 'Desativar tema' : 'Remover') : item.owned ? (item.type === 'siteTheme' ? 'Aplicar tema' : 'Equipar') : 'Comprar';
    const shopAction = isCobblemonBalls ? 'cobblemon-balls' : item.cardPack ? 'purchase' : item.service ? 'sell-best-win' : item.mysteryBox ? 'mystery-purchase' : shieldWaiting ? 'shield-waiting' : item.consumable ? (item.quantity > 0 ? 'use' : 'purchase') : item.owned ? 'equip' : 'purchase';
    const status = isCobblemonBalls ? shopCreditMarkup(balls.unitPrice || item.price || 8.99, `${Number(balls.remaining || 0)} restantes hoje · por unidade`) : item.cardPack ? shopCreditMarkup(item.price, `${item.quantity} fechado(s)`) : item.service ? `<span class="shop-status-stack"><span>🏆 ${Number(item.availablePoints || 0)} disponível</span>${shopCreditMarkup(500, 'recebidos ao vender')}</span>` : item.mysteryBox ? `<span class="shop-status-stack">${Number(item.quantity || 0) ? `<span class="shop-closed-box-count">${rouletteBoxIconMarkup(item) || '🎁'} ${item.quantity} fechado${Number(item.quantity) === 1 ? '' : 's'} no perfil</span>` : ''}${shopCreditMarkup(item.price)}</span>` : item.granted ? (item.equipped ? '★ Cursor oficial em uso' : '★ Concedido ao administrador') : isCurse && item.quantity > 0 ? `🎟️ ${normalCount} normal · ${sealedCount} sem defesa` : item.consumable && item.quantity > 0 ? '🎟️ ' + item.quantity + ' disponível' : item.equipped ? (item.type === 'siteTheme' ? '✓ Tema aplicado em todo o site' : '● Em uso') : item.owned ? '✓ Na sua coleção' : shopCreditMarkup(item.price);
    const themeConfirmation = item.type === 'siteTheme' && item.equipped ? '<div class="theme-applied-confirmation"><span>✓</span><strong>ESTE TEMA ESTÁ ATIVO</strong><small>Você está vendo este visual em todo o site agora.</small></div>' : '';
    const previewButton = item.service || item.consumable || item.mysteryBox ? '' : `<button class="shop-test-button" type="button" data-shop-preview="${escapeHtml(item.id)}" data-preview-type="${escapeHtml(item.type)}" data-preview-value="${escapeHtml(item.value)}">Testar 20s</button>`;
    const freeVisualTypes = ['title', 'badge', 'frame', 'nameStyle', 'siteTheme', 'cursorStyle', 'trailStyle'];
    const canUseFree = freeShopAvailable && freeVisualTypes.includes(item.type) && !item.owned;
    const freeButton = canUseFree ? `<button class="shop-free-button" type="button" data-shop-free="${escapeHtml(item.id)}">Usar grátis</button>` : '';
    const featuredPower = item.id === 'power-force-gay-cursor';
    const canBuyQuantity = Boolean(isCobblemonBalls || item.cardPack || item.mysteryBox || (item.type === 'power' && item.consumable));
    const quantityPicker = canBuyQuantity ? `<label class="shop-quantity-picker"><span>Quantidade</span><input type="number" min="1" max="20" step="1" value="1" inputmode="numeric" data-shop-quantity="${escapeHtml(item.id)}" aria-label="Quantidade de ${escapeHtml(item.name)}"></label>` : '';
    const buyMorePower = item.type === 'power' && item.consumable && Number(item.quantity || 0) > 0 ? `<button type="button" data-shop-action="purchase" data-shop-item="${escapeHtml(item.id)}" data-shop-type="${escapeHtml(item.type)}" data-shop-value="${escapeHtml(item.value)}" data-shop-price="${Number(item.price)}">Comprar normal · ${formatCredits(item.price)}</button>` : '';
    const buySealedCurse = isCurse ? `<button type="button" data-shop-action="purchase" data-shop-sealed="true" data-shop-item="${escapeHtml(item.id)}" data-shop-type="power" data-shop-value="${escapeHtml(item.value)}" data-shop-price="5000">Comprar sem defesa · ${formatCredits(5000)}</button>` : '';
    const boxInfo = item.mysteryBox ? ` data-box-info="true" data-box-name="${escapeHtml(item.name)}" data-box-tier="${escapeHtml(item.tier || '')}" data-box-icon="${escapeHtml(item.icon)}" data-box-credit="${Math.round(Number(item.creditChance || 0) * 100)}" data-box-power="${Math.round(Number(item.powerChance || 0) * 100)}" data-box-min="${Number(item.creditMin || 0)}" data-box-max="${Number(item.creditMax || 0)}" data-box-reward-min="${Number(item.minRewardPrice || 0)}" data-box-reward-max="${Number(item.maxRewardPrice || 0)}" data-box-physical-chance="${Number(item.physicalKitChance || 0)}"` : '';
    const iconMarkup = isCobblemonBalls ? `<span class="shop-item-icon"><img src="${COBBLEMON_ITEM_SPRITES.poke}" alt="Poké Ball" style="width:52px;height:52px;object-fit:contain;image-rendering:pixelated"></span>` : item.cardPack && item.packArt ? `<span class="shop-item-icon shop-pack-art"><img src="${escapeHtml(item.packArt)}" alt="${escapeHtml(item.name)}"></span>` : item.cardPack ? `<span class="shop-item-icon catalog-pack-icon catalog-pack-${escapeHtml(item.value)}"><i></i></span>` : item.mysteryBox ? `<button class="shop-item-icon mystery-box-shop-icon" type="button" aria-label="Ver chances da ${escapeHtml(item.name)}">${rouletteBoxIconMarkup(item) || escapeHtml(item.icon || '🎁')}</button>` : item.iconAsset ? `<span class="shop-item-icon shop-item-art"><img src="${escapeHtml(item.iconAsset)}" alt="${escapeHtml(item.name)}"></span>` : item.type === 'nameStyle' ? `<span class="shop-item-icon catalog-name-icon name-style-${escapeHtml(item.value)}">Aa</span>` : item.type === 'trailStyle' ? `<span class="shop-item-icon catalog-trail-icon catalog-trail-${escapeHtml(item.value)}"><b aria-hidden="true">${escapeHtml(item.icon || '✨')}</b><i></i></span>` : item.type === 'siteTheme' ? `<span class="shop-item-icon catalog-theme-icon catalog-theme-${escapeHtml(item.value)}"><i aria-hidden="true">${escapeHtml(item.icon || '◈')}</i></span>` : item.service ? `<span class="shop-item-icon shop-service-icon" aria-hidden="true">${escapeHtml(item.icon || '🏆')}</span>` : `<span class="shop-item-icon">${catalogIconMarkup(item) || item.icon}</span>`;
    const oddsButton = item.mysteryBox ? '<button type="button" data-box-odds>Ver chances</button>' : '';
    return `<article data-shop-category="${category}" class="shop-item shop-type-${escapeHtml(item.type)}${item.service ? ' shop-service' : ''}${item.mysteryBox ? ' mystery-box mystery-' + escapeHtml(item.tier) : ''}${item.owned ? ' owned' : ''}${item.equipped ? ' equipped' : ''}${item.consumable ? ' consumable' : ''}${item.granted ? ' admin-exclusive' : ''}${item.seasonalEvent === 'halloween-2026' ? ' halloween-shop-item' : ''}${featuredPower ? ' featured-gay-power' : ''}${filteredOut ? ' hidden' : ''}"${boxInfo}>${item.seasonalEvent === 'halloween-2026' ? '<span class="shop-seasonal-badge">🎃 OUTUBRO 51</span>' : ''}${featuredPower ? '<span class="shop-new-power">NOVO PODER</span>' : ''}${iconMarkup}<div><small>${label}</small><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.description)}</p>${isCurse ? `<small>Preço normal: ${formatCredits(item.price)} Créditos 51 · Sem Antídoto: ${formatCredits(5000)} Créditos 51 no total</small>` : ''}</div>${shopVisualPreview(item)}${themeConfirmation}<footer><strong>${status}</strong>${quantityPicker}<span class="shop-card-actions">${oddsButton}${previewButton}${freeButton}${buyMorePower}${buySealedCurse}<button type="button" data-shop-action="${shopAction}" data-shop-item="${escapeHtml(item.id)}" data-shop-type="${escapeHtml(item.type)}" data-shop-value="${escapeHtml(item.value)}" data-shop-price="${Number(item.price)}" data-equipped="${item.equipped}"${shieldWaiting || (!isCobblemonBalls && item.service && Number(item.availablePoints || 0) < 1) ? ' disabled' : ''}>${action}</button></span></footer></article>`;
  }).join('');
  const collectionCatalog = $('#collectionCatalog');
  collectionCatalog.innerHTML = '';
  $$('.shop-item.owned:not(.consumable):not(.mystery-box):not(.shop-service)', $('#shopCatalog')).forEach((card) => {
    const clone = card.cloneNode(true); clone.classList.remove('hidden');
    clone.querySelector('.shop-card-actions')?.insertAdjacentHTML('afterbegin', '<button class="shop-refund-button" type="button" data-shop-refund>Devolver</button>');
    collectionCatalog.appendChild(clone);
  });
  const unopened = [...(profile.cardPacks || []), ...mysteryBoxes];
  unopened.forEach((item) => { const unopenedIcon = item.tier ? (rouletteBoxIconMarkup(item) || escapeHtml(item.icon || '🎁')) : escapeHtml(item.icon || '🎁'); collectionCatalog.insertAdjacentHTML('beforeend', `<article class="shop-item collection-unopened"><span class="shop-item-icon${item.tier ? ' mystery-box-shop-icon' : ''}">${unopenedIcon}</span><div><small>${item.tier ? 'BAÚ FECHADO' : 'PACOTE FECHADO'}</small><h4>${escapeHtml(item.name)}</h4><p>Item ainda não usado.</p></div><footer><strong>✓ Guardado no seu perfil</strong><span class="shop-card-actions"><button class="shop-refund-button" type="button" data-shop-refund>Devolver</button></span></footer></article>`); });
  $('#collectionEmpty').classList.toggle('hidden', collectionCatalog.children.length > 0);
  $('#hideOwnedVisuals').checked = hideOwnedVisuals;
  if (shopPreviewItemId) applyShopPreviewVisual(shop.find((item) => item.id === shopPreviewItemId));
  shopCatalogRenderSignature = nextShopCatalogSignature;
  }
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
  $('#announcementStatus').textContent = announcement ? `Aviso ativo · ${Number(announcement.seenCount || 0)} visualizações` : 'Nenhum aviso publicado.';
  $('#clearAnnouncementButton').disabled = !announcement;
  const users = appState.adminUsers || [];
  $('#adminUserCount').textContent = users.length + ' contas';
  const bulkPreview = $('#bulkCreditPreview');
  if (bulkPreview) bulkPreview.textContent = `${users.filter((user) => user.active && user.approved !== false).length} contas ativas receberão o valor informado.`;
  const casinoBonusPreview = $('#casinoBulkBonusPreview');
  if (casinoBonusPreview) casinoBonusPreview.textContent = `${users.filter((user) => user.active && user.approved !== false).length} contas ativas: quem está jogando mantém o progresso; quem já sacou recebe uma nova banca.`;
  $('#adminUsers').innerHTML = users.map((user) =>
    '<div id="admin-user-' + escapeHtml(user.id) + '" class="admin-user' + (user.approved === false ? ' pending-approval' : '') + '"><p><strong>' + escapeHtml(formatDisplayName(user.displayName)) + '</strong><small>@' + escapeHtml(user.username) + (user.role === 'admin' ? ' · Administrador' : '') + (user.approved === false ? ' · Aguardando aprovação' : '') + ' · <span class="coin-51" aria-hidden="true">51</span> ' + formatCredits(user.wallet) + '</small></p>' +
    '<div class="admin-user-actions"><button class="tiny-toggle ' + (user.eligible ? 'on' : 'off') + '" data-user-action="eligible" data-user-id="' + user.id + '" data-value="' + (!user.eligible) + '">' + (user.eligible ? 'Participa' : 'Fora da roleta') + '</button>' +
    '<button class="tiny-toggle ' + (user.active ? 'on' : 'off') + '" data-user-action="active" data-user-id="' + user.id + '" data-value="' + (!user.active) + '">' + (user.active ? 'Ativo' : 'Inativo') + '</button>' +
    (user.approved === false ? '<button class="admin-user-approve" type="button" data-user-action="approved" data-user-id="' + user.id + '" data-value="true">Aprovar acesso</button>' : '') +
    '<button class="admin-user-edit" type="button" data-edit-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '" data-user-username="' + escapeHtml(user.username) + '">Editar</button>' +
    (user.id !== appState.me.id ? '<button class="admin-user-edit" type="button" data-reset-password-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '">Redefinir senha</button>' : '') +
    '<button class="admin-user-credits" type="button" data-credit-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '" data-user-wallet="' + Number(user.wallet || 0) + '">Créditos</button>' +
    (user.id !== appState.me.id ? '<button class="admin-user-delete" type="button" data-delete-user="' + user.id + '" data-user-name="' + escapeHtml(user.displayName) + '">Excluir</button>' : '') + '</div></div>'
  ).join('');
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
    const participantManager = $('#roundParticipantManager');
    participantManager.classList.toggle('hidden', !readiness.canManageParticipants);
    if (readiness.canManageParticipants) $('#roundParticipantList').innerHTML = (readiness.participants || []).map((person) => {
      const action = person.hasSubmission ? 'Protegido' : person.included ? 'Remover' : 'Adicionar';
      const actionLabel = person.hasSubmission ? `${formatDisplayName(person.displayName)} já enviou e não pode ser alterado` : person.included ? `Remover ${formatDisplayName(person.displayName)} da rodada` : `Adicionar ${formatDisplayName(person.displayName)} à rodada`;
      return '<div class="round-participant-row"><span>' + escapeHtml(formatDisplayName(person.displayName)) + (person.hasSubmission ? ' <small>já enviou</small>' : '') + '</span><button type="button" class="tiny-toggle ' + (person.included ? 'on' : 'off') + '" data-round-participant="' + escapeHtml(person.id) + '" data-round-included="' + (!person.included) + '" aria-label="' + escapeHtml(actionLabel) + '" title="' + escapeHtml(actionLabel) + '" ' + (person.hasSubmission ? 'disabled' : '') + '>' + action + '</button></div>';
    }).join('');
  }
  const assistedCard = $('#adminAssistedUploadForm');
  const uploadOptions = appState.adminUploadOptions || [];
  assistedCard.classList.toggle('hidden', !showAttendance || !uploadOptions.some((person) => !person.hasSubmission));
  if (showAttendance) {
    const select = $('#adminUploadUser');
    const selectedId = select.value;
    select.innerHTML = uploadOptions.filter((person) => !person.hasSubmission).map((person) => '<option value="' + escapeHtml(person.id) + '">' + escapeHtml(formatDisplayName(person.displayName)) + ' — aguardando</option>').join('');
    if (uploadOptions.some((person) => person.id === selectedId && !person.hasSubmission)) select.value = selectedId;
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
    theme: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/inscricoes.png" alt="">', 'Tema da rodada', 'Aguardando o próximo sorteio'],
    uploads: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/inscricoes.png" alt="">', 'Envios abertos', data.meCanUpload ? 'Seu wallpaper ainda falta' : 'Seu envio está confirmado'],
    assignments: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/sorteio.png" alt="">', 'Distribuição', 'Wallpapers sendo entregues'],
    gay: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/sorteio.png" alt="">', 'Sorteio especial', 'Gay da Rodada é a próxima etapa'],
    voting: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/votacoes.png" alt="">', 'Votação aberta', data.voting?.userHasVoted ? 'Seu voto já foi salvo' : 'Seu voto ainda falta'],
    results: ['<img class="catalog-art-icon" src="/roulette51/shop-icons/achievements/campeao-area-51.png" alt="">', 'Resultado disponível', 'Confira o fechamento da rodada'],
  }[phase];
  const missions = data.profile?.dailyMissions || [];
  const missionDone = missions.filter((item) => item.completed).length;
  const water = Number(data.hydration?.myTotalMl || 0);
  const boxes = Number(data.profile?.mysteryBoxes?.length || 0) + Number(data.profile?.cardPacks?.length || 0);
  const unread = Number(data.notifications?.unreadCount || 0);
  $('#todayHubStatus').textContent = unread ? unread + (unread === 1 ? ' novidade' : ' novidades') : 'Tudo em ordem';
  $('#todayHubCards').innerHTML = [
    [phaseInfo[0], phaseInfo[1], phaseInfo[2], 'Rodada'],
    ['<img class="catalog-art-icon" src="/roulette51/menu-icons/agua.png" alt="">', water.toLocaleString('pt-BR') + ' ml', Math.max(0, 2500 - water).toLocaleString('pt-BR') + ' ml restantes', 'Água hoje'],
    ['<img class="catalog-art-icon" src="/roulette51/menu-icons/atualizacoes.png" alt="">', missionDone + ' de ' + missions.length, missionDone === missions.length && missions.length ? 'Objetivos concluídos' : 'Missões diárias', 'Progresso'],
    ['<img class="catalog-art-icon" src="/roulette51/shop-icons/presente-secreto.png" alt="">', String(boxes), boxes ? 'Itens fechados esperando você' : 'Nenhum item fechado', 'Inventário'],
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
  const tile = (item, selectable = false) => `<label class="${selectable ? 'trophy-option' : 'trophy-item'}">${selectable ? `<input type="checkbox" value="${escapeHtml(item.id)}"${showcase.selectedIds.includes(item.id) ? ' checked' : ''}>` : ''}<span>${insigniaVisualMarkup(item, 'trophy-insignia-art') || achievementIconMarkup(item) || escapeHtml(item.icon)}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.kind || item.description || '')}</small></label>`;
  $('#trophyRoomDisplay').innerHTML = showcase.selected.length ? showcase.selected.map((item) => tile(item)).join('') : '<p class="trophy-room-empty">Sua vitrine ainda está vazia. Escolha conquistas desbloqueadas.</p>';
  $('#trophyRoomOptions').innerHTML = showcase.options.length ? showcase.options.map((item) => tile(item, true)).join('') : '<p class="trophy-room-empty">Continue participando para liberar conquistas.</p>';
  $('#saveTrophyRoomButton').disabled = !showcase.options.length;
}

function renderFeatureAvailability(flags = {}) {
  const normalized = { casino: true, impostor: true, mystery: true, shop: true, uploads: true, ...flags };
  $$('#siteMenu a[data-page]').forEach((link) => {
    const feature = featurePageMap[link.dataset.page];
    link.classList.toggle('feature-paused', Boolean(feature && normalized[feature] === false));
    link.hidden = Boolean(feature && normalized[feature] === false);
    link.setAttribute('aria-disabled', String(Boolean(feature && normalized[feature] === false)));
  });
  const form = $('#featureFlagsForm');
  if (form && document.activeElement?.form !== form) Object.entries(normalized).forEach(([key, enabled]) => { if (form.elements[key]) form.elements[key].checked = enabled; });
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
    theme: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/inscricoes.png" alt="">','Definir o tema','A roleta de temas inicia a rodada.'], uploads: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/inscricoes.png" alt="">','Receber os wallpapers',`${appState.readiness?.ready || 0} de ${appState.readiness?.total || 0} envios confirmados.`],
    assignments: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/sorteio.png" alt="">','Distribuir wallpapers','Use a roleta para entregar um wallpaper a cada pessoa.'], gay: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/sorteio.png" alt="">','Sortear o Gay da Rodada','A distribuição terminou; o sorteio especial está liberado.'],
    voting: ['<img class="catalog-art-icon" src="/roulette51/menu-icons/votacoes.png" alt="">','Acompanhar votação',`${appState.voting?.receivedVotes || 0} de ${appState.voting?.totalVoters || 0} votos recebidos.`], results: ['<img class="catalog-art-icon" src="/roulette51/shop-icons/achievements/campeao-area-51.png" alt="">','Fechar a rodada','Resultados concluídos; confirme antes de apagar as imagens pesadas.'],
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
  const backupAt = Date.parse(health.lastBackupAt || '');
  const backupNeedsAttention = !Number.isFinite(backupAt) || Date.now() - backupAt > 14 * 24 * 60 * 60 * 1000;
  const healthStatus = $('#healthOverallStatus');
  if (healthStatus) {
    healthStatus.textContent = backupNeedsAttention ? '● Revisar backup' : '● Saudável';
    healthStatus.classList.toggle('needs-attention', backupNeedsAttention);
  }
  $('#healthMetrics').innerHTML = [
    ['Banco atual', formatBytes(bytes)], ['Mídias referenciadas', Number(media.referencedTotal || 0).toLocaleString('pt-BR')],
    ['Contas ativas', `${Number(health.activeUsers || 0)} de ${Number(health.totalUsers || 0)}`], ['Online agora', Number(health.onlineUsers || 0).toLocaleString('pt-BR')],
    ['Versão liberada', 'v' + Number(health.releaseVersion || 0)], ['Revisão dos dados', '#' + Number(health.revision || 0)],
  ].map(([label,value]) => `<div class="health-metric"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  const backup = health.lastBackupAt ? formatDate(health.lastBackupAt) : 'ainda não registrado';
  const cleanup = health.lastCleanupAt ? formatDate(health.lastCleanupAt) : 'ainda não registrada';
  $('#healthActivity').innerHTML = `<span><small>Último backup</small><strong>${escapeHtml(backup)}</strong></span><span><small>Última limpeza</small><strong>${escapeHtml(cleanup)}</strong></span><span><small>Arquivos armazenados</small><strong>${Number(media.wallpapers || 0)} wallpapers · ${Number(media.feedImages || 0)} no feed · ${Number(media.feedbackImages || 0)} em feedbacks</strong></span><span><small>Sincronização</small><strong>Ativa nas abas visíveis</strong></span>`;
  void refreshRuntimeHealth();
}

let runtimeHealthLastCheckedAt = 0;
let runtimeHealthRequest = null;
function formatRuntimePercent(value) { return `${Math.max(0, Math.min(100, Math.round(Number(value || 0))))}%`; }
function runtimeLevel(value, warning, critical) { return value >= critical ? 'critical' : value >= warning ? 'warning' : 'healthy'; }
function renderRuntimeHealth(runtime = {}, responseMs = null) {
  const root = $('#healthRuntime'); if (!root) return;
  if (!runtime.ok) { root.innerHTML = '<div class="health-runtime-alert warning"><strong>⚠ Origem sem leitura</strong><span>O portal ainda pode estar funcionando. Tente atualizar esta página em alguns instantes.</span></div>'; return; }
  const memoryLevel = runtimeLevel(runtime.memoryUsedPercent, 75, 90); const swapLevel = runtimeLevel(runtime.swapUsedPercent, 50, 80); const loadLevel = runtimeLevel(runtime.loadPerCpu, 1, 2);
  const queueLevel = runtimeLevel(Number(runtime.peakQueuedMutations || 0) / 24 * 100, 50, 80);
  const overall = [memoryLevel, swapLevel, loadLevel, queueLevel].includes('critical') ? 'critical' : ([memoryLevel, swapLevel, loadLevel, queueLevel].includes('warning') ? 'warning' : 'healthy');
  const status = $('#healthOverallStatus');
  if (status) { status.textContent = overall === 'healthy' ? '● Tudo normal' : overall === 'warning' ? '● Atenção necessária' : '● Ação necessária'; status.classList.toggle('needs-attention', overall !== 'healthy'); status.classList.toggle('critical', overall === 'critical'); }
  const responseLabel = Number.isFinite(responseMs) ? `${Math.round(responseMs)} ms` : 'agora';
  root.innerHTML = [
    ['Custo estimado', 'R$ 0,00/mês', 'healthy', 'Plano Always Free'], ['Origem', 'Online', 'healthy', `Resposta: ${responseLabel}`],
    ['Memória da VM', formatRuntimePercent(runtime.memoryUsedPercent), memoryLevel, memoryLevel === 'healthy' ? 'Até 75% é normal' : 'Uso alto: acompanharemos'], ['Swap', formatRuntimePercent(runtime.swapUsedPercent), swapLevel, swapLevel === 'healthy' ? 'Reserva disponível' : 'Reserva sendo usada'],
    ['Carga do servidor', `${Number(runtime.loadPerCpu || 0).toFixed(2)} / 1`, loadLevel, loadLevel === 'healthy' ? 'Abaixo do limite' : 'Há trabalho acumulado'], ['Chamadas desde reinício', Number(runtime.apiRequestsSinceStart || 0).toLocaleString('pt-BR'), 'healthy', 'O total diário do Worker fica no painel da Cloudflare'],
    ['Pico de leituras', `${Number(runtime.peakActiveReads || 0)} / 12`, runtimeLevel(Number(runtime.peakActiveReads || 0) / 12 * 100, 75, 92), 'Abas consultando o portal ao mesmo tempo'], ['Pico da fila de ações', `${Number(runtime.peakQueuedMutations || 0)} / 24`, queueLevel, Number(runtime.apiFailuresSinceStart || 0) ? `${Number(runtime.apiFailuresSinceStart).toLocaleString('pt-BR')} respostas de erro desde o reinício` : 'Sem ações recusadas desde o reinício'],
    ['Monitor automático', runtime.healthcheckActive ? 'Ativo' : 'Revisar', runtime.healthcheckActive ? 'healthy' : 'warning', runtime.healthcheckActive ? 'Verifica a cada minuto' : 'Monitor indisponível'],
  ].map(([label, value, level, detail]) => `<div class="health-runtime-metric ${level}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></div>`).join('');
  const routes = Array.isArray(runtime.topApiRoutes) ? runtime.topApiRoutes : [];
  if (routes.length) root.insertAdjacentHTML('beforeend', `<p class="health-runtime-routes"><small>Rotas mais usadas desde o último reinício</small>${routes.map((entry) => `<span><b>${escapeHtml(entry.route)}</b> ${Number(entry.count || 0).toLocaleString('pt-BR')}</span>`).join('')}</p>`);
}
async function refreshRuntimeHealth() {
  if (!appState || appState.me?.role !== 'admin' || runtimeHealthRequest || Date.now() - runtimeHealthLastCheckedAt < 30000) return;
  const startedAt = performance.now();
  runtimeHealthRequest = api('/api/admin/runtime-health').then((data) => { runtimeHealthLastCheckedAt = Date.now(); renderRuntimeHealth(data.runtime || {}, performance.now() - startedAt); }).catch(() => { runtimeHealthLastCheckedAt = Date.now(); renderRuntimeHealth(); }).finally(() => { runtimeHealthRequest = null; });
  await runtimeHealthRequest;
}

function renderAnnouncement(announcement) {
  const dialog = $('#announcementDialog');
  // Publicações de versão já possuem um fluxo próprio (atualizar → notas da
  // versão). Não abrir também o anúncio genérico para a mesma publicação.
  if (!announcement || String(announcement.id || '').startsWith('release-') || !announcement.unread || dialog.dataset.announcementId === announcement.id) return;
  dialog.dataset.announcementId = announcement.id;
  const title = String(announcement.title || '').trim(); const message = String(announcement.message || '').trim(); const image = $('#announcementDialogImage');
  $('#announcementDialogTitle').textContent = title;
  $('#announcementDialogTitle').classList.toggle('hidden', !title);
  $('#announcementDialogMessage').textContent = message;
  $('#announcementDialogMessage').classList.toggle('hidden', !message);
  image.src = announcement.imageUrl || '';
  image.classList.toggle('hidden', !announcement.imageUrl);
  dialog.classList.toggle('announcement-image-only', Boolean(announcement.imageUrl) && !title && !message);
  if (!dialog.open) dialog.showModal();
}

let renderingActivePortalPage = false;
let renderedPortalPage = null;
const MARKET_CHART_COLORS = ['#62e6c3', '#7f8cff', '#ffcc66', '#ff7195', '#48b8ff', '#c58cff'];
const MARKET_CHART_PERIODS = Object.freeze({ '1d': 1, '7d': 7, '3w': 21, '1m': 31, '1y': 365 });
let marketChartPeriod = '1d';
let cryptoChartPeriod = '1d';
let cryptoChartAssetId = 'all';
let marketChartAssetId = 'all';
let marketHistoryAssetId = 'all';
let marketHistoryExpanded = false;
function marketMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function marketSignedMoney(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? '+' : ''}${marketMoney(amount)}`;
}
function marketHistoryForPeriod(market, period = marketChartPeriod) {
  const days = MARKET_CHART_PERIODS[period] || 1;
  const detailed = Array.isArray(market.history) ? market.history : [];
  const daily = Array.isArray(market.dailyHistory) ? market.dailyHistory : [];
  const source = days > 30 ? [...daily, ...detailed] : detailed;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const seen = new Set();
  return source
    .filter((row) => !row.createdAt || Date.parse(row.createdAt) >= cutoff)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .filter((row) => {
      const key = row.slotKey || row.createdAt || row.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function marketChartSamples(samples, maximum = 96) {
  if (samples.length <= maximum) return samples;
  const lastIndex = samples.length - 1;
  return Array.from({ length: maximum }, (_, index) => samples[Math.round((index * lastIndex) / (maximum - 1))]);
}
function marketChartMarkup(assets, history, maximumSamples = 96) {
  const chronological = [...history].reverse();
  const series = assets.map((asset, index) => {
    const current = Number(asset.price || 0);
    const previous = Number(asset.previousPrice || current);
    let samples = chronological.map((row) => ({ price: Number(row.prices?.[asset.id] || current), createdAt: row.createdAt }));
    if (!samples.length) samples.push({ price: previous, createdAt: null }, { price: current, createdAt: null });
    else if (samples.length === 1) {
      if (Math.abs(samples[0].price - previous) > 0.0001) samples.unshift({ price: previous, createdAt: null });
      if (Math.abs(samples[samples.length - 1].price - current) > 0.0001) samples.push({ price: current, createdAt: null });
    } else if (Math.abs(samples[samples.length - 1].price - current) > 0.0001) samples.push({ price: current, createdAt: null });
    if (samples.length === 1) samples.unshift({ ...samples[0], createdAt: null });
    samples = marketChartSamples(samples, maximumSamples);
    const base = samples[0].price || Number(asset.price) || 1;
    return { asset, color: MARKET_CHART_COLORS[index % MARKET_CHART_COLORS.length], samples, points: samples.map((sample) => sample.price), changes: samples.map((sample) => ((sample.price / base) - 1) * 100) };
  });
  const allPoints = series.flatMap((item) => item.points);
  let min = Math.min(...allPoints); let max = Math.max(...allPoints);
  if (min === max) { const padding = Math.max(1, Math.abs(min) * .06); min -= padding; max += padding; }
  else { const padding = Math.max(.01, (max - min) * .07); min -= padding; max += padding; }
  const width = 940; const height = 250; const left = 48; const right = 18; const top = 18; const bottom = 30;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const pointFor = (value, index, total) => `${left + (total <= 1 ? plotWidth / 2 : (index / (total - 1)) * plotWidth)},${top + ((max - value) / (max - min)) * plotHeight}`;
  const grid = [0, 1, 2, 3].map((index) => { const value = max - ((max - min) * index / 3); const y = top + (plotHeight * index / 3); return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"/><text x="4" y="${(y + 4).toFixed(1)}">${marketMoney(value)}</text>`; }).join('');
  const lines = series.map(({ asset, color, points, changes, samples }) => {
    const pointMarkup = points.map((value, pointIndex) => {
      const sample = samples[pointIndex];
      const price = Number(sample.price || 0);
      const timestamp = sample.createdAt ? new Date(sample.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : pointIndex === points.length - 1 ? 'Agora' : 'Início';
      const change = Number(changes[pointIndex] || 0);
      const percent = `${change >= 0 ? '+' : ''}${change.toFixed(2).replace('.', ',')}%`;
      const [cx, cy] = pointFor(value, pointIndex, points.length).split(',');
      return `<g class="market-chart-point" tabindex="0" role="img" aria-label="${escapeHtml(asset.name)}: ${marketMoney(price)} Créditos 51, ${percent} desde ${timestamp}"><circle cx="${cx}" cy="${cy}" r="4" fill="${color}" stroke="#101a2d" stroke-width="2"><title>${escapeHtml(asset.name)} · ${marketMoney(price)} Créditos 51 · ${percent} · ${escapeHtml(timestamp)}</title></circle></g>`;
    }).join('');
    return `<polyline class="market-chart-line" stroke="${color}" points="${points.map((value, pointIndex) => pointFor(value, pointIndex, points.length)).join(' ')}"/>${pointMarkup}`;
  }).join('');
  const legend = series.map(({ asset, color }) => `<span><i style="background:${color}"></i>${escapeHtml(asset.name)}</span>`).join('');
  const focused = series.length === 1 ? (() => { const item = series[0]; const initial = Number(item.samples[0]?.price || item.asset.price || 0); const current = Number(item.asset.price || 0); const change = current - initial; const percent = initial ? (change / initial) * 100 : 0; const direction = change > 0 ? 'positive' : change < 0 ? 'negative' : 'flat'; return `<div class="market-chart-focus ${direction}"><span>Leitura de ${escapeHtml(item.asset.name)}</span><b>${marketMoney(initial)} → ${marketMoney(current)} Créditos 51</b><strong>${change >= 0 ? '+' : ''}${marketMoney(change)} · ${percent >= 0 ? '+' : ''}${percent.toFixed(2).replace('.', ',')}%</strong></div>`; })() : '';
  return `<div class="market-chart-wrap"><svg class="market-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução das cotações em Créditos 51"><g class="market-chart-grid">${grid}</g>${lines}</svg><div class="market-chart-axis"><span>Histórico</span><span>Agora</span></div></div><div class="market-chart-legend">${legend}</div>${focused}`;
}
function marketMoverMarkup(asset, kind) {
  if (!asset) return `<p class="market-mover-empty">Nenhuma variação registrada nesta janela.</p>`;
  const positive = kind === 'up'; const direction = asset.direction === 'flat' ? 'flat' : positive ? 'up' : 'down';
  return `<div class="market-mover-row ${direction}"><span class="market-mover-icon">${positive ? '↗' : '↘'}</span><span><b>${escapeHtml(asset.name)}</b><small>${marketMoney(asset.price)} Créditos 51</small></span><strong>${asset.changePercent > 0 ? '+' : ''}${Number(asset.changePercent || 0).toFixed(2).replace('.', ',')}%</strong></div>`;
}
function marketRadarMarkup(assets) {
  if (!assets.length) return '<p class="market-mover-empty">Nenhuma cotação disponível nesta janela.</p>';
  const rows = assets.map((asset) => {
    const direction = asset.direction || 'flat';
    const arrow = direction === 'up' ? '↗' : direction === 'down' ? '↘' : '→';
    const percent = `${asset.changePercent > 0 ? '+' : ''}${Number(asset.changePercent || 0).toFixed(2).replace('.', ',')}%`;
    return `<div class="market-radar-row ${direction}"><span class="market-radar-asset" data-label="Moeda"><i>${marketAssetIconMarkup(asset)}</i><b>${escapeHtml(asset.name)}</b></span><span data-label="Antes">${marketMoney(asset.previousPrice)}<small>Créditos 51</small></span><span data-label="Agora"><strong>${marketMoney(asset.price)}</strong><small>Créditos 51</small></span><span class="market-radar-change" data-label="Variação"><b>${arrow} ${marketSignedMoney(asset.change)}</b><small>${percent}</small></span></div>`;
  }).join('');
  return `<div class="market-radar-grid"><div class="market-radar-head" aria-hidden="true"><span>Moeda</span><span>Antes</span><span>Agora</span><span>Variação</span></div>${rows}</div>`;
}
function renderInvestmentMarket(profile = {}) {
  const market = profile.investmentMarket || {}; const assets = Array.isArray(market.assets) ? market.assets : [];
  const fallbackTimes = Array.from({ length: 36 }, (_, index) => { const minutes = 480 + index * 15; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; });
  const schedule = market.updateSchedule || { timeZone: 'America/Sao_Paulo', times: fallbackTimes };
  const scheduleTimes = Array.isArray(schedule.times) && schedule.times.length ? schedule.times : (Array.isArray(schedule.hours) && schedule.hours.length ? schedule.hours.map((hour) => `${String(Number(hour)).padStart(2, '0')}:00`) : fallbackTimes);
  const scheduleLabels = scheduleTimes.map((time) => { const [hour, minute = '00'] = String(time).split(':'); return minute === '00' ? `${String(Number(hour)).padStart(2, '0')}h` : `${String(Number(hour)).padStart(2, '0')}h${String(Number(minute)).padStart(2, '0')}`; });
  const scheduleZone = schedule.timeZone === 'America/Sao_Paulo' ? 'horário de Brasília' : String(schedule.timeZone || 'horário local');
  const scheduleEl = $('#marketUpdateSchedule');
  if (scheduleEl) scheduleEl.textContent = scheduleTimes.length === 36 ? `Atualizações automáticas a cada 15 minutos, das 08h às 16h45 (${scheduleZone}). A primeira sincronização após cada horário consolida a nova cotação. Dividendos seguem a cada 45 minutos.` : `Atualizações automáticas: ${scheduleLabels.join(' · ')} (${scheduleZone}). A primeira sincronização após cada horário consolida a nova cotação.`;
  const wallet = Number(profile.wallet || 0); const holdingsValue = Number(market.holdingsValue || 0); const portfolioValue = wallet + holdingsValue;
  const walletEl = $('#marketWallet'); if (walletEl) { walletEl.textContent = marketMoney(wallet); walletEl.parentElement?.setAttribute('aria-label', `${marketMoney(wallet)} Créditos 51`); }
  const holdingsEl = $('#marketHoldingsValue'); if (holdingsEl) { holdingsEl.textContent = marketMoney(holdingsValue); holdingsEl.parentElement?.setAttribute('aria-label', `${marketMoney(holdingsValue)} Créditos 51`); }
  const portfolioValueEl = $('#marketPortfolioValue'); if (portfolioValueEl) { portfolioValueEl.textContent = marketMoney(portfolioValue); portfolioValueEl.parentElement?.setAttribute('aria-label', `${marketMoney(portfolioValue)} Créditos 51`); }
  const investedCost = Number(market.investedCost || 0); const unrealizedPnl = Number(market.unrealizedPnl || 0); const unrealizedPnlPercent = Number(market.unrealizedPnlPercent || 0); const pnlClass = unrealizedPnl > 0 ? 'positive' : unrealizedPnl < 0 ? 'negative' : 'flat';
  const investedCostEl = $('#marketInvestedCost'); if (investedCostEl) investedCostEl.textContent = marketMoney(investedCost);
  const pnlEl = $('#marketUnrealizedPnl'); if (pnlEl) { pnlEl.textContent = `${unrealizedPnl > 0 ? '+' : ''}${marketMoney(unrealizedPnl)}`; pnlEl.className = pnlClass; }
  const pnlLabelEl = $('#marketUnrealizedPnlLabel'); if (pnlLabelEl) pnlLabelEl.textContent = unrealizedPnl > 0 ? 'posição positiva' : unrealizedPnl < 0 ? 'posição negativa' : 'sem variação';
  const pnlPercentEl = $('#marketUnrealizedPnlPercent'); if (pnlPercentEl) { pnlPercentEl.textContent = `${unrealizedPnlPercent > 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2).replace('.', ',')}%`; pnlPercentEl.className = pnlClass; }
  const income = market.income || {}; const dailyIncome = income.dailyIncome || { amount: 40, eligible: false, claimed: false, available: false }; const dailyIncomeText = $('#marketDailyIncomeText'); const dailyIncomeStatus = $('#marketDailyIncomeStatus'); const dailyIncomeButton = $('#marketDailyIncomeButton');
  if (dailyIncomeText) dailyIncomeText.textContent = dailyIncome.claimed ? 'Sua Renda 51 de hoje já foi resgatada. Volte amanhã.' : dailyIncome.eligible ? `Você pode resgatar ${marketMoney(dailyIncome.amount)} Créditos 51 agora.` : `Faça uma atividade válida hoje para liberar ${marketMoney(dailyIncome.amount)} Créditos 51.`;
  if (dailyIncomeStatus) dailyIncomeStatus.textContent = dailyIncome.claimed ? 'Resgatada hoje' : dailyIncome.eligible ? 'Disponível agora' : 'Uma por dia';
  if (dailyIncomeButton) { dailyIncomeButton.disabled = !dailyIncome.available; dailyIncomeButton.textContent = dailyIncome.claimed ? 'Renda resgatada hoje' : 'Resgatar renda diária'; }
  const missionList = $('#marketMissionList'); const missions = Array.isArray(income.missions) ? income.missions : [];
  if (missionList) missionList.innerHTML = missions.map((mission) => `<div class="market-mission-row${mission.completed ? ' completed' : ''}"><span>${String(mission.icon || '') === '🪙' ? creditIconMarkup() : escapeHtml(mission.icon || '')}</span><div><strong>${escapeHtml(mission.title)}</strong><small>${escapeHtml(mission.description)}</small></div><b>${mission.completed ? '✓' : '+' + formatCredits(mission.reward)}</b></div>`).join('');
  const dividend = income.dividend || {}; const dividendStatus = $('#marketDividendStatus'); if (dividendStatus) dividendStatus.textContent = `Dividendos hoje: ${formatCredits(dividend.paidToday || 0)} / ${formatCredits(dividend.dailyCap || 20)}`;
  const liquidityHint = $('#marketLiquidityHint'); if (liquidityHint) liquidityHint.textContent = income.liquidity?.warning ? `Atenção: ${formatCredits(income.liquidity.investedShare || 0)}% do seu patrimônio está investido. Mantenha saldo livre para oportunidades.` : `Dividendos de ${formatCredits(Number(dividend.ratePerUpdate || 0) * 100)}% por atualização, com limite diário. A valorização continua sendo o principal ganho.`;
  const lastUpdateEl = $('#marketLastUpdate'); if (lastUpdateEl) lastUpdateEl.textContent = market.updatedAt ? `Última atualização: ${new Date(market.updatedAt).toLocaleString('pt-BR')}` : 'Aguardando a primeira atualização do servidor';
  const root = $('#marketAssets'); if (!root) return;
  // Refreshing prices must not erase an unfinished order or move the user away
  // from the field they were editing. Keys use the asset and operation, never
  // the position of a card, so reordering assets cannot mix up values.
  const marketDrafts = [...root.querySelectorAll('form[data-market-asset]')].map((form) => ({
    asset: form.dataset.marketAsset,
    action: form.dataset.marketAction || 'auto',
    values: [...form.querySelectorAll('input[name]')].map((input) => ({ name: input.name, value: input.value, focused: input === document.activeElement })),
    expanded: Boolean(form.closest('details')?.open),
  }));
  const marketTabs = [...root.querySelectorAll('.market-trade-panel')].map((panel) => ({ asset: panel.querySelector('form[data-market-asset]')?.dataset.marketAsset, tab: panel.querySelector('[data-market-order-tab].active')?.dataset.marketOrderTab || 'buy' }));
  const history = Array.isArray(market.history) ? market.history : [];
  if (marketChartAssetId !== 'all' && !assets.some((asset) => asset.id === marketChartAssetId)) marketChartAssetId = 'all';
  if (marketHistoryAssetId !== 'all' && !assets.some((asset) => asset.id === marketHistoryAssetId)) marketHistoryAssetId = 'all';
  const marketOptions = `<option value="all">Todas as moedas</option>${assets.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join('')}`;
  const chartAssetSelect = $('#marketChartAsset'); if (chartAssetSelect) { chartAssetSelect.innerHTML = marketOptions; chartAssetSelect.value = marketChartAssetId; }
  const historyAssetSelect = $('#marketHistoryAsset'); if (historyAssetSelect) { historyAssetSelect.innerHTML = marketOptions; historyAssetSelect.value = marketHistoryAssetId; }
  const chartHistory = marketHistoryForPeriod(market);
  const movers = $('#marketMovers'); if (movers) movers.innerHTML = marketRadarMarkup(assets);
  const chartAssets = marketChartAssetId === 'all' ? assets : assets.filter((asset) => asset.id === marketChartAssetId);
  const chart = $('#marketChart'); if (chart) chart.innerHTML = marketChartMarkup(chartAssets, chartHistory, 120);
  $$('#marketChartPeriods [data-market-period]').forEach((button) => { const active = button.dataset.marketPeriod === marketChartPeriod; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  // Os cards seguem a mesma janela selecionada no gráfico principal. Antes,
  // eles recebiam todo o histórico intradiário (até 31 dias) enquanto o topo
  // exibia, por padrão, apenas 1 dia — duas leituras diferentes da mesma moeda.
  root.innerHTML = assets.map((asset) => { const arrow = asset.direction === 'up' ? '<b class="market-change up">↑</b>' : asset.direction === 'down' ? '<b class="market-change down">↓</b>' : '<b class="market-change flat">→</b>'; const changeText = `${marketSignedMoney(asset.change)} (${asset.changePercent > 0 ? '+' : ''}${Number(asset.changePercent || 0).toFixed(2).replace('.', ',')}%)`; const quantity = Number(asset.quantity || 0); const price = Number(asset.price || 0); const holdingPnl = Number(asset.unrealizedPnl || 0); const holdingPnlClass = holdingPnl > 0 ? 'positive' : holdingPnl < 0 ? 'negative' : 'flat'; const holdingChange = `${holdingPnl > 0 ? '+' : ''}${holdingPnl.toFixed(2).replace('.', ',')} (${Number(asset.holdingChangePercent || 0) > 0 ? '+' : ''}${Number(asset.holdingChangePercent || 0).toFixed(2).replace('.', ',')}%)`; const order = (side, label, buttonClass, max) => `<form class="market-order" data-market-action="${side}" data-market-asset="${escapeHtml(asset.id)}" data-market-price="${price}"><div class="market-order-head"><b>${label}</b><output data-market-total>Total: ${marketMoney(price)} Créditos 51</output></div><div class="market-order-fields"><label>Quantidade<input name="quantity" type="number" min="1" max="${max}" step="1" value="1" required></label><button class="button ${buttonClass}" type="submit">${label}</button></div><div class="market-quick-qty" aria-label="Quantidades rápidas">${[1, 5, 10, 25].map((amount) => `<button type="button" data-market-quick="${amount}">${amount}</button>`).join('')}</div></form>`; const trade = `<section class="market-trade-panel"><div class="market-trade-panel-head"><span>Operar agora</span><div class="market-order-tabs" role="tablist" aria-label="Escolher operação"><button type="button" class="active" data-market-order-tab="buy" aria-selected="true">Comprar</button><button type="button" data-market-order-tab="sell" aria-selected="false">Vender</button></div></div><div class="market-order-pane active" data-market-order-pane="buy">${order('buy', 'Comprar', 'button-primary', 100000)}</div><div class="market-order-pane" data-market-order-pane="sell" hidden>${order('sell', 'Vender', 'button-dark', Math.max(1, quantity))}</div></section>`; const auto = asset.autoSellOrder ? `<aside class="market-auto-order active"><div><strong>🤖 Venda automática ativa</strong><span>${asset.autoSellOrder.quantity} unidade(s) ao atingir ${marketMoney(asset.autoSellOrder.targetPrice)} Créditos 51</span></div><form data-market-auto-cancel data-order-id="${escapeHtml(asset.autoSellOrder.id)}"><button class="button button-dark" type="submit">Cancelar</button></form></aside>` : quantity > 0 ? `<details class="market-auto-order"><summary><span>🤖</span><div><strong>Vender no alvo</strong><small>Automatize uma venda quando a cotação chegar onde você quer.</small></div><b>Configurar</b></summary><form data-market-auto-sell data-market-asset="${escapeHtml(asset.id)}"><p>O servidor vende na próxima cotação que alcançar o alvo. F5 ou sair não cancela.</p><div class="market-order-fields"><label>Quantidade<input name="quantity" type="number" min="1" max="${quantity}" step="1" value="${quantity}" required></label><label>Alvo por unidade<input name="targetPrice" type="number" min="${(price + .01).toFixed(2)}" step="0.01" placeholder="Acima de ${marketMoney(price)}" required></label><button class="button button-primary" type="submit">Agendar venda</button></div></form></details>` : ''; return `<article class="card market-asset-card"><header><span class="market-asset-icon">${marketAssetIconMarkup(asset)}</span><div><h3>${escapeHtml(asset.name)}</h3><strong class="market-price"><span>${marketMoney(asset.price)}</span> <small>Créditos 51 / unidade</small> ${arrow}</strong><small class="market-change-label ${asset.direction}">${changeText}</small></div><small class="market-position">${quantity} em carteira<br><b>${marketMoney(asset.positionValue)} Créditos 51</b><span>Pago: ${marketMoney(asset.costBasis)} · <strong class="${holdingPnlClass}">${holdingChange}</strong></span></small></header><div class="market-card-chart">${marketChartMarkup([asset], chartHistory, 120)}</div>${trade}${auto}</article>`; }).join('') || '<p class="market-empty">Carregando cotações…</p>';
  let marketFocusedInput = null;
  for (const draft of marketDrafts) {
    const form = [...root.querySelectorAll('form[data-market-asset]')].find((candidate) => candidate.dataset.marketAsset === draft.asset && (candidate.dataset.marketAction || 'auto') === draft.action);
    if (!form) continue;
    if (draft.expanded && form.closest('details')) form.closest('details').open = true;
    for (const saved of draft.values) {
      const input = [...form.querySelectorAll('input[name]')].find((candidate) => candidate.name === saved.name);
      if (!input) continue;
      input.value = saved.value;
      if (saved.focused) marketFocusedInput = input;
    }
    if (draft.action !== 'auto') updateMarketOrderTotal(form);
  }
  for (const saved of marketTabs) {
    const panel = [...root.querySelectorAll('.market-trade-panel')].find((candidate) => candidate.querySelector('form[data-market-asset]')?.dataset.marketAsset === saved.asset);
    if (!panel) continue;
    panel.querySelectorAll('[data-market-order-tab]').forEach((button) => { const active = button.dataset.marketOrderTab === saved.tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    panel.querySelectorAll('[data-market-order-pane]').forEach((pane) => { const active = pane.dataset.marketOrderPane === saved.tab; pane.classList.toggle('active', active); pane.hidden = !active; });
  }
  if (marketFocusedInput) marketFocusedInput.focus({ preventScroll: true });
  const transactions = Array.isArray(market.transactions) ? market.transactions : [];
  const tradeHistory = $('#marketTradeHistory');
  if (tradeHistory) tradeHistory.innerHTML = transactions.length ? `<div class="market-trade-scroll"><table class="market-trade-table" aria-label="Suas compras e vendas de moedas"><thead><tr><th>Data</th><th>Operação</th><th>Moeda</th><th>Quantidade</th><th>Preço na operação</th><th>Total</th></tr></thead><tbody>${transactions.map((transaction) => { const bought = transaction.side === 'buy'; const automatic = transaction.source === 'auto-sell'; const timestamp = Date.parse(transaction.createdAt) ? new Date(transaction.createdAt).toLocaleString('pt-BR') : 'Data indisponível'; return `<tr><td><time>${escapeHtml(timestamp)}</time></td><td><span class="market-trade-side ${bought ? 'buy' : 'sell'}">${bought ? 'Compra' : automatic ? 'Venda automática' : 'Venda'}</span></td><td>${escapeHtml(transaction.assetName || transaction.assetId || '')}</td><td>${Number(transaction.quantity || 0).toLocaleString('pt-BR')}</td><td>${marketMoney(transaction.price)}${automatic ? `<small> alvo ${marketMoney(transaction.targetPrice)}</small>` : ''}</td><td><strong>${marketMoney(transaction.total)}</strong></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="market-empty">Você ainda não comprou ou vendeu moedas.</p>';
  const historyAssets = marketHistoryAssetId === 'all' ? assets : assets.filter((asset) => asset.id === marketHistoryAssetId);
  const historyLimit = 6; const visibleHistory = marketHistoryExpanded ? history : history.slice(0, historyLimit);
  const historyMarkup = visibleHistory.map((row) => `<div class="market-history-row"><time>${new Date(row.createdAt).toLocaleString('pt-BR')}</time><span>${historyAssets.map((asset) => `${escapeHtml(asset.name)}: ${marketMoney(row.prices?.[asset.id])}`).join(' · ')}</span></div>`).join('');
  $('#marketHistory').innerHTML = history.length ? `${historyMarkup}${history.length > historyLimit ? `<button type="button" class="market-history-toggle" data-market-history-toggle>${marketHistoryExpanded ? 'Recolher histórico' : `Ver histórico completo (${history.length})`}</button>` : ''}` : '<p class="market-empty">O histórico será formado na próxima atualização do servidor.</p>';
}
function cryptoIcon(asset) { return `<span class="crypto-coin-icon"><img src="/crypto51-coin-192.webp" alt=""><b>${escapeHtml(asset.icon)}</b></span>`; }
let cryptoQuoteSyncTimer = null;
let cryptoQuoteSyncInProgress = false;
function scheduleCryptoQuoteSync(delay = 1000) {
  if (cryptoQuoteSyncTimer || cryptoQuoteSyncInProgress) return;
  cryptoQuoteSyncTimer = setTimeout(async () => {
    cryptoQuoteSyncTimer = null;
    if (document.hidden || !navigator.onLine || currentPortalPage() !== 'crypto51' || !appState) return;
    cryptoQuoteSyncInProgress = true;
    try {
      const sync = await api('/api/sync', {}, false);
      if (Number(sync.revision) !== Number(appState.serverRevision)) applyState(await api('/api/state', {}, false));
    } catch {}
    finally {
      cryptoQuoteSyncInProgress = false;
      if (currentPortalPage() === 'crypto51' && !document.hidden) scheduleCryptoQuoteSync(60000);
    }
  }, Math.max(0, delay));
}
function renderCryptoMarket(profile = {}) {
  const market = profile.cryptoMarket || {}; const assets = Array.isArray(market.assets) ? market.assets : [];
  scheduleCryptoQuoteSync();
  const wallet = Number(profile.wallet || 0); const holdings = Number(market.holdingsValue || 0); const pnl = Number(market.unrealizedPnl || 0);
  $('#cryptoWallet').textContent = marketMoney(wallet); $('#cryptoHoldingsValue').textContent = marketMoney(holdings);
  const pnlEl = $('#cryptoUnrealizedPnl'); pnlEl.textContent = `${pnl > 0 ? '+' : ''}${marketMoney(pnl)}`; pnlEl.className = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'flat';
  $('#cryptoUnrealizedLabel').textContent = `${pnl > 0 ? 'lucro' : pnl < 0 ? 'prejuízo' : 'sem variação'} · ${Number(market.unrealizedPnlPercent || 0).toFixed(2).replace('.', ',')}%`;
  const income = market.income || {}; const dailyIncome = income.dailyIncome || {}; const incomeButton = $('#cryptoDailyIncomeButton');
  $('#cryptoDailyIncomeText').textContent = dailyIncome.claimed ? 'Sua Renda Cripto 51 de hoje já foi resgatada. Volte amanhã.' : dailyIncome.eligible ? `Você pode resgatar ${marketMoney(dailyIncome.amount || 0)} Créditos 51 agora.` : `Faça uma atividade válida hoje para liberar ${marketMoney(dailyIncome.amount || 0)} Créditos 51.`;
  $('#cryptoDailyIncomeStatus').textContent = dailyIncome.claimed ? 'Resgatada hoje' : dailyIncome.eligible ? 'Disponível agora' : 'Uma por dia';
  if (incomeButton) { incomeButton.disabled = !dailyIncome.available; incomeButton.textContent = dailyIncome.claimed ? 'Renda resgatada hoje' : 'Resgatar renda diária'; }
  const dividend = income.dividend || {}; $('#cryptoDividendStatus').textContent = `Hoje: ${marketMoney(dividend.paidToday || 0)} / ${marketMoney(dividend.dailyCap || 20)}`;
  const status = $('#cryptoMarketStatus'); const statusText = market.status === 'live' ? 'COTAÇÃO ATIVA' : market.status === 'partial' ? 'COTAÇÃO PARCIAL' : market.status === 'stale' ? 'COTAÇÃO CONGELADA' : 'SINCRONIZANDO'; status.innerHTML = `<i></i> ${statusText}<br><small>Referência externa</small>`;
  $('#cryptoLastUpdate').textContent = market.updatedAt ? `Última cotação: ${new Date(market.updatedAt).toLocaleString('pt-BR')} · atualização a cada ${Number(market.refreshMinutes || 5)} min` : 'Aguardando a primeira cotação do servidor.';
  if (cryptoChartAssetId !== 'all' && !assets.some((asset) => asset.id === cryptoChartAssetId)) cryptoChartAssetId = 'all';
  const cryptoSelect = $('#cryptoChartAsset');
  if (cryptoSelect) { cryptoSelect.innerHTML = `<option value="all">Todas as moedas</option>${assets.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join('')}`; cryptoSelect.value = cryptoChartAssetId; }
  $$('#cryptoChartPeriods [data-crypto-period]').forEach((button) => { const active = button.dataset.cryptoPeriod === cryptoChartPeriod; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const chartHistory = cryptoChartPeriod === '1d' ? market.history : [...(market.dailyHistory || []), ...(market.history || [])];
  const chart = $('#cryptoChart'); if (chart) chart.innerHTML = marketChartMarkup(cryptoChartAssetId === 'all' ? assets : assets.filter((asset) => asset.id === cryptoChartAssetId), marketHistoryForPeriod({ history: chartHistory }, cryptoChartPeriod), 120);
  const sources = $('#cryptoSources'); if (sources) sources.innerHTML = assets.map((asset) => `<div class="market-mover-row ${asset.sourceCount ? 'positive' : 'flat'}"><span class="market-mover-icon">${cryptoIcon(asset)}</span><span><b>${escapeHtml(asset.symbol)} · ${escapeHtml(asset.name)}</b><small>${asset.sourceCount || 0} fonte${asset.sourceCount === 1 ? '' : 's'} válida${asset.sourceCount === 1 ? '' : 's'}</small></span><strong>${asset.externalPrice ? '$ ' + Number(asset.externalPrice).toLocaleString('en-US', { maximumFractionDigits: asset.externalPrice < 1 ? 5 : 2 }) : '—'}</strong></div>`).join('') || '<p class="market-empty">Consultando as fontes públicas…</p>';
  const root = $('#cryptoAssets'); if (!root) return;
  // Não descarte a quantidade enquanto a pessoa está digitando uma ordem.
  // A confirmação de preço no servidor protege contra uma cotação que mudou.
  if (document.activeElement?.matches('[data-crypto-action] input[name="quantity"]') && root.contains(document.activeElement)) return;
  const history = Array.isArray(market.history) ? market.history : [];
  root.innerHTML = assets.map((asset) => { const quantity = Number(asset.quantity || 0); const price = Number(asset.price || 0); const change = Number(asset.change || 0); const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'; const order = (side, label, className, max) => `<form class="market-order" data-crypto-action="${side}" data-crypto-asset="${escapeHtml(asset.id)}" data-market-price="${price}"><div class="market-order-head"><b>${label}</b><output data-market-total>Total da ordem: ${marketMoney((side === "buy" ? Math.ceil(price * 0.001 * 100 - 1e-9) : Math.floor(price * 0.001 * 100 + 1e-9)) / 100)} Créditos 51</output></div><div class="market-order-fields"><label>Quantidade<input name="quantity" type="number" min="0.00000001" max="${max}" step="0.00000001" value="0.001" required></label><button class="button ${className}" type="submit" ${!asset.updatedAt || Date.now() - Date.parse(asset.updatedAt) > 900000 ? "disabled" : ""}>${label}</button></div><div class="market-quick-qty">${[0.0001, 0.001, 0.01, 0.1, 1].map((amount) => `<button type="button" data-crypto-quick="${amount}">${amount}</button>`).join('')}</div></form>`; return `<article class="card market-asset-card"><header><span class="market-asset-icon">${cryptoIcon(asset)}</span><div><h3>${escapeHtml(asset.name)}</h3><strong class="market-price"><span>${price > 0 ? Number(price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : "Cotação indisponível"}</span> <small>Créditos 51 / unidade</small></strong><small class="market-change-label ${direction}">${change > 0 ? '+' : ''}${marketMoney(change)} · ${Number(asset.changePercent || 0).toFixed(2).replace('.', ',')}%</small></div><small class="market-position">${quantity} em carteira<br><b>${marketMoney(asset.positionValue)} Créditos 51</b><span>Pago: ${marketMoney(asset.costBasis)} · <strong class="${Number(asset.unrealizedPnl || 0) >= 0 ? 'positive' : 'negative'}">${Number(asset.unrealizedPnl || 0) >= 0 ? '+' : ''}${marketMoney(asset.unrealizedPnl)}</strong></span></small></header><div class="market-card-chart">${marketChartMarkup([asset], history, 72)}</div>${order('buy', 'Comprar', 'button-primary', 100000)}${order('sell', 'Vender', 'button-dark', Math.max(0.00000001, quantity))}</article>`; }).join('') || '<p class="market-empty">Carregando o Cripto 51…</p>';
  const transactions = Array.isArray(market.transactions) ? market.transactions : []; const trade = $('#cryptoTradeHistory');
  if (trade) trade.innerHTML = transactions.length ? `<div class="market-trade-scroll"><table class="market-trade-table"><thead><tr><th>Data</th><th>Operação</th><th>Ativo</th><th>Quantidade</th><th>Preço</th><th>Total</th></tr></thead><tbody>${transactions.map((item) => `<tr><td>${escapeHtml(new Date(item.createdAt).toLocaleString('pt-BR'))}</td><td><span class="market-trade-side ${item.side === 'buy' ? 'buy' : 'sell'}">${item.side === 'buy' ? 'Compra' : 'Venda'}</span></td><td>${escapeHtml(assets.find((asset) => asset.id === item.assetId)?.name || item.assetId)}</td><td>${Number(item.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</td><td>${marketMoney(item.price)}</td><td><strong>${marketMoney(item.total)}</strong></td></tr>`).join('')}</tbody></table></div>` : '<p class="market-empty">Sua carteira cripto ainda não possui operações.</p>';
}
function optimizeRenderedImages() {
  const apply = () => {
    $$('img:not([data-render-optimized])').forEach((image) => {
      if (!image.closest('header, nav, .topbar')) image.loading = 'lazy';
      image.decoding = 'async';
      image.dataset.renderOptimized = 'true';
    });
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(apply, { timeout: 180 });
  else window.setTimeout(apply, 0);
}

function renderCommunityVotes(community = {}) {
  const host = $('#communityVotes'); if (!host) return;
  const activeField = document.activeElement?.closest?.('#communityVotes textarea, #communityVotes input[name="message"]');
  const focus = activeField ? { key: activeField.dataset.draftKey || 'proposal', start: activeField.selectionStart, end: activeField.selectionEnd } : null;
  const proposalField = host.querySelector('#communityVoteForm textarea[name="subject"]');
  if (proposalField) communityVoteDraft = proposalField.value;
  host.querySelectorAll('.community-comment-form input[name="message"]').forEach((field) => communityCommentDrafts.set(field.dataset.draftKey, field.value));
  const required = community.requiredVote;
  if (required) communityVoteFilter = 'open';
  const avatar = (person, className = 'community-avatar') => person?.avatarDataUrl ? `<img class="${className}" src="${escapeHtml(person.avatarDataUrl)}" alt="">` : `<span class="${className}">${escapeHtml(initials(person?.name || person?.authorName || '?'))}</span>`;
  const allVotes=community.votes||[];
  const filterCounts={open:allVotes.filter(item=>item.status==='open').length,approved:allVotes.filter(item=>item.status!=='archived'&&item.outcome==='approved'&&item.implementationStatus!=='done').length,implemented:allVotes.filter(item=>item.status!=='archived'&&item.outcome==='approved'&&item.implementationStatus==='done').length,rejected:allVotes.filter(item=>item.status!=='archived'&&item.outcome==='rejected').length,archived:allVotes.filter(item=>item.status==='archived').length};
  const filterMatches=(item)=>communityVoteFilter==='archived'?item.status==='archived':item.status==='archived'?false:communityVoteFilter==='open'?item.status==='open':communityVoteFilter==='approved'?item.outcome==='approved'&&item.implementationStatus!=='done':communityVoteFilter==='implemented'?item.outcome==='approved'&&item.implementationStatus==='done':item.outcome==='rejected';
  const visibleVotes=required?allVotes.filter((item)=>item.id===required.id):allVotes.filter(filterMatches);
  const filterLabel={open:'Em votação',approved:'Aprovadas',implemented:'Implementadas',rejected:'Não aprovadas',archived:'Arquivadas'};
  const filterBar=`<nav class="community-vote-filters" aria-label="Filtrar votações">${Object.entries(filterLabel).map(([key,label])=>`<button type="button" data-community-filter="${key}" class="${communityVoteFilter===key?'active':''}" aria-pressed="${communityVoteFilter===key}"><span>${label}</span><b>${filterCounts[key]}</b></button>`).join('')}</nav>`;
  const cards = visibleVotes.map((item) => {
    const open=item.status==='open', total=Number(item.favor||0)+Number(item.against||0);
    const people=item.voters?.length ? item.voters.map((person) => `<li class="${person.vote}">${avatar(person,'community-voter-avatar')}<span><strong>${escapeHtml(person.name)}</strong><small>${person.vote==='favor'?'A favor':'Contra'}</small></span></li>`).join('') : '<li class="community-no-votes">Ainda sem votos.</li>';
    const comments=item.comments?.length ? item.comments.map((comment) => `<li>${avatar(comment,'community-comment-avatar')}<div><strong>${escapeHtml(comment.name)}</strong><p>${escapeHtml(comment.message)}</p></div>${comment.canDelete?`<button type="button" class="community-comment-delete" data-community-comment-delete="${escapeHtml(comment.id)}" data-community-vote-id="${escapeHtml(item.id)}">Excluir</button>`:''}</li>`).join('') : '<li class="community-no-comments">Ainda não há comentários. Abra a conversa.</li>';
    const action=item.canVote ? `<div class="community-vote-actions"><button class="button button-primary" data-community-vote="favor" data-community-vote-id="${item.id}" type="button">✓ A favor</button><button class="button button-dark" data-community-vote="against" data-community-vote-id="${item.id}" type="button">× Contra</button></div>` : item.myVote ? `<p class="community-my-vote">Seu voto: <strong>${item.myVote==='favor'?'A favor':'Contra'}</strong></p>` : `<p class="community-my-vote">${open?'Sua conta não está apta a votar.':'Votação encerrada.'}</p>`;
    const isAdmin=appState?.me?.role==='admin';
    const admin=isAdmin&&item.status!=='archived'?`<div class="community-admin-actions">${open?`<button data-community-admin="close" data-community-vote-id="${item.id}" type="button">Encerrar votação</button>`:''}${item.outcome==='approved'&&item.implementationStatus!=='done'?`<button data-community-admin="implemented" data-community-vote-id="${item.id}" type="button">Marcar como implementada</button>`:''}<button data-community-admin="archive" data-community-vote-id="${item.id}" type="button">Arquivar</button></div>`:'';
    const commentDraft=communityCommentDrafts.get(item.id)||'';
    const statusLabel=item.status==='archived'?'ARQUIVADA':open?`ABERTA · MAIORIA ${item.majorityThreshold}`:item.outcome==='approved'?(item.implementationStatus==='done'?'IMPLEMENTADA':'APROVADA · AGUARDANDO IMPLEMENTAÇÃO'):item.outcome==='rejected'?(item.closedBy==='automatic-deadline'?'NÃO APROVADA · PRAZO ENCERRADO':'NÃO APROVADA'):'ENCERRADA';
    const deadline=open&&item.expiresAt?`<p class="community-deadline">Encerra em ${escapeHtml(formatDate(item.expiresAt))}. Seu voto é necessário para continuar usando o portal.</p>`:'';
    const adminDecision=item.outcome==='rejected'&&item.implementationStatus==='done'&&item.implementationReason==='admin-decision'?'<p class="community-admin-decision">✓ Implementada por decisão administrativa. O resultado original da votação foi preservado.</p>':'';
    return `<article class="community-vote-card ${required?.id===item.id?'required':''} ${item.outcome||''}"><header><div class="community-author">${avatar({name:item.authorName,avatarDataUrl:item.authorAvatarDataUrl})}<div class="community-author-copy"><small>PROPOSTA POR</small><strong>${escapeHtml(item.authorName)}</strong></div></div><b class="community-status ${item.status}">${statusLabel}</b></header><h3>${escapeHtml(item.subject)}</h3>${item.imageUrl?`<a class="community-vote-image" href="${escapeHtml(item.imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(item.imageUrl)}" alt="Imagem anexada à pauta" loading="lazy"><span>Ampliar imagem</span></a>`:''}${deadline}${adminDecision}<div class="community-totals"><span>A favor <strong>${item.favor}</strong></span><span>Contra <strong>${item.against}</strong></span><small>${total} de ${item.eligibleTotal} votos · maioria ${item.majorityThreshold}</small></div>${action}<section class="community-history"><small>HISTÓRICO DE VOTOS</small><ul class="community-voters">${people}</ul></section><section class="community-comments"><div><small>CONVERSA DA PAUTA</small><span>${item.comments?.length||0}/50</span></div><ul>${comments}</ul>${open?`<form class="community-comment-form" data-community-comment-id="${item.id}"><input data-draft-key="${item.id}" name="message" maxlength="500" required value="${escapeHtml(commentDraft)}" placeholder="Comente a proposta para a tripulação"><button class="button button-dark" type="submit">Comentar</button></form>`:'<p class="community-comments-closed">Comentários encerrados com a pauta.</p>'}</section>${admin}</article>`;
  }).join('');
  host.innerHTML=`${required?`<aside class="community-required">🗳️ <strong>Seu voto é necessário.</strong> A pauta encerra às ${escapeHtml(formatDate(required.expiresAt))}. Escolha A favor ou Contra para continuar usando o portal.</aside>`:''}${required?'':`<article class="community-propose"><div class="community-propose-copy"><small>DECISÕES DA TRIPULAÇÃO</small><h3>Propor uma pauta</h3><p>Melhorias, implementações ou remoções entram aqui para discussão e voto coletivo. A pauta dura 48 horas e encerra automaticamente ao atingir a maioria.</p></div><form id="communityVoteForm"><label for="communityVoteSubject">Sua proposta</label><textarea data-draft-key="proposal" id="communityVoteSubject" name="subject" minlength="8" maxlength="280" required placeholder="Ex.: Devemos adicionar uma nova atividade semanal?">${escapeHtml(communityVoteDraft)}</textarea><div class="community-attachment"><label for="communityVoteImage">Imagem opcional · PNG, JPG ou WEBP até 2 MB</label><input id="communityVoteImage" type="file" accept="image/png,image/jpeg,image/webp">${communityVoteImageDraft?`<span>${escapeHtml(communityVoteImageDraft.name)}</span><button type="button" data-community-remove-image>Remover imagem</button>`:''}</div><div><small>Até 280 caracteres · a pauta fica aberta por 48 horas.</small><button class="button button-primary" type="submit">Abrir votação</button></div></form></article>${filterBar}`}<div class="community-vote-grid">${cards||`<p class="community-empty">Nenhuma pauta em “${filterLabel[communityVoteFilter]}”.</p>`}</div>`;
  if (focus) { const next=host.querySelector(`[data-draft-key="${CSS.escape(focus.key)}"]`); if (next) { next.focus(); next.setSelectionRange(focus.start,focus.end); } }
}

// Atualiza somente a área aberta. As demais páginas continuam com os dados no
// estado em memória e são renderizadas no momento da navegação.
function renderActivePortalPage(data = appState) {
  if (!data || renderingActivePortalPage) return;
  renderingActivePortalPage = true;
  try {
    const page = currentPortalPage();
    // Durante uma caçada, o encontro já está montado no body. Não reconstrua
    // a Pokédex nem os demais setores: isso criaria uma cópia oculta do alvo e
    // poderia fazê-lo sumir ao entrar exatamente na página sorteada.
    if (cobblemonPageEncounter) {
      optimizeRenderedImages();
      renderedPortalPage = page;
      return;
    }
    if (page === 'memes') {
      renderGallery(); renderDailyWall(data.dailyWall); renderAnonymousWall(data.anonymousWall);
    } else if (page === 'sorteio') {
      renderWorkflow(); renderRoundSummary(); renderAssignments(); renderDraws(); renderVoting(); drawWheel();
    } else if (page === 'inscricoes') {
      renderWorkflow(); renderGallery();
    } else if (page === 'anonimos') renderAnonymousWall(data.anonymousWall);
    else if (page === 'agua') renderHydration(data.hydration);
    else if (page === 'mentirometro') renderLieMeter(data.lieMeter);
    else if (page === 'misterio') renderMystery(data.mystery);
    else if (page === 'impostor') renderImpostor(data.impostor);
    else if (['perfil', 'cobblemon', 'album', 'loja'].includes(page)) renderProfileEconomy(data.profile);
    else if (page === 'classificacao') { renderRankings(); renderSeason(data.season); }
    else if (page === 'passe') renderNextSeasonPassPreview();
    else if (page === 'jogos') renderCasino(data.casino);
    else if (page === 'loteria' && !lotteryDrawInProgress) renderLottery(data.casino?.lottery);
    else if (page === 'mercado') renderInvestmentMarket(data.profile);
    else if (page === 'crypto51') renderCryptoMarket(data.profile);
    else if (page === 'votacoes') renderCommunityVotes(data.communityVotes);
    else if (page === 'atualizacoes') renderReleaseHistory();
    else if (page === 'admin') renderAdmin();
    optimizeRenderedImages();
  } finally {
    renderedPortalPage = currentPortalPage();
    renderingActivePortalPage = false;
  }
}

async function acknowledgeAnnouncement() {
  const dialog = $('#announcementDialog'); const id = dialog.dataset.announcementId;
  if (dialog.open) dialog.close();
  if (!id) return;
  try { applyState(await api('/api/announcement/seen', { method: 'POST', body: { id } })); }
  catch (error) { showToast(error.message, 'error'); }
}

function showReleaseNotice() {
  if (!releaseNoticeLoaded || releaseNoticeChecked || !appState?.me) return;
  if (cobblemonOpeningLocked || cobblemonFlowLocked) { cobblemonDeferredReleaseNotice = true; return; }
  releaseNoticeChecked = true;
  const storage = window.localStorage;
  const version = RELEASE_NOTICE.version;
  const pending = storage.getItem('area51-release-pending');
  const seen = storage.getItem('area51-release-seen');
  // Esta publicação deve ser apresentada também a quem abrir o portal já na nova versão.
  const notesMode = pending === version || (!releaseNoticeRequiresUpdate && seen !== version);
  if (seen === version && !notesMode) return;
  if (!notesMode && !releaseNoticeRequiresUpdate) return;
  const dialog = $('#releaseNoticeDialog');
  if (!dialog) return;
  if (!dialog.dataset.locked) {
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    dialog.addEventListener('click', (event) => { if (event.target === dialog && pending !== version) event.preventDefault(); });
    dialog.dataset.locked = 'true';
  }
  dialog.innerHTML = notesMode
    ? '<span class="release-notice-icon" aria-hidden="true">✨</span><small>ATUALIZAÇÃO CONCLUÍDA</small><h2>' + escapeHtml(RELEASE_NOTICE.title) + '</h2><p>' + escapeHtml(RELEASE_NOTICE.notes) + '</p><div class="release-notice-actions"><button class="button button-primary" data-release-ack type="button">Entendi</button><button class="button button-dark" data-release-history type="button">Ver atualizações</button></div>'
    : '<span class="release-notice-icon" aria-hidden="true">🚀</span><small>NOVA VERSÃO DISPONÍVEL</small><h2>Atualize a Área 51</h2><p>Uma melhoria acabou de ser publicada. Atualize agora para continuar com a versão mais recente.</p><button class="button button-primary" data-release-update type="button">Atualizar agora</button>';
  if (dialog.open) dialog.close();
  dialog.showModal();
  dialog.querySelector('[data-release-update]')?.addEventListener('click', async () => {
    storage.setItem('area51-release-pending', version);
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations || []).map((registration) => registration.update()));
      const cacheKeys = await caches?.keys?.();
      await Promise.all((cacheKeys || []).filter((key) => key.startsWith('area51-static-')).map((key) => caches.delete(key)));
    } catch {}
    const next = new URL(location.href);
    next.searchParams.set('area51-update', version);
    location.replace(next.toString());
  });
  dialog.querySelector('[data-release-ack]')?.addEventListener('click', () => {
    storage.removeItem('area51-release-pending');
    storage.setItem('area51-release-seen', version);
    dialog.close();
  });
  dialog.querySelector('[data-release-history]')?.addEventListener('click', () => {
    storage.removeItem('area51-release-pending');
    storage.setItem('area51-release-seen', version);
    dialog.close();
    showPortalPage('atualizacoes', true);
  });
}

async function checkPublishedRelease() {
  if (!appState?.me) return;
  if (releaseCheckPromise) return releaseCheckPromise;
  releaseCheckPromise = (async () => {
    try {
      const response = await fetch('/release.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const remote = await response.json();
      releaseNoticeRequiresUpdate = Boolean(remote?.version && String(remote.version) !== APP_RELEASE_VERSION);
      if (remote?.version && remote.version !== RELEASE_NOTICE.version) {
        RELEASE_NOTICE.version = String(remote.version);
        RELEASE_NOTICE.title = String(remote.title || 'Atualização da Área 51');
        RELEASE_NOTICE.notes = String(remote.notes || 'Correções e melhorias na Área 51.');
        releaseNoticeChecked = false;
      }
    } catch {}
    finally {
      // Só exibimos depois de conhecer a versão publicada. Isso evita abrir o
      // aviso embutido e, logo em seguida, reabri-lo com o release.json.
      releaseNoticeLoaded = true;
      showReleaseNotice();
    }
  })();
  try { await releaseCheckPromise; } finally { releaseCheckPromise = null; }
}

function releaseDateLabel(value) {
  const text = String(value || '').trim();
  if (!text) return 'Data não informada';
  const date = new Date(text.length === 10 ? text + 'T12:00:00' : text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function fallbackReleaseHistory() {
  return [{
    version: RELEASE_NOTICE.version,
    publishedAt: new Date().toISOString().slice(0, 10),
    title: RELEASE_NOTICE.title,
    notes: [RELEASE_NOTICE.notes],
  }];
}

async function loadReleaseHistory() {
  if (Array.isArray(releaseHistory)) return releaseHistory;
  if (releaseHistoryPromise) return releaseHistoryPromise;
  releaseHistoryPromise = (async () => {
    try {
      const response = await fetch('/release-history.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Histórico indisponível');
      const payload = await response.json();
      const releases = Array.isArray(payload?.releases) ? payload.releases : [];
      releaseHistory = releases
        .filter((item) => item && item.version && item.title)
        .map((item) => ({
          version: String(item.version),
          publishedAt: String(item.publishedAt || ''),
          title: String(item.title),
          notes: Array.isArray(item.notes) ? item.notes.map((note) => String(note)).filter(Boolean).slice(0, 8) : [String(item.notes || '')].filter(Boolean),
        }));
      if (!releaseHistory.length) releaseHistory = fallbackReleaseHistory();
    } catch {
      releaseHistory = fallbackReleaseHistory();
    }
    return releaseHistory;
  })();
  try { return await releaseHistoryPromise; } finally { releaseHistoryPromise = null; }
}

function renderReleaseHistory() {
  const host = $('#releaseHistory');
  if (!host) return;
  if (!Array.isArray(releaseHistory)) {
    host.innerHTML = '<p class="release-history-empty">Carregando histórico de atualizações…</p>';
    loadReleaseHistory().then(() => {
      if (currentPortalPage() === 'atualizacoes') renderReleaseHistory();
    });
    return;
  }
  host.innerHTML = releaseHistory.map((item, index) => {
    const notes = item.notes.length ? '<ul>' + item.notes.map((note) => '<li>' + escapeHtml(note) + '</li>').join('') + '</ul>' : '';
    return '<article class="card release-entry' + (index === 0 ? ' is-latest' : '') + '"><header><div><small>' + (index === 0 ? 'VERSÃO ATUAL' : 'ATUALIZAÇÃO PUBLICADA') + '</small><h3>' + escapeHtml(item.title) + '</h3></div><p><b>' + escapeHtml(item.version) + '</b><time datetime="' + escapeHtml(item.publishedAt) + '">' + escapeHtml(releaseDateLabel(item.publishedAt)) + '</time></p></header>' + notes + '</article>';
  }).join('');
}

function applyProfileMutation(data) {
  if (!appState || !data?.profile) return;
  appState = { ...appState, profile: data.profile };
  if (appState.casino) {
    appState.casino = {
      ...appState.casino,
      shopWallet: Number(data.profile.wallet || 0),
      closedBoxes: Array.isArray(data.profile.mysteryBoxes) ? data.profile.mysteryBoxes.length : appState.casino.closedBoxes,
    };
  }
  renderProfileEconomy(data.profile);
  document.dispatchEvent(new CustomEvent('area51:state', { detail: appState }));
}

function applyState(data) {
  const incomingRevision = Math.max(0, Number(data?.serverRevision || 0));
  if (incomingRevision && incomingRevision < lastAppliedServerRevision) return;
  if (incomingRevision) lastAppliedServerRevision = incomingRevision;
  if (appState && (cobblemonOpeningLocked || cobblemonFlowLocked)) { cobblemonDeferredState = true; return; }
  const previousPhase = appState && appState.workflow ? appState.workflow.phase : null;
  const previousForcedCursorId = appState?.profile?.haterCurse?.id || appState?.profile?.givaldoCurse?.id || appState?.profile?.forcedCursor?.id || null;
  const incomingReleaseVersion = Math.max(0, Number(data.settings?.releaseVersion || 0));
  let releaseChanged = false;
  if (knownReleaseVersion === null) knownReleaseVersion = incomingReleaseVersion;
  else if (incomingReleaseVersion > knownReleaseVersion) {
    knownReleaseVersion = incomingReleaseVersion;
    releaseChanged = true;
    releaseNoticeLoaded = false;
    releaseNoticeChecked = false;
  }
  appState = data;
  // Desde a abertura, a pauta pendente assume a tela também após atualizar
  // o navegador. O servidor mantém o mesmo bloqueio nas ações protegidas.
  if (data.communityVotes?.requiredVote && currentPortalPage() !== 'votacoes') {
    setTimeout(() => showPortalPage('votacoes', true), 0);
  }
  recoverPendingPlinkoBets();
  const activeCurse = data.profile?.haterCurse || data.profile?.givaldoCurse || data.profile?.forcedCursor;
  // Atualizações e sincronizações não são uma nova maldição. Guardamos o id
  // recebido neste tab para exibir o aviso apenas na chegada da ocorrência.
  const seenForcedCurseId = sessionStorage.getItem(FORCED_CURSE_NOTICE_KEY);
  if (activeCurse?.id && activeCurse.id !== previousForcedCursorId && activeCurse.id !== announcedForcedCursorId && activeCurse.id !== seenForcedCurseId && !activeCurse.automatic && !activeCurse.debt) {
    announcedForcedCursorId = activeCurse.id;
    sessionStorage.setItem(FORCED_CURSE_NOTICE_KEY, activeCurse.id);
    const label = activeCurse.style === 'hater' ? 'Maldição do Hater por 24 horas' : activeCurse.style === 'givaldo' ? 'Maldição Givaldo por 24 horas' : activeCurse.style === 'giant-slow' ? 'Mouse Gigante e Lento por 24 horas' : activeCurse.style === 'adhd' ? 'Maldição TDAH ativa' : activeCurse.style === 'dev-dark' ? 'Maldição do Dev por 24 horas' : activeCurse.style === 'cleaning' ? 'Maldição da Limpeza: nova sujeira a cada hora por 24 horas' : 'Seta Gay Compulsória ativa';
    setTimeout(() => showToast('⚠️ Você foi alvo: ' + label + '. A autoria permanece sigilosa.', 'error'), 0);
  }
  serverClockOffset = Number(data.serverTime || Date.now()) - Date.now();
  scheduleLotteryReminder(data.casino?.lottery || {});
  scheduleLotteryDraw(data.casino?.lottery || {});
  musicEpoch = Number(data.musicEpoch || musicEpoch || Date.now());
  renderOnlinePeople();
  if (musicPrimedByGesture) startMusic();
  document.body.classList.toggle('admin-command-mode', data.me.role === 'admin');
  applyVisualTheme(data);
  applySeasonalEvent(data.seasonalEvent);
  document.dispatchEvent(new CustomEvent('area51:state', { detail: data }));
  renderRequiredLieVote(data.lieMeter?.requiredVote || null);
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
  renderProfileEconomy(data.profile, true);
  const pendingShield = data.profile?.activePowers?.pendingGayShield;
  if (!pendingShield) pendingShieldDialogIdShown = null;
  else if (pendingShield.id !== pendingShieldDialogIdShown && !$('#shieldDecisionDialog')?.open) {
    pendingShieldDialogIdShown = pendingShield.id;
    showShieldOffer({ pendingShield: true, pendingId: pendingShield.id, shieldTargetId: data.me.id, shieldTargetName: data.me.displayName, winner: data.me.displayName });
  }
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
  // Elementos globais que precisam refletir o perfil mesmo quando outra aba está aberta.
  const isAdmin = data.me.role === 'admin';
  $('#adminNav').classList.toggle('hidden', !isAdmin);
  $('#admin').classList.toggle('hidden', !isAdmin);
  $('#adminLiveChecklist').classList.toggle('hidden', !isAdmin);
  renderFeatureAvailability(data.settings?.featureFlags); renderTodayHub(data); renderNotifications(); renderAnnouncement(data.announcement); maybeShowWaterReminder(data.hydration); renderActivePortalPage(data);
  setTimeout(() => { if (releaseChanged) checkPublishedRelease(); else showReleaseNotice(); }, 0);
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
  const resetThemeDrawButton = $('#resetThemeDrawButton');
  const canResetThemeDraw = data.me.role === 'admin'
    && data.workflow.phase === 'uploads'
    && Boolean(data.workflow.currentTheme)
    && data.submissions.length === 0
    && data.assignments.length === 0;
  resetThemeDrawButton.classList.toggle('hidden', !canResetThemeDraw);
  resetThemeDrawButton.disabled = !canResetThemeDraw;
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

async function createWatermarkedWallpaper(result, replacementUrl = '') {
  if (watermarkGenerationIds.has(result.id)) return;
  watermarkGenerationIds.add(result.id);
  const status = $('#watermarkStatus');
  const download = $('#downloadWatermark');
  const retry = $('#retryWatermarkButton');
  retry.disabled = true;
  status.textContent = 'Preparando a marca d’água no wallpaper de ' + result.winner + '…';
  status.classList.remove('hidden');
  download.classList.add('hidden');
  const sourceUrl = replacementUrl || result.watermarkSourceUrl;
  if (!sourceUrl) {
    status.textContent = 'Imagem de origem indisponível. O administrador pode enviar uma imagem para aplicar a logo.';
    retry.disabled = false;
    watermarkGenerationIds.delete(result.id);
    return;
  }
  try {
    const [source, logo] = await Promise.all([loadImage(sourceUrl), loadImage('/gay-da-rodada.png')]);
    const output = document.createElement('canvas');
    const scale = Math.min(1, 2560 / Math.max(source.naturalWidth, source.naturalHeight));
    output.width = Math.max(1, Math.round(source.naturalWidth * scale));
    output.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const outputCtx = output.getContext('2d');
    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = 'high';
    outputCtx.drawImage(source, 0, 0, output.width, output.height);
    const logoWidth = Math.min(output.width * .26, 560);
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
    let blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (blob?.size > 7.5 * 1024 * 1024) blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', .9));
    if (blob?.size > 7.5 * 1024 * 1024) blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', .8));
    if (!blob) throw new Error('Falha ao gerar a imagem.');
    if (blob.size > 7.5 * 1024 * 1024) throw new Error('Imagem marcada ainda excede o limite de envio.');
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    let savedExtension = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const saved = await api('/api/draw/gay-watermark', {
      method: 'POST', timeoutMs: 60000,
      body: { drawId: result.id, dataUrl },
    });
    const permanentUrl = saved?.watermarkedUrl;
    if (!permanentUrl) throw new Error('O servidor não confirmou o salvamento da imagem.');
    savedExtension = saved?.extension || savedExtension;
    download.href = permanentUrl;
    download.download = 'gay-da-rodada-' + result.winner.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') + '.' + savedExtension;
    download.classList.remove('hidden');
    status.textContent = '✓ Logo aplicada e imagem salva. Download liberado para o sorteado.';
    $('#watermarkRecovery').classList.add('hidden');
    const savedDraw = (appState?.draws || []).find((item) => item.id === result.id);
    if (savedDraw) { savedDraw.watermarkedUrl = permanentUrl; savedDraw.watermarkedExtension = savedExtension; savedDraw.canGenerateWatermark = false; renderDraws(); renderVoting(); renderAssignments(); }
  } catch (error) {
    status.textContent = 'Não foi possível salvar o wallpaper com logo: ' + (error?.message || 'falha desconhecida') + '. Tente novamente ou peça ao administrador para enviar a imagem.';
  } finally {
    retry.disabled = false;
    watermarkGenerationIds.delete(result.id);
  }
}

function showWinner(result) {
  const isTheme = result.type === 'theme';
  const isThemeFinalist = isTheme && result.themeStage === 'finalist';
  const isGay = result.type === 'gay';
  activeGayWatermarkResult = isGay ? result : null;
  const canRecover = isGay && (appState?.me?.role === 'admin' || appState?.me?.id === result.winnerId) && !result.watermarkedUrl;
  $('#watermarkRecovery').classList.toggle('hidden', !canRecover);
  $('#adminWatermarkUpload').classList.toggle('hidden', !(canRecover && appState?.me?.role === 'admin'));
  $('#watermarkSourceFile').value = '';
  $('#winnerDialog').classList.toggle('is-gay-winner', isGay);
  $('#winnerDialog').classList.toggle('is-theme-winner', isTheme);
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
  if (canRecover && result.watermarkSourceUrl) createWatermarkedWallpaper(result);
  else if (isGay && (appState?.me?.role === 'admin' || appState?.me?.id === result.winnerId)) {
    api('/api/state').then((state) => {
      const savedDraw = (state.draws || []).find((item) => item.id === result.id && item.type === 'gay');
      if (savedDraw?.canGenerateWatermark && savedDraw.watermarkSourceUrl && $('#winnerDialog').open) createWatermarkedWallpaper(savedDraw);
    }).catch(() => {});
  }
  playTone(660, .25, .06); setTimeout(() => playTone(880, .4, .05), 180);
}

$('#retryWatermarkButton').addEventListener('click', async () => {
  const result = activeGayWatermarkResult;
  if (!result || (appState?.me?.role !== 'admin' && appState?.me?.id !== result.winnerId)) return;
  try {
    const state = await api('/api/state');
    const latest = (state.draws || []).find((item) => item.id === result.id && item.type === 'gay');
    if (!latest || latest.watermarkedUrl) { showToast('O wallpaper já foi salvo ou o sorteio não está mais disponível.'); return; }
    activeGayWatermarkResult = latest;
    await createWatermarkedWallpaper(latest);
  } catch (error) {
    $('#watermarkStatus').textContent = 'Não foi possível consultar o sorteio: ' + (error?.message || 'tente novamente.');
    $('#watermarkStatus').classList.remove('hidden');
  }
});

$('#watermarkSourceFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  const result = activeGayWatermarkResult;
  if (!file || !result || appState?.me?.role !== 'admin') return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    showToast('Envie uma imagem PNG, JPG ou WEBP de até 20 MB.');
    event.target.value = '';
    return;
  }
  if (!confirm('Aplicar a logo à imagem “' + file.name + '” para ' + result.winner + '? Confira se é o wallpaper correto.')) {
    event.target.value = '';
    return;
  }
  const sourceUrl = URL.createObjectURL(file);
  try { await createWatermarkedWallpaper(result, sourceUrl); }
  finally { URL.revokeObjectURL(sourceUrl); event.target.value = ''; }
});

function showShieldOffer(result) {
  const isMine = result.shieldTargetId && appState?.me?.id === result.shieldTargetId;
  if (!isMine) {
    showToast('O sorteio aguarda a decisão de ' + (result.shieldTargetName || result.winner) + ' sobre o Escudo da Rodada.');
    return;
  }
  const dialog = $('#shieldDecisionDialog');
  if (!dialog) return;
  $('#shieldDecisionName').textContent = result.winner || 'você';
  $('#shieldDecisionMessage').textContent = 'Você possui um Escudo da Rodada. Use-o para remover seu nome e reabrir o sorteio, ou mantenha o resultado e abra a votação.';
  $('#shieldDecisionStatus').textContent = '';
  dialog.dataset.pendingId = result.pendingId || '';
  $('#useShieldButton').disabled = false;
  $('#keepGayButton').disabled = false;
  if (dialog.open) dialog.close();
  dialog.showModal();
  playTone(520, .2, .05);
}

function selectLiveMode(mode) {
  setMode(mode);
}

function finishLiveDraw(result) {
  $('.wheel-stage').classList.remove('is-spinning');
  document.body.classList.remove('roulette-cinema');
  musicForcedBySpin = false;
  if (result.pendingShield) showShieldOffer(result); else showWinner(result);
  api('/api/state').then((data) => {
    spinning = false; liveWheelItems = null; canvas.style.transition = '';
    applyState(data);
  }).catch(() => {
    spinning = false; liveWheelItems = null; canvas.style.transition = '';
    drawWheel(); updateSpinControl();
  });
}

function liveDrawSchedule(payload, clientNow = Date.now(), offset = serverClockOffset) {
  const startedAt = Number(payload.startedAt || clientNow + offset);
  const endsAt = Number(payload.endsAt || startedAt + Number(payload.duration || 5900));
  return { startedAt, endsAt, delay: Math.max(0, startedAt - (clientNow + offset)), remaining: Math.max(0, endsAt - (clientNow + offset)) };
}

function receiveLiveDraw(payload) {
  const result = payload && payload.result;
  if (!appState || !result || handledDraws.has(result.id)) return;
  if (currentPortalPage() !== 'sorteio') showPortalPage('sorteio', false, false);
  // O horário no pacote foi registrado antes do trânsito da rede. Recalcular
  // o relógio na chegada apagaria esse trânsito e atrasaria este navegador.
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
  const schedule = liveDrawSchedule(payload);
  liveSpinStartTimer = setTimeout(() => {
    const items = liveWheelItems || [];
    const index = Math.max(0, items.findIndex((item) => item.id === result.winnerId));
    const step = 360 / Math.max(1, items.length);
    const desired = (360 - ((index + .5) * step % 360)) % 360;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const untilEnd = liveDrawSchedule(payload).remaining;
    const visualDuration = reduced ? 100 : untilEnd;
    canvas.style.transition = 'transform ' + visualDuration + 'ms cubic-bezier(.12,.7,.05,1)';
    wheelRotation = 360 * 7 + desired;
    canvas.style.transform = 'rotate(' + wheelRotation + 'deg)';
    liveSpinFinishTimer = setTimeout(() => finishLiveDraw(result), untilEnd + 80);
  }, schedule.delay);
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
    let reason = '';
    try { reason = JSON.parse(event.data).reason || ''; } catch {}
    if (reason.startsWith('gay-shield-used:')) {
      const userName = reason.slice('gay-shield-used:'.length) || 'A pessoa sorteada';
      showToast('🛡️ ' + userName + ' usou o Escudo da Rodada. Novo sorteio em andamento…');
    }
    if (reason === 'economy' && (casinoAutoRun || casinoSpinInProgress || slotSpinInProgress)) return;
    if (spinning || casinoSpinInProgress || mysteryOpeningInProgress) return;
    if (reason === 'feedback') {
      refreshFeedback(true);
      return;
    }
    api('/api/state').then((data) => {
      if (reason === 'cobblemon-server-management') applyCobblemonServerManagementState(data);
      else applyState(data);
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
  event.preventDefault(); primeMusicFromGesture(false); const form = event.currentTarget; $('#loginError').textContent = ''; setBusy(form, true);
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
  event.preventDefault(); primeMusicFromGesture(false); const form = event.currentTarget; $('#registerError').textContent = ''; setBusy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form));
    const data = await api('/api/register', { method: 'POST', body: values });
    form.reset(); setAuthTab('login');
    $('#loginError').textContent = data.message || 'Conta enviada para aprovação do administrador.';
    showToast('Conta criada! Aguarde a aprovação do administrador.');
  } catch (error) { $('#registerError').textContent = error.message; }
  finally { setBusy(form, false); }
});

async function logoutSession() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showAuth();
}
$('#logoutButton')?.addEventListener('click', logoutSession);
$('#passwordButton')?.addEventListener('click', () => openPasswordDialog(false));
$('#themeToggle')?.addEventListener('click', () => {});
$('#musicToggle')?.addEventListener('click', () => {
  if (musicIsPlaying() && !isMusicLockedForDrawDay() && !isMusicFixedForDrawPage()) {
    persistMusicPreference(false); pauseMusic();
    showToast('Música da rodada desativada.');
    return;
  }
  musicPrimedByGesture = true;
  primeMusicFromGesture(true);
  startMusic(true).then(() => {
    if (!musicIsPlaying()) showToast('Não foi possível tocar a trilha agora. Verifique o som do navegador.', 'error');
  });
});
$('#volumeDownButton')?.addEventListener('click', () => {
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
$('#resetThemeDrawButton').addEventListener('click', async () => {
  if (!confirm('Limpar somente o tema sorteado e liberar uma nova roleta?')) return;
  const button = $('#resetThemeDrawButton');
  button.disabled = true;
  try {
    const state = await api('/api/admin/theme-draw/reset', { method: 'POST' });
    applyState(state);
    showToast('Tema limpo. A roleta está pronta para um novo sorteio.');
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
});
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
  if (!confirm('Deseja realmente enviar este wallpaper? Depois de confirmar, você não poderá removê-lo ou trocá-lo nesta rodada.')) return;
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
  $('#adminUploadSubmit').textContent = 'Enviar em nome da pessoa';
  $('#adminUploadStatus').textContent = '🔒 Somente o administrador verá quem realizou o envio assistido. Após confirmar, o wallpaper não poderá ser trocado.';
  $('#adminUploadStatus').classList.remove('warning');
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
  if (!confirm('Deseja realmente enviar este wallpaper para ' + option?.textContent?.trim() + '? Depois de confirmar, ele não poderá ser removido ou trocado nesta rodada.')) return;
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

function clearMemeSelection() {
  selectedMemeFile = null;
  if (memePreviewObjectUrl) URL.revokeObjectURL(memePreviewObjectUrl);
  memePreviewObjectUrl = null;
  $('#memeFile').value = '';
  $('#memePreview').classList.add('hidden');
  $('#memeFileName').textContent = 'Escolher meme';
}

async function normalizeMemeDataUrl(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    // Feed não precisa da resolução de wallpaper: 1280px preserva leitura em
    // desktop e reduz bastante o download e a decodificação no mural.
    const maxSide = 1280;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    output.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = output.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0, output.width, output.height);
    for (const quality of [.82, .72, .62, .52]) {
      const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 650 * 1024) return fileToDataUrl(blob);
    }
    throw new Error('Não foi possível reduzir a imagem para publicação.');
  } catch (error) {
    throw new Error(error.message || 'Não foi possível preparar esta imagem para o feed.');
  } finally { URL.revokeObjectURL(objectUrl); }
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
    applyState(await api('/api/daily-wall/phrases', { method: 'POST', body: { phrase, anonymous: Boolean($('#dailyPhraseAnonymous').checked) } }));
    form.reset(); closeMentionList($('#dailyPhraseInput')); clearMentionSelection($('#dailyPhraseInput'));
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
function updateMemeCaptionCount() {
  const counter = $('#memeCaptionCount');
  if (counter) counter.textContent = $('#memeCaption').value.length + '/' + $('#memeCaption').maxLength + ' caracteres';
}
$('#memeCaption').addEventListener('input', updateMemeCaptionCount);
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
      form.reset(); updateMemeCaptionCount(); closeMentionList($('#memeCaption')); clearMentionSelection($('#memeCaption')); clearMemeSelection(); showToast(anonymous ? 'Frase anônima publicada no feed!' : 'Frase publicada no feed!'); return;
    }
    const submitButton = $('button[type="submit"]', form);
    if (submitButton) submitButton.textContent = 'Preparando imagem…';
    const dataUrl = await normalizeMemeDataUrl(selectedMemeFile);
    if (submitButton) submitButton.textContent = 'Publicando…';
    applyState(await api('/api/memes', { method: 'POST', timeoutMs: 60000, body: { dataUrl, caption, anonymous } }));
    form.reset(); updateMemeCaptionCount(); closeMentionList($('#memeCaption')); clearMentionSelection($('#memeCaption')); clearMemeSelection(); showToast(anonymous ? 'Publicação anônima enviada ao feed!' : 'Publicação enviada ao feed!');
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
function showStellarLenderRejection() {
  const existing = document.querySelector('#stellarLenderRejection');
  if (existing) { existing.showModal(); return; }
  const dialog = document.createElement('dialog');
  dialog.id = 'stellarLenderRejection'; dialog.className = 'stellar-offer stellar-lender-rejection';
  dialog.innerHTML = '<img src="/roulette51/shop-icons/agiota-estelar-v2.png" alt="Agiota Estelar"><h2>Limite respeitado</h2><p><strong>Raspa daqui, sem vergonha.</strong></p><small>O Agiota só libera o que sua confiança atual permite.</small><button type="button">Entendi, chefe</button>';
  document.body.append(dialog);
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}
function offerStellarLoan(result) {
  lenderLossStreak = result.net < 0 ? lenderLossStreak + 1 : 0;
  if (lenderLossStreak < 2 || appState?.profile?.loan) return;
  const key = 'area51LoanOffer:' + appState.me.id;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'stellar-offer';
  dialog.innerHTML = '<img class="stellar-lender-character" src="/roulette51/shop-icons/agiota-estelar-v2.png" alt="Agiota Estelar, alienígena de terno e maleta"><h2>Agiota Estelar</h2><p>Quer conhecer os empréstimos de créditos fictícios?</p><p>Juros fixos de 20%, prazo de 48 horas. O empréstimo não melhora suas chances de ganhar. Atrasos têm penalidades.</p><button type="button" data-loan-details>Ver condições no perfil</button><button type="button" data-loan-dismiss>Agora não</button>';
  document.body.append(dialog);
  dialog.querySelector('[data-loan-dismiss]').onclick = () => dialog.close();
  dialog.querySelector('[data-loan-details]').onclick = () => { dialog.close(); showPortalPage('perfil', true); $('#stellarLoanCard').scrollIntoView({block:'center'}); };
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  dialog.showModal();
}

let casinoAutoRun = null;
for (const [game, formId] of [['roulette', 'casinoForm'], ['slots', 'slotForm']]) {
  const form = document.getElementById(formId);
  if (!form) continue;
  form.insertAdjacentHTML('afterend', `<section class="casino-auto" data-auto-game="${game}" aria-label="Giro automático"><div><strong>Giro automático</strong><small>Uma aposta por giro. Pare quando quiser; o giro em andamento será concluído.</small></div><label>Quantidade<select data-auto-count><option value="10">10 giros</option><option value="20">20 giros</option><option value="30">30 giros</option></select></label><button class="button" type="button" data-auto-start>Iniciar</button><button class="button hidden" type="button" data-auto-stop>Parar após este giro</button><output data-auto-status aria-live="polite"></output></section>`);
}

function updateCasinoAutoControls(game) {
  const panel = document.querySelector(`[data-auto-game="${game}"]`);
  if (!panel) return;
  const run = casinoAutoRun?.game === game ? casinoAutoRun : null;
  panel.querySelector('[data-auto-start]').classList.toggle('hidden', Boolean(run));
  panel.querySelector('[data-auto-stop]').classList.toggle('hidden', !run);
  panel.querySelector('[data-auto-status]').textContent = run ? `${run.completed} de ${run.count} giros concluídos${run.stopping ? ' · parando…' : ''}` : '';
}

function applyCompactCasinoPlay(data, game) {
  const play = data.casinoResult, balances = data.casinoBalances;
  if (!appState?.casino || !balances || !play) throw new Error('Não foi possível confirmar o saldo deste giro. A sequência foi interrompida.');
  appState.casino.wallet = balances.promotional;
  appState.casino.shopWallet = balances.shop;
  appState.casino.jackpot.amount = balances.jackpot;
  appState.casino.closedBoxes = balances.closedBoxes;
  appState.casino.playsToday = Number(appState.casino.playsToday || 0) + 1;
  appState.casino.totalPlays = Number(appState.casino.totalPlays || 0) + 1;
  if (play.walletSource === 'shop') appState.casino.totalWagered = Math.round((Number(appState.casino.totalWagered || 0) + Number(play.bet || 0)) * 100) / 100;
  const historyKey = game === 'slots' ? 'recentSlots' : 'recentRoulette';
  appState.casino[historyKey] = [play, ...(appState.casino[historyKey] || [])].slice(0, 6);
  appState.profile.wallet = balances.shop;
  const topWalletValue = formatCredits(balances.shop);
  $('#topWalletValue').textContent = topWalletValue;
  $('#topWallet').setAttribute('aria-label', 'Saldo: ' + topWalletValue + ' Créditos 51');
  $('#casinoWallet').textContent = formatCredits(balances.promotional);
  $('#casinoShopWallet').textContent = topWalletValue;
}

async function finishCasinoAuto(run, message) {
  if (casinoAutoRun !== run) return;
  casinoAutoRun = null;
  updateCasinoAutoControls(run.game);
  const panel = document.querySelector(`[data-auto-game="${run.game}"]`);
  panel.querySelector('[data-auto-status]').textContent = `${run.completed} de ${run.count} giros concluídos. ${message}`;
  try { await api('/api/casino/auto/stop', { method: 'POST', body: { autoSessionId: run.id } }); } catch {}
  try { applyState(await api('/api/state')); } catch { showToast('Confira o saldo atualizado ao reconectar.', 'error'); }
}

function queueNextCasinoAuto(run) {
  if (casinoAutoRun !== run) return;
  run.completed += 1;
  updateCasinoAutoControls(run.game);
  if (run.stopping || document.hidden || currentPortalPage() !== 'jogos' || casinoActiveGame !== run.game || run.completed >= run.count) {
    finishCasinoAuto(run, run.completed >= run.count ? 'Sequência concluída.' : 'Sequência interrompida.');
    return;
  }
  setTimeout(() => {
    if (casinoAutoRun !== run || run.stopping) { finishCasinoAuto(run, 'Sequência interrompida.'); return; }
    run.triggering = true;
    $(run.game === 'slots' ? '#slotForm' : '#casinoForm').requestSubmit();
  }, 0);
}

document.querySelectorAll('[data-auto-game]').forEach((panel) => {
  panel.querySelector('[data-auto-start]').addEventListener('click', () => {
    if (casinoAutoRun || casinoSpinInProgress || slotSpinInProgress) return;
    const game = panel.dataset.autoGame;
    const count = Number(panel.querySelector('[data-auto-count]').value);
    const bet = Number($(game === 'slots' ? '#slotBet' : '#casinoBet').value);
    const walletSource = $(game === 'slots' ? '#slotWalletSource' : '#casinoWalletSource').value;
    if (![10, 20, 30].includes(count) || !Number.isFinite(bet) || bet < .01 || Math.abs(Math.round(bet * 100) - bet * 100) > .000001) { showToast('Escolha 10, 20 ou 30 giros e uma aposta válida.', 'error'); return; }
    const balance = Number(walletSource === 'shop' ? appState?.casino?.shopWallet : appState?.casino?.wallet);
    if (balance < bet) { showToast('Saldo insuficiente para o primeiro giro.', 'error'); return; }
    const maximum = formatCredits(count * bet);
    if (!confirm(`${count} giros de ${formatCredits(bet)} Créditos 51 cada. Aposta máxima: ${maximum} Créditos 51. Cada giro será cobrado separadamente. Iniciar?`)) return;
    const run = { id: crypto.randomUUID(), game, count, bet, walletSource, completed: 0, stopping: false, triggering: true };
    casinoAutoRun = run;
    updateCasinoAutoControls(game);
    $(game === 'slots' ? '#slotForm' : '#casinoForm').requestSubmit();
  });
  panel.querySelector('[data-auto-stop]').addEventListener('click', () => {
    if (casinoAutoRun?.game !== panel.dataset.autoGame) return;
    casinoAutoRun.stopping = true;
    updateCasinoAutoControls(casinoAutoRun.game);
    if (!casinoSpinInProgress && !slotSpinInProgress) finishCasinoAuto(casinoAutoRun, 'Sequência interrompida.');
  });
});
document.addEventListener('visibilitychange', () => { if (document.hidden && casinoAutoRun) casinoAutoRun.stopping = true; });

async function submitRouletteBet(bet, walletSource, autoSessionId = null) {
  const key = 'area51PendingRoulette:' + appState.me.id;
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(key) || 'null');
    if (pending && autoSessionId && pending.autoSessionId !== autoSessionId) throw new Error('Há uma aposta anterior para conferir. Faça um giro manual antes de iniciar o automático.');
    if (!pending) {
      pending = { requestId: crypto.randomUUID(), bet, walletSource, compact:Boolean(autoSessionId), ...(autoSessionId ? { autoSessionId } : {}) };
      localStorage.setItem(key, JSON.stringify(pending));
    }
  } catch { throw new Error('Não foi possível proteger a aposta neste navegador. Nenhum pedido foi enviado.'); }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await api('/api/casino/play', { method:'POST', body:pending, timeoutMs:35000 });
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
  const autoRun = casinoAutoRun?.game === 'roulette' && casinoAutoRun.triggering ? casinoAutoRun : null;
  if (casinoAutoRun && !autoRun) return;
  if (autoRun) autoRun.triggering = false;
  let completed = false;
  let autoStopMessage = 'Parada após erro. Confira o resultado antes de tentar novamente.';
  const form = event.currentTarget; const bet = autoRun ? autoRun.bet : Number($('#casinoBet').value); const walletSource = autoRun ? autoRun.walletSource : $('#casinoWalletSource').value;
  if (!Number.isFinite(bet) || bet < 0.01 || Math.abs(Math.round(bet * 100) - bet * 100) > 0.000001) { showToast('Aposte um valor de pelo menos 0,01 crédito, com no máximo duas casas decimais.', 'error'); return; }
  casinoSpinInProgress = true; casinoAudioContext(); setBusy(form, true); $('#casinoResult').textContent = 'Confirmando sua aposta…';
  try {
    const data = await submitRouletteBet(bet, walletSource, autoRun?.id);
    const result = data.casinoResult;
    $('#casinoResult').textContent = 'A roleta está girando… o resultado será revelado quando ela parar.';
    await animateCasinoWheel(result.segmentIndex, result.wheelValue ?? result.multiplier);
    stopCasinoWheelSound();
    if (result.resultType === 'casinoJackpot') {
      const message = `✦ JACKPOT! Você recebeu ${formatCredits(result.payout)} créditos da Tripulação.`;
      $('#casinoResult').textContent = message; if (!autoRun) showToast(message); playCasinoRewardSound(true);
    } else if (result.resultType === 'mysteryBox') {
      const message = `${result.mysteryBox?.name || 'Baú misterioso'} ganho! Sua aposta voltou e o baú está fechado no perfil.`;
      $('#casinoResult').textContent = message; if (!autoRun) showToast(message); playCasinoRewardSound(true);
    } else {
      const message = result.net > 0 ? `Você ganhou ${result.net} créditos de lucro! 🚀` : result.net < 0 ? `Você perdeu ${Math.abs(result.net)} créditos. 👽` : 'Empate: seus créditos voltaram. 🛸';
      $('#casinoResult').textContent = `x${String(result.multiplier).replace('.', ',')} · retorno total ${formatCredits(result.payout)} créditos · ${message}`; if (!autoRun) showToast(message); playCasinoRewardSound(result.net > 0 ? true : result.net < 0 ? false : 'neutral');
    }
    if (!autoRun) offerStellarLoan(result);
    casinoSpinInProgress = false;
    if (autoRun) applyCompactCasinoPlay(data, 'roulette'); else applyState(data);
    completed = true;
  } catch (error) { $('#casinoResult').textContent = error.message; showToast(error.message, 'error'); if (/saldo.*insuficiente/i.test(error.message)) autoStopMessage = 'Saldo insuficiente para o próximo giro. Nenhuma nova aposta foi cobrada.'; }
  finally { stopCasinoWheelSound(); casinoSpinInProgress = false; setBusy(form, false); renderCasino(appState?.casino); if (autoRun) { if (completed) queueNextCasinoAuto(autoRun); else finishCasinoAuto(autoRun, autoStopMessage); } }
});

async function submitPlinkoBet(bet, walletSource, risk) {
  const requestId = crypto.randomUUID();
  const key = 'area51PendingPlinko:' + appState.me.id + ':' + requestId;
  const pending = { requestId, bet, walletSource, risk, compact: false };
  try { localStorage.setItem(key, JSON.stringify(pending)); }
  catch { throw new Error('Não foi possível proteger esta esfera neste navegador. Nenhum pedido foi enviado.'); }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { const data = await api('/api/casino/plinko/play', { method: 'POST', body: pending, timeoutMs: 35000 }); try { localStorage.removeItem(key); } catch {} return data; }
    catch (error) {
      const rejected = [400, 401, 403].includes(error.status) || (error.status === 409 && /insuficiente/i.test(error.message));
      if (rejected) { try { localStorage.removeItem(key); } catch {} throw error; }
      if (attempt) throw new Error('Ainda não foi possível confirmar a esfera. Clique novamente para recuperar esta mesma jogada, sem criar outra.');
      $('#plinkoResult').textContent = 'Conferindo a mesma esfera… não feche esta tela.';
    }
  }
}

function recoverPendingPlinkoBets() {
  if (plinkoPendingRecoveryStarted || !appState?.me?.id) return;
  plinkoPendingRecoveryStarted = true;
  const prefix = 'area51PendingPlinko:' + appState.me.id + ':';
  let pendingKeys = [];
  try { pendingKeys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)).slice(0, 6); } catch { return; }
  pendingKeys.forEach((key) => {
    let pending;
    try { pending = JSON.parse(localStorage.getItem(key) || 'null'); } catch { return; }
    if (!pending?.requestId) return;
    api('/api/casino/plinko/play', { method: 'POST', body: pending }).then((data) => {
      try { localStorage.removeItem(key); } catch {}
      applyState(data);
      const result = data.casinoResult;
      if (result?.resultType === 'plinko') {
        animatePlinko(result);
        showToast('Uma esfera enviada antes da atualização foi confirmada.');
      }
    }).catch(() => {});
  });
}

$$('[data-casino-game]').forEach((button) => button.addEventListener('click', () => setCasinoGame(button.dataset.casinoGame)));
// Nos painéis mais estreitos, os rótulos curtos mantêm a escolha inteira
// visível. O contexto completo segue no resumo de risco acima do tabuleiro.
const plinkoWalletSelect = $('#plinkoWalletSource');
if (plinkoWalletSelect) {
  const promotional = plinkoWalletSelect.querySelector('option[value="promotional"]'); const shop = plinkoWalletSelect.querySelector('option[value="shop"]');
  if (promotional) promotional.textContent = 'Bônus diário';
  if (shop) shop.textContent = 'Loja 51';
}
const plinkoRiskSelect = $('#plinkoRisk');
if (plinkoRiskSelect) {
  [['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto']].forEach(([value, label]) => { const option = plinkoRiskSelect.querySelector(`option[value="${value}"]`); if (option) option.textContent = label; });
}
$('#plinkoRisk')?.addEventListener('change', () => renderPlinkoBoard(appState?.casino?.plinkoProfiles || {}));
$('#plinkoForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (plinkoInFlight >= 6) { showToast('Há 6 esferas em voo. Aguarde uma delas concluir antes de soltar outra.', 'error'); return; }
  const form = event.currentTarget; const bet = Number($('#plinkoBet').value); const walletSource = $('#plinkoWalletSource').value; const risk = $('#plinkoRisk').value;
  if (!Number.isFinite(bet) || bet < .01 || Math.abs(Math.round(bet * 100) - bet * 100) > .000001) { showToast('Aposte um valor de pelo menos 0,01 crédito, com até duas casas decimais.', 'error'); return; }
  plinkoInFlight += 1; casinoAudioContext(); $('#plinkoResult').textContent = `Definindo sua rota no servidor… ${plinkoInFlight} esfera${plinkoInFlight > 1 ? 's' : ''} em voo.`;
  try {
    const data = await submitPlinkoBet(bet, walletSource, risk); const result = data.casinoResult;
    const message = result.net > 0 ? `Você ganhou ${formatCredits(result.net)} créditos!` : result.net < 0 ? `Você perdeu ${formatCredits(Math.abs(result.net))} créditos.` : 'Empate: seus créditos voltaram.';
    applyState(data);
    $('#plinkoResult').textContent = `${plinkoLabels[risk]} risco · x${String(result.multiplier).replace('.', ',')} · retorno ${formatCredits(result.payout)} créditos · ${message} ${plinkoInFlight > 1 ? `${plinkoInFlight} esferas em voo.` : 'A animação continua.'}`;
    showToast(message); playCasinoRewardSound(result.net > 0 ? true : result.net < 0 ? false : 'neutral'); offerStellarLoan(result);
    animatePlinko(result).finally(() => {
      plinkoInFlight = Math.max(0, plinkoInFlight - 1);
      if (!plinkoInFlight) $('#plinkoResult').textContent += ' Todas as esferas terminaram.';
    });
  } catch (error) { plinkoInFlight = Math.max(0, plinkoInFlight - 1); $('#plinkoResult').textContent = error.message; showToast(error.message, 'error'); }
  finally { renderCasino(appState?.casino); }
});

async function submitSlotBet(bet, walletSource, autoSessionId = null) {
  const key = 'area51PendingSlots:' + appState.me.id;
  let pending;
  try { pending = JSON.parse(localStorage.getItem(key) || 'null'); if (pending && autoSessionId && pending.autoSessionId !== autoSessionId) throw new Error('Há uma aposta anterior para conferir. Faça um giro manual antes de iniciar o automático.'); if (!pending) { pending = { requestId: crypto.randomUUID(), bet, walletSource, compact: Boolean(autoSessionId), ...(autoSessionId ? { autoSessionId } : {}) }; localStorage.setItem(key, JSON.stringify(pending)); } }
  catch { throw new Error('Não foi possível proteger esta rodada neste navegador. Nenhum pedido foi enviado.'); }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { const data = await api('/api/casino/slots/play', { method: 'POST', body: pending, timeoutMs: 35000 }); try { localStorage.removeItem(key); } catch {} return data; }
    catch (error) { const rejected = [400, 401, 403].includes(error.status) || (error.status === 409 && /insuficiente/i.test(error.message)); if (rejected) { try { localStorage.removeItem(key); } catch {} throw error; } if (attempt) throw new Error('Ainda não foi possível confirmar a rodada. Clique novamente para recuperar esta mesma jogada, sem criar outra.'); }
  }
}

function slotStripMarkup(finalSymbol, count = 30) {
  const symbols = Array.from({ length: Math.max(5, count - 2) }, randomSlotSymbol);
  symbols.push(finalSymbol || 'alien', randomSlotSymbol());
  return `<span class="slot-strip">${symbols.map((symbol) => `<span class="slot-strip-item">${slotSymbolMarkup(symbol)}</span>`).join('')}</span>`;
}

function startSlotPreSpin() {
  const reels = $$('[data-slot-reel]');
  slotPreSpinStartedAt = performance.now();
  startSlotGameMusic();
  reels.forEach((reel) => {
    reel.classList.remove('stopped'); reel.classList.add('pre-spinning');
    reel.innerHTML = slotStripMarkup(randomSlotSymbol(), 13);
    const strip = reel.firstElementChild; const rowHeight = Math.max(1, reel.clientHeight / 3);
    [...(strip?.children || [])].forEach((item) => { item.style.height = `${rowHeight}px`; item.style.flexBasis = `${rowHeight}px`; });
    strip?.style.setProperty('--slot-row-height', `${rowHeight}px`);
  });
}

async function animateSlotResult(result) {
  const reels = $$('[data-slot-reel]'); const symbols = Array.isArray(result?.slots?.symbols) ? result.slots.symbols : [];
  // A confirmação costuma chegar muito rápido. Mantemos o giro contínuo por
  // alguns instantes para que a troca para a desaceleração não pareça um salto.
  const minimumContinuousSpinMs = 650;
  const remainingCruise = Math.max(0, minimumContinuousSpinMs - (performance.now() - slotPreSpinStartedAt));
  if (remainingCruise) await new Promise((resolve) => setTimeout(resolve, remainingCruise));
  const stopAt = [2450, 3250, 4050];
  const spinStartedAt = performance.now(); let tick = 0; let tickTimer = null;
  const playTick = () => { const progress = Math.min(1, (performance.now() - spinStartedAt) / stopAt[2]); playCasinoOscillator(180 + (tick++ % 4) * 38, .024, .018, 'square'); if (progress < 1) tickTimer = setTimeout(playTick, 40 + Math.round(175 * progress * progress)); };
  startSlotGameMusic(); playTick();
  reels.forEach((reel, index) => {
    reel.classList.remove('pre-spinning'); reel.classList.add('spinning');
    reel.innerHTML = slotStripMarkup(symbols[index] || 'alien', 29 + index * 3);
    const strip = reel.firstElementChild;
    const itemCount = strip?.children.length || 1;
    const rowHeight = Math.max(1, reel.clientHeight / 3);
    [...(strip?.children || [])].forEach((item) => { item.style.height = `${rowHeight}px`; item.style.flexBasis = `${rowHeight}px`; });
    const travel = Math.max(0, rowHeight * (itemCount - 3));
    // Largada rápida e linear; cada rolo desacelera apenas no trecho final.
    // Isso preserva a sensação de cilindros já em movimento quando o servidor
    // confirma a combinação, sem uma segunda arrancada artificial.
    const cruiseTravel = Math.max(rowHeight, travel * .74);
    strip.style.transform = 'translateY(0)';
    strip.animate([
      { transform: 'translateY(0)', offset: 0, easing: 'linear' },
      { transform: `translateY(-${cruiseTravel}px)`, offset: .74, easing: 'linear' },
      { transform: `translateY(-${travel}px)`, offset: 1, easing: 'cubic-bezier(.14,.82,.24,1)' },
    ], { duration: stopAt[index], fill: 'forwards' });
  });
  for (let index = 0; index < reels.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, stopAt[index] - (index ? stopAt[index - 1] : 0)));
    const reel = reels[index];
    reel.innerHTML = slotVisibleReelMarkup(symbols[index] || 'alien');
    reel.classList.remove('spinning'); reel.classList.add('stopped');
    playCasinoOscillator(310 + index * 95, .07, .055, 'square');
  }
  clearTimeout(tickTimer); stopSlotGameMusic();
  await new Promise((resolve) => setTimeout(resolve, 210)); reels.forEach((reel) => reel.classList.remove('stopped'));
  setSlotLeverVisual(0);
}

$('#slotForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); if (slotSpinInProgress) return;
  const autoRun = casinoAutoRun?.game === 'slots' && casinoAutoRun.triggering ? casinoAutoRun : null;
  if (casinoAutoRun && !autoRun) return;
  if (autoRun) autoRun.triggering = false;
  let completed = false;
  let autoStopMessage = 'Parada após erro. Confira o resultado antes de tentar novamente.';
  const form = event.currentTarget; const bet = autoRun ? autoRun.bet : Number($('#slotBet').value); const walletSource = autoRun ? autoRun.walletSource : $('#slotWalletSource').value;
  if (!Number.isFinite(bet) || bet < .01 || Math.abs(Math.round(bet * 100) - bet * 100) > .000001) { showToast('Aposte um valor de pelo menos 0,01 crédito, com até duas casas decimais.', 'error'); return; }
  slotSpinInProgress = true; setSlotLeverVisual(1); casinoAudioContext(); setBusy(form, true); $('#slotResult').textContent = 'Os rolos começaram a girar…'; startSlotPreSpin();
  try { const data = await submitSlotBet(bet, walletSource, autoRun?.id); const result = data.casinoResult; $('#slotResult').textContent = 'Resultado confirmado. Os rolos estão parando…'; await animateSlotResult(result); const message = result.net > 0 ? `${result.slots?.label || 'Combinação'}! Você ganhou ${formatCredits(result.net)} créditos.` : result.net === 0 ? 'A aposta voltou inteira.' : 'Sem combinação desta vez.'; $('#slotResult').textContent = `${result.slots?.label || 'Resultado'} · x${String(result.multiplier).replace('.', ',')} · retorno ${formatCredits(result.payout)} créditos · ${message}`; if (!autoRun) showToast(message); if (result.net > 0) playSlotCoinSound(); else playCasinoRewardSound(result.net === 0 ? 'neutral' : false); if (!autoRun) offerStellarLoan(result); if (autoRun) applyCompactCasinoPlay(data, 'slots'); else applyState(data); completed = true; }
  catch (error) { $('#slotResult').textContent = error.message; showToast(error.message, 'error'); if (/saldo.*insuficiente/i.test(error.message)) autoStopMessage = 'Saldo insuficiente para o próximo giro. Nenhuma nova aposta foi cobrada.'; }
  finally { stopSlotGameMusic(); $$('[data-slot-reel]').forEach((reel) => reel.classList.remove('pre-spinning')); slotSpinInProgress = false; setSlotLeverVisual(0); setBusy(form, false); renderCasino(appState?.casino); if (autoRun) { if (completed) queueNextCasinoAuto(autoRun); else finishCasinoAuto(autoRun, autoStopMessage); } }
});

$('#lotteryNumbers')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-lottery-number]');
  if (!button || button.disabled) return;
  const number = Number(button.dataset.lotteryNumber);
  if (lotteryNumbersDraft.includes(number)) lotteryNumbersDraft = lotteryNumbersDraft.filter((item) => item !== number);
  else if (lotteryNumbersDraft.length < lotteryPlanDraft) lotteryNumbersDraft = [...lotteryNumbersDraft, number].sort((a, b) => a - b);
  renderLottery(appState?.casino?.lottery || {});
});

$('#lotteryPlans')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-lottery-plan]');
  if (!button) return;
  lotteryPlanDraft = Number(button.dataset.lotteryPlan);
  lotteryNumbersDraft = [];
  renderLottery(appState?.casino?.lottery || {});
});

$('#lotteryForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const numbers = lotteryNumbersDraft;
  if (numbers.length !== lotteryPlanDraft) { showToast(`Escolha exatamente ${lotteryPlanDraft} números para este bilhete.`, 'error'); return; }
  setBusy(form, true);
  let purchased = false;
  try { const data = await api('/api/lottery/entry', { method: 'POST', body: { numbers, requestId: crypto.randomUUID() } }); purchased = true; lotteryNumbersDraft = []; applyState(data); showToast('Bilhete da Mega 51 comprado e registrado! 🎟️'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { if (purchased) lotteryNumbersDraft = []; setBusy(form, false); renderLottery(appState?.casino?.lottery || {}); }
});

$('#lotteryMyTickets')?.addEventListener('click', openLotteryNote);
function openLotteryNote(event) {
  const button = event.target.closest('[data-lottery-note]');
  if (!button) return;
  const lottery = appState?.casino?.lottery;
  const entry = lottery?.myEntries?.find((item) => item.id === button.dataset.lotteryNote);
  if (!entry) { showToast('Esse bilhete não está disponível para conferência.', 'error'); return; }
  const dialog = $('#lotteryNoteDialog');
  $('#lotteryNoteContent').innerHTML = lotteryNoteMarkup(entry, lottery);
  dialog.dataset.entryId = entry.id;
  dialog.showModal();
}
$('#lotteryNoteClose')?.addEventListener('click', () => $('#lotteryNoteDialog')?.close());

$('#stellarLoanCard').addEventListener('click', async (event) => {
  const itemOffer = event.target.closest('[data-loan-item]'); const blackMarketSale = event.target.closest('[data-black-market-sale]'); const borrow = event.target.closest('[data-loan-borrow]'); const repay = event.target.closest('[data-loan-repay],[data-loan-repay-all]');
  if (itemOffer) { const offer = appState?.profile?.stellarLender?.offers?.find((entry) => entry.purchaseId === itemOffer.dataset.loanItem); if (!offer) return; if (!confirm(`Entregar ${offer.name} ao Agiota para abater ${offer.value} créditos da dívida?\n\nO item será removido definitivamente do seu inventário.`)) return; itemOffer.disabled = true; try { applyState(await api('/api/loans/offer-item', { method: 'POST', body: { purchaseId: offer.purchaseId } })); showToast('Item entregue ao Agiota e valor abatido da dívida.'); } catch (error) { showToast(error.message, 'error'); itemOffer.disabled = false; } return; }
  if (blackMarketSale) { const offer = appState?.profile?.stellarBlackMarket?.offers?.find((entry) => entry.purchaseId === blackMarketSale.dataset.blackMarketSale); if (!offer) return; if (!confirm(`Vender ${offer.name} ao Mercado Negro por ${formatCredits(offer.value)} Créditos 51?\n\nO item será removido definitivamente e o valor irá para sua Loja 51.`)) return; blackMarketSale.disabled = true; try { const data = await api('/api/black-market/sell', { method: 'POST', body: { purchaseId: offer.purchaseId } }); applyState(data); showToast(`${data.blackMarketSale?.name || offer.name} vendido por ${formatCredits(data.blackMarketSale?.amount || offer.value)} créditos. 🕶️`); } catch (error) { showToast(error.message, 'error'); blackMarketSale.disabled = false; } return; }
  if (!borrow && !repay) return;
  const button = borrow || repay; button.disabled = true;
  try {
    if (borrow) {
      const amount = Number($('#stellarBorrowAmount')?.value);
      if (!confirm(`Receber ${amount} créditos e devolver ${Math.round(amount * 1.2)} em 48 horas?\n\nAtraso ativa tema de cobrança e cursor com acompanhamento lento, e impede entrar na próxima rodada. Resgates promocionais pagam a dívida primeiro. Nenhum dinheiro real.`)) return;
      applyState(await api('/api/loans/borrow', { method: 'POST', body: { amount } })); showToast('O Agiota Estelar depositou seus créditos. 🛸');
    } else {
      const loan = appState?.profile?.loan; const amount = repay.hasAttribute('data-loan-repay-all') ? Number(loan?.remainingDue || 0) : Number($('#stellarRepayAmount').value);
      applyState(await api('/api/loans/repay', { method: 'POST', body: { amount } })); showToast(amount >= Number(loan?.remainingDue || Infinity) ? 'Empréstimo quitado! Você está livre do Agiota. ✨' : 'Pagamento registrado.');
    }
  } catch (error) {
    if (borrow && String(error.message || '').includes('Agiota fecha a maleta')) showStellarLenderRejection();
    else showToast(error.message, 'error');
  }
  finally { button.disabled = false; }
});

$('#casinoCashoutButton').addEventListener('click', async () => {
  const button = $('#casinoCashoutButton'); button.disabled = true;
  try { const data = await api('/api/casino/cashout', { method: 'POST' }); applyState(data); showToast(`${formatCredits(data.casinoCashout || 0)} créditos liberados para a Loja 51!${data.debtPayment ? ` ${formatCredits(data.debtPayment)} usados para pagar sua dívida.` : ''} 🪙`); }
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
  if (sellButton && !confirm(`Vender “${boxName}” fechado por ${formatCredits(button.dataset.boxPrice || 0)} Créditos 51?`)) return;
  if (openButton && !confirm(`Abrir “${boxName}” agora? O prêmio será definido pela roleta e o baú será consumido.`)) return;
  button.disabled = true;
  try {
    if (openButton) {
      const data = await mysteryMutation('/api/mystery-boxes/open', { inventoryId: button.dataset.boxOpen });
      const decidedState = await showMysteryOpening({ name: boxName, tier: openButton.dataset.boxTier || '' }, data.mysteryReward); applyProfileMutation(decidedState || data);
      showToast('O baú revelou: ' + data.mysteryReward.icon + ' ' + data.mysteryReward.name + '!');
    } else {
      const data = await mysteryMutation('/api/mystery-boxes/sell', { inventoryId: button.dataset.boxSell });
      applyProfileMutation(data); showToast(`${data.soldBox.name} vendido por ${formatCredits(data.soldBox.amount)} Créditos 51. 🪙`);
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
  if (sellButton && !confirm(`Vender “${name}” agora por ${formatCredits(sellButton.dataset.rewardPrice || 0)} Créditos 51? Depois não será possível recuperar o item.`)) return;
  button.disabled = true;
  try {
    if (keepButton) {
      applyProfileMutation(await mysteryMutation('/api/mystery-rewards/keep', { purchaseId: keepButton.dataset.rewardKeep }));
      showToast('Prêmio guardado na sua coleção. Agora você já pode usá-lo.');
    } else {
      const data = await mysteryMutation('/api/mystery-rewards/sell', { purchaseId: sellButton.dataset.rewardSell });
      applyProfileMutation(data); showToast(`${data.soldReward.name} vendido por ${formatCredits(data.soldReward.amount)} créditos.`);
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
const refundMerchantAudio = new Audio('/comprou-porque-quis.mp3?v=20260914-1');
refundMerchantAudio.preload = 'auto';
function stopRefundMerchantAudio() {
  refundMerchantAudio.pause();
  refundMerchantAudio.currentTime = 0;
}
function showRefundMerchantPopup() {
  const dialog = $('#refundMerchantDialog');
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  stopRefundMerchantAudio();
  refundMerchantAudio.play().catch(() => showToast('Toque novamente em Devolver para ouvir o recado.', 'error'));
}

$('#closeRefundMerchantDialog')?.addEventListener('click', () => { stopRefundMerchantAudio(); $('#refundMerchantDialog').close(); });
$('#acknowledgeRefundMerchant')?.addEventListener('click', () => { stopRefundMerchantAudio(); $('#refundMerchantDialog').close(); });

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-shop-refund]')) { showRefundMerchantPopup(); return; }
  const oddsTrigger = event.target.closest('[data-box-odds]');
  if (!oddsTrigger && event.target.closest('[data-shop-action], [data-shop-preview], [data-shop-free], .shop-card-actions')) return;
  const box = oddsTrigger?.closest('.shop-item[data-box-info]') || event.target.closest('.shop-item[data-box-info]');
  if (!box) return;
  const credits = Number(box.dataset.boxCredit || 0); const powers = Number(box.dataset.boxPower || 0); const visual = Math.max(0, 100 - credits - powers);
  const minPrice = Number(box.dataset.boxRewardMin || 0); const maxPrice = Number(box.dataset.boxRewardMax || 0);
  const catalog = Array.isArray(appState?.profile?.shop) ? appState.profile.shop : [];
  const rewardsFor = (type) => { const base = catalog.filter((item) => !item.cardPack && !item.mysteryBox && !item.service && (type === 'power' ? item.type === 'power' : item.type !== 'power') && (item.consumable || !item.owned)); const inRange = base.filter((item) => Number(item.price || 0) >= minPrice && Number(item.price || 0) <= maxPrice); return inRange.length ? inRange : base; };
  const powerItems = rewardsFor('power'); const visualItems = rewardsFor('visual'); const physicalChance = Number(box.dataset.boxPhysicalChance || 0);
  const cardFor = (item, totalChance, kind, count) => `<article class="mystery-odds-card"><span>${catalogIconMarkup(item) || escapeHtml(item.icon || (kind === 'PODER' ? '🎟️' : '✨'))}</span><div><small>${kind}</small><strong>${escapeHtml(item.name)}</strong><em>${(totalChance / Math.max(1, count)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de chance</em></div></article>`;
  const cards = [`<article class="mystery-odds-card mystery-odds-credit"><span>🪙</span><div><small>CRÉDITOS</small><strong>${Number(box.dataset.boxMin || 0)} a ${Number(box.dataset.boxMax || 0)} créditos</strong><em>${credits}% de chance</em></div></article>`, ...(physicalChance > 0 ? [`<article class="mystery-odds-card mystery-odds-physical"><span>📒</span><div><small>PRÊMIO FÍSICO ÚNICO</small><strong>Caderno e caneta doados</strong><em>${physicalChance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de chance</em></div></article>`] : []), ...powerItems.map((item) => cardFor(item, powers, 'PODER', powerItems.length)), ...visualItems.map((item) => cardFor(item, visual, 'VISUAL', visualItems.length))];
  const oddsBoxVisual = rouletteBoxIconMarkup({ tier: box.dataset.boxTier, name: box.dataset.boxName }) || escapeHtml(box.dataset.boxIcon || '🎁');
  $('#mysteryBoxOddsContent').innerHTML = `<header><span class="mystery-box-odds-icon">${oddsBoxVisual}</span><div><small>CHANCES DA CAIXA</small><h3>${escapeHtml(box.dataset.boxName || 'Caixa misteriosa')}</h3></div></header><p>O prêmio é definido apenas ao abrir. Navegue pelos itens que podem sair agora:</p><div class="mystery-box-summary"><span>🪙 Créditos <b>${credits}%</b></span><span>🎟️ Poder <b>${powers}%</b></span><span>✨ Visual <b>${visual}%</b></span>${physicalChance > 0 ? `<span>📒 Kit físico <b>${physicalChance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></span>` : ''}</div><section class="mystery-odds-carousel" aria-label="Prêmios possíveis"><button type="button" class="mystery-odds-nav" data-box-carousel="prev" aria-label="Prêmio anterior">‹</button><div class="mystery-odds-viewport"><div class="mystery-odds-track">${cards.join('')}</div></div><button type="button" class="mystery-odds-nav" data-box-carousel="next" aria-label="Próximo prêmio">›</button></section><footer>Cada item da mesma categoria tem a mesma chance. Itens já recebidos ou indisponíveis podem virar créditos.</footer>`;
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
  event.preventDefault(); const form = event.currentTarget;
  const target = $('#giftCreditsUser').selectedOptions[0]; const amount = Number($('#giftCreditsAmount').value);
  if (!target?.value || !Number.isFinite(amount) || amount < .01) { showToast('Escolha uma pessoa e informe um valor a partir de 0,01 crédito.', 'error'); return; }
  if (!confirm(`Enviar ${formatCredits(amount)} Créditos 51 anonimamente para ${target.textContent}?\n\nA transferência é imediata e não pode ser desfeita.`)) return;
  setBusy(form, true);
  try { applyState(await api('/api/gifts/credits', { method: 'POST', body: { targetId: target.value, amount } })); form.reset(); showToast('Presente secreto enviado! 🎁'); }
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

function openHaterCurseComposer(people) {
  const suggestions = ['Ô azarado, achou que eu tinha ido embora?', 'Até a roleta tem pena de você!', 'Vai trabalhar, desgraça!', 'Oh, vai tomar no seu cu!', 'Viadinho, e esse cu cheirando a leite aí?', 'Oh, mama-pica, tira da boca e vai trabalhar!'];
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'hater-compose-dialog';
    dialog.innerHTML = `<form method="dialog" class="hater-compose-shell"><button class="hater-compose-close" value="cancel" aria-label="Fechar">×</button><div class="hater-compose-step" id="haterComposeStep"></div><div id="haterComposeContent"></div></form>`;
    document.body.append(dialog);
    let phrases = [...suggestions], selectedTarget = null, step = 1, settled = false;
    const finish = (result = null) => { if (settled) return; settled = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(result); };
    const update = () => {
      const stepEl = dialog.querySelector('#haterComposeStep'), content = dialog.querySelector('#haterComposeContent');
      stepEl.innerHTML = `<span class="${step === 1 ? 'active' : 'done'}">1 · Frases</span><i></i><span class="${step === 2 ? 'active' : step > 2 ? 'done' : ''}">2 · Alvo</span><i></i><span class="${step === 3 ? 'active' : ''}">3 · Confirmar</span>`;
      if (step === 1) {
        content.innerHTML = `<h2>Personalize as 6 provocações</h2><p>Você pode usar as sugestões ou escrever as suas. Emojis do teclado são aceitos.</p><div class="hater-compose-phrases">${phrases.map((phrase, index) => `<label>Frase ${index + 1}<b data-hater-count="${index}">${Array.from(phrase).length}/110</b><textarea data-hater-phrase="${index}" maxlength="220">${escapeHtml(phrase)}</textarea></label>`).join('')}</div><small class="hater-compose-error" id="haterComposeError"></small><div class="hater-compose-actions"><button type="button" class="button button-secondary" data-hater-restore>Restaurar sugestões</button><button type="button" class="button button-primary" data-hater-next>Escolher alvo →</button></div>`;
        content.querySelectorAll('[data-hater-phrase]').forEach((field) => field.addEventListener('input', () => { const count = Array.from(field.value).length; content.querySelector(`[data-hater-count="${field.dataset.haterPhrase}"]`).textContent = count + '/110'; }));
        content.querySelector('[data-hater-restore]').onclick = () => { phrases = [...suggestions]; update(); };
        content.querySelector('[data-hater-next]').onclick = () => {
          const values = [...content.querySelectorAll('[data-hater-phrase]')].map((field) => field.value.trim().replace(/\s+/g, ' '));
          const unique = new Set(values.map((phrase) => phrase.toLocaleLowerCase('pt-BR')));
          const error = content.querySelector('#haterComposeError');
          if (values.some((phrase) => !phrase || Array.from(phrase).length > 110) || unique.size !== 6) { error.textContent = 'Preencha seis frases diferentes, de até 110 caracteres cada.'; return; }
          phrases = values; step = 2; update();
        };
      } else if (step === 2) {
        content.innerHTML = `<h2>Escolha quem receberá</h2><p>A pessoa receberá a maldição por 24 horas. Sua autoria continuará sigilosa.</p><div class="hater-compose-targets">${people.map((person) => `<button type="button" data-hater-target="${escapeHtml(person.id)}" class="${selectedTarget?.id === person.id ? 'selected' : ''}"><strong>${escapeHtml(formatDisplayName(person.displayName))}</strong><small>Participante ativo</small></button>`).join('')}</div><div class="hater-compose-actions"><button type="button" class="button button-secondary" data-hater-back>← Frases</button><button type="button" class="button button-primary" data-hater-review disabled>Revisar envio →</button></div>`;
        const review = content.querySelector('[data-hater-review]');
        content.querySelector('[data-hater-back]').onclick = () => { step = 1; update(); };
        content.querySelectorAll('[data-hater-target]').forEach((button) => button.onclick = () => { selectedTarget = people.find((person) => person.id === button.dataset.haterTarget); content.querySelectorAll('[data-hater-target]').forEach((item) => item.classList.toggle('selected', item === button)); review.disabled = false; });
        review.onclick = () => { step = 3; update(); };
      } else {
        content.innerHTML = `<h2>Confirmar envio anônimo</h2><p><strong>${escapeHtml(formatDisplayName(selectedTarget.displayName))}</strong> receberá as frases abaixo por 24 horas. Ela não verá quem enviou.</p><ol class="hater-compose-summary">${phrases.map((phrase) => `<li>${escapeHtml(phrase)}</li>`).join('')}</ol><div class="hater-compose-actions"><button type="button" class="button button-secondary" data-hater-back>← Alterar alvo</button><button type="button" class="button button-primary" data-hater-send>🖕 Enviar maldição</button></div>`;
        content.querySelector('[data-hater-back]').onclick = () => { step = 2; update(); };
        content.querySelector('[data-hater-send]').onclick = () => finish({ targetId: selectedTarget.id, targetName: selectedTarget.displayName, phrases });
      }
    };
    dialog.addEventListener('close', () => finish(null), { once: true });
    update(); dialog.showModal();
  });
}

function openCurseChoiceDialog({ title, description, options, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'hater-compose-dialog';
    dialog.innerHTML = `<div class="hater-compose-shell"><button type="button" class="hater-compose-close" aria-label="Fechar">×</button><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><div class="hater-compose-targets" style="max-height:55vh;overflow:auto">${options.map((option) => `<button type="button" data-curse-choice="${escapeHtml(option.id)}"><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.detail || '')}</small></button>`).join('')}</div><div class="hater-compose-actions"><button type="button" class="button button-secondary" data-curse-cancel>Cancelar</button><button type="button" class="button button-primary" data-curse-confirm disabled>${escapeHtml(confirmLabel || 'Continuar')}</button></div></div>`;
    document.body.append(dialog);
    let selected = null;
    let settled = false;
    const finish = (result) => { if (settled) return; settled = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(result); };
    dialog.querySelector('.hater-compose-close').onclick = () => finish(null);
    dialog.querySelector('[data-curse-cancel]').onclick = () => finish(null);
    dialog.querySelectorAll('[data-curse-choice]').forEach((button) => { button.onclick = () => {
      selected = options.find((option) => option.id === button.dataset.curseChoice) || null;
      dialog.querySelectorAll('[data-curse-choice]').forEach((entry) => entry.classList.toggle('selected', entry === button));
      dialog.querySelector('[data-curse-confirm]').disabled = !selected;
    }; });
    dialog.querySelector('[data-curse-confirm]').onclick = () => finish(selected);
    dialog.addEventListener('close', () => finish(null), { once: true });
    dialog.showModal();
  });
}

function curseStyleLabel(style) {
  return style === 'hater' ? 'Maldição do Hater' : style === 'givaldo' ? 'Maldição Givaldo' : style === 'giant-slow' ? 'Mouse Gigante' : style === 'adhd' ? 'TDAH' : style === 'dev-dark' ? 'Maldição do Dev' : style === 'cleaning' ? 'Maldição da Limpeza' : 'Seta Gay Compulsória';
}

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
    } else if (button.dataset.shopAction === 'cobblemon-balls') {
      const balls = appState.profile?.cobblemon?.balls || {};
      const quantityInput = button.closest('.shop-item')?.querySelector('[data-shop-quantity]');
      const buyQuantity = Number(quantityInput?.value || 1);
      const maximum = Number(balls.maxPurchase || 20);
      if (!Number.isInteger(buyQuantity) || buyQuantity < 1 || buyQuantity > maximum) { showToast(`Escolha uma quantidade inteira entre 1 e ${maximum}.`, 'error'); quantityInput?.focus(); return; }
      const buyPrice = Math.round(Number(balls.unitPrice || 8.99) * buyQuantity * 100) / 100;
      if (!confirm(`Comprar ${buyQuantity} Poké Ball${buyQuantity === 1 ? '' : 's'} extras para hoje por ${formatCredits(buyPrice)} Créditos 51?\n\nAs extras valem somente para a caça de hoje.`)) return;
      const data = await api('/api/cobblemon/balls/buy', { method: 'POST', body: { quantity: buyQuantity } });
      applyState(data);
      const added = Number(data.quantity || buyQuantity);
      showToast(`${added} Poké Ball${added === 1 ? '' : 's'} adicionada${added === 1 ? '' : 's'} para a caça de hoje.`);
      if (confirm('Quer ir agora para a Pokédex 51?')) showPortalPage('cobblemon', true);
    } else if (button.dataset.shopAction === 'sell-best-win') {
      if (!confirm('Vender 1 ponto de primeiro lugar por 500 Créditos 51?\n\nA vitória será removida do seu ranking e esta troca não poderá ser desfeita.')) return;
      applyState(await api('/api/shop/sell-best-win', { method: 'POST' }));
      showToast('Ponto vendido! 500 Créditos 51 foram adicionados ao seu saldo. 🏆');
    } else if (button.dataset.shopAction === 'purchase') {
      const quantityInput = button.closest('.shop-item')?.querySelector('[data-shop-quantity]');
      const quantity = quantityInput ? Number(quantityInput.value) : 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Escolha uma quantidade inteira entre 1 e 20.');
      const total = Number(button.dataset.shopPrice || 0) * quantity;
      const sealedPurchase = button.dataset.shopSealed === 'true';
      if (!confirm(`Comprar ${quantity} unidade${quantity === 1 ? '' : 's'} ${sealedPurchase ? 'sem defesa (Antídoto bloqueado)' : 'na versão normal'} por ${formatCredits(total)} Créditos 51 no total?`)) return;
      const data = await api('/api/shop/purchase', { method: 'POST', body: { itemId: button.dataset.shopItem, quantity, sealed: sealedPurchase } });
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
      if (!confirm(`Comprar ${quantity}x “${itemName}” por ${formatCredits(total)} créditos?\n\nAs caixas irão fechadas para Meus baús no perfil.`)) return;
      const data = await api('/api/shop/purchase', { method: 'POST', body: { itemId: button.dataset.shopItem, quantity } });
      applyState(data); showToast(`${quantity} caixa${quantity === 1 ? '' : 's'} adicionada${quantity === 1 ? '' : 's'} ao seu perfil! 🎁`);
    } else if (button.dataset.shopAction === 'equip') {
      const itemId = button.dataset.equipped === 'true' ? null : button.dataset.shopItem;
      applyState(await api('/api/profile/equip', { method: 'POST', body: { type: button.dataset.shopType, itemId } }));
      const isTheme = button.dataset.shopType === 'siteTheme';
      showToast(itemId ? (isTheme ? 'Tema aplicado em todo o site. ✓' : 'Personalização equipada. ✓') : (isTheme ? 'Tema desativado. Visual padrão restaurado.' : 'Personalização removida.'));
    } else {
      const body = { itemId: button.dataset.shopItem };
      // O alvo é escolhido dentro de alguns ramos abaixo, mas a confirmação é
      // exibida depois deles. Mantemos a referência neste escopo para não
      // transformar um envio já concluído em "target is not defined".
      let selectedPowerTarget = null;
      if (button.dataset.shopValue === 'revealCurseAuthor') {
        const choices = appState.profile?.curseRevealCandidates || [];
        if (!choices.length) throw new Error('Não há maldições elegíveis sem autoria revelada. Seu poder não será consumido.');
        const choice = await openCurseChoiceDialog({ title: 'Qual maldição investigar?', description: 'Clique na maldição desejada. A autoria escolhida será revelada a todos; as demais continuam anônimas.', options: choices.map((entry) => ({ id: entry.id, label: entry.targetName || 'Participante', detail: `${curseStyleLabel(entry.style)} · ${formatDate(entry.createdAt)}${entry.active ? ' · ativa' : ''}` })), confirmLabel: 'Revisar revelação' });
        if (!choice) return;
        body.curseId = choice.id;
        const selectedCurse = choices.find((entry) => entry.id === choice.id);
        if (!confirm(`Revelar a todos quem enviou ${curseStyleLabel(selectedCurse.style)} para ${selectedCurse.targetName} em ${formatDate(selectedCurse.createdAt)}? Um Rastreador será consumido.`)) return;
      } else if (['cleanseCursor','loanExtension'].includes(button.dataset.shopValue)) {
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
      } else if (button.dataset.shopValue === 'forceGayCursor' || button.dataset.shopValue === 'forceGiantCursor' || button.dataset.shopValue === 'forceAdhdCursor' || button.dataset.shopValue === 'forceDevDarkness' || button.dataset.shopValue === 'forceCleaningCurse' || button.dataset.shopValue === 'forceHaterCurse' || button.dataset.shopValue === 'forceGivaldoCurse') {
        const giant = button.dataset.shopValue === 'forceGiantCursor';
        const adhd = button.dataset.shopValue === 'forceAdhdCursor';
        const devDarkness = button.dataset.shopValue === 'forceDevDarkness';
        const cleaning = button.dataset.shopValue === 'forceCleaningCurse';
        const hater = button.dataset.shopValue === 'forceHaterCurse';
        const givaldo = button.dataset.shopValue === 'forceGivaldoCurse';
    const duration = 'por 24 horas';
        const people = (giant || adhd || devDarkness || cleaning || hater || givaldo || button.dataset.shopValue === 'forceGayCursor' ? appState.powerParticipants : appState.participants) || [];
        if (!people.length) throw new Error('Não há participantes ativos disponíveis.');
        const powerName = hater ? 'Maldição do Hater' : givaldo ? 'Maldição Givaldo' : giant ? 'Maldição do Mouse Gigante' : adhd ? 'Maldição TDAH' : devDarkness ? 'Maldição do Dev' : cleaning ? 'Maldição da Limpeza' : 'Seta Gay Compulsória';
        // As três maldições são sempre enviadas para outra pessoa; a mesma
        // regra também é conferida pelo servidor antes de consumir o item.
        const eligibleTargets = people.filter((person) => person.id !== appState.me.id);
        if (!eligibleTargets.length) throw new Error('É necessário outro participante ativo para enviar esta maldição.');
        if (hater) {
          const composed = await openHaterCurseComposer(eligibleTargets);
          if (!composed) return;
          selectedPowerTarget = eligibleTargets.find((person) => person.id === composed.targetId);
          body.targetId = composed.targetId;
          body.haterPhrases = composed.phrases;
        } else {
          const choice = await openCurseChoiceDialog({ title: 'Escolha quem receberá', description: `${powerName} será enviada ${duration}. Clique no nome do participante.`, options: eligibleTargets.map((person) => ({ id: person.id, label: formatDisplayName(person.displayName), detail: 'Participante ativo' })), confirmLabel: 'Revisar envio' });
          if (!choice) return;
          const target = eligibleTargets.find((person) => person.id === choice.id);
          if (!target) throw new Error('Participante não encontrado. Seu poder não foi consumido.');
          selectedPowerTarget = target;
          body.targetId = target.id;
        }
        const ownedVersions = (appState.profile?.activePowers?.available || []).filter((entry) => entry.itemId === button.dataset.shopItem);
        const hasNormal = ownedVersions.some((entry) => !entry.sealed);
        const hasSealed = ownedVersions.some((entry) => entry.sealed);
        if (!hasNormal && !hasSealed) throw new Error('Compre esta maldição antes de enviá-la.');
        if (hasNormal && hasSealed) {
          const version = await openCurseChoiceDialog({ title: 'Qual versão enviar?', description: 'As duas já estão no seu inventário. Clique na versão que deseja consumir neste envio.', options: [{ id: 'normal', label: 'Normal', detail: 'Permite Antídoto · preço normal já pago' }, { id: 'sealed', label: 'Sem defesa', detail: 'Bloqueia Antídoto · 5.000 Créditos 51 já pagos' }], confirmLabel: 'Escolher versão' });
          if (!version) return;
          body.sealed = version.id === 'sealed';
        } else body.sealed = hasSealed;
        if (!confirm(`Enviar a ${selectedPowerTarget.displayName} a versão ${body.sealed ? 'sem defesa (Antídoto bloqueado)' : 'normal'}? A compra correspondente será consumida.`)) return;
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
      } else if (button.dataset.shopValue === 'shieldGay') {
        throw new Error('O Escudo só pode ser usado depois que você for sorteado como Gay. Aguarde o aviso do sorteio.');
      } else if (!confirm('Ativar o Escudo da Rodada agora?')) return;
      const powerResult = await api('/api/powers/use', { method: 'POST', body });
      applyState(powerResult);
      if (powerResult.curseAuthorReveal) { showToast(`Autoria revelada a todos: ${powerResult.curseAuthorReveal.senderName} enviou a maldição para ${powerResult.curseAuthorReveal.targetName}.`); return; }
      if (['cleanseCursor','loanExtension'].includes(button.dataset.shopValue)) { showToast('Poder aplicado com sucesso!'); return; }
      showToast(button.dataset.shopValue === 'forceHaterCurse' ? 'Maldição do Hater enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 🖕' : button.dataset.shopValue === 'forceGivaldoCurse' ? 'Maldição Givaldo enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 🎭' : button.dataset.shopValue === 'chooseTheme' ? 'Tema escolhido e rodada aberta sem sorteio! 🎨' : button.dataset.shopValue === 'chooseGay' ? 'Escolha reservada para o sorteio especial. 👑' : button.dataset.shopValue === 'forceGayCursor' ? 'Seta compulsória enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 🌈' : button.dataset.shopValue === 'forceGiantCursor' ? 'Maldição do Mouse Gigante enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 🐌' : button.dataset.shopValue === 'forceAdhdCursor' ? 'Maldição TDAH enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! ⚡' : button.dataset.shopValue === 'forceDevDarkness' ? 'Maldição do Dev enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 💡' : button.dataset.shopValue === 'forceCleaningCurse' ? 'Maldição da Limpeza enviada para ' + selectedPowerTarget.displayName + ' por 24 horas! 🧹' : button.dataset.shopValue === 'chooseWallpaper' ? 'Seu wallpaper foi reservado anonimamente! 🖼️' : button.dataset.shopValue === 'assignWallpaper' ? 'Wallpaper do participante reservado anonimamente! 🎯' : button.dataset.shopValue === 'revealAuthor' ? 'Todos os autores foram revelados somente para você. 🔎' : 'Escudo ativado nesta rodada! 🛡️');
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
    applyState(await api('/api/vote', { method: 'POST', body: values, timeoutMs: 35000 }));
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

document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('[data-vote-voters-toggle]');
  const current = trigger?.closest('.vote-voters-wrap') || null;
  document.querySelectorAll('.vote-voters-wrap.is-open').forEach((wrap) => {
    if (wrap === current) return;
    wrap.classList.remove('is-open');
    wrap.querySelector('[data-vote-voters-toggle]')?.setAttribute('aria-expanded', 'false');
  });
  // Mouse hover is handled by CSS and always disappears when the pointer leaves.
  if (!trigger || (window.matchMedia('(hover:hover)').matches && event.detail > 0)) return;
  const opened = current.classList.toggle('is-open');
  trigger.setAttribute('aria-expanded', String(opened));
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.vote-voters-wrap.is-open').forEach((wrap) => {
    wrap.classList.remove('is-open');
    wrap.querySelector('[data-vote-voters-toggle]')?.setAttribute('aria-expanded', 'false');
  });
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

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cobblemon-server-copy]');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.cobblemonServerCopy);
    showToast(button.dataset.cobblemonServerCopy.includes('@') ? 'PIX copiado.' : 'IP do MKCobblemon copiado.');
  } catch {
    showToast('O navegador bloqueou a cópia. Copie o valor exibido manualmente.', 'error');
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
    context.fillStyle = '#ffd968'; context.font = 'bold 46px system-ui'; context.fillText(formatCredits(profile.wallet) + ' Créditos 51', 75, 330);
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
function clearAnnouncementImageSelection() {
  selectedAnnouncementImageFile = null;
  if (announcementImagePreviewObjectUrl) URL.revokeObjectURL(announcementImagePreviewObjectUrl);
  announcementImagePreviewObjectUrl = null;
  $('#announcementImage').value = '';
  $('#announcementImagePreview').classList.add('hidden');
  $('#announcementImagePreview img').removeAttribute('src');
}
$('#announcementImage').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { showToast('Use uma imagem PNG, JPG ou WebP.', 'error'); clearAnnouncementImageSelection(); return; }
  if (file.size > 8 * 1024 * 1024) { showToast('A imagem do aviso deve ter no máximo 8 MB.', 'error'); clearAnnouncementImageSelection(); return; }
  selectedAnnouncementImageFile = file;
  if (announcementImagePreviewObjectUrl) URL.revokeObjectURL(announcementImagePreviewObjectUrl);
  announcementImagePreviewObjectUrl = URL.createObjectURL(file);
  $('#announcementImagePreview img').src = announcementImagePreviewObjectUrl;
  $('#announcementImagePreview').classList.remove('hidden');
});
$('#clearAnnouncementImage').addEventListener('click', clearAnnouncementImageSelection);
$('#announcementForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    const imageDataUrl = selectedAnnouncementImageFile ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(selectedAnnouncementImageFile); }) : null;
    applyState(await api('/api/admin/announcement', { method: 'POST', body: { title: $('#announcementTitle').value, message: $('#announcementMessage').value, imageDataUrl } }));
    form.reset(); clearAnnouncementImageSelection(); showToast('Novo aviso publicado para toda a equipe! 📢');
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
    const data = await api('/api/admin/settings', { method: 'PATCH', timeoutMs: 60000, body: { roundName: $('#roundInput').value, themes, excludeLastGayWinner: $('#excludeLast').checked } });
    applyState(data); showToast('Configurações salvas.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setBusy(form, false); }
});
$('#clearVisualThemesButton')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  if (!confirm('Encerrar agora os temas e cursores de punição de quem perdeu ou foi sorteado? O histórico continua salvo.')) return;
  setButtonBusy(button, true);
  try { applyState(await api('/api/admin/visual-theme/clear', { method: 'POST', timeoutMs: 60000 })); showToast('Punições visuais encerradas. Temas e cursores voltaram ao normal.'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected) setButtonBusy(button, false); }
});
$('#scheduleForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try { applyState(await api('/api/admin/settings', { method: 'PATCH', body: { roundSchedule: { submissionsAt: $('#scheduleSubmissions').value, drawAt: $('#scheduleDraw').value, voteAt: $('#scheduleVote').value } } })); showToast('Calendário atualizado para toda a equipe.'); }
  catch (error) { showToast(error.message, 'error'); } finally { setBusy(form, false); }
});
$('#bulkCreditForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const amount = Number($('#bulkCreditAmount').value); const users = (appState.adminUsers || []).filter((user) => user.active && user.approved !== false); const reason = $('#bulkCreditReason').value.trim();
  $('#bulkCreditError').textContent = '';
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100000) { $('#bulkCreditError').textContent = 'Informe um valor entre 0,01 e 100.000 créditos.'; return; }
  if (!users.length) { $('#bulkCreditError').textContent = 'Não há contas ativas para receber o bônus.'; return; }
  const total = amount * users.length;
  if (!confirm(`Creditar ${formatCredits(amount)} Créditos 51 para ${users.length} contas ativas? Total distribuído: ${formatCredits(total)}. Essa ação não pode ser desfeita automaticamente.`)) return;
  setBusy(form, true);
  try {
    const grantId = globalThis.crypto?.randomUUID?.() || `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const data = await api('/api/admin/credits/bulk', { method: 'POST', body: { amount, reason, grantId } });
    applyState(data); $('#bulkCreditAmount').value = ''; $('#bulkCreditReason').value = '';
    const grant = data.bulkGrant || {}; showToast(data.duplicate ? 'Este bônus já havia sido aplicado; nenhum saldo foi duplicado.' : `${formatCredits(grant.amount || amount)} créditos enviados para ${Number(grant.recipientCount || users.length)} contas.`);
  } catch (error) { $('#bulkCreditError').textContent = error.message; }
  finally { setBusy(form, false); }
});
$('#casinoBulkBonusForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const amount = Number($('#casinoBulkBonusAmount').value); const users = (appState.adminUsers || []).filter((user) => user.active && user.approved !== false);
  $('#casinoBulkBonusError').textContent = '';
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100000) { $('#casinoBulkBonusError').textContent = 'Informe um valor entre 0,01 e 100.000 créditos.'; return; }
  if (!users.length) { $('#casinoBulkBonusError').textContent = 'Não há contas ativas para receber o bônus.'; return; }
  const total = amount * users.length;
  if (!confirm(`Liberar ${formatCredits(amount)} de bônus promocional para ${users.length} contas?\n\nQuem ainda está jogando mantém a banca e soma ${formatCredits(amount * 2)} à meta de saque. Quem já sacou recebe uma nova banca de ${formatCredits(amount)} e saca ao chegar em ${formatCredits(amount * 2)}.\n\nTotal promocional: ${formatCredits(total)}. Esta ação não pode ser desfeita automaticamente.`)) return;
  setBusy(form, true);
  try {
    const grantId = globalThis.crypto?.randomUUID?.() || `casino-bonus-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const data = await api('/api/admin/casino/bonus/bulk', { method: 'POST', body: { amount, grantId } });
    applyState(data); $('#casinoBulkBonusAmount').value = '';
    const grant = data.casinoBulkBonusGrant || {}; showToast(data.duplicate ? 'Este bônus já havia sido aplicado; nenhuma banca foi duplicada.' : `${formatCredits(grant.amount || amount)} de bônus promocional liberado para ${Number(grant.recipientCount || users.length)} contas.`);
  } catch (error) { $('#casinoBulkBonusError').textContent = error.message; }
  finally { setBusy(form, false); }
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
  const resetPasswordButton = event.target.closest('[data-reset-password-user]');
  if (resetPasswordButton) {
    $('#adminPasswordResetUserId').value = resetPasswordButton.dataset.resetPasswordUser;
    $('#adminPasswordResetUser').textContent = 'Defina uma senha temporária para ' + resetPasswordButton.dataset.userName + '.';
    $('#adminPasswordResetValue').value = '';
    $('#adminPasswordResetConfirm').value = '';
    $('#adminPasswordResetError').textContent = '';
    $('#adminPasswordResetDialog').showModal();
    return;
  }
  const creditButton = event.target.closest('[data-credit-user]');
  if (creditButton) {
    $('#creditAdminUserId').value = creditButton.dataset.creditUser;
    $('#creditAdminUser').textContent = creditButton.dataset.userName + ' · saldo atual: ' + formatCredits(creditButton.dataset.userWallet) + ' créditos';
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

$('#roundParticipantList')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-round-participant]');
  if (!button || button.disabled) return;
  try {
    applyState(await api('/api/admin/round/participants', { method: 'PATCH', body: { userId: button.dataset.roundParticipant, included: button.dataset.roundIncluded === 'true' } }));
    showToast(button.dataset.roundIncluded === 'true' ? 'Participante incluído na rodada.' : 'Participante removido da rodada.');
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

function closeAdminPasswordResetDialog() { $('#adminPasswordResetDialog').close(); }
$('#closeAdminPasswordResetDialog').addEventListener('click', closeAdminPasswordResetDialog);
$('#adminPasswordResetDialog').addEventListener('click', (event) => { if (event.target === $('#adminPasswordResetDialog')) closeAdminPasswordResetDialog(); });
$('#adminPasswordResetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = $('#adminPasswordResetValue').value;
  $('#adminPasswordResetError').textContent = '';
  if (password.length < 8) { $('#adminPasswordResetError').textContent = 'A senha temporária deve ter pelo menos 8 caracteres.'; return; }
  if (password !== $('#adminPasswordResetConfirm').value) { $('#adminPasswordResetError').textContent = 'As duas senhas não são iguais.'; return; }
  if (!confirm('Redefinir a senha deste usuário? Ele será obrigado a criar uma nova senha no próximo acesso.')) return;
  setBusy(form, true);
  try {
    applyState(await api('/api/admin/users/' + $('#adminPasswordResetUserId').value, { method: 'PATCH', body: { newPassword: password } }));
    closeAdminPasswordResetDialog();
    showToast('Senha temporária definida. O usuário deverá trocá-la no próximo acesso.');
  } catch (error) { $('#adminPasswordResetError').textContent = error.message; }
  finally { $('#adminPasswordResetValue').value = ''; $('#adminPasswordResetConfirm').value = ''; setBusy(form, false); }
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
    showToast('Compras zeradas. ' + formatCredits(data.refundedCredits || 0) + ' créditos foram devolvidos.');
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
async function decideGayShield(action, button) {
  const dialog = $('#shieldDecisionDialog');
  const pendingId = dialog?.dataset.pendingId;
  if (!pendingId) return;
  button.disabled = true;
  $('#shieldDecisionStatus').textContent = action === 'use' ? 'Escudo consumido. Reabrindo o sorteio…' : 'Resultado mantido. Abrindo a votação…';
  try {
    receiveLiveDraw(await api('/api/draw/gay-shield', { method: 'POST', body: { pendingId, action } }));
    dialog.close();
  } catch (error) {
    $('#shieldDecisionStatus').textContent = error.message;
    button.disabled = false;
    showToast(error.message, 'error');
  }
}
$('#useShieldButton')?.addEventListener('click', () => decideGayShield('use', $('#useShieldButton')));
$('#keepGayButton')?.addEventListener('click', () => decideGayShield('decline', $('#keepGayButton')));
$('#shieldDecisionDialog')?.addEventListener('cancel', (event) => event.preventDefault());
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
    $('#feedbackError').textContent = 'Descreva o bug com um pouco mais de detalhe.';
    return;
  }
  setBusy(form, true);
  try {
    const type = 'bug';
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
$('#communityVotes')?.addEventListener('click', async (event) => {
  const filter=event.target.closest('[data-community-filter]');
  if(event.target.closest('[data-community-remove-image]')) { communityVoteImageDraft=null; renderCommunityVotes(appState.communityVotes||{}); return; }
  if(filter){communityVoteFilter=filter.dataset.communityFilter;renderCommunityVotes(appState.communityVotes||{});return;}
  const removeComment=event.target.closest('[data-community-comment-delete]');
  if(removeComment){
    if(!confirm('Excluir este comentário?')) return;
    removeComment.disabled=true;
    try {
      const state=await api('/api/community-votes/'+encodeURIComponent(removeComment.dataset.communityVoteId)+'/comments/'+encodeURIComponent(removeComment.dataset.communityCommentDelete),{method:'DELETE'});
      communityCommentDrafts.delete(removeComment.dataset.communityVoteId); applyState(state); showToast('Comentário excluído.');
    } catch(error) { showToast(error.message,'error'); if(removeComment.isConnected)removeComment.disabled=false; }
    return;
  }
  const vote=event.target.closest('[data-community-vote]'),admin=event.target.closest('[data-community-admin]');
  if(!vote&&!admin)return;
  const button=vote||admin;button.disabled=true;
  try{
    const state=vote?await api('/api/community-votes/'+encodeURIComponent(vote.dataset.communityVoteId)+'/vote',{method:'POST',body:{vote:vote.dataset.communityVote}}):await api('/api/admin/community-votes/'+encodeURIComponent(admin.dataset.communityVoteId),{method:'PATCH',body:{action:admin.dataset.communityAdmin}});
    applyState(state);showToast(vote?'Voto registrado. A pauta será concluída ao atingir a maioria.':admin.dataset.communityAdmin==='close'?'Votação encerrada.':admin.dataset.communityAdmin==='implemented'?'Pauta marcada como implementada.':'Votação arquivada.');
  }catch(error){showToast(error.message,'error');if(button.isConnected)button.disabled=false;}
});
$('#communityVotes')?.addEventListener('input', (event) => { const field=event.target; if (field.matches('#communityVoteForm textarea[name="subject"]')) communityVoteDraft=field.value; if (field.matches('.community-comment-form input[name="message"]')) communityCommentDrafts.set(field.dataset.draftKey,field.value); });
$('#communityVotes')?.addEventListener('change', (event) => { if (event.target.id !== 'communityVoteImage') return; const file=event.target.files?.[0]; if (!file) return; if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2000000 || !file.size) { event.target.value=''; showToast('Escolha uma imagem PNG, JPG ou WEBP de até 2 MB.', 'error'); return; } communityVoteImageDraft=file; renderCommunityVotes(appState.communityVotes||{}); });
$('#communityVotes')?.addEventListener('submit', async (event) => {
  const form=event.target.closest('form'); if(!form)return;
  event.preventDefault(); const button=form.querySelector('button[type="submit"]'); button.disabled=true;
  let pendingComment=null;
  try {
    if(form.id==='communityVoteForm'){
      const imageDataUrl=communityVoteImageDraft ? await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(communityVoteImageDraft);}) : null;
      const state=await api('/api/community-votes',{method:'POST',body:{subject:form.elements.subject.value,imageDataUrl}});
      communityVoteDraft=''; communityVoteImageDraft=null; applyState(state); showToast('Pauta aberta para a tripulação.'); return;
    }
    if(form.matches('.community-comment-form')){
      const id=form.dataset.communityCommentId;
      if(communityCommentSubmitting.has(id)) return;
      communityCommentSubmitting.add(id);
      const message=form.elements.message.value;
      // Limpa antes da resposta: uma sincronização simultânea não pode trazer
      // de volta um comentário que já foi enviado com sucesso.
      pendingComment={id,message}; communityCommentDrafts.set(id,''); form.elements.message.value='';
      try {
        const state=await api('/api/community-votes/'+encodeURIComponent(id)+'/comments',{method:'POST',body:{message}});
        communityCommentDrafts.delete(id); document.activeElement?.blur(); applyState(state); showToast('Comentário publicado.'); return;
      } finally { communityCommentSubmitting.delete(id); }
    }
  } catch(error) {
    // Só recupera o texto se o comentário não foi aceito pelo servidor.
    if(pendingComment) communityCommentDrafts.set(pendingComment.id,pendingComment.message);
    showToast(error.message,'error'); if(button.isConnected)button.disabled=false;
  }
});
$('#menuButton').addEventListener('click', () => setMenuOpen(!$('#siteMenu').classList.contains('open')));
$('#closeMenuButton').addEventListener('click', () => setMenuOpen(false));
$('#menuBackdrop').addEventListener('click', () => setMenuOpen(false));
function updateMarketOrderTotal(form) {
  if (!form) return;
  const quantity = Math.max(0, Number(form.querySelector('input[name="quantity"]')?.value || 0));
  const price = Number(form.dataset.marketPrice || 0);
  const output = form.querySelector('[data-market-total]');
  if (output) output.textContent = `Total da ordem: ${marketMoney(price * quantity)} Créditos 51`;
}
$('#mercado').addEventListener('input', (event) => {
  const input = event.target.closest('[data-market-action] input[name="quantity"]');
  if (input) updateMarketOrderTotal(input.form);
});
$('#mercado').addEventListener('change', (event) => {
  if (event.target.id === 'marketChartAsset') {
    marketChartAssetId = event.target.value || 'all';
    renderInvestmentMarket(appState.profile || {});
    return;
  }
  if (event.target.id === 'marketHistoryAsset') {
    marketHistoryAssetId = event.target.value || 'all';
    renderInvestmentMarket(appState.profile || {});
  }
});
$('#mercado').addEventListener('click', (event) => {
  if (event.target.closest('[data-market-history-toggle]')) {
    marketHistoryExpanded = !marketHistoryExpanded;
    renderInvestmentMarket(appState.profile || {});
    return;
  }
  const periodButton = event.target.closest('[data-market-period]');
  if (periodButton) {
    marketChartPeriod = MARKET_CHART_PERIODS[periodButton.dataset.marketPeriod] ? periodButton.dataset.marketPeriod : '1d';
    renderInvestmentMarket(appState.profile || {});
    return;
  }
  const incomeButton = event.target.closest('[data-market-income-claim]');
  if (incomeButton) {
    incomeButton.disabled = true;
    api('/api/market/daily-income', { method: 'POST' }).then((data) => { appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'mercado') renderInvestmentMarket(appState.profile); showToast(`Renda 51 resgatada: ${formatCredits(data.amount)} créditos.`); }).catch((error) => { showToast(error.message, 'error'); if (appState?.profile && currentPortalPage() === 'mercado') renderInvestmentMarket(appState.profile); });
    return;
  }
  const orderTab = event.target.closest('[data-market-order-tab]');
  if (orderTab) {
    const panel = orderTab.closest('.market-trade-panel'); const side = orderTab.dataset.marketOrderTab;
    panel?.querySelectorAll('[data-market-order-tab]').forEach((button) => { const active = button === orderTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    panel?.querySelectorAll('[data-market-order-pane]').forEach((pane) => { const active = pane.dataset.marketOrderPane === side; pane.hidden = !active; pane.classList.toggle('active', active); });
    return;
  }
  const quick = event.target.closest('[data-market-quick]');
  if (!quick) return;
  const form = quick.closest('[data-market-action]'); const input = form?.querySelector('input[name="quantity"]');
  if (!input) return;
  input.value = quick.dataset.marketQuick;
  updateMarketOrderTotal(form);
});
$('#mercado').addEventListener('submit', async (event) => {
  const autoForm = event.target.closest('[data-market-auto-sell]');
  if (autoForm) {
    event.preventDefault(); const button = autoForm.querySelector('button[type="submit"]'); button.disabled = true;
    try { const data = await api('/api/market/auto-sell', { method: 'POST', body: { assetId: autoForm.dataset.marketAsset, quantity: Number(new FormData(autoForm).get('quantity')), targetPrice: Number(new FormData(autoForm).get('targetPrice')) } }); appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'mercado') renderInvestmentMarket(appState.profile); showToast('Venda automática agendada e salva no servidor.'); }
    catch (error) { showToast(error.message, 'error'); }
    finally { if (button.isConnected) button.disabled = false; }
    return;
  }
  const cancelForm = event.target.closest('[data-market-auto-cancel]');
  if (cancelForm) {
    event.preventDefault(); const button = cancelForm.querySelector('button[type="submit"]'); button.disabled = true;
    try { const data = await api('/api/market/auto-sell/cancel', { method: 'POST', body: { orderId: cancelForm.dataset.orderId } }); appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'mercado') renderInvestmentMarket(appState.profile); showToast('Venda automática cancelada.'); }
    catch (error) { showToast(error.message, 'error'); }
    finally { if (button.isConnected) button.disabled = false; }
    return;
  }
  const form = event.target.closest('[data-market-action]'); if (!form) return;
  event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try { const data = await api('/api/market/' + form.dataset.marketAction, { method: 'POST', body: { assetId: form.dataset.marketAsset, quantity: Number(new FormData(form).get('quantity')) } }); appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'mercado') renderInvestmentMarket(appState.profile); showToast(form.dataset.marketAction === 'buy' ? 'Ativo comprado.' : 'Ativo vendido.'); }
  catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected) button.disabled = false; }
});
function updateCryptoOrderTotal(form) { if (!form) return; const quantity = Math.max(0, Number(form.querySelector('input[name="quantity"]')?.value || 0)); const cents = Number(form.dataset.marketPrice || 0) * quantity * 100; const total = (form.dataset.cryptoAction === "buy" ? Math.ceil(cents - 1e-9) : Math.floor(cents + 1e-9)) / 100; const output = form.querySelector("[data-market-total]"); if (output) output.textContent = `Total da ordem: ${marketMoney(total)} Créditos 51`; }
$('#crypto51')?.addEventListener('input', (event) => {
  const input = event.target.closest('[data-crypto-action] input[name="quantity"]');
  if (input) updateCryptoOrderTotal(input.form);
});
$('#cryptoChartAsset')?.addEventListener('change', (event) => {
  cryptoChartAssetId = event.target.value || 'all';
  if (appState?.profile) renderCryptoMarket(appState.profile);
});
$('#cryptoChartPeriods')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-crypto-period]');
  if (!button) return;
  cryptoChartPeriod = MARKET_CHART_PERIODS[button.dataset.cryptoPeriod] ? button.dataset.cryptoPeriod : '1d';
  if (appState?.profile) renderCryptoMarket(appState.profile);
});
$('#crypto51')?.addEventListener('click', (event) => {
  const incomeButton = event.target.closest('[data-crypto-income-claim]');
  if (incomeButton) {
    incomeButton.disabled = true;
    api('/api/crypto/daily-income', { method: 'POST' }).then((data) => { appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'crypto51') renderCryptoMarket(appState.profile); showToast(`Renda Cripto 51 resgatada: ${formatCredits(data.amount)} créditos.`); }).catch((error) => { showToast(error.message, 'error'); if (appState?.profile && currentPortalPage() === 'crypto51') renderCryptoMarket(appState.profile); });
    return;
  }
  const quick = event.target.closest('[data-crypto-quick]'); if (!quick) return;
  const form = quick.closest('[data-crypto-action]'); const input = form?.querySelector('input[name="quantity"]');
  if (!input) return; input.value = quick.dataset.cryptoQuick; updateCryptoOrderTotal(form);
});
$('#crypto51')?.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-crypto-action]'); if (!form) return;
  event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const data = await api('/api/crypto/' + form.dataset.cryptoAction, { method: 'POST', body: { assetId: form.dataset.cryptoAsset, quantity: Number(new FormData(form).get('quantity')), expectedPrice: Number(form.dataset.marketPrice) } });
    appState.profile = data.profile; renderProfileEconomy(appState.profile); if (currentPortalPage() === 'crypto51') renderCryptoMarket(appState.profile);
    showToast(form.dataset.cryptoAction === 'buy' ? 'Posição do Cripto 51 comprada.' : 'Posição do Cripto 51 vendida.');
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (button.isConnected) button.disabled = false; }
});
$('#topProfileButton').addEventListener('click', () => {
  const menu = $('#profileQuickMenu');
  if (!menu) return showPortalPage('perfil', true);
  const open = menu.classList.toggle('hidden');
  $('#topProfileButton').setAttribute('aria-expanded', String(!open));
});
document.addEventListener('click', (event) => {
  const action = event.target.closest?.('[data-profile-action]');
  if (action) {
    $('#profileQuickMenu')?.classList.add('hidden');
    $('#topProfileButton')?.setAttribute('aria-expanded', 'false');
    if (action.dataset.profileAction === 'profile') showPortalPage('perfil', true);
    else if (action.dataset.profileAction === 'password') openPasswordDialog(false);
    else if (action.dataset.profileAction === 'logout') logoutSession();
    return;
  }
  if (!event.target.closest?.('.profile-menu-wrap')) {
    $('#profileQuickMenu')?.classList.add('hidden');
    $('#topProfileButton')?.setAttribute('aria-expanded', 'false');
  }
});
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
  setNotificationPanel(false); markNotificationsRead(); openNotificationTarget(item.dataset.notificationId, item.dataset.notificationPage, item.dataset.notificationTarget, item.dataset.notificationProfile, item.dataset.notificationPokemon, item.dataset.notificationCaptureUser);
});
window.addEventListener('popstate', () => { if (appState) showPortalPage(currentPortalPage()); });

$('#currentYear').textContent = new Date().getFullYear();
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('#installAppButton').classList.remove('hidden'); });
$('#installAppButton').addEventListener('click', async () => { if (!deferredInstallPrompt) { showToast('No navegador, abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'); return; } deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('#installAppButton').classList.add('hidden'); showToast('Área 51 instalada como aplicativo! 📲'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js?v=20260930-464').catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicWanted && appState) startMusic();
});

let sessionBootAttempts = 0;
let sessionBootRetryTimer = null;
let sessionBootWatchdog = null;
let sessionBootController = null;
let sessionBootRunId = 0;
const SESSION_BOOT_RETRY_DELAYS = [1200, 2500];
function showSessionBootFailure(message, retryLabel = 'Tentar novamente') {
  $('#sessionBootText').textContent = message;
  const retry = $('#sessionBootRetry');
  retry.textContent = retryLabel;
  retry.classList.remove('hidden');
}
async function initialize() {
  const runId = ++sessionBootRunId;
  clearTimeout(sessionBootRetryTimer);
  clearTimeout(sessionBootWatchdog);
  // Uma nova tentativa substitui a anterior: reconectar não pode deixar
  // leituras de estado antigas disputando a mesma sessão.
  sessionBootController?.abort();
  const controller = new AbortController();
  sessionBootController = controller;
  sessionBootWatchdog = setTimeout(() => {
    if (!appState && runId === sessionBootRunId) showSessionBootFailure('A conexão está lenta, mas sua sessão continua ativa. Você pode aguardar ou reconectar agora.', 'Reconectar agora');
  }, 8000);
  let data;
  try {
    data = await api('/api/state', { timeoutMs: 30000, signal: controller.signal }, false);
  }
  catch(error) {
    if (runId !== sessionBootRunId) return;
    clearTimeout(sessionBootWatchdog);
    if(error.status===401) { showAuth(); return; }
    sessionBootAttempts += 1;
    const retryDelay = SESSION_BOOT_RETRY_DELAYS[sessionBootAttempts - 1];
    if (retryDelay) {
      $('#sessionBootText').textContent = 'Reconectando sua sessão…';
      $('#sessionBootRetry').classList.add('hidden');
      sessionBootRetryTimer = setTimeout(initialize, retryDelay);
      return;
    }
    showSessionBootFailure('Não foi possível verificar sua sessão agora. Seu acesso foi preservado; tente novamente em instantes.');
    return;
  }
  try {
    if (runId !== sessionBootRunId) return;
    clearTimeout(sessionBootWatchdog);
    drawWheel();
    showApp(data);
    sessionBootAttempts = 0;
  } catch (error) {
    // Do not report a confirmed session as an authentication failure. This
    // leaves a useful error in the browser console for support without
    // exposing internal details to the user.
    console.error('Falha ao montar a interface após validar a sessão.', error);
    showSessionBootFailure('Sua sessão foi verificada, mas a tela não terminou de carregar. Tente carregar a interface novamente.', 'Carregar interface');
  }
}
$('#sessionBootRetry').addEventListener('click',()=>{sessionBootAttempts=0;initialize();});
initialize();
let portalSyncInProgress = false;
let portalSyncTimer = null;
let lastPortalActivityAt = Date.now();
let lastPointerMoveActivityAt = 0;
let lastPortalSyncAt = 0;
// Impede rajadas de leituras quando a mesma aba recebe focus, renderiza uma
// ação e atualiza o estado quase no mesmo instante. A ação do usuário segue
// atualizando na hora; este limite vale apenas para a sincronização passiva.
const PORTAL_SYNC_BURST_GUARD_MS = 900;
function portalSyncDelay() {
  if (document.hidden) return 90000;
  const page = currentPortalPage();
  const impostorActive = page === 'impostor' && ['lobby', 'tips', 'voting'].includes(appState?.impostor?.active?.status);
  const mysteryActive = page === 'misterio' && appState?.mystery?.active?.status === 'open';
  const drawActive = page === 'sorteio' || page === 'inscricoes';
  const recentlyActive = Date.now() - lastPortalActivityAt < 5 * 60 * 1000;
  // Sorteio e inscrições são acompanhados coletivamente. Mesmo quem está só
  // assistindo, sem mover o mouse, precisa receber tema, envios e resultados
  // quase em tempo real.
  if (drawActive) return 5000;
  if (!recentlyActive) return 60000;
  return impostorActive || mysteryActive ? 5000 : 35000;
}
function schedulePortalSync(delay = portalSyncDelay()) {
  // Nunca cria dois timers concorrentes para a mesma leitura. Eventos de
  // foco e a renderização de uma atualização podem chegar juntos.
  clearTimeout(portalSyncTimer);
  const requestedDelay = Math.max(0, delay);
  const elapsed = Date.now() - lastPortalSyncAt;
  const guardedDelay = requestedDelay === 0
    ? Math.max(PORTAL_SYNC_BURST_GUARD_MS - elapsed, 0)
    : requestedDelay;
  portalSyncTimer = setTimeout(runPortalSync, guardedDelay);
}
async function runPortalSync() {
  if (!appState) return;
  if (document.hidden || !navigator.onLine) { schedulePortalSync(); return; }
  if (portalSyncInProgress) return;
  const editingMystery = currentPortalPage() === 'misterio' && $('#misterio')?.contains(document.activeElement) && document.activeElement?.matches('input,textarea,select');
  portalSyncInProgress = true;
  lastPortalSyncAt = Date.now();
  const syncStartedAt = performance.now();
  if ($('#liveStatus')) $('#liveStatus').textContent = 'ATUALIZANDO';
  try {
    const sync = await api('/api/sync', {}, false);
    if (!appState) return;
    if (Array.isArray(sync.onlinePeople)) { appState.onlinePeople = sync.onlinePeople; renderOnlinePeople(); }
    serverClockOffset = Number(sync.serverTime || Date.now()) - Date.now();
    if (sync.liveDraw) receiveLiveDraw(sync.liveDraw);
    const changed = Number(sync.revision) !== Number(appState.serverRevision) || Boolean(sync.loanOverdue) !== Boolean(appState.profile?.loan?.overdue);
    const currentRequiredLieVoteId = appState.lieMeter?.requiredVote?.id || null;
    const incomingRequiredLieVoteId = sync.requiredLieVote?.id || null;
    const requiredLieVoteChanged = currentRequiredLieVoteId !== incomingRequiredLieVoteId;
    let reminderNeedsState = false;
    if (sync.lotteryReminder) {
      const stateKey = 'area51-lottery-reminder-state:' + String(sync.lotteryReminder.roundId);
      try {
        reminderNeedsState = !sessionStorage.getItem(stateKey);
        if (reminderNeedsState) sessionStorage.setItem(stateKey, '1');
      } catch { reminderNeedsState = true; }
      if (reminderNeedsState) {
        const toastKey = 'area51-lottery-reminder-toast:' + String(sync.lotteryReminder.roundId);
        try {
          if (!sessionStorage.getItem(toastKey)) {
            sessionStorage.setItem(toastKey, '1');
            showToast(`Faltam 10 minutos para a Mega 51. Compre seu bilhete antes das ${lotteryTimeLabel(sync.lotteryReminder.closeAt)}.`, 'error');
          }
        } catch { showToast(`Faltam 10 minutos para a Mega 51. Compre seu bilhete antes das ${lotteryTimeLabel(sync.lotteryReminder.closeAt)}.`, 'error'); }
      }
    }
    if ((changed || reminderNeedsState || requiredLieVoteChanged) && !editingMystery && !spinning && !casinoSpinInProgress && !mysteryOpeningInProgress && !cobblemonOpeningLocked && !cobblemonFlowLocked) applyState(await api('/api/state', {}, false));
    if ($('#liveStatus')) {
      $('#liveStatus').textContent = 'SINCRONIZADO';
      $('#liveStatus').title = 'Atualizado em ' + Math.round(performance.now() - syncStartedAt) + ' ms';
    }
  } catch {
    if ($('#liveStatus')) { $('#liveStatus').textContent = 'RECONEXÃO'; $('#liveStatus').title = 'Tentando reconectar automaticamente'; }
  } finally { portalSyncInProgress = false; schedulePortalSync(); }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && appState?.realtimeTransport === 'adaptive-poll') { lastPortalActivityAt = Date.now(); schedulePortalSync(0); }
});
function notePortalActivity(source = 'interaction') {
  const now = Date.now();
  // O ponteiro pode disparar centenas de eventos por segundo. Ele ainda
  // mantém o comportamento de sincronização atual, mas no máximo uma vez a
  // cada 30 segundos — sem transformar movimento contínuo em trabalho local.
  if (source === 'pointermove') {
    if (now - lastPointerMoveActivityAt < 30000) return;
    lastPointerMoveActivityAt = now;
  }
  const wasIdle = now - lastPortalActivityAt >= 5 * 60 * 1000;
  lastPortalActivityAt = now;
  if (wasIdle && appState?.realtimeTransport === 'adaptive-poll' && !document.hidden) schedulePortalSync(0);
}
document.addEventListener('pointermove', () => notePortalActivity('pointermove'), { passive: true });
document.addEventListener('pointerdown', () => notePortalActivity('pointerdown'), { passive: true });
document.addEventListener('keydown', () => notePortalActivity('keydown'), { passive: true });
window.addEventListener('online', () => { if (appState?.realtimeTransport === 'adaptive-poll') schedulePortalSync(0); });
window.addEventListener('focus', () => { if (appState?.realtimeTransport === 'adaptive-poll' && !document.hidden) schedulePortalSync(0); });
window.addEventListener('offline', () => {
  if ($('#liveStatus')) { $('#liveStatus').textContent = 'OFFLINE'; $('#liveStatus').title = 'Aguardando a conexão voltar'; }
});

document.addEventListener('input', (event) => { if (event.target?.id === 'cobblemonDexSearch' && appState?.profile) { cobblemonDexPage = 0; renderCobblemonDex(appState.profile); } });
function normalizeCobblemonBallQuantityInput(input, commit = false) {
  if (!input?.matches?.('[data-cobblemon-ball-quantity]')) return;
  const ballType = input.dataset.cobblemonBallQuantity;
  if (!Object.hasOwn(cobblemonBallPurchaseQuantities, ballType)) return;
  const digits = String(input.value || '').replace(/\D/g, '').slice(0, 2);
  if (input.value !== digits) input.value = digits;
  if (!digits) {
    if (commit) {
      const fallback = Math.max(1, Math.min(20, Math.floor(Number(cobblemonBallPurchaseQuantities[ballType]) || 1)));
      input.value = String(fallback);
      cobblemonBallPurchaseQuantities[ballType] = fallback;
    }
    return;
  }
  const quantity = Number(digits);
  if (quantity >= 1 && quantity <= 20) cobblemonBallPurchaseQuantities[ballType] = quantity;
  else if (commit) {
    const clamped = Math.max(1, Math.min(20, quantity || 1));
    input.value = String(clamped);
    cobblemonBallPurchaseQuantities[ballType] = clamped;
  }
}
document.addEventListener('input', (event) => normalizeCobblemonBallQuantityInput(event.target?.closest?.('[data-cobblemon-ball-quantity]')));
document.addEventListener('blur', (event) => normalizeCobblemonBallQuantityInput(event.target?.closest?.('[data-cobblemon-ball-quantity]'), true), true);
document.addEventListener('focusin', (event) => {
  const input = event.target?.closest?.('[data-cobblemon-ball-quantity]');
  if (!input || input.readOnly || input.disabled) return;
  requestAnimationFrame(() => {
    if (document.activeElement === input) input.select();
  });
});
$('#cobblemonBallOptions')?.addEventListener('pointerdown', (event) => {
  const input = event.target?.closest?.('[data-cobblemon-ball-quantity]');
  if (!input || input.readOnly || input.disabled) return;
  // Keep the field usable when a premium cursor effect is active and make a
  // click on its label behave exactly like a click on the input itself.
  input.focus({ preventScroll: true });
  requestAnimationFrame(() => input.select());
}, true);
$('#closeCobblemonOddsDialog')?.addEventListener('click', () => $('#cobblemonOddsDialog').close());
$('#cobblemonOpeningDialog')?.addEventListener('cancel', (event) => event.preventDefault());
$('#cobblemonOpeningDialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); } });
$('#cobblemonOpeningDialog')?.addEventListener('close', (event) => { if (cobblemonOpeningLocked && event.currentTarget.isConnected) setTimeout(() => { if (cobblemonOpeningLocked && !event.currentTarget.open) event.currentTarget.showModal(); }, 0); });
let cobblemonPageEncounter = null;
let cobblemonPageDrag = null;
let cobblemonPageCaptureBusy = false;
let cobblemonPageThrowSequence = 0;
let cobblemonHuntInterval = null;
let cobblemonHuntNavigationPortal = null;
let cobblemonCaptureResultTimer = null;
let cobblemonCaptureResultGeneration = 0;
let cobblemonOpenDeliveryGroups = null;
// A caça é do portal inteiro. Quando uma área pública nova é criada ela deve
// entrar aqui também; deixar Passe, Loteria, Mercado ou Votações de fora fazia o
// Pokémon nunca se esconder justamente nas telas mais recentes. Admin fica
// excluído por ser uma área restrita de operação.
const COBBLEMON_HUNT_SECTORS = ['sorteio','inscricoes','memes','anonimos','agua','mentirometro','misterio','impostor','perfil','cobblemon','album','loja','jogos','loteria','mercado','votacoes','classificacao','passe','atualizacoes'];

function cobblemonHuntEnabledSectors(flags = appState?.settings?.featureFlags || {}) {
  return COBBLEMON_HUNT_SECTORS.filter((page) => {
    const feature = featurePageMap[page];
    return !feature || flags[feature] !== false;
  });
}

function isCobblemonHuntSectorReachable(page) {
  const section = $('#' + page);
  const link = $(`#siteMenu a[data-page="${page}"]`);
  return Boolean(section && link && !link.hidden && link.getAttribute('aria-disabled') !== 'true');
}

function randomCobblemonHuntSector() {
  const sectors = cobblemonHuntEnabledSectors().filter(isCobblemonHuntSectorReachable);
  return sectors[Math.floor(Math.random() * sectors.length)] || 'sorteio';
}

function updateCobblemonHuntSector(page = currentPortalPage()) {
  const target = $('#cobblemonEncounterTarget');
  if (!target || !cobblemonPageEncounter) return;
  // Nunca deixe um encontro em uma área interna/oculta: ela não pode ser
  // encontrada pelo menu e era a causa de caçadas sem Pokémon visível.
  if (!isCobblemonHuntSectorReachable(cobblemonPageEncounter.huntPage)) {
    cobblemonPageEncounter.huntPage = randomCobblemonHuntSector();
  }
  const encounterFeature = featurePageMap[cobblemonPageEncounter.huntPage];
  const encounterPageEnabled = !encounterFeature || appState?.settings?.featureFlags?.[encounterFeature] !== false;
  const visible = encounterPageEnabled && (!cobblemonPageEncounter.huntPage || cobblemonPageEncounter.huntPage === page);
  target.classList.toggle('sector-hidden', !visible);
  target.classList.toggle('hidden', !visible);
  const ball = $('#cobblemonPageBall');
  if (ball && !cobblemonPageCaptureBusy) ball.classList.toggle('hidden', !visible);
  renderCobblemonBallOptions(appState.profile?.cobblemon?.balls || {}, cobblemonPageEncounter);
  const panel = $('#cobblemonHuntBallPanel');
  if (panel) {
    const title = panel.querySelector('strong');
    const hint = panel.querySelector('small');
    if (title) title.textContent = visible ? 'Escolha a bola pela chance de captura' : 'Encontre o Pokémon para escolher a bola';
    if (hint) hint.textContent = visible ? 'Clique na bola desejada. Ela fica centralizada; arraste a Poké Ball que aparece até o Pokémon e solte.' : 'As chances aparecem quando você abrir a página onde ele está escondido.';
    syncCobblemonHuntBallPosition();
  }
  if (visible) {
    cobblemonPageEncounter.revealed = true;
    placeCobblemonEncounter();
    if (cobblemonPageEncounter.alreadyOwned && !cobblemonPageEncounter.duplicateNoticeShown) {
      cobblemonPageEncounter.duplicateNoticeShown = true;
      const wildLevel = Number(cobblemonPageEncounter.pokemon?.level || 0);
      const ownedLevel = Number(cobblemonPageEncounter.ownedLevel || 0);
      const comparison = wildLevel > ownedLevel ? 'é mais forte e pode substituir o seu se você capturar.' : 'não é mais forte; você pode deixar o tempo acabar sem gastar Poké Ball.';
      $('#cobblemonCaptureHint').textContent = `Você já possui ${cobblemonPageEncounter.pokemon.name} nível ${ownedLevel}. Este é nível ${wildLevel} e ${comparison}`;
      showToast(`Você já tem ${cobblemonPageEncounter.pokemon.name} (nível ${ownedLevel}).`);
    }
  }
}

function showCobblemonCaptureFx(point, captured) {
  const ring = document.createElement('i');
  ring.className = `cobblemon-capture-ring${captured ? ' captured' : ' failed'}`;
  ring.style.left = point.x + 'px'; ring.style.top = point.y + 'px';
  document.body.appendChild(ring);
  for (let index = 0; index < 24; index += 1) {
    const angle = Math.PI * 2 * index / 24 + Math.random() * .16;
    const particle = document.createElement('i');
    particle.className = `cobblemon-capture-particle${captured ? ' captured' : ' failed'}`;
    particle.style.left = point.x + 'px'; particle.style.top = point.y + 'px';
    particle.style.setProperty('--capture-x', Math.cos(angle) * (58 + Math.random() * 76) + 'px');
    particle.style.setProperty('--capture-y', Math.sin(angle) * (58 + Math.random() * 76) + 'px');
    particle.style.setProperty('--pixel-size', `${5 + Math.floor(Math.random() * 7)}px`);
    document.body.appendChild(particle); setTimeout(() => particle.remove(), 920);
  }
  setTimeout(() => ring.remove(), 980);
}

function showCobblemonCaptureFlash(point, captured) {
  const flash = document.createElement('i');
  flash.className = `cobblemon-capture-flash${captured ? ' captured' : ' failed'}`;
  flash.style.left = point.x + 'px'; flash.style.top = point.y + 'px';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), captured ? 1100 : 720);
}

function showCobblemonCaptureOutcome(pokemon, data) {
  document.querySelector('.cobblemon-global-outcome')?.remove();
  const outcome = document.createElement('aside');
  outcome.className = `cobblemon-global-outcome ${data.captured ? 'cobblemon-result-dex captured' : 'cobblemon-result-escape'}`;
  outcome.setAttribute('role', 'status');
  if (!data.captured) {
    outcome.innerHTML = `<div class="capture-escape-scene" aria-hidden="true"><i class="capture-escape-dust dust-one"></i><i class="capture-escape-dust dust-two"></i>${cobblemonSpriteMarkup(pokemon, 'large', `alt=""`)}</div><div><strong>${escapeHtml(pokemon.name)} fugiu!</strong><span>${data.missed ? `A ${escapeHtml(data.ballName || 'Poké Ball')} passou longe.` : `A ${escapeHtml(data.ballName || 'Poké Ball')} abriu e ele escapou.`}</span></div>`;
    document.body.appendChild(outcome);
    requestAnimationFrame(() => outcome.classList.add('show'));
    setTimeout(() => { outcome.classList.remove('show'); setTimeout(() => outcome.remove(), 260); }, 2800);
    return;
  }
  const level = Number(pokemon.level);
  outcome.innerHTML = `<div class="capture-dex-head"><i class="capture-dex-lens" aria-hidden="true"></i><div class="capture-dex-lights" aria-hidden="true"><i></i><i></i><i></i></div><div class="capture-dex-title"><span>COBBLEMON · POKÉDEX</span><strong>${data.captured ? 'Capturado!' : 'Fugiu!'}</strong></div></div><div class="capture-dex-body"><div class="capture-dex-sprite">${pokemon.isShiny ? '<b class="capture-dex-shiny">✨ SHINY</b>' : ''}${cobblemonSpriteMarkup(pokemon, 'large', `alt="${escapeHtml(pokemon.name)}"`)}</div><div class="capture-dex-details"><div class="capture-dex-name"><small>#${String(Number(pokemon.id) || 0).padStart(3, '0')}</small> ${escapeHtml(pokemon.name)}</div><dl><div><dt>Nível</dt><dd>${Number.isFinite(level) && level > 0 ? level : 'Não informado'}</dd></div><div><dt>Raridade</dt><dd>${escapeHtml(cobblemonTierLabel(pokemon.tier))}</dd></div><div><dt>Bola</dt><dd>${escapeHtml(data.ballName || 'Poké Ball')}</dd></div></dl></div></div>`;
  document.body.appendChild(outcome);
  requestAnimationFrame(() => outcome.classList.add('show'));
  setTimeout(() => { outcome.classList.remove('show'); setTimeout(() => outcome.remove(), 320); }, 5000);
}

// A caçada continua sobre qualquer setor do portal, sem trocar ou recarregar
// a página. Esta película tira a leitura de "item já possuído" do conteúdo
// que ficou atrás, mantendo alvo, bola e controles inteiramente em foco.
function setCobblemonHuntFocus(active) {
  let layer = document.querySelector('.cobblemon-hunt-focus-layer');
  if (!active) {
    if (!layer) return;
    layer.classList.remove('show');
    setTimeout(() => { if (!layer?.classList.contains('show')) layer?.remove(); }, 180);
    return;
  }
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'cobblemon-hunt-focus-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  requestAnimationFrame(() => layer.classList.add('show'));
}

function scheduleCobblemonCaptureResultClear(delay = 8000) {
  clearTimeout(cobblemonCaptureResultTimer);
  const generation = ++cobblemonCaptureResultGeneration;
  const result = $('#cobblemonCaptureResult');
  cobblemonCaptureResultTimer = setTimeout(() => {
    const current = $('#cobblemonCaptureResult');
    // A tentativa já pode ter terminado em outra página ou a Pokédex ter sido
    // redesenhada. A geração protege somente contra apagar um resultado novo;
    // depender do encontro deixava o aviso de fuga preso na tela.
    if (generation === cobblemonCaptureResultGeneration && current) {
      current.textContent = '';
      current.className = 'cobblemon-capture-result';
    }
    cobblemonCaptureResultTimer = null;
  }, delay);
}

function moveCobblemonHuntNavigationToDocument() {
  if (cobblemonHuntNavigationPortal) return;
  const appView = $('#appView');
  const topbar = $('.topbar');
  const notification = $('#notificationPanel');
  const backdrop = $('#menuBackdrop');
  const menu = $('#siteMenu');
  // O topo continua dentro do app: movê-lo quebrava o layout sticky e deixava
  // uma faixa vazia. Apenas os painéis flutuantes saem da película.
  const navigation = [notification, backdrop, menu].filter(Boolean);
  if (!appView || !navigation.length) return;
  const anchor = document.createComment('cobblemon-hunt-navigation-home');
  appView.prepend(anchor);
  const portal = document.createElement('div');
  portal.id = 'cobblemonHuntNavigationPortal';
  document.body.append(portal);
  navigation.forEach((element) => portal.append(element));
  // Inline values bypassam regras antigas que algum navegador ainda possa ter
  // guardado em cache. A navegação fica fora da película da caçada.
  topbar?.style.setProperty('z-index', '2147483000', 'important');
  topbar?.style.setProperty('filter', 'none', 'important');
  notification?.style.setProperty('z-index', '2147483100', 'important');
  backdrop?.style.setProperty('z-index', '2147482900', 'important');
  backdrop?.style.setProperty('backdrop-filter', 'none', 'important');
  backdrop?.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
  menu?.style.setProperty('z-index', '2147483200', 'important');
  cobblemonHuntNavigationPortal = { anchor, portal, navigation, topbar };
}

function restoreCobblemonHuntNavigation() {
  const state = cobblemonHuntNavigationPortal;
  if (!state) return;
  const [notification, backdrop, menu] = state.navigation;
  [state.topbar, notification, backdrop, menu].forEach((element) => {
    element?.style.removeProperty('z-index');
  });
  state.topbar?.style.removeProperty('filter');
  backdrop?.style.removeProperty('backdrop-filter');
  backdrop?.style.removeProperty('-webkit-backdrop-filter');
  state.navigation.forEach((element) => state.anchor.before(element));
  state.anchor.remove();
  state.portal.remove();
  cobblemonHuntNavigationPortal = null;
}

function resetCobblemonPageCapture(clearResult = false) {
  const ball = $('#cobblemonPageBall');
  const target = $('#cobblemonEncounterTarget');
  const timer = $('#cobblemonHuntTimer');
  const stage = $('.cobblemon-capture-stage');
  cobblemonPageThrowSequence += 1;
  ball?.getAnimations?.().forEach((animation) => animation.cancel());
  clearInterval(cobblemonHuntInterval);
  cobblemonHuntInterval = null;
  cobblemonPageEncounter = null;
  cobblemonSelectedBall = 'poke';
  cobblemonPageDrag = null;
  cobblemonPageCaptureBusy = false;
  document.body.classList.remove('cobblemon-hunt-active');
  setCobblemonHuntFocus(false);
  restoreCobblemonHuntNavigation();
  restoreCobblemonBallPanel();
  stage?.append(target, ball, timer);
  ball.className = 'cobblemon-page-ball hidden';
  target.className = 'cobblemon-encounter-target hidden';
  ball.removeAttribute('style');
  target.removeAttribute('style');
  timer.classList.add('hidden');
  $('#cobblemonCaptureButton').disabled = !cobblemonHasAvailableBall(appState.profile?.cobblemon?.balls);
  $('#cobblemonCaptureButton').textContent = 'Iniciar caçada';
  $('#cobblemonCaptureHint').textContent = 'Clique em “Iniciar caçada” para procurar um Pokémon selvagem.';
  syncCobblemonHuntLauncher();
  renderCobblemonBallOptions(appState.profile?.cobblemon?.balls || {}, null);
  if (clearResult) {
    clearTimeout(cobblemonCaptureResultTimer);
    cobblemonCaptureResultTimer = null;
    cobblemonCaptureResultGeneration += 1;
    $('#cobblemonCaptureResult').textContent = '';
    $('#cobblemonCaptureResult').className = 'cobblemon-capture-result';
  }
  if (appState && currentPortalPage() !== 'cobblemon') {
    renderedPortalPage = null;
    requestAnimationFrame(() => { if (!cobblemonPageEncounter) renderActivePortalPage(appState); });
  }
}

function syncCobblemonHuntLauncher() {
  const button = $('#topCobblemonHuntButton');
  if (!button) return;
  const active = Boolean(cobblemonPageEncounter);
  const hasBall = cobblemonHasAvailableBall(appState?.profile?.cobblemon?.balls);
  button.disabled = active || !hasBall;
  button.title = active ? 'Caçada Cobblemon em andamento' : hasBall ? 'Iniciar caçada Cobblemon' : 'Sem Poké Balls disponíveis para caçar';
  button.setAttribute('aria-label', button.title);
  button.dataset.tooltip = active ? 'Caçada em andamento' : hasBall ? 'Iniciar caçada' : 'Sem Poké Balls disponíveis';
}

function placeCobblemonEncounter() {
  const target = $('#cobblemonEncounterTarget');
  // O encontro pode continuar sendo descoberto ao trocar de setor, mas, ao
  // aparecer, fica no eixo central para que o alvo e a bola não caiam em
  // cantos diferentes da tela.
  const minY = Math.min(220, Math.max(150, window.innerHeight * .28));
  const maxY = Math.max(minY, window.innerHeight - 300);
  const centerY = Math.min(maxY, Math.max(minY, window.innerHeight * .42));
  target.style.left = `${Math.round(window.innerWidth / 2)}px`;
  target.style.top = `${Math.round(centerY)}px`;
}

async function startCobblemonPageEncounter() {
  const button = $('#cobblemonCaptureButton');
  if (!button || button.disabled) return;
  if (!appState?.me?.id || !appState?.profile) {
    const message = 'Sua sessão ainda está carregando. Tente novamente em alguns segundos.';
    showToast(message, 'error');
    $('#cobblemonCaptureResult').textContent = message;
    return;
  }
  if (cobblemonDexOwnerId && cobblemonDexOwnerId !== appState.me.id) {
    cobblemonDexOwnerId = appState.me.id;
    renderCobblemonDex(appState.profile);
  }
  if (!cobblemonHasAvailableBall(appState.profile.cobblemon?.balls)) {
    const message = 'Você não possui nenhuma Poké Ball disponível para a caça.';
    showToast(message, 'error');
    $('#cobblemonCaptureResult').textContent = message;
    return;
  }
  resetCobblemonPageCapture(true);
  button.disabled = true;
  button.textContent = 'Procurando…';
  $('#cobblemonCaptureHint').textContent = 'Procurando no bioma…';
  try {
    const data = await api('/api/cobblemon/encounter', { method: 'POST' });
    if (data.profile) appState.profile = data.profile;
    const huntPage = randomCobblemonHuntSector();
    const huntStartedAt = Date.now();
    cobblemonPageEncounter = { ...data, huntPage, expiresAt: huntStartedAt + Number(data.expiresIn || 60) * 1000, revealed: false };
    syncCobblemonHuntLauncher();
    renderCobblemonBallOptions(appState.profile?.cobblemon?.balls || {}, cobblemonPageEncounter);
    mountCobblemonHuntBallPanel();
    const target = $('#cobblemonEncounterTarget');
    const ball = $('#cobblemonPageBall');
    moveCobblemonHuntNavigationToDocument();
    document.body.append(target, ball, $('#cobblemonHuntTimer'));
    document.body.classList.add('cobblemon-hunt-active');
    setCobblemonHuntFocus(true);
    applyCobblemonSprite(target.querySelector('img'), data.pokemon);
    target.querySelector('img').alt = data.pokemon.name;
    target.querySelector('strong').textContent = data.pokemon.isShiny ? `✨ ${data.pokemon.name} · SHINY` : data.pokemon.name;
    target.querySelector('small').textContent = `${data.pokemon.type} · nível ${Number(data.pokemon.level)} · ${cobblemonTierLabel(data.pokemon.tier)}${data.pokemon.isShiny ? ' · SHINY' : ''}`;
    placeCobblemonEncounter();
    target.className = `cobblemon-encounter-target hunting tier-${Number(data.pokemon.tier)}${data.pokemon.isShiny ? ' shiny' : ''}`;
    syncCobblemonSelectedBall(appState.profile?.cobblemon?.balls || {});
    ball.className = `cobblemon-page-ball hunting ready${cobblemonPageEncounter.huntPage && cobblemonPageEncounter.huntPage !== currentPortalPage() ? ' hidden' : ''}`;
    button.textContent = 'Caçada em andamento';
    $('#cobblemonHuntTimer').classList.remove('hidden');
    updateCobblemonHuntSector(currentPortalPage());
    $('#cobblemonCaptureHint').textContent = 'Ele se escondeu em algum setor do site. Você tem 1 minuto para encontrá-lo e arremessar!';
    showToast('Caça iniciada: procure o Pokémon pelos setores do site!');
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((cobblemonPageEncounter.expiresAt - Date.now()) / 1000));
      $('#cobblemonHuntTimer').textContent = `CAÇA · 0:${String(seconds).padStart(2, '0')}`;
      if (seconds <= 0) {
        $('#cobblemonCaptureResult').textContent = 'O Pokémon foi embora. Nenhuma Poké Ball foi gasta.';
        scheduleCobblemonCaptureResultClear();
        resetCobblemonPageCapture(false);
      }
    };
    tick();
    cobblemonHuntInterval = setInterval(tick, 1000);
  } catch (error) {
    resetCobblemonPageCapture(false);
    showToast(error.message, 'error');
    $('#cobblemonCaptureResult').textContent = error.message;
    scheduleCobblemonCaptureResultClear();
  }
}

async function finishCobblemonPageThrow(event) {
  if (!cobblemonPageDrag || cobblemonPageCaptureBusy || !cobblemonPageEncounter) return;
  const dragState = cobblemonPageDrag;
  const throwSequence = ++cobblemonPageThrowSequence;
  const ball = $('#cobblemonPageBall');
  const target = $('#cobblemonEncounterTarget');
  const targetRect = target.getBoundingClientRect();
  const hit = event.clientX >= targetRect.left - 28 && event.clientX <= targetRect.right + 28 && event.clientY >= targetRect.top - 28 && event.clientY <= targetRect.bottom + 28;
  cobblemonPageDrag = null;
  cobblemonPageCaptureBusy = true;
  ball.releasePointerCapture?.(event.pointerId);
  ball.getAnimations?.().forEach((animation) => animation.cancel());
  ball.className = `cobblemon-page-ball hunting throwing ${hit ? 'aimed' : 'missed'}`;
  $('#cobblemonCaptureHint').textContent = hit ? 'Acertou! A Poké Ball está tentando capturar…' : 'A Poké Ball passou longe…';
  // A confirmação é calculada e gravada pelo servidor somente depois da
  // sequência visual. Assim saldo e Pokédex não mudam antes de a Poké Ball
  // terminar a tentativa na tela.
  const encounterToken = cobblemonPageEncounter.encounterToken;
  const ballType = cobblemonSelectedBall;
  try {
    const targetPoint = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    const impactPoint = hit ? targetPoint : { x: event.clientX, y: event.clientY };
    // A bola parte do ponto onde o participante começou o arraste. Assim, a
    // animação acompanha a ação real em vez de reaparecer em um canto fixo.
    const launchPoint = {
      x: Math.max(34, Math.min(window.innerWidth - 34, Number(dragState.origin?.x || event.clientX))),
      y: Math.max(34, Math.min(window.innerHeight - 34, Number(dragState.origin?.y || event.clientY))),
    };
    ball.style.left = `${launchPoint.x}px`;
    ball.style.top = `${launchPoint.y}px`;
    const arcPoint = { x: (launchPoint.x + impactPoint.x) / 2, y: Math.min(impactPoint.y, launchPoint.y) - 96 };
    const throwAnimation = ball.animate([
      { transform: 'translate(-50%,-50%) rotate(-18deg) scale(1.08)', offset: 0 },
      { transform: `translate(-50%,-50%) translate(${arcPoint.x - launchPoint.x}px,${arcPoint.y - launchPoint.y}px) rotate(310deg) scale(1.12)`, offset: .55 },
      { transform: `translate(-50%,-50%) translate(${impactPoint.x - launchPoint.x}px,${impactPoint.y - launchPoint.y}px) rotate(720deg) scale(.82)`, offset: 1 },
    ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 620, easing: 'cubic-bezier(.2,.76,.24,1)', fill: 'forwards' });
    await throwAnimation.finished.catch(() => {});
    if (throwSequence !== cobblemonPageThrowSequence || !cobblemonPageEncounter) return;
    ball.getAnimations?.().forEach((animation) => animation.cancel());
    ball.style.left = `${impactPoint.x}px`;
    ball.style.top = `${impactPoint.y}px`;
    ball.className = `cobblemon-page-ball hunting ${hit ? 'impacting' : 'missed'}`;
    await new Promise((resolve) => setTimeout(resolve, hit ? 480 : 260));
    if (throwSequence !== cobblemonPageThrowSequence || !cobblemonPageEncounter) return;
    const data = await api('/api/cobblemon/capture', { method: 'POST', body: { encounterToken, hit, ballType } });
    if (throwSequence !== cobblemonPageThrowSequence) return;
    const mon = data.pokemon;
    appState.profile = data.profile;
    target.classList.add(data.captured ? 'captured' : data.missed ? 'missed-target' : 'escaped');
    ball.className = `cobblemon-page-ball hunting ${data.captured ? 'caught' : data.missed ? 'lost' : 'failed'}`;
    const capturePoint = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    showCobblemonCaptureFlash(capturePoint, data.captured);
    showCobblemonCaptureFx(capturePoint, data.captured);
    await new Promise((resolve) => setTimeout(resolve, data.captured ? 1180 : 520));
    if (throwSequence !== cobblemonPageThrowSequence) return;
    showCobblemonCaptureOutcome(mon, data);
    const bonus = Number(data.captureBonus?.total || 0);
    const bonusText = bonus > 0 ? ` Bônus de captura: +${formatCredits(bonus)} Créditos 51.` : '';
    const shinyLabel = mon.isShiny ? ' ✨ SHINY!' : '';
    const outcome = data.captured ? (data.replaced ? `✓ ${escapeHtml(mon.name)} nível ${Number(mon.level)} substituiu seu nível ${Number(data.ownedLevel)}.` : data.shinyUpgraded ? `✓ ${escapeHtml(mon.name)} agora está registrado como SHINY na sua Pokédex.` : data.keptExisting ? `✓ ${escapeHtml(mon.name)} foi capturado, mas seu nível ${Number(data.ownedLevel)} já era melhor.` : `✓ ${escapeHtml(mon.name)} foi capturado!${shinyLabel}`) + bonusText : data.missed ? `Você errou ${escapeHtml(mon.name)} e gastou 1 ${escapeHtml(data.ballName || 'Poké Ball')}.` : `${escapeHtml(mon.name)} escapou. Chance desta tentativa com ${escapeHtml(data.ballName || 'Poké Ball')}: ${Number(data.chance)}%.`;
    const resultBox = $('#cobblemonCaptureResult');
    resultBox.className = 'cobblemon-capture-result ' + (data.captured ? 'capture-success' : 'capture-failed');
    resultBox.innerHTML = `<span>${cobblemonSpriteMarkup(mon, 'large', 'alt="" style="width:48px;height:48px;object-fit:contain;vertical-align:middle"')} ${outcome}</span>`;
    scheduleCobblemonCaptureResultClear();
    $('#cobblemonCaptureHint').textContent = data.captured ? `Captura confirmada com ${data.ballName || 'Poké Ball'} pelo servidor!` : data.missed ? `O Pokémon fugiu após o arremesso de ${data.ballName || 'Poké Ball'}.` : `A ${data.ballName || 'Poké Ball'} abriu e o Pokémon escapou.`;
    renderCobblemonDex(appState.profile);
    setTimeout(() => resetCobblemonPageCapture(false), data.captured ? 3300 : 2500);
  } catch (error) {
    showToast(error.message, 'error');
    $('#cobblemonCaptureResult').textContent = error.message;
    scheduleCobblemonCaptureResultClear();
    resetCobblemonPageCapture(false);
  }
}

$('#cobblemonPageBall')?.addEventListener('pointerdown', (event) => {
  if (!cobblemonPageEncounter || cobblemonPageCaptureBusy) return;
  event.preventDefault();
  const ball = event.currentTarget;
  cobblemonPageDrag = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY } };
  ball.setPointerCapture?.(event.pointerId);
  ball.classList.add('dragging');
  ball.style.bottom = 'auto';
  ball.style.right = 'auto';
  ball.style.left = `${event.clientX}px`;
  ball.style.top = `${event.clientY}px`;
  $('#cobblemonCaptureHint').textContent = `Mire no Pokémon e solte a ${COBBLEMON_CAPTURE_BALLS[cobblemonSelectedBall]?.name || 'Poké Ball'}.`;
});
$('#cobblemonPageBall')?.addEventListener('pointermove', (event) => {
  if (!cobblemonPageDrag || event.pointerId !== cobblemonPageDrag.pointerId) return;
  event.preventDefault();
  event.currentTarget.style.left = `${Math.max(24, Math.min(window.innerWidth - 24, event.clientX))}px`;
  event.currentTarget.style.top = `${Math.max(24, Math.min(window.innerHeight - 24, event.clientY))}px`;
});
$('#cobblemonPageBall')?.addEventListener('pointerup', (event) => {
  if (cobblemonPageDrag && event.pointerId === cobblemonPageDrag.pointerId) {
    event.preventDefault();
    void finishCobblemonPageThrow(event);
  }
});
$('#cobblemonPageBall')?.addEventListener('pointercancel', (event) => {
  if (cobblemonPageDrag && event.pointerId === cobblemonPageDrag.pointerId) void finishCobblemonPageThrow(event);
});
async function sellCobblemonCandidate(button) {
  if (!button || button.disabled) return;
  const amount = Number(button.dataset.cobblemonCandidatePrice || 300);
  if (!confirmCobblemonAction(`Vender este Pokémon por ${formatCredits(amount)} Créditos 51? Ele será removido da lista e não poderá ser recuperado.`, button)) return;
  button.disabled = true;
  try {
    const data = await api('/api/cobblemon/reward/decision', { method: 'POST', body: { id: button.dataset.cobblemonCandidateSell, action: 'sell-candidate' } });
    appState.profile = data.profile;
    renderProfileEconomy(appState.profile);
    showToast(`Pokémon vendido por ${formatCredits(amount)} Créditos 51.`);
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
}

async function chooseCobblemonCandidateForDelivery(button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const data = await api('/api/cobblemon/reward/decision', {
      method: 'POST',
      body: { id: button.dataset.cobblemonWeeklyChoice, action: 'choose-weekly-now' },
    });
    appState.profile = data.profile;
    renderProfileEconomy(appState.profile);
    showToast(`Pokémon escolhido para a entrega do Davi.${data.autoSold?.count ? ` ${data.autoSold.count} outra(s) opção(ões) vendida(s) por ${formatCredits(data.autoSold.total)} créditos.` : ''}`);
  } catch (error) {
    showToast(error.message, 'error');
    button.disabled = false;
  }
}

$('#cobblemonCapsuleResults')?.addEventListener('click', (event) => {
  const weeklyChoiceButton = event.target?.closest?.('[data-cobblemon-weekly-choice]');
  if (weeklyChoiceButton) {
    event.preventDefault();
    event.stopPropagation();
    void chooseCobblemonCandidateForDelivery(weeklyChoiceButton);
    return;
  }
  const candidateSellButton = event.target?.closest?.('[data-cobblemon-candidate-sell]');
  if (!candidateSellButton) return;
  event.preventDefault();
  event.stopPropagation();
  void sellCobblemonCandidate(candidateSellButton);
});
async function markCobblemonDelivered(button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const state = await api('/api/admin/cobblemon/delivered', { method: 'POST', body: { id: button.dataset.cobblemonDelivered } });
    applyState(state);
    showToast('Entrega marcada como concluída.');
  } catch (error) {
    showToast(error.message, 'error');
    if (button.isConnected) button.disabled = false;
  }
}
async function decideCobblemonReward(button) {
  if (!button || button.disabled) return;
  const row = button.closest('.cobblemon-reward-row');
  const action = button.dataset.cobblemonDecision;
  const price = Number(button.dataset.cobblemonDecisionPrice || 0);
  if (action === 'sell' && !confirmCobblemonAction(`Vender este prêmio por ${formatCredits(price)} Créditos 51? Esta decisão não poderá ser desfeita.`, button)) return;
  const buttons = $$('[data-cobblemon-decision]', row);
  buttons.forEach((candidate) => setButtonBusy(candidate, true, 'Processando…'));
  try {
    const data = await api('/api/cobblemon/reward/decision', { method: 'POST', body: { id: button.dataset.id, action } });
    appState.profile = data.profile;
    renderProfileEconomy(appState.profile);
    showToast(data.alreadyDecided ? 'Esta decisão já estava registrada; nada foi repetido.' : action === 'sell' ? `Prêmio vendido por ${formatCredits(price)} Créditos 51.` : 'Prêmio enviado para a fila de entrega do Davi.');
  } catch (error) {
    showToast(error.message, 'error');
    buttons.forEach((candidate) => setButtonBusy(candidate, false));
  }
}
function toggleCobblemonDeliveryGroup(event) {
  const summary = event.target?.closest?.('.cobblemon-delivery-group > summary');
  if (!summary) return false;
  event.preventDefault();
  event.stopPropagation();
  const group = summary.parentElement;
  if (!group) return true;
  const expanded = !group.open;
  group.open = expanded;
  summary.setAttribute('aria-expanded', String(expanded));
  const key = group.dataset.cobblemonDeliveryGroup;
  if (!key) return true;
  cobblemonOpenDeliveryGroups ||= new Set();
  if (expanded) cobblemonOpenDeliveryGroups.add(key);
  else cobblemonOpenDeliveryGroups.delete(key);
  return true;
}
$('#cobblemonRewards')?.addEventListener('click', (event) => {
  const copy = event.target?.closest?.('[data-cobblemon-copy-command]');
  if (copy) { event.preventDefault(); event.stopPropagation(); void copyCobblemonDeliveryCommand(copy); return; }
  const decision = event.target?.closest?.('[data-cobblemon-decision]');
  if (decision) {
    event.preventDefault();
    event.stopPropagation();
    void decideCobblemonReward(decision);
    return;
  }
  const delivered = event.target?.closest?.('[data-cobblemon-delivered]');
  if (delivered) {
    event.preventDefault();
    event.stopPropagation();
    void markCobblemonDelivered(delivered);
    return;
  }
  toggleCobblemonDeliveryGroup(event);
});
$('#cobblemonDeliveryHistory')?.addEventListener('click', toggleCobblemonDeliveryGroup);

$('#cobblemonServerMembers')?.addEventListener('change', (event) => {
  if (event.target?.name !== 'plays') return;
  const row = event.target.closest('[data-cobblemon-server-member]'); if (!row) return;
  const playing = Boolean(event.target.checked);
  row.querySelector('[name="playerName"]').disabled = !playing;
  row.querySelector('[name="paymentStatus"]').disabled = !playing;
});
async function saveCobblemonServerMember(row, button) {
  if (!row || !button || button.disabled) return;
  const playsField = row.querySelector('[name="plays"]');
  const playerNameField = row.querySelector('[name="playerName"]');
  const paymentField = row.querySelector('[name="paymentStatus"]');
  const plays = Boolean(playsField?.checked);
  const playerName = String(playerNameField?.value || '').trim();
  if (plays && playerName.length < 3) {
    showToast('Informe o nome do jogador no servidor antes de salvar.', 'error');
    playerNameField?.focus();
    return;
  }
  setButtonBusy(button, true, 'Salvando…');
  try {
    const data = await api('/api/cobblemon/server-members/' + encodeURIComponent(row.dataset.cobblemonServerMember), { method: 'PATCH', body: { playerName, plays, paymentStatus: paymentField?.value || 'unpaid' } });
    // A confirmação veio do servidor. A pessoa muda de lista, mas a aba atual
    // continua aberta para o administrador seguir cadastrando sem recarregar
    // a página inteira nem ser levado para outra tela.
    document.activeElement?.blur(); applyCobblemonServerManagementState(data);
    showToast(plays ? 'Jogador salvo e movido para “Jogam”. A lista atual continua aberta.' : 'Participante salvo em “Não jogam”. A lista atual continua aberta.');
  } catch (error) { showToast(error.message, 'error'); setButtonBusy(button, false); }
}
// Clique explícito, delegado no documento: a ação continua funcionando mesmo
// depois de a lista ser reconstruída ao alternar as abas.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cobblemon-server-save]'); if (!button) return;
  const row = button.closest('[data-cobblemon-server-member]');
  void saveCobblemonServerMember(row, button);
});
$('#cobblemonServerRosterTabs')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cobblemon-server-tab]'); if (!button) return;
  cobblemonServerRosterTab = button.dataset.cobblemonServerTab === 'not-playing' ? 'not-playing' : 'playing';
  renderCobblemonServerManagement();
});
async function handleCobblemonBoxAction(boxButton) {
  if (!boxButton || boxButton.disabled) return;
  const boxId = boxButton.dataset.cobblemonBox;
  const box = COBBLEMON_BOX_CATALOG[boxId];
  const mode = boxButton.dataset.cobblemonBoxMode || 'open';
  const prompt = mode === 'purchase' ? `Comprar “${box?.name || 'este baú'}” fechado por ${formatCredits(box?.price || 0)} Créditos 51? Você poderá fazer os três sorteios depois.` : mode === 'choice' ? null : box?.monthly ? `Fazer o sorteio ${Number(appState.profile?.cobblemon?.monthlyPokemonBox?.openRollCount || 0) + 1} de 3 da “${box.name}”?` : `Abrir “${box?.name || 'este baú'}” por ${formatCredits(box?.price || 0)} Créditos 51?`;
  if (prompt && !confirmCobblemonAction(prompt, boxButton)) return;
  boxButton.disabled = true;
  const protectCompletePokemonFlow = box?.monthly && mode !== 'purchase';
  if (protectCompletePokemonFlow) cobblemonFlowLocked = true;
  try {
    if (mode === 'purchase') {
      const data = await api('/api/cobblemon/box/purchase', { method: 'POST', body: { boxId } });
      appState.profile = data.profile; renderProfileEconomy(appState.profile);
      showToast('Baú Pokémon comprado! Ele já está pronto: faça os três sorteios.');
    } else if (mode === 'choice') {
      const pending = appState.profile?.cobblemon?.monthlyPokemonBox?.choice;
      if (!pending) throw new Error('A escolha deste Baú Pokémon já foi concluída.');
      const decided = await showCobblemonOpening(pending.choiceStage === 'weekly' ? 'Escolha o Pokémon da semana' : 'Escolha o Pokémon do dia', {...pending, boxId: 'pokemon', profile: appState.profile}, {skipCarousel:true});
      appState.profile = decided.profile; renderProfileEconomy(appState.profile);
    } else {
      const inventoryId = boxButton.dataset.cobblemonBoxInventory || null;
      let data = await api('/api/cobblemon/box/open', { method: 'POST', body: { boxId, inventoryId } });
      let decided;
      do {
        // O Baú Lendário é entrega obrigatória. Seu prêmio não exige decisão,
        // mas o perfil atualizado vem no envelope da resposta, não dentro do
        // prêmio. Sem este vínculo, fechar a animação trocava o perfil atual
        // por `undefined` e a tela parecia zerar saldos, bolas e gráficos.
        decided = await showCobblemonOpening(box?.name || 'Baú Cobblemon', { ...data.reward, profile: data.profile || data.reward?.profile || appState.profile });
        if (!decided.autoNextRoll) break;
        data = await api('/api/cobblemon/box/open', { method: 'POST', body: { boxId, inventoryId: decided.capsuleId || inventoryId } });
      } while (true);
      const nextProfile = decided?.profile || data?.profile || appState.profile;
      if (!nextProfile) throw new Error('O perfil não pôde ser atualizado. Seus dados foram preservados; tente recarregar a página.');
      appState.profile = nextProfile; renderProfileEconomy(appState.profile);
    }
  } catch (error) {
    showToast(error.message, 'error');
    // Um estado vindo de outra aba não pode deixar o card inerte.
    try { const fresh = await api('/api/state'); appState.profile = fresh.profile; renderProfileEconomy(appState.profile); } catch { renderCobblemonDex(appState.profile); }
  } finally {
    if (boxButton.isConnected) boxButton.disabled = false;
    if (protectCompletePokemonFlow) resumeAfterCobblemonFlow();
  }
}

// O card é renderizado depois do carregamento da página. Mantemos o listener
// diretamente no seu contêiner para que o clique não dependa de listeners
// globais de temas/cursor que podem interromper a propagação em alguns perfis.
$('#cobblemonBoxShop')?.addEventListener('click', (event) => {
  const oddsButton = event.target?.closest?.('[data-cobblemon-box-odds]');
  if (oddsButton) {
    event.preventDefault();
    event.stopPropagation();
    const box = COBBLEMON_BOX_CATALOG[oddsButton.dataset.cobblemonBoxOdds];
    if (box) showCobblemonOdds(box.name, box.rewards, 'Veja todos os itens e a chance individual antes de abrir.');
    return;
  }
  const boxButton = event.target?.closest?.('[data-cobblemon-box]');
  if (!boxButton) return;
  event.preventDefault();
  event.stopPropagation();
  void handleCobblemonBoxAction(boxButton);
});
async function handleCobblemonBallPurchase(ballBuyButton) {
  if (!ballBuyButton || ballBuyButton.disabled) return;
  const ballType = ballBuyButton.dataset.cobblemonBallBuy;
  const ball = COBBLEMON_CAPTURE_BALLS[ballType];
  const balls = appState.profile?.cobblemon?.balls || {};
  const card = ballBuyButton.closest('.cobblemon-ball-option');
  const quantityInput = card?.querySelector('[data-cobblemon-ball-quantity]');
  const quantity = Number(quantityInput?.value || 1);
  const maximum = ballType === 'poke' ? Number(balls.maxPurchase || 20) : 20;
  if (!ball || !Number.isInteger(quantity) || quantity < 1 || quantity > maximum) {
    showToast(`Escolha uma quantidade inteira entre 1 e ${maximum}.`, 'error');
    quantityInput?.focus();
    return;
  }
  cobblemonBallPurchaseQuantities[ballType] = quantity;
  const unitPrice = ballType === 'poke' ? Number(balls.unitPrice || 8.99) : Number(ball.price);
  const total = Math.round(unitPrice * quantity * 100) / 100;
  const dailyBall = ballType === 'poke';
  const destination = dailyBall ? 'para a caça de hoje' : 'ao inventário';
  if (!confirmCobblemonAction(`Comprar ${quantity} ${ball.name}${quantity === 1 ? '' : 's'} por ${formatCredits(total)} Créditos 51?\n\n${dailyBall ? 'As Poké Balls extras valem somente para a caça de hoje.' : 'Você poderá selecionar a bola antes de cada arremesso.'}`, ballBuyButton)) return;
  ballBuyButton.disabled = true;
  try {
    const data = await api(dailyBall ? '/api/cobblemon/balls/buy' : '/api/cobblemon/balls/buy-special', { method: 'POST', body: dailyBall ? { quantity } : { ballType, quantity } });
    appState.profile = data.profile;
    renderProfileEconomy(appState.profile);
    showToast(`${quantity} ${ball.name}${quantity === 1 ? '' : 's'} adicionada${quantity === 1 ? '' : 's'} ${destination}. ${dailyBall ? '' : 'Escolha a bola somente depois de encontrar um Pokémon.'}`.trim());
  } catch (error) {
    showToast(error.message, 'error');
    renderCobblemonDex(appState.profile);
  } finally {
    if (ballBuyButton.isConnected) ballBuyButton.disabled = false;
  }
}
$('#cobblemonBallOptions')?.addEventListener('click', (event) => {
  const purchaseTrigger = event.target?.closest?.('[data-cobblemon-ball-purchase-trigger]');
  if (purchaseTrigger) {
    event.preventDefault();
    event.stopPropagation();
    const buyButton = purchaseTrigger.closest('.cobblemon-ball-option')?.querySelector('[data-cobblemon-ball-buy]');
    if (buyButton) void handleCobblemonBallPurchase(buyButton);
    return;
  }
  const ballBuyButton = event.target?.closest?.('[data-cobblemon-ball-buy]');
  if (!ballBuyButton) return;
  event.preventDefault();
  event.stopPropagation();
  void handleCobblemonBallPurchase(ballBuyButton);
});
document.addEventListener('click', async (event) => {
  const cobblemonTab = event.target?.closest?.('[data-cobblemon-tab]');
  if (cobblemonTab) { setCobblemonTab(cobblemonTab.dataset.cobblemonTab); return; }
  const ballSelectButton = event.target?.closest?.('[data-cobblemon-ball-select]');
  if (ballSelectButton) {
    const ballType = ballSelectButton.dataset.cobblemonBallSelect; const ball = COBBLEMON_CAPTURE_BALLS[ballType]; const balls = appState.profile?.cobblemon?.balls || {};
    const quantity = ballType === 'poke' ? Number(balls.remaining || 0) : Number(balls.special?.[ballType]?.quantity || 0);
    if (!ball) return;
    if (quantity < 1) {
      showToast(`${ball.name} sem estoque. Escolha a quantidade abaixo para comprar.`, 'error');
      ballSelectButton.closest('.cobblemon-ball-option')?.querySelector('[data-cobblemon-ball-quantity]')?.focus();
      return;
    }
    cobblemonSelectedBall = ballType; syncCobblemonSelectedBall(balls); renderCobblemonBallOptions(balls);
    if (cobblemonPageEncounter) $('#cobblemonCaptureHint').textContent = `${ball.name} selecionada. Mire no Pokémon e solte para tentar capturar.`;
    return;
  }
  const oddsButton = event.target?.closest?.('[data-cobblemon-box-odds]');
  if (oddsButton) { const box = COBBLEMON_BOX_CATALOG[oddsButton.dataset.cobblemonBoxOdds]; if (box) showCobblemonOdds(box.name,box.rewards,'Veja todos os itens e a chance individual antes de abrir.'); return; }
  const rouletteOddsButton = event.target?.closest?.('#cobblemonRouletteOdds');
  if (rouletteOddsButton) { showCobblemonOdds('Roleta Cobblemon',COBBLEMON_ROULETTE_REWARDS,'Um giro por pessoa por dia. Itens Shiny e lendários são deliberadamente excepcionais.'); return; }
  if (event.target?.id === 'cobblemonBuyBalls') {
    $('#cobblemonBallOptions [data-cobblemon-ball-buy="poke"]')?.click();
    return;
  }
  const rouletteSpinButton = event.target?.closest?.('#cobblemonRouletteSpin');
  if (rouletteSpinButton) { await spinCobblemonRoulette(rouletteSpinButton); return; }
  const boxButton = event.target?.closest?.('[data-cobblemon-box]');
  if (boxButton) { await handleCobblemonBoxAction(boxButton); return; }
  const weeklyChoiceButton = event.target?.closest?.('[data-cobblemon-weekly-choice]');
  if (weeklyChoiceButton) {
    event.preventDefault();
    event.stopPropagation();
    await chooseCobblemonCandidateForDelivery(weeklyChoiceButton);
    return;
  }
  const candidateSellButton = event.target?.closest?.('[data-cobblemon-candidate-sell]');
  if (candidateSellButton) {
    await sellCobblemonCandidate(candidateSellButton);
    return;
  }
  const decision = event.target?.closest?.('[data-cobblemon-decision]');
  if (decision) { event.preventDefault(); event.stopPropagation(); await decideCobblemonReward(decision); return; }
  const delivered = event.target?.closest?.('[data-cobblemon-delivered]');
  if (delivered) { try { applyState(await api('/api/admin/cobblemon/delivered', { method: 'POST', body: JSON.stringify({ id: delivered.dataset.cobblemonDelivered }) })); } catch (error) { showToast(error.message); } return; }
});
$('#cobblemonDexOwner')?.addEventListener('change', (event) => { cobblemonDexOwnerId = event.target.value; cobblemonDexPage = 0; renderCobblemonDex(appState.profile); });
$('#cobblemonCaptureButton')?.addEventListener('click', (event) => {
  event.preventDefault();
  void startCobblemonPageEncounter();
});
$('#topCobblemonHuntButton')?.addEventListener('click', (event) => {
  event.preventDefault();
  $('#cobblemonCaptureButton')?.click();
});
$('#cobblemonRouletteSpin')?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  void spinCobblemonRoulette(event.currentTarget);
});
$('#cobblemonRouletteOdds')?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  showCobblemonOdds('Roleta Cobblemon', COBBLEMON_ROULETTE_REWARDS, 'Um giro por pessoa por dia. Itens Shiny e lendários são deliberadamente excepcionais.');
});
