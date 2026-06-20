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
  firstName: String,
  lastName: String,
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
  berryBalance: { type: Number, default: 0, min: 0 },
  berryLifetime: { type: Number, default: 0 },
  aviaryBirds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }],
  aviaryStarterPicked: { type: Boolean, default: false },
  activeBirdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', default: null },
  ownedAccessories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Accessory' }],
  birdEquipment: { type: Map, of: String, default: {} },
  berryHistory: [{
    date: { type: Date, default: Date.now },
    amount: Number,
    reason: String,
    puzzleDate: String,
  }],
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ appleId: 1 }, { sparse: true });
userSchema.index({ emailVerifyToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ berryBalance: 1 });
userSchema.index({ aviaryBirds: 1 });
userSchema.index({ activeBirdId: 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);
export default User;
