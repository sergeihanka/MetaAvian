import React, { useState, useCallback } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckIcon from '@mui/icons-material/Check';
import { useGame } from '../context/GameContext.jsx';
import { submitGuess } from '../services/api.js';

export default function GuessInput() {
  const { state, dispatch } = useGame();
  const { birdList, guesses, guessesRemaining, phase, puzzleDate } = state;

  const [inputValue, setInputValue] = useState('');
  const [selectedBird, setSelectedBird] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const guessedNames = new Set(guesses.map((g) => g.commonName));

  const filterOptions = useCallback(
    (options, { inputValue: iv }) => {
      if (iv.length < 2) return [];
      const lower = iv.toLowerCase();
      return options
        .filter((opt) => opt.toLowerCase().includes(lower))
        .filter((opt) => !guessedNames.has(opt))
        .slice(0, 10);
    },
    [guessedNames]
  );

  const handleSelectBird = (_, value) => {
    setSelectedBird(value);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedBird || !puzzleDate) return;
    if (phase === 'won' || phase === 'lost') return;

    setLoading(true);
    setError(null);

    try {
      const serverState = await submitGuess({ birdCommonName: selectedBird });
      dispatch({ type: 'SET_SERVER_STATE', payload: serverState });
      setSelectedBird(null);
      setInputValue('');
    } catch (err) {
      // A rejection still carries the authoritative state (already over, no
      // guesses left, duplicate bird). Adopt it so the UI stops disagreeing
      // with the server instead of leaving the player stuck on a stale board.
      if (err.data?.phase) {
        dispatch({ type: 'SET_SERVER_STATE', payload: err.data });
      }
      setError(err.message || 'Failed to submit guess. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && selectedBird) {
      handleSubmit();
    }
  };

  const isDisabled = phase === 'won' || phase === 'lost';

  const buttonLabel =
    phase === 'won' ? 'Correct!' : loading ? '' : 'Guess';

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', width: '100%' }}
        onKeyDown={handleKeyDown}
      >
        <Autocomplete
          sx={{ flex: 1 }}
          options={birdList.map((b) => b.commonName)}
          filterOptions={filterOptions}
          disabled={isDisabled}
          inputValue={inputValue}
          onInputChange={(_, val) => {
            setInputValue(val);
            if (!val) setSelectedBird(null);
          }}
          value={selectedBird}
          onChange={handleSelectBird}
          noOptionsText={
            inputValue.length < 2
              ? 'Type at least 2 characters'
              : 'No birds found'
          }
          renderOption={(props, option) => {
            const alreadyGuessed = guessedNames.has(option);
            return (
              <li {...props} key={option}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                    opacity: alreadyGuessed ? 0.5 : 1,
                  }}
                >
                  {alreadyGuessed && (
                    <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  )}
                  <Typography variant="body2">{option}</Typography>
                </Box>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search for a bird…"
              placeholder="Type at least 2 characters"
              autoFocus={phase === 'playing' || phase === 'idle'}
              inputProps={{
                ...params.inputProps,
                'aria-label': 'Search for a bird to guess',
              }}
            />
          )}
        />

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isDisabled || !selectedBird || loading}
          aria-label={phase === 'won' ? 'Correct answer already found' : 'Submit bird guess'}
          sx={{ minHeight: 56, minWidth: 80, flexShrink: 0 }}
        >
          {loading ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            buttonLabel
          )}
        </Button>
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.5, ml: 0.5 }}
      >
        {isDisabled
          ? phase === 'won'
            ? 'You found the bird!'
            : 'No guesses remaining'
          : `${guessesRemaining} guess${guessesRemaining === 1 ? '' : 'es'} remaining`}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
