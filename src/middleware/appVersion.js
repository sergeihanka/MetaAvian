import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the deployed app version. The client bundle bakes in
 * client/package.json's version as __APP_VERSION__, so the server must report
 * that exact value for the client's version check to match. Falls back to the
 * root package.json if the client manifest can't be read.
 */
function resolveVersion() {
  const candidates = [
    path.join(__dirname, '..', '..', 'client', 'package.json'),
    path.join(__dirname, '..', '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const v = JSON.parse(readFileSync(p, 'utf-8')).version;
      if (v) return v;
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}

export const APP_VERSION = resolveVersion();

/**
 * Stamps every API response with the current app version so the client can
 * detect when a new build has been deployed and refresh itself.
 */
export function appVersionHeader(req, res, next) {
  res.set('X-App-Version', APP_VERSION);
  next();
}
