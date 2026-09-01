// LifeOS service worker — Phase 1.1 PWA foundation.
//
// Scope, deliberately: cache the app shell (HTML/JS/CSS/icons) so the app
// opens and the UI renders with no network. It does NOT cache or intercept
// anything under /api/ — AI extraction genuinely requires a network call
// (either to the server extraction API or, for the local fallback's OCR,
// to fetch tesseract.js's worker/language data). Claiming otherwise would
// be exactly the kind of fake offline behavior the spec calls out.

const CACHE_NAME = 'lifeos-shell-v1';
const SHELL_ASSETS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {
      // Best-effort — a failed precache shouldn't block install. The
      // runtime cache-as-you-go fetch handler below fills the rest in.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch API calls (extraction endpoint) or cross-origin requests
  // (tesseract.js/pdf.js fetching their own assets) — those must always
  // hit the network live.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not in cache — fall back to the shell so the app
          // still opens; the specific page/asset just won't have loaded.
          return caches.match('/');
        });
    })
  );
});
