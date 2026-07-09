/**
 * migrate-sessions-resetcount.js
 *
 * Backfills `resetCount: 0` on gamesessions written before resetCount became
 * part of a session's identity, and drops the obsolete `gameState` blob.
 *
 * Run once per database BEFORE deploying the server-driven session change.
 * Without it, the new unique indexes treat the missing resetCount as null and
 * a returning player's session for today would not be found — they would start
 * over on a puzzle they had already begun.
 *
 * Safe to run more than once.
 *
 * Usage: node scripts/migrate-sessions-resetcount.js
 *        MONGODB_URI=<uri> node scripts/migrate-sessions-resetcount.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import config from '../src/config/index.js';

async function main() {
  const uri = process.env.MONGODB_URI || config.mongoUri;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = mongoose.connection.db;
  console.log(`Connected → ${db.databaseName}\n`);

  const sessions = db.collection('gamesessions');

  const total = await sessions.countDocuments();
  const missing = await sessions.countDocuments({ resetCount: { $exists: false } });
  console.log(`gamesessions: ${total} total, ${missing} missing resetCount`);

  if (missing > 0) {
    const r = await sessions.updateMany(
      { resetCount: { $exists: false } },
      { $set: { resetCount: 0 } }
    );
    console.log(`  ✓ backfilled resetCount=0 on ${r.modifiedCount}`);
  }

  const withBlob = await sessions.countDocuments({ gameState: { $exists: true } });
  if (withBlob > 0) {
    const r = await sessions.updateMany({ gameState: { $exists: true } }, { $unset: { gameState: '' } });
    console.log(`  ✓ dropped stale gameState blob from ${r.modifiedCount}`);
  }

  // A pre-existing duplicate would make the new unique indexes fail to build.
  const dupes = await sessions.aggregate([
    {
      $group: {
        _id: { d: '$puzzleDate', r: '$resetCount', u: '$userId', g: '$guestId' },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();

  if (dupes.length > 0) {
    console.log(`\n  ⚠  ${dupes.length} duplicate (puzzleDate, resetCount, player) group(s):`);
    dupes.slice(0, 10).forEach((d) => console.log(`      ${JSON.stringify(d._id)} × ${d.n}`));
    console.log('     Resolve these before the unique indexes can build.');
  } else {
    console.log('  ✓ no duplicate sessions — unique indexes will build cleanly');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
