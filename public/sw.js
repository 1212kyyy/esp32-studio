const CACHE_NAME = 'esp32ide-v1';
const urlsToCache = ['/', '/css/style.css', '/js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
});

self.addEventListener('fetch', (e) => {
  // Network first, fallback to cache
  if (e.request.url.includes('/api/')) return; // Don't cache API
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
