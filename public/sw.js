// Minimal service worker: exists only so browsers consider justfplay
// installable. It does no offline caching (music/video streams and the
// library listing should always come straight from the server) — it just
// passes every request straight through to the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
