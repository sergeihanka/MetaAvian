import { Router } from 'express';
import User from '../models/User.js';
import GameSession from '../models/GameSession.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/users/me/stats
// Aggregate live from gamesessions — always reflects the current state.
// ---------------------------------------------------------------------------

router.get('/me/stats', requireAuth, async (req, res) => {
  const user = await User.exists({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const sessions = await GameSession
    .find({ userId: req.user.id }, { won: 1, guessCount: 1, puzzleDate: 1 })
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
  });
});

// POST /me/sync is gone. It merged client-reported stats into user.stats, which
// only made sense when the browser was the system of record. Stats are now
// aggregated from gamesessions, the server's own writes — see GET /stats/me.

export default router;
