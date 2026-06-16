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

function getTodayUtc() {
  return new Date().toISOString().split('T')[0];
}

function getGameStateKey(date) {
  return `${GAME_STATE_KEY_PREFIX}${date}`;
}

// NCBI Aves root
const AVES_ROOT = { taxId: 8782, name: 'Aves', rank: 'class', depth: 0 };

// ────────────────────────────────────────────────────────────
//  Tree helpers
// ────────────────────────────────────────────────────────────

/**
 * Build updated treeNodes Map and treeEdges array from a normalized guess.
 * Only shows: Aves root, LCA node(s), guess leaves, and mystery "?" node.
 * Mystery is placed as sibling of the leaf at the deepest (hottest) LCA.
 *
 * Normalized guess shape:
 *   { commonName, feedbackTemperature, lca: { taxId, name, rank, depth }, correct, answer }
 */
function buildTreeUpdate(prevNodes, prevEdges, normalizedGuess) {
  const nodes = new Map(prevNodes);

  if (!nodes.has(AVES_ROOT.taxId)) {
    nodes.set(AVES_ROOT.taxId, { ...AVES_ROOT });
  }

  // Copy all non-mystery edges (mystery edge is always rebuilt from scratch)
  const edgeSet = new Set();
  const edges = [];
  for (const e of prevEdges) {
    if (e.childId === 'mystery') continue;
    const key = `${e.parentId}->${e.childId}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push(e);
    }
  }

  // Correct guess — reveal the mystery node in place
  if (normalizedGuess.correct) {
    const existing = nodes.get('mystery') || {};
    const revealedName = normalizedGuess.answer?.commonName || normalizedGuess.commonName;
    nodes.set('mystery', {
      ...existing,
      name: revealedName,
      commonName: revealedName,
      feedbackTemperature: 'correct',
      isRevealed: true,
      isMystery: true,
      isLeaf: true,
    });
    const mysteryParent = existing.parentLcaTaxId || AVES_ROOT.taxId;
    edges.push({ parentId: mysteryParent, childId: 'mystery' });
    return { treeNodes: nodes, treeEdges: edges };
  }

  const { lca, feedbackTemperature, commonName } = normalizedGuess;
  const lcaTaxId = lca?.taxId;
  const lcaDepth = lca?.depth ?? 1;

  // Add LCA node (skip if it IS the Aves root)
  if (lcaTaxId && lcaTaxId !== AVES_ROOT.taxId) {
    nodes.set(lcaTaxId, {
      taxId: lcaTaxId,
      name: lca.name,
      rank: lca.rank,
      depth: lcaDepth,
      isLca: true,
    });
    const k = `${AVES_ROOT.taxId}->${lcaTaxId}`;
    if (!edgeSet.has(k)) {
      edgeSet.add(k);
      edges.push({ parentId: AVES_ROOT.taxId, childId: lcaTaxId });
    }
  }

  // Add guess leaf
  const leafParent = lcaTaxId && lcaTaxId !== AVES_ROOT.taxId ? lcaTaxId : AVES_ROOT.taxId;
  const leafId = `leaf_${commonName}`;
  nodes.set(leafId, {
    taxId: leafId,
    name: commonName,
    commonName,
    rank: 'species',
    depth: lcaDepth + 1,
    isLeaf: true,
    feedbackTemperature,
    parentLcaTaxId: leafParent,
  });
  const leafKey = `${leafParent}->${leafId}`;
  if (!edgeSet.has(leafKey)) {
    edgeSet.add(leafKey);
    edges.push({ parentId: leafParent, childId: leafId });
  }

  // Place mystery as sibling of the leaf at the deepest (hottest) LCA
  let bestLcaTaxId = AVES_ROOT.taxId;
  let bestLcaDepth = AVES_ROOT.depth;
  for (const [, node] of nodes) {
    if (node.isLca && (node.depth ?? 0) > bestLcaDepth) {
      bestLcaDepth = node.depth;
      bestLcaTaxId = node.taxId;
    }
  }

  nodes.set('mystery', {
    taxId: 'mystery',
    name: '?',
    commonName: 'Mystery Bird',
    rank: 'species',
    depth: bestLcaDepth + 1,
    isLeaf: true,
    isMystery: true,
    parentLcaTaxId: bestLcaTaxId,
  });
  edges.push({ parentId: bestLcaTaxId, childId: 'mystery' });

  return { treeNodes: nodes, treeEdges: edges };
}

// ────────────────────────────────────────────────────────────
//  Initial state
// ────────────────────────────────────────────────────────────

const initialState = {
  puzzleDate: null,
  puzzleNumber: null,
  guessLimit: GUESS_LIMIT,

  phase: 'loading',

  guesses: [],
  guessesRemaining: GUESS_LIMIT,

  treeNodes: new Map([[AVES_ROOT.taxId, { ...AVES_ROOT }]]),
  treeEdges: [],

  birdList: [],

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

      const { treeNodes, treeEdges } = buildTreeUpdate(
        state.treeNodes,
        state.treeEdges,
        guess
      );

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
  const key = getGameStateKey(state.puzzleDate);
  const toSave = {
    guesses: state.guesses,
    guessesRemaining: state.guessesRemaining,
    phase: state.phase,
    // Serialize Map to plain object for JSON
    treeNodes: Object.fromEntries(state.treeNodes),
    treeEdges: state.treeEdges,
  };
  try {
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch {
    // localStorage may be full
  }
}

function loadGameState(date) {
  try {
    const raw = localStorage.getItem(getGameStateKey(date));
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
    <GameContext.Provider value={{ state, dispatch, loadGameState, getTodayUtc }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within a GameProvider');
  return ctx;
}

export { getTodayUtc, loadGameState };
