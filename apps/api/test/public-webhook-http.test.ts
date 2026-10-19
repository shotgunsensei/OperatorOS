import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { request, RequestOptions } from 'node:https';
import { Duplex } from 'node:stream';
import test from 'node:test';
import {
  isPublicWebhookAddress,
  postPublicWebhook,
  validateOutboundWebhookUrl,
  type WebhookDnsLookup,
} from '../src/lib/public-webhook-http.js';

test('webhook address policy rejects private, mapped, link-local, shared and reserved addresses', () => {
  for (const address of [
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.31.255.255',
    '192.168.1.1', '100.64.0.1', '198.18.0.1', '192.0.2.1', '203.0.113.1',
    '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1', '::ffff:a00:1',
    'fe80::1', 'fe90::1', 'fea0::1', 'febf::1', 'fc00::1', 'fd00::1',
    'ff02::1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::',
    'not-an-address',
  ]) assert.equal(isPublicWebhookAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '::ffff:808:808', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicWebhookAddress(address), true, address);
  }
});

test('URL validation blocks alternate IP encodings and IPv6 brackets before transport', () => {
  for (const url of [
    'https://127.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://0177.0.0.1/', 'https://%31%32%37.0.0.1/',
    'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[fe90::1]/',
    'https://LOCALHOST./', 'https://service.internal/',
  ]) assert.throws(() => validateOutboundWebhookUrl(url), { code: 'WEBHOOK_SSRF_BLOCKED' }, url);
  for (const url of ['http://hooks.example.test/', 'https://user:secret@hooks.example.test/', 'https://hooks.example.test:8443/']) {
    assert.throws(() => validateOutboundWebhookUrl(url), { code: 'WEBHOOK_URL_UNSAFE' });
  }
  assert.equal(validateOutboundWebhookUrl('https://hooks.example.test:443/events').href, 'https://hooks.example.test/events');
  assert.equal(validateOutboundWebhookUrl('https://[2606:4700:4700::1111]/').hostname, '[2606:4700:4700::1111]');
});

function transportFixture(status = 204) {
  const captured: { url?: URL; options?: RequestOptions; body?: string; responseDestroyed?: boolean } = {};
  const send = ((url: URL, options: RequestOptions, callback: (response: unknown) => void) => {
    captured.url = url;
    captured.options = options;
    const outgoing = new EventEmitter() as EventEmitter & { end(body: string): void };
    outgoing.end = body => {
      captured.body = body;
      callback({ statusCode: status, destroy() { captured.responseDestroyed = true; } });
    };
    return outgoing;
  }) as unknown as typeof request;
  return { captured, send };
}

test('HTTPS delivery pins the checked DNS set and retains host, signature, payload and TLS verification', async () => {
  const { captured, send } = transportFixture();
  let resolutions = 0;
  const resolve = (async () => {
    resolutions += 1;
    // An attacker changes subsequent DNS answers after the public preflight.
    return resolutions === 1
      ? [{ address: '8.8.8.8', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  }) as WebhookDnsLookup;
  const headers = { 'x-operatoros-signature': 'sha256=fixture-signature', 'content-type': 'application/json' };
  const result = await postPublicWebhook(new URL('https://hooks.example.test/events?version=1'), {
    body: '{"label":"café"}', headers,
  }, { lookup: resolve, request: send });
  assert.deepEqual(result, { status: 204 });
  assert.equal(captured.url?.href, 'https://hooks.example.test/events?version=1');
  assert.equal(captured.options?.agent, false);
  assert.equal(captured.options?.rejectUnauthorized, undefined, 'normal Node certificate checks remain enabled');
  assert.equal(captured.options?.servername, undefined, 'Node derives SNI from the original URL hostname');
  assert.deepEqual(captured.options?.headers, { ...headers, 'content-length': '17' });
  assert.equal(captured.body, '{"label":"café"}');
  assert.equal(captured.responseDestroyed, true);
  const pinned = captured.options!.lookup!;
  pinned('hooks.example.test', { family: 0, hints: 0 }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '8.8.8.8');
    assert.equal(family, 4);
  });
  pinned('hooks.example.test', { family: 0, hints: 0, all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
  });
  assert.equal(resolutions, 1, 'connection uses the validated result instead of resolving again');
});

