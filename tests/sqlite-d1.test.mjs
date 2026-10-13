import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';

test('adaptador SQLite devolve linhas de SELECT dentro de batch como o D1', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'area51-d1-'));
  const database = createSqliteD1(path.join(directory, 'state.sqlite'));
  try {
    await database.prepare('CREATE TABLE online_presence (user_id TEXT, last_seen INTEGER)').run();
    const results = await database.batch([
      database.prepare('INSERT INTO online_presence(user_id,last_seen) VALUES(?,?)').bind('luan', 100),
      database.prepare('SELECT user_id,last_seen FROM online_presence WHERE last_seen > ?').bind(0),
    ]);
    assert.equal(results[1].results.length, 1);
    assert.equal(results[1].results[0].user_id, 'luan');
    assert.equal(results[1].results[0].last_seen, 100);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
