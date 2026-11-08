// Service worker: keeps justfplay installable and usable offline.
//
// - Audio streams (/api/stream/*) are served from the audio cache when the
//   track is in it (with Range support, so seeking works), otherwise they go
//   straight to the network. The page (app.js) decides what gets put in the
//   audio cache and when to evict; the worker only reads it.
// - The app shell, library listing and cover art are network-first, with the
//   last good copy as the offline fallback.
const AUDIO_CACHE = 'justfplay-audio-v1';
const SHELL_CACHE = 'justfplay-shell-v1';
const SHELL_URLS = ['/', '/css/style.css', '/js/app.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        /* shell precache is best-effort; network-first fills it later */
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function rangeResponse(cached, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return cached;
  return cached.blob().then((blob) => {
    const total = blob.size;
    let start;
    let end;
    if (match[1] === '') {
      // suffix range: last N bytes
      start = Math.max(0, total - Number(match[2]));
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1);
    }
    if (!(start <= end) || start >= total) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
    }
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(end - start + 1),
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

function serveStream(request) {
  return caches
    .open(AUDIO_CACHE)
    .then((cache) => cache.match(request.url))
    .then((cached) => {
      if (!cached) return fetch(request);
      const range = request.headers.get('Range');
      return range ? rangeResponse(cached, range) : cached;
    });
}

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return res;
    })
    .catch(() =>
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(request).then((hit) => hit || (request.mode === 'navigate' ? cache.match('/') : undefined) || Response.error())
      )
    );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/stream/')) {
    event.respondWith(serveStream(request));
  } else if (url.pathname === '/api/rescan') {
    // never cached; let it through
  } else {
    event.respondWith(networkFirst(request));
  }
});
