import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSqliteD1 } from '../backend/sqlite-d1.mjs';
import { isDailyDutyWorkday, previousDailyDutyWorkday } from '../lib/daily-duty-workdays.mjs';

test('the next workday after Friday is Monday', () => {
  assert.equal(isDailyDutyWorkday('2026-10-30'), true);
  assert.equal(isDailyDutyWorkday('2026-10-31'), false);
  assert.equal(isDailyDutyWorkday('2026-11-01'), false);
  assert.equal(previousDailyDutyWorkday('2026-11-02'), '2026-10-30');
  assert.equal(previousDailyDutyWorkday('2026-11-03'), '2026-11-02');
});

test('basket and penalty pause on weekends and resume on Monday', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const source = (await readFile(path.join(root, 'legacy-server.mjs'), 'utf8'))
    .replaceAll("from './lib/", `from '${pathToFileURL(path.join(root, 'lib')).href}/`)
    + '\nexport const testBasket = dailyDutyBasketTaskForDay; export const testPenalty = dailyDutyPenaltyFor;';
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const database = createSqliteD1(':memory:');
  try {
    const seed = JSON.parse(await readFile(path.join(root, 'seed-database.json'), 'utf8'));
    const user = { id: 'weekday-user', username: 'weekday-user', displayName: 'Teste', role: 'member', active: true, approved: true, createdAt: '2026-10-01T12:00:00.000Z' };
    seed.users = [user];
    seed.settings.dailyDutyBasketActivatedAt = '2026-10-30T00:00:00-03:00';
    seed.economy ||= {};
    seed.economy.dailyDutyPosts = [];
    seed.economy.dailyDutyBasketCollections = [];
    seed.economy.dailyDutyPenaltyClears = [];
    seed.dailyPhrases = [];
    seed.dailyMemes = [];
    seed.dailyWallHistory = [];
    seed.waterEntries = [];
    await module.initializeOnline({ DB: database, MEDIA: { get: async () => null, put: async () => {}, delete: async () => {} } }, seed);
    assert.equal(module.testBasket(user, '2026-10-31', new Date('2026-10-31T12:00:00-03:00')), null);
    assert.equal(module.testBasket(user, '2026-11-01', new Date('2026-11-01T12:00:00-03:00')), null);
    assert.equal(module.testPenalty(user, new Date('2026-10-31T12:00:00-03:00')), null);
    assert.equal(module.testPenalty(user, new Date('2026-11-01T12:00:00-03:00')), null);
    assert.equal(module.testBasket(user, '2026-11-02', new Date('2026-11-02T12:00:00-03:00'))?.checkedDay, '2026-10-30');
    const mondayPenalty = module.testPenalty(user, new Date('2026-11-02T12:00:00-03:00'));
    assert.equal(mondayPenalty?.taskDay, '2026-10-30');
    assert.equal(mondayPenalty?.durationHours, 24);
  } finally {
    database.close();
  }
});
