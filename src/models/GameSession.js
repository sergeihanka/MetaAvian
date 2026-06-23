import mongoose from 'mongoose';

const gameSessionSchema = new mongoose.Schema({
  puzzleDate: { type: String, required: true }, // YYYY-MM-DD
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestId: { type: String, default: null },
  guesses: [
    {
      birdId: mongoose.Schema.Types.ObjectId,
      commonName: String,
      lcaTaxId: Number,
      lcaName: String,
      guessNumber: Number,
    },
  ],
  won: Boolean,
  guessCount: Number,
  completedAt: Date,
  durationMs: Number,
  // Full client-side state blob — used to restore the game on another device
  gameState: { type: mongoose.Schema.Types.Mixed, default: null },
});

gameSessionSchema.index({ puzzleDate: 1, userId: 1 });

const GameSession = mongoose.model('GameSession', gameSessionSchema);
export default GameSession;
