// Increment this version whenever publishing changes to app files.
const CACHE_NAME = 'my-bookshelf-pwa-v6';
const CACHE_PREFIX = 'my-bookshelf-pwa-';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/validation.js',
  './js/storage.js',
  './js/image-codec.js',
  './js/images.js',
  './js/backup.js',
  './js/terms.js',
  './js/covers.js',
  './vendor/jszip-3.10.1.min.js',
  './js/version.js',
  './js/app.js',
  './js/pwa.js',
  './js/isbn.js',
  './js/ndl.js',
  './js/catalog-config.js',
  './js/catalog.js',
  './vendor/zxing-browser-0.2.1.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, {cache:'reload'}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const isPage = request.mode === 'navigate';
  const isAppFile = APP_SHELL.some(path => new URL(path, self.registration.scope).href === url.href);
  if(!isPage && !isAppFile) return;
  const network = fetch(request, {cache:'no-cache'});
  event.waitUntil(network.then(async response => {
    if(response.ok){
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }
  }).catch(() => {}));
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE_NAME); } catch { return network; }
    let timer;
    try {
      const response = await Promise.race([
        network,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Network timeout')), 5000); })
      ]);
      if(response.ok) return response;
      return (await cache.match(request)) || (isPage && await cache.match('./index.html')) || response;
    } catch {
      return (await cache.match(request)) || (isPage && await cache.match('./index.html')) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
