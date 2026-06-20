/**
 * db-setup-dev.js
 *
 * One-shot setup for aviary-dev:
 *   1. Flag 8 starter birds as isStarterEligible (from birds or allbirds collection)
 *   2. Upsert 50 hats into accessories
 *   3. Migrate user fields: featherBalance → berryBalance, featherLifetime → berryLifetime,
 *      featherHistory → berryHistory
 *
 * Usage: node scripts/db-setup-dev.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI env var is required');

await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
console.log('Connected to aviary-dev\n');

// ── 1. Starter birds ─────────────────────────────────────────────────────────

const STARTER_TAX_IDS = [8839, 52644, 48882, 56350, 13489, 45374, 43693, 9580];
const STARTER_NAMES = [
  'mallard', 'bald eagle', 'American robin', 'great horned owl',
  'northern cardinal', 'blue jay', 'Canada goose', 'house sparrow',
];

const birdsCol = db.collection('birds');
const allBirdsCol = db.collectionNames ? null : null; // resolved below

const collectionNames = await db.listCollections().toArray().then((c) => c.map((x) => x.name));
const hasAllBirds = collectionNames.includes('allbirds');

console.log('=== STARTERS ===');
console.log(`Collections available: ${collectionNames.join(', ')}`);

for (let i = 0; i < STARTER_TAX_IDS.length; i++) {
  const taxId = STARTER_TAX_IDS[i];
  const commonName = STARTER_NAMES[i];

  // Try to flag existing bird by ncbiTaxId
  let result = await birdsCol.updateOne(
    { ncbiTaxId: taxId },
    { $set: { isStarterEligible: true, isActive: true } },
  );

  if (result.matchedCount > 0) {
    console.log(`  ✓ [ncbiTaxId=${taxId}] ${commonName} — flagged`);
    continue;
  }

  // Try by commonName (case-insensitive)
  result = await birdsCol.updateOne(
    { commonName: { $regex: new RegExp(`^${commonName}$`, 'i') } },
    { $set: { isStarterEligible: true, isActive: true } },
  );

  if (result.matchedCount > 0) {
    console.log(`  ✓ [name match] ${commonName} — flagged`);
    continue;
  }

  // Try allbirds collection (if it exists)
  if (hasAllBirds) {
    const source = await db.collection('allbirds').findOne(
      { $or: [{ ncbiTaxId: taxId }, { commonName: { $regex: new RegExp(`^${commonName}$`, 'i') } }] },
    );
    if (source) {
      const { _id: _ignored, ...rest } = source;
      await birdsCol.updateOne(
        { ncbiTaxId: source.ncbiTaxId || taxId },
        { $set: { ...rest, isStarterEligible: true, isActive: true } },
        { upsert: true },
      );
      console.log(`  ✓ [from allbirds] ${commonName} — upserted`);
      continue;
    }
  }

  // Insert minimal record so aviary doesn't break
  await birdsCol.updateOne(
    { ncbiTaxId: taxId },
    {
      $setOnInsert: {
        commonName,
        scientificName: '',
        ncbiTaxId: taxId,
        order: '',
        family: '',
        ancestorPath: [],
        ancestorNames: [],
        ancestorRanks: [],
        isActive: true,
        isStarterEligible: true,
        iconUrl: '',
        accentColor: '#169A43',
        wikiTitle: '',
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  console.log(`  ⚠ [inserted minimal] ${commonName}`);
}

const starterCount = await birdsCol.countDocuments({ isStarterEligible: true, isActive: true });
console.log(`\nStarter-eligible birds in DB: ${starterCount}\n`);

// ── 2. Fifty hats ─────────────────────────────────────────────────────────────

const HATS = [
  { name: 'Robin Hood Cap',           slug: 'robin-hood-cap',           cost: 15, description: 'A classic forest green pointed cap with a feather.' },
  { name: 'Kingfisher Crown',         slug: 'kingfisher-crown',         cost: 25, description: 'A jewelled crown fit for the boldest fisher.' },
  { name: 'Eagle Scout Beret',        slug: 'eagle-scout-beret',        cost: 20, description: 'Navy beret with a golden eagle badge.' },
  { name: 'Pelican Bucket Hat',       slug: 'pelican-bucket-hat',       cost: 12, description: 'Wide-brimmed and ready for the coast.' },
  { name: 'Flamingo Fez',             slug: 'flamingo-fez',             cost: 18, description: 'Vibrant pink fez with a tiny tassel.' },
  { name: 'Owl Wizard Hat',           slug: 'owl-wizard-hat',           cost: 30, description: 'Tall pointed hat covered in moon and star motifs.' },
  { name: 'Peacock Feathered Cap',    slug: 'peacock-feathered-cap',    cost: 35, description: 'Iridescent cap adorned with peacock plumes.' },
  { name: 'Toucan Party Hat',         slug: 'toucan-party-hat',         cost: 22, description: 'Colourful cone hat — perfect for celebrations.' },
  { name: 'Parrot Pirate Tricorn',    slug: 'parrot-pirate-tricorn',    cost: 28, description: 'Three-cornered hat with a tiny parrot perched on top.' },
  { name: 'Hummingbird Flower Crown', slug: 'hummingbird-flower-crown', cost: 20, description: 'A delicate crown of tropical blooms.' },
  { name: 'Swan Lake Tiara',          slug: 'swan-lake-tiara',          cost: 40, description: 'Elegant crystal tiara inspired by the ballet.' },
  { name: 'Canary Conductor Hat',     slug: 'canary-conductor-hat',     cost: 25, description: 'Miniature baton sold separately.' },
  { name: 'Cardinal Red Cap',         slug: 'cardinal-red-cap',         cost: 15, description: 'Bright red skullcap — unmistakably bold.' },
  { name: 'Blue Jay Baseball Cap',    slug: 'blue-jay-baseball-cap',    cost: 12, description: 'Classic blue-and-white cap. Play ball!' },
  { name: 'Crow Top Hat',             slug: 'crow-top-hat',             cost: 30, description: 'Glossy black silk top hat for the discerning crow.' },
  { name: 'Falcon Aviator Cap',       slug: 'falcon-aviator-cap',       cost: 35, description: 'Brown leather cap with goggles pushed up.' },
  { name: 'Penguin Tuxedo Hat',       slug: 'penguin-tuxedo-hat',       cost: 25, description: 'A tiny satin top hat to complete the tux.' },
  { name: 'Macaw Rainbow Beanie',     slug: 'macaw-rainbow-beanie',     cost: 20, description: 'Striped in every colour of the rainbow.' },
  { name: 'Stork Delivery Cap',       slug: 'stork-delivery-cap',       cost: 18, description: 'Soft white cap with a tiny bundle charm.' },
  { name: 'Albatross Sailor Hat',     slug: 'albatross-sailor-hat',     cost: 22, description: 'Navy-and-white sailor cap. Ahoy!' },
  { name: 'Woodpecker Hard Hat',      slug: 'woodpecker-hard-hat',      cost: 15, description: 'Yellow safety helmet — OSHA approved.' },
  { name: 'Ostrich Cowboy Hat',       slug: 'ostrich-cowboy-hat',       cost: 28, description: 'Wide-brimmed Stetson for the tallest bird in the west.' },
  { name: 'Wren Pixie Cap',           slug: 'wren-pixie-cap',           cost: 15, description: 'Tiny pointy cap for the smallest adventurer.' },
  { name: 'Finch Sun Hat',            slug: 'finch-sun-hat',            cost: 18, description: 'Straw sunhat with a yellow ribbon.' },
  { name: 'Raven Gothic Crown',       slug: 'raven-gothic-crown',       cost: 35, description: 'Dark iron crown etched with arcane symbols.' },
  { name: 'Sparrow Newsboy Cap',      slug: 'sparrow-newsboy-cap',      cost: 12, description: 'Tweed flat-cap for the city-street sparrow.' },
  { name: 'Magpie Bowler Hat',        slug: 'magpie-bowler-hat',        cost: 22, description: 'Black bowler with a silver hatband.' },
  { name: 'Starling Sequin Beret',    slug: 'starling-sequin-beret',    cost: 20, description: 'Iridescent sequins that catch every light.' },
  { name: 'Ibis Chef\'s Toque',       slug: 'ibis-chef-toque',          cost: 18, description: 'Tall white chef hat — ready to cook.' },
  { name: 'Kiwi Fuzzy Beanie',        slug: 'kiwi-fuzzy-beanie',        cost: 15, description: 'Brown fuzzy beanie, round and cosy.' },
  { name: 'Cockatoo Punk Mohawk',     slug: 'cockatoo-punk-mohawk',     cost: 30, description: 'Electric crest-style mohawk headband.' },
  { name: 'Vulture Viking Helmet',    slug: 'vulture-viking-helmet',    cost: 35, description: 'Horned helmet forged in the high thermals.' },
  { name: 'Puffin Sailor Cap',        slug: 'puffin-sailor-cap',        cost: 25, description: 'Jaunty cap in Atlantic navy and white.' },
  { name: 'Crane Origami Hat',        slug: 'crane-origami-hat',        cost: 20, description: 'Folded paper hat in the shape of a crane.' },
  { name: 'Dove Bridal Veil',         slug: 'dove-bridal-veil',         cost: 28, description: 'Sheer white veil trailing behind a pearl headband.' },
  { name: 'Quail Bonnet',             slug: 'quail-bonnet',             cost: 15, description: 'Floral bonnet with a little topknot.' },
  { name: 'Nighthawk Night-Vis Cap',  slug: 'nighthawk-night-vis-cap',  cost: 22, description: 'Dark cap with glowing trim — ready for the night shift.' },
  { name: 'Snowy Owl Winter Cap',     slug: 'snowy-owl-winter-cap',     cost: 25, description: 'White fluffy cap with ear flaps.' },
  { name: 'Woodcock Flat Cap',        slug: 'woodcock-flat-cap',        cost: 15, description: 'Classic countryside flat cap in earthy tweed.' },
  { name: 'Grebe Diving Helmet',      slug: 'grebe-diving-helmet',      cost: 20, description: 'Sleek streamlined helmet for underwater birds.' },
  { name: 'Lark Morning Cap',         slug: 'lark-morning-cap',         cost: 15, description: 'Soft cotton cap worn at the crack of dawn.' },
  { name: 'Swift Aeronaut Cap',       slug: 'swift-aeronaut-cap',       cost: 22, description: 'Slim flying cap — zero drag, maximum speed.' },
  { name: 'Harrier Patrol Cap',       slug: 'harrier-patrol-cap',       cost: 25, description: 'Military-style flat-top patrol cap.' },
  { name: 'Bunting Party Cone',       slug: 'bunting-party-cone',       cost: 12, description: 'Festive striped party cone hat.' },
  { name: 'Curlew Explorer Hat',      slug: 'curlew-explorer-hat',      cost: 20, description: 'Khaki bush hat with a wide brim.' },
  { name: 'Egret Feathered Pillbox',  slug: 'egret-feathered-pillbox',  cost: 30, description: 'Elegant pillbox adorned with white plumes.' },
  { name: 'Mockingbird Jester Hat',   slug: 'mockingbird-jester-hat',   cost: 22, description: 'Four-pointed jester hat with bells on each tip.' },
  { name: 'Tanager Tropical Hat',     slug: 'tanager-tropical-hat',     cost: 25, description: 'Vivid straw hat with a tropical-flower band.' },
  { name: 'Warbler Wayfarer Cap',     slug: 'warbler-wayfarer-cap',     cost: 18, description: 'Simple canvas cap for the always-migrating bird.' },
  { name: 'Condor Mountain Hat',      slug: 'condor-mountain-hat',      cost: 40, description: 'The rarest hat — worn only at the highest peaks.' },
];

const accessoriesCol = db.collection('accessories');
console.log('=== HATS ===');
let inserted = 0;
let skipped = 0;

for (let i = 0; i < HATS.length; i++) {
  const hat = HATS[i];
  const result = await accessoriesCol.updateOne(
    { slug: hat.slug },
    {
      $setOnInsert: {
        ...hat,
        category: 'hat',
        iconPath: '',
        fullPath: '',
        overlayStyle: {},
        isActive: true,
        sortOrder: i + 1,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  if (result.upsertedCount > 0) {
    inserted++;
    console.log(`  + ${hat.name}`);
  } else {
    skipped++;
  }
}
console.log(`\nHats inserted: ${inserted}  already existed: ${skipped}\n`);

// ── 3. Migrate feather → berry fields on users ───────────────────────────────

console.log('=== USER FIELD MIGRATION (feather → berry) ===');

const usersCol = db.collection('users');

const needsMigration = await usersCol.countDocuments({ featherBalance: { $exists: true } });
console.log(`Users with old featherBalance field: ${needsMigration}`);

if (needsMigration > 0) {
  const renameResult = await usersCol.updateMany(
    { featherBalance: { $exists: true } },
    {
      $rename: {
        featherBalance: 'berryBalance',
        featherLifetime: 'berryLifetime',
        featherHistory: 'berryHistory',
      },
    },
  );
  console.log(`  Migrated: ${renameResult.modifiedCount} users`);
} else {
  console.log('  Already migrated — nothing to do.');
}

console.log('\nDone.');
await mongoose.disconnect();
