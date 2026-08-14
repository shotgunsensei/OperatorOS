const CACHE = 'pulsedesk-operations-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/manifest.json'])));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/public/pulsedesk/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) void caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('<!doctype html><html><body><main><h1>PulseDesk is offline</h1><p>Reconnect to load or submit an operational issue. No form data was stored by the offline shell.</p></main></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
  }));
});
