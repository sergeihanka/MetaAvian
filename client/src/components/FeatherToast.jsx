import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import BerryIcon from './BerryIcon.jsx';

export default function FeatherToast({ amount, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 50);
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 3000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <Box
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 2.5,
        py: 1.5,
        bgcolor: '#FFFFFF',
        border: '2px solid #169A43',
        borderRadius: 3,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.6s ease-out, opacity 0.6s ease-out',
      }}
    >
      <BerryIcon size={24} />
      <Typography sx={{ fontWeight: 700, color: '#169A43', fontSize: '16px' }}>
        +{amount} Berries!
      </Typography>
    </Box>
  );
}
