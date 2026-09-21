import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(root, 'public', 'card-album.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'legacy-server.mjs'), 'utf8');
const marketLib = fs.readFileSync(path.join(root, 'lib', 'investment-market.mjs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const communityFeed = fs.readFileSync(path.join(root, 'public', 'community-feed.js'), 'utf8');

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
  assert.match(html, /card-album\.js\?v=20260917-237/);
  assert.match(js, /directTradeFilter/);
  assert.match(html, /styles\.css\?v=20260921-377/);
  assert.match(html, /app\.js\?v=20260921-377/);
  assert.match(html, /platform-upgrades\.css\?v=20260917-217/);
});

test('aviso de versão pede atualização e exibe notas uma vez por versão', () => {
  assert.match(appJs, /RELEASE_NOTICE/);
  assert.match(appJs, /area51-release-pending/);
  assert.match(appJs, /area51-release-seen/);
  assert.match(appJs, /Atualizar agora/);
  assert.match(html, /id="releaseNoticeDialog"/);
  assert.match(appJs, /startsWith\('release-'\)/);
  assert.match(appJs, /releaseNoticeLoaded/);
  assert.match(appJs, /Só exibimos depois de conhecer a versão publicada/);
  assert.doesNotMatch(appJs, /confirm\('Uma nova versão do Área 51 está disponível/);
  assert.match(appJs, /releaseCheckPromise/);
  assert.match(appJs, /APP_RELEASE_VERSION/);
  assert.match(appJs, /releaseNoticeRequiresUpdate/);
});

test('notificações navegam até o item exato depois da renderização', () => {
  assert.match(serverJs, /targetId:'card-trade-'\s*\+\s*trade\.id/);
  assert.match(serverJs, /targetId:'card-market-post-'\s*\+\s*post\.id/);
  assert.match(serverJs, /targetId:'visual-trade-'\s*\+\s*trade\.id/);
  assert.match(js, /id="card-trade-'\+escapeHtml\(t\.id\)/);
  assert.match(js, /id="card-market-post-'\+escapeHtml\(post\.id\)/);
  assert.match(appJs, /function waitForNotificationTarget\(targetId/);
  assert.match(appJs, /await focusNotificationTarget\(targetId, safePage\)/);
  assert.match(appJs, /target\.scrollIntoView\(\{ block: 'center'/);
  assert.match(styles, /\.notification-target\{outline:3px solid/);
});

test('ativação da Maldição do Mouse entra nas notificações mesmo sem rodada', () => {
  assert.match(serverJs, /\['forceAdhdCursor', 'forceGiantCursor'\]\.includes\(item\.value\)/);
  assert.match(serverJs, /const scope = announcement\.roundId \? 'na rodada' : 'agora'/);
  assert.match(serverJs, /targetId: 'activePowersCard'/);
});

test('notificação de carta usa ícone de carta e não confunde com saldo', () => {
  assert.match(serverJs, /id: 'card-drop:' \+ drop\.eventId,[\s\S]*?icon: '🎴',[\s\S]*?title: 'Você encontrou uma carta!'/);
});

test('Feed incorpora somente links válidos do YouTube e preserva seleção de texto', () => {
  assert.match(communityFeed, /function youtubeEmbedId\(value = ''\)/);
  assert.match(communityFeed, /youtube-nocookie\.com\/embed/);
  assert.match(communityFeed, /youtubeEmbedMarkup\(post\.phrase \|\| post\.caption \|\| ''\)/);
  assert.match(styles, /\.feed-post-text,\.feed-comment-text[^}]*user-select:text!important/);
  assert.match(appJs, /closest\?\.\('\.feed-post-text,\.feed-comment-text'\)/);
  assert.match(serverJs, /frame-src https:\/\/www\.youtube-nocookie\.com/);
  assert.match(html, /community-feed\.js\?v=20260918-196/);
});

test('recursos pausados somem do menu e o perfil concentra suas ações', () => {
  assert.match(appJs, /link\.hidden = Boolean\(feature && normalized\[feature\] === false\)/);
  assert.match(html, /id="profileQuickMenu"/);
  assert.doesNotMatch(html, /id="volumeDownButton"/);
});

test('listas longas preservam a rolagem e otimizam imagens sem repetir trabalho', () => {
  assert.match(appJs, /img:not\(\[data-render-optimized\]\)/);
  assert.match(appJs, /requestIdleCallback\(apply/);
  assert.match(styles, /\.shop-item,\.market-asset-card,\.album-card,\.feed-post,\.admin-feedback-item\{content-visibility:auto/);
});

test('Loja padroniza todos os preços com ícone e unidade de Créditos 51', () => {
  assert.match(appJs, /function shopCreditMarkup\(value, suffix = ''\)/);
  assert.match(appJs, /class="shop-credit-value"/);
  assert.match(appJs, /item\.cardPack \? shopCreditMarkup\(item\.price/);
  assert.match(appJs, /item\.mysteryBox \? `<span class="shop-status-stack">/);
  assert.match(styles, /\.shop-credit-value\{display:inline-flex/);
  assert.match(styles, /\.shop-credit-value \.shop-credit-icon/);
});

test('sistema de ícones moderno preserva os estados dos temas', () => {
  assert.match(styles, /Modern icon system/);
  assert.match(styles, /\.site-menu nav a>span,\.site-menu-user>span,\.notification-item>span/);
  assert.match(styles, /body\.theme-dark[^\{]*\{[^}]*--icon-surface/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('cabeçalho exibe e atualiza o saldo de Créditos 51 em qualquer página', () => {
  assert.match(html, /id="topWallet"/);
  assert.match(html, /id="topWalletValue"/);
  assert.match(appJs, /function formatCredits\(value\)/);
  assert.match(appJs, /const topWalletValue = formatCredits\(profile\.wallet\)/);
  assert.match(appJs, /topWallet\.setAttribute\('aria-label', 'Saldo: ' \+ topWalletValue \+ ' Créditos 51'\)/);
  assert.match(styles, /\.top-wallet\{display:inline-flex;flex:0 0 auto/);
  assert.match(styles, /body\.theme-rainbow \.top-wallet\{border-color:#fff1a3/);
});

test('campos numéricos têm largura e altura para centavos em todos os temas', () => {
  const upgrades = fs.readFileSync(path.join(root, 'public', 'platform-upgrades.css'), 'utf8');
  assert.match(upgrades, /input\[type="number"\]/);
  assert.match(upgrades, /min-width:10ch/);
  assert.match(upgrades, /font-variant-numeric:tabular-nums/);
  assert.match(upgrades, /\.shop-quantity-picker\{grid-template-columns:minmax\(0,1fr\) minmax\(96px,8rem\)!important\}/);
  assert.match(upgrades, /\.shop-quantity-picker input\[type="number"\]\{min-width:10ch!important\}/);
});

test('valores financeiros aceitam centavos, mas quantidades continuam inteiras', () => {
  assert.match(serverJs, /function parseMoney\(value, \{ min = 0, max = Number\.MAX_SAFE_INTEGER \} = \{\}\)/);
  assert.match(serverJs, /const bet = parseMoney\(body\.bet, \{ min: 0\.01 \}\)/);
  assert.match(serverJs, /const amount = parseMoney\(body\.amount, \{ min: 0\.01, max: 100 \}\)/);
  assert.match(serverJs, /if \(!Number\.isInteger\(quantity\) \|\| quantity < 1 \|\| quantity > 20\)/);
  assert.match(html, /id="casinoBet" type="number" min="0\.01" step="0\.01" inputmode="decimal"/);
  assert.doesNotMatch(html, /id="flightBet"/);
  assert.match(html, /id="giftCreditsAmount" type="number" min="0\.01" max="100" step="0\.01" inputmode="decimal"/);
  assert.match(appJs, /id="stellarRepayAmount" type="number" min="0\.01".*step="0\.01" inputmode="decimal"/);
  assert.match(appJs, /20260921-legendary-sides-v98/);
});

test('Apostômetro contabiliza apenas apostas pagas com saldo da Loja 51', () => {
  assert.match(serverJs, /const totalWagered = db\.economy\.casinoPlays\.filter\(\(item\) => item\.walletSource === 'shop'\)\.reduce/);
  assert.match(html, /valor considera somente o saldo da Loja 51/);
});

test('Aviãozinho é retirado da interface e não aceita novas apostas', () => {
  assert.doesNotMatch(html, /id="flight(Form|Bet|CashoutButton|Sky)"/);
  assert.doesNotMatch(appJs, /\$\('#flightForm'\)\.addEventListener/);
  assert.doesNotMatch(appJs, /casino\.globalFlight && !flightPollTimer/);
  assert.match(serverJs, /O Aviãozinho foi encerrado/);
  assert.match(serverJs, /route === '\/api\/casino\/flight\/status'/);
});

test('Loteria 51 semanal controla palpite, fechamento e prêmio mínimo do Apostômetro', () => {
  assert.match(serverJs, /const LOTTERY_NUMBER_MAX = 20/);
  assert.match(serverJs, /const LOTTERY_DRAW_COUNT = 5/);
  assert.match(serverJs, /const LOTTERY_PRIZE_RATE = 0\.10/);
  assert.match(serverJs, /const LOTTERY_MIN_POOL = 1500/);
  assert.match(serverJs, /const LOTTERY_MAX_POOL = 1500/);
  assert.match(serverJs, /const cappedContribution = carryOver > 0 \? contribution : Math\.min\(LOTTERY_MAX_POOL, contribution\)/);
  assert.match(serverJs, /const basePrizePool = roundMoney\(carryOver \+ cappedContribution\)/);
  assert.match(serverJs, /const apostometerTopUp = roundMoney\(Math\.max\(0, LOTTERY_MIN_POOL - basePrizePool\)\)/);
  assert.match(serverJs, /prizePool: roundMoney\(basePrizePool \+ apostometerTopUp\)/);
  assert.match(serverJs, /apostometerTopUp: projection\.apostometerTopUp/);
  assert.match(serverJs, /const LOTTERY_DRAW_HOUR = 16/);
  assert.match(serverJs, /LOTTERY_ONE_OFF_CLOSE_AT = '2026-09-17T20:00:00\.000Z'/);
  assert.match(serverJs, /LOTTERY_ONE_OFF_ROUND_ID = 'lottery:2026-09-10T19:00:00\.000Z'/);
  assert.match(serverJs, /LOTTERY_ONE_OFF_ACTIVE_ROUND_ID = LOTTERY_ONE_OFF_ROUND_ID/);
  assert.match(serverJs, /resetOneOffLotteryForDelayedDraw/);
  assert.match(serverJs, /mode: 'lottery-reset-reversal'/);
  assert.match(serverJs, /reopenOneOffLotteryRoundIfNeeded/);
  assert.match(serverJs, /mode: 'lottery-reversal'/);
  assert.match(serverJs, /invalidatedLotteryRounds/);
  assert.match(serverJs, /invalidatedLotteryPrizeIds/);
  assert.match(serverJs, /function lotteryBoundaryFor/);
  assert.match(serverJs, /function lotteryNumbersForRound/);
  assert.match(serverJs, /reaproveitamos a rodada/);
  assert.match(serverJs, /createHash\('sha256'\)\.update\(secret\)/);
  assert.match(serverJs, /route === '\/api\/lottery\/entry'/);
  assert.match(serverJs, /if \(!Number\.isInteger\(guess\) \|\| guess < 1 \|\| guess > LOTTERY_NUMBER_MAX\)/);
  assert.match(serverJs, /const winnerIds = \[\.\.\.new Set\(entries\.filter/);
  assert.match(serverJs, /mode: 'lottery-prize'/);
  assert.match(serverJs, /id: 'lottery-result:'/);
  assert.match(serverJs, /function lotteryReminderForUser/);
  assert.match(serverJs, /function lotteryTimeLabelForNotification/);
  assert.match(serverJs, /id: 'lottery-reminder:'/);
  assert.match(serverJs, /const lotterySettled = settleLotteryRounds\(\)/);
  assert.match(serverJs, /let lotteryReminder = null;\s*try \{/);
  assert.match(serverJs, /lotteryReminder = lotteryReminderForUser\(user\)/);
  assert.match(serverJs, /lottery: lotteryForUser\(user\)/);
  assert.match(appJs, /function renderLottery/);
  assert.match(appJs, /function scheduleLotteryReminder/);
  assert.match(appJs, /function scheduleLotteryDraw/);
  assert.match(appJs, /function runLotteryLiveDraw/);
  assert.match(appJs, /lottery-live-ball/);
  assert.match(appJs, /Faltam 10 minutos para a Loteria 51/);
  assert.match(appJs, /\/api\/lottery\/entry/);
  assert.match(html, /id="loteria" class="section lottery-page/);
  assert.match(html, /id="lotteryNumbers"/);
  assert.match(html, /id="lotteryPrizePool"/);
  assert.match(html, /id="lotteryLiveDraw"/);
  assert.match(html, /saldo interno do Apostômetro/);
  assert.match(html, /id="lotteryApostometerTopUp"/);
  assert.match(html, /data-page="loteria"/);
});

test('tabela de preços usa finais em centavos sem alterar recompensas e estornos históricos', () => {
  assert.match(serverJs, /function retailPriceWithCents\(value\)/);
  assert.match(serverJs, /SHOP_CATALOG\.forEach\(\(item\) => \{ if \(item\.price > 0\) item\.price = retailPriceWithCents\(item\.price\); \}\)/);
  assert.match(serverJs, /price: 899\.90, monthlyPokemon: true/);
  assert.match(serverJs, /price: 259\.90,/);
      assert.match(serverJs, /entry\.purchasePrice \?\? entry\.price \?\? 900/);
      assert.match(serverJs, /retailPriceWithCents\(90\) \* quantity \/ 10/);
      assert.match(serverJs, /quantity < 1 \|\| quantity > 20/);
      assert.match(appJs, /price: 899\.90/);
      assert.match(appJs, /roulette\.price \|\| 259\.90/);
      assert.match(appJs, /unitPrice: 8\.99/);
      assert.match(appJs, /Roleta Cobblemon por \$\{formatCredits/);
      assert.match(html, /id="cobblemonRoulettePrice"/);
      assert.match(html, /shop-credit-value/);
      assert.match(html, /id="cobblemonRouletteSpin"/);
      assert.match(html, /id="cobblemonBuyBalls"/);
      assert.doesNotMatch(html, /Gire por <b>260 Cr[eé]ditos 51<\/b>/);
  assert.doesNotMatch(html, /Comprar \+10 por 90/);
});

test('Roleta Cobblemon responde ao botão e aos elementos internos do preço', () => {
  assert.match(appJs, /async function spinCobblemonRoulette\(button = \$\('#cobblemonRouletteSpin'\)\)/);
  assert.match(appJs, /event\.target\?\.closest\?\.\('#cobblemonRouletteSpin'\)/);
  assert.match(appJs, /\$\('#cobblemonRouletteSpin'\)\?\.addEventListener\('click'/);
  assert.match(appJs, /\/api\/cobblemon\/roulette\/spin/);
});

test('controles da página Cobblemon não são bloqueados por efeitos de cursor', () => {
  assert.match(appJs, /NATIVE_POINTER_SELECTOR = 'input,textarea,select,button,a,summary/);
  assert.ok((appJs.match(/isNativeInteractiveTarget\(event\.target\)/g) || []).length >= 6);
  assert.match(appJs, /cobblemonRewards'\)\?\.addEventListener\('click'[\s\S]*cobblemon-delivery-group > summary[\s\S]*group\.open = expanded/);
  assert.match(appJs, /data-cobblemon-delivery-group=/);
  assert.match(appJs, /cobblemonOpenDeliveryGroups/);
  assert.match(styles, /\.cobblemon-delivery-group summary::after/);
});

test('entregas de Pokémon usam o ID para exibir sprite e têm alternativa automática', () => {
  assert.match(appJs, /function cobblemonDeliverySpriteMarkup\(entry = \{\}\)/);
  assert.match(appJs, /cobblemonSpriteMarkup\(\{ id: pokemonId, isShiny: Boolean\(entry\.isShiny\) \}, 'small'/);
  assert.match(appJs, /function cobblemonFallbackSprite\(pokemonId, isShiny = false\)/);
  assert.match(appJs, /data-cobblemon-sprite-fallbacks=/);
  const spriteCode = appJs.match(/function cobblemonPreviewSprite[\s\S]*?\nlet cobblemonSelectedBall/)[0].replace(/\nlet cobblemonSelectedBall$/, '');
  const spriteHelpers = new Function('escapeHtml', `${spriteCode}; return { cobblemonDeliverySpriteMarkup };`)(value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'));
  const aerodactyl = spriteHelpers.cobblemonDeliverySpriteMarkup({ pokemonId: 142, isShiny: false });
  assert.match(aerodactyl, /previews\/small\/142\.webp/);
  assert.match(aerodactyl, /sprites\/pokemon\/142\.png/);
});

test('entregas mantêm histórico persistente de itens concluídos', () => {
  assert.match(appJs, /cobblemonDeliveryHistory/);
  assert.match(appJs, /entry\.status === 'delivered'/);
  assert.match(appJs, /Entregue em/);
  assert.match(html, /id="cobblemonDeliveryHistory"/);
});

test('fluxo Cobblemon mantém as ações de baú, roleta, entrega, caça e bolas conectadas ao servidor', () => {
  ['/api/cobblemon/box/purchase', '/api/cobblemon/box/open', '/api/cobblemon/roulette/spin', '/api/cobblemon/reward/decision', '/api/cobblemon/encounter', '/api/cobblemon/capture', '/api/cobblemon/balls/buy-special', '/api/cobblemon/balls/buy'].forEach((route) => {
    assert.match(appJs, new RegExp(route.replaceAll('/', '\\/')));
    assert.match(serverJs, new RegExp(route.replaceAll('/', '\\/')));
  });
  assert.match(appJs, /data-cobblemon-box/);
  assert.match(appJs, /data-cobblemon-delivered/);
  assert.match(appJs, /async function markCobblemonDelivered\(button\)/);
  assert.match(appJs, /cobblemonRewards'\)\?\.addEventListener\('click',[\s\S]*data-cobblemon-delivered[\s\S]*markCobblemonDelivered/);
  assert.match(appJs, /data-cobblemon-ball-buy/);
  assert.match(appJs, /data-cobblemon-ball-select/);
  assert.match(appJs, /data-cobblemon-filter/);
  assert.match(appJs, /data-cobblemon-candidate-sell/);
});

test('radar do mercado lista todos os ativos e o gráfico inclui a janela anterior', () => {
  assert.match(appJs, /function marketRadarMarkup\(assets\)/);
  assert.match(appJs, /marketRadarMarkup\(assets\)/);
  assert.match(appJs, /const previous = Number\(asset\.previousPrice \|\| current\)/);
  assert.match(html, /12 atualizações por dia/);
});

test('Mercado mostra tooltip por ponto e resultado desde o custo médio', () => {
  assert.match(appJs, /class="market-chart-point"/);
  assert.match(appJs, /<title>\$\{escapeHtml\(asset\.name\).*Créditos 51/);
  assert.match(appJs, /marketInvestedCost/);
  assert.match(appJs, /marketUnrealizedPnlPercent/);
  assert.match(appJs, /holdingChangePercent/);
  assert.match(marketLib, /investedCost/);
  assert.match(marketLib, /unrealizedPnlPercent/);
  assert.match(marketLib, /averagePrice/);
  assert.match(html, /id="marketInvestedCost"/);
  assert.match(html, /id="marketUnrealizedPnl"/);
  assert.match(html, /id="marketUnrealizedPnlPercent"/);
});

test('Mercado usa doze janelas fixas sem API externa', () => {
  assert.match(marketLib, /MARKET_UPDATE_TIMES/);
  assert.match(marketLib, /MARKET_UPDATE_MINUTES/);
  assert.match(marketLib, /As doze sincronizações/);
});

test('Mercado oferece liquidez controlada sem substituir a valorização', () => {
  assert.match(serverJs, /const MARKET_DAILY_INCOME = 40/);
  assert.match(serverJs, /MARKET_DIVIDEND_DAILY_RATE = 0\.0016/);
  assert.match(serverJs, /MARKET_DIVIDEND_RATE_PER_UPDATE = MARKET_DIVIDEND_DAILY_RATE \/ MARKET_UPDATE_TIMES\.length/);
  assert.match(serverJs, /MARKET_DIVIDEND_DAILY_CAP = 20/);
  assert.match(serverJs, /route === '\/api\/market\/daily-income'/);
  assert.match(serverJs, /mode: 'market-dividend'/);
  assert.match(serverJs, /mode: 'market-mission'/);
  assert.match(serverJs, /function syncMarketEconomy\(now = new Date\(\)\)/);
  assert.match(appJs, /data-market-income-claim/);
  assert.match(appJs, /marketMissionList/);
  assert.match(html, /id="marketDailyIncomeButton"/);
  assert.match(html, /id="marketLiquidityHint"/);
});

test('administração consegue distribuir bônus coletivo com proteção contra duplicação', () => {
  assert.match(serverJs, /route === '\/api\/admin\/credits\/bulk'/);
  assert.match(serverJs, /bulkCreditGrants/);
  assert.match(serverJs, /mode: 'bulk-add'/);
  assert.match(serverJs, /batchId: grantId/);
  assert.match(serverJs, /person\.active && person\.approved !== false/);
  assert.match(appJs, /\$\('#bulkCreditForm'\)/);
  assert.match(appJs, /data\.duplicate \? 'Este bônus já havia sido aplicado/);
  assert.match(html, /id="bulkCreditAmount" type="number" min="0\.01"/);
  assert.match(html, /Creditar para toda a equipe/);
});

test('extrato e notificações arredondam bônus em centavos', () => {
  assert.match(serverJs, /amount: roundMoney\(Number\(item\.after\) - Number\(item\.before\)\)/);
  assert.match(serverJs, /Você recebeu ' \+ roundMoney\(item\.amount\) \+ ' Créditos 51/);
  assert.match(serverJs, /detail: item\.type === 'credits' \? roundMoney\(item\.amount\)/);
  assert.match(appJs, /20260921-legendary-sides-v98/);
});

test('Mentirometro remove contas apagadas das votações pendentes', () => {
  assert.match(serverJs, /function sanitizePendingLieVoters\(now = new Date\(\)\.toISOString\(\)\)/);
  assert.match(serverJs, /required\.filter\(\(id\) => activeVoterIds\.has\(id\)\)/);
  assert.match(serverJs, /item\.cancelReason = 'Não há participantes ativos para validar'/);
  assert.match(serverJs, /sanitizePendingLieVoters\(\);\s+db\.submissions/);
  assert.match(appJs, /20260921-legendary-sides-v98/);
});

test('Pokédex preserva a identidade Cobblemon mesmo com tema ou punição ativos', () => {
  assert.match(styles, /body:is\(\.theme-rainbow,\.theme-punishment,\.theme-dark,\[class\*="profile-theme-"\]\) \.cobblemon-page/);
  assert.match(styles, /theme-cobblemon-v3\.webp/);
  assert.match(styles, /\.cobblemon-page-hero\{background:linear-gradient\(100deg,#061b36ed/);
  assert.match(styles, /body\.theme-light-override \.cobblemon-page\{background:linear-gradient\(100deg,rgba\(240,252,255/);
  assert.match(styles, /theme-cobblemon-ocean-v1\.png'\) center\/cover scroll/);
  assert.match(styles, /body\.profile-theme-cobblemon \.section[^}]*backdrop-filter:none/);
  assert.match(appJs, /cobblemonHuntInterval = setInterval\(tick, 1000\)/);
  assert.match(styles, /theme-cobblemon-dex-v1\.jpg/);
  assert.match(html, /mon-legendary mon-articuno/);
  assert.match(html, /previews\/large\/150\.webp/);
  assert.match(styles, /cobblemon-scene-mon\.mon-legendary/);
  assert.match(styles, /background-attachment:scroll!important/);
});

test('Cobblemon separa Caça e Pokédex em abas sem duplicar consultas', () => {
  assert.match(html, /id="cobblemonTabs"/);
  assert.match(html, /data-cobblemon-tab="hunt"/);
  assert.match(html, /data-cobblemon-tab="catalog"/);
  assert.match(html, /id="cobblemonDexCard"[^>]*data-cobblemon-tab-panel="catalog"/);
  assert.match(appJs, /function setCobblemonTab\(tab = 'hunt'\)/);
  assert.match(appJs, /nextTab === 'hunt' && appState\?\.me\?\.id/);
  assert.match(appJs, /\$\('#cobblemonCaptureButton'\)\?\.addEventListener\('click'/);
  assert.match(appJs, /function setCobblemonDexFilter\(filter = 'all'\)/);
  assert.match(appJs, /button\.addEventListener\('click', \(event\) =>/);
  assert.match(appJs, /Sua sessão ainda está carregando/);
  assert.match(appJs, /Você não possui nenhuma Poké Ball disponível para a caça/);
  assert.match(appJs, /page\.dataset\.cobblemonTab = nextTab/);
  assert.match(styles, /cobblemon-page\[data-cobblemon-tab="catalog"\]/);
  assert.match(styles, /cobblemonRouletteOdds\{border:1px solid #5f9fbd/);
  assert.match(styles, /cobblemonRouletteSpin\.button-primary\{border:1px solid #f5d264/);
});

test('rolagem da Pokédex não altera iluminação nem cria trabalho por frame', () => {
  assert.doesNotMatch(appJs, /cobblemon-scrolling/);
  assert.doesNotMatch(appJs, /scheduleCobblemonScrollMode/);
  assert.doesNotMatch(styles, /\.cobblemon-page\.is-scrolling|body\.cobblemon-scrolling/);
  assert.match(styles, /\.cobblemon-page \.cobblemon-dex-mon\{contain:layout style\}/);
});

test('caçada troca de setor antes da renderização pesada da página', () => {
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /updateCobblemonHuntSector\(page\);/);
  assert.match(appJs, /const needsFirstPaint = cobblemonPageEncounter \|\| page === 'perfil' \|\| page === 'loja';/);
  assert.match(appJs, /if \(needsFirstPaint\) requestAnimationFrame\(\(\) => requestAnimationFrame\(renderPage\)\)/);
  assert.match(appJs, /if \(cobblemonPageEncounter && page !== 'cobblemon'\)/);
  assert.match(appJs, /renderedPortalPage = null;\s*requestAnimationFrame\(\(\) => \{ if \(!cobblemonPageEncounter\) renderActivePortalPage\(appState\); \}\)/);
});

test('caçada ignora menus pausados e usa a origem real do arraste no arremesso', () => {
  assert.match(appJs, /function cobblemonHuntEnabledSectors\(flags = appState\?\.settings\?\.featureFlags \|\| \{\}\)/);
  assert.match(appJs, /const enabledSectors = cobblemonHuntEnabledSectors\(\);/);
  assert.match(appJs, /const encounterPageEnabled = !encounterFeature \|\| appState\?\.settings\?\.featureFlags\?\.\[encounterFeature\] !== false/);
  assert.match(appJs, /const dragState = cobblemonPageDrag;/);
  assert.match(appJs, /origin: \{ x: event\.clientX, y: event\.clientY \}/);
  assert.match(appJs, /const launchPoint = \{/);
  assert.match(appJs, /Number\(dragState\.origin\?\.x \|\| event\.clientX\)/);
  assert.doesNotMatch(appJs, /targetRect\.left - Math\.min\(220, window\.innerWidth \* \.24\)/);
  assert.match(appJs, /target\.style\.left = `\$\{Math\.round\(window\.innerWidth \/ 2\)\}px`/);
  assert.match(appJs, /let cobblemonPageThrowSequence = 0/);
  assert.match(appJs, /throwSequence !== cobblemonPageThrowSequence/);
  assert.match(appJs, /ball\.animate\(\[/);
  assert.match(styles, /\.cobblemon-page-ball\.hunting\{left:50%;right:auto/);
  assert.match(styles, /\.cobblemon-page-ball\.selected:not\(\.dragging\):not\(\.throwing\)/);
});

test('preferência de música permanece desligada depois de recarregar', () => {
  assert.match(appJs, /function hydrateMusicPreference\(userId\)/);
  assert.match(appJs, /function persistMusicPreference\(value\)/);
  assert.match(appJs, /hydrateMusicPreference\(data\.me\?\.id\)/);
  assert.match(appJs, /primeMusicFromGesture\(activate = false\)/);
  assert.match(appJs, /primeMusicFromGesture\(false\)/);
});

test('Forbes 51 ordena por patrimônio e publica apenas investimentos atuais', () => {
  assert.match(serverJs, /const financeRanking = db\.users\.filter\(\(item\) => item\.active\)/);
  assert.match(serverJs, /const invested = roundMoney\(marketForUser\(db\.economy, item\.id\)\.holdingsValue\)/);
  assert.match(serverJs, /\.sort\(\(a, b\) => b\.invested - a\.invested/);
  assert.doesNotMatch(serverJs, /sortValue/);
  assert.match(serverJs, /rankings: \{ best: bestRanking, worst: worstRanking, gay: gayRanking \}, financeRanking/);
  assert.match(appJs, /const finance = Array\.isArray\(appState\.financeRanking\)/);
  assert.match(appJs, /Investido em ativos:/);
  assert.doesNotMatch(appJs, /Caixa atual:/);
  assert.match(html, /maior para o menor valor atual investido/);
  assert.match(html, /id="financeRanking"/);
  assert.match(html, /FORBES 51/);
});

test('Perfil e Loja não são reconstruídos duas vezes durante a sincronização global', () => {
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(appJs, /if \(!globalOnly\) \{\s*if \(profilePage === 'cobblemon'\) renderCobblemonDex\(profile\);/);
});

test('compra de Poké Balls confirma e informa a quantidade realmente adicionada', () => {
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const serverJs = fs.readFileSync(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(appJs, /Comprar 3 Poké Balls/);
  assert.match(appJs, /const added = Number\(data\.quantity \|\| buyQuantity\)/);
  assert.match(appJs, /appState\.profile\?\.cobblemon\?\.balls/);
  assert.match(serverJs, /json\(res, 200, \{ profile: profileFor\(user\), quantity, price/);
});

test('Pokédex posiciona sprites lendários nas laterais sem bloquear a interface', () => {
  assert.match(html, /class="cobblemon-scene-sprites"/);
  assert.match(html, /class="cobblemon-scene-mon mon-legendary mon-articuno"/);
  assert.match(styles, /\.cobblemon-scene-sprites\{position:absolute;inset:0;z-index:0;pointer-events:none/);
  assert.match(styles, /\.cobblemon-scene-mon\{[^}]*animation:none/);
  assert.doesNotMatch(styles, /cobblemon-scene-float/);
  assert.match(appJs, /function cobblemonPreviewSprite/);
  assert.match(appJs, /cobblemonDexGridKey/);
  assert.match(appJs, /fetchpriority="low"/);
  assert.match(styles, /\.cobblemon-page \.cobblemon-dex-mon\{contain:layout style\}/);
  assert.match(styles, /background-attachment:scroll!important/);
  assert.doesNotMatch(appJs, /function scheduleCobblemonScrollMode\(\)/);
  assert.doesNotMatch(appJs, /cobblemon-scrolling/);
  assert.doesNotMatch(styles, /body\.cobblemon-scrolling/);
});

test('Cobblemon padroniza preços com moeda e centavos em cápsulas, roleta e bolas', () => {
  assert.match(appJs, /shopCreditMarkup\(box\.price, 'por cápsula'\)/);
  assert.match(appJs, /const roulettePriceMarkup = shopCreditMarkup\(roulettePrice, 'por giro'\)/);
  assert.match(appJs, /shopCreditMarkup\(unitPrice, 'por unidade'\)/);
  assert.match(styles, /\.cobblemon-box-price/);
  assert.match(styles, /\.cobblemon-roulette-copy \.button \.shop-credit-value/);
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

test('baús Cobblemon mantêm conteúdo e ações no grid sem quebrar a rolagem', () => {
  assert.match(appJs, /class="cobblemon-box-copy"/);
  assert.match(appJs, /class="cobblemon-box-actions"/);
  assert.match(appJs, /capture-ball-cobblemon\.png/);
  assert.match(styles, /cobblemon-box-copy\{grid-column:2!important/);
  assert.match(styles, /cobblemon-box-actions\{grid-column:1\/-1!important;grid-row:3!important/);
  assert.match(styles, /cobblemon-box-card\{grid-template-columns:62px minmax\(0,1fr\)!important;grid-template-rows:minmax\(78px,auto\) auto!important/);
  assert.match(styles, /cobblemon-box-copy\{grid-column:2!important;grid-row:1!important;display:flex!important;flex-direction:column!important/);
  assert.match(styles, /cobblemon-box-actions\{grid-column:1\/-1!important;grid-row:2!important;display:grid!important/);
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

test('Pokémon não escolhido pode ser vendido pelo valor da raridade', () => {
  assert.match(serverJs, /cobblemonCandidateSellPrice/);
  assert.match(serverJs, /common: 300, shiny: 400, rare: 450/);
  assert.match(serverJs, /cobblemon-candidate-sale/);
  assert.match(appJs, /data-cobblemon-candidate-sell/);
  assert.match(appJs, /function sellCobblemonCandidate\(button\)/);
  assert.match(appJs, /cobblemonCapsuleResults.*addEventListener\('click'/s);
  assert.match(appJs, /Vender por: \$\{sellAmount\} coins/);
  assert.match(serverJs, /Registros vendidos continuam contando como compras/);
  assert.doesNotMatch(serverJs, /cycleEntries = cycleId \? db\.economy\.cobblemonDeliveries\.filter\([^\n]+sold/);
  assert.match(serverJs, /soldFromWeeklyChoice/);
  assert.match(serverJs, /const canPurchase = !deliveryLocked && !weeklyChoice && weeklyPurchaseCount < 7;/);
  assert.doesNotMatch(serverJs, /weeklyChoiceClosed/);
  assert.match(serverJs, /entry\.rewardId === body\.id/);
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


