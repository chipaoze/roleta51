(() => {
  let loaded = false;

  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const html = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  function mountStyles() {
    if (document.querySelector('#ecosSeasonPassStyles')) return;
    const style = document.createElement('style');
    style.id = 'ecosSeasonPassStyles';
    style.textContent = '.ecos-pass{display:grid;gap:14px;margin-bottom:18px;padding:20px;border:1px solid #8e67d3;border-radius:18px;background:linear-gradient(130deg,#111b35,#241743);color:#eef4ff}.ecos-pass header{display:flex;justify-content:space-between;gap:18px;align-items:start}.ecos-pass small{color:#8eebf2;font-weight:900;letter-spacing:.12em}.ecos-pass h2{margin:4px 0;font-size:23px}.ecos-pass p{margin:0;color:#c5cde2;font-size:13px;line-height:1.5}.ecos-pass-level{display:grid;place-items:center;min-width:84px;padding:10px;border:1px solid #6b51a5;border-radius:14px;background:#0e1830}.ecos-pass-level b{font-size:25px;color:#ffe269}.ecos-pass-track{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.ecos-pass-reward{display:grid;gap:4px;min-height:82px;padding:9px;border:1px solid #41506f;border-radius:11px;background:#121e35}.ecos-pass-reward.unlocked{border-color:#49caa3;background:#123b38}.ecos-pass-reward.claimed{opacity:.55}.ecos-pass-reward small{font-size:9px;color:#b4c1d7}.ecos-pass-reward b{font-size:11px}.ecos-pass-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ecos-pass-actions button{padding:9px 12px;border:1px solid #9b73d9;border-radius:10px;background:#8954c6;color:#fff;font-weight:800}.ecos-pass-actions button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:700px){.ecos-pass header{display:grid}.ecos-pass-level{justify-self:start}.ecos-pass-track{grid-template-columns:repeat(3,minmax(0,1fr))}}';
    document.head.append(style);
  }

  async function render() {
    const host = document.querySelector('#nextSeasonPassPreview');
    if (!host || loaded || typeof api !== 'function') return;
    loaded = true;
    mountStyles();
    host.innerHTML = '<section class="ecos-pass"><p>Carregando Passe da Operação…</p></section>';
    try {
      const pass = await api('/api/card-season/pass-preview');
      const active = Boolean(pass.active);
      const visibleRewards = (pass.tracks || []).filter((row) => [1, 3, 5, 10, 15, 20, 25, 30].includes(Number(row.level)));
      host.innerHTML = '<section class="ecos-pass"><header><div><small>' + (active ? 'TEMPORADA ATIVA' : 'PRÉVIA DA TEMPORADA') + '</small><h2>' + html(pass.name || 'Operação: Ecos do Setor 51') + '</h2><p>30 níveis · trilha gratuita e Premium · XP por missões diárias, semanais, desafios da tripulação e primeira insígnia nova.</p></div><div class="ecos-pass-level"><small>NÍVEL</small><b>' + Number(pass.level || 0) + '</b><span>' + Number(pass.currentLevelXp || 0) + ' / ' + Number(pass.nextLevelXp || 80) + ' XP</span></div></header><div class="ecos-pass-track">' + visibleRewards.map((row) => { const reward = row.free || {}; const claimed = (pass.claimed?.free || []).includes(Number(row.level)); return '<article class="ecos-pass-reward ' + (row.unlocked ? 'unlocked ' : '') + (claimed ? 'claimed' : '') + '"><small>NÍVEL ' + Number(row.level) + '</small><b>' + html(reward.name || 'Fragmentos') + '</b><span>×' + Number(reward.quantity || 1) + '</span>' + (active && row.unlocked && !claimed ? '<button type="button" data-ecos-claim="free" data-ecos-level="' + Number(row.level) + '">Resgatar</button>' : '') + '</article>'; }).join('') + '</div><div class="ecos-pass-actions">' + (active && !pass.premium ? '<button type="button" data-ecos-premium>Ativar Premium · ' + money(pass.premiumPrice) + ' Créditos 51</button>' : '<button type="button" disabled>' + (pass.premium ? 'Premium ativo' : 'Indisponível') + '</button>') + '<p>O XP não compra níveis e cada objetivo só conta uma vez.</p></div></section>';
    } catch (error) {
      loaded = false;
      host.innerHTML = '<section class="ecos-pass"><p>Não foi possível carregar o Passe agora. Tente novamente em instantes.</p></section>';
    }
  }

  document.addEventListener('click', async (event) => {
    const premium = event.target.closest('[data-ecos-premium]');
    const claim = event.target.closest('[data-ecos-claim]');
    if (!premium && !claim) return;
    const button = premium || claim;
    button.disabled = true;
    try {
      const data = await api(premium ? '/api/card-season/pass-premium' : '/api/card-season/pass-claim', { method: 'POST', body: premium ? {} : { track: claim.dataset.ecosClaim, level: Number(claim.dataset.ecosLevel) } });
      if (typeof applyState === 'function') applyState(data);
      loaded = false;
      await render();
      if (typeof showToast === 'function') showToast(premium ? 'Passe Premium ativado.' : 'Recompensa resgatada.');
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message, 'error');
      else button.disabled = false;
    }
  });

  document.addEventListener('DOMContentLoaded', render, { once: true });
  setTimeout(render, 0);
})();
