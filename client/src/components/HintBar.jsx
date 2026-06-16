import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useGame } from '../context/GameContext.jsx';
import { getHint } from '../services/api.js';

const HINTS = [
  { index: 0, cost: 3, label: 'Order',  rank: 'order'  },
  { index: 1, cost: 4, label: 'Family', rank: 'family' },
  { index: 2, cost: 5, label: 'Genus',  rank: 'genus'  },
];

export default function HintBar() {
  const { state, dispatch } = useGame();
  const { guessesRemaining, hintsUsed = 0, hintNodes = [], phase } = state;
  const [loading, setLoading] = useState(false);

  const isGameOver = phase === 'won' || phase === 'lost';

  async function handleHint(hint) {
    if (loading || isGameOver) return;
    if (hintsUsed !== hint.index) return;       // must use in order
    if (guessesRemaining < hint.cost) return;

    setLoading(true);
    try {
      const data = await getHint(hint.index + 1);
      dispatch({
        type: 'REVEAL_HINT',
        payload: { hintNode: data.hint, hintIndex: hint.index, cost: hint.cost },
      });
    } catch (err) {
      console.error('[HintBar] hint fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <LightbulbOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
        Hints
      </Typography>

      {HINTS.map((hint) => {
        const used = hintsUsed > hint.index;
        const isNext = hintsUsed === hint.index;
        const canAfford = guessesRemaining >= hint.cost;
        const available = isNext && canAfford && !isGameOver;
        const revealed = used ? hintNodes[hint.index] : null;

        return (
          <Tooltip
            key={hint.index}
            title={
              used
                ? `${hint.label} revealed`
                : isNext && !canAfford
                  ? `Need ${hint.cost} guesses remaining`
                  : isGameOver
                    ? ''
                    : !isNext
                      ? `Use hint ${hint.index} first`
                      : `Reveal ${hint.label} — costs ${hint.cost} guesses`
            }
            placement="top"
          >
            <span>
              <Button
                size="small"
                variant={used ? 'contained' : 'outlined'}
                disabled={!available || loading}
                onClick={() => handleHint(hint)}
                sx={{
                  minWidth: 0,
                  px: 1.25,
                  py: 0.4,
                  fontSize: '11px',
                  fontWeight: 600,
                  lineHeight: 1.4,
                  textTransform: 'none',
                  borderRadius: 2,
                  ...(used
                    ? {
                        bgcolor: 'warning.main',
                        borderColor: 'warning.main',
                        color: '#fff',
                        '&:hover': { bgcolor: 'warning.dark' },
                      }
                    : available
                      ? { borderColor: 'warning.main', color: 'warning.dark' }
                      : {}),
                  '&.Mui-disabled': { opacity: 0.45 },
                }}
              >
                {used && revealed ? (
                  <Box sx={{ textAlign: 'left' }}>
                    <Box sx={{ fontWeight: 700 }}>{revealed.name}</Box>
                    <Box sx={{ fontSize: '9px', opacity: 0.85 }}>{revealed.rank}</Box>
                  </Box>
                ) : (
                  `${hint.label} −${hint.cost}`
                )}
              </Button>
            </span>
          </Tooltip>
        );
      })}
    </Box>
  );
}
