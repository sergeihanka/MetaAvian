import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function BirdIcon({ bird, accessory = null, size = 56 }) {
  const [imgError, setImgError] = useState(false);

  if (!bird) return null;

  const borderColor = bird.accentColor || '#169A43';
  const initial = bird.commonName ? bird.commonName[0].toUpperCase() : '?';
  const showImg = bird.iconUrl && !imgError;
  const ariaLabel = `${bird.commonName}${accessory ? ` wearing ${accessory.name}` : ''}`;

  return (
    <Box
      role="img"
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      {/* Circular bird image / fallback */}
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `2px solid ${borderColor}`,
          bgcolor: '#FAFAF7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showImg ? (
          <Box
            component="img"
            src={bird.iconUrl}
            alt={bird.commonName}
            onError={() => setImgError(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Typography
            sx={{
              fontSize: size * 0.4,
              fontWeight: 700,
              color: borderColor,
              userSelect: 'none',
              lineHeight: 1,
            }}
          >
            {initial}
          </Typography>
        )}
      </Box>

      {/* Hat overlay */}
      {accessory && accessory.iconPath && (
        <Box
          component="img"
          src={accessory.iconPath}
          alt={accessory.name}
          sx={{
            position: 'absolute',
            top: `-${size * 0.15}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${size * 0.5}px`,
            height: 'auto',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  );
}
