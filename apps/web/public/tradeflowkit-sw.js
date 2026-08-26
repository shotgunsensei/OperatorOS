/* TradeFlowKit PWA shell. Authenticated pages and API responses are never cached. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#ea580c"><title>TradeFlowKit — Offline</title>
<style>color-scheme:dark;*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#3b1d0b,#07111f 62%);color:#fff7ed;font:16px system-ui}.card{max-width:640px;padding:32px;border:1px solid #9a3412;border-radius:18px;background:#101827f2;box-shadow:0 28px 80px #0009}.tag{color:#fb923c;font:700 11px ui-monospace;letter-spacing:.18em}h1{margin:10px 0}p{color:#cbd5e1;line-height:1.6}button{padding:11px 16px;border:0;border-radius:9px;background:#ea580c;color:white;font-weight:800}</style>
</head><body><main class="card"><span class="tag">OPERATIONS::OFFLINE</span><h1>TradeFlowKit needs a connection</h1><p>Customer, job, quote, invoice, and payment records are not copied into the service-worker cache. Reconnect to load the latest tenant-authoritative state.</p><button onclick="location.reload()">Try reconnecting</button></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
