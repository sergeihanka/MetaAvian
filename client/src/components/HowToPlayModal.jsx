import React from 'react';
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

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const clues = [
  { emoji: '🟩', label: 'Green', desc: 'Correct! That\'s the bird.' },
  { emoji: '🟧', label: 'Orange-red', desc: 'Very close — same genus or subfamily.' },
  { emoji: '🟨', label: 'Amber', desc: 'Getting warm — same family or suborder.' },
  { emoji: '🟦', label: 'Blue', desc: 'Cool — same order or superorder.' },
  { emoji: '⬜', label: 'Grey', desc: 'Cold — only share the class Aves.' },
];

export default function HowToPlayModal() {
  const { state, dispatch } = useGame();
  const { showHowToPlay } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_HOW_TO_PLAY' });

  return (
    <Dialog
      open={showHowToPlay}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="how-to-play-title"
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
        id="how-to-play-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          How to Play
        </Typography>
        <IconButton
          aria-label="Close how to play"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body1">
            Guess the daily <strong>Mystery Bird</strong> in 25 tries.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Each guess must be a valid bird from the list. After each wrong
            guess, the game shows your guess&apos;s location in the bird family
            tree (phylogenetic tree). The color tells you how close you are:
          </Typography>

          <Divider />

          <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {clues.map(({ emoji, label, desc }) => (
              <Box component="li" key={label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Typography sx={{ fontSize: 22, lineHeight: 1.3, flexShrink: 0 }} aria-hidden="true">
                  {emoji}
                </Typography>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Divider />

          <Typography variant="body2" color="text.secondary">
            A new bird is revealed every day at 9:00 AM Central Time.
          </Typography>

          <Typography variant="caption" color="text.disabled">
            Taxonomy data from{' '}
            <Typography
              component="a"
              href="https://www.ncbi.nlm.nih.gov/taxonomy"
              target="_blank"
              rel="noopener noreferrer"
              variant="caption"
              color="primary"
            >
              NCBI Taxonomy
            </Typography>{' '}
            (National Center for Biotechnology Information), publicly available.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
