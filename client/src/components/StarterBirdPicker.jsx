import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Slide from '@mui/material/Slide';
import { useGame } from '../context/GameContext.jsx';
import { getStarterBirds, postStarterBird } from '../services/api.js';
import BirdIcon from './BirdIcon.jsx';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function StarterBirdPicker() {
  const { state, dispatch } = useGame();
  const { showStarterPicker } = state;

  const [birds, setBirds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedBird, setSelectedBird] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!showStarterPicker) return;
    setLoading(true);
    getStarterBirds()
      .then((data) => setBirds(data.birds || []))
      .catch(() => setError('Could not load starter birds. Please try again.'))
      .finally(() => setLoading(false));
  }, [showStarterPicker]);

  const handleConfirm = async () => {
    if (!selectedBird) return;
    setConfirming(true);
    setError(null);
    try {
      const data = await postStarterBird(selectedBird._id);
      dispatch({ type: 'COMPLETE_STARTER', payload: data.bird || selectedBird });
    } catch (err) {
      setError(err.message || 'Could not save your choice. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog
      open={showStarterPicker}
      TransitionComponent={Transition}
      disableEscapeKeyDown
      aria-labelledby="starter-picker-title"
      sx={{
        '& .MuiDialog-paper': {
          position: 'fixed',
          bottom: 0,
          m: 0,
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
        },
        '& .MuiDialog-container': { alignItems: 'flex-end' },
      }}
    >
      <DialogTitle id="starter-picker-title" sx={{ pb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Choose Your Starter Bird 🪽</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          This bird is yours to keep — no cost!
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress color="primary" />
          </Box>
        )}

        {!loading && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 1.5,
              mt: 1,
            }}
          >
            {birds.map((bird) => {
              const selected = selectedBird?._id === bird._id;
              return (
                <Box
                  key={bird._id}
                  onClick={() => setSelectedBird(bird)}
                  role="button"
                  aria-pressed={selected}
                  aria-label={`Select ${bird.commonName}`}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedBird(bird)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    borderRadius: 3,
                    border: '2px solid',
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: selected ? 'action.selected' : 'background.paper',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background-color 0.15s',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <BirdIcon bird={bird} size={80} />
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {bird.commonName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {bird.scientificName}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1.5, textAlign: 'center' }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 4, pt: 1 }}>
        <Button
          variant="contained"
          fullWidth
          disabled={!selectedBird || confirming}
          onClick={handleConfirm}
          aria-label="Confirm starter bird selection"
        >
          {confirming ? <CircularProgress size={20} color="inherit" /> : 'Choose This Bird'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
