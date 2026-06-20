import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

export default function BirdUnlockToast({ birdName, onDismiss, onOpenAviary }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 50);
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 5000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        px: 2.5,
        py: 1.5,
        bgcolor: '#FFFFFF',
        border: '2px solid #1495D7',
        borderRadius: 3,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.6s ease-out, opacity 0.6s ease-out',
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontWeight: 700, color: '#1495D7', fontSize: '15px' }}>
        ✨ {birdName} added to your Aviary!
      </Typography>
      <Button
        size="small"
        variant="contained"
        onClick={() => { onOpenAviary(); onDismiss(); }}
        sx={{ fontSize: '13px', minHeight: 36 }}
      >
        View Aviary
      </Button>
    </Box>
  );
}
