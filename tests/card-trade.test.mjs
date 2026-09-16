import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(root, 'public', 'card-album.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'legacy-server.mjs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('troca direta seleciona cartas clicadas e evita clique após arraste', () => {
  assert.match(js, /pointerdown/);
  assert.match(js, /input\.checked=true/);
  assert.match(js, /input\.dispatchEvent\(new Event\('change'/);
  assert.match(js, /if\(moved\)\{event\.preventDefault\(\)/);
});

test('painéis ocultam combos redundantes e informam como navegar', () => {
  assert.match(css, /select\[name="offeredId"\].*display:none/);
  assert.match(css, /direct-trade-card-strip.*scrollbar-width:none/);
  assert.match(js, /clique e arraste para os lados/);
});

test('análise calcula utilidade por coleção e versão dos assets é atualizada', () => {
  assert.match(js, /utilityScore/);
  assert.match(js, /ANÁLISE PRIVADA DA TROCA/);
  assert.match(html, /card-album\.js\?v=20260916-236/);
  assert.match(js, /directTradeFilter/);
  assert.match(html, /styles\.css\?v=20260916-266/);
  assert.match(html, /app\.js\?v=20260916-270/);
});

test('aviso de versão pede atualização e exibe notas uma vez por versão', () => {
  assert.match(appJs, /RELEASE_NOTICE/);
  assert.match(appJs, /area51-release-pending/);
  assert.match(appJs, /area51-release-seen/);
  assert.match(appJs, /Atualizar agora/);
  assert.match(html, /id="releaseNoticeDialog"/);
});

test('cabeçalho exibe e atualiza o saldo de Créditos 51 em qualquer página', () => {
  assert.match(html, /id="topWallet"/);
  assert.match(html, /id="topWalletValue"/);
  assert.match(appJs, /const topWalletValue = Number\(profile\.wallet \|\| 0\)\.toLocaleString\('pt-BR'\)/);
  assert.match(appJs, /topWallet\.setAttribute\('aria-label', 'Saldo: ' \+ topWalletValue \+ ' Créditos 51'\)/);
  assert.match(styles, /\.top-wallet\{display:inline-flex;flex:0 0 auto/);
  assert.match(styles, /body\.theme-rainbow \.top-wallet\{border-color:#fff1a3/);
});

test('Pokédex preserva a identidade Cobblemon mesmo com tema ou punição ativos', () => {
  assert.match(styles, /body:is\(\.theme-rainbow,\.theme-punishment,\.theme-dark,\[class\*="profile-theme-"\]\) \.cobblemon-page/);
  assert.match(styles, /theme-cobblemon-v3\.webp/);
  assert.match(styles, /\.cobblemon-page-hero\{background:linear-gradient\(100deg,#061b36ed/);
  assert.match(styles, /body\.theme-light-override \.cobblemon-page\{background:linear-gradient\(100deg,rgba\(240,252,255/);
});

test('Pokédex espalha sprites Cobblemon decorativos sem bloquear a interface', () => {
  assert.match(html, /class="cobblemon-scene-sprites"/);
  assert.match(html, /class="cobblemon-scene-mon mon-pikachu"/);
  assert.match(styles, /\.cobblemon-scene-sprites\{position:absolute;inset:0;z-index:0;pointer-events:none/);
  assert.match(styles, /@keyframes cobblemon-scene-float/);
  assert.match(appJs, /previews\/small\/\$\{Number\(mon\.i\)\}\.webp/);
  assert.match(appJs, /cobblemonDexGridKey/);
});

test('poder consumível usado não fica marcado como item da coleção', () => {
  assert.match(serverJs, /item\.consumable \? quantity > 0/);
});

test('Agiota oferece empréstimos maiores e aceita item para abater dívida', () => {
  assert.match(serverJs, /\[300, 600, 900\]\.includes\(principal\)/);
  assert.match(serverJs, /method: 'item'/);
  assert.match(serverJs, /stellar-loan-item-payment/);
});

test('áudio tenta desbloquear novamente após a sessão carregar', () => {
  assert.match(appJs, /if \(appState && musicEpoch && !musicIsPlaying\(\)\) startMusic\(\)/);
  assert.doesNotMatch(appJs, /unlockRoundMusicFromAnyGesture, \{ passive: true, once: true \}/);
});

test('áudio nativo é priorizado após gesto do usuário', () => {
  assert.match(appJs, /Após um gesto, o áudio HTML nativo/);
  assert.match(appJs, /await nativeAudio\.play\(\)/);
});

test('cápsula Pokémon faz três sorteios por compra e escolha semanal', () => {
  assert.match(serverJs, /pokemonCapsuleCycleKey/);
  assert.match(serverJs, /pokemonCapsuleIsFriday/);
  assert.match(serverJs, /dailyRollCount >= 3/);
  assert.match(serverJs, /status = finalDailyRound \? 'choice-pending' : 'box-open'/);
  assert.match(serverJs, /weekly-choice-pending/);
  assert.match(serverJs, /cycleEntries.length >= 7/);
  assert.doesNotMatch(serverJs, /já comprou a Cápsula Pokémon hoje/);
  assert.match(appJs, /Sorteio .*\/3/);
  assert.match(appJs, /Escolher entrega da semana/);
});

test('cápsula separa limite semanal, sorteios por baú e entrega antecipada após a escolha', () => {
  assert.match(serverJs, /weeklyPurchasesRemaining/);
  assert.match(serverJs, /weeklyOpeningsUsed/);
  assert.match(serverJs, /canChooseNow: false/);
  assert.match(serverJs, /Faça os três sorteios antes de escolher/);
  assert.match(serverJs, /Escolha antecipada para entrega do Davi/);
  assert.doesNotMatch(appJs, /Escolher este Pokémon agora/);
  assert.match(appJs, /somente depois dos três/);
  assert.match(appJs, /autoNextRoll/);
  assert.match(appJs, /do \{/);
  assert.match(styles, /cobblemon-box-card>div button.*height:42px/);
  assert.match(html, /Continuar sorteios/);
});

test('resultado semanal não vaza candidatos para a fila de entregas', () => {
  assert.match(serverJs, /weeklyCandidates/);
  assert.match(serverJs, /choose-weekly-now/);
  assert.match(appJs, /cobblemonCapsuleResults/);
  assert.match(appJs, /Escolher para entrega/);
  assert.match(appJs, /cycle-candidate.*weekly-choice-pending/);
  assert.match(appJs, /cycle-expired/);
  assert.match(appJs, /Aguardando entrega do Davi/);
});

test('reset da cápsula é idempotente e devolve o preço de cada compra antiga', () => {
  assert.match(serverJs, /cobblemonCapsuleResetV5/);
  assert.match(serverJs, /cobblemon-capsule-reset-refund/);
  assert.match(serverJs, /entry.status !== 'reset-refunded'/);
  assert.match(serverJs, /resetReason = 'Reinício do ciclo semanal/);
});

test('punições do Gay e do Pior têm duração e temas adaptados', () => {
  assert.match(serverJs, /visualPenalty\(latestGayDraw\.createdAt, 'rainbow'\)/);
  assert.match(serverJs, /visualPenalty\(latestClosedVoting\?\.closedAt \|\| latestClosedVoting\?\.openedAt, 'punishment'\)/);
  assert.match(styles, /body\.theme-rainbow \.app/);
  assert.match(styles, /\.theme-punishment \.app/);
  assert.match(styles, /\.theme-punishment \.section/);
});
