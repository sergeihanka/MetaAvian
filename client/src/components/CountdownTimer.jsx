import React from 'react';
import Typography from '@mui/material/Typography';
import { useCountdown } from '../hooks/useCountdown.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function CountdownTimer() {
  const { hours, minutes, seconds } = useCountdown();

  return (
    <Typography variant="body2" color="text.secondary" align="center">
      Next bird in{' '}
      <Typography
        component="span"
        variant="body2"
        sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
      >
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </Typography>
    </Typography>
  );
}
