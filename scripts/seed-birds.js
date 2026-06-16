/**
 * seed-birds.js
 *
 * Downloads the NCBI taxonomy taxdump, parses nodes.dmp and names.dmp,
 * and populates the birds and taxonomy_nodes collections.
 *
 * Usage: node scripts/seed-birds.js
 * Requires: MongoDB running, MONGODB_URI in .env
 */

import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Bird from '../src/models/Bird.js';
import TaxonomyNode from '../src/models/TaxonomyNode.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT_DIR, 'tmp');
const TAXDUMP_DIR = path.join(TMP_DIR, 'taxdump');
const TAXDUMP_TGZ = path.join(TMP_DIR, 'taxdump.tar.gz');
const TAXDUMP_URL = 'https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdump.tar.gz';
const AVES_TAX_ID = 8782;

// ---------------------------------------------------------------------------
// Step 1: Download taxdump.tar.gz
// ---------------------------------------------------------------------------

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;
    let lastLoggedMB = 0;

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download taxdump: HTTP ${response.statusCode}`));
        return;
      }
      total = parseInt(response.headers['content-length'] || '0', 10);

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const mb = Math.floor(downloaded / (1024 * 1024));
        if (mb > lastLoggedMB) {
          const pct = total ? ` (${Math.round((downloaded / total) * 100)}%)` : '';
          process.stdout.write(`\r  Downloaded ${mb} MB${pct}   `);
          lastLoggedMB = mb;
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('\n  Download complete.');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Step 2: Parse nodes.dmp
// Fields: tax_id | parent_tax_id | rank | ...
// Delimiter: \t|\t
// ---------------------------------------------------------------------------

async function parseNodes(nodesFile) {
  console.log('  Parsing nodes.dmp...');
  const nodeMap = new Map(); // taxId -> { parentTaxId, rank, children: Set }
  const rl = readline.createInterface({ input: fs.createReadStream(nodesFile), crlfDelay: Infinity });

  for await (const line of rl) {
    const parts = line.split('\t|\t');
    if (parts.length < 3) continue;
    const taxId = parseInt(parts[0].trim(), 10);
    const parentTaxId = parseInt(parts[1].trim(), 10);
    const rank = parts[2].trim();
    nodeMap.set(taxId, { taxId, parentTaxId, rank, children: new Set() });
  }

  // Build children sets
  for (const [taxId, node] of nodeMap) {
    if (taxId === node.parentTaxId) continue; // root node points to itself
    const parent = nodeMap.get(node.parentTaxId);
    if (parent) parent.children.add(taxId);
  }

  console.log(`  Parsed ${nodeMap.size.toLocaleString()} taxonomy nodes.`);
  return nodeMap;
}

// ---------------------------------------------------------------------------
// Step 3: BFS from Aves (8782) to collect all descendant taxIds
// ---------------------------------------------------------------------------

function collectAvesSubtree(nodeMap) {
  console.log(`  Collecting Aves subtree (taxId ${AVES_TAX_ID})...`);
  const avesNodes = new Set();
  const queue = [AVES_TAX_ID];

  while (queue.length > 0) {
    const current = queue.shift();
    avesNodes.add(current);
    const node = nodeMap.get(current);
    if (node) {
      for (const childId of node.children) {
        if (!avesNodes.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  console.log(`  Aves subtree: ${avesNodes.size.toLocaleString()} nodes.`);
  return avesNodes;
}

// ---------------------------------------------------------------------------
// Step 4: Parse names.dmp
// Fields: tax_id | name_txt | unique_name | name_class |
// Delimiter: \t|\t
// ---------------------------------------------------------------------------

async function parseNames(namesFile, avesNodes) {
  console.log('  Parsing names.dmp...');
  // namesMap: taxId -> { scientificName, commonName, commonNameAliases }
  const namesMap = new Map();

  const rl = readline.createInterface({ input: fs.createReadStream(namesFile), crlfDelay: Infinity });

  for await (const line of rl) {
    const parts = line.split('\t|\t');
    if (parts.length < 4) continue;
    const taxId = parseInt(parts[0].trim(), 10);
    if (!avesNodes.has(taxId)) continue;

    const nameTxt = parts[1].trim();
    // last field has trailing \t| — strip it
    const nameClass = parts[3].replace(/\s*\|?\s*$/, '').trim();

    if (!namesMap.has(taxId)) {
      namesMap.set(taxId, { scientificName: null, commonName: null, commonNameAliases: [] });
    }

    const entry = namesMap.get(taxId);

    if (nameClass === 'scientific name') {
      entry.scientificName = nameTxt;
    } else if (nameClass === 'genbank common name') {
      // Highest priority for common name
      entry.commonName = nameTxt;
    } else if (nameClass === 'common name') {
      // Use as primary if no genbank common name yet
      if (!entry.commonName) {
        entry.commonName = nameTxt;
      } else {
        entry.commonNameAliases.push(nameTxt);
      }
    }
  }

  console.log(`  Parsed names for ${namesMap.size.toLocaleString()} Aves nodes.`);
  return namesMap;
}

// ---------------------------------------------------------------------------
// Step 5: Build ancestor path for each species
// Walks from species up to AVES_TAX_ID
// ---------------------------------------------------------------------------

function buildAncestorPath(taxId, nodeMap, namesMap) {
  const path = [];
  let current = taxId;

  // Walk up until we hit Aves or root
  while (current != null) {
    path.unshift(current); // prepend (root-first ordering)
    const node = nodeMap.get(current);
    if (!node) break;
    if (current === AVES_TAX_ID) break;
    if (current === node.parentTaxId) break; // root sentinel
    current = node.parentTaxId;
  }

  const ancestorPath = path;
  const ancestorNames = path.map((id) => namesMap.get(id)?.scientificName || '');
  const ancestorRanks = path.map((id) => nodeMap.get(id)?.rank || '');

  return { ancestorPath, ancestorNames, ancestorRanks };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Aviary Bird Seeder ===');

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
  });
  console.log('Connected.');

  // Ensure tmp directories exist
  fs.mkdirSync(TAXDUMP_DIR, { recursive: true });

  // Step 1: Download (skip if already extracted)
  const nodesFile = path.join(TAXDUMP_DIR, 'nodes.dmp');
  const namesFile = path.join(TAXDUMP_DIR, 'names.dmp');

  if (fs.existsSync(nodesFile)) {
    console.log('taxdump already extracted — skipping download and extraction.');
  } else {
    if (!fs.existsSync(TAXDUMP_TGZ)) {
      console.log(`Downloading taxdump from NCBI...`);
      await downloadFile(TAXDUMP_URL, TAXDUMP_TGZ);
    } else {
      console.log('taxdump.tar.gz already downloaded — skipping download.');
    }

    console.log('Extracting taxdump.tar.gz...');
    // Use POSIX-style paths so Git Bash tar doesn't misinterpret drive letters as hosts.
    // On Windows, fall back to PowerShell if the POSIX path form still fails.
    const posix = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    try {
      await execAsync(`tar -xzf "${posix(TAXDUMP_TGZ)}" -C "${posix(TAXDUMP_DIR)}"`);
    } catch {
      // Fallback: use PowerShell on Windows
      await execAsync(
        `powershell -Command "& { $null = New-Item -ItemType Directory -Force '${TAXDUMP_DIR}'; tar -xzf '${TAXDUMP_TGZ}' -C '${TAXDUMP_DIR}' }"`,
      );
    }
    console.log('Extraction complete.');
  }

  // Step 2: Parse nodes
  const nodeMap = await parseNodes(nodesFile);

  // Step 3: BFS to collect Aves subtree
  const avesNodes = collectAvesSubtree(nodeMap);

  // Step 4: Parse names
  const namesMap = await parseNames(namesFile, avesNodes);

  // Step 5: Filter to species-rank nodes with a common name.
  // Deduplicate by commonName — NCBI has multiple species sharing the same common name.
  // Per PRD: "One species per common name; use the most globally recognized."
  // Strategy: prefer genbank common name entries; for ties, keep the first encountered.
  console.log('Filtering to named bird species...');
  const speciesWithNames = [];
  const seenCommonNames = new Set();

  for (const taxId of avesNodes) {
    const node = nodeMap.get(taxId);
    if (!node || node.rank !== 'species') continue;
    const names = namesMap.get(taxId);
    if (!names || !names.commonName) continue;

    const normalised = names.commonName.toLowerCase().trim();
    if (seenCommonNames.has(normalised)) {
      // Duplicate common name — skip this species per PRD rule
      continue;
    }
    seenCommonNames.add(normalised);
    speciesWithNames.push(taxId);
  }
  console.log(`  Found ${speciesWithNames.length.toLocaleString()} species with unique common names.`);

  // Step 6: Build Bird and TaxonomyNode documents
  console.log('Building documents...');
  const birdDocs = [];
  const taxonomyNodeDocs = new Map(); // taxId -> doc

  let validationErrors = 0;

  for (const taxId of speciesWithNames) {
    const names = namesMap.get(taxId);
    const { ancestorPath, ancestorNames, ancestorRanks } = buildAncestorPath(taxId, nodeMap, namesMap);

    // Validate: ancestorPath[0] must be Aves root
    if (ancestorPath[0] !== AVES_TAX_ID) {
      console.error(`  [WARN] Bird taxId ${taxId} (${names.commonName}) does not trace to Aves root. ` +
        `ancestorPath[0] = ${ancestorPath[0]}`);
      validationErrors++;
    }

    // Extract order and family from ancestor path
    let order = null;
    let family = null;
    for (let i = 0; i < ancestorPath.length; i++) {
      const rank = ancestorRanks[i];
      if (rank === 'order' && !order) order = ancestorNames[i];
      if (rank === 'family' && !family) family = ancestorNames[i];
    }

    birdDocs.push({
      commonName: names.commonName,
      commonNameAliases: names.commonNameAliases,
      scientificName: names.scientificName,
      ncbiTaxId: taxId,
      order,
      family,
      ancestorPath,
      ancestorNames,
      ancestorRanks,
      isActive: true,
    });

    // Collect all non-species ancestor nodes for TaxonomyNode collection
    for (let i = 0; i < ancestorPath.length - 1; i++) {
      const ancestorTaxId = ancestorPath[i];
      if (!taxonomyNodeDocs.has(ancestorTaxId)) {
        const ancestorNode = nodeMap.get(ancestorTaxId);
        const ancestorNames_ = namesMap.get(ancestorTaxId);
        if (ancestorNode && ancestorNames_) {
          taxonomyNodeDocs.set(ancestorTaxId, {
            taxId: ancestorTaxId,
            name: ancestorNames_.scientificName || '',
            rank: ancestorNode.rank,
            parentTaxId: ancestorNode.parentTaxId === ancestorTaxId ? null : ancestorNode.parentTaxId,
            depth: i,
            childTaxIds: Array.from(ancestorNode.children),
            commonLabel: ancestorNames_.commonName || null,
          });
        }
      }
    }
  }

  // Step 7: Bulk upsert TaxonomyNodes
  console.log(`Upserting ${taxonomyNodeDocs.size.toLocaleString()} taxonomy nodes...`);
  const taxonomyBulk = Array.from(taxonomyNodeDocs.values()).map((doc) => ({
    updateOne: {
      filter: { taxId: doc.taxId },
      update: { $set: doc },
      upsert: true,
    },
  }));

  let taxonomyUpserted = 0;
  const BATCH_SIZE = 1000;
  for (let i = 0; i < taxonomyBulk.length; i += BATCH_SIZE) {
    const batch = taxonomyBulk.slice(i, i + BATCH_SIZE);
    const result = await TaxonomyNode.bulkWrite(batch, { ordered: false });
    taxonomyUpserted += result.upsertedCount + result.modifiedCount;
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, taxonomyBulk.length).toLocaleString()} / ${taxonomyBulk.length.toLocaleString()} nodes...`);
  }
  console.log(`\n  Done. ${taxonomyUpserted.toLocaleString()} taxonomy nodes upserted.`);

  // Step 8: Bulk upsert Birds
  console.log(`Upserting ${birdDocs.length.toLocaleString()} bird documents...`);
  const birdBulk = birdDocs.map((doc) => ({
    updateOne: {
      filter: { ncbiTaxId: doc.ncbiTaxId },
      update: { $set: doc },
      upsert: true,
    },
  }));

  let birdUpserted = 0;
  for (let i = 0; i < birdBulk.length; i += BATCH_SIZE) {
    const batch = birdBulk.slice(i, i + BATCH_SIZE);
    const result = await Bird.bulkWrite(batch, { ordered: false });
    birdUpserted += result.upsertedCount + result.modifiedCount;
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, birdBulk.length).toLocaleString()} / ${birdBulk.length.toLocaleString()} birds...`);
  }
  console.log(`\n  Done. ${birdUpserted.toLocaleString()} birds upserted.`);

  // Step 9: Ensure indexes
  console.log('Ensuring indexes...');
  await Bird.createIndexes();
  await TaxonomyNode.createIndexes();
  console.log('  Indexes created.');

  // Summary
  console.log('\n=== Seed Summary ===');
  console.log(`  Birds imported:          ${birdUpserted.toLocaleString()}`);
  console.log(`  Taxonomy nodes imported: ${taxonomyUpserted.toLocaleString()}`);
  if (validationErrors > 0) {
    console.log(`  Ancestor path warnings:  ${validationErrors} (see WARN lines above)`);
  } else {
    console.log(`  Ancestor path validation: all OK`);
  }

  await mongoose.disconnect();
  console.log('Done. MongoDB disconnected.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
