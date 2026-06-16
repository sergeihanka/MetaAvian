import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme.js';
import { GameProvider } from './context/GameContext.jsx';
import { InstallPromptProvider } from './context/InstallPromptContext.jsx';
import App from './App.jsx';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Only reload when the SW *changes* (update), not on first install
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <InstallPromptProvider>
      <GameProvider>
        <App />
      </GameProvider>
    </InstallPromptProvider>
  </ThemeProvider>
);
