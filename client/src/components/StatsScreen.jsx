import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import { useGame } from '../context/GameContext.jsx';
import { GUESS_LIMIT } from '../config.js';
import { getMyStats } from '../services/api.js';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const EMPTY_STATS = {
  played: 0, won: 0, winRate: 0, currentStreak: 0, maxStreak: 0, distribution: {},
};

function StatBox({ label, value }) {
  return (
    <Box sx={{ textAlign: 'center', flex: 1 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
        {label}
      </Typography>
    </Box>
  );
}

function GuessDistribution({ distribution }) {
  const allBuckets = Array.from({ length: GUESS_LIMIT }, (_, i) => String(i + 1)).concat(['X']);
  const maxVal = Math.max(1, ...Object.values(distribution));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {allBuckets
        .filter((b) => (distribution[b] || 0) > 0)
        .map((bucket) => {
          const count = distribution[bucket] || 0;
          const pct = Math.max(8, Math.round((count / maxVal) * 100));
          return (
            <Box
              key={bucket}
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Typography
                variant="caption"
                sx={{ minWidth: 16, textAlign: 'right', fontWeight: 600 }}
              >
                {bucket}
              </Typography>
              <Box
                sx={{
                  height: 22,
                  width: `${pct}%`,
                  bgcolor: bucket === 'X' ? 'grey.400' : 'primary.main',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  px: 0.75,
                  minWidth: 28,
                  transition: 'width 0.4s ease',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: '#fff', fontWeight: 700, fontSize: '11px' }}
                >
                  {count}
                </Typography>
              </Box>
            </Box>
          );
        })}
      {Object.keys(distribution).length === 0 && (
        <Typography variant="body2" color="text.disabled" align="center">
          No completed games yet
        </Typography>
      )}
    </Box>
  );
}

export default function StatsScreen() {
  const { state, dispatch: gameDispatch } = useGame();
  const { showStats, user } = state;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // One endpoint for everyone: it keys off the JWT when signed in and the signed
  // guest cookie otherwise, so a guest's history is as durable as a user's.
  useEffect(() => {
    if (!showStats) return;
    setLoading(true);
    getMyStats()
      .then((data) => setStats(data))
      .catch(() => setStats(EMPTY_STATS))
      .finally(() => setLoading(false));
  }, [showStats, user, state.phase]);

  const handleClose = () => gameDispatch({ type: 'TOGGLE_STATS' });

  return (
    <Dialog
      open={showStats}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="stats-title"
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
        id="stats-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Your Stats
        </Typography>
        <IconButton
          aria-label="Close stats"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            Loading…
          </Typography>
        ) : stats ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Summary row */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <StatBox label="Played" value={stats.played ?? 0} />
              <StatBox label="Win %" value={`${stats.winRate ?? 0}%`} />
              <StatBox label="Streak" value={stats.currentStreak ?? 0} />
              <StatBox label="Best" value={stats.maxStreak ?? 0} />
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Guess Distribution
              </Typography>
              <GuessDistribution distribution={stats.distribution || {}} />
            </Box>

            {!user && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" align="center">
                  Sign in to sync your stats across devices.
                </Typography>
              </>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled" align="center" sx={{ py: 4 }}>
            No stats available yet — play a game first!
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
