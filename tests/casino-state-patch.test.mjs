import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { casinoPlayStatePatch } from '../lib/casino-state-patch.mjs';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE app_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  const original = {
    settings: { roundName: 'Rodada semanal' },
    economy: {
      wallets: { 'user-1': 100, 'user-2': 50 },
      casinoAccounts: { 'user-1': { dayKey: '2026-09-22', balance: 250, cashedOut: false } },
      casinoPlays: [{ id: 'old', userId: 'user-2' }],
      creditAdjustments: [{ id: 'older' }],
      mysteryBoxes: [],
      investmentMarket: { prices: { void: 500 }, ledger: [{ id: 'trade-1' }] },
    },
  };
  sql.prepare('INSERT INTO app_state (id, data, revision, updated_at) VALUES (1, ?, 7, ?)').run(JSON.stringify(original), 'old');
  return { sql, original };
}

test('aposta altera apenas jogada, conta, carteira e extrato na mesma revisão', () => {
  const { sql, original } = database();
  const play = { id: 'play-1', userId: 'user-1', walletSource: 'shop', bet: 2, net: 4 };
  const adjustment = { id: 'adjustment-1', userId: 'user-1', amount: 4 };
  const patch = casinoPlayStatePatch({ userId: 'user-1', play, account: original.economy.casinoAccounts['user-1'], wallet: 104, adjustment, revision: 7, updatedAt: 'new' });
  const result = sql.prepare(patch.sql).run(...patch.values);
  const row = sql.prepare('SELECT data, revision, updated_at FROM app_state').get();
  const updated = JSON.parse(row.data);
  assert.equal(result.changes, 1);
  assert.equal(row.revision, 8);
  assert.equal(row.updated_at, 'new');
  assert.equal(updated.economy.wallets['user-1'], 104);
  assert.deepEqual(updated.economy.casinoPlays, [...original.economy.casinoPlays, play]);
  assert.deepEqual(updated.economy.creditAdjustments, [...original.economy.creditAdjustments, adjustment]);
  assert.deepEqual(updated.economy.investmentMarket, original.economy.investmentMarket);
  assert.deepEqual(updated.settings, original.settings);
  assert.equal(sql.prepare(patch.sql).run(...patch.values).changes, 0, 'a revisão antiga não pode sobrescrever uma jogada');
});

test('aposta promocional com baú preserva carteira e registra o item uma vez', () => {
  const { sql, original } = database();
  const play = { id: 'play-2', userId: 'user-1', walletSource: 'promotional', bet: 10, resultType: 'mysteryBox' };
  const item = { id: 'box-1', userId: 'user-1', boxId: 'box-sonda' };
  const account = { dayKey: '2026-09-22', balance: 240, cashedOut: false };
  const patch = casinoPlayStatePatch({ userId: 'user-1', play, account, inventoryItem: item, revision: 7, updatedAt: 'new' });
  sql.prepare(patch.sql).run(...patch.values);
  const updated = JSON.parse(sql.prepare('SELECT data FROM app_state').get().data);
  assert.deepEqual(updated.economy.wallets, original.economy.wallets);
  assert.deepEqual(updated.economy.creditAdjustments, original.economy.creditAdjustments);
  assert.deepEqual(updated.economy.mysteryBoxes, [item]);
  assert.deepEqual(updated.economy.casinoAccounts['user-1'], account);
});
