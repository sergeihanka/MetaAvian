import { Router } from 'express';
import NodeCache from 'node-cache';
import Bird from '../models/Bird.js';
import DailyPuzzle from '../models/DailyPuzzle.js';
import GameSession from '../models/GameSession.js';
import TaxonomyNode from '../models/TaxonomyNode.js';
import { computeGuessResult } from '../services/lca.js';
import {
  GUESS_LIMIT,
  HINT_COSTS,
  HINT_RANKS,
  EXTRA_CLUE_COST,
  arePrerequisitesMet,
  isDiscoveredViaGuess,
  isGenusRevealed,
  guessesRemaining,
  serializeSession,
} from '../services/gameRules.js';
import { guessLimiter } from '../middleware/rateLimiter.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { playerIdentity } from '../middleware/playerIdentity.js';
import config from '../config/index.js';

const router = Router();
const cache = new NodeCache();

/** Identify the player on every route below. optionalAuth must precede it. */
const identify = [optionalAuth, playerIdentity];

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

/**
 * Load this player's session for the current puzzle attempt, creating it on
 * first contact. resetCount is part of the identity, so an admin reset leaves
 * the old row untouched for history and starts everyone on a fresh one.
 *
 * A guest who signs in mid-game has their cookie-keyed session adopted onto
 * their account, so logging in never loses progress. The adoption is a
 * conditional update rather than a read-then-write: two tabs racing to adopt
 * the same guest row would otherwise both succeed and duplicate it.
 */
async function loadOrCreateSession(req, puzzle) {
  const puzzleDate = puzzle.dateUtc;
  const resetCount = puzzle.resetCount ?? 0;
  const base = { puzzleDate, resetCount };
  const userId = req.user?.id || null;

  if (userId) {
    const existing = await GameSession.findOne({ ...base, userId });
    if (existing) return existing;

    const adopted = await GameSession.findOneAndUpdate(
      { ...base, guestId: req.guestId, userId: null },
      { $set: { userId, guestId: null } },
      { new: true }
    );
    if (adopted) return adopted;

    return GameSession.create({ ...base, userId, guestId: null });
  }

  const existing = await GameSession.findOne({ ...base, guestId: req.guestId, userId: null });
  if (existing) return existing;
  return GameSession.create({ ...base, guestId: req.guestId, userId: null });
}

