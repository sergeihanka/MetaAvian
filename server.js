import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';

import config from './src/config/index.js';
import { connectDB } from './src/config/db.js';
import { configurePassport } from './src/config/passport.js';

import authRouter from './src/routes/auth.js';
import birdsRouter from './src/routes/birds.js';
import puzzleRouter from './src/routes/puzzle.js';
import usersRouter from './src/routes/users.js';
import statsRouter from './src/routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------------------------------------------------------------------------
// Trust Heroku's proxy (required for rate limiting with X-Forwarded-For)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false,
  })
);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Session (only needed for OAuth2 round-trip — short-lived)
// ---------------------------------------------------------------------------
app.use(
  session({
    secret: config.sessionSecret || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes — just enough for OAuth round-trip
      sameSite: config.isProduction ? 'none' : 'lax',
    },
  })
);

// ---------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ---------------------------------------------------------------------------
// Health check (for UptimeRobot)
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/birds', birdsRouter);
app.use('/api/v1/puzzle', puzzleRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/stats', statsRouter);

// ---------------------------------------------------------------------------
// Serve React client in production
// ---------------------------------------------------------------------------
if (config.isProduction) {
  const clientDistPath = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDistPath));

  // Catch-all: serve index.html for any non-API route (SPA routing)
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Global error handler (Express 5: async errors auto-forwarded to here)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (config.nodeEnv !== 'production') {
    console.error(err.stack);
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join('; ') });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ error: `${field} already exists.` });
  }

  const statusCode = err.status || err.statusCode || 500;
  const message =
    statusCode < 500 ? err.message : 'An unexpected error occurred. Please try again.';

  res.status(statusCode).json({ error: message });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = config.port;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${config.nodeEnv}]`);
  });
});

export default app;
