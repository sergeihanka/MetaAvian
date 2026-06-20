import { Router } from 'express';
import GameSession from '../models/GameSession.js';
import User from '../models/User.js';
import DailyPuzzle from '../models/DailyPuzzle.js';
import { calcFeatherAward } from '../services/feathers.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/stats/session
// Persist a completed game to aviary.gamesessions. Idempotent per
// (puzzleDate + user) for logged-in players, or (puzzleDate + guestId) for
// guests, so replays/reloads update rather than duplicate. The write is
// read-back verified before responding.
// ---------------------------------------------------------------------------

router.post('/session', optionalAuth, async (req, res) => {
  const { puzzleDate, won, guessCount, durationMs, guesses, guestId } = req.body;

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
  };

  const session = await GameSession.findOneAndUpdate(
    filter,
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Read-back verification: confirm the document actually persisted
  const verified = await GameSession.exists({ _id: session._id });

  // Award feathers + unlock bird for authenticated users on win
  let featherAward = 0;
  let newBirdUnlocked = false;

  if (won && userId) {
    const user = await User.findById(userId);
    if (user) {
      const alreadyAwarded = user.featherHistory.some((h) => h.puzzleDate === puzzleDate);
      if (!alreadyAwarded) {
        featherAward = calcFeatherAward(Number(guessCount) || normalizedGuesses.length);
        user.featherBalance += featherAward;
        user.featherLifetime += featherAward;
        user.featherHistory.push({ date: new Date(), amount: featherAward, reason: 'puzzle_win', puzzleDate });
        if (user.featherHistory.length > 90) {
          user.featherHistory = user.featherHistory.slice(-90);
        }
      }

      const puzzle = await DailyPuzzle.findOne({ dateUtc: puzzleDate });
      if (puzzle?.birdId) {
        const alreadyOwned = user.aviaryBirds.map((id) => id.toString()).includes(puzzle.birdId.toString());
        if (!alreadyOwned) {
          user.aviaryBirds.push(puzzle.birdId);
          newBirdUnlocked = true;
        }
      }

      await user.save();
    }
  }

  res.json({
    saved: !!verified,
    verified: !!verified,
    sessionId: session._id,
    persistedFor: userId ? 'user' : 'guest',
    userId: session.userId,
    featherAward,
    newBirdUnlocked,
  });
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
    winRate: Math.round(winRate * 1000) / 1000,
    avgGuessCount: avgGuessCount !== null ? Math.round(avgGuessCount * 100) / 100 : null,
  });
});

export default router;
