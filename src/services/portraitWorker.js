import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import PortraitJob from '../models/PortraitJob.js';
import User from '../models/User.js';
import Bird from '../models/Bird.js';
import Accessory from '../models/Accessory.js';
import config from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ms to wait before re-queuing on failure (attempt 1, 2, then give up)
const RETRY_DELAYS_MS = [5_000, 25_000, 125_000];

let _interval = null;
let _running = false;

function runCli(promptPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.portrait.cmd, ['--prompt-file', promptPath, '--output', outputPath], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`nano-banana exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

async function processNextJob() {
  if (_running) return;
  _running = true;

  try {
    // Atomically claim the oldest pending job
    const job = await PortraitJob.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'processing' }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true }
    );

    if (!job) return;

    const jobId = job._id.toString();
    const birdIdStr = job.birdId.toString();

    try {
      // Read live equippedHatId from user (not stale job snapshot)
      const user = await User.findById(job.userId, {
        birdEquipment: 1,
        portraitUrls: 1,
        _id: 1,
      });
      if (!user) throw new Error('User not found');

      const equippedHatId = user.birdEquipment?.get(birdIdStr) ?? null;

      const bird = await Bird.findById(job.birdId, 'commonName scientificName').lean();
      if (!bird) throw new Error('Bird not found');

      let hatName = 'none';
      let hatDescription = 'no hat, bare head';
      if (equippedHatId && mongoose.Types.ObjectId.isValid(equippedHatId)) {
        const hat = await Accessory.findById(equippedHatId, 'name description').lean();
        if (hat) {
          hatName = hat.name;
          hatDescription = hat.description || hat.name;
        }
      }

      // Read and fill prompt template
      const templatePath = path.join(PROJECT_ROOT, config.portrait.promptFile);
      const template = await fs.readFile(templatePath, 'utf8');
      const filled = template
        .replace(/\{BIRD_COMMON_NAME\}/g, bird.commonName)
        .replace(/\{BIRD_SCIENTIFIC_NAME\}/g, bird.scientificName)
        .replace(/\{HAT_NAME\}/g, hatName)
        .replace(/\{HAT_DESCRIPTION\}/g, hatDescription);

      // Write filled prompt to a temp file
      const tmpPrompt = path.join(os.tmpdir(), `portrait-${jobId}.prompt.md`);
      await fs.writeFile(tmpPrompt, filled, 'utf8');

      // Ensure portraits/{userId}/ exists
      const userDir = path.join(PROJECT_ROOT, config.portrait.outputDir, user._id.toString());
      await fs.mkdir(userDir, { recursive: true });
      const outputFile = path.join(userDir, `${jobId}.png`);

      // Run nano-banana
      await runCli(tmpPrompt, outputFile);

      // Cleanup temp prompt
      await fs.unlink(tmpPrompt).catch(() => {});

      const portraitUrl = `${config.portrait.baseUrl}/portraits/${user._id}/${jobId}.png`;

      // Mark job done
      await PortraitJob.findByIdAndUpdate(job._id, {
        $set: { status: 'done', resultUrl: portraitUrl },
      });

      // Update user portrait state
      await User.findByIdAndUpdate(job.userId, {
        $set: {
          [`portraitUrls.${birdIdStr}`]: portraitUrl,
          [`portraitDirty.${birdIdStr}`]: false,
          [`portraitJobIds.${birdIdStr}`]: null,
        },
      });

      console.log(`[portrait-worker] Job ${jobId} done — ${portraitUrl}`);

    } catch (err) {
      const msg = err?.message || 'Unknown error';
      console.error(`[portrait-worker] Job ${jobId} failed (attempt ${job.attempts}): ${msg}`);

      if (job.attempts >= 3) {
        await PortraitJob.findByIdAndUpdate(job._id, {
          $set: { status: 'failed', error: msg },
        });
        // portraitDirty stays true — client sees "failed" and can retry
      } else {
        const delay = RETRY_DELAYS_MS[job.attempts - 1] ?? 5_000;
        setTimeout(async () => {
          await PortraitJob.findByIdAndUpdate(job._id, {
            $set: { status: 'pending', error: msg },
          }).catch(() => {});
        }, delay);
      }
    }
  } finally {
    _running = false;
  }
}

export function startPortraitWorker() {
  if (!config.portrait.workerEnabled) {
    console.log('[portrait-worker] Disabled (PORTRAIT_WORKER_ENABLED=false)');
    return;
  }

  const interval = config.portrait.workerIntervalMs;
  console.log(`[portrait-worker] Starting — polling every ${interval}ms`);

  // Run once immediately, then on interval
  processNextJob().catch((e) => console.error('[portrait-worker] Startup error:', e.message));
  _interval = setInterval(
    () => processNextJob().catch((e) => console.error('[portrait-worker] Error:', e.message)),
    interval
  );
}

export function stopPortraitWorker() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
