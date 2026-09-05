import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { assertLocalProxyEnvironment } from '../../../scripts/parity/lib/database.mjs';

const proxySafety = assertLocalProxyEnvironment(process.env);
const listenHost = proxySafety.host;
const listenPort = proxySafety.port;
const target = new URL(proxySafety.targetUrl);
const artifactDir = resolve(process.env.E2E_ARTIFACT_DIR || 'test-results/sso-e2e');
const certPath = resolve(process.env.E2E_TLS_CERT || `${artifactDir}/operatoros.test.crt`);
const keyPath = resolve(process.env.E2E_TLS_KEY || `${artifactDir}/operatoros.test.key`);

function resolveOpenSsl() {
  const configured = process.env.OPENSSL_BIN?.trim();
  if (configured) return configured;
  if (process.platform !== 'win32') return 'openssl';

  const gitLookup = spawnSync('where.exe', ['git.exe'], { encoding: 'utf8', windowsHide: true });
  const gitRoots = gitLookup.status === 0
    ? gitLookup.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
      .map((entry) => resolve(dirname(entry), '..'))
    : [];
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const candidates = [
    ...gitRoots.flatMap((root) => [join(root, 'usr', 'bin', 'openssl.exe'), join(root, 'mingw64', 'bin', 'openssl.exe')]),
    ...programFiles.flatMap((root) => [join(root, 'Git', 'usr', 'bin', 'openssl.exe'), join(root, 'Git', 'mingw64', 'bin', 'openssl.exe')]),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'openssl';
}

function ensureCertificate() {
  if (existsSync(certPath) && existsSync(keyPath)) return;
  mkdirSync(artifactDir, { recursive: true });

  const openssl = resolveOpenSsl();
  const result = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '2',
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', '/CN=operatoros.net',
    '-addext', 'subjectAltName=DNS:operatoros.net,DNS:*.operatoros.net',
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || 'unknown error').trim();
    throw new Error(`Could not create the short-lived E2E TLS certificate with ${openssl}: ${detail}`);
  }
}

function forwardedFor(req) {
  const prior = typeof req.headers['x-forwarded-for'] === 'string'
    ? req.headers['x-forwarded-for'].trim()
    : '';
  const remote = req.socket.remoteAddress || '127.0.0.1';
  return prior ? `${prior}, ${remote}` : remote;
}

ensureCertificate();

const server = https.createServer({
  cert: readFileSync(certPath),
  key: readFileSync(keyPath),
}, (req, res) => {
  const publicHost = req.headers.host || 'operatoros.net';
  const headers = {
    ...req.headers,
    host: publicHost,
    'x-forwarded-host': publicHost,
    'x-forwarded-proto': 'https',
    'x-forwarded-for': forwardedFor(req),
  };

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || '80',
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end(`OperatorOS E2E proxy could not reach ${target.origin}: ${error.message}`);
  });

  req.pipe(upstream);
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.on('upgrade', (req, socket, head) => {
  const publicHost = req.headers.host || 'operatoros.net';
  const headers = {
    ...req.headers,
    host: publicHost,
    'x-forwarded-host': publicHost,
    'x-forwarded-proto': 'https',
    'x-forwarded-for': forwardedFor(req),
  };
  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || '80',
    method: req.method,
    path: req.url,
    headers,
  });

  upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    const responseHeaders = Object.entries(upstreamResponse.headers).flatMap(([name, value]) => {
      if (value == null) return [];
      return Array.isArray(value) ? value.map((item) => `${name}: ${item}`) : [`${name}: ${value}`];
    });
    socket.write(
      `HTTP/1.1 ${upstreamResponse.statusCode || 101} ${upstreamResponse.statusMessage || 'Switching Protocols'}\r\n`
      + `${responseHeaders.join('\r\n')}\r\n\r\n`,
    );
    if (head.length) upstreamSocket.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    socket.pipe(upstreamSocket).pipe(socket);
  });
  upstream.on('response', (response) => {
    socket.end(`HTTP/1.1 ${response.statusCode || 502} ${response.statusMessage || 'WebSocket upgrade failed'}\r\nConnection: close\r\n\r\n`);
  });
  upstream.on('error', (error) => {
    socket.end(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${error.message}`);
  });
  upstream.end();
});

server.listen(listenPort, listenHost, () => {
  process.stdout.write(
    `OperatorOS production-host E2E proxy listening on https://${listenHost}:${listenPort} -> ${target.origin}\n`,
  );
});

function stop() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
