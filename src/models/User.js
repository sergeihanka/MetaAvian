import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: String,
  emailVerifyExpires: Date,
  passwordHash: String,
  authProvider: {
    type: String,
    enum: ['local', 'google', 'apple'],
    required: true,
  },
  googleId: String,
  appleId: String,
  displayName: String,
  avatarUrl: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
  stats: {
    totalPlayed: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    guessDistribution: { type: Map, of: Number, default: {} },
    lastPlayedDate: String,
  },
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ appleId: 1 }, { sparse: true });
userSchema.index({ emailVerifyToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);
export default User;
