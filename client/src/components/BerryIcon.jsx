import React from 'react';
import Box from '@mui/material/Box';

export default function BerryIcon({ size = 18, sx = {} }) {
  return (
    <Box
      component="img"
      src="/icons/berry.png"
      alt="berry"
      aria-hidden="true"
      sx={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...sx }}
    />
  );
}
