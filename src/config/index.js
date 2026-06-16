const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  sessionSecret: process.env.SESSION_SECRET,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID,
    teamId: process.env.APPLE_TEAM_ID,
    keyId: process.env.APPLE_KEY_ID,
    // Decode base64-encoded PEM at runtime
    privateKey: process.env.APPLE_PRIVATE_KEY
      ? Buffer.from(process.env.APPLE_PRIVATE_KEY, 'base64').toString('utf8')
      : undefined,
    callbackUrl: process.env.APPLE_CALLBACK_URL,
  },
  smtp2go: { apiKey: process.env.SMTP2GO_API_KEY },
  emailFrom: process.env.EMAIL_FROM || 'noreply@metaavian.com',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
};

// Validate critical vars are present in production
if (config.isProduction) {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (!config.jwt.secret) missing.push('JWT_SECRET');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}. ` +
      'Set them with: heroku config:set KEY=VALUE --app meta-avian'
    );
  }
}

export default Object.freeze(config);
