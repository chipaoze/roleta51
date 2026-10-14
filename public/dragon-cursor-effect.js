(() => {
  const ACTIVE = 'dragon-ember';
  let dragon, stream, x = innerWidth / 2, y = innerHeight / 2, keyStarted = 0, held = false, growTimer = 0, frame = 0, range = 145;
  const active = () => document.documentElement.dataset.activeCursor === ACTIVE;
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
  const remove = (node) => node?.remove();
  function ensureDragon() {
    if (dragon) return dragon;
    dragon = document.createElement('img'); dragon.className = 'dragon-ember-cursor'; dragon.src = '/cursor-dragon-fire.png'; dragon.alt = '';
    document.body.append(dragon); return dragon;
  }
  function position() { if (active()) { ensureDragon().style.transform = `translate3d(${x - 27}px,${y - 32}px,0)`; } }
  function ember() {
    const dot = document.createElement('i'); dot.className = 'dragon-ember-spark'; dot.style.left = `${x - 5}px`; dot.style.top = `${y + 13}px`;
    dot.style.setProperty('--dx', `${-42 + Math.random() * 84}px`); dot.style.setProperty('--dy', `${14 + Math.random() * 42}px`); document.body.append(dot); setTimeout(() => remove(dot), 760);
  }
  function fireball() {
    if (!active()) return;
    for (let index = 0; index < 10; index += 1) {
      const ball = document.createElement('i'); ball.className = 'dragon-ember-fireball';
      ball.style.left = `${x - 18}px`; ball.style.top = `${y - 4 + Math.random() * 18}px`;
      ball.style.setProperty('--dx', `${-180 - Math.random() * 96}px`); ball.style.setProperty('--dy', `${-24 + Math.random() * 48}px`);
      ball.style.setProperty('--size', `${26 + Math.random() * 18}px`); document.body.append(ball); setTimeout(() => remove(ball), 680);
    }
  }
  function ensureStream() { if (!stream) { stream = document.createElement('canvas'); stream.className = 'dragon-ember-breath'; document.body.append(stream); } const width = range + 44, height = 138, scale = devicePixelRatio; stream.width = width * scale; stream.height = height * scale; stream.style.width = `${width}px`; stream.style.height = `${height}px`; stream.style.left = `${x - 26 - range}px`; stream.style.top = `${y - 67}px`; }
  function tongue(context, width, height, time, index, scale, colors) {
    const startX = width - 8, startY = height / 2 + (index - 3) * 5, length = range * (.5 + (index % 4) * .12) * scale, endX = startX - length, sway = Math.sin(time * 2.7 + index * 2.2) * 17 + (index - 3) * 4, thickness = (23 - (index % 3) * 3) * scale;
    context.beginPath(); context.moveTo(startX, startY - thickness * .55); context.bezierCurveTo(startX - length * .2, startY - thickness + sway, startX - length * .55, startY - thickness * .8 + sway, endX, startY + sway); context.bezierCurveTo(startX - length * .48, startY + thickness * .85 + sway, startX - length * .15, startY + thickness * .7 + sway, startX, startY + thickness * .55); context.closePath();
    const gradient = context.createLinearGradient(startX, startY, endX, startY + sway); gradient.addColorStop(0, colors[0]); gradient.addColorStop(.36, colors[1]); gradient.addColorStop(1, colors[2]); context.fillStyle = gradient; context.fill();
  }
  function draw() {
    if (!stream || !active() || !held) return;
    const scale = devicePixelRatio, width = stream.width / scale, height = stream.height / scale, context = stream.getContext('2d'), time = performance.now() / 120;
    context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, width, height); context.globalCompositeOperation = 'lighter'; context.filter = 'blur(1.4px)';
    for (let i = 0; i < 9; i += 1) tongue(context, width, height, time, i, 1, ['rgba(210,25,5,.2)', 'rgba(245,62,9,.96)', 'rgba(255,135,18,0)']);
    context.filter = 'blur(.75px)'; for (let i = 0; i < 7; i += 1) tongue(context, width, height, time + .6, i, .7, ['rgba(255,96,7,.2)', 'rgba(255,160,23,1)', 'rgba(255,220,73,0)']);
    context.filter = 'blur(.25px)'; for (let i = 0; i < 5; i += 1) tongue(context, width, height, time + 1.2, i, .4, ['rgba(255,181,30,.2)', 'rgba(255,238,126,1)', 'rgba(255,250,205,0)']);
    context.globalCompositeOperation = 'source-over'; context.filter = 'none'; frame = requestAnimationFrame(draw);
  }
  function stopBreath() { cancelAnimationFrame(frame); frame = 0; remove(stream); stream = null; clearInterval(growTimer); growTimer = 0; }
  addEventListener('pointermove', (event) => { x = event.clientX; y = event.clientY; if (!active()) return; position(); if (stream) ensureStream(); });
  addEventListener('keydown', (event) => { if (event.key.toLowerCase() !== 'f' || keyStarted || !active() || typing()) return; event.preventDefault(); keyStarted = Date.now(); setTimeout(() => { if (!keyStarted || !active()) return; held = true; range = 145; ensureStream(); draw(); growTimer = setInterval(() => { range = Math.min(390, range + 42); ensureStream(); }, 260); }, 190); });
  addEventListener('keyup', (event) => { if (event.key.toLowerCase() !== 'f' || !keyStarted) return; if (!held) fireball(); keyStarted = 0; held = false; stopBreath(); });
  addEventListener('blur', () => { keyStarted = 0; held = false; stopBreath(); });
  new MutationObserver(() => { if (active()) position(); else { remove(dragon); dragon = null; stopBreath(); keyStarted = 0; held = false; } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-active-cursor'] });
})();
