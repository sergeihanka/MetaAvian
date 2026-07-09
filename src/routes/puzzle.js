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

/** Hour (Central Time) at which each new puzzle releases. */
const RESET_HOUR_CENTRAL = 8;

// Candidate UTC hours for RESET_HOUR_CENTRAL: CDT is UTC−5, CST is UTC−6. We try
// both and keep whichever actually reads back as the reset hour in Chicago, so
// DST is handled without hardcoding which offset is in effect.
const RESET_UTC_HOURS = [RESET_HOUR_CENTRAL + 5, RESET_HOUR_CENTRAL + 6];

const dateHourDtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

/**
 * Returns the current "puzzle date" as YYYY-MM-DD.
 * The puzzle day starts at RESET_HOUR_CENTRAL (America/Chicago).
 *
 * Read the Central wall clock and step back one calendar day when we are before
 * the reset hour. Do NOT instead subtract RESET_HOUR_CENTRAL hours from the
 * instant: on DST transition days that window spans the 2 AM jump, so the date
 * would flip an hour late in spring and an hour early in autumn — drifting out
 * of step with the countdown, which targets the true reset instant.
 */
function getPuzzleDate() {
  const p = Object.fromEntries(dateHourDtf.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = parseInt(p.hour, 10) % 24;
  let ms = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  if (hour < RESET_HOUR_CENTRAL) ms -= 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Seconds remaining until the next puzzle releases. */
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
    centralHour < RESET_HOUR_CENTRAL
      ? dateDtf.format(now)
      : dateDtf.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const [ty, tm, td] = targetDateStr.split('-').map(Number);

  for (const utcHour of RESET_UTC_HOURS) {
    const candidate = new Date(Date.UTC(ty, tm - 1, td, utcHour, 0, 0, 0));
    const cHour =
      parseInt(Object.fromEntries(hourDtf.formatToParts(candidate).map(p => [p.type, p.value])).hour, 10) % 24;
    if (cHour === RESET_HOUR_CENTRAL) return Math.max(0, Math.floor((candidate - now) / 1000));
  }

  const fallback = new Date(Date.UTC(ty, tm - 1, td, RESET_UTC_HOURS[1], 0, 0));
  return Math.max(0, Math.floor((fallback - now) / 1000));
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
        ancestorPath: answerBird.ancestorPath,
        ancestorNames: answerBird.ancestorNames,
        ancestorRanks: answerBird.ancestorRanks,
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

  // 8. The child of the branch point that the guess sits under. The answer left
  // the LCA by a different child, so this entire subtree is eliminated — which
  // makes it the deepest node the guess actually proves anything about. The
  // guess's genus lies inside it and therefore adds nothing: ruling out Dromaius
  // when Palaeognathae as a whole is dead tells the player less, not more.
  // Its rank floats with how close the guess landed — superorder for a cold
  // guess, genus for one in the answer's own family. Omitted when the next node
  // is the species itself (a sibling of the answer within one genus), where the
  // leaf hangs straight off the LCA.
  // This describes the guess only; it leaks nothing about the answer.
  const branchIndex = lcaResult.lcaDepth + 1;
  const guessBranch =
    branchIndex < guessBird.ancestorPath.length &&
    guessBird.ancestorRanks[branchIndex] !== 'species'
      ? {
          taxId: guessBird.ancestorPath[branchIndex],
          name: guessBird.ancestorNames[branchIndex],
          rank: guessBird.ancestorRanks[branchIndex],
        }
      : null;

  // 9. Return wrong-guess response (never include answer bird identity).
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
    guessBranch,
    feedbackTemperature: lcaResult.feedbackTemperature,
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
  if (!bird) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

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
// GET /api/v1/puzzle/extra-clue?n=0
// Returns a sanitized sentence from the answer bird's Wikipedia article.
// The bird's common and scientific name are stripped from the text so no
// identity information reaches the client. Available after genus is revealed
// (enforced client-side; server only validates puzzle exists).
// ---------------------------------------------------------------------------

const WIKI_UA = 'MetaAvian/1.0 (https://metaavian.com)';
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

router.get('/extra-clue', async (req, res) => {
  const n = Math.max(0, parseInt(req.query.n || '0', 10));

  const puzzle = await getTodayPuzzle();
  if (!puzzle) return res.status(404).json({ error: 'No puzzle found for today.' });

  const bird = puzzle.birdId;
  if (!bird) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

  const cacheKey = `extra_clues_${bird.ncbiTaxId}`;

  let clues = cache.get(cacheKey);
  if (!clues) {
    try {
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bird.commonName)}`,
        { headers: { 'User-Agent': WIKI_UA } }
      );
      if (!wikiRes.ok) return res.status(404).json({ error: 'No extra clues available.' });

      const { extract = '' } = await wikiRes.json();

      // Strip the bird's names so the client learns nothing about its identity
      const nameRx = new RegExp(
        `\\b(${escapeRe(bird.commonName)}|${escapeRe(bird.scientificName)})\\b`,
        'gi'
      );
      clues = (extract.match(/[^.!?]+[.!?]+\s*/g) || [])
        .map(s => s.replace(nameRx, 'this bird').trim())
        .filter(s => s.length >= 20);

      cache.set(cacheKey, clues, 12 * 60 * 60);
    } catch {
      return res.status(502).json({ error: 'Could not fetch clues right now.' });
    }
  }

  if (!clues.length || n >= clues.length) {
    return res.status(404).json({ error: 'No more clues available.' });
  }

  res.json({ clue: clues[n], clueNumber: n + 1, total: clues.length });
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
