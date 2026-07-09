/**
 * set-todays-puzzle.js
 *
 * Picks a random active bird and sets it as today's puzzle (puzzle #3).
 * Avoids birds already used in previous puzzles.
 * Resets resetCount to 0 so all clients start fresh.
 *
 * Usage: node scripts/set-todays-puzzle.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Bird from '../src/models/Bird.js';
import DailyPuzzle from '../src/models/DailyPuzzle.js';

function getPuzzleDate() {
  const shifted = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(shifted);
}

await mongoose.connect(config.mongoUri);
console.log('Connected to MongoDB');

const today = getPuzzleDate();
console.log(`Today's puzzle date: ${today}`);

// Find all bird IDs already used in other puzzles (not today's)
const usedPuzzles = await DailyPuzzle.find({ dateUtc: { $ne: today } }).lean();
const usedBirdIds = new Set(usedPuzzles.map(p => String(p.birdId)));

// Pick a random unused active bird
const candidates = await Bird.find({
  isActive: true,
  _id: { $nin: [...usedBirdIds] },
}).lean();

if (candidates.length === 0) {
  console.error('No unused birds available!');
  process.exit(1);
}

const bird = candidates[Math.floor(Math.random() * candidates.length)];
console.log(`Selected bird: ${bird.commonName} (${bird.scientificName})`);

// Upsert today's puzzle as #3
const result = await DailyPuzzle.findOneAndUpdate(
  { dateUtc: today },
  {
    birdId: bird._id,
    puzzleNumber: 3,
    isActive: true,
    resetCount: 0,
  },
  { upsert: true, new: true }
);

console.log(`✓ Puzzle #${result.puzzleNumber} set for ${today}: ${bird.commonName}`);
console.log('Restart your server (or wait for cache to expire) for the change to take effect.');

await mongoose.disconnect();
