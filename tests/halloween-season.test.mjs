import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HALLOWEEN_2026, halloween2026State, isSeasonalShopItemAvailable } from '../lib/halloween-season.mjs';
import { CARD_PACK_RULES, albumFor, openCardPack } from '../lib/card-album.mjs';

const root = path.resolve(import.meta.dirname, '..');
const server = fs.readFileSync(path.join(root, 'legacy-server.mjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'halloween.css'), 'utf8');
const portalStyles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

test('Halloween abre e fecha no horário de São Paulo', () => {
  assert.equal(halloween2026State(new Date('2026-09-25T02:59:59.000Z')), null);
  assert.equal(halloween2026State(new Date('2026-09-25T03:00:00.000Z'))?.id, HALLOWEEN_2026.id);
  assert.equal(halloween2026State(new Date('2026-11-01T02:59:59.000Z'))?.active, true);
  assert.equal(halloween2026State(new Date('2026-11-01T03:00:00.000Z')), null);
});

test('itens sazonais ficam disponíveis só durante o evento', () => {
  const seasonal = { seasonalEvent: HALLOWEEN_2026.id };
  assert.equal(isSeasonalShopItemAvailable(seasonal, new Date('2026-09-24T18:00:00.000Z')), false);
  assert.equal(isSeasonalShopItemAvailable(seasonal, new Date('2026-10-15T18:00:00.000Z')), true);
  assert.equal(isSeasonalShopItemAvailable(seasonal, new Date('2026-11-03T18:00:00.000Z')), false);
  assert.equal(isSeasonalShopItemAvailable({}, new Date('2026-09-24T18:00:00.000Z')), true);
});

test('compras continuam pertencendo ao usuário depois da temporada', () => {
  assert.match(server, /isShopItemAvailable\(item, localHalloweenPreview\) \|\| \(!item\.cardPack && ownedIds\.has\(item\.id\)\)/);
  assert.match(server, /if \(!isShopItemAvailable\(item, localHalloweenPreview\)\) throw new HttpError\(409/);
  assert.match(server, /site-halloween-bloodmoon/);
  assert.match(server, /site-halloween-toxic-fog/);
  assert.match(server, /site-halloween-haunted/);
  assert.match(server, /bundleItems: \['cursor-halloween-broom','trail-halloween-slime','name-halloween-ectoplasm','badge-halloween-pumpkin','frame-halloween-rune'\]/);
  assert.doesNotMatch(server, /bundleItems: \['cursor-halloween-broom','cursor-halloween-pumpkin','cursor-halloween-mask'/);
  assert.match(server, /bundledWith: item\.id/);
});

test('pacote Halloween legado não volta a aparecer no álbum ativo', () => {
  assert.deepEqual(CARD_PACK_RULES['card-pack-halloween'].collectionIds, ['noite51']);
  const db = { economy: { purchases: [{ id: 'pack-1', userId: 'u1', itemId: 'card-pack-halloween' }], cardAlbums: {} } };
  const opened = openCardPack(db, 'u1', 'pack-1', () => .99);
  assert.equal(opened.cards.length, 3);
  assert.ok(opened.cards.every(card => card.id.startsWith('noite51:')));
  const outside = albumFor(db, 'u1', '2026-09-23', { activeSeasonalEvents: [] });
  assert.equal(outside.collections.some(collection => collection.id === 'noite51'), false);
  const empty = albumFor({ economy: { cardAlbums: {} } }, 'u2', '2026-09-23', { activeSeasonalEvents: [] });
  assert.equal(empty.collections.some(collection => collection.id === 'noite51'), false);
});

test('temporada não injeta decoração global nem altera páginas e jogos', () => {
  assert.match(app, /applySeasonalEvent\(data\.seasonalEvent\)/);
  assert.match(app, /\$\('#seasonalAtmosphere'\)\?\.remove\(\)/);
  assert.match(app, /shopFilter === 'halloween'/);
  assert.match(html, /data-shop-filter="halloween"/);
  assert.match(html, /halloween\.css\?v=20260925-shop-only-5/);
  assert.match(styles, /#seasonalAtmosphere\{display:none!important\}/);
  assert.doesNotMatch(app, /halloween-red-balloon\.webp/);
  assert.doesNotMatch(app, /halloween-hockey-mask/);
  assert.doesNotMatch(styles, /casino-wheel-stage/);
  assert.doesNotMatch(styles, /cobblemonDexGrid/);
});

test('dois temas, três cursores e rastros de gosma e sangue têm prévia e aplicação', () => {
  assert.match(app, /'halloween-bloodmoon'/);
  assert.match(app, /'halloween-toxic-fog'/);
  assert.match(app, /halloween-slime/);
  assert.match(app, /halloween-blood/);
  assert.match(server, /grantMysteryBoxReward\(user, box, localHalloweenPreview\)/);
  assert.match(styles, /profile-theme-halloween-bloodmoon/);
  assert.match(styles, /profile-theme-halloween-toxic-fog/);
  assert.match(styles, /profile-theme-halloween-haunted/);
  assert.match(styles, /trail-preview-halloween-slime/);
  assert.match(styles, /frame-halloween-rune/);
  assert.ok(fs.existsSync(path.join(root, 'public', 'cursor-halloween-broom.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'cursor-halloween-pumpkin.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'cursor-halloween-mask.png')));
});

test('cursores Halloween entram no sorteio dos baús durante a temporada', () => {
  for (const id of ['cursor-halloween-broom', 'cursor-halloween-pumpkin', 'cursor-halloween-mask']) assert.match(server, new RegExp(`id: '${id}'`));
  assert.match(server, /SHOP_CATALOG\.filter\(\(item\) => isHalloweenShopAvailable\(item, localHalloweenPreview\)/);
  assert.match(server, /grantMysteryBoxReward\(user, box, localHalloweenPreview\)/);
});

test('conjunto administrativo muda no Halloween sem trocar os itens equipados', () => {
  for (const id of ['site-sovereign-command', 'cursor-admin-command', 'name-sovereign-command', 'frame-sovereign-command', 'badge-crown']) {
    assert.match(server, new RegExp(`'${id}':`));
  }
  assert.match(server, /user\?\.role !== 'admin' \|\| !currentHalloweenEvent\(localPreview\)/);
  assert.match(server, /displayedEquipped = equippedCosmeticsForUser\(user, equipped, localHalloweenPreview\)/);
  assert.match(server, /nameStyle: 'name-sovereign-command'/);
  assert.match(server, /frame: 'frame-sovereign-command'/);
  assert.match(server, /cosmeticCatalogItemForUser\(byId\.get\(equipped\[type\]\), owner, localHalloweenPreview\)/);
  assert.match(app, /commander-halloween-cursor-active/);
  assert.match(app, /'sovereign-halloween'/);
  assert.match(portalStyles, /profile-theme-sovereign-halloween/);
  assert.match(portalStyles, /data-badge="admin-halloween"[^}]+content:""!important/);
  assert.match(portalStyles, /theme-sovereign-command-halloween-v1\.png/);
  assert.match(portalStyles, /badge-commander-halloween-v2\.png/);
  assert.match(portalStyles, /frame-commander-halloween-v2\.png/);
  assert.ok(fs.existsSync(path.join(root, 'public', 'theme-sovereign-command-halloween-v1.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'cursor-commander-halloween-v2.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'badge-commander-halloween-v2.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'frame-commander-halloween-v2.png')));
});
