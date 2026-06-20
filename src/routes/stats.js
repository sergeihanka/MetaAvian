import { Router } from 'express';
import GameSession from '../models/GameSession.js';
import User from '../models/User.js';
import DailyPuzzle from '../models/DailyPuzzle.js';
import { calcFeatherAward } from '../services/feathers.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

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

// ---------------------------------------------------------------------------
// POST /api/v1/stats/session
// Saves a completed game session and awards feathers + unlocks bird for auth users.
// ---------------------------------------------------------------------------

router.post('/session', optionalAuth, async (req, res) => {
  const { puzzleDate, won, guessCount, durationMs } = req.body;

  if (!puzzleDate || typeof won !== 'boolean' || typeof guessCount !== 'number') {
    return res.status(400).json({ error: 'puzzleDate, won, and guessCount are required.' });
  }

  const session = new GameSession({
    puzzleDate,
    userId: req.user?.id || null,
    won,
    guessCount,
    completedAt: new Date(),
    durationMs: durationMs || null,
  });
  await session.save();

  let featherAward = 0;
  let newBirdUnlocked = false;

  if (won && req.user?.id) {
    const user = await User.findById(req.user.id);
    if (user) {
      const alreadyAwarded = user.featherHistory.some((h) => h.puzzleDate === puzzleDate);
      if (!alreadyAwarded) {
        featherAward = calcFeatherAward(guessCount);
        user.featherBalance += featherAward;
        user.featherLifetime += featherAward;
        user.featherHistory.push({
          date: new Date(),
          amount: featherAward,
          reason: 'puzzle_win',
          puzzleDate,
        });
        if (user.featherHistory.length > 90) {
          user.featherHistory = user.featherHistory.slice(-90);
        }
      }

      const puzzle = await DailyPuzzle.findOne({ dateUtc: puzzleDate });
      if (puzzle?.birdId) {
        const birdIdStr = puzzle.birdId.toString();
        const alreadyOwned = user.aviaryBirds.map((id) => id.toString()).includes(birdIdStr);
        if (!alreadyOwned) {
          user.aviaryBirds.push(puzzle.birdId);
          newBirdUnlocked = true;
        }
      }

      await user.save();
    }
  }

  res.json({ saved: true, featherAward, newBirdUnlocked });
});

export default router;
