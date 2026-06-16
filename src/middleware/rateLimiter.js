import rateLimit from 'express-rate-limit';

/**
 * Applied to POST /api/v1/puzzle/guess
 * 30 requests per IP per hour
 */
export const guessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many guesses. Please try again later.' },
});

/**
 * Applied to GET /api/v1/birds/search
 * 60 requests per IP per minute
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down.' },
});

/**
 * Applied to POST /api/v1/auth/login and POST /api/v1/auth/register
 * 10 requests per IP per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

/**
 * Applied to POST /api/v1/auth/resend-verification
 * 3 requests per IP per hour
 */
export const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many resend requests. Please try again later.' },
});
