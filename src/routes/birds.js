import { Router } from 'express';
import NodeCache from 'node-cache';
import Bird from '../models/Bird.js';
import { searchLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const cache = new NodeCache();

// ---------------------------------------------------------------------------
// GET /api/v1/birds
// Full list of active bird common names (for client-side caching)
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  const CACHE_KEY = 'bird_list';
  const cached = cache.get(CACHE_KEY);

  if (cached) {
    return res.json({ birds: cached });
  }

  const birds = await Bird.find(
    { isActive: true },
    { commonName: 1, commonNameAliases: 1, _id: 0 }
  ).lean();

  const result = birds.map((b) => ({
    commonName: b.commonName,
    aliases: b.commonNameAliases || [],
  }));

  cache.set(CACHE_KEY, result, 3600); // TTL: 1 hour

  res.json({ birds: result });
});

// ---------------------------------------------------------------------------
// GET /api/v1/birds/search?q=
// Text search across common names and aliases
// ---------------------------------------------------------------------------

router.get('/search', searchLimiter, async (req, res) => {
  const q = (req.query.q || '').trim();

  if (q.length < 2) {
    return res.json({ results: [] });
  }

  const results = await Bird.find(
    { $text: { $search: q }, isActive: true },
    { score: { $meta: 'textScore' }, commonName: 1, _id: 0 }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(10)
    .lean();

  res.json({ results: results.map((b) => b.commonName) });
});

export default router;
