import { Router } from 'express';
import NodeCache from 'node-cache';

const router = Router();
const cache = new NodeCache({ stdTTL: 3600 });

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const cacheKey = `wiki_${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'MetaAvian/1.0 (https://www.metaavian.com)' },
    });
    if (!r.ok) return res.status(404).json({ error: 'not found' });
    const data = await r.json();
    cache.set(cacheKey, data);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Wikipedia unavailable' });
  }
});

export default router;
