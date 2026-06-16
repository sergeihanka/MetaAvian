import mongoose from 'mongoose';

const birdSchema = new mongoose.Schema({
  commonName: { type: String, required: true, unique: true },
  commonNameAliases: [String],
  scientificName: { type: String, required: true },
  ncbiTaxId: { type: Number, required: true, unique: true },
  order: String,
  family: String,
  ancestorPath: [Number],     // ordered taxIds from Aves root (8782) to species
  ancestorNames: [String],    // parallel: taxon names
  ancestorRanks: [String],    // parallel: rank labels
  isActive: { type: Boolean, default: true },
  imageUrl: String,
  createdAt: { type: Date, default: Date.now },
});

birdSchema.index({ ncbiTaxId: 1 }, { unique: true });
birdSchema.index({ commonName: 'text', commonNameAliases: 'text' });
birdSchema.index({ isActive: 1 });

const Bird = mongoose.model('Bird', birdSchema);
export default Bird;
