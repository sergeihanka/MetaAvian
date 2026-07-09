/**
 * The rules of a game, enforced server-side.
 *
 * These used to live in the client reducer, which meant a crafted request could
 * award itself free hints or an unlimited guess budget. The client still mirrors
 * the cost table to grey out buttons, but nothing here trusts it.
 */

export const GUESS_LIMIT = 25;

/** Hint index -> cost in guesses. 0=order, 1=family, 2=genus. */
export const HINT_COSTS = [3, 4, 5];
export const HINT_RANKS = ['order', 'family', 'genus'];
export const EXTRA_CLUE_COST = 3;

/** Numeric depth for taxonomy ranks — higher is more specific. */
const RANK_LEVEL = {
  order: 2, suborder: 3, superfamily: 3.5,
  family: 4, subfamily: 5, tribe: 6, subtribe: 6.5,
  genus: 7, subgenus: 7.5, species: 8,
};

/**
 * True when some wrong guess already put this rank (or a deeper one) in the
 * tree. Such a hint is free — the player has already seen the answer's ancestor
 * at that level, so charging for it would bill them twice.
 */
export function isDiscoveredViaGuess(rank, guesses) {
  const threshold = RANK_LEVEL[rank] ?? 0;
  return guesses.some((g) => g.lca && (RANK_LEVEL[g.lca.rank] ?? 0) >= threshold);
}

/** Hints unlock in order; an earlier one counts as met if bought or discovered. */
export function arePrerequisitesMet(hintIndex, purchasedHints, guesses) {
  for (let i = 0; i < hintIndex; i++) {
    if (purchasedHints.includes(i)) continue;
    if (isDiscoveredViaGuess(HINT_RANKS[i], guesses)) continue;
    return false;
  }
  return true;
}

/** Genus gates the extra clues, whether bought outright or exposed by a guess. */
export function isGenusRevealed(session) {
  return (
    session.purchasedHints.includes(2) ||
    isDiscoveredViaGuess('genus', session.guesses)
  );
}

/**
 * Guesses left. Hints and clues are paid for out of the same budget, so the
 * count is derived from what the session records rather than decremented — a
 * decrement can drift, a derivation cannot.
 */
export function guessesRemaining(session) {
  const hintCost = session.purchasedHints.reduce(
    (sum, i) => sum + (HINT_COSTS[i] ?? 0),
    0
  );
  const clueCost = session.extraClues.length * EXTRA_CLUE_COST;
  return GUESS_LIMIT - session.guesses.length - hintCost - clueCost;
}

/** hintNodes is a Mongoose Map; the client wants a plain index-keyed object. */
function hintNodesToObject(hintNodes) {
  if (!hintNodes) return {};
  const entries = hintNodes instanceof Map ? hintNodes.entries() : Object.entries(hintNodes);
  const out = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

/**
 * The session as the client is allowed to see it. Never contains the answer —
 * callers splice that in only once the game is over.
 */
export function serializeSession(session) {
  return {
    phase: session.phase,
    guessLimit: GUESS_LIMIT,
    guessesRemaining: guessesRemaining(session),
    guesses: session.guesses.map((g) => ({
      commonName: g.commonName,
      correct: g.correct,
      feedbackTemperature: g.feedbackTemperature,
      lca: g.lca,
      guessBranch: g.guessBranch,
    })),
    purchasedHints: session.purchasedHints,
    hintNodes: hintNodesToObject(session.hintNodes),
    hintPurchasedAt: session.hintPurchasedAt,
    extraClues: session.extraClues,
  };
}
