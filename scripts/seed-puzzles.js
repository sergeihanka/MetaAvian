/**
 * seed-puzzles.js
 *
 * Generates 365 daily puzzle entries starting from 2026-06-16.
 * Shuffles the bird list with Fisher-Yates and assigns one bird per day.
 * Uses upsert-skip semantics — will not overwrite existing puzzles.
 *
 * Usage: node scripts/seed-puzzles.js
 * Requires: birds already seeded (run seed-birds.js first)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Bird from '../src/models/Bird.js';
import DailyPuzzle from '../src/models/DailyPuzzle.js';

/** Fisher-Yates shuffle — mutates the array in place. */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Format a Date as YYYY-MM-DD (UTC). */
function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

/** Add N days to a date, returns a new Date. */
function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function main() {
  console.log('=== Aviary Puzzle Seeder ===');

  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
  });
  console.log('Connected.');

  // Load active birds
  const birds = await Bird.find({ isActive: true }, { _id: 1, commonName: 1 }).lean();
  if (birds.length === 0) {
    console.error('No active birds found. Run seed:birds first.');
    process.exit(1);
  }
  console.log(`Loaded ${birds.length.toLocaleString()} active birds.`);

  // Fisher-Yates shuffle
  const shuffled = shuffleArray([...birds]);

  // Generate 365 dates starting 2026-06-16
  const START_DATE = new Date(Date.UTC(2026, 5, 16)); // month is 0-indexed
  const TOTAL_DAYS = 365;

  const operations = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const date = addDays(START_DATE, i);
    const dateUtc = formatDateUtc(date);
    const bird = shuffled[i % shuffled.length];

    operations.push({
      updateOne: {
        filter: { dateUtc },
        update: {
          $setOnInsert: {
            dateUtc,
            birdId: bird._id,
            puzzleNumber: i + 1,
            isActive: true,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  console.log(`Upserting ${TOTAL_DAYS} puzzle entries (skip on conflict)...`);
  const result = await DailyPuzzle.bulkWrite(operations, { ordered: false });

  console.log('\n=== Seed Summary ===');
  console.log(`  Puzzles inserted: ${result.upsertedCount}`);
  console.log(`  Puzzles skipped (already existed): ${result.matchedCount}`);
  console.log(`  Date range: ${formatDateUtc(START_DATE)} → ${formatDateUtc(addDays(START_DATE, TOTAL_DAYS - 1))}`);

  await mongoose.disconnect();
  console.log('Done. MongoDB disconnected.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
