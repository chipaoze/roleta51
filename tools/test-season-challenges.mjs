import assert from 'node:assert/strict';
import { seasonalChallengeProgress } from '../lib/season-challenges.mjs';

const data = {
  users: [{ id: 'ana', active: true }, { id: 'bia', active: true }, { id: 'off', active: false }],
  waterEntries: [{ userId: 'ana', dayKey: '2026-09-01', ml: 3000 }, { userId: 'bia', dayKey: '2026-09-01', ml: 37000 }, { userId: 'off', dayKey: '2026-09-01', ml: 99999 }],
  dailyPhrases: [{ userId: 'ana', createdAt: '2026-09-02T12:00:00.000Z' }, { userId: 'ana', createdAt: '2026-09-03T12:00:00.000Z' }],
  dailyMemes: Array.from({ length: 22 }, (_, index) => ({ userId: 'bia', createdAt: `2026-09-${String((index % 9) + 1).padStart(2, '0')}T12:00:00.000Z` })),
  anonymousPosts: [],
  votings: [{ votes: [{ userId: 'ana', createdAt: '2026-09-03T12:00:00.000Z' }, { userId: 'ana', createdAt: '2026-09-04T12:00:00.000Z' }, ...Array.from({ length: 22 }, () => ({ userId: 'bia', createdAt: '2026-09-05T12:00:00.000Z' }))] }],
};
const ana = seasonalChallengeProgress(data, 'ana', '2026-09', (date) => date.slice(0, 10));
assert.equal(ana.find((item) => item.id === 'water').progress, 40000);
assert.equal(ana.find((item) => item.id === 'water').eligible, true);
assert.equal(ana.find((item) => item.id === 'wall').teamCompleted, true);
assert.equal(ana.find((item) => item.id === 'votes').eligible, true);
assert.equal(seasonalChallengeProgress(data, 'ana', '2026-08', (date) => date.slice(0, 10))[0].progress, 0);
console.log('season challenge progress: ok');
