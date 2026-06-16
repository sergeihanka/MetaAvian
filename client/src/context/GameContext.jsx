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
 * Build updated treeNodes Map and treeEdges array from a new guess result.
 * The API returns:
 *   guessResult.lca          = { taxId, name, rank, depth }
 *   guessResult.ancestorPath = [taxId, ...] — from root to guessed-species leaf
 *   guessResult.commonName   = guessed bird common name (leaf label)
 */
function buildTreeUpdate(prevNodes, prevEdges, guessResult) {
  const nodes = new Map(prevNodes);
  const edgeSet = new Set(prevEdges.map((e) => `${e.parentId}->${e.childId}`));
  const edges = [...prevEdges];

  // Ensure Aves root is present
  if (!nodes.has(AVES_ROOT.taxId)) {
    nodes.set(AVES_ROOT.taxId, { ...AVES_ROOT });
  }

  const { lca, ancestorPath, commonName, feedbackTemperature } = guessResult;

  // Add LCA node if present
  if (lca && lca.taxId) {
    if (!nodes.has(lca.taxId)) {
      nodes.set(lca.taxId, {
        taxId: lca.taxId,
        name: lca.name,
        rank: lca.rank,
        depth: lca.depth,
      });
    }
  }

  // Walk ancestorPath and add all ancestor nodes + edges
  if (ancestorPath && ancestorPath.length > 0) {
    // ancestorPath is ordered from root (index 0) to leaf (last index)
    // The leaf is the guessed species; nodes before it are ancestors
    for (let i = 0; i < ancestorPath.length; i++) {
      const taxId = ancestorPath[i];
      if (!nodes.has(taxId)) {
        // We may not have full info for intermediate nodes — use partial data
        // The API should have returned node info in some form; we use what we know
        const isLca = lca && lca.taxId === taxId;
        nodes.set(taxId, {
          taxId,
          name: isLca ? lca.name : String(taxId),
          rank: isLca ? lca.rank : 'unknown',
          depth: isLca ? lca.depth : i,
        });
      }

      if (i > 0) {
        const parentId = ancestorPath[i - 1];
        const key = `${parentId}->${taxId}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ parentId, childId: taxId });
        }
      }
    }

    // Leaf node — add it with guess metadata
    const leafTaxId =
      guessResult.guessTaxId ||
      (ancestorPath.length > 0 ? `leaf_${guessResult.commonName}` : null);

    if (leafTaxId) {
      const leafDepth =
        lca && lca.depth != null ? lca.depth + 1 : ancestorPath.length;
      nodes.set(leafTaxId, {
        taxId: leafTaxId,
        name: commonName,
        rank: 'species',
        depth: leafDepth,
        isLeaf: true,
        feedbackTemperature,
        commonName,
      });

      // Connect leaf to its parent (last node in ancestorPath before leaf)
      const parentOfLeaf =
        ancestorPath.length > 0
          ? ancestorPath[ancestorPath.length - 1]
          : AVES_ROOT.taxId;
      const leafEdgeKey = `${parentOfLeaf}->${leafTaxId}`;
      if (!edgeSet.has(leafEdgeKey)) {
        edgeSet.add(leafEdgeKey);
        edges.push({ parentId: parentOfLeaf, childId: leafTaxId });
      }
    }
  }

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
      const guess = action.payload;
      const newGuesses = [...state.guesses, guess];
      const newGuessesRemaining = state.guessesRemaining - 1;

      const { treeNodes, treeEdges } = buildTreeUpdate(
        state.treeNodes,
        state.treeEdges,
        guess
      );

      let phase = 'playing';
      let showResults = state.showResults;

      if (guess.feedbackTemperature === 'correct') {
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
