// Minimal service worker for the installable app: network first, cache when offline.
const C = 'pazar-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(C).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
