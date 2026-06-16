import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter, resendLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign a JWT for a user document (or partial doc with _id). */
function issueJWT(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      authProvider: user.authProvider,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/** SHA-256 hash a raw token for safe DB storage. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Basic email format validation. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Google OAuth2
// ---------------------------------------------------------------------------

router.get('/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: true, failureRedirect: `${config.clientUrl}/#auth-error` }),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.redirect(`${config.clientUrl}/#auth-error`);
      }
      const token = issueJWT(user);
      // Destroy session after issuing JWT — sessions are only needed for the OAuth round-trip
      req.session.destroy(() => {});
      res.redirect(`${config.clientUrl}/#token=${token}`);
    } catch (err) {
      console.error('[auth] Google callback error:', err);
      res.redirect(`${config.clientUrl}/#auth-error`);
    }
  }
);

// ---------------------------------------------------------------------------
// Apple Sign In
// ---------------------------------------------------------------------------

router.get('/apple', passport.authenticate('apple'));

// Apple sends the callback as POST (not GET)
router.post(
  '/apple/callback',
  passport.authenticate('apple', { session: true, failureRedirect: `${config.clientUrl}/#auth-error` }),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.redirect(`${config.clientUrl}/#auth-error`);
      }
      const token = issueJWT(user);
      req.session.destroy(() => {});
      res.redirect(`${config.clientUrl}/#token=${token}`);
    } catch (err) {
      console.error('[auth] Apple callback error:', err);
      res.redirect(`${config.clientUrl}/#auth-error`);
    }
  }
);

// Apple server-to-server events (account deletion, etc.)
router.post('/apple/events', (req, res) => {
  console.log('[auth] Apple server event received:', JSON.stringify(req.body));
  // TODO: handle account deletion by soft-deleting user
  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Local Auth — Register
// ---------------------------------------------------------------------------

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!firstName || !firstName.trim()) {
    return res.status(400).json({ error: 'First name is required.' });
  }
  if (!lastName || !lastName.trim()) {
    return res.status(400).json({ error: 'Last name is required.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number.' });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one special character.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await User.create({
    email: normalizedEmail,
    emailVerified: false,
    authProvider: 'local',
    passwordHash,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    displayName: `${firstName.trim()} ${lastName.trim()}`,
    emailVerifyToken: hashedToken,
    emailVerifyExpires: verifyExpires,
  });

  await sendVerificationEmail(normalizedEmail, rawToken);

  res.status(201).json({ message: 'Check your email to verify your account.' });
});

// ---------------------------------------------------------------------------
// Local Auth — Login
// ---------------------------------------------------------------------------

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.authProvider !== 'local' || !user.passwordHash) {
    return res.status(401).json({ error: 'This account uses Google/Apple sign-in.' });
  }

  if (!user.emailVerified) {
    return res.status(403).json({
      error: 'Please verify your email first.',
      resendAvailable: true,
    });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = issueJWT(user);

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
    },
  });
});

// ---------------------------------------------------------------------------
// Email Verification
// ---------------------------------------------------------------------------

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required.' });
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    emailVerifyToken: hashedToken,
    emailVerifyExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' });
  }

  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const jwtToken = issueJWT(user);
  res.redirect(`${config.clientUrl}/#token=${jwtToken}`);
});

// ---------------------------------------------------------------------------
// Resend Verification
// ---------------------------------------------------------------------------

router.post('/resend-verification', resendLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    // Always return 200 to prevent enumeration
    return res.status(200).json({ message: 'If an unverified account exists, a new verification email was sent.' });
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    emailVerified: false,
    authProvider: 'local',
  });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashToken(rawToken);
    user.emailVerifyToken = hashedToken;
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user.email, rawToken);
  }

  // Always return 200 regardless of whether email exists
  res.status(200).json({ message: 'If an unverified account exists, a new verification email was sent.' });
});

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (email) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user && user.authProvider === 'local') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = hashToken(rawToken);
      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
      await user.save();
      await sendPasswordResetEmail(user.email, rawToken);
    }
  }

  // Always return 200 regardless of whether email exists (prevent enumeration)
  res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.status(200).json({ message: 'Password reset successful.' });
});

// ---------------------------------------------------------------------------
// Current User
// ---------------------------------------------------------------------------

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      authProvider: user.authProvider,
      avatarUrl: user.avatarUrl,
      stats: user.stats,
    },
  });
});

export default router;