/** The answer, revealed only once the game is over. */
function answerPayload(bird) {
  return {
    commonName: bird.commonName,
    scientificName: bird.scientificName,
    order: bird.order,
    family: bird.family,
    ncbiUrl: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${bird.ncbiTaxId}`,
    ancestorPath: bird.ancestorPath,
    ancestorNames: bird.ancestorNames,
    ancestorRanks: bird.ancestorRanks,
  };
}

/** Full client payload: puzzle meta + session, plus the answer iff finished. */
function statePayload(puzzle, session) {
  const finished = session.phase === 'won' || session.phase === 'lost';
  return {
    puzzleDate: puzzle.dateUtc,
    puzzleNumber: puzzle.puzzleNumber,
    resetCount: puzzle.resetCount ?? 0,
    ...serializeSession(session),
    ...(finished ? { answer: answerPayload(puzzle.birdId) } : {}),
  };
}

/** Mark a finished game once, so completedAt reflects the deciding move. */
function finish(session, won) {
  session.phase = won ? 'won' : 'lost';
  session.won = won;
  session.guessCount = session.guesses.length;
  session.completedAt = new Date();
  session.durationMs = session.startedAt
    ? session.completedAt - session.startedAt
    : null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/today
// Puzzle metadata only — no session, no answer. Kept for cheap polling.
// ---------------------------------------------------------------------------

router.get('/today', async (req, res) => {
  const puzzle = await getTodayPuzzle();

  if (!puzzle) {
    return res.status(404).json({ error: 'No puzzle found for today.' });
  }

  res.json({
    puzzleNumber: puzzle.puzzleNumber,
    guessLimit: GUESS_LIMIT,
    date: puzzle.dateUtc,
    resetCount: puzzle.resetCount ?? 0,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/puzzle/state
// Everything needed to render the game: puzzle meta plus this player's session.
// Creates the session (and the guest cookie) on first visit. This is the only
// hydration path — the client persists nothing.
// ---------------------------------------------------------------------------

router.get('/state', identify, async (req, res) => {
  const puzzle = await getTodayPuzzle();
  if (!puzzle) return res.status(404).json({ error: 'No puzzle found for today.' });
  if (!puzzle.birdId) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

  const session = await loadOrCreateSession(req, puzzle);
  res.json(statePayload(puzzle, session));
});

// ---------------------------------------------------------------------------
// POST /api/v1/puzzle/guess
// ---------------------------------------------------------------------------

router.post('/guess', guessLimiter, identify, async (req, res) => {
  const { birdCommonName } = req.body;

  if (!birdCommonName || typeof birdCommonName !== 'string') {
    return res.status(400).json({ error: 'birdCommonName is required.' });
  }

  const puzzle = await getTodayPuzzle();
  if (!puzzle) return res.status(404).json({ error: 'No puzzle found for today.' });

  const answerBird = puzzle.birdId;
  if (!answerBird) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

  const session = await loadOrCreateSession(req, puzzle);

  // The session, not the request, says whether a guess is allowed. A client that
  // has lost cannot keep guessing by simply not telling us.
  if (session.phase !== 'playing') {
    return res.status(409).json({ error: 'This game is already over.', ...statePayload(puzzle, session) });
  }
  if (guessesRemaining(session) <= 0) {
    return res.status(409).json({ error: 'No guesses remaining.', ...statePayload(puzzle, session) });
  }

  const guessBird = await Bird.findOne({
    commonName: { $regex: new RegExp(`^${birdCommonName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: true,
  }).lean();

  if (!guessBird) {
    return res.status(400).json({ error: `Bird not found: "${birdCommonName}".` });
  }

  // Re-guessing a bird would burn a guess for no information; the picker already
  // hides them, so this only fires on a stale tab or a hand-rolled request.
  const already = session.guesses.some(
    (g) => g.commonName.toLowerCase() === guessBird.commonName.toLowerCase()
  );
  if (already) {
    return res.status(409).json({ error: `You already guessed "${guessBird.commonName}".`, ...statePayload(puzzle, session) });
  }

  const correct = guessBird.ncbiTaxId === answerBird.ncbiTaxId;

  if (correct) {
    session.guesses.push({
      birdId: guessBird._id,
      commonName: guessBird.commonName,
      guessNumber: session.guesses.length + 1,
      correct: true,
      feedbackTemperature: 'correct',
      lca: null,
      guessBranch: null,
    });
    finish(session, true);
    await session.save();
    return res.json(statePayload(puzzle, session));
  }

  const lcaResult = computeGuessResult(guessBird, answerBird);

  // Prefer the canonical rank from the taxonomy collection over the one baked
  // into the bird's denormalized ancestorRanks.
  let lcaRank = lcaResult.lcaRank;
  if (lcaResult.lcaTaxId) {
    const taxNode = await TaxonomyNode.findOne({ taxId: lcaResult.lcaTaxId }).lean();
    if (taxNode) lcaRank = taxNode.rank;
  }

  // The child of the branch point that the guess sits under. The answer left
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

  session.guesses.push({
    birdId: guessBird._id,
    commonName: guessBird.commonName,
    guessNumber: session.guesses.length + 1,
    correct: false,
    feedbackTemperature: lcaResult.feedbackTemperature,
    lca: {
      taxId: lcaResult.lcaTaxId,
      name: lcaResult.lcaName,
      rank: lcaRank,
      depth: lcaResult.lcaDepth,
    },
    guessBranch,
  });

  if (guessesRemaining(session) <= 0) finish(session, false);

  await session.save();
  res.json(statePayload(puzzle, session));
});

/**
 * The answer's ancestor at the taxonomy level a hint buys.
 * Level 1 → order, 2 → family, 3 → genus, each with fallbacks for lineages that
 * skip the canonical rank.
 */
