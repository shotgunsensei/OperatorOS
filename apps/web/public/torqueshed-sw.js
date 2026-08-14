const CACHE = 'torqueshed-shell-v28';
const PUBLIC_ASSETS = ['/torqueshed.webmanifest', '/favicon.ico'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('torqueshed-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#111315"><title>TorqueShed offline</title><body style="margin:0;background:#0b0d0f;color:#f8fafc;font:16px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:34rem;padding:2rem"><p style="color:#f59e0b;font-weight:900;text-transform:uppercase;letter-spacing:.14em">TorqueShed</p><h1>Garage connection interrupted.</h1><p style="color:#a8a29e;line-height:1.6">Your submitted records were not discarded. Reconnect, then reload to recover live-bay history and continue working. New forms are only sent when the server confirms the request.</p><button onclick="location.reload()" style="border:0;border-radius:10px;background:#f59e0b;padding:.8rem 1rem;font-weight:900">Try again</button></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
    return;
  }
  if (PUBLIC_ASSETS.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
