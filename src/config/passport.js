import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import config from './index.js';
import User from '../models/User.js';

export function configurePassport() {
  // ----------------------------------------------------------------
  // Serialize / Deserialize (session only used for OAuth2 round-trip)
  // ----------------------------------------------------------------
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).lean();
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // ----------------------------------------------------------------
  // Google OAuth2 Strategy
  // ----------------------------------------------------------------
  if (config.google.clientId && config.google.clientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.google.clientId,
          clientSecret: config.google.clientSecret,
          callbackURL: config.google.callbackUrl,
          scope: ['email', 'profile'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value?.toLowerCase();
            const displayName = profile.displayName || profile.name?.givenName || '';
            const avatarUrl = profile.photos?.[0]?.value;

            // Try to find by googleId first
            let user = await User.findOne({ googleId: profile.id });

            if (!user && email) {
              // Try to link with an existing local account by email
              user = await User.findOne({ email });
              if (user) {
                user.googleId = profile.id;
                user.emailVerified = true;
                if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
                if (!user.displayName && displayName) user.displayName = displayName;
                user.lastLoginAt = new Date();
                await user.save();
              }
            }

            if (!user) {
              // Create new user
              user = await User.create({
                email,
                emailVerified: true,
                authProvider: 'google',
                googleId: profile.id,
                displayName,
                avatarUrl,
                lastLoginAt: new Date(),
              });
            } else {
              user.lastLoginAt = new Date();
              await user.save();
            }

            return done(null, { id: user._id });
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  } else {
    console.warn('Google OAuth2 credentials not configured — Google sign-in disabled.');
  }

  // ----------------------------------------------------------------
  // Apple Strategy
  // ----------------------------------------------------------------
  if (config.apple.clientId && config.apple.teamId && config.apple.keyId && config.apple.privateKey) {
    passport.use(
      new AppleStrategy(
        {
          clientID: config.apple.clientId,
          teamID: config.apple.teamId,
          keyID: config.apple.keyId,
          privateKeyString: config.apple.privateKey,
          callbackURL: config.apple.callbackUrl,
          passReqToCallback: false,
        },
        async (accessToken, refreshToken, idToken, profile, done) => {
          try {
            // Apple sends email + name only on first sign-in
            // idToken.sub is the stable Apple user identifier
            const appleId = idToken.sub;
            const email = idToken.email?.toLowerCase();
            // name comes through only on first auth — stored in profile by passport-apple
            const firstName = profile?.name?.firstName || '';
            const lastName = profile?.name?.lastName || '';
            const displayName = [firstName, lastName].filter(Boolean).join(' ') || email || '';

            let user = await User.findOne({ appleId });

            if (!user && email) {
              // Try to link with existing local account by email
              user = await User.findOne({ email });
              if (user) {
                user.appleId = appleId;
                user.emailVerified = true;
                if (!user.displayName && displayName) user.displayName = displayName;
                user.lastLoginAt = new Date();
                await user.save();
              }
            }

            if (!user) {
              user = await User.create({
                email,
                emailVerified: true,
                authProvider: 'apple',
                appleId,
                displayName,
                lastLoginAt: new Date(),
              });
            } else {
              // Persist displayName on first callback even if user existed via email link
              if (!user.displayName && displayName) user.displayName = displayName;
              user.lastLoginAt = new Date();
              await user.save();
            }

            return done(null, { id: user._id });
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  } else {
    console.warn('Apple Sign In credentials not configured — Apple sign-in disabled.');
  }

  // ----------------------------------------------------------------
  // Local Strategy
  // ----------------------------------------------------------------
  passport.use(
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const user = await User.findOne({ email: email.toLowerCase() });

          if (!user) {
            return done(null, false, { message: 'Invalid email or password.' });
          }

          if (user.authProvider !== 'local' || !user.passwordHash) {
            return done(null, false, {
              message: 'This account uses Google/Apple sign-in.',
            });
          }

          if (!user.emailVerified) {
            return done(null, false, {
              message: 'Please verify your email first.',
              resendAvailable: true,
            });
          }

          const isMatch = await bcrypt.compare(password, user.passwordHash);
          if (!isMatch) {
            return done(null, false, { message: 'Invalid email or password.' });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}
