// Crop locally: only the small, selected square is uploaded after confirmation.
function avatarCropBounds(width, height, zoom, x, y) {
  const scale = Math.max(320 / width, 320 / height) * zoom;
  const limitX = Math.max(0, (width * scale - 320) / 2);
  const limitY = Math.max(0, (height * scale - 320) / 2);
  return { scale, x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) };
}
async function openAvatarCrop(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Escolha uma foto PNG, JPG ou WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto de até 20 MB.');
  if (document.querySelector('#avatarCropDialog')) return;
  const photo = new Image();
  const url = URL.createObjectURL(file);
  try { photo.src = url; await photo.decode(); }
  catch { throw new Error('Não foi possível abrir essa foto. Tente outro arquivo.'); }
  finally { URL.revokeObjectURL(url); }
  const dialog = document.createElement('dialog');
  dialog.id = 'avatarCropDialog';
  dialog.setAttribute('aria-labelledby', 'avatarCropTitle');
  dialog.innerHTML = `<h2 id="avatarCropTitle">Enquadrar foto</h2>
    <p id="avatarCropHelp">Arraste a foto para posicionar. Use o zoom para aproximar. No teclado, use as setas sobre a imagem.</p>
    <canvas width="320" height="320" tabindex="0" aria-label="Posicionar foto com as setas" aria-describedby="avatarCropHelp"></canvas>
    <label for="avatarCropZoom">Zoom <output id="avatarCropPercent">100%</output></label>
    <input id="avatarCropZoom" type="range" min="1" max="4" step="0.01" value="1">
    <button type="button" data-center>Centralizar</button>
    <p data-error role="alert"></p>
    <div class="avatar-crop-actions"><button type="button" data-cancel>Cancelar</button><button type="button" data-save>Salvar foto</button></div>`;
  document.body.appendChild(dialog);
  const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
  const zoomInput = dialog.querySelector('input'), save = dialog.querySelector('[data-save]');
  let x = 0, y = 0, drag = null, busy = false;
  function draw() {
    const bounds = avatarCropBounds(photo.naturalWidth, photo.naturalHeight, Number(zoomInput.value), x, y);
    x = bounds.x; y = bounds.y;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 320);
    ctx.drawImage(photo, (320 - photo.naturalWidth * bounds.scale) / 2 + x, (320 - photo.naturalHeight * bounds.scale) / 2 + y, photo.naturalWidth * bounds.scale, photo.naturalHeight * bounds.scale);
    dialog.querySelector('output').textContent = Math.round(Number(zoomInput.value) * 100) + '%';
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId || busy) return;
    const ratio = 320 / canvas.getBoundingClientRect().width;
    x += (event.clientX - drag.x) * ratio; y += (event.clientY - drag.y) * ratio;
    drag.x = event.clientX; drag.y = event.clientY; draw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { drag = null; });
  canvas.addEventListener('keydown', (event) => {
    const delta = { ArrowLeft: [-8,0], ArrowRight:[8,0], ArrowUp:[0,-8], ArrowDown:[0,8] }[event.key];
    if (!delta || busy) return;
    event.preventDefault(); x += delta[0]; y += delta[1]; draw();
  });
  zoomInput.addEventListener('input', draw);
  dialog.querySelector('[data-center]').addEventListener('click', () => { x = 0; y = 0; zoomInput.value = '1'; draw(); });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); document.querySelector('#profileAvatarInput')?.focus(); }, { once: true });
  save.addEventListener('click', async () => {
    if (busy) return;
    busy = true; drag = null;
    const controls = [...dialog.querySelectorAll('button,input')]; controls.forEach((el) => { el.disabled = true; });
    save.textContent = 'Salvando…'; dialog.querySelector('[data-error]').textContent = '';
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      applyState(await api('/api/profile/avatar', { method: 'POST', body: { dataUrl } }));
      dialog.close(); showToast('Foto enquadrada e salva! 📸');
    } catch (error) { dialog.querySelector('[data-error]').textContent = error.message; }
    finally { busy = false; controls.forEach((el) => { el.disabled = false; }); save.textContent = 'Salvar foto'; }
  });
  draw(); dialog.showModal(); canvas.focus();
}
