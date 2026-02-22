self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Service Worker as a pass-through for now
  e.respondWith(fetch(e.request));
});

self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-motion-logs') {
    e.waitUntil(
      self.clients.matchAll().then((cs) => {
        cs.forEach((c) => c.postMessage({ type: 'TRIGGER_SYNC' }));
      })
    );
  }
});