function resolveHintNode(bird, level) {
  const { ancestorPath, ancestorNames, ancestorRanks } = bird;

  const primaryRanks = { 1: ['order'], 2: ['family'], 3: ['genus'] };
  const fallbackRanks = {
    1: ['superorder', 'cohort', 'infraclass', 'subclass'],
    2: ['subfamily', 'superfamily', 'infraorder', 'suborder'],
    3: ['subgenus', 'species group'],
  };

  for (const rank of [...primaryRanks[level], ...fallbackRanks[level]]) {
    const i = ancestorRanks.indexOf(rank);
    if (i !== -1) {
      return { taxId: ancestorPath[i], name: ancestorNames[i], rank: ancestorRanks[i], depth: i };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/v1/puzzle/hint  { level: 1|2|3 }
// Charges the hint against the guess budget and records the purchase, then
// returns the revealed node alongside the updated session. The cost is deducted
// here, not by the client — a hint the server never billed for does not exist.
// ---------------------------------------------------------------------------

router.post('/hint', identify, async (req, res) => {
  const level = parseInt(req.body?.level, 10);
  if (![1, 2, 3].includes(level)) {
    return res.status(400).json({ error: 'level must be 1, 2, or 3.' });
  }
  const hintIndex = level - 1;

  const puzzle = await getTodayPuzzle();
  if (!puzzle) return res.status(404).json({ error: 'No puzzle found for today.' });

  const bird = puzzle.birdId;
  if (!bird) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

  const session = await loadOrCreateSession(req, puzzle);

  if (session.phase !== 'playing') {
    return res.status(409).json({ error: 'This game is already over.', ...statePayload(puzzle, session) });
  }
  if (session.purchasedHints.includes(hintIndex)) {
    return res.status(409).json({ error: 'Hint already revealed.', ...statePayload(puzzle, session) });
  }
  if (!arePrerequisitesMet(hintIndex, session.purchasedHints, session.guesses)) {
    return res.status(409).json({ error: 'Reveal the previous hints first.', ...statePayload(puzzle, session) });
  }

  // A rank some guess already exposed is visible in the tree for free, so it is
  // not for sale. Refusing here rather than discounting to zero keeps
  // guessesRemaining derivable: it prices every purchased hint at HINT_COSTS,
  // and a zero-cost entry in purchasedHints would silently be billed the full
  // amount on the next request.
  if (isDiscoveredViaGuess(HINT_RANKS[hintIndex], session.guesses)) {
    return res.status(409).json({ error: 'That rank is already visible in the tree.', ...statePayload(puzzle, session) });
  }

  const cost = HINT_COSTS[hintIndex];
  if (guessesRemaining(session) < cost) {
    return res.status(409).json({ error: `Need ${cost} guesses remaining.`, ...statePayload(puzzle, session) });
  }

  const hintNode = resolveHintNode(bird, level);
  if (!hintNode) {
    return res.status(404).json({ error: `No suitable taxonomy level found for hint ${level}.` });
  }

  session.purchasedHints = [...session.purchasedHints, hintIndex].sort((a, b) => a - b);
  session.hintNodes.set(String(hintIndex), hintNode);
  session.hintPurchasedAt = [...session.hintPurchasedAt, session.guesses.length];

  // Buying a hint can exhaust the budget outright, which ends the game.
  if (guessesRemaining(session) <= 0) finish(session, false);

  await session.save();
  res.json({ level, hint: hintNode, ...statePayload(puzzle, session) });
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
// POST /api/v1/puzzle/extra-clue
// Charges EXTRA_CLUE_COST and appends the next sanitized sentence from the
// answer bird's Wikipedia article. The bird's common and scientific name are
// stripped from the text so no identity information reaches the client.
// Which clue you get is the session's next one — the client cannot pick.
// Gated on genus being revealed, enforced here rather than client-side.
// ---------------------------------------------------------------------------

const WIKI_UA = 'MetaAvian/1.0 (https://metaavian.com)';
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

router.post('/extra-clue', identify, async (req, res) => {
  const puzzle = await getTodayPuzzle();
  if (!puzzle) return res.status(404).json({ error: 'No puzzle found for today.' });

  const bird = puzzle.birdId;
  if (!bird) {
    return res.status(503).json({ error: 'Puzzle bird data unavailable. Please try again shortly.' });
  }

  const session = await loadOrCreateSession(req, puzzle);

  if (session.phase !== 'playing') {
    return res.status(409).json({ error: 'This game is already over.', ...statePayload(puzzle, session) });
  }
  if (!isGenusRevealed(session)) {
    return res.status(409).json({ error: 'Reveal the genus first.', ...statePayload(puzzle, session) });
  }
  if (guessesRemaining(session) < EXTRA_CLUE_COST) {
    return res.status(409).json({ error: `Need ${EXTRA_CLUE_COST} guesses remaining.`, ...statePayload(puzzle, session) });
  }

  const n = session.extraClues.length;
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

  session.extraClues = [...session.extraClues, clues[n]];
  if (guessesRemaining(session) <= 0) finish(session, false);

  await session.save();
  res.json({ clue: clues[n], clueNumber: n + 1, total: clues.length, ...statePayload(puzzle, session) });
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
