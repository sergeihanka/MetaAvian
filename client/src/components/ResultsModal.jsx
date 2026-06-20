import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import ShareIcon from '@mui/icons-material/Share';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useGame } from '../context/GameContext.jsx';
import { TEMPERATURE_EMOJIS } from '../config.js';
import CountdownTimer from './CountdownTimer.jsx';
import FeatherToast from './FeatherToast.jsx';
import BirdUnlockToast from './BirdUnlockToast.jsx';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function ResultsModal() {
  const { state, dispatch } = useGame();
  const { showResults, phase, guesses, puzzleNumber, guessLimit, hintsUsed = 0, user, pendingFeatherAward, pendingBirdUnlock } = state;
  const [snackOpen, setSnackOpen] = useState(false);

  const handleClose = () => dispatch({ type: 'TOGGLE_RESULTS' });

  // Find the correct/answer guess or the last guess
  const lastGuess = guesses[guesses.length - 1] || null;
  const correctGuess = guesses.find((g) => g.feedbackTemperature === 'correct');
  const answerBird = correctGuess || lastGuess;

  // Each purchased hint consumed guesses; show ❔ for those slots before guess emojis
  const HINT_COSTS = [3, 4, 5];
  const totalHintSlots = HINT_COSTS.slice(0, hintsUsed).reduce((a, b) => a + b, 0);
  const hintEmojis = '❔'.repeat(totalHintSlots);
  const guessEmojis = guesses.map((g) => TEMPERATURE_EMOJIS[g.feedbackTemperature] || '⬜').join('');
  const emojiRow = hintEmojis + guessEmojis;
  const guessCount = guesses.length;

  const buildShareText = () => {
    const puzzleLabel = puzzleNumber ? `Puzzle #${puzzleNumber}` : 'Daily Puzzle';
    const resultLine =
      phase === 'won' ? `${guessCount}/${guessLimit}` : `X/${guessLimit}`;
    return `MetaAvian 🪽 ${puzzleLabel}\n${resultLine}\n${emojiRow}\n\nhttps://MetaAvian.com`;
  };

  const handleShare = async () => {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setSnackOpen(true);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setSnackOpen(true);
      } catch {
        // Clipboard not available
      }
    }
  };

  const ncbiUrl = answerBird?.ncbiTaxId
    ? `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${answerBird.ncbiTaxId}`
    : 'https://www.ncbi.nlm.nih.gov/taxonomy';

  const isWon = phase === 'won';

  return (
    <>
      <Dialog
        open={showResults}
        onClose={handleClose}
        TransitionComponent={Transition}
        aria-labelledby="results-title"
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
          id="results-title"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
        >
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            {isWon ? '🎉 You found it!' : '😔 Better luck tomorrow'}
          </Typography>
          <IconButton
            aria-label="Close results"
            onClick={handleClose}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pb: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', textAlign: 'center' }}>
            {isWon ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {answerBird?.commonName || ''}
                </Typography>
                {(answerBird?.order || answerBird?.family) && (
                  <Typography variant="body2" color="text.secondary">
                    {[answerBird.order && `Order: ${answerBird.order}`, answerBird.family && `Family: ${answerBird.family}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                )}
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    bgcolor: 'success.main',
                    color: '#fff',
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    Found in {guessCount} guess{guessCount === 1 ? '' : 'es'} 🎯
                  </Typography>
                </Box>
              </>
            ) : (
              <>
                <Typography variant="body1" color="text.secondary">
                  Today&apos;s bird was:
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {answerBird?.answerBirdName || answerBird?.commonName || '—'}
                </Typography>
                {(answerBird?.order || answerBird?.family) && (
                  <Typography variant="body2" color="text.secondary">
                    {[answerBird.order && `Order: ${answerBird.order}`, answerBird.family && `Family: ${answerBird.family}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                )}
              </>
            )}

            <Divider sx={{ width: '100%' }} />

            {/* Emoji grid */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.5 }}
              >
                {puzzleNumber ? `Puzzle #${puzzleNumber}` : 'Today\'s puzzle'} ·{' '}
                {isWon ? `${guessCount}/${guessLimit}` : `X/${guessLimit}`}
              </Typography>
              <Typography
                sx={{
                  fontSize: 20,
                  letterSpacing: 1,
                  wordBreak: 'break-all',
                  lineHeight: 1.6,
                }}
                aria-label="Result emoji grid"
              >
                {emojiRow}
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<ShareIcon />}
              onClick={handleShare}
              fullWidth
              aria-label="Share your result"
            >
              Share
            </Button>

            {isWon && user && pendingFeatherAward && (
              <FeatherToast
                amount={pendingFeatherAward}
                onDismiss={() => dispatch({ type: 'CLEAR_PENDING_TOASTS' })}
              />
            )}

            {isWon && user && pendingBirdUnlock && (
              <BirdUnlockToast
                birdName={pendingBirdUnlock.birdName}
                onDismiss={() => dispatch({ type: 'CLEAR_PENDING_TOASTS' })}
                onOpenAviary={() => {
                  dispatch({ type: 'TOGGLE_RESULTS' });
                  dispatch({ type: 'TOGGLE_AVIARY' });
                }}
              />
            )}

            {isWon && user && (
              <Button
                variant="outlined"
                fullWidth
                onClick={() => {
                  dispatch({ type: 'TOGGLE_RESULTS' });
                  dispatch({ type: 'TOGGLE_AVIARY' });
                }}
                aria-label="View your aviary"
              >
                View Your Aviary 🐦
              </Button>
            )}

            <CountdownTimer />

            <Button
              variant="text"
              size="small"
              endIcon={<OpenInNewIcon fontSize="small" />}
              component="a"
              href={ncbiUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'text.secondary', fontSize: '12px' }}
              aria-label="View bird on NCBI taxonomy (opens in new tab)"
            >
              View on NCBI Taxonomy
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snackOpen}
        autoHideDuration={2500}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          onClose={() => setSnackOpen(false)}
          sx={{ width: '100%' }}
        >
          Copied to clipboard!
        </Alert>
      </Snackbar>
    </>
  );
}
