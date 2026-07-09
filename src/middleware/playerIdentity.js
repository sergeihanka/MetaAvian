import crypto from 'crypto';
import config from '../config/index.js';

export const PLAYER_COOKIE = 'aviary_sid';

// Two years. A guest's in-progress puzzle only needs to outlive a day, but the
// same id backs their long-run stats, so it should survive as long as the
// browser will keep it.
const MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Establish who is playing, without trusting the client.
 *
 * Signed httpOnly cookie, so page scripts can neither read the id nor forge one
 * for somebody else's session. Issued on first contact and reused thereafter.
 *
 * Must run AFTER optionalAuth: a logged-in player is keyed by userId and their
 * cookie is ignored for lookups, so the same account resumes on any device. A
 * guest is keyed by the cookie alone, which is per-device by construction.
 *
 * Attaches:
 *   req.guestId       always — the cookie id, needed to adopt a guest session on login
 *   req.playerFilter  the Mongo filter selecting this player's sessions
 */
export function playerIdentity(req, res, next) {
  let sid = req.signedCookies?.[PLAYER_COOKIE];

  // A tampered or absent cookie mints a fresh identity rather than erroring:
  // the worst case is a guest silently starting over, never a 500.
  if (typeof sid !== 'string' || !UUID_RE.test(sid)) {
    sid = crypto.randomUUID();
    res.cookie(PLAYER_COOKIE, sid, {
      httpOnly: true,
      signed: true,
      secure: config.isProduction,
      // Prod may serve the SPA from a different origin than the API, which
      // needs 'none'; 'none' requires Secure, so it can only apply over HTTPS.
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: MAX_AGE_MS,
      path: '/',
    });
  }

  req.guestId = sid;
  req.playerFilter = req.user?.id
    ? { userId: req.user.id }
    : { guestId: sid, userId: null };

  next();
}
