import { Router } from 'express';
import GameSession from '../models/GameSession.js';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js';

/** Hour (Central Time) at which each new puzzle releases. Must match puzzle.js. */
const RESET_HOUR_CENTRAL = 8;

const dateHourDtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

/** Current puzzle date (YYYY-MM-DD). Mirrors getPuzzleDate() in puzzle.js. */
function getPuzzleDate() {
  const p = Object.fromEntries(dateHourDtf.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = parseInt(p.hour, 10) % 24;
  let ms = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  if (hour < RESET_HOUR_CENTRAL) ms -= 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/stats/session
// Persist a completed game to aviary.gamesessions. Idempotent per
// (puzzleDate + user) for logged-in players, or (puzzleDate + guestId) for
// guests, so replays/reloads update rather than duplicate. The write is
// read-back verified before responding.
// ---------------------------------------------------------------------------

router.post('/session', optionalAuth, async (req, res) => {
  const { puzzleDate, won, guessCount, durationMs, guesses, guestId, gameState } = req.body;

  if (!puzzleDate || !/^\d{4}-\d{2}-\d{2}$/.test(puzzleDate)) {
    return res.status(400).json({ error: 'A valid puzzleDate (YYYY-MM-DD) is required.' });
  }

  const userId = req.user?.id || null;
  if (!userId && !guestId) {
    return res.status(400).json({ error: 'guestId is required for anonymous sessions.' });
  }

  const filter = userId ? { puzzleDate, userId } : { puzzleDate, guestId };

  const normalizedGuesses = Array.isArray(guesses)
    ? guesses.slice(0, 30).map((g, i) => ({
        commonName: g.commonName || '',
        lcaTaxId: g.lcaTaxId ?? g.lca?.taxId ?? null,
        lcaName: g.lcaName ?? g.lca?.name ?? null,
        guessNumber: g.guessNumber ?? i + 1,
      }))
    : [];

  const update = {
    puzzleDate,
    userId,
    guestId: userId ? null : guestId,
    won: !!won,
    guessCount: Number(guessCount) || normalizedGuesses.length,
    guesses: normalizedGuesses,
    completedAt: new Date(),
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    ...(gameState && typeof gameState === 'object' ? { gameState } : {}),
  };

  const session = await GameSession.findOneAndUpdate(
    filter,
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Read-back verification: confirm the document actually persisted
  const verified = await GameSession.exists({ _id: session._id });

  res.json({
    saved: !!verified,
    verified: !!verified,
    sessionId: session._id,
    persistedFor: userId ? 'user' : 'guest',
    userId: session.userId,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/stats/session/today
// Returns the authenticated user's session for today's puzzle, including the
// full gameState blob so any device can restore a completed game. TTL is
// implicit: "today" is recomputed on every request using the same 8 AM Central
// rollover logic used by the puzzle engine.
// ---------------------------------------------------------------------------

router.get('/session/today', requireAuth, async (req, res) => {
  const today = getPuzzleDate();
  const session = await GameSession.findOne(
    { puzzleDate: today, userId: req.user.id },
    { gameState: 1, won: 1, guessCount: 1, puzzleDate: 1 }
  ).lean();

  if (!session) return res.json({ session: null });
  res.json({ session });
});

// ---------------------------------------------------------------------------
// GET /api/v1/stats/global?date=YYYY-MM-DD
// ---------------------------------------------------------------------------

router.get('/global', async (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date parameter (YYYY-MM-DD) is required.' });
  }

  const results = await GameSession.aggregate([
    { $match: { puzzleDate: date, completedAt: { $exists: true } } },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        winCount: { $sum: { $cond: ['$won', 1, 0] } },
        totalGuessesOnWins: {
          $sum: { $cond: ['$won', '$guessCount', 0] },
        },
      },
    },
  ]);

  if (!results.length) {
    return res.json({
      date,
      totalPlays: 0,
      winRate: 0,
      avgGuessCount: null,
    });
  }

  const { totalPlays, winCount, totalGuessesOnWins } = results[0];
  const winRate = totalPlays > 0 ? winCount / totalPlays : 0;
  const avgGuessCount = winCount > 0 ? totalGuessesOnWins / winCount : null;

  res.json({
    date,
    totalPlays,
    winRate: Math.round(winRate * 1000) / 1000, // 3 decimal places
    avgGuessCount: avgGuessCount !== null ? Math.round(avgGuessCount * 100) / 100 : null,
  });
});

export default router;
