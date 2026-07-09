import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { TOKEN_KEY, GUESS_LIMIT, RESET_HOUR_CENTRAL } from '../config.js';

// ────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

const dateHourDtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

/**
 * Current puzzle date (YYYY-MM-DD). Must match getPuzzleDate() on the server —
 * the guess endpoint rejects any other date. Step back a calendar day before the
 * reset hour rather than subtracting hours from the instant, which would drift
 * by an hour on DST transition days.
 */
function getPuzzleDate() {
  const p = Object.fromEntries(dateHourDtf.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = parseInt(p.hour, 10) % 24;
  let ms = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  if (hour < RESET_HOUR_CENTRAL) ms -= 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// NCBI Aves root
const AVES_ROOT = { taxId: 8782, name: 'Aves', rank: 'class', depth: 0 };

// ────────────────────────────────────────────────────────────
//  Tree helpers
// ────────────────────────────────────────────────────────────

/**
 * An LCA (where a wrong guess branched away from the mystery bird) or a
 * purchased hint always sits on the mystery bird's own lineage, so together they
 * form a single chain ordered by depth: the "spine". The mystery hangs off the
 * deepest spine node we know about.
 *
 * Everything else — guess leaves and the eliminated branches they fall in — hangs
 * off the spine at the point it diverged, recorded on the node as parentId. An
 * eliminated branch is NOT on the mystery's lineage, so it must never join the
 * spine or it would drag the mystery node down a dead-end branch.
 *
 * Edges are derived from the node set rather than accumulated, so the tree stays
 * correct no matter what order guesses and hints arrive in.
 */
function finalizeTree(nodes) {
  const spine = Array.from(nodes.values())
    .filter((n) => (n.isLca || n.isHint) && n.taxId !== AVES_ROOT.taxId)
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

  const edges = [];
  let deepestId = AVES_ROOT.taxId;
  let deepestDepth = AVES_ROOT.depth;
  for (const n of spine) {
    edges.push({ parentId: deepestId, childId: n.taxId });
    deepestId = n.taxId;
    deepestDepth = n.depth ?? deepestDepth;
  }

  for (const n of nodes.values()) {
    if (n.isMystery || n.parentLcaTaxId == null) continue;
    edges.push({ parentId: n.parentLcaTaxId, childId: n.taxId });
  }

  const mystery = nodes.get('mystery') || {
    taxId: 'mystery',
    name: '?',
    commonName: 'Mystery Bird',
    rank: 'species',
    isLeaf: true,
    isMystery: true,
  };
  nodes.set('mystery', { ...mystery, depth: deepestDepth + 1, parentLcaTaxId: deepestId });
  edges.push({ parentId: deepestId, childId: 'mystery' });

  return { treeNodes: nodes, treeEdges: edges };
}

/**
 * Build the updated tree from a normalized guess.
 *
 * A wrong guess contributes exactly two things: the guessed bird's leaf, and the
 * node where it branches away from the mystery bird (the LCA). Nothing else —
 * no intermediate ancestry of the wrong guess.
 *
 * Normalized guess shape:
 *   { commonName, feedbackTemperature, lca: { taxId, name, rank, depth }, correct, answer }
 */
function buildTreeUpdate(prevNodes, normalizedGuess) {
  const nodes = new Map(prevNodes);

  if (!nodes.has(AVES_ROOT.taxId)) {
    nodes.set(AVES_ROOT.taxId, { ...AVES_ROOT });
  }

  // Correct guess — reveal the answer's full lineage, then the answer itself
  if (normalizedGuess.correct) {
    const { answer } = normalizedGuess;
    const ancestorPath  = answer?.ancestorPath  || [];
    const ancestorNames = answer?.ancestorNames || [];
    const ancestorRanks = answer?.ancestorRanks || [];
    const revealedName  = answer?.commonName || normalizedGuess.commonName;

    for (let i = 1; i < ancestorPath.length; i++) {
      if (ancestorRanks[i] === 'species') break; // the species leaf IS the mystery node
      const taxId = ancestorPath[i];
      const existing = nodes.get(taxId) || {}; // preserve isHint on already-revealed nodes
      nodes.set(taxId, {
        ...existing,
        taxId,
        name: ancestorNames[i],
        rank: ancestorRanks[i],
        depth: i,
        isLca: true,
      });
    }

    const existingMystery = nodes.get('mystery') || {};
    nodes.set('mystery', {
      ...existingMystery,
      taxId: 'mystery',
      name: revealedName,
      commonName: revealedName,
      rank: 'species',
      feedbackTemperature: 'correct',
      isRevealed: true,
      isMystery: true,
      isLeaf: true,
    });

    return finalizeTree(nodes);
  }

  const { lca, guessBranch, feedbackTemperature, commonName } = normalizedGuess;
  const lcaTaxId = lca?.taxId;
  const lcaDepth = lca?.depth ?? AVES_ROOT.depth;

  // The branch-away point. If it is the Aves root the guess shares nothing else
  // with the answer, so the leaf hangs straight off the root.
  let branchId = AVES_ROOT.taxId;
  let branchDepth = AVES_ROOT.depth;
  if (lcaTaxId && lcaTaxId !== AVES_ROOT.taxId) {
    const existing = nodes.get(lcaTaxId) || {};
    nodes.set(lcaTaxId, {
      ...existing,
      taxId: lcaTaxId,
      name: lca.name,
      rank: lca.rank,
      depth: lcaDepth,
      isLca: true,
    });
    branchId = lcaTaxId;
    branchDepth = lcaDepth;
  }

  // The eliminated sibling branch: the child of the branch point the guess falls
  // under. The answer left the branch point by a different child, so this whole
  // subtree is dead, and no node beneath it would narrow that any further. Its
  // rank tracks how close the guess landed — a cold guess rules out a superorder,
  // a guess in the answer's own family rules out only a genus.
  //
  // Guesses that fall in the same eliminated branch reuse the node and hang off
  // it as sibling leaves. It is a dead end, never part of the spine.
  let parentId = branchId;
  let parentDepth = branchDepth;
  if (guessBranch && guessBranch.taxId !== branchId) {
    const existing = nodes.get(guessBranch.taxId) || {};
    nodes.set(guessBranch.taxId, {
      ...existing,
      taxId: guessBranch.taxId,
      name: guessBranch.name,
      rank: guessBranch.rank,
      depth: branchDepth + 1,
      isRuledOut: true,
      parentLcaTaxId: branchId,
    });
    parentId = guessBranch.taxId;
    parentDepth = branchDepth + 1;
  }

  const leafId = `leaf_${commonName}`;
  nodes.set(leafId, {
    taxId: leafId,
    name: commonName,
    commonName,
    rank: 'species',
    depth: parentDepth + 1,
    isLeaf: true,
    feedbackTemperature,
    parentLcaTaxId: parentId,
  });

  return finalizeTree(nodes);
}

/**
 * Add a purchased hint node to the tree. It joins the spine at its own depth,
 * so hints bought out of sequence (because an earlier rank was already exposed
 * by a guess) still nest correctly.
 */
function applyHintToTree(prevNodes, newHintNode) {
  const nodes = new Map(prevNodes);
  const existing = nodes.get(newHintNode.taxId) || {};
  nodes.set(newHintNode.taxId, { ...existing, ...newHintNode, isHint: true });
  return finalizeTree(nodes);
}

/**
 * Derive the whole tree from the server's session.
 *
 * The tree is a pure function of the guesses and hints, so it is never stored
 * or transmitted — replaying the same folds that built it move-by-move
 * reconstructs it exactly, on any device. finalizeTree derives edges from the
 * node set rather than accumulating them, so hints and guesses may be replayed
 * in any order.
 */
function rebuildTree(guesses = [], hintNodes = {}, answer = null) {
  let nodes = new Map([[AVES_ROOT.taxId, { ...AVES_ROOT }]]);

  for (const guess of guesses) {
    // The winning guess needs the answer's lineage to reveal the spine; the
    // server only sends it once the game is over, which is exactly when it can.
    const withAnswer = guess.correct ? { ...guess, answer } : guess;
    ({ treeNodes: nodes } = buildTreeUpdate(nodes, withAnswer));
  }

  for (const node of Object.values(hintNodes)) {
    if (node) ({ treeNodes: nodes } = applyHintToTree(nodes, node));
  }

  return finalizeTree(nodes);
}

// ────────────────────────────────────────────────────────────
//  Initial state
// ────────────────────────────────────────────────────────────

const initialState = {
  puzzleDate: null,
  puzzleNumber: null,
  resetCount: 0,
  guessLimit: GUESS_LIMIT,

  phase: 'loading',

  guesses: [],
  guessesRemaining: GUESS_LIMIT,

  treeNodes: new Map([[AVES_ROOT.taxId, { ...AVES_ROOT }]]),
  treeEdges: [],

  birdList: [],

  // Hints can be bought out of sequence: a guess may already have exposed the
  // order, letting you buy Family without ever paying for Order. So track WHICH
  // hints were bought, never just how many — a count would silently bill you for
  // the cheaper hints you skipped.
  purchasedHints: [],  // hint indices bought, ascending (0=order, 1=family, 2=genus)
  hintNodes: {},       // hint index → revealed taxonomy node
  extraClues: [],
  hintPurchasedAt: [], // guesses.length at the moment each hint was bought

  // The answer bird. Sent by the server only once the game is over, so it can
  // never be read out of the client before it has been earned.
  answer: null,

  user: null,
  token: null,

  showResults: false,
  showHowToPlay: false,
  showSettings: false,
  showStats: false,
  showAccount: false,
  showAbout: false,

  darkMode: false,
  colorblindMode: false,

  error: null,
};

// ────────────────────────────────────────────────────────────
//  Reducer
// ────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_BIRD_LIST': {
      return { ...state, birdList: action.payload };
    }

    /**
     * Adopt the server's session wholesale. Every mutating endpoint returns the
     * full state, so hydrating on load, guessing, buying a hint and buying a
     * clue all land here — there is exactly one way for the game to change, and
     * it is whatever the server says. The client never computes a score, a
     * remaining-guess count, or a phase for itself.
     */
    case 'SET_SERVER_STATE': {
      const s = action.payload;
      const { treeNodes, treeEdges } = rebuildTree(s.guesses, s.hintNodes, s.answer);
      const finished = s.phase === 'won' || s.phase === 'lost';

      return {
        ...state,
        puzzleDate: s.puzzleDate ?? state.puzzleDate,
        puzzleNumber: s.puzzleNumber ?? state.puzzleNumber,
        resetCount: s.resetCount ?? state.resetCount,
        guessLimit: s.guessLimit ?? state.guessLimit,

        phase: s.phase,
        guesses: s.guesses ?? [],
        guessesRemaining: s.guessesRemaining,
        purchasedHints: s.purchasedHints ?? [],
        hintNodes: s.hintNodes ?? {},
        hintPurchasedAt: s.hintPurchasedAt ?? [],
        extraClues: s.extraClues ?? [],
        answer: s.answer ?? null,

        treeNodes,
        treeEdges,

        // Pop the results the moment the game ends, but never re-open a modal
        // the player has already dismissed on a later refresh of the state.
        showResults: finished && !state.answer ? true : state.showResults,
        error: null,
      };
    }

    case 'SET_AUTH': {
      const { token, user } = action.payload;
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      return { ...state, token, user };
    }

    case 'SIGN_OUT': {
      localStorage.removeItem(TOKEN_KEY);
      return { ...state, token: null, user: null };
    }

    case 'TOGGLE_RESULTS':
      return { ...state, showResults: !state.showResults };
    case 'TOGGLE_HOW_TO_PLAY':
      return { ...state, showHowToPlay: !state.showHowToPlay };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'TOGGLE_STATS':
      return { ...state, showStats: !state.showStats };
    case 'TOGGLE_ACCOUNT':
      return { ...state, showAccount: !state.showAccount };
    case 'TOGGLE_ABOUT':
      return { ...state, showAbout: !state.showAbout };

    case 'SET_DARK_MODE':
      return { ...state, darkMode: action.payload };
    case 'SET_COLORBLIND_MODE':
      return { ...state, colorblindMode: action.payload };

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

// ────────────────────────────────────────────────────────────
//  Context
// ────────────────────────────────────────────────────────────

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Restore auth on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const payload = parseJwt(token);
      if (payload && payload.exp > Date.now() / 1000) {
        const user = {
          id: payload.sub || payload.id,
          email: payload.email,
          displayName: payload.displayName || payload.name || payload.email,
        };
        dispatch({ type: 'SET_AUTH', payload: { token, user } });
      } else {
        // Token expired — clean up
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, []);

  // No game state is persisted here. Every guess, hint and clue is written to
  // Mongo by the endpoint that applied it, and GET /puzzle/state replays it.

  return (
    <GameContext.Provider value={{ state, dispatch, getPuzzleDate }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}

export { getPuzzleDate };
