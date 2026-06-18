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

  const { lca, feedbackTemperature, commonName, ancestorNodes } = normalizedGuess;
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

  // Chain intermediate taxonomy nodes (family, genus, etc.) between LCA and leaf.
  // These are the guess bird's own ancestry — clues about the wrong guess only.
  let deepestAncestorId = lcaTaxId && lcaTaxId !== AVES_ROOT.taxId ? lcaTaxId : AVES_ROOT.taxId;
  let deepestAncestorDepth = lcaDepth;
  if (ancestorNodes && ancestorNodes.length > 0) {
    for (const iNode of ancestorNodes) {
      nodes.set(iNode.taxId, {
        taxId: iNode.taxId,
        name: iNode.name,
        rank: iNode.rank,
        depth: iNode.depth,
        isIntermediateAncestor: true,
      });
      const ek = `${deepestAncestorId}->${iNode.taxId}`;
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek);
        edges.push({ parentId: deepestAncestorId, childId: iNode.taxId });
      }
      deepestAncestorId = iNode.taxId;
      deepestAncestorDepth = iNode.depth;
    }
  }

  // Add guess leaf — connected to deepest intermediate node (or LCA if none)
  const leafId = `leaf_${commonName}`;
  nodes.set(leafId, {
    taxId: leafId,
    name: commonName,
    commonName,
    rank: 'species',
    depth: deepestAncestorDepth + 1,
    isLeaf: true,
    feedbackTemperature,
    parentLcaTaxId: deepestAncestorId,
  });
  const leafKey = `${deepestAncestorId}->${leafId}`;
  if (!edgeSet.has(leafKey)) {
    edgeSet.add(leafKey);
    edges.push({ parentId: deepestAncestorId, childId: leafId });
  }

  // Place mystery below the deepest known LCA or hint node on the answer path.
  // Never reveal answer-side intermediate nodes — mystery stays opaque.
  let bestParentId = AVES_ROOT.taxId;
  let bestDepth = AVES_ROOT.depth;
  for (const [, node] of nodes) {
    if ((node.isLca || node.isHint) && (node.depth ?? 0) > bestDepth) {
      bestDepth = node.depth;
      bestParentId = node.taxId;
    }
  }

  nodes.set('mystery', {
    taxId: 'mystery',
    name: '?',
    commonName: 'Mystery Bird',
    rank: 'species',
    depth: bestDepth + 1,
    isLeaf: true,
    isMystery: true,
    parentLcaTaxId: bestParentId,
  });
  edges.push({ parentId: bestParentId, childId: 'mystery' });

  return { treeNodes: nodes, treeEdges: edges };
}

/**
 * Add a hint node to the tree and move the mystery node below it.
 * hintIndex: 0-based index of this hint (0=order, 1=family, 2=genus)
 * allHintNodes: the full hint array AFTER appending the new node
 */
function applyHintToTree(prevNodes, prevEdges, newHintNode, hintIndex, allHintNodes) {
  const nodes = new Map(prevNodes);

  // Strip old mystery edge; rebuild it at the end
  const edges = prevEdges.filter((e) => e.childId !== 'mystery');
  const edgeSet = new Set(edges.map((e) => `${e.parentId}->${e.childId}`));

  // Add the hint node
  nodes.set(newHintNode.taxId, { ...newHintNode, isHint: true });

  // Chain: Aves → hint0 → hint1 → hint2
  const parentId = hintIndex === 0 ? AVES_ROOT.taxId : allHintNodes[hintIndex - 1].taxId;
  const hintEdgeKey = `${parentId}->${newHintNode.taxId}`;
  if (!edgeSet.has(hintEdgeKey)) {
    edgeSet.add(hintEdgeKey);
    edges.push({ parentId, childId: newHintNode.taxId });
  }

  // Move mystery below the deepest known LCA or hint node
  let bestParentId = AVES_ROOT.taxId;
  let bestParentDepth = AVES_ROOT.depth;
  for (const [, node] of nodes) {
    if ((node.isLca || node.isHint) && (node.depth ?? 0) > bestParentDepth) {
      bestParentDepth = node.depth;
      bestParentId = node.taxId;
    }
  }

  const existingMystery = nodes.get('mystery') || {};
  nodes.set('mystery', {
    ...existingMystery,
    depth: bestParentDepth + 1,
    parentLcaTaxId: bestParentId,
  });
  edges.push({ parentId: bestParentId, childId: 'mystery' });

  return { treeNodes: nodes, treeEdges: edges };
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

  hintsUsed: 0,
  hintNodes: [],

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
        hintsUsed: saved.hintsUsed || 0,
        hintNodes: saved.hintNodes || [],
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
        ancestorNodes: payload.ancestorNodes || [],
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

    case 'REVEAL_HINT': {
      const { hintNode, hintIndex, cost } = action.payload;
      const newHintNodes = [...state.hintNodes, hintNode];
      const { treeNodes, treeEdges } = applyHintToTree(
        state.treeNodes, state.treeEdges, hintNode, hintIndex, newHintNodes
      );
      return {
        ...state,
        hintsUsed: hintIndex + 1,
        hintNodes: newHintNodes,
        guessesRemaining: state.guessesRemaining - cost,
        treeNodes,
        treeEdges,
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
    hintsUsed: state.hintsUsed,
    hintNodes: state.hintNodes,
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
