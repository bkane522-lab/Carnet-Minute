const CACHE_NAME = 'carnet-minute-v3-boss-1';
const CORE_ASSETS = [
  './',
  './index.html',
  './record.html',
  './review.html',
  './history.html',
  './style.css',
  './app.js',
  './record.js',
  './review.js',
  './history.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.png',
  './logo-mark.svg',
  './logo-horizontal.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => null)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return null;
    }))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
