/* FaultlineLab PWA shell. Authenticated investigations and API responses are never cached. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#8b5cf6"><title>FaultlineLab — Offline</title>
<style>color-scheme:dark;*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#251345,#080611 64%);color:#f5f3ff;font:16px system-ui}.card{max-width:640px;padding:32px;border:1px solid #6d4bb4;border-radius:18px;background:#0d0b18f2;box-shadow:0 28px 80px #0009}.tag{color:#c4b5fd;font:700 11px ui-monospace;letter-spacing:.18em}h1{margin:10px 0}p{color:#c4bed8;line-height:1.6}button{padding:11px 16px;border:0;border-radius:9px;background:#7c3aed;color:white;font-weight:800}</style>
</head><body><main class="card"><span class="tag">LAB::OFFLINE</span><h1>Diagnostic link unavailable</h1><p>Active investigations, evidence, scores, and assignments are never stored in the service-worker cache. Reconnect to recover the current server-authoritative session.</p><button onclick="location.reload()">Try reconnecting</button></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});
