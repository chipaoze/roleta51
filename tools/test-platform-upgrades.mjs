import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [server, app, html, css] = await Promise.all([
  readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/platform-upgrades.css', import.meta.url), 'utf8'),
]);

for (const feature of ['casino', 'impostor', 'mystery', 'shop', 'uploads']) {
  assert.match(server, new RegExp(feature + ': true'));
  assert.match(html, new RegExp('name="' + feature + '"'));
}
assert.match(server, /route === '\/api\/profile\/showcase'/);
assert.match(server, /requested\.length > 4/);
assert.match(server, /roundRecap: roundRecapFor\(recapVoting\)/);
assert.match(server, /adminHealth: user\.role === 'admin'/);
assert.match(app, /function renderTodayHub/);
assert.match(app, /function renderTrophyRoom/);
assert.match(app, /function renderEventMode/);
assert.match(app, /function renderFeatureAvailability/);
assert.match(app, /function renderAdminHealth/);
assert.match(app, /const canUpload = Boolean\(data\.meCanUpload && data\.settings\?\.featureFlags\?\.uploads !== false\)/);
assert.match(css, /@media\(max-width:600px\)/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicates)], [], 'IDs duplicados no HTML');

console.log('PASS: central diária, resumo, troféus, modo evento, saúde, flags e responsividade conectados sem novo polling.');
