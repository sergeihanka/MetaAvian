import { Router } from 'express';
import GameSession from '../models/GameSession.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { playerIdentity } from '../middleware/playerIdentity.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/stats/me
// Lifetime stats for whoever is calling — a logged-in user keyed by userId, or a
// guest keyed by their signed cookie. Aggregated live from gamesessions, which
// is now the only record of a game, so this is correct on every device rather
// than reflecting whatever one browser happened to keep.
// ---------------------------------------------------------------------------

router.get('/me', optionalAuth, playerIdentity, async (req, res) => {
  const sessions = await GameSession
    .find(
      { ...req.playerFilter, completedAt: { $exists: true } },
      { won: 1, guessCount: 1, puzzleDate: 1 }
    )
    .lean()
    .sort({ puzzleDate: 1 });

  let played = 0, won = 0, streakCount = 0, maxStreak = 0;
  const distribution = {};
  let lastDate = null;

  for (const s of sessions) {
    played++;
    if (s.won) {
      won++;
      const bucket = String(s.guessCount || 0);
      distribution[bucket] = (distribution[bucket] || 0) + 1;
      if (lastDate) {
        const diff = (new Date(s.puzzleDate) - new Date(lastDate)) / 86400000;
        streakCount = diff === 1 ? streakCount + 1 : 1;
      } else {
        streakCount = 1;
      }
      lastDate = s.puzzleDate;
    } else {
      distribution['X'] = (distribution['X'] || 0) + 1;
      streakCount = 0;
      lastDate = null;
    }
    maxStreak = Math.max(maxStreak, streakCount);
  }

  res.json({
    played,
    won,
    winRate: played > 0 ? Math.round((won / played) * 100) : 0,
    currentStreak: streakCount,
    maxStreak,
    distribution,
    isGuest: !req.user?.id,
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
    winRate: Math.round(winRate * 1000) / 1000, // 3 decimal places
    avgGuessCount: avgGuessCount !== null ? Math.round(avgGuessCount * 100) / 100 : null,
  });
});

export default router;