test('empty or mixed public/private DNS answers never open the HTTPS transport', async () => {
  for (const addresses of [[], [{ address: '8.8.8.8', family: 4 }, { address: '::ffff:a00:1', family: 6 }]]) {
    const { captured, send } = transportFixture();
    await assert.rejects(postPublicWebhook(new URL('https://hooks.example.test/'), { body: '{}', headers: {} }, {
      lookup: async () => addresses, request: send,
    }), { code: 'WEBHOOK_SSRF_BLOCKED' });
    assert.equal(captured.url, undefined);
  }
});

test('public IPv6 literals deliver without DNS and redirects are returned without following them', async () => {
  const { captured, send } = transportFixture(302);
  const result = await postPublicWebhook(new URL('https://[2606:4700:4700::1111]/events'), { body: '{}', headers: {} }, {
    lookup: async () => { throw new Error('IP literals must not be resolved'); },
    request: send,
  });
  assert.deepEqual(result, { status: 302 });
  assert.equal(captured.url?.hostname, '[2606:4700:4700::1111]');
  assert.equal(captured.responseDestroyed, true);
});

test('DNS and transport errors reject the delivery for the existing retry handler', async () => {
  await assert.rejects(postPublicWebhook(new URL('https://hooks.example.test/'), { body: '{}', headers: {} }, {
    lookup: async () => { throw Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' }); },
    request: transportFixture().send,
  }), { code: 'ENOTFOUND' });
  const fail = (() => {
    const outgoing = new EventEmitter() as EventEmitter & { end(): void };
    outgoing.end = () => outgoing.emit('error', Object.assign(new Error('TLS failed'), { code: 'CERT_HAS_EXPIRED' }));
    return outgoing;
  }) as unknown as typeof request;
  await assert.rejects(postPublicWebhook(new URL('https://hooks.example.test/'), { body: '{}', headers: {} }, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], request: fail,
  }), { code: 'CERT_HAS_EXPIRED' });
});

test('cancellation during DNS rejects promptly without opening a connection', async () => {
  const { captured, send } = transportFixture();
  const controller = new AbortController();
  const delivery = postPublicWebhook(new URL('https://hooks.example.test/'), {
    body: '{}', headers: {}, signal: controller.signal,
  }, { lookup: () => new Promise(() => {}), request: send });
  controller.abort(new Error('fixture cancellation'));
  await assert.rejects(delivery, /fixture cancellation/);
  assert.equal(captured.url, undefined);
});

test('protocol upgrades and premature closes settle instead of stalling the shared worker', async () => {
  for (const event of ['upgrade', 'close']) {
    let socketDestroyed = false;
    const send = (() => {
      const outgoing = new EventEmitter() as EventEmitter & { end(): void };
      outgoing.end = () => {
        if (event === 'upgrade') outgoing.emit('upgrade', { statusCode: 101 }, { destroy() { socketDestroyed = true; } });
        else outgoing.emit('close');
      };
      return outgoing;
    }) as unknown as typeof request;
    const delivery = postPublicWebhook(new URL('https://hooks.example.test/'), { body: '{}', headers: {} }, {
      lookup: async () => [{ address: '8.8.8.8', family: 4 }], request: send,
    });
    if (event === 'upgrade') {
      assert.deepEqual(await delivery, { status: 101 });
      assert.equal(socketDestroyed, true);
    } else await assert.rejects(delivery, { code: 'WEBHOOK_RESPONSE_CLOSED' });
  }
});

test('native ClientRequest parser settles upgrade and ordinary responses without real network access', async () => {
  for (const status of [101, 204]) {
    const send = ((_url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      let sent = false;
      const socket = new Duplex({
        read() {},
        write(_chunk, _encoding, done) {
          done();
          if (!sent) {
            sent = true;
            setImmediate(() => socket.push(status === 101
              ? 'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'
              : 'HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n'));
          }
        },
      });
      return httpRequest({
        hostname: 'hooks.example.test', path: '/', method: options.method,
        headers: options.headers, signal: options.signal, createConnection: () => socket,
      }, callback);
    }) as unknown as typeof request;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('parser fixture deadline')), 1_000);
    try {
      assert.deepEqual(await postPublicWebhook(new URL('https://hooks.example.test/'), {
        body: '{}', headers: {}, signal: controller.signal,
      }, { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request: send }), { status });
    } finally { clearTimeout(timeout); }
  }
});
