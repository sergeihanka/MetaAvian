import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/users/me/stats
// ---------------------------------------------------------------------------

router.get('/me/stats', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id, { stats: 1 }).lean();
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ stats: user.stats });
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
