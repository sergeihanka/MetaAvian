import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useGame } from '../context/GameContext.jsx';

export default function TopNav() {
  const { dispatch } = useGame();

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: 56 }}>
        <IconButton
          aria-label="Open settings"
          onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <SettingsIcon />
        </IconButton>

        <Typography
          variant="h6"
          component="h1"
          sx={{ fontWeight: 700, letterSpacing: 2, userSelect: 'none' }}
        >
          AVIARY 🪽
        </Typography>

        <Toolbar component="div" disableGutters sx={{ gap: 0.5, p: 0 }}>
          <IconButton
            aria-label="Account"
            onClick={() => dispatch({ type: 'TOGGLE_ACCOUNT' })}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <PersonIcon />
          </IconButton>
          <IconButton
            aria-label="How to play"
            onClick={() => dispatch({ type: 'TOGGLE_HOW_TO_PLAY' })}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <HelpOutlineIcon />
          </IconButton>
        </Toolbar>
      </Toolbar>
    </AppBar>
  );
}
