import mongoose from 'mongoose';

const dailyPuzzleSchema = new mongoose.Schema({
  dateUtc: { type: String, required: true, unique: true }, // YYYY-MM-DD
  birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', required: true },
  puzzleNumber: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  resetCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

dailyPuzzleSchema.index({ dateUtc: 1 }, { unique: true });

const DailyPuzzle = mongoose.model('DailyPuzzle', dailyPuzzleSchema);
export default DailyPuzzle;
