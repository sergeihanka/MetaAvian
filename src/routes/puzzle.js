import { Router } from 'express';
import NodeCache from 'node-cache';
import Bird from '../models/Bird.js';
import DailyPuzzle from '../models/DailyPuzzle.js';
import TaxonomyNode from '../models/TaxonomyNode.js';
import { computeGuessResult } from '../services/lca.js';
import { guessLimiter } from '../middleware/rateLimiter.js';
import config from '../config/index.js';

const router = Router();
const cache = new NodeCache();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current "puzzle date" as YYYY-MM-DD.
 * The puzzle day starts at 9:00 AM Central Time (America/Chicago).
 * Shifting back 9 hours and reading the Central date gives a date that
 * flips exactly at 9 AM Central, handling DST automatically.
 */
function getPuzzleDate() {
  const shifted = new Date(Date.now() - 9 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(shifted);
}

/** Seconds remaining until the next puzzle releases (9:00 AM Central Time). */
function secondsUntilNextPuzzle() {
  const now = new Date();
  const hourDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    hour12: false,
  });
  const dateDtf = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' });

  const centralHour =
    parseInt(Object.fromEntries(hourDtf.formatToParts(now).map(p => [p.type, p.value])).hour, 10) % 24;

  const targetDateStr =
    centralHour < 9
      ? dateDtf.format(now)
      : dateDtf.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const [ty, tm, td] = targetDateStr.split('-').map(Number);

  // Try CDT (UTC−5 → 9 AM = 14:00 UTC) then CST (UTC−6 → 9 AM = 15:00 UTC)
  for (const utcHour of [14, 15]) {
    const candidate = new Date(Date.UTC(ty, tm - 1, td, utcHour, 0, 0, 0));
    const cHour =
      parseInt(Object.fromEntries(hourDtf.formatToParts(candidate).map(p => [p.type, p.value])).hour, 10) % 24;
    if (cHour === 9) return Math.max(0, Math.floor((candidate - now) / 1000));
  }

  return Math.max(0, Math.floor((new Date(Date.UTC(ty, tm - 1, td, 15, 0, 0)) - now) / 1000));
}

/**
 * Fetch today's DailyPuzzle (with Bird populated), using cache.
 * Returns null if no puzzle is configured for today.
 */
async function getTodayPuzzle() {
  const dateStr = getPuzzleDate();

  // First pass: find the puzzle to get its resetCount for the cache key
  const puzzle = await DailyPuzzle.findOne({ dateUtc: dateStr, isActive: true })
    .populate('birdId')
    .lean();

  if (!puzzle) return null;

  const resetCount = puzzle.resetCount ?? 0;
  const cacheKey = `puzzle_${dateStr}_r${resetCount}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const ttl = secondsUntilNextPuzzle();
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
    guessLimit: 25,
    date: puzzle.dateUtc,
    resetCount: puzzle.resetCount ?? 0,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/puzzle/guess
// ---------------------------------------------------------------------------

router.post('/guess', guessLimiter, async (req, res) => {
  const { puzzleDate, birdCommonName, guessNumber } = req.body;
  const today = getPuzzleDate();

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

  // Build intermediate ancestor nodes: all taxonomy stops between LCA and the
  // guess species (exclusive of LCA, exclusive of the species leaf itself).
  // These let the client draw the full path from LCA → genus → species in the tree.
  const ancestorNodes = [];
  for (let i = lcaResult.lcaDepth + 1; i < guessBird.ancestorPath.length; i++) {
    if (guessBird.ancestorRanks[i] === 'species') continue;
    ancestorNodes.push({
      taxId: guessBird.ancestorPath[i],
      name: guessBird.ancestorNames[i],
      rank: guessBird.ancestorRanks[i],
      depth: i,
    });
  }

  // The immediate child of the LCA on the ANSWER bird's side.
  // Reveals which branch the answer takes from the LCA ("family B, not family A"),
  // giving players a directional clue without revealing the species.
  let answerNextNode = null;
  const answerNextIdx = lcaResult.lcaDepth + 1;
  if (
    answerNextIdx < answerBird.ancestorPath.length &&
    answerBird.ancestorRanks[answerNextIdx] !== 'species'
  ) {
    answerNextNode = {
      taxId: answerBird.ancestorPath[answerNextIdx],
      name: answerBird.ancestorNames[answerNextIdx],
      rank: answerBird.ancestorRanks[answerNextIdx],
      depth: answerNextIdx,
    };
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
    ancestorNodes,
    answerNextNode,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/hint?level=1|2|3
// Returns one ancestry node of today's answer at the requested taxonomy level.
// Level 1 → order, Level 2 → family, Level 3 → genus
// The client is responsible for deducting the guess cost.
// ---------------------------------------------------------------------------

router.get('/hint', async (req, res) => {
  const level = parseInt(req.query.level, 10);
  if (![1, 2, 3].includes(level)) {
    return res.status(400).json({ error: 'level must be 1, 2, or 3.' });
  }

  const puzzle = await getTodayPuzzle();
  if (!puzzle) {
    return res.status(404).json({ error: 'No puzzle found for today.' });
  }

  const bird = puzzle.birdId;
  const { ancestorPath, ancestorNames, ancestorRanks } = bird;

  const primaryRanks = { 1: ['order'], 2: ['family'], 3: ['genus'] };
  const fallbackRanks = {
    1: ['superorder', 'cohort', 'infraclass', 'subclass'],
    2: ['subfamily', 'superfamily', 'infraorder', 'suborder'],
    3: ['subgenus', 'species group'],
  };

  let hintNode = null;
  for (const rank of [...primaryRanks[level], ...fallbackRanks[level]]) {
    const i = ancestorRanks.indexOf(rank);
    if (i !== -1) {
      hintNode = {
        taxId: ancestorPath[i],
        name: ancestorNames[i],
        rank: ancestorRanks[i],
        depth: i,
      };
      break;
    }
  }

  if (!hintNode) {
    return res.status(404).json({ error: `No suitable taxonomy level found for hint ${level}.` });
  }

  res.json({ level, hint: hintNode });
});

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/result?date=YYYY-MM-DD
// Reveal the answer — only for past puzzles
// ---------------------------------------------------------------------------

router.get('/result', async (req, res) => {
  const { date } = req.query;
  const today = getPuzzleDate();

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

// ---------------------------------------------------------------------------
// POST /api/v1/puzzle/reset-today
// Increments resetCount so all clients treat today as a fresh puzzle.
// Requires Authorization: Bearer <ADMIN_SECRET>
// ---------------------------------------------------------------------------

router.post('/reset-today', async (req, res) => {
  const secret = config.adminSecret;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const dateStr = getPuzzleDate();

  const puzzle = await DailyPuzzle.findOneAndUpdate(
    { dateUtc: dateStr },
    { $inc: { resetCount: 1 } },
    { new: true }
  );

  if (!puzzle) {
    return res.status(404).json({ error: `No puzzle found for ${dateStr}.` });
  }

  // Bust every cached entry for today regardless of previous resetCount
  cache.keys().forEach((k) => {
    if (k.startsWith(`puzzle_${dateStr}`)) cache.del(k);
  });

  res.json({
    message: `Puzzle for ${dateStr} reset. resetCount is now ${puzzle.resetCount}.`,
    date: dateStr,
    resetCount: puzzle.resetCount,
  });
});

export default router;
