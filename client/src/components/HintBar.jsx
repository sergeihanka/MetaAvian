import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useGame } from '../context/GameContext.jsx';
import { buyHint, buyExtraClue } from '../services/api.js';

// Mirrors src/services/gameRules.js. Used only to label and disable buttons —
// the server charges the cost and enforces every rule below independently.
const HINTS = [
  { index: 0, cost: 3, label: 'Order',  rank: 'order'  },
  { index: 1, cost: 4, label: 'Family', rank: 'family' },
  { index: 2, cost: 5, label: 'Genus',  rank: 'genus'  },
];

// Numeric depth for taxonomy ranks — higher = more specific
const RANK_LEVEL = {
  order: 2, suborder: 3, superfamily: 3.5,
  family: 4, subfamily: 5, tribe: 6, subtribe: 6.5,
  genus: 7, subgenus: 7.5, species: 8,
};

// True if any wrong guess has already put this rank (or a deeper rank) in the tree.
function isDiscoveredViaGuess(rank, guesses) {
  const threshold = RANK_LEVEL[rank] ?? 0;
  return guesses.some(g => g.lca && (RANK_LEVEL[g.lca.rank] ?? 0) >= threshold);
}

// True if all earlier hints are either purchased or discovered via guess.
function isPreviousAvailable(hintIndex, purchasedHints, guesses) {
  for (let i = 0; i < hintIndex; i++) {
    if (purchasedHints.includes(i)) continue;                   // purchased
    if (isDiscoveredViaGuess(HINTS[i].rank, guesses)) continue; // in tree
    return false;
  }
  return true;
}

export default function HintBar() {
  const { state, dispatch } = useGame();
  const { guessesRemaining, purchasedHints = [], hintNodes = {}, extraClues = [], phase } = state;
  const guesses = state.guesses || [];
  const [loading, setLoading] = useState(false);

  const isGameOver = phase === 'won' || phase === 'lost';

  // Genus is considered revealed if purchased OR discovered via a hot guess
  const genusRevealed = purchasedHints.includes(2) || isDiscoveredViaGuess('genus', guesses);

  // Both purchases are applied and priced server-side; the response is the new
  // authoritative session, including the guess budget the cost came out of.
  async function handleHint(hint) {
    if (loading || isGameOver) return;
    setLoading(true);
    try {
      const serverState = await buyHint(hint.index + 1);
      dispatch({ type: 'SET_SERVER_STATE', payload: serverState });
    } catch (err) {
      if (err.data?.phase) dispatch({ type: 'SET_SERVER_STATE', payload: err.data });
      console.error('[HintBar] hint purchase failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExtraClue() {
    if (loading || isGameOver) return;
    if (guessesRemaining < 3) return;
    setLoading(true);
    try {
      const serverState = await buyExtraClue();
      dispatch({ type: 'SET_SERVER_STATE', payload: serverState });
    } catch (err) {
      if (err.data?.phase) dispatch({ type: 'SET_SERVER_STATE', payload: err.data });
      console.error('[HintBar] extra clue purchase failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* ── Taxonomy hints row ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <LightbulbOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
          Hints
        </Typography>

        {HINTS.map((hint) => {
          const purchased = purchasedHints.includes(hint.index);
          const discovered = !purchased && isDiscoveredViaGuess(hint.rank, guesses);
          const prereqMet = isPreviousAvailable(hint.index, purchasedHints, guesses);
          const canAfford = guessesRemaining >= hint.cost;
          const available = !purchased && !discovered && prereqMet && canAfford && !isGameOver;
          const revealed = purchased ? hintNodes[hint.index] : null;

          let tooltip = '';
          if (purchased)    tooltip = `${hint.label} revealed`;
          else if (discovered) tooltip = `Already visible in tree`;
          else if (!prereqMet)  tooltip = `Reveal previous hints first`;
          else if (!canAfford)  tooltip = `Need ${hint.cost} guesses remaining`;
          else if (isGameOver)  tooltip = '';
          else                  tooltip = `Reveal ${hint.label} — costs ${hint.cost} guesses`;

          return (
            <Tooltip key={hint.index} title={tooltip} placement="top">
              <span>
                <Button
                  size="small"
                  variant={purchased ? 'contained' : 'outlined'}
                  disabled={!available || loading}
                  onClick={() => available && handleHint(hint)}
                  sx={{
                    minWidth: 0,
                    px: 1.25,
                    py: 0.4,
                    fontSize: '11px',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    textTransform: 'none',
                    borderRadius: 2,
                    ...(purchased
                      ? {
                          bgcolor: '#169A43',
                          borderColor: '#169A43',
                          color: '#fff',
                          '&:hover': { bgcolor: '#0F6D3D' },
                        }
                      : discovered
                        ? {
                            borderColor: 'divider',
                            color: 'text.disabled',
                            bgcolor: 'action.hover',
                            cursor: 'default',
                          }
                        : available
                          ? {
                              borderColor: '#1495D7',
                              color: '#1495D7',
                              bgcolor: '#EAF6FD',
                              '&:hover': { bgcolor: '#9FD3F2', borderColor: '#1495D7' },
                            }
                          : {
                              borderColor: 'divider',
                              color: 'text.disabled',
                            }),
                    '&.Mui-disabled': { opacity: 0.55 },
                  }}
                >
                  {purchased && revealed ? (
                    <Box sx={{ textAlign: 'left' }}>
                      <Box sx={{ fontWeight: 700 }}>{revealed.name}</Box>
                      <Box sx={{ fontSize: '9px', opacity: 0.85 }}>{revealed.rank}</Box>
                    </Box>
                  ) : discovered ? (
                    `${hint.label} ✓`
                  ) : (
                    `${hint.label} −${hint.cost}`
                  )}
                </Button>
              </span>
            </Tooltip>
          );
        })}
      </Box>

      {/* ── Extra clues (unlocked after genus) ── */}
      {genusRevealed && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Revealed clue texts */}
          {extraClues.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {extraClues.map((clue, i) => (
                <Box
                  key={i}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    borderLeft: '3px solid',
                    borderLeftColor: 'primary.main',
                  }}
                >
                  <Typography variant="caption" sx={{ lineHeight: 1.5, display: 'block' }}>
                    {clue}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* "Get another clue" button */}
          {!isGameOver && (
            <Tooltip
              title={
                guessesRemaining < 3
                  ? 'Need 3 guesses remaining'
                  : `Get a vague clue — costs 3 guesses`
              }
              placement="top"
            >
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={guessesRemaining < 3 || loading}
                  onClick={handleExtraClue}
                  sx={{
                    minWidth: 0,
                    px: 1.25,
                    py: 0.4,
                    fontSize: '11px',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    textTransform: 'none',
                    borderRadius: 2,
                    borderColor: guessesRemaining >= 3 ? '#9C27B0' : 'divider',
                    color: guessesRemaining >= 3 ? '#9C27B0' : 'text.disabled',
                    bgcolor: guessesRemaining >= 3 ? '#F3E5F5' : 'transparent',
                    '&:hover': { bgcolor: '#E1BEE7', borderColor: '#7B1FA2' },
                    '&.Mui-disabled': { opacity: 0.55 },
                  }}
                >
                  {extraClues.length === 0 ? `Clue −3` : `Another Clue −3`}
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}
