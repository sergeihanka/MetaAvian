import mongoose from 'mongoose';

const accessorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  category: {
    type: String,
    enum: ['hat', 'scarf', 'glasses', 'backpack'],
    required: true,
  },
  cost: { type: Number, required: true },
  description: String,
  iconPath: String,
  fullPath: String,
  overlayStyle: { type: Object, default: {} },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

accessorySchema.index({ slug: 1 }, { unique: true });
accessorySchema.index({ category: 1, isActive: 1 });
accessorySchema.index({ sortOrder: 1 });

const Accessory = mongoose.model('Accessory', accessorySchema);
export default Accessory;
