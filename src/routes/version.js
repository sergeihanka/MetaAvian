import { Router } from 'express';
import { APP_VERSION } from '../middleware/appVersion.js';

const router = Router();

// GET /api/v1/version — latest deployed app version (for client auto-update)
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ version: APP_VERSION });
});

export default router;
