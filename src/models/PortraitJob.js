import mongoose from 'mongoose';

const portraitJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', required: true },
    hatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Accessory', default: null },
    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    resultUrl: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

portraitJobSchema.index({ userId: 1, birdId: 1, status: 1 });
portraitJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('PortraitJob', portraitJobSchema);
