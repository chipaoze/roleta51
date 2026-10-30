export const ROULETTE_WINDOW_MS = 10 * 60 * 1000;
export const ROULETTE_WINDOW_LIMIT = 120;
export const ROULETTE_DAILY_LIMIT = 1000;
export const ROULETTE_MIN_SPIN_INTERVAL_MS = 5000;

export function roulettePaceAllowed(lastAt, now = Date.now()) {
  return now - lastAt >= ROULETTE_MIN_SPIN_INTERVAL_MS;
}

export function rouletteTrafficDecision({ windowStartedAt = 0, windowCount = 0, dayCount = 0 }, now = Date.now()) {
  if (dayCount >= ROULETTE_DAILY_LIMIT) return { allowed: false, reason: 'daily' };
  const windowActive = now - windowStartedAt < ROULETTE_WINDOW_MS;
  if (windowActive && windowCount >= ROULETTE_WINDOW_LIMIT) return { allowed: false, reason: 'window' };
  return { allowed: true, windowStartedAt: windowActive ? windowStartedAt : now, windowCount: windowActive ? windowCount + 1 : 1 };
}
