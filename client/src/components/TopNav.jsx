import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useGame } from '../context/GameContext.jsx';
import BerryIcon from './BerryIcon.jsx';

export default function TopNav() {
  const { state, dispatch } = useGame();
  const { user, berryBalance } = state;

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

        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, userSelect: 'none' }}
          onClick={() => dispatch({ type: 'TOGGLE_ABOUT' })}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label="About Aviary"
        >
          <Box
            component="img"
            src="/icons/icon-192-nb.png"
            alt=""
            aria-hidden="true"
            sx={{ width: 32, height: 32, borderRadius: '8px' }}
          />
          <Typography
            variant="h6"
            component="h1"
            sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main' }}
          >
            MetaAvian
          </Typography>
        </Box>

        {user && (
          <Chip
            label={<Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><BerryIcon size={16} /> {berryBalance}</Box>}
            onClick={() => dispatch({ type: 'TOGGLE_AVIARY' })}
            size="small"
            sx={{
              backgroundColor: '#FFF8E1',
              color: '#B8860B',
              fontWeight: 700,
              fontSize: '13px',
              border: '1px solid #B8860B',
              cursor: 'pointer',
            }}
            aria-label={`${berryBalance} berries — open aviary`}
          />
        )}

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
