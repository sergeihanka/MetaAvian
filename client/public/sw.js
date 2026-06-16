const CACHE_NAME = 'aviary-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    // Network-first for API
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    // Cache-first for static assets
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
