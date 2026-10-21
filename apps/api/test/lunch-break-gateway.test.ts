import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const { createPublicGateway } = await import('../../../scripts/start-unified-runtime.mjs');
const listen = (server: http.Server) =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
const close = (server: http.Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

function request(
  port: number,
  path: string,
  headers: Record<string, string>,
  upgrade = false,
  method = 'GET',
) {
  return new Promise<number>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...headers,
          ...(upgrade ? { Connection: 'Upgrade', Upgrade: 'websocket' } : {}),
        },
        timeout: 3000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode!));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Local gateway response timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('public Lunch Break gateway rejects API/auth/WS before upstream and preserves other hosts', async () => {
  let apiRequests = 0,
    apiUpgrades = 0,
    nextRequests = 0,
    nextUpgrades = 0;
  const api = http.createServer((_req, res) => {
    apiRequests++;
    res.end('api fixture');
  });
  api.on('upgrade', (_req, socket) => {
    apiUpgrades++;
    socket.end('HTTP/1.1 418 Fixture\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  const next = http.createServer((_req, res) => {
    nextRequests++;
    res.end('next fixture');
  });
  next.on('upgrade', (_req, socket) => {
    nextUpgrades++;
    socket.end('HTTP/1.1 418 Fixture\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  const apiPort = await listen(api),
    nextPort = await listen(next);
  const gateway = createPublicGateway({ apiPort, nextPort });
  try {
    const port = await listen(gateway);
    for (const host of ['lunchbreak.operatoros.net', 'LUNCHBREAK.OPERATOROS.NET.:443']) {
      for (const path of ['/api/auth/me', '/sso?code=opaque', '/app', '/.env'])
        assert.equal(
          await request(port, path, { host, 'x-forwarded-host': 'app.operatoros.net' }),
          404,
        );
      for (const path of ['/ws/v1/runner/stream/synthetic-workspace', '/_next/webpack-hmr'])
        assert.equal(await request(port, path, { host }, true), 404);
      assert.equal(await request(port, '/', { host }, false, 'POST'), 404);
    }
    assert.equal(
      await request(port, '/api/auth/me', {
        host: 'internal.example',
        'x-forwarded-host': 'lunchbreak.operatoros.net, internal.example',
      }),
      404,
    );
    assert.deepEqual(
      { apiRequests, apiUpgrades, nextRequests, nextUpgrades },
      { apiRequests: 0, apiUpgrades: 0, nextRequests: 0, nextUpgrades: 0 },
    );
    assert.equal(await request(port, '/', { host: 'lunchbreak.operatoros.net' }), 200);
    assert.equal(nextRequests, 1);
    assert.equal(
      await request(
        port,
        '/ws/v1/runner/stream/synthetic-workspace',
        { host: 'techdeck.operatoros.net' },
        true,
      ),
      418,
    );
    assert.equal(apiUpgrades, 1, 'existing module WS route must still reach API fixture');
  } finally {
    await Promise.all([close(gateway), close(api), close(next)]);
  }
});
