import mongoose from 'mongoose';

/**
 * The authoritative record of one player's attempt at one puzzle.
 *
 * This is the single source of truth for a game in progress — the client holds
 * no durable state. Everything needed to rebuild the phylogenetic tree on any
 * device is stored per guess (its LCA and the branch it ruled out), so the tree
 * is derived, never persisted.
 *
 * Identity is (puzzleDate, resetCount) plus exactly one of userId or guestId.
 * resetCount is part of the key: bumping it on the DailyPuzzle orphans every
 * session for that day, which is how an admin reset gives everyone a fresh game
 * without deleting their history.
 */

const taxonNodeSchema = new mongoose.Schema(
  {
    taxId: Number,
    name: String,
    rank: String,
    depth: Number,
  },
  { _id: false }
);

const guessSchema = new mongoose.Schema(
  {
    birdId: mongoose.Schema.Types.ObjectId,
    commonName: String,
    guessNumber: Number,
    correct: { type: Boolean, default: false },
    feedbackTemperature: String,
    // Where this guess split from the answer.
    lca: taxonNodeSchema,
    // The child of the LCA the guess fell under — the subtree it eliminated.
    // Null when the guess is a sibling species inside the answer's own genus.
    guessBranch: { type: taxonNodeSchema, default: null },
  },
  { _id: false }
);

const gameSessionSchema = new mongoose.Schema({
  puzzleDate: { type: String, required: true }, // YYYY-MM-DD
  resetCount: { type: Number, default: 0 },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestId: { type: String, default: null },

  guesses: [guessSchema],

  // Hint indices bought (0=order, 1=family, 2=genus). Hints can be bought out of
  // order when a guess already exposed a rank, so track which, never how many.
  purchasedHints: [Number],
  // hint index -> revealed taxonomy node
  hintNodes: { type: Map, of: taxonNodeSchema, default: () => new Map() },
  // guesses.length at the moment each hint was bought
  hintPurchasedAt: [Number],
  extraClues: [String],

  phase: { type: String, enum: ['playing', 'won', 'lost'], default: 'playing' },
  won: { type: Boolean, default: false },
  guessCount: { type: Number, default: 0 },

  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  durationMs: Number,
});

// One session per player per puzzle attempt. Partial filters keep the two
// identity kinds from colliding on null: a guest row has userId null, and a
// user row has guestId null, so a plain unique index would reject the second of
// either kind for the same day.
gameSessionSchema.index(
  { puzzleDate: 1, resetCount: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
gameSessionSchema.index(
  { puzzleDate: 1, resetCount: 1, guestId: 1 },
  { unique: true, partialFilterExpression: { guestId: { $type: 'string' } } }
);

const GameSession = mongoose.model('GameSession', gameSessionSchema);
export default GameSession;
