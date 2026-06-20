import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockIcon from '@mui/icons-material/Lock';

const SILHOUETTES = Array.from({ length: 6 });

export default function AviaryTeaser() {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary', textAlign: 'center' }}>
        Your Aviary
      </Typography>

      <Box sx={{ position: 'relative', userSelect: 'none' }}>
        {/* Blurred bird grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1.5,
            filter: 'blur(3px)',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          {SILHOUETTES.map((_, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'grey.300',
                  border: '2px solid',
                  borderColor: 'grey.400',
                }}
              />
              <Box sx={{ width: 40, height: 10, bgcolor: 'grey.300', borderRadius: 1 }} />
            </Box>
          ))}
        </Box>

        {/* Lock overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <LockIcon sx={{ fontSize: 36, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', textAlign: 'center' }}>
            Sign in to start your Aviary
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
