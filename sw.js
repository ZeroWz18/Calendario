const CACHE = 'asistencia-v3';
const FILES = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './xlsx.full.min.js', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  // cache:'reload' evita copiar versiones viejas desde la caché HTTP del navegador
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Primero internet (siempre la versión más nueva); sin conexión, usa lo guardado.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
