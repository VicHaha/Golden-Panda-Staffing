const CACHE_NAME = 'gp-stock-report-shell-v109';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/vendor/supabase-sdk.js',
  './js/supabase.js',
  './js/utils.js',
  './js/cloudinary.js',
  './js/locations.js',
  './js/sales.js',
  './js/sales-section.js',
  './js/stock.js',
  './js/shift.js',
  './js/schedule.js',
  './js/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './css/fonts.css',
  './assets/fonts/fraunces-latin-500-normal.woff2',
  './assets/fonts/fraunces-latin-600-normal.woff2',
  './assets/fonts/fraunces-latin-700-normal.woff2',
  './assets/fonts/inter-latin-400-normal.woff2',
  './assets/fonts/inter-latin-500-normal.woff2',
  './assets/fonts/inter-latin-600-normal.woff2',
  './assets/fonts/inter-latin-700-normal.woff2',
  './assets/fonts/ibm-plex-mono-latin-500-normal.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, so a new version of the app is live on the very next
  // load; the cache is only the offline fallback.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
