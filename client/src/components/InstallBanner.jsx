import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import AddToHomeScreenIcon from '@mui/icons-material/AddToHomeScreen';
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
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: 'calc(100% - 32px)', sm: 400 },
          zIndex: 1400,
          bgcolor: 'background.paper',
          borderRadius: 3,
          boxShadow: 8,
          border: '1px solid',
          borderColor: 'primary.main',
          px: 2,
          py: 1.5,
        }}
        role="status"
        aria-label="Add to home screen prompt"
      >
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isIos ? 0.5 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AddToHomeScreenIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Add MetaAvian to your Home Screen
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={handleDismiss}
            aria-label="Dismiss"
            sx={{ ml: 0.5, minWidth: 32, minHeight: 32, p: 0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {isIos ? (
          /* iOS — no programmatic prompt; show tap instructions */
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Tap
            </Typography>
            <IosShareIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">
              then <strong>Add to Home Screen</strong>
            </Typography>
          </Box>
        ) : (
          /* Android / Chrome / Edge — native prompt available */
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleAdd}
              sx={{ borderRadius: 2, fontSize: '12px' }}
            >
              Add
            </Button>
          </Box>
        )}
      </Box>
    </Slide>
  );
}
