const GUESS_LIMIT = 25;
const MAX_FEATHERS = 20;
const MIN_FEATHERS = 3;

export function calcFeatherAward(guessCount) {
  if (guessCount <= 0) return MIN_FEATHERS;
  const ratio = 1 - ((guessCount - 1) / (GUESS_LIMIT - 1));
  return Math.round(MIN_FEATHERS + ratio * (MAX_FEATHERS - MIN_FEATHERS));
}
