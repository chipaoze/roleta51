// Keep the least expensive spin above the cent-rounding edge case.
export const ROULETTE_MIN_BET = 0.10;

// A box can return up to 650 credits. Its maximum expected value stays below
// 1.3% of a wager, leaving room for the wheel's 2.94% numeric edge and jackpot.
export function rouletteBoxChance(bet) {
  if (!Number.isFinite(bet) || bet < ROULETTE_MIN_BET) return 0;
  return Math.min(0.02, bet * 0.00002);
}
