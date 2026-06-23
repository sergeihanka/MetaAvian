// seed-starters.mongo.js
// Paste into MongoDB Compass mongosh shell with the correct database selected.
//
// Step 1 — diagnose
print("Total birds:", db.birds.countDocuments());
print("Starter-eligible:", db.birds.countDocuments({ isStarterEligible: true, isActive: true }));

// ---------------------------------------------------------------------------
// PATH A: birds exist (NCBI seed was run) — just flag the 8 starters
// ---------------------------------------------------------------------------
const starterTaxIds = [
  8839,   // mallard
  52644,  // bald eagle
  48882,  // American robin
  56350,  // great horned owl
  13489,  // northern cardinal
  45374,  // blue jay
  43693,  // Canada goose
  9580,   // house sparrow
];

const flagResult = db.birds.updateMany(
  { ncbiTaxId: { $in: starterTaxIds } },
  { $set: { isStarterEligible: true } }
);
print("PATH A — Matched:", flagResult.matchedCount, " Modified:", flagResult.modifiedCount);

// ---------------------------------------------------------------------------
// PATH B: DB is empty — insert minimal starter records
// Run only if PATH A matched 0 documents.
// Fill in iconUrl/accentColor once assets are ready.
// ---------------------------------------------------------------------------
if (flagResult.matchedCount === 0) {
  db.birds.insertMany([
    { commonName: "mallard",           scientificName: "Anas platyrhynchos",       ncbiTaxId: 8839,  order: "Anseriformes",    family: "Anatidae",     isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#4A7C59", wikiTitle: "Mallard",          ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "bald eagle",        scientificName: "Haliaeetus leucocephalus", ncbiTaxId: 52644, order: "Accipitriformes", family: "Accipitridae", isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#8B6914", wikiTitle: "Bald_eagle",       ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "American robin",    scientificName: "Turdus migratorius",       ncbiTaxId: 48882, order: "Passeriformes",   family: "Turdidae",     isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#C0501E", wikiTitle: "American_robin",   ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "great horned owl",  scientificName: "Bubo virginianus",         ncbiTaxId: 56350, order: "Strigiformes",    family: "Strigidae",    isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#7B6B52", wikiTitle: "Great_horned_owl", ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "northern cardinal", scientificName: "Cardinalis cardinalis",    ncbiTaxId: 13489, order: "Passeriformes",   family: "Cardinalidae", isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#CC2200", wikiTitle: "Northern_cardinal",ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "blue jay",          scientificName: "Cyanocitta cristata",      ncbiTaxId: 45374, order: "Passeriformes",   family: "Corvidae",     isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#2B65B5", wikiTitle: "Blue_jay",         ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "Canada goose",      scientificName: "Branta canadensis",        ncbiTaxId: 43693, order: "Anseriformes",    family: "Anatidae",     isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#3D3D3D", wikiTitle: "Canada_goose",     ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
    { commonName: "house sparrow",     scientificName: "Passer domesticus",        ncbiTaxId: 9580,  order: "Passeriformes",   family: "Passeridae",   isActive: true, isStarterEligible: true, iconUrl: "", accentColor: "#A0795A", wikiTitle: "House_sparrow",    ancestorPath: [], ancestorNames: [], ancestorRanks: [] },
  ]);
  print("PATH B — Inserted 8 minimal starter birds.");
}
