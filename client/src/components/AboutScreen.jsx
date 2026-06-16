import React from 'react';
import Dialog from '@mui/material/Dialog';
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
      <DialogContent sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Branding header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pt: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                component="img"
                src="/icons/icon-192.png"
                alt="Aviary logo"
                sx={{ width: 48, height: 48, borderRadius: '12px' }}
              />
              <Box>
                <Typography
                  id="about-title"
                  variant="h6"
                  sx={{ fontWeight: 700, letterSpacing: 2, color: 'primary.main', lineHeight: 1.2 }}
                >
                  AVIARY
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Daily Bird Taxonomy Game
                </Typography>
              </Box>
            </Box>
            <IconButton
              aria-label="Close about"
              onClick={handleClose}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          <Divider />

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
              (National Center for Biotechnology Information), publicly available.
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
              </Typography>
              .
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
              href="mailto:admin@metaavian.com"
              variant="body2"
              color="primary"
            >
              admin@metaavian.com
            </Typography>
          </Typography>

          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', mt: 1 }}>
            v{__APP_VERSION__}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
