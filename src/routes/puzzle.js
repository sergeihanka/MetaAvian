import { Router } from 'express';
import NodeCache from 'node-cache';
import Bird from '../models/Bird.js';
import DailyPuzzle from '../models/DailyPuzzle.js';
import TaxonomyNode from '../models/TaxonomyNode.js';
import { computeGuessResult } from '../services/lca.js';
import { guessLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const cache = new NodeCache();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date in YYYY-MM-DD format (UTC). */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** Seconds remaining until next midnight UTC. */
function secondsUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return Math.floor((midnight - now) / 1000);
}

/**
 * Fetch today's DailyPuzzle (with Bird populated), using cache.
 * Returns null if no puzzle is configured for today.
 */
async function getTodayPuzzle() {
  const dateStr = todayUtc();
  const cacheKey = `puzzle_${dateStr}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const puzzle = await DailyPuzzle.findOne({ dateUtc: dateStr, isActive: true })
    .populate('birdId')
    .lean();

  if (!puzzle) return null;

  const ttl = secondsUntilMidnightUtc();
  cache.set(cacheKey, puzzle, ttl);

  return puzzle;
}

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/today
// Returns puzzle metadata — never the answer bird
// ---------------------------------------------------------------------------

router.get('/today', async (req, res) => {
  const puzzle = await getTodayPuzzle();

  if (!puzzle) {
    return res.status(404).json({ error: 'No puzzle found for today.' });
  }

  res.json({
    puzzleNumber: puzzle.puzzleNumber,
    guessLimit: 20,
    date: puzzle.dateUtc,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/puzzle/guess
// ---------------------------------------------------------------------------

router.post('/guess', guessLimiter, async (req, res) => {
  const { puzzleDate, birdCommonName, guessNumber } = req.body;
  const today = todayUtc();

  // 1. Validate puzzleDate
  if (!puzzleDate || puzzleDate !== today) {
    return res.status(400).json({
      error: `puzzleDate must be today's UTC date (${today}).`,
    });
  }

  // 2. Find the guess bird (case-insensitive)
  if (!birdCommonName || typeof birdCommonName !== 'string') {
    return res.status(400).json({ error: 'birdCommonName is required.' });
  }

  const guessBird = await Bird.findOne({
    commonName: { $regex: new RegExp(`^${birdCommonName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: true,
  }).lean();

  if (!guessBird) {
    return res.status(400).json({ error: `Bird not found: "${birdCommonName}".` });
  }

  // 3. Get today's puzzle
  const puzzle = await getTodayPuzzle();
  if (!puzzle) {
    return res.status(404).json({ error: 'No puzzle found for today.' });
  }

  // 4. Get the answer bird (already populated by getTodayPuzzle)
  const answerBird = puzzle.birdId;

  // 5. Correct guess?
  if (guessBird.ncbiTaxId === answerBird.ncbiTaxId) {
    return res.json({
      correct: true,
      guessNumber: guessNumber ?? null,
      guess: {
        commonName: guessBird.commonName,
        scientificName: guessBird.scientificName,
        ncbiTaxId: guessBird.ncbiTaxId,
      },
      answer: {
        commonName: answerBird.commonName,
        scientificName: answerBird.scientificName,
        order: answerBird.order,
        family: answerBird.family,
        ncbiUrl: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${answerBird.ncbiTaxId}`,
      },
    });
  }

  // 6. Compute LCA
  const lcaResult = computeGuessResult(guessBird, answerBird);

  // 7. Look up LCA rank from TaxonomyNode
  let lcaRank = lcaResult.lcaRank;
  if (lcaResult.lcaTaxId) {
    const taxNode = await TaxonomyNode.findOne({ taxId: lcaResult.lcaTaxId }).lean();
    if (taxNode) {
      lcaRank = taxNode.rank;
    }
  }

  // 8. Return wrong-guess response (never include answer bird identity)
  res.json({
    correct: false,
    guessNumber: guessNumber ?? null,
    guess: {
      commonName: guessBird.commonName,
      scientificName: guessBird.scientificName,
      ncbiTaxId: guessBird.ncbiTaxId,
    },
    lca: {
      taxId: lcaResult.lcaTaxId,
      name: lcaResult.lcaName,
      rank: lcaRank,
      depth: lcaResult.lcaDepth,
    },
    feedbackTemperature: lcaResult.feedbackTemperature,
    ancestorPath: lcaResult.ancestorPath,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/result?date=YYYY-MM-DD
// Reveal the answer — only for past puzzles
// ---------------------------------------------------------------------------

router.get('/result', async (req, res) => {
  const { date } = req.query;
  const today = todayUtc();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date parameter (YYYY-MM-DD) is required.' });
  }

  if (date >= today) {
    return res.status(403).json({
      error: 'Results not available for today or future puzzles.',
    });
  }

  const puzzle = await DailyPuzzle.findOne({ dateUtc: date })
    .populate('birdId')
    .lean();

  if (!puzzle || !puzzle.birdId) {
    return res.status(404).json({ error: `No puzzle found for date: ${date}.` });
  }

  const bird = puzzle.birdId;

  res.json({
    puzzleNumber: puzzle.puzzleNumber,
    answer: {
      commonName: bird.commonName,
      scientificName: bird.scientificName,
      order: bird.order,
      family: bird.family,
      ancestorPath: bird.ancestorPath,
      ancestorNames: bird.ancestorNames,
      ancestorRanks: bird.ancestorRanks,
    },
  });
});

export default router;
