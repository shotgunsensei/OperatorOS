import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { clamAvConfiguration, createClamAvScanner } from '../src/lib/clamav-scanner.js';

async function scannerFixture(reply: Buffer | null, run: (port: number, received: Buffer[]) => Promise<void>) {
  const sockets = new Set<Socket>();
  const received: Buffer[] = [];
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let input = Buffer.alloc(0);
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      const command = Buffer.from('zINSTREAM\0');
      if (input.length < command.length) return;
      assert.deepEqual(input.subarray(0, command.length), command);
      let offset = command.length;
      const parts: Buffer[] = [];
      while (offset + 4 <= input.length) {
        const length = input.readUInt32BE(offset); offset += 4;
        if (length === 0) {
          received.push(Buffer.concat(parts));
          if (reply) {
            // Fragment the result to exercise reads spanning TCP chunks.
            socket.write(reply.subarray(0, 4)); socket.end(reply.subarray(4));
          }
          return;
        }
        if (offset + length > input.length) return;
        parts.push(input.subarray(offset, offset + length)); offset += length;
      }
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { await run(address.port, received); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

const scanInput = { content: Buffer.alloc(70_000, 65), detectedMimeType: 'text/plain', sha256: 'synthetic' };

test('ClamAV streams exact bytes in bounded chunks and accepts only a complete clean response', async () => {
  await scannerFixture(Buffer.from('stream: OK\0'), async (port, received) => {
    const scanner = createClamAvScanner({ host: '127.0.0.1', port, timeoutMs: 1000 });
    assert.equal(await scanner.scan(scanInput), 'clean');
    assert.deepEqual(received, [scanInput.content]);
  });
});

test('ClamAV detected threats remain blocked', async () => {
  await scannerFixture(Buffer.from('stream: Synthetic-Test-Signature FOUND\0'), async port => {
    assert.equal(await createClamAvScanner({ host: '127.0.0.1', port, timeoutMs: 1000 }).scan(scanInput), 'infected');
  });
});

test('scanner errors, partial replies, extra replies and oversized replies never mark a file clean', async () => {
  for (const reply of ['INSTREAM size limit exceeded. ERROR\0', 'stream: OK', 'stream: OK\0stream: Threat FOUND\0', 'untrusted: OK\0', 'x'.repeat(1025)]) {
    await scannerFixture(Buffer.from(reply), async port => {
      await assert.rejects(createClamAvScanner({ host: '127.0.0.1', port, timeoutMs: 1000 }).scan(scanInput), { code: 'ATTACHMENT_SCANNER_UNAVAILABLE' });
    });
  }
});

test('silent scanner connections time out and empty or oversized files are rejected', async () => {
  await scannerFixture(null, async port => {
    const scanner = createClamAvScanner({ host: '127.0.0.1', port, timeoutMs: 50 });
    await assert.rejects(scanner.scan(scanInput), { code: 'ATTACHMENT_SCANNER_UNAVAILABLE' });
    for (const content of [Buffer.alloc(0), Buffer.alloc(25 * 1024 * 1024 + 1)]) {
      await assert.rejects(scanner.scan({ ...scanInput, content }), { code: 'ATTACHMENT_SCANNER_UNAVAILABLE' });
    }
  });
});

test('scanner activation requires explicit private configuration and is isolated from tests', () => {
  const base = { APP_ENV: 'production', NODE_ENV: 'production', ATTACHMENT_SCANNER: 'clamav', ATTACHMENT_CLAMAV_HOST: '10.1.2.3' };
  assert.deepEqual(clamAvConfiguration(base), { host: '10.1.2.3', port: 3310, timeoutMs: 15000 });
  for (const host of ['8.8.8.8', 'public.example.com', '169.254.169.254', '127.0.0.1:3310', '']) assert.equal(clamAvConfiguration({ ...base, ATTACHMENT_CLAMAV_HOST: host }), null);
  assert.equal(clamAvConfiguration({ ...base, ATTACHMENT_CLAMAV_PORT: 'bad' }), null);
  assert.equal(clamAvConfiguration({ ...base, ATTACHMENT_CLAMAV_TIMEOUT_MS: '0' }), null);
  assert.equal(clamAvConfiguration({ ...base, APP_ENV: 'test', NODE_ENV: 'test' }), null);
  assert.equal(clamAvConfiguration({ ...base, OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1', CI: 'true', PARITY_DATABASE_IS_DISPOSABLE: '1', DATABASE_URL: 'postgresql://test@127.0.0.1/operatoros_test' }), null);
});
