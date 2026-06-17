import { Router } from 'express';
import NodeCache from 'node-cache';

const router = Router();
const cache = new NodeCache({ stdTTL: 3600 });

const WIKI_HEADERS = { 'User-Agent': 'MetaAvian/1.0 (https://www.metaavian.com)' };

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

    // Replace thumbnail URL with a server-proxied URL so the client never
    // makes a cross-origin image request (avoids CSP and mixed-content issues).
    if (data.thumbnail?.source) {
      data.thumbnail.source = `/api/v1/wiki/image?url=${encodeURIComponent(data.thumbnail.source)}`;
    }

    cache.set(cacheKey, data);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Wikipedia unavailable' });
  }
});

// GET /api/v1/wiki/image?url=... — image proxy for Wikipedia thumbnails
router.get('/image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Only proxy Wikimedia image URLs
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
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
