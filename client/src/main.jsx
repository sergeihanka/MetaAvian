import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme.js';
import { GameProvider } from './context/GameContext.jsx';
import App from './App.jsx';

// Register service worker in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration failed — non-fatal
  });
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <GameProvider>
      <App />
    </GameProvider>
  </ThemeProvider>
);
