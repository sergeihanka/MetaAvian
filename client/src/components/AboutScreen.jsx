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

export default function AboutScreen() {
  const { state, dispatch } = useGame();
  const { showAbout } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_ABOUT' });

  return (
    <Dialog
      open={showAbout}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="about-title"
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
        id="about-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          About Aviary
        </Typography>
        <IconButton
          aria-label="Close about"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body1">
            Aviary is a daily bird taxonomy guessing game. Each day, one Mystery
            Bird is chosen. Guess bird names and discover where they fall in the
            phylogenetic tree — the closer your guess is in taxonomy, the warmer
            your hint!
          </Typography>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Data Attribution
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Taxonomy data from{' '}
              <Typography
                component="a"
                href="https://www.ncbi.nlm.nih.gov/taxonomy"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                color="primary"
              >
                NCBI Taxonomy
              </Typography>{' '}
              (National Center for Biotechnology Information), publicly
              available.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Inspiration
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inspired by{' '}
              <Typography
                component="a"
                href="https://metaflora.app"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                color="primary"
              >
                Metaflora
              </Typography>{' '}
              and{' '}
              <Typography
                component="a"
                href="https://metazooa.com"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                color="primary"
              >
                Metazooa
              </Typography>{' '}
              (Trainwreck Labs).
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Technology
            </Typography>
            <Typography variant="body2" color="text.secondary">
              UI built with{' '}
              <Typography
                component="a"
                href="https://mui.com"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                color="primary"
              >
                Material-UI
              </Typography>{' '}
              (MIT License).
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.5,
              bgcolor: 'grey.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" color="text.disabled">
              Not affiliated with NCBI, Metaflora, or Metazooa.
            </Typography>
          </Box>

          <Divider />

          <Typography variant="body2" color="text.secondary">
            Feedback &amp; questions:{' '}
            <Typography
              component="a"
              href="mailto:sergeiahanka@gmail.com"
              variant="body2"
              color="primary"
            >
              sergeiahanka@gmail.com
            </Typography>
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
