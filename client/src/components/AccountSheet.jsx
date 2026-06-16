import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CircularProgress from '@mui/material/CircularProgress';
import Slide from '@mui/material/Slide';
import CloseIcon from '@mui/icons-material/Close';
import { useGame } from '../context/GameContext.jsx';
import { login, register, forgotPassword } from '../services/api.js';
import { API_BASE_URL } from '../config.js';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function SignedInView({ user, dispatch }) {
  const initial = user.displayName
    ? user.displayName[0].toUpperCase()
    : user.email
    ? user.email[0].toUpperCase()
    : '?';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', py: 2 }}>
      <Avatar
        sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 28, fontWeight: 700 }}
        aria-label={`Avatar for ${user.displayName || user.email}`}
      >
        {initial}
      </Avatar>
      <Box sx={{ textAlign: 'center' }}>
        {user.displayName && (
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {user.displayName}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {user.email}
        </Typography>
      </Box>
      <Button
        variant="outlined"
        color="error"
        fullWidth
        onClick={() => dispatch({ type: 'SIGN_OUT' })}
        sx={{ mt: 1 }}
        aria-label="Sign out of your account"
      >
        Sign Out
      </Button>
    </Box>
  );
}

function EmailAuthForm({ dispatch, onClose }) {
  const [tab, setTab] = useState(0); // 0 = Sign In, 1 = Create Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForgot, setShowForgot] = useState(false);

  const clearState = () => {
    setError(null);
    setSuccess(null);
  };

  const handleTabChange = (_, newVal) => {
    setTab(newVal);
    clearState();
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (tab === 0) {
        // Sign in
        const data = await login(email, password);
        dispatch({ type: 'SET_AUTH', payload: { token: data.token, user: data.user } });
        onClose();
      } else {
        // Register
        await register(email, password);
        setSuccess('Account created! Check your email to verify your address before signing in.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email address above first.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await forgotPassword(email);
      setSuccess('Check your email for a password reset link.');
    } catch (err) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="fullWidth"
        aria-label="Authentication tab"
      >
        <Tab label="Sign In" aria-label="Switch to sign in tab" />
        <Tab label="Create Account" aria-label="Switch to create account tab" />
      </Tabs>

      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); clearState(); }}
        fullWidth
        autoComplete="email"
        inputProps={{ 'aria-label': 'Email address' }}
        onKeyDown={handleKeyDown}
      />

      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); clearState(); }}
        fullWidth
        autoComplete={tab === 0 ? 'current-password' : 'new-password'}
        inputProps={{ 'aria-label': 'Password' }}
        onKeyDown={handleKeyDown}
      />

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={loading}
        aria-label={tab === 0 ? 'Sign in with email' : 'Create your account'}
      >
        {loading ? <CircularProgress size={20} color="inherit" /> : tab === 0 ? 'Sign In' : 'Create Account'}
      </Button>

      {tab === 0 && (
        <Button
          variant="text"
          size="small"
          sx={{ color: 'text.secondary', alignSelf: 'center' }}
          onClick={handleForgotPassword}
          disabled={loading}
          aria-label="Forgot your password"
        >
          Forgot password?
        </Button>
      )}
    </Box>
  );
}

export default function AccountSheet() {
  const { state, dispatch } = useGame();
  const { showAccount, user } = state;

  const handleClose = () => dispatch({ type: 'TOGGLE_ACCOUNT' });

  return (
    <Dialog
      open={showAccount}
      onClose={handleClose}
      TransitionComponent={Transition}
      aria-labelledby="account-title"
      sx={{
        '& .MuiDialog-paper': {
          position: 'fixed',
          bottom: 0,
          m: 0,
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        },
        '& .MuiDialog-container': { alignItems: 'flex-end' },
      }}
    >
      <DialogTitle
        id="account-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Account
        </Typography>
        <IconButton
          aria-label="Close account sheet"
          onClick={handleClose}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 4 }}>
        {user ? (
          <SignedInView user={user} dispatch={dispatch} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Google sign-in */}
            <Button
              variant="outlined"
              fullWidth
              component="a"
              href={`${API_BASE_URL}/auth/google`}
              sx={{
                bgcolor: '#fff',
                color: '#3c4043',
                borderColor: '#dadce0',
                '&:hover': { bgcolor: '#f8f9fa', borderColor: '#c6c6c6' },
                justifyContent: 'center',
                gap: 1,
                minHeight: 48,
              }}
              aria-label="Continue with Google"
            >
              {/* Google G logo as SVG inline */}
              <Box
                component="svg"
                viewBox="0 0 24 24"
                sx={{ width: 20, height: 20, flexShrink: 0 }}
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </Box>
              Continue with Google
            </Button>

            {/* Apple sign-in */}
            <Button
              variant="contained"
              fullWidth
              component="a"
              href={`${API_BASE_URL}/auth/apple`}
              sx={{
                bgcolor: '#000',
                color: '#fff',
                '&:hover': { bgcolor: '#1a1a1a' },
                justifyContent: 'center',
                gap: 1,
                minHeight: 48,
              }}
              aria-label="Continue with Apple"
            >
              {/* Apple logo approximation */}
              <Typography component="span" sx={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">

              </Typography>
              Continue with Apple
            </Button>

            <Divider sx={{ my: 0.5 }}>
              <Typography variant="caption" color="text.disabled">
                or
              </Typography>
            </Divider>

            <EmailAuthForm dispatch={dispatch} onClose={handleClose} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
