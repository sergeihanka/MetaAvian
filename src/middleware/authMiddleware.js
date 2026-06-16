import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Require a valid JWT in the Authorization header.
 * Attaches req.user = { id, email, displayName } on success.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7); // remove "Bearer "

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optionally attach user from JWT if present.
 * Does NOT return an error if no token is provided.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    };
  } catch {
    // Invalid or expired token — treat as unauthenticated (don't block the request)
  }

  next();
}
