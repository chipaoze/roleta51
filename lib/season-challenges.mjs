export const SEASON_CHALLENGES = Object.freeze([
  { id: 'water', icon: '💧', title: 'Maré mensal', description: 'A tripulação soma água durante o mês.', target: 40000, personalTarget: 3000, reward: 20, unit: 'ml' },
  { id: 'wall', icon: '🖼️', title: 'Mural em movimento', description: 'Frases, memes e recados mantêm o mural vivo.', target: 24, personalTarget: 2, reward: 15, unit: 'publicações' },
  { id: 'votes', icon: '🗳️', title: 'Voz da tripulação', description: 'Participar das votações fecha as rodadas.', target: 24, personalTarget: 2, reward: 10, unit: 'votos' },
]);

const list = (value) => Array.isArray(value) ? value : [];
const isInMonth = (value, monthKey, timestampToDay) => String(timestampToDay(value) || '').startsWith(monthKey);

export function seasonalChallengeProgress(data, userId, monthKey, timestampToDay) {
  const eligibleIds = new Set(list(data.users).filter((user) => user.active && user.approved !== false).map((user) => user.id));
  const waterEntries = list(data.waterEntries).filter((item) => eligibleIds.has(item.userId) && String(item.dayKey || '').startsWith(monthKey));
  const wallEntries = [
    ...list(data.dailyPhrases).map((item) => ({ userId: item.userId, createdAt: item.createdAt })),
    ...list(data.dailyMemes).map((item) => ({ userId: item.userId, createdAt: item.createdAt })),
    ...list(data.anonymousPosts).map((item) => ({ userId: item.authorId, createdAt: item.createdAt })),
  ].filter((item) => eligibleIds.has(item.userId) && isInMonth(item.createdAt, monthKey, timestampToDay));
  const votes = list(data.votings).flatMap((voting) => list(voting.votes)).filter((item) => eligibleIds.has(item.userId) && isInMonth(item.createdAt, monthKey, timestampToDay));
  const totals = { water: waterEntries.reduce((sum, item) => sum + Number(item.ml || 0), 0), wall: wallEntries.length, votes: votes.length };
  const mine = { water: waterEntries.filter((item) => item.userId === userId).reduce((sum, item) => sum + Number(item.ml || 0), 0), wall: wallEntries.filter((item) => item.userId === userId).length, votes: votes.filter((item) => item.userId === userId).length };
  return SEASON_CHALLENGES.map((challenge) => ({ ...challenge, progress: totals[challenge.id], personalProgress: mine[challenge.id], teamCompleted: totals[challenge.id] >= challenge.target, eligible: mine[challenge.id] >= challenge.personalTarget }));
}
