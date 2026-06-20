import { Router } from 'express';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Bird from '../models/Bird.js';
import Accessory from '../models/Accessory.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  purchaseLimiter,
  starterLimiter,
  equipLimiter,
  aviaryMeLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();
const shopCache = new NodeCache({ stdTTL: 3600 });

// ---------------------------------------------------------------------------
// GET /api/v1/aviary/me
// Returns full aviary state for the authenticated user.
// ---------------------------------------------------------------------------

router.get('/me', aviaryMeLimiter, requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id, {
    featherBalance: 1,
    featherLifetime: 1,
    aviaryBirds: 1,
    ownedAccessories: 1,
    birdEquipment: 1,
    activeBirdId: 1,
    aviaryStarterPicked: 1,
  })
    .populate('aviaryBirds', 'commonName scientificName iconUrl accentColor wikiTitle order family')
    .populate('ownedAccessories', 'name slug category cost iconPath fullPath overlayStyle')
    .lean();

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({
    birds: user.aviaryBirds || [],
    featherBalance: user.featherBalance || 0,
    featherLifetime: user.featherLifetime || 0,
    ownedAccessories: user.ownedAccessories || [],
    birdEquipment: user.birdEquipment || {},
    activeBirdId: user.activeBirdId || null,
    aviaryStarterPicked: user.aviaryStarterPicked || false,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/aviary/birds/starters
// Returns the 8 starter-eligible birds. No auth required.
// ---------------------------------------------------------------------------

router.get('/birds/starters', async (req, res) => {
  const birds = await Bird.find({ isStarterEligible: true, isActive: true })
    .select('commonName scientificName iconUrl accentColor wikiTitle order family')
    .lean();
  res.json({ birds });
});

// ---------------------------------------------------------------------------
// POST /api/v1/aviary/starter
// Sets the user's starter bird (one-time action).
// ---------------------------------------------------------------------------

router.post('/starter', starterLimiter, requireAuth, async (req, res) => {
  const { birdId } = req.body;
  if (!birdId || !mongoose.Types.ObjectId.isValid(birdId)) {
    return res.status(400).json({ error: 'A valid birdId is required.' });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.aviaryStarterPicked) {
    return res.status(409).json({ error: 'Starter bird already chosen.' });
  }

  const bird = await Bird.findOne({ _id: birdId, isStarterEligible: true, isActive: true })
    .select('commonName scientificName iconUrl accentColor wikiTitle order family')
    .lean();

  if (!bird) return res.status(404).json({ error: 'Starter bird not found.' });

  user.aviaryBirds = [bird._id];
  user.activeBirdId = bird._id;
  user.aviaryStarterPicked = true;
  await user.save();

  res.json({ bird });
});

// ---------------------------------------------------------------------------
// POST /api/v1/aviary/birds/:birdId/equip
// Equip or unequip an accessory on a bird.
// ---------------------------------------------------------------------------

router.post('/birds/:birdId/equip', equipLimiter, requireAuth, async (req, res) => {
  const { birdId } = req.params;
  const { accessoryId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(birdId)) {
    return res.status(400).json({ error: 'Invalid birdId.' });
  }

  const user = await User.findById(req.user.id, {
    aviaryBirds: 1,
    ownedAccessories: 1,
    birdEquipment: 1,
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const ownsBird = user.aviaryBirds.map((id) => id.toString()).includes(birdId);
  if (!ownsBird) return res.status(403).json({ error: 'You do not own this bird.' });

  if (accessoryId === null || accessoryId === undefined) {
    user.birdEquipment.set(birdId, null);
  } else {
    if (!mongoose.Types.ObjectId.isValid(accessoryId)) {
      return res.status(400).json({ error: 'Invalid accessoryId.' });
    }
    const ownsAccessory = user.ownedAccessories.map((id) => id.toString()).includes(accessoryId);
    if (!ownsAccessory) return res.status(403).json({ error: 'You do not own this accessory.' });
    user.birdEquipment.set(birdId, accessoryId);
  }

  await user.save();

  res.json({
    birdEquipment: Object.fromEntries(user.birdEquipment),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/aviary/shop
// Returns all active accessories. Cached for 1 hour.
// ---------------------------------------------------------------------------

router.get('/shop', async (req, res) => {
  const cached = shopCache.get('shop');
  if (cached) return res.json({ accessories: cached });

  const accessories = await Accessory.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .lean();

  shopCache.set('shop', accessories);
  res.json({ accessories });
});

// ---------------------------------------------------------------------------
// POST /api/v1/aviary/shop/purchase
// Atomically purchase an accessory using feathers.
// ---------------------------------------------------------------------------

router.post('/shop/purchase', purchaseLimiter, requireAuth, async (req, res) => {
  const { accessorySlug } = req.body;
  if (!accessorySlug) return res.status(400).json({ error: 'accessorySlug is required.' });

  const accessory = await Accessory.findOne({ slug: accessorySlug, isActive: true });
  if (!accessory) return res.status(404).json({ error: 'Accessory not found.' });

  const updated = await User.findOneAndUpdate(
    {
      _id: req.user.id,
      featherBalance: { $gte: accessory.cost },
      ownedAccessories: { $nin: [accessory._id] },
    },
    {
      $inc: { featherBalance: -accessory.cost },
      $push: { ownedAccessories: accessory._id },
    },
    { new: true, projection: { featherBalance: 1, ownedAccessories: 1 } }
  ).populate('ownedAccessories', 'name slug category cost iconPath fullPath overlayStyle');

  if (!updated) {
    const user = await User.findById(req.user.id, { featherBalance: 1, ownedAccessories: 1 });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.ownedAccessories.map((id) => id.toString()).includes(accessory._id.toString())) {
      return res.status(409).json({ error: 'You already own this accessory.' });
    }
    return res.status(400).json({ error: 'Insufficient feathers.' });
  }

  res.json({
    featherBalance: updated.featherBalance,
    ownedAccessories: updated.ownedAccessories,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/aviary/feathers
// Returns feather balance and last 30 history entries.
// ---------------------------------------------------------------------------

router.get('/feathers', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id, {
    featherBalance: 1,
    featherHistory: { $slice: -30 },
  }).lean();

  if (!user) return res.status(404).json({ error: 'User not found.' });

  res.json({
    featherBalance: user.featherBalance || 0,
    featherHistory: user.featherHistory || [],
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/aviary/birds/:birdId/info
// Returns Bird document fields. Client fetches wiki separately.
// ---------------------------------------------------------------------------

router.get('/birds/:birdId/info', requireAuth, async (req, res) => {
  const { birdId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(birdId)) {
    return res.status(400).json({ error: 'Invalid birdId.' });
  }

  const user = await User.findById(req.user.id, { aviaryBirds: 1 }).lean();
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const ownsBird = user.aviaryBirds.map((id) => id.toString()).includes(birdId);
  if (!ownsBird) return res.status(403).json({ error: 'You do not own this bird.' });

  const bird = await Bird.findById(birdId)
    .select('commonName scientificName iconUrl accentColor wikiTitle order family')
    .lean();

  if (!bird) return res.status(404).json({ error: 'Bird not found.' });

  res.json({ bird });
});

// ---------------------------------------------------------------------------
// POST /api/v1/aviary/active-bird
// Sets the user's active (nav avatar) bird.
// ---------------------------------------------------------------------------

router.post('/active-bird', requireAuth, async (req, res) => {
  const { birdId } = req.body;
  if (!birdId || !mongoose.Types.ObjectId.isValid(birdId)) {
    return res.status(400).json({ error: 'A valid birdId is required.' });
  }

  const user = await User.findById(req.user.id, { aviaryBirds: 1 });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const ownsBird = user.aviaryBirds.map((id) => id.toString()).includes(birdId);
  if (!ownsBird) return res.status(403).json({ error: 'You do not own this bird.' });

  user.activeBirdId = birdId;
  await user.save();

  res.json({ activeBirdId: birdId });
});

export default router;
