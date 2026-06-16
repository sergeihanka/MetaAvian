/**
 * sync-db.js
 *
 * Syncs MongoDB with the curated bird list at Downloads/aviary.birds.json.
 *
 * Steps:
 *   1. Load curated ncbiTaxIds from the JSON export.
 *   2. Deactivate birds NOT in the curated set (isActive = false).
 *   3. Reactivate birds that ARE in the curated set (isActive = true).
 *   4. Remove taxonomy nodes not referenced by any active bird.
 *   5. Find daily puzzles pointing to deactivated birds.
 *   6. Reassign those puzzle slots to spare active birds (round-robin).
 *   7. Print a full summary.
 *
 * Usage: node scripts/sync-db.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Bird from '../src/models/Bird.js';
import TaxonomyNode from '../src/models/TaxonomyNode.js';
import DailyPuzzle from '../src/models/DailyPuzzle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to curated JSON export (mongoimport/mongoexport format)
const CURATED_JSON = path.join(
  'C:\\Users\\sergeihanka\\Downloads',
  'aviary.birds.json'
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== MetaAviary DB Sync ===\n');

  // ── Step 0: Load curated JSON ─────────────────────────────────────────────
  if (!fs.existsSync(CURATED_JSON)) {
    console.error(`Curated JSON not found at: ${CURATED_JSON}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CURATED_JSON, 'utf8');
  const curatedDocs = JSON.parse(raw);
  const curatedTaxIds = new Set(curatedDocs.map((d) => Number(d.ncbiTaxId)));
  console.log(`Curated JSON: ${curatedDocs.length} birds (${curatedTaxIds.size} unique taxIds)`);

  // ── Connect ───────────────────────────────────────────────────────────────
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 5,
  });
  const dbName = mongoose.connection.db.databaseName;
  console.log(`Connected → ${dbName}`);

  // ── Step 1: Audit birds ───────────────────────────────────────────────────
  console.log('\n── Birds ─────────────────────────────────────────────────────');
  const allBirds = await Bird.find({}, { _id: 1, ncbiTaxId: 1, commonName: 1, isActive: 1 }).lean();
  console.log(`  Total birds in DB: ${allBirds.length}`);

  const toDeactivate = allBirds.filter((b) => !curatedTaxIds.has(b.ncbiTaxId) && b.isActive);
  const toReactivate = allBirds.filter((b) => curatedTaxIds.has(b.ncbiTaxId) && !b.isActive);
  const alreadyActive = allBirds.filter((b) => curatedTaxIds.has(b.ncbiTaxId) && b.isActive);
  const notInDb = [...curatedTaxIds].filter((id) => !allBirds.some((b) => b.ncbiTaxId === id));

  console.log(`  Already active & in curated set : ${alreadyActive.length}`);
  console.log(`  To deactivate (not in curated)  : ${toDeactivate.length}`);
  console.log(`  To reactivate (back in curated) : ${toReactivate.length}`);
  console.log(`  In curated JSON but not in DB   : ${notInDb.length}`);

  let deactivated = 0;
  let reactivated = 0;

  if (toDeactivate.length > 0) {
    const ids = toDeactivate.map((b) => b._id);
    const r = await Bird.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } });
    deactivated = r.modifiedCount;
    console.log(`  ✓ Deactivated: ${deactivated}`);
    if (toDeactivate.length <= 30) {
      toDeactivate.forEach((b) => console.log(`      - ${b.commonName} (taxId ${b.ncbiTaxId})`));
    } else {
      toDeactivate.slice(0, 10).forEach((b) => console.log(`      - ${b.commonName} (taxId ${b.ncbiTaxId})`));
      console.log(`      ... and ${toDeactivate.length - 10} more`);
    }
  }

  if (toReactivate.length > 0) {
    const ids = toReactivate.map((b) => b._id);
    const r = await Bird.updateMany({ _id: { $in: ids } }, { $set: { isActive: true } });
    reactivated = r.modifiedCount;
    console.log(`  ✓ Reactivated: ${reactivated}`);
  }

  if (notInDb.length > 0) {
    console.log(`  ⚠  ${notInDb.length} curated taxIds are NOT in the DB.`);
    console.log('     Run "npm run seed:birds" after importing the JSON to add them.');
  }

  // Final active count
  const activeCount = await Bird.countDocuments({ isActive: true });
  console.log(`  Active birds after sync: ${activeCount}`);

  // ── Step 2: Taxonomy nodes ────────────────────────────────────────────────
  console.log('\n── Taxonomy Nodes ────────────────────────────────────────────');
  const activeBirds = await Bird.find({ isActive: true }, { ancestorPath: 1 }).lean();

  // Collect all taxIds referenced by active birds' ancestorPaths
  const referencedTaxIds = new Set();
  for (const b of activeBirds) {
    if (Array.isArray(b.ancestorPath)) {
      b.ancestorPath.forEach((id) => referencedTaxIds.add(id));
    }
  }
  console.log(`  TaxIds referenced by active birds: ${referencedTaxIds.size}`);

  const totalNodes = await TaxonomyNode.countDocuments();
  console.log(`  Taxonomy nodes in DB: ${totalNodes}`);

  // Find nodes whose taxId is not referenced by any active bird
  const orphanedNodes = await TaxonomyNode.find(
    { taxId: { $nin: Array.from(referencedTaxIds) } },
    { taxId: 1, name: 1, rank: 1 }
  ).lean();
  console.log(`  Orphaned nodes (unreferenced): ${orphanedNodes.length}`);

  let deletedNodes = 0;
  if (orphanedNodes.length > 0) {
    const orphanTaxIds = orphanedNodes.map((n) => n.taxId);
    const r = await TaxonomyNode.deleteMany({ taxId: { $in: orphanTaxIds } });
    deletedNodes = r.deletedCount;
    console.log(`  ✓ Deleted ${deletedNodes} orphaned taxonomy nodes`);
    if (orphanedNodes.length <= 20) {
      orphanedNodes.forEach((n) => console.log(`      - ${n.name} (${n.rank}, taxId ${n.taxId})`));
    } else {
      orphanedNodes.slice(0, 10).forEach((n) => console.log(`      - ${n.name} (${n.rank}, taxId ${n.taxId})`));
      console.log(`      ... and ${orphanedNodes.length - 10} more`);
    }
  }

  const remainingNodes = await TaxonomyNode.countDocuments();
  console.log(`  Taxonomy nodes after sync: ${remainingNodes}`);

  // ── Step 3: Daily puzzles ─────────────────────────────────────────────────
  console.log('\n── Daily Puzzles ─────────────────────────────────────────────');
  const allPuzzles = await DailyPuzzle.find({}).lean();
  console.log(`  Total puzzle slots: ${allPuzzles.length}`);

  // Get the set of active bird _ids
  const activeBirdDocs = await Bird.find({ isActive: true }, { _id: 1, commonName: 1 }).lean();
  const activeBirdIdSet = new Set(activeBirdDocs.map((b) => b._id.toString()));

  // Find puzzles pointing to inactive birds
  const brokenPuzzles = allPuzzles.filter(
    (p) => !activeBirdIdSet.has(p.birdId?.toString())
  );
  console.log(`  Puzzles with deactivated birds: ${brokenPuzzles.length}`);

  if (brokenPuzzles.length > 0) {
    // Find active birds not already used in any remaining valid puzzle
    const usedBirdIds = new Set(
      allPuzzles
        .filter((p) => activeBirdIdSet.has(p.birdId?.toString()))
        .map((p) => p.birdId.toString())
    );

    const availableSpares = shuffleArray(
      activeBirdDocs.filter((b) => !usedBirdIds.has(b._id.toString()))
    );

    console.log(`  Available spare birds: ${availableSpares.length}`);

    if (availableSpares.length === 0) {
      // All active birds are already assigned — cycle through active birds
      console.log('  No spare birds available; cycling through active birds for reassignment.');
    }

    const reassignOps = [];
    for (let i = 0; i < brokenPuzzles.length; i++) {
      const puzzle = brokenPuzzles[i];
      let replacement;

      if (availableSpares.length > 0) {
        replacement = availableSpares.shift();
      } else {
        // Wrap: pick from active birds cycling, avoiding today's duplicate if possible
        replacement = activeBirdDocs[i % activeBirdDocs.length];
      }

      reassignOps.push({
        updateOne: {
          filter: { _id: puzzle._id },
          update: { $set: { birdId: replacement._id } },
        },
      });

      if (brokenPuzzles.length <= 20) {
        const oldName = '(deactivated)';
        console.log(`      ${puzzle.dateUtc} → reassigned to "${replacement.commonName}"`);
      }
    }

    if (reassignOps.length > 0) {
      const r = await DailyPuzzle.bulkWrite(reassignOps, { ordered: false });
      console.log(`  ✓ Reassigned ${r.modifiedCount} puzzle slots`);
    }
  }

  // Verify no puzzles remain with inactive birds
  const stillBroken = await DailyPuzzle.aggregate([
    {
      $lookup: {
        from: 'birds',
        localField: 'birdId',
        foreignField: '_id',
        as: 'bird',
      },
    },
    { $unwind: '$bird' },
    { $match: { 'bird.isActive': false } },
    { $count: 'total' },
  ]);
  const brokenAfter = stillBroken[0]?.total ?? 0;
  console.log(`  Puzzles still pointing to inactive birds: ${brokenAfter}`);
  if (brokenAfter > 0) {
    console.log('  ⚠  Some puzzles could not be reassigned (not enough active birds).');
  }

  const puzzleDateRange = allPuzzles.length > 0
    ? `${allPuzzles.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))[0].dateUtc} → ${allPuzzles[allPuzzles.length - 1].dateUtc}`
    : 'none';
  console.log(`  Puzzle date range: ${puzzleDateRange}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SYNC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Birds deactivated:            ${deactivated}`);
  console.log(`  Birds reactivated:            ${reactivated}`);
  console.log(`  Active birds (final):         ${activeCount}`);
  console.log(`  Taxonomy nodes deleted:       ${deletedNodes}`);
  console.log(`  Taxonomy nodes remaining:     ${remainingNodes}`);
  console.log(`  Puzzle slots reassigned:      ${brokenPuzzles.length}`);
  console.log(`  Puzzle slots with issues:     ${brokenAfter}`);
  if (notInDb.length > 0) {
    console.log(`\n  ⚠  ${notInDb.length} curated birds are missing from the DB.`);
    console.log('     Import aviary.birds.json with mongoimport, then re-run this script.');
  } else {
    console.log('\n  ✓ All curated birds are present in the DB.');
  }

  await mongoose.disconnect();
  console.log('\nDone. MongoDB disconnected.');
}

main().catch((err) => {
  console.error('\nSync failed:', err);
  process.exit(1);
});
