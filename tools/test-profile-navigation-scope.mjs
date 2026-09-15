import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const server = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const profileRendererStart = app.indexOf('function renderProfileEconomy');
const profileRenderer = app.slice(profileRendererStart, app.indexOf('function renderAdmin', profileRendererStart));

assert.ok(profileRenderer.includes("if (profilePage === 'cobblemon') renderCobblemonDex(profile)"));
assert.ok(profileRenderer.includes("if (profilePage === 'perfil') renderVisualTrading(appState.trading || {})"));
assert.ok(profileRenderer.includes("if (profilePage === 'album') renderCardAlbum(appState.cardAlbum)"));
assert.ok(profileRenderer.includes("if (globalOnly || profilePage === 'album' || profilePage === 'cobblemon') return"));
assert.ok(profileRenderer.includes('shopCatalogRenderSignature !== nextShopCatalogSignature'));
assert.ok(app.includes('renderProfileEconomy(data.profile, true)'));
assert.ok(profileRenderer.includes('applyPersonalTheme(allowPersonalTheme ? siteThemeItem?.value : null)'));
assert.ok(profileRenderer.includes("$('.site-menu-user').className = 'site-menu-user'"));
assert.match(server, /const recapVoting = voting\?\.status === 'closed' && voting\.roundId === roundId \? voting : null/);

assert.equal((html.match(/id="cobblemonCaptureButton"/g) || []).length, 1);
assert.ok(html.indexOf('id="cobblemonCaptureButton"') < html.indexOf('id="cobblemonDexSearch"'));
assert.ok(html.includes('>Iniciar caçada</button>'));
assert.ok(html.includes('>🔎 Buscar na coleção</label>'));
assert.ok(!html.includes('>Procurar Pokémon</button>'));
assert.ok(html.includes('RODADA ESPECIAL · 1 VEZ POR DIA'));
assert.ok(!html.includes('1 VEZ A CADA 72 HORAS'));
assert.ok(app.includes('const deliveryGroups = new Map()'));
assert.ok(app.includes('class="cobblemon-delivery-group"'));
assert.ok(app.includes('group.entries.length === 1'));
assert.ok(html.includes('admin-participants-card admin-wide'));
assert.ok(styles.includes('.admin-participants-card .admin-users{grid-template-columns:repeat(2,minmax(0,1fr))'));
assert.ok(styles.includes('@media(max-width:980px){.admin-participants-card .admin-users{grid-template-columns:1fr}}'));

console.log('PASS: profile renderer preserves global visuals, skips hidden page work, hides stale recaps, caches shop markup, and separates hunting from collection search.');
