// Run with: mongosh YOUR_CONNECTION_STRING scripts/set-todays-puzzle.mongo.js

const today = (() => {
  const shifted = new Date(Date.now() - 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
})();

print(`Today's puzzle date: ${today}`);

// Bird IDs already used in other puzzles
const usedBirdIds = db.dailypuzzles
  .find({ dateUtc: { $ne: today } }, { birdId: 1 })
  .toArray()
  .map(p => p.birdId);

// Pick a random unused active bird
const candidates = db.birds
  .find({ isActive: true, _id: { $nin: usedBirdIds } })
  .toArray();

if (candidates.length === 0) {
  print('ERROR: No unused birds available!');
  quit(1);
}

const bird = candidates[Math.floor(Math.random() * candidates.length)];
print(`Selected: ${bird.commonName} (${bird.scientificName})`);

db.dailypuzzles.updateOne(
  { dateUtc: today },
  {
    $set: {
      birdId: bird._id,
      puzzleNumber: 3,
      isActive: true,
      resetCount: 0,
      createdAt: new Date(),
    },
  },
  { upsert: true }
);

print(`✓ Puzzle #3 set for ${today}: ${bird.commonName}`);
print('Restart your server to clear the in-memory cache.');
