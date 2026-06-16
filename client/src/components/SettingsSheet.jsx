import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useGame } from '../context/GameContext.jsx';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function SettingsSheet() {
  const { state, dispatch } = useGame();
  const { showSettings, darkMode, colorblindMode } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_SETTINGS' });

  return (
    <Dialog
      open={showSettings}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="settings-title"
      sx={{
        '& .MuiDialog-paper': {
          position: 'fixed',
          bottom: 0,
          m: 0,
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        },
        '& .MuiDialog-container': { alignItems: 'flex-end' },
      }}
    >
      <DialogTitle
        id="settings-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Settings
        </Typography>
        <IconButton
          aria-label="Close settings"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body1">Dark Mode</Typography>
              <Chip label="Coming soon" size="small" variant="outlined" color="default" />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={(e) =>
                    dispatch({ type: 'SET_DARK_MODE', payload: e.target.checked })
                  }
                  disabled
                  inputProps={{ 'aria-label': 'Toggle dark mode (coming soon)' }}
                />
              }
              label=""
              sx={{ mr: 0 }}
            />
          </Box>

          <Divider />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body1">Colorblind Mode</Typography>
              <Chip label="Coming in v1.1" size="small" variant="outlined" color="default" />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={colorblindMode}
                  onChange={(e) =>
                    dispatch({ type: 'SET_COLORBLIND_MODE', payload: e.target.checked })
                  }
                  disabled
                  inputProps={{ 'aria-label': 'Toggle colorblind mode (coming in v1.1)' }}
                />
              }
              label=""
              sx={{ mr: 0 }}
            />
          </Box>

          <Divider />

          <Box
            component="button"
            onClick={() => {
              dispatch({ type: 'TOGGLE_SETTINGS' });
              dispatch({ type: 'TOGGLE_ABOUT' });
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1.5,
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              p: 0,
              py: 1.5,
              textAlign: 'left',
              '&:hover': { opacity: 0.7 },
            }}
            aria-label="Open About"
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="body1">About MetaAvian</Typography>
            </Box>
            <ChevronRightIcon sx={{ color: 'text.disabled' }} />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
