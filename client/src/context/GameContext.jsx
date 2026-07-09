import React, { createContext, useContext, useReducer, useEffect } from 'react';
import {
  TOKEN_KEY,
  GAME_STATE_KEY_PREFIX,
  BIRD_LIST_KEY,
  BIRD_LIST_DATE_KEY,
  GUESS_LIMIT,
} from '../config.js';

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

function getPuzzleDate() {
  const shifted = new Date(Date.now() - 9 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(shifted);
}

function getGameStateKey(date, resetCount) {
  return `${GAME_STATE_KEY_PREFIX}${date}_r${resetCount ?? 0}`;
}

// NCBI Aves root
const AVES_ROOT = { taxId: 8782, name: 'Aves', rank: 'class', depth: 0 };

// ────────────────────────────────────────────────────────────
//  Tree helpers
// ────────────────────────────────────────────────────────────

/**
 * Every internal node we ever place — an LCA (where a wrong guess branched away
 * from the mystery bird) or a purchased hint — sits on the mystery bird's own
 * lineage. So they form a single chain ordered by depth: the "spine".
 *
 * Edges are derived from the node set rather than accumulated, so the spine
 * stays correct no matter what order guesses and hints arrive in. Each guess
 * leaf hangs off the node where it branched away; the mystery hangs off the
 * deepest spine node we know about.
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
    if (n.isLeaf && !n.isMystery) {
      edges.push({ parentId: n.parentLcaTaxId ?? AVES_ROOT.taxId, childId: n.taxId });
    }
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

  const { lca, feedbackTemperature, commonName } = normalizedGuess;
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

  const leafId = `leaf_${commonName}`;
  nodes.set(leafId, {
    taxId: leafId,
    name: commonName,
    commonName,
    rank: 'species',
    depth: branchDepth + 1,
    isLeaf: true,
    feedbackTemperature,
    parentLcaTaxId: branchId,
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
 * Read hint state from a saved game. Games saved before hints were tracked by
 * index stored `hintsUsed` (a prefix count) and `hintNodes` as a dense array,
 * which could only ever describe hints bought in order — restore them that way.
 */
function migrateHintState(saved) {
  if (Array.isArray(saved.purchasedHints)) {
    return { purchasedHints: saved.purchasedHints, hintNodes: saved.hintNodes || {} };
  }
  const legacyNodes = Array.isArray(saved.hintNodes) ? saved.hintNodes : [];
  const count = saved.hintsUsed || 0;
  const purchasedHints = [];
  const hintNodes = {};
  for (let i = 0; i < count; i++) {
    purchasedHints.push(i);
    if (legacyNodes[i]) hintNodes[i] = legacyNodes[i];
  }
  return { purchasedHints, hintNodes };
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
    case 'INIT_PUZZLE': {
      return {
        ...state,
        puzzleDate: action.payload.puzzleDate,
        puzzleNumber: action.payload.puzzleNumber,
        resetCount: action.payload.resetCount ?? 0,
        guessLimit: action.payload.guessLimit || GUESS_LIMIT,
        guessesRemaining: action.payload.guessLimit || GUESS_LIMIT,
        phase: 'idle',
        error: null,
      };
    }

    case 'LOAD_BIRD_LIST': {
      return { ...state, birdList: action.payload };
    }

    case 'RESTORE_GAME_STATE': {
      const saved = action.payload;
      const restoredNodes = new Map([[AVES_ROOT.taxId, { ...AVES_ROOT }]]);
      if (saved.treeNodes) {
        for (const [k, v] of Object.entries(saved.treeNodes)) {
          // Keys may be numeric tax IDs or string leaf IDs
          const key = isNaN(k) ? k : Number(k);
          restoredNodes.set(key, v);
        }
      }
      return {
        ...state,
        guesses: saved.guesses || [],
        guessesRemaining:
          saved.guessesRemaining != null ? saved.guessesRemaining : GUESS_LIMIT,
        phase: saved.phase || 'idle',
        treeNodes: restoredNodes,
        treeEdges: saved.treeEdges || [],
        showResults: saved.phase === 'won' || saved.phase === 'lost',
        ...migrateHintState(saved),
        extraClues: saved.extraClues || [],
        hintPurchasedAt: saved.hintPurchasedAt || [],
      };
    }

    case 'SUBMIT_GUESS': {
      const payload = action.payload;
      // Normalize API response: flatten guess.guess.commonName → guess.commonName
      const guess = {
        commonName: payload.guess?.commonName || '',
        feedbackTemperature: payload.feedbackTemperature || (payload.correct ? 'correct' : 'cold'),
        lca: payload.lca || null,
        correct: payload.correct || false,
        answer: payload.answer || null,
      };

      const newGuesses = [...state.guesses, guess];
      const newGuessesRemaining = state.guessesRemaining - 1;

      const { treeNodes, treeEdges } = buildTreeUpdate(state.treeNodes, guess);

      let phase = 'playing';
      let showResults = state.showResults;

      if (guess.correct || guess.feedbackTemperature === 'correct') {
        phase = 'won';
        showResults = true;
      } else if (newGuessesRemaining <= 0) {
        phase = 'lost';
        showResults = true;
      }

      return {
        ...state,
        guesses: newGuesses,
        guessesRemaining: newGuessesRemaining,
        phase,
        treeNodes,
        treeEdges,
        showResults,
        error: null,
      };
    }

    case 'REVEAL_HINT': {
      const { hintNode, hintIndex, cost } = action.payload;
      if (state.purchasedHints.includes(hintIndex)) return state;

      const { treeNodes, treeEdges } = applyHintToTree(state.treeNodes, hintNode);
      return {
        ...state,
        purchasedHints: [...state.purchasedHints, hintIndex].sort((a, b) => a - b),
        hintNodes: { ...state.hintNodes, [hintIndex]: hintNode },
        hintPurchasedAt: [...state.hintPurchasedAt, state.guesses.length],
        guessesRemaining: state.guessesRemaining - cost,
        treeNodes,
        treeEdges,
      };
    }

    case 'REVEAL_EXTRA_CLUE': {
      return {
        ...state,
        extraClues: [...state.extraClues, action.payload.clue],
        guessesRemaining: state.guessesRemaining - 3,
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

    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

// ────────────────────────────────────────────────────────────
//  Persistence
// ────────────────────────────────────────────────────────────

function persistGameState(state) {
  if (!state.puzzleDate) return;
  const key = getGameStateKey(state.puzzleDate, state.resetCount);
  const toSave = {
    guesses: state.guesses,
    guessesRemaining: state.guessesRemaining,
    phase: state.phase,
    treeNodes: Object.fromEntries(state.treeNodes),
    treeEdges: state.treeEdges,
    purchasedHints: state.purchasedHints,
    hintNodes: state.hintNodes,
    extraClues: state.extraClues,
    hintPurchasedAt: state.hintPurchasedAt,
  };
  try {
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch {
    // localStorage may be full
  }
}

function loadGameState(date, resetCount) {
  try {
    const raw = localStorage.getItem(getGameStateKey(date, resetCount));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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

  // Persist on guess
  useEffect(() => {
    if (state.guesses.length > 0 && state.puzzleDate) {
      persistGameState(state);
    }
  }, [state.guesses, state.phase]);

  return (
    <GameContext.Provider value={{ state, dispatch, loadGameState, getPuzzleDate }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}

export { getPuzzleDate, loadGameState };
