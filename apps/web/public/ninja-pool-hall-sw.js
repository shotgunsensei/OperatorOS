/* Operator Pool Hall PWA shell. Authenticated pages and API responses are never cached. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(() => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0284c7"><title>Operator Pool Hall — Offline</title>
<style>color-scheme:dark;*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#082f49,#020617 60%);color:#f8fafc;font:16px system-ui}.card{max-width:620px;padding:32px;border:1px solid #164e63;border-radius:18px;background:#07111fed;box-shadow:0 28px 80px #0008}.tag{color:#67e8f9;font:700 11px ui-monospace;letter-spacing:.18em}h1{margin:10px 0;text-transform:uppercase}p{color:#cbd5e1;line-height:1.6}button{padding:11px 16px;border:0;border-radius:9px;background:#0284c7;color:white;font-weight:800}</style>
</head><body><main class="card"><span class="tag">SYS::OFFLINE_TABLE</span><h1>Connection lost</h1><p>Your active table was not cached or copied onto this device. Reconnect, then reload to recover the latest authoritative room state without duplicating a shot.</p><button onclick="location.reload()">Try reconnecting</button></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
