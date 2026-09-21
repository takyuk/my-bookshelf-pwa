// Increment this version whenever publishing changes to app files.
const CACHE_NAME = 'my-bookshelf-pwa-v7';
const CACHE_PREFIX = 'my-bookshelf-pwa-';
const ACCESS_PROTECTED = false;
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
  './js/cover-correction.js',
  './js/cover-worker.js',
  './js/cover-geometry.js',
  './vendor/jszip-3.10.1.min.js',
  './js/version.js',
  './js/book-list.js',
  './js/book-editor.js',
  './js/backup-actions.js',
  './js/catalog-errors.js',
  './js/catalog-client.js',
  './js/access.js',
  './js/isbn-scanner.js',
  './js/google-cover-data.js',
  './js/google-covers.js',
  './icons/cover-unavailable.png',
  './icons/powered-by-google.png',
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

function safeResponse(response){return response.ok&&!response.redirected&&response.type!=='opaqueredirect'&&(!ACCESS_PROTECTED||response.headers.get('X-Bookshelf-App')==='1');}
function authResponse(response){return ACCESS_PROTECTED&&(response.type==='opaqueredirect'||response.redirected||[401,403].includes(response.status)||(response.ok&&response.headers.get('X-Bookshelf-App')!=='1'));}
async function notifyAuth(){const clients=await self.clients.matchAll({type:'window'});for(const client of clients)client.postMessage({type:'ACCESS_REQUIRED'});}
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const entries=await Promise.all(APP_SHELL.map(async path=>{
      const request=new Request(new URL(path,self.registration.scope),{cache:'reload',credentials:'same-origin',redirect:'manual'});
      const response=await fetch(request);
      if(!safeResponse(response))throw new Error('App shell unavailable');
      return [request,response];
    }));
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(entries.map(([request,response])=>cache.put(request,response)));
    await self.skipWaiting();
  })());
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
  if(/^\/(api|auth|cdn-cgi)\//.test(url.pathname))return;
  if(request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const isPage = request.mode === 'navigate';
  const isAppFile = APP_SHELL.some(path => new URL(path, self.registration.scope).href === url.href);
  if(!isPage && !isAppFile) return;
  const network = fetch(request, {cache:'no-cache',...(ACCESS_PROTECTED?{redirect:'manual'}:{})});
  event.waitUntil(network.then(async response => {
    if(authResponse(response))await notifyAuth();
    if(safeResponse(response)){
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
      if(safeResponse(response)) return response;
      return (await cache.match(request)) || (isPage && await cache.match('./index.html')) || response;
    } catch {
      return (await cache.match(request)) || (isPage && await cache.match('./index.html')) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
