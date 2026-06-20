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

// ---------------------------------------------------------------------------
// POST /api/v1/users/me/sync
// Merge client-side stats with server stats (take best values)
// ---------------------------------------------------------------------------

router.post('/me/sync', requireAuth, async (req, res) => {
  const { stats: incoming } = req.body;

  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'stats object is required.' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const existing = user.stats;

  // Merge: take the higher value for each numeric field
  const merged = {
    totalPlayed: Math.max(existing.totalPlayed || 0, incoming.totalPlayed || 0),
    totalWon: Math.max(existing.totalWon || 0, incoming.totalWon || 0),
    currentStreak: Math.max(existing.currentStreak || 0, incoming.currentStreak || 0),
    maxStreak: Math.max(existing.maxStreak || 0, incoming.maxStreak || 0),
    lastPlayedDate: incoming.lastPlayedDate || existing.lastPlayedDate,
  };

  // Merge guess distribution: sum counts for each bucket
  const mergedDistribution = new Map(existing.guessDistribution);
  if (incoming.guessDistribution && typeof incoming.guessDistribution === 'object') {
    const incomingEntries = incoming.guessDistribution instanceof Map
      ? incoming.guessDistribution.entries()
      : Object.entries(incoming.guessDistribution);

    for (const [key, value] of incomingEntries) {
      const existingVal = mergedDistribution.get(key) || 0;
      mergedDistribution.set(key, existingVal + (Number(value) || 0));
    }
  }

  user.stats = { ...merged, guessDistribution: mergedDistribution };
  await user.save();

  res.json({ stats: user.stats });
});

export default router;
