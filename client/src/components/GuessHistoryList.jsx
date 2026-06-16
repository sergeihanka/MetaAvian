import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useGame } from '../context/GameContext.jsx';
import { TEMPERATURE_COLORS } from '../config.js';

function alpha(hex, opacity) {
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const TEMP_LABELS = {
  correct: 'Correct!',
  hot: 'Very Hot',
  warm: 'Warm',
  cool: 'Cool',
  cold: 'Cold',
};

export default function GuessHistoryList() {
  const { state } = useGame();
  const { guesses } = state;

  if (guesses.length === 0) {
    return (
      <Box
        sx={{
          py: 3,
          px: 2,
          textAlign: 'center',
          color: 'text.disabled',
        }}
        role="status"
        aria-label="No guesses yet"
      >
        <Typography variant="body2">No guesses yet</Typography>
      </Box>
    );
  }

  return (
    <Box
      component="ol"
      sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
      aria-label="Guess history"
    >
      {guesses.map((guess, index) => {
        const color = TEMPERATURE_COLORS[guess.feedbackTemperature] || TEMPERATURE_COLORS.cold;
        return (
          <Box
            component="li"
            key={`${guess.commonName}-${index}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(color, 0.08),
              borderLeft: `4px solid ${color}`,
            }}
            role="listitem"
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: 'text.secondary',
                minWidth: 28,
                textAlign: 'center',
              }}
              aria-label={`Guess number ${index + 1}`}
            >
              #{index + 1}
            </Typography>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                noWrap
              >
                {guess.commonName}
              </Typography>
              {guess.lca && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontStyle: 'italic' }}
                  noWrap
                >
                  LCA: {guess.lca.name}
                  {guess.lca.rank ? ` (${guess.lca.rank})` : ''}
                </Typography>
              )}
            </Box>

            <Chip
              label={TEMP_LABELS[guess.feedbackTemperature] || guess.feedbackTemperature}
              size="small"
              sx={{
                bgcolor: color,
                color: '#fff',
                fontWeight: 600,
                flexShrink: 0,
              }}
              aria-label={`Feedback: ${TEMP_LABELS[guess.feedbackTemperature] || guess.feedbackTemperature}`}
            />
          </Box>
        );
      })}
    </Box>
  );
}
