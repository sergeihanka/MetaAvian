import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import IosShareIcon from '@mui/icons-material/IosShare';
import { useInstallPrompt } from '../context/InstallPromptContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function InstallBanner() {
  const { shouldShowBanner, isIos, promptInstall, dismiss } = useInstallPrompt();
  const { state } = useGame();
  const isLoggedIn = !!state.user;

  if (!shouldShowBanner) return null;

  const handleDismiss = () => dismiss(isLoggedIn);

  const handleAdd = async () => {
    if (!isIos) {
      await promptInstall();
      dismiss(isLoggedIn);
    }
  };

  return (
    <Slide direction="up" in mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1400,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'primary.main',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.12)',
          px: 2,
          pt: 1.5,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        }}
        role="status"
        aria-label="Add to home screen prompt"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="img"
            src="/icons/icon-192-nb.png"
            alt="MetaAvian"
            sx={{ width: 36, height: 36, borderRadius: 1, flexShrink: 0 }}
          />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              Add MetaAvian to your Home Screen
            </Typography>
            {isIos && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                <Typography variant="caption" color="text.secondary">
                  Tap
                </Typography>
                <IosShareIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                <Typography variant="caption" color="text.secondary">
                  then <strong>Add to Home Screen</strong>
                </Typography>
              </Box>
            )}
          </Box>

          {!isIos && (
            <Button
              size="small"
              variant="contained"
              onClick={handleAdd}
              sx={{ borderRadius: 2, fontSize: '12px', flexShrink: 0 }}
            >
              Add
            </Button>
          )}

          <IconButton
            size="small"
            onClick={handleDismiss}
            aria-label="Dismiss"
            sx={{ flexShrink: 0, p: 0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Slide>
  );
}
