import 'dotenv/config';
import { connectDB } from '../src/config/db.js';
import Accessory from '../src/models/Accessory.js';

const hats = [
  {
    slug: 'classic-top-hat',
    name: 'Classic Top Hat',
    category: 'hat',
    cost: 8,
    description: 'A timeless black silk topper. Distinguished and understated.',
    iconPath: '/hats/top-hat-icon.svg',
    fullPath: '/hats/top-hat-full.svg',
    overlayStyle: { top: '-10%', width: '60%' },
    sortOrder: 1,
  },
  {
    slug: 'birding-cap',
    name: 'Birding Cap',
    category: 'hat',
    cost: 10,
    description: 'A khaki field cap with a small notebook tucked in the brim.',
    iconPath: '/hats/birding-cap-icon.svg',
    fullPath: '/hats/birding-cap-full.svg',
    overlayStyle: { top: '-5%', width: '65%' },
    sortOrder: 2,
  },
  {
    slug: 'tropical-sombrero',
    name: 'Tropical Sombrero',
    category: 'hat',
    cost: 12,
    description: 'A wide-brimmed woven hat with colorful ribbon trim.',
    iconPath: '/hats/sombrero-icon.svg',
    fullPath: '/hats/sombrero-full.svg',
    overlayStyle: { top: '-15%', width: '80%' },
    sortOrder: 3,
  },
  {
    slug: 'royal-crown',
    name: 'Royal Crown',
    category: 'hat',
    cost: 20,
    description: 'A tiny golden crown with inset gemstones. For the regal bird.',
    iconPath: '/hats/crown-icon.svg',
    fullPath: '/hats/crown-full.svg',
    overlayStyle: { top: '-8%', width: '55%' },
    sortOrder: 4,
  },
  {
    slug: 'wizard-hat',
    name: 'Wizard Hat',
    category: 'hat',
    cost: 18,
    description: 'A tall star-spangled pointed hat. Magic not included.',
    iconPath: '/hats/wizard-icon.svg',
    fullPath: '/hats/wizard-full.svg',
    overlayStyle: { top: '-25%', width: '50%' },
    sortOrder: 5,
  },
  {
    slug: 'cowboy-hat',
    name: 'Cowboy Hat',
    category: 'hat',
    cost: 10,
    description: 'A classic 10-gallon hat in weathered brown.',
    iconPath: '/hats/cowboy-icon.svg',
    fullPath: '/hats/cowboy-full.svg',
    overlayStyle: { top: '-10%', width: '70%' },
    sortOrder: 6,
  },
  {
    slug: 'beret',
    name: 'Beret',
    category: 'hat',
    cost: 8,
    description: 'A chic slate-grey artist\'s beret. Very continental.',
    iconPath: '/hats/beret-icon.svg',
    fullPath: '/hats/beret-full.svg',
    overlayStyle: { top: '-5%', width: '55%' },
    sortOrder: 7,
  },
  {
    slug: 'santa-hat',
    name: 'Santa Hat',
    category: 'hat',
    cost: 15,
    description: 'A red and white holiday hat. Seasonal but always available.',
    iconPath: '/hats/santa-icon.svg',
    fullPath: '/hats/santa-full.svg',
    overlayStyle: { top: '-15%', width: '60%' },
    sortOrder: 8,
  },
  {
    slug: 'flower-crown',
    name: 'Flower Crown',
    category: 'hat',
    cost: 12,
    description: 'A delicate wreath of wildflowers. Cottagecore approved.',
    iconPath: '/hats/flower-crown-icon.svg',
    fullPath: '/hats/flower-crown-full.svg',
    overlayStyle: { top: '-8%', width: '70%' },
    sortOrder: 9,
  },
  {
    slug: 'pirate-tricorn',
    name: 'Pirate Tricorn',
    category: 'hat',
    cost: 18,
    description: 'Three-cornered hat with a tiny skull and crossbones pin.',
    iconPath: '/hats/pirate-icon.svg',
    fullPath: '/hats/pirate-full.svg',
    overlayStyle: { top: '-12%', width: '65%' },
    sortOrder: 10,
  },
];

async function seed() {
  await connectDB();
  console.log('Seeding accessories...');

  for (const hat of hats) {
    await Accessory.updateOne({ slug: hat.slug }, { $set: hat }, { upsert: true });
    console.log(`  ✓ ${hat.name}`);
  }

  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
