const GUESS_LIMIT = 25;
const MAX_BERRIES = 20;
const MIN_BERRIES = 3;

export function calcBerryAward(guessCount) {
  if (guessCount <= 0) return MIN_BERRIES;
  const ratio = 1 - ((guessCount - 1) / (GUESS_LIMIT - 1));
  return Math.round(MIN_BERRIES + ratio * (MAX_BERRIES - MIN_BERRIES));
}
