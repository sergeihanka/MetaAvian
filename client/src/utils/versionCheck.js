/**
 * Auto-update watcher.
 *
 * The PWA / bookmarked app can get pinned to a stale bundle because the service
 * worker file never changes between deploys. This module polls the server for
 * the deployed version and, on a mismatch, purges all caches + the service
 * worker and reloads so the user silently lands on the new build — no need to
 * quit and reopen.
 */

const CURRENT = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
const GUARD_KEY = 'aviary_version_reload_for';

async function purgeAndReload(target) {
  // Guard against reload loops: only attempt one reload per target version per
  // tab session. If the bundle is somehow still stale after reloading, we stop.
  if (sessionStorage.getItem(GUARD_KEY) === target) return;
  sessionStorage.setItem(GUARD_KEY, target);

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  // Fetch the freshly-deployed HTML (network-first) and new hashed assets
  window.location.reload();
}

let inFlight = false;

export async function checkVersion() {
  if (!CURRENT || inFlight) return;
  inFlight = true;
  try {
    const res = await fetch('/api/v1/version', { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (version && version !== CURRENT) {
      await purgeAndReload(version);
    } else if (version === CURRENT) {
      // Back in sync — clear the guard so a future deploy can trigger again
      sessionStorage.removeItem(GUARD_KEY);
    }
  } catch {
    /* offline or unreachable — try again later */
  } finally {
    inFlight = false;
  }
}

export function startVersionWatch() {
  checkVersion(); // on launch
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion();
  });
  window.addEventListener('focus', checkVersion);
  setInterval(checkVersion, 5 * 60 * 1000); // every 5 minutes while open
}
