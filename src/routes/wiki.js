import { Router } from 'express';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';

const router = Router();
const cache = new NodeCache({ stdTTL: 3600 });

const WIKI_HEADERS = { 'User-Agent': 'MetaAvian/1.0 (https://www.metaavian.com)' };

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allBirds() {
  return mongoose.connection.useDb('aviary').collection('allbirds');
}

// GET /api/v1/wiki?q=term — Wikipedia page summary
router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const cacheKey = `wiki_${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;

  try {
    const r = await fetch(url, { headers: WIKI_HEADERS });
    if (!r.ok) return res.status(404).json({ error: 'not found' });
    const data = await r.json();

    // Proxy thumbnail through server to avoid CSP / mixed-content issues
    if (data.thumbnail?.source) {
      data.thumbnail.source = `/api/v1/wiki/image?url=${encodeURIComponent(data.thumbnail.source)}`;
    }

    cache.set(cacheKey, data);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Wikipedia unavailable' });
  }
});

// GET /api/v1/wiki/related?name=African+Ostrich
// Looks up the bird in aviary.allbirds and returns nearby birds (same genus → family → order).
router.get('/related', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const cacheKey = `related_${name.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const col = allBirds();
  const nameRx = new RegExp(`^${escapeRegex(name)}$`, 'i');
  const bird = await col.findOne({ commonName: nameRx });

  if (!bird) {
    const empty = { related: [] };
    cache.set(cacheKey, empty);
    return res.json(empty);
  }

  // Try most-specific taxonomy first, widen if too few results
  const levels = [
    { field: 'genus',  value: bird.genus,  label: bird.genus },
    { field: 'family', value: bird.family, label: bird.family },
    { field: 'order',  value: bird.order,  label: bird.order },
  ].filter(l => l.value);

  let related = [];
  let matchedOn = null;
  let groupName = null;

  for (const level of levels) {
    const hits = await col
      .find(
        { [level.field]: level.value, commonName: { $not: nameRx } },
        { projection: { commonName: 1, _id: 0 } }
      )
      .limit(8)
      .toArray();

    if (hits.length > 0) {
      related = hits;
      matchedOn = level.field;
      groupName = level.label;
      break;
    }
  }

  const result = {
    related: related.map(b => ({ commonName: b.commonName })),
    matchedOn,
    groupName,
  };

  cache.set(cacheKey, result);
  res.json(result);
});

// GET /api/v1/wiki/image?url=... — image proxy for Wikipedia thumbnails
router.get('/image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });

  let parsed;
  try { parsed = new URL(url); } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  if (!parsed.hostname.endsWith('wikimedia.org') && !parsed.hostname.endsWith('wikipedia.org')) {
    return res.status(403).json({ error: 'only wikimedia URLs allowed' });
  }

  const cacheKey = `img_${url}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  try {
    const r = await fetch(url, { headers: WIKI_HEADERS });
    if (!r.ok) return res.status(r.status).end();

    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await r.arrayBuffer());

    cache.set(cacheKey, { contentType, buffer });
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch {
    res.status(502).end();
  }
});

export default router;
