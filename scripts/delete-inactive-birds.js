import 'dotenv/config';
import mongoose from 'mongoose';
import Bird from '../src/models/Bird.js';

await mongoose.connect(process.env.MONGODB_URI);
const result = await Bird.deleteMany({ isActive: false });
console.log(`Deleted ${result.deletedCount} inactive birds`);
const remaining = await Bird.countDocuments();
console.log(`Remaining: ${remaining} birds`);
await mongoose.disconnect();
