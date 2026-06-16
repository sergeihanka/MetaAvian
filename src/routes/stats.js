import { Router } from 'express';
import GameSession from '../models/GameSession.js';

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
    winRate: Math.round(winRate * 1000) / 1000, // 3 decimal places
    avgGuessCount: avgGuessCount !== null ? Math.round(avgGuessCount * 100) / 100 : null,
  });
});

export default router;
