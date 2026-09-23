import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('public/app.js', root), 'utf8');
const upgrades = fs.readFileSync(new URL('public/platform-upgrades.css', root), 'utf8');

test('sincronização preserva pausa em segundo plano e cadência rápida para telas ao vivo', () => {
  assert.match(app, /if \(document\.hidden\) return 90000;/);
  assert.match(app, /if \(drawActive\) return 1800;/);
  assert.match(app, /return impostorActive \|\| mysteryActive \? 2500 : 25000;/);
  assert.match(app, /if \(document\.hidden \|\| portalSyncInProgress \|\| !navigator\.onLine\)/);
});

test('movimento contínuo do cursor é limitado sem alterar ações por clique ou teclado', () => {
  assert.match(app, /let lastPointerMoveActivityAt = 0;/);
  assert.match(app, /now - lastPointerMoveActivityAt < 30000/);
  assert.match(app, /document\.addEventListener\('pointermove', \(\) => notePortalActivity\('pointermove'\)/);
  assert.match(app, /document\.addEventListener\('pointerdown', \(\) => notePortalActivity\('pointerdown'\)/);
  assert.match(app, /document\.addEventListener\('keydown', \(\) => notePortalActivity\('keydown'\)/);
});

test('sessão tem reconexão limitada e mantém a autenticação inválida fora de tentativas', () => {
  assert.match(app, /const SESSION_BOOT_RETRY_DELAYS = \[1200, 2500, 5000, 10000\];/);
  assert.match(app, /if\(error\.status===401\) \{ showAuth\(\); return; \}/);
  assert.match(app, /const retryDelay = SESSION_BOOT_RETRY_DELAYS\[sessionBootAttempts - 1\];/);
  assert.match(app, /sessionBootRetryTimer = setTimeout\(initialize, retryDelay\);/);
});

test('painel administrativo mostra sinal de backup sem representar uma cota externa', () => {
  assert.match(app, /backupNeedsAttention/);
  assert.match(app, /Sincronização visível preservada; apenas abas em segundo plano ficam pausadas\./);
  assert.match(upgrades, /#healthOverallStatus\.needs-attention\{color:var\(--orange\)\}/);
});
