import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import BarChartIcon from '@mui/icons-material/BarChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { useGame, getPuzzleDate, loadGameState } from './context/GameContext.jsx';
import { getPuzzleToday, getBirds } from './services/api.js';
import { BIRD_LIST_KEY, BIRD_LIST_DATE_KEY, TOKEN_KEY } from './config.js';

import TopNav from './components/TopNav.jsx';
import GuessInput from './components/GuessInput.jsx';
import HintBar from './components/HintBar.jsx';
import PhyloTree from './components/PhyloTree.jsx';
import GuessHistoryList from './components/GuessHistoryList.jsx';
import ResultsModal from './components/ResultsModal.jsx';
import HowToPlayModal from './components/HowToPlayModal.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import StatsScreen from './components/StatsScreen.jsx';
import AboutScreen from './components/AboutScreen.jsx';
import AccountSheet from './components/AccountSheet.jsx';
import InstallBanner from './components/InstallBanner.jsx';

// Handle OAuth token in URL hash — extract before first render
function extractTokenFromHash() {
  const hash = window.location.hash;
  if (hash && hash.includes('token=')) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const token = params.get('token');
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
  }
  return null;
}

function parseJwtUser(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (payload.exp < Date.now() / 1000) return null;
    return {
      id: payload.sub || payload.id,
      email: payload.email,
      displayName: payload.displayName || payload.name || payload.email,
    };
  } catch {
    return null;
  }
}

function GameScreen() {
  const { state, dispatch } = useGame();
  const { phase, guesses } = state;

  return (
    <Container
      maxWidth="sm"
      sx={{ py: 2, px: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {/* Guess Input */}
      <GuessInput />

      {/* Hint Bar */}
      <HintBar />

      {/* Phylogenetic Tree */}
      <PhyloTree />

      {/* Guess History */}
      {guesses.length > 0 && (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '11px', letterSpacing: 1 }}
          >
            Guess History
          </Typography>
          <GuessHistoryList />
        </Box>
      )}

      {/* Bottom actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', pb: 2 }}>
        <Button
          variant="text"
          size="small"
          startIcon={<BarChartIcon />}
          onClick={() => dispatch({ type: 'TOGGLE_STATS' })}
          sx={{ color: 'text.secondary', fontSize: '13px', minHeight: 44 }}
          aria-label="View your stats"
        >
          Stats
        </Button>
        <Button
          variant="text"
          size="small"
          startIcon={<InfoOutlinedIcon />}
          onClick={() => dispatch({ type: 'TOGGLE_ABOUT' })}
          sx={{ color: 'text.secondary', fontSize: '13px', minHeight: 44 }}
          aria-label="About Aviary"
        >
          About
        </Button>
        {(phase === 'won' || phase === 'lost') && (
          <Button
            variant="contained"
            size="small"
            onClick={() => dispatch({ type: 'TOGGLE_RESULTS' })}
            sx={{ fontSize: '13px', minHeight: 44 }}
            aria-label="View your results"
          >
            View Results
          </Button>
        )}
      </Box>
    </Container>
  );
}

export default function App() {
  const { state, dispatch } = useGame();
  const { phase, error } = state;

  useEffect(() => {
    async function initialize() {
      // Handle OAuth token in hash
      const hashToken = extractTokenFromHash();
      if (hashToken) {
        const user = parseJwtUser(hashToken);
        if (user) {
          dispatch({ type: 'SET_AUTH', payload: { token: hashToken, user } });
        }
      }

      try {
        // 1. Load puzzle for today
        const puzzle = await getPuzzleToday();
        const puzzleDate = puzzle.date || puzzle.puzzleDate;
        const resetCount = puzzle.resetCount ?? 0;
        dispatch({
          type: 'INIT_PUZZLE',
          payload: {
            puzzleDate,
            puzzleNumber: puzzle.puzzleNumber || puzzle.number,
            guessLimit: puzzle.guessLimit || 20,
            resetCount,
          },
        });

        // 2. Restore saved game state for today
        const savedState = loadGameState(puzzleDate, resetCount);
        if (savedState && savedState.guesses && savedState.guesses.length > 0) {
          dispatch({ type: 'RESTORE_GAME_STATE', payload: savedState });
        }

        // 3. Load bird list (with cache)
        const today = getPuzzleDate();
        const cachedDate = localStorage.getItem(BIRD_LIST_DATE_KEY);
        const cachedList = localStorage.getItem(BIRD_LIST_KEY);

        if (cachedDate === today && cachedList) {
          try {
            const parsed = JSON.parse(cachedList);
            dispatch({ type: 'LOAD_BIRD_LIST', payload: parsed });
          } catch {
            // Cache corrupted — fetch fresh
            await fetchAndCacheBirdList(today, dispatch);
          }
        } else {
          await fetchAndCacheBirdList(today, dispatch);
        }
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: err.message || 'Failed to load today\'s puzzle. Please refresh.',
        });
        // Still transition out of loading even on error
        dispatch({ type: 'INIT_PUZZLE', payload: { puzzleDate: null, puzzleNumber: null, guessLimit: 20 } });
      }
    }

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
        role="status"
        aria-label="Loading Aviary"
      >
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: 3 }}>
          AVIARY 🪽
        </Typography>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopNav />

      {error && (
        <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 2 } }}>
          <Alert
            severity="error"
            onClose={() => dispatch({ type: 'CLEAR_ERROR' })}
          >
            {error}
          </Alert>
        </Container>
      )}

      <GameScreen />

      {/* Modals & sheets */}
      <ResultsModal />
      <HowToPlayModal />
      <SettingsSheet />
      <StatsScreen />
      <AboutScreen />
      <AccountSheet />
      <InstallBanner />
    </Box>
  );
}

async function fetchAndCacheBirdList(today, dispatch) {
  const data = await getBirds();
  const list = data.birds || [];
  const normalized = list.map((b) =>
    typeof b === 'string' ? { commonName: b, aliases: [] } : b
  );
  dispatch({ type: 'LOAD_BIRD_LIST', payload: normalized });
  try {
    localStorage.setItem(BIRD_LIST_KEY, JSON.stringify(normalized));
    localStorage.setItem(BIRD_LIST_DATE_KEY, today);
  } catch {
    // localStorage full
  }
}
