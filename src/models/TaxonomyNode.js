import mongoose from 'mongoose';

const taxonomyNodeSchema = new mongoose.Schema({
  taxId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  rank: { type: String, required: true },
  parentTaxId: { type: Number, default: null }, // null for Aves root
  depth: { type: Number, required: true },
  childTaxIds: [Number],
  commonLabel: String,
});

taxonomyNodeSchema.index({ taxId: 1 }, { unique: true });
taxonomyNodeSchema.index({ parentTaxId: 1 });

const TaxonomyNode = mongoose.model('TaxonomyNode', taxonomyNodeSchema);
export default TaxonomyNode;
