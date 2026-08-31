import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../seed-database.json', import.meta.url);
const source = JSON.parse(await readFile(file, 'utf8'));
const clean = {
  ...source,
  submissions: [],
  assignments: [],
  draws: [],
  votings: [],
  scores: {},
  feedbackMessages: [],
  dailyMemes: [],
  dailyPhrases: [],
  dailyReactions: [],
  anonymousPosts: [],
  waterEntries: source.waterEntries || [],
  rememberTokens: [],
  lieAccusations: source.lieAccusations || [],
  gateAuthorizations: [],
  notificationsReadAt: {},
  economy: source.economy,
  settings: {
    ...source.settings,
    currentRoundId: null,
    currentTheme: null,
    currentParticipantIds: [],
    currentParticipantsLocked: false,
    currentRoundRecoveredAt: null,
    dailyPhrase: '',
    dailyPhraseUpdatedAt: null,
    dailyPhraseUpdatedBy: null,
    liveDraw: null,
    releaseVersion: 1,
    releasePublishedAt: null,
    releasePublishedBy: null,
    missionEconomyStartWeek: '2026-08-31',
  },
};

await writeFile(file, JSON.stringify(clean, null, 2) + '\n', 'utf8');